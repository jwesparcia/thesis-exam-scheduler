import { escapeHtml } from "./printDocument.js";

export function buildStudentAttendanceSheet(exam, students, generatedAt = new Date().toLocaleString()) {
  const proctorName = exam.proctor_name === "Unassigned" ? "" : escapeHtml(exam.proctor_name);
  const rows = students.map((student, index) => `
    <tr>
      <td class="number">${index + 1}</td>
      <td class="student-name">${escapeHtml(student.display_name || student.name)}</td>
      <td class="student-id">${escapeHtml(student.student_id || "-")}</td>
      <td>${student.student_type === "irregular" ? "Irregular" : "Regular"}</td>
      <td class="signature"></td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Exam Attendance List</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #111; font-family: Arial, sans-serif; font-size: 9pt; line-height: 1.2; }
    main { width: 100%; max-width: 190mm; margin: 0 auto; }
    h1 { margin: 0 0 1mm; font-size: 14pt; }
    .subject { margin: 0 0 1.5mm; font-size: 10pt; font-weight: bold; }
    .meta { margin: 0; font-size: 9pt; font-weight: normal; line-height: 1.4; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead { display: table-header-group; }
    .exam-heading { padding: 0 0 3mm; border: 0; background: white; }
    th { background: #eee; text-align: left; font-weight: bold; }
    th, td { border: 1px solid #bbb; padding: 0.8mm 1.5mm; vertical-align: middle; overflow-wrap: anywhere; }
    td { height: 5.5mm; }
    .number { text-align: center; }
    .student-id { font-variant-numeric: tabular-nums; }
    .signature { background: white; }
    .proctor-verification { margin: 4mm 0 0; break-inside: avoid; break-before: avoid; }
    .verification-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; align-items: end; }
    .verification-line { min-height: 9mm; padding: 2mm 0 0.5mm; border-bottom: 1px solid #333; overflow-wrap: anywhere; }
    .verification-label { margin: 1mm 0 0; font-weight: bold; }
    .verification-instructions { margin: 2mm 0 0; }
    .footer { margin: 2mm 0 0; color: #555; font-size: 8pt; break-inside: avoid; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    @media print { th { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
  </style>
</head>
<body>
  <main>
    <table>
      <colgroup>
        <col style="width: 6%" /><col style="width: 39%" /><col style="width: 19%" />
        <col style="width: 14%" /><col style="width: 22%" />
      </colgroup>
      <thead>
        <tr><th colspan="5" class="exam-heading">
          <h1>Exam Attendance List</h1>
          <p class="subject">${escapeHtml(exam.subject_code)} - ${escapeHtml(exam.subject_name)}${Number.isInteger(exam.batch_number) && exam.batch_number > 1 ? ` · Batch ${exam.batch_number}` : ""}</p>
          <p class="meta">
            Section: ${escapeHtml(exam.section_name)}${exam.is_rescheduled ? " (Rescheduled)" : ""}
            &nbsp; | &nbsp; Room: ${escapeHtml(exam.room || "Unassigned")}<br />
            Date: ${escapeHtml(exam.exam_date)} &nbsp; | &nbsp;
            Time: ${escapeHtml(exam.start_time)} - ${escapeHtml(exam.end_time)}<br />
            <strong>Proctor: ${escapeHtml(exam.proctor_name || "Unassigned")}</strong>
          </p>
        </th></tr>
        <tr><th>#</th><th>Student Name</th><th>Student ID</th><th>Type</th><th>Signature</th></tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5">No students assigned to this exam.</td></tr>'}</tbody>
    </table>
    <section class="proctor-verification" aria-label="Proctor attendance verification">
      <div class="verification-fields">
        <div>
          <div class="verification-line">${proctorName}</div>
          <p class="verification-label">Proctor name</p>
        </div>
        <div>
          <div class="verification-line"></div>
          <p class="verification-label">Proctor signature</p>
        </div>
      </div>
      <p class="verification-instructions">After taking attendance, sign this list and include it in your proof photo. Confirm attendance before the exam ends.</p>
    </section>
    <p class="footer">Total: ${students.length} student(s) | Generated: ${escapeHtml(generatedAt)}</p>
  </main>
</body>
</html>`;
}
