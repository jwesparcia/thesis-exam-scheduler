import os
import sys

# Ensure backend directory is in path
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from core import SessionLocal
from model.models import (
    Department, Course, Subject, SubjectProgram, User,
    Exam, ReschedulingRequest
)
from routers.auth import hash_password, verify_password

def run_tests():
    print("=" * 60)
    print("RUNNING COMPREHENSIVE DEPARTMENT SYSTEM TESTS")
    print("=" * 60)
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

    try:
        # TEST 1: Available departments loaded from PostgreSQL
        print("\n--- Test 1: PostgreSQL Departments Table & Dynamic Loading ---")
        depts = db.query(Department).order_by(Department.id).all()
        assert_true(len(depts) >= 7, f"Found {len(depts)} departments in database (expected >= 7)")
        
        dept_codes = {d.code: d for d in depts}
        expected_codes = ["GE", "ICT", "BM", "THM", "AS", "CRIM", "SHS"]
        for code in expected_codes:
            assert_true(code in dept_codes, f"Department code '{code}' exists in database")

        ge_dept = dept_codes.get("GE")
        assert_true(ge_dept and ge_dept.is_super == True, "GE department has is_super=True")
        assert_true(ge_dept and ge_dept.is_general_education == True, "GE department has is_general_education=True")

        ict_dept = dept_codes.get("ICT")
        assert_true(ict_dept and ict_dept.is_super == False, "ICT department has is_super=False")

        # TEST 2: Course to department assignments
        print("\n--- Test 2: Course Department Assignment ---")
        courses = db.query(Course).all()
        unassigned_courses = [c for c in courses if not c.department_code]
        assert_true(len(unassigned_courses) == 0, f"All {len(courses)} courses have department_code assigned")

        bsit = db.query(Course).filter(Course.name == "BSIT").first()
        assert_true(bsit and bsit.department_code == "ICT", f"BSIT assigned to ICT department: {bsit.department_code if bsit else None}")

        bsa = db.query(Course).filter(Course.name == "BSA").first()
        assert_true(bsa and bsa.department_code == "BM", f"BSA assigned to BM department: {bsa.department_code if bsa else None}")

        # TEST 3: Dedicated administrator accounts per department
        print("\n--- Test 3: Dedicated Administrator Accounts ---")
        admin_emails = {
            "GE": "ge.admin@school.edu",
            "ICT": "ict.admin@school.edu",
            "BM": "bm.admin@school.edu",
            "THM": "thm.admin@school.edu",
            "AS": "as.admin@school.edu",
            "CRIM": "crim.admin@school.edu",
            "SHS": "shs.admin@school.edu",
        }
        for code, email in admin_emails.items():
            user = db.query(User).filter(User.email == email).first()
            assert_true(user is not None, f"Admin account for {code} ({email}) exists")
            if user:
                assert_true(user.department_code == code, f"Account {email} assigned to department {code}")
                assert_true(user.role == "program_head", f"Account {email} has role 'program_head'")
                assert_true(verify_password("admin123", user.hashed_password), f"Account {email} password verification succeeds")
                if code == "GE":
                    assert_true(user.is_super_admin == True, "GE Admin has is_super_admin=True (Super Admin)")
                else:
                    assert_true(user.is_super_admin == False, f"{code} Admin has is_super_admin=False")

        # TEST 4: Configurable Subject Department & Multi-program support
        print("\n--- Test 4: Configurable Subject Department & Multi-Program Assignment ---")
        test_subj_code = "TEST-GE101"
        # Cleanup previous test subject if exists
        old_test_sub = db.query(Subject).filter(Subject.code == test_subj_code).first()
        if old_test_sub:
            db.query(SubjectProgram).filter(SubjectProgram.subject_id == old_test_sub.id).delete()
            db.delete(old_test_sub)
            db.commit()

        # Pick courses to link
        sample_courses = db.query(Course).limit(3).all()
        sample_course_ids = [c.id for c in sample_courses]

        new_subject = Subject(
            code=test_subj_code,
            name="Test Ethics and Critical Thinking",
            course_id=sample_course_ids[0],
            year_level_id=1,
            semester=1,
            term="Midterm",
            category="general",
            exam_type="written",
            duration_minutes=75,
            department_code="GE"
        )
        db.add(new_subject)
        db.flush()

        for cid in sample_course_ids:
            db.add(SubjectProgram(subject_id=new_subject.id, course_id=cid))
        db.commit()

        # Query back and verify
        saved_subj = db.query(Subject).filter(Subject.id == new_subject.id).first()
        assert_true(saved_subj is not None, "Test subject created")
        assert_true(saved_subj.department_code == "GE", f"Subject department_code is GE (actual: {saved_subj.department_code})")
        linked_progs = db.query(SubjectProgram).filter(SubjectProgram.subject_id == saved_subj.id).all()
        assert_true(len(linked_progs) == 3, f"Subject linked to {len(linked_progs)} programs (expected 3)")

        # Change subject department to ICT
        saved_subj.department_code = "ICT"
        db.commit()
        db.refresh(saved_subj)
        assert_true(saved_subj.department_code == "ICT", "Subject department updated to ICT")

        # Clean up test subject
        db.query(SubjectProgram).filter(SubjectProgram.subject_id == saved_subj.id).delete()
        db.delete(saved_subj)
        db.commit()
        print("  [INFO] Test subject cleaned up.")

        # TEST 5: Automatic Rescheduling Routing & Cross-Department Security
        print("\n--- Test 5: Rescheduling Routing & Cross-Department Access Control ---")
        from routers.rescheduling import check_request_department_access
        from fastapi import HTTPException

        ge_admin = db.query(User).filter(User.email == "ge.admin@school.edu").first()
        ict_admin = db.query(User).filter(User.email == "ict.admin@school.edu").first()
        bm_admin = db.query(User).filter(User.email == "bm.admin@school.edu").first()

        # Create a mock request belonging to ICT
        test_request = ReschedulingRequest(
            student_id="STUDENT001",
            exam_id=1,
            program="BSIT",
            reason_type="Academic Conflict",
            detailed_explanation="Conflict test",
            status="pending",
            department_code="ICT"
        )

        # 1. ICT Admin reviews ICT request -> Should succeed
        try:
            check_request_department_access(test_request, ict_admin, db)
            assert_true(True, "ICT Admin allowed to review ICT department request")
        except HTTPException:
            assert_true(False, "ICT Admin was blocked from reviewing ICT request")

        # 2. BM Admin reviews ICT request -> Must be blocked with 403
        try:
            check_request_department_access(test_request, bm_admin, db)
            assert_true(False, "BM Admin was incorrectly allowed to review ICT request")
        except HTTPException as e:
            assert_true(e.status_code == 403, f"BM Admin correctly blocked with 403 Forbidden: '{e.detail}'")

        # 3. GE Admin (Super Admin) reviews ICT request -> Must succeed
        try:
            check_request_department_access(test_request, ge_admin, db)
            assert_true(True, "GE Super Admin allowed to review cross-department (ICT) request")
        except HTTPException:
            assert_true(False, "GE Super Admin was blocked from reviewing cross-department request")

        # TEST 6: Preservation of Existing Records
        print("\n--- Test 6: Preservation of Existing Records & Scheduling Rules ---")
        exam_count = db.query(Exam).count()
        assert_true(exam_count >= 899, f"Existing exam schedules preserved ({exam_count} exams in database)")

        posted_exams = db.query(Exam).filter(Exam.status == "posted").count()
        assert_true(posted_exams > 0, f"Posted exams intact ({posted_exams} posted exams)")

        exams_with_proctors = db.query(Exam).filter(Exam.proctor_id.isnot(None)).count()
        assert_true(exams_with_proctors > 0, f"Proctor assignments intact ({exams_with_proctors} exams with proctors)")

        exams_with_rooms = db.query(Exam).filter(Exam.room_id.isnot(None)).count()
        assert_true(exams_with_rooms > 0, f"Room assignments intact ({exams_with_rooms} exams with rooms)")

        print("\n" + "=" * 60)
        print(f"RESULTS: {passed} PASSED, {failed} FAILED")
        print("=" * 60)
        return failed == 0

    finally:
        db.close()

if __name__ == "__main__":
    success = run_tests()
    sys.exit(0 if success else 1)
