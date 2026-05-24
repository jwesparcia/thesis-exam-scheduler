from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session, joinedload
from database import get_db
from models import Exam, Subject, Section, Room, Timeslot, Course, YearLevel, Teacher, User, Notification
from room_data import AVAILABLE_EXAM_ROOMS, get_room_names_for_department
from utils.scheduler import generate_exam_schedule
from datetime import datetime
from threading import Lock
from typing import Optional
from .auth import get_current_user, require_role
from utils.logging import log_activity

router = APIRouter(prefix="/exams", tags=["Exams"])

_generation_progress = {}
_generation_progress_lock = Lock()


def _progress_key(current_user: User, job_id: str | None = None):
    return str(job_id or current_user.id)


def _set_generation_progress(key, status, percent, phase, detail=""):
    with _generation_progress_lock:
        _generation_progress[key] = {
            "status": status,
            "percent": max(0, min(100, int(percent))),
            "phase": phase,
            "detail": detail,
            "updated_at": datetime.utcnow().isoformat() + "Z",
        }


def _get_generation_progress(key):
    with _generation_progress_lock:
        return _generation_progress.get(key, {
            "status": "idle",
            "percent": 0,
            "phase": "Idle",
            "detail": "",
            "updated_at": None,
        })


def _format_exam_for_room_status(exam: Exam):
    subject = exam.subject
    section = exam.section
    course = exam.course
    year = exam.year_level
    timeslot = exam.timeslot
    room = exam.room

    if timeslot:
        exam_date = timeslot.date.strftime("%A, %B %d, %Y")
        start_time = timeslot.start_time.strftime("%I:%M %p")
        end_time = timeslot.end_time.strftime("%I:%M %p")
    else:
        exam_date = "-"
        start_time = "-"
        end_time = "-"

    return {
        "id": exam.id,
        "subject_code": subject.code if subject else "-",
        "subject_name": subject.name if subject else "-",
        "section_name": section.name if section else "-",
        "course_name": course.name if course else "-",
        "department": course.category if course else "-",
        "year_level": year.name if year else "-",
        "semester": exam.semester,
        "status": exam.status,
        "exam_date": exam_date,
        "start_time": start_time,
        "end_time": end_time,
        "room_id": exam.room_id,
        "room": room.name if room else None,
    }

