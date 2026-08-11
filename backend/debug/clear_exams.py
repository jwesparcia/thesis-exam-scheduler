import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import Exam

def clear_exams():
    db = SessionLocal()
    try:
        num_deleted = db.query(Exam).delete()
        db.commit()
        print(f"Deleted {num_deleted} exams.")
    finally:
        db.close()

if __name__ == "__main__":
    clear_exams()
