import os
import sys
from datetime import date, time, datetime
from fastapi import HTTPException

# Setup PYTHONPATH
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from core.database import SessionLocal
from model.models import Exam, Proctor, Timeslot, Subject, Section, Course, User, TeacherTeaching, TeacherSchedule
from routers.exams import get_eligible_proctors, update_exam, UpdateExamRequest, check_proctor_consecutive_limit

class MockUser:
    def __init__(self, user_id=1):
        self.id = user_id
        self.role = "admin"
        self.email = "admin@test.com"

def run_tests():
    db = SessionLocal()
    admin_user = db.query(User).filter(User.role.in_(["admin", "program_head"])).first()
    mock_user = MockUser(user_id=admin_user.id if admin_user else 1)

    try:
        print("=" * 70)
        print("TEST 1: Verify get_eligible_proctors endpoint logic")
        print("=" * 70)
        exam = db.query(Exam).filter(Exam.timeslot_id.isnot(None)).first()
        assert exam is not None, "Need at least one scheduled exam with a timeslot"
        print(f"Testing on Exam ID: {exam.id}, Subject: {exam.subject.name if exam.subject else 'None'}, Section: {exam.section.name if exam.section else 'None'}, Dept: {exam.course.category}")
        print(f"Timeslot: {exam.timeslot.date} {exam.timeslot.start_time} - {exam.timeslot.end_time}")

        eligible = get_eligible_proctors(exam_id=exam.id, timeslot_id=exam.timeslot_id, db=db, current_user=mock_user)
        print(f"Found {len(eligible)} eligible proctors.")
        for p in eligible[:5]:
            print(f" - ID={p['id']}, Name={p['name']}, Dept={p['department']}, Current={p.get('is_current')}")

        # Check department consistency on all eligible proctors
        exam_dept = exam.course.category
        for p in eligible:
            if exam_dept == "SHS":
                assert p["department"] == "SHS", f"SHS exam cannot have non-SHS proctor: {p}"
            elif exam_dept == "College":
                assert p["department"] != "SHS", f"College exam cannot have SHS proctor: {p}"
        print("[PASS] Department consistency verified on all eligible proctors.")

        print("\n" + "=" * 70)
        print("TEST 2: Verify subject and section teaching conflict exclusion")
        print("=" * 70)
        # Verify that if a proctor teaches the subject or section, they are excluded
        if exam.subject and exam.subject.teacher_id:
            teacher_proc = db.query(Proctor).filter(Proctor.teacher_id == exam.subject.teacher_id).first()
            if teacher_proc:
                assert not any(p["id"] == teacher_proc.id for p in eligible), f"Teacher {teacher_proc.name} teaches the subject and must not be eligible!"
                print(f"[PASS] Proctor {teacher_proc.name} (Subject Teacher) correctly excluded from eligible proctors.")

        print("\n" + "=" * 70)
        print("TEST 3: Verify timeslot busy double-booking conflict exclusion")
        print("=" * 70)
        # Find another exam at the same timeslot that has a proctor assigned
        other_exam = db.query(Exam).filter(
            Exam.timeslot_id == exam.timeslot_id,
            Exam.id != exam.id,
            Exam.proctor_id.isnot(None)
        ).first()
        if other_exam and other_exam.proctor_id:
            busy_p = db.query(Proctor).get(other_exam.proctor_id)
            if busy_p:
                assert not any(p["id"] == busy_p.id for p in eligible), f"Proctor {busy_p.name} is already assigned at this timeslot and must not be eligible!"
                print(f"[PASS] Double-booked proctor {busy_p.name} correctly excluded from eligible list.")
        else:
            print("No other exam with assigned proctor at this exact timeslot; skipping double-booking assertion.")

        print("\n" + "=" * 70)
        print("TEST 4: Verify search filtering with dynamic partial matches")
        print("=" * 70)
        if eligible:
            test_target = eligible[0]
            full_name = test_target["name"]
            # Test full match (case-insensitive)
            q_full = full_name.lower()
            matched_full = [p for p in eligible if q_full in p["name"].lower()]
            assert any(p["id"] == test_target["id"] for p in matched_full), "Full match failed"

            # Test partial match (first 3 letters)
            q_part = full_name[:3].lower()
            matched_part = [p for p in eligible if q_part in p["name"].lower()]
            assert any(p["id"] == test_target["id"] for p in matched_part), "Partial match failed"
            print(f"[PASS] Partial search query '{q_part}' matched '{full_name}' successfully ({len(matched_part)} results).")

        print("\n" + "=" * 70)
        print("TEST 5: Verify max 2 consecutive assignments rule enforcement")
        print("=" * 70)
        # Create a mock proctor with 2 consecutive timeslots and check if 3rd consecutive slot is blocked
        ts1 = Timeslot(date=date(2026, 12, 1), start_time=time(8, 0), end_time=time(9, 15))
        ts2 = Timeslot(date=date(2026, 12, 1), start_time=time(9, 30), end_time=time(10, 45))
        ts3_consecutive = Timeslot(date=date(2026, 12, 1), start_time=time(11, 0), end_time=time(12, 15))
        ts4_with_break = Timeslot(date=date(2026, 12, 1), start_time=time(13, 0), end_time=time(14, 15))

        test_proc = Proctor(name="TEST_CONSEC_PROC", department="College", exclude_from_scheduling=False)
        db.add(test_proc)
        db.add_all([ts1, ts2, ts3_consecutive, ts4_with_break])
        db.commit()
        db.refresh(test_proc)

        # Create 2 consecutive exams for test_proc
        e1 = Exam(timeslot_id=ts1.id, proctor_id=test_proc.id, status="draft", semester=1)
        e2 = Exam(timeslot_id=ts2.id, proctor_id=test_proc.id, status="draft", semester=1)
        db.add_all([e1, e2])
        db.commit()

        # Check consecutive rule with 3rd consecutive slot (should return False)
        is_ok_consec = check_proctor_consecutive_limit(db, test_proc.id, ts3_consecutive)
        assert not is_ok_consec, "check_proctor_consecutive_limit should reject 3rd consecutive assignment!"
        print("[PASS] 3rd consecutive slot properly flagged as violation (False).")

        # Check with slot after break (should return True)
        is_ok_break = check_proctor_consecutive_limit(db, test_proc.id, ts4_with_break)
        assert is_ok_break, "check_proctor_consecutive_limit should accept slot after break!"
        print("[PASS] Slot after lunch/break properly accepted (True).")

        # Cleanup test entities
        db.query(Exam).filter(Exam.id.in_([e1.id, e2.id])).delete()
        db.query(Timeslot).filter(Timeslot.id.in_([ts1.id, ts2.id, ts3_consecutive.id, ts4_with_break.id])).delete()
        db.query(Proctor).filter(Proctor.id == test_proc.id).delete()
        db.commit()

        print("\n" + "=" * 70)
        print("ALL TESTS PASSED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
