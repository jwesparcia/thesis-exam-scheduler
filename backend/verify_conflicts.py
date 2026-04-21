from database import SessionLocal
from models import Exam, Course, YearLevel, Section, Timeslot
from utils.scheduler import generate_exam_schedule
from datetime import date, time

def verify_conflicts():
    db = SessionLocal()
    print("--- Verification: Conflict Prevention ---")
    
    # 1. Ensure we have data
    sections = db.query(Section).all()
    if not sections:
        print("Error: No sections found. Run seed.py first.")
        return

    # 2. Clear all exams
    db.query(Exam).delete()
    db.commit()

    # 3. Create a "Posted" exam to create a potential conflict
    # Pick a section and a slot
    first_sec = sections[0]
    # We need a timeslot. The scheduler creates them dynamically, but let's mock one
    # Note: Timeslot creation in generate_exam_schedule clears unposted ones.
    # To truly test, we should run generate once, post some, then run again.

    print("Phase 1: Generating initial schedule...")
    generate_exam_schedule(db, start_date=date(2026, 3, 9))
    
    # Post exams for the first course
    first_course_id = sections[0].course_id
    drafts = db.query(Exam).filter(Exam.status == "draft", Exam.course_id == first_course_id).all()
    for e in drafts:
        e.status = "posted"
    db.commit()
    print(f"Posted {len(drafts)} exams for course {first_course_id}.")

    # 4. Trigger generation again
    print("Phase 2: Generating second schedule (should avoid conflicts)...")
    generate_exam_schedule(db, start_date=date(2026, 3, 9))

    # 5. Verify Overlaps
    all_exams = db.query(Exam).all()
    conflicts = []
    
    # Check Section Overlaps: (section_id, timeslot_id) must be unique
    seen_section_slots = {}
    for e in all_exams:
        key = (e.section_id, e.timeslot_id)
        if key in seen_section_slots:
            conflicts.append(f"Section {e.section_id} has overlap at slot {e.timeslot_id}")
        seen_section_slots[key] = True

    # Check Room Overlaps: (room_id, timeslot_id) must be unique
    seen_room_slots = {}
    for e in all_exams:
        key = (e.room_id, e.timeslot_id)
        if key in seen_room_slots:
            conflicts.append(f"Room {e.room_id} double-booked at slot {e.timeslot_id}")
        seen_room_slots[key] = True

    # Check Proctor Overlaps: (proctor_id, timeslot_id) must be unique
    seen_proctor_slots = {}
    for e in all_exams:
        key = (e.proctor_id, e.timeslot_id)
        if key in seen_proctor_slots:
            conflicts.append(f"Proctor {e.proctor_id} double-booked at slot {e.timeslot_id}")
        seen_proctor_slots[key] = True

    if conflicts:
        print("FAILED: Conflicts found!")
        for c in conflicts[:10]:
            print(f"  - {c}")
    else:
        print("SUCCESS: No conflicts detected (sections, rooms, or proctors).")

if __name__ == "__main__":
    verify_conflicts()
