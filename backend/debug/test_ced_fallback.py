import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import Exam, Timeslot, Room, Section, Subject
from utils.scheduler import _room_floor, _room_building_and_floor, _gap_seconds_ok

db = SessionLocal()
try:
    sub = db.query(Subject).filter(Subject.id == 122).first()
    secs = db.query(Section).filter(Section.name.in_(['BSCpE 1-101', 'BSCpE 1-102', 'BSCpE 1-103', 'BSCpE 1-104'])).all()
    rem_cluster = [{"sec_id": s.id, "sec_name": s.name, "student_count": s.student_count, "break_seconds": 900} for s in secs]
    
    ts_191 = db.query(Timeslot).filter(Timeslot.id == 191).first()
    cand_s = 191
    
    # 1. Section conflicts
    for ps in rem_cluster:
        ps_id = ps["sec_id"]
        # exams on 2026-10-29 for ps_id
        day_exams = db.query(Exam).filter(Exam.section_id == ps_id, Exam.subject_id != 122, Exam.status == 'draft').all()
        day_ts = [e.timeslot for e in day_exams if e.timeslot and e.timeslot.date == ts_191.date]
        print(f"Section {ps['sec_name']} day exams:", [(t.start_time, t.end_time) for t in day_ts])
        
        # Check gap-safe
        existing = [(t.start_time.hour*60 + t.start_time.minute, t.end_time.hour*60 + t.end_time.minute, 900) for t in day_ts]
        cand_start = ts_191.start_time.hour*60 + ts_191.start_time.minute
        cand_end = ts_191.end_time.hour*60 + ts_191.end_time.minute
        gap_ok = _gap_seconds_ok(existing, cand_start, cand_end, 900)
        print(f"Section {ps['sec_name']} gap_ok at 191: {gap_ok}")
finally:
    db.close()
