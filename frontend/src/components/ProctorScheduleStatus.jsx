import React, { useEffect, useState } from "react";
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
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { fetchMissing(); }, []);

    const toggleExclude = async (id, currentExcluded) => {
        try {
            await api.post(`/proctors/${id}/exclude`);
            showSuccess(`Proctor ${currentExcluded ? "included" : "excluded"} successfully`);
            fetchMissing();
        } catch { showError("Failed to update exclusion"); }
    };

    const sendReminder = async (id, name) => {
        try {
            await api.post(`/proctors/${id}/send-reminder`);
            showSuccess(`Reminder sent to ${name}`);
        } catch { showError("Failed to send reminder"); }
    };

    const isDark = theme === "dark";

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>Proctors Without Uploaded Schedule</h3>
                <button onClick={fetchMissing} className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 text-white">Refresh</button>
            </div>
            {loading ? <div className="text-center py-8">Loading...</div> : missing.length === 0 ? (
                <div className={`p-8 text-center rounded-xl ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>✅ All proctors have uploaded schedules or are excluded.</div>
            ) : (
                <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
                    <table className="w-full text-sm">
                        <thead className={`${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-50 text-gray-600"}`}>
                            <tr><th className="px-4 py-3 text-left">Name</th><th className="px-4 py-3 text-left">Status</th><th className="px-4 py-3 text-right">Actions</th></tr>
                        </thead>
                        <tbody>
                            {missing.map(p => (
                                <tr key={p.id} className={`border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                    <td className="px-4 py-3">{p.name}</td>
                                    <td className="px-4 py-3">{p.excluded ? <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs">Excluded</span> : <span className="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs">No Schedule</span>}</td>
                                    <td className="px-4 py-3 text-right space-x-2">
                                        <button onClick={() => toggleExclude(p.id, p.excluded)} className="px-3 py-1 rounded bg-gray-200 dark:bg-gray-600 text-xs">{p.excluded ? "Include" : "Exclude"}</button>
                                        <button onClick={() => sendReminder(p.id, p.name)} className="px-3 py-1 rounded bg-blue-600 text-white text-xs">Remind</button>
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