@router.get("/")
def get_exams(
    status: str = Query(None, description="Filter by status (draft or posted)"),
    section_name: str = Query(None, description="Filter by section name (e.g., BSIT-1A)"),
    course_id: int = Query(None, description="Filter by course ID"),
    year_level_id: int = Query(None, description="Filter by year level ID"),
    semester: int = Query(None, description="Filter by semester"),
    proctor_id: int = Query(None, description="Filter by proctor (teacher) ID"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Fetch exams with optional filters. Students can filter by their section.
    Returns joined data so students can see full details.
    """
    print(f"[DEBUG] get_exams called filters: status={status}, section={section_name}, course={course_id}, year={year_level_id}, sem={semester}")
    
    query = db.query(Exam).options(
        joinedload(Exam.subject),
        joinedload(Exam.section),
        joinedload(Exam.room),
        joinedload(Exam.timeslot),
        joinedload(Exam.course),
        joinedload(Exam.year_level),
        joinedload(Exam.proctor),
    )

    if status:
        query = query.filter(Exam.status == status)
    
    if section_name:
        # Use has() to filter by relationship without creating duplicates
        query = query.filter(Exam.section.has(name=section_name))

    if course_id:
        query = query.filter(Exam.course_id == course_id)
    
    if year_level_id:
        query = query.filter(Exam.year_level_id == year_level_id)
        
    if semester:
        query = query.filter(Exam.semester == semester)

    if proctor_id:
        query = query.filter(Exam.proctor_id == proctor_id)

    # Join with Timeslot to order by date/time
    query = query.join(Exam.timeslot).order_by(Timeslot.date, Timeslot.start_time)

    exams = query.all()
    print(f"[DEBUG] Found {len(exams)} exams")
    
    if not exams:
        return []

    result = []
    for e in exams:
        subject = e.subject
        section = e.section
        room = e.room
        timeslot = e.timeslot
        course = e.course
        year = e.year_level
        proctor = e.proctor

        # Format date with day name to match scheduler format
        if timeslot:
            day_name = timeslot.date.strftime("%A")
            date_str = timeslot.date.strftime("%B %d, %Y")
            full_date = f"{day_name}, {date_str}"
        else:
            full_date = "-"

        proctor_name = proctor.name if proctor else "Unassigned"

        result.append({
            "id": e.id,
            "subject_code": subject.code if subject else "-",
            "subject_name": subject.name if subject else "-",
            "exam_type": subject.exam_type if subject else "-",
            "category": subject.category if subject else "-",
            "section_name": section.name if section else "-",
            "course_name": course.name if course else "-",
            "year_level": year.name if year else "-",
            "semester": e.semester,
            "exam_date": full_date,
            "start_time": timeslot.start_time.strftime("%I:%M %p") if timeslot else "-",
            "end_time": timeslot.end_time.strftime("%I:%M %p") if timeslot else "-",
            "room": room.name if room else "-",
            "proctor": proctor_name,
            "proctor_name": proctor_name,
            "proctor_attendance": e.proctor_attendance or "pending",
        })

    return result

@router.get("/subjects")
def get_department_subjects(
    department: str = Query("College", description="Department category (e.g., College or SHS)"),
    semester: int = Query(1, description="Semester (1 or 2)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get all unique written subject names for a specific department and semester.
    """
    subjects = db.query(Subject.name).join(Course).filter(
        Course.category == department,
        Subject.exam_type == "written",
        Subject.semester == semester
    ).distinct().order_by(Subject.name).all()
    
    return [s[0] for s in subjects if s[0]]


@router.get("/rooms/status")
def get_room_status(
    department: str = Query("College", description="College, SHS, or All"),
    semester: Optional[int] = Query(None, description="Optional semester filter"),
    status: str = Query("all", description="draft, posted, or all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    selected_department = department if department in ["College", "SHS"] else "All"
    room_meta = {room["name"]: room for room in AVAILABLE_EXAM_ROOMS}
    room_names = (
        get_room_names_for_department(selected_department)
        if selected_department != "All"
        else [room["name"] for room in AVAILABLE_EXAM_ROOMS]
    )
    allowed_room_names = set(room_names)

    rooms = db.query(Room).filter(Room.name.in_(room_names)).order_by(Room.name).all()

    exam_query = db.query(Exam).options(
        joinedload(Exam.subject),
        joinedload(Exam.section),
        joinedload(Exam.course),
        joinedload(Exam.year_level),
        joinedload(Exam.timeslot),
        joinedload(Exam.room),
    ).join(Course, Exam.course_id == Course.id)

    if selected_department != "All":
        exam_query = exam_query.filter(Course.category == selected_department)
    if semester:
        exam_query = exam_query.filter(Exam.semester == semester)
    if status in ["draft", "posted"]:
        exam_query = exam_query.filter(Exam.status == status)

    exams = exam_query.all()

    room_bookings = {room.id: [] for room in rooms}
    unassigned_exams = []
    wrong_building_exams = []
    conflict_map = {}

    for exam in exams:
        if not exam.room_id or not exam.room:
            unassigned_exams.append(exam)
            continue

        if selected_department != "All" and exam.room.name not in allowed_room_names:
            wrong_building_exams.append(exam)

        if exam.room_id in room_bookings:
            room_bookings[exam.room_id].append(exam)

        if exam.timeslot_id:
            conflict_key = (exam.room_id, exam.timeslot_id)
            conflict_map.setdefault(conflict_key, []).append(exam)

    conflict_exam_ids = set()
    conflicts = []
    for conflict_exams in conflict_map.values():
        if len(conflict_exams) <= 1:
            continue
        for exam in conflict_exams:
            conflict_exam_ids.add(exam.id)
        first_exam = conflict_exams[0]
        conflicts.append({
            "room": first_exam.room.name if first_exam.room else "-",
            "exam_date": first_exam.timeslot.date.strftime("%A, %B %d, %Y") if first_exam.timeslot else "-",
            "start_time": first_exam.timeslot.start_time.strftime("%I:%M %p") if first_exam.timeslot else "-",
            "end_time": first_exam.timeslot.end_time.strftime("%I:%M %p") if first_exam.timeslot else "-",
            "exams": [_format_exam_for_room_status(exam) for exam in conflict_exams],
        })

    room_rows = []
    for room in rooms:
        bookings = room_bookings.get(room.id, [])
        has_conflict = any(exam.id in conflict_exam_ids for exam in bookings)
        meta = room_meta.get(room.name, {})
        room_rows.append({
            "id": room.id,
            "name": room.name,
            "building": meta.get("building", room.name[:1]),
            "department": meta.get("department", "Unknown"),
            "status": "conflict" if has_conflict else "in_use" if bookings else "available",
            "booking_count": len(bookings),
            "draft_count": sum(1 for exam in bookings if exam.status == "draft"),
            "posted_count": sum(1 for exam in bookings if exam.status == "posted"),
            "bookings": [_format_exam_for_room_status(exam) for exam in sorted(
                bookings,
                key=lambda e: (
                    e.timeslot.date if e.timeslot else datetime.max.date(),
                    e.timeslot.start_time if e.timeslot else datetime.max.time(),
                    e.section.name if e.section else "",
                )
            )],
        })

    return {
        "filters": {
            "department": selected_department,
            "semester": semester,
            "status": status,
        },
        "summary": {
            "total_rooms": len(rooms),
            "in_use_rooms": sum(1 for room in room_rows if room["status"] in ["in_use", "conflict"]),
            "available_rooms": sum(1 for room in room_rows if room["status"] == "available"),
            "conflict_rooms": sum(1 for room in room_rows if room["status"] == "conflict"),
            "total_exams": len(exams),
            "assigned_exams": sum(1 for exam in exams if exam.room_id and exam.room),
            "unassigned_exams": len(unassigned_exams),
            "wrong_building_exams": len(wrong_building_exams),
            "conflicts": len(conflicts),
        },
        "rooms": room_rows,
        "unassigned_exams": [_format_exam_for_room_status(exam) for exam in unassigned_exams],
        "wrong_building_exams": [_format_exam_for_room_status(exam) for exam in wrong_building_exams],
        "conflicts": conflicts,
    }


@router.get("/generate/progress")
def get_generate_progress(
    job_id: str = Query(None, description="Generation job id returned or sent with /exams/generate"),
    current_user: User = Depends(require_role(["admin"]))
):
    return _get_generation_progress(_progress_key(current_user, job_id))

@router.post("/generate")
def generate_schedule(
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """
    Trigger the automatic scheduling for ALL courses based on distribution rules.
    Optionally accepts start_date (YYYY-MM-DD), end_date, department, semester, and excluded_subjects in the body.
    """
    try:
        payload_data = payload if payload else {}
        job_id = _progress_key(current_user, payload_data.get("job_id"))
        _set_generation_progress(job_id, "running", 1, "Preparing schedule", "Starting schedule generation")

        start_date = None
        end_date = None
        
        department = payload_data.get("department", "College")
        semester = payload_data.get("semester", 1)
        excluded_subjects = payload_data.get("excluded_subjects", [])
        
        start_date_str = payload_data.get("start_date")
        if start_date_str:
            start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        end_date_str = payload_data.get("end_date")
        if end_date_str:
            end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
        
        result = generate_exam_schedule(
            db, 
            start_date=start_date, 
            end_date=end_date, 
            department=department, 
            semester=semester,
            excluded_subjects=excluded_subjects,
            progress_callback=lambda progress: _set_generation_progress(
                job_id,
                "running",
                progress.get("percent", 0),
                progress.get("phase", "Generating schedule"),
                progress.get("detail", "")
            )
        )
        
        total = result["total_exams"]
        assigned = result["assigned_proctors"]
        unassigned = result["unassigned"]
        unassigned_rooms = result.get("unassigned_rooms", 0)
        
        message = f"Schedule generated! {total} exams created for {department}. "
        if assigned > 0:
            message += f"{assigned} exams assigned a proctor. "
        if unassigned > 0:
            message += f"{unassigned} exams have no proctor due to insufficient availability or limits."
        else:
            message += "All exams have a proctor assigned."
        if unassigned_rooms > 0:
            message += f" {unassigned_rooms} exams still need rooms."
        
        log_activity(db, current_user.id, "EXAM_GENERATE", f"Dept: {department}, Sem: {semester}", None)
        _set_generation_progress(job_id, "completed", 100, "Schedule generated", message)
        return {"message": message, "job_id": job_id}
    except Exception as e:
        if "job_id" in locals():
            current_progress = _get_generation_progress(job_id)
            _set_generation_progress(
                job_id,
                "failed",
                current_progress.get("percent", 0),
                "Generation failed",
                str(e),
            )
        raise HTTPException(status_code=500, detail=str(e))
        
@router.post("/post")
def post_exams(
    course_id: Optional[int] = Query(None, description="Course ID to post exams for"),
    year_level_id: Optional[int] = Query(None, description="Year level ID to post exams for"),
    semester: int = Query(..., description="Semester to post exams for"),
    department: Optional[str] = Query(None, description="Department (College or SHS)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """
    Post draft exams with optional filters (course, year, department).
    If no course or year is specified, posts all drafts for the given semester and department.
    """
    query = db.query(Exam).options(
        joinedload(Exam.subject),
        joinedload(Exam.section),
        joinedload(Exam.timeslot)
    ).filter(
        Exam.status == "draft",
        Exam.semester == semester
    )
    
    if course_id:
        query = query.filter(Exam.course_id == course_id)
    if year_level_id:
        query = query.filter(Exam.year_level_id == year_level_id)
    if department:
        query = query.join(Course).filter(Course.category == department)
        
    latest_drafts = query.all()
    
    if not latest_drafts:
        raise HTTPException(status_code=404, detail="No draft exams found to post")

    for exam in latest_drafts:
        exam.status = "posted"
        if exam.proctor_id:
            proctor_user = db.query(User).filter(User.proctor_id == exam.proctor_id).first()
            if proctor_user:
                sub_code = exam.subject.code if exam.subject else "-"
                sub_name = exam.subject.name if exam.subject else "-"
                sec_name = exam.section.name if exam.section else "-"
                
                date_str = ""
                time_str = ""
                if exam.timeslot:
                    day_name = exam.timeslot.date.strftime("%A")
                    formatted_date = exam.timeslot.date.strftime("%B %d, %Y")
                    date_str = f" on {day_name}, {formatted_date}"
                    time_str = f" at {exam.timeslot.start_time.strftime('%I:%M %p')} - {exam.timeslot.end_time.strftime('%I:%M %p')}"
                
                msg = f"You have been assigned to proctor {sub_name} ({sub_code}) for section {sec_name}{date_str}{time_str}."
                notification = Notification(
                    recipient_type="proctor",
                    recipient_id=str(proctor_user.id),
                    message=msg,
                    type="info",
                    related_id=exam.id
                )
                db.add(notification)
                
    db.commit()

    log_activity(db, current_user.id, "EXAM_POST", f"Course: {course_id}, Year: {year_level_id}, Sem: {semester}, Dept: {department}")
    return {"message": f"✅ Successfully posted {len(latest_drafts)} exams."}

@router.delete("/clear")
def clear_exams(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    """
    Delete all exams (for testing reset).
    """
    count = db.query(Exam).delete()
    db.commit()
    log_activity(db, current_user.id, "EXAM_CLEAR", f"Deleted {count} exams")
    return {"message": f"🧹 Deleted {count} exams."}
