"""
Service for automatically assigning examination times and rooms for irregular student rescheduling requests.
Enforces:
- Joining active regular examination schedules on the next conflict-free time slot.
- Skipping occupied time slots in the irregular student's complete schedule until a free slot is found.
- Configured exam durations (subject duration or default allotted time) and break settings.
- School operating hours (daily_start_time and daily_end_time from SystemSetting), with 5:00 PM Consultation Area fallback.
- Room capacity validation and load-balancing room selection (lowest assigned student count among active exam rooms first).
- Supervising proctor inheritance from the joined regular exam session.
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


def get_reschedule_student_category(db: Session, request: ReschedulingRequest) -> str:
    """
    Determine whether a student requesting a reschedule belongs to 'College' or 'SHS'.
    Priority:
    1. Student User profile course category
    2. Rescheduled Exam course category
    3. Rescheduled Exam section course category
    4. Program code/name match in Course table
    5. Section name heuristic ('SHS', 'Grade 11', 'Grade 12', etc.)
    Defaults to 'College'.
    """
    student = None
    if request.school_email:
        student = db.query(User).filter(User.email == request.school_email).first()
    if not student and request.student_id:
        student = db.query(User).filter(User.student_id == request.student_id).first()

    if student:
        if getattr(student, "course", None) and student.course.category:
            return student.course.category
        if getattr(student, "course_id", None):
            c = db.query(Course).filter(Course.id == student.course_id).first()
            if c and c.category:
                return c.category

    exam = request.exam or (db.query(Exam).filter(Exam.id == request.exam_id).first() if request.exam_id else None)
    if exam and exam.course and exam.course.category:
        return exam.course.category

    if exam and exam.section and exam.section.course and exam.section.course.category:
        return exam.section.course.category

    if request.program:
        prog = request.program.strip()
        c = db.query(Course).filter(Course.name.ilike(prog)).first()
        if c and c.category:
            return c.category

    sec_name = request.section_name or (student.section_name if student else "")
    if sec_name:
        upper_sec = sec_name.upper()
        if any(keyword in upper_sec for keyword in ["SHS", "GRADE 11", "GRADE 12", "G11", "G12"]):
            return "SHS"

    return "College"


def is_room_allowed_for_category(room: Room, category: str) -> bool:
    """
    Check if a room is valid for a given student category (College vs SHS).
    Rules:
    - If College: Room MUST be in Building B (all room starts with 'B', e.g. B401). Building C is strictly forbidden.
    - If SHS: Room MUST be in Building C (all room starts with 'C', e.g. C201). Building B is strictly forbidden.
    - 'Consultation Area' is handled separately for after-hours/special sessions.
    """
    if not room or room.name == "Consultation Area":
        return False

    room_name = (room.name or "").strip().upper()
    building = (room.building or "").strip().upper()
    department = (room.department or "").strip().lower()

    if category == "College":
        # Reject Building C rooms (reserved exclusively for SHS)
        if building == "C" or room_name.startswith("C") or department == "shs":
            return False
        # Must be in Building B or start with 'B' or department College
        return building == "B" or room_name.startswith("B") or department == "college"

    elif category == "SHS":
        # Reject Building B rooms (reserved exclusively for College)
        if building == "B" or room_name.startswith("B") or department == "college":
            return False
        # Must be in Building C or start with 'C' or department SHS
        return building == "C" or room_name.startswith("C") or department == "shs"

    return True


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


def get_solo_rescheduled_exam_ids(db: Session) -> Set[int]:
    """
    Return IDs of Exam rows created specifically as solo rescheduled exams
    for individual student rescheduling requests (rescheduled_exam_id != exam_id).
    """
    return {
        row[0]
        for row in db.query(ReschedulingRequest.rescheduled_exam_id)
        .filter(
            ReschedulingRequest.rescheduled_exam_id.isnot(None),
            ReschedulingRequest.rescheduled_exam_id != ReschedulingRequest.exam_id,
        )
        .all()
    }


def get_configured_break_minutes(db: Session) -> int:
    """
    Retrieve configured break duration in minutes from ExamBreakSetting.
    Defaults to 0 when break_seconds == 0 (back-to-back regular slots).
    """
    rows = db.query(ExamBreakSetting).all()
    if rows:
        max_sec = max(int(r.break_seconds or 0) for r in rows)
        return max(0, max_sec // 60)
    return 0


def find_host_regular_exam(
    room_id: int,
    target_date: date,
    start_t: time,
    end_t: time,
    db: Session,
    exclude_exam_ids: Optional[Set[int]] = None,
) -> Optional[Exam]:
    """
    Find the active regular section exam running in room_id during [start_t, end_t] on target_date.
    """
    exclude_ids = set(exclude_exam_ids) if exclude_exam_ids else set()
    exclude_ids.update(get_solo_rescheduled_exam_ids(db))
    q = (
        db.query(Exam)
        .options(
            joinedload(Exam.subject),
            joinedload(Exam.section),
            joinedload(Exam.proctor),
            joinedload(Exam.timeslot),
        )
        .join(Timeslot, Exam.timeslot_id == Timeslot.id)
        .filter(
            Exam.room_id == room_id,
            Exam.section_id.isnot(None),
            Timeslot.date == target_date,
            Timeslot.start_time < end_t,
            start_t < Timeslot.end_time,
        )
    )
    if exclude_ids:
        q = q.filter(~Exam.id.in_(exclude_ids))
    candidates = q.all()
    if not candidates:
        return None
    # Prefer the exam whose timeslot starts at start_t and has an assigned proctor
    candidates.sort(
        key=lambda e: (
            0 if (e.timeslot and e.timeslot.start_time == start_t) else 1,
            0 if e.proctor_id is not None else 1,
            e.id,
        )
    )
    return candidates[0]


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
    exclude_ids = set(exclude_exam_ids) if exclude_exam_ids else set()

    # Only exclude standalone (non-section) source exams that moved to a different exam row;
    # regular section exams keep their regular students in the original room!
    moved_solo_source_ids = {
        row[0]
        for row in db.query(ReschedulingRequest.exam_id)
        .join(Exam, ReschedulingRequest.exam_id == Exam.id)
        .filter(
            ReschedulingRequest.status == "approved",
            ReschedulingRequest.rescheduled_exam_id.isnot(None),
            ReschedulingRequest.rescheduled_exam_id != ReschedulingRequest.exam_id,
            Exam.section_id.is_(None),
        )
        .all()
    }
    exclude_ids.update(moved_solo_source_ids)

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

    # Solo rescheduled exams map to irregular student count (1 per approved request)
    rescheduled_exam_counts: Dict[int, int] = {}
    rescheduled_records = (
        db.query(ReschedulingRequest.rescheduled_exam_id)
        .filter(
            ReschedulingRequest.status == "approved",
            ReschedulingRequest.rescheduled_exam_id.isnot(None),
            ReschedulingRequest.rescheduled_exam_id != ReschedulingRequest.exam_id,
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
    Search for the next conflict-free regular examination time slot and room combination
    so the irregular student joins an active regular exam session.
    If the next regular time slot is occupied in the irregular student's schedule,
    it skips that slot and checks subsequent regular time slots until a free slot is found.
    Falls back to 5:00 PM onwards in the Consultation Area when all daytime slots are occupied/full.
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

    # Earliest next slot begins immediately after the conflicting exam finishes
    if conflicting_exams:
        conflict_end = max(peer.timeslot.end_time for peer in conflicting_exams)
    elif orig_end:
        conflict_end = orig_end
    else:
        conflict_end = school_start

    configured_break_minutes = get_configured_break_minutes(db)
    configured_break_td = timedelta(minutes=configured_break_minutes)

    school_start_dt = datetime.combine(target_date, school_start)
    school_end_dt = datetime.combine(target_date, school_end)
    dur_td = timedelta(minutes=duration_minutes)

    # Fallback clock-stepping break (used only when no regular section exams exist on target_date)
    earliest_candidate_dt = datetime.combine(target_date, conflict_end) + timedelta(minutes=MANDATORY_BREAK_MINUTES)
    if earliest_candidate_dt < school_start_dt:
        earliest_candidate_dt = school_start_dt
    curr_dt = earliest_candidate_dt
    break_td = timedelta(minutes=MANDATORY_BREAK_MINUTES)

    # Sort student's same-day exams chronologically
    same_day_student_exams.sort(key=lambda e: e.timeslot.start_time)

    # Department room matching & building restriction
    course_category = get_reschedule_student_category(db, request)
    dept_room_names = set(get_room_names_for_department(course_category, db=db))

    # All candidate physical rooms (excluding Consultation Area)
    # Strictly enforce building rules:
    # College students must ONLY be assigned to Building B (rooms starting with 'B', e.g. B401).
    # Building C is reserved exclusively for SHS.
    if candidate_rooms is not None:
        base_rooms = [r for r in candidate_rooms if r.name != "Consultation Area"]
    else:
        base_rooms = (
            db.query(Room)
            .filter(Room.name != "Consultation Area")
            .order_by(Room.name)
            .all()
        )

    all_rooms = [r for r in base_rooms if is_room_allowed_for_category(r, course_category)]
    allowed_room_ids = {r.id for r in all_rooms if r.id is not None}
    room_by_id = {r.id: r for r in all_rooms if r.id is not None}

    # If an irregular student explicitly requested 5:00 PM onwards, skip the daytime search
    pref_t = parse_time_value(request.preferred_start_time)
    if not (pref_t and pref_t >= time(17, 0)):
        solo_rescheduled_ids = get_solo_rescheduled_exam_ids(db)

        # ---------------------------------------------------------------------
        # Primary Strategy: Join the Next Conflict-Free Regular Exam Time Slot
        # Step through actual regular section exam time slots on target_date.
        # If the irregular student already has a scheduled exam in a candidate
        # regular time slot, skip it until a free regular time slot is found.
        # Joining a room whose regular class is taking a different subject is
        # expected and allowed so the irregular student sits in an active
        # supervised examination room.
        # ---------------------------------------------------------------------
        regular_day_exams: List[Exam] = []
        if allowed_room_ids:
            reg_q = (
                db.query(Exam)
                .options(
                    joinedload(Exam.timeslot),
                    joinedload(Exam.subject),
                    joinedload(Exam.section),
                    joinedload(Exam.proctor),
                )
                .join(Timeslot, Exam.timeslot_id == Timeslot.id)
                .filter(
                    Timeslot.date == target_date,
                    Exam.room_id.in_(allowed_room_ids),
                    Exam.section_id.isnot(None),
                    Exam.id != exam.id,
                    or_(Exam.status == "posted", Exam.status == exam.status),
                )
            )
            if solo_rescheduled_ids:
                reg_q = reg_q.filter(~Exam.id.in_(solo_rescheduled_ids))
            regular_day_exams = reg_q.all()

        if regular_day_exams:
            min_regular_start_dt = max(
                school_start_dt,
                datetime.combine(target_date, conflict_end) + configured_break_td,
            )
            regular_slot_starts = sorted({
                re.timeslot.start_time
                for re in regular_day_exams
                if re.timeslot and re.timeslot.start_time < time(17, 0)
            })

            orig_subj_name = (exam.subject.name or "").strip().lower() if exam.subject else ""
            orig_subj_code = (exam.subject.code or "").strip().lower() if exam.subject else ""

            for slot_start in regular_slot_starts:
                cand_start_dt = datetime.combine(target_date, slot_start)
                if cand_start_dt < min_regular_start_dt:
                    continue

                cand_end_dt = cand_start_dt + dur_td
                if cand_end_dt > school_end_dt:
                    continue

                cand_start = cand_start_dt.time()
                cand_end = cand_end_dt.time()

                # Check if the irregular student already has an exam in this time slot
                student_conflict = False
                for peer in same_day_student_exams:
                    p_ts = peer.timeslot
                    if not p_ts:
                        continue
                    p_start_dt = datetime.combine(target_date, p_ts.start_time)
                    p_end_dt = datetime.combine(target_date, p_ts.end_time)

                    # Direct overlap in irregular student's schedule -> skip this time slot
                    if cand_start_dt < p_end_dt and p_start_dt < cand_end_dt:
                        student_conflict = True
                        break

                    # Respect configured break if ExamBreakSetting > 0
                    if configured_break_td > timedelta(0):
                        if p_end_dt <= cand_start_dt and (cand_start_dt - p_end_dt) < configured_break_td:
                            student_conflict = True
                            break
                        if cand_end_dt <= p_start_dt and (p_start_dt - cand_end_dt) < configured_break_td:
                            student_conflict = True
                            break

                if student_conflict:
                    continue

                # Evaluate active regular exam rooms running at this time slot
                eligible_active_rooms = []
                seen_slot_rooms: Set[int] = set()
                for host_exam in regular_day_exams:
                    h_ts = host_exam.timeslot
                    if not h_ts or host_exam.room_id is None:
                        continue
                    # Host regular exam must be active at cand_start
                    if not (h_ts.start_time <= cand_start < h_ts.end_time):
                        continue
                    if host_exam.room_id in seen_slot_rooms:
                        continue

                    r = room_by_id.get(host_exam.room_id)
                    if not r:
                        continue

                    # If irregular exam extends slightly past host exam, ensure another regular exam
                    # doesn't start in the same room before cand_end
                    if cand_end > h_ts.end_time:
                        next_room_overlap = any(
                            other.id != host_exam.id
                            and other.room_id == r.id
                            and other.timeslot
                            and other.timeslot.start_time < cand_end
                            and h_ts.end_time <= other.timeslot.start_time
                            for other in regular_day_exams
                        )
                        if next_room_overlap:
                            continue

                    seen_slot_rooms.add(r.id)
                    room_cap = r.capacity or 40
                    assigned_count = get_assigned_student_count_for_room(
                        r.id,
                        target_date,
                        cand_start,
                        cand_end,
                        db,
                        exclude_exam_ids={exam.id},
                    )

                    # Must be an active regular session with spare capacity for +1 student
                    if assigned_count > 0 and assigned_count + 1 <= room_cap:
                        remaining_cap = room_cap - (assigned_count + 1)
                        full_coverage = 0 if cand_end <= h_ts.end_time else 1
                        is_dept_preferred = 0 if (
                            r.name in dept_room_names
                            or r.department == course_category
                            or (course_category == "College" and (r.building == "B" or (r.name and r.name.startswith("B"))))
                            or (course_category == "SHS" and (r.building == "C" or (r.name and r.name.startswith("C"))))
                        ) else 1

                        host_subj_name = (host_exam.subject.name or "").strip().lower() if host_exam.subject else ""
                        host_subj_code = (host_exam.subject.code or "").strip().lower() if host_exam.subject else ""
                        same_subject = 0 if (
                            (exam.subject_id and host_exam.subject_id == exam.subject_id)
                            or (orig_subj_code and orig_subj_code == host_subj_code)
                            or (orig_subj_name and orig_subj_name == host_subj_name)
                        ) else 1

                        # Priority tuple:
                        # 1. Host exam covers full duration
                        # 2. Lowest student count in active regular exam room (load balancing)
                        # 3. Preferred department room
                        # 4. Same subject tie-breaker (different subjects are completely allowed)
                        # 5. Higher remaining capacity
                        # 6. Room name alphabetical
                        sort_key = (
                            full_coverage,
                            assigned_count,
                            is_dept_preferred,
                            same_subject,
                            -remaining_cap,
                            r.name,
                        )
                        eligible_active_rooms.append(
                            (sort_key, r, host_exam, assigned_count, room_cap, remaining_cap)
                        )

                if eligible_active_rooms:
                    eligible_active_rooms.sort(key=lambda item: item[0])
                    _, best_room, best_host, assigned_students, room_capacity, remaining_cap = eligible_active_rooms[0]
                    joined_sec = best_host.section.name if best_host.section else None
                    joined_subj = best_host.subject.name if best_host.subject else None
                    joined_code = best_host.subject.code if best_host.subject else None
                    proctor_name = best_host.proctor.name if best_host.proctor else None
                    session_desc = f" joining {joined_sec}" + (f" ({joined_subj})" if joined_subj else "") if joined_sec else ""

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
                        "joined_regular_exam": True,
                        "host_exam_id": best_host.id,
                        "joined_section_name": joined_sec,
                        "joined_subject_code": joined_code,
                        "joined_subject_name": joined_subj,
                        "proctor_id": best_host.proctor_id,
                        "proctor_name": proctor_name,
                        "is_consultation": False,
                        "message": (
                            f"Joined next conflict-free regular exam slot: {cand_start.strftime('%I:%M %p')} - {cand_end.strftime('%I:%M %p')} "
                            f"in Room {best_room.name}{session_desc} ({assigned_students} students currently assigned, {remaining_cap} seats remaining)."
                        ),
                    }
        else:
            # Fallback search loop ONLY when no regular section exams exist on target_date
            # (e.g., standalone synthetic test fixtures).
            while curr_dt + dur_td <= school_end_dt:
                cand_start_dt = curr_dt
                cand_end_dt = curr_dt + dur_td
                cand_start = cand_start_dt.time()
                cand_end = cand_end_dt.time()

                student_conflict = False
                for peer in same_day_student_exams:
                    p_ts = peer.timeslot
                    p_start_dt = datetime.combine(target_date, p_ts.start_time)
                    p_end_dt = datetime.combine(target_date, p_ts.end_time)

                    if cand_start_dt < p_end_dt and p_start_dt < cand_end_dt:
                        curr_dt = p_end_dt + break_td
                        student_conflict = True
                        break

                    if p_end_dt <= cand_start_dt and (cand_start_dt - p_end_dt) < break_td:
                        curr_dt = p_end_dt + break_td
                        student_conflict = True
                        break

                    if cand_end_dt <= p_start_dt and (p_start_dt - cand_end_dt) < break_td:
                        curr_dt = p_end_dt + break_td
                        student_conflict = True
                        break

                if student_conflict:
                    continue

                if not check_scheduling_rules(exam, target_date, cand_start, cand_end, db):
                    curr_dt += timedelta(minutes=15)
                    continue

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

                    if assigned_count + 1 <= room_cap:
                        remaining_cap = room_cap - (assigned_count + 1)
                        is_dept_preferred = 0 if (
                            r.name in dept_room_names
                            or r.department == course_category
                            or (course_category == "College" and (r.building == "B" or (r.name and r.name.startswith("B"))))
                            or (course_category == "SHS" and (r.building == "C" or (r.name and r.name.startswith("C"))))
                        ) else 1

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
                        "joined_regular_exam": False,
                        "is_consultation": False,
                        "message": (
                            f"Earliest conflict-free slot found: {cand_start.strftime('%I:%M %p')} - {cand_end.strftime('%I:%M %p')} "
                            f"in Room {best_room.name} ({assigned_students} students currently assigned, {remaining_cap} seats remaining)."
                        ),
                    }

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
        consult_min_dt = datetime.combine(target_date, conflict_end) + configured_break_td
        consult_start_dt = datetime.combine(target_date, time(17, 0))
        if consult_min_dt > consult_start_dt:
            consult_start_dt = consult_min_dt

    # Ensure configured break from any exam ending near or after 17:00
    for peer in same_day_student_exams:
        p_ts = peer.timeslot
        if p_ts and configured_break_td > timedelta(0):
            p_end_dt = datetime.combine(target_date, p_ts.end_time)
            if p_end_dt <= consult_start_dt and (consult_start_dt - p_end_dt) < configured_break_td:
                consult_start_dt = p_end_dt + configured_break_td

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
                consult_start_dt = p_end_dt + configured_break_td
                conflict_found = True
                break
            if configured_break_td > timedelta(0):
                if p_end_dt <= c_start and (c_start - p_end_dt) < configured_break_td:
                    consult_start_dt = p_end_dt + configured_break_td
                    conflict_found = True
                    break
                if c_end <= p_start_dt and (p_start_dt - c_end) < configured_break_td:
                    consult_start_dt = p_end_dt + configured_break_td
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
        "joined_regular_exam": False,
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

    student_category = get_reschedule_student_category(db, req)
    if chosen_room.name != "Consultation Area" and not is_room_allowed_for_category(chosen_room, student_category):
        if student_category == "College":
            raise HTTPException(
                status_code=400,
                detail=f"Room {chosen_room.name} cannot be assigned. College students can only be assigned to Building B rooms (e.g. B401). Building C is reserved for SHS."
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Room {chosen_room.name} cannot be assigned. SHS students can only be assigned to Building C rooms. Building B is reserved for College."
            )

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
    host_exam = None
    assigned_proctor_id = None
    if assigned_start >= time(17, 0) or chosen_room.name == "Consultation Area":
        # 5:00 PM onwards in Consultation Area: automatically without proctoring assignment
        # because the admin will assign it personally.
        assigned_proctor_id = None
    else:
        # Inherit the supervising proctor from the active regular exam running in chosen_room
        host_exam = find_host_regular_exam(
            assigned_room_id,
            assigned_date,
            assigned_start,
            assigned_end,
            db,
            exclude_exam_ids={orig_exam.id},
        )
        if host_exam and host_exam.proctor_id is not None:
            assigned_proctor_id = host_exam.proctor_id
        elif orig_exam.proctor_id:
            from utils.scheduler import validate_proctor_availability
            is_avail, _ = validate_proctor_availability(db, orig_exam.proctor_id, assigned_date, assigned_start, assigned_end)
            if is_avail:
                existing_p_exams = (
                    db.query(Exam)
                    .join(Timeslot)
                    .filter(
                        Exam.proctor_id == orig_exam.proctor_id,
                        Exam.id != orig_exam.id,
                        Timeslot.date == assigned_date
                    )
                    .all()
                )
                cand_st_m = assigned_start.hour * 60 + assigned_start.minute
                cand_et_m = assigned_end.hour * 60 + assigned_end.minute
                sim_intervals = [
                    (e.timeslot.start_time.hour * 60 + e.timeslot.start_time.minute,
                     e.timeslot.end_time.hour * 60 + e.timeslot.end_time.minute)
                    for e in existing_p_exams if e.timeslot
                ]
                sim_intervals.append((cand_st_m, cand_et_m))
                sim_intervals.sort(key=lambda x: x[0])
                streak = 0
                prev_e = None
                max_streak = 0
                for s, e in sim_intervals:
                    if prev_e is not None and 0 <= (s - prev_e) <= 30:
                        streak += 1
                    else:
                        streak = 1
                    prev_e = e
                    max_streak = max(max_streak, streak)
                if max_streak <= 2:
                    assigned_proctor_id = orig_exam.proctor_id

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
    is_consult = bool(assigned_start >= time(17, 0) or chosen_room.name == "Consultation Area")
    room_desc = "Consultation Area" if chosen_room.name == "Consultation Area" else f"Room {chosen_room.name}"
    proctor_note = " (Supervising proctor to be assigned personally by Admin)" if is_consult and assigned_proctor_id is None else ""
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
        "joined_regular_exam": bool(schedule_result.get("joined_regular_exam")),
        "joined_section_name": schedule_result.get("joined_section_name") or (host_exam.section.name if host_exam and host_exam.section else None),
        "joined_subject_name": schedule_result.get("joined_subject_name") or (host_exam.subject.name if host_exam and host_exam.subject else None),
        "is_consultation": is_consult,
        "proctor_id": assigned_proctor_id,
        "proctor_name": host_exam.proctor.name if (host_exam and host_exam.proctor and assigned_proctor_id == host_exam.proctor_id) else schedule_result.get("proctor_name"),
    }
