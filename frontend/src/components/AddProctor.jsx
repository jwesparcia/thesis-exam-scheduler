import React, { useEffect, useState } from "react";
import { PlusIcon, UsersIcon, BellIcon, ShieldCheckIcon, ShieldExclamationIcon, CheckCircleIcon, XCircleIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import ThemeToggle from "../components/ThemeToggle";
import api from "../api";
import { useToast } from "../context/ToastContext";

export default function AddProctor({ isGenerating }) {
  const { theme } = useTheme();
  const { showSuccess, showError } = useToast();
  const [proctors, setProctors] = useState([]);
  const [fetching, setFetching] = useState(false);

  const fetchProctors = async () => {
    setFetching(true);
    try {
      const res = await api.get("/proctors");
      setProctors(res.data);
    } catch (e) {
      console.error(e);
      showError("Failed to fetch proctors.");
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchProctors();
  }, []);

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
      await api.post(`/proctors/${id}/send-reminder`);
      showSuccess(`Reminder sent to ${proctorName}`);
    } catch {
      showError("Failed to send reminder.");
    }
  };

  const isDark = theme === "dark";

  return (
    <div className={`space-y-6 ${isDark ? "bg-slate-800/40 text-slate-100" : "bg-white text-slate-800"}`}>
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
              <UsersIcon className="w-6 h-6 shrink-0" />
            </div>
            <div>
              <h3 className={`text-lg sm:text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Proctor Management</h3>
              <p className={`text-xs sm:text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Monitor schedule uploads, teaching loads, and manage proctor availability for examinations.
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
                  <div className="flex gap-2 pt-1">
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
            <table className="hidden w-full min-w-[680px] text-xs sm:text-sm md:table">
              <thead className={`${isDark ? "bg-slate-850 text-slate-300 border-b border-slate-700" : "bg-slate-50 text-slate-700 border-b border-slate-200"}`}>
                <tr>
                  <th className="py-3 px-5 text-left font-bold uppercase tracking-wider text-xs">Proctor Name</th>
                  <th className="py-3 px-5 text-left font-bold uppercase tracking-wider text-xs">Schedule Status</th>
                  <th className="py-3 px-5 text-left font-bold uppercase tracking-wider text-xs">Assignment Status</th>
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
                    <td className="py-3.5 px-5 text-right">
                      <div className="flex justify-end gap-1.5">
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
                            title={isGenerating ? "Cannot send reminders while schedule generation is ongoing" : "Send Reminder Email"} aria-label="Send reminder email">
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