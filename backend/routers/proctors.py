from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from database import get_db
import models
import pandas as pd
import io
from datetime import datetime, date
from sqlalchemy import text
from .auth import get_current_user, require_role
from utils.logging import log_activity
from .exams import is_generation_ongoing
from utils.schedule_translator import translate_grid_schedule_from_bytes, translate_row_schedule

router = APIRouter(prefix="/proctors", tags=["Proctors"])

def get_excel_engine(file_content: bytes, filename: str):
    if filename.endswith('.xls') and not filename.endswith('.xlsx'):
        return 'xlrd'
    if len(file_content) >= 8 and file_content[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        return 'xlrd'
    return 'openpyxl'

def read_excel_with_fallback(content: bytes, filename: str):
    engine = get_excel_engine(content, filename)
    try:
        return pd.read_excel(io.BytesIO(content), engine=engine)
    except Exception as e:
        other_engine = 'xlrd' if engine == 'openpyxl' else 'openpyxl'
        try:
            return pd.read_excel(io.BytesIO(content), engine=other_engine)
        except Exception:
            raise Exception(f"Could not read Excel file with any engine: {str(e)}")

@router.get("/")
def get_proctors(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # Any logged in user can see proctors list (e.g. students might see proctors? 
    # Actually, students shouldn't see full proctor list. Only Admin/Proctor).
    if current_user.role not in ["admin", "proctor", "program_head"]:
        raise HTTPException(status_code=403, detail="Not authorized to view proctors")
    proctors = db.query(models.Proctor).all()
    result = []
    for p in proctors:
        has_schedule = False
        if p.teacher_id:
            sched_count = db.query(models.TeacherSchedule).filter(
                models.TeacherSchedule.teacher_id == p.teacher_id
            ).count()
            has_schedule = sched_count > 0

        result.append({
            "id": p.id,
            "name": p.name,
            "department": p.department,
            "contact": p.contact,
            "has_schedule": has_schedule,
            "exclude_from_scheduling": p.exclude_from_scheduling,
            "availability": [
                {
                    "day_of_week": a.day_of_week,
                    "start_time": a.start_time.strftime("%I:%M %p"),
                    "end_time": a.end_time.strftime("%I:%M %p")
                } for a in p.availabilities
            ]
        })
    return result

@router.post("/")
def create_proctor(proctor: dict, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["admin"]))):
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot add proctors while schedule generation is ongoing")
    new_p = models.Proctor(
        name=proctor["name"],
        department=proctor.get("department"),
        contact=proctor.get("contact")
    )
    db.add(new_p)
    db.commit()
    db.refresh(new_p)
    return {"message": "Proctor added", "id": new_p.id}

@router.post("/{proctor_id}/availability")
def add_availability(proctor_id: int, body: dict, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["admin", "proctor"]))):
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot update availability while schedule generation is ongoing")
    # Only admin or the proctor themselves can add availability
    if current_user.role == "proctor" and current_user.proctor_id != proctor_id:
        raise HTTPException(status_code=403, detail="Not authorized to edit other proctor's availability")
    proctor = db.query(models.Proctor).get(proctor_id)
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")
    availability = models.ProctorAvailability(
        proctor_id=proctor_id,
        day_of_week=body["day_of_week"],
        start_time=body["start_time"],
        end_time=body["end_time"]
    )
    db.add(availability)
    db.commit()
    return {"message": "Availability added"}

