"""Attendance proof requirements and privacy against an isolated database."""

from datetime import date, datetime, time
import asyncio
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

_test_directory = tempfile.TemporaryDirectory(prefix="attendance-photo-test-")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_test_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "isolated-attendance-proof-secret-key-123456789"

from fastapi import FastAPI, HTTPException, UploadFile
from PIL import Image
from sqlalchemy import text
from core import Base, SessionLocal, cache, engine, get_db
from model import Course, Exam, Notification, Proctor, ProctorAttendanceProof, Room, Section, Subject, Timeslot, User, YearLevel
from routers import proctors
from routers.exams import get_exams
from routers.auth import get_current_user
from services.attendance_proofs import MAX_ATTENDANCE_PHOTO_BYTES, attendance_proof_metadata, validate_attendance_photo


class AttendanceProofTests(unittest.TestCase):
    def setUp(self):
        with engine.connect() as connection:
            connection.execute(text("PRAGMA foreign_keys=ON"))
        Base.metadata.create_all(engine)
        self.db = SessionLocal()
        cache.invalidate_monitoring()
        self.proctor = Proctor(name="Assigned Proctor")
        self.other_proctor = Proctor(name="Other Proctor")
        self.course = Course(name="BA", category="College")
        self.year = YearLevel(name="1st Year")
        self.room = Room(name="B501", department="College", building="B", capacity=40)
        self.slot = Timeslot(date=date(2030, 1, 10), start_time=time(9), end_time=time(10))
        self.db.add_all([self.proctor, self.other_proctor, self.course, self.year, self.room, self.slot])
        self.db.flush()
        self.owner = User(name="Assigned Proctor", email="owner@test.invalid", hashed_password="unused",
                          role="proctor", proctor_id=self.proctor.id)
        self.other = User(name="Other Proctor", email="other@test.invalid", hashed_password="unused",
                          role="proctor", proctor_id=self.other_proctor.id)
        self.admin = User(name="Admin", email="admin@test.invalid", hashed_password="unused", role="program_head")
        self.student = User(name="Student", email="student@test.invalid", hashed_password="unused", role="student")
        self.section = Section(name="BA 1-101", course_id=self.course.id, year_level_id=self.year.id)
        self.subject = Subject(name="Accounting", code="BA101", course_id=self.course.id,
                               year_level_id=self.year.id, semester=1, duration_minutes=120)
        self.db.add_all([self.owner, self.other, self.admin, self.student, self.section, self.subject])
        self.db.flush()
        self.exam = Exam(subject_id=self.subject.id, section_id=self.section.id, course_id=self.course.id,
                         year_level_id=self.year.id, room_id=self.room.id, timeslot_id=self.slot.id,
                         proctor_id=self.proctor.id, semester=1, term="Midterm", status="posted", proctor_attendance="pending")
        self.db.add(self.exam)
        self.db.commit()
        clock = patch.object(proctors, "_get_current_schedule_datetime", return_value=datetime(2030, 1, 10, 9, 30, tzinfo=proctors.SCHEDULE_TIMEZONE))
        clock.start()
        self.addCleanup(clock.stop)

    def tearDown(self):
        self.db.close()
        cache.invalidate_monitoring()
        Base.metadata.drop_all(engine)

    @classmethod
    def tearDownClass(cls):
        engine.dispose()
        _test_directory.cleanup()

    def image(self, image_format="PNG"):
        output = io.BytesIO()
        Image.new("RGB", (12, 12), "blue").save(output, format=image_format)
        return output.getvalue()

    def upload(self, content=None, user=None):
        file = UploadFile(filename="room.png", file=io.BytesIO(content if content is not None else self.image()))
        return proctors.upload_attendance_proof(self.proctor.id, self.exam.id, photo=file, db=self.db, current_user=user or self.owner)

    def view(self, user):
        return proctors.view_attendance_proof(self.proctor.id, self.exam.id, db=self.db, current_user=user)

    def confirm(self, user=None):
        return proctors.confirm_attendance(self.proctor.id, self.exam.id, db=self.db, current_user=user or self.owner)

    def test_photo_is_required_even_if_the_client_bypasses_the_button(self):
        for user in (self.owner, self.admin):
            with self.subTest(role=user.role), self.assertRaises(HTTPException) as rejected:
                self.confirm(user)
            self.assertEqual(rejected.exception.status_code, 400)
            self.assertIn("Upload a proof photo", rejected.exception.detail)
        self.db.refresh(self.exam)
        self.assertEqual(self.exam.proctor_attendance, "pending")
        self.assertEqual(self.db.query(Notification).count(), 0)

    def test_upload_persists_photo_without_changing_the_exam_assignment(self):
        before = tuple(self.db.query(*Exam.__table__.columns).one())
        content = self.image()
        result = self.upload(content)
        self.assertTrue(result["attendance_proof"]["matches_assignment"])
        self.assertEqual(tuple(self.db.query(*Exam.__table__.columns).one()), before)
        self.db.expire_all()
        photo = self.db.query(ProctorAttendanceProof).one()
        self.assertEqual(photo.photo_data, content)
        self.assertEqual(photo.uploaded_by_id, self.owner.id)
        self.assertEqual(photo.content_type, "image/png")

    def test_uploaded_photo_unlocks_attendance_and_admin_can_view_it(self):
        content = self.image()
        self.upload(content)
        self.confirm()
        self.db.refresh(self.exam)
        self.assertEqual(self.exam.proctor_attendance, "confirmed")
        response = self.view(self.admin)
        self.assertEqual(response.body, content)
        self.assertEqual(response.media_type, "image/png")
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.assertIn("Proof photo", self.db.query(Notification).one().message)

    def test_students_other_proctors_and_admins_cannot_upload_for_the_owner(self):
        for user in (self.student, self.other, self.admin):
            with self.subTest(role=user.role), self.assertRaises(HTTPException) as denied:
                self.upload(user=user)
            self.assertEqual(denied.exception.status_code, 403)
        self.assertEqual(self.db.query(ProctorAttendanceProof).count(), 0)

    def test_photo_is_private_to_admins_and_the_assigned_proctor(self):
        self.upload()
        self.assertEqual(self.view(self.owner).status_code, 200)
        self.assertEqual(self.view(self.admin).status_code, 200)
        for user in (self.student, self.other):
            with self.subTest(role=user.role), self.assertRaises(HTTPException) as denied:
                self.view(user)
            self.assertEqual(denied.exception.status_code, 403)

    def test_invalid_empty_spoofed_and_oversized_files_are_rejected(self):
        for content in (b"", b"not a photograph", b"\x89PNG\r\n\x1a\nnot a real PNG", b"<svg xmlns='http://www.w3.org/2000/svg'/>"):
            with self.subTest(content=content[:10]), self.assertRaises(HTTPException) as rejected:
                self.upload(content)
            self.assertEqual(rejected.exception.status_code, 400)
        with self.assertRaises(HTTPException) as too_large:
            self.upload(b"x" * (MAX_ATTENDANCE_PHOTO_BYTES + 1))
        self.assertEqual(too_large.exception.status_code, 413)
        self.assertEqual(self.db.query(ProctorAttendanceProof).count(), 0)

    def test_real_jpeg_png_and_webp_files_are_accepted(self):
        for image_format, content_type in (("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")):
            self.assertEqual(validate_attendance_photo(self.image(image_format)), content_type)

    def test_confirmed_proof_cannot_be_replaced(self):
        original = self.image()
        self.upload(original)
        self.confirm()
        with self.assertRaises(HTTPException) as rejected:
            self.upload(self.image("JPEG"))
        self.assertEqual(rejected.exception.status_code, 400)
        self.assertEqual(self.view(self.admin).body, original)

    def test_replacement_before_confirmation_keeps_one_current_photo(self):
        self.upload()
        replacement = self.image("JPEG")
        self.upload(replacement)
        self.assertEqual(self.db.query(ProctorAttendanceProof).count(), 1)
        self.assertEqual(self.view(self.admin).body, replacement)

    def test_room_or_timeslot_change_requires_new_proof(self):
        self.upload()
        self.slot.start_time = time(9, 15)
        self.db.commit()
        metadata = attendance_proof_metadata(self.db, [self.exam])
        self.assertFalse(metadata[self.exam.id]["matches_assignment"])
        with self.assertRaises(HTTPException) as rejected:
            self.confirm()
        self.assertEqual(rejected.exception.status_code, 400)
        self.upload()
        self.confirm()
        self.assertEqual(self.exam.proctor_attendance, "confirmed")

    def test_a_photo_does_not_bypass_the_existing_attendance_time_window(self):
        self.upload()
        for hour in (8, 11):
            with patch.object(proctors, "_get_current_schedule_datetime", return_value=datetime(2030, 1, 10, hour, tzinfo=proctors.SCHEDULE_TIMEZONE)):
                with self.assertRaises(HTTPException) as rejected:
                    self.confirm()
                self.assertEqual(rejected.exception.status_code, 403)
        self.assertEqual(self.exam.proctor_attendance, "pending")

    def test_dashboard_payloads_include_metadata_without_image_bytes(self):
        proof = self.upload()["attendance_proof"]
        rows = get_exams(status="posted", section_name=None, course_id=None, year_level_id=None,
                         semester=None, proctor_id=None, term=None, db=self.db, current_user=self.owner)
        self.assertEqual(rows[0]["attendance_proof"], proof)
        groups = proctors.get_proctor_monitoring(db=self.db, current_user=self.admin)
        self.assertEqual(groups[0]["exams"][0]["term"], self.exam.term)
        self.assertEqual(groups[0]["exams"][0]["attendance_proof"], proof)
        self.assertNotIn("photo_data", proof)

    def test_exam_deletion_cascades_to_its_photo_without_blocking_existing_deletion(self):
        self.upload()
        self.db.delete(self.exam)
        self.db.commit()
        self.assertEqual(self.db.query(ProctorAttendanceProof).count(), 0)

    def test_http_upload_confirm_and_private_admin_photo_view(self):
        app = FastAPI()
        app.include_router(proctors.router)
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: self.owner

        async def request(method, path, body=b"", headers=None):
            messages = []
            complete = asyncio.Event()
            body_sent = False

            async def receive():
                nonlocal body_sent
                if not body_sent:
                    body_sent = True
                    return {"type": "http.request", "body": body, "more_body": False}
                await complete.wait()
                return {"type": "http.disconnect"}

            async def send(message):
                messages.append(message)
                if message["type"] == "http.response.body" and not message.get("more_body", False):
                    complete.set()

            scope = {"type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1", "method": method,
                     "scheme": "http", "path": path, "raw_path": path.encode(), "query_string": b"",
                     "headers": headers or [], "client": ("127.0.0.1", 1234), "server": ("testserver", 80)}
            await asyncio.wait_for(app(scope, receive, send), timeout=3)
            status = next(message["status"] for message in messages if message["type"] == "http.response.start")
            content = b"".join(message.get("body", b"") for message in messages if message["type"] == "http.response.body")
            return status, content

        content = self.image()
        boundary = b"attendance-proof-test-boundary"
        body = b"--" + boundary + b'\r\nContent-Disposition: form-data; name="photo"; filename="room.png"\r\nContent-Type: image/png\r\n\r\n' + content + b"\r\n--" + boundary + b"--\r\n"
        path = f"/proctors/{self.proctor.id}/attendance-proof/{self.exam.id}"
        status, result = asyncio.run(request("POST", path, body, [(b"content-type", b"multipart/form-data; boundary=" + boundary)]))
        self.assertEqual(status, 200, result)
        self.assertTrue(json.loads(result)["attendance_proof"]["matches_assignment"])
        status, result = asyncio.run(request("POST", f"/proctors/{self.proctor.id}/confirm-attendance/{self.exam.id}"))
        self.assertEqual(status, 200, result)
        app.dependency_overrides[get_current_user] = lambda: self.admin
        status, result = asyncio.run(request("GET", path))
        self.assertEqual((status, result), (200, content))
        del app.dependency_overrides[get_current_user]
        status, _ = asyncio.run(request("GET", path))
        self.assertEqual(status, 401)


if __name__ == "__main__":
    unittest.main()
