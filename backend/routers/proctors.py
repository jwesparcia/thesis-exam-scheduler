from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from core import get_db, cache
from core.cache import PROCTOR_MONITORING_CACHE_KEY, TTL_PROCTORS, TTL_MONITORING
from core.generation_lock import try_acquire_generation_lock
from model import models
import pandas as pd
import io
import os
from datetime import datetime, date, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from typing import Literal
from uuid import uuid4
from sqlalchemy import text, func, and_, or_
from .auth import get_current_user, require_role
from utils.logging import log_activity
from .exams import _eligible_proctors, is_generation_ongoing
from utils.schedule_translator import (
    _classify_cell, _parse_sequential_timeslots,
    translate_grid_schedule_from_bytes, translate_row_schedule,
)
from utils.scheduler import normalize_day_of_week
from services.attendance_proofs import (
    MAX_ATTENDANCE_PHOTO_BYTES, attendance_proof_metadata, proof_matches_assignment, validate_attendance_photo,
)

router = APIRouter(prefix="/proctors", tags=["Proctors"])


def _get_schedule_timezone():
    """Return the timezone in which the institution's timetable is defined."""
    timezone_name = os.getenv("EXAM_SCHEDULE_TIMEZONE", "Asia/Manila")
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        # The application is used in a UTC+8 institution. Keep the attendance
        # safeguard working on hosts that do not ship the IANA timezone database.
        return timezone(timedelta(hours=8))


SCHEDULE_TIMEZONE = _get_schedule_timezone()


def _get_current_schedule_datetime():
    """Get the current time in the same timezone as stored exam timeslots."""
    return datetime.now(SCHEDULE_TIMEZONE)


def _get_timeslot_window(timeslot):
    """Build timezone-aware start/end datetimes from a Timeslot, if complete."""
    if not timeslot or not timeslot.date or not timeslot.start_time or not timeslot.end_time:
        return None

    starts_at = datetime.combine(timeslot.date, timeslot.start_time, tzinfo=SCHEDULE_TIMEZONE)
    ends_at = datetime.combine(timeslot.date, timeslot.end_time, tzinfo=SCHEDULE_TIMEZONE)
    if ends_at < starts_at:
        ends_at += timedelta(days=1)
    return starts_at, ends_at

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

def _with_assignment_counts(db: Session, proctors: list, include_reviews=False):
    """Read current duties separately from cached proctor profile information."""
    proctor_ids = [proctor["id"] for proctor in proctors]
    counts = {}
    if proctor_ids:
        rows = (
            db.query(models.Exam.proctor_id, models.Exam.status, func.count(models.Exam.id))
            .filter(
                models.Exam.proctor_id.in_(proctor_ids),
                models.Exam.status.in_(["posted", "draft", "saved"]),
            )
            .group_by(models.Exam.proctor_id, models.Exam.status)
            .all()
        )
        for proctor_id, status, count in rows:
            counts.setdefault(proctor_id, {})[status] = count
    reviews = dict(db.query(models.ProctorScheduleReview.proctor_id, models.ProctorScheduleReview.status).filter(
        models.ProctorScheduleReview.proctor_id.in_(proctor_ids),
    ).all()) if include_reviews and proctor_ids else {}
    result = [
        {
            **proctor,
            "posted_exam_count": counts.get(proctor["id"], {}).get("posted", 0),
            "pending_exam_count": (
                counts.get(proctor["id"], {}).get("draft", 0)
                + counts.get(proctor["id"], {}).get("saved", 0)
            ),
        }
        for proctor in proctors
    ]
    if include_reviews:
        for proctor in result:
            proctor["schedule_review_status"] = reviews.get(proctor["id"], "pending") if proctor["has_schedule"] else None
    return result


@router.get("/")
def get_proctors(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    if current_user.role not in ["admin", "proctor", "program_head"]:
        raise HTTPException(status_code=403, detail="Not authorized to view proctors")

    include_reviews = current_user.role in ("admin", "program_head")
    cached = cache.get("proctors:all")
    if cached is not None:
        return _with_assignment_counts(db, cached, include_reviews)

    proctors = db.query(models.Proctor).all()
    teacher_ids = [p.teacher_id for p in proctors if p.teacher_id]
    schedules = (
        db.query(models.TeacherSchedule)
        .filter(models.TeacherSchedule.teacher_id.in_(teacher_ids))
        .all()
    ) if teacher_ids else []

    schedules_by_teacher = {}
    for s in schedules:
        schedules_by_teacher.setdefault(s.teacher_id, []).append(s)

    result = []
    for p in proctors:
        p_scheds = schedules_by_teacher.get(p.teacher_id, []) if p.teacher_id else []
        has_schedule = len(p_scheds) > 0

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
                } for a in sorted(p_scheds, key=lambda s: (s.day_of_week, s.start_time))
            ]
        })
    cache.set("proctors:all", result, TTL_PROCTORS)
    return _with_assignment_counts(db, result, include_reviews)

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
    # ── invalidate ──────────────────────────────────────────────────
    cache.invalidate_proctors()
    return {"message": "Proctor added", "id": new_p.id}

