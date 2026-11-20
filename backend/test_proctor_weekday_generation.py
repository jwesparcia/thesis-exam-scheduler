"""Proctor eligibility follows the teaching window for each exam weekday."""

from contextlib import redirect_stdout
from datetime import date, time
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

_test_directory = tempfile.TemporaryDirectory(prefix="proctor-weekdays-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_test_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-proctor-weekday-test-secret-key-123456789"

from core import Base, SessionLocal, engine
from model import Course, Exam, Proctor, Room, Section, Subject, Teacher, TeacherSchedule, User, YearLevel
from utils import scheduler


class ProctorWeekdayGenerationTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = SessionLocal()
        course = Course(name="BSCS", category="College", department_code="ICT")
        year = YearLevel(name="1st Year")
        teacher = Teacher(name="Available Proctor")
        room = Room(name="B501", building="B", department="College", capacity=40)
        self.db.add_all([course, year, teacher, room])
        self.db.flush()
        self.proctor = Proctor(name=teacher.name, teacher_id=teacher.id, department="ICT")
        section = Section(name="BSCS 1-101", course_id=course.id, year_level_id=year.id,
                          semester=1, student_count=1)
        self.db.add_all([self.proctor, section])
        self.db.flush()
        self.db.add(User(name="Student", email="student@test.invalid", hashed_password="unused",
                         role="student", student_type="regular", course_id=course.id,
                         section_name=section.name))
        for index, (start, end, exam_start) in enumerate((
            (time(7), time(9, 15), time(8)),
            (time(9), time(11), time(9, 30)),
            (time(10, 30), time(12, 30), time(11)),
            (time(12), time(14), time(12, 30)),
        )):
            self.db.add(TeacherSchedule(teacher_id=teacher.id, day_of_week=index,
                                        start_time=start, end_time=end))
            self.db.add(Subject(name=f"Paper {index + 1}", code=f"CS{index + 1}",
                                course_id=course.id, year_level_id=year.id, semester=1,
                                category="major", duration_minutes=75, term="All", exam_type="written",
                                is_fixed_timeslot=True, fixed_day=index + 1, fixed_start_time=exam_start))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        _test_directory.cleanup()

    def test_generated_assignments_follow_every_weekday_window(self):
        with patch.object(scheduler, "POP_SIZE", 6), patch.object(scheduler, "GENERATIONS", 4), redirect_stdout(io.StringIO()):
            scheduler.generate_exam_schedule(self.db, start_date=date(2026, 12, 14), end_date=date(2026, 12, 17),
                                             department="College", semester=1, term="Midterm",
                                             daily_start_time=time(8), daily_end_time=time(17))
        exams = self.db.query(Exam).filter_by(status="draft").all()
        self.assertEqual(len(exams), 4)
        self.assertEqual({exam.timeslot.date for exam in exams}, {date(2026, 12, day) for day in range(14, 18)})
        for exam in exams:
            self.assertEqual(exam.proctor_id, self.proctor.id)
            self.assertTrue(scheduler.validate_proctor_availability(
                self.db, self.proctor.id, exam.timeslot.date, exam.timeslot.start_time, exam.timeslot.end_time)[0])

    def test_outside_day_window_and_missing_weekday_are_rejected(self):
        is_available = scheduler.validate_proctor_availability
        self.assertTrue(is_available(self.db, self.proctor.id, date(2026, 12, 15), time(9, 30), time(10, 45))[0])
        self.assertFalse(is_available(self.db, self.proctor.id, date(2026, 12, 15), time(8), time(9, 15))[0])
        self.assertFalse(is_available(self.db, self.proctor.id, date(2026, 12, 15), time(10), time(11, 15))[0])
        self.assertFalse(is_available(self.db, self.proctor.id, date(2026, 12, 18), time(9, 30), time(10, 45))[0])

    def test_generation_does_not_assign_outside_hours_or_on_missing_day(self):
        schedules = self.db.query(TeacherSchedule).filter_by(teacher_id=self.proctor.teacher_id).all()
        for row in schedules:
            if row.day_of_week == 1:
                row.end_time = time(10)
            elif row.day_of_week == 2:
                self.db.delete(row)
        self.db.commit()
        with patch.object(scheduler, "POP_SIZE", 6), patch.object(scheduler, "GENERATIONS", 4), redirect_stdout(io.StringIO()):
            scheduler.generate_exam_schedule(self.db, start_date=date(2026, 12, 14), end_date=date(2026, 12, 17),
                                             department="College", semester=1, term="Midterm",
                                             daily_start_time=time(8), daily_end_time=time(17))
        exams = self.db.query(Exam).filter_by(status="draft").all()
        self.assertEqual(len(exams), 4)
        by_date = {exam.timeslot.date: exam.proctor_id for exam in exams}
        self.assertEqual(by_date[date(2026, 12, 14)], self.proctor.id)
        self.assertIsNone(by_date[date(2026, 12, 15)])
        self.assertIsNone(by_date[date(2026, 12, 16)])
        self.assertEqual(by_date[date(2026, 12, 17)], self.proctor.id)

    def test_monday_assignments_stay_inside_recorded_teaching_hours(self):
        # Give each fixed paper its own section so the start times do not
        # interact with per-section gap and daily-exam constraints.
        self.db.query(Subject).delete()
        self.db.query(TeacherSchedule).filter_by(teacher_id=self.proctor.teacher_id).delete()
        self.db.add(TeacherSchedule(teacher_id=self.proctor.teacher_id, day_of_week=0,
                                    start_time=time(10), end_time=time(20, 30)))
        year = self.db.query(YearLevel).one()
        first_course = self.db.query(Course).one()
        for index, (course_name, day, start) in enumerate((
            ("BSCS", 1, time(8)),
            ("BSIT", 1, time(10)),
            ("BSTM", 1, time(20)),
            ("BSA", 2, time(10)),
        )):
            if index == 0:
                course = first_course
            else:
                course = Course(name=course_name, category="College", department_code="ICT")
                self.db.add(course)
                self.db.flush()
                section = Section(name=f"{course_name} 1-101", course_id=course.id,
                                  year_level_id=year.id, semester=1, student_count=1)
                self.db.add(section)
                self.db.flush()
                self.db.add(User(name=f"Student {index}", email=f"student{index}@test.invalid",
                                 hashed_password="unused", role="student", student_type="regular",
                                 course_id=course.id, section_name=section.name))
            self.db.add(Subject(name=f"Window Paper {index}", code=f"WP{index}",
                                course_id=course.id, year_level_id=year.id, semester=1,
                                category="major", duration_minutes=75, term="All", exam_type="written",
                                is_fixed_timeslot=True, fixed_day=day, fixed_start_time=start))
        self.db.commit()
        with patch.object(scheduler, "POP_SIZE", 6), patch.object(scheduler, "GENERATIONS", 4), redirect_stdout(io.StringIO()):
            scheduler.generate_exam_schedule(self.db, start_date=date(2026, 12, 14), end_date=date(2026, 12, 17),
                                             department="College", semester=1, term="Midterm",
                                             daily_start_time=time(8), daily_end_time=time(22))

        exams = self.db.query(Exam).filter_by(status="draft").all()
        self.assertEqual(len(exams), 4)
        slots = {(exam.timeslot.date, exam.timeslot.start_time): exam for exam in exams}
        self.assertIsNone(slots[(date(2026, 12, 14), time(8))].proctor_id)
        self.assertEqual(slots[(date(2026, 12, 14), time(10))].proctor_id, self.proctor.id)
        self.assertIsNone(slots[(date(2026, 12, 14), time(20))].proctor_id)
        self.assertIsNone(slots[(date(2026, 12, 15), time(10))].proctor_id)
        self.assertTrue(scheduler.validate_proctor_availability(
            self.db, self.proctor.id, date(2026, 12, 14), time(19, 15), time(20, 30))[0])
        self.assertFalse(scheduler.validate_proctor_availability(
            self.db, self.proctor.id, date(2026, 12, 14), time(19, 15), time(20, 31))[0])


if __name__ == "__main__":
    unittest.main()
