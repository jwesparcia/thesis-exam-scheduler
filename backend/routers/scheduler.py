from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from database import get_db
from models import Section, Subject, Exam, Room, Timeslot, Teacher
from datetime import datetime, timedelta, time, date
import random

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
def generate_exam_schedule(payload: dict = Body(...), db: Session = Depends(get_db)):
    """Generate synchronized and chronologically ordered exam schedules."""
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
    sections = db.query(Section).filter(
        Section.course_id == course_id,
        Section.year_level_id == year_level_id
    ).all()
    subjects = db.query(Subject).filter(
        Subject.course_id == course_id,
        Subject.year_level_id == year_level_id,
        Subject.semester == semester
    ).all()
    rooms = db.query(Room).all()

    if not sections or not subjects or not rooms:
        raise HTTPException(status_code=404, detail="Missing sections, subjects, or rooms")

    # Use all subjects
    # subjects = subjects[:7]  <-- Removed limit

    # --- Remove old draft exams for this specific course/year/semester ---
    db.query(Exam).filter(
        Exam.course_id == course_id,
        Exam.year_level_id == year_level_id,
        Exam.semester == semester,
        Exam.status == "draft"
    ).delete()
    db.commit()

    # --- Generate schedule ---
    # Exam hours: 7:00 AM – 5:30 PM
    # Each exam = 1h 30m | Max gap between slots = 1h 30m
    TIMESLOTS = [
        ("07:00 AM", "08:30 AM"),   # Slot 1
        ("08:30 AM", "10:00 AM"),   # Slot 2 (back-to-back)
        ("10:00 AM", "11:30 AM"),   # Slot 3 (back-to-back)
        ("01:00 PM", "02:30 PM"),   # Slot 4 (1.5hr lunch break)
        ("02:30 PM", "04:00 PM"),   # Slot 5 (back-to-back)
        ("04:00 PM", "05:30 PM"),   # Slot 6 (back-to-back)
    ]

    exam_days = []
    day_index = 0
    for subject in subjects:
        # Skip weekends (Saturday and Sunday)
        while (start_date + timedelta(days=day_index)).weekday() >= 5:  # 5=Saturday, 6=Sunday
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

    # --- Fetch all teachers who are "real proctors" (linked to User with role="proctor") ---
    from models import User
    proctor_teachers = db.query(Teacher).join(User, User.teacher_id == Teacher.id).filter(User.role == "proctor").all()

    # --- Create exams for each section ---
    created_exams = []
    for section in sections:
        for exam_info in exam_days:
            subject = exam_info["subject"]
            timeslot = exam_info["timeslot"]
            room = random.choice(rooms)

            # Assign a real proctor (not the subject's own teacher, not busy at this timeslot)
            chosen_proctor = None
            candidates = [t for t in proctor_teachers if t.id != subject.teacher_id]
            random.shuffle(candidates)
            for candidate in candidates:
                is_busy = any(
                    e.timeslot_id == timeslot.id and e.proctor_id == candidate.id
                    for e in created_exams
                )
                if not is_busy:
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
    from models import User
    exams_data = []
    for e in created_exams:
        subject = db.query(Subject).filter(Subject.id == e.subject_id).first()
        section = db.query(Section).filter(Section.id == e.section_id).first()
        room = db.query(Room).filter(Room.id == e.room_id).first()
        timeslot = db.query(Timeslot).filter(Timeslot.id == e.timeslot_id).first()
        
        proctor_name = "Unassigned"
        if e.proctor_id:
            # Prefer User.name (professional name) over Teacher.name
            proctor_user = db.query(User).filter(User.teacher_id == e.proctor_id).first()
            if proctor_user:
                proctor_name = proctor_user.name
            else:
                proctor_teacher = db.query(Teacher).filter(Teacher.id == e.proctor_id).first()
                if proctor_teacher:
                    proctor_name = proctor_teacher.name

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

    return {
        "message": f"Generated {len(created_exams)} exams ({len(subjects)} per section) from {start_date} to {end_date}.",
        "exams": exams_data
    }
