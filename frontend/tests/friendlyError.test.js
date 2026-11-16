import assert from "node:assert/strict";
import test from "node:test";
import { friendlyText, getFriendlyErrorMessage } from "../src/utils/friendlyError.js";

const responseError = (detail, status = 500) => ({
  response: { status, data: { detail } },
  config: { method: "post", url: "/exams/generate" },
});

test("HTTP 500 preserves the actual server reason", () => {
  const detail = "Schedule generation failed. No available rooms for BSCS 4-101.";
  assert.equal(getFriendlyErrorMessage(responseError(detail)), detail);
});

test("developer details survive API and toast formatting unchanged", () => {
  const detail = "Schedule generation failed. Required data is missing. Developer details: KeyError: 'section_id'";
  assert.equal(friendlyText(getFriendlyErrorMessage(responseError(detail))), detail);
});

test("readable database explanations and timeout diagnostics are retained", () => {
  const detail = "Cannot connect to the database. Developer details: OperationalError: connection refused after timeout";
  assert.equal(friendlyText(getFriendlyErrorMessage(responseError(detail))), detail);
});

test("technical messages retain their original cause after repeated formatting", () => {
  const detail = "TypeError: 'NoneType' object is not subscriptable";
  const message = getFriendlyErrorMessage(responseError(detail));
  assert.ok(message.includes(detail));
  assert.equal(friendlyText(message), message);
});

test("constraint errors keep the specific field and constraint", () => {
  const detail = 'duplicate key violates unique constraint "users_email_key"';
  const message = friendlyText(detail);
  assert.ok(message.includes(detail));
  assert.equal(friendlyText(message), message);
});

test("network failures explain connectivity and retain request details", () => {
  const message = getFriendlyErrorMessage({ message: "Network Error", config: { method: "get", url: "/catalog/courses" } });
  assert.match(message, /Cannot reach the server/);
  assert.match(message, /Network Error/);
  assert.match(message, /GET \/catalog\/courses/);
  assert.equal(friendlyText(message), message);
});

test("client exceptions retain their actual reason", () => {
  assert.equal(getFriendlyErrorMessage(new Error("Unable to read the selected file")), "Unable to read the selected file");
});

test("FastAPI validation errors name the invalid fields", () => {
  const message = getFriendlyErrorMessage(responseError([
    { loc: ["body", "email"], msg: "Field required" },
    { loc: ["body", "semester"], msg: "Input should be a valid integer, unable to parse string as an integer" },
  ], 422));
  assert.equal(message, "Email is required. semester must be a number.");
});

test("structured and alternate server messages are displayed", () => {
  assert.equal(getFriendlyErrorMessage(responseError({ message: "Missing room capacity", code: "ROOM_CAPACITY" })), "Missing room capacity");
  assert.equal(getFriendlyErrorMessage({ response: { status: 503, data: { message: "Database pool exhausted" } } }), "Database pool exhausted");
});

test("plain text server errors retain the actual reason", () => {
  assert.equal(getFriendlyErrorMessage({ response: { status: 500, data: "No rooms are available" } }), "No rooms are available");
});

test("missing error descriptions identify the HTTP status and request", () => {
  const error = responseError(null);
  error.config.url += "?access_token=hidden-test-value";
  const message = getFriendlyErrorMessage(error);
  assert.match(message, /HTTP 500/);
  assert.match(message, /POST \/exams\/generate/);
  assert.doesNotMatch(message, /hidden-test-value/);
});

test("proxy HTML and bare internal server errors use actionable fallbacks", () => {
  const html = getFriendlyErrorMessage({ ...responseError(null, 502), response: { status: 502, data: "<html>Bad Gateway</html>" } });
  assert.match(html, /temporarily unavailable/);
  assert.match(html, /POST \/exams\/generate/);
  assert.doesNotMatch(html, /<html>/);
  assert.match(getFriendlyErrorMessage(responseError("Internal Server Error")), /HTTP 500/);
});
