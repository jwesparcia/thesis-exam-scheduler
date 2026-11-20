"""A proctor's limited assignments should cover the available exam days."""

from collections import Counter
from contextlib import redirect_stdout
from datetime import date, datetime, time
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

_test_directory = tempfile.TemporaryDirectory(prefix="proctor-day-distribution-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_test_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-proctor-day-distribution-secret-key-123456789"

from core import Base, SessionLocal, engine
from model import Course, Exam, Proctor, Room, Section, Subject, Teacher, TeacherSchedule, Timeslot, User, YearLevel
from utils import scheduler
from utils.proctor_rules import MAX_CONSECUTIVE_PROCTOR_ASSIGNMENTS


class ProctorDayDistributionTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = SessionLocal()
        course = Course(name="BSCS", category="College", department_code="ICT")
        year = YearLevel(id=1, name="1st Year")
        teacher = Teacher(name="Proctor Teacher")
        self.db.add_all([course, year, teacher,
                         Room(name="B501", building="B", department="College", capacity=40)])
        self.db.flush()
        self.proctor = Proctor(name=teacher.name, teacher_id=teacher.id, department="ICT")
        section = Section(name="BSCS 1-101", course_id=course.id, year_level_id=year.id,
                          semester=1, student_count=1)
        self.db.add_all([self.proctor, section])
        self.db.flush()
        self.db.add(User(name="Student", email="student@test.invalid", hashed_password="unused",
                         role="student", student_type="regular", course_id=course.id,
                         section_name=section.name))
        for day in range(3):
            self.db.add(TeacherSchedule(teacher_id=teacher.id, day_of_week=day,
                                        start_time=time(8), end_time=time(15)))
        for day in range(4):
            for index, start in enumerate((time(8), time(9, 30), time(11), time(13, 15))):
                paper = day * 4 + index + 1
                self.db.add(Subject(name=f"Paper {paper}", code=f"CS{paper}", course_id=course.id,
                                    year_level_id=year.id, semester=1, category="major",
                                    duration_minutes=75, term="All", exam_type="written",
                                    is_fixed_timeslot=True, fixed_day=day + 1, fixed_start_time=start))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        _test_directory.cleanup()

    def generate(self):
        self.db.commit()
        with patch.object(scheduler, "POP_SIZE", 6), patch.object(scheduler, "GENERATIONS", 4), redirect_stdout(io.StringIO()):
            scheduler.generate_exam_schedule(
                self.db, start_date=date(2026, 12, 14), end_date=date(2026, 12, 17),
                department="College", semester=1, term="Final",
                daily_start_time=time(8), daily_end_time=time(17))
        return self.db.query(Exam).filter_by(status="draft").all()

    def test_cap_is_spread_over_available_days_and_constraints_remain_enforced(self):
        exams = self.generate()
        self.assertEqual(len(exams), 16)
        assigned = [e for e in exams if e.proctor_id == self.proctor.id]
        self.assertEqual(len(assigned), 8)
        self.assertEqual(sorted(Counter(e.timeslot.date for e in assigned).values()), [2, 3, 3])
        self.assertTrue(all(e.proctor_id is None for e in exams if e.timeslot.date == date(2026, 12, 17)))

        by_day = {}
        for exam in assigned:
            slot = exam.timeslot
            self.assertTrue(scheduler.validate_proctor_availability(
                self.db, self.proctor.id, slot.date, slot.start_time, slot.end_time)[0])
            by_day.setdefault(slot.date, []).append(slot)
        for slots in by_day.values():
            slots.sort(key=lambda slot: slot.start_time)
            streak = 1
            for first, second in zip(slots, slots[1:]):
                self.assertLessEqual(first.end_time, second.start_time)
                gap = (datetime.combine(first.date, second.start_time) -
                       datetime.combine(first.date, first.end_time)).total_seconds() / 60
                streak = streak + 1 if gap <= 30 else 1
                self.assertLessEqual(streak, MAX_CONSECUTIVE_PROCTOR_ASSIGNMENTS)

    def test_balancing_still_uses_each_weekdays_teaching_hours(self):
        windows = {0: (time(10), time(20, 30)), 1: (time(9), time(20, 30)), 2: (time(7), time(19))}
        for schedule in self.db.query(TeacherSchedule):
            schedule.start_time, schedule.end_time = windows[schedule.day_of_week]

        assigned = [e for e in self.generate() if e.proctor_id == self.proctor.id]
        self.assertEqual(Counter(e.timeslot.date.weekday() for e in assigned), {0: 2, 1: 3, 2: 3})
        for exam in assigned:
            slot = exam.timeslot
            start, end = windows[slot.date.weekday()]
            self.assertGreaterEqual(slot.start_time, start)
            self.assertLessEqual(slot.end_time, end)

    def test_swap_balances_two_proctors_without_leaving_an_exam_uncovered(self):
        course = self.db.query(Course).one()
        year = self.db.query(YearLevel).one()
        teacher = Teacher(name="Second Proctor Teacher")
        posted_section = Section(name="BSCS 1-102", course_id=course.id, year_level_id=year.id,
                                 semester=1, student_count=0)
        self.db.add_all([teacher, posted_section])
        self.db.flush()
        other = Proctor(name=teacher.name, teacher_id=teacher.id, department="ICT")
        self.db.add(other)
        self.db.flush()
        for day in range(3):
            self.db.add(TeacherSchedule(teacher_id=teacher.id, day_of_week=day,
                                        start_time=time(6), end_time=time(15)))
        self.db.query(TeacherSchedule).filter_by(teacher_id=self.proctor.teacher_id, day_of_week=0).one().start_time = time(6)

        # Each proctor comes in with two duties, on different exam days.
        for proctor, day in ((self.proctor, 14), (other, 16)):
            for start, end in ((time(6), time(6, 30)), (time(6, 30), time(7))):
                slot = Timeslot(date=date(2026, 12, day), start_time=start, end_time=end)
                self.db.add(Exam(course_id=course.id, year_level_id=year.id, section_id=posted_section.id,
                                 timeslot=slot, proctor_id=proctor.id, semester=1, term="Midterm", status="posted"))

        exams = self.generate()
        self.assertEqual(sum(exam.proctor_id is not None for exam in exams), 12)
        all_exams = self.db.query(Exam).filter(Exam.proctor_id.isnot(None)).all()
        for proctor in (self.proctor, other):
            loads = Counter(exam.timeslot.date.weekday() for exam in all_exams if exam.proctor_id == proctor.id)
            self.assertEqual(loads, {0: 3, 1: 2, 2: 3})

    def test_no_reservation_for_day_without_any_eligible_exam(self):
        wednesday = self.db.query(TeacherSchedule).filter_by(
            teacher_id=self.proctor.teacher_id, day_of_week=2).one()
        wednesday.end_time = time(9)  # Each exam lasts 75 minutes.
        assigned = [e for e in self.generate() if e.proctor_id == self.proctor.id]
        self.assertEqual(len(assigned), 8)
        self.assertEqual({e.timeslot.date for e in assigned}, {date(2026, 12, 14), date(2026, 12, 15)})

    def test_posted_booking_on_later_day_does_not_reduce_coverage(self):
        course = self.db.query(Course).one()
        year = self.db.query(YearLevel).one()
        other_section = Section(name="BSCS 1-102", course_id=course.id, year_level_id=year.id,
                                semester=1, student_count=0)
        posted_slot = Timeslot(date=date(2026, 12, 16), start_time=time(8), end_time=time(15))
        self.db.add_all([other_section, posted_slot])
        self.db.flush()
        self.db.add(Exam(course_id=course.id, year_level_id=year.id, section_id=other_section.id,
                         timeslot_id=posted_slot.id, proctor_id=self.proctor.id,
                         semester=1, term="Midterm", status="posted"))
        exams = self.generate()
        assigned = [e for e in exams if e.proctor_id == self.proctor.id]
        # The existing posted duty counts toward the eight-duty limit.
        self.assertEqual(len(assigned), 7)
        self.assertTrue(all(e.timeslot.date != date(2026, 12, 16) for e in assigned))

class ConsecutiveDayCheckTests(unittest.TestCase):
    def test_fourth_consecutive_duty_is_rejected_even_with_a_later_posted_duty(self):
        posted = [(480, 555), (570, 645), (660, 735), (1000, 1075)]
        self.assertFalse(scheduler._proctor_day_within_consecutive_limit(posted + [(750, 825)], 30))

    def test_duty_after_a_sufficient_break_is_allowed(self):
        posted = [(480, 555), (570, 645), (660, 735), (1000, 1075)]
        self.assertTrue(scheduler._proctor_day_within_consecutive_limit(posted + [(780, 855)], 30))


if __name__ == "__main__":
    unittest.main()
