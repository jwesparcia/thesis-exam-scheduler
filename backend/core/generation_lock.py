"""Exclusive generation admission, independent of optional progress caching."""

import errno
import hashlib
import os
from pathlib import Path
import tempfile
from threading import Lock

from fastapi import HTTPException
from sqlalchemy import text

from .database import engine


GENERATION_BUSY_DETAIL = (
    "An admin is already generating an exam schedule. "
    "Please wait for the current generation to finish before starting another."
)
# A fixed application namespace and key, shared by every worker and endpoint.
_PG_LOCK_PARAMS = {"namespace": 1163411789, "key": 1195724357}
_memory_lock = Lock()


class GenerationLease:
    def __init__(self, release):
        self._release = release

    def release(self):
        if self._release is not None:
            release, self._release = self._release, None
            release()


def try_acquire_generation_lock():
    """Atomically reserve generation; return None if another job owns it.

    PostgreSQL holds a session advisory lock on a dedicated connection, so
    scheduler commits cannot release it. SQLite file databases use an OS file
    lock shared by local workers. Both are released if the owning process exits.
    """
    if engine.dialect.name == "postgresql":
        connection = engine.connect()
        try:
            acquired = connection.execute(
                text("SELECT pg_try_advisory_lock(:namespace, :key)"),
                _PG_LOCK_PARAMS,
            ).scalar_one()
            connection.commit()
            if not acquired:
                connection.close()
                return None
        except Exception:
            # Never return a potentially locked session to the connection pool.
            connection.invalidate()
            connection.close()
            raise

        def release():
            try:
                connection.execute(
                    text("SELECT pg_advisory_unlock(:namespace, :key)"),
                    _PG_LOCK_PARAMS,
                )
                connection.commit()
            except Exception:
                connection.invalidate()
                raise
            finally:
                connection.close()

        return GenerationLease(release)

    if engine.dialect.name != "sqlite":
        raise RuntimeError("Generation locking requires PostgreSQL or SQLite.")

    database = engine.url.database
    if not database or database == ":memory:":
        if not _memory_lock.acquire(blocking=False):
            return None
        return GenerationLease(_memory_lock.release)

    database_path = os.path.normcase(str(Path(database).resolve()))
    database_key = hashlib.sha256(database_path.encode()).hexdigest()
    lock_path = Path(tempfile.gettempdir()) / f"exam-generation-{database_key}.lock"
    lock_file = lock_path.open("a+b")
    try:
        if os.name == "nt":
            import msvcrt

            msvcrt.locking(lock_file.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(lock_file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        lock_file.close()
        if exc.errno in (errno.EACCES, errno.EAGAIN, errno.EDEADLK):
            return None
        raise
    return GenerationLease(lock_file.close)


def is_generation_ongoing():
    lease = try_acquire_generation_lock()
    if lease is None:
        return True
    lease.release()
    return False


def require_generation_lock():
    """Keep synchronous generation protected for the whole request."""
    lease = try_acquire_generation_lock()
    if lease is None:
        raise HTTPException(status_code=409, detail=GENERATION_BUSY_DETAIL)
    try:
        yield lease
    finally:
        lease.release()
