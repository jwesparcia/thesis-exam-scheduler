from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from core import get_db, cache
from model import Section, Subject, Exam, Room, Timeslot, Teacher, Exam, DistributionRule, User, Proctor, ProctorAvailability, TeacherTeaching, Course
from room_data import get_room_names_for_department
from datetime import datetime, timedelta, time, date
import random
from .auth import get_current_user, require_role
from .exams import is_generation_ongoing
from utils.logging import log_activity

router = APIRouter(prefix="/scheduler", tags=["Scheduler"])

# ---------- Parameters ----------
POPULATION_SIZE = 30
GENERATIONS = 80
MUTATION_RATE = 0.1
EXAM_DURATION = timedelta(hours=1, minutes=30)
SCHOOL_START = time(8, 0)
SCHOOL_END = time(18, 0)

# ---------- API Endpoint ----------
@router.post("/generate")
def generate_exam_schedule(payload: dict = Body(...), db: Session = Depends(get_db), current_user: User = Depends(require_role(["admin"]))):
    """Generate synchronized and chronologically ordered exam schedules."""
    if is_generation_ongoing():
        raise HTTPException(status_code=400, detail="Schedule generation is already running. Please wait for it to complete.")
    course_id = payload.get("course_id")
    year_level_id = payload.get("year_level_id")
    semester = payload.get("semester")
    start_date_str = payload.get("start_date")
    end_date_str = payload.get("end_date")

    if not start_date_str or not end_date_str:
        raise HTTPException(status_code=400, detail="Start and end dates are required")

    start_date = datetime.strptime(start_date_str, "%Y-%m-%d").date()
    end_date = datetime.strptime(end_date_str, "%Y-%m-%d").date()
    total_days = (end_date - start_date).days + 1

    # --- Fetch data ---
    from sqlalchemy import or_
    sections = db.query(Section).filter(
        Section.course_id == course_id,
        Section.year_level_id == year_level_id,
        or_(Section.semester == semester, Section.semester.is_(None))
    ).all()
    subjects = db.query(Subject).filter(
        Subject.course_id == course_id,
        Subject.year_level_id == year_level_id,
        Subject.semester == semester
    ).all()
    course = db.query(Course).filter(Course.id == course_id).first()
    category = course.category if course else None
    room_query = db.query(Room).filter(Room.name != "Consultation Area")
    if category == "College":
        room_query = room_query.filter(or_(Room.department == "College", Room.building == "B"))
    elif category == "SHS":
        room_query = room_query.filter(or_(Room.department == "SHS", Room.building == "C"))
    elif category:
        room_query = room_query.filter(Room.department == category)
    rooms = room_query.order_by(Room.name).all()
    if not rooms:
        room_names = get_room_names_for_department(category, db=db)
        rooms = db.query(Room).filter(Room.name.in_(room_names)).order_by(Room.name).all()

    if not sections or not subjects or not rooms:
        raise HTTPException(status_code=404, detail="Missing sections, subjects, or available rooms")

    # Use all subjects
    # subjects = subjects[:7]  <-- Removed limit

    # --- Remove old draft exams for this specific course/year/semester ---
    # First delete any rescheduling requests referencing these exams (FK constraint)
    from model import ReschedulingRequest
    draft_exam_ids = [
        row[0] for row in db.query(Exam.id).filter(
            Exam.course_id == course_id,
            Exam.year_level_id == year_level_id,
            Exam.semester == semester,
            Exam.status == "draft"
        ).all()
    ]
    if draft_exam_ids:
        db.query(ReschedulingRequest).filter(
            ReschedulingRequest.exam_id.in_(draft_exam_ids)
        ).delete(synchronize_session=False)
    db.query(Exam).filter(
        Exam.course_id == course_id,
        Exam.year_level_id == year_level_id,
        Exam.semester == semester,
        Exam.status == "draft"
    ).delete()
    db.commit()

    # --- Generate schedule ---
    # Exam hours: 7:00 AM – 5:30 PM
    # Each exam = 1h 30m (Continuous, no lunch break)
    TIMESLOTS = [
        ("07:00 AM", "08:30 AM"),   # Slot 1
        ("08:30 AM", "10:00 AM"),   # Slot 2 (back-to-back)
        ("10:00 AM", "11:30 AM"),   # Slot 3 (back-to-back)
        ("11:30 AM", "01:00 PM"),   # Slot 4 (back-to-back, no lunch gap)
        ("01:00 PM", "02:30 PM"),   # Slot 5 (back-to-back)
        ("02:30 PM", "04:00 PM"),   # Slot 6 (back-to-back)
        ("04:00 PM", "05:30 PM"),   # Slot 7 (back-to-back)
    ]

    exam_days = []
    day_index = 0
    for subject in subjects:
        # Skip Sunday (6)
        while (start_date + timedelta(days=day_index)).weekday() == 6:  # 6=Sunday
            day_index += 1

        exam_date = start_date + timedelta(days=day_index % total_days)
        start_str, end_str = TIMESLOTS[len(exam_days) % len(TIMESLOTS)]
        start_time = datetime.strptime(start_str, "%I:%M %p").time()
        end_time = datetime.strptime(end_str, "%I:%M %p").time()

        timeslot = Timeslot(date=exam_date, start_time=start_time, end_time=end_time)
        db.add(timeslot)
        db.flush()

        exam_days.append({
            "subject": subject,
            "timeslot": timeslot
        })

        if len(exam_days) % 2 == 0:
            day_index += 1

    # --- Fetch all eligible proctors (not excluded, with uploaded weekly class schedule) ---
    from model import Proctor, TeacherSchedule
    from utils.scheduler import validate_proctor_availability
    all_proctors = db.query(Proctor).filter(Proctor.exclude_from_scheduling == False).all()
    proctor_candidates_pool = []
    for p in all_proctors:
        if p.teacher_id:
            sched_count = db.query(TeacherSchedule).filter(TeacherSchedule.teacher_id == p.teacher_id).count()
            if sched_count > 0:
                proctor_candidates_pool.append(p)

    # --- Create exams for each section ---
    created_exams = []
    for section in sections:
            subject = exam_info["subject"]
            timeslot = exam_info["timeslot"]
            
            # Ensure unique room assignment per timeslot
            used_room_ids = {e.room_id for e in created_exams if e.timeslot_id == timeslot.id}
            available_rooms = [r for r in rooms if r.id not in used_room_ids]
            if not available_rooms:
                raise HTTPException(
                    status_code=400,
                    detail=f"No available room remaining in timeslot {timeslot.date} {timeslot.start_time}."
                )
            room = random.choice(available_rooms)

            # Assign an eligible proctor (schedule uploaded, available for timeslot date/hours, not subject teacher, not busy)
            chosen_proctor = None
            candidates = [p for p in proctor_candidates_pool if p.teacher_id != subject.teacher_id]
            random.shuffle(candidates)
            for candidate in candidates:
                is_busy = any(
                    e.timeslot_id == timeslot.id and e.proctor_id == candidate.id
                    for e in created_exams
                )
                if is_busy:
                    continue
                # Check maximum 2 consecutive assignments rule
                cand_exams = [
                    e for e in created_exams
                    if e.proctor_id == candidate.id and e.timeslot_id and e.timeslot_id == timeslot.id or (
                        e.proctor_id == candidate.id and hasattr(e, "timeslot") and e.timeslot and e.timeslot.date == timeslot.date
                    )
                ]
                if cand_exams:
                    cand_day_exams = sorted(
                        [e for e in cand_exams if hasattr(e, "timeslot") and e.timeslot and e.timeslot.date == timeslot.date],
                        key=lambda e: e.timeslot.start_time
                    )
                    streak = 0
                    prev_end = None
                    for ce in cand_day_exams:
                        ce_start = ce.timeslot.start_time.hour * 60 + ce.timeslot.start_time.minute
                        ce_end = ce.timeslot.end_time.hour * 60 + ce.timeslot.end_time.minute
                        if prev_end is not None and 0 <= (ce_start - prev_end) <= 30:
                            streak += 1
                        else:
                            streak = 1
                        prev_end = ce_end
                    ts_start_m = timeslot.start_time.hour * 60 + timeslot.start_time.minute
                    if prev_end is not None and 0 <= (ts_start_m - prev_end) <= 30 and streak >= 2:
                        continue  # Skip: maximum 2 consecutive assignments reached
                is_avail, _ = validate_proctor_availability(
                    db,
                    proctor_id=candidate.id,
                    target_date=timeslot.date,
                    target_start=timeslot.start_time,
                    target_end=timeslot.end_time
                )
                if is_avail:
                    chosen_proctor = candidate
                    break

            new_exam = Exam(
                section_id=section.id,
                subject_id=subject.id,
                room_id=room.id,
                timeslot_id=timeslot.id,
                course_id=course_id,
                year_level_id=year_level_id,
                semester=semester,
                status="draft",
                proctor_id=chosen_proctor.id if chosen_proctor else None
            )
            db.add(new_exam)
            created_exams.append(new_exam)

    db.commit()

    # --- Format response ---
    exams_data = []
    for e in created_exams:
        subject = db.query(Subject).filter(Subject.id == e.subject_id).first()
        section = db.query(Section).filter(Section.id == e.section_id).first()
        room = db.query(Room).filter(Room.id == e.room_id).first()
        timeslot = db.query(Timeslot).filter(Timeslot.id == e.timeslot_id).first()
        
        proctor_name = "Unassigned"
        if e.proctor_id:
            proctor_obj = db.query(Proctor).filter(Proctor.id == e.proctor_id).first()
            if proctor_obj:
                proctor_name = proctor_obj.name

        day_name = timeslot.date.strftime("%A")
        date_str = timeslot.date.strftime("%B %d, %Y")
        full_date = f"{day_name}, {date_str}"

        exams_data.append({
            "id": e.id,
            "subject_code": subject.code,
            "subject_name": subject.name,
            "course_name": subject.course.name if subject.course else "Unknown",
            "year_level": subject.year_level.name if subject.year_level else "-",
            "semester": semester,
            "section_name": section.name,
            "exam_date": full_date,
            "start_time": timeslot.start_time.strftime("%I:%M %p"),
            "end_time": timeslot.end_time.strftime("%I:%M %p"),
            "room": room.name,
            "proctor": proctor_name
        })

    def parse_exam_datetime(exam):
        try:
            dt = datetime.strptime(exam["exam_date"].split(", ")[1], "%B %d, %Y")
            st = datetime.strptime(exam["start_time"], "%I:%M %p").time()
            return (dt, st)
        except:
            return (datetime.max, time.max)

    exams_data.sort(key=parse_exam_datetime)

    log_activity(db, current_user.id, "LEGACY_SCHEDULER_GENERATE", f"Course: {course_id}, Year: {year_level_id}, Sem: {semester}")
    # ── invalidate schedule caches ────────────────────────────────────
    cache.invalidate_exam_schedules()
    return {
        "message": f"Generated {len(created_exams)} exams ({len(subjects)} per section) from {start_date} to {end_date}.",
        "exams": exams_data
    }