@router.post("/{proctor_id}/availability")
def add_availability(proctor_id: int, body: dict, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["admin"]))):
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot update availability while schedule generation is ongoing")
    proctor = db.query(models.Proctor).filter_by(id=proctor_id).with_for_update().one_or_none()
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")
    availability = models.ProctorAvailability(
        proctor_id=proctor_id,
        day_of_week=body["day_of_week"],
        start_time=body["start_time"],
        end_time=body["end_time"]
    )
    db.add(availability)
    if proctor.teacher_id:
        start_val = body["start_time"]
        end_val = body["end_time"]
        try:
            if isinstance(start_val, str):
                start_val = datetime.strptime(start_val, "%I:%M %p").time() if ("AM" in start_val or "PM" in start_val) else datetime.strptime(start_val, "%H:%M").time()
            if isinstance(end_val, str):
                end_val = datetime.strptime(end_val, "%I:%M %p").time() if ("AM" in end_val or "PM" in end_val) else datetime.strptime(end_val, "%H:%M").time()
            from utils.scheduler import normalize_day_of_week
            ts = models.TeacherSchedule(
                teacher_id=proctor.teacher_id,
                day_of_week=normalize_day_of_week(body["day_of_week"]),
                start_time=start_val,
                end_time=end_val,
                subject_name="Proctor Availability"
            )
            db.add(ts)
        except Exception:
            pass
        else:
            proctor.translated_schedule = None
            _queue_schedule_review(db, proctor, current_user.id)
    db.commit()
    cache.invalidate_proctors()
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
        updated_proctors = set()
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
            updated_proctors.add(proctor.id)
            records_processed += 1
        for proctor_id in sorted(updated_proctors):
            proctor = db.query(models.Proctor).filter_by(id=proctor_id).with_for_update().one()
            proctor.translated_schedule = None
            _queue_schedule_review(db, proctor, current_user.id)
        db.commit()
        # ── invalidate proctor schedule caches ───────────────────────────
        cache.invalidate_proctors()
        return {"message": f"Successfully processed {records_processed} schedule entries."}
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        if "File is not a zip" in error_msg:
            raise HTTPException(status_code=400, detail="Invalid Excel file format.")
        raise HTTPException(status_code=500, detail=f"Error processing file: {error_msg}")


def _queue_schedule_review(db, proctor, uploaded_by_id):
    review = db.get(models.ProctorScheduleReview, proctor.id)
    if review is None:
        review = models.ProctorScheduleReview(proctor_id=proctor.id)
        db.add(review)
    review.revision = uuid4().hex
    review.status = "pending"
    review.uploaded_by_id = uploaded_by_id
    account_link = models.User.proctor_id == proctor.id
    if proctor.teacher_id:
        account_link = or_(account_link, and_(
            models.User.proctor_id.is_(None), models.User.teacher_id == proctor.teacher_id,
        ))
    recipients = db.query(models.User.id).filter(account_link, models.User.role.in_(["proctor", "teacher"])).all()
    for (user_id,) in recipients:
        db.add(models.Notification(
            user_id=user_id,
            message="Your teaching schedule is ready to review in My Schedule.",
            type="teaching_schedule_review",
            related_id=proctor.id,
        ))


def _save_teaching_schedule_upload(db, proctor, uploaded_by_id, record_count, message):
    if not record_count:
        raise HTTPException(status_code=400, detail="The workbook contains no teaching schedule entries.")
    _queue_schedule_review(db, proctor, uploaded_by_id)
    db.commit()
    cache.invalidate_proctors()
    return {"message": message, "translated_schedule": proctor.translated_schedule}


