"""Run the four-day generator against the imported first-semester curriculum.

This uses a disposable SQLite database and never changes the live catalogue.
Run from the repository root with backend/.venv/Scripts/python.exe.
"""

import os
import sys
import tempfile
from collections import Counter
from datetime import date, time
from pathlib import Path

from openpyxl import load_workbook


fd, filename = tempfile.mkstemp(prefix="curriculum_schedule_", suffix=".db")
os.close(fd)
database_path = Path(filename)
database_path.unlink(missing_ok=True)
os.environ["DATABASE_URL"] = f"sqlite:///{database_path.as_posix()}"

backend_dir = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(backend_dir))

from core.database import Base, SessionLocal, engine  # noqa: E402
from model import Course, Exam, Room, Section, Subject, YearLevel  # noqa: E402
from room_data import AVAILABLE_EXAM_ROOMS  # noqa: E402
from utils import scheduler  # noqa: E402


def main(semester=1, department="College"):
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        curriculum_path = backend_dir.parent / "data" / "import" / "school_curriculum.xlsx"
        sheet = load_workbook(curriculum_path, read_only=True, data_only=True)[
            "1st Semester" if semester == 1 else "2nd Semester"
        ]
        students_sheet = load_workbook(
            backend_dir.parent / "dummy_students_3000.xlsx",
            read_only=True,
            data_only=True,
        ).active
        regular_counts = Counter(
            row[3] for row in students_sheet.iter_rows(min_row=2, values_only=True)
            if row[3] and str(row[5]).strip().casefold() == "regular"
        )
        courses = {}
        years = {}
        sections = {}
        subjects = {}
        expected_pairs = set()
        for row in sheet.iter_rows(min_row=2, values_only=True):
            course_name, row_department, year_name, section_name, code, name, _, category, exam_type = row
            if row_department != department or not all((course_name, year_name, section_name, name)):
                continue
            if course_name not in courses:
                courses[course_name] = Course(name=course_name, category=department)
                db.add(courses[course_name])
                db.flush()
            if year_name not in years:
                years[year_name] = YearLevel(name=year_name)
                db.add(years[year_name])
                db.flush()
            if section_name not in sections:
                sections[section_name] = Section(
                    name=section_name,
                    course_id=courses[course_name].id,
                    year_level_id=years[year_name].id,
                    semester=semester,
                    student_count=regular_counts.get(section_name, 30),
                )
                db.add(sections[section_name])
            if str(exam_type).strip().casefold() != "written":
                continue
            key = (course_name, year_name, " ".join(str(name).casefold().split()))
            expected_pairs.add((section_name, key[2]))
            if key not in subjects:
                subjects[key] = Subject(
                    code=f"SMOKE{len(subjects) + 1:04d}",
                    name=str(name).strip(),
                    course_id=courses[course_name].id,
                    year_level_id=years[year_name].id,
                    semester=semester,
                    exam_type="written",
                    category=category or "major",
                    duration_minutes=120 if course_name == "BSA" and category == "major" else 75,
                    term="Midterm",
                )
                db.add(subjects[key])
        for room in AVAILABLE_EXAM_ROOMS:
            if room["building"] == ("B" if department == "College" else "C"):
                db.add(Room(**{**room, "capacity": room.get("capacity", 40)}))
        db.commit()

        scheduler.POP_SIZE = 8
        scheduler.GENERATIONS = 6
        result = scheduler.generate_exam_schedule(
            db,
            start_date=date(2026, 11, 23),
            end_date=date(2026, 11, 26),
            department=department,
            semester=semester,
            term="Midterm",
            daily_start_time=time(8),
            daily_end_time=time(16, 45),
        )
        exams = db.query(Exam).filter(Exam.status == "draft").all()
        assert result["total_exams"] == len(exams)
        actual_pairs = {
            (exam.section.name, " ".join(exam.subject.name.casefold().split()))
            for exam in exams
        }
        assert actual_pairs == expected_pairs, (
            len(expected_pairs - actual_pairs),
            len(actual_pairs - expected_pairs),
        )
        by_subject = {}
        by_section_day = {}
        by_room_day = {}
        for exam in exams:
            subject_key = " ".join(exam.subject.name.casefold().split())
            by_subject.setdefault(subject_key, set()).add(
                (exam.timeslot.date, exam.timeslot.start_time, exam.timeslot.end_time)
            )
            by_section_day.setdefault((exam.section_id, exam.timeslot.date), []).append(exam)
            by_room_day.setdefault((exam.room_id, exam.timeslot.date), []).append(exam)
            assert exam.room.capacity >= exam.section.student_count
            assert exam.timeslot.end_time <= time(16, 45)
        assert all(len(sessions) == 1 for sessions in by_subject.values())
        for day_exams in by_section_day.values():
            day_exams.sort(key=lambda exam: exam.timeslot.start_time)
            for first, second in zip(day_exams, day_exams[1:]):
                gap = (
                    second.timeslot.start_time.hour * 60 + second.timeslot.start_time.minute
                    - first.timeslot.end_time.hour * 60 - first.timeslot.end_time.minute
                )
                assert 15 <= gap <= 75
        for day_exams in by_room_day.values():
            day_exams.sort(key=lambda exam: exam.timeslot.start_time)
            for first, second in zip(day_exams, day_exams[1:]):
                assert first.timeslot.end_time <= second.timeslot.start_time
        print(f"{department} semester {semester} passed: {len(exams)} exams, {len(by_subject)} synchronized subjects.")
    finally:
        db.close()
        engine.dispose()
        database_path.unlink(missing_ok=True)


if __name__ == "__main__":
    selected_semester = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    selected_department = sys.argv[2] if len(sys.argv) > 2 else "College"
    main(selected_semester, selected_department)
