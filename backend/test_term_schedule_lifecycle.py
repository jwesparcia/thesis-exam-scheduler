"""Term isolation across generation, persistence, posting, and deletion."""

import asyncio
from contextlib import redirect_stdout
from datetime import date, time
import os
import io
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

_temporary_directory = tempfile.TemporaryDirectory(prefix="term-schedule-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_temporary_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-term-schedule-verification-secret-key-123456789"

from fastapi import BackgroundTasks, HTTPException
from core import Base, SessionLocal, engine
from model import Course, YearLevel, Section, Subject, User, Room, Exam, Timeslot, ReschedulingRequest
from routers import exams
from utils import scheduler


class TermScheduleLifecycleTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = SessionLocal()
        exams._generation_progress.clear()
        exams._generate_last_request.clear()
        self.admin = User(name="Admin", email="admin@test.invalid", role="program_head", hashed_password="unused")
        self.college = Course(name="BSIT", category="College")
        self.shs = Course(name="STEM", category="SHS")
        self.year = YearLevel(id=1, name="1st Year")
        self.grade = YearLevel(id=5, name="Grade 11")
        self.db.add_all([self.admin, self.college, self.shs, self.year, self.grade])
        self.db.flush()
        self.sections = {}
        for course, year, section_name, room_name, building in (
            (self.college, self.year, "BSIT 1-101", "B501", "B"),
            (self.shs, self.grade, "STEM-5A", "C501", "C"),
        ):
            section = Section(name=section_name, course_id=course.id, year_level_id=year.id,
                              semester=None if course.category == "SHS" else 1, student_count=1)
            self.sections[course.category] = section
            self.db.add(section)
            self.db.add(Room(name=room_name, capacity=40, building=building, department=course.category))
            self.db.add(User(name=f"{course.name} Student", email=f"{course.name}@test.invalid",
                             hashed_password="unused", role="student", student_type="regular",
                             section_name=section_name, course_id=course.id))
            for semester in ((1, 2, 3) if course.category == "SHS" else (1,)):
                self.db.add(Subject(code=f"{course.name}{semester}01", name=f"{course.name} Written Paper",
                                    course_id=course.id, year_level_id=year.id, semester=semester,
                                    category="general", exam_type="written", duration_minutes=75, term="All"))
        self.db.commit()
        self.job_number = 0

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    def generate(self, term, department="College", semester=1, overwrite=False, start="2026-11-16"):
        self.job_number += 1
        job_id = f"term-test-{self.job_number}"
        tasks = BackgroundTasks()
        with patch.object(exams, "_GENERATE_RATE_LIMIT_SECONDS", 0), \
                patch.object(scheduler, "POP_SIZE", 6), patch.object(scheduler, "GENERATIONS", 4), \
                redirect_stdout(io.StringIO()):
            accepted = asyncio.run(exams.generate_schedule(
                background_tasks=tasks, db=self.db, current_user=self.admin,
                payload={"job_id": job_id, "department": department, "semester": semester,
                         "term": term, "force_overwrite": overwrite, "start_date": start,
                         "daily_start_time": "08:00", "daily_end_time": "16:45"},
            ))
            self.assertEqual(accepted["status"], "accepted")
            asyncio.run(tasks())
        progress = exams._get_generation_progress(job_id)
        self.assertEqual(progress["status"], "completed", progress)
        self.db.expire_all()

    def mutate(self, function, term, department="College", semester=1, **extra):
        return function(course_id=None, year_level_id=None, department=department, semester=semester,
                        term=term, db=self.db, current_user=self.admin, **extra)

    def snapshot(self, term, department="College", semester=1):
        return {exam.id: tuple(getattr(exam, column.name) for column in Exam.__table__.columns)
                for exam in self.db.query(Exam).join(Course).filter(
                    Course.category == department, Exam.semester == semester, Exam.term == term)}

    def count(self, term, department="College", semester=1):
        return exams.get_exam_count(department=department, semester=semester, term=term,
                                    db=self.db, current_user=self.admin)["count"]

    def clear(self, term, department="College", semester=1):
        return exams.clear_exams(department=department, semester=semester, term=term,
                                 all_terms=False, db=self.db, current_user=self.admin)

    def test_college_terms_generate_save_post_and_regenerate_independently(self):
        self.generate("Prelim")
        self.mutate(exams.save_exams, "Prelim")
        prelim = self.snapshot("Prelim")
        prelim_id = next(iter(prelim))
        self.db.add(ReschedulingRequest(exam_id=prelim_id, status="pending"))
        self.db.commit()
        self.assertEqual(self.count("Midterm"), 0)
        self.generate("Midterm", start="2026-11-23")
        self.assertEqual(self.snapshot("Prelim"), prelim)
        summary = exams.get_saved_schedules(department="College", semester=1, db=self.db, current_user=self.admin)
        by_term = {row["term"]: row for row in summary}
        self.assertEqual(set(by_term), {"Prelim", "Midterm"})
        self.assertEqual(by_term["Prelim"]["saved_count"], 1)
        self.assertEqual(by_term["Midterm"]["draft_count"], 1)
        self.mutate(exams.post_exams, "Midterm")
        posted_midterm_ids = set(self.snapshot("Midterm"))
        self.generate("Midterm", overwrite=True, start="2026-11-23")
        self.assertTrue(posted_midterm_ids <= set(self.snapshot("Midterm")))
        self.assertEqual(self.snapshot("Prelim"), prelim)
        summary = exams.get_saved_schedules(department="College", semester=1, db=self.db, current_user=self.admin)
        self.assertEqual(next(row for row in summary if row["term"] == "Midterm")["total_exams"], 1)
        self.mutate(exams.post_exams, "Midterm")
        self.assertFalse(posted_midterm_ids & set(self.snapshot("Midterm")))
        midterm = self.snapshot("Midterm")
        self.generate("Final", overwrite=True, start="2026-11-30")
        self.assertEqual(self.snapshot("Prelim"), prelim)
        self.assertEqual(self.snapshot("Midterm"), midterm)
        self.assertEqual(self.db.query(ReschedulingRequest).count(), 1)
        self.clear("Final")
        self.assertEqual(self.count("Final"), 0)
        self.assertEqual(self.snapshot("Prelim"), prelim)
        self.assertEqual(self.snapshot("Midterm"), midterm)

    def test_shs_terms_and_semesters_are_independent(self):
        self.generate("Prelim")
        college = self.snapshot("Prelim")
        self.generate("ST1", "SHS")
        self.mutate(exams.save_exams, "ST1", "SHS")
        st1 = self.snapshot("ST1", "SHS")
        self.generate("ST2", "SHS", start="2026-11-23")
        self.mutate(exams.post_exams, "ST2", "SHS")
        self.generate("T1", "SHS", start="2026-11-30")
        self.mutate(exams.save_exams, "T1", "SHS")
        t1 = self.snapshot("T1", "SHS")
        self.generate("T1", "SHS", semester=3, start="2026-12-07")
        self.assertEqual(self.snapshot("T1", "SHS"), t1)
        self.assertEqual(self.count("T1", "SHS", 3), 1)
        self.clear("ST2", "SHS")
        self.assertEqual(self.count("ST2", "SHS"), 0)
        self.assertEqual(self.snapshot("ST1", "SHS"), st1)
        self.assertEqual(self.snapshot("T1", "SHS"), t1)
        self.assertEqual(self.snapshot("Prelim"), college)

    def test_saved_term_overwrite_does_not_remove_another_saved_term(self):
        self.generate("Prelim")
        self.mutate(exams.save_exams, "Prelim")
        prelim = self.snapshot("Prelim")
        self.generate("Midterm", start="2026-11-23")
        self.mutate(exams.save_exams, "Midterm")
        self.generate("Midterm", overwrite=True, start="2026-11-30")
        self.assertEqual(self.snapshot("Prelim"), prelim)
        replaced = self.db.query(Exam).filter(Exam.term == "Midterm").all()
        self.assertEqual(len(replaced), 1)
        self.assertEqual(replaced[0].status, "draft")
        self.assertGreaterEqual(replaced[0].timeslot.date, date(2026, 11, 30))
        with self.assertRaises(HTTPException) as existing:
            self.generate("Prelim")
        self.assertEqual(existing.exception.status_code, 409)

    def test_ambiguous_terms_cannot_mutate_multiple_schedules(self):
        self.generate("Midterm")
        before = self.snapshot("Midterm")
        for value in (None, "", "All"):
            for function in (exams.save_exams, exams.post_exams):
                with self.subTest(value=value, function=function.__name__):
                    with self.assertRaises(HTTPException) as error:
                        self.mutate(function, value)
                    self.assertEqual(error.exception.status_code, 400)
            with self.assertRaises(HTTPException):
                self.clear(value)
        self.assertEqual(self.snapshot("Midterm"), before)
        with self.assertRaisesRegex(ValueError, "Select one examination term"):
            scheduler.generate_exam_schedule(self.db, date(2026, 11, 16), term="All")
        self.assertEqual(self.snapshot("Midterm"), before)

    def test_posting_one_year_preserves_other_years_and_terms(self):
        slot = Timeslot(date=date(2026, 11, 16), start_time=time(8), end_time=time(9, 15))
        self.db.add(slot)
        self.db.flush()
        rows = [Exam(course_id=self.college.id, year_level_id=year, semester=1, term=term,
                     timeslot_id=slot.id, status=status)
                for year, term, status in [(1, "Midterm", "posted"), (1, "Midterm", "draft"),
                                            (2, "Midterm", "posted"), (1, "Prelim", "posted")]]
        self.db.add_all(rows)
        self.db.commit()
        old_id, new_id, other_year_id, prelim_id = [row.id for row in rows]
        summary = exams.get_saved_schedules(department="College", semester=1, db=self.db, current_user=self.admin)
        midterm = next(row for row in summary if row["term"] == "Midterm")
        self.assertEqual(midterm["total_exams"], 2)
        self.assertEqual(midterm["posted_count"], 1)
        exams.post_exams(course_id=self.college.id, year_level_id=1, semester=1, department="College",
                         term="Midterm", db=self.db, current_user=self.admin)
        self.db.expire_all()
        self.assertEqual({exam.id for exam in self.db.query(Exam)}, {new_id, other_year_id, prelim_id})
        self.assertNotIn(old_id, {exam.id for exam in self.db.query(Exam)})


if __name__ == "__main__":
    try:
        unittest.main()
    finally:
        engine.dispose()
        _temporary_directory.cleanup()
