import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal
from models import User, IrregularSelection, Subject, Section

db = SessionLocal()
irreg_user = db.query(User).filter(User.email == "irreg@school.edu").first()
if not irreg_user:
    print("Irregular user not found")
else:
    print(f"Irregular Student: {irreg_user.name} (ID: {irreg_user.id})")
    selections = db.query(IrregularSelection).filter(IrregularSelection.user_id == irreg_user.id).all()
    print(f"Total Selections saved: {len(selections)}")
    for sel in selections:
        sub = db.query(Subject).filter(Subject.id == sel.subject_id).first()
        sec = db.query(Section).filter(Section.id == sel.section_id).first()
        sub_name = sub.name if sub else "NONE"
        sub_code = sub.code if sub else "NONE"
        sec_name = sec.name if sec else "NONE"
        print(f"  Selection ID: {sel.id} | Subject ID: {sel.subject_id} ({sub_code} - {sub_name}) | Section ID: {sel.section_id} ({sec_name})")

db.close()
