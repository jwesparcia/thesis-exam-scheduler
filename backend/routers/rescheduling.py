from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session, joinedload
from core import get_db, cache
from model import ReschedulingRequest, Exam, Notification, User, Timeslot, Room, Proctor, Course, Department
from schema import ReschedulingRequestCreate, ReschedulingRequest as ReschedulingRequestSchema, ReschedulingRequestUpdate
from datetime import datetime, time, timedelta
from typing import Optional
from .auth import get_current_user, require_role
from utils.logging import log_activity
from services.auto_rescheduler import (
    find_earliest_auto_schedule,
    apply_auto_reschedule,
    find_host_regular_exam,
    get_assigned_student_count_for_room,
    get_reschedule_student_category,
    is_room_allowed_for_category,
)

router = APIRouter(prefix="/rescheduling", tags=["Rescheduling Requests"])


def is_consultation_request(db: Session, request: ReschedulingRequest) -> bool:
    student = db.query(User).filter(User.email == request.school_email).first()
    return bool(
        student
        and student.student_type == "irregular"
        and (
            (request.preferred_start_time and request.preferred_start_time >= time(17, 0))
            or (request.rescheduled_exam and request.rescheduled_exam.timeslot and request.rescheduled_exam.timeslot.start_time >= time(17, 0))
            or (request.rescheduled_exam and request.rescheduled_exam.room and request.rescheduled_exam.room.name == "Consultation Area")
        )
    )

def check_request_department_access(request: ReschedulingRequest, current_user: User, db: Session):
    """
    Prevent department administrators from approving requests belonging to other departments
    unless they have Super Admin privileges (Requirements 4, 5, 7).
    """
    is_super = bool(current_user.is_super_admin or current_user.department_code == "GE")
    if is_super:
        return
    req_dept = request.department_code
    if not req_dept and request.exam and request.exam.course:
        req_dept = request.exam.course.department_code
    if not req_dept and request.program:
        c_obj = db.query(Course).filter(Course.name.ilike(request.program.strip())).first()
        if c_obj and c_obj.department_code:
            req_dept = c_obj.department_code
    if not req_dept:
        req_dept = "GE"
    
    if current_user.department_code != req_dept:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: You are the administrator for {current_user.department_code}, but this request belongs to {req_dept}. Only the {req_dept} department administrator or Super Admin can approve or reject this request."
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

    # Automatically determine student's program department based on their enrolled course
    dept_code = None
    student_program = request.program

    # 1. Lookup student user to check if enrolled in a specific course (e.g. irregular student)
    student_user = None
    if request.school_email:
        student_user = db.query(User).filter(User.email == request.school_email.strip().lower()).first()
    if not student_user and request.student_id:
        student_user = db.query(User).filter(User.student_id == request.student_id.strip()).first()

    if student_user and student_user.course_id:
        course_obj = db.query(Course).filter(Course.id == student_user.course_id).first()
        if course_obj:
            student_program = course_obj.name
            if course_obj.department_code:
                dept_code = course_obj.department_code

    if not dept_code and student_user and student_user.course and student_user.course.department_code:
        dept_code = student_user.course.department_code
        student_program = student_user.course.name

    # 2. Check student_program by name against courses
    if not dept_code and student_program:
        course_obj = db.query(Course).filter(Course.name.ilike(student_program.strip())).first()
        if course_obj and course_obj.department_code:
            dept_code = course_obj.department_code
            student_program = course_obj.name

    # 3. Check section name
    if not dept_code and student_user and student_user.section_name:
        for c in db.query(Course).all():
            if c.name and c.name.lower() in student_user.section_name.lower():
                dept_code = c.department_code
                student_program = c.name
                break

    # 4. Fallback to exam's course
    if not dept_code and exam and exam.course and exam.course.department_code:
        dept_code = exam.course.department_code
        if not student_program:
            student_program = exam.course.name

    # 5. Default to GE if unresolved
    if not dept_code:
        ge_dept = db.query(Department).filter(Department.is_super == True).first()
        dept_code = ge_dept.code if ge_dept else "GE"

    db_request = ReschedulingRequest(
        exam_id=request.exam_id,
        section_name=request.section_name,
        student_name=request.student_name,
        student_id=request.student_id,
        program=student_program or request.program,
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
        acknowledged=request.acknowledged,
        department_code=dept_code
    )
    db.add(db_request)
    db.commit()
    db.refresh(db_request)

    # Route only to the program head responsible for the student's department
    dept_admin = db.query(User).filter(
        User.role.in_(["program_head", "admin"]),
        User.department_code == dept_code
    ).first()

    target_admin = dept_admin
    if not target_admin:
        target_admin = db.query(User).filter(
            User.role.in_(["program_head", "admin"]),
            User.is_super_admin == True
        ).first()

    if target_admin:
        notification = Notification(
            user_id=target_admin.id,
            message=f"New [{dept_code}] rescheduling request from {request.student_name} ({db_request.program}) for {request.course_name}",
            type="info",
            related_id=db_request.id
        )
        db.add(notification)
        db.commit()

    log_activity(db, current_user.id, "RESCHEDULING_SUBMIT", f"Exam ID: {request.exam_id}, Student: {request.student_name}, Dept: {dept_code}")
    return {"message": "Rescheduling request submitted successfully", "id": db_request.id, "department_code": dept_code}

