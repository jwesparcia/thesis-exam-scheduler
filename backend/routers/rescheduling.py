from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from core import get_db, cache
from model import ReschedulingRequest, Exam, Notification, User, Timeslot, Room, Proctor, TeacherSchedule, ProctorAvailability
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


def _exam_covers_request(exam: Exam, request: ReschedulingRequest) -> bool:
    return bool(
        exam.timeslot
        and exam.timeslot.date == request.preferred_date
        and exam.timeslot.start_time <= request.preferred_start_time
        and exam.timeslot.end_time >= request.preferred_end_time
    )


def _available_daytime_assignments(db: Session, request: ReschedulingRequest):
    peer_requests = db.query(ReschedulingRequest).join(
        User, User.email == ReschedulingRequest.school_email
    ).filter(
        ReschedulingRequest.status == "pending",
        ReschedulingRequest.id != request.id,
        ReschedulingRequest.school_email != request.school_email,
        ReschedulingRequest.preferred_date == request.preferred_date,
        ReschedulingRequest.preferred_start_time == request.preferred_start_time,
        ReschedulingRequest.preferred_end_time == request.preferred_end_time,
        User.student_type == "irregular",
    ).order_by(ReschedulingRequest.id).all()
    peers = [
        {
            "id": peer.id,
            "student_name": peer.student_name,
            "student_id": peer.student_id,
            "course_name": peer.course_name,
        }
        for peer in peer_requests
    ]
    matching_exams = db.query(Exam).join(Timeslot).filter(
        Timeslot.date == request.preferred_date,
        Timeslot.start_time <= request.preferred_start_time,
        Timeslot.end_time >= request.preferred_end_time,
        Exam.room_id.isnot(None),
        Exam.proctor_id.isnot(None),
        Exam.status == "posted",
        Exam.id != request.exam_id,
    ).all()
    matching_exams = [
        exam for exam in matching_exams
        if exam.room and exam.room.name != "Consultation Area"
    ]
    if matching_exams:
        return {
            "ongoing_exams": [
                {
                    "id": exam.id,
                    "subject": exam.subject.name if exam.subject else "Exam",
                    "subject_code": exam.subject.code if exam.subject else "",
                    "section": exam.section.name if exam.section else "-",
                    "room_id": exam.room_id,
                    "room": exam.room.name,
                    "proctor_id": exam.proctor_id,
                    "proctor": exam.proctor.name if exam.proctor else "Unassigned",
                    "start_time": exam.timeslot.start_time.strftime("%I:%M %p"),
                    "end_time": exam.timeslot.end_time.strftime("%I:%M %p"),
                }
                for exam in matching_exams
            ],
            "free_rooms": [],
            "free_proctors": [],
            "peer_requests": peers,
        }

    overlapping_exams = db.query(Exam).join(Timeslot).filter(
        Timeslot.date == request.preferred_date,
        Timeslot.start_time < request.preferred_end_time,
        Timeslot.end_time > request.preferred_start_time,
        Exam.id != request.exam_id,
    ).all()
    occupied_room_ids = {exam.room_id for exam in overlapping_exams if exam.room_id}
    rooms = db.query(Room).filter(Room.name != "Consultation Area").all()
    free_rooms = [
        {
            "id": room.id,
            "name": room.name,
            "building": room.building,
            "capacity": room.capacity,
        }
        for room in rooms
        if room.id not in occupied_room_ids
    ]

    busy_proctor_ids = {exam.proctor_id for exam in overlapping_exams if exam.proctor_id}
    day_of_week = request.preferred_date.weekday()
    free_proctors = []
    for proctor in db.query(Proctor).all():
        if proctor.exclude_from_scheduling or proctor.id in busy_proctor_ids:
            continue
        if proctor.teacher_id and db.query(TeacherSchedule.id).filter(
            TeacherSchedule.teacher_id == proctor.teacher_id,
            TeacherSchedule.day_of_week == day_of_week,
            TeacherSchedule.start_time < request.preferred_end_time,
            TeacherSchedule.end_time > request.preferred_start_time,
        ).first():
            continue
        availability_rows = db.query(ProctorAvailability).filter(
            ProctorAvailability.proctor_id == proctor.id,
        ).all()
        if availability_rows and not any(
            row.day_of_week == day_of_week
            and row.start_time <= request.preferred_start_time
            and row.end_time >= request.preferred_end_time
            for row in availability_rows
        ):
            continue
        free_proctors.append({"id": proctor.id, "name": proctor.name})

    return {
        "ongoing_exams": [],
        "free_rooms": sorted(free_rooms, key=lambda room: room["name"]),
        "free_proctors": free_proctors,
        "peer_requests": peers,
    }


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
        student = db.query(User).filter(User.email == req.school_email).first()
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
            "is_irregular": bool(student and student.student_type == "irregular"),
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
        student = db.query(User).filter(User.email == req.school_email).first()
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
            "has_irregular_roster": bool(
                req.status == "approved"
                and req.rescheduled_exam_id
                and student
                and student.student_type == "irregular"
            ),
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

    requests = [request]
    if update.status == "approved":
        if request.status != "pending":
            raise HTTPException(status_code=400, detail="Only pending requests can be approved")
        if update.batch_request_ids:
            request_ids = set(update.batch_request_ids)
            request_ids.add(request_id)
            requests = db.query(ReschedulingRequest).join(
                User, User.email == ReschedulingRequest.school_email
            ).filter(
                ReschedulingRequest.id.in_(request_ids),
                ReschedulingRequest.status == "pending",
                User.student_type == "irregular",
                ReschedulingRequest.preferred_date == request.preferred_date,
                ReschedulingRequest.preferred_start_time == request.preferred_start_time,
                ReschedulingRequest.preferred_end_time == request.preferred_end_time,
            ).all()
            if {item.id for item in requests} != request_ids:
                raise HTTPException(status_code=400, detail="Grouped requests must all be pending irregular requests for the same timeslot")
            if len({item.school_email for item in requests}) != len(requests):
                raise HTTPException(status_code=400, detail="A student can only be assigned to one rescheduled exam at a time")

        exam = request.exam
        student = db.query(User).filter(User.email == request.school_email).first()
        irregular_request = bool(student and student.student_type == "irregular")
        consultation_request = is_consultation_request(db, request)
        if not exam:
            raise HTTPException(status_code=400, detail="The original exam for this request no longer exists")
        if irregular_request and not (
            request.preferred_date
            and request.preferred_start_time
            and request.preferred_end_time
        ):
            raise HTTPException(status_code=400, detail="A replacement date and time are required")
        if irregular_request and not consultation_request and not (update.target_exam_id or update.room_id):
            raise HTTPException(status_code=400, detail="Choose an ongoing exam or a free room before approving this request")
        if irregular_request and not consultation_request:
            already_assigned = db.query(ReschedulingRequest.id).filter(
                ReschedulingRequest.school_email.in_(
                    [item.school_email for item in requests]
                ),
                ReschedulingRequest.status == "approved",
                ReschedulingRequest.preferred_date == request.preferred_date,
                ReschedulingRequest.preferred_start_time == request.preferred_start_time,
                ReschedulingRequest.preferred_end_time == request.preferred_end_time,
                ReschedulingRequest.id.notin_([item.id for item in requests]),
            ).first()
            if already_assigned:
                raise HTTPException(status_code=400, detail="A student already has an approved rescheduled exam at this timeslot")
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

        if request.preferred_date and request.preferred_start_time and request.preferred_end_time:
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
                if consultation_request:
                    consultation_room = db.query(Room).filter(Room.name == "Consultation Area").first()
                    if not consultation_room:
                        consultation_room = Room(name="Consultation Area", building="Consultation Area", capacity=1)
                        db.add(consultation_room)
                        db.flush()
                    assigned_exam = Exam(
                        subject_id=exam.subject_id,
                        section_id=exam.section_id,
                        room_id=consultation_room.id,
                        timeslot_id=ts.id,
                        course_id=exam.course_id,
                        year_level_id=exam.year_level_id,
                        semester=exam.semester,
                        term=exam.term,
                        status=exam.status,
                        proctor_id=update.proctor_id,
                    )
                    db.add(assigned_exam)
                    db.flush()
                elif update.target_exam_id:
                    options = _available_daytime_assignments(db, request)
                    assigned_exam = db.query(Exam).filter(
                        Exam.id == update.target_exam_id,
                        Exam.status == "posted",
                    ).first()
                    eligible_exam_ids = {
                        item["id"] for item in options["ongoing_exams"]
                    }
                    if (
                        not assigned_exam
                        or assigned_exam.id not in eligible_exam_ids
                        or not _exam_covers_request(assigned_exam, request)
                    ):
                        raise HTTPException(status_code=400, detail="The selected exam does not cover the requested timeslot")
                    if (
                        not assigned_exam.room_id
                        or not assigned_exam.proctor_id
                        or not assigned_exam.room
                        or assigned_exam.room.name == "Consultation Area"
                    ):
                        raise HTTPException(status_code=400, detail="The selected exam must have a regular room and an assigned proctor")
                else:
                    room = db.query(Room).filter(
                        Room.id == update.room_id,
                        Room.name != "Consultation Area",
                    ).with_for_update().first()
                    proctor = db.query(Proctor).filter(
                        Proctor.id == update.proctor_id,
                    ).with_for_update().first()
                    if not room:
                        raise HTTPException(status_code=400, detail="The selected room is not free for the requested timeslot")
                    if not proctor:
                        raise HTTPException(status_code=400, detail="Select a proctor who is free for the requested timeslot")
                    options = _available_daytime_assignments(db, request)
                    if options["ongoing_exams"]:
                        raise HTTPException(status_code=400, detail="An ongoing exam covers this timeslot; assign the student to that exam instead")
                    valid_room_ids = {item["id"] for item in options["free_rooms"]}
                    valid_proctor_ids = {item["id"] for item in options["free_proctors"]}
                    if room.id not in valid_room_ids:
                        raise HTTPException(status_code=400, detail="The selected room is not free for the requested timeslot")
                    if proctor.id not in valid_proctor_ids:
                        raise HTTPException(status_code=400, detail="Select a proctor who is free for the requested timeslot")
                    assigned_exam = Exam(
                        subject_id=exam.subject_id,
                        section_id=None,
                        room_id=room.id,
                        timeslot_id=ts.id,
                        course_id=exam.course_id,
                        year_level_id=exam.year_level_id,
                        semester=exam.semester,
                        term=exam.term,
                        status=exam.status,
                        proctor_id=proctor.id,
                    )
                    db.add(assigned_exam)
                    db.flush()
                for grouped_request in requests:
                    grouped_request.rescheduled_exam_id = assigned_exam.id
            elif update.room_id is not None:
                exam.room_id = update.room_id
            else:
                exam.room_id = None
            if not irregular_request:
                exam.timeslot_id = ts.id

    for grouped_request in requests:
        grouped_request.status = update.status
        grouped_request.reviewer_comments = update.reviewer_comments
        student_user = db.query(User).filter(User.email == grouped_request.school_email).first()
        db.add(Notification(
            user_id=student_user.id if student_user else None,
            message=f"Your rescheduling request for {grouped_request.course_name} has been {update.status}.",
            type="success" if update.status == "approved" else "error",
            related_id=grouped_request.id,
        ))

    if update.status == "approved" and irregular_request and not consultation_request:
        assigned_exam = db.query(Exam).filter(
            Exam.id == requests[0].rescheduled_exam_id
        ).first()
        if assigned_exam and assigned_exam.proctor:
            from sqlalchemy import or_
            proctor_query = db.query(User).filter(
                User.role.in_(["proctor", "teacher"]),
                User.proctor_id == assigned_exam.proctor_id,
            )
            if assigned_exam.proctor.teacher_id:
                proctor_query = db.query(User).filter(or_(
                    User.proctor_id == assigned_exam.proctor_id,
                    User.teacher_id == assigned_exam.proctor.teacher_id,
                )).filter(User.role.in_(["proctor", "teacher"]))
            names = ", ".join(item.student_name for item in requests)
            subjects = ", ".join(item.course_name for item in requests)
            for proctor_user in proctor_query.all():
                db.add(Notification(
                    user_id=proctor_user.id,
                    message=f"Irregular student(s) {names} will join your exam. Subjects: {subjects}.",
                    type="info",
                    related_id=assigned_exam.id,
                ))
    db.commit()
    if update.status == "approved":
        cache.invalidate_exam_schedules()
    log_activity(db, current_user.id, "RESCHEDULING_REVIEW", f"Request ID: {request_id}, Status: {update.status}")
    return {"message": f"Request {update.status}"}


