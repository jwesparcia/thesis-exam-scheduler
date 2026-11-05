"""
backend/test_session_handling.py
─────────────────────────────────────────────────────────────
Automated test suite verifying:
1. Single active session per account (superseding previous logins on new login).
2. Proper invalidation when user logs out.
3. Verification across multiple roles (Student, Proctor, Admin).
"""

import os
import sys
import asyncio

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

TEST_DB_FILE = os.path.join(current_dir, "test_session_temp.db")
if os.path.exists(TEST_DB_FILE):
    try:
        os.remove(TEST_DB_FILE)
    except Exception:
        pass

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE}"
os.environ["SECRET_KEY"] = "9f8a3c2b1e4d567890abcdef1234567890abcdef1234567890abcdef12345678"

from core import SessionLocal, Base, engine
from model.models import User
from routers.auth import login, logout_user, get_current_user, LoginRequest, hash_password
from utils.rate_limiter import login_rate_limiter
from fastapi import HTTPException


def run_coro(coro):
    try:
        coro.send(None)
    except StopIteration as e:
        return e.value

class MockClient:
    def __init__(self, host="192.168.1.50"):
        self.host = host


class MockRequest:
    def __init__(self, host="192.168.1.50", headers=None):
        self.client = MockClient(host)
        self.headers = headers or {}


def run_tests():
    print("=" * 70)
    print("RUNNING SESSION HANDLING & SINGLE LOGIN ENFORCEMENT TESTS")
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
        email = f"session_student_{os.getpid()}@school.edu"
        password = "Password123!"
        hashed = hash_password(password)

        existing = db.query(User).filter(User.email == email).first()
        if existing:
            db.delete(existing)
            db.commit()

        user = User(
            email=email,
            name="Session Student",
            hashed_password=hashed,
            role="student",
            is_first_login=False
        )
        db.add(user)
        db.commit()

        # ── TEST 1: Login from Device 1 ──────────────────────────────────────
        print("\n--- Test 1: First Login (Device 1) ---")
        req1 = MockRequest(host="192.168.1.101")
        res1 = login(req1, LoginRequest(email=email, password=password), db)
        token1 = res1["access_token"]
        assert_true(token1 is not None, "Device 1 logged in and received Token 1")

        # Verify Token 1 works
        user_dev1 = run_coro(get_current_user(token1, db))
        assert_true(user_dev1.email == email, "Device 1 authenticated successfully with Token 1")

        # ── TEST 2: Login from Device 2 (Supersedes Device 1) ─────────────────
        print("\n--- Test 2: Concurrent Login from Device 2 (Superseding Device 1) ---")
        req2 = MockRequest(host="192.168.1.102")
        res2 = login(req2, LoginRequest(email=email, password=password), db)
        token2 = res2["access_token"]
        assert_true(token2 is not None and token2 != token1, "Device 2 logged in and received new unique Token 2")

        # Verify Token 2 works
        user_dev2 = run_coro(get_current_user(token2, db))
        assert_true(user_dev2.email == email, "Device 2 authenticated successfully with Token 2")

        # Verify Device 1 (Token 1) is now rejected with 401 Session Superseded
        print("\n--- Test 3: Device 1 Invalidation Verification ---")
        try:
            run_coro(get_current_user(token1, db))
            assert_true(False, "Device 1 with Token 1 should have been rejected!")
        except HTTPException as e:
            assert_true(
                e.status_code == 401 and "superseded" in e.detail.lower(),
                f"Device 1 token was rejected with 401: '{e.detail}'"
            )

        # ── TEST 4: Logout from Device 2 ─────────────────────────────────────
        print("\n--- Test 4: Server-Side Logout Invalidation ---")
        logout_user(user_dev2, db)

        # Now Token 2 should also be invalid
        try:
            run_coro(get_current_user(token2, db))
            assert_true(False, "Token 2 should be rejected after logout!")
        except HTTPException as e:
            assert_true(
                e.status_code == 401,
                f"Logged out Token 2 correctly rejected with 401: '{e.detail}'"
            )

        # ── TEST 5: Verification across Roles (Admin, Proctor) ───────────────
        print("\n--- Test 5: Single Session Enforcement across Multiple Roles ---")
        for role_name in ["admin", "proctor", "program_head"]:
            role_email = f"session_{role_name}_{os.getpid()}@school.edu"
            role_user = User(
                email=role_email,
                name=f"Session {role_name.title()}",
                hashed_password=hashed,
                role=role_name,
                is_first_login=False
            )
            db.add(role_user)
            db.commit()

            # Login A
            r_resA = login(MockRequest("10.0.0.1"), LoginRequest(email=role_email, password=password), db)
            tokA = r_resA["access_token"]
            uA = run_coro(get_current_user(tokA, db))
            assert_true(uA.role == role_name, f"Role '{role_name}' logged in successfully on Device A")

            # Login B supersedes A
            r_resB = login(MockRequest("10.0.0.2"), LoginRequest(email=role_email, password=password), db)
            tokB = r_resB["access_token"]

            # tokA must now fail
            try:
                run_coro(get_current_user(tokA, db))
                assert_true(False, f"Role '{role_name}' Device A should be superseded")
            except HTTPException as e:
                assert_true(e.status_code == 401, f"Role '{role_name}' Device A superseded with 401")

        print("\n" + "=" * 70)
        print(f"SESSION TESTS RESULT: {passed} PASSED, {failed} FAILED")
        print("=" * 70)

        if failed > 0:
            sys.exit(1)

    finally:
        db.close()
        if os.path.exists(TEST_DB_FILE):
            try:
                os.remove(TEST_DB_FILE)
            except Exception:
                pass


if __name__ == "__main__":
    run_tests()
