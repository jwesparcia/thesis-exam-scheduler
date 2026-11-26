import { getExamTermLabel } from "./examTerms.js";
import { escapeHtml } from "./printDocument.js";

export function buildExamScheduleSheet({ title, name, exams, includeProctor }) {
  const { term, semester } = exams[0];
  const departments = [...new Set(exams.map(exam => exam.department).filter(Boolean))];
  const scheduleLabel = [
    getExamTermLabel(term) || "Unspecified term",
    departments.join(", "),
    semester ? `Semester ${semester}` : "",
  ].filter(Boolean).join(" · ");

  const columns = ["Course", "Program", "Section", "Date", "Time", "Room"];
  if (includeProctor) columns.push("Assigned proctor");

  const rows = exams.map((exam) => {
    const course = [exam.subject_code, exam.subject_name].filter(Boolean).join(" – ");
    const batch = Number.isInteger(exam.batch_number) && exam.batch_number > 1
      ? `<br />Batch ${exam.batch_number}` : "";
    const time = exam.start_time && exam.end_time && exam.start_time !== "-"
      ? `${exam.start_time} – ${exam.end_time}` : "—";
    const proctor = includeProctor ? `<td>${escapeHtml(exam.proctor || "Unassigned")}</td>` : "";

    return `<tr>
      <td>${escapeHtml(course || "—")}${batch}</td>
      <td>${escapeHtml(exam.course_name || "—")}</td>
      <td>${escapeHtml(exam.section_name || "—")}</td>
      <td>${escapeHtml(exam.exam_date || "—")}</td>
      <td>${escapeHtml(time)}</td>
      <td>${escapeHtml(exam.room || "Unassigned")}</td>
      ${proctor}
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 landscape; margin: 12mm; }
    body { margin: 0; background: #fff; color: #111; font: 10pt/1.4 Arial, sans-serif; }
    main { max-width: 273mm; margin: 0 auto; }
    h1 { margin: 0 0 2mm; font-size: 17pt; }
    p { margin: 0 0 1mm; }
    table { width: 100%; margin-top: 5mm; border-collapse: collapse; }
    thead { display: table-header-group; }
    th, td { border: 1px solid #aaa; padding: 2mm; text-align: left; vertical-align: top; overflow-wrap: anywhere; }
    th { background: #eee; print-color-adjust: exact; }
    tr { break-inside: avoid; }
    @media screen { body { padding: 16px; } }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    ${name ? `<p><strong>${escapeHtml(name)}</strong></p>` : ""}
    <p>${escapeHtml(scheduleLabel)}</p>
    <table>
      <thead><tr>${columns.map((column) => `<th scope="col">${column}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </main>
</body>
</html>`;
}
