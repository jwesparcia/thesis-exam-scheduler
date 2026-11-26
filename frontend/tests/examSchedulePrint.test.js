import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import useExamTermSchedule from "../src/hooks/useExamTermSchedule.js";
import { buildExamScheduleSheet } from "../src/utils/examSchedulePrint.js";
import { getExamPeriodKey } from "../src/utils/examTerms.js";

const exam = {
  term: "ST1",
  department: "SHS",
  semester: 2,
  subject_code: "SCI1",
  subject_name: "Research & Writing",
  course_name: "STEM",
  section_name: "SHS 12A",
  batch_number: 2,
  exam_date: "Tuesday, December 15, 2026",
  start_time: "07:30 AM",
  end_time: "09:00 AM",
  room: "Lab <A>",
  proctor: "A. Teacher",
};

test("the student printout contains the term and exam details with escaped text", () => {
  const html = buildExamScheduleSheet({ title: "Exam Schedule", name: "R. <Student>", exams: [exam], includeProctor: true });
  assert.match(html, /Summative Test 1 \(ST1\) · SHS · Semester 2/);
  assert.match(html, /R\. &lt;Student&gt;/);
  assert.match(html, /SCI1 – Research &amp; Writing<br \/>Batch 2/);
  assert.match(html, /SHS 12A/);
  assert.match(html, /Tuesday, December 15, 2026/);
  assert.match(html, /07:30 AM – 09:00 AM/);
  assert.match(html, /Lab &lt;A&gt;/);
  assert.match(html, /Assigned proctor/);
  assert.match(html, /A\. Teacher/);
});

test("the proctor printout includes every course in the selected period across programs", () => {
  const prelim = { ...exam, term: "Prelim", department: "ICT", course_name: "BSIT" };
  const assignments = [
    prelim,
    { ...prelim, department: "GE", course_name: "BSBA", subject_code: "SCI2", section_name: "BSBA 1A" },
    { ...prelim, semester: 1, subject_code: "OTHER-SEMESTER" },
    { ...prelim, term: "Final", subject_code: "OTHER-TERM" },
  ];
  let selected;
  function PeriodPreview() {
    selected = useExamTermSchedule(assignments, getExamPeriodKey);
    return null;
  }
  renderToStaticMarkup(createElement(PeriodPreview));

  assert.equal(selected.schedules.length, 3);
  assert.equal(selected.schedules.find(period => period.key === selected.selectedKey).count, 2);
  const html = buildExamScheduleSheet({ title: "Proctoring Assignments", name: "A. Teacher", exams: selected.termExams });
  assert.match(html, /<h1>Proctoring Assignments<\/h1>/);
  assert.match(html, /<strong>A\. Teacher<\/strong>/);
  assert.match(html, /Prelim · ICT, GE · Semester 2/);
  assert.match(html, /<th scope="col">Course<\/th><th scope="col">Program<\/th>/);
  assert.match(html, /SCI1 – Research/);
  assert.match(html, /SCI2 – Research/);
  assert.match(html, /<td>BSIT<\/td>/);
  assert.match(html, /<td>BSBA<\/td>/);
  assert.doesNotMatch(html, /Assigned proctor|OTHER-SEMESTER|OTHER-TERM/);
});
