import React, { useState, useEffect } from "react";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/themeStore";
import api from "../api";

export default function ExamBreakSettings({ isGenerating }) {
    const [breakFields, setBreakFields] = useState({
        general: { hours: "0", minutes: "0", seconds: "0" },
        major: { hours: "0", minutes: "0", seconds: "0" },
    });
    const [breakSaving, setBreakSaving] = useState({});

    const { showSuccess, showError } = useToast();
    const { theme } = useTheme();
    const isDark = theme === "dark";

    useEffect(() => {
        fetchBreakSettings();
    }, []);

    const fetchBreakSettings = async () => {
        try {
            const res = await api.get("/rules/break-settings");
            const values = {
                general: { hours: "0", minutes: "0", seconds: "0" },
                major: { hours: "0", minutes: "0", seconds: "0" },
            };
            res.data.forEach(setting => {
                const totalSeconds = setting.break_seconds;
                values[setting.category_type] = {
                    hours: String(Math.floor(totalSeconds / 3600)),
                    minutes: String(Math.floor((totalSeconds % 3600) / 60)),
                    seconds: String(totalSeconds % 60),
                };
            });
            setBreakFields(values);
        } catch (err) {
            console.error("Error fetching exam break settings:", err);
        }
    };

    const updateBreakPart = (category, part, value) => {
        setBreakFields(current => ({
            ...current,
            [category]: { ...current[category], [part]: value },
        }));
    };

    const getBreakSeconds = (category) => {
        const values = breakFields[category];
        const hours = Math.min(23, Math.max(0, Number(values.hours) || 0));
        const minutes = Math.min(59, Math.max(0, Number(values.minutes) || 0));
        const seconds = Math.min(59, Math.max(0, Number(values.seconds) || 0));
        return Math.floor(hours) * 3600 + Math.floor(minutes) * 60 + Math.floor(seconds);
    };

    const saveBreakSetting = async (category) => {
        if (isGenerating) return;
        setBreakSaving(current => ({ ...current, [category]: true }));
        try {
            const breakSeconds = getBreakSeconds(category);
            await api.put(`/rules/break-settings/${category}`, { break_seconds: breakSeconds });
            setBreakFields(current => ({
                ...current,
                [category]: {
                    hours: String(Math.floor(breakSeconds / 3600)),
                    minutes: String(Math.floor((breakSeconds % 3600) / 60)),
                    seconds: String(breakSeconds % 60),
                },
            }));
            showSuccess(`${category === "general" ? "General" : "Major"} break time saved`);
        } catch (err) {
            console.error(err);
            showError("Error saving break time");
        } finally {
            setBreakSaving(current => ({ ...current, [category]: false }));
        }
    };

    return (
        <div className="space-y-6">
            <section className={`rounded-2xl border shadow-xs overflow-hidden ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"}`}>
                <div className={`border-b px-5 py-4 ${isDark ? "border-slate-700 bg-slate-850/60" : "border-slate-200 bg-slate-50/60"}`}>
                    <h3 className={`font-bold text-sm sm:text-base ${isDark ? "text-white" : "text-slate-900"}`}>Break Time by Subject Category</h3>
                    <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Intermission interval between consecutive exams for students</p>
                </div>
                <div className={`divide-y md:hidden ${isDark ? "divide-slate-750" : "divide-slate-200"}`}>
                    {["general", "major"].map(category => (
                        <div key={category} className={`space-y-3 p-4 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                            <div className="flex items-center justify-between gap-3">
                                <h4 className="font-bold capitalize text-sm">{category} Subjects</h4>
                                <button
                                    type="button"
                                    onClick={() => saveBreakSetting(category)}
                                    disabled={isGenerating || breakSaving[category]}
                                    className="rounded-xl bg-blue-700 px-4 py-2 text-xs font-bold text-white hover:bg-blue-800 active:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50 transition shadow-xs"
                                >
                                    {breakSaving[category] ? "Saving..." : "Save"}
                                </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { part: "hours", label: "HRS", max: 23 },
                                    { part: "minutes", label: "MINS", max: 59 },
                                    { part: "seconds", label: "SECS", max: 59 },
                                ].map(({ part, label, max }) => (
                                    <label key={part} className="min-w-0 space-y-1 text-center text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        <span className="block">{label}</span>
                                        <input
                                            type="number"
                                            min="0"
                                            max={max}
                                            step="1"
                                            className="w-full min-w-0 rounded-xl border p-2 text-center text-sm font-semibold tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
                                            value={breakFields[category][part]}
                                            onChange={e => updateBreakPart(category, part, e.target.value)}
                                            disabled={isGenerating || breakSaving[category]}
                                            aria-label={`${category} break ${part}`}
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                    <table className="w-full text-left text-xs sm:text-sm">
                        <thead className={`${isDark ? "bg-slate-850 text-slate-300 border-b border-slate-700" : "bg-slate-50 text-slate-700 border-b border-slate-200"}`}>
                            <tr>
                                <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-xs">Subject Category</th>
                                <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-xs">
                                    <div className="grid w-52 grid-cols-3 gap-2 text-center text-xs uppercase tracking-wider">
                                        <span>Hours</span><span>Mins</span><span>Secs</span>
                                    </div>
                                    <span className="sr-only">Break duration</span>
                                </th>
                                <th className="px-5 py-3.5 text-right font-bold uppercase tracking-wider text-xs">Action</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? "divide-slate-750" : "divide-slate-200"}`}>
                            {["general", "major"].map(category => (
                                <tr key={category} className={isDark ? "text-slate-200" : "text-slate-800"}>
                                    <td className="px-5 py-4 font-bold capitalize text-sm">{category} Subjects</td>
                                    <td className="px-5 py-4">
                                        <div className="grid w-52 grid-cols-3 gap-2">
                                            {[
                                                { part: "hours", max: 23 },
                                                { part: "minutes", max: 59 },
                                                { part: "seconds", max: 59 },
                                            ].map(({ part, max }) => (
                                                <input
                                                    key={part}
                                                    type="number"
                                                    min="0"
                                                    max={max}
                                                    step="1"
                                                    className="w-full min-w-0 rounded-xl border p-2 text-center text-sm font-semibold tabular-nums dark:border-slate-700 dark:bg-slate-900 dark:text-white border-slate-300 bg-white"
                                                    value={breakFields[category][part]}
                                                    onChange={e => updateBreakPart(category, part, e.target.value)}
                                                    disabled={isGenerating || breakSaving[category]}
                                                    aria-label={`${category} break ${part}`}
                                                />
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-5 py-4 text-right">
                                        <button
                                            type="button"
                                            onClick={() => saveBreakSetting(category)}
                                            disabled={isGenerating || breakSaving[category]}
                                            className="rounded-xl bg-blue-700 px-4 py-2 font-bold text-xs sm:text-sm text-white hover:bg-blue-800 active:bg-blue-900 disabled:cursor-not-allowed disabled:opacity-50 transition shadow-xs"
                                        >
                                            {breakSaving[category] ? "Saving..." : "Save"}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
