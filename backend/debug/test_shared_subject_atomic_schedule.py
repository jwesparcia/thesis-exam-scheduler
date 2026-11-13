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


def run_test(
    room_names,
    shared_subject_names=("Ethics",),
    sections_per_course=3,
    expect_failure=False,
    second_program_duration=None,
    expect_consecutive_pair=False,
):
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
            for suffix in range(101, 101 + sections_per_course):
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
                    duration_minutes=second_program_duration or 75,
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
        try:
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
        except ValueError as exc:
            if not expect_failure:
                raise
            assert "one date and time" in str(exc)
            print("Shared-subject capacity failure correctly prevented a split schedule.")
            return

        if expect_failure:
            raise AssertionError("Expected shared-subject scheduling to reject a split session.")

        exams = db.query(Exam).filter(Exam.status == "draft").all()
        expected_exam_count = 2 * sections_per_course * len(shared_subject_names)
        assert result["total_exams"] == expected_exam_count
        assert len(exams) == expected_exam_count
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
            assert len(batch_slots) == 1
            exams_by_slot = {}
            for exam in subject_exams:
                exams_by_slot.setdefault(exam.timeslot_id, []).append(exam)
            assert all(
                len({exam.room_id for exam in batch_exams}) == len(batch_exams)
                for batch_exams in exams_by_slot.values()
            )

        # A section may take several papers on the same day.  The preferred
        # pattern is the mandatory 15-minute continuation; when capacity makes
        # that impossible, the scheduler may use a longer wait but never more
        # than the approved 1 hour 15 minute maximum.
        exams_by_section_and_day = {}
        for exam in exams:
            exams_by_section_and_day.setdefault(
                (exam.section_id, exam.timeslot.date), []
            ).append(exam)
        for day_exams in exams_by_section_and_day.values():
            day_exams.sort(key=lambda exam: exam.timeslot.start_time)
            for first_exam, second_exam in zip(day_exams, day_exams[1:]):
                first_end = (
                    first_exam.timeslot.end_time.hour * 60
                    + first_exam.timeslot.end_time.minute
                )
                second_start = (
                    second_exam.timeslot.start_time.hour * 60
                    + second_exam.timeslot.start_time.minute
                )
                assert 15 <= second_start - first_end <= 75

        if expect_consecutive_pair:
            exams_by_section = {}
            for exam in exams:
                exams_by_section.setdefault(exam.section_id, []).append(exam)
            for section_exams in exams_by_section.values():
                assert len(section_exams) == 2
                first_exam, second_exam = sorted(
                    section_exams,
                    key=lambda exam: (exam.timeslot.date, exam.timeslot.start_time),
                )
                assert first_exam.timeslot.date == second_exam.timeslot.date, (
                    first_exam.section.name,
                    first_exam.subject.name,
                    first_exam.timeslot.date,
                    first_exam.timeslot.start_time,
                    second_exam.subject.name,
                    second_exam.timeslot.date,
                    second_exam.timeslot.start_time,
                )
                first_end = (
                    first_exam.timeslot.end_time.hour * 60
                    + first_exam.timeslot.end_time.minute
                )
                second_start = (
                    second_exam.timeslot.start_time.hour * 60
                    + second_exam.timeslot.start_time.minute
                )
                assert second_start - first_end == 15, (
                    first_exam.section.name,
                    first_exam.subject.name,
                    first_exam.timeslot.start_time,
                    second_exam.subject.name,
                    second_exam.timeslot.start_time,
                    second_start - first_end,
                )
        print("Shared-subject scheduling passed with one common session per subject.")
    finally:
        db.close()
        Base.metadata.drop_all(engine)
        engine.dispose()
        temp_db.unlink(missing_ok=True)


if __name__ == "__main__":
    # All six sections fit concurrently: one anti-leakage session.
    run_test(
        ("B401", "B402", "B403", "B501", "B502", "B503"),
        shared_subject_names=("Computer Programming 1",),
    )
    # Mirrors The Contemporary World's 40 simultaneous college sections: a
    # 50-room pool must keep every program together in one common session.
    run_test(
        tuple(f"B{number}" for number in range(101, 151)),
        shared_subject_names=("The Contemporary World",),
        sections_per_course=20,
    )
    # Twelve 40-section shared papers fill the available morning capacity over
    # four exam days.  This guards against small subjects fragmenting slots
    # before large anti-leakage groups are assigned.
    run_test(
        tuple(f"B{number}" for number in range(101, 151)),
        shared_subject_names=tuple(f"Shared Test {number}" for number in range(1, 13)),
        sections_per_course=20,
    )
    # Thirteen written subjects cannot fit into four days with a universal
    # three-exam cap.  The scheduler may use one four-exam day, but every one
    # of those papers must still be consecutive with the 15-minute break.
    run_test(
        ("B401", "B402", "B403", "B501", "B502", "B503"),
        shared_subject_names=tuple(f"Heavy Load {number}" for number in range(1, 14)),
    )
    # Different curriculum duration settings still produce one shared sitting
    # using the longer exam duration.
    run_test(
        ("B401", "B402", "B403", "B501", "B502", "B503"),
        shared_subject_names=("Introduction to Computing",),
        second_program_duration=120,
    )
    # Three rooms cannot host every BSIT and BSCS section at one time.  The
    # scheduler must fail rather than expose the shared paper in a later slot.
    run_test(
        ("B401", "B402", "B403"),
        shared_subject_names=("Computer Programming 1",),
        expect_failure=True,
    )
    # Each shared subject remains synchronized across both programs, even
    # when the two different subjects need separate sessions.
    run_test(
        ("B401", "B402", "B403", "B501", "B502", "B503"),
        shared_subject_names=("Ethics", "Mathematics in the Modern World"),
        expect_consecutive_pair=True,
    )
    # Eight total sections still cannot be split between dates or times.
    run_test(
        ("B401", "B402", "B403", "B501", "B502"),
        sections_per_course=4,
        expect_failure=True,
    )
