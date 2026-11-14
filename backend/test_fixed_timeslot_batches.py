"""Fixed papers share room capacity in batches without leaving their fixed day."""

from contextlib import redirect_stdout
from datetime import date, time
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

_temporary_directory = tempfile.TemporaryDirectory(prefix="fixed-exam-batches-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_temporary_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-fixed-exam-batching-test-secret-key-123456789"

from core import Base, SessionLocal, engine
from model import Course, YearLevel, Section, Subject, Room, User, Teacher, TeacherSchedule, Proctor, Exam, Timeslot
from utils import scheduler
from utils.exam_batch_labels import get_exam_batch_numbers


class FixedTimeslotBatchTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = SessionLocal()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()

    def populate(self, department="College", section_count=20, capacities=None, sizes=None,
                 durations=(75, 75), fixed=True, ordinary=False):
        capacities = capacities or [40] * 8
        sizes = sizes or [1] * section_count
        year = YearLevel(id=5 if department == "SHS" else 1, name="Grade 11" if department == "SHS" else "1st Year")
        courses = [Course(name=name, category=department) for name in
                   (("STEM", "ABM") if department == "SHS" else ("BSIT", "BSCS"))]
        self.db.add_all([year, *courses])
        self.db.flush()
        self.sections = []
        for index in range(section_count):
            course = courses[index // max(1, (section_count + 1) // 2)]
            section = Section(name=f"{course.name} 1-{101 + index}", course_id=course.id,
                              year_level_id=year.id, semester=1, student_count=sizes[index])
            self.db.add(section)
            self.db.flush()
            self.sections.append(section)
            for student in range(sizes[index]):
                self.db.add(User(name=f"Student {index}-{student}", email=f"s{index}-{student}@test.invalid",
                                 hashed_password="unused", role="student", student_type="regular",
                                 section_name=section.name, course_id=course.id))
        building = "C" if department == "SHS" else "B"
        for index, capacity in enumerate(capacities):
            self.db.add(Room(name=f"{building}{501 + index}", building=building,
                             department=department, capacity=capacity))
        for course in courses:
            for index, duration in enumerate(durations):
                self.db.add(Subject(name=f"Fixed Paper {index + 1}", code=f"{course.name}-{index}",
                                    course_id=course.id, year_level_id=year.id, semester=1, term="Midterm",
                                    exam_type="written", category="major", duration_minutes=duration,
                                    is_fixed_timeslot=fixed, fixed_day=1 if fixed else None,
                                    fixed_start_time=time(8) if fixed else None))
            if ordinary:
                self.db.add(Subject(name=f"{course.name} Ordinary Paper", code=f"{course.name}-ordinary",
                                    course_id=course.id, year_level_id=year.id, semester=1, term="Midterm",
                                    exam_type="written", category="major", duration_minutes=75))
        for index in range(len(capacities) * 3):
            teacher = Teacher(name=f"Teacher {index}")
            self.db.add(teacher)
            self.db.flush()
            self.db.add(Proctor(name=f"Proctor {index}", teacher_id=teacher.id,
                                department="SHS" if department == "SHS" else "ICT"))
            for weekday in range(4):
                self.db.add(TeacherSchedule(teacher_id=teacher.id, day_of_week=weekday,
                                           start_time=time(8), end_time=time(17)))
        self.db.commit()

    def generate(self, department="College", daily_end=time(16, 45), term="Midterm"):
        with patch.object(scheduler, "POP_SIZE", 6), patch.object(scheduler, "GENERATIONS", 4), redirect_stdout(io.StringIO()):
            result = scheduler.generate_exam_schedule(
                self.db, start_date=date(2026, 11, 16), end_date=date(2026, 11, 19),
                department=department, semester=1, term=term, daily_start_time=time(8), daily_end_time=daily_end,
            )
        return result, self.db.query(Exam).filter(Exam.status == "draft").all()

    def assert_safe(self, exams):
        for exam in exams:
            self.assertIsNotNone(exam.room_id)
            self.assertGreaterEqual(exam.room.capacity, exam.section.student_count)
            self.assertGreaterEqual(exam.timeslot.start_time, time(8))
        for index, first in enumerate(exams):
            for second in exams[index + 1:]:
                if first.timeslot.date != second.timeslot.date:
                    continue
                overlaps = first.timeslot.start_time < second.timeslot.end_time and second.timeslot.start_time < first.timeslot.end_time
                if overlaps:
                    self.assertNotEqual(first.room_id, second.room_id)
                    self.assertNotEqual(first.section_id, second.section_id)
                    if first.proctor_id and second.proctor_id:
                        self.assertNotEqual(first.proctor_id, second.proctor_id)
        by_section_day = {}
        for exam in exams:
            by_section_day.setdefault((exam.section_id, exam.timeslot.date), []).append(exam)
        for day_exams in by_section_day.values():
            ordered = sorted(day_exams, key=lambda exam: exam.timeslot.start_time)
            self.assertLessEqual(len(ordered), 3)
            for first, second in zip(ordered, ordered[1:]):
                end = first.timeslot.end_time.hour * 60 + first.timeslot.end_time.minute
                start = second.timeslot.start_time.hour * 60 + second.timeslot.start_time.minute
                self.assertGreaterEqual(start - end, 15)
                self.assertLessEqual(start - end, 75)
        by_proctor_day = {}
        for exam in exams:
            if exam.proctor_id:
                by_proctor_day.setdefault((exam.proctor_id, exam.timeslot.date), []).append(exam)
        for day_exams in by_proctor_day.values():
            ordered = sorted(day_exams, key=lambda exam: exam.timeslot.start_time)
            streak = 1
            for first, second in zip(ordered, ordered[1:]):
                end = first.timeslot.end_time.hour * 60 + first.timeslot.end_time.minute
                start = second.timeslot.start_time.hour * 60 + second.timeslot.start_time.minute
                streak = streak + 1 if 0 <= start - end <= 30 else 1
                self.assertLessEqual(streak, 2)

    def test_twenty_sections_for_each_fixed_paper_use_later_batches_on_the_fixed_day(self):
        self.populate()
        result, exams = self.generate()
        self.assertEqual(result["total_exams"], 40)
        self.assertEqual(result["assigned_proctors"], 40)
        self.assertEqual({exam.timeslot.date for exam in exams}, {date(2026, 11, 16)})
        self.assertEqual(min(exam.timeslot.start_time for exam in exams), time(8))
        for name in ("Fixed Paper 1", "Fixed Paper 2"):
            self.assertGreater(len({exam.timeslot_id for exam in exams if exam.subject.name == name}), 1)
        self.assert_safe(exams)

    def test_shs_strands_batch_on_the_same_fixed_day(self):
        self.populate(department="SHS", section_count=6, capacities=[40] * 3)
        for subject in self.db.query(Subject):
            subject.fixed_day = 2
            subject.term = "ST1"
        self.db.commit()
        result, exams = self.generate(department="SHS", term="ST1")
        self.assertEqual(result["total_exams"], 12)
        self.assertEqual({exam.timeslot.date for exam in exams}, {date(2026, 11, 17)})
        self.assert_safe(exams)

    def test_two_distinct_course_papers_share_capacity_across_later_batches(self):
        self.populate(section_count=40, capacities=[40] * 8)
        courses = self.db.query(Course).order_by(Course.id).all()
        for subject in self.db.query(Subject).all():
            if (subject.course_id == courses[0].id and subject.name == "Fixed Paper 2") or (
                subject.course_id == courses[1].id and subject.name == "Fixed Paper 1"
            ):
                self.db.delete(subject)
        self.db.commit()
        _, exams = self.generate()
        self.assertEqual(len(exams), 40)
        self.assertEqual({exam.timeslot.date for exam in exams}, {date(2026, 11, 16)})
        for name in ("Fixed Paper 1", "Fixed Paper 2"):
            self.assertEqual(sum(exam.subject.name == name for exam in exams), 20)
        self.assert_safe(exams)

    def test_room_seat_capacity_is_preserved_in_every_batch(self):
        self.populate(section_count=4, capacities=[2, 4], sizes=[4, 2, 4, 2])
        _, exams = self.generate()
        self.assertEqual(len(exams), 8)
        self.assert_safe(exams)

    def test_mixed_durations_do_not_overlap_rooms_or_students(self):
        self.populate(section_count=4, capacities=[40] * 2, durations=(75, 120))
        _, exams = self.generate()
        self.assertEqual(len(exams), 8)
        self.assertEqual({exam.timeslot.date for exam in exams}, {date(2026, 11, 16)})
        self.assert_safe(exams)

    def test_fixed_batches_keep_priority_over_ordinary_subjects(self):
        self.populate(section_count=4, capacities=[40] * 2, ordinary=True)
        _, exams = self.generate()
        self.assertEqual(len(exams), 12)
        fixed = [exam for exam in exams if exam.subject.is_fixed_timeslot]
        self.assertEqual({exam.timeslot.date for exam in fixed}, {date(2026, 11, 16)})
        self.assert_safe(exams)

    def test_insufficient_same_day_capacity_never_spills_into_the_next_day(self):
        self.populate(section_count=6, capacities=[40] * 2)
        with self.assertRaisesRegex(ValueError, "fixed day"):
            self.generate(daily_end=time(9, 15))
        self.db.rollback()
        self.assertEqual(self.db.query(Exam).count(), 0)

    def test_posted_room_bookings_in_other_terms_are_preserved(self):
        self.populate(section_count=4, capacities=[40] * 2)
        room = self.db.query(Room).order_by(Room.id).first()
        subject = self.db.query(Subject).first()
        slot = Timeslot(date=date(2026, 11, 16), start_time=time(8), end_time=time(9, 15))
        self.db.add(slot)
        self.db.flush()
        posted = Exam(subject_id=subject.id, room_id=room.id, timeslot_id=slot.id,
                      course_id=subject.course_id, semester=1, term="Prelim", status="posted")
        self.db.add(posted)
        self.db.commit()
        posted_id = posted.id
        _, exams = self.generate()
        self.assertEqual(len(exams), 8)
        self.assert_safe(exams)
        self.assertEqual(self.db.get(Exam, posted_id).status, "posted")
        self.assertEqual(self.db.get(Exam, posted_id).timeslot_id, slot.id)
        self.assertTrue(all(exam.room_id != room.id or exam.timeslot.start_time >= time(9, 15) for exam in exams))

    def test_a_section_that_exceeds_every_room_is_rejected(self):
        self.populate(section_count=2, capacities=[2], sizes=[3, 1])
        with self.assertRaisesRegex(ValueError, "seat capacities"):
            self.generate()
        self.db.rollback()
        self.assertEqual(self.db.query(Exam).count(), 0)

    def test_overflow_starts_at_or_after_a_later_fixed_slot(self):
        self.populate(section_count=4, capacities=[40] * 2)
        for subject in self.db.query(Subject):
            subject.fixed_start_time = time(11)
        self.db.commit()
        _, exams = self.generate()
        self.assertEqual(len(exams), 8)
        self.assertTrue(all(exam.timeslot.start_time >= time(11) for exam in exams))
        self.assertEqual({exam.timeslot.date for exam in exams}, {date(2026, 11, 16)})
        self.assert_safe(exams)

    def test_nonfixed_shared_subjects_still_require_one_sitting(self):
        self.populate(section_count=4, capacities=[40] * 2, durations=(75,), fixed=False)
        with self.assertRaisesRegex(ValueError, "one date and time"):
            self.generate()

    def test_uncontested_fixed_subject_keeps_the_original_slot(self):
        self.populate(section_count=4, capacities=[40] * 4, durations=(75,))
        _, exams = self.generate()
        self.assertEqual(len(exams), 4)
        self.assertEqual({(exam.timeslot.date, exam.timeslot.start_time) for exam in exams}, {(date(2026, 11, 16), time(8))})
        self.assert_safe(exams)

    def test_batch_labels_are_persisted_even_when_the_whole_paper_starts_late(self):
        self.populate(section_count=4, capacities=[40] * 2)
        _, exams = self.generate()
        by_paper = {}
        for exam in exams:
            by_paper.setdefault(exam.subject.name, set()).add((exam.timeslot.start_time, exam.batch_number))
        self.assertEqual(by_paper["Fixed Paper 1"], {(time(8), 1), (time(11), 2)})
        self.assertEqual(by_paper["Fixed Paper 2"], {(time(9, 30), 2), (time(12, 30), 3)})
        expected = {exam.id: exam.batch_number for exam in exams}
        for exam in exams:
            exam.status = "posted"
        for subject in self.db.query(Subject):
            subject.is_fixed_timeslot = False
        self.db.commit()
        self.db.expire_all()
        self.assertEqual(get_exam_batch_numbers(self.db, self.db.query(Exam).all()), expected)

    def test_legacy_labels_use_all_sections_without_moving_any_exam(self):
        self.populate(section_count=4, capacities=[40] * 2)
        _, exams = self.generate()
        expected = {exam.id: exam.batch_number for exam in exams}
        for exam in exams:
            exam.batch_number = None
        self.db.commit()
        snapshot = {exam.id: (exam.timeslot_id, exam.room_id, exam.proctor_id, exam.status) for exam in exams}
        self.assertEqual(get_exam_batch_numbers(self.db, exams), expected)
        last = max(exams, key=lambda exam: exam.timeslot.start_time)
        self.assertEqual(get_exam_batch_numbers(self.db, [last]), {last.id: 3})
        self.assertEqual({exam.id: (exam.timeslot_id, exam.room_id, exam.proctor_id, exam.status) for exam in exams}, snapshot)
        self.assertFalse(self.db.dirty)


if __name__ == "__main__":
    unittest.main()
