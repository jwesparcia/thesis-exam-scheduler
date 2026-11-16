"""Error reporting checks that do not connect to the application database."""

import asyncio
import json
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError, ProgrammingError

from utils.errors import add_error_reporting, humanize_error


class ErrorMessageTests(unittest.TestCase):
    def setUp(self):
        logger_patch = patch("utils.errors.logger")
        self.logger = logger_patch.start()
        self.addCleanup(logger_patch.stop)

    def test_missing_key_reports_readable_reason_and_actual_key(self):
        message = humanize_error(KeyError("section_id"), "Schedule generation failed")
        self.assertIn("Schedule generation failed", message)
        self.assertIn("Required data is missing", message)
        self.assertIn("KeyError: 'section_id'", message)
        self.logger.error.assert_called_once()

    def test_type_error_retains_the_failing_operation(self):
        message = humanize_error(TypeError("'NoneType' object is not subscriptable"))
        self.assertIn("unexpected type", message)
        self.assertIn("TypeError: 'NoneType' object is not subscriptable", message)

    def test_unknown_exception_keeps_actual_cause(self):
        message = humanize_error(ZeroDivisionError("division by zero"))
        self.assertIn("ZeroDivisionError: division by zero", message)
        self.assertNotIn("Something went wrong", message)

    def test_application_validation_messages_are_preserved_even_when_long(self):
        reason = "No available rooms for the following sections: " + ", ".join(f"BSCS 4-{n}" for n in range(101, 150))
        self.assertEqual(humanize_error(ValueError(reason), "Generation failed"), f"Generation failed. {reason}")

    def test_http_error_keeps_specific_validation_reason(self):
        reason = "A Midterm schedule already exists (5 exams). Please select another term."
        self.assertEqual(humanize_error(HTTPException(409, reason)), reason)

    def test_database_schema_error_is_not_mislabeled_as_connection_failure(self):
        error = ProgrammingError(
            "SELECT password FROM users", {"password": "private-test-value"},
            Exception('column exams.batch_number does not exist\nLINE 1: SELECT password FROM users'),
        )
        message = humanize_error(error)
        self.assertIn("database schema", message)
        self.assertIn("exams.batch_number", message)
        self.assertIn("ProgrammingError", message)
        self.assertNotIn("Cannot connect", message)
        self.assertNotIn("SELECT", message)
        self.assertNotIn("private-test-value", message)

    def test_database_constraint_keeps_the_column_and_constraint(self):
        error = IntegrityError(
            "INSERT INTO exams", {"secret": "hidden-test-value"},
            Exception('null value in column "room_id" violates not-null constraint'),
        )
        message = humanize_error(error)
        self.assertIn("A required value is missing", message)
        self.assertIn('column "room_id"', message)
        self.assertIn("IntegrityError", message)
        self.assertNotIn("INSERT INTO", message)
        self.assertNotIn("hidden-test-value", message)

    def test_credentials_are_redacted_from_diagnostics(self):
        message = humanize_error(Exception(
            "connection refused postgresql://admin:db-test-secret@db.test/exams "
            "password='named-test-secret' access_token=token-test-secret "
            "Authorization: Bearer bearer-test-secret"
        ))
        self.assertIn("connection refused", message)
        self.assertIn("[redacted]", message)
        for secret in ("db-test-secret", "named-test-secret", "token-test-secret", "bearer-test-secret"):
            self.assertNotIn(secret, message)


class RequestErrorReportingTests(unittest.TestCase):
    def setUp(self):
        logger_patch = patch("utils.errors.logger")
        logger_patch.start()
        self.addCleanup(logger_patch.stop)
        self.app = FastAPI()
        add_error_reporting(self.app)
        self.app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"])

        @self.app.get("/broken")
        async def broken():
            raise KeyError("room_id")

        @self.app.get("/validation")
        async def validation():
            raise HTTPException(409, "A Midterm schedule already exists.")

        @self.app.get("/ok")
        async def ok():
            return {"status": "accepted", "job_id": "unchanged"}

    def request(self, path):
        # Exercise the actual ASGI stack without an HTTP client dependency.
        async def run():
            messages = []
            complete = asyncio.Event()

            async def receive():
                await complete.wait()
                return {"type": "http.disconnect"}

            async def send(message):
                messages.append(message)
                if message["type"] == "http.response.body" and not message.get("more_body", False):
                    complete.set()

            scope = {
                "type": "http", "asgi": {"version": "3.0", "spec_version": "2.3"},
                "http_version": "1.1", "method": "GET", "scheme": "http",
                "path": path, "raw_path": path.encode(), "query_string": b"",
                "headers": [(b"origin", b"http://localhost:5173")],
                "client": ("127.0.0.1", 1234), "server": ("testserver", 80),
            }
            await asyncio.wait_for(self.app(scope, receive, send), timeout=3)
            start = next(item for item in messages if item["type"] == "http.response.start")
            body = b"".join(item.get("body", b"") for item in messages if item["type"] == "http.response.body")
            return SimpleNamespace(status=start["status"], headers=dict(start["headers"]), data=json.loads(body))

        return asyncio.run(run())

    def test_uncaught_error_has_actual_cause_and_cors_headers(self):
        response = self.request("/broken")
        self.assertEqual(response.status, 500)
        self.assertIn("GET /broken failed", response.data["detail"])
        self.assertIn("KeyError: 'room_id'", response.data["detail"])
        self.assertEqual(response.headers[b"access-control-allow-origin"], b"http://localhost:5173")

    def test_expected_http_error_preserves_status_and_detail(self):
        response = self.request("/validation")
        self.assertEqual(response.status, 409)
        self.assertEqual(response.data["detail"], "A Midterm schedule already exists.")

    def test_successful_response_is_unchanged(self):
        response = self.request("/ok")
        self.assertEqual(response.status, 200)
        self.assertEqual(response.data, {"status": "accepted", "job_id": "unchanged"})


if __name__ == "__main__":
    unittest.main()
