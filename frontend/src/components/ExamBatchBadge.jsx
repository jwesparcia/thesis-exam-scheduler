import React from "react";

export default function ExamBatchBadge({ batchNumber }) {
  if (!Number.isInteger(batchNumber) || batchNumber < 2) return null;
  return (
    <span className="mt-1 inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
      Batch {batchNumber}
    </span>
  );
}
