import React, { useEffect, useState } from "react";
import { 
  ArrowPathIcon, 
  BellIcon, 
  ShieldCheckIcon, 
  ShieldExclamationIcon, 
  CheckCircleIcon,
  ExclamationTriangleIcon 
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import { useToast } from "../context/ToastContext";
import api from "../api";

export default function ProctorScheduleStatus() {
  const { theme } = useTheme();
  const { showSuccess, showError } = useToast();
  const [missing, setMissing] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchMissing = async () => {
    setLoading(true);
    try {
      const res = await api.get("/proctors/missing-schedules");
      setMissing(res.data);
    } catch (err) { 
      console.error(err); 
      showError("Failed to fetch pending proctors.");
    } finally { 
      setLoading(false); 
    }
  };

  useEffect(() => { 
    fetchMissing(); 
  }, []);

  const toggleExclude = async (id, currentExcluded) => {
    try {
      await api.post(`/proctors/${id}/exclude`);
      showSuccess(`Proctor ${currentExcluded ? "included" : "excluded"} successfully`);
      fetchMissing();
    } catch { 
      showError("Failed to update exclusion status."); 
    }
  };

  const sendReminder = async (id, name) => {
    try {
      await api.post(`/proctors/${id}/send-reminder`);
      showSuccess(`Reminder sent to ${name}`);
    } catch { 
      showError("Failed to send reminder."); 
    }
  };

  const isDark = theme === "dark";

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
            <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
          </div>
          <div>
            <h3 className={`text-base sm:text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
              Proctors Pending Teaching Schedule
            </h3>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Proctors who have not yet submitted their semester teaching schedule for exam allocation
            </p>
          </div>
        </div>
        <button 
          type="button"
          onClick={fetchMissing}
          disabled={loading}
          className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl border transition ${
            isDark 
              ? "bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700" 
              : "bg-white hover:bg-slate-50 text-slate-700 border-slate-300 shadow-xs"
          }`}
        >
          <ArrowPathIcon className={`w-3.5 h-3.5 ${loading ? "animate-spin text-blue-600" : "text-slate-500"}`} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 gap-3">
          <ArrowPathIcon className="w-6 h-6 animate-spin text-blue-600" />
          <span className={`text-xs sm:text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Checking proctor schedule status...
          </span>
        </div>
      ) : missing.length === 0 ? (
        <div className={`p-8 text-center rounded-2xl border border-dashed ${isDark ? "border-slate-700 bg-slate-850/40 text-slate-400" : "border-slate-200 bg-slate-50/60 text-slate-600"}`}>
          <CheckCircleIcon className="w-8 h-8 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">All Schedules Accounted For</div>
          <p className="text-xs mt-1">All active proctors have successfully uploaded their schedules or are explicitly excluded.</p>
        </div>
      ) : (
        <div className={`overflow-x-auto rounded-2xl border shadow-xs ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"}`}>
          <table className="w-full min-w-[520px] text-xs sm:text-sm">
            <thead className={`${isDark ? "bg-slate-850 text-slate-300 border-b border-slate-700" : "bg-slate-50 text-slate-700 border-b border-slate-200"}`}>
              <tr>
                <th className="px-5 py-3 text-left font-bold uppercase tracking-wider text-xs">Proctor Name</th>
                <th className="px-5 py-3 text-left font-bold uppercase tracking-wider text-xs">Status</th>
                <th className="px-5 py-3 text-right font-bold uppercase tracking-wider text-xs">Actions</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? "divide-slate-750" : "divide-slate-200"}`}>
              {missing.map((p) => (
                <tr key={p.id} className={`transition ${isDark ? "hover:bg-slate-750/50" : "hover:bg-slate-50"}`}>
                  <td className={`px-5 py-3.5 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    {p.name}
                  </td>
                  <td className="px-5 py-3.5">
                    {p.excluded ? (
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        isDark ? "bg-rose-950/60 text-rose-300 border-rose-800" : "bg-rose-50 text-rose-800 border-rose-200"
                      }`}>
                        Excluded
                      </span>
                    ) : (
                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        isDark ? "bg-amber-950/60 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-800 border-amber-200"
                      }`}>
                        No Schedule
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button 
                        type="button"
                        onClick={() => toggleExclude(p.id, p.excluded)} 
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                          p.excluded
                            ? isDark ? "border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50" : "border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                            : isDark ? "border-slate-700 bg-slate-750 text-slate-300 hover:bg-slate-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                        }`}
                      >
                        {p.excluded ? <ShieldCheckIcon className="w-3.5 h-3.5" /> : <ShieldExclamationIcon className="w-3.5 h-3.5" />}
                        {p.excluded ? "Include" : "Exclude"}
                      </button>
                      <button 
                        type="button"
                        onClick={() => sendReminder(p.id, p.name)} 
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 active:bg-blue-900 transition shadow-xs"
                      >
                        <BellIcon className="w-3.5 h-3.5" />
                        Remind
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
  );
}