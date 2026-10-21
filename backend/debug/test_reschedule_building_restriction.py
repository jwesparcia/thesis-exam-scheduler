import os
import sys
from datetime import date, time, datetime

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from fastapi import HTTPException
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
)
from schema import ReschedulingRequestUpdate
from services.auto_rescheduler import (
    find_earliest_auto_schedule,
    apply_auto_reschedule,
    get_reschedule_student_category,
    is_room_allowed_for_category,
)
from routers.rescheduling import (
    get_available_rooms_for_request,
    review_request,
)


def run_building_restriction_tests():
    db = SessionLocal()
    print("================================================================")
    print("TESTING RESCHEDULING BUILDING RESTRICTIONS (BUILDING B VS C)")
    print("================================================================")

    created_req_ids = []
    created_exam_ids = []
    created_user_ids = []
    created_room_ids = []
    created_ts_ids = []

    try:
        # Retrieve College and SHS courses
        college_course = db.query(Course).filter(Course.category == "College").first()
        shs_course = db.query(Course).filter(Course.category == "SHS").first()
        assert college_course is not None, "College course not found"
        assert shs_course is not None, "SHS course not found"
        print(f"Using College Course: {college_course.name} ({college_course.category})")
        print(f"Using SHS Course: {shs_course.name} ({shs_course.category})")

        # -----------------------------------------------------------------
        # TEST 1: is_room_allowed_for_category Unit Verification
        # -----------------------------------------------------------------
        print("\n--- TEST 1: is_room_allowed_for_category logic ---")
        b_room = Room(name="B401", building="B", department="College")
        c_room = Room(name="C201", building="C", department="SHS")
        consult_room = Room(name="Consultation Area", building="Consultation Area")

        assert is_room_allowed_for_category(b_room, "College") is True
        assert is_room_allowed_for_category(b_room, "SHS") is False
        assert is_room_allowed_for_category(c_room, "College") is False
        assert is_room_allowed_for_category(c_room, "SHS") is True
        assert is_room_allowed_for_category(consult_room, "College") is False
        assert is_room_allowed_for_category(consult_room, "SHS") is False
        print("[PASS] TEST 1: Room category filtering unit checks passed 100%!")

        # -----------------------------------------------------------------
        # Set up test entities
        # -----------------------------------------------------------------
        test_date = date(2026, 11, 15)

        # Create College Student
        college_student = User(
            name="Test College Student",
            email=f"college_student_{datetime.now().strftime('%H%M%S')}@test.edu",
            hashed_password="pw",
            role="student",
            student_type="irregular",
            course_id=college_course.id,
            student_id="COL-001",
            is_first_login=False,
        )
        # Create SHS Student
        shs_student = User(
            name="Test SHS Student",
            email=f"shs_student_{datetime.now().strftime('%H%M%S')}@test.edu",
            hashed_password="pw",
            role="student",
            student_type="irregular",
            course_id=shs_course.id,
            student_id="SHS-001",
            is_first_login=False,
        )
        # Admin user
        admin_user = db.query(User).filter(User.role.in_(["admin", "program_head"])).first()
        if not admin_user:
            admin_user = User(
                name="Test Admin",
                email="admin_test@test.edu",
                hashed_password="pw",
                role="admin",
            )
            db.add(admin_user)
            db.flush()
            created_user_ids.append(admin_user.id)

        db.add_all([college_student, shs_student])
        db.flush()
        created_user_ids.extend([college_student.id, shs_student.id])

        # Create subjects and sections
        sec_col = Section(name="BSIT-3A", course_id=college_course.id, student_count=30)
        sec_shs = Section(name="STEM-11A", course_id=shs_course.id, student_count=30)
        subj_col = Subject(code="IT301", name="Advanced Database", course_id=college_course.id, duration_minutes=75, category="major")
        subj_shs = Subject(code="STEM101", name="Pre-Calculus", course_id=shs_course.id, duration_minutes=75, category="major")
        db.add_all([sec_col, sec_shs, subj_col, subj_shs])
        db.flush()

        # Retrieve a Building B room and a Building C room from DB
        room_b = db.query(Room).filter(Room.name.startswith("B")).first()
        room_c = db.query(Room).filter(Room.name.startswith("C")).first()
        assert room_b is not None, "No Building B room in DB"
        assert room_c is not None, "No Building C room in DB"
        print(f"Using Building B Room: {room_b.name} (id={room_b.id})")
        print(f"Using Building C Room: {room_c.name} (id={room_c.id})")

        # -----------------------------------------------------------------
        # TEST 2: College Student Auto-Reschedule Exclusively Selects Building B
        # Even if Building C has 0 students and Building B has students!
        # -----------------------------------------------------------------
        print("\n--- TEST 2: College Student Auto-Rescheduling exclusively selects Building B ---")
        ts_orig_col = Timeslot(date=test_date, start_time=time(8, 0), end_time=time(9, 15))
        db.add(ts_orig_col)
        db.flush()
        created_ts_ids.append(ts_orig_col.id)

        exam_col = Exam(
            subject_id=subj_col.id,
            section_id=sec_col.id,
            room_id=room_b.id,
            timeslot_id=ts_orig_col.id,
            course_id=college_course.id,
            status="posted"
        )
        db.add(exam_col)
        db.flush()
        created_exam_ids.append(exam_col.id)

        req_col = ReschedulingRequest(
            exam_id=exam_col.id,
            section_name="BSIT-3A",
            student_name=college_student.name,
            student_id=college_student.student_id,
            school_email=college_student.email,
            program=college_course.name,
            course_name=subj_col.name,
            original_exam_date=test_date,
            original_start_time=time(8, 0),
            original_end_time=time(9, 15),
            exam_type="Midterm",
            reason_type="exam conflict",
            detailed_explanation="Conflict test",
            status="pending"
        )
        db.add(req_col)
        db.flush()
        created_req_ids.append(req_col.id)

        # Candidate rooms provided: room_b (Building B) and room_c (Building C)
        result_col = find_earliest_auto_schedule(req_col, db, candidate_rooms=[room_b, room_c])
        print(f"College Auto-Reschedule Result: Success={result_col.get('success')}, Room={result_col.get('room_name')}")
        assert result_col["success"] is True
        assert result_col["room_name"].startswith("B"), f"Expected Building B room, got {result_col['room_name']}"
        assert result_col["room_id"] == room_b.id
        print("[PASS] TEST 2: College student strictly assigned to Building B room (B___)!")

        # -----------------------------------------------------------------
        # TEST 3: SHS Student Auto-Reschedule Exclusively Selects Building C
        # -----------------------------------------------------------------
        print("\n--- TEST 3: SHS Student Auto-Rescheduling exclusively selects Building C ---")
        ts_orig_shs = Timeslot(date=test_date, start_time=time(8, 0), end_time=time(9, 15))
        db.add(ts_orig_shs)
        db.flush()
        created_ts_ids.append(ts_orig_shs.id)

        exam_shs = Exam(
            subject_id=subj_shs.id,
            section_id=sec_shs.id,
            room_id=room_c.id,
            timeslot_id=ts_orig_shs.id,
            course_id=shs_course.id,
            status="posted"
        )
        db.add(exam_shs)
        db.flush()
        created_exam_ids.append(exam_shs.id)

        req_shs = ReschedulingRequest(
            exam_id=exam_shs.id,
            section_name="STEM-11A",
            student_name=shs_student.name,
            student_id=shs_student.student_id,
            school_email=shs_student.email,
            program=shs_course.name,
            course_name=subj_shs.name,
            original_exam_date=test_date,
            original_start_time=time(8, 0),
            original_end_time=time(9, 15),
            exam_type="Midterm",
            reason_type="exam conflict",
            detailed_explanation="Conflict test SHS",
            status="pending"
        )
        db.add(req_shs)
        db.flush()
        created_req_ids.append(req_shs.id)

        # Candidate rooms provided: room_b (Building B) and room_c (Building C)
        result_shs = find_earliest_auto_schedule(req_shs, db, candidate_rooms=[room_b, room_c])
        print(f"SHS Auto-Reschedule Result: Success={result_shs.get('success')}, Room={result_shs.get('room_name')}")
        assert result_shs["success"] is True
        assert result_shs["room_name"].startswith("C"), f"Expected Building C room, got {result_shs['room_name']}"
        assert result_shs["room_id"] == room_c.id
        print("[PASS] TEST 3: SHS student strictly assigned to Building C room (C___)!")

        # -----------------------------------------------------------------
        # TEST 4: available-rooms API endpoint filters strictly by building
        # -----------------------------------------------------------------
        print("\n--- TEST 4: available-rooms endpoint filters by student category ---")
        # Set preferred timeslot for req_col
        req_col.preferred_date = test_date
        req_col.preferred_start_time = time(10, 0)
        req_col.preferred_end_time = time(11, 15)
        db.commit()

        rooms_for_col = get_available_rooms_for_request(req_col.id, db=db, current_user=admin_user)
        col_room_names = [r["name"] for r in rooms_for_col]
        print(f"Available rooms returned for College student: count={len(rooms_for_col)}")
        # Verify that EVERY returned room starts with B and none starts with C
        assert len(rooms_for_col) > 0, "Expected at least one available Building B room"
        for r in rooms_for_col:
            assert r["name"].startswith("B"), f"Forbidden room {r['name']} returned for College student!"
            assert not r["name"].startswith("C"), f"Building C room {r['name']} returned for College student!"
        print("[PASS] TEST 4A: get_available_rooms_for_request returned ONLY Building B rooms for College student!")

        # Set preferred timeslot for req_shs
        req_shs.preferred_date = test_date
        req_shs.preferred_start_time = time(10, 0)
        req_shs.preferred_end_time = time(11, 15)
        db.commit()

        rooms_for_shs = get_available_rooms_for_request(req_shs.id, db=db, current_user=admin_user)
        print(f"Available rooms returned for SHS student: count={len(rooms_for_shs)}")
        assert len(rooms_for_shs) > 0, "Expected at least one available Building C room"
        for r in rooms_for_shs:
            assert r["name"].startswith("C"), f"Forbidden room {r['name']} returned for SHS student!"
            assert not r["name"].startswith("B"), f"Building B room {r['name']} returned for SHS student!"
        print("[PASS] TEST 4B: get_available_rooms_for_request returned ONLY Building C rooms for SHS student!")

        # -----------------------------------------------------------------
        # TEST 5: Manual Approval Validation Rejects Wrong Building
        # -----------------------------------------------------------------
        print("\n--- TEST 5: Manual Review endpoint rejects cross-building assignment ---")
        # Admin attempts to assign Building C room to College student
        rejected_c_for_col = False
        try:
            review_request(
                request_id=req_col.id,
                update=ReschedulingRequestUpdate(status="approved", room_id=room_c.id),
                db=db,
                current_user=admin_user
            )
        except HTTPException as e:
            if e.status_code == 400 and "Building B" in e.detail:
                rejected_c_for_col = True
                print(f"[PASS] Correctly rejected Building C for College student: {e.detail}")

        assert rejected_c_for_col is True, "Expected HTTP 400 when assigning Building C room to College student"

        # Admin attempts to assign Building B room to SHS student
        rejected_b_for_shs = False
        try:
            review_request(
                request_id=req_shs.id,
                update=ReschedulingRequestUpdate(status="approved", room_id=room_b.id),
                db=db,
                current_user=admin_user
            )
        except HTTPException as e:
            if e.status_code == 400 and "Building C" in e.detail:
                rejected_b_for_shs = True
                print(f"[PASS] Correctly rejected Building B for SHS student: {e.detail}")

        assert rejected_b_for_shs is True, "Expected HTTP 400 when assigning Building B room to SHS student"

        # -----------------------------------------------------------------
        # TEST 6: Manual Approval Validation Accepts Correct Building
        # -----------------------------------------------------------------
        print("\n--- TEST 6: Manual Review accepts correct building assignment ---")
        # College student assigned to Building B room
        res_col_approve = review_request(
            request_id=req_col.id,
            update=ReschedulingRequestUpdate(status="approved", room_id=room_b.id),
            db=db,
            current_user=admin_user
        )
        assert res_col_approve["message"] == "Request approved"
        assert req_col.status == "approved"
        assert req_col.rescheduled_exam.room_id == room_b.id
        print(f"[PASS] Successfully approved College student into Room {room_b.name} (Building B)!")

        # SHS student assigned to Building C room
        res_shs_approve = review_request(
            request_id=req_shs.id,
            update=ReschedulingRequestUpdate(status="approved", room_id=room_c.id),
            db=db,
            current_user=admin_user
        )
        assert res_shs_approve["message"] == "Request approved"
        assert req_shs.status == "approved"
        assert req_shs.rescheduled_exam.room_id == room_c.id
        print(f"[PASS] Successfully approved SHS student into Room {room_c.name} (Building C)!")

        print("\n================================================================")
        print("ALL RESCHEDULING BUILDING RESTRICTION TESTS PASSED (6/6)!")
        print("================================================================")

    finally:
        print("\nCleaning up test artifacts...")
        db.rollback()
        # Clean up any created records
        if created_req_ids:
            db.query(ReschedulingRequest).filter(ReschedulingRequest.id.in_(created_req_ids)).delete(synchronize_session=False)
        if created_exam_ids:
            db.query(Exam).filter(Exam.id.in_(created_exam_ids)).delete(synchronize_session=False)
        if created_ts_ids:
            db.query(Timeslot).filter(Timeslot.id.in_(created_ts_ids)).delete(synchronize_session=False)
        if created_user_ids:
            db.query(User).filter(User.id.in_(created_user_ids)).delete(synchronize_session=False)
        db.commit()
        db.close()
        print("Cleanup complete.")


if __name__ == "__main__":
    run_building_restriction_tests()
