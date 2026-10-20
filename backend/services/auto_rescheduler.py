"""
Service for automatically assigning examination times and rooms for irregular student rescheduling requests.
Enforces:
- 15-minute break between consecutive exams.
- Configured exam durations (subject duration or default allotted time).
- School operating hours (daily_start_time and daily_end_time from SystemSetting).
- Existing scheduling rules (DistributionRule).
- Skipping occupied candidate slots and conflict-free validation against student's complete schedule.
- Room capacity validation and load-balancing room selection (lowest assigned student count first).
- Concurrency protection via row-level locking.
"""

from datetime import datetime, date, time, timedelta
from typing import Optional, List, Dict, Any, Tuple, Set
from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_, and_

from model import (
    ReschedulingRequest,
    Exam,
    Timeslot,
    Room,
    User,
    Subject,
    Section,
    Course,
    DistributionRule,
    SystemSetting,
    ExamBreakSetting,
    Notification,
)
from core import cache
from utils.logging import log_activity
from room_data import get_room_names_for_department


MANDATORY_BREAK_MINUTES = 15


def parse_time_value(val: Any) -> Optional[time]:
    if not val:
        return None
    if isinstance(val, time):
        return val
    s = str(val).strip()
    for fmt in ("%H:%M:%S", "%H:%M", "%I:%M %p", "%I:%M%p", "%I:%M %P", "%I:%M%P"):
        try:
            return datetime.strptime(s, fmt).time()
        except Exception:
            pass
    return None


def parse_date_value(val: Any) -> Optional[date]:
    if not val:
        return None
    if isinstance(val, date):
        return val
    s = str(val).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except Exception:
            pass
    return None


def get_school_operating_hours(db: Session) -> Tuple[time, time]:
    """Retrieve school operating hours from SystemSetting, falling back to defaults."""
    settings = {s.key: s.value for s in db.query(SystemSetting).all()}
    start_str = settings.get("daily_start_time", "07:30")
    end_str = settings.get("daily_end_time", "17:00")

    start_t = parse_time_value(start_str) or time(7, 30)
    end_t = parse_time_value(end_str) or time(17, 0)
    return start_t, end_t


def get_exam_configured_duration(exam: Exam, db: Session) -> int:
    """Retrieve the configured duration in minutes for an exam's subject."""
    if exam and exam.subject and exam.subject.duration_minutes and exam.subject.duration_minutes > 0:
        return int(exam.subject.duration_minutes)

    setting = db.query(SystemSetting).filter(SystemSetting.key == "default_allotted_time").first()
    if setting and setting.value:
        try:
            val = int(setting.value)
            if val > 0:
                return val
        except ValueError:
            pass
    return 75


def get_student_complete_exams(
    student: User,
    db: Session,
    exclude_exam_id: Optional[int] = None
) -> List[Exam]:
    """
    Fetch the student's complete examination schedule, including regular exams,
    irregular selections, and approved rescheduled exams.
    """
    exams_list: List[Exam] = []
    seen_exam_ids: Set[int] = set()

    if exclude_exam_id:
        seen_exam_ids.add(exclude_exam_id)

    # 1. For irregular students: fetch schedule through selections
    if student.student_type == "irregular":
        from routers.student import get_irregular_schedule_exams
        irreg_exams = get_irregular_schedule_exams(student, db, include_rescheduled_sources=False)
        for e in irreg_exams:
            if e.id not in seen_exam_ids and e.timeslot is not None:
                exams_list.append(e)
                seen_exam_ids.add(e.id)

    # 2. Add any approved rescheduled exams for this student
    approved_rescheduled = (
        db.query(Exam)
        .options(
            joinedload(Exam.subject),
            joinedload(Exam.timeslot),
            joinedload(Exam.room),
        )
        .join(ReschedulingRequest, ReschedulingRequest.rescheduled_exam_id == Exam.id)
        .filter(
            ReschedulingRequest.school_email == student.email,
            ReschedulingRequest.status == "approved",
            Exam.timeslot_id.isnot(None),
        )
        .all()
    )
    for e in approved_rescheduled:
        if e.id not in seen_exam_ids and e.timeslot is not None:
            exams_list.append(e)
            seen_exam_ids.add(e.id)

    # 3. For regular students: fetch exams by section
    if student.student_type != "irregular" and student.section_name:
        sec_exams = (
            db.query(Exam)
            .options(
                joinedload(Exam.subject),
                joinedload(Exam.timeslot),
                joinedload(Exam.room),
                joinedload(Exam.section),
            )
            .join(Section, Exam.section_id == Section.id)
            .filter(
                Section.name == student.section_name,
                Exam.status == "posted",
                Exam.timeslot_id.isnot(None),
            )
            .all()
        )
        # Exclude source exams of approved requests
        rescheduled_source_ids = {
            r.exam_id
            for r in db.query(ReschedulingRequest.exam_id)
            .filter(
                ReschedulingRequest.school_email == student.email,
                ReschedulingRequest.status == "approved",
                ReschedulingRequest.rescheduled_exam_id.isnot(None),
            )
            .all()
        }
        for e in sec_exams:
            if e.id not in seen_exam_ids and e.id not in rescheduled_source_ids:
                exams_list.append(e)
                seen_exam_ids.add(e.id)

    return exams_list


