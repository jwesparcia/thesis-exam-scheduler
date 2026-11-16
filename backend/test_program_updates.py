"""Program renames and separate department logins against isolated SQLite data."""

from contextlib import redirect_stdout
from datetime import date, time
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

_test_directory = tempfile.TemporaryDirectory(prefix="program-label-update-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_test_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-program-update-secret-key-123456789"

import pandas as pd
from fastapi import HTTPException, UploadFile
from core import Base, SessionLocal, cache, engine
from model import ActivityLog, Course, Department, Exam, Notification, ReschedulingRequest, Room, Section, Subject, Timeslot, User, YearLevel
from routers import catalog, rescheduling
from services.program_updates import ensure_separate_bm_thm_admins, rename_programs
from update_programs_and_admins import schedule_snapshot
from utils import scheduler
from utils.program_names import normalize_program_name, normalize_program_section


class ProgramUpdateTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        self.db = SessionLocal()
        self.db.add_all([Department(code=code, name=code) for code in ("BM", "THM", "AS", "GE", "ICT", "CRIM", "SHS")])
        self.db.flush()
        self.ba = Course(name="BSA", category="College", department_code="BM")
        self.psych = Course(name="BSPsych", category="College", department_code="AS")
        self.year = YearLevel(name="1st Year")
        self.bm = User(name="BM & THM Department Administrator", email="bm.admin@school.edu",
                       hashed_password="preserved-bm-password-hash", role="program_head", department_code="BM")
        self.db.add_all([self.ba, self.psych, self.year, self.bm])
        self.db.flush()
        self.section = Section(name="BSA 1-101", course_id=self.ba.id, year_level_id=self.year.id, semester=1)
        self.psych_section = Section(name="BSPsych 1-101", course_id=self.psych.id, year_level_id=self.year.id, semester=1)
        self.student = User(name="Accountancy Student", email="ba@test.invalid", hashed_password="unused",
                            role="student", course_id=self.ba.id, section_name="BSA 1-101", student_type="regular")
        self.subject = Subject(name="Financial Accounting", code="BSA101", course_id=self.ba.id,
                               year_level_id=self.year.id, semester=1, category="major", duration_minutes=120, term="Midterm")
        self.room = Room(name="B501", building="B", capacity=40, department="College")
        self.slot = Timeslot(date=date(2026, 11, 16), start_time=time(8), end_time=time(10))
        self.db.add_all([self.section, self.psych_section, self.student, self.subject, self.room, self.slot])
        self.db.flush()
        self.exam = Exam(subject_id=self.subject.id, section_id=self.section.id, course_id=self.ba.id,
                         year_level_id=self.year.id, semester=1, term="Midterm", status="saved",
                         room_id=self.room.id, timeslot_id=self.slot.id)
        self.db.add(self.exam)
        self.db.flush()
        self.request = ReschedulingRequest(exam_id=self.exam.id, section_name="BSA 1-101", program="BSA",
                                           course_code="BSA101", department_code="BM", status="pending")
        self.db.add(self.request)
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(engine)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        _test_directory.cleanup()

    def test_rename_preserves_ids_enrollment_and_every_schedule_value(self):
        before = schedule_snapshot(self.db)
        ids = (self.ba.id, self.psych.id, self.section.id, self.student.course_id, self.exam.id)
        counts = rename_programs(self.db)
        self.db.commit()
        self.db.expire_all()
        self.assertEqual(self.ba.name, "BA")
        self.assertEqual(self.psych.name, "BAPSYCH")
        self.assertEqual(self.section.name, "BA 1-101")
        self.assertEqual(self.psych_section.name, "BAPSYCH 1-101")
        self.assertEqual(self.student.section_name, self.section.name)
        self.assertEqual(self.request.program, "BA")
        self.assertEqual(self.request.section_name, "BA 1-101")
        self.assertEqual(self.request.course_code, "BSA101")
        self.assertEqual((self.ba.id, self.psych.id, self.section.id, self.student.course_id, self.exam.id), ids)
        self.assertEqual(schedule_snapshot(self.db), before)
        self.assertEqual(counts["courses"], 2)
        self.assertFalse(any(rename_programs(self.db).values()))

    def test_duplicate_program_name_rolls_back_instead_of_merging_schedules(self):
        self.db.add(Course(name="BA", category="College", department_code="BM"))
        self.db.commit()
        before = schedule_snapshot(self.db)
        with self.assertRaisesRegex(ValueError, "already exists"):
            rename_programs(self.db)
        self.db.rollback()
        self.assertEqual(self.ba.name, "BSA")
        self.assertEqual(schedule_snapshot(self.db), before)

    def test_create_thm_admin_preserves_bm_credentials_and_restricts_access(self):
        created = ensure_separate_bm_thm_admins(self.db, lambda password: f"hashed:{password}")
        self.db.commit()
        thm = self.db.query(User).filter_by(email="thm.admin@school.edu").one()
        self.assertEqual(created, ["thm.admin@school.edu"])
        self.assertEqual(self.bm.hashed_password, "preserved-bm-password-hash")
        self.assertEqual(thm.hashed_password, "hashed:admin123")
        self.assertEqual(self.bm.department_codes, ["BM"])
        self.assertEqual(thm.department_codes, ["THM"])
        self.assertEqual(rescheduling.find_department_admin(self.db, "BM").id, self.bm.id)
        self.assertEqual(rescheduling.find_department_admin(self.db, "THM").id, thm.id)
        for code, admin, other in (("BM", self.bm, thm), ("THM", thm, self.bm)):
            request = ReschedulingRequest(department_code=code)
            rescheduling.check_request_department_access(request, admin, self.db)
            with self.assertRaises(HTTPException) as denied:
                rescheduling.check_request_department_access(request, other, self.db)
            self.assertEqual(denied.exception.status_code, 403)

    def test_startup_preserves_both_admins_credentials_and_history(self):
        import main

        thm = User(name="Existing THM", email="thm.admin@school.edu", hashed_password="preserved-thm-password-hash",
                   role="program_head", department_code="THM")
        self.db.add(thm)
        self.db.flush()
        notification = Notification(user_id=thm.id, message="Existing THM history")
        activity = ActivityLog(user_id=self.bm.id, action="EXISTING_HISTORY")
        self.db.add_all([notification, activity])
        self.db.commit()
        ids = self.bm.id, thm.id
        before = schedule_snapshot(self.db)
        with patch.object(cache, "connect", return_value=False), redirect_stdout(io.StringIO()):
            main.on_startup()
            main.on_startup()
        self.db.expire_all()
        self.assertEqual((self.bm.id, thm.id), ids)
        self.assertEqual(self.bm.hashed_password, "preserved-bm-password-hash")
        self.assertEqual(thm.hashed_password, "preserved-thm-password-hash")
        self.assertEqual(notification.user_id, thm.id)
        self.assertEqual(activity.user_id, self.bm.id)
        self.assertEqual(self.bm.department_codes, ["BM"])
        self.assertEqual(thm.department_codes, ["THM"])
        self.assertEqual(schedule_snapshot(self.db), before)

    def test_old_labels_are_accepted_without_recreating_old_programs_or_sections(self):
        rename_programs(self.db)
        self.db.commit()
        data = io.BytesIO()
        pd.DataFrame([{"COURSE": "BSA", "SECTION": "BSA 1-101", "NAME": "Imported Student",
                       "SCHOOL EMAIL": "imported@test.invalid", "STATUS": "regular"}]).to_excel(data, index=False)
        data.seek(0)
        catalog.upload_students_excel(file=UploadFile(filename="students.xlsx", file=data), clear_existing=False,
                                      db=self.db, current_user=self.bm)
        student = self.db.query(User).filter_by(email="imported@test.invalid").one()
        self.assertEqual(student.course_id, self.ba.id)
        self.assertEqual(student.section_name, "BA 1-101")
        self.assertEqual(self.db.query(Course).count(), 2)
        self.assertEqual(self.db.query(Section).count(), 2)

    def test_old_curriculum_labels_resolve_to_the_renamed_program(self):
        rename_programs(self.db)
        self.db.commit()
        data = io.BytesIO()
        pd.DataFrame([{"Course": "BSPsych", "Section": "BSPsych 1-101", "Category": "College",
                       "Year Level": "1st Year", "Semester": 1, "Subject Code": "PS101",
                       "Subject Name": "General Psychology", "Subject Category": "major", "Exam Type": "written"}]).to_excel(data, index=False)
        data.seek(0)
        catalog.upload_catalog_excel(file=UploadFile(filename="curriculum.xlsx", file=data), clear_existing=False,
                                     db=self.db, current_user=self.bm)
        self.assertEqual(self.db.query(Subject).filter_by(code="PS101").one().course_id, self.psych.id)
        self.assertEqual(self.db.query(Course).count(), 2)
        self.assertEqual(self.db.query(Section).count(), 2)

    def test_accountancy_scheduler_fallback_still_uses_two_hours_after_rename(self):
        self.db.delete(self.request)
        self.db.delete(self.exam)
        self.subject.duration_minutes = 0
        rename_programs(self.db)
        self.db.commit()
        with patch.object(scheduler, "POP_SIZE", 6), patch.object(scheduler, "GENERATIONS", 4), redirect_stdout(io.StringIO()):
            scheduler.generate_exam_schedule(self.db, start_date=date(2026, 11, 16), end_date=date(2026, 11, 19),
                                             department="College", semester=1, term="Midterm",
                                             daily_start_time=time(8), daily_end_time=time(17))
        exam = self.db.query(Exam).filter_by(subject_id=self.subject.id).one()
        start, end = exam.timeslot.start_time, exam.timeslot.end_time
        self.assertEqual((end.hour * 60 + end.minute) - (start.hour * 60 + start.minute), 120)

    def test_aliases_only_change_the_requested_program_prefixes(self):
        self.assertEqual(normalize_program_name("bspsych"), "BAPSYCH")
        self.assertEqual(normalize_program_section("BSPsych-1A"), "BAPSYCH-1A")
        self.assertEqual(normalize_program_section("BSA 4-101"), "BA 4-101")
        self.assertEqual(normalize_program_section("BSARCH 4-101"), "BSARCH 4-101")
        self.assertEqual(normalize_program_section("BACOMM 4-101"), "BACOMM 4-101")


if __name__ == "__main__":
    unittest.main()
