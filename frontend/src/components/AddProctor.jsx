import React, { useCallback, useEffect, useRef, useState } from "react";
import { UsersIcon, BellIcon, ShieldCheckIcon, ShieldExclamationIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon, ArrowUpTrayIcon } from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import api from "../api";
import { useToast } from "../context/ToastContext";
import ConfirmationModal from "./ConfirmationModal";

export default function AddProctor({ isGenerating }) {
  const { theme } = useTheme();
  const { showSuccess, showError } = useToast();
  const [proctors, setProctors] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [scheduleUpload, setScheduleUpload] = useState(null);
  const [uploadingSchedule, setUploadingSchedule] = useState(false);
  const scheduleFileInput = useRef(null);
  const uploadTarget = useRef(null);
  const fetchErrorRef = useRef(showError);

  useEffect(() => {
    fetchErrorRef.current = showError;
  }, [showError]);

  const fetchProctors = useCallback(async () => {
    setFetching(true);
    try {
      const res = await api.get("/proctors/");
      setProctors(res.data);
    } catch (e) {
      console.error(e);
      fetchErrorRef.current("Failed to fetch proctors.");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchProctors();
  }, [fetchProctors, isGenerating]);

  const toggleExclude = async (id, currentExcluded) => {
    if (isGenerating) {
      showError("Cannot modify proctors while schedule generation is ongoing");
      return;
    }
    try {
      await api.post(`/proctors/${id}/exclude`);
      showSuccess(`Proctor ${currentExcluded ? "included" : "excluded"} successfully`);
      fetchProctors();
    } catch {
      showError("Failed to update exclusion status.");
    }
  };

  const sendReminder = async (id, proctorName) => {
    if (isGenerating) {
      showError("Cannot send reminders while schedule generation is ongoing");
      return;
    }
    try {
      const res = await api.post(`/proctors/${id}/send-reminder`);
      showSuccess(res.data.message || `Reminder sent to ${proctorName}`);
    } catch (err) {
      showError(err.response?.data?.detail || "Failed to send reminder.");
    }
  };

  const chooseScheduleFile = (proctor) => {
    uploadTarget.current = proctor;
    scheduleFileInput.current.click();
  };

  const selectScheduleFile = (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      showError("Choose an Excel file (.xlsx or .xls).");
      return;
    }
    setScheduleUpload({ proctor: uploadTarget.current, file });
  };

  const uploadTeachingSchedule = async () => {
    if (!scheduleUpload || uploadingSchedule) return;
    if (isGenerating) {
      setScheduleUpload(null);
      showError("Cannot upload schedules while schedule generation is ongoing.");
      return;
    }

    const { proctor, file } = scheduleUpload;
    const data = new FormData();
    data.append("file", file);
    setScheduleUpload(null);
    setUploadingSchedule(true);
    try {
      await api.post(`/proctors/${proctor.id}/upload-my-schedule`, data);
      showSuccess(`Teaching schedule uploaded for ${proctor.name}.`);
      await fetchProctors();
    } catch (err) {
      showError(err.response?.data?.detail || "Failed to upload the teaching schedule.");
    } finally {
      setUploadingSchedule(false);
    }
  };

  const isDark = theme === "dark";

  const renderScheduleUploadButton = (proctor) => (
    <button
      type="button"
      onClick={() => chooseScheduleFile(proctor)}
      disabled={isGenerating || uploadingSchedule}
      aria-label={`Upload teaching schedule for ${proctor.name}`}
      title="Upload teaching schedule Excel file"
      className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-bold whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50 ${
        isDark ? "border-blue-800 text-blue-300 hover:bg-blue-900/50" : "border-blue-200 text-blue-800 hover:bg-blue-100"
      }`}
    >
      <ArrowUpTrayIcon className="h-4 w-4" />
      Upload Excel
    </button>
  );

  return (
    <div className={`space-y-6 ${isDark ? "bg-slate-800/40 text-slate-100" : "bg-white text-slate-800"}`}>
      <input ref={scheduleFileInput} type="file" accept=".xlsx,.xls" hidden onChange={selectScheduleFile} />
      <ConfirmationModal
        isOpen={scheduleUpload !== null}
        title="Upload teaching schedule"
        message={scheduleUpload && (
          <p className="break-words">
            Upload <strong>{scheduleUpload.file.name}</strong> for <strong>{scheduleUpload.proctor.name}</strong>.
            This replaces any existing teaching schedule for this proctor.
          </p>
        )}
        confirmLabel="Upload schedule"
        onConfirm={uploadTeachingSchedule}
        onCancel={() => setScheduleUpload(null)}
      />
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
              <UsersIcon className="w-6 h-6 shrink-0" />
            </div>
            <div>
              <h3 className={`text-lg sm:text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Proctor Management</h3>
              <p className={`text-xs sm:text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Upload teaching schedules and review assigned exam duties and proctor availability.
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={fetchProctors}
            disabled={fetching}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition border ${
              isDark 
                ? "bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700" 
                : "bg-white hover:bg-slate-50 text-slate-700 border-slate-300"
            }`}
            title="Refresh proctors list"
          >
            <ArrowPathIcon className={`w-4 h-4 ${fetching ? "animate-spin text-blue-600" : "text-slate-500"}`} />
            Refresh
          </button>
        </div>

        <p className={`mb-4 text-xs sm:text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
          Proctoring schedules count posted exam assignments. Draft and saved assignments are shown separately.
        </p>

        {uploadingSchedule && <p role="status" className="mb-4 text-sm font-semibold">Uploading teaching schedule…</p>}

        {proctors.length === 0 && !fetching ? (
          <div className={`p-8 text-center rounded-2xl border border-dashed ${isDark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"}`}>
            <UsersIcon className="w-8 h-8 mx-auto mb-2 opacity-60" />
            <p className="text-sm font-medium">No proctors registered in the system yet.</p>
          </div>
        ) : (
          <div className={`w-full min-w-0 overflow-x-auto rounded-2xl shadow-xs border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
            <div className={`md:hidden divide-y ${isDark ? "divide-slate-750" : "divide-slate-200"}`}>
              {proctors.map((p) => (
                <article key={p.id} className="space-y-3 p-4">
                  <div className="min-w-0">
                    <h4 className={`break-words font-bold text-sm sm:text-base ${isDark ? "text-white" : "text-slate-900"}`}>{p.name}</h4>
                    <p className={`mt-0.5 break-words text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>{p.department || "General Faculty"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                      p.has_schedule 
                        ? isDark ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                        : isDark ? "bg-amber-950/60 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-800 border-amber-200"
                    }`}>
                      {p.has_schedule ? "Schedule uploaded" : "No schedule"}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                      p.exclude_from_scheduling 
                        ? isDark ? "bg-rose-950/60 text-rose-300 border-rose-800" : "bg-rose-50 text-rose-800 border-rose-200"
                        : isDark ? "bg-blue-950/60 text-blue-300 border-blue-800" : "bg-blue-50 text-blue-800 border-blue-200"
                    }`}>
                      {p.exclude_from_scheduling ? "Excluded" : "Active"}
                    </span>
                  </div>
                  <div className={`rounded-xl border p-3 ${isDark ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-slate-50"}`}>
                    <p className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Proctoring schedules</p>
                    <p className={`mt-1 font-bold tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>
                      {p.posted_exam_count ?? 0} posted
                    </p>
                    <p className={`mt-0.5 text-xs tabular-nums ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                      {p.pending_exam_count ?? 0} draft / saved
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {renderScheduleUploadButton(p)}
                    {!p.has_schedule && (
                      <button
                        type="button"
                        onClick={() => sendReminder(p.id, p.name)}
                        disabled={isGenerating}
                        className={`min-h-10 flex-1 rounded-xl border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                          isDark ? "border-blue-800 bg-blue-950/40 text-blue-300 hover:bg-blue-900/50" : "border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100"
                        }`}
                      >
                        <BellIcon className="mr-1.5 inline h-3.5 w-3.5" />Send Reminder
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleExclude(p.id, p.exclude_from_scheduling)}
                      disabled={isGenerating}
                      className={`min-h-10 flex-1 rounded-xl border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        p.exclude_from_scheduling 
                          ? isDark ? "border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          : isDark ? "border-rose-800 bg-rose-950/40 text-rose-300 hover:bg-rose-900/50" : "border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100"
                      }`}
                    >
                      {p.exclude_from_scheduling ? "Include" : "Exclude"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
            <table className="hidden w-full min-w-[840px] text-xs sm:text-sm md:table">
              <thead className={`${isDark ? "bg-slate-850 text-slate-300 border-b border-slate-700" : "bg-slate-50 text-slate-700 border-b border-slate-200"}`}>
                <tr>
                  <th className="py-3 px-5 text-left font-bold uppercase tracking-wider text-xs">Proctor Name</th>
                  <th className="py-3 px-5 text-left font-bold uppercase tracking-wider text-xs">Schedule Status</th>
                  <th className="py-3 px-5 text-left font-bold uppercase tracking-wider text-xs">Assignment Status</th>
                  <th className="py-3 px-5 text-left font-bold uppercase tracking-wider text-xs">Proctoring Schedules</th>
                  <th className="py-3 px-5 text-right font-bold uppercase tracking-wider text-xs">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-slate-700 text-slate-200" : "divide-slate-200 text-slate-800"}`}>
                {proctors.map((p) => (
                  <tr key={p.id} className={`transition ${isDark ? "hover:bg-slate-750/50" : "hover:bg-slate-50"}`}>
                    <td className="py-3.5 px-5">
                      <div className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{p.name}</div>
                      <div className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>{p.department || "General Faculty"}</div>
                    </td>
                    <td className="py-3.5 px-5">
                      {p.has_schedule ? (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          isDark ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                        }`}>
                          <CheckCircleIcon className="w-3.5 h-3.5" />
                          <span>Uploaded</span>
                        </span>
                      ) : (
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          isDark ? "bg-amber-950/60 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}>
                          <XCircleIcon className="w-3.5 h-3.5" />
                          <span>No Schedule</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-5">
                      {p.exclude_from_scheduling ? (
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          isDark ? "bg-rose-950/60 text-rose-300 border-rose-800" : "bg-rose-50 text-rose-800 border-rose-200"
                        }`}>
                          Excluded
                        </span>
                      ) : (
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          isDark ? "bg-blue-950/60 text-blue-300 border-blue-800" : "bg-blue-50 text-blue-800 border-blue-200"
                        }`}>
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className={`font-bold tabular-nums ${isDark ? "text-white" : "text-slate-900"}`}>
                        {p.posted_exam_count ?? 0} posted
                      </div>
                      <div className={`text-xs tabular-nums ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        {p.pending_exam_count ?? 0} draft / saved
                      </div>
                    </td>
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex justify-end gap-1.5">
                        {renderScheduleUploadButton(p)}
                        {!p.has_schedule && (
                          <button
                            type="button"
                            onClick={() => sendReminder(p.id, p.name)}
                            disabled={isGenerating}
                            className={`p-2 rounded-xl transition border ${
                              isGenerating 
                                ? "opacity-50 cursor-not-allowed border-transparent" 
                                : isDark ? "hover:bg-blue-900/40 text-blue-300 border-blue-800/80" : "hover:bg-blue-100 text-blue-800 border-blue-200"
                            }`}
                            title={isGenerating ? "Cannot send reminders while schedule generation is ongoing" : "Send upload reminder"} aria-label="Send upload reminder">
                            <BellIcon className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleExclude(p.id, p.exclude_from_scheduling)}
                          disabled={isGenerating}
                          className={`p-2 rounded-xl transition border ${
                            isGenerating
                              ? "opacity-50 cursor-not-allowed border-transparent"
                              : p.exclude_from_scheduling
                                ? isDark ? "hover:bg-emerald-900/40 text-emerald-300 border-emerald-800/80" : "hover:bg-emerald-100 text-emerald-800 border-emerald-200"
                                : isDark ? "hover:bg-rose-900/40 text-rose-300 border-rose-800/80" : "hover:bg-rose-100 text-rose-800 border-rose-200"
                          }`}
                          title={isGenerating ? "Cannot modify proctors while schedule generation is ongoing" : (p.exclude_from_scheduling ? "Include in Scheduling" : "Exclude from Scheduling")} aria-label={p.exclude_from_scheduling ? "Include in scheduling" : "Exclude from scheduling"}>
                          {p.exclude_from_scheduling ? <ShieldCheckIcon className="w-4 h-4" /> : <ShieldExclamationIcon className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
