import React from "react";
import { getExamTerms, getExamTermLabel } from "../utils/examTerms";

export default function TermScheduleOverview({ schedules, department, semester, selectedTerm, onSelectTerm, loading, error, isDark }) {
  const order = getExamTerms(department).map(item => item.value);
  const sorted = [...schedules].sort((left, right) => order.indexOf(left.term) - order.indexOf(right.term));
  return (
    <section className={`rounded-2xl border p-4 sm:p-6 ${isDark ? "border-slate-700 bg-slate-850" : "border-slate-200 bg-white"}`} aria-label="Schedules saved by term">
      <h2 className={`text-lg font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>Schedules saved by term</h2>
      <p className={`mt-1 text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
        {department}, Semester {semester}. Each generated schedule is stored separately. Choose a term to review, save, or post it.
      </p>
      {error ? (
        <p role="status" className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>
      ) : loading && schedules.length === 0 ? (
        <p role="status" className="mt-4 text-sm text-slate-500">Loading saved schedules...</p>
      ) : schedules.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No schedules generated for this semester yet.</p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {sorted.map(schedule => (
            <button
              type="button"
              key={schedule.term}
              aria-pressed={selectedTerm === schedule.term}
              aria-label={`View ${getExamTermLabel(schedule.term)} schedule`}
              onClick={() => onSelectTerm(schedule.term)}
              className={`rounded-xl border-2 p-4 text-left transition ${selectedTerm === schedule.term
                ? "border-blue-600 bg-blue-50 dark:bg-blue-950/40"
                : isDark ? "border-slate-700 bg-slate-800 hover:border-slate-500" : "border-slate-200 bg-slate-50 hover:border-blue-300"}`}
            >
              <span className={`block font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{getExamTermLabel(schedule.term)}</span>
              <span className={`mt-1 block text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>{schedule.total_exams} exam{schedule.total_exams === 1 ? "" : "s"}</span>
              {schedule.start_date && <span className="mt-2 block text-xs text-slate-500 dark:text-slate-400">{schedule.start_date} to {schedule.end_date}</span>}
              <span className="mt-3 flex flex-wrap gap-1.5 text-xs font-semibold">
                {schedule.draft_count > 0 && <span className="rounded-full bg-amber-100 px-2 py-1 text-amber-900 dark:bg-amber-950 dark:text-amber-300">{schedule.draft_count} draft</span>}
                {schedule.saved_count > 0 && <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-900 dark:bg-blue-950 dark:text-blue-300">{schedule.saved_count} saved</span>}
                {schedule.posted_count > 0 && <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">{schedule.posted_count} posted</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