@router.post("/{proctor_id}/upload-my-schedule")
@router.post("/{proctor_id}/teaching-schedule")
async def upload_my_schedule(
    proctor_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(["admin"])),
):
    if current_user.role not in ("program_head", "admin"):
        raise HTTPException(status_code=403, detail="Only administrators can upload teaching schedules.")
    if not file.filename or not file.filename.lower().endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Invalid file format. Please upload an Excel file (.xlsx, .xls).")
    max_size = 5 * 1024 * 1024
    content = await file.read(max_size + 1)
    if len(content) > max_size:
        raise HTTPException(status_code=413, detail="File too large. Maximum size is 5MB.")
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot upload schedules while schedule generation is ongoing")

    proctor = db.query(models.Proctor).filter_by(id=proctor_id).with_for_update().one_or_none()
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")
    if not proctor.teacher_id:
        raise HTTPException(status_code=400, detail="Proctor not linked to teacher account.")
    try:
        engine = get_excel_engine(content, file.filename.lower())
        try:
            xl = pd.ExcelFile(io.BytesIO(content), engine=engine)
        except:
            alt_engine = 'xlrd' if engine == 'openpyxl' else 'openpyxl'
            xl = pd.ExcelFile(io.BytesIO(content), engine=alt_engine)
        if len(xl.sheet_names) == 1:
            target_sheet_name = xl.sheet_names[0]
        else:
            proctor_last_name = proctor.name.split()[-1].lower()
            schedule_sheets = [sheet for sheet in xl.sheet_names if sheet not in ['BLANK', 'CHANGES', 'SIMS SYNC']]
            matching_sheets = [
                sheet for sheet in schedule_sheets
                if proctor_last_name in sheet.lower() or proctor.name.lower() in sheet.lower()
            ]
            if len(schedule_sheets) > 1 and len(matching_sheets) != 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Could not identify a single worksheet for {proctor.name}. Upload a workbook containing only their schedule.",
                )
            target_sheet_name = (matching_sheets or schedule_sheets or xl.sheet_names)[0]
        df = pd.read_excel(xl, sheet_name=target_sheet_name, engine=engine)
        if 'Day/Time' in df.columns:
            # grid format – already handled by process_grid_upload
            from datetime import time
            # Excel subject blocks can contain blank or metadata-only cells. Read
            # their fills as well as their text so all rows in a class count.
            grid_sheet = None
            if engine == 'openpyxl':
                from openpyxl import load_workbook
                grid_sheet = load_workbook(io.BytesIO(content), data_only=True)[target_sheet_name]
            grid_slots = _parse_sequential_timeslots(grid_sheet, df.columns.get_loc('Day/Time'), 0) if grid_sheet is not None else None
            # A sparse grid beginning at 1–6 without AM/PM uses the existing
            # upload convention that these are afternoon hours. A full-day
            # grid has earlier rows that establish the sequential clock.
            for value in df['Day/Time']:
                first_range = str(value).strip().upper()
                if '-' not in first_range:
                    continue
                first_start = first_range.split('-', 1)[0].strip()
                try:
                    hour = int(first_start.split(':', 1)[0])
                except ValueError:
                    continue
                if 1 <= hour <= 6 and 'AM' not in first_start and 'PM' not in first_start:
                    grid_slots = None
                break
            def parse_t(s):
                if isinstance(s, datetime): return s.time()
                if "AM" in s or "PM" in s:
                    return datetime.strptime(s, "%I:%M %p").time()
                else:
                    h, m = map(int, s.split(":"))
                    if h < 7: h += 12
                    return time(h, m)
            day_columns = [(column, normalize_day_of_week(column), index + 1) for index, column in enumerate(df.columns)]
            day_columns = [(column, day, index) for column, day, index in day_columns if day is not None]
            excluded = ['ADMIN', 'HOURS', 'LUNCH', 'BREAK', 'CONSULTATION', 'SCHOOL', 'WIDE BREAK', 'MEETING']
            db.query(models.TeacherSchedule).filter(models.TeacherSchedule.teacher_id == proctor.teacher_id).delete()
            records = 0
            teaching_days = set()
            admin_intervals = []
            for row_number, (_, row) in enumerate(df.iterrows(), start=2):
                time_range = str(row.get('Day/Time', ''))
                if '-' not in time_range: continue
                if grid_slots is not None:
                    start_t, end_t = grid_slots[row_number - 2]
                    if not start_t or not end_t: continue
                else:
                    try:
                        parts = time_range.split("-")
                        start_t = parse_t(parts[0].strip())
                        end_t = parse_t(parts[1].strip())
                        if end_t <= start_t and end_t.hour <= 7:
                            end_t = time(end_t.hour + 12, end_t.minute)
                    except:
                        continue
                for day_name, day_idx, column_number in day_columns:
                    cell_val = row.get(day_name)
                    cell_type = _classify_cell(grid_sheet.cell(row_number, column_number)) if grid_sheet is not None else None
                    if cell_type == 'admin':
                        # Admin hours extend the daily working window only on a
                        # day that also contains a teaching class.
                        admin_intervals.append((day_idx, start_t, end_t))
                        continue
                    if cell_type and cell_type != 'subject': continue
                    cell_str = '' if pd.isna(cell_val) else str(cell_val).strip().upper()
                    if cell_type != 'subject' and (not cell_str or any(k in cell_str for k in excluded)): continue
                    subject_name = cell_str or None
                    if cell_str in {'LAB', 'LEC', 'LECTURE', 'LABORATORY'}:
                        subject_name = None
                    new_sched = models.TeacherSchedule(
                        teacher_id=proctor.teacher_id,
                        day_of_week=day_idx,
                        start_time=start_t,
                        end_time=end_t,
                        subject_name=subject_name[:50] if subject_name else None
                    )
                    db.add(new_sched)
                    teaching_days.add(day_idx)
                    records += 1

            for day_idx, start_t, end_t in admin_intervals:
                if day_idx in teaching_days:
                    db.add(models.TeacherSchedule(
                        teacher_id=proctor.teacher_id, day_of_week=day_idx,
                        start_time=start_t, end_time=end_t, subject_name=None,
                    ))
                    records += 1
            
            # Generate translated schedule text
            try:
                translated = translate_grid_schedule_from_bytes(content, sheet_name=target_sheet_name, proctor_name=proctor.name)
                proctor.translated_schedule = translated
            except Exception as e:
                proctor.translated_schedule = None
                print(f"Failed to translate schedule: {e}")
                
            return _save_teaching_schedule_upload(
                db, proctor, current_user.id, records,
                f"Successfully processed grid schedule with {records} entries.",
            )
        # Standard row-based format
        required_columns = ['Day', 'Start Time', 'End Time']
        for col in required_columns:
            if col not in df.columns:
                raise HTTPException(status_code=400, detail=f"Missing required column: {col}")
        db.query(models.TeacherSchedule).filter(models.TeacherSchedule.teacher_id == proctor.teacher_id).delete()
        records_processed = 0
        for _, row in df.iterrows():
            day_idx = normalize_day_of_week(str(row['Day']))
            start_val = row['Start Time']
            end_val = row['End Time']
            subject_name = str(row.get('Subject', '')).strip()
            if day_idx is None:
                continue
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
            proctor.translated_schedule = None
            print(f"Failed to translate schedule: {e}")
            
        return _save_teaching_schedule_upload(
            db, proctor, current_user.id, records_processed,
            f"Successfully processed {records_processed} schedule entries.",
        )
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        error_msg = str(e)
        if "File is not a zip" in error_msg:
            raise HTTPException(status_code=400, detail="Invalid Excel file format.")
        raise HTTPException(status_code=500, detail=f"Error processing file: {error_msg}")

