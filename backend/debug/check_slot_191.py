import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import Exam, Timeslot, Room, Section, Subject

db = SessionLocal()
try:
    ts_191 = db.query(Timeslot).filter(Timeslot.id == 191).first()
    sub_122 = db.query(Subject).filter(Subject.id == 122).first()
    exams_191 = db.query(Exam).filter(Exam.timeslot_id == 191, Exam.status == 'draft').all()
    print("Exams currently in slot 191:", len(exams_191))
    for e in exams_191:
        print(f"  {e.section.name:15} | {e.subject.name:30} | Room: {e.room.name if e.room else None}")
        
    occupied_rooms = {e.room_id for e in exams_191 if e.room_id}
    all_rooms = db.query(Room).filter(Room.name.like('B%')).all()
    avail = [r for r in all_rooms if r.id not in occupied_rooms]
    print(f"Total available rooms in Building B: {len(avail)}")
    by_fl = {}
    for r in avail:
        fl = int("".join(c for c in r.name if c.isdigit())[0])
        by_fl.setdefault(fl, []).append(r.name)
    print("Available by floor in Building B:")
    for fl in sorted(by_fl):
        print(f"  Floor {fl}: {len(by_fl[fl])} rooms -> {by_fl[fl]}")
finally:
    db.close()
