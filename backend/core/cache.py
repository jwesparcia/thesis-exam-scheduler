"""
core/cache.py
─────────────────────────────────────────────────────────
Redis cache manager for the Exam Scheduler backend.

Strategy : Cache-Aside
  1. Check Redis on every read.
  2. Cache MISS → query PostgreSQL → serialize → store in Redis.
  3. Cache HIT  → return cached JSON directly.

Failure policy : Redis is treated as a performance optimisation only.
  Any Redis error is caught, logged, and the caller falls back to
  PostgreSQL automatically.  The API never crashes because of Redis.

Serialisation : All values are stored as UTF-8 JSON strings.
  ORM objects must be converted to plain dicts/lists BEFORE calling
  set().  get() returns the already-deserialised Python object.

Stampede prevention : A lightweight "soft lock" using SET NX lets
  one thread populate a hot entry while concurrent threads wait briefly
  and then re-check the cache.  This keeps the DB from being hammered
  on a popular key expiry.
"""

import json
import logging
import os
import time as _time
from typing import Any, Optional

import redis
from dotenv import load_dotenv

# ── env ──────────────────────────────────────────────────────────────
_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(os.path.dirname(_BASE_DIR), ".env"))

REDIS_HOST     = os.getenv("REDIS_HOST", "localhost")
REDIS_PORT     = int(os.getenv("REDIS_PORT", "6379"))
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD") or None   # None disables AUTH
REDIS_DB       = int(os.getenv("REDIS_DB", "0"))

# ── logging ──────────────────────────────────────────────────────────
logger = logging.getLogger("cache")

# ── TTL constants (seconds) ───────────────────────────────────────────
TTL_STATIC          = 1800   # 30 min  – courses, year_levels (rarely change)
TTL_ROOMS           = 900    # 15 min  – rooms list
TTL_CATALOG_DETAILS = 1200   # 20 min  – section/subject detail dropdowns
TTL_RULES           = 600    # 10 min  – distribution rules
TTL_CATALOG_STATS   = 300    # 5 min   – admin dashboard counts
TTL_PROCTORS        = 300    # 5 min   – proctor list / schedules
TTL_MONITORING      = 180    # 3 min   – proctor monitoring (attendance changes)
TTL_EXAM_SCHEDULE   = 300    # 5 min   – student posted exam schedules
TTL_EXAMS_POSTED    = 180    # 3 min   – admin/proctor full exam list
TTL_EXAM_COUNT      = 120    # 2 min   – exam count check (used to block regen)

# Soft-lock TTL (seconds a fill-lock lives before expiring automatically)
_LOCK_TTL = 10


