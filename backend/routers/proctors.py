from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from database import get_db
import models
import pandas as pd
import io
from datetime import datetime, date
from sqlalchemy import text

router = APIRouter(prefix="/proctors", tags=["Proctors"])

def get_excel_engine(file_content: bytes, filename: str):
    """Determine the appropriate Excel engine based on file content/extension."""
    # Check if it's an old .xls file (not .xlsx)
    if filename.endswith('.xls') and not filename.endswith('.xlsx'):
        return 'xlrd'
    # Check file magic bytes for xls format (old Excel format)
    if len(file_content) >= 8 and file_content[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1':
        return 'xlrd'
    return 'openpyxl'

def read_excel_with_fallback(content: bytes, filename: str):
    """Try to read Excel file with automatic engine fallback."""
    engine = get_excel_engine(content, filename)
    try:
        return pd.read_excel(io.BytesIO(content), engine=engine)
    except Exception as e:
        # Try the other engine as fallback
        other_engine = 'xlrd' if engine == 'openpyxl' else 'openpyxl'
        try:
            return pd.read_excel(io.BytesIO(content), engine=other_engine)
        except Exception:
            raise Exception(f"Could not read Excel file with any engine: {str(e)}")

# Get all proctors
@router.get("/")
def get_proctors(db: Session = Depends(get_db)):
    proctors = db.query(models.Proctor).all()
    result = []
    for p in proctors:
        result.append({
            "id": p.id,
            "name": p.name,
            "department": p.department,
            "contact": p.contact,
            "availability": [
                {
                    "day_of_week": a.day_of_week,
                    "start_time": a.start_time.strftime("%I:%M %p"),
                    "end_time": a.end_time.strftime("%I:%M %p")
                } for a in p.availabilities
            ]
        })
    return result

# Add proctor
@router.post("/")
def create_proctor(proctor: dict, db: Session = Depends(get_db)):
    new_p = models.Proctor(
        name=proctor["name"],
        department=proctor.get("department"),
        contact=proctor.get("contact")
    )
    db.add(new_p)
    db.commit()
    db.refresh(new_p)
    return {"message": "Proctor added", "id": new_p.id}

# Add availability
@router.post("/{proctor_id}/availability")
def add_availability(proctor_id: int, body: dict, db: Session = Depends(get_db)):
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
async def upload_schedules(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    [DEPRECATED] Bulk upload via admin. 
    Kept for compatibility but recommended to use individual proctor upload.
    """
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file.")

    try:
        content = await file.read()
        df = read_excel_with_fallback(content, file.filename)
        
        # Required columns check
        required_columns = ['Instructor Name', 'Day', 'Start Time', 'End Time']
        for col in required_columns:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing required column: {col}")

        day_map = {
            'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
            'Friday': 4, 'Saturday': 5, 'Sunday': 6
        }

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

            # Parse times
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
            except Exception as e:
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
        # Provide more helpful error message
        if "File is not a zip" in error_msg:
            raise HTTPException(status_code=400, detail="Invalid Excel file format. Please ensure you're uploading a valid .xlsx or .xls file. The file may be corrupted or saved in an incompatible format.")
        raise HTTPException(status_code=500, detail=f"Error processing file: {error_msg}")

@router.post("/{proctor_id}/upload-my-schedule")
async def upload_my_schedule(proctor_id: int, file: UploadFile = File(...), db: Session = Depends(get_db)):
    """
    Upload an Excel file containing the teaching schedule for a specific proctor.
    Expected columns: 'Day', 'Start Time', 'End Time', 'Subject'
    """
    proctor = db.query(models.Proctor).get(proctor_id)
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")
    
    if not proctor.teacher_id:
        raise HTTPException(status_code=400, detail="Proctor is not linked to a teacher account. Please contact admin.")

    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file.")

    try:
        content = await file.read()
        
        # Try to read with fallback
        try:
            xl = pd.ExcelFile(io.BytesIO(content), engine=get_excel_engine(content, file.filename))
        except:
            # Try alternative engine
            try:
                alt_engine = 'xlrd' if get_excel_engine(content, file.filename) == 'openpyxl' else 'openpyxl'
                xl = pd.ExcelFile(io.BytesIO(content), engine=alt_engine)
            except:
                # Fallback: just try openpyxl directly on content
                df = read_excel_with_fallback(content, file.filename)
                return await process_grid_upload(proctor, df, db)
        
        engine = get_excel_engine(content, file.filename)
        
        target_df = None
        if len(xl.sheet_names) == 1:
            target_df = pd.read_excel(xl, sheet_name=0, engine=engine)
        else:
            proctor_last_name = proctor.name.split()[-1].lower()
            for sheet in xl.sheet_names:
                if sheet in ['BLANK', 'CHANGES', 'SIMS SYNC']:
                    continue
                if proctor_last_name in sheet.lower() or proctor.name.lower() in sheet.lower():
                    target_df = pd.read_excel(xl, sheet_name=sheet, engine=engine)
                    break
            
            if target_df is None:
                for sheet in xl.sheet_names:
                    if sheet not in ['BLANK', 'CHANGES', 'SIMS SYNC']:
                        target_df = pd.read_excel(xl, sheet_name=sheet, engine=engine)
                        break
            if target_df is None:
                target_df = pd.read_excel(xl, sheet_name=0, engine=engine)
                
        df = target_df
        
        # Check for grid format (from process_proctors)
        if 'Day/Time' in df.columns:
            return await process_grid_upload(proctor, df, db)

        # Standard row-based format check
        required_columns = ['Day', 'Start Time', 'End Time']
        for col in required_columns:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing required column: {col}")

        # Clear old schedules for this teacher
        db.query(models.TeacherSchedule).filter(models.TeacherSchedule.teacher_id == proctor.teacher_id).delete()

        day_map = {
            'Monday': 0, 'Tuesday': 1, 'Wednesday': 2, 'Thursday': 3,
            'Friday': 4, 'Saturday': 5, 'Sunday': 6
        }

        # Collect all parsed schedules first for validation
        parsed_schedules = []
        
        records_processed = 0
        for _, row in df.iterrows():
            day_str = str(row['Day']).strip().capitalize()
            start_val = row['Start Time']
            end_val = row['End Time']
            subject_name = str(row.get('Subject', '')).strip()

            if day_str not in day_map:
                continue
            
            day_idx = day_map[day_str]

            # Parse times
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

            parsed_schedules.append({
                'day_idx': day_idx,
                'start_time': start_time,
                'end_time': end_time,
                'subject_name': subject_name
            })

        # Save all schedules
        for sched in parsed_schedules:
            new_sched = models.TeacherSchedule(
                teacher_id=proctor.teacher_id,
                day_of_week=sched['day_idx'],
                start_time=sched['start_time'],
                end_time=sched['end_time'],
                subject_name=sched['subject_name']
            )
            db.add(new_sched)
            records_processed += 1

        db.commit()
        return {"message": f"Successfully processed {records_processed} schedule entries."}

    except Exception as e:
        db.rollback()
        error_msg = str(e)
        if "File is not a zip" in error_msg:
            raise HTTPException(status_code=400, detail="Invalid Excel file format. Please ensure you're uploading a valid .xlsx or .xls file. The file may be corrupted or saved in an incompatible format.")
        raise HTTPException(status_code=500, detail=f"Error processing file: {error_msg}")

async def process_grid_upload(proctor, df, db: Session):
    """Parses the grid-style Excel format (ICT.xlsx style) for a single proctor."""
    from datetime import time, timedelta
    
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

    # Clear old
    db.query(models.TeacherSchedule).filter(models.TeacherSchedule.teacher_id == proctor.teacher_id).delete()
    
    # Collect all parsed schedules first for validation
    parsed_schedules = []
    
    records = 0
    for _, row in df.iterrows():
        time_range = str(row.get('Day/Time', ''))
        if '-' not in time_range: continue
        try:
            parts = time_range.split("-")
            start_t = parse_t(parts[0].strip())
            end_t = parse_t(parts[1].strip())
        except: continue
            
        for day_name, day_idx in day_map.items():
            cell_val = row.get(day_name)
            if pd.isna(cell_val): continue
            
            cell_str = str(cell_val).strip().upper()
            if any(k in cell_str for k in excluded): continue
            
            parsed_schedules.append({
                'day_idx': day_idx,
                'start_time': start_t,
                'end_time': end_t,
                'subject_name': cell_str[:50]
            })
    
    # Save all schedules
    for sched in parsed_schedules:
        new_sched = models.TeacherSchedule(
            teacher_id=proctor.teacher_id,
            day_of_week=sched['day_idx'],
            start_time=sched['start_time'],
            end_time=sched['end_time'],
            subject_name=sched['subject_name']
        )
        db.add(new_sched)
        records += 1
        
    db.commit()
    return {"message": f"Successfully processed grid schedule with {records} entries."}

@router.get("/schedules")
def get_schedules(published_only: bool = False, db: Session = Depends(get_db)):
    """Retrieve all instructor teaching schedules."""
    query = db.query(models.TeacherSchedule).options(joinedload(models.TeacherSchedule.teacher))
    if published_only:
        query = query.filter(models.TeacherSchedule.is_published == True)
    
    schedules = query.all()
    result = []
    for s in schedules:
        if not s.teacher:
            # Orphaned record — teacher was deleted (e.g. after a seed reset); skip it
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
    """Publish all instructor teaching schedules so proctors can see them."""
    db.execute(text("UPDATE teacher_schedules SET is_published = TRUE"))
    db.commit()
    return {"message": "All schedules have been published."}
@router.post("/{proctor_id}/confirm-attendance/{exam_id}")
def confirm_attendance(proctor_id: int, exam_id: int, db: Session = Depends(get_db)):
    # 1. Verify Proctor and Exam
    exam = db.query(models.Exam).filter(models.Exam.id == exam_id, models.Exam.proctor_id == proctor_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam assignment not found for this proctor")

    if exam.proctor_attendance == "attended":
        return {"message": "Attendance already confirmed"}

    # 2. Update Attendance
    exam.proctor_attendance = "attended"
    
    # 3. Create Notification for Program Head/Admin
    # Find proctor name
    proctor = db.query(models.Proctor).get(proctor_id)
    proctor_name = proctor.name if proctor else f"Proctor {proctor_id}"
    
    # Subject detail
    subject_name = exam.subject.name if exam.subject else "Unknown Subject"
    section_name = exam.section.name if exam.section else "Unknown Section"
    
    notif = models.Notification(
        recipient_type="program_head",
        recipient_id="admin", # Defaulting to admin/program head group
        message=f"Proctor {proctor_name} has confirmed attendance for {subject_name} ({section_name}).",
        type="success",
        related_id=exam.id
    )
    db.add(notif)
    db.commit()
    
    return {"message": "Attendance confirmed and program head notified"}


# ─── Admin: Proctor Attendance Monitoring ───────────────────────────────────

@router.get("/monitoring")
def get_proctor_monitoring(db: Session = Depends(get_db)):
    """
    Returns all posted exams that have a proctor assigned.
    Response is a list of course groups, each containing a list of exam entries
    with proctor name, section, subject, schedule, room, and attendance status.
    """
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

    # Group by course
    course_map: dict = {}
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

    # Convert to list of {course, exams} objects sorted by course name
    result = [
        {"course_name": course, "exams": entries}
        for course, entries in sorted(course_map.items())
    ]
    return result
