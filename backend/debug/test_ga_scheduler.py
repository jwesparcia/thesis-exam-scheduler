import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from utils.scheduler import generate_exam_schedule
from datetime import date

def run_test():
    db = SessionLocal()
    try:
        print("Starting GA Schedule Generation...")
        result = generate_exam_schedule(
            db=db,
            start_date=date(2026, 5, 20),
            department="College",
            semester=1
        )
        print("Generation Complete!")
        print(result)
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_test()
