import sys
import os
from datetime import date, time
from sqlalchemy import func

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import SessionLocal
from model.models import Exam, Room, Section, User
from utils.scheduler import generate_exam_schedule

def test_capacity_schedule():
    db = SessionLocal()
    try:
        print("Testing generate_exam_schedule for College Semester 1...")
        res = generate_exam_schedule(
            db,
            start_date=date(2026, 10, 19),
            end_date=date(2026, 10, 23),
            department="College",
            semester=1,
            term="Midterm",
            daily_start_time=time(7, 0),
            daily_end_time=time(17, 30),
            progress_callback=lambda p: print(f"[{p['percent']}%] {p['phase']}: {p['detail']}")
        )
        print(f"\nGeneration summary: {res}")
        draft_exams = db.query(Exam).filter(Exam.status == "draft").all()
        print(f"Total draft exams in DB: {len(draft_exams)}")

        user_counts = dict(
            db.query(User.section_name, func.count(User.id))
            .filter(User.role == "student", User.section_name.isnot(None))
            .group_by(User.section_name)
            .all()
        )

        violations = []
        conflicts = []
        room_slots = {}
        for e in draft_exams:
            room = db.query(Room).filter(Room.id == e.room_id).first()
            sec = db.query(Section).filter(Section.id == e.section_id).first()
            ts = e.timeslot
            students = user_counts.get(sec.name, sec.student_count or 35)

            # Capacity check
            if room.capacity < students:
                violations.append({
                    "exam_id": e.id,
                    "section": sec.name,
                    "students": students,
                    "room": room.name,
                    "room_capacity": room.capacity
                })

            # Conflict check: room + date + interval overlap
            for prev_e in draft_exams:
                if prev_e.id >= e.id or prev_e.room_id != e.room_id:
                    continue
                prev_ts = prev_e.timeslot
                if prev_ts.date == ts.date:
                    if max(prev_ts.start_time, ts.start_time) < min(prev_ts.end_time, ts.end_time):
                        conflicts.append((e.id, prev_e.id, room.name, ts.date, prev_ts.start_time, ts.start_time))

        print(f"\n--- RESULTS ---")
        print(f"CAPACITY VIOLATIONS: {len(violations)}")
        if violations:
            print("First 5 violations:")
            for v in violations[:5]:
                print(f"  {v}")
        else:
            print("SUCCESS! All exams satisfy: room.capacity >= section.student_count!")

        print(f"ROOM CONFLICTS: {len(conflicts)}")
        if conflicts:
            print("First 5 conflicts:")
            for c in conflicts[:5]:
                print(f"  {c}")
        else:
            print("SUCCESS! 0 room conflicts found!")

        # Verify capacity 39 rooms specifically (B202, B203, B204)
        rooms_39 = [e for e in draft_exams if db.query(Room).filter(Room.id == e.room_id).first().capacity == 39]
        print(f"\nTotal exams in 39-seat rooms: {len(rooms_39)}")
        students_in_39 = [
            user_counts.get(db.query(Section).filter(Section.id == e.section_id).first().name)
            for e in rooms_39
        ]
        print(f"Max student count in 39-seat rooms: {max(students_in_39) if students_in_39 else 0}")
        print(f"Any 40-student sections in 39-seat rooms? {any(s >= 40 for s in students_in_39)}")

        # Verify 40-student sections
        secs_40 = [name for name, c in user_counts.items() if c >= 40]
        exams_40 = [
            e for e in draft_exams
            if db.query(Section).filter(Section.id == e.section_id).first().name in secs_40
        ]
        capacities_for_40 = [
            db.query(Room).filter(Room.id == e.room_id).first().capacity
            for e in exams_40
        ]
        print(f"\nTotal exams for >=40 student sections: {len(exams_40)}")
        print(f"Min room capacity for >=40 student sections: {min(capacities_for_40) if capacities_for_40 else 0}")
        print(f"Any >=40 student section in <40 room? {any(c < 40 for c in capacities_for_40)}")

    finally:
        db.close()

if __name__ == "__main__":
    test_capacity_schedule()
