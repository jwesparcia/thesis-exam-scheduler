import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal
from models import Subject, Section, Course

def check_scale():
    db = SessionLocal()
    try:
        subjects = db.query(Subject).join(Course).filter(
            Subject.exam_type == "written",
            Course.category == "College",
            Subject.semester == 1
        ).all()
        sections = db.query(Section).join(Course).filter(Course.category == "College").all()
        
        shared_subject_groups = {}
        for sub in subjects:
            shared_subject_groups.setdefault(sub.name, []).append(sub)
            
        print(f"College Semester 1 Subjects: {len(subjects)}")
        print(f"College Sections: {len(sections)}")
        print(f"Unique subject groups to schedule: {len(shared_subject_groups)}")
        
    finally:
        db.close()

if __name__ == "__main__":
    check_scale()
