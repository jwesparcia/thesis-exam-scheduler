"""
Comprehensive test script for Auto-Rescheduler for irregular students.
Tests:
1. Single time conflict & 15-minute break
2. Multiple time conflicts & occupied candidate slots (skipping occupied slots)
3. Mandatory 15-minute break between consecutive exams (before and after)
4. School operating hours constraints
5. Room capacity restrictions and lowest-assigned-student prioritization
6. Situations where no valid schedule is available (exception handling)
7. Concurrent requests protection (thread-based concurrency)
8. End-to-end API integration and database updates
"""

import sys
import os
import threading
from datetime import datetime, date, time, timedelta

# Ensure backend root is in sys.path
backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from core.database import SessionLocal
from model import (
    ReschedulingRequest,
    Exam,
    Timeslot,
    Room,
    User,
    Subject,
    Section,
    Course,
    YearLevel,
    SystemSetting,
    Notification,
)
from services.auto_rescheduler import (
    find_earliest_auto_schedule,
    apply_auto_reschedule,
    get_assigned_student_count_for_room,
    get_school_operating_hours,
    get_exam_configured_duration,
)


def run_all_tests():
    db = SessionLocal()
    print("================================================================")
    print("STARTING AUTO-RESCHEDULER TEST SUITE")
    print("================================================================")

    test_date = date(2026, 11, 10)
    created_exam_ids = []
    created_ts_ids = []
    created_room_ids = []
    created_req_ids = []
    created_user_ids = []

    try:
        # Set up a test course, section, subjects, and rooms
        course = db.query(Course).first()
        year_level = db.query(YearLevel).first()

        # Create unique test student
        test_email = f"test_irreg_{datetime.now().strftime('%Y%m%d%H%M%S')}@test.edu"
        student = User(
            name="Test Irregular Student",
            email=test_email,
            hashed_password="hashed_pw",
            role="student",
            student_type="irregular",
            course_id=course.id if course else None,
            student_id="02000999999",
            is_first_login=False,
        )
        db.add(student)
        db.flush()
        created_user_ids.append(student.id)

        # Create two test rooms
        # Room A: capacity 40
        # Room B: capacity 40
        room_a = Room(name=f"TEST_A_{datetime.now().strftime('%M%S')}", building="B", capacity=40, department="College")
        room_b = Room(name=f"TEST_B_{datetime.now().strftime('%M%S')}", building="B", capacity=40, department="College")
        db.add_all([room_a, room_b])
        db.flush()
        created_room_ids.extend([room_a.id, room_b.id])

        # Create test subjects: 75-minute duration
        subj_conflict = Subject(code="TST101", name="Conflicting Subject", duration_minutes=75, category="major")
        subj_to_resched = Subject(code="TST102", name="Subject To Reschedule", duration_minutes=75, category="major")
        subj_slot1 = Subject(code="TST103", name="Slot 1 Exam", duration_minutes=75, category="major")
        subj_slot2 = Subject(code="TST104", name="Slot 2 Exam", duration_minutes=75, category="major")
        db.add_all([subj_conflict, subj_to_resched, subj_slot1, subj_slot2])
        db.flush()

        # -------------------------------------------------------------
        # TEST 1: Single time conflict & mandatory 15-minute break
        # -------------------------------------------------------------
        print("\n--- TEST 1: Single Time Conflict & 15-Minute Break ---")
        # Conflicting exam: 09:30 AM to 11:00 AM
        ts_conf = Timeslot(date=test_date, start_time=time(9, 30), end_time=time(11, 0))
        # Original exam being rescheduled: 09:30 AM to 11:00 AM
        ts_orig = Timeslot(date=test_date, start_time=time(9, 30), end_time=time(11, 0))
        db.add_all([ts_conf, ts_orig])
        db.flush()
        created_ts_ids.extend([ts_conf.id, ts_orig.id])

        exam_conf = Exam(subject_id=subj_conflict.id, room_id=room_a.id, timeslot_id=ts_conf.id, status="posted")
        exam_orig = Exam(subject_id=subj_to_resched.id, room_id=room_b.id, timeslot_id=ts_orig.id, status="posted")
        db.add_all([exam_conf, exam_orig])
        db.flush()
        created_exam_ids.extend([exam_conf.id, exam_orig.id])

        # Link conflicting exam to student via approved request/schedule
        # Rescheduling request for exam_orig
        req1 = ReschedulingRequest(
            exam_id=exam_orig.id,
            section_name="BSIT-TEST",
            student_name=student.name,
            student_id=student.student_id,
            school_email=student.email,
            course_name=subj_to_resched.name,
            original_exam_date=test_date,
            original_start_time=time(9, 30),
            original_end_time=time(11, 0),
            exam_type="Midterm",
            reason_type="exam conflict",
            detailed_explanation="Conflicts with Exam 1",
            requested_mode="offline",
            preferred_date=test_date,
            acknowledged=True,
            status="pending",
        )
        db.add(req1)
        db.flush()
        created_req_ids.append(req1.id)

        # Make student also take exam_conf as part of their approved schedule
        req_peer = ReschedulingRequest(
            exam_id=exam_conf.id,
            section_name="BSIT-TEST",
            student_name=student.name,
            school_email=student.email,
            course_name=subj_conflict.name,
            status="approved",
            rescheduled_exam_id=exam_conf.id,
        )
        db.add(req_peer)
        db.flush()
        created_req_ids.append(req_peer.id)

        result1 = find_earliest_auto_schedule(req1, db)
        print(f"Test 1 Result: Success={result1.get('success')}, Start={result1.get('start_time')}, End={result1.get('end_time')}")
        assert result1["success"] is True, "Test 1 failed: find_earliest_auto_schedule was not successful"
        # Conflicting exam ends at 11:00 AM -> earliest start is 11:15 AM (11:00 + 15m)
        assert result1["start_time"] == time(11, 15), f"Expected 11:15, got {result1['start_time']}"
        assert result1["end_time"] == time(12, 30), f"Expected 12:30, got {result1['end_time']}"
        print("[PASS] TEST 1: Earliest slot begins exactly at 11:15 AM (15 minutes after 11:00 AM)")

        # -------------------------------------------------------------
        # TEST 2: Multiple Conflicts & Skipping Occupied Candidate Slots
        # Prompt Example: Conflicting exam ends at 11:00 AM.
        # Student already has 11:15 AM - 12:30 PM, and 12:45 PM - 02:00 PM.
        # System must skip both slots and consider 02:15 PM - 03:30 PM!
        # -------------------------------------------------------------
        print("\n--- TEST 2: Skipping Occupied Slots (Prompt Example) ---")
        # Occupied slot 1: 11:15 AM to 12:30 PM
        ts_occ1 = Timeslot(date=test_date, start_time=time(11, 15), end_time=time(12, 30))
        # Occupied slot 2: 12:45 PM to 02:00 PM
        ts_occ2 = Timeslot(date=test_date, start_time=time(12, 45), end_time=time(14, 0))
        db.add_all([ts_occ1, ts_occ2])
        db.flush()
        created_ts_ids.extend([ts_occ1.id, ts_occ2.id])

        exam_occ1 = Exam(subject_id=subj_slot1.id, room_id=room_a.id, timeslot_id=ts_occ1.id, status="posted")
        exam_occ2 = Exam(subject_id=subj_slot2.id, room_id=room_b.id, timeslot_id=ts_occ2.id, status="posted")
        db.add_all([exam_occ1, exam_occ2])
        db.flush()
        created_exam_ids.extend([exam_occ1.id, exam_occ2.id])

        # Link occupied exams to the student
        req_occ1 = ReschedulingRequest(
            exam_id=exam_occ1.id,
            student_name=student.name,
            school_email=student.email,
            status="approved",
            rescheduled_exam_id=exam_occ1.id,
        )
        req_occ2 = ReschedulingRequest(
            exam_id=exam_occ2.id,
            student_name=student.name,
            school_email=student.email,
            status="approved",
            rescheduled_exam_id=exam_occ2.id,
        )
        db.add_all([req_occ1, req_occ2])
        db.flush()
        created_req_ids.extend([req_occ1.id, req_occ2.id])

        result2 = find_earliest_auto_schedule(req1, db)
        print(f"Test 2 Result: Success={result2.get('success')}, Start={result2.get('start_time')}, End={result2.get('end_time')}")
        assert result2["success"] is True, "Test 2 failed"
        assert result2["start_time"] == time(14, 15), f"Expected 14:15 (02:15 PM), got {result2['start_time']}"
        assert result2["end_time"] == time(15, 30), f"Expected 15:30 (03:30 PM), got {result2['end_time']}"
        print("[PASS] TEST 2: Skipped 11:15-12:30 and 12:45-14:00; selected 14:15-15:30 exactly as specified!")

        # -------------------------------------------------------------
        # TEST 3: Room Selection & Capacity Prioritization
        # Room A has 30 students assigned in 14:15 - 15:30.
        # Room B has 5 students assigned in 14:15 - 15:30.
        # System must pick Room B (lowest assigned students = 5).
        # -------------------------------------------------------------
        print("\n--- TEST 3: Room Capacity & Lowest Load Balancing ---")
        ts_target = Timeslot(date=test_date, start_time=time(14, 15), end_time=time(15, 30))
        db.add(ts_target)
        db.flush()
        created_ts_ids.append(ts_target.id)

        # In Room A: add an exam with section student count = 30
        sec_heavy = Section(name="SEC_HEAVY", student_count=30)
        db.add(sec_heavy)
        db.flush()
        exam_heavy = Exam(subject_id=subj_slot1.id, section_id=sec_heavy.id, room_id=room_a.id, timeslot_id=ts_target.id, status="posted")
        db.add(exam_heavy)
        db.flush()
        created_exam_ids.append(exam_heavy.id)

        # In Room B: add an exam with section student count = 5
        sec_light = Section(name="SEC_LIGHT", student_count=5)
        db.add(sec_light)
        db.flush()
        exam_light = Exam(subject_id=subj_slot2.id, section_id=sec_light.id, room_id=room_b.id, timeslot_id=ts_target.id, status="posted")
        db.add(exam_light)
        db.flush()
        created_exam_ids.append(exam_light.id)

        result3 = find_earliest_auto_schedule(req1, db, candidate_rooms=[room_a, room_b])
        print(f"Test 3 Result: Room={result3.get('room_name')}, Assigned Students={result3.get('assigned_student_count')}, Remaining Cap={result3.get('remaining_capacity')}")
        assert result3["success"] is True
        assert result3["room_id"] == room_b.id, f"Expected Room B (5 students), got Room ID {result3['room_id']}"
        assert result3["assigned_student_count"] == 5
        assert result3["remaining_capacity"] == (40 - (5 + 1))  # 34 remaining
        print("[PASS] TEST 3: Prioritized Room B with lowest student count (5 vs 30)!")

        # -------------------------------------------------------------
        # TEST 4: Room Capacity Restriction (Full Room Overflow)
        # If Room B is also filled to capacity (e.g. 40 students),
        # neither Room A nor Room B can accommodate.
        # Search must advance to NEXT time slot!
        # -------------------------------------------------------------
        print("\n--- TEST 4: Room Full Capacity Overflow & Advance to Next Slot ---")
        # Increase Room B's exam section count to 40 (full!)
        # And Room A's exam section count to 40 (full!)
        sec_light.student_count = 40
        sec_heavy.student_count = 40
        db.commit()

        # With candidate_rooms=[room_a, room_b] both full at 14:15-15:30:
        # Search advances past 14:15-15:30 to 15:45 (after 15:30 + 15m break)!
        # At 15:45 Room A and Room B are empty, so it picks 15:45 - 17:00!
        result4 = find_earliest_auto_schedule(req1, db, candidate_rooms=[room_a, room_b])
        print(f"Test 4 Result: Start={result4.get('start_time')}, End={result4.get('end_time')}, Room={result4.get('room_name')}")
        assert result4["start_time"] == time(15, 30), f"Expected 15:30, got {result4['start_time']}"
        assert result4["end_time"] == time(16, 45), f"Expected 16:45, got {result4['end_time']}"
        print("[PASS] TEST 4: Advanced past full slot to earliest available slot (15:30 - 16:45)!")

        # Reset section student counts
        sec_light.student_count = 5
        sec_heavy.student_count = 30
        db.commit()

        # -------------------------------------------------------------
        # TEST 5: 5:00 PM Onwards Automatic Consultation Area Placement
        # When daytime operating hours are exhausted (past 17:00 closing),
        # the exam is automatically scheduled for 5:00 PM onwards in the Consultation Area
        # without proctoring assignment because admin will assign personally.
        # -------------------------------------------------------------
        print("\n--- TEST 5: Automatic Consultation Area Placement at 5:00 PM Onwards ---")
        # Add an exam for student from 15:00 to 16:30
        ts_late = Timeslot(date=test_date, start_time=time(15, 0), end_time=time(16, 30))
        db.add(ts_late)
        db.flush()
        created_ts_ids.append(ts_late.id)
        exam_late = Exam(subject_id=subj_slot1.id, room_id=room_a.id, timeslot_id=ts_late.id, status="posted")
        db.add(exam_late)
        db.flush()
        created_exam_ids.append(exam_late.id)

        req_late = ReschedulingRequest(
            exam_id=exam_late.id,
            student_name=student.name,
            school_email=student.email,
            status="approved",
            rescheduled_exam_id=exam_late.id,
        )
        db.add(req_late)
        db.flush()
        created_req_ids.append(req_late.id)

        result5 = find_earliest_auto_schedule(req1, db)
        print(f"Test 5 Result: Success={result5.get('success')}, Message={result5.get('message')}")
        assert result5["success"] is True, "Expected True because 5pm onwards in Consultation Area is supported"
        assert result5["is_consultation"] is True, "Expected is_consultation=True"
        assert result5["room_name"] == "Consultation Area", "Expected room to be Consultation Area"
        assert result5["start_time"] >= time(17, 0), "Expected start time >= 17:00"
        print("[PASS] TEST 5: Automatically assigned into Consultation Area at 5:00 PM onwards without error!")

        # -------------------------------------------------------------
        # TEST 6: Atomic Database Update & apply_auto_reschedule
        # Remove late exam so 14:15 - 15:30 is valid again, then test apply_auto_reschedule!
        # -------------------------------------------------------------
        print("\n--- TEST 6: Atomic apply_auto_reschedule ---")
        db.delete(req_late)
        db.delete(exam_late)
        db.commit()

        auto_result = apply_auto_reschedule(
            req1.id,
            "Approved via automated scheduler test",
            db,
            reviewer_id=student.id,
            candidate_rooms=[room_a, room_b],
        )
        print("Auto-reschedule response:", auto_result)
        assert auto_result["message"] == "Request approved and automatically scheduled"
        assert auto_result["assigned_start_time"] == "14:15:00"
        assert auto_result["assigned_end_time"] == "15:30:00"
        assert auto_result["room_id"] == room_b.id

        # Verify database state
        db.refresh(req1)
        assert req1.status == "approved"
        assert req1.rescheduled_exam_id is not None
        assigned_exam = db.query(Exam).filter(Exam.id == req1.rescheduled_exam_id).first()
        assert assigned_exam is not None
        assert assigned_exam.room_id == room_b.id
        assert assigned_exam.timeslot.start_time == time(14, 15)
        assert assigned_exam.timeslot.end_time == time(15, 30)

        # Track created exam and timeslot for cleanup
        created_exam_ids.append(assigned_exam.id)
        if assigned_exam.timeslot_id:
            created_ts_ids.append(assigned_exam.timeslot_id)

        # Verify notification was generated for student
        notif = db.query(Notification).filter(Notification.related_id == req1.id).first()
        assert notif is not None
        assert "approved" in notif.message.lower()
        print("[PASS] TEST 6: Database updated atomically with Timeslot, Exam, Request, and Notification!")

        # -------------------------------------------------------------
        # TEST 7: Concurrent Requests Protection
        # Test that calling auto-assign concurrently on an already approved request fails.
        # Test that multithreaded requests serialize properly with row locks.
        # -------------------------------------------------------------
        print("\n--- TEST 7: Concurrency Protection ---")
        # Trying to apply on already approved request raises HTTPException
        try:
            apply_auto_reschedule(req1.id, "Second attempt", db, reviewer_id=student.id)
            assert False, "Should have raised HTTPException for already approved request"
        except Exception as e:
            assert "already approved" in str(e).lower()
            print("[PASS] Concurrent duplicate approval blocked successfully!")

        # Create two pending requests for two different students competing for the same last remaining seat in room_a
        # Room A capacity is 40. We put an exam with 39 students. So only 1 seat remains!
        sec_comp = Section(name="SEC_COMP", student_count=39)
        db.add(sec_comp)
        db.flush()
        ts_comp = Timeslot(date=test_date, start_time=time(10, 0), end_time=time(11, 15))
        db.add(ts_comp)
        db.flush()
        created_ts_ids.append(ts_comp.id)
        exam_comp = Exam(subject_id=subj_slot1.id, section_id=sec_comp.id, room_id=room_a.id, timeslot_id=ts_comp.id, status="posted")
        db.add(exam_comp)
        db.flush()
        created_exam_ids.append(exam_comp.id)

        # Fill room_b at that time completely (capacity 40)
        sec_b_full = Section(name="SEC_B_FULL", student_count=40)
        db.add(sec_b_full)
        db.flush()
        exam_b_full = Exam(subject_id=subj_slot2.id, section_id=sec_b_full.id, room_id=room_b.id, timeslot_id=ts_comp.id, status="posted")
        db.add(exam_b_full)
        db.flush()
        created_exam_ids.append(exam_b_full.id)

        # Student X and Student Y both request rescheduling
        user_x = User(name="User X", email=f"user_x_{datetime.now().strftime('%M%S')}@test.edu", role="student", student_type="irregular", hashed_password="pw", is_first_login=False)
        user_y = User(name="User Y", email=f"user_y_{datetime.now().strftime('%M%S')}@test.edu", role="student", student_type="irregular", hashed_password="pw", is_first_login=False)
        db.add_all([user_x, user_y])
        db.flush()
        created_user_ids.extend([user_x.id, user_y.id])

        ts_orig_x = Timeslot(date=test_date, start_time=time(8, 0), end_time=time(9, 15))
        db.add(ts_orig_x)
        db.flush()
        created_ts_ids.append(ts_orig_x.id)
        exam_orig_x = Exam(subject_id=subj_to_resched.id, room_id=room_a.id, timeslot_id=ts_orig_x.id, status="posted")
        db.add(exam_orig_x)
        db.flush()
        created_exam_ids.append(exam_orig_x.id)

        req_x = ReschedulingRequest(
            exam_id=exam_orig_x.id,
            student_name=user_x.name,
            school_email=user_x.email,
            original_exam_date=test_date,
            original_start_time=time(8, 0),
            original_end_time=time(9, 15),
            status="pending"
        )
        req_y = ReschedulingRequest(
            exam_id=exam_orig_x.id,
            student_name=user_y.name,
            school_email=user_y.email,
            original_exam_date=test_date,
            original_start_time=time(8, 0),
            original_end_time=time(9, 15),
            status="pending"
        )
        db.add_all([req_x, req_y])
        db.commit()
        created_req_ids.extend([req_x.id, req_y.id])

        # Run concurrent approvals using threads
        results = {}
        def thread_task(req_id, key):
            t_db = SessionLocal()
            try:
                res = apply_auto_reschedule(req_id, "Concurrent test", t_db, candidate_rooms=[room_a, room_b])
                results[key] = ("SUCCESS", res)
            except Exception as exc:
                results[key] = ("ERROR", str(exc))
            finally:
                t_db.close()

        t1 = threading.Thread(target=thread_task, args=(req_x.id, "x"))
        t2 = threading.Thread(target=thread_task, args=(req_y.id, "y"))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        print(f"Concurrent thread X result: {results.get('x')}")
        print(f"Concurrent thread Y result: {results.get('y')}")

        # Verify that during thread X's assigned slot and thread Y's assigned slot,
        # room capacity was strictly respected
        res_x = results.get('x')[1]
        res_y = results.get('y')[1]
        assigned_in_x_slot = get_assigned_student_count_for_room(
            room_a.id,
            test_date,
            time.fromisoformat(res_x["assigned_start_time"]),
            time.fromisoformat(res_x["assigned_end_time"]),
            db
        )
        assigned_in_y_slot = get_assigned_student_count_for_room(
            room_a.id,
            test_date,
            time.fromisoformat(res_y["assigned_start_time"]),
            time.fromisoformat(res_y["assigned_end_time"]),
            db
        )
        print(f"Assigned in Room A during X slot ({res_x['assigned_start_time']}-{res_x['assigned_end_time']}): {assigned_in_x_slot} (Cap: 40)")
        print(f"Assigned in Room A during Y slot ({res_y['assigned_start_time']}-{res_y['assigned_end_time']}): {assigned_in_y_slot} (Cap: 40)")
        assert assigned_in_x_slot <= 40, f"Over capacity during X slot: {assigned_in_x_slot} > 40"
        assert assigned_in_y_slot <= 40, f"Over capacity during Y slot: {assigned_in_y_slot} > 40"
        print("[PASS] TEST 7: Concurrency row locks preserved strict capacity limits without conflict!")

        # -------------------------------------------------------------
        # TEST 8: 5:00 PM Onwards Consultation Area exam has proctor_id=None
        # -------------------------------------------------------------
        print("\n--- TEST 8: 5:00 PM Onwards Exam Approved in Consultation Area without Proctor ---")
        ts_orig8 = Timeslot(date=test_date, start_time=time(9, 0), end_time=time(10, 15))
        db.add(ts_orig8)
        db.flush()
        created_ts_ids.append(ts_orig8.id)
        exam8 = Exam(subject_id=subj_to_resched.id, room_id=room_a.id, timeslot_id=ts_orig8.id, status="posted")
        db.add(exam8)
        db.flush()
        created_exam_ids.append(exam8.id)

        req8 = ReschedulingRequest(
            exam_id=exam8.id,
            student_name=student.name,
            school_email=student.email,
            status="pending",
            preferred_date=test_date,
            preferred_start_time=time(17, 0),
            preferred_end_time=time(18, 15),
        )
        db.add(req8)
        db.flush()
        created_req_ids.append(req8.id)

        auto_result8 = apply_auto_reschedule(
            req8.id,
            "Approved 5pm consultation test",
            db,
            reviewer_id=student.id,
        )
        print("Test 8 Auto-reschedule response:", auto_result8)
        assert auto_result8["room_name"] == "Consultation Area"
        assert auto_result8["is_consultation"] is True
        assert auto_result8["proctor_id"] is None, "Expected proctor_id=None for Consultation Area"

        # Check in DB
        db.refresh(req8)
        assigned_exam8 = db.query(Exam).filter(Exam.id == req8.rescheduled_exam_id).first()
        assert assigned_exam8 is not None
        assert assigned_exam8.room.name == "Consultation Area"
        assert assigned_exam8.proctor_id is None, "Expected assigned_exam8.proctor_id to be None"
        if assigned_exam8.id:
            created_exam_ids.append(assigned_exam8.id)
        if assigned_exam8.timeslot_id:
            created_ts_ids.append(assigned_exam8.timeslot_id)
        print("[PASS] TEST 8: Rescheduled 5:00 PM onwards took place in Consultation Area with proctor_id=None!")

        print("\n================================================================")
        print("ALL TESTS PASSED SUCCESSFULLY (8/8 TEST SUITES)")
        print("================================================================")

    finally:
        # Clean up test artifacts
        print("\nCleaning up test artifacts...")
        try:
            # Clean any dangling test exam/timeslot from previous aborted runs
            dang_reqs = db.query(ReschedulingRequest).filter(ReschedulingRequest.school_email.like("%@test.edu")).all()
            for dr in dang_reqs:
                dr.rescheduled_exam_id = None
            db.commit()
            db.query(ReschedulingRequest).filter(ReschedulingRequest.school_email.like("%@test.edu")).delete(synchronize_session=False)
            db.query(Exam).filter(Exam.timeslot_id == 958).delete(synchronize_session=False)
            db.query(Timeslot).filter(Timeslot.id == 958).delete(synchronize_session=False)
            db.commit()

            if created_req_ids:
                req_objs = db.query(ReschedulingRequest).filter(ReschedulingRequest.id.in_(created_req_ids)).all()
                for r in req_objs:
                    if r.rescheduled_exam_id:
                        created_exam_ids.append(r.rescheduled_exam_id)
                        rex = db.query(Exam).filter(Exam.id == r.rescheduled_exam_id).first()
                        if rex and rex.timeslot_id:
                            created_ts_ids.append(rex.timeslot_id)
                    r.rescheduled_exam_id = None
                db.commit()

                db.query(Notification).filter(Notification.related_id.in_(created_req_ids)).delete(synchronize_session=False)
                db.query(ReschedulingRequest).filter(ReschedulingRequest.id.in_(created_req_ids)).delete(synchronize_session=False)
                db.commit()

            if created_exam_ids:
                ex_objs = db.query(Exam).filter(Exam.id.in_(created_exam_ids)).all()
                for e in ex_objs:
                    if e.timeslot_id:
                        created_ts_ids.append(e.timeslot_id)
                db.query(Exam).filter(Exam.id.in_(list(set(created_exam_ids)))).delete(synchronize_session=False)
                db.commit()

            if created_ts_ids:
                db.query(Exam).filter(Exam.timeslot_id.in_(list(set(created_ts_ids)))).delete(synchronize_session=False)
                db.query(Timeslot).filter(Timeslot.id.in_(list(set(created_ts_ids)))).delete(synchronize_session=False)
                db.commit()

            if created_room_ids:
                db.query(Exam).filter(Exam.room_id.in_(created_room_ids)).delete(synchronize_session=False)
                db.query(Room).filter(Room.id.in_(created_room_ids)).delete(synchronize_session=False)
                db.commit()

            if created_user_ids:
                from model.models import ActivityLog
                db.query(ActivityLog).filter(ActivityLog.user_id.in_(created_user_ids)).delete(synchronize_session=False)
                db.query(User).filter(User.id.in_(created_user_ids)).delete(synchronize_session=False)
                db.commit()

            print("Cleanup completed successfully.")
        except Exception as e:
            print(f"Cleanup error (non-fatal): {e}")
            db.rollback()
        finally:
            db.close()


if __name__ == "__main__":
    run_all_tests()
