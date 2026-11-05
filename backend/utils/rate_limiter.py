"""
backend/utils/rate_limiter.py
─────────────────────────────────────────────────────────────
Robust, multi-tier login rate limiter supporting:
1. Account-based rate limiting (per email/username) across all roles.
2. Temporary cooldowns after repeated failed login attempts.
3. IP-based rate limiting configured to support multiple legitimate users
   sharing the same network (e.g. classroom/lab Wi-Fi with NAT).
4. Zero penalty for successful logins (successful logins reset failed attempts).
5. Concurrency safety (thread-safe in memory, Redis support when available,
   and database ActivityLog synchronization across multiple worker instances).
"""

import time
import threading
import logging
from typing import Tuple, Optional
from datetime import datetime, timezone, timedelta

from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

try:
    from core.cache import cache
except ImportError:
    cache = None

try:
    from model import ActivityLog, User
except ImportError:
    ActivityLog = None
    User = None

logger = logging.getLogger("rate_limiter")


def get_client_ip(request: Request) -> str:
    """
    Safely extract the real client IP address, giving precedence to
    reverse proxy headers (e.g. X-Forwarded-For) if present.
    """
    if not request:
        return "127.0.0.1"

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # First IP in comma-separated list is the original client IP
        ip = forwarded.split(",")[0].strip()
        if ip:
            return ip

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        ip = real_ip.strip()
        if ip:
            return ip

    if request.client and request.client.host:
        return request.client.host

    return "127.0.0.1"


