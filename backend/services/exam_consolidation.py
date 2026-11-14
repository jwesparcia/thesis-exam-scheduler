"""Join irregular-only draft exams to compatible existing class exams."""

from collections import Counter, defaultdict
from types import SimpleNamespace
import hashlib
import json

from sqlalchemy.orm import joinedload

from model import Exam, IrregularSelection, Subject, ReschedulingRequest
from utils.exam_enrollment import subjects_equivalent


def _time(exam):
    slot = exam.timeslot
    return (slot.date, slot.start_time, slot.end_time) if slot else None


def _category(exam):
    return exam.course.category if exam.course else None


def _coverage_fingerprint(attendance):
    coverage = set()
    for row in attendance:
        paper = " ".join(str(row["subject_name"] or "").replace("&", " and ").strip().lower().split())
        for user_id in row["student_ids"]:
            coverage.add((user_id, paper, row["semester"], row["term"], row["status"],
                          row["date_iso"], row["start_time"], row["end_time"]))
    return hashlib.sha256(json.dumps(sorted(coverage, key=repr)).encode()).hexdigest()


def build_consolidation_plan(db, exam_ids=None):
    """Plan same-paper, same-time moves without changing any records.

    Published or other-term assignments and rescheduling requests are protected.
    Virtual room occupancy is updated after every planned student move.
    """
    from routers.catalog import get_exams_attendance_list

    attendance = get_exams_attendance_list(
        compact=True, db=db, current_user=SimpleNamespace(role="program_head")
    )["exams"]
    metadata = {row["exam_id"]: row for row in attendance}
    members = {row["exam_id"]: set(row["student_ids"]) for row in attendance}
    exams = db.query(Exam).options(
        joinedload(Exam.subject), joinedload(Exam.section), joinedload(Exam.course),
        joinedload(Exam.room), joinedload(Exam.timeslot),
    ).with_for_update(of=Exam).all()
    scope_ids = set(exam_ids) if exam_ids is not None else {exam.id for exam in exams if exam.status == "draft"}
    sources = [exam for exam in exams if exam.id in scope_ids and exam.status == "draft"
               and exam.id in metadata and metadata[exam.id]["regular_count"] == 0
               and members[exam.id] and not metadata[exam.id]["is_rescheduled"]]
    sources.sort(key=lambda exam: (exam.id,))
    hosts = defaultdict(list)
    for exam in exams:
        if (exam.id in scope_ids and exam.status == "draft" and exam.id in metadata
                and metadata[exam.id]["regular_count"] > 0 and exam.room and _time(exam)
                and exam.subject and _category(exam)):
            hosts[(exam.semester, exam.term, _time(exam), _category(exam))].append(exam)

    protected_ids = set()
    for source_id, target_id in db.query(ReschedulingRequest.exam_id, ReschedulingRequest.rescheduled_exam_id):
        protected_ids.update(value for value in (source_id, target_id) if value is not None)
    subjects = {subject.id: subject for subject in db.query(Subject)}
    selections = defaultdict(list)
    for row in db.query(IrregularSelection):
        selections[(row.user_id, row.section_id)].append(row)

    # New drafts replace the posted timetable of their own scope. Posted exams
    # elsewhere still contribute to physical room occupancy.
    draft_scopes = {(exam.course_id, exam.semester, exam.term) for exam in exams if exam.status == "draft"}
    room_exams = defaultdict(list)
    for exam in exams:
        if exam.room_id and _time(exam) and (
            exam.status == "draft" or (exam.status == "posted"
                and (exam.course_id, exam.semester, exam.term) not in draft_scopes)
        ):
            room_exams[(exam.room_id, exam.timeslot.date)].append(exam)

    def room_members(target):
        occupants = set()
        for peer in room_exams[(target.room_id, target.timeslot.date)]:
            if max(peer.timeslot.start_time, target.timeslot.start_time) < min(peer.timeslot.end_time, target.timeslot.end_time):
                occupants.update(members.get(peer.id, ()))
        return occupants

    joins, moves = [], []
    reasons = Counter()
    planned_selection_ids = set()
    for source in sources:
        if source.id in protected_ids or not source.subject or not _time(source):
            reasons["rescheduling request or incomplete exam details"] += len(members[source.id])
            continue
        candidates = [host for host in hosts.get(
            (source.semester, source.term, _time(source), _category(source)), ()
        ) if subjects_equivalent(source.subject, host.subject)]
        for user_id in sorted(members[source.id].copy()):
            matching = [selection for selection in selections.get((user_id, source.section_id), ())
                        if selection.subject_id in subjects
                        and subjects_equivalent(subjects[selection.subject_id], source.subject)]
            related_exams = [exam for exam in exams if exam.id != source.id
                             and exam.section_id == source.section_id and exam.subject
                             and (exam.status == "saved" or user_id in members.get(exam.id, ()))
                             and subjects_equivalent(exam.subject, source.subject)]
            if not matching or any(selection.id in planned_selection_ids for selection in matching) or related_exams:
                reasons["other exam assignment requires review"] += 1
                continue
            eligible = []
            for host in candidates:
                # Keep the coverage of an already proctored source exam.
                if source.proctor_id and not host.proctor_id:
                    continue
                occupants = room_members(host)
                capacity = host.room.capacity if host.room.capacity is not None else 40
                if len(occupants | {user_id}) <= capacity:
                    eligible.append((
                        0 if user_id in members[host.id] else 1,
                        0 if host.course_id == source.course_id else 1,
                        0 if host.year_level_id == source.year_level_id else 1,
                        0 if host.proctor_id else 1,
                        len(occupants), host.id, host,
                    ))
            if not eligible:
                reasons["no same-time class with available capacity and compatible proctor coverage"] += 1
                continue
            host = min(eligible, key=lambda item: item[:-1])[-1]
            for selection in matching:
                moves.append({"selection_id": selection.id, "user_id": user_id,
                              "subject_id": selection.subject_id,
                              "from_section_id": source.section_id, "to_section_id": host.section_id})
                planned_selection_ids.add(selection.id)
            joins.append({"user_id": user_id, "from_exam_id": source.id, "to_exam_id": host.id})
            members[source.id].remove(user_id)
            members[host.id].add(user_id)

    removed_ids = [source.id for source in sources if not members[source.id]]
    touched = {join[key] for join in joins for key in ("from_exam_id", "to_exam_id")}
    return {"moves": moves, "joins": joins, "removed_exam_ids": removed_ids,
            "student_schedule_fingerprint": _coverage_fingerprint(attendance),
            "expected_members": {exam_id: sorted(members[exam_id]) for exam_id in touched},
            "remaining_irregular_only_exams": sum(bool(members[source.id]) for source in sources),
            "remaining_reasons": dict(reasons)}


