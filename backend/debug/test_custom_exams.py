import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import User, IrregularSelection, Subject, Section, Exam, Timeslot
from sqlalchemy.orm import joinedload
from sqlalchemy import or_

db = SessionLocal()
try:
    user = db.query(User).filter(User.email == "irreg@school.edu").first()
    print(f"User: {user.name} (Type: {user.student_type}, Course ID: {user.course_id})")
    
    selections = db.query(IrregularSelection).filter(IrregularSelection.user_id == user.id).all()
    print(f"Number of selections: {len(selections)}")
    
    selected_subject_ids = [sel.subject_id for sel in selections]
    print(f"Selected subject IDs: {selected_subject_ids}")
    
    selected_subjects = db.query(Subject).filter(Subject.id.in_(selected_subject_ids)).all()
    selected_names = [sub.name for sub in selected_subjects]
    
    all_matching_subjects = db.query(Subject).filter(
        Subject.name.in_(selected_names),
        Subject.exam_type == "written"
    ).all()
    print(f"Found subjects: {list(set([s.name for s in all_matching_subjects]))}")
    
    subject_name_to_ids = {}
    for sub in all_matching_subjects:
        subject_name_to_ids.setdefault(sub.name, []).append(sub.id)
    print(f"subject_name_to_ids mapping: {subject_name_to_ids}")
    
    # Check if there are other subject IDs in the DB with the same name
    all_names = list(subject_name_to_ids.keys())
    db_subjects_with_same_name = db.query(Subject).filter(Subject.name.in_(all_names)).all()
    print(f"Total subjects in DB with these names: {len(db_subjects_with_same_name)}")
    for s in db_subjects_with_same_name:
        print(f"  Subject: {s.name} | ID: {s.id} | Code: {s.code} | Course ID: {s.course_id} | Year Level ID: {s.year_level_id}")

    conditions = []
    for sel in selections:
        subject = db.query(Subject).get(sel.subject_id)
        if subject and subject.name in subject_name_to_ids:
            matching_ids = subject_name_to_ids[subject.name]
            conditions.append(
                (Exam.subject_id.in_(matching_ids)) & (Exam.section_id == sel.section_id)
            )
            print(f"Selection for subject {subject.name}: matching_ids={matching_ids}, section_id={sel.section_id}")
    
    if not conditions:
        print("No conditions built.")
    else:
        # Check posted exams for these conditions
        exams_posted = db.query(Exam).options(
            joinedload(Exam.subject),
            joinedload(Exam.section)
        ).filter(
            Exam.status == "posted",
            or_(*conditions)
        ).all()
        print(f"Found {len(exams_posted)} POSTED exams.")
        for e in exams_posted:
            print(f"  POSTED Exam: ID {e.id} | Subject: {e.subject.name} | Section: {e.section.name} | Status: {e.status}")
            
        # Check ALL exams for these conditions (regardless of status)
        exams_all = db.query(Exam).options(
            joinedload(Exam.subject),
            joinedload(Exam.section)
        ).filter(
            or_(*conditions)
        ).all()
        print(f"Found {len(exams_all)} TOTAL exams (regardless of status).")
        for e in exams_all:
            print(f"  Exam: ID {e.id} | Subject: {e.subject.name} | Section: {e.section.name} | Status: {e.status}")
            
        # Check if there are any exams at all in the system
        total_exams = db.query(Exam).count()
        print(f"Total exams in DB: {total_exams}")
        
finally:
    db.close()
