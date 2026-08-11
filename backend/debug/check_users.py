import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import User

db = SessionLocal()
users = db.query(User).all()
for u in users:
    print(f"Email: {u.email}, Role: {u.role}")
db.close()