@router.get("/pending/count")
def get_pending_rescheduling_count(db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    query = db.query(ReschedulingRequest).filter(ReschedulingRequest.status == "pending")
    is_super = bool(current_user.is_super_admin or current_user.department_code == "GE")
    if not is_super:
        query = query.filter(ReschedulingRequest.department_code == current_user.department_code)
    count = query.count()
    return {"count": count}

@router.get("/pending")
def get_pending_requests(
    department: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_role(["admin"]))
):
    is_super = bool(current_user.is_super_admin or current_user.department_code == "GE")
    query = db.query(ReschedulingRequest).options(
        joinedload(ReschedulingRequest.exam).joinedload(Exam.course),
        joinedload(ReschedulingRequest.department_rel)
    ).filter(ReschedulingRequest.status == "pending")

    if not is_super:
        query = query.filter(ReschedulingRequest.department_code == current_user.department_code)
    elif department and department != "All":
        query = query.filter(ReschedulingRequest.department_code == department)

    requests = query.all()

    result = []
    for req in requests:
        student = db.query(User).filter(User.email == req.school_email).first()
        is_irregular = bool(student and student.student_type == "irregular")
        auto_assignment = None
        if is_irregular:
            try:
                auto_assignment = find_earliest_auto_schedule(req, db)
            except Exception as e:
                auto_assignment = {
                    "success": False,
                    "message": f"Could not determine auto-assignment: {str(e)}"
                }

        is_consultation = is_consultation_request(db, req) or bool(auto_assignment and auto_assignment.get("is_consultation"))
        student_category = get_reschedule_student_category(db, req)
        
        req_dept_code = req.department_code or (req.exam.course.department_code if (req.exam and req.exam.course) else None)
        req_dept_name = req.department_rel.name if req.department_rel else (req_dept_code or student_category)
        can_approve = bool(is_super or (current_user.department_code and current_user.department_code == req_dept_code))

        result.append({
            "id": req.id,
            "exam_id": req.exam_id,
            "section_name": req.section_name,
            "student_name": req.student_name,
            "student_type": student.student_type if student else "regular",
            "program": req.program,
            "department": student_category,
            "department_code": req_dept_code,
            "department_name": req_dept_name,
            "can_approve": can_approve,
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
            "consultation_area": is_consultation,
            "acknowledged": req.acknowledged,
            "auto_assignment": auto_assignment,
        })
    return result

