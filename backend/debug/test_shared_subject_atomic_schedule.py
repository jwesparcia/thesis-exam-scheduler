"""Verify that a shared subject is scheduled once across programs.

This uses its own temporary SQLite database.  It deliberately creates
separate subject records (and codes) for two programs with the same subject
name, mirroring the imported curriculum layout.
"""

import os
import sys
import tempfile
from datetime import date, time
from pathlib import Path


fd, temp_name = tempfile.mkstemp(prefix="shared_subject_schedule_", suffix=".db")
os.close(fd)
temp_db = Path(temp_name)
temp_db.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{temp_db.as_posix()}"

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

from core.database import Base, SessionLocal, engine  # noqa: E402
from model import Course, Exam, Proctor, Room, Section, Subject, Teacher, TeacherSchedule, YearLevel  # noqa: E402
from utils import scheduler  # noqa: E402


def run_test(room_names, expected_batch_count, shared_subject_names=("Ethics",)):
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        year_one = YearLevel(name="1st Year")
        bsit = Course(name="BSIT", category="College")
        bscs = Course(name="BSCS", category="College")
        db.add_all([year_one, bsit, bscs])
        db.flush()

        # Three sections per program, all of which require their own 30-seat
        # room.  Each course can still be kept on one floor.
        sections = []
        for course in (bsit, bscs):
            for suffix in range(101, 104):
                section = Section(
                    name=f"{course.name} 1-{suffix}",
                    course_id=course.id,
                    year_level_id=year_one.id,
                    semester=1,
                    student_count=30,
                )
                sections.append(section)
                db.add(section)

        for room_name in room_names:
            db.add(Room(name=room_name, building="B", department="College", capacity=40))

        # Separate catalogue rows and codes, but the same actual exam paper.
        # The spelling difference verifies canonical-name synchronization.
        subjects = []
        for subject_index, subject_name in enumerate(shared_subject_names, start=1):
            subjects.extend([
                Subject(
                    code=f"IT-GE-{subject_index:03d}",
                    name=subject_name,
                    course_id=bsit.id,
                    year_level_id=year_one.id,
                    semester=1,
                    exam_type="written",
                    category="general",
                    duration_minutes=75,
                    term="Midterm",
                ),
                Subject(
                    code=f"CS-GE-{subject_index:03d}",
                    name=f"  {subject_name.lower()}  ",
                    course_id=bscs.id,
                    year_level_id=year_one.id,
                    semester=1,
                    exam_type="written",
                    category="general",
                    duration_minutes=75,
                    term="Midterm",
                ),
            ])
        db.add_all(subjects)

        # Every concurrent exam needs an eligible proctor.
        for index in range(6):
            teacher = Teacher(name=f"Proctor Teacher {index}")
            db.add(teacher)
            db.flush()
            db.add(Proctor(name=f"Proctor {index}", department="ICT", teacher_id=teacher.id))
            for weekday in range(4):
                db.add(TeacherSchedule(
                    teacher_id=teacher.id,
                    day_of_week=weekday,
                    start_time=time(8, 0),
                    end_time=time(17, 0),
                ))
        db.commit()

        # Keep the test quick while still exercising the optimizer and final
        # room allocator.
        scheduler.POP_SIZE = 8
        scheduler.GENERATIONS = 6
        result = scheduler.generate_exam_schedule(
            db,
            start_date=date(2026, 11, 16),
            end_date=date(2026, 11, 19),
            department="College",
            semester=1,
            term="Midterm",
            daily_start_time=time(8, 0),
            daily_end_time=time(16, 45),
        )

        exams = db.query(Exam).filter(Exam.status == "draft").all()
        assert result["total_exams"] == 6 * len(shared_subject_names)
        assert len(exams) == 6 * len(shared_subject_names)
        assert all(exam.room.capacity >= exam.section.student_count for exam in exams)

        exams_by_subject = {}
        for exam in exams:
            canonical_name = " ".join(exam.subject.name.casefold().split())
            exams_by_subject.setdefault(canonical_name, []).append(exam)

        for subject_exams in exams_by_subject.values():
            batch_slots = sorted({
                (exam.timeslot.date, exam.timeslot.start_time, exam.timeslot.end_time)
                for exam in subject_exams
            })
            assert len(batch_slots) == expected_batch_count
            exams_by_slot = {}
            for exam in subject_exams:
                exams_by_slot.setdefault(exam.timeslot_id, []).append(exam)
            assert all(
                len({exam.room_id for exam in batch_exams}) == len(batch_exams)
                for batch_exams in exams_by_slot.values()
            )
            if expected_batch_count > 1:
                # No other exam uses these rooms, so the batch fallback must
                # use the immediately following generated slot, not skip ahead.
                for (previous_date, _, previous_end), (next_date, next_start, _) in zip(batch_slots, batch_slots[1:]):
                    assert next_date == previous_date
                    previous_end_minutes = previous_end.hour * 60 + previous_end.minute
                    next_start_minutes = next_start.hour * 60 + next_start.minute
                    assert next_start_minutes - previous_end_minutes == 15
                assert all(
                    len({exam.course_id for exam in batch_exams}) == 1
                    for batch_exams in exams_by_slot.values()
                )
        print(f"Shared-subject scheduling passed with {expected_batch_count} batch(es) per subject.")
    finally:
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
        temp_db.unlink(missing_ok=True)


if __name__ == "__main__":
    # All six sections fit concurrently: one anti-leakage session.
    run_test(("B401", "B402", "B403", "B501", "B502", "B503"), expected_batch_count=1)
    # Only three rooms: remaining whole-program cohort must continue in the
    # immediately following 75-minute slot, rather than failing or scattering.
    run_test(("B401", "B402", "B403"), expected_batch_count=2)
    # Two shared subjects must each retain their own consecutive room batches.
    run_test(
        ("B401", "B402", "B403"),
        expected_batch_count=2,
        shared_subject_names=("Ethics", "Mathematics in the Modern World"),
    )
