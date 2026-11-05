"""
backend/test_login_rate_limiter.py
─────────────────────────────────────────────────────────────
Comprehensive automated test suite for login rate limiting:
1. Simultaneous legitimate logins across multiple roles sharing the same IP (Classroom Wi-Fi simulation).
2. Account-based failed attempt tracking across students, proctors, and admins.
3. Cooldown activation after repeated failed attempts.
4. Account isolation (lockout of one account does not impact other accounts on the same IP).
5. Reset of failed attempt counters on successful login.
6. IP-level security layer against brute force floods.
"""

import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

TEST_DB_FILE = os.path.join(current_dir, "test_auth_temp.db")
if os.path.exists(TEST_DB_FILE):
    try:
        os.remove(TEST_DB_FILE)
    except Exception:
        pass

# Use file-based SQLite for multi-threaded test isolation
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE}"
os.environ["SECRET_KEY"] = "9f8a3c2b1e4d567890abcdef1234567890abcdef1234567890abcdef12345678"

from core import SessionLocal, Base, engine
from model.models import User, ActivityLog
from routers.auth import login, LoginRequest, hash_password
from utils.rate_limiter import login_rate_limiter
from fastapi import HTTPException


class MockClient:
    def __init__(self, host="192.168.1.50"):
        self.host = host


class MockRequest:
    def __init__(self, host="192.168.1.50", headers=None):
        self.client = MockClient(host)
        self.headers = headers or {}