@router.get("/{request_id}/roster")
def get_rescheduled_exam_roster(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin", "program_head", "proctor", "teacher"])),
):
    request = db.query(ReschedulingRequest).filter(
        ReschedulingRequest.id == request_id,
        ReschedulingRequest.status == "approved",
    ).first()
    if not request or not request.rescheduled_exam_id:
        raise HTTPException(status_code=404, detail="Approved rescheduled exam roster not found")
    exam = db.query(Exam).filter(Exam.id == request.rescheduled_exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Assigned exam session not found")
    if current_user.role in ["proctor", "teacher"]:
        if current_user.proctor_id != exam.proctor_id:
            proctor = db.query(Proctor).filter(Proctor.id == exam.proctor_id).first()
            if not proctor or current_user.teacher_id != proctor.teacher_id:
                raise HTTPException(status_code=403, detail="You are not assigned to this exam")

    requests = db.query(ReschedulingRequest).filter(
        ReschedulingRequest.status == "approved",
        ReschedulingRequest.rescheduled_exam_id == exam.id,
    ).order_by(ReschedulingRequest.student_name).all()
    return {
        "exam": {
            "subject": exam.subject.name if exam.subject else request.course_name,
            "date": exam.timeslot.date.isoformat() if exam.timeslot else None,
            "start_time": exam.timeslot.start_time.strftime("%I:%M %p") if exam.timeslot else None,
            "end_time": exam.timeslot.end_time.strftime("%I:%M %p") if exam.timeslot else None,
            "room": exam.room.name if exam.room else None,
            "proctor": exam.proctor.name if exam.proctor else None,
        },
        "students": [
            {
                "name": item.student_name,
                "student_id": item.student_id,
                "subject": item.course_name,
                "subject_code": item.course_code,
            }
            for item in requests
        ],
    }

@router.get("/{request_id}/available-rooms")
def get_available_rooms_for_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    """Return assignment options for daytime irregular requests and legacy room options otherwise."""
    request = db.query(ReschedulingRequest).filter(ReschedulingRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    if not (request.preferred_date and request.preferred_start_time and request.preferred_end_time):
        return {
            "ongoing_exams": [],
            "free_rooms": [],
            "free_proctors": [],
            "peer_requests": [],
        }

    student = db.query(User).filter(User.email == request.school_email).first()
    if student and student.student_type == "irregular" and not is_consultation_request(db, request):
        return _available_daytime_assignments(db, request)

    ts = db.query(Timeslot).filter(
        Timeslot.date == request.preferred_date,
        Timeslot.start_time == request.preferred_start_time,
        Timeslot.end_time == request.preferred_end_time,
    ).first()
    if not ts:
        return []
    exams_at_timeslot = db.query(Exam).filter(
        Exam.timeslot_id == ts.id,
        Exam.room_id.isnot(None),
        Exam.id != request.exam_id,
    ).join(Room, Exam.room_id == Room.id).filter(Room.name != "Consultation Area").all()
    rooms_by_id = {}
    for exam in exams_at_timeslot:
        if exam.room and exam.room.id not in rooms_by_id:
            rooms_by_id[exam.room.id] = {
                "id": exam.room.id,
                "name": exam.room.name,
                "building": exam.room.building,
                "capacity": exam.room.capacity,
                "exam_subject": exam.subject.name if exam.subject else None,
            }
    return sorted(rooms_by_id.values(), key=lambda room: room["name"])


@router.get("/my-requests/{section_name}")
def get_my_requests(section_name: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == "student" and current_user.section_name != section_name:
        raise HTTPException(status_code=403, detail="Unauthorized: Access denied")
    requests = db.query(ReschedulingRequest).filter(ReschedulingRequest.section_name == section_name).all()
    return [ReschedulingRequestSchema.from_orm(req) for req in requests]
