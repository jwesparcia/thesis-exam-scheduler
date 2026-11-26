import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { attendancePhotoError, hasCurrentAttendanceProof, MAX_ATTENDANCE_PHOTO_BYTES } from "../src/utils/attendanceProof.js";
import { buildStudentAttendanceSheet } from "../src/utils/studentAttendancePrint.js";

test("only an uploaded photo matching the assignment unlocks attendance", () => {
  assert.equal(hasCurrentAttendanceProof({}), false);
  assert.equal(hasCurrentAttendanceProof({ attendance_proof: { matches_assignment: false } }), false);
  assert.equal(hasCurrentAttendanceProof({ attendance_proof: { matches_assignment: true } }), true);
});

test("empty, oversized and unsupported photo selections explain the problem", () => {
  assert.match(attendancePhotoError(null), /Choose a photo/);
  assert.match(attendancePhotoError({ size: 0, type: "image/png" }), /Choose a photo/);
  assert.match(attendancePhotoError({ size: MAX_ATTENDANCE_PHOTO_BYTES + 1, type: "image/jpeg" }), /10 MB/);
  assert.match(attendancePhotoError({ size: 100, type: "image/svg+xml" }), /JPG, PNG, or WebP/);
});

test("common camera photo types and files without a reported MIME type can be submitted for server validation", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp", ""]) {
    assert.equal(attendancePhotoError({ size: 100, type }), "");
  }
});

let server;
let Upload;
let Photo;
let ToastProvider;
before(async () => {
  server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, hmr: false } });
  ({ default: Upload } = await server.ssrLoadModule("/src/components/AttendanceProofUpload.jsx"));
  ({ default: Photo } = await server.ssrLoadModule("/src/components/AttendanceProofPhoto.jsx"));
  ({ ToastProvider } = await server.ssrLoadModule("/src/context/ToastContext.jsx"));
});
after(async () => { await server?.close(); });

const exam = { id: 1, proctor_id: 2, room: "B501", subject_name: "Accounting", section_name: "BA 1-101", proctor_attendance: "pending" };
const proof = { url: "/proctors/2/attendance-proof/1", uploaded_at: "2030-01-10T01:00:00Z", room: "B501", matches_assignment: true };
const renderUpload = (row) => renderToStaticMarkup(React.createElement(ToastProvider, null,
  React.createElement(Upload, { exam: row, onUploaded: () => {} })));

test("proctors are instructed to include the signed exam list in the proof photo before confirming", () => {
  const markup = renderUpload(exam);
  assert.match(markup, /Upload proof photo/);
  assert.match(markup, /B501/);
  assert.match(markup, /After taking attendance, sign the exam attendance list/);
  assert.match(markup, /Before confirming attendance,[\s\S]*with the signed list visible/);
  assert.match(markup, /Confirm before the exam ends/);
  assert.match(markup, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.doesNotMatch(markup, /ready to confirm/);
});

test("the printed attendance list provides a named proctor signature block in addition to student signatures", () => {
  const html = buildStudentAttendanceSheet({ ...exam, proctor_name: "A. Cruz & Co." }, [{ name: "Test Student" }]);
  assert.match(html, /<td class="signature"><\/td>/);
  assert.match(html, /<div class="verification-line">A\. Cruz &amp; Co\.<\/div>\s*<p class="verification-label">Proctor name<\/p>/);
  assert.match(html, /<div class="verification-line"><\/div>\s*<p class="verification-label">Proctor signature<\/p>/);
  assert.match(html, /sign this list and include it in your proof photo/);

  const unassigned = buildStudentAttendanceSheet({ ...exam, proctor_name: "Unassigned" }, []);
  assert.match(unassigned, /<div class="verification-line"><\/div>\s*<p class="verification-label">Proctor name<\/p>/);
});

test("successful proof is viewable and clearly marked ready", () => {
  const markup = renderUpload({ ...exam, attendance_proof: proof });
  assert.match(markup, /View proof photo/);
  assert.match(markup, /Replace proof photo/);
  assert.match(markup, /ready to confirm during the exam/);
});

test("confirmed attendance keeps the photo view but removes replacement controls", () => {
  const markup = renderUpload({ ...exam, proctor_attendance: "confirmed", attendance_proof: proof });
  assert.match(markup, /View proof photo/);
  assert.doesNotMatch(markup, /type="file"/);
  assert.doesNotMatch(markup, /Replace proof photo/);
});

test("admin monitoring distinguishes missing photos from viewable proof", () => {
  assert.match(renderToStaticMarkup(React.createElement(Photo, { exam })), /No photo uploaded/);
  assert.match(renderToStaticMarkup(React.createElement(Photo, { exam: { ...exam, attendance_proof: proof } })), /View proof photo/);
});
