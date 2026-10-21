import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import SessionLocal
from model.models import TeacherSchedule, Proctor, Timeslot, Exam

db = SessionLocal()
exams = db.query(Exam).filter(Exam.proctor_id.isnot(None)).all()
print(f"Found {len(exams)} exams with assigned proctors:")
for e in exams:
    ts = e.timeslot
    p = e.proctor
    day_name = ts.date.strftime("%A") if ts and ts.date else "No date"
    dow = ts.date.weekday() if ts and ts.date else -1
    print(f"\nExam {e.id}: Date {ts.date if ts else None} ({day_name}, DOW={dow}) {ts.start_time if ts else None}-{ts.end_time if ts else None}, Proctor: {p.id} ({p.name})")
    if p and p.teacher_id:
        scheds = db.query(TeacherSchedule).filter(TeacherSchedule.teacher_id == p.teacher_id).all()
        for s in scheds:
            print(f"   Schedule: DOW={s.day_of_week} {s.start_time}-{s.end_time} sub={s.subject_name}")
db.close()