def _own_proctor(db, user, *, for_update=False):
    query = db.query(models.Proctor)
    if user.proctor_id:
        query = query.filter_by(id=user.proctor_id)
    elif user.teacher_id:
        query = query.filter_by(teacher_id=user.teacher_id).order_by(models.Proctor.id)
    else:
        raise HTTPException(status_code=404, detail="No proctor is linked to your account.")
    proctor = (query.with_for_update() if for_update else query).first()
    if not proctor:
        raise HTTPException(status_code=404, detail="No proctor is linked to your account.")
    return proctor


@router.get("/my-teaching-schedule")
def get_my_teaching_schedule(
    db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["proctor"])),
):
    proctor = _own_proctor(db, current_user, for_update=True)
    schedules = db.query(models.TeacherSchedule).filter_by(teacher_id=proctor.teacher_id).order_by(
        models.TeacherSchedule.day_of_week, models.TeacherSchedule.start_time,
    ).all() if proctor.teacher_id else []
    review = db.get(models.ProctorScheduleReview, proctor.id) if schedules else None
    return {
        "schedule": [
            {"day_of_week": row.day_of_week, "start_time": row.start_time.strftime("%I:%M %p"),
             "end_time": row.end_time.strftime("%I:%M %p"), "subject": row.subject_name}
            for row in schedules
        ],
        "translated_schedule": proctor.translated_schedule if schedules else None,
        "review_status": review.status if review else "pending" if schedules else None,
        "revision": review.revision if review else "legacy" if schedules else None,
    }


class TeachingScheduleReviewRequest(BaseModel):
    revision: str = Field(max_length=32)
    decision: Literal["confirmed", "needs_correction"]


@router.post("/my-teaching-schedule/review")
def review_my_teaching_schedule(
    body: TeachingScheduleReviewRequest,
    db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["proctor"])),
):
    proctor = _own_proctor(db, current_user, for_update=True)
    if not proctor.teacher_id or not db.query(models.TeacherSchedule.id).filter_by(teacher_id=proctor.teacher_id).first():
        raise HTTPException(status_code=409, detail="There is no teaching schedule to review.")
    review = db.get(models.ProctorScheduleReview, proctor.id)
    if body.revision != (review.revision if review else "legacy"):
        raise HTTPException(status_code=409, detail="Your teaching schedule has changed. Review the latest version before submitting.")
    if review is None:
        review = models.ProctorScheduleReview(proctor_id=proctor.id, revision="legacy", status="pending")
        db.add(review)
    if review.status != "pending":
        if review.status == body.decision:
            return {"review_status": review.status}
        raise HTTPException(status_code=409, detail="This version has already been reviewed.")

    review.status = body.decision
    uploader = db.get(models.User, review.uploaded_by_id) if review.uploaded_by_id else None
    admins = [uploader] if uploader else [
        admin for admin in db.query(models.User).filter(models.User.role.in_(["admin", "program_head"]))
        if admin.is_super_admin or admin.manages_department(proctor.department)
    ]
    decision = "confirmed their teaching schedule" if body.decision == "confirmed" else "reported an incorrect teaching schedule"
    db.add_all([
        models.Notification(user_id=admin.id, message=f"{proctor.name} {decision}.", type="teaching_schedule_review_result", related_id=proctor.id)
        for admin in admins
    ])
    db.commit()
    return {"review_status": body.decision}


