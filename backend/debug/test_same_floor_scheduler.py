import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from datetime import date
from core import SessionLocal
from model import Exam, Section, Subject
from utils.scheduler import generate_exam_schedule

def run():
    db = SessionLocal()
    try:
        print("Running generate_exam_schedule for College, semester=1, term=Midterm...")
        def on_progress(p):
            print(f"[{p.get('percent', 0)}%] {p.get('phase', '')}: {p.get('detail', '')}")

        res = generate_exam_schedule(
            db=db,
            start_date=date(2026, 10, 26),
            end_date=date(2026, 10, 29),
            department="College",
            semester=1,
            term="Midterm",
            progress_callback=on_progress
        )
        print("Schedule generated successfully!")
        
        # Check BSCpE 1-101 and BSCpE 1-104
        s1 = db.query(Section).filter(Section.name == "BSCpE 1-101").first()
        s4 = db.query(Section).filter(Section.name == "BSCpE 1-104").first()
        
        e1_list = db.query(Exam).filter(Exam.section_id == s1.id).all()
        e4_list = db.query(Exam).filter(Exam.section_id == s4.id).all()
        
        print("\n=== BSCpE 1-101 vs BSCpE 1-104 Comparison ===")
        e4_by_sub = {e.subject.name: e for e in e4_list}
        all_passed = True
        for e1 in e1_list:
            sub_name = e1.subject.name
            e4 = e4_by_sub.get(sub_name)
            if not e4:
                print(f"Subject {sub_name}: BSCpE 1-104 has no exam!")
                continue
            
            same_time = (e1.timeslot.date == e4.timeslot.date and e1.timeslot.start_time == e4.timeslot.start_time)
            r1_name = e1.room.name if e1.room else "None"
            r4_name = e4.room.name if e4.room else "None"
            
            r1_digits = "".join(c for c in r1_name if c.isdigit())
            r4_digits = "".join(c for c in r4_name if c.isdigit())
            f1 = int(r1_digits[0]) if r1_digits else -1
            f4 = int(r4_digits[0]) if r4_digits else -1
            
            same_floor = (f1 == f4)
            status = "PASS (Same Floor)" if same_floor else "FAIL (Different Floors!)"
            if not same_time:
                status = f"DIFF TIME ({e1.timeslot.start_time} vs {e4.timeslot.start_time})"
            elif not same_floor:
                all_passed = False
                
            print(f"{sub_name[:32]:32} | Time: {e1.timeslot.date} {str(e1.timeslot.start_time)[:5]} | 1-101: {r1_name} (Fl {f1}) | 1-104: {r4_name} (Fl {f4}) | {status}")
            
        print("\nAll same-time exams on same floor?", all_passed)
    finally:
        db.close()

if __name__ == "__main__":
    run()
