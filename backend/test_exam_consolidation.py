"""Regression checks for joining irregular students to existing class exams."""

import json
import os
from pathlib import Path
import tempfile
import unittest
from datetime import date, time
from types import SimpleNamespace

_temporary_directory = tempfile.TemporaryDirectory(prefix="exam-consolidation-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_temporary_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-exam-consolidation-secret-key-123456789"

from core import Base, SessionLocal, engine
from model import Course, YearLevel, Section, Subject, User, Room, Exam, Timeslot, IrregularSelection, Proctor, ReschedulingRequest
from routers.catalog import get_exams_attendance_list
from services.exam_consolidation import build_consolidation_plan, apply_consolidation_plan
from consolidate_irregular_exams import consolidate_current_drafts


class ExamConsolidationTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = SessionLocal()
        self.course = Course(name="BSIT", category="College")
        self.year = YearLevel(name="1st Year")
        self.slot = Timeslot(date=date(2026, 11, 16), start_time=time(8), end_time=time(9, 15))
        self.room = Room(name="B501", capacity=4, building="B", department="College")
        self.small_room = Room(name="B502", capacity=4, building="B", department="College")
        self.proctor = Proctor(name="Host proctor")
        self.db.add_all([self.course, self.year, self.slot, self.room, self.small_room, self.proctor])
        self.db.flush()
        self.section = Section(name="BSIT 1-101", course_id=self.course.id, year_level_id=self.year.id, semester=1)
        self.empty_section = Section(name="BSIT 1-104", course_id=self.course.id, year_level_id=self.year.id, semester=1)
        self.subject = Subject(code="IT101", name="Ethics", course_id=self.course.id, semester=1,
                               year_level_id=self.year.id, exam_type="written")
        self.db.add_all([self.section, self.empty_section, self.subject])
        self.db.flush()
        for index in range(2):
            self.db.add(User(name=f"Regular {index}", email=f"regular{index}@test.invalid", role="student",
                             hashed_password="unused", student_type="regular", section_name=self.section.name))
        self.irregulars = [User(name=f"Irregular {index}", email=f"irregular{index}@test.invalid", role="student",
                               hashed_password="unused", student_type="irregular") for index in range(2)]
        self.db.add_all(self.irregulars)
        self.db.flush()
        self.selections = [IrregularSelection(user_id=user.id, subject_id=self.subject.id,
                                             section_id=self.empty_section.id) for user in self.irregulars]
        self.host = self.exam(self.section, self.room)
        self.source = self.exam(self.empty_section, self.small_room)
        self.db.add_all(self.selections + [self.host, self.source])
        self.db.commit()

    def exam(self, section, room):
        return Exam(section_id=section.id, subject_id=self.subject.id, course_id=self.course.id,
                    year_level_id=self.year.id, semester=1, term="Midterm", status="draft",
                    timeslot_id=self.slot.id, room_id=room.id, proctor_id=self.proctor.id)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    def roster(self):
        return get_exams_attendance_list(compact=False, db=self.db,
                                        current_user=SimpleNamespace(role="program_head"))

    def test_join_preserves_time_room_proctor_subject_and_all_students(self):
        source_id, host_id = self.source.id, self.host.id
        before = (self.host.timeslot_id, self.host.room_id, self.host.proctor_id)
        report = consolidate_current_drafts(self.db, Path(_temporary_directory.name) / "backups", apply=True)
        self.db.expire_all()
        self.assertEqual(report["joined_assignments"], 2)
        self.assertEqual(report["removed_exams"], 1)
        self.assertEqual({exam.id for exam in self.db.query(Exam)}, {host_id})
        self.assertEqual((self.host.timeslot_id, self.host.room_id, self.host.proctor_id), before)
        self.assertEqual({selection.section_id for selection in self.db.query(IrregularSelection)}, {self.section.id})
        self.assertEqual({selection.subject_id for selection in self.db.query(IrregularSelection)}, {self.subject.id})
        self.assertEqual(self.roster()[0]["student_count"], 4)
        backup = json.loads(Path(report["backup"]).read_text())
        self.assertEqual(backup["removed_exams"][0]["id"], source_id)
        self.assertEqual(len(backup["previous_selections"]), 2)
        again = consolidate_current_drafts(self.db, Path(_temporary_directory.name) / "backups", apply=True)
        self.assertEqual(again["joined_assignments"], 0)

    def test_partial_capacity_keeps_unplaced_student_and_does_not_overfill(self):
        self.room.capacity = 3
        self.db.commit()
        plan = build_consolidation_plan(self.db)
        report = apply_consolidation_plan(self.db, plan)
        self.db.commit()
        self.assertEqual(report["joined_assignments"], 1)
        self.assertEqual(report["removed_exams"], 0)
        self.assertEqual(sorted(row["student_count"] for row in self.roster()), [1, 3])

    def test_two_students_can_use_separate_class_rooms_with_one_seat_each(self):
        self.room.capacity = 3
        second_section = Section(name="BSIT 1-102", course_id=self.course.id,
                                 year_level_id=self.year.id, semester=1)
        second_room = Room(name="B503", capacity=2, department="College", building="B")
        self.db.add_all([second_section, second_room])
        self.db.flush()
        self.db.add(User(name="Other regular", email="other@test.invalid", role="student", hashed_password="unused",
                         student_type="regular", section_name=second_section.name))
        self.db.add(self.exam(second_section, second_room))
        self.db.commit()
        plan = build_consolidation_plan(self.db)
        self.assertEqual(len(plan["joins"]), 2)
        self.assertEqual(len({move["to_section_id"] for move in plan["moves"]}), 2)
        apply_consolidation_plan(self.db, plan)
        self.db.commit()
        self.assertEqual(sorted(row["student_count"] for row in self.roster()), [2, 3])

    def test_different_exam_time_is_not_a_compatible_host(self):
        later = Timeslot(date=date(2026, 11, 16), start_time=time(10), end_time=time(11, 15))
        self.db.add(later)
        self.db.flush()
        self.host.timeslot_id = later.id
        self.db.commit()
        self.assertEqual(build_consolidation_plan(self.db)["joins"], [])

    def test_other_published_assignment_and_rescheduling_request_are_protected(self):
        published = self.exam(self.empty_section, self.small_room)
        published.status = "posted"
        self.db.add(published)
        self.db.commit()
        self.assertEqual(build_consolidation_plan(self.db)["joins"], [])
        self.db.delete(published)
        self.db.add(ReschedulingRequest(exam_id=self.source.id, status="pending"))
        self.db.commit()
        self.assertEqual(build_consolidation_plan(self.db)["joins"], [])

    def test_unproctored_host_does_not_replace_proctored_exam(self):
        self.host.proctor_id = None
        self.db.commit()
        self.assertEqual(build_consolidation_plan(self.db)["joins"], [])

    def test_shared_room_occupancy_is_counted_across_other_exams(self):
        other_section = Section(name="BSIT 1-102", course_id=self.course.id, semester=1)
        other_subject = Subject(name="Different exam", code="OTHER", semester=1)
        self.db.add_all([other_section, other_subject])
        self.db.flush()
        for index in range(2):
            self.db.add(User(name=f"Other {index}", email=f"other{index}@test.invalid", role="student",
                             hashed_password="unused", student_type="regular", section_name=other_section.name))
        other_exam = self.exam(other_section, self.room)
        other_exam.subject_id = other_subject.id
        self.db.add(other_exam)
        self.db.commit()
        self.assertEqual(build_consolidation_plan(self.db)["joins"], [])

    def test_college_students_are_not_moved_into_shs_exams(self):
        shs = Course(name="STEM", category="SHS")
        self.db.add(shs)
        self.db.flush()
        self.host.course_id = shs.id
        self.db.commit()
        self.assertEqual(build_consolidation_plan(self.db)["joins"], [])

    def test_student_enrollment_changed_after_plan_is_rejected(self):
        plan = build_consolidation_plan(self.db)
        self.selections[0].section_id = self.section.id
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "enrollment changed"):
            apply_consolidation_plan(self.db, plan)
        self.db.rollback()
        self.assertEqual(self.db.query(Exam).count(), 2)


if __name__ == "__main__":
    try:
        unittest.main()
    finally:
        engine.dispose()
        _temporary_directory.cleanup()
