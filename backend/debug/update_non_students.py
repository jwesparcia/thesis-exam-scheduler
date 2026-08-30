import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import User

db = SessionLocal()
count = db.query(User).filter(User.role != 'student').update({User.is_first_login: False})
db.commit()
db.close()
print(f"Updated {count} non-student users successfully")
