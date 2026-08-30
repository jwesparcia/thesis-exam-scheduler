import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core import SessionLocal
from model import User

def run_update():
    db = SessionLocal()
    try:
        count = db.query(User).update({User.is_first_login: True})
        db.commit()
        print(f"Successfully updated {count} users to have is_first_login = True.")
    except Exception as e:
        db.rollback()
        print(f"Error updating users: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    run_update()