def check_scheduling_rules(
    exam: Exam,
    target_date: date,
    start_t: time,
    end_t: time,
    db: Session
) -> bool:
    """Check distribution rules for this exam (e.g. allowed session morning/afternoon)."""
    if not exam or not exam.subject:
        return True

    category_type = getattr(exam.subject, "category", "major") or "major"
    rules = db.query(DistributionRule).filter(
        DistributionRule.category_type == category_type,
        or_(
            DistributionRule.year_level_id == exam.year_level_id,
            DistributionRule.year_level_id.is_(None),
        ),
    ).all()

    for rule in rules:
        if rule.allowed_session:
            allowed = rule.allowed_session.lower()
            if allowed == "morning" and start_t >= time(12, 0):
                return False
            if allowed == "afternoon" and end_t <= time(12, 0):
                return False
    return True


def get_assigned_student_count_for_room(
    room_id: int,
    target_date: date,
    start_t: time,
    end_t: time,
    db: Session,
    exclude_exam_ids: Optional[Set[int]] = None
) -> int:
    """
    Calculate the total number of students taking examinations in a room during
    a specific examination period [start_t, end_t] on target_date.
    """
    exclude_ids = exclude_exam_ids or set()

    # Find source exam IDs of approved requests that were moved to other sessions
    moved_source_ids = {
        row[0]
        for row in db.query(ReschedulingRequest.exam_id)
        .filter(
            ReschedulingRequest.status == "approved",
            ReschedulingRequest.rescheduled_exam_id.isnot(None),
        )
        .all()
    }
    exclude_ids.update(moved_source_ids)

    # Active exams in this room overlapping in time
    exams_in_room = (
        db.query(Exam)
        .options(
            joinedload(Exam.section),
            joinedload(Exam.timeslot),
        )
        .join(Timeslot, Exam.timeslot_id == Timeslot.id)
        .filter(
            Exam.room_id == room_id,
            Timeslot.date == target_date,
            Timeslot.start_time < end_t,
            start_t < Timeslot.end_time,
            ~Exam.id.in_(exclude_ids) if exclude_ids else True,
        )
        .all()
    )

    if not exams_in_room:
        return 0

    # Rescheduled exams map to irregular student count
    rescheduled_exam_counts: Dict[int, int] = {}
    rescheduled_records = (
        db.query(ReschedulingRequest.rescheduled_exam_id)
        .filter(
            ReschedulingRequest.status == "approved",
            ReschedulingRequest.rescheduled_exam_id.in_([e.id for e in exams_in_room]),
        )
        .all()
    )
    for row in rescheduled_records:
        r_id = row[0]
        rescheduled_exam_counts[r_id] = rescheduled_exam_counts.get(r_id, 0) + 1

    total_students = 0
    for e in exams_in_room:
        if e.id in rescheduled_exam_counts:
            total_students += rescheduled_exam_counts[e.id]
        else:
            sec_count = getattr(e.section, "student_count", None) if e.section else None
            total_students += sec_count if sec_count and sec_count > 0 else 35

    return total_students


