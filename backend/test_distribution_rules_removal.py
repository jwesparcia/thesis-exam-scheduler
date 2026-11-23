"""Removing custom distribution rules preserves break controls and existing exams."""

from contextlib import redirect_stdout
from datetime import date, time
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

_test_directory = tempfile.TemporaryDirectory(prefix="distribution-removal-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_test_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-distribution-removal-test-secret-key-123456789"

from fastapi import FastAPI, HTTPException
from pydantic import ValidationError
from sqlalchemy import inspect, text
from core import Base, SessionLocal, engine
from model import Course, Department, Exam, ExamBreakSetting, ReschedulingRequest, Room, Subject, Timeslot, User
from routers import rules
from services.auto_rescheduler import find_earliest_auto_schedule


class DistributionRulesRemovalTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = SessionLocal()
        self.admin = User(name="Admin", email="admin@test.invalid", hashed_password="unused", role="program_head")
        self.db.add(self.admin)
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        self.db.execute(text("DROP TABLE IF EXISTS distribution_rules"))
        self.db.commit()
        self.db.close()
        Base.metadata.drop_all(engine)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        _test_directory.cleanup()

    def test_rule_api_is_removed_and_break_api_remains(self):
        app = FastAPI()
        app.include_router(rules.router)
        paths = app.openapi()["paths"]
        self.assertEqual(set(paths), {"/rules/break-settings", "/rules/break-settings/{category_type}"})
        self.assertEqual(set(paths["/rules/break-settings"]), {"get"})
        self.assertEqual(set(paths["/rules/break-settings/{category_type}"]), {"put"})
        self.assertNotIn("distribution_rules", inspect(engine).get_table_names())

    def test_break_settings_still_load_save_and_update(self):
        self.assertEqual(rules.get_exam_break_settings(self.db, self.admin), [
            {"category_type": "general", "break_seconds": 0},
            {"category_type": "major", "break_seconds": 0},
        ])
        with patch.object(rules, "is_generation_ongoing", return_value=False):
            for category, seconds in (("general", 900), ("major", 1800), ("general", 1200)):
                result = rules.update_exam_break_setting(
                    category, rules.ExamBreakSettingUpdate(break_seconds=seconds), self.db, self.admin,
                )
                self.assertEqual(result, {"category_type": category, "break_seconds": seconds})
        self.assertEqual(self.db.query(ExamBreakSetting).count(), 2)
        self.assertEqual(rules.get_exam_break_settings(self.db, self.admin), [
            {"category_type": "general", "break_seconds": 1200},
            {"category_type": "major", "break_seconds": 1800},
        ])

    def test_break_validation_and_generation_lock_remain(self):
        for seconds in (-1, 86400):
            with self.subTest(seconds=seconds), self.assertRaises(ValidationError):
                rules.ExamBreakSettingUpdate(break_seconds=seconds)
        update = rules.ExamBreakSettingUpdate(break_seconds=900)
        with self.assertRaises(HTTPException) as invalid_category:
            rules.update_exam_break_setting("other", update, self.db, self.admin)
        self.assertEqual(invalid_category.exception.status_code, 404)
        with patch.object(rules, "is_generation_ongoing", return_value=True):
            with self.assertRaises(HTTPException) as locked:
                rules.update_exam_break_setting("general", update, self.db, self.admin)
        self.assertEqual(locked.exception.status_code, 400)
        self.assertEqual(self.db.query(ExamBreakSetting).count(), 0)

    def test_break_updates_still_require_admin_role(self):
        update_route = next(route for route in rules.router.routes if "PUT" in route.methods)
        role_checker = next(dep.call for dep in update_route.dependant.dependencies if dep.name == "current_user")
        self.assertIs(role_checker(current_user=self.admin), self.admin)
        with self.assertRaises(HTTPException) as denied:
            role_checker(current_user=User(role="student"))
        self.assertEqual(denied.exception.status_code, 403)

    def run_startup(self):
        from main import on_startup

        with patch("core.cache.connect", return_value=False), patch("routers.auth.hash_password", return_value="unused"), redirect_stdout(io.StringIO()):
            on_startup()
        self.db.expire_all()
        self.assertGreater(self.db.query(Department).count(), 0)

    def test_startup_without_rule_table_preserves_break_settings(self):
        self.db.add(ExamBreakSetting(category_type="general", break_seconds=1200))
        self.db.commit()

        self.run_startup()

        self.assertNotIn("distribution_rules", inspect(engine).get_table_names())
        self.assertEqual(self.db.query(ExamBreakSetting).one().break_seconds, 1200)

    def test_legacy_break_migration_still_preserves_saved_settings(self):
        self.db.execute(text("""
            CREATE TABLE distribution_rules (
                id INTEGER PRIMARY KEY, category_type VARCHAR, break_minutes INTEGER
            )
        """))
        self.db.execute(text("""
            INSERT INTO distribution_rules VALUES (1, 'general', 10), (2, 'major', 5)
        """))
        self.db.add(ExamBreakSetting(category_type="general", break_seconds=1200))
        self.db.commit()

        self.run_startup()

        self.assertEqual(rules.get_exam_break_settings(self.db, self.admin), [
            {"category_type": "general", "break_seconds": 1200},
            {"category_type": "major", "break_seconds": 300},
        ])
        self.assertEqual(self.db.execute(text("SELECT COUNT(*) FROM distribution_rules")).scalar(), 2)

    def test_legacy_rules_no_longer_restrict_fallback_and_existing_exam_is_unchanged(self):
        # Simulate an upgraded database with an unused legacy morning-only rule.
        self.db.execute(text("""
            CREATE TABLE distribution_rules (
                id INTEGER PRIMARY KEY, category_type VARCHAR,
                year_level_id INTEGER, allowed_days JSON, allowed_session VARCHAR
            )
        """))
        self.db.execute(text("""
            INSERT INTO distribution_rules VALUES (1, 'general', NULL, '[1,2,3]', 'morning')
        """))
        course = Course(name="BSIT", category="College")
        room = Room(name="B501", building="B", department="College", capacity=40)
        student = User(name="Student", email="student@test.invalid", hashed_password="unused", role="student",
                       student_type="irregular", course=course)
        subject = Subject(name="General Paper", category="general", duration_minutes=75, course=course)
        slot = Timeslot(date=date(2026, 11, 16), start_time=time(10, 30), end_time=time(11, 45))
        self.db.add_all([course, room, student, subject, slot])
        self.db.flush()
        original = Exam(subject_id=subject.id, course_id=course.id, timeslot_id=slot.id, room_id=room.id, status="posted")
        self.db.add(original)
        self.db.flush()
        request = ReschedulingRequest(exam_id=original.id, school_email=student.email, status="pending")
        self.db.add(request)
        self.db.commit()
        before = (original.timeslot_id, original.room_id, original.proctor_id, original.status)

        result = find_earliest_auto_schedule(request, self.db, candidate_rooms=[room])

        self.assertTrue(result["success"])
        self.assertEqual(result["date"], slot.date)
        self.assertEqual(result["start_time"], time(12))
        self.assertEqual(result["end_time"], time(13, 15))
        self.assertEqual(result["room_id"], room.id)
        self.assertFalse(result["is_consultation"])
        self.assertFalse(result["joined_regular_exam"])
        self.db.refresh(original)
        self.assertEqual((original.timeslot_id, original.room_id, original.proctor_id, original.status), before)
        self.assertEqual(self.db.query(Exam).count(), 1)
        self.assertEqual(request.status, "pending")
        self.assertEqual(self.db.execute(text("SELECT allowed_session FROM distribution_rules")).scalar(), "morning")


if __name__ == "__main__":
    unittest.main()
