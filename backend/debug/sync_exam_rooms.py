import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from core import SessionLocal
from model import Exam, Room
from room_data import AVAILABLE_EXAM_ROOM_NAMES


def sync_exam_rooms():
    desired_names = AVAILABLE_EXAM_ROOM_NAMES
    desired_set = set(desired_names)
    db = SessionLocal()

    try:
        rooms = db.query(Room).order_by(Room.id).all()

        if not rooms:
            db.add_all([Room(name=name) for name in desired_names])
            db.commit()
            print(f"Created {len(desired_names)} available exam rooms.")
            return

        existing_by_name = {room.name: room for room in rooms}

        if not all(name in existing_by_name for name in desired_names):
            while len(rooms) < len(desired_names):
                db.add(Room(name=f"__exam_room_temp_{len(rooms) + 1}"))
                db.flush()
                rooms = db.query(Room).order_by(Room.id).all()

            target_rooms = rooms[:len(desired_names)]
            target_ids = {room.id for room in target_rooms}

            for room in rooms:
                if room.id not in target_ids and room.name in desired_set:
                    room.name = f"__old_exam_room_{room.id}"

            for room in target_rooms:
                room.name = f"__exam_room_target_{room.id}"

            db.flush()

            for room, name in zip(target_rooms, desired_names):
                room.name = name

        db.flush()

        deleted = 0
        skipped = 0
        for room in db.query(Room).filter(Room.name.notin_(desired_names)).all():
            has_exam = db.query(Exam.id).filter(Exam.room_id == room.id).first()
            if has_exam:
                skipped += 1
                print(f"Skipped room {room.name}: still referenced by existing exams.")
                continue
            db.delete(room)
            deleted += 1

        db.commit()

        total = db.query(Room).count()
        print(f"Synced available exam rooms. Total rooms: {total}. Deleted unavailable/old rooms: {deleted}. Skipped referenced old rooms: {skipped}.")
    finally:
        db.close()


if __name__ == "__main__":
    sync_exam_rooms()
