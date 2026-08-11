import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import Subject, Section, Exam

db = SessionLocal()
try:
    sec = db.query(Section).filter(Section.name == "BSIT-1A").first()
    if sec:
        print(f"Section BSIT-1A Course: {sec.course_id}, Year Level: {sec.year_level_id}")
        subjects = db.query(Subject).filter(
            Subject.course_id == sec.course_id,
            Subject.year_level_id == sec.year_level_id,
            Subject.exam_type == "written",
            Subject.semester == 1
        ).all()
        print(f"Written subjects for BSIT-1A: {len(subjects)}")
        for s in subjects:
            print(f"  - ID: {s.id} | Name: {s.name} | Category: {s.category}")
            
        exams = db.query(Exam).filter(Exam.section_id == sec.id).all()
        print(f"Scheduled exams for BSIT-1A: {len(exams)}")
        for e in exams:
            print(f"  - Exam ID: {e.id} | Subject: {e.subject.name} | Slot: {e.timeslot.date} {e.timeslot.start_time}")
    else:
        print("BSIT-1A not found")
finally:
    db.close()
