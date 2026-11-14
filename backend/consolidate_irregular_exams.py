"""Preview compatible irregular exam joins, or apply them with --apply."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path

from core import SessionLocal, cache
from core.generation_lock import try_acquire_generation_lock
from model import Exam, IrregularSelection, ActivityLog
from services.exam_consolidation import build_consolidation_plan, apply_consolidation_plan


def _exam_rows(db):
    return {exam.id: {column.name: getattr(exam, column.name) for column in Exam.__table__.columns}
            for exam in db.query(Exam)}


def consolidate_current_drafts(db, backup_directory, apply=False):
    plan = build_consolidation_plan(db)
    report = {"applied": apply, "joined_assignments": len(plan["joins"]),
              "removed_exams": len(plan["removed_exam_ids"]),
              "remaining_irregular_only_exams": plan["remaining_irregular_only_exams"],
              "remaining_reasons": plan["remaining_reasons"]}
    if not apply or not plan["joins"]:
        return report
    before = _exam_rows(db)
    moved_ids = {move["selection_id"] for move in plan["moves"]}
    selections = [{column.name: getattr(selection, column.name) for column in IrregularSelection.__table__.columns}
                  for selection in db.query(IrregularSelection).filter(IrregularSelection.id.in_(moved_ids))]
    backup_directory = Path(backup_directory)
    backup_directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup_path = backup_directory / f"irregular-exam-consolidation-{stamp}.json"
    with backup_path.open("x", encoding="utf-8") as stream:
        json.dump({"schema_version": 1, "created_at": stamp,
                   "previous_selections": selections, "plan": plan,
                   "removed_exams": [before[exam_id] for exam_id in plan["removed_exam_ids"]]},
                  stream, indent=2)
    apply_consolidation_plan(db, plan)
    removed_ids = set(plan["removed_exam_ids"])
    if _exam_rows(db) != {exam_id: row for exam_id, row in before.items() if exam_id not in removed_ids}:
        raise ValueError("An existing exam changed during consolidation. Roll back and review the timetable.")
    db.add(ActivityLog(action="IRREGULAR_EXAM_CONSOLIDATION",
                       details=f"Joined {len(plan['joins'])} student exam assignments; removed {len(removed_ids)} redundant drafts."))
    db.commit()
    report["backup"] = str(backup_path.resolve())
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    arguments = parser.parse_args()
    lease = try_acquire_generation_lock()
    if lease is None:
        raise RuntimeError("Schedule generation is running. Retry consolidation after it finishes.")
    try:
        with SessionLocal() as db:
            try:
                report = consolidate_current_drafts(
                    db, Path(__file__).resolve().parent.parent / "data" / "backups", arguments.apply
                )
            except Exception:
                db.rollback()
                raise
        if arguments.apply:
            cache.connect()
            try:
                cache.invalidate_exam_schedules()
                cache.invalidate_catalog()
            finally:
                cache.disconnect()
        print(json.dumps(report, indent=2))
    finally:
        lease.release()


if __name__ == "__main__":
    main()
