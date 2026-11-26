"""On-demand replacement of a proctor on a posted exam."""

from datetime import date, datetime, time
import os
import unittest
from unittest.mock import patch

os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["SECRET_KEY"] = "isolated-emergency-proctor-test-secret-123456789"

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from core import Base
from model import ActivityLog, Course, Exam, Notification, Proctor, ProctorAbsenceRequest, Room, Section, Subject, Teacher, TeacherSchedule, TeacherTeaching, Timeslot, User
from routers import proctors


class EmergencyProctorReassignmentTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.day = date(2032, 11, 26)
        self.program = Course(name="BSIT", category="College", department_code="ICT")
        self.course = Subject(name="Programming", course=self.program)
        self.section = Section(name="BSIT 1-101", course=self.program)
        self.room = Room(name="B501")
        self.admin = User(name="Program Head", email="head@test.invalid", hashed_password="unused",
                          role="program_head", department_code="ICT")
        self.original = self.faculty("Original Proctor")
        self.exam = self.duty(self.original, time(9, 30), time(10, 45))
        self.db.add(self.admin)
        self.db.commit()
        self.request = proctors.ReassignProctorRequest(
            expected_proctor_id=self.original.id, expected_room_id=self.room.id,
            expected_timeslot_id=self.exam.timeslot_id,
        )
        clock = patch.object(proctors, "_get_current_schedule_datetime", return_value=datetime.combine(
            self.day, time(9), tzinfo=proctors.SCHEDULE_TIMEZONE,
        ))
        self.addCleanup(clock.stop)
        self.clock = clock.start()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def faculty(self, name, *, weekday=None, department="ICT", excluded=False):
        teacher = Teacher(name=name)
        self.db.add(teacher)
        self.db.flush()
        proctor = Proctor(name=name, department=department, teacher=teacher, exclude_from_scheduling=excluded)
        self.db.add_all([proctor, TeacherSchedule(
            teacher_id=teacher.id, day_of_week=self.day.weekday() if weekday is None else weekday,
            start_time=time(7), end_time=time(17),
        )])
        self.db.flush()
        return proctor

    def duty(self, proctor, start, end):
        exam = Exam(proctor=proctor, course=self.program, subject=self.course, section=self.section,
                    room=self.room, timeslot=Timeslot(date=self.day, start_time=start, end_time=end),
                    status="posted", term="Final")
        self.db.add(exam)
        return exam

    def call_reassignment(self):
        return proctors.reassign_posted_proctor(self.exam.id, self.request, self.db, self.admin)

    def test_reassigns_to_eligible_proctor_with_less_work_and_notifies_both_accounts(self):
        busier = self.faculty("A. Busier")
        self.duty(busier, time(7, 30), time(8, 45))
        replacement = self.faculty("Z. Replacement")
        for proctor in (self.original, replacement):
            self.db.add(User(
                name=proctor.name, email=f"faculty-{proctor.id}@test.invalid", hashed_password="unused",
                role="proctor", proctor_id=proctor.id,
            ))
        self.db.commit()
        schedule = (self.exam.timeslot_id, self.exam.room_id, self.exam.section_id, self.exam.status)
        owner = self.db.query(User).filter_by(proctor_id=self.original.id).one()
        proctors.submit_proctor_absence(self.exam.id, proctors.ProctorAbsenceSubmission(
            expected_timeslot_id=self.exam.timeslot_id, expected_room_id=self.exam.room_id, reason="Emergency leave",
        ), self.db, owner)

        self.assertEqual(self.call_reassignment()["proctor_id"], replacement.id)
        self.db.refresh(self.exam)
        self.assertEqual(self.exam.proctor_id, replacement.id)
        self.assertEqual((self.exam.timeslot_id, self.exam.room_id, self.exam.section_id, self.exam.status), schedule)
        self.assertEqual(self.exam.proctor_attendance, "pending")
        notifications = self.db.query(Notification).filter_by(type="proctor_reassignment").all()
        self.assertEqual({n.user.proctor_id for n in notifications}, {self.original.id, replacement.id})
        self.assertTrue(all(n.related_id == self.exam.id and n.type == "proctor_reassignment" for n in notifications))
        self.assertEqual(self.db.query(ActivityLog).one().action, "PROCTOR_REASSIGNED")
        self.assertEqual(self.db.query(ProctorAbsenceRequest).one().status, "resolved")

        with self.assertRaises(HTTPException) as stale:
            self.call_reassignment()
        self.assertEqual(stale.exception.status_code, 409)
        self.assertIn("assignment has changed", stale.exception.detail)
        self.assertEqual(self.db.query(Notification).filter_by(type="proctor_reassignment").count(), 2)

    def test_leaves_assignment_intact_when_all_replacements_are_ineligible(self):
        self.faculty("Wrong day", weekday=(self.day.weekday() + 1) % 7)
        self.faculty("Wrong department", department="SHS")
        self.faculty("Excluded", excluded=True)
        busy = self.faculty("Overlapping assignment")
        self.duty(busy, time(9, 45), time(11))
        over_limit = self.faculty("Consecutive limit")
        for start, end in ((time(8), time(9, 15)), (time(11), time(12, 15)), (time(12, 30), time(13, 45))):
            self.duty(over_limit, start, end)
        instructor = self.faculty("Section teacher")
        self.db.add(TeacherTeaching(teacher_id=instructor.teacher_id, section_id=self.section.id))
        self.db.add(Proctor(name="Same teacher", department="ICT", teacher_id=self.original.teacher_id))
        self.db.commit()

        with self.assertRaises(HTTPException) as unavailable:
            self.call_reassignment()
        self.assertEqual(unavailable.exception.status_code, 409)
        self.assertIn("No eligible replacement", unavailable.exception.detail)
        self.assertEqual(self.exam.proctor_id, self.original.id)
        self.assertEqual(self.db.query(Notification).count(), 0)
        self.assertEqual(self.db.query(ActivityLog).count(), 0)

    def test_department_authority_with_academic_head_override(self):
        replacement = self.faculty("Replacement")
        self.admin.department_code = "BM"
        self.db.commit()
        with self.assertRaises(HTTPException) as forbidden:
            self.call_reassignment()
        self.assertEqual(forbidden.exception.status_code, 403)

        self.admin.is_super_admin = True
        self.db.commit()
        self.assertEqual(self.call_reassignment()["proctor_id"], replacement.id)

    def test_absence_is_private_and_manual_choice_resolves_it(self):
        automatic = self.faculty("A. Automatic")
        chosen = self.faculty("Z. Manual choice")
        owner = User(name=self.original.name, email="owner@test.invalid", hashed_password="unused",
                     role="proctor", proctor_id=self.original.id)
        other = User(name=chosen.name, email="other@test.invalid", hashed_password="unused",
                     role="proctor", proctor_id=chosen.id)
        unrelated_head = User(name="Other department", email="other-head@test.invalid", hashed_password="unused",
                              role="program_head", department_code="BM")
        self.db.add_all([owner, other, unrelated_head])
        self.db.commit()
        body = proctors.ProctorAbsenceSubmission(
            expected_timeslot_id=self.exam.timeslot_id, expected_room_id=self.exam.room_id, reason="Emergency leave",
        )

        with self.assertRaises(HTTPException):
            proctors.submit_proctor_absence(self.exam.id, body, self.db, other)
        request = proctors.submit_proctor_absence(self.exam.id, body, self.db, owner)
        self.assertEqual(proctors.submit_proctor_absence(self.exam.id, body, self.db, owner), request)
        self.assertEqual(proctors.get_pending_proctor_absences(self.db, self.admin), [request])
        self.assertEqual(proctors.get_pending_proctor_absences(self.db, unrelated_head), [])
        self.assertEqual(proctors.get_pending_proctor_absences(self.db, other), [])
        self.assertEqual(self.db.query(Notification).filter_by(type="proctor_absence_request").one().user_id, self.admin.id)
        self.assertEqual({row["id"] for row in proctors.get_replacement_options(self.exam.id, self.db, self.admin)}, {automatic.id, chosen.id})

        self.request.replacement_proctor_id = self.original.id
        with self.assertRaises(HTTPException) as ineligible:
            self.call_reassignment()
        self.assertEqual(ineligible.exception.status_code, 409)
        self.assertEqual(self.exam.proctor_id, self.original.id)

        self.request.replacement_proctor_id = chosen.id
        self.assertEqual(self.call_reassignment()["proctor_id"], chosen.id)
        self.assertEqual(self.db.query(ProctorAbsenceRequest).one().status, "resolved")
        self.assertEqual(proctors.get_pending_proctor_absences(self.db, self.admin), [])
        self.assertNotIn(self.original.id, {row["id"] for row in proctors.get_replacement_options(self.exam.id, self.db, self.admin)})

    def test_draft_confirmed_ended_and_generation_locked_exams_are_rejected(self):
        self.exam.status = "draft"
        self.db.commit()
        with self.assertRaisesRegex(HTTPException, "exam must be posted"):
            self.call_reassignment()

        self.exam.status = "posted"
        self.exam.proctor_attendance = "confirmed"
        self.db.commit()
        with self.assertRaisesRegex(HTTPException, "Attendance has already been confirmed"):
            self.call_reassignment()

        self.exam.proctor_attendance = "pending"
        self.db.commit()
        self.clock.return_value = datetime.combine(self.day, time(11), tzinfo=proctors.SCHEDULE_TIMEZONE)
        with self.assertRaisesRegex(HTTPException, "exam has already ended"):
            self.call_reassignment()

        with patch.object(proctors, "try_acquire_generation_lock", return_value=None):
            with self.assertRaisesRegex(HTTPException, "schedule change is in progress"):
                self.call_reassignment()
        self.assertEqual(self.exam.proctor_id, self.original.id)


if __name__ == "__main__":
    unittest.main()
