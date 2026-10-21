import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.database import SessionLocal
from model import User, IrregularSelection, Subject, Section

db = SessionLocal()
test_emails = [
    'castro_02000240628_@ortigas-cainta.sti.edu',
    'tan_02000545526_@ortigas-cainta.sti.edu',
    'aquino_02000443670_@ortigas-cainta.sti.edu',
    'mercado_02000789931_@ortigas-cainta.sti.edu',
    'delrosario_02000172400_@ortigas-cainta.sti.edu',
    'garcia_02000299414_@ortigas-cainta.sti.edu'
]

for email in test_emails:
    u = db.query(User).filter(User.email == email).first()
    if u:
        sels = db.query(IrregularSelection).filter(IrregularSelection.user_id == u.id).all()
        print(f"\n{u.name} ({u.email}): {len(sels)} enrolled subjects in DB")
        for s in sels:
            sub = db.query(Subject).filter(Subject.id == s.subject_id).first()
            sec = db.query(Section).filter(Section.id == s.section_id).first() if s.section_id else None
            sub_name = sub.name if sub else '?'
            sec_name = sec.name if sec else 'No Section'
            print(f"   - {sub_name} [{sec_name}] (sem={sub.semester if sub else '?'}, type={sub.exam_type if sub else '?'})")

db.close()