def find_earliest_auto_schedule(
    request: ReschedulingRequest,
    db: Session,
    candidate_rooms: Optional[List[Room]] = None
) -> Dict[str, Any]:
    """
    Search for the earliest valid conflict-free examination time slot and room combination.
    Returns:
    {
        "success": bool,
        "date": date,
        "date_formatted": str,
        "start_time": time,
        "end_time": time,
        "time_formatted": str,
        "room_id": int,
        "room_name": str,
        "room_capacity": int,
        "assigned_student_count": int,
        "remaining_capacity": int,
        "message": str
    }
    """
    student = db.query(User).filter(User.email == request.school_email).first()
    if not student:
        return {
            "success": False,
            "message": "Student account associated with request not found."
        }

    exam = request.exam or db.query(Exam).filter(Exam.id == request.exam_id).first()
    if not exam:
        return {
            "success": False,
            "message": "Original examination not found."
        }

    duration_minutes = get_exam_configured_duration(exam, db)
    school_start, school_end = get_school_operating_hours(db)

    # Permitted scheduling date: respect existing scheduling rule (same day as original exam)
    target_date = (
        parse_date_value(request.preferred_date)
        or parse_date_value(request.original_exam_date)
        or (exam.timeslot.date if exam.timeslot else None)
    )
    if not target_date:
        return {
            "success": False,
            "message": "No valid examination date specified for rescheduling."
        }

    # Fetch student's complete examination schedule excluding the exam being rescheduled
    complete_student_exams = get_student_complete_exams(student, db, exclude_exam_id=exam.id)
    same_day_student_exams = [
        e for e in complete_student_exams
        if e.timeslot and e.timeslot.date == target_date and e.id != exam.id
    ]

    # Identify the conflicting examination(s)
    orig_start = (
        parse_time_value(request.original_start_time)
        or (exam.timeslot.start_time if exam.timeslot else None)
    )
    orig_end = (
        parse_time_value(request.original_end_time)
        or (exam.timeslot.end_time if exam.timeslot else None)
    )

    conflicting_exams = []
    if orig_start and orig_end:
        for peer in same_day_student_exams:
            p_ts = peer.timeslot
            if orig_start < p_ts.end_time and p_ts.start_time < orig_end:
                conflicting_exams.append(peer)

    # If conflicting exam found, earliest slot begins after conflicting exam ends + 15m break
    if conflicting_exams:
        conflict_end = max(peer.timeslot.end_time for peer in conflicting_exams)
    elif orig_end:
        conflict_end = orig_end
    else:
        conflict_end = school_start

    # Earliest eligible start time begins 15 minutes after conflicting examination
    earliest_candidate_dt = datetime.combine(target_date, conflict_end) + timedelta(minutes=MANDATORY_BREAK_MINUTES)
    school_start_dt = datetime.combine(target_date, school_start)
    school_end_dt = datetime.combine(target_date, school_end)

    if earliest_candidate_dt < school_start_dt:
        earliest_candidate_dt = school_start_dt

    curr_dt = earliest_candidate_dt
    dur_td = timedelta(minutes=duration_minutes)
    break_td = timedelta(minutes=MANDATORY_BREAK_MINUTES)

    # Sort student's same-day exams chronologically
    same_day_student_exams.sort(key=lambda e: e.timeslot.start_time)

    # Department room matching
    course_category = exam.course.category if exam.course else "College"
    dept_room_names = set(get_room_names_for_department(course_category))

    # All candidate physical rooms (excluding Consultation Area)
    if candidate_rooms is not None:
        all_rooms = [r for r in candidate_rooms if r.name != "Consultation Area"]
    else:
        all_rooms = (
            db.query(Room)
            .filter(Room.name != "Consultation Area")
            .order_by(Room.name)
            .all()
        )

    # If an irregular student explicitly requested 5:00 PM onwards, skip the daytime search
    pref_t = parse_time_value(request.preferred_start_time)
    if not (pref_t and pref_t >= time(17, 0)):
        # Main time-slot search loop (within daytime operating hours)
        while curr_dt + dur_td <= school_end_dt:
            cand_start_dt = curr_dt
            cand_end_dt = curr_dt + dur_td
            cand_start = cand_start_dt.time()
            cand_end = cand_end_dt.time()

            # Step 1: Check student's complete examination schedule and 15-minute breaks
            student_conflict = False
            for peer in same_day_student_exams:
                p_ts = peer.timeslot
                p_start_dt = datetime.combine(target_date, p_ts.start_time)
                p_end_dt = datetime.combine(target_date, p_ts.end_time)

                # A. Direct overlap
                if cand_start_dt < p_end_dt and p_start_dt < cand_end_dt:
                    # Skip to after this occupied slot maintaining 15-minute break
                    curr_dt = p_end_dt + break_td
                    student_conflict = True
                    break

                # B. Break violation when candidate follows peer exam
                if p_end_dt <= cand_start_dt and (cand_start_dt - p_end_dt) < break_td:
                    curr_dt = p_end_dt + break_td
                    student_conflict = True
                    break

                # C. Break violation when candidate precedes peer exam
                if cand_end_dt <= p_start_dt and (p_start_dt - cand_end_dt) < break_td:
                    # Candidate cannot fit before peer without violating 15-min break; skip past peer
                    curr_dt = p_end_dt + break_td
                    student_conflict = True
                    break

            if student_conflict:
                continue

            # Step 2: Check existing scheduling rules (DistributionRule)
            if not check_scheduling_rules(exam, target_date, cand_start, cand_end, db):
                curr_dt += timedelta(minutes=15)
                continue

            # Step 3: Find available room with sufficient seating capacity
            # Prioritize lowest assigned student count during this period,
            # using remaining capacity and room-allocation rules as additional considerations.
            eligible_rooms = []
            for r in all_rooms:
                room_cap = r.capacity or 40
                assigned_count = get_assigned_student_count_for_room(
                    r.id,
                    target_date,
                    cand_start,
                    cand_end,
                    db,
                    exclude_exam_ids={exam.id}
                )

                # Seating capacity check: must fit existing students + 1 irregular student
                if assigned_count + 1 <= room_cap:
                    remaining_cap = room_cap - (assigned_count + 1)
                    is_dept_preferred = 0 if (r.name in dept_room_names or r.department == course_category) else 1

                    # Priority tuple:
                    # 1. Lowest number of students assigned (load balancing)
                    # 2. Preferred department room
                    # 3. Higher remaining capacity
                    # 4. Room name alphabetical
                    sort_key = (
                        assigned_count,
                        is_dept_preferred,
                        -remaining_cap,
                        r.name,
                    )
                    eligible_rooms.append((sort_key, r, assigned_count, room_cap, remaining_cap))

            if eligible_rooms:
                eligible_rooms.sort(key=lambda item: item[0])
                _, best_room, assigned_students, room_capacity, remaining_cap = eligible_rooms[0]

                return {
                    "success": True,
                    "date": target_date,
                    "date_formatted": target_date.strftime("%A, %B %d, %Y"),
                    "start_time": cand_start,
                    "end_time": cand_end,
                    "time_formatted": f"{cand_start.strftime('%I:%M %p')} - {cand_end.strftime('%I:%M %p')}",
                    "room_id": best_room.id,
                    "room_name": best_room.name,
                    "room_capacity": room_capacity,
                    "assigned_student_count": assigned_students,
                    "remaining_capacity": remaining_cap,
                    "is_consultation": False,
                    "message": (
                        f"Earliest conflict-free slot found: {cand_start.strftime('%I:%M %p')} - {cand_end.strftime('%I:%M %p')} "
                        f"in Room {best_room.name} ({assigned_students} students currently assigned, {remaining_cap} seats remaining)."
                    ),
                }

            # If no suitable room available for this slot, continue searching next time slot
            curr_dt += timedelta(minutes=15)

    # -------------------------------------------------------------------------
    # 5:00 PM Onwards: Consultation Area Automatic Placement
    # When no conflict-free slot fits within regular operating hours (before 5:00 PM)
    # or the irregular student has requested 5:00 PM onwards, they automatically
    # take the exam in the Consultation Area without a proctor assignment
    # because the admin will assign the proctor personally.
    # -------------------------------------------------------------------------
    consultation_room = db.query(Room).filter(Room.name == "Consultation Area").first()
    if not consultation_room:
        consultation_room = Room(name="Consultation Area", building="Consultation Area", capacity=50)
        db.add(consultation_room)
        db.flush()

    if pref_t and pref_t >= time(17, 0):
        consult_start_dt = datetime.combine(target_date, pref_t)
    else:
        consult_start_dt = datetime.combine(target_date, time(17, 0))
        if earliest_candidate_dt > consult_start_dt:
            consult_start_dt = earliest_candidate_dt

    # Ensure mandatory 15-minute break from any exam ending near or after 17:00
    for peer in same_day_student_exams:
        p_ts = peer.timeslot
        if p_ts:
            p_end_dt = datetime.combine(target_date, p_ts.end_time)
            if p_end_dt <= consult_start_dt and (consult_start_dt - p_end_dt) < break_td:
                consult_start_dt = p_end_dt + break_td

    # Avoid conflict with any evening exams for this student
    while True:
        c_start = consult_start_dt
        c_end = consult_start_dt + dur_td
        conflict_found = False
        for peer in same_day_student_exams:
            p_ts = peer.timeslot
            if not p_ts:
                continue
            p_start_dt = datetime.combine(target_date, p_ts.start_time)
            p_end_dt = datetime.combine(target_date, p_ts.end_time)
            if c_start < p_end_dt and p_start_dt < c_end:
                consult_start_dt = p_end_dt + break_td
                conflict_found = True
                break
            if p_end_dt <= c_start and (c_start - p_end_dt) < break_td:
                consult_start_dt = p_end_dt + break_td
                conflict_found = True
                break
            if c_end <= p_start_dt and (p_start_dt - c_end) < break_td:
                consult_start_dt = p_end_dt + break_td
                conflict_found = True
                break
        if not conflict_found:
            break

    c_start_t = consult_start_dt.time()
    c_end_t = (consult_start_dt + dur_td).time()

    assigned_count = get_assigned_student_count_for_room(
        consultation_room.id,
        target_date,
        c_start_t,
        c_end_t,
        db,
        exclude_exam_ids={exam.id}
    )
    room_cap = consultation_room.capacity or 50
    remaining_cap = max(0, room_cap - (assigned_count + 1))

    return {
        "success": True,
        "date": target_date,
        "date_formatted": target_date.strftime("%A, %B %d, %Y"),
        "start_time": c_start_t,
        "end_time": c_end_t,
        "time_formatted": f"{c_start_t.strftime('%I:%M %p')} - {c_end_t.strftime('%I:%M %p')}",
        "room_id": consultation_room.id,
        "room_name": consultation_room.name,
        "room_capacity": room_cap,
        "assigned_student_count": assigned_count,
        "remaining_capacity": remaining_cap,
        "is_consultation": True,
        "message": (
            f"Rescheduled for 5:00 PM onwards: {c_start_t.strftime('%I:%M %p')} - {c_end_t.strftime('%I:%M %p')} "
            f"in the Consultation Area without proctoring assignment (admin will assign personally)."
        ),
    }