@router.get("/history")
def get_rescheduling_history(
    department: Optional[str] = None,
    db: Session = Depends(get_db), 
    current_user: User = Depends(require_role(["admin"]))
):
    is_super = bool(current_user.is_super_admin or current_user.department_code == "GE")
    query = db.query(ReschedulingRequest).options(
        joinedload(ReschedulingRequest.exam),
        joinedload(ReschedulingRequest.rescheduled_exam),
        joinedload(ReschedulingRequest.department_rel)
    ).filter(ReschedulingRequest.status.in_(["approved", "rejected"]))

    if not is_super:
        query = query.filter(ReschedulingRequest.department_code == current_user.department_code)
    elif department and department != "All":
        query = query.filter(ReschedulingRequest.department_code == department)

    requests = query.order_by(ReschedulingRequest.id.desc()).all()

    result = []
    for req in requests:
        assigned_exam = req.rescheduled_exam or req.exam
        room_name = assigned_exam.room.name if (assigned_exam and assigned_exam.room) else None
        room_capacity = assigned_exam.room.capacity if (assigned_exam and assigned_exam.room) else None
        assigned_student_count = None
        if req.status == "approved" and assigned_exam and assigned_exam.room and assigned_exam.timeslot:
            assigned_student_count = get_assigned_student_count_for_room(
                assigned_exam.room.id,
                assigned_exam.timeslot.date,
                assigned_exam.timeslot.start_time,
                assigned_exam.timeslot.end_time,
                db,
            )

        req_dept_code = req.department_code or (assigned_exam.course.department_code if (assigned_exam and assigned_exam.course) else None)
        req_dept_name = req.department_rel.name if req.department_rel else (req_dept_code or "-")

        result.append({
            "id": req.id,
            "exam_id": req.exam_id,
            "section_name": req.section_name,
            "student_name": req.student_name,
            "program": req.program,
            "department_code": req_dept_code,
            "department_name": req_dept_name,
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
            "room": room_name,
            "room_capacity": room_capacity,
            "student_count": assigned_student_count,
            "proctor": assigned_exam.proctor.name if (assigned_exam and assigned_exam.proctor) else None,
        })
    return result

@router.post("/{request_id}/auto-assign")
def auto_assign_request(
    request_id: int,
    payload: dict = Body(default={}),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    from .exams import is_generation_ongoing
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot review rescheduling requests while schedule generation is ongoing")
    request = db.query(ReschedulingRequest).filter(ReschedulingRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")
    
    # Enforce department authorization (Requirement 7)
    check_request_department_access(request, current_user, db)

    comments = payload.get("reviewer_comments")
    return apply_auto_reschedule(request_id, comments, db, current_user.id)

@router.get("/{request_id}/auto-assign-preview")
def preview_auto_assign_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(["admin"]))
):
    req = db.query(ReschedulingRequest).filter(ReschedulingRequest.id == request_id).first()
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    return find_earliest_auto_schedule(req, db)

