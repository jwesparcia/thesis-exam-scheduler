import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import SessionLocal
from utils.scheduler import generate_exam_schedule
from models import Proctor, TeacherSchedule
from datetime import date

def debug_proctors():
    db = SessionLocal()
    try:
        proctors = db.query(Proctor).all()
        print(f"Total Proctors: {len(proctors)}")
        scheds = db.query(TeacherSchedule).all()
        print(f"Total Teacher Schedules: {len(scheds)}")
    finally:
        db.close()

if __name__ == "__main__":
    debug_proctors()