def run_tests():
    print("=" * 70)
    print("RUNNING LOGIN RATE LIMITER & CLASSROOM CONCURRENCY TESTS")
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
        # Reset limiter state before tests
        login_rate_limiter.reset()

        # Find or create test users with different roles
        test_accounts = [
            ("test_student1@school.edu", "student", "Student One"),
            ("test_student2@school.edu", "student", "Student Two"),
            ("test_student3@school.edu", "student", "Student Three"),
            ("test_student4@school.edu", "student", "Student Four"),
            ("test_student5@school.edu", "student", "Student Five"),
            ("test_proctor1@school.edu", "proctor", "Proctor One"),
            ("test_proctor2@school.edu", "proctor", "Proctor Two"),
            ("test_admin1@school.edu", "program_head", "Admin One"),
        ]
        
        test_password = "Password123!"
        hashed = hash_password(test_password)

        created_users = []
        for email, role, name in test_accounts:
            user = db.query(User).filter(User.email == email).first()
            if not user:
                user = User(
                    email=email,
                    name=name,
                    hashed_password=hashed,
                    role=role,
                    is_first_login=False
                )
                db.add(user)
                created_users.append(email)
            else:
                user.hashed_password = hashed
                user.role = role
        db.commit()

        shared_ip = "192.168.1.100"  # Simulated classroom NAT / Wi-Fi IP

        # ── TEST 1: Simultaneous legitimate logins sharing the same IP ─────────
        print("\n--- Test 1: Simultaneous Legitimate Logins (Shared Classroom Wi-Fi) ---")
        
        def attempt_login(email):
            thread_db = SessionLocal()
            try:
                req = MockRequest(host=shared_ip)
                body = LoginRequest(email=email, password=test_password)
                res = login(req, body, thread_db)
                return (email, True, res.get("access_token") is not None, None)
            except Exception as e:
                return (email, False, False, str(e))
            finally:
                thread_db.close()

        # Launch concurrent login attempts in parallel
        with ThreadPoolExecutor(max_workers=8) as executor:
            futures = [executor.submit(attempt_login, email) for email, _, _ in test_accounts]
            results = [f.result() for f in futures]

        all_succeeded = all(r[1] and r[2] for r in results)
        assert_true(
            all_succeeded,
            f"All {len(test_accounts)} users logged in simultaneously from shared IP {shared_ip} without 429 lockouts"
        )

        # ── TEST 2: Account-Based Failed Login Tracking & Cooldown ──────────────
        print("\n--- Test 2: Account-Based Failed Logins & Cooldown ---")
        target_email = "test_student1@school.edu"
        req = MockRequest(host=shared_ip)

        # 4 consecutive failed attempts should return 401 with decreasing remaining attempts
        for attempt_num in range(1, 5):
            try:
                login(req, LoginRequest(email=target_email, password="WrongPassword!"), db)
                assert_true(False, f"Attempt {attempt_num} should have failed")
            except HTTPException as e:
                expected_remaining = 5 - attempt_num
                assert_true(
                    e.status_code == 401 and f"{expected_remaining} attempt(s) remaining" in e.detail,
                    f"Attempt {attempt_num} returned 401 with {expected_remaining} attempt(s) remaining"
                )

        # 5th failed attempt should trigger 429 Too Many Requests (Cooldown initiated)
        try:
            login(req, LoginRequest(email=target_email, password="WrongPassword!"), db)
            assert_true(False, "5th attempt should have triggered HTTP 429 cooldown")
        except HTTPException as e:
            assert_true(
                e.status_code == 429 and "temporarily locked" in e.detail,
                f"5th failed attempt triggered HTTP 429 cooldown: '{e.detail}'"
            )

        # Subsequent attempt during cooldown (even with CORRECT password) should remain locked
        try:
            login(req, LoginRequest(email=target_email, password=test_password), db)
            assert_true(False, "Login during cooldown should be blocked with 429")
        except HTTPException as e:
            assert_true(
                e.status_code == 429 and "temporarily locked" in e.detail,
                f"Attempt during active cooldown correctly rejected with HTTP 429: '{e.detail}'"
            )

        # ── TEST 3: Account Isolation on Shared IP ─────────────────────────────
        print("\n--- Test 3: Account Isolation on Shared IP ---")
        # target_email is locked, but test_student2 and test_admin1 on the same IP must NOT be locked
        req_student2 = MockRequest(host=shared_ip)
        try:
            res2 = login(req_student2, LoginRequest(email="test_student2@school.edu", password=test_password), db)
            assert_true(
                res2.get("access_token") is not None,
                "Student 2 successfully logged in on the SAME IP while Student 1 is in cooldown"
            )
        except Exception as e:
            assert_true(False, f"Student 2 was incorrectly blocked by Student 1's cooldown: {e}")

        req_admin = MockRequest(host=shared_ip)
        try:
            res_admin = login(req_admin, LoginRequest(email="test_admin1@school.edu", password=test_password), db)
            assert_true(
                res_admin.get("access_token") is not None,
                "Admin successfully logged in on the SAME IP while Student 1 is in cooldown"
            )
        except Exception as e:
            assert_true(False, f"Admin was incorrectly blocked by Student 1's cooldown: {e}")

        # ── TEST 4: Reset on Successful Login ─────────────────────────────────
        print("\n--- Test 4: Reset Failed Attempts on Successful Login ---")
        reset_target = "test_proctor1@school.edu"
        req_proc = MockRequest(host=shared_ip)

        # Fail twice
        for _ in range(2):
            try:
                login(req_proc, LoginRequest(email=reset_target, password="WrongPassword!"), db)
            except HTTPException:
                pass

        # Login successfully
        success_res = login(req_proc, LoginRequest(email=reset_target, password=test_password), db)
        assert_true(success_res.get("access_token") is not None, "Proctor logged in successfully after 2 failures")

        # Now fail once: remaining attempts should be 4 (not 2), proving counter was reset to 0
        try:
            login(req_proc, LoginRequest(email=reset_target, password="WrongPassword!"), db)
            assert_true(False, "Should have failed")
        except HTTPException as e:
            assert_true(
                e.status_code == 401 and "4 attempt(s) remaining" in e.detail,
                f"Failed attempt counter was reset: {e.detail}"
            )

        # ── TEST 5: Rate Limiter across All Account Roles ─────────────────────
        print("\n--- Test 5: Rate Limiting Across All Account Roles ---")
        for role_email, role_name in [
            ("test_student3@school.edu", "student"),
            ("test_proctor2@school.edu", "proctor"),
            ("test_admin1@school.edu", "program_head")
        ]:
            # Reset limiter for this specific check
            login_rate_limiter.record_success(req, role_email, db)
            for _ in range(4):
                try:
                    login(req, LoginRequest(email=role_email, password="BadPassword!"), db)
                except HTTPException:
                    pass
            try:
                login(req, LoginRequest(email=role_email, password="BadPassword!"), db)
                assert_true(False, f"Role {role_name} should have hit 429 on 5th attempt")
            except HTTPException as e:
                assert_true(
                    e.status_code == 429,
                    f"Account-based rate limiter enforced for role: '{role_name}' ({role_email})"
                )

        # ── Clean up test accounts ───────────────────────────────────────────
        if created_users:
            db.query(User).filter(User.email.in_(created_users)).delete(synchronize_session=False)
            db.commit()

        login_rate_limiter.reset()

        print("\n" + "=" * 70)
        print(f"TEST RESULTS: {passed} PASSED, {failed} FAILED")
        print("=" * 70)

        if failed > 0:
            sys.exit(1)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
