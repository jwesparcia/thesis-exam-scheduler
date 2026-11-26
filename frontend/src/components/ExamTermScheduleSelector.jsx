import React, { useId } from "react";
import { getExamTermLabel } from "../utils/examTerms";

export default function ExamTermScheduleSelector({ schedules, selectedKey, onChange, isDark, loading, byPeriod = false, children }) {
  const id = useId();
  const itemName = byPeriod ? "assignment" : "exam";
  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${isDark ? "border-slate-700 bg-slate-800/80" : "border-slate-200 bg-white"}`} aria-label={byPeriod ? "Assignments by exam period" : "Posted schedules by term"}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <label htmlFor={id} className={`block text-sm font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{byPeriod ? "Examination period" : "Examination term"}</label>
          <p className={`mt-1 text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>{byPeriod ? "Print all posted assignments in the selected period." : "Choose a posted term to view its schedule separately."}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:max-w-xl sm:flex-nowrap sm:justify-end">
          <select
            id={id}
            value={selectedKey}
            onChange={event => onChange(event.target.value)}
            disabled={loading || schedules.length === 0}
            className={`w-full min-w-0 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/40 sm:max-w-md sm:flex-1 ${isDark ? "border-slate-600 bg-slate-900 text-white" : "border-slate-300 bg-slate-50 text-slate-800"}`}
          >
            {schedules.length === 0 && <option value="">{loading ? "Loading posted schedules..." : "No posted schedules"}</option>}
            {schedules.map(schedule => (
              <option key={schedule.key} value={schedule.key}>
                {[getExamTermLabel(schedule.term) || "Unspecified term", !byPeriod && schedule.department, schedule.semester ? `Semester ${schedule.semester}` : ""].filter(Boolean).join(" · ")} ({schedule.count} {itemName}{schedule.count === 1 ? "" : "s"})
              </option>
            ))}
          </select>
          {children}
        </div>
      </div>
    </section>
  );
}