def apply_auto_reschedule(
    request_id: int,
    reviewer_comments: Optional[str],
    db: Session,
    reviewer_id: Optional[int] = None,
    candidate_rooms: Optional[List[Room]] = None,
) -> Dict[str, Any]:
    """
    Atomically assign examination time and room, create rescheduled exam,
    and approve request with concurrency protection.
    """
    # 1. Lock the rescheduling request row to prevent concurrent processing
    req = (
        db.query(ReschedulingRequest)
        .filter(ReschedulingRequest.id == request_id)
        .with_for_update()
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Rescheduling request not found")

    if req.status != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req.status}")

    # 2. Lock the student row to serialize concurrent rescheduling requests for the same student
    student = (
        db.query(User)
        .filter(User.email == req.school_email)
        .with_for_update()
        .first()
    )

    orig_exam = req.exam or db.query(Exam).filter(Exam.id == req.exam_id).first()
    if not orig_exam:
        raise HTTPException(status_code=404, detail="Original exam not found")

    # 3. Search for earliest valid time slot and room
    schedule_result = find_earliest_auto_schedule(req, db, candidate_rooms=candidate_rooms)
    if not schedule_result.get("success"):
        raise HTTPException(
            status_code=400,
            detail=schedule_result.get(
                "message",
                "No valid time slot and room combination found within operating hours and capacity constraints."
            )
        )

    assigned_date = schedule_result["date"]
    assigned_start = schedule_result["start_time"]
    assigned_end = schedule_result["end_time"]
    assigned_room_id = schedule_result["room_id"]

    # 4. Lock the selected room row to serialize concurrent placements into this room
    chosen_room = (
        db.query(Room)
        .filter(Room.id == assigned_room_id)
        .with_for_update()
        .first()
    )
    if not chosen_room:
        raise HTTPException(status_code=404, detail="Selected room not found")

    # 5. Re-verify capacity under lock to guarantee no race condition exceeded capacity
    current_room_students = get_assigned_student_count_for_room(
        assigned_room_id,
        assigned_date,
        assigned_start,
        assigned_end,
        db,
        exclude_exam_ids={orig_exam.id}
    )
    room_cap = chosen_room.capacity or 40
    if current_room_students + 1 > room_cap:
        # If room became full while waiting for lock, re-run search
        schedule_result = find_earliest_auto_schedule(req, db, candidate_rooms=candidate_rooms)
        if not schedule_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail="Selected room became unavailable and no other valid slot/room could be found."
            )
        assigned_date = schedule_result["date"]
        assigned_start = schedule_result["start_time"]
        assigned_end = schedule_result["end_time"]
        assigned_room_id = schedule_result["room_id"]
        chosen_room = db.query(Room).filter(Room.id == assigned_room_id).with_for_update().first()

    # 6. Retrieve or create matching Timeslot
    ts = (
        db.query(Timeslot)
        .filter(
            Timeslot.date == assigned_date,
            Timeslot.start_time == assigned_start,
            Timeslot.end_time == assigned_end
        )
        .first()
    )
    if not ts:
        ts = Timeslot(
            date=assigned_date,
            start_time=assigned_start,
            end_time=assigned_end
        )
        db.add(ts)
        db.flush()

    # 7. Create the rescheduled Exam instance
    assigned_proctor_id = orig_exam.proctor_id
    if assigned_start >= time(17, 0) or chosen_room.name == "Consultation Area":
        # 5:00 PM onwards in Consultation Area: automatically without proctoring assignment
        # because the admin will assign it personally.
        assigned_proctor_id = None
    elif assigned_proctor_id:
        from utils.scheduler import validate_proctor_availability
        is_avail, _ = validate_proctor_availability(db, assigned_proctor_id, assigned_date, assigned_start, assigned_end)
        if not is_avail:
            assigned_proctor_id = None

    assigned_exam = Exam(
        subject_id=orig_exam.subject_id,
        section_id=orig_exam.section_id,
        room_id=assigned_room_id,
        timeslot_id=ts.id,
        course_id=orig_exam.course_id,
        year_level_id=orig_exam.year_level_id,
        semester=orig_exam.semester,
        term=orig_exam.term,
        status=orig_exam.status,
        proctor_id=assigned_proctor_id,
    )
    db.add(assigned_exam)
    db.flush()

    # 8. Update ReschedulingRequest
    req.preferred_date = assigned_date
    req.preferred_start_time = assigned_start
    req.preferred_end_time = assigned_end
    req.rescheduled_exam_id = assigned_exam.id
    req.status = "approved"
    req.reviewer_comments = reviewer_comments or "Automatically assigned by Thesis Exam Scheduler."

    # 9. Notify student
    student_user_id = student.id if student else None
    room_desc = "Consultation Area" if chosen_room.name == "Consultation Area" else f"Room {chosen_room.name}"
    proctor_note = " (Supervising proctor to be assigned personally by Admin)" if assigned_proctor_id is None else ""
    notification = Notification(
        user_id=student_user_id,
        message=(
            f"Your rescheduling request for {req.course_name} has been approved. "
            f"Scheduled for {assigned_date.strftime('%B %d, %Y')} at "
            f"{assigned_start.strftime('%I:%M %p')} - {assigned_end.strftime('%I:%M %p')} "
            f"in {room_desc}{proctor_note}."
        ),
        type="success",
        related_id=req.id,
    )
    db.add(notification)
    db.commit()

    cache.invalidate_exam_schedules()
    if reviewer_id:
        log_activity(
            db,
            reviewer_id,
            "RESCHEDULING_AUTO_ASSIGN",
            f"Request ID: {request_id}, Room: {chosen_room.name}, Timeslot: {assigned_date} {assigned_start}-{assigned_end}"
        )

    return {
        "message": "Request approved and automatically scheduled",
        "request_id": request_id,
        "assigned_date": str(assigned_date),
        "assigned_date_formatted": assigned_date.strftime("%A, %B %d, %Y"),
        "assigned_start_time": str(assigned_start),
        "assigned_end_time": str(assigned_end),
        "assigned_time_formatted": f"{assigned_start.strftime('%I:%M %p')} - {assigned_end.strftime('%I:%M %p')}",
        "room_id": chosen_room.id,
        "room_name": chosen_room.name,
        "room_capacity": chosen_room.capacity,
        "assigned_student_count": schedule_result["assigned_student_count"],
        "remaining_capacity": schedule_result["remaining_capacity"],
        "is_consultation": bool(assigned_start >= time(17, 0) or chosen_room.name == "Consultation Area"),
        "proctor_id": assigned_proctor_id,
    }
