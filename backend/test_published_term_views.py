"""Posted term metadata and visibility for student and proctor dashboards."""

from datetime import date, time
import hashlib
import os
from pathlib import Path
import tempfile
import unittest

_temporary_directory = tempfile.TemporaryDirectory(prefix="published-term-views-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_temporary_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-published-term-views-test-secret-key-123456789"

from core import Base, SessionLocal, cache, engine
from model import Course, YearLevel, Section, Subject, User, Proctor, Exam, Timeslot, IrregularSelection, ReschedulingRequest
from routers.exams import get_exams
from routers.exams import download_exam_schedule
from routers.student import get_student_exams, get_custom_exams, get_student_requests


class PublishedTermViewTests(unittest.TestCase):
    def setUp(self):
        Base.metadata.create_all(engine)
        cache.invalidate_exam_schedules()
        self.db = SessionLocal()
        self.college = Course(name="BSIT", category="College")
        self.shs = Course(name="STEM", category="SHS")
        self.year = YearLevel(name="1st Year")
        self.proctor = Proctor(name="Assigned Proctor")
        self.other_proctor = Proctor(name="Another Proctor")
        self.slot = Timeslot(date=date(2026, 11, 16), start_time=time(8), end_time=time(9, 15))
        self.db.add_all([self.college, self.shs, self.year, self.proctor, self.other_proctor, self.slot])
        self.db.flush()
        self.section = Section(name="BSIT 1-101", course_id=self.college.id, year_level_id=self.year.id, semester=1)
        self.shs_section = Section(name="STEM-11A", course_id=self.shs.id, year_level_id=self.year.id)
        self.subject = Subject(code="IT101", name="Written Paper", course_id=self.college.id,
                               year_level_id=self.year.id, semester=1, term="All", exam_type="written")
        self.db.add_all([self.section, self.shs_section, self.subject])
        self.db.flush()
        self.regular = User(name="Regular", email="regular@test.invalid", hashed_password="unused",
                            role="student", student_type="regular", section_name=self.section.name)
        self.irregular = User(name="Irregular", email="irregular@test.invalid", hashed_password="unused",
                              role="student", student_type="irregular")
        self.faculty = User(name="Faculty", email="faculty@test.invalid", hashed_password="unused",
                            role="proctor", proctor_id=self.proctor.id)
        self.db.add_all([self.regular, self.irregular, self.faculty])
        self.db.flush()
        self.db.add(IrregularSelection(user_id=self.irregular.id, subject_id=self.subject.id, section_id=self.section.id))
        self.prelim = self.exam("Prelim")
        self.exam("Midterm")
        self.exam("Midterm", semester=2)
        self.exam("ST1", course=self.shs, section=self.shs_section)
        self.exam("ST1", semester=2, course=self.shs, section=self.shs_section)
        self.exam("ST2", course=self.shs, section=self.shs_section)
        self.exam("Final", status="draft")
        self.exam("Pre-Final", status="saved")
        self.exam("Final", proctor=self.other_proctor, course=self.shs, section=self.shs_section)
        self.db.commit()

    def exam(self, term, semester=1, status="posted", course=None, section=None, proctor=None):
        row = Exam(subject_id=self.subject.id, section_id=(section or self.section).id,
                   course_id=(course or self.college).id, year_level_id=self.year.id,
                   timeslot_id=self.slot.id, proctor_id=(proctor or self.proctor).id,
                   semester=semester, term=term, status=status)
        self.db.add(row)
        return row

    def tearDown(self):
        self.db.close()
        cache.invalidate_exam_schedules()
        Base.metadata.drop_all(engine)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()

    def scopes(self, rows):
        self.assertTrue(all(row["status"] == "posted" for row in rows))
        return {(row["department"], row["semester"], row["term"]) for row in rows}

    def proctor_exams(self, term=None, semester=None):
        return get_exams(status="posted", section_name=None, course_id=None, year_level_id=None,
                         semester=semester, proctor_id=None, term=term, db=self.db, current_user=self.faculty)

    def test_regular_and_irregular_students_receive_separate_posted_term_metadata(self):
        expected = {("College", 1, "Prelim"), ("College", 1, "Midterm"), ("College", 2, "Midterm")}
        # A running cache may still contain responses from before term selection.
        section_slug = hashlib.md5(self.section.name.encode()).hexdigest()[:12]
        cache.set(f"exam_schedule:section:{section_slug}", [{"id": self.prelim.id}], 300)
        cache.set(f"exam_schedule:irregular:{self.irregular.id}", [{"id": self.prelim.id}], 300)
        regular = get_student_exams(current_user=self.regular, db=self.db)
        irregular = get_custom_exams(current_user=self.irregular, db=self.db)
        self.assertEqual(self.scopes(regular), expected)
        self.assertEqual(self.scopes(irregular), expected)

    def test_proctor_sees_only_assigned_posted_terms_including_shs_semesters(self):
        expected = {("College", 1, "Prelim"), ("College", 1, "Midterm"), ("College", 2, "Midterm"),
                    ("SHS", 1, "ST1"), ("SHS", 2, "ST1"), ("SHS", 1, "ST2")}
        self.assertEqual(self.scopes(self.proctor_exams()), expected)
        self.assertEqual(self.scopes(self.proctor_exams(term="ST1", semester=2)), {("SHS", 2, "ST1")})

    def test_student_requests_identify_their_original_term(self):
        self.db.add(ReschedulingRequest(exam_id=self.prelim.id, school_email=self.irregular.email,
                                       section_name=self.section.name, status="pending"))
        self.db.commit()
        for student in (self.regular, self.irregular):
            requests = get_student_requests(current_user=student, db=self.db)
            self.assertEqual(len(requests), 1)
            self.assertEqual((requests[0]["department"], requests[0]["semester"], requests[0]["term"]),
                             ("College", 1, "Prelim"))

    def test_batch_number_is_available_to_students_and_proctors(self):
        self.prelim.batch_number = 3
        self.db.commit()
        regular = get_student_exams(current_user=self.regular, db=self.db)
        irregular = get_custom_exams(current_user=self.irregular, db=self.db)
        for rows in (regular, irregular, self.proctor_exams()):
            self.assertEqual(next(row["batch_number"] for row in rows if row["id"] == self.prelim.id), 3)

    def test_master_export_includes_program_course_and_overflow_batch_labels(self):
        import asyncio
        import io
        import openpyxl
        self.prelim.batch_number = 3
        self.db.commit()
        response = download_exam_schedule(status="posted", course_id=None, year_level_id=None,
                                         semester=1, department="College", term="Prelim",
                                         db=self.db, current_user=self.faculty)
        async def read_body():
            return b"".join([chunk async for chunk in response.body_iterator])
        workbook = openpyxl.load_workbook(io.BytesIO(asyncio.run(read_body())))
        rows = list(workbook.active.values)
        self.assertEqual(rows[2][rows[1].index("Program")], "BSIT")
        self.assertEqual(rows[2][rows[1].index("Course Code")], "IT101")
        self.assertEqual(rows[2][rows[1].index("Course Name")], "Written Paper")
        batch_column = rows[1].index("Batch")
        self.assertEqual(rows[2][batch_column], "Batch 3")


if __name__ == "__main__":
    unittest.main()
