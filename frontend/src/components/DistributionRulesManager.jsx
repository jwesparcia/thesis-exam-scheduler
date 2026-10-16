import React, { useState, useEffect } from "react";
import { TrashIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/themeStore";
import api from "../api";

export default function DistributionRulesManager({ isGenerating }) {
    const [rules, setRules] = useState([]);
    const [yearLevels, setYearLevels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [breakFields, setBreakFields] = useState({
        general: { hours: "0", minutes: "0", seconds: "0" },
        major: { hours: "0", minutes: "0", seconds: "0" },
    });
    const [breakSaving, setBreakSaving] = useState({});

    // New Rule State
    const [newRule, setNewRule] = useState({
        category_type: "general",
        year_level_id: "",
        allowed_days: [],
        allowed_session: "morning"
    });

    const { showSuccess, showError } = useToast();
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        id: null
    });

    useEffect(() => {
        fetchRules();
        fetchYearLevels();
        fetchBreakSettings();
    }, []);

    const fetchRules = async () => {
        setLoading(true);
        try {
            const res = await api.get("/rules");
            setRules(res.data);
        } catch (err) {
            console.error("Error fetching rules:", err);
        }
        setLoading(false);
    };

    const fetchYearLevels = async () => {
        try {
            const res = await api.get("/catalog/year-levels");
            setYearLevels(res.data);
        } catch (err) {
            console.error("Error fetching year levels:", err);
        }
    };

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

    const handleDelete = async (id) => {
        setConfirmModal({
            isOpen: true,
            id: id
        });
    };

    const confirmDelete = async () => {
        if (isGenerating) {
            showError("Cannot delete rules while schedule generation is ongoing");
            return;
        }
        const id = confirmModal.id;
        setConfirmModal({ isOpen: false, id: null });
        try {
            await api.delete(`/rules/${id}`);
            setRules(rules.filter(r => r.id !== id));
            showSuccess("Rule deleted successfully");
        } catch (err) {
            showError("Error deleting rule");
        }
    };

    const handleAddRule = async () => {
        if (isGenerating) {
            showError("Cannot add rules while schedule generation is ongoing");
            return;
        }
        try {
            const payload = {
                ...newRule,
                year_level_id: newRule.year_level_id ? Number(newRule.year_level_id) : null,
                allowed_days: newRule.allowed_days.map(Number)
            };

            await api.post("/rules", payload);
            fetchRules();
            setShowAddForm(false);
            setNewRule({ category_type: "general", year_level_id: "", allowed_days: [], allowed_session: "morning" });
            showSuccess("Rule added successfully");
        } catch (err) {
            console.error(err);
            showError("Error adding rule");
        }
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

    const toggleDay = (day) => {
        const currentDays = newRule.allowed_days;
        if (currentDays.includes(day)) {
            setNewRule({ ...newRule, allowed_days: currentDays.filter(d => d !== day) });
        } else {
            setNewRule({ ...newRule, allowed_days: [...currentDays, day].sort() });
        }
    };

    return (
        <div className="space-y-6">
            {/* Official Schedule Template Reference Card */}
            <div className={`p-5 sm:p-6 rounded-2xl border shadow-xs transition-all ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
                    <div>
                        <h3 className={`text-lg sm:text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                            Tertiary Periodical Departmental Exam Schedule
                        </h3>
                        <p className={`text-xs sm:text-sm mt-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                            Official 4-Day Departmental Matrix enforced by the Genetic Algorithm schedule generator.
                        </p>
                    </div>
                    <span className={`self-start sm:self-auto px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                        isDark ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                    }`}>
                        Template Enforced
                    </span>
                </div>

                <div className="w-full min-w-0 rounded-2xl border overflow-hidden dark:border-slate-700 border-slate-200">
                    <div className="space-y-3 p-3 md:hidden">
                        {[
                            { day: "Day 1", morning: "GE (Communication & Literature, Math, Sciences)", afternoon: "Computer Fundamentals and major exams for Year 3 & 4" },
                            { day: "Day 2", morning: "GE (Filipino and Social Sciences, except Literature)", afternoon: "Up to 2 major exams for all year levels per section" },
                            { day: "Day 3", morning: "Major exams for all year levels", afternoon: "Major exams for all year levels" },
                            { day: "Day 4", morning: "Major exams for all year levels", afternoon: "Major exams for all year levels" },
                        ].map((day) => (
                            <article key={day.day} className={`space-y-3 rounded-xl border p-4 ${isDark ? "border-slate-700 bg-slate-850/50" : "border-slate-200 bg-slate-50/50"}`}>
                                <h4 className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-900"}`}>{day.day}</h4>
                                <div className={`space-y-3 border-t pt-3 text-xs sm:text-sm ${isDark ? "border-slate-700" : "border-slate-200"}`}>
                                    <div>
                                        <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-blue-300" : "text-blue-800"}`}>Morning · 7:00–11:30 AM</p>
                                        <p className={`mt-1 font-medium break-words ${isDark ? "text-slate-300" : "text-slate-700"}`}>{day.morning}</p>
                                    </div>
                                    <div>
                                        <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-blue-300" : "text-blue-800"}`}>Afternoon · 11:30 AM–5:30 PM</p>
                                        <p className={`mt-1 font-medium break-words ${isDark ? "text-slate-300" : "text-slate-700"}`}>{day.afternoon}</p>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[640px] text-center text-xs border-collapse">
                        <thead>
                            <tr className={`${isDark ? "bg-slate-850 text-slate-200 border-b border-slate-700" : "bg-slate-100 text-slate-800 font-bold border-b border-slate-200"}`}>
                                <th className="px-3 py-3 font-bold uppercase tracking-wider text-[11px] border-r dark:border-slate-700 border-slate-200">Time Block</th>
                                <th className="px-3 py-3 font-bold uppercase tracking-wider text-[11px] border-r dark:border-slate-700 border-slate-200">Window</th>
                                <th className="px-3 py-3 font-bold uppercase tracking-wider text-[11px] border-r dark:border-slate-700 border-slate-200">Day 1</th>
                                <th className="px-3 py-3 font-bold uppercase tracking-wider text-[11px] border-r dark:border-slate-700 border-slate-200">Day 2</th>
                                <th className="px-3 py-3 font-bold uppercase tracking-wider text-[11px] border-r dark:border-slate-700 border-slate-200">Day 3</th>
                                <th className="px-3 py-3 font-bold uppercase tracking-wider text-[11px]">Day 4</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? "divide-slate-700" : "divide-slate-200"}`}>
                            {/* Morning Block */}
                            <tr className={isDark ? "bg-slate-900/40" : "bg-slate-50/70"}>
                                <td rowSpan={3} className={`px-3 py-4 font-black uppercase tracking-wider border-r text-xs ${isDark ? "bg-blue-950/40 text-blue-300 border-slate-700" : "bg-blue-50 text-blue-900 border-slate-200"}`}>
                                    MORNING
                                </td>
                                <td className={`px-2 py-2 font-mono text-[11px] font-semibold border-r ${isDark ? "bg-slate-850 text-slate-300 border-slate-700" : "bg-white text-slate-700 border-slate-200"}`}>
                                    7:00 - 8:30 AM
                                </td>
                                <td rowSpan={3} className={`px-4 py-3 font-semibold border-r align-middle ${isDark ? "bg-blue-950/30 text-blue-200 border-slate-700" : "bg-blue-50/60 text-slate-800 border-slate-200"}`}>
                                    <div className="font-bold text-blue-600 dark:text-blue-400 text-sm">General Education</div>
                                    <div className="text-[11px] opacity-90 mt-0.5">(Comm & Lit, Math, Sciences)</div>
                                </td>
                                <td rowSpan={3} className={`px-4 py-3 font-semibold border-r align-middle ${isDark ? "bg-indigo-950/30 text-indigo-200 border-slate-700" : "bg-indigo-50/60 text-slate-800 border-slate-200"}`}>
                                    <div className="font-bold text-indigo-600 dark:text-indigo-400 text-sm">General Education</div>
                                    <div className="text-[11px] opacity-90 mt-0.5">(Filipino, SOCSCI - <em>except Lit</em>)</div>
                                </td>
                                <td rowSpan={7} className={`px-4 py-3 font-bold border-r align-middle ${isDark ? "bg-purple-950/20 text-purple-200 border-slate-700" : "bg-purple-50/40 text-purple-900 border-slate-200"}`}>
                                    <div className="text-sm">Major for all year levels</div>
                                </td>
                                <td rowSpan={7} className={`px-4 py-3 font-bold align-middle ${isDark ? "bg-purple-950/20 text-purple-200" : "bg-purple-50/40 text-purple-900"}`}>
                                    <div className="text-sm">Major for all year levels</div>
                                </td>
                            </tr>
                            <tr className={isDark ? "bg-slate-900/40" : "bg-slate-50/70"}>
                                <td className={`px-2 py-2 font-mono text-[11px] font-semibold border-r ${isDark ? "bg-slate-850 text-slate-300 border-slate-700" : "bg-white text-slate-700 border-slate-200"}`}>
                                    8:30 - 10:00 AM
                                </td>
                            </tr>
                            <tr className={isDark ? "bg-slate-900/40" : "bg-slate-50/70"}>
                                <td className={`px-2 py-2 font-mono text-[11px] font-semibold border-r ${isDark ? "bg-slate-850 text-slate-300 border-slate-700" : "bg-white text-slate-700 border-slate-200"}`}>
                                    10:00 - 11:30 AM
                                </td>
                            </tr>

                            {/* Afternoon Block */}
                            <tr className={isDark ? "bg-slate-850/40" : "bg-white"}>
                                <td rowSpan={4} className={`px-3 py-4 font-black uppercase tracking-wider border-r text-xs ${isDark ? "bg-indigo-950/40 text-indigo-300 border-slate-700" : "bg-indigo-50 text-indigo-900 border-slate-200"}`}>
                                    AFTERNOON
                                </td>
                                <td className={`px-2 py-2 font-mono text-[11px] font-semibold border-r ${isDark ? "bg-slate-850 text-slate-300 border-slate-700" : "bg-white text-slate-700 border-slate-200"}`}>
                                    11:30 - 1:00 PM
                                </td>
                                <td rowSpan={4} className={`px-4 py-3 font-semibold border-r align-middle ${isDark ? "bg-amber-950/20 text-amber-200 border-slate-700" : "bg-amber-50/60 text-slate-800 border-slate-200"}`}>
                                    <div className="font-bold text-amber-700 dark:text-amber-400 text-xs">Computer Fundamentals</div>
                                    <div className="text-[11px] mt-1 font-bold text-slate-700 dark:text-slate-300">& Major for Y3 & Y4</div>
                                </td>
                                <td rowSpan={4} className={`px-4 py-3 font-semibold border-r align-middle ${isDark ? "bg-emerald-950/20 text-emerald-200 border-slate-700" : "bg-emerald-50/60 text-slate-800 border-slate-200"}`}>
                                    <div className="font-bold text-emerald-700 dark:text-emerald-400 text-xs">2 Major for all year levels</div>
                                    <div className="text-[10px] opacity-80 mt-0.5">(Max 2 majors per section)</div>
                                </td>
                            </tr>
                            <tr className={isDark ? "bg-slate-850/40" : "bg-white"}>
                                <td className={`px-2 py-2 font-mono text-[11px] font-semibold border-r ${isDark ? "bg-slate-850 text-slate-300 border-slate-700" : "bg-white text-slate-700 border-slate-200"}`}>
                                    1:00 - 2:30 PM
                                </td>
                            </tr>
                            <tr className={isDark ? "bg-slate-850/40" : "bg-white"}>
                                <td className={`px-2 py-2 font-mono text-[11px] font-semibold border-r ${isDark ? "bg-slate-850 text-slate-300 border-slate-700" : "bg-white text-slate-700 border-slate-200"}`}>
                                    2:30 - 4:00 PM
                                </td>
                            </tr>
                            <tr className={isDark ? "bg-slate-850/40" : "bg-white"}>
                                <td className={`px-2 py-2 font-mono text-[11px] font-semibold border-r ${isDark ? "bg-slate-850 text-slate-300 border-slate-700" : "bg-white text-slate-700 border-slate-200"}`}>
                                    4:00 - 5:30 PM
                                </td>
                            </tr>
                        </tbody>
                    </table>
                    </div>
                </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <div>
                    <h3 className={`text-base sm:text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Custom Distribution Rules</h3>
                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Additional department constraints applied during scheduling runs</p>
                </div>
                <button
                    type="button"
                    onClick={() => setShowAddForm(true)}
                    disabled={isGenerating}
                    className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl text-xs sm:text-sm font-semibold transition shadow-xs ${
                        isGenerating
                            ? "bg-blue-600/50 opacity-50 cursor-not-allowed"
                            : "bg-blue-700 hover:bg-blue-800 active:bg-blue-900"
                    }`}
                    title={isGenerating ? "Cannot add rules while schedule generation is ongoing" : "Add Rule"}
                >
                    <PlusIcon className="w-4 h-4" />
                    Add Rule
                </button>
            </div>

            {showAddForm && (
                <div className={`p-4 sm:p-5 border rounded-2xl shadow-xs ${isDark ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                    <h4 className={`font-bold mb-4 text-sm sm:text-base ${isDark ? "text-white" : "text-slate-900"}`}>New Rule Configuration</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Category</label>
                            <select
                                className={`w-full p-2.5 border rounded-xl text-xs sm:text-sm font-medium outline-none transition ${
                                    isDark ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500" : "bg-white border-slate-300 text-slate-800 focus:border-blue-600"
                                }`}
                                value={newRule.category_type}
                                onChange={e => setNewRule({ ...newRule, category_type: e.target.value })}
                            >
                                <option value="general">General</option>
                                <option value="major">Major</option>
                            </select>
                        </div>

                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Year Level</label>
                            <select
                                className={`w-full p-2.5 border rounded-xl text-xs sm:text-sm font-medium outline-none transition ${
                                    isDark ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500" : "bg-white border-slate-300 text-slate-800 focus:border-blue-600"
                                }`}
                                value={newRule.year_level_id}
                                onChange={e => setNewRule({ ...newRule, year_level_id: e.target.value })}
                                disabled={newRule.category_type === "general"}
                            >
                                <option value="">Any / Not Applicable</option>
                                {yearLevels.map(y => (
                                    <option key={y.id} value={y.id}>{y.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Allowed Session</label>
                            <select
                                className={`w-full p-2.5 border rounded-xl text-xs sm:text-sm font-medium outline-none transition ${
                                    isDark ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500" : "bg-white border-slate-300 text-slate-800 focus:border-blue-600"
                                }`}
                                value={newRule.allowed_session}
                                onChange={e => setNewRule({ ...newRule, allowed_session: e.target.value })}
                            >
                                <option value="morning">Morning Only</option>
                                <option value="afternoon">Afternoon Only</option>
                                <option value="any">Any Time</option>
                            </select>
                        </div>

                        <div>
                            <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Allowed Days (Indices 1-5)</label>
                            <div className="flex gap-2 flex-wrap">
                                {[1, 2, 3, 4, 5].map(day => (
                                    <button
                                        type="button"
                                        key={day}
                                        onClick={() => toggleDay(day)}
                                        className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs sm:text-sm font-bold transition border ${
                                            newRule.allowed_days.includes(day)
                                                ? "bg-blue-700 text-white border-blue-700 shadow-xs"
                                                : isDark 
                                                ? "bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-750" 
                                                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                                        }`}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-2.5 mt-5 pt-3 border-t border-slate-200 dark:border-slate-700">
                        <button
                            type="button"
                            onClick={() => setShowAddForm(false)}
                            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition border ${
                                isDark ? "bg-slate-750 hover:bg-slate-700 text-slate-200 border-slate-700" : "bg-white hover:bg-slate-100 text-slate-700 border-slate-300"
                            }`}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={handleAddRule}
                            disabled={isGenerating}
                            className={`w-full sm:w-auto px-5 py-2.5 text-white rounded-xl text-xs sm:text-sm font-bold transition shadow-xs ${
                                isGenerating
                                    ? "bg-blue-600/50 opacity-50 cursor-not-allowed"
                                    : "bg-blue-700 hover:bg-blue-800 active:bg-blue-900"
                            }`}
                        >
                            Save Rule
                        </button>
                    </div>
                </div>
            )}

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
                                    <label key={part} className="min-w-0 space-y-1 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                                <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-[11px]">Subject Category</th>
                                <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-[11px]">
                                    <div className="grid w-52 grid-cols-3 gap-2 text-center text-[10px] uppercase tracking-wider">
                                        <span>Hours</span><span>Mins</span><span>Secs</span>
                                    </div>
                                    <span className="sr-only">Break duration</span>
                                </th>
                                <th className="px-5 py-3.5 text-right font-bold uppercase tracking-wider text-[11px]">Action</th>
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

            {loading ? (
                <div className="text-center py-8">
                    <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>Loading rules...</p>
                </div>
            ) : (
                <>
                    <div className={`w-full min-w-0 rounded-2xl border shadow-xs overflow-hidden ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"}`}>
                        <div className={`md:hidden divide-y ${isDark ? "divide-slate-750" : "divide-slate-200"}`}>
                            {rules.length === 0 ? (
                                <p className={`px-4 py-8 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>No custom distribution rules defined.</p>
                            ) : rules.map((rule) => (
                                <article key={rule.id} className="space-y-3 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <h4 className={`font-bold capitalize text-sm ${isDark ? "text-white" : "text-slate-900"}`}>{rule.category_type}</h4>
                                            <p className={`mt-0.5 text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>Year level: {rule.year_level_name || "All"}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(rule.id)}
                                            disabled={isGenerating}
                                            className={`p-2 rounded-xl text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition border ${
                                                isDark ? "border-rose-900/40" : "border-rose-200"
                                            }`}
                                            title="Delete Rule"
                                            aria-label={`Delete ${rule.category_type} rule`}
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {rule.allowed_days.map((day) => (
                                            <span key={day} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold border ${
                                                isDark ? "bg-blue-950/60 text-blue-300 border-blue-800" : "bg-blue-50 text-blue-800 border-blue-200"
                                            }`}>Day {day}</span>
                                        ))}
                                    </div>
                                    <p className={`text-xs capitalize font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Session: <span className="font-bold">{rule.allowed_session}</span></p>
                                </article>
                            ))}
                        </div>
                        <table className="hidden w-full min-w-[640px] text-left text-xs sm:text-sm md:table">
                            <thead className={`${isDark ? "bg-slate-850 text-slate-300 border-b border-slate-700" : "bg-slate-50 text-slate-700 border-b border-slate-200"}`}>
                                <tr>
                                    <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-[11px]">Category</th>
                                    <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-[11px]">Year Level</th>
                                    <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-[11px]">Allowed Days</th>
                                    <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-[11px]">Session Window</th>
                                    <th className="px-5 py-3.5 font-bold uppercase tracking-wider text-[11px] text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className={`divide-y ${isDark ? "divide-slate-750 text-slate-200" : "divide-slate-200 text-slate-800"}`}>
                                {rules.map(rule => (
                                    <tr key={rule.id} className={`transition ${isDark ? "hover:bg-slate-750/50" : "hover:bg-slate-50"}`}>
                                        <td className="px-5 py-3.5 font-bold capitalize">{rule.category_type}</td>
                                        <td className="px-5 py-3.5 font-medium">{rule.year_level_name || "All Levels"}</td>
                                        <td className="px-5 py-3.5">
                                            <div className="flex gap-1.5 flex-wrap">
                                                {rule.allowed_days.map(d => (
                                                    <span key={d} className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                                        isDark ? "bg-blue-950/60 text-blue-300 border-blue-800" : "bg-blue-50 text-blue-800 border-blue-200"
                                                    }`}>
                                                        Day {d}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-5 py-3.5 capitalize font-medium">{rule.allowed_session}</td>
                                        <td className="px-5 py-3.5 text-right">
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(rule.id)}
                                                disabled={isGenerating}
                                                className={`p-2 rounded-xl transition border text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 ${
                                                    isDark ? "border-rose-900/40" : "border-rose-200"
                                                } ${
                                                    isGenerating ? "opacity-50 cursor-not-allowed" : ""
                                                }`}
                                                title={isGenerating ? "Cannot delete rules while schedule generation is ongoing" : "Delete Rule"}
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {rules.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className={`px-5 py-8 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                            No custom distribution rules defined.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {confirmModal.isOpen && (
                        <div 
                            role="dialog"
                            aria-modal="true"
                            className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-xs z-50 p-4"
                        >
                            <div 
                                className="absolute inset-0"
                                onClick={() => setConfirmModal({ isOpen: false, id: null })}
                            />
                            <div className={`relative ${isDark ? "bg-slate-850 border-slate-700" : "bg-white border-slate-200"} border rounded-3xl shadow-2xl max-w-sm w-full p-6 animate-scale-in`}>
                                <button
                                    type="button"
                                    onClick={() => setConfirmModal({ isOpen: false, id: null })}
                                    aria-label="Close dialog"
                                    className={`absolute top-4 right-4 p-1.5 rounded-lg transition ${
                                        isDark ? "hover:bg-slate-750 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                                    }`}
                                >
                                    <XMarkIcon className="w-5 h-5" />
                                </button>
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-14 h-14 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center mb-4">
                                        <TrashIcon className="w-7 h-7" />
                                    </div>
                                    <h3 className={`text-lg font-bold mb-1.5 ${isDark ? "text-white" : "text-slate-900"}`}>
                                        Delete Rule?
                                    </h3>
                                    <p className={`text-xs mb-6 ${isDark ? "text-slate-400" : "text-slate-600"} leading-relaxed`}>
                                        Are you sure you want to delete this distribution rule? This action cannot be undone.
                                    </p>
                                    <div className="flex flex-col-reverse sm:flex-row gap-2.5 w-full">
                                        <button
                                            type="button"
                                            onClick={() => setConfirmModal({ isOpen: false, id: null })}
                                            className={`w-full sm:flex-1 px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm transition border ${
                                                isDark ? "bg-slate-750 text-slate-200 border-slate-700 hover:bg-slate-700" : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200"
                                            }`}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={confirmDelete}
                                            disabled={isGenerating}
                                            className={`w-full sm:flex-1 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-rose-700 text-white hover:bg-rose-800 transition shadow-xs ${
                                                isGenerating ? "opacity-50 cursor-not-allowed" : ""
                                            }`}
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
