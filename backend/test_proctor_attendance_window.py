"""Regression checks for proctor attendance time-window enforcement."""

import os
import sys
from datetime import date, datetime, time
from io import BytesIO

from fastapi import HTTPException, UploadFile
from PIL import Image


CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.insert(0, CURRENT_DIR)

TEST_DB_FILE = os.path.join(CURRENT_DIR, "test_proctor_attendance_window_temp.db")
if os.path.exists(TEST_DB_FILE):
    os.remove(TEST_DB_FILE)

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE}"
os.environ["SECRET_KEY"] = "9f8a3c2b1e4d567890abcdef1234567890abcdef1234567890abcdef12345678"

from core import Base, SessionLocal, engine
from model.models import Course, Exam, Proctor, Room, Section, Subject, Teacher, TeacherTeaching, Timeslot, User, YearLevel
from routers import proctors as proctors_router
from routers.exams import get_exams


def run_tests():
    Base.metadata.create_all(engine)
    db = SessionLocal()
    passed = 0
    failed = 0

    def assert_true(condition, test_name):
        nonlocal passed, failed
        if condition:
            print(f"  [PASS] {test_name}")
            passed += 1
        else:
            print(f"  [FAIL] {test_name}")
            failed += 1

    def expect_http_error(expected_status, action, test_name):
        try:
            action()
        except HTTPException as error:
            assert_true(error.status_code == expected_status, test_name)
        else:
            assert_true(False, test_name)

    try:
        subject_teacher = Teacher(name="Subject Instructor")
        section_teacher = Teacher(name="Section Instructor")
        proctor_teacher = Teacher(name="Assigned Proctor")
        course = Course(name="Attendance Test Course")
        year_level = YearLevel(name="Attendance Test Year")
        room = Room(name="Attendance Test Room", capacity=40)
        db.add_all([subject_teacher, section_teacher, proctor_teacher, course, year_level, room])
        db.flush()

        section = Section(
            name="Attendance Test Section",
            course_id=course.id,
            year_level_id=year_level.id,
        )
        subject = Subject(
            code="ATT101",
            name="Attendance Test Subject",
            course_id=course.id,
            year_level_id=year_level.id,
            semester=1,
            teacher_id=subject_teacher.id,
        )
        timeslot = Timeslot(
            date=date(2030, 1, 10),
            start_time=time(9, 0),
            end_time=time(10, 0),
        )
        proctor = Proctor(name="Assigned Proctor", teacher_id=proctor_teacher.id)
        db.add_all([section, subject, timeslot, proctor])
        db.flush()

        db.add(TeacherTeaching(
            teacher_id=section_teacher.id,
            subject_id=subject.id,
            section_id=section.id,
        ))

        proctor_user = User(
            name="Assigned Proctor",
            email="attendance.proctor@school.edu",
            hashed_password="not-used-in-direct-route-test",
            role="proctor",
            teacher_id=proctor_teacher.id,
            proctor_id=proctor.id,
            is_first_login=False,
        )
        exam = Exam(
            subject_id=subject.id,
            section_id=section.id,
            room_id=room.id,
            timeslot_id=timeslot.id,
            course_id=course.id,
            year_level_id=year_level.id,
            semester=1,
            status="posted",
            proctor_id=proctor.id,
            proctor_attendance="pending",
        )
        db.add_all([proctor_user, exam])
        db.commit()
        db.refresh(exam)

        original_clock = proctors_router._get_current_schedule_datetime
        try:
            proctors_router._get_current_schedule_datetime = lambda: datetime(
                2030, 1, 10, 8, 59, 59, tzinfo=proctors_router.SCHEDULE_TIMEZONE
            )
            expect_http_error(
                403,
                lambda: proctors_router.confirm_attendance(proctor.id, exam.id, db, proctor_user),
                "Rejects attendance before the scheduled start time",
            )
            db.refresh(exam)
            assert_true(exam.proctor_attendance == "pending", "Leaves attendance pending before the exam")

            proctors_router._get_current_schedule_datetime = lambda: datetime(
                2030, 1, 10, 9, 30, tzinfo=proctors_router.SCHEDULE_TIMEZONE
            )
            expect_http_error(
                400,
                lambda: proctors_router.confirm_attendance(proctor.id, exam.id, db, proctor_user),
                "Requires a proof photo before attendance can be confirmed",
            )
            image = BytesIO()
            Image.new("RGB", (4, 4), "white").save(image, format="PNG")
            image.seek(0)
            proctors_router.upload_attendance_proof(
                proctor.id, exam.id, photo=UploadFile(filename="room.png", file=image), db=db, current_user=proctor_user,
            )
            result = proctors_router.confirm_attendance(proctor.id, exam.id, db, proctor_user)
            db.refresh(exam)
            assert_true(exam.proctor_attendance == "confirmed", "Confirms attendance during the scheduled exam")
            assert_true("confirmed" in result["message"].lower(), "Returns a successful confirmation message")

            exam.proctor_attendance = "pending"
            db.commit()
            proctors_router._get_current_schedule_datetime = lambda: datetime(
                2030, 1, 10, 10, 0, 1, tzinfo=proctors_router.SCHEDULE_TIMEZONE
            )
            expect_http_error(
                403,
                lambda: proctors_router.confirm_attendance(proctor.id, exam.id, db, proctor_user),
                "Rejects attendance after the scheduled end time",
            )
            db.refresh(exam)
            assert_true(exam.proctor_attendance == "pending", "Leaves attendance pending after the exam")
        finally:
            proctors_router._get_current_schedule_datetime = original_clock

        exams = get_exams(
            status="posted",
            section_name=None,
            course_id=None,
            year_level_id=None,
            semester=None,
            proctor_id=None,
            term=None,
            db=db,
            current_user=proctor_user,
        )
        payload = next(item for item in exams if item["id"] == exam.id)
        assert_true(payload["instructor_name"] == "Section Instructor", "Returns the instructor assigned to this subject and section")
        assert_true(payload["exam_date_iso"] == "2030-01-10", "Returns a machine-readable exam date")
        assert_true(payload["start_time_24h"] == "09:00", "Returns a machine-readable exam start time")
        assert_true(payload["end_time_24h"] == "10:00", "Returns a machine-readable exam end time")

        print(f"\nAttendance window tests: {passed} passed, {failed} failed")
        if failed:
            sys.exit(1)
    finally:
        db.close()
        engine.dispose()
        if os.path.exists(TEST_DB_FILE):
            os.remove(TEST_DB_FILE)


if __name__ == "__main__":
    run_tests()