@router.get("/{proctor_id}/translated-schedule")
def get_translated_schedule(
    proctor_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    proctor = db.query(models.Proctor).get(proctor_id)
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")
    return {"translated_schedule": proctor.translated_schedule}

@router.get("/schedules")
def get_schedules(
    published_only: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    cache_key = "proctors:schedules"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

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
    cache.set(cache_key, result, TTL_PROCTORS)
    return result

@router.post("/publish-schedules")
def publish_schedules(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(["admin"]))
):
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot publish schedules while schedule generation is ongoing")
    db.execute(text("UPDATE teacher_schedules SET is_published = TRUE"))
    db.commit()
    # ── invalidate ──────────────────────────────────────────────────
    cache.delete("proctors:schedules")
    return {"message": "All schedules have been published."}

def _attendance_exam(proctor_id, exam_id, db, current_user, allow_admin=False, for_update=False):
    is_admin = allow_admin and current_user.role in ["admin", "program_head"]
    if not is_admin and current_user.role not in ["proctor", "teacher"]:
        raise HTTPException(status_code=403, detail="Only the assigned proctor can upload attendance proof. Administrators can view the photo.")
    is_assigned = (current_user.proctor_id == proctor_id)
    if not is_admin and not is_assigned:
        proctor = db.get(models.Proctor, proctor_id)
        if not proctor or not current_user.teacher_id or current_user.teacher_id != proctor.teacher_id:
            raise HTTPException(status_code=403, detail="Not authorized to access attendance for this proctor")
    query = db.query(models.Exam).filter(models.Exam.id == exam_id, models.Exam.proctor_id == proctor_id)
    exam = (query.with_for_update() if for_update else query).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam assignment not found for this proctor")
    return exam


@router.post("/{proctor_id}/attendance-proof/{exam_id}")
def upload_attendance_proof(
    proctor_id: int,
    exam_id: int,
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    exam = _attendance_exam(proctor_id, exam_id, db, current_user, for_update=True)
    if exam.status != "posted":
        raise HTTPException(status_code=400, detail="Attendance photos can only be uploaded for posted exam assignments.")
    if exam.proctor_attendance in ["attended", "confirmed"]:
        raise HTTPException(status_code=400, detail="Attendance is already confirmed. Its proof photo cannot be replaced.")
    if not exam.room or not _get_timeslot_window(exam.timeslot):
        raise HTTPException(status_code=400, detail="This exam needs an assigned room and a complete schedule before a proof photo can be uploaded. Contact the administrator.")
    content = photo.file.read(MAX_ATTENDANCE_PHOTO_BYTES + 1)
    content_type = validate_attendance_photo(content)
    proof = db.query(models.ProctorAttendanceProof).filter_by(exam_id=exam_id, proctor_id=proctor_id).first()
    if proof is None:
        proof = models.ProctorAttendanceProof(exam_id=exam_id, proctor_id=proctor_id)
        db.add(proof)
    proof.uploaded_by_id = current_user.id
    proof.room_id = exam.room_id
    proof.room_name = exam.room.name
    proof.timeslot_id = exam.timeslot_id
    proof.exam_date = exam.timeslot.date
    proof.start_time = exam.timeslot.start_time
    proof.end_time = exam.timeslot.end_time
    proof.content_type = content_type
    proof.photo_data = content
    proof.uploaded_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.commit()
    cache.invalidate_monitoring()
    return {"message": "Proof photo uploaded. You can confirm attendance while the exam is in progress.",
            "attendance_proof": attendance_proof_metadata(db, [exam])[exam_id]}


@router.get("/{proctor_id}/attendance-proof/{exam_id}")
def view_attendance_proof(
    proctor_id: int,
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _attendance_exam(proctor_id, exam_id, db, current_user, allow_admin=True)
    proof = db.query(models.ProctorAttendanceProof).filter_by(exam_id=exam_id, proctor_id=proctor_id).first()
    if proof is None:
        raise HTTPException(status_code=404, detail="No attendance proof photo has been uploaded for this exam.")
    return Response(content=proof.photo_data, media_type=proof.content_type, headers={
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
    })


@router.post("/{proctor_id}/confirm-attendance/{exam_id}")
def confirm_attendance(
    proctor_id: int,
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    exam = _attendance_exam(proctor_id, exam_id, db, current_user, allow_admin=True, for_update=True)
    if exam.status != "posted":
        raise HTTPException(status_code=400, detail="Attendance can only be confirmed for a posted exam assignment")
    if exam.proctor_attendance in ["attended", "confirmed"]:
        raise HTTPException(status_code=400, detail="Attendance has already been confirmed for this exam")

    attendance_window = _get_timeslot_window(exam.timeslot)
    if not attendance_window:
        raise HTTPException(status_code=400, detail="This exam assignment does not have a complete schedule")

    starts_at, ends_at = attendance_window
    now = _get_current_schedule_datetime()
    if now < starts_at or now > ends_at:
        raise HTTPException(
            status_code=403,
            detail="Attendance can only be confirmed while the scheduled exam is in progress",
        )

    proof = db.query(models.ProctorAttendanceProof).filter_by(exam_id=exam_id, proctor_id=proctor_id).first()
    if not proof_matches_assignment(proof, exam):
        raise HTTPException(status_code=400, detail="Upload a proof photo for this exam's current room and schedule before confirming attendance.")

    exam.proctor_attendance = "confirmed"
    proctor = db.query(models.Proctor).get(proctor_id)
    proctor_name = proctor.name if proctor else f"Proctor {proctor_id}"
    subject_name = exam.subject.name if exam.subject else "Unknown Subject"
    section_name = exam.section.name if exam.section else "Unknown Section"
    admin_user = db.query(models.User).filter(models.User.role == "program_head").first()
    notif = models.Notification(
        user_id=admin_user.id if admin_user else None,
        message=f"Proctor {proctor_name} has confirmed attendance for {subject_name} ({section_name}). Proof photo is available in Proctor Monitoring.",
        type="success",
        related_id=exam.id
    )
    db.add(notif)
    db.commit()
    # ── invalidate monitoring cache (attendance_status changed) ──────
    cache.invalidate_monitoring()
    return {"message": "Attendance confirmed and program head notified"}

def _exam_program_department(exam):
    program = exam.course or (exam.section.course if exam.section else None)
    if program and program.department_code:
        return program.department_code
    if program and program.category == "SHS":
        return "SHS"
    return exam.subject.department_code if exam.subject else None


class ReassignProctorRequest(BaseModel):
    expected_proctor_id: int
    expected_timeslot_id: int
    expected_room_id: int
    replacement_proctor_id: int | None = None


class ProctorAbsenceSubmission(BaseModel):
    expected_timeslot_id: int
    expected_room_id: int
    reason: str = Field(min_length=1, max_length=500)


def _require_open_assignment(exam):
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found.")
    if exam.status != "posted" or not exam.proctor_id:
        raise HTTPException(status_code=409, detail="The exam must be posted with an assigned proctor.")
    if exam.proctor_attendance in ("attended", "confirmed"):
        raise HTTPException(status_code=409, detail="Attendance has already been confirmed for this assignment.")
    slot = exam.timeslot
    window = _get_timeslot_window(slot)
    if not exam.room or not window or slot.start_time >= slot.end_time:
        raise HTTPException(status_code=400, detail="The posted exam needs a room and a valid timeslot.")
    if _get_current_schedule_datetime() >= window[1]:
        raise HTTPException(status_code=409, detail="This exam has already ended.")
    return window


def _can_manage_posted_exam(user, exam):
    return user.is_super_admin or user.manages_department(_exam_program_department(exam))


def _absence_response(request):
    return {"exam_id": request.exam_id, "proctor_id": request.proctor_id, "reason": request.reason,
            "timeslot_id": request.timeslot_id, "room_id": request.room_id}


@router.get("/absence-requests")
def get_pending_proctor_absences(
    db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["admin", "proctor"])),
):
    rows = db.query(models.ProctorAbsenceRequest, models.Exam).join(
        models.Exam, models.Exam.id == models.ProctorAbsenceRequest.exam_id,
    ).filter(
        models.ProctorAbsenceRequest.status == "pending",
        models.Exam.status == "posted",
        or_(models.Exam.proctor_attendance.is_(None), models.Exam.proctor_attendance.notin_(["attended", "confirmed"])),
        models.Exam.proctor_id == models.ProctorAbsenceRequest.proctor_id,
        models.Exam.timeslot_id == models.ProctorAbsenceRequest.timeslot_id,
        models.Exam.room_id == models.ProctorAbsenceRequest.room_id,
    )
    if current_user.role in ("proctor", "teacher"):
        owner = _own_proctor(db, current_user)
        return [_absence_response(request) for request, _ in rows.filter(models.Exam.proctor_id == owner.id)]
    return [_absence_response(request) for request, exam in rows if _can_manage_posted_exam(current_user, exam)]


@router.post("/absence-requests/{exam_id}")
def submit_proctor_absence(
    exam_id: int, body: ProctorAbsenceSubmission,
    db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["proctor"])),
):
    owner = _own_proctor(db, current_user)
    exam = _attendance_exam(owner.id, exam_id, db, current_user, for_update=True)
    _require_open_assignment(exam)
    if (exam.timeslot_id, exam.room_id) != (body.expected_timeslot_id, body.expected_room_id):
        raise HTTPException(status_code=409, detail="This assignment has changed. Refresh My Assignments and try again.")
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Enter a brief reason for the request.")

    request = db.query(models.ProctorAbsenceRequest).filter_by(exam_id=exam.id, proctor_id=owner.id).one_or_none()
    if request is None:
        request = models.ProctorAbsenceRequest(exam_id=exam.id, proctor_id=owner.id)
        db.add(request)
    elif request.status == "pending" and (request.timeslot_id, request.room_id) == (exam.timeslot_id, exam.room_id):
        return _absence_response(request)

    request.timeslot_id = exam.timeslot_id
    request.room_id = exam.room_id
    request.reason = reason
    request.status = "pending"
    course = exam.subject.name if exam.subject else "an exam"
    db.add_all([
        models.Notification(
            user_id=admin.id, type="proctor_absence_request", related_id=exam.id,
            message=f"{owner.name} requested a substitute for {course}. Review the request in Proctor Monitoring.",
        )
        for admin in db.query(models.User).filter(models.User.role.in_(["admin", "program_head"]))
        if _can_manage_posted_exam(admin, exam)
    ])
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="A request for this assignment already exists. Refresh My Assignments.") from exc
    return _absence_response(request)


