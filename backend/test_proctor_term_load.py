"""Proctors can reuse weekly availability in separate examination terms."""

from contextlib import redirect_stdout
from datetime import date, time, timedelta
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

_test_dir = tempfile.TemporaryDirectory(prefix="proctor-term-load-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_test_dir.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-proctor-term-load-test-secret-key-123456789"

from core import Base, SessionLocal, engine
from model import Course, Exam, Proctor, Room, Section, Subject, Teacher, TeacherSchedule, Timeslot, User, YearLevel
from utils import scheduler


class ProctorTermLoadTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = SessionLocal()
        self.course = Course(name="BSCS", category="College", department_code="ICT")
        self.year = YearLevel(id=1, name="1st Year")
        teacher = Teacher(name="Available Proctor")
        self.db.add_all([self.course, self.year, teacher,
                         Room(name="B501", building="B", department="College", capacity=40)])
        self.db.flush()
        self.proctor = Proctor(name=teacher.name, teacher_id=teacher.id, department="ICT")
        self.section = Section(name="BSCS 1-101", course_id=self.course.id,
                               year_level_id=self.year.id, semester=1, student_count=1)
        self.old_section = Section(name="BSCS 1-102", course_id=self.course.id,
                                   year_level_id=self.year.id, semester=1, student_count=0)
        self.db.add_all([self.proctor, self.section, self.old_section])
        self.db.flush()
        self.db.add(User(name="Student", email="student@test.invalid", hashed_password="unused",
                         role="student", student_type="regular", course_id=self.course.id,
                         section_name=self.section.name))
        for weekday in range(4):
            self.db.add(TeacherSchedule(teacher_id=teacher.id, day_of_week=weekday,
                                        start_time=time(7), end_time=time(17)))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        _test_dir.cleanup()

    def add_paper(self, index, fixed_day=1, start=time(8)):
        subject = Subject(name=f"Paper {index}", code=f"CS{index}", course_id=self.course.id,
                          year_level_id=self.year.id, semester=1, category="major",
                          duration_minutes=75, term="All", exam_type="written",
                          is_fixed_timeslot=True, fixed_day=fixed_day, fixed_start_time=start)
        self.db.add(subject)
        self.db.flush()
        return subject

    def add_posted(self, term, semester, day, start=time(8), end=time(9, 15)):
        slot = Timeslot(date=day, start_time=start, end_time=end)
        self.db.add(slot)
        self.db.flush()
        exam = Exam(course_id=self.course.id, year_level_id=self.year.id,
                    section_id=self.old_section.id, timeslot_id=slot.id,
                    proctor_id=self.proctor.id, semester=semester, term=term, status="posted")
        self.db.add(exam)
        self.db.flush()
        return exam

    def generate(self):
        self.db.commit()
        with patch.object(scheduler, "POP_SIZE", 6), patch.object(scheduler, "GENERATIONS", 4), redirect_stdout(io.StringIO()):
            scheduler.generate_exam_schedule(
                self.db, start_date=date(2026, 12, 14), end_date=date(2026, 12, 17),
                department="College", semester=1, term="Midterm",
                daily_start_time=time(8), daily_end_time=time(17))
        return self.db.query(Exam).filter_by(status="draft", semester=1, term="Midterm").all()

    def test_other_term_duties_do_not_exhaust_assignment_limit(self):
        self.add_paper(1)
        prior = [self.add_posted("Final", 1, date(2026, 11, 2) + timedelta(days=i)) for i in range(8)]
        prior_ids = {exam.id for exam in prior}
        exams = self.generate()
        self.assertEqual(len(exams), 1)
        self.assertEqual(exams[0].proctor_id, self.proctor.id)
        self.assertEqual({e.id for e in self.db.query(Exam).filter_by(status="posted").all()}, prior_ids)

    def test_other_semester_duties_do_not_exhaust_assignment_limit(self):
        self.add_paper(1)
        for i in range(8):
            self.add_posted("Midterm", 2, date(2026, 11, 2) + timedelta(days=i))
        exams = self.generate()
        self.assertEqual(len(exams), 1)
        self.assertEqual(exams[0].proctor_id, self.proctor.id)

    def test_duty_in_another_term_still_blocks_overlapping_exam(self):
        self.add_paper(1)
        self.add_posted("Final", 1, date(2026, 12, 14), start=time(8, 30), end=time(9, 45))
        exams = self.generate()
        self.assertEqual(len(exams), 1)
        self.assertIsNone(exams[0].proctor_id)

    def test_existing_duty_on_exam_day_retains_posted_workload_limit(self):
        self.add_paper(1)
        for i in range(8):
            self.add_posted("Final", 1, date(2026, 11, 2) + timedelta(days=i))
        self.add_posted("Final", 1, date(2026, 12, 17))
        exams = self.generate()
        self.assertEqual(len(exams), 1)
        self.assertIsNone(exams[0].proctor_id)

    def test_same_term_and_semester_other_department_counts_toward_limit(self):
        self.add_paper(1)
        shs = Course(name="STEM", category="SHS")
        self.db.add(shs)
        self.db.flush()
        shs_section = Section(name="STEM 11-101", course_id=shs.id,
                              year_level_id=self.year.id, semester=1, student_count=0)
        self.db.add(shs_section)
        self.db.flush()
        for i in range(8):
            posted = self.add_posted("Midterm", 1, date(2026, 11, 2) + timedelta(days=i))
            posted.course_id = shs.id
            posted.section_id = shs_section.id
        exams = self.generate()
        self.assertEqual(len(exams), 1)
        self.assertIsNone(exams[0].proctor_id)

    def test_existing_consecutive_duties_in_another_term_require_break(self):
        self.add_paper(1, start=time(12, 30))
        for start, end in ((time(8), time(9, 15)), (time(9, 30), time(10, 45)),
                           (time(11), time(12, 15))):
            self.add_posted("Final", 1, date(2026, 12, 14), start=start, end=end)
        exams = self.generate()
        self.assertEqual(len(exams), 1)
        self.assertIsNone(exams[0].proctor_id)

    def test_assignment_limit_still_applies_within_generated_term(self):
        for index in range(9):
            self.add_paper(index + 1, fixed_day=index // 3 + 1,
                           start=(time(8), time(9, 30), time(11))[index % 3])
        exams = self.generate()
        self.assertEqual(len(exams), 9)
        self.assertEqual(sum(e.proctor_id == self.proctor.id for e in exams), 8)
        self.assertEqual(sum(e.proctor_id is None for e in exams), 1)


if __name__ == "__main__":
    unittest.main()
