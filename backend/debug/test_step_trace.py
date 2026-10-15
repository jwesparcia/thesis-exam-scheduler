import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import Exam, Timeslot, Room, Section, Subject

db = SessionLocal()
try:
    ts_191 = db.query(Timeslot).filter(Timeslot.id == 191).first()
    # Exams at 191 EXCLUDING subject 122
    other_exams = db.query(Exam).filter(Exam.timeslot_id == 191, Exam.subject_id != 122, Exam.status == 'draft').all()
    occupied_rooms = {e.room_id for e in other_exams if e.room_id}
    
    all_rooms = db.query(Room).filter(Room.name.like('B%')).all()
    avail = [r for r in all_rooms if r.id not in occupied_rooms]
    
    by_fl = {}
    for r in avail:
        fl = int("".join(c for c in r.name if c.isdigit())[0])
        by_fl.setdefault(fl, []).append(r)
        
    print("Available floors with >= 4 rooms:")
    for fl, r_list in by_fl.items():
        if len(r_list) >= 4:
            print(f"  Floor {fl}: {len(r_list)} rooms")
finally:
    db.close()
