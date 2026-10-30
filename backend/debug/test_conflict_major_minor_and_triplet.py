import sys
import os
from datetime import date, time
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from core import SessionLocal
from model import User, Course, Subject, Section, Timeslot, Exam, ReschedulingRequest, IrregularSelection, ActivityLog
from routers.student import submit_reschedule_request, RescheduleRequestBody
from fastapi import HTTPException

def run_tests():
    db = SessionLocal()
    try:
        print("=== RUNNING CONFLICT RESOLUTION & RESCHEDULING TESTS ===")
        # 1. Create or retrieve test user
        test_email = "conflict_test_student@edu.ph"
        student = db.query(User).filter(User.email == test_email).first()
        if not student:
            student = User(
                name="Conflict Test Student",
                email=test_email,
                role="student",
                student_type="irregular",
                hashed_password="dummy",
            )
            db.add(student)
            db.flush()
        else:
            student.student_type = "irregular"
            db.flush()

        # Clean existing selections and requests for this test user
        db.query(ReschedulingRequest).filter(ReschedulingRequest.school_email == test_email).delete()
        db.query(IrregularSelection).filter(IrregularSelection.user_id == student.id).delete()
        db.commit()

        # Retrieve a course and section
        course = db.query(Course).first()
        section = db.query(Section).filter(Section.course_id == course.id).first() if course else None
        if not section:
            section = db.query(Section).first()

        # Create 3 subjects: 2 Major, 1 Minor (general)
        test_date = date(2026, 11, 20)
        ts_slot = db.query(Timeslot).filter(
            Timeslot.date == test_date,
            Timeslot.start_time == time(8, 0),
            Timeslot.end_time == time(9, 15)
        ).first()
        if not ts_slot:
            ts_slot = Timeslot(date=test_date, start_time=time(8, 0), end_time=time(9, 15))
            db.add(ts_slot)
            db.flush()

        s_major1 = Subject(name="Test Advanced Algorithms", code="CS_MAJ1", category="major", course_id=course.id, exam_type="written", duration_minutes=75)
        s_major2 = Subject(name="Test Software Architecture", code="CS_MAJ2", category="major", course_id=course.id, exam_type="written", duration_minutes=75)
        s_minor = Subject(name="Test Ethics and Values", code="GE_MIN1", category="general", course_id=course.id, exam_type="written", duration_minutes=75)
        db.add_all([s_major1, s_major2, s_minor])
        db.flush()

        # Create 3 posted exams at the EXACT SAME TIMESLOT (Triplet Conflict)
        e_maj1 = Exam(subject_id=s_major1.id, section_id=section.id, timeslot_id=ts_slot.id, status="posted")
        e_maj2 = Exam(subject_id=s_major2.id, section_id=section.id, timeslot_id=ts_slot.id, status="posted")
        e_minor = Exam(subject_id=s_minor.id, section_id=section.id, timeslot_id=ts_slot.id, status="posted")
        db.add_all([e_maj1, e_maj2, e_minor])
        db.flush()

        # Assign selections to student
        db.add_all([
            IrregularSelection(user_id=student.id, subject_id=s_major1.id, section_id=section.id),
            IrregularSelection(user_id=student.id, subject_id=s_major2.id, section_id=section.id),
            IrregularSelection(user_id=student.id, subject_id=s_minor.id, section_id=section.id),
        ])
        db.commit()

        # TEST 1: Try to reschedule Major 1 while conflicting with Minor
        print("\n--- TEST 1: Attempt to reschedule Major 1 when conflicting with Minor ---")
        body_maj1 = RescheduleRequestBody(
            exam_id=e_maj1.id,
            section_name=section.name,
            student_name=student.name,
            student_id="0200099999",
            program=course.name if course else "BSIT",
            school_email=student.email,
            course_code=s_major1.code,
            course_name=s_major1.name,
            original_exam_date=str(test_date),
            original_start_time="08:00:00",
            original_end_time="09:15:00",
            exam_type="written",
            reason_type="exam conflict",
            detailed_explanation="Conflict test",
            requested_mode="manual",
            preferred_date=str(test_date),
            preferred_start_time="10:00:00",
            preferred_end_time="11:15:00",
            acknowledged=True
        )
        try:
            submit_reschedule_request(body_maj1, current_user=student, db=db)
            assert False, "Should have failed: Major subject cannot be rescheduled when conflicting with a minor!"
        except HTTPException as he:
            print("Expected rejection caught:", he.detail)
            assert "only the minor subject needs to be rescheduled" in he.detail.lower()
            print("TEST 1 PASSED: Major subject rejected, only minor can be rescheduled.")

        # TEST 2: Reschedule the Minor subject
        print("\n--- TEST 2: Reschedule the Minor subject ---")
        body_minor = RescheduleRequestBody(
            exam_id=e_minor.id,
            section_name=section.name,
            student_name=student.name,
            student_id="0200099999",
            program=course.name if course else "BSIT",
            school_email=student.email,
            course_code=s_minor.code,
            course_name=s_minor.name,
            original_exam_date=str(test_date),
            original_start_time="08:00:00",
            original_end_time="09:15:00",
            exam_type="written",
            reason_type="exam conflict",
            detailed_explanation="Rescheduling minor conflict",
            requested_mode="manual",
            preferred_date=str(test_date),
            preferred_start_time="10:00:00",
            preferred_end_time="11:15:00",
            acknowledged=True
        )
        res_minor = submit_reschedule_request(body_minor, current_user=student, db=db)
        print("Minor reschedule response:", res_minor)
        minor_req_id = res_minor["id"]
        assert minor_req_id > 0
        print("TEST 2 PASSED: Minor subject reschedule submitted successfully.")

        # TEST 3: Approve Minor subject (successfully rescheduled)
        print("\n--- TEST 3: Approve Minor subject reschedule ---")
        ts_new = Timeslot(date=test_date, start_time=time(10, 0), end_time=time(11, 15))
        db.add(ts_new)
        db.flush()
        e_minor_resched = Exam(subject_id=s_minor.id, section_id=section.id, timeslot_id=ts_new.id, status="posted")
        db.add(e_minor_resched)
        db.flush()

        req_obj = db.query(ReschedulingRequest).filter(ReschedulingRequest.id == minor_req_id).first()
        req_obj.status = "approved"
        req_obj.rescheduled_exam_id = e_minor_resched.id
        db.commit()
        print(f"Minor exam {e_minor.id} successfully rescheduled to exam {e_minor_resched.id} at 10:00 AM!")

        # TEST 4: Now Major 1 and Major 2 still conflict at 8:00 AM!
        # System should accept rescheduling for the remaining conflict!
        print("\n--- TEST 4: Reschedule remaining conflict (Major 1 vs Major 2) ---")
        body_maj2 = RescheduleRequestBody(
            exam_id=e_maj2.id,
            section_name=section.name,
            student_name=student.name,
            student_id="0200099999",
            program=course.name if course else "BSIT",
            school_email=student.email,
            course_code=s_major2.code,
            course_name=s_major2.name,
            original_exam_date=str(test_date),
            original_start_time="08:00:00",
            original_end_time="09:15:00",
            exam_type="written",
            reason_type="exam conflict",
            detailed_explanation="Rescheduling remaining major conflict",
            requested_mode="manual",
            preferred_date=str(test_date),
            preferred_start_time="13:00:00",
            preferred_end_time="14:15:00",
            acknowledged=True
        )
        res_maj2 = submit_reschedule_request(body_maj2, current_user=student, db=db)
        print("Remaining conflict reschedule response:", res_maj2)
        assert res_maj2["id"] > 0
        print("TEST 4 PASSED: System accepted the other conflict schedule successfully!")

        print("\nALL CONFLICT TESTS PASSED SUCCESSFULLY!")

    finally:
        # Cleanup test data
        db.rollback()
        try:
            if 'student' in locals() and student and student.id:
                db.query(ReschedulingRequest).filter(ReschedulingRequest.school_email == test_email).delete()
                db.query(IrregularSelection).filter(IrregularSelection.user_id == student.id).delete()
                db.query(ActivityLog).filter(ActivityLog.user_id == student.id).delete()
                db.delete(student)
                db.commit()

            if 'e_minor_resched' in locals() and e_minor_resched:
                db.delete(e_minor_resched)
            if 'e_minor' in locals() and e_minor:
                db.delete(e_minor)
            if 'e_maj1' in locals() and e_maj1:
                db.delete(e_maj1)
            if 'e_maj2' in locals() and e_maj2:
                db.delete(e_maj2)
            db.commit()

            if 's_minor' in locals() and s_minor:
                db.delete(s_minor)
            if 's_major1' in locals() and s_major1:
                db.delete(s_major1)
            if 's_major2' in locals() and s_major2:
                db.delete(s_major2)
            if 'ts_new' in locals() and ts_new:
                db.delete(ts_new)
            if 'ts_slot' in locals() and ts_slot:
                db.delete(ts_slot)
            db.commit()
            print("Test data cleaned up successfully.")
        except Exception as e:
            db.rollback()
            print("Cleanup warning:", e)
        db.close()

if __name__ == "__main__":
    run_tests()
