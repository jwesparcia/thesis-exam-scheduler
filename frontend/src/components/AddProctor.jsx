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
    <div className={`space-y-8 ${isDark ? "bg-gray-800 text-white" : "bg-white text-gray-800"}`}>
      <div>
        <div className="flex justify-between items-end mb-4">
          <div>
            <h3 className={`text-xl font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>Proctor Management</h3>
            <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              Monitor schedule uploads and manage proctor availability for the upcoming exams.
            </p>
          </div>
          <button 
            onClick={fetchProctors}
            disabled={fetching}
            className={`p-2 rounded-lg transition ${isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-600"}`}
            title="Refresh list"
          >
            <ArrowPathIcon className={`w-5 h-5 ${fetching ? "animate-spin" : ""}`} />
          </button>
        </div>

        {proctors.length === 0 && !fetching ? (
          <p className={isDark ? "text-gray-400" : "text-gray-600"}>No proctors added yet.</p>
        ) : (
          <div className={`overflow-x-auto rounded-xl shadow-sm ${isDark ? "bg-gray-700 border border-gray-700" : "bg-white border border-slate-200"}`}>
            <table className="w-full text-sm">
              <thead className={`${isDark ? "bg-gray-600 text-gray-100" : "bg-slate-50 text-slate-600"}`}>
                <tr>
                  <th className="py-3 px-4 text-left font-bold">Name</th>
                  <th className="py-3 px-4 text-left font-bold">Schedule Status</th>
                  <th className="py-3 px-4 text-left font-bold">System Status</th>
                  <th className="py-3 px-4 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? "divide-gray-600 text-gray-200" : "divide-slate-100 text-gray-800"}`}>
                {proctors.map((p) => (
                  <tr key={p.id} className={`border-t ${isDark ? "border-gray-600 hover:bg-gray-600/50" : "border-slate-100 hover:bg-slate-50"} transition`}>
                    <td className="py-3 px-4">
                      <div className="font-medium">{p.name}</div>
                      <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>{p.department || "General"}</div>
                    </td>
                    <td className="py-3 px-4">
                      {p.has_schedule ? (
                        <div className="flex items-center gap-1.5 text-emerald-500 font-medium">
                          <CheckCircleIcon className="w-4 h-4" />
                          <span>Uploaded</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-amber-500 font-medium">
                          <XCircleIcon className="w-4 h-4" />
                          <span>No Schedule</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {p.exclude_from_scheduling ? (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400`}>
                          Excluded
                        </span>
                      ) : (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400`}>
                          Active
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex justify-end gap-2">
                        {!p.has_schedule && (
                          <button
                            onClick={() => sendReminder(p.id, p.name)}
                            disabled={isGenerating}
                            className={`p-2 rounded-lg transition ${
                              isGenerating 
                                ? "opacity-50 cursor-not-allowed" 
                                : (isDark ? "hover:bg-blue-900/30 text-blue-400" : "hover:bg-blue-50 text-blue-600")
                            }`}
                            title={isGenerating ? "Cannot send reminders while schedule generation is ongoing" : "Send Reminder"}
                          >
                            <BellIcon className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => toggleExclude(p.id, p.exclude_from_scheduling)}
                          disabled={isGenerating}
                          className={`p-2 rounded-lg transition ${
                            isGenerating
                              ? "opacity-50 cursor-not-allowed"
                              : p.exclude_from_scheduling
                                ? (isDark ? "hover:bg-emerald-900/30 text-emerald-400" : "hover:bg-emerald-50 text-emerald-600")
                                : (isDark ? "hover:bg-red-900/30 text-red-400" : "hover:bg-red-50 text-red-600")
                          }`}
                          title={isGenerating ? "Cannot modify proctors while schedule generation is ongoing" : (p.exclude_from_scheduling ? "Include in Scheduling" : "Exclude from Scheduling")}
                        >
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