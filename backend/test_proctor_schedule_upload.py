"""Teaching schedule uploads retain each weekday and its teaching hours."""

import asyncio
from datetime import date, time
import io
import os
import unittest
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "isolated-proctor-schedule-upload-test-secret-123456789"

import pandas as pd
from fastapi import HTTPException, UploadFile
from openpyxl import Workbook
from openpyxl.styles import PatternFill
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core import Base
from model import Notification, Proctor, Teacher, TeacherSchedule, User
from routers.proctors import upload_my_schedule
from utils.scheduler import validate_proctor_availability


class ProctorScheduleUploadTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        teacher = Teacher(name="Example Teacher")
        self.db.add(teacher)
        self.db.flush()
        self.proctor = Proctor(name=teacher.name, teacher_id=teacher.id, department="ICT")
        self.db.add(self.proctor)
        self.db.flush()
        self.owner = User(name=teacher.name, email="proctor@example.edu", hashed_password="unused",
                          role="proctor", proctor_id=self.proctor.id, teacher_id=teacher.id)
        self.head = User(name="Program Head", email="head@example.edu", hashed_password="unused", role="program_head")
        self.db.add_all([self.owner, self.head])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def upload(self, rows, user=None):
        data = io.BytesIO()
        pd.DataFrame(rows).to_excel(data, index=False)
        data.seek(0)
        return self.upload_file(data, user)

    def upload_file(self, data, user=None):
        with patch("routers.proctors.translate_grid_schedule_from_bytes", return_value=""), \
             patch("routers.proctors.translate_row_schedule", return_value=""):
            return asyncio.run(upload_my_schedule(
                self.proctor.id, UploadFile(filename="schedule.xlsx", file=data), self.db, user or self.owner,
            ))

    def schedules(self):
        return self.db.query(TeacherSchedule).filter_by(teacher_id=self.proctor.teacher_id).all()

    def test_program_head_upload_replaces_only_the_selected_proctors_schedule(self):
        self.upload({"Day/Time": ["08:00 - 09:00"], "Monday": ["Old schedule"]})
        other_teacher = Teacher(name="Other Teacher")
        self.db.add(other_teacher)
        self.db.flush()
        other_slot = TeacherSchedule(teacher_id=other_teacher.id, day_of_week=0, start_time=time(8), end_time=time(9))
        self.db.add(other_slot)
        self.db.commit()

        result = self.upload({"Day/Time": ["08:00 - 09:00"], "Tuesday": ["New schedule"]}, self.head)

        self.assertIn("1 entries", result["message"])
        row, = self.schedules()
        self.assertEqual((row.day_of_week, row.subject_name), (1, "NEW SCHEDULE"))
        self.assertEqual(self.db.query(TeacherSchedule).filter_by(teacher_id=other_teacher.id).one().id, other_slot.id)
        self.assertEqual(self.db.query(Notification).filter_by(user_id=self.owner.id).one().related_id, self.proctor.id)

    def test_program_head_upload_preserves_existing_schedule_if_workbook_is_empty_or_ambiguous(self):
        self.upload({"Day/Time": ["08:00 - 09:00"], "Monday": ["Original schedule"]})
        with self.assertRaises(HTTPException) as empty:
            self.upload({"Day/Time": ["08:00 - 09:00"], "Tuesday": [None]}, self.head)
        self.assertEqual(empty.exception.status_code, 400)

        data = io.BytesIO()
        with pd.ExcelWriter(data, engine="openpyxl") as writer:
            rows = pd.DataFrame({"Day/Time": ["08:00 - 09:00"], "Tuesday": ["Different schedule"]})
            rows.to_excel(writer, sheet_name="Other Faculty", index=False)
            rows.to_excel(writer, sheet_name="Another Faculty", index=False)
        data.seek(0)
        with self.assertRaises(HTTPException) as ambiguous:
            self.upload_file(data, self.head)
        self.assertEqual(ambiguous.exception.status_code, 400)
        row, = self.schedules()
        self.assertEqual((row.day_of_week, row.subject_name), (0, "ORIGINAL SCHEDULE"))

    def test_proctor_cannot_upload_for_a_different_proctor(self):
        with self.assertRaises(HTTPException) as denied:
            self.upload_file(io.BytesIO(), User(role="proctor", proctor_id=self.proctor.id + 1))
        self.assertEqual(denied.exception.status_code, 403)
        self.assertEqual(self.schedules(), [])

    def test_grid_reads_abbreviated_and_mixed_case_days_and_lecture_laboratory_classes(self):
        result = self.upload({
            "Day/Time": ["7:00 AM - 2:00 PM", "2:00 PM - 3:00 PM"],
            "Mon": ["Math LEC", "LUNCH"],
            "tUeSday": ["Science LAB", "BREAK"],
            "WED": ["Elective", "MEETING"],
            " Thurs ": ["Biology LEC", None],
        })
        rows = self.schedules()
        self.assertIn("4 entries", result["message"])
        self.assertEqual({s.day_of_week for s in rows}, {0, 1, 2, 3})
        self.assertTrue(all(s.start_time == time(7) and s.end_time == time(14) for s in rows))
        # December 15, 2026 is Tuesday; the whole exam must fit Tuesday's window.
        self.assertTrue(validate_proctor_availability(self.db, self.proctor.id, date(2026, 12, 15), time(12), time(14))[0])
        self.assertFalse(validate_proctor_availability(self.db, self.proctor.id, date(2026, 12, 15), time(13), time(14, 30))[0])
        self.assertFalse(validate_proctor_availability(self.db, self.proctor.id, date(2026, 12, 18), time(8), time(9))[0])

    def test_colored_grid_includes_blank_class_rows_and_excludes_colored_breaks(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["Day/Time", "TUESDAY"])
        sheet.append(["07:00 - 07:30", "Math"])
        sheet.append(["07:30 - 08:00", "LEC"])
        sheet.append(["08:00 - 08:30", None])
        sheet.append(["08:30 - 09:00", "AM"])
        sheet.append(["09:00 - 09:30", "BREAK"])
        for row in range(2, 5):
            sheet.cell(row, 2).fill = PatternFill(fill_type="solid", fgColor="FFFF00")
        for row in range(5, 7):
            sheet.cell(row, 2).fill = PatternFill(fill_type="solid", fgColor="FFC000")
        data = io.BytesIO()
        workbook.save(data)
        data.seek(0)
        result = self.upload_file(data)
        self.assertIn("3 entries", result["message"])
        self.assertEqual({(s.start_time, s.end_time) for s in self.schedules()}, {
            (time(7), time(7, 30)), (time(7, 30), time(8)), (time(8), time(8, 30)),
        })
        names = {s.start_time: s.subject_name for s in self.schedules()}
        self.assertEqual(names[time(7)], "MATH")
        self.assertIsNone(names[time(7, 30)])
        self.assertIsNone(names[time(8)])

    def test_workday_admin_extends_teaching_window_but_not_an_admin_only_day(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.append(["Day/Time", "MONDAY", "TUESDAY"])
        sheet.append(["07:00 - 07:30", None, None])
        sheet.append(["09:30 - 10:00", None, None])
        sheet.append(["10:00 - 10:30", "ADMIN", "ADMIN"])
        sheet.append(["10:30 - 11:00", None, None])
        sheet.append(["11:00 - 11:30", "Class", None])
        sheet.append(["04:00 - 04:30", "Class", None])
        sheet.append(["07:00 - 07:30", "Class", None])
        sheet.append(["08:00 - 08:30", "Class", None])
        sheet.cell(3, 2).fill = PatternFill(fill_type="solid", fgColor="FFC000")
        for column in (2, 3):
            for row in (4, 5):
                sheet.cell(row, column).fill = PatternFill(fill_type="solid", fgColor="00B0F0")
        for row in (6, 7, 8, 9):
            sheet.cell(row, 2).fill = PatternFill(fill_type="solid", fgColor="FFFF00")
        data = io.BytesIO()
        workbook.save(data)
        data.seek(0)
        self.upload_file(data)

        rows = self.schedules()
        monday = [row for row in rows if row.day_of_week == 0]
        self.assertEqual(min(row.start_time for row in monday), time(10))
        self.assertEqual(max(row.end_time for row in monday), time(20, 30))
        self.assertIsNone(next(row.subject_name for row in monday if row.start_time == time(10)))
        self.assertFalse(any(row.day_of_week == 1 for row in rows))
        check = validate_proctor_availability
        self.assertFalse(check(self.db, self.proctor.id, date(2026, 12, 14), time(8), time(9, 15))[0])
        self.assertTrue(check(self.db, self.proctor.id, date(2026, 12, 14), time(10), time(11, 15))[0])
        self.assertTrue(check(self.db, self.proctor.id, date(2026, 12, 14), time(19, 15), time(20, 30))[0])
        self.assertFalse(check(self.db, self.proctor.id, date(2026, 12, 14), time(19, 30), time(20, 45))[0])
        self.assertFalse(check(self.db, self.proctor.id, date(2026, 12, 15), time(10), time(11, 15))[0])

    def test_sequential_grid_distinguishes_seven_am_from_seven_pm(self):
        result = self.upload({
            "Day/Time": ["07:00 - 07:30", "05:30 - 06:00", "06:00 - 06:30", "06:30 - 07:00", "07:00 - 07:30"],
            "Tuesday": ["Morning class", "Evening class", "LEC", "LAB", "Evening class"],
        })
        self.assertIn("5 entries", result["message"])
        self.assertEqual({(s.start_time, s.end_time) for s in self.schedules()}, {
            (time(7), time(7, 30)), (time(17, 30), time(18)),
            (time(18), time(18, 30)), (time(18, 30), time(19)), (time(19), time(19, 30)),
        })

    def test_sparse_grid_starting_at_one_uses_afternoon_hours(self):
        self.upload({"Day/Time": ["01:00 - 02:00"], "Tuesday": ["Math"]})
        row, = self.schedules()
        self.assertEqual((row.start_time, row.end_time), (time(13), time(14)))

    def test_rows_read_abbreviated_days_and_keep_day_specific_hours(self):
        result = self.upload({
            "Day": ["Monday", "tue", "WED", " thurs "],
            "Start Time": ["8:00 AM", "7:00 AM", "9:00 AM", "10:00 AM"],
            "End Time": ["5:00 PM", "2:00 PM", "4:00 PM", "3:00 PM"],
            "Subject": ["A", "B", "C", "D"],
        })
        self.assertIn("4 schedule entries", result["message"])
        self.assertEqual({s.day_of_week: (s.start_time, s.end_time) for s in self.schedules()}, {
            0: (time(8), time(17)), 1: (time(7), time(14)),
            2: (time(9), time(16)), 3: (time(10), time(15)),
        })


if __name__ == "__main__":
    unittest.main()