def _replacement_candidates(db, exam, proctor_id=None):
    absent_ids = {exam.proctor_id}
    absent_ids.update(proctor_id for (proctor_id,) in db.query(models.ProctorAbsenceRequest.proctor_id).filter_by(
        exam_id=exam.id, timeslot_id=exam.timeslot_id, room_id=exam.room_id,
    ))
    absent_teachers = {teacher_id for (teacher_id,) in db.query(models.Proctor.teacher_id).filter(
        models.Proctor.id.in_(absent_ids), models.Proctor.teacher_id.isnot(None),
    )}
    possible = db.query(models.Proctor.id).filter(models.Proctor.id.notin_(absent_ids))
    if absent_teachers:
        possible = possible.filter(models.Proctor.teacher_id.notin_(absent_teachers))
    if proctor_id is not None:
        possible = possible.filter(models.Proctor.id == proctor_id)
    return _eligible_proctors(db, exam, exam.timeslot, [candidate_id for (candidate_id,) in possible])


@router.get("/monitoring/{exam_id}/replacement-options")
def get_replacement_options(
    exam_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["admin"])),
):
    exam = db.get(models.Exam, exam_id)
    _require_open_assignment(exam)
    if not _can_manage_posted_exam(current_user, exam):
        raise HTTPException(status_code=403, detail="You do not manage this exam's program.")
    return _replacement_candidates(db, exam)


