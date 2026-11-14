const COLLEGE_TERMS = [
  { value: "Prelim", label: "Prelim" },
  { value: "Midterm", label: "Midterm" },
  { value: "Pre-Final", label: "Pre-Final" },
  { value: "Final", label: "Final" },
];

const SHS_TERMS = [
  { value: "ST1", label: "Summative Test 1 (ST1)" },
  { value: "ST2", label: "Summative Test 2 (ST2)" },
  { value: "T1", label: "Term 1 (T1)" },
];

export const getExamTerms = (department) => department === "SHS" ? SHS_TERMS : COLLEGE_TERMS;
export const getExamTermLabel = (term) => [...COLLEGE_TERMS, ...SHS_TERMS].find(item => item.value === term)?.label || term;

// Keep repeated term names in different departments or semesters separate.
export const getExamScheduleKey = (exam) => JSON.stringify([
  exam.department || "", String(exam.semester ?? ""), exam.term || "",
]);