@router.post("/upload-schedules")
async def upload_schedules(file: UploadFile = File(...), db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["admin"]))):
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot upload schedules while schedule generation is ongoing")
    # File Upload Security: Limit size and format
    MAX_FILE_SIZE = 5 * 1024 * 1024 # 5MB
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file (.xlsx, .xls).")
    
    # Read first few bytes to check size if possible or just read all and check length
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 5MB.")
        
    try:
        df = read_excel_with_fallback(content, file.filename)
        required_columns = ['Instructor Name', 'Day', 'Start Time', 'End Time']
        for col in required_columns:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing required column: {col}")
        day_map = {'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
                   'Friday': 4, 'Saturday': 5, 'Sunday': 6}
        records_processed = 0
        for _, row in df.iterrows():
            teacher_name = str(row['Instructor Name']).strip()
            day_str = str(row['Day']).strip().capitalize()
            start_val = row['Start Time']
            end_val = row['End Time']
            subject_name = str(row.get('Subject', '')).strip()
            if day_str not in day_map:
                continue
            day_idx = day_map[day_str]
            try:
                if isinstance(start_val, datetime):
                    start_time = start_val.time()
                elif isinstance(start_val, str):
                    start_time = datetime.strptime(start_val, "%I:%M %p").time()
                else:
                    start_time = start_val
                if isinstance(end_val, datetime):
                    end_time = end_val.time()
                elif isinstance(end_val, str):
                    end_time = datetime.strptime(end_val, "%I:%M %p").time()
                else:
                    end_time = end_val
            except Exception:
                continue
            teacher = db.query(models.Teacher).filter(models.Teacher.name == teacher_name).first()
            if not teacher:
                teacher = models.Teacher(name=teacher_name)
                db.add(teacher)
                db.flush()
            proctor = db.query(models.Proctor).filter(models.Proctor.teacher_id == teacher.id).first()
            if not proctor:
                proctor = db.query(models.Proctor).filter(models.Proctor.name == teacher_name).first()
                if proctor:
                    proctor.teacher_id = teacher.id
                else:
                    proctor = models.Proctor(name=teacher_name, teacher_id=teacher.id)
                    db.add(proctor)
                db.flush()
            new_sched = models.TeacherSchedule(
                teacher_id=teacher.id,
                day_of_week=day_idx,
                start_time=start_time,
                end_time=end_time,
                subject_name=subject_name
            )
            db.add(new_sched)
            records_processed += 1
        db.commit()
        return {"message": f"Successfully processed {records_processed} schedule entries."}
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        if "File is not a zip" in error_msg:
            raise HTTPException(status_code=400, detail="Invalid Excel file format.")
        raise HTTPException(status_code=500, detail=f"Error processing file: {error_msg}")

