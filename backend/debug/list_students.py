import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import User

db = SessionLocal()
students = db.query(User).filter(User.role == "student").all()

print(f"{'Name':<40} | {'Email':<45} | {'Section':<20}")
print("-" * 110)
for s in sorted(students, key=lambda x: x.name):
    print(f"{s.name:<40} | {s.email:<45} | {s.section_name:<20}")

db.close()
