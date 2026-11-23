"""Schedule edits must check overlapping intervals even when slot IDs differ."""

from datetime import date, time
import os
from pathlib import Path
import tempfile
import unittest

_test_directory = tempfile.TemporaryDirectory(prefix="exam-edit-options-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_test_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-exam-edit-options-test-secret-123456789"

from fastapi import HTTPException
from core import Base, SessionLocal, engine
from model import Course, Exam, Proctor, Room, Section, Subject, Teacher, TeacherSchedule, Timeslot, User
from routers import exams


class ExamEditAvailabilityTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = SessionLocal()
        self.day = date(2026, 11, 16)
        self.admin = User(name="Admin", email="admin@test.invalid", hashed_password="unused", role="program_head")
        course = Course(name="BSIT", category="College")
        self.section = Section(name="BSIT 1-101", course=course, student_count=30)
        other_section = Section(name="BSIT 1-102", course=course, student_count=30)
        subject = Subject(name="Programming", course=course, duration_minutes=75)
        self.room = Room(name="B501", building="B", capacity=40)
        self.other_room = Room(name="B502", building="B", capacity=40)
        self.small_room = Room(name="B503", building="B", capacity=20)
        self.shs_room = Room(name="C501", building="C", capacity=40)
        teacher = Teacher(name="Proctor")
        self.proctor = Proctor(name="Proctor", teacher=teacher, department="ICT")
        self.current = self.slot(time(8), time(9, 15))
        self.candidate = self.slot(time(9, 30), time(10, 45))
        self.adjacent = self.slot(time(11), time(12, 15))
        self.section_conflict = self.slot(time(12, 30), time(13, 45))
        self.short_slot = self.slot(time(14), time(15))
        self.booking = Exam(course=course, subject=subject, section=other_section, room=self.room,
                            timeslot=self.slot(time(9, 45), time(11)), proctor=self.proctor, status="posted", term="Final")
        self.exam = Exam(course=course, subject=subject, section=self.section, room=self.room, timeslot=self.current)
        section_booking = Exam(course=course, subject=subject, section=self.section, room=self.other_room,
                               timeslot=self.slot(time(12, 45), time(14)))
        self.db.add_all([self.admin, self.exam, self.booking, section_booking, self.candidate, self.adjacent,
                         self.section_conflict, self.short_slot, self.other_room, self.small_room, self.shs_room])
        self.db.flush()
        self.db.add(TeacherSchedule(teacher_id=teacher.id, day_of_week=self.day.weekday(),
                                    start_time=time(7), end_time=time(17)))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        _test_directory.cleanup()

    def slot(self, start, end):
        return Timeslot(date=self.day, start_time=start, end_time=end)

    def available(self):
        options = exams.get_exam_edit_options(self.exam.id, self.db, self.admin)
        return {slot["id"]: set(slot["room_ids"]) for slot in options["timeslots"]}

    def update(self, **kwargs):
        return exams.update_exam(self.exam.id, exams.UpdateExamRequest(**kwargs), self.db, self.admin)

    def test_editor_lists_only_matching_slots_and_available_rooms(self):
        available = self.available()
        self.assertEqual(available[self.current.id], {self.room.id, self.other_room.id})
        self.assertEqual(available[self.candidate.id], {self.other_room.id})
        self.assertEqual(available[self.adjacent.id], {self.room.id, self.other_room.id})
        self.assertNotIn(self.section_conflict.id, available)
        self.assertNotIn(self.short_slot.id, available)

        self.db.add(Exam(subject=self.booking.subject, section=self.booking.section, room=self.other_room,
                         timeslot=self.booking.timeslot))
        self.db.commit()
        self.assertNotIn(self.candidate.id, self.available())

    def test_save_rechecks_room_section_and_proctor_conflicts(self):
        for slot, room, proctor, reason in (
            (self.candidate, self.room, None, "Room conflict"),
            (self.section_conflict, self.room, None, "Section schedule conflict"),
            (self.candidate, self.other_room, self.proctor.id, "Proctor conflict"),
        ):
            with self.subTest(reason=reason), self.assertRaises(HTTPException) as rejected:
                self.update(timeslot_id=slot.id, room_id=room.id, proctor_id=proctor)
            self.assertEqual(rejected.exception.status_code, 409)
            self.assertIn(reason, rejected.exception.detail)
            self.db.rollback()
        self.assertEqual(self.exam.timeslot_id, self.current.id)

    def test_unavailable_proctor_is_filtered_and_adjacent_booking_is_allowed(self):
        busy = exams.get_eligible_proctors(self.exam.id, self.candidate.id, self.db, self.admin)
        free = exams.get_eligible_proctors(self.exam.id, self.adjacent.id, self.db, self.admin)
        self.assertNotIn(self.proctor.id, {proctor["id"] for proctor in busy})
        self.assertIn(self.proctor.id, {proctor["id"] for proctor in free})
        result = self.update(timeslot_id=self.adjacent.id, room_id=self.room.id, proctor_id=self.proctor.id)
        self.assertEqual(result["timeslot_id"], self.adjacent.id)

    def test_save_rejects_a_different_duration_and_missing_slot(self):
        for slot_id, status in ((self.short_slot.id, 400), (99999, 404)):
            with self.subTest(slot_id=slot_id), self.assertRaises(HTTPException) as rejected:
                self.update(timeslot_id=slot_id)
            self.assertEqual(rejected.exception.status_code, status)
            self.db.rollback()
