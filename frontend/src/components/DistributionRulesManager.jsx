import React, { useState, useEffect } from "react";
import { Trash2, Plus, Save, X, AlertCircle } from "lucide-react";
import { useToast } from "../context/ToastContext";
import { useTheme } from "../context/themeStore";

export default function DistributionRulesManager() {
    const [rules, setRules] = useState([]);
    const [yearLevels, setYearLevels] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);

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
    }, []);

    const fetchRules = async () => {
        setLoading(true);
        try {
            const res = await fetch("http://localhost:8000/rules");
            if (res.ok) setRules(await res.json());
        } catch (err) {
            console.error("Error fetching rules:", err);
        }
        setLoading(false);
    };

    const fetchYearLevels = async () => {
        try {
            const res = await fetch("http://localhost:8000/catalog/year-levels");
            if (res.ok) setYearLevels(await res.json());
        } catch (err) {
            console.error("Error fetching year levels:", err);
        }
    };

    const handleDelete = async (id) => {
        setConfirmModal({
            isOpen: true,
            id: id
        });
    };

    const confirmDelete = async () => {
        const id = confirmModal.id;
        setConfirmModal({ isOpen: false, id: null });
        try {
            await fetch(`http://localhost:8000/rules/${id}`, { method: "DELETE" });
            setRules(rules.filter(r => r.id !== id));
            showSuccess("Rule deleted successfully");
        } catch (err) {
            showError("Error deleting rule");
        }
    };

    const handleAddRule = async () => {
        try {
            const payload = {
                ...newRule,
                year_level_id: newRule.year_level_id ? Number(newRule.year_level_id) : null,
                allowed_days: newRule.allowed_days.map(Number)
            };

            const res = await fetch("http://localhost:8000/rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                fetchRules();
                setShowAddForm(false);
                setNewRule({ category_type: "general", year_level_id: "", allowed_days: [], allowed_session: "morning" });
                showSuccess("Rule added successfully");
            } else {
                showError("Failed to add rule");
            }
        } catch (err) {
            console.error(err);
            showError("Error adding rule");
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
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold">Distribution Rules</h3>
                <button
                    onClick={() => setShowAddForm(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                    <Plus className="w-4 h-4" />
                    Add Rule
                </button>
            </div>

            {showAddForm && (
                <div className="p-4 border rounded-lg bg-gray-50 dark:bg-gray-800 dark:border-gray-700">
                    <h4 className="font-medium mb-4">New Rule Configuration</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm mb-1">Category</label>
                            <select
                                className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                                value={newRule.category_type}
                                onChange={e => setNewRule({ ...newRule, category_type: e.target.value })}
                            >
                                <option value="general">General</option>
                                <option value="major">Major</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm mb-1">Year Level</label>
                            <select
                                className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
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
                            <label className="block text-sm mb-1">Allowed Session</label>
                            <select
                                className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600"
                                value={newRule.allowed_session}
                                onChange={e => setNewRule({ ...newRule, allowed_session: e.target.value })}
                            >
                                <option value="morning">Morning Only</option>
                                <option value="afternoon">Afternoon Only</option>
                                <option value="any">Any Time</option>
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm mb-1">Allowed Days (Indices 1-5)</label>
                            <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map(day => (
                                    <button
                                        key={day}
                                        onClick={() => toggleDay(day)}
                                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition
                      ${newRule.allowed_days.includes(day)
                                                ? "bg-blue-600 text-white"
                                                : "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300"}`}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-2 mt-4">
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleAddRule}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                        >
                            Save Rule
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="text-center py-4">Loading rules...</div>
            ) : (
                <>
                    <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-100">
                                <tr>
                                    <th className="px-4 py-3 font-medium">Category</th>
                                    <th className="px-4 py-3 font-medium">Year Level</th>
                                    <th className="px-4 py-3 font-medium">Allowed Days</th>
                                    <th className="px-4 py-3 font-medium">Session</th>
                                    <th className="px-4 py-3 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-gray-700 text-gray-800 dark:text-gray-200">
                                {rules.map(rule => (
                                    <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                        <td className="px-4 py-3 capitalize">{rule.category_type}</td>
                                        <td className="px-4 py-3">{rule.year_level_name || "All"}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex gap-1">
                                                {rule.allowed_days.map(d => (
                                                    <span key={d} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs dark:bg-blue-900/30 dark:text-blue-300">
                                                        Day {d}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 capitalize">{rule.allowed_session}</td>
                                        <td className="px-4 py-3 text-right">
                                            <button
                                                onClick={() => handleDelete(rule.id)}
                                                className="p-1 text-red-500 hover:bg-red-50 rounded dark:hover:bg-red-900/20"
                                                title="Delete Rule"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {rules.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                                            No distribution rules defined.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {confirmModal.isOpen && (
                        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
                            <div className={`${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} border rounded-2xl shadow-2xl max-w-sm w-full p-8 animate-slide-in`}>
                                <div className="flex flex-col items-center text-center">
                                    <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-6">
                                        <Trash2 className="w-8 h-8 text-red-500" />
                                    </div>
                                    <h3 className={`text-xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
                                        Delete Rule?
                                    </h3>
                                    <p className={`text-sm mb-8 ${isDark ? "text-gray-400" : "text-gray-600"} leading-relaxed`}>
                                        Are you sure you want to delete this distribution rule? This action cannot be undone.
                                    </p>
                                    <div className="flex gap-4 w-full">
                                        <button
                                            onClick={() => setConfirmModal({ isOpen: false, id: null })}
                                            className={`flex-1 px-6 py-3 rounded-xl font-semibold transition ${isDark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={confirmDelete}
                                            className="flex-1 px-6 py-3 rounded-xl font-semibold bg-red-600 text-white hover:bg-red-700 transition shadow-lg shadow-red-500/30"
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
