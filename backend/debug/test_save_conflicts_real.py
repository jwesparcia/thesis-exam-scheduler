import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import requests
from database import SessionLocal
from models import Exam, User, IrregularSelection, Subject, Section, Timeslot
from sqlalchemy.orm import joinedload

def run_conflict_seeding():
    db = SessionLocal()
    try:
        # Find all posted exams and their timeslots
        exams = db.query(Exam).options(
            joinedload(Exam.timeslot),
            joinedload(Exam.subject),
            joinedload(Exam.section)
        ).filter(Exam.status == "posted").all()
        
        # Group exams by timeslot (date, start_time, end_time) to find overlaps
        overlapping_exams = {}
        for e in exams:
            if not e.timeslot:
                continue
            key = (e.timeslot.date, e.timeslot.start_time, e.timeslot.end_time)
            overlapping_exams.setdefault(key, []).append(e)
            
        conflict_pair = None
        for key, exam_list in overlapping_exams.items():
            if len(exam_list) >= 2:
                # We need two exams that have different subject names!
                for i in range(len(exam_list)):
                    for j in range(i+1, len(exam_list)):
                        e1 = exam_list[i]
                        e2 = exam_list[j]
                        if e1.subject.name != e2.subject.name:
                            conflict_pair = (e1, e2)
                            break
                    if conflict_pair:
                        break
            if conflict_pair:
                break
                
        if not conflict_pair:
            print("No overlapping exams with different subject names found in the database. Creating a mock conflict timeslot...")
            # Let's find two subjects and two sections, and put their exams in the same timeslot!
            subjects = db.query(Subject).all()
            sections = db.query(Section).all()
            timeslots = db.query(Timeslot).all()
            if len(subjects) >= 2 and len(sections) >= 2 and timeslots:
                # Create overlapping exams for testing
                e1 = db.query(Exam).filter(Exam.subject_id == subjects[0].id).first()
                if not e1:
                    e1 = Exam(subject_id=subjects[0].id, section_id=sections[0].id, status="posted", timeslot_id=timeslots[0].id, course_id=subjects[0].course_id, year_level_id=subjects[0].year_level_id, semester=1)
                    db.add(e1)
                else:
                    e1.timeslot_id = timeslots[0].id
                    e1.status = "posted"
                    
                e2 = db.query(Exam).filter(Exam.subject_id == subjects[1].id).first()
                if not e2:
                    e2 = Exam(subject_id=subjects[1].id, section_id=sections[1].id, status="posted", timeslot_id=timeslots[0].id, course_id=subjects[1].course_id, year_level_id=subjects[1].year_level_id, semester=1)
                    db.add(e2)
                else:
                    e2.timeslot_id = timeslots[0].id
                    e2.status = "posted"
                db.commit()
                db.refresh(e1)
                db.refresh(e2)
                conflict_pair = (e1, e2)
                print(f"Created mock conflict: Exam {e1.id} ({e1.subject.name}) and Exam {e2.id} ({e2.subject.name}) on timeslot {timeslots[0].id}")
            else:
                print("Not enough subjects, sections, or timeslots to create a mock conflict.")
                return
                
        e1, e2 = conflict_pair
        print(f"Found conflicting pair:")
        print(f"  - Exam 1 ID: {e1.id} | Subject: {e1.subject.name} | Section: {e1.section.name} (Section ID: {e1.section_id}) | Time: {e1.timeslot.start_time} - {e1.timeslot.end_time}")
        print(f"  - Exam 2 ID: {e2.id} | Subject: {e2.subject.name} | Section: {e2.section.name} (Section ID: {e2.section_id}) | Time: {e2.timeslot.start_time} - {e2.timeslot.end_time}")
        
        # Save these two subjects/sections for the irregular student
        user = db.query(User).filter(User.email == "irreg@school.edu").first()
        if not user:
            print("Irregular student not found.")
            return
            
        # Clear existing selections
        db.query(IrregularSelection).filter(IrregularSelection.user_id == user.id).delete()
        
        # Add new selections
        sel1 = IrregularSelection(user_id=user.id, subject_id=e1.subject_id, section_id=e1.section_id)
        sel2 = IrregularSelection(user_id=user.id, subject_id=e2.subject_id, section_id=e2.section_id)
        db.add(sel1)
        db.add(sel2)
        db.commit()
        print("Successfully saved conflicting selections for irregular student!")
        
        # Now let's trigger the HTTP requests to test if conflict is returned!
        BASE_URL = "http://localhost:8000"
        print("\nLogging in to backend HTTP API...")
        login_res = requests.post(f"{BASE_URL}/auth/login", json={
            "email": "irreg@school.edu",
            "password": "student123"
        })
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        print("Querying /student/conflicts...")
        conflicts_res = requests.get(f"{BASE_URL}/student/conflicts", headers=headers)
        print(f"Response: {conflicts_res.json()}")
        
    finally:
        db.close()

if __name__ == "__main__":
    run_conflict_seeding()
