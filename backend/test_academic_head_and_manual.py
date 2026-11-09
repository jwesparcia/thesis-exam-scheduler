"""
backend/test_academic_head_and_manual.py
─────────────────────────────────────────────────────────────
Automated test suite verifying:
1. Academic Head account exists with email 'academic.head@school.edu', is_super_admin=True, role='program_head'.
2. Login with 'academic.head@school.edu' succeeds.
3. Login fallback with legacy 'ge.admin@school.edu' resolves to Academic Head.
4. User manual PDF exists in both root and frontend/public/ and has valid size.
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
from model.models import User
from routers.auth import login, LoginRequest, hash_password
from utils.rate_limiter import login_rate_limiter


class MockClient:
    def __init__(self, host="127.0.0.1"):
        self.host = host


class MockRequest:
    def __init__(self, host="127.0.0.1"):
        self.client = MockClient(host)
        self.headers = {}


def run_tests():
    print("=" * 70)
    print("RUNNING ACADEMIC HEAD & USER MANUAL TESTS")
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

        # Ensure Academic Head exists in test DB
        academic_head = db.query(User).filter(User.email == "academic.head@school.edu").first()
        if not academic_head:
            academic_head = User(
                name="Academic Head",
                email="academic.head@school.edu",
                hashed_password=hash_password("admin123"),
                role="program_head",
                department_code="GE",
                is_super_admin=True,
                is_first_login=False,
            )
            db.add(academic_head)
            db.commit()
            db.refresh(academic_head)

        # ── TEST 1: Academic Head Account Attributes ──────────────────────────
        print("\n--- Test 1: Academic Head Account Attributes ---")
        assert_true(academic_head.name == "Academic Head", f"Name is 'Academic Head': {academic_head.name}")
        assert_true(academic_head.email == "academic.head@school.edu", f"Email is 'academic.head@school.edu': {academic_head.email}")
        assert_true(academic_head.is_super_admin is True, "is_super_admin is True")
        assert_true(academic_head.role == "program_head", f"Role is 'program_head': {academic_head.role}")

        # ── TEST 2: Login with academic.head@school.edu ──────────────────────
        print("\n--- Test 2: Direct Login with academic.head@school.edu ---")
        req1 = MockRequest()
        res1 = login(req1, LoginRequest(email="academic.head@school.edu", password="admin123"), db)
        assert_true("access_token" in res1, "Login returned access token")
        assert_true(res1["user"]["email"] == "academic.head@school.edu", "Token user email is academic.head@school.edu")
        assert_true(res1["user"]["is_super_admin"] is True, "Token user is_super_admin is True")
        assert_true(res1["user"]["name"] == "Academic Head", "Token user name is Academic Head")

        # ── TEST 3: Legacy Login Fallback with ge.admin@school.edu ───────────
        print("\n--- Test 3: Legacy Login Fallback with ge.admin@school.edu ---")
        req2 = MockRequest()
        res2 = login(req2, LoginRequest(email="ge.admin@school.edu", password="admin123"), db)
        assert_true("access_token" in res2, "Legacy login returned access token")
        assert_true(res2["user"]["email"] == "academic.head@school.edu", "Legacy ge.admin resolved to academic.head@school.edu")
        assert_true(res2["user"]["is_super_admin"] is True, "Legacy login is_super_admin is True")

        # ── TEST 4: Verification of User Manual PDF Files ─────────────────────
        print("\n--- Test 4: User Manual PDF Generation Verification ---")
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
        print(f"ACADEMIC HEAD & MANUAL TESTS RESULT: {passed} PASSED, {failed} FAILED")
        print("=" * 70)

        if failed > 0:
            sys.exit(1)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
