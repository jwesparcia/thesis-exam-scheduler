"""Generation admission tests against an isolated SQLite database."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from threading import Barrier
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch


_test_directory = tempfile.TemporaryDirectory(prefix="exam-generation-test-")
_postgres_test_url = os.getenv("GENERATION_TEST_POSTGRES_URL")
os.environ["DATABASE_URL"] = f"sqlite:///{Path(_test_directory.name) / 'test.db'}"
os.environ["SECRET_KEY"] = "generation-lock-tests-only-isolated-secret-key-123456789"

from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import create_engine, text
from core import engine
from core import generation_lock
from routers import exams, scheduler


class GenerationLockTests(unittest.TestCase):
    def setUp(self):
        exams._generation_progress.clear()
        exams._generate_last_request.clear()
        self.user = SimpleNamespace(id=101)
        self.db = MagicMock()
        self.db.query.return_value.join.return_value.filter.return_value.count.return_value = 0
        self.db.query.return_value.filter.return_value.count.return_value = 1

    def queue(self, user=None, payload=None, db=None):
        tasks = BackgroundTasks()
        result = asyncio.run(exams.generate_schedule(
            background_tasks=tasks,
            payload=payload or {"job_id": "test-job"},
            db=db or self.db,
            current_user=user or self.user,
        ))
        return result, tasks

    def run_worker(self, tasks, scheduler_result=None, scheduler_error=None):
        worker_db = MagicMock()
        result = scheduler_result or {
            "total_exams": 1, "assigned_proctors": 1, "unassigned": 0,
        }
        with patch.object(exams, "SessionLocal", return_value=worker_db), \
                patch.object(exams, "generate_exam_schedule", return_value=result,
                             side_effect=scheduler_error), \
                patch.object(exams, "log_activity"):
            asyncio.run(tasks())
        return worker_db

    def test_simultaneous_admins_queue_exactly_one_job(self):
        barrier = Barrier(8)

        def request(index):
            barrier.wait(timeout=10)
            try:
                return self.queue(user=SimpleNamespace(id=index + 1),
                                  payload={"job_id": f"job-{index}"})
            except HTTPException as exc:
                return exc

        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(request, range(8)))
        accepted = [result for result in results if isinstance(result, tuple)]
        rejected = [result for result in results if isinstance(result, HTTPException)]
        try:
            self.assertEqual(len(accepted), 1)
            self.assertEqual(len(rejected), 7)
            self.assertTrue(all(exc.status_code == 409 for exc in rejected))
            self.assertTrue(exams.get_generate_status(self.user)["running"])
            # A loser cannot replace the accepted job's progress.
            self.assertEqual(len(exams._generation_progress), 1)
        finally:
            for _, tasks in accepted:
                self.run_worker(tasks)
        self.assertFalse(generation_lock.is_generation_ongoing())

    def test_cancel_keeps_lock_until_worker_stops(self):
        _, tasks = self.queue()
        exams.cancel_schedule_generation("test-job", self.user)
        try:
            self.assertTrue(generation_lock.is_generation_ongoing())
            with self.assertRaises(HTTPException) as rejected:
                self.queue(user=SimpleNamespace(id=202))
            self.assertEqual(rejected.exception.status_code, 409)
        finally:
            self.run_worker(tasks, scheduler_error=RuntimeError("cancelled by user"))
        self.assertFalse(generation_lock.is_generation_ongoing())

    def test_validation_and_rate_limit_failures_release_lock(self):
        with self.assertRaises(HTTPException) as invalid:
            self.queue(payload={"start_date": "2026-11-20", "end_date": "2026-11-19"})
        self.assertEqual(invalid.exception.status_code, 400)
        self.assertFalse(generation_lock.is_generation_ongoing())
        with self.assertRaises(HTTPException) as limited:
            self.queue()
        self.assertEqual(limited.exception.status_code, 429)
        self.assertFalse(generation_lock.is_generation_ongoing())
        _, tasks = self.queue(user=SimpleNamespace(id=202))
        self.run_worker(tasks)

    def test_existing_schedule_failure_releases_lock(self):
        self.db.query.return_value.join.return_value.filter.return_value.count.return_value = 5
        with self.assertRaises(HTTPException) as rejected:
            self.queue()
        self.assertEqual(rejected.exception.status_code, 409)
        self.assertFalse(generation_lock.is_generation_ongoing())

    def test_worker_error_releases_lock_and_rolls_back(self):
        _, tasks = self.queue()
        worker_db = self.run_worker(tasks, scheduler_error=RuntimeError("test worker failure"))
        worker_db.rollback.assert_called_once()
        worker_db.close.assert_called_once()
        self.assertFalse(generation_lock.is_generation_ongoing())
        self.assertEqual(exams._get_generation_progress("test-job")["status"], "failed")

    def test_worker_session_failure_releases_lock(self):
        _, tasks = self.queue()
        with patch.object(exams, "SessionLocal", side_effect=RuntimeError("test session failure")):
            asyncio.run(tasks())
        self.assertFalse(generation_lock.is_generation_ongoing())

    def test_worker_failure_progress_keeps_the_actual_error(self):
        _, tasks = self.queue()
        self.run_worker(tasks, scheduler_error=KeyError("section_id"))
        progress = exams.get_generate_progress("test-job", self.user)
        self.assertEqual(progress["status"], "failed")
        self.assertIn("Schedule generation failed", progress["detail"])
        self.assertIn("KeyError: 'section_id'", progress["detail"])
        self.assertNotIn("Something went wrong", progress["detail"])
        self.assertFalse(generation_lock.is_generation_ongoing())

    def test_legacy_endpoint_uses_same_lock(self):
        route = next(route for route in scheduler.router.routes if route.path == "/scheduler/generate")
        dependency = route.dependencies[0].dependency
        self.assertIs(dependency, generation_lock.require_generation_lock)
        lease = generation_lock.try_acquire_generation_lock()
        try:
            with self.assertRaises(HTTPException) as rejected:
                next(dependency())
            self.assertEqual(rejected.exception.status_code, 409)
        finally:
            lease.release()
        request_guard = dependency()
        next(request_guard)
        try:
            with self.assertRaises(HTTPException) as rejected:
                self.queue()
            self.assertEqual(rejected.exception.status_code, 409)
        finally:
            request_guard.close()
        self.assertFalse(generation_lock.is_generation_ongoing())

    def test_lock_is_shared_with_another_process_without_redis(self):
        script = (
            "from core.generation_lock import try_acquire_generation_lock; "
            "lease = try_acquire_generation_lock(); "
            "print('ACQUIRED' if lease else 'BUSY', flush=True); "
            "lease.release() if lease else None"
        )

        def attempt():
            return subprocess.run(
                [sys.executable, "-c", script], cwd=Path(__file__).parent,
                capture_output=True, text=True, check=True, timeout=20,
            ).stdout.strip().splitlines()[-1]

        lease = generation_lock.try_acquire_generation_lock()
        try:
            self.assertEqual(attempt(), "BUSY")
        finally:
            lease.release()
        self.assertEqual(attempt(), "ACQUIRED")

    def test_process_exit_does_not_leave_stale_lock(self):
        script = (
            "from core.generation_lock import try_acquire_generation_lock; "
            "lease = try_acquire_generation_lock(); "
            "print('ACQUIRED' if lease else 'BUSY', flush=True); "
            "input()"
        )
        process = subprocess.Popen(
            [sys.executable, "-c", script], cwd=Path(__file__).parent,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True,
        )
        try:
            output, errors = process.communicate("\n", timeout=20)
            self.assertEqual(process.returncode, 0, errors)
            self.assertEqual(output.strip().splitlines()[-1], "ACQUIRED")
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate(timeout=5)
        self.assertFalse(generation_lock.is_generation_ongoing())


@unittest.skipUnless(_postgres_test_url, "Set GENERATION_TEST_POSTGRES_URL for PostgreSQL lock checks")
class PostgresGenerationLockTests(unittest.TestCase):
    """Exercise real advisory locks with an isolated key; never alter app data."""

    def setUp(self):
        self.pg_engine = create_engine(_postgres_test_url, pool_pre_ping=True)
        self.params = {"namespace": 1163411789, "key": int.from_bytes(os.urandom(4), "big") % (2 ** 31)}
        self.engine_patch = patch.object(generation_lock, "engine", self.pg_engine)
        self.key_patch = patch.object(generation_lock, "_PG_LOCK_PARAMS", self.params)
        self.engine_patch.start()
        self.key_patch.start()

    def tearDown(self):
        self.key_patch.stop()
        self.engine_patch.stop()
        self.pg_engine.dispose()

    def test_only_one_connection_can_hold_generation_across_worker_commits(self):
        barrier = Barrier(8)

        def acquire(_):
            barrier.wait(timeout=10)
            return generation_lock.try_acquire_generation_lock()

        with ThreadPoolExecutor(max_workers=8) as executor:
            leases = list(executor.map(acquire, range(8)))
        acquired = [lease for lease in leases if lease is not None]
        try:
            self.assertEqual(len(acquired), 1)
            with self.pg_engine.begin() as worker_connection:
                worker_connection.execute(text("SELECT 1"))
            self.assertTrue(generation_lock.is_generation_ongoing())
        finally:
            for lease in acquired:
                lease.release()
        self.assertFalse(generation_lock.is_generation_ongoing())

    def test_other_process_is_blocked_and_exit_releases_advisory_lock(self):
        script = (
            "from core import generation_lock as guard; "
            f"guard._PG_LOCK_PARAMS = {self.params!r}; "
            "lease = guard.try_acquire_generation_lock(); "
            "print('ACQUIRED' if lease else 'BUSY', flush=True)"
        )
        child_env = dict(os.environ, DATABASE_URL=_postgres_test_url)

        def attempt():
            result = subprocess.run(
                [sys.executable, "-c", script], cwd=Path(__file__).parent,
                env=child_env, capture_output=True, text=True, check=True, timeout=20,
            )
            return result.stdout.strip().splitlines()[-1]

        lease = generation_lock.try_acquire_generation_lock()
        try:
            self.assertEqual(attempt(), "BUSY")
        finally:
            lease.release()
        self.assertEqual(attempt(), "ACQUIRED")
        self.assertFalse(generation_lock.is_generation_ongoing())


if __name__ == "__main__":
    try:
        unittest.main()
    finally:
        engine.dispose()
        _test_directory.cleanup()
