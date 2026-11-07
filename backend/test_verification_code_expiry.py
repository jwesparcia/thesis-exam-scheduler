"""
backend/test_verification_code_expiry.py
─────────────────────────────────────────────────────────────
Automated test suite verifying:
1. In change password, verification code strictly defaults to the user's registered email.
2. The verification code expiration is exactly 5 minutes.
3. Expired codes (> 5 minutes) are rejected.
4. Valid codes (< 5 minutes) succeed in verifying and updating password.
5. Forgot password verification code also expires in 5 minutes.
"""

import os
import sys
from datetime import datetime, timezone, timedelta

current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

TEST_DB_FILE = os.path.join(current_dir, "test_verif_temp.db")
if os.path.exists(TEST_DB_FILE):
    try:
        os.remove(TEST_DB_FILE)
    except Exception:
        pass

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB_FILE}"
os.environ["SECRET_KEY"] = "9f8a3c2b1e4d567890abcdef1234567890abcdef1234567890abcdef12345678"

from core import SessionLocal, Base, engine
from model.models import User, PasswordResetToken
from routers.auth import (
    request_verification_code,
    verify_and_change_password,
    forgot_password_request_code,
    forgot_password_reset,
    RequestCodeRequest,
    VerifyAndChangePasswordRequest,
    ForgotPasswordRequest,
    ForgotPasswordResetRequest,
    hash_password,
    verify_password
)
from fastapi import HTTPException
import routers.auth as auth_mod
auth_mod.send_verification_email = lambda recipient, code: True


class MockClient:
    def __init__(self, host="127.0.0.1"):
        self.host = host


class MockRequest:
    def __init__(self, host="127.0.0.1"):
        self.client = MockClient(host)
        self.headers = {}


def run_tests():
    print("=" * 70)
    print("RUNNING VERIFICATION CODE & 5-MIN EXPIRATION TESTS")
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
        email = f"registered_user_{os.getpid()}@school.edu"
        orig_pw = "OldPassword123"
        hashed = hash_password(orig_pw)

        user = User(
            email=email,
            name="Registered Test User",
            hashed_password=hashed,
            role="student",
            is_first_login=False
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        # ── TEST 1: Request code strictly uses registered email ──────────────
        print("\n--- Test 1: Verification Code defaults strictly to registered email ---")
        # Pass a bogus payload email to test that it is ignored
        payload = RequestCodeRequest(email="malicious_or_other@fake.com")
        res = request_verification_code(payload, db, user)
        assert_true(res["email"] == email, f"Returned email matches registered email '{email}'")
        assert_true(user.email == email, f"User email in DB was NOT changed ('{user.email}')")

        token_rec = db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).first()
        assert_true(token_rec is not None, "PasswordResetToken record created in DB")

        # ── TEST 2: Verify expiration is 5 minutes ──────────────────────────
        print("\n--- Test 2: Verification Code expiration is exactly 5 minutes ---")
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        diff_seconds = (token_rec.expires_at - now).total_seconds()
        # Diff should be around 300 seconds (5 minutes)
        assert_true(280 <= diff_seconds <= 305, f"Token expires in ~5 minutes ({diff_seconds:.1f}s remaining)")

        # ── TEST 3: Expired code (> 5 minutes) is rejected ───────────────────
        print("\n--- Test 3: Expired code is rejected ---")
        # Artificially expire the token by setting expires_at to 1 second in the past
        token_rec.expires_at = now - timedelta(seconds=1)
        db.commit()

        try:
            verify_payload = VerifyAndChangePasswordRequest(
                email=email,
                code=token_rec.token,
                new_password="NewPassword123"
            )
            verify_and_change_password(verify_payload, db, user)
            assert_true(False, "Expired code should have been rejected!")
        except HTTPException as e:
            assert_true(
                e.status_code == 400 and "expired" in e.detail.lower(),
                f"Expired code correctly rejected with 400: '{e.detail}'"
            )

        # ── TEST 4: Valid code within 5 minutes succeeds ─────────────────────
        print("\n--- Test 4: Valid code within 5 minutes updates password ---")
        # Request a fresh code
        res2 = request_verification_code(None, db, user)
        token_rec2 = db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).first()
        code2 = token_rec2.token

        verify_payload2 = VerifyAndChangePasswordRequest(
            email=email,
            code=code2,
            new_password="NewPass12" # 10 characters (8-12 required)
        )
        verif_res = verify_and_change_password(verify_payload2, db, user)
        assert_true(verif_res["message"] == "Password changed successfully", "Password changed successfully")

        # Verify password in DB was actually updated
        db.refresh(user)
        assert_true(verify_password("NewPass12", user.hashed_password), "New password verified against hash")

        # ── TEST 5: Forgot Password verification code expires in 5 minutes ───
        print("\n--- Test 5: Forgot Password code expires in 5 minutes ---")
        forgot_req = MockRequest()
        forgot_payload = ForgotPasswordRequest(email=email)
        forgot_res = forgot_password_request_code(forgot_payload, forgot_req, db)
        assert_true("5 minutes" in forgot_res["message"], f"Message mentions 5 minutes: '{forgot_res['message']}'")

        token_rec_forgot = db.query(PasswordResetToken).filter(PasswordResetToken.user_id == user.id).first()
        now2 = datetime.now(timezone.utc).replace(tzinfo=None)
        diff_forgot = (token_rec_forgot.expires_at - now2).total_seconds()
        assert_true(280 <= diff_forgot <= 305, f"Forgot password token expires in ~5 minutes ({diff_forgot:.1f}s remaining)")

        print("\n" + "=" * 70)
        print(f"VERIFICATION TESTS RESULT: {passed} PASSED, {failed} FAILED")
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
