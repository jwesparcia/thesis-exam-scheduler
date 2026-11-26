import { useMemo, useState } from "react";
import { getExamScheduleKey } from "../utils/examTerms.js";

export default function useExamTermSchedule(exams, getGroupKey = getExamScheduleKey) {
  const [selection, setSelection] = useState("");
  const schedules = useMemo(() => {
    const groups = new Map();
    for (const exam of exams) {
      const key = getGroupKey(exam);
      if (!groups.has(key)) {
        groups.set(key, { key, department: exam.department, semester: exam.semester, term: exam.term, count: 0 });
      }
      groups.get(key).count += 1;
    }
    return [...groups.values()];
  }, [exams, getGroupKey]);
  const defaultSchedule = schedules.find(schedule => schedule.term === "Prelim") ?? schedules[0];
  const selectedKey = schedules.some(schedule => schedule.key === selection)
    ? selection : defaultSchedule?.key ?? "";
  const termExams = useMemo(
    () => exams.filter(exam => getGroupKey(exam) === selectedKey),
    [exams, getGroupKey, selectedKey],
  );

  return { schedules, selectedKey, selectSchedule: setSelection, termExams };
}
