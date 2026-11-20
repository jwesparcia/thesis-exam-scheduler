import { useMemo, useState } from "react";
import { getExamScheduleKey } from "../utils/examTerms";

export default function useExamTermSchedule(exams) {
  const [selection, setSelection] = useState("");
  const schedules = useMemo(() => {
    const groups = new Map();
    for (const exam of exams) {
      const key = getExamScheduleKey(exam);
      if (!groups.has(key)) {
        groups.set(key, { key, department: exam.department, semester: exam.semester, term: exam.term, count: 0 });
      }
      groups.get(key).count += 1;
    }
    return [...groups.values()];
  }, [exams]);
  const defaultSchedule = schedules.find(schedule => schedule.term === "Prelim") ?? schedules[0];
  const selectedKey = schedules.some(schedule => schedule.key === selection)
    ? selection : defaultSchedule?.key ?? "";
  const termExams = useMemo(
    () => exams.filter(exam => getExamScheduleKey(exam) === selectedKey),
    [exams, selectedKey],
  );

  return { schedules, selectedKey, selectSchedule: setSelection, termExams };
}
