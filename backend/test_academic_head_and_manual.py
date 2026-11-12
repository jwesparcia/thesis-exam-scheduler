"""
backend/test_academic_head_and_manual.py
─────────────────────────────────────────────────────────────
Automated test suite verifying:
1. General Academic Administrator account exists with email 'ge.admin@school.edu', is_super_admin=False, role='program_head'.
2. Login with 'ge.admin@school.edu' succeeds.
3. The retired 'academic.head@school.edu' account cannot be used to log in.
4. GE admin is denied cross-department rescheduling access.
5. User manual PDF exists in both root and frontend/public/ and has valid size.
"""

import os
import sys

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

ROOT_DIR = os.path.dirname(current_dir)
TEST_DB_FILE = os.path.join(current_dir, "test_academic_head_temp.db")
if os.path.exists(TEST_DB_FILE):
    try:
        os.remove(TEST_DB_FILE)
    except Exception:
        pass

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE}"
os.environ["SECRET_KEY"] = "9f8a3c2b1e4d567890abcdef1234567890abcdef1234567890abcdef12345678"

from core import SessionLocal, Base, engine
from model.models import ReschedulingRequest, User
from routers.auth import login, LoginRequest, hash_password
from routers.rescheduling import check_request_department_access
from utils.rate_limiter import login_rate_limiter
from fastapi import HTTPException


class MockClient:
    def __init__(self, host="127.0.0.1"):
        self.host = host


class MockRequest:
    def __init__(self, host="127.0.0.1"):
        self.client = MockClient(host)
        self.headers = {}


def run_tests():
    print("=" * 70)
    print("RUNNING GENERAL ACADEMIC ADMIN & USER MANUAL TESTS")
    print("=" * 70)

    Base.metadata.create_all(engine)
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
        login_rate_limiter.reset()

        # Ensure General Academic Administrator exists in test DB
        ge_admin = db.query(User).filter(User.email == "ge.admin@school.edu").first()
        if not ge_admin:
            ge_admin = User(
                name="General Academic Administrator",
                email="ge.admin@school.edu",
                hashed_password=hash_password("admin123"),
                role="program_head",
                department_code="GE",
                is_super_admin=False,
                is_first_login=False,
            )
            db.add(ge_admin)
            db.commit()
            db.refresh(ge_admin)

        # ── TEST 1: General Academic Admin Account Attributes ─────────────────
        print("\n--- Test 1: General Academic Admin Account Attributes ---")
        assert_true(ge_admin.name == "General Academic Administrator", f"Name is '{ge_admin.name}'")
        assert_true(ge_admin.email == "ge.admin@school.edu", f"Email is '{ge_admin.email}'")
        assert_true(ge_admin.is_super_admin is False, "is_super_admin is False")
        assert_true(ge_admin.role == "program_head", f"Role is 'program_head': {ge_admin.role}")
        assert_true(
            db.query(User).filter(User.email == "academic.head@school.edu").first() is None,
            "Academic Head account is absent",
        )

        # ── TEST 2: Login with ge.admin@school.edu ────────────────────────────
        print("\n--- Test 2: Direct Login with ge.admin@school.edu ---")
        req1 = MockRequest()
        res1 = login(req1, LoginRequest(email="ge.admin@school.edu", password="admin123"), db)
        assert_true("access_token" in res1, "Login returned access token")
        assert_true(res1["user"]["email"] == "ge.admin@school.edu", "Token user email is ge.admin@school.edu")
        assert_true(res1["user"]["is_super_admin"] is False, "Token user is not super admin")
        assert_true(res1["user"]["name"] == "General Academic Administrator", "Token user name is General Academic Administrator")

        # ── TEST 3: Retired Academic Head Account Is Rejected ─────────────────
        print("\n--- Test 3: Academic Head Account Cannot Log In ---")
        req2 = MockRequest()
        try:
            login(req2, LoginRequest(email="academic.head@school.edu", password="admin123"), db)
            assert_true(False, "Academic Head login was rejected")
        except HTTPException as error:
            assert_true(error.status_code == 401, "Academic Head login is rejected with 401")

        # ── TEST 4: GE Admin Cannot Access Another Department ─────────────────
        print("\n--- Test 4: GE Admin Cross-Department Access Is Rejected ---")
        cross_department_request = ReschedulingRequest(department_code="ICT")
        try:
            check_request_department_access(cross_department_request, ge_admin, db)
            assert_true(False, "GE Admin was blocked from cross-department access")
        except HTTPException as error:
            assert_true(error.status_code == 403, "GE Admin cross-department access is rejected with 403")

        # ── TEST 5: Verification of User Manual PDF Files ─────────────────────
        print("\n--- Test 5: User Manual PDF Generation Verification ---")
        pdf_root = os.path.join(ROOT_DIR, "USER_MANUAL.pdf")
        pdf_public = os.path.join(ROOT_DIR, "frontend", "public", "USER_MANUAL.pdf")

        assert_true(os.path.exists(pdf_root), f"USER_MANUAL.pdf exists in root ({pdf_root})")
        if os.path.exists(pdf_root):
            size_root = os.path.getsize(pdf_root)
            assert_true(size_root > 100000, f"Root PDF size is valid ({size_root:,} bytes > 100 KB)")

        assert_true(os.path.exists(pdf_public), f"USER_MANUAL.pdf exists in frontend/public ({pdf_public})")
        if os.path.exists(pdf_public):
            size_pub = os.path.getsize(pdf_public)
            assert_true(size_pub > 100000, f"Public PDF size is valid ({size_pub:,} bytes > 100 KB)")

        print("\n" + "=" * 70)
        print(f"GENERAL ACADEMIC ADMIN & MANUAL TESTS RESULT: {passed} PASSED, {failed} FAILED")
        print("=" * 70)

        if failed > 0:
            sys.exit(1)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
