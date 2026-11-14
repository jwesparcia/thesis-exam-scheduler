"""Regression checks for empty exams and irregular-only exam eligibility."""

import os
from pathlib import Path
import tempfile
import unittest
import json
from datetime import date, time
from types import SimpleNamespace
from unittest.mock import patch

_temporary_directory = tempfile.TemporaryDirectory(prefix="exam-enrollment-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_temporary_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-exam-enrollment-test-secret-key-123456789"

from core import Base, SessionLocal, engine
from model import Course, YearLevel, Section, Subject, User, Room, Exam, IrregularSelection, ReschedulingRequest, Timeslot
from utils.exam_enrollment import ExamEnrollment
from utils import scheduler
from routers.catalog import get_exams_attendance_list
from repair_empty_exam_drafts import repair_empty_exam_drafts


class ExamEnrollmentTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = SessionLocal()
        course = Course(name="BSIT", category="College", department_code="ICT")
        year = YearLevel(name="1st Year")
        self.db.add_all([course, year])
        self.db.flush()
        self.regular = Section(name="BSIT 1-101", course_id=course.id, year_level_id=year.id,
                               semester=1, student_count=35)
        self.irregular_only = Section(name="BSIT 1-104", course_id=course.id, year_level_id=year.id,
                                      semester=1, student_count=35)
        self.empty = Section(name="BSIT 1-105", course_id=course.id, year_level_id=year.id,
                             semester=1, student_count=35)
        self.subjects = [Subject(code=code, name=name, course_id=course.id, year_level_id=year.id,
                                 semester=1, exam_type="written", category="general", duration_minutes=75,
                                 term="Midterm")
                         for code, name in [("IT101", "Ethics"), ("IT102", "Mathematics in the Modern World")]]
        self.db.add_all([self.regular, self.irregular_only, self.empty, *self.subjects])
        self.db.flush()
        self.regular_users = [User(name=f"Regular {i}", email=f"regular{i}@test.invalid",
                                   hashed_password="unused", role="student", student_type="regular",
                                   section_name="  bsit 1-101  ", course_id=course.id) for i in range(2)]
        self.irregular_users = [User(name=f"Irregular {i}", email=f"irregular{i}@test.invalid",
                                     hashed_password="unused", role="student", student_type="irregular",
                                     section_name="Irregular", course_id=course.id) for i in range(2)]
        self.db.add_all(self.regular_users + self.irregular_users)
        self.db.flush()
        self.db.add_all([IrregularSelection(user_id=user.id, section_id=self.irregular_only.id,
                                           subject_id=self.subjects[0].id) for user in self.irregular_users])
        for room in ("B501", "B502", "B503"):
            self.db.add(Room(name=room, building="B", department="College", capacity=3))
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    def test_actual_enrollment_overrides_default_counts(self):
        enrollment = ExamEnrollment(self.db)
        self.assertEqual(enrollment.regular_count(self.regular), 2)
        self.assertEqual(enrollment.total_count(self.irregular_only, self.subjects[0]), 2)
        self.assertEqual(enrollment.total_count(self.irregular_only, self.subjects[1]), 0)
        self.assertFalse(enrollment.has_students(self.empty))

    def test_duplicate_and_equivalent_selections_count_each_student_once(self):
        alias = Subject(name="  ETHICS  ", code="OTHER101", semester=1)
        self.db.add(alias)
        self.db.flush()
        self.db.add(IrregularSelection(user_id=self.irregular_users[0].id,
                                       section_id=self.irregular_only.id, subject_id=alias.id))
        self.db.commit()
        self.assertEqual(ExamEnrollment(self.db).irregular_count(self.irregular_only, self.subjects[0]), 2)

    def test_other_role_selections_do_not_create_enrollment(self):
        staff = User(name="Staff", email="staff@test.invalid", hashed_password="unused", role="proctor")
        self.db.add(staff)
        self.db.flush()
        self.db.add(IrregularSelection(user_id=staff.id, section_id=self.empty.id, subject_id=self.subjects[0].id))
        self.db.commit()
        self.assertFalse(ExamEnrollment(self.db).has_students(self.empty))

    def test_generation_preserves_two_student_exam_and_skips_empty_subjects(self):
        with patch.object(scheduler, "POP_SIZE", 6), patch.object(scheduler, "GENERATIONS", 4):
            result = scheduler.generate_exam_schedule(
                self.db, start_date=date(2026, 11, 16), end_date=date(2026, 11, 19),
                department="College", semester=1, daily_start_time=time(8), daily_end_time=time(16, 45),
            )
        exams = self.db.query(Exam).all()
        expected_pairs = {(self.regular.id, subject.id) for subject in self.subjects}
        expected_pairs.add((self.irregular_only.id, self.subjects[0].id))
        self.assertEqual({(exam.section_id, exam.subject_id) for exam in exams}, expected_pairs)
        self.assertEqual(result["total_exams"], 3)
        self.assertEqual(self.irregular_only.student_count, 0)
        self.assertEqual(self.empty.student_count, 0)
        attendance = get_exams_attendance_list(compact=False, db=self.db,
                                              current_user=SimpleNamespace(role="program_head"))
        self.assertEqual(sorted(exam["student_count"] for exam in attendance), [1, 2, 3])
        self.assertEqual(result["consolidation"]["joined_assignments"], 1)
        for exam in exams:
            matching = next(row for row in attendance if row["exam_id"] == exam.id)
            self.assertGreaterEqual(exam.room.capacity, matching["student_count"])
        shared = [exam for exam in exams if exam.subject_id == self.subjects[0].id]
        self.assertEqual(len({exam.timeslot_id for exam in shared}), 1)

    def test_no_enrollment_in_scope_does_not_fall_back_to_placeholder_sections(self):
        for user in self.regular_users:
            user.section_name = "ANOTHER COURSE 1-101"
        self.db.query(IrregularSelection).delete()
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "No enrolled students"):
            scheduler.generate_exam_schedule(self.db, start_date=date(2026, 11, 16),
                                              end_date=date(2026, 11, 19), department="College", semester=1)
        self.db.rollback()
        self.assertEqual(self.db.query(Exam).count(), 0)

    def test_generation_consolidates_and_does_not_recreate_small_exam_on_next_run(self):
        for room in self.db.query(Room):
            room.capacity = 4
        self.db.commit()
        with patch.object(scheduler, "POP_SIZE", 6), patch.object(scheduler, "GENERATIONS", 4):
            result = scheduler.generate_exam_schedule(
                self.db, start_date=date(2026, 11, 16), end_date=date(2026, 11, 19),
                department="College", semester=1, daily_start_time=time(8), daily_end_time=time(16, 45),
            )
            self.assertEqual(result["total_exams"], 2)
            self.assertEqual(result["consolidation"]["joined_assignments"], 2)
            self.assertEqual(result["consolidation"]["removed_exams"], 1)
            self.assertEqual({exam.section_id for exam in self.db.query(Exam)}, {self.regular.id})
            again = scheduler.generate_exam_schedule(
                self.db, start_date=date(2026, 11, 16), end_date=date(2026, 11, 19),
                department="College", semester=1, daily_start_time=time(8), daily_end_time=time(16, 45),
            )
        self.assertEqual(again["total_exams"], 2)
        self.assertEqual(again["consolidation"]["joined_assignments"], 0)
        self.assertEqual({selection.section_id for selection in self.db.query(IrregularSelection)}, {self.regular.id})

    def test_cleanup_backs_up_empty_drafts_and_keeps_enrolled_exams_unchanged(self):
        slot = Timeslot(date=date(2026, 11, 16), start_time=time(8), end_time=time(9, 15))
        self.db.add(slot)
        self.db.flush()
        empty = Exam(section_id=self.empty.id, subject_id=self.subjects[0].id, status="draft")
        valid = Exam(section_id=self.irregular_only.id, subject_id=self.subjects[0].id,
                     timeslot_id=slot.id, status="draft")
        posted = Exam(section_id=self.empty.id, subject_id=self.subjects[1].id, status="posted")
        self.db.add_all([empty, valid, posted])
        self.db.commit()
        empty_id, valid_id, posted_id = empty.id, valid.id, posted.id
        backup_directory = Path(_temporary_directory.name) / "backups"
        preview = repair_empty_exam_drafts(self.db, backup_directory)
        self.assertEqual(preview["empty_draft_count"], 1)
        self.assertEqual(self.db.query(Exam).count(), 3)
        report = repair_empty_exam_drafts(self.db, backup_directory, apply=True)
        self.db.expire_all()
        self.assertEqual({exam.id for exam in self.db.query(Exam)}, {valid_id, posted_id})
        self.assertEqual(report["preserved_two_student_exams"], 1)
        backup = json.loads(Path(report["backup"]).read_text())
        self.assertEqual(backup["removed_exams"][0]["id"], empty_id)
        self.assertEqual(self.empty.student_count, 0)
        again = repair_empty_exam_drafts(self.db, backup_directory, apply=True)
        self.assertEqual(again["empty_draft_count"], 0)
        self.assertEqual(again["section_headcount_updates"], 0)

    def test_cleanup_preserves_drafts_referenced_by_rescheduling_requests(self):
        empty = Exam(section_id=self.empty.id, subject_id=self.subjects[0].id, status="draft")
        self.db.add(empty)
        self.db.flush()
        self.db.add(ReschedulingRequest(exam_id=empty.id, status="pending"))
        self.db.commit()
        with self.assertRaisesRegex(ValueError, "rescheduling request"):
            repair_empty_exam_drafts(self.db, Path(_temporary_directory.name) / "backups", apply=True)
        self.db.rollback()
        self.assertEqual(self.db.query(Exam).count(), 1)


if __name__ == "__main__":
    try:
        unittest.main()
    finally:
        engine.dispose()
        _temporary_directory.cleanup()
