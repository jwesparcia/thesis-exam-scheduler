from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from core import get_db, cache
from model import ReschedulingRequest, Exam, Notification, User, Timeslot, Room, Proctor
from schema import ReschedulingRequestCreate, ReschedulingRequest as ReschedulingRequestSchema, ReschedulingRequestUpdate
from datetime import datetime, time, timedelta
from .auth import get_current_user, require_role
from utils.logging import log_activity

router = APIRouter(prefix="/rescheduling", tags=["Rescheduling Requests"])


def is_consultation_request(db: Session, request: ReschedulingRequest) -> bool:
    student = db.query(User).filter(User.email == request.school_email).first()
    return bool(
        student
        and student.student_type == "irregular"
        and request.preferred_start_time
        and request.preferred_start_time >= time(17, 0)
    )

@router.post("/submit")
def submit_rescheduling_request(request: ReschedulingRequestCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == "student" and current_user.student_type != "irregular" and current_user.section_name != request.section_name:
        raise HTTPException(status_code=403, detail="Unauthorized: You can only submit requests for your own section")
    exam = db.query(Exam).filter(Exam.id == request.exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    # Only enforce section match for regular students; irregular students take exams across sections
    if current_user.student_type != "irregular" and request.section_name and request.section_name != exam.section.name:
        raise HTTPException(status_code=403, detail="Unauthorized: Section mismatch")
    existing = db.query(ReschedulingRequest).filter(
        ReschedulingRequest.exam_id == request.exam_id,
        ReschedulingRequest.status == "pending"
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="A pending request already exists for this exam")
    if request.requested_mode == "online":
        request.requested_room = None

    def parse_time(s):
        if not s:
            return None
        s = s.strip()
        for fmt in ("%H:%M:%S", "%H:%M", "%I:%M %p", "%I:%M%p", "%I:%M %P", "%I:%M%P"):
            try:
                return datetime.strptime(s, fmt).time()
            except:
                pass
        raise HTTPException(status_code=400, detail=f"Invalid time format: {s}")

    orig_exam_date = datetime.strptime(request.original_exam_date, "%Y-%m-%d").date()
    orig_start = parse_time(request.original_start_time)
    orig_end = parse_time(request.original_end_time)
    pref_date = datetime.strptime(request.preferred_date, "%Y-%m-%d").date() if request.preferred_date else None
    pref_start = parse_time(request.preferred_start_time) if request.preferred_start_time else None
    pref_end = parse_time(request.preferred_end_time) if request.preferred_end_time else None

    # --- Validations ---
    if not request.detailed_explanation or not request.detailed_explanation.strip():
        raise HTTPException(status_code=400, detail="Detailed explanation cannot be empty")
    if orig_start and orig_end and orig_start >= orig_end:
        raise HTTPException(status_code=400, detail="Original start time must be before original end time")
    if pref_start and pref_end and pref_start >= pref_end:
        raise HTTPException(status_code=400, detail="Preferred start time must be before preferred end time")

    db_request = ReschedulingRequest(
        exam_id=request.exam_id,
        section_name=request.section_name,
        student_name=request.student_name,
        student_id=request.student_id,
        program=request.program,
        school_email=request.school_email,
        course_code=request.course_code,
        course_name=request.course_name,
        original_exam_date=orig_exam_date,
        original_start_time=orig_start,
        original_end_time=orig_end,
        exam_type=request.exam_type,
        reason_type=request.reason_type,
        detailed_explanation=request.detailed_explanation,
        supporting_file=request.supporting_file,
        requested_mode=request.requested_mode,
        preferred_date=pref_date,
        preferred_start_time=pref_start,
        preferred_end_time=pref_end,
        acknowledged=request.acknowledged
    )
    db.add(db_request)
    db.commit()
    db.refresh(db_request)

    # Notify Admin (role "program_head")
    admin_user = db.query(User).filter(User.role == "program_head").first()
    admin_user_id = admin_user.id if admin_user else None

    notification = Notification(
        user_id=admin_user_id,
        message=f"New rescheduling request from {request.student_name} ({request.section_name}) for {request.course_name}",
        type="info",
        related_id=db_request.id
    )
    db.add(notification)
    db.commit()
    log_activity(db, current_user.id, "RESCHEDULING_SUBMIT", f"Exam ID: {request.exam_id}, Student: {request.student_name}")
    return {"message": "Rescheduling request submitted successfully", "id": db_request.id}

@router.get("/pending/count")
def get_pending_rescheduling_count(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    count = db.query(ReschedulingRequest).filter(ReschedulingRequest.status == "pending").count()
    return {"count": count}

@router.get("/pending")
def get_pending_requests(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    requests = db.query(ReschedulingRequest).options(
        joinedload(ReschedulingRequest.exam)
    ).filter(ReschedulingRequest.status == "pending").all()

    result = []
    for req in requests:
        result.append({
            "id": req.id,
            "exam_id": req.exam_id,
            "section_name": req.section_name,
            "student_name": req.student_name,
            "course_name": req.course_name,
            "original_exam_date": req.original_exam_date.strftime("%A, %B %d, %Y") if req.original_exam_date else "Unknown",
            "original_time": f"{req.original_start_time.strftime('%I:%M %p')} - {req.original_end_time.strftime('%I:%M %p')}" if req.original_start_time and req.original_end_time else "Unknown",
            "exam_type": req.exam_type,
            "reason_type": req.reason_type,
            "detailed_explanation": req.detailed_explanation,
            "supporting_file": req.supporting_file,
            "requested_mode": req.requested_mode,
            "preferred_date": req.preferred_date.strftime("%Y-%m-%d") if req.preferred_date else None,
            "preferred_time": f"{req.preferred_start_time.strftime('%I:%M %p')} - {req.preferred_end_time.strftime('%I:%M %p')}" if req.preferred_start_time and req.preferred_end_time else None,
            "consultation_area": is_consultation_request(db, req),
            "acknowledged": req.acknowledged
        })
    return result

@router.get("/history")
def get_rescheduling_history(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    requests = db.query(ReschedulingRequest).options(
        joinedload(ReschedulingRequest.exam)
    ).filter(ReschedulingRequest.status.in_(["approved", "rejected"])).order_by(ReschedulingRequest.id.desc()).all()

    result = []
    for req in requests:
        result.append({
            "id": req.id,
            "exam_id": req.exam_id,
            "section_name": req.section_name,
            "student_name": req.student_name,
            "course_name": req.course_name,
            "original_exam_date": req.original_exam_date.strftime("%A, %B %d, %Y") if req.original_exam_date else "Unknown",
            "original_time": f"{req.original_start_time.strftime('%I:%M %p')} - {req.original_end_time.strftime('%I:%M %p')}" if req.original_start_time and req.original_end_time else "Unknown",
            "exam_type": req.exam_type,
            "reason_type": req.reason_type,
            "detailed_explanation": req.detailed_explanation,
            "supporting_file": req.supporting_file,
            "requested_mode": req.requested_mode,
            "preferred_date": req.preferred_date.strftime("%Y-%m-%d") if req.preferred_date else None,
            "preferred_time": f"{req.preferred_start_time.strftime('%I:%M %p')} - {req.preferred_end_time.strftime('%I:%M %p')}" if req.preferred_start_time and req.preferred_end_time else None,
            "status": req.status,
            "reviewer_comments": req.reviewer_comments,
            "room": (req.rescheduled_exam or req.exam).room.name if (req.rescheduled_exam or req.exam) and (req.rescheduled_exam or req.exam).room else None,
            "proctor": (req.rescheduled_exam or req.exam).proctor.name if (req.rescheduled_exam or req.exam) and (req.rescheduled_exam or req.exam).proctor else None,
        })
    return result

@router.put("/{request_id}/review")
def review_request(request_id: int, update: ReschedulingRequestUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    from .exams import is_generation_ongoing
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot review rescheduling requests while schedule generation is ongoing")
    request = db.query(ReschedulingRequest).filter(ReschedulingRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    request.status = update.status
    request.reviewer_comments = update.reviewer_comments

    if update.status == "approved":
        exam = request.exam
        student = db.query(User).filter(User.email == request.school_email).first()
        irregular_request = bool(student and student.student_type == "irregular")
        consultation_request = is_consultation_request(db, request)
        if irregular_request and not consultation_request and not update.room_id:
            raise HTTPException(status_code=400, detail="Assign a room before approving this request")
        if consultation_request:
            if not (request.preferred_date and request.preferred_start_time and request.preferred_end_time):
                raise HTTPException(status_code=400, detail="A preferred date and time are required for Consultation Area scheduling")
            if request.preferred_start_time < time(17, 0):
                raise HTTPException(status_code=400, detail="Consultation Area exams must start at or after 5:00 PM")
            duration_minutes = exam.subject.duration_minutes if exam and exam.subject and exam.subject.duration_minutes else 75
            expected_end = (
                datetime.combine(datetime.today().date(), request.preferred_start_time)
                + timedelta(minutes=duration_minutes)
            ).time()
            if request.preferred_end_time != expected_end:
                raise HTTPException(status_code=400, detail="Consultation Area exam time must match the configured exam duration")
            if not update.proctor_id:
                raise HTTPException(status_code=400, detail="Assign a proctor before approving this request")
            proctor = db.query(Proctor).filter(Proctor.id == update.proctor_id).first()
            if not proctor:
                raise HTTPException(status_code=404, detail="Proctor not found")

        if exam and request.preferred_date and request.preferred_start_time and request.preferred_end_time:
            ts = db.query(Timeslot).filter(
                Timeslot.date == request.preferred_date,
                Timeslot.start_time == request.preferred_start_time,
                Timeslot.end_time == request.preferred_end_time
            ).first()
            if not ts:
                ts = Timeslot(
                    date=request.preferred_date,
                    start_time=request.preferred_start_time,
                    end_time=request.preferred_end_time
                )
                db.add(ts)
                db.flush()

            if irregular_request:
                assigned_room_id = update.room_id
                if consultation_request:
                    consultation_room = db.query(Room).filter(Room.name == "Consultation Area").first()
                    if not consultation_room:
                        consultation_room = Room(name="Consultation Area", building="Consultation Area", capacity=1)
                        db.add(consultation_room)
                        db.flush()
                    assigned_room_id = consultation_room.id
                assigned_exam = Exam(
                    subject_id=exam.subject_id,
                    section_id=exam.section_id,
                    room_id=assigned_room_id,
                    timeslot_id=ts.id,
                    course_id=exam.course_id,
                    year_level_id=exam.year_level_id,
                    semester=exam.semester,
                    term=exam.term,
                    status=exam.status,
                    proctor_id=update.proctor_id or exam.proctor_id,
                )
                db.add(assigned_exam)
                db.flush()
                request.rescheduled_exam_id = assigned_exam.id
            elif update.room_id is not None:
                # Irregular students can join a room that already has an exam at this time.
                exam.room_id = update.room_id
            else:
                exam.room_id = None
            if not irregular_request:
                exam.timeslot_id = ts.id

    # Notify the student requesting the reschedule
    student_user = db.query(User).filter(User.email == request.school_email).first()
    student_user_id = student_user.id if student_user else None

    notification = Notification(
        user_id=student_user_id,
        message=f"Your rescheduling request for {request.course_name} has been {update.status}.",
        type="success" if update.status == "approved" else "error",
        related_id=request.id
    )
    db.add(notification)
    db.commit()
    if update.status == "approved":
        cache.invalidate_exam_schedules()
    log_activity(db, current_user.id, "RESCHEDULING_REVIEW", f"Request ID: {request_id}, Status: {update.status}")
    return {"message": f"Request {update.status}"}

@router.get("/{request_id}/available-rooms")
def get_available_rooms_for_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """Return rooms that HAVE exams scheduled during the student's preferred timeslot.
    For irregular-student rescheduling, the admin must place the student into an
    existing exam session, so only rooms with active exams at that time are shown.
    """
    request = db.query(ReschedulingRequest).filter(ReschedulingRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    # If no preferred timeslot specified, return empty list (admin cannot proceed without a time)
    if not (request.preferred_date and request.preferred_start_time and request.preferred_end_time):
        return []

    # Find the timeslot matching the preferred schedule
    ts = db.query(Timeslot).filter(
        Timeslot.date == request.preferred_date,
        Timeslot.start_time == request.preferred_start_time,
        Timeslot.end_time == request.preferred_end_time
    ).first()

    exams_at_timeslot = []
    if ts:
        exams_at_timeslot = db.query(Exam).filter(
            Exam.timeslot_id == ts.id,
            Exam.room_id.isnot(None),
            Exam.id != request.exam_id
        ).join(Room, Exam.room_id == Room.id).filter(Room.name != "Consultation Area").all()

    # Collect unique room IDs with active exams, preserving subject info for display
    seen_room_ids = set()
    result = []
    for exam_entry in exams_at_timeslot:
        if exam_entry.room_id in seen_room_ids:
            continue
        seen_room_ids.add(exam_entry.room_id)
        room = db.query(Room).filter(Room.id == exam_entry.room_id).first()
        if room:
            result.append({
                "id": room.id,
                "name": room.name,
                "building": room.building,
                "capacity": room.capacity,
                "exam_subject": exam_entry.subject.name if exam_entry.subject else None
            })

    if result:
        return sorted(result, key=lambda r: r["name"])

    student = db.query(User).filter(User.email == request.school_email).first()
    if not student or student.student_type != "irregular":
        return []

    occupied_room_ids = {
        exam.room_id
        for exam in db.query(Exam).join(Timeslot).filter(
            Timeslot.date == request.preferred_date,
            Timeslot.start_time < request.preferred_end_time,
            Timeslot.end_time > request.preferred_start_time,
            Exam.room_id.isnot(None),
            Exam.id != request.exam_id,
        ).all()
    }
    free_rooms = db.query(Room).filter(Room.name != "Consultation Area").all()
    return sorted([
        {
            "id": room.id,
            "name": room.name,
            "building": room.building,
            "capacity": room.capacity,
            "exam_subject": None,
        }
        for room in free_rooms
        if room.id not in occupied_room_ids
    ], key=lambda room: room["name"])


@router.get("/my-requests/{section_name}")
def get_my_requests(section_name: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == "student" and current_user.section_name != section_name:
        raise HTTPException(status_code=403, detail="Unauthorized: Access denied")
    requests = db.query(ReschedulingRequest).filter(ReschedulingRequest.section_name == section_name).all()
    return [ReschedulingRequestSchema.from_orm(req) for req in requests]