class LoginRateLimiter:
    """
    Thread-safe and multi-instance rate limiter for user authentication.
    """

    def __init__(
        self,
        account_max_fails: int = 5,
        account_window: int = 900,         # 15 minutes window for failed attempts
        account_cooldown: int = 300,       # 5 minutes cooldown
        ip_burst_max: int = 120,           # 120 requests/minute (high to support classroom Wi-Fi)
        ip_burst_window: int = 60,         # 1 minute window for burst
        ip_max_fails: int = 50,            # 50 failed attempts from same IP before block
        ip_fail_window: int = 600,         # 10 minutes window for IP failures
        ip_cooldown: int = 600             # 10 minutes cooldown for abusive IP
    ):
        self.account_max_fails = account_max_fails
        self.account_window = account_window
        self.account_cooldown = account_cooldown

        self.ip_burst_max = ip_burst_max
        self.ip_burst_window = ip_burst_window
        self.ip_max_fails = ip_max_fails
        self.ip_fail_window = ip_fail_window
        self.ip_cooldown = ip_cooldown

        self._lock = threading.Lock()

        # In-memory tracking structures
        self._account_fails: dict[str, list[float]] = {}
        self._account_cooldowns: dict[str, float] = {}
        self._ip_burst: dict[str, list[float]] = {}
        self._ip_fails: dict[str, list[float]] = {}
        self._ip_cooldowns: dict[str, float] = {}

    # ── Helpers ─────────────────────────────────────────────────────────

    def _format_remaining_time(self, seconds: float) -> str:
        sec = max(1, int(seconds))
        mins = sec // 60
        rem_secs = sec % 60
        if mins > 0 and rem_secs > 0:
            return f"{mins} minute(s) and {rem_secs} second(s)"
        elif mins > 0:
            return f"{mins} minute(s)"
        else:
            return f"{rem_secs} second(s)"

    # ── Redis Helpers ───────────────────────────────────────────────────

    def _redis_client(self):
        if cache and getattr(cache, "is_available", False) and getattr(cache, "_client", None):
            return cache._client
        return None

    # ── Check Rate Limits (Pre-Login) ───────────────────────────────────

    def check_rate_limit(self, request: Request, email: str, db: Optional[Session] = None):
        """
        Verify that neither the account nor the client IP is currently blocked
        or exceeding limits. Must be called BEFORE credentials verification.
        """
        clean_email = email.strip().lower() if email else ""
        client_ip = get_client_ip(request)
        now = time.time()
        r = self._redis_client()

        # 1. Check IP cooldown
        ip_cooldown_remaining = self._get_ip_cooldown_remaining(client_ip, now, r)
        if ip_cooldown_remaining > 0:
            time_str = self._format_remaining_time(ip_cooldown_remaining)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts from this network. Access is temporarily locked. Please try again in {time_str}."
            )

        # 2. Check IP burst limit (classroom friendly: allows up to 120 reqs/min)
        if not self._check_and_record_ip_burst(client_ip, now, r):
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="High traffic detected from this network. Please wait a moment before trying again."
            )

        # 3. Check Account cooldown
        if clean_email:
            acc_cooldown_remaining = self._get_account_cooldown_remaining(clean_email, now, r, db)
            if acc_cooldown_remaining > 0:
                time_str = self._format_remaining_time(acc_cooldown_remaining)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many failed login attempts for this account. Access is temporarily locked for security. Please try again in {time_str}."
                )

    # ── Record Login Success ────────────────────────────────────────────

    def record_success(self, request: Request, email: str, db: Optional[Session] = None):
        """
        Call when credentials verification SUCCEEDS.
        Resets failed attempts and cooldown for this account.
        Does NOT increment IP failure counter.
        """
        clean_email = email.strip().lower() if email else ""
        if not clean_email:
            return

        now = time.time()
        r = self._redis_client()

        with self._lock:
            self._account_fails.pop(clean_email, None)
            self._account_cooldowns.pop(clean_email, None)

        if r:
            try:
                r.delete(
                    f"ratelimit:login:fail:acc:{clean_email}",
                    f"ratelimit:login:lock:acc:{clean_email}"
                )
            except Exception as e:
                logger.warning("Redis error on record_success: %s", e)

    # ── Record Login Failure ────────────────────────────────────────────

    def record_failure(self, request: Request, email: str, db: Optional[Session] = None) -> Tuple[int, int]:
        """
        Call when credentials verification FAILS (wrong password or non-existent user).
        Increments failure counters for account and IP.
        Returns: (current_failures, remaining_attempts).
        If failure threshold is reached, triggers cooldown and raises HTTPException(429).
        """
        clean_email = email.strip().lower() if email else ""
        client_ip = get_client_ip(request)
        now = time.time()
        r = self._redis_client()

        # 1. Update IP failed attempts
        ip_fails = self._increment_ip_failures(client_ip, now, r)
        if ip_fails >= self.ip_max_fails:
            self._set_ip_cooldown(client_ip, now, self.ip_cooldown, r)
            time_str = self._format_remaining_time(self.ip_cooldown)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts from this network. Access is temporarily locked for {time_str}."
            )

        # 2. Update Account failed attempts
        if not clean_email:
            return (1, self.account_max_fails - 1)

        acc_fails = self._increment_account_failures(clean_email, now, r, db)

        if acc_fails >= self.account_max_fails:
            # Trigger temporary account cooldown
            self._set_account_cooldown(clean_email, now, self.account_cooldown, r)
            time_str = self._format_remaining_time(self.account_cooldown)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many failed login attempts for this account. Access has been temporarily locked for {time_str} for your security. Please try again later."
            )

        remaining_attempts = max(0, self.account_max_fails - acc_fails)
        return (acc_fails, remaining_attempts)

    # ── Internal Cooldown / Attempt Calculations ────────────────────────

    def _get_account_cooldown_remaining(
        self, email: str, now: float, r, db: Optional[Session]
    ) -> float:
        # Check Redis first
        if r:
            try:
                ttl = r.ttl(f"ratelimit:login:lock:acc:{email}")
                if ttl and ttl > 0:
                    return float(ttl)
            except Exception as e:
                logger.warning("Redis error checking account cooldown: %s", e)

        # Check in-memory
        with self._lock:
            cooldown_until = self._account_cooldowns.get(email, 0.0)
            if cooldown_until > now:
                return cooldown_until - now
            elif email in self._account_cooldowns:
                del self._account_cooldowns[email]

        # Check DB ActivityLog as fallback for multi-process instances without Redis
        if db and ActivityLog:
            try:
                cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=self.account_cooldown)
                
                # Check if there is an intervening LOGIN_SUCCESS
                last_success = (
                    db.query(func.max(ActivityLog.timestamp))
                    .filter(
                        ActivityLog.action == "LOGIN_SUCCESS",
                        ActivityLog.details.like(f"%{email}%")
                    )
                    .scalar()
                )

                fail_query = db.query(ActivityLog.timestamp).filter(
                    ActivityLog.action == "LOGIN_FAILED",
                    ActivityLog.details.like(f"Email: {email}%"),
                    ActivityLog.timestamp >= cutoff
                )
                if last_success:
                    fail_query = fail_query.filter(ActivityLog.timestamp > last_success)

                recent_fails = [f[0] for f in fail_query.order_by(ActivityLog.timestamp.desc()).all()]
                if len(recent_fails) >= self.account_max_fails:
                    latest_fail_time = recent_fails[0].replace(tzinfo=timezone.utc).timestamp()
                    remaining = (latest_fail_time + self.account_cooldown) - now
                    if remaining > 0:
                        # Cache in memory
                        with self._lock:
                            self._account_cooldowns[email] = now + remaining
                        return remaining
            except Exception as e:
                logger.warning("DB check error for account cooldown: %s", e)

        return 0.0

    def _get_ip_cooldown_remaining(self, ip: str, now: float, r) -> float:
        if r:
            try:
                ttl = r.ttl(f"ratelimit:login:lock:ip:{ip}")
                if ttl and ttl > 0:
                    return float(ttl)
            except Exception as e:
                logger.warning("Redis error checking IP cooldown: %s", e)

        with self._lock:
            cooldown_until = self._ip_cooldowns.get(ip, 0.0)
            if cooldown_until > now:
                return cooldown_until - now
            elif ip in self._ip_cooldowns:
                del self._ip_cooldowns[ip]

        return 0.0

    def _check_and_record_ip_burst(self, ip: str, now: float, r) -> bool:
        """
        Record request and ensure requests per minute from this IP <= ip_burst_max.
        """
        if r:
            try:
                key = f"ratelimit:login:burst:ip:{ip}"
                cnt = r.incr(key)
                if cnt == 1:
                    r.expire(key, self.ip_burst_window)
                return cnt <= self.ip_burst_max
            except Exception as e:
                logger.warning("Redis error in ip_burst check: %s", e)

        with self._lock:
            history = self._ip_burst.get(ip, [])
            cutoff = now - self.ip_burst_window
            history = [t for t in history if t > cutoff]
            history.append(now)
            self._ip_burst[ip] = history

            # Prune memory periodically
            if len(self._ip_burst) > 500:
                self._ip_burst = {
                    k: v for k, v in self._ip_burst.items()
                    if v and v[-1] > cutoff
                }

            return len(history) <= self.ip_burst_max

    def _increment_account_failures(
        self, email: str, now: float, r, db: Optional[Session]
    ) -> int:
        mem_count = 0
        with self._lock:
            history = self._account_fails.get(email, [])
            cutoff = now - self.account_window
            history = [t for t in history if t > cutoff]
            history.append(now)
            self._account_fails[email] = history
            mem_count = len(history)

        redis_count = 0
        if r:
            try:
                key = f"ratelimit:login:fail:acc:{email}"
                redis_count = r.incr(key)
                if redis_count == 1:
                    r.expire(key, self.account_window)
            except Exception as e:
                logger.warning("Redis error incrementing account failures: %s", e)

        # Fallback to DB count if needed
        db_count = 0
        if db and ActivityLog and not r:
            try:
                cutoff = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=self.account_window)
                last_success = (
                    db.query(func.max(ActivityLog.timestamp))
                    .filter(
                        ActivityLog.action == "LOGIN_SUCCESS",
                        ActivityLog.details.like(f"%{email}%")
                    )
                    .scalar()
                )
                fail_query = db.query(func.count(ActivityLog.id)).filter(
                    ActivityLog.action == "LOGIN_FAILED",
                    ActivityLog.details.like(f"Email: {email}%"),
                    ActivityLog.timestamp >= cutoff
                )
                if last_success:
                    fail_query = fail_query.filter(ActivityLog.timestamp > last_success)
                db_count = fail_query.scalar() or 0
            except Exception as e:
                logger.warning("DB count error on account failure: %s", e)

        return max(mem_count, redis_count, db_count)

    def _increment_ip_failures(self, ip: str, now: float, r) -> int:
        mem_count = 0
        with self._lock:
            history = self._ip_fails.get(ip, [])
            cutoff = now - self.ip_fail_window
            history = [t for t in history if t > cutoff]
            history.append(now)
            self._ip_fails[ip] = history
            mem_count = len(history)

        redis_count = 0
        if r:
            try:
                key = f"ratelimit:login:fail:ip:{ip}"
                redis_count = r.incr(key)
                if redis_count == 1:
                    r.expire(key, self.ip_fail_window)
            except Exception as e:
                logger.warning("Redis error incrementing IP failures: %s", e)

        return max(mem_count, redis_count)

    def _set_account_cooldown(self, email: str, now: float, duration: int, r):
        with self._lock:
            self._account_cooldowns[email] = now + duration
            # Reset failures list to prevent immediate re-lock on expiry
            self._account_fails.pop(email, None)

        if r:
            try:
                r.setex(f"ratelimit:login:lock:acc:{email}", duration, str(now + duration))
                r.delete(f"ratelimit:login:fail:acc:{email}")
            except Exception as e:
                logger.warning("Redis error setting account cooldown: %s", e)

    def _set_ip_cooldown(self, ip: str, now: float, duration: int, r):
        with self._lock:
            self._ip_cooldowns[ip] = now + duration
            self._ip_fails.pop(ip, None)

        if r:
            try:
                r.setex(f"ratelimit:login:lock:ip:{ip}", duration, str(now + duration))
                r.delete(f"ratelimit:login:fail:ip:{ip}")
            except Exception as e:
                logger.warning("Redis error setting IP cooldown: %s", e)

    def reset(self):
        """Reset all in-memory rate limit records (primarily for test suites)."""
        with self._lock:
            self._account_fails.clear()
            self._account_cooldowns.clear()
            self._ip_burst.clear()
            self._ip_fails.clear()
            self._ip_cooldowns.clear()


# Default singleton instance
login_rate_limiter = LoginRateLimiter()
