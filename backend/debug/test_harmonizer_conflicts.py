import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from core.database import SessionLocal
from model.models import Exam, Room, Timeslot
from utils.scheduler import generate_exam_schedule

db = SessionLocal()

# Let's count how many conflicts currently exist in DB:
all_exams = db.query(Exam).all()
conflicts = []
for i in range(len(all_exams)):
    e1 = all_exams[i]
    if not e1.room_id or not e1.timeslot: continue
    for j in range(i + 1, len(all_exams)):
        e2 = all_exams[j]
        if not e2.room_id or not e2.timeslot: continue
        if e1.room_id == e2.room_id and e1.timeslot.date == e2.timeslot.date:
            if max(e1.timeslot.start_time, e2.timeslot.start_time) < min(e1.timeslot.end_time, e2.timeslot.end_time):
                conflicts.append((e1, e2))

print(f"Current conflicts in DB: {len(conflicts)}")
db.close()