@router.post("/monitoring/{exam_id}/reassign")
def reassign_posted_proctor(
    exam_id: int,
    body: ReassignProctorRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(["admin"])),
):
    lease = try_acquire_generation_lock()
    if lease is None:
        raise HTTPException(status_code=409, detail="A schedule change is in progress. Wait for it to finish before requesting a replacement.")

    try:
        exam = db.query(models.Exam).filter_by(id=exam_id).with_for_update().one_or_none()
        if not exam:
            raise HTTPException(status_code=404, detail="Exam not found.")
        if not _can_manage_posted_exam(current_user, exam):
            raise HTTPException(
                status_code=403,
                detail="Only the Program Head responsible for this exam or the Academic Head can request a replacement.",
            )
        window = _require_open_assignment(exam)
        if (exam.proctor_id, exam.timeslot_id, exam.room_id) != (
            body.expected_proctor_id, body.expected_timeslot_id, body.expected_room_id,
        ):
            raise HTTPException(status_code=409, detail="This assignment has changed. Refresh Proctor Monitoring and review it before trying again.")
        slot = exam.timeslot

        old_proctor_id = exam.proctor_id
        candidates = _replacement_candidates(db, exam, body.replacement_proctor_id)
        candidate_ids = [row["id"] for row in candidates]
        daily_load = dict(
            db.query(models.Exam.proctor_id, func.count(models.Exam.id))
            .join(models.Timeslot)
            .filter(models.Exam.proctor_id.in_(candidate_ids), models.Timeslot.date == slot.date)
            .group_by(models.Exam.proctor_id)
            .all()
        ) if candidate_ids else {}

        # Prefer a replacement with fewer duties that day. Recheck under the
        # same proctor row lock used by the manual exam editor.
        replacement = None
        candidates.sort(key=lambda row: (daily_load.get(row["id"], 0), row["name"].casefold(), row["id"]))
        for candidate in candidates:
            locked = (
                db.query(models.Proctor).filter_by(id=candidate["id"])
                .populate_existing().with_for_update().one_or_none()
            )
            if locked and _replacement_candidates(db, exam, locked.id):
                replacement = locked
                break

        if replacement is None:
            if body.replacement_proctor_id is not None:
                raise HTTPException(status_code=409, detail="This proctor is no longer eligible. Refresh the available replacements.")
            raise HTTPException(
                status_code=409,
                detail="No eligible replacement is available at this time. Use Edit in Generated Schedules to review the manual options.",
            )
        if _get_current_schedule_datetime() >= window[1]:
            raise HTTPException(status_code=409, detail="This exam has already ended.")

        replacement_id, replacement_name = replacement.id, replacement.name
        db.query(models.ProctorAbsenceRequest).filter_by(
            exam_id=exam_id, proctor_id=old_proctor_id, timeslot_id=exam.timeslot_id,
            room_id=exam.room_id, status="pending",
        ).update({"status": "resolved"})
        exam.proctor_id = replacement_id
        exam.proctor_attendance = "pending"
        course_name = exam.subject.name if exam.subject else "Exam"
        section_name = exam.section.name if exam.section else "the assigned section"
        duty = f"{course_name} for {section_name} on {slot.date:%B %d, %Y} from {slot.start_time:%I:%M %p} to {slot.end_time:%I:%M %p} in {exam.room.name}."
        recipients = db.query(models.User.id, models.User.proctor_id).filter(
            models.User.role.in_(["proctor", "teacher"]),
            models.User.proctor_id.in_([old_proctor_id, replacement_id]),
        ).all()
        for user_id, proctor_id in recipients:
            message = f"New proctoring assignment: {duty}" if proctor_id == replacement_id else f"Your proctoring assignment was reassigned: {duty}"
            db.add(models.Notification(user_id=user_id, message=message, type="proctor_reassignment", related_id=exam_id))
        db.add(models.ActivityLog(
            user_id=current_user.id,
            action="PROCTOR_REASSIGNED",
            details=f"Exam {exam_id}: proctor changed from {old_proctor_id} to {replacement_id}",
        ))
        db.commit()
        cache.invalidate_exam_schedules()
        return {
            "message": f"Assigned {replacement_name} as the replacement proctor.",
            "proctor_id": replacement_id,
            "proctor_name": replacement_name,
        }
    except Exception:
        db.rollback()
        raise
    finally:
        lease.release()