class CacheManager:
    """
    Thread-safe Redis cache manager backed by a connection pool.
    All public methods swallow Redis exceptions and return None / False
    so callers can always fall back to PostgreSQL gracefully.
    """

    def __init__(self) -> None:
        self._pool: Optional[redis.ConnectionPool] = None
        self._client: Optional[redis.Redis] = None
        self._available = False

    # ── lifecycle ────────────────────────────────────────────────────

    def connect(self) -> bool:
        """
        Create the connection pool and verify Redis is reachable.
        Returns True on success, False if Redis is unavailable.
        Called once at application startup.
        """
        try:
            self._pool = redis.ConnectionPool(
                host=REDIS_HOST,
                port=REDIS_PORT,
                password=REDIS_PASSWORD,
                db=REDIS_DB,
                decode_responses=True,       # all values are str
                max_connections=20,
                socket_connect_timeout=2,
                socket_timeout=2,
                retry_on_timeout=False,
            )
            self._client = redis.Redis(connection_pool=self._pool)
            self._client.ping()
            self._available = True
            logger.info(
                "Redis connected - %s:%s db=%s", REDIS_HOST, REDIS_PORT, REDIS_DB
            )
            return True
        except Exception as exc:
            logger.warning("Redis unavailable at startup: %s - caching disabled", exc)
            self._available = False
            return False

    def disconnect(self) -> None:
        """Close the connection pool gracefully. Called at application shutdown."""
        try:
            if self._pool:
                self._pool.disconnect()
                logger.info("Redis connection pool closed.")
        except Exception as exc:
            logger.warning("Redis disconnect error: %s", exc)

    @property
    def is_available(self) -> bool:
        return self._available

    # ── core operations ───────────────────────────────────────────────

    def get(self, key: str) -> Optional[Any]:
        """
        Retrieve and deserialise a cached value.
        Returns the Python object on HIT, None on MISS or error.
        """
        if not self._available or self._client is None:
            return None
        try:
            raw = self._client.get(key)
            if raw is None:
                logger.debug("CACHE MISS  %s", key)
                return None
            logger.debug("CACHE HIT   %s", key)
            return json.loads(raw)
        except redis.RedisError as exc:
            logger.warning("Redis GET error [%s]: %s", key, exc)
            return None
        except json.JSONDecodeError as exc:
            logger.warning("Cache deserialise error [%s]: %s", key, exc)
            return None

    def set(self, key: str, value: Any, ttl: int) -> bool:
        """
        Serialise *value* (dict or list) and store it in Redis with the
        given TTL (seconds).  Returns True on success.
        """
        if not self._available or self._client is None:
            return False
        try:
            self._client.setex(key, ttl, json.dumps(value, default=str))
            logger.debug("CACHE SET   %s (ttl=%ss)", key, ttl)
            return True
        except redis.RedisError as exc:
            logger.warning("Redis SET error [%s]: %s", key, exc)
            return False

    def delete(self, *keys: str) -> int:
        """
        Delete one or more exact keys.  Returns the number deleted.
        """
        if not self._available or self._client is None or not keys:
            return 0
        try:
            count = self._client.delete(*keys)
            logger.debug("CACHE DEL   %s", keys)
            return count
        except redis.RedisError as exc:
            logger.warning("Redis DEL error %s: %s", keys, exc)
            return 0

    def delete_pattern(self, pattern: str) -> int:
        """
        Delete all keys matching *pattern* (e.g. "exam_schedule:section:*").
        Uses SCAN to avoid blocking the server.
        Returns the number of keys deleted.
        """
        if not self._available or self._client is None:
            return 0
        try:
            deleted = 0
            cursor = 0
            while True:
                cursor, keys = self._client.scan(cursor=cursor, match=pattern, count=100)
                if keys:
                    deleted += self._client.delete(*keys)
                if cursor == 0:
                    break
            if deleted:
                logger.debug("CACHE DEL pattern=%s  deleted=%d", pattern, deleted)
            return deleted
        except redis.RedisError as exc:
            logger.warning("Redis SCAN/DEL error [%s]: %s", pattern, exc)
            return 0

    # ── stampede prevention ───────────────────────────────────────────

    def acquire_fill_lock(self, key: str) -> bool:
        """
        Try to acquire a short-lived fill lock for *key* using SET NX.
        Returns True if this caller won the lock (should populate cache).
        Returns False if another caller holds the lock.
        """
        if not self._available or self._client is None:
            return True   # no Redis → caller always "wins" (goes to DB)
        lock_key = f"_lock:{key}"
        try:
            result = self._client.set(lock_key, "1", ex=_LOCK_TTL, nx=True)
            return result is True
        except redis.RedisError:
            return True   # on error, let the caller proceed to DB

    def wait_for_fill(self, key: str, retries: int = 5, delay: float = 0.1) -> Optional[Any]:
        """
        Wait briefly for another thread to populate *key*, then return
        the cached value.  Returns None if the value is still missing.
        """
        for _ in range(retries):
            _time.sleep(delay)
            value = self.get(key)
            if value is not None:
                return value
        return None

    # ── convenience invalidation helpers ─────────────────────────────

    def invalidate_exam_schedules(self) -> None:
        """Invalidate all posted-exam schedule caches (triggered by generate/post/clear)."""
        self.delete_pattern("exam_schedule:section:*")
        self.delete_pattern("exam_schedule:irregular:*")
        self.delete_pattern("exams:posted:*")
        self.delete_pattern("exam_count:*")
        self.delete("proctors:monitoring")

    def invalidate_rooms(self) -> None:
        """Invalidate room list caches."""
        self.delete("rooms:all")
        self.delete_pattern("rooms:department:*")

    def invalidate_catalog(self) -> None:
        """Invalidate all catalog reference data (triggered by bulk upload/clear)."""
        self.delete("courses:all")
        self.delete("year_levels:all")
        self.delete("catalog:stats")
        self.delete("catalog:student_stats")
        self.delete_pattern("catalog:details:*")
        self.invalidate_rooms()
        self.delete_pattern("exam_schedule:section:*")
        self.delete_pattern("exam_schedule:irregular:*")
        self.delete_pattern("exams:posted:*")
        self.delete_pattern("exam_count:*")

    def invalidate_proctors(self) -> None:
        """Invalidate proctor-related caches."""
        self.delete("proctors:all")
        self.delete("proctors:schedules")
        self.delete("proctors:missing_schedules")

    def invalidate_monitoring(self) -> None:
        """Invalidate proctor monitoring cache."""
        self.delete("proctors:monitoring")


# ── singleton ─────────────────────────────────────────────────────────
cache = CacheManager()
