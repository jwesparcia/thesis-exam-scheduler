import React, { useEffect, useId, useRef, useState } from "react";
import { ArrowPathIcon, PhotoIcon, XMarkIcon } from "@heroicons/react/24/outline";
import api from "../api";

export default function AttendanceProofPhoto({ exam }) {
  const proof = exam.attendance_proof;
  const [open, setOpen] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [error, setError] = useState("");
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (!open || !proof?.url) return;
    const dialog = dialogRef.current;
    dialog.showModal();
    const controller = new AbortController();
    let active = true;
    let objectUrl;
    setImageUrl("");
    setError("");
    api.get(proof.url, { responseType: "blob", signal: controller.signal })
      .then((response) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(response.data);
        setImageUrl(objectUrl);
      })
      .catch((err) => {
        if (active && !controller.signal.aborted) {
          setError(err.response?.data?.detail || "The proof photo could not be loaded. Close this window and try again.");
        }
      });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      dialog.close();
    };
  }, [open, proof?.url, proof?.uploaded_at]);

  if (!proof) return <span className="text-xs text-slate-500 dark:text-slate-400">No photo uploaded</span>;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
        <PhotoIcon className="h-4 w-4" /> View proof photo
      </button>
      <dialog ref={dialogRef} onCancel={() => setOpen(false)} aria-labelledby={titleId} className="fixed inset-0 m-auto max-h-[90dvh] w-[min(92vw,56rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-slate-900 shadow-2xl backdrop:bg-black/70 sm:p-6 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold">Attendance proof photo</h2>
            <p className="mt-1 break-words text-sm text-slate-600 dark:text-slate-300">{exam.proctor_name || exam.proctor} · {exam.subject_name} · {exam.section_name}</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Room {proof.room} · Uploaded {new Date(proof.uploaded_at).toLocaleString()}</p>
          </div>
          <button type="button" autoFocus onClick={() => setOpen(false)} aria-label="Close proof photo" className="shrink-0 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"><XMarkIcon className="h-5 w-5" /></button>
        </div>
        {!proof.matches_assignment && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">The room or schedule has changed since this photo was uploaded. A new photo is required before attendance can be confirmed.</p>}
        {error ? <p role="alert" className="rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</p>
          : imageUrl ? <img src={imageUrl} alt={`Attendance proof in room ${proof.room}`} className="mx-auto max-h-[65dvh] max-w-full rounded-xl object-contain" />
            : <div role="status" className="flex items-center justify-center gap-2 py-20 text-sm"><ArrowPathIcon className="h-5 w-5 animate-spin" /> Loading proof photo…</div>}
      </dialog>
    </>
  );
}
