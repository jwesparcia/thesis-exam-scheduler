import sys
import os
sys.path.append(os.getcwd())

from database import SessionLocal
from models import Exam, Subject, Timeslot
from utils.scheduler import schedule_exams
from sqlalchemy import func

def verify_schedule():
    db = SessionLocal()
    
    print("1. Running Scheduler for BSIT 1st Year...")
    # BSIT = 1, 1st Year = 1, Semester = 1 (assuming seed data)
    schedule_exams(db, 1, 1, 1)
    
    print("2. Verifying Rules...")
    exams = db.query(Exam).join(Subject).join(Timeslot).filter(
        Exam.course_id == 1,
        Exam.year_level_id == 1,
        Exam.semester == 1,
        Exam.status == "draft" # schedule_exams modifies draft exams
    ).all()
    
    bsit_1a_exams = [e for e in exams if e.section.name == "BSIT-1A"]
    print(f"BSIT-1A has {len(bsit_1a_exams)} exams scheduled.")
    
    for e in bsit_1a_exams:
        print(f"  - {e.subject.name} ({e.subject.exam_type}) -> {e.timeslot.date} {e.timeslot.start_time} @ {e.room.name} with {e.proctor.name if e.proctor else 'No Proctor'}")
        
        # Check specific rules
        if "Math" in e.subject.name or "Science" in e.subject.name:
            assert e.timeslot.start_time.hour < 12, f"FAIL: Math/Science {e.subject.name} should be in morning"
        
        if e.subject.exam_type == "practical":
             print(f"  WARNING: Practical subject {e.subject.name} should NOT be scheduled by this scheduler (unless we allowed it).")

    print("\n3. Checking Proctor Conflicts...")
    proctor_counts = db.query(Exam.proctor_id, Exam.timeslot_id, func.count(Exam.id))\
        .group_by(Exam.proctor_id, Exam.timeslot_id)\
        .having(func.count(Exam.id) > 1).all()
        
    if proctor_counts:
        print("FAIL: Found proctors assigned to multiple exams in same slot:") 
        for p in proctor_counts:
            print(p)
    else:
        print("PASS: No proctor conflicts.")

    print("\nVerification Complete.")

if __name__ == "__main__":
    verify_schedule()
