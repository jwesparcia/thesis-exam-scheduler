"""Room Management term filters against an isolated SQLite database."""

from datetime import date, time
import os
from pathlib import Path
import tempfile
import unittest

_test_directory = tempfile.TemporaryDirectory(prefix="room-term-filter-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_test_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-room-term-filter-secret-key-123456789"

from core import Base, SessionLocal, engine
from model import Course, Exam, Room, Section, Subject, Timeslot, User, YearLevel
from routers.exams import get_room_status


class RoomTermFilterTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = SessionLocal()
        self.admin = User(name="Admin", email="admin@test.invalid", hashed_password="unused", role="program_head")
        self.college = Course(name="BSCS", category="College")
        self.shs = Course(name="STEM", category="SHS")
        self.year = YearLevel(name="1st Year")
        self.room = Room(name="B501", building="B", department="College", capacity=40)
        self.empty_room = Room(name="B502", building="B", department="College", capacity=40)
        self.shs_room = Room(name="C501", building="C", department="SHS", capacity=40)
        self.slot = Timeslot(date=date(2026, 11, 16), start_time=time(8), end_time=time(9, 15))
        self.db.add_all([self.admin, self.college, self.shs, self.year, self.room, self.empty_room, self.shs_room, self.slot])
        self.db.flush()
        self.section = Section(name="BSCS 1-101", course_id=self.college.id, year_level_id=self.year.id, student_count=35)
        self.subject = Subject(name="Written Paper", code="CS101", course_id=self.college.id,
                               year_level_id=self.year.id, semester=1, exam_type="written", duration_minutes=75)
        self.db.add_all([self.section, self.subject])
        self.db.flush()
        self.exams = {
            term: self.exam(term, status=status)
            for term, status in (("Prelim", "posted"), ("Midterm", "saved"), ("Pre-Final", "draft"), ("Final", "posted"))
        }
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        _test_directory.cleanup()

    def exam(self, term, *, status="posted", semester=1, room="default", course=None):
        exam = Exam(subject_id=self.subject.id, section_id=self.section.id, course_id=(course or self.college).id,
                    year_level_id=self.year.id, timeslot_id=self.slot.id, semester=semester, term=term, status=status,
                    room_id=self.room.id if room == "default" else room.id if room else None)
        self.db.add(exam)
        self.db.flush()
        return exam

    def read(self, term=None, *, department="College", semester=1, status="all"):
        return get_room_status(department=department, semester=semester, status=status, term=term,
                               db=self.db, current_user=self.admin)

    def booking_ids(self, result):
        return {exam["id"] for room in result["rooms"] for exam in room["bookings"]}

    def test_each_college_term_filters_bookings_occupancy_and_conflicts(self):
        for term, exam in self.exams.items():
            with self.subTest(term=term):
                result = self.read(term)
                self.assertEqual(result["filters"]["term"], term)
                self.assertEqual(self.booking_ids(result), {exam.id})
                self.assertEqual(result["summary"]["total_exams"], 1)
                self.assertEqual(result["summary"]["in_use_rooms"], 1)
                self.assertEqual(result["summary"]["available_rooms"], 1)
                self.assertEqual(result["conflicts"], [])
                self.assertEqual({booking["term"] for room in result["rooms"] for booking in room["bookings"]}, {term})

    def test_all_terms_preserves_the_existing_overview(self):
        result = self.read()
        self.assertEqual(result, self.read("all"))
        self.assertEqual(self.booking_ids(result), {exam.id for exam in self.exams.values()})
        self.assertEqual(result["summary"]["total_exams"], 4)
        self.assertEqual(result["summary"]["conflict_rooms"], 1)

    def test_term_combines_with_semester_and_schedule_status(self):
        draft = self.exam("Midterm", status="draft")
        posted = self.exam("Midterm", status="posted")
        second_semester = self.exam("Midterm", semester=2)
        self.db.commit()
        self.assertEqual(self.booking_ids(self.read("Midterm", status="draft")), {draft.id})
        self.assertEqual(self.booking_ids(self.read("Midterm", status="posted")), {posted.id})
        self.assertEqual(self.booking_ids(self.read("Midterm", semester=2)), {second_semester.id})
        # Keep the existing rule that pending replacements hide older posted exams.
        self.assertEqual(self.booking_ids(self.read("Midterm")), {self.exams["Midterm"].id, draft.id})
        self.assertEqual(self.booking_ids(self.read("Prelim")), {self.exams["Prelim"].id})

    def test_assignment_issues_and_totals_only_include_the_selected_term(self):
        missing = self.exam("Prelim", room=None)
        wrong_building = self.exam("Midterm", room=self.shs_room, status="saved")
        self.db.commit()
        prelim = self.read("Prelim")
        midterm = self.read("Midterm")
        self.assertEqual([exam["id"] for exam in prelim["unassigned_exams"]], [missing.id])
        self.assertEqual(prelim["summary"]["unassigned_exams"], 1)
        self.assertEqual(prelim["wrong_building_exams"], [])
        self.assertEqual(midterm["unassigned_exams"], [])
        self.assertEqual([exam["id"] for exam in midterm["wrong_building_exams"]], [wrong_building.id])
        self.assertEqual(midterm["summary"]["wrong_building_exams"], 1)
        self.assertEqual(prelim["summary"]["total_exams"], 2)
        self.assertEqual(midterm["summary"]["total_exams"], 2)

    def test_a_term_without_exams_keeps_the_room_inventory_available(self):
        result = self.read("Final", semester=3)
        self.assertEqual(result["summary"]["total_exams"], 0)
        self.assertEqual(result["summary"]["available_rooms"], 2)
        self.assertTrue(all(room["status"] == "available" and not room["bookings"] for room in result["rooms"]))

    def test_shs_and_all_levels_support_their_exam_terms(self):
        for term in ("ST1", "ST2", "T1"):
            exam = self.exam(term, room=self.shs_room, course=self.shs)
            self.db.commit()
            result = self.read(term, department="SHS")
            self.assertEqual(self.booking_ids(result), {exam.id})
            self.assertEqual(result["summary"]["total_rooms"], 1)
            self.assertEqual(self.booking_ids(self.read(term, department="All")), {exam.id})

    def test_viewing_different_terms_never_changes_schedule_or_room_data(self):
        models = (Exam, Room, Subject, Timeslot)
        before = {model.__tablename__: self.db.query(*model.__table__.columns).order_by(model.id).all() for model in models}
        for term in (None, "Prelim", "Midterm", "Pre-Final", "Final"):
            self.read(term)
        after = {model.__tablename__: self.db.query(*model.__table__.columns).order_by(model.id).all() for model in models}
        self.assertEqual(before, after)
        self.assertFalse(self.db.dirty)


if __name__ == "__main__":
    unittest.main()