@router.post("/{proctor_id}/upload-my-schedule")
async def upload_my_schedule(proctor_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    proctor = db.query(models.Proctor).get(proctor_id)
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")
    if not proctor.teacher_id:
        raise HTTPException(status_code=400, detail="Proctor not linked to teacher account.")
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file.")
    try:
        content = await file.read()
        try:
            xl = pd.ExcelFile(io.BytesIO(content), engine=get_excel_engine(content, file.filename))
        except:
            alt_engine = 'xlrd' if get_excel_engine(content, file.filename) == 'openpyxl' else 'openpyxl'
            xl = pd.ExcelFile(io.BytesIO(content), engine=alt_engine)
        engine = get_excel_engine(content, file.filename)
        target_df = None
        target_sheet_name = None
        if len(xl.sheet_names) == 1:
            target_df = pd.read_excel(xl, sheet_name=0, engine=engine)
            target_sheet_name = xl.sheet_names[0]
        else:
            proctor_last_name = proctor.name.split()[-1].lower()
            for sheet in xl.sheet_names:
                if sheet in ['BLANK', 'CHANGES', 'SIMS SYNC']:
                    continue
                if proctor_last_name in sheet.lower() or proctor.name.lower() in sheet.lower():
                    target_df = pd.read_excel(xl, sheet_name=sheet, engine=engine)
                    target_sheet_name = sheet
                    break
            if target_df is None:
                for sheet in xl.sheet_names:
                    if sheet not in ['BLANK', 'CHANGES', 'SIMS SYNC']:
                        target_df = pd.read_excel(xl, sheet_name=sheet, engine=engine)
                        target_sheet_name = sheet
                        break
            if target_df is None:
                target_df = pd.read_excel(xl, sheet_name=0, engine=engine)
                target_sheet_name = xl.sheet_names[0]
        df = target_df
        if 'Day/Time' in df.columns:
            # grid format – already handled by process_grid_upload
            from datetime import time
            def parse_t(s):
                if isinstance(s, datetime): return s.time()
                if "AM" in s or "PM" in s:
                    return datetime.strptime(s, "%I:%M %p").time()
                else:
                    h, m = map(int, s.split(":"))
                    if h < 7: h += 12
                    return time(h, m)
            day_map = {'MONDAY': 0, 'TUESDAY': 1, 'WEDNESDAY': 2, 'THURSDAY': 3, 'FRIDAY': 4, 'SATURDAY': 5}
            excluded = ['ADMIN', 'HOURS', 'LUNCH', 'BREAK', 'CONSULTATION', 'SCHOOL', 'WIDE BREAK', 'MEETING', 'LEC', 'LAB']
            db.query(models.TeacherSchedule).filter(models.TeacherSchedule.teacher_id == proctor.teacher_id).delete()
            records = 0
            for _, row in df.iterrows():
                time_range = str(row.get('Day/Time', ''))
                if '-' not in time_range: continue
                try:
                    parts = time_range.split("-")
                    start_t = parse_t(parts[0].strip())
                    end_t = parse_t(parts[1].strip())
                except:
                    continue
                for day_name, day_idx in day_map.items():
                    cell_val = row.get(day_name)
                    if pd.isna(cell_val): continue
                    cell_str = str(cell_val).strip().upper()
                    if any(k in cell_str for k in excluded): continue
                    new_sched = models.TeacherSchedule(
                        teacher_id=proctor.teacher_id,
                        day_of_week=day_idx,
                        start_time=start_t,
                        end_time=end_t,
                        subject_name=cell_str[:50]
                    )
                    db.add(new_sched)
                    records += 1
            
            # Generate translated schedule text
            try:
                translated = translate_grid_schedule_from_bytes(content, sheet_name=target_sheet_name, proctor_name=proctor.name)
                proctor.translated_schedule = translated
            except Exception as e:
                print(f"Failed to translate schedule: {e}")
                
            db.commit()
            
            # Notify Admin
            notif = models.Notification(
                recipient_type="program_head",
                recipient_id="admin",
                message=f"Proctor {proctor.name} has uploaded their teaching schedule.",
                type="info",
                related_id=proctor.id
            )
            db.add(notif)
            db.commit()
            
            return {
                "message": f"Successfully processed grid schedule with {records} entries.",
                "translated_schedule": proctor.translated_schedule
            }
        # Standard row-based format
        required_columns = ['Day', 'Start Time', 'End Time']
        for col in required_columns:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing required column: {col}")
        db.query(models.TeacherSchedule).filter(models.TeacherSchedule.teacher_id == proctor.teacher_id).delete()
        day_map = {'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
                   'Friday': 4, 'Saturday': 5, 'Sunday': 6}
        records_processed = 0
        for _, row in df.iterrows():
            day_str = str(row['Day']).strip().capitalize()
            start_val = row['Start Time']
            end_val = row['End Time']
            subject_name = str(row.get('Subject', '')).strip()
            if day_str not in day_map:
                continue
            day_idx = day_map[day_str]
            try:
                if isinstance(start_val, datetime):
                    start_time = start_val.time()
                elif isinstance(start_val, str):
                    start_time = datetime.strptime(start_val, "%I:%M %p").time()
                else:
                    start_time = start_val
                if isinstance(end_val, datetime):
                    end_time = end_val.time()
                elif isinstance(end_val, str):
                    end_time = datetime.strptime(end_val, "%I:%M %p").time()
                else:
                    end_time = end_val
                if not start_time or not end_time: continue
            except:
                continue
            new_sched = models.TeacherSchedule(
                teacher_id=proctor.teacher_id,
                day_of_week=day_idx,
                start_time=start_time,
                end_time=end_time,
                subject_name=subject_name
            )
            db.add(new_sched)
            records_processed += 1
            
        # Generate translated schedule text
        try:
            translated = translate_row_schedule(df)
            proctor.translated_schedule = translated
        except Exception as e:
            print(f"Failed to translate schedule: {e}")
            
        db.commit()
        
        # Notify Admin
        notif = models.Notification(
            recipient_type="program_head",
            recipient_id="admin",
            message=f"Proctor {proctor.name} has uploaded their teaching schedule.",
            type="info",
            related_id=proctor.id
        )
        db.add(notif)
        db.commit()
        
        return {
            "message": f"Successfully processed {records_processed} schedule entries.",
            "translated_schedule": proctor.translated_schedule
        }
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        if "File is not a zip" in error_msg:
            raise HTTPException(status_code=400, detail="Invalid Excel file format.")
        raise HTTPException(status_code=500, detail=f"Error processing file: {error_msg}")

@router.get("/{proctor_id}/translated-schedule")
def get_translated_schedule(proctor_id: int, db: Session = Depends(get_db)):
    proctor = db.query(models.Proctor).get(proctor_id)
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")
    return {"translated_schedule": proctor.translated_schedule}

@router.get("/schedules")
def get_schedules(published_only: bool = False, db: Session = Depends(get_db)):
    query = db.query(models.TeacherSchedule).options(joinedload(models.TeacherSchedule.teacher))
    if published_only:
        query = query.filter(models.TeacherSchedule.is_published == True)
    schedules = query.all()
    result = []
    for s in schedules:
        if not s.teacher:
            continue
        result.append({
            "id": s.id,
            "teacher_name": s.teacher.name,
            "day_of_week": s.day_of_week,
            "start_time": s.start_time.strftime("%I:%M %p"),
            "end_time": s.end_time.strftime("%I:%M %p"),
            "subject": s.subject_name
        })
    return result

@router.post("/publish-schedules")
def publish_schedules(db: Session = Depends(get_db)):
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot publish schedules while schedule generation is ongoing")
    db.execute(text("UPDATE teacher_schedules SET is_published = TRUE"))
    db.commit()
    return {"message": "All schedules have been published."}

@router.post("/{proctor_id}/confirm-attendance/{exam_id}")
def confirm_attendance(proctor_id: int, exam_id: int, db: Session = Depends(get_db)):
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id, models.Exam.proctor_id == proctor_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam assignment not found for this proctor")
    if exam.proctor_attendance == "attended":
        return {"message": "Attendance already confirmed"}
    exam.proctor_attendance = "attended"
    proctor = db.query(models.Proctor).get(proctor_id)
    proctor_name = proctor.name if proctor else f"Proctor {proctor_id}"
    subject_name = exam.subject.name if exam.subject else "Unknown Subject"
    section_name = exam.section.name if exam.section else "Unknown Section"
    notif = models.Notification(
        recipient_type="program_head",
        recipient_id="admin",
        message=f"Proctor {proctor_name} has confirmed attendance for {subject_name} ({section_name}).",
        type="success",
        related_id=exam.id
    )
    db.add(notif)
    db.commit()
    return {"message": "Attendance confirmed and program head notified"}

@router.get("/monitoring")
def get_proctor_monitoring(db: Session = Depends(get_db)):
    exams = (
        db.query(models.Exam)
        .options(
            joinedload(models.Exam.subject),
            joinedload(models.Exam.section),
            joinedload(models.Exam.room),
            joinedload(models.Exam.timeslot),
            joinedload(models.Exam.course),
            joinedload(models.Exam.year_level),
            joinedload(models.Exam.proctor),
        )
        .filter(
            models.Exam.status == "posted",
            models.Exam.proctor_id.isnot(None),
        )
        .join(models.Exam.timeslot)
        .order_by(models.Timeslot.date, models.Timeslot.start_time)
        .all()
    )
    course_map = {}
    for e in exams:
        course_name = e.course.name if e.course else "Unknown Course"
        if course_name not in course_map:
            course_map[course_name] = []
        proctor = e.proctor
        proctor_name = proctor.name if proctor else "Unassigned"
        timeslot = e.timeslot
        if timeslot:
            day_name = timeslot.date.strftime("%A")
            date_str = timeslot.date.strftime("%B %d, %Y")
            full_date = f"{day_name}, {date_str}"
            start_time = timeslot.start_time.strftime("%I:%M %p")
            end_time = timeslot.end_time.strftime("%I:%M %p")
        else:
            full_date = "-"
            start_time = "-"
            end_time = "-"
        course_map[course_name].append({
            "exam_id": e.id,
            "proctor_id": e.proctor_id,
            "proctor_name": proctor_name,
            "subject_code": e.subject.code if e.subject else "-",
            "subject_name": e.subject.name if e.subject else "-",
            "section_name": e.section.name if e.section else "-",
            "year_level": e.year_level.name if e.year_level else "-",
            "semester": e.semester,
            "exam_date": full_date,
            "start_time": start_time,
            "end_time": end_time,
            "room": e.room.name if e.room else "-",
            "attendance_status": e.proctor_attendance or "pending",
        })
    result = [{"course_name": course, "exams": entries} for course, entries in sorted(course_map.items())]
    return result

# ----- NEW ENDPOINTS for missing schedules, exclude, remind -----
@router.get("/missing-schedules")
def get_missing_schedules(db: Session = Depends(get_db)):
    proctors = db.query(models.Proctor).all()
    result = []
    for p in proctors:
        if p.teacher_id:
            sched_count = db.query(models.TeacherSchedule).filter(
                models.TeacherSchedule.teacher_id == p.teacher_id
            ).count()
            if sched_count == 0:
                result.append({"id": p.id, "name": p.name, "teacher_id": p.teacher_id, "excluded": p.exclude_from_scheduling})
    return result

@router.post("/{id}/exclude")
def toggle_exclude(id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["admin"]))):
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot update proctor exclusion while schedule generation is ongoing")
    proctor = db.query(models.Proctor).get(id)
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")
    proctor.exclude_from_scheduling = not proctor.exclude_from_scheduling
    db.commit()
    log_activity(db, current_user.id, "PROCTOR_EXCLUDE_TOGGLE", f"Proctor ID: {id}, New State: {proctor.exclude_from_scheduling}")
    return {"message": "Toggled", "excluded": proctor.exclude_from_scheduling}