def apply_consolidation_plan(db, plan):
    """Apply a checked plan inside the caller's transaction; never commit here."""
    from routers.catalog import get_exams_attendance_list

    removed_ids = set(plan["removed_exam_ids"])
    for move in plan["moves"]:
        changed = db.query(IrregularSelection).filter(
            IrregularSelection.id == move["selection_id"],
            IrregularSelection.user_id == move["user_id"],
            IrregularSelection.subject_id == move["subject_id"],
            IrregularSelection.section_id == move["from_section_id"],
        ).update({IrregularSelection.section_id: move["to_section_id"]}, synchronize_session=False)
        if changed != 1:
            raise ValueError("Student enrollment changed during consolidation. Retry after refreshing the schedule.")
    if removed_ids:
        for request in db.query(ReschedulingRequest):
            if request.exam_id in removed_ids or request.rescheduled_exam_id in removed_ids:
                raise ValueError("An exam gained a rescheduling request during consolidation. Review it before merging.")
        removed = db.query(Exam).filter(Exam.id.in_(removed_ids), Exam.status == "draft").delete(synchronize_session=False)
        if removed != len(removed_ids):
            raise ValueError("Exam status changed during consolidation. Retry after refreshing the schedule.")
    db.flush()
    attendance = get_exams_attendance_list(
        compact=True, db=db, current_user=SimpleNamespace(role="program_head")
    )["exams"]
    actual = {row["exam_id"]: set(row["student_ids"]) for row in attendance}
    for exam_id, expected in plan["expected_members"].items():
        if actual.get(exam_id, set()) != set(expected):
            raise ValueError("Consolidation changed an unexpected attendance list. The transaction must be rolled back.")
    if _coverage_fingerprint(attendance) != plan["student_schedule_fingerprint"]:
        raise ValueError("Consolidation changed a student's exam paper or time. The transaction must be rolled back.")
    return {"joined_assignments": len(plan["joins"]), "removed_exams": len(removed_ids),
            "remaining_irregular_only_exams": plan["remaining_irregular_only_exams"],
            "remaining_reasons": plan["remaining_reasons"]}
