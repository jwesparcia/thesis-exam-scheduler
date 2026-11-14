"""Preview or remove empty draft exams while preserving enrolled assignments.

Run `python repair_empty_exam_drafts.py` to preview, or add `--apply` to repair.
Every applied repair saves the removed rows and previous section headcounts.
"""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from types import SimpleNamespace

from sqlalchemy import or_
from sqlalchemy.orm import joinedload

from core import SessionLocal, cache
from core.generation_lock import try_acquire_generation_lock
from model import Exam, Section, ReschedulingRequest, ActivityLog
from routers.catalog import get_exams_attendance_list
from utils.exam_enrollment import ExamEnrollment


def _exam_rows(db):
    return {
        exam.id: {column.name: getattr(exam, column.name) for column in Exam.__table__.columns}
        for exam in db.query(Exam).order_by(Exam.id)
    }


def repair_empty_exam_drafts(db, backup_directory, apply=False):
    """The command caller must hold the global generation reservation."""
    enrollment = ExamEnrollment(db)
    if not enrollment.has_student_accounts:
        raise ValueError("Import student enrollment before repairing exam drafts.")
    attendance = get_exams_attendance_list(
        compact=True, db=db, current_user=SimpleNamespace(role="program_head")
    )["exams"]
    attendance_counts = {exam["exam_id"]: exam["student_count"] for exam in attendance}
    drafts = db.query(Exam).options(joinedload(Exam.section), joinedload(Exam.subject)).filter(
        Exam.status == "draft"
    ).with_for_update(of=Exam).all()
    empty_ids = {
        exam.id for exam in drafts
        if exam.section is not None and exam.subject is not None
        and attendance_counts.get(exam.id) == 0
        and enrollment.total_count(exam.section, exam.subject) == 0
    }
    if empty_ids and db.query(ReschedulingRequest.id).filter(or_(
        ReschedulingRequest.exam_id.in_(empty_ids),
        ReschedulingRequest.rescheduled_exam_id.in_(empty_ids),
    )).first():
        raise ValueError("An empty draft has a rescheduling request. Review that request before removing the draft.")

    sections = {exam.section.id: exam.section for exam in drafts if exam.section is not None}
    updates = [
        {"id": section.id, "name": section.name, "previous_count": section.student_count,
         "enrolled_regular_count": enrollment.regular_count(section)}
        for section in sections.values()
        if section.student_count != enrollment.regular_count(section)
    ]
    report = {"applied": apply, "empty_draft_count": len(empty_ids),
              "section_headcount_updates": len(updates),
              "preserved_two_student_exams": sum(
                  attendance_counts.get(exam.id) == 2 for exam in drafts if exam.id not in empty_ids)}
    if not apply or not (empty_ids or updates):
        return report

    before = _exam_rows(db)
    backup_directory = Path(backup_directory)
    backup_directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup_path = backup_directory / f"empty-exam-drafts-{timestamp}.json"
    with backup_path.open("x", encoding="utf-8") as stream:
        json.dump({"schema_version": 1, "created_at": timestamp,
                   "removed_exams": [before[exam_id] for exam_id in sorted(empty_ids)],
                   "section_counts": updates}, stream, indent=2)

    if empty_ids:
        deleted = db.query(Exam).filter(Exam.status == "draft", Exam.id.in_(empty_ids)).delete(
            synchronize_session=False
        )
        if deleted != len(empty_ids):
            raise RuntimeError("Drafts changed during repair; transaction must be rolled back.")
    for update in updates:
        sections[update["id"]].student_count = update["enrolled_regular_count"]
    db.flush()
    expected = {exam_id: row for exam_id, row in before.items() if exam_id not in empty_ids}
    if _exam_rows(db) != expected:
        raise RuntimeError("An enrolled exam changed during repair; transaction must be rolled back.")
    db.add(ActivityLog(
        action="EXAM_ENROLLMENT_REPAIR",
        details=f"Removed {len(empty_ids)} empty draft exams; synchronized {len(updates)} section headcounts.",
    ))
    db.commit()
    report["backup"] = str(backup_path.resolve())
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    arguments = parser.parse_args()
    lease = try_acquire_generation_lock()
    if lease is None:
        raise RuntimeError("Schedule generation is running. Retry the repair after it finishes.")
    try:
        with SessionLocal() as db:
            try:
                report = repair_empty_exam_drafts(
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
