import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from datetime import date
from core import SessionLocal
from model import Exam, Section
from utils.scheduler import generate_exam_schedule

db = SessionLocal()
try:
    print("Running quick test with debug trace...")
    # Let's inspect where subject 132 is assigned
    res = generate_exam_schedule(
        db=db,
        start_date=date(2026, 10, 26),
        end_date=date(2026, 10, 29),
        department="College",
        semester=1,
        term="Midterm"
    )
    e132 = db.query(Exam).filter(Exam.subject_id == 132, Exam.term == "Midterm").all()
    print("Subject 132 exams after run:")
    for e in e132:
        print(f"  {e.section.name}: slot={e.timeslot.date} {e.timeslot.start_time}, room={e.room.name if e.room else None}")
finally:
    db.close()
