import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("ALTER TABLE teacher_schedules ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT FALSE"))
    conn.commit()
    print("Migration complete: 'is_published' column added to teacher_schedules.")
