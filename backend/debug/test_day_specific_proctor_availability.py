import sys
import os
from datetime import date, time, datetime, timedelta

# Ensure backend root is in sys.path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import SessionLocal
from model.models import (
    Base, User, Proctor, Teacher, TeacherSchedule, Timeslot, Exam, Course, Subject, Section, Room
)
from utils.scheduler import (
    normalize_day_of_week,
    time_to_minutes,
    time_range_covers,
    validate_proctor_availability,
    minutes_to_time_str
)
from routers.exams import check_proctor_consecutive_limit

def run_tests():
    db = SessionLocal()
    print("=" * 70)
    print("RUNNING PROCTOR DAY-SPECIFIC AVAILABILITY TEST SUITE")
    print("=" * 70)

    # Clean up any leftover test entities
    TEST_TAG = "[TEST_PROCTOR_AVAIL]"
    cleanup_teachers = db.query(Teacher).filter(Teacher.name.like(f"{TEST_TAG}%")).all()
    t_ids = [t.id for t in cleanup_teachers]
    if t_ids:
        db.query(TeacherSchedule).filter(TeacherSchedule.teacher_id.in_(t_ids)).delete(synchronize_session=False)
        db.query(Proctor).filter(Proctor.teacher_id.in_(t_ids)).delete(synchronize_session=False)
        db.query(Teacher).filter(Teacher.id.in_(t_ids)).delete(synchronize_session=False)
        db.commit()

    try:
        # Create test teacher & proctor 1: Monday schedule 10:00 AM - 8:30 PM (20:30)
        t1 = Teacher(name=f"{TEST_TAG} Monday Only")
        db.add(t1)
        db.flush()

        p1 = Proctor(name=f"{TEST_TAG} Monday Only", teacher_id=t1.id, department="College")
        db.add(p1)
        db.flush()

        # Monday is weekday 0
        sched1 = TeacherSchedule(
            teacher_id=t1.id,
            day_of_week=0,
            start_time=time(10, 0),
            end_time=time(20, 30),
            subject_name="Monday Class 10am-8:30pm"
        )
        db.add(sched1)

        # Create test teacher & proctor 2: Tuesday schedule 8:00 AM - 5:00 PM (17:00), NO Monday schedule
        t2 = Teacher(name=f"{TEST_TAG} Tuesday Only")
        db.add(t2)
        db.flush()

        p2 = Proctor(name=f"{TEST_TAG} Tuesday Only", teacher_id=t2.id, department="College")
        db.add(p2)
        db.flush()

        # Tuesday is weekday 1
        sched2 = TeacherSchedule(
            teacher_id=t2.id,
            day_of_week=1,
            start_time=time(8, 0),
            end_time=time(17, 0),
            subject_name="Tuesday Class 8am-5pm"
        )
        db.add(sched2)

        # Create test teacher & proctor 3: Schedule with day_of_week=None (corrupt/unspecified day)
        t3 = Teacher(name=f"{TEST_TAG} None Day")
        db.add(t3)
        db.flush()

        p3 = Proctor(name=f"{TEST_TAG} None Day", teacher_id=t3.id, department="College")
        db.add(p3)
        db.flush()

        sched3 = TeacherSchedule(
            teacher_id=t3.id,
            day_of_week=None,
            start_time=time(8, 0),
            end_time=time(18, 0),
            subject_name="Unspecified Day"
        )
        db.add(sched3)
        db.commit()

        # Target exam date: Monday, October 26, 2026 (weekday = 0)
        monday_date = date(2026, 10, 26)
        assert monday_date.weekday() == 0, f"Expected 2026-10-26 to be Monday (0), got {monday_date.weekday()}"

        # Target exam date: Tuesday, October 27, 2026 (weekday = 1)
        tuesday_date = date(2026, 10, 27)
        assert tuesday_date.weekday() == 1, f"Expected 2026-10-27 to be Tuesday (1), got {tuesday_date.weekday()}"

        # -------------------------------------------------------------
        # TEST 1: Monday schedule 10:00 AM–8:30 PM REJECTS 8:00 AM exam
        # -------------------------------------------------------------
        print("\n--- Test 1: Monday 10:00 AM–8:30 PM schedule rejects an 8:00 AM exam ---")
        is_avail, err = validate_proctor_availability(
            db,
            proctor_id=p1.id,
            target_date=monday_date,
            target_start=time(8, 0),
            target_end=time(9, 15)
        )
        print(f"Result: is_avail={is_avail}, err={err}")
        assert not is_avail, "Expected 8:00 AM–9:15 AM exam to be rejected for 10:00 AM start schedule!"
        assert "falls outside" in err and "10:00 AM - 8:30 PM" in err
        print("PASSED: 8:00 AM exam rejected successfully.")

        # -------------------------------------------------------------
        # TEST 2: Monday schedule 10:00 AM–8:30 PM ACCEPTS 11:45 AM–1:00 PM exam
        # -------------------------------------------------------------
        print("\n--- Test 2: Monday 10:00 AM–8:30 PM schedule accepts an 11:45 AM–1:00 PM exam ---")
        is_avail, err = validate_proctor_availability(
            db,
            proctor_id=p1.id,
            target_date=monday_date,
            target_start=time(11, 45),
            target_end=time(13, 0)
        )
        print(f"Result: is_avail={is_avail}, err={err}")
        assert is_avail, f"Expected 11:45 AM–1:00 PM exam to be accepted, but got: {err}"
        assert err is None
        print("PASSED: 11:45 AM–1:00 PM exam accepted successfully.")

        # -------------------------------------------------------------
        # TEST 3: Monday schedule 10:00 AM–8:30 PM REJECTS exam ending after 8:30 PM
        # -------------------------------------------------------------
        print("\n--- Test 3: Monday 10:00 AM–8:30 PM schedule rejects an exam ending after 8:30 PM ---")
        is_avail, err = validate_proctor_availability(
            db,
            proctor_id=p1.id,
            target_date=monday_date,
            target_start=time(19, 30),
            target_end=time(20, 45) # 8:45 PM > 8:30 PM
        )
        print(f"Result: is_avail={is_avail}, err={err}")
        assert not is_avail, "Expected exam ending at 8:45 PM to be rejected for 8:30 PM end schedule!"
        assert "falls outside" in err
        print("PASSED: Exam ending after 8:30 PM rejected successfully.")

        # Also test boundary edge: exactly 10:00 AM to 8:30 PM should be accepted
        is_avail_exact, err_exact = validate_proctor_availability(
            db,
            proctor_id=p1.id,
            target_date=monday_date,
            target_start=time(10, 0),
            target_end=time(20, 30)
        )
        assert is_avail_exact, f"Exact window (10:00 AM - 8:30 PM) should be accepted, got: {err_exact}"
        print("PASSED: Exact window boundary accepted successfully.")

        # -------------------------------------------------------------
        # TEST 4: Tuesday schedule does not determine Monday availability
        # -------------------------------------------------------------
        print("\n--- Test 4: Tuesday schedule does not determine Monday availability ---")
        is_avail, err = validate_proctor_availability(
            db,
            proctor_id=p2.id,
            target_date=monday_date, # Monday
            target_start=time(9, 0),
            target_end=time(10, 30)
        )
        print(f"Result: is_avail={is_avail}, err={err}")
        assert not is_avail, "Expected Tuesday-only proctor to be rejected on Monday!"
        assert "no uploaded schedule for Monday" in err
        print("PASSED: Tuesday schedule does NOT determine Monday availability.")

        # Verify that proctor 2 IS available on Tuesday within their hours
        is_avail_tue, err_tue = validate_proctor_availability(
            db,
            proctor_id=p2.id,
            target_date=tuesday_date, # Tuesday
            target_start=time(9, 0),
            target_end=time(10, 30)
        )
        assert is_avail_tue, f"Expected Tuesday-only proctor to be accepted on Tuesday, got: {err_tue}"
        print("PASSED: Tuesday-only proctor is available on Tuesday.")

        # -------------------------------------------------------------
        # TEST 5: Proctor with day_of_week=None is NOT eligible for Monday
        # -------------------------------------------------------------
        print("\n--- Test 5: Proctor with day_of_week=None is not eligible for Monday ---")
        is_avail, err = validate_proctor_availability(
            db,
            proctor_id=p3.id,
            target_date=monday_date,
            target_start=time(10, 0),
            target_end=time(11, 30)
        )
        print(f"Result: is_avail={is_avail}, err={err}")
        assert not is_avail, "Expected proctor with day_of_week=None to be rejected on Monday!"
        assert "no uploaded schedule for Monday" in err
        print("PASSED: day_of_week=None schedule rejected.")

        # -------------------------------------------------------------
        # TEST 6: Verify two-consecutive-assignment break rule
        # -------------------------------------------------------------
        print("\n--- Test 6: Verify two-consecutive-assignment limit rule ---")
        # Create timeslots on Monday
        slot1 = Timeslot(date=monday_date, start_time=time(10, 0), end_time=time(11, 30))
        slot2 = Timeslot(date=monday_date, start_time=time(11, 30), end_time=time(13, 0)) # consecutive to slot1
        slot3 = Timeslot(date=monday_date, start_time=time(13, 0), end_time=time(14, 30))  # consecutive to slot2 (3rd!)
        slot4_after_break = Timeslot(date=monday_date, start_time=time(15, 0), end_time=time(16, 30)) # after 30m break

        db.add_all([slot1, slot2, slot3, slot4_after_break])
        db.flush()

        # Create 2 exams assigned to p1 in slot1 and slot2
        exam1 = Exam(
            subject_id=None, section_id=None, room_id=None,
            timeslot_id=slot1.id, proctor_id=p1.id, status="draft"
        )
        exam2 = Exam(
            subject_id=None, section_id=None, room_id=None,
            timeslot_id=slot2.id, proctor_id=p1.id, status="draft"
        )
        db.add_all([exam1, exam2])
        db.commit()

        # Candidate slot3 would make streak = 3 -> must be rejected by check_proctor_consecutive_limit
        can_assign_slot3 = check_proctor_consecutive_limit(db, p1.id, slot3)
        print(f"Consecutive limit for 3rd consecutive slot: can_assign={can_assign_slot3}")
        assert not can_assign_slot3, "Expected 3rd consecutive assignment to be rejected!"
        print("PASSED: 3rd consecutive assignment blocked by consecutive limit rule.")

        # Candidate slot4 is after a break -> must be accepted
        can_assign_slot4 = check_proctor_consecutive_limit(db, p1.id, slot4_after_break)
        print(f"Consecutive limit after break (slot4): can_assign={can_assign_slot4}")
        assert can_assign_slot4, "Expected assignment after break to be allowed!"
        print("PASSED: Assignment after a break allowed.")

        # Cleanup test exams & slots
        db.delete(exam1)
        db.delete(exam2)
        db.delete(slot1)
        db.delete(slot2)
        db.delete(slot3)
        db.delete(slot4_after_break)
        db.commit()

        # -------------------------------------------------------------
        # TEST 7: normalize_day_of_week edge cases
        # -------------------------------------------------------------
        print("\n--- Test 7: normalize_day_of_week helper edge cases ---")
        assert normalize_day_of_week(0) == 0
        assert normalize_day_of_week(6) == 6
        assert normalize_day_of_week(7) is None
        assert normalize_day_of_week(-1) is None
        assert normalize_day_of_week("0") == 0
        assert normalize_day_of_week("4") == 4
        assert normalize_day_of_week("Monday") == 0
        assert normalize_day_of_week("MONDAY") == 0
        assert normalize_day_of_week("tuesday") == 1
        assert normalize_day_of_week("Friday") == 4
        assert normalize_day_of_week("Sunday") == 6
        assert normalize_day_of_week(None) is None
        assert normalize_day_of_week("invalid") is None
        print("PASSED: normalize_day_of_week works across all inputs.")

        # -------------------------------------------------------------
        # TEST 8: time_range_covers edge cases
        # -------------------------------------------------------------
        print("\n--- Test 8: time_range_covers helper edge cases ---")
        intervals = [(time(10, 0), time(20, 30))]
        assert not time_range_covers(intervals, time(8, 0), time(9, 15))
        assert time_range_covers(intervals, time(11, 45), time(13, 0))
        assert not time_range_covers(intervals, time(19, 30), time(20, 45))
        assert time_range_covers(intervals, time(10, 0), time(20, 30))
        assert not time_range_covers([], time(10, 0), time(11, 0))
        print("PASSED: time_range_covers verified.")

        # -------------------------------------------------------------
        # TEST 9: get_eligible_proctors & update_exam endpoint enforcement
        # -------------------------------------------------------------
        print("\n--- Test 9: get_eligible_proctors & update_exam enforcement ---")
        from routers.exams import get_eligible_proctors, update_exam, UpdateExamRequest
        from fastapi import HTTPException

        # Create dummy admin user
        admin_user = db.query(User).filter(User.role == "program_head").first()
        if not admin_user:
            admin_user = User(name="Test Admin", email="testadmin@school.edu", role="program_head", hashed_password="x")
            db.add(admin_user)
            db.flush()

        # Create dummy course, section, subject, room, exam
        course = Course(name=f"{TEST_TAG} BSCS", category="College")
        db.add(course)
        db.flush()

        sec = Section(name=f"{TEST_TAG} 1-1", course_id=course.id)
        sub = Subject(name=f"{TEST_TAG} Math", course_id=course.id)
        room = Room(name=f"{TEST_TAG} Room 101", building="B", capacity=40, department="College")
        db.add_all([sec, sub, room])
        db.flush()

        slot_early = Timeslot(date=monday_date, start_time=time(8, 0), end_time=time(9, 15))
        slot_valid = Timeslot(date=monday_date, start_time=time(11, 45), end_time=time(13, 0))
        slot_late = Timeslot(date=monday_date, start_time=time(20, 0), end_time=time(21, 15)) # ends 9:15 PM > 8:30 PM
        db.add_all([slot_early, slot_valid, slot_late])
        db.flush()

        test_exam = Exam(
            course_id=course.id,
            section_id=sec.id,
            subject_id=sub.id,
            room_id=room.id,
            timeslot_id=slot_early.id,
            status="draft"
        )
        db.add(test_exam)
        db.commit()

        # 9a. get_eligible_proctors for 8:00 AM–9:15 AM:
        # Proctor 1 (10:00 AM-8:30 PM) and Proctor 2 (Tuesday only) MUST NOT be eligible
        elig_early = get_eligible_proctors(test_exam.id, timeslot_id=slot_early.id, db=db, current_user=admin_user)
        elig_early_ids = [p["id"] for p in elig_early]
        assert p1.id not in elig_early_ids, f"Proctor 1 (Monday 10am-8:30pm) must NOT be eligible at 8:00 AM! Got: {elig_early_ids}"
        assert p2.id not in elig_early_ids, f"Proctor 2 (Tuesday only) must NOT be eligible on Monday! Got: {elig_early_ids}"
        print("PASSED: 9a - get_eligible_proctors correctly excludes proctors outside hours or without Monday schedule.")

        # 9b. update_exam attempting to assign Proctor 1 at 8:00 AM MUST fail with HTTPException(400)
        try:
            update_exam(
                test_exam.id,
                UpdateExamRequest(timeslot_id=slot_early.id, proctor_id=p1.id),
                db=db,
                current_user=admin_user
            )
            assert False, "Expected update_exam to raise HTTPException(400) for 8:00 AM exam!"
        except HTTPException as he:
            assert he.status_code == 400
            assert "falls outside" in he.detail
            print(f"PASSED: 9b - update_exam correctly rejected assigning Proctor 1 at 8:00 AM ({he.detail}).")

        # 9c. get_eligible_proctors for 11:45 AM–1:00 PM:
        # Proctor 1 MUST be eligible, Proctor 2 MUST NOT be eligible
        elig_valid = get_eligible_proctors(test_exam.id, timeslot_id=slot_valid.id, db=db, current_user=admin_user)
        elig_valid_ids = [p["id"] for p in elig_valid]
        assert p1.id in elig_valid_ids, f"Proctor 1 must be eligible for 11:45 AM-1:00 PM exam! Got: {elig_valid_ids}"
        assert p2.id not in elig_valid_ids, f"Proctor 2 (Tuesday only) must NOT be eligible on Monday! Got: {elig_valid_ids}"
        print("PASSED: 9c - get_eligible_proctors correctly includes Proctor 1 and excludes Proctor 2 for 11:45 AM.")

        # 9d. update_exam assigning Proctor 1 at 11:45 AM MUST succeed
        res_valid = update_exam(
            test_exam.id,
            UpdateExamRequest(timeslot_id=slot_valid.id, proctor_id=p1.id),
            db=db,
            current_user=admin_user
        )
        assert res_valid["proctor_id"] == p1.id
        print("PASSED: 9d - update_exam successfully assigned Proctor 1 at 11:45 AM.")

        # 9e. update_exam attempting to assign Proctor 1 at 8:00 PM–9:15 PM (ending after 8:30 PM) MUST fail with 400
        try:
            update_exam(
                test_exam.id,
                UpdateExamRequest(timeslot_id=slot_late.id, proctor_id=p1.id),
                db=db,
                current_user=admin_user
            )
            assert False, "Expected update_exam to raise HTTPException(400) for exam ending after 8:30 PM!"
        except HTTPException as he:
            assert he.status_code == 400
            assert "falls outside" in he.detail
            print(f"PASSED: 9e - update_exam correctly rejected exam ending after 8:30 PM ({he.detail}).")

        # 9f. update_exam attempting to assign Proctor 2 (Tuesday only) on Monday MUST fail with 400
        try:
            update_exam(
                test_exam.id,
                UpdateExamRequest(timeslot_id=slot_valid.id, proctor_id=p2.id),
                db=db,
                current_user=admin_user
            )
            assert False, "Expected update_exam to raise HTTPException(400) for Tuesday-only proctor on Monday!"
        except HTTPException as he:
            assert he.status_code == 400
            assert "no uploaded schedule for Monday" in he.detail
            print(f"PASSED: 9f - update_exam correctly rejected Tuesday-only proctor for Monday exam ({he.detail}).")

        # Clean up test exam entities
        db.delete(test_exam)
        db.delete(slot_early)
        db.delete(slot_valid)
        db.delete(slot_late)
        db.delete(room)
        db.delete(sub)
        db.delete(sec)
        db.delete(course)
        db.commit()

        print("\n" + "=" * 70)
        print("ALL TESTS PASSED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        # Cleanup test records
        cleanup_teachers = db.query(Teacher).filter(Teacher.name.like(f"{TEST_TAG}%")).all()
        t_ids = [t.id for t in cleanup_teachers]
        if t_ids:
            db.query(TeacherSchedule).filter(TeacherSchedule.teacher_id.in_(t_ids)).delete(synchronize_session=False)
            db.query(Proctor).filter(Proctor.teacher_id.in_(t_ids)).delete(synchronize_session=False)
            db.query(Teacher).filter(Teacher.id.in_(t_ids)).delete(synchronize_session=False)
            db.commit()
        db.close()

if __name__ == "__main__":
    run_tests()