@router.post("/{id}/send-reminder")
def send_reminder(id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["admin"]))):
    proctor = db.query(models.Proctor).get(id)
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")
    log_activity(db, current_user.id, "PROCTOR_REMINDER_SENT", f"Proctor: {proctor.name}")
    return {"message": f"Reminder sent to {proctor.name}"}

@router.delete("/{proctor_id}/schedule")
def delete_proctor_schedule(proctor_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot delete schedules while schedule generation is ongoing")
        
    # Only admin or the proctor themselves can delete this schedule
    if current_user.role == "proctor" and current_user.proctor_id != proctor_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete other proctor's schedule")
        
    proctor = db.query(models.Proctor).get(proctor_id)
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")
        
    if not proctor.teacher_id:
        raise HTTPException(status_code=400, detail="Proctor not linked to teacher account")
        
    count = db.query(models.TeacherSchedule).filter(models.TeacherSchedule.teacher_id == proctor.teacher_id).delete()
    proctor.translated_schedule = None
    db.commit()
    
    # Notify Admin that proctor deleted their schedule
    notif = models.Notification(
        recipient_type="program_head",
        recipient_id="admin",
        message=f"Proctor {proctor.name} has deleted their teaching schedule.",
        type="info",
        related_id=proctor.id
    )
    db.add(notif)
    db.commit()
    
    log_activity(db, current_user.id, "PROCTOR_SCHEDULE_DELETE", f"Proctor: {proctor.name}, entries deleted: {count}")
    return {"message": f"Successfully deleted teaching schedule ({count} entries)."}