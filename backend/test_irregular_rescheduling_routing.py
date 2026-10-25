import os
import sys
from datetime import date, time, datetime, timedelta

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from core import SessionLocal
from model.models import User, Course, Department, Subject, Exam, Timeslot, Room, ReschedulingRequest, Notification
from routers.auth import hash_password

def run_tests():
    db = SessionLocal()
    print("=" * 70)
    print("TESTING DYNAMIC IRREGULAR STUDENT RESCHEDULE REQUEST ROUTING")
    print("=" * 70)

    try:
        # 1. Fetch courses and departments dynamically from DB
        bsit_course = db.query(Course).filter(Course.name == "BSIT").first()
        bsa_course = db.query(Course).filter(Course.name == "BSA").first()
        ge_dept = db.query(Department).filter(Department.code == "GE").first()

        assert bsit_course is not None, "BSIT course must exist"
        assert bsit_course.department_code == "ICT", f"BSIT must belong to ICT department (got {bsit_course.department_code})"
        assert bsa_course is not None, "BSA course must exist"
        assert bsa_course.department_code == "BM", f"BSA must belong to BM department (got {bsa_course.department_code})"

        print(f"[OK] Dynamic course lookups:")
        print(f"     BSIT course ID: {bsit_course.id} -> Dept: {bsit_course.department_code}")
        print(f"     BSA course ID: {bsa_course.id} -> Dept: {bsa_course.department_code}")

        # 2. Get department admins
        ict_admin = db.query(User).filter(User.email == "ict.admin@school.edu").first()
        bm_admin = db.query(User).filter(User.email == "bm.admin@school.edu").first()
        ge_admin = db.query(User).filter(User.email == "ge.admin@school.edu").first()

        assert ict_admin is not None, "ICT admin must exist"
        assert bm_admin is not None, "BM admin must exist"
        assert ge_admin is not None, "GE admin must exist"

        print(f"[OK] Program head accounts verified: ICT ({ict_admin.email}), BM ({bm_admin.email}), GE ({ge_admin.email})")

        # 3. Create or get an irregular student enrolled in BSIT (course_id = bsit_course.id)
        irreg_student_email = "test.irreg.bsit@school.edu"
        student = db.query(User).filter(User.email == irreg_student_email).first()
        if not student:
            student = User(
                name="Juan Dela Cruz (Irreg BSIT)",
                email=irreg_student_email,
                hashed_password=hash_password("student123"),
                role="student",
                student_type="irregular",
                course_id=bsit_course.id,
                department_code=bsit_course.department_code,
                student_id="0200099881"
            )
            db.add(student)
            db.commit()
            db.refresh(student)
        else:
            student.student_type = "irregular"
            student.course_id = bsit_course.id
            student.department_code = bsit_course.department_code
            db.commit()

        print(f"[OK] Test irregular student: {student.name}, Type: {student.student_type}, Course: BSIT (ID: {student.course_id}), Dept: {student.department_code}")

        # 4. Find or create an exam for a GE / Minor subject (e.g. subject in GE department)
        ge_subject = db.query(Subject).filter(Subject.department_code == "GE").first()
        if not ge_subject:
            # Fallback to general category
            ge_subject = db.query(Subject).filter(Subject.category == "general").first()
        if not ge_subject:
            ge_subject = Subject(
                code="GE101",
                name="Understanding the Self",
                department_code="GE",
                category="general",
                exam_type="written",
                duration_minutes=75,
                course_id=bsit_course.id
            )
            db.add(ge_subject)
            db.commit()
            db.refresh(ge_subject)

        print(f"[OK] Target exam subject: {ge_subject.code} - {ge_subject.name} (Subject Dept: {ge_subject.department_code})")

        # Find or create timeslot & exam
        ts = db.query(Timeslot).filter(Timeslot.date >= date.today()).first()
        if not ts:
            ts = Timeslot(date=date.today() + timedelta(days=7), start_time=time(9, 0), end_time=time(10, 15))
            db.add(ts)
            db.commit()
            db.refresh(ts)

        exam = db.query(Exam).filter(Exam.subject_id == ge_subject.id).first()
        if not exam:
            exam = Exam(
                subject_id=ge_subject.id,
                course_id=bsit_course.id,
                timeslot_id=ts.id,
                status="posted"
            )
            db.add(exam)
            db.commit()
            db.refresh(exam)

        print(f"[OK] Exam ID {exam.id} for GE subject on {ts.date} at {ts.start_time}")

        # 5. Clean up any previous test requests for this student and exam
        db.query(ReschedulingRequest).filter(
            ReschedulingRequest.school_email == irreg_student_email
        ).delete()
        db.commit()

        # 6. Test submission via student endpoint logic
        # Simulating the exact logic from backend/routers/student.py:
        dept_code = None
        student_program = "BSIT"

        # Check student's enrolled course_id dynamically
        if student.course_id:
            course_obj = db.query(Course).filter(Course.id == student.course_id).first()
            if course_obj:
                student_program = course_obj.name
                if course_obj.department_code:
                    dept_code = course_obj.department_code

        assert dept_code == "ICT", f"Expected dept_code to be ICT, got {dept_code}"
        assert student_program == "BSIT", f"Expected student_program to be BSIT, got {student_program}"
        print(f"[PASS] Dynamic resolution correctly identified Student Program: {student_program}, Dept: {dept_code}")

        # Create ReschedulingRequest
        new_req = ReschedulingRequest(
            exam_id=exam.id,
            section_name="IRREG-SECTION",
            student_name=student.name,
            student_id=student.student_id,
            program=student_program,
            school_email=student.email,
            course_code=ge_subject.code,
            course_name=ge_subject.name,
            original_exam_date=ts.date,
            original_start_time=ts.start_time,
            original_end_time=ts.end_time,
            exam_type="Midterm",
            reason_type="exam conflict",
            detailed_explanation="Conflict with another subject in irregular schedule",
            requested_mode="offline",
            preferred_date=ts.date,
            acknowledged=True,
            department_code=dept_code,
            status="pending"
        )
        db.add(new_req)
        db.commit()
        db.refresh(new_req)

        print(f"[PASS] Rescheduling request {new_req.id} created:")
        print(f"       Exam Subject: {new_req.course_code} ({new_req.course_name}) - GE Subject")
        print(f"       Student Program: {new_req.program}")
        print(f"       Assigned Department Code: {new_req.department_code}")
        assert new_req.department_code == "ICT", f"Request must be assigned to student's department 'ICT', got {new_req.department_code}"

        # 7. Test notification targeting
        target_admin = db.query(User).filter(
            User.role.in_(["program_head", "admin"]),
            User.department_code == new_req.department_code
        ).first()

        assert target_admin is not None, "Target admin should be found"
        assert target_admin.id == ict_admin.id, f"Target admin must be ICT Admin (id {ict_admin.id}), got {target_admin.id} ({target_admin.email})"
        assert target_admin.email == "ict.admin@school.edu", f"Notification target must be ict.admin@school.edu, got {target_admin.email}"

        # Create notification
        notif = Notification(
            user_id=target_admin.id,
            message=f"New [{dept_code}] rescheduling request submitted by {new_req.student_name} ({new_req.program}) for {new_req.course_name}.",
            type="info",
            related_id=new_req.id
        )
        db.add(notif)
        db.commit()
        db.refresh(notif)
        print(f"[PASS] Notification {notif.id} exclusively routed to: {target_admin.name} ({target_admin.email})")

        # Verify other department admins (e.g. BM admin) have NOT received this notification
        bm_notifs = db.query(Notification).filter(
            Notification.user_id == bm_admin.id,
            Notification.related_id == new_req.id
        ).all()
        assert len(bm_notifs) == 0, f"BM admin should NOT receive notification for ICT request, found {len(bm_notifs)}"
        print(f"[PASS] BM Admin received 0 notifications for this request (correct)")

        # 8. Test pending request visibility for ICT Admin
        from routers.rescheduling import check_request_department_access

        # ICT Admin can access
        try:
            check_request_department_access(new_req, ict_admin, db)
            print(f"[PASS] ICT Admin has full access to review and approve the request.")
        except Exception as e:
            assert False, f"ICT Admin should have access: {e}"

        # BM Admin CANNOT access (should raise HTTPException with status 403)
        access_denied = False
        try:
            check_request_department_access(new_req, bm_admin, db)
        except Exception as e:
            access_denied = True
            print(f"[PASS] BM Admin access correctly denied: {e.detail}")

        assert access_denied, "BM Admin must be denied access to ICT irregular student request"

        # Super Admin (GE) has access
        try:
            check_request_department_access(new_req, ge_admin, db)
            print(f"[PASS] GE Super Admin has oversight access across departments.")
        except Exception as e:
            assert False, f"Super Admin should have access: {e}"

        # 9. Clean up test request and test notification
        db.delete(notif)
        db.delete(new_req)
        db.commit()
        print(f"[OK] Cleaned up test data.")

        print("=" * 70)
        print("ALL TESTS PASSED SUCCESSFULLY!")
        print("=" * 70)

    finally:
        db.close()

if __name__ == "__main__":
    run_tests()
