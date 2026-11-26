import React from "react";
import { PrinterIcon } from "@heroicons/react/24/outline";
import { useToast } from "../context/ToastContext";
import { buildExamScheduleSheet } from "../utils/examSchedulePrint";
import { openPrintDocument } from "../utils/printDocument";

export default function ExamSchedulePrintButton({ exams, name, title, label, includeProctor, loading }) {
  const { showError } = useToast();

  const printSchedule = () => {
    const html = buildExamScheduleSheet({ title, name, exams, includeProctor });
    if (!openPrintDocument(html)) {
      showError("Allow pop-ups for this site to print your schedule.");
    }
  };

  return (
    <button
      type="button"
      onClick={printSchedule}
      disabled={loading || exams.length === 0}
      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-blue-200 px-3.5 py-2.5 text-xs font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/40"
    >
      <PrinterIcon className="h-4 w-4" />
      {label}
    </button>
  );
}