@router.put("/{request_id}/review")
def review_request(request_id: int, update: ReschedulingRequestUpdate, db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    from .exams import is_generation_ongoing
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Cannot review rescheduling requests while schedule generation is ongoing")
    request = db.query(ReschedulingRequest).filter(ReschedulingRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    # Enforce department authorization (Requirement 7)
    check_request_department_access(request, current_user, db)

    student = db.query(User).filter(User.email == request.school_email).first()
    irregular_request = bool(student and student.student_type == "irregular")
    consultation_request = is_consultation_request(db, request) or bool(
        request.preferred_start_time and request.preferred_start_time >= time(17, 0)
    )

    if update.status == "approved":
        # If irregular request and no room is manually chosen, auto-assign time and room
        if irregular_request and not consultation_request and not update.room_id:
            return apply_auto_reschedule(request_id, update.reviewer_comments, db, current_user.id)

        student_category = get_reschedule_student_category(db, request)

        # Validate manually chosen room against building restrictions:
        # College students must ONLY be assigned to Building B rooms (e.g. B401).
        # SHS students must ONLY be assigned to Building C rooms (e.g. C201).
        if update.room_id is not None:
            chosen_room = db.query(Room).filter(Room.id == update.room_id).first()
            if not chosen_room:
                raise HTTPException(status_code=404, detail="Selected room not found")
            if chosen_room.name != "Consultation Area" and not is_room_allowed_for_category(chosen_room, student_category):
                if student_category == "College":
                    raise HTTPException(
                        status_code=400,
                        detail=f"Room {chosen_room.name} cannot be assigned. College students can only be assigned to Building B rooms (rooms starting with 'B', e.g. B401). Building C is reserved for SHS."
                    )
                else:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Room {chosen_room.name} cannot be assigned. SHS students can only be assigned to Building C rooms (rooms starting with 'C'). Building B is reserved for College."
                    )

        exam = request.exam
        if consultation_request:
            if not (request.preferred_date and request.preferred_start_time and request.preferred_end_time):
                auto_sched = find_earliest_auto_schedule(request, db)
                if auto_sched.get("success"):
                    request.preferred_date = auto_sched["date"]
                    request.preferred_start_time = auto_sched["start_time"]
                    request.preferred_end_time = auto_sched["end_time"]
                else:
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

            # Proctor is optional for Consultation Area (admin will assign personally)
            if update.proctor_id:
                proctor = db.query(Proctor).filter(Proctor.id == update.proctor_id).first()
                if not proctor:
                    raise HTTPException(status_code=404, detail="Proctor not found")
                from utils.scheduler import validate_proctor_availability
                is_valid, err_msg = validate_proctor_availability(
                    db,
                    proctor_id=update.proctor_id,
                    target_date=request.preferred_date,
                    target_start=request.preferred_start_time,
                    target_end=request.preferred_end_time
                )
                if not is_valid:
                    raise HTTPException(status_code=400, detail=err_msg)

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
                assigned_proctor_id = update.proctor_id
                if consultation_request or (request.preferred_start_time and request.preferred_start_time >= time(17, 0)):
                    consultation_room = db.query(Room).filter(Room.name == "Consultation Area").first()
                    if not consultation_room:
                        consultation_room = Room(name="Consultation Area", building="Consultation Area", capacity=50)
                        db.add(consultation_room)
                        db.flush()
                    assigned_room_id = consultation_room.id
                    # 5:00 PM onwards in Consultation Area: without proctoring assignment
                    assigned_proctor_id = update.proctor_id if update.proctor_id else None
                elif not assigned_proctor_id and assigned_room_id:
                    host_exam = find_host_regular_exam(
                        assigned_room_id,
                        request.preferred_date,
                        request.preferred_start_time,
                        request.preferred_end_time,
                        db,
                        exclude_exam_ids={exam.id},
                    )
                    if host_exam and host_exam.proctor_id is not None:
                        assigned_proctor_id = host_exam.proctor_id

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
                    proctor_id=assigned_proctor_id,
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

    request.status = update.status
    request.reviewer_comments = update.reviewer_comments

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
    For 5:00 PM onwards, automatically returns the Consultation Area room.
    """
    request = db.query(ReschedulingRequest).filter(ReschedulingRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Request not found")

    student_category = get_reschedule_student_category(db, request)

    # If no preferred timeslot specified, return empty list (admin cannot proceed without a time)
    if not (request.preferred_date and request.preferred_start_time and request.preferred_end_time):
        return []

    if request.preferred_start_time >= time(17, 0):
        consultation_room = db.query(Room).filter(Room.name == "Consultation Area").first()
        if not consultation_room:
            consultation_room = Room(name="Consultation Area", building="Consultation Area", capacity=50)
            db.add(consultation_room)
            db.flush()
        return [{
            "id": consultation_room.id,
            "name": consultation_room.name,
            "building": consultation_room.building,
            "capacity": consultation_room.capacity,
            "exam_subject": "Consultation Hours",
        }]

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

    # Collect unique room IDs with active exams, preserving subject info for display.
    # Strictly filter rooms so College students only see Building B rooms and SHS only see Building C rooms.
    seen_room_ids = set()
    result = []
    for exam_entry in exams_at_timeslot:
        if exam_entry.room_id in seen_room_ids:
            continue
        seen_room_ids.add(exam_entry.room_id)
        room = db.query(Room).filter(Room.id == exam_entry.room_id).first()
        if room and is_room_allowed_for_category(room, student_category):
            result.append({
                "id": room.id,
                "name": room.name,
                "building": room.building or (room.name[0] if room.name and room.name[0] in "BC" else None),
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
            "building": room.building or (room.name[0] if room.name and room.name[0] in "BC" else None),
            "capacity": room.capacity,
            "exam_subject": None,
        }
        for room in free_rooms
        if room.id not in occupied_room_ids and is_room_allowed_for_category(room, student_category)
    ], key=lambda room: room["name"])


@router.get("/my-requests/{section_name}")
def get_my_requests(section_name: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if current_user.role == "student" and current_user.section_name != section_name:
        raise HTTPException(status_code=403, detail="Unauthorized: Access denied")
    requests = db.query(ReschedulingRequest).filter(ReschedulingRequest.section_name == section_name).all()
    return [ReschedulingRequestSchema.from_orm(req) for req in requests]