@router.get("/monitoring")
def get_proctor_monitoring(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(["admin"]))
):
    cached = cache.get(PROCTOR_MONITORING_CACHE_KEY)
    if cached is not None:
        return cached

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
    proofs = attendance_proof_metadata(db, exams)
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
        window = _get_timeslot_window(timeslot)
        reassign_until = window[1].isoformat() if e.room_id and window and timeslot.start_time < timeslot.end_time else None
        course_map[course_name].append({
            "exam_id": e.id,
            "department_code": _exam_program_department(e),
            "room_id": e.room_id,
            "timeslot_id": e.timeslot_id,
            "reassign_until": reassign_until,
            "proctor_id": e.proctor_id,
            "proctor_name": proctor_name,
            "subject_code": e.subject.code if e.subject else "-",
            "subject_name": e.subject.name if e.subject else "-",
            "section_name": e.section.name if e.section else "-",
            "year_level": e.year_level.name if e.year_level else "-",
            "semester": e.semester,
            "term": e.term or "Midterm",
            "exam_date": full_date,
            "start_time": start_time,
            "end_time": end_time,
            "room": e.room.name if e.room else "-",
            "attendance_status": "attended" if e.proctor_attendance in ["attended", "confirmed"] else (e.proctor_attendance or "pending"),
            "attendance_proof": proofs.get(e.id),
        })
    result = [{"course_name": course, "exams": entries} for course, entries in sorted(course_map.items())]
    cache.set(PROCTOR_MONITORING_CACHE_KEY, result, TTL_MONITORING)
    return result

# ----- NEW ENDPOINTS for missing schedules, exclude, remind -----
@router.get("/missing-schedules")
def get_missing_schedules(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_role(["admin"]))
):
    cached = cache.get("proctors:missing_schedules")
    if cached is not None:
        return cached

    proctors = db.query(models.Proctor).all()
    counts = dict(
        db.query(models.TeacherSchedule.teacher_id, func.count(models.TeacherSchedule.id))
        .filter(models.TeacherSchedule.teacher_id.isnot(None))
        .group_by(models.TeacherSchedule.teacher_id)
        .all()
    )
    result = []
    for p in proctors:
        if p.teacher_id:
            sched_count = counts.get(p.teacher_id, 0)
            if sched_count == 0:
                result.append({"id": p.id, "name": p.name, "teacher_id": p.teacher_id, "excluded": p.exclude_from_scheduling})
    cache.set("proctors:missing_schedules", result, TTL_PROCTORS)
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
    # ── invalidate ──────────────────────────────────────────────────
    cache.delete("proctors:all")
    return {"message": "Toggled", "excluded": proctor.exclude_from_scheduling}

@router.post("/{id}/send-reminder")
def send_reminder(id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["admin"]))):
    proctor = db.query(models.Proctor).get(id)
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")

    account_links = [models.User.proctor_id == proctor.id]
    if proctor.teacher_id is not None:
        # Older proctor accounts may only have the teacher link. Never fall
        # back to an account explicitly linked to a different proctor.
        account_links.append(and_(
            models.User.proctor_id.is_(None),
            models.User.teacher_id == proctor.teacher_id,
        ))
    recipients = db.query(models.User).filter(
        models.User.role.in_(["proctor", "teacher"]),
        or_(*account_links),
    ).all()
    if not recipients:
        raise HTTPException(
            status_code=409,
            detail="This proctor has no linked login account. Create or link their proctor account before sending a reminder.",
        )

    db.add_all([
        models.Notification(
            user_id=recipient.id,
            message="Reminder: Please review your uploaded teaching schedule in My Schedule.",
            type="reminder",
            related_id=proctor.id,
            is_read=False,
        )
        for recipient in recipients
    ])
    db.commit()
    log_activity(db, current_user.id, "PROCTOR_REMINDER_SENT", f"Proctor: {proctor.name}")
    return {"message": f"Review reminder sent to {proctor.name}'s notifications."}

@router.delete("/{proctor_id}/schedule")
def delete_proctor_schedule(proctor_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_role(["admin"]))):
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot delete schedules while schedule generation is ongoing")
        
    proctor = db.query(models.Proctor).filter_by(id=proctor_id).with_for_update().one_or_none()
    if not proctor:
        raise HTTPException(status_code=404, detail="Proctor not found")
        
    if not proctor.teacher_id:
        raise HTTPException(status_code=400, detail="Proctor not linked to teacher account")
        
    count = db.query(models.TeacherSchedule).filter(models.TeacherSchedule.teacher_id == proctor.teacher_id).delete()
    proctor.translated_schedule = None
    db.query(models.ProctorScheduleReview).filter_by(proctor_id=proctor.id).delete()
    db.commit()
    
    # Notify Admin that proctor deleted their schedule
    admin_user = db.query(models.User).filter(models.User.role == "program_head").first()
    notif = models.Notification(
        user_id=admin_user.id if admin_user else None,
        message=f"Proctor {proctor.name} has deleted their teaching schedule.",
        type="info",
        related_id=proctor.id
    )
    db.add(notif)
    db.commit()
    
    log_activity(db, current_user.id, "PROCTOR_SCHEDULE_DELETE", f"Proctor: {proctor.name}, entries deleted: {count}")
    # ── invalidate proctor schedule caches ───────────────────────────
    cache.invalidate_proctors()
    return {"message": f"Successfully deleted teaching schedule ({count} entries)."}
