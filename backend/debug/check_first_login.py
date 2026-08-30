import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import User

db = SessionLocal()
users = db.query(User).filter(User.role == 'student').limit(5).all()
print("Checking Student First Login Flags:")
for u in users:
    print(f"Name: {u.name}, Email: {u.email}, Role: {u.role}, First Login: {getattr(u, 'is_first_login', 'COLUMN NOT FOUND')}")

admins = db.query(User).filter(User.role == 'program_head').all()
print("\nChecking Admin First Login Flags:")
for a in admins:
    print(f"Name: {a.name}, Email: {a.email}, Role: {a.role}, First Login: {getattr(a, 'is_first_login', 'COLUMN NOT FOUND')}")

db.close()
