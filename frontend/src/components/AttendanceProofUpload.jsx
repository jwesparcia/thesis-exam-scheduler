import React, { useId, useState } from "react";
import { ArrowPathIcon, CameraIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import api from "../api";
import { useToast } from "../context/ToastContext";
import { attendancePhotoError, hasCurrentAttendanceProof } from "../utils/attendanceProof";
import AttendanceProofPhoto from "./AttendanceProofPhoto";

export default function AttendanceProofUpload({ exam, onUploaded, disabled = false }) {
  const [uploading, setUploading] = useState(false);
  const { showError, showSuccess } = useToast();
  const inputId = useId();
  const confirmed = ["confirmed", "attended"].includes(exam.proctor_attendance);
  const ready = hasCurrentAttendanceProof(exam);

  const uploadPhoto = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const error = attendancePhotoError(file);
    if (error) { showError(error); return; }
    setUploading(true);
    try {
      const data = new FormData();
      data.append("photo", file);
      const response = await api.post(`/proctors/${exam.proctor_id}/attendance-proof/${exam.id}`, data);
      onUploaded(exam.id, response.data.attendance_proof);
      showSuccess("Proof photo uploaded. It is now available to the administrator.");
    } catch (err) {
      showError(err.response?.data?.detail || "The proof photo could not be uploaded. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mb-3 space-y-2 whitespace-normal text-left">
      {exam.attendance_proof && <AttendanceProofPhoto exam={exam} />}
      {!confirmed && <>
        <p className="text-xs text-slate-600 dark:text-slate-400">Upload a photo showing you in room <strong>{exam.room}</strong> before confirming attendance. JPG, PNG or WebP, up to 10 MB.</p>
        <label htmlFor={inputId} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus-within:ring-2 focus-within:ring-blue-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 ${uploading || disabled ? "cursor-not-allowed opacity-60" : "hover:bg-slate-50 dark:hover:bg-slate-700"}`}>
          {uploading ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <CameraIcon className="h-4 w-4" />}
          {uploading ? "Uploading photo…" : ready ? "Replace proof photo" : "Upload proof photo"}
          <input id={inputId} type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadPhoto} disabled={uploading || disabled} className="sr-only" />
        </label>
        {ready && <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircleIcon className="h-4 w-4" /> Photo uploaded — ready to confirm during the exam.</p>}
        {!ready && exam.attendance_proof && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">Upload a new photo for the updated room or schedule.</p>}
      </>}
    </div>
  );
}
