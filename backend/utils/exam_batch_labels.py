"""Read batch labels without modifying saved exam assignments."""

from sqlalchemy import and_, or_
from sqlalchemy.orm import joinedload
from model import Exam, Timeslot, ReschedulingRequest


def get_exam_batch_numbers(db, exams):
    numbers = {exam.id: exam.batch_number or 1 for exam in exams}
    legacy = [exam for exam in exams if exam.batch_number is None and exam.timeslot and exam.subject]
    if not legacy:
        return numbers

    # Look across all participating sections so a student/proctor who sees only
    # Batch 3 still receives that number, rather than a locally renumbered Batch 1.
    scopes = {(exam.semester, exam.term) for exam in legacy}
    rescheduled_ids = db.query(ReschedulingRequest.rescheduled_exam_id).filter(
        ReschedulingRequest.rescheduled_exam_id.isnot(None)
    )
    rows = db.query(Exam).options(
        joinedload(Exam.subject), joinedload(Exam.timeslot), joinedload(Exam.course),
    ).filter(
        or_(*(and_(Exam.semester == semester, Exam.term == term) for semester, term in scopes)),
        Exam.status.in_(["draft", "saved", "posted"]),
        ~Exam.id.in_(rescheduled_ids),
    ).all()
    grouped = {}
    for exam in rows:
        if not exam.subject or not exam.timeslot:
            continue
        name = " ".join(str(exam.subject.name or "").casefold().split()) or f"subject-{exam.subject_id}"
        key = (exam.course.category if exam.course else None, exam.semester, exam.term,
               "posted" if exam.status == "posted" else "pending", name, exam.timeslot.date)
        grouped.setdefault(key, []).append(exam)

    dates = {exam.timeslot.date for exam in legacy}
    slots = db.query(Timeslot).filter(Timeslot.date.in_(dates)).all()
    for group in grouped.values():
        fixed = next((exam.subject for exam in group if exam.subject.is_fixed_timeslot
                      and exam.subject.fixed_start_time and exam.subject.fixed_day), None)
        if not fixed:
            continue
        sittings = sorted({(exam.timeslot.start_time, exam.timeslot.end_time) for exam in group})
        day = group[0].timeslot.date
        start, end = sittings[0]
        duration = (end.hour * 60 + end.minute) - (start.hour * 60 + start.minute)
        day_slots = [slot for slot in slots if slot.date == day and
                     (slot.end_time.hour * 60 + slot.end_time.minute) -
                     (slot.start_time.hour * 60 + slot.start_time.minute) == duration]
        anchor = min(day_slots, key=lambda slot: (
            abs((slot.start_time.hour * 60 + slot.start_time.minute) -
                (fixed.fixed_start_time.hour * 60 + fixed.fixed_start_time.minute)),
            slot.start_time, slot.end_time,
        )).start_time if day_slots else fixed.fixed_start_time
        offset = int(sittings[0][0] > anchor)
        by_sitting = {sitting: index + 1 + offset for index, sitting in enumerate(sittings)}
        for exam in group:
            if exam.id in numbers and exam.batch_number is None:
                numbers[exam.id] = by_sitting[(exam.timeslot.start_time, exam.timeslot.end_time)]
    return numbers
