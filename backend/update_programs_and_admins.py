"""Apply the BA/BAPSYCH labels and separate BM/THM logins in place."""

import json

from core import SessionLocal, cache
from core.generation_lock import try_acquire_generation_lock
from model import Exam, Subject, Timeslot
from routers.auth import hash_password
from services.program_updates import ensure_separate_bm_thm_admins, rename_programs


def schedule_snapshot(db):
    """Verify that this metadata update leaves every timetable value intact."""
    return {
        model.__tablename__: [tuple(row) for row in db.query(*model.__table__.columns).order_by(model.id).all()]
        for model in (Exam, Timeslot, Subject)
    }


def apply_updates():
    lease = try_acquire_generation_lock()
    if lease is None:
        raise RuntimeError("Wait for the active schedule generation to finish before updating program labels and administrators.")
    try:
        with SessionLocal() as db:
            before = schedule_snapshot(db)
            counts = rename_programs(db)
            created = ensure_separate_bm_thm_admins(db, hash_password)
            if schedule_snapshot(db) != before:
                raise RuntimeError("Update stopped because timetable or subject values changed unexpectedly.")
            db.commit()
        if cache.connect():
            cache.invalidate_catalog()
            cache.delete("departments:all")
        return {"renamed": counts, "created_admins": created, "schedule_preserved": True}
    finally:
        lease.release()


if __name__ == "__main__":
    print(json.dumps(apply_updates(), indent=2))
