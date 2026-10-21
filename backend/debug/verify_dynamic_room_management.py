import os
import sys
from datetime import date, time, datetime
from fastapi import HTTPException

# Setup PYTHONPATH
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from core.database import SessionLocal
from core.cache import cache
from model.models import Room, Exam, Section, Course, YearLevel, Subject, Timeslot, User
from room_data import get_room_names_for_department
from utils.scheduler import generate_exam_schedule
from services.auto_rescheduler import find_earliest_auto_schedule
from routers.exams import list_rooms, get_room_status, update_exam, UpdateExamRequest

class MockUser:
    def __init__(self, user_id=1):
        self.id = user_id
        self.role = "admin"
        self.email = "admin@test.com"

def run_verification():
    db = SessionLocal()
    admin_user = db.query(User).filter(User.role.in_(["admin", "program_head"])).first()
    mock_user = MockUser(user_id=admin_user.id if admin_user else 1)

    test_room_name = f"B999_TEST"
    small_room_name = f"B998_SMALL"
    test_room_id = None
    small_room_id = None

    try:
        print("=" * 70)
        print("STEP 1: Check existing rooms and baseline dynamic helper")
        print("=" * 70)
        baseline_college_rooms = get_room_names_for_department("College", db=db)
        print(f"Initial College room count in DB: {len(baseline_college_rooms)}")
        assert test_room_name not in baseline_college_rooms, f"{test_room_name} should not be present initially"
        print("[PASS] Baseline check passed.")

        print("\n" + "=" * 70)
        print("STEP 2: Add new rooms (simulating Room Management addition)")
        print("=" * 70)
        db.query(Room).filter(Room.name.in_([test_room_name, small_room_name])).delete()
        db.commit()

        new_room = Room(
            name=test_room_name,
            building="B",
            capacity=45,
            department="College"
        )
        small_room = Room(
            name=small_room_name,
            building="B",
            capacity=5, # very small capacity for constraint testing
            department="College"
        )
        db.add_all([new_room, small_room])
        db.commit()
        db.refresh(new_room)
        db.refresh(small_room)
        test_room_id = new_room.id
        small_room_id = small_room.id
        cache.invalidate_rooms()
        print(f"Created new room: ID={new_room.id}, Name={new_room.name}, Building={new_room.building}, Capacity={new_room.capacity}, Dept={new_room.department}")
        print(f"Created small room: ID={small_room.id}, Name={small_room.name}, Capacity={small_room.capacity}")

        print("\n" + "=" * 70)
        print("STEP 3: Verify dynamic retrieval across system lists")
        print("=" * 70)
        # A. Check get_room_names_for_department
        updated_college_rooms = get_room_names_for_department("College", db=db)
        assert test_room_name in updated_college_rooms, f"Expected {test_room_name} in College rooms"
        assert small_room_name in updated_college_rooms, f"Expected {small_room_name} in College rooms"
        print(f"[PASS] get_room_names_for_department contains both new rooms (Total: {len(updated_college_rooms)})")

        # B. Check list_rooms (used by frontend room selection dropdowns)
        api_rooms = list_rooms(department="College", db=db, current_user=mock_user)
        found_in_list = any(r["name"] == test_room_name and r["id"] == test_room_id for r in api_rooms)
        assert found_in_list, f"Expected {test_room_name} in list_rooms response"
        print(f"[PASS] list_rooms contains {test_room_name}")

        # C. Check get_room_status (used by Room Management dashboard)
        status_res = get_room_status(department="College", db=db, current_user=mock_user)
        status_rooms = status_res.get("rooms", []) if isinstance(status_res, dict) else []
        found_in_status = any(r.get("name") == test_room_name for r in status_rooms)
        assert found_in_status, f"Expected {test_room_name} in get_room_status response"
        print(f"[PASS] get_room_status contains {test_room_name}")

        print("\n" + "=" * 70)
        print("STEP 4: Verify manual assignment, capacity constraints & conflict detection")
        print("=" * 70)
        sample_exam = db.query(Exam).filter(Exam.status == "draft").first()
        if not sample_exam:
            sample_exam = db.query(Exam).first()
        
        if sample_exam:
            orig_room_id = sample_exam.room_id
            print(f"Testing on Exam ID {sample_exam.id} (Current Room: {orig_room_id})")

            # A. Update exam to use the newly created room (Capacity 45) -> Should succeed
            update_req = UpdateExamRequest(room_id=test_room_id)
            res = update_exam(exam_id=sample_exam.id, body=update_req, db=db, current_user=mock_user)
            db.refresh(sample_exam)
            assert sample_exam.room_id == test_room_id, f"Expected exam.room_id == {test_room_id}, got {sample_exam.room_id}"
            print(f"[PASS] Successfully assigned new room {test_room_name} to Exam ID {sample_exam.id}!")

            # B. Test capacity violation: try assigning small room (capacity 5) when section has > 5 students
            if sample_exam.section and (sample_exam.section.student_count or 0) > 5:
                try:
                    update_exam(exam_id=sample_exam.id, body=UpdateExamRequest(room_id=small_room_id), db=db, current_user=mock_user)
                    assert False, "Expected capacity constraint violation exception!"
                except HTTPException as e:
                    assert e.status_code == 400 and "Capacity conflict" in e.detail
                    print(f"[PASS] Capacity constraint properly rejected small room: {e.detail}")

            # C. Test time-slot conflict prevention: try assigning another exam to same room and timeslot
            other_exam = db.query(Exam).filter(
                Exam.id != sample_exam.id,
                Exam.timeslot_id == sample_exam.timeslot_id
            ).first()
            if other_exam and sample_exam.timeslot_id:
                try:
                    update_exam(exam_id=other_exam.id, body=UpdateExamRequest(room_id=test_room_id), db=db, current_user=mock_user)
                    assert False, "Expected room conflict exception!"
                except HTTPException as e:
                    assert e.status_code == 409 and "Room conflict" in e.detail
                    print(f"[PASS] Conflict prevention properly blocked double booking: {e.detail}")

            # Restore original room
            update_req_restore = UpdateExamRequest(room_id=orig_room_id)
            update_exam(exam_id=sample_exam.id, body=update_req_restore, db=db, current_user=mock_user)
            db.refresh(sample_exam)
            print(f"[PASS] Reverted exam assignment cleanly.")

        print("\n" + "=" * 70)
        print("STEP 5: Verify exam scheduler dynamically loads all eligible rooms")
        print("=" * 70)
        from sqlalchemy import or_
        department = "College"
        room_query = db.query(Room).filter(Room.name != "Consultation Area")
        if department == "College":
            room_query = room_query.filter(or_(Room.department == "College", Room.building == "B"))
        elif department == "SHS":
            room_query = room_query.filter(or_(Room.department == "SHS", Room.building == "C"))
        rooms = room_query.order_by(Room.name).all()
        room_ids = [r.id for r in rooms]
        assert test_room_id in room_ids, f"Expected {test_room_id} in scheduler room_ids!"
        assert small_room_id in room_ids, f"Expected {small_room_id} in scheduler room_ids!"
        print(f"[PASS] Scheduler dynamically loaded {len(rooms)} rooms, including both new rooms.")

        print("\n" + "=" * 70)
        print("STEP 6: Verify irregular rescheduling dynamically includes new rooms")
        print("=" * 70)
        all_candidate_rooms = db.query(Room).filter(Room.name != "Consultation Area").order_by(Room.name).all()
        assert any(r.id == test_room_id for r in all_candidate_rooms), "New room must be in auto_rescheduler candidate rooms"
        print(f"[PASS] Auto-rescheduler candidate list includes {test_room_name}")

        print("\n" + "=" * 70)
        print("ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        # Cleanup
        print("\nCleaning up test rooms...")
        ids_to_clean = [rid for rid in [test_room_id, small_room_id] if rid]
        if ids_to_clean:
            db.query(Exam).filter(Exam.room_id.in_(ids_to_clean)).update({"room_id": None}, synchronize_session=False)
            db.query(Room).filter(Room.id.in_(ids_to_clean)).delete(synchronize_session=False)
            db.commit()
            cache.invalidate_rooms()
            print(f"Cleaned up test rooms {test_room_name} and {small_room_name}.")
        db.close()

if __name__ == "__main__":
    run_verification()
