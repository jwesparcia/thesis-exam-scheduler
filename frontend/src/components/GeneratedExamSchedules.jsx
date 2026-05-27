import React, { useEffect, useState } from "react";
import { CalendarDays, FileText, Loader2, Send, Download, Trash2 } from "lucide-react";
import { useTheme } from "../context/themeStore";
import api from "../api";
import { useToast } from "../context/ToastContext";

export default function GeneratedExamSchedules() {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const { showSuccess, showError, showWarning } = useToast();
    const [courses, setCourses] = useState([]);
    const [years, setYears] = useState([]);
    const [selectedDept, setSelectedDept] = useState("College"); // "College" or "SHS"
    const [courseId, setCourseId] = useState("");
    const [yearId, setYearId] = useState("");
    const [semester, setSemester] = useState(1);
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showPostAllModal, setShowPostAllModal] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteScope, setDeleteScope] = useState("dept"); // "dept" or "all"

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const params = new URLSearchParams({ semester });
            if (selectedDept)  params.append("department",    selectedDept);

            const res = await api.get(`/exams/download?${params}`, {
                responseType: "blob",
            });

            const disposition = res.headers["content-disposition"] || "";
            const match = disposition.match(/filename="?([^"]+)"?/);
            const filename = match ? match[1] : `ExamSchedule_${selectedDept}_Sem${semester}.xlsx`;

            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            showSuccess(`Master schedule downloaded as "${filename}"`);
        } catch (err) {
            console.error("Download failed:", err);
            showError("Failed to download schedule. Please try again.");
        } finally {
            setDownloading(false);
        }
    };

    const handlePostAll = async () => {
        setShowPostAllModal(false);
        try {
            const res = await api.post(
                `/exams/post?semester=${semester}&department=${selectedDept}`
            );
            if (res.status === 200) {
                showSuccess(`Successfully posted all ${selectedDept} schedules to students' dashboards!`);
                fetchExams();
            } else {
                showError("Failed to post schedules.");
            }
        } catch (err) {
            console.error(err);
            showError(err.response?.data?.detail || "No draft schedules found to post.");
        }
    };

    const handleDeleteSchedule = async () => {
        setDeleting(true);
        try {
            let url = "/exams/clear";
            if (deleteScope === "dept") {
                url += `?department=${selectedDept}&semester=${semester}`;
            }
            const res = await api.delete(url);
            if (res.status === 200) {
                showSuccess(res.data.message || "Schedule cleared successfully!");
                setExams([]);
                fetchExams();
            } else {
                showError("Failed to delete schedules.");
            }
        } catch (err) {
            console.error("Delete failed:", err);
            showError(err.response?.data?.detail || "Failed to clear schedule. Please try again.");
        } finally {
            setDeleting(false);
            setShowDeleteModal(false);
        }
    };

    // Fetch courses and year levels
    useEffect(() => {
        const fetchOptions = async () => {
            try {
                const courseRes = await api.get("/catalog/courses");
                const yearRes = await api.get("/catalog/year-levels");
                setCourses(courseRes.data);
                setYears(yearRes.data);
            } catch (err) {
                console.error("Error loading options:", err);
                showError("Failed to connect to backend API");
            }
        };
        fetchOptions();
    }, []);

    // Fetch exams based on filters
    const fetchExams = async () => {
        if (!courseId || !yearId) return;

        setLoading(true);
        try {
            const queryParams = new URLSearchParams({
                course_id: courseId,
                year_level_id: yearId,
                semester: semester,
            });
            const res = await api.get(`/exams/?${queryParams}`);
            setExams(res.data);
        } catch (err) {
            console.error("Error fetching exams:", err);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchExams();
    }, [courseId, yearId, semester]);

    const filteredCourses = courses.filter(c => c.category === selectedDept);
    const filteredYears = years.filter(y => 
        selectedDept === "SHS" ? y.name.includes("Grade") : !y.name.includes("Grade")
    );

    // Reset subordinate filters when dept changes
    useEffect(() => {
        setCourseId("");
        setYearId("");
    }, [selectedDept]);

    const examsBySection = exams.reduce((groups, exam) => {
        if (!groups[exam.section_name]) groups[exam.section_name] = [];
        groups[exam.section_name].push(exam);
        return groups;
    }, {});

    return (
        <div className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gray-50"} rounded-2xl`}>
            <div className="max-w-7xl mx-auto px-6 py-10">
                {/* Header */}
                <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-3">
                        <CalendarDays className="text-blue-500 w-8 h-8" />
                        <h1 className={`text-3xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
                            Generated Exam Schedules
                        </h1>
                    </div>
                    
                    <div className="flex flex-wrap gap-3 items-center">
                        <button
                            onClick={() => {
                                setDeleteScope("all");
                                setShowDeleteModal(true);
                            }}
                            className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 font-bold text-sm"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete All Schedules
                        </button>
                        <button
                            onClick={() => {
                                setDeleteScope("dept");
                                setShowDeleteModal(true);
                            }}
                            className="bg-red-500 hover:bg-red-600 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 font-bold text-sm"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete {selectedDept} Schedule
                        </button>
                        <button
                            onClick={() => setShowPostAllModal(true)}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 font-bold text-sm"
                        >
                            <Send className="w-4 h-4" />
                            Post All {selectedDept} Schedules
                        </button>
                        <button
                            onClick={handleDownload}
                            disabled={downloading}
                            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-5 py-3 rounded-xl shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95 font-bold text-sm"
                        >
                            {downloading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Download className="w-4 h-4" />
                            )}
                            {downloading ? "Downloading..." : "Download Master Schedule"}
                        </button>
                    </div>
                </div>

                {/* Step 1: Select Department */}
                <div className={`rounded-2xl p-6 border mb-8 transition-all duration-500 ${isDark ? "bg-gray-800 border-gray-700 shadow-xl shadow-black/20" : "bg-white border-gray-100 shadow-lg shadow-gray-200/50"}`}>
                    <label className={`block text-sm font-semibold mb-6 ${isDark ? "text-blue-300" : "text-blue-700"}`}>
                        1. Choose Academic Level to View Schedules
                    </label>
                    <div className="flex gap-4">
                        <button
                            onClick={() => setSelectedDept("College")}
                            className={`flex-1 max-w-[220px] py-4 px-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center gap-2 ${selectedDept === "College"
                                ? "border-blue-500 bg-blue-500 text-white shadow-xl shadow-blue-500/30 scale-[1.02]"
                                : isDark
                                    ? "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600 hover:bg-gray-800"
                                    : "border-gray-100 bg-gray-50 text-gray-500 hover:border-blue-200 hover:text-blue-600"
                                }`}
                        >
                            <FileText className={`w-8 h-8 ${selectedDept === "College" ? "text-white" : "text-blue-500"}`} />
                            <span className="font-bold text-lg">College</span>
                        </button>
                        <button
                            onClick={() => setSelectedDept("SHS")}
                            className={`flex-1 max-w-[220px] py-4 px-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center gap-2 ${selectedDept === "SHS"
                                ? "border-blue-500 bg-blue-500 text-white shadow-xl shadow-blue-500/30 scale-[1.02]"
                                : isDark
                                    ? "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600 hover:bg-gray-800"
                                    : "border-gray-100 bg-gray-50 text-gray-500 hover:border-blue-200 hover:text-blue-600"
                                }`}
                        >
                            <CalendarDays className={`w-8 h-8 ${selectedDept === "SHS" ? "text-white" : "text-blue-500"}`} />
                            <span className="font-bold text-lg">Senior High</span>
                        </button>
                    </div>
                </div>

                {/* Step 2: Sequential Filters and Results */}
                {selectedDept ? (
                    <div className="space-y-10 animate-in fade-in slide-in-from-top-4 duration-500">
                        {/* Filters Card */}
                        <div
                            className={`rounded-2xl p-6 border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"
                                } shadow-sm`}
                        >
                            <h2
                                className={`text-xl font-semibold ${isDark ? "text-gray-300" : "text-gray-700"
                                    } mb-6 flex items-center gap-2`}
                            >
                                <FileText className="w-5 h-5 text-blue-500" /> 2. Refine Results ({selectedDept})
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Select Course / Strand */}
                                <div className="space-y-2">
                                    <label
                                        className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}
                                    >
                                        {selectedDept === "SHS" ? "Strand" : "Course"}
                                    </label>
                                    <select
                                        value={courseId}
                                        onChange={(e) => setCourseId(Number(e.target.value))}
                                        className={`border rounded-xl cursor-pointer p-3 w-full focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                                            ? "bg-gray-900 text-white border-gray-700"
                                            : "bg-gray-50 text-gray-700 border-gray-200"
                                            }`}
                                    >
                                        <option value="">{selectedDept === "SHS" ? "Choose a strand" : "Choose a course"}</option>
                                        {filteredCourses.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Select Year / Grade */}
                                <div className="space-y-2">
                                    <label
                                        className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}
                                    >
                                        {selectedDept === "SHS" ? "Grade" : "Year Level"}
                                    </label>
                                    <select
                                        value={yearId}
                                        onChange={(e) => setYearId(Number(e.target.value))}
                                        className={`border rounded-xl p-3 w-full cursor-pointer focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                                            ? "bg-gray-900 text-white border-gray-700"
                                            : "bg-gray-50 text-gray-700 border-gray-200"
                                            }`}
                                    >
                                        <option value="">{selectedDept === "SHS" ? "Choose a grade" : "Choose a year"}</option>
                                        {filteredYears.map((y) => (
                                            <option key={y.id} value={y.id}>
                                                {y.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Select Semester */}
                                <div className="space-y-2">
                                    <label
                                        className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}
                                    >
                                        Semester
                                    </label>
                                    <select
                                        value={semester}
                                        onChange={(e) => setSemester(Number(e.target.value))}
                                        className={`border rounded-xl p-3 w-full cursor-pointer focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                                            ? "bg-gray-900 text-white border-gray-700"
                                            : "bg-gray-50 text-gray-700 border-gray-200"
                                            }`}
                                    >
                                        <option value={1}>1st Semester</option>
                                        <option value={2}>2nd Semester</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Generated Exams Table */}
                        <div className="pt-6 border-t border-gray-100 dark:border-gray-800">
                            <h2
                                className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-800"
                                    } mb-6 flex items-center gap-3`}
                            >
                                <CalendarDays className="w-8 h-8 text-blue-500" /> Generated Schedule Results
                            </h2>

                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20 bg-white/50 dark:bg-gray-800/50 rounded-3xl border border-dashed border-gray-200 dark:border-gray-700">
                                    <Loader2 className="w-12 h-12 animate-spin text-blue-500 mb-4" />
                                    <span className={`text-lg font-medium ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                                        Fetching your schedules...
                                    </span>
                                </div>
                            ) : (!courseId || !yearId) ? (
                                <div className={`p-12 text-center rounded-3xl border-2 border-dashed ${isDark ? "border-gray-800 text-gray-500 bg-gray-800/20" : "border-gray-100 text-gray-400 bg-gray-50/30"}`}>
                                    <FileText className="w-16 h-16 mx-auto mb-4 opacity-10" />
                                    <p className="text-xl font-semibold mb-2">Ready to view schedules?</p>
                                    <p className="text-sm">Please select a {selectedDept === "SHS" ? "strand and grade" : "course and year level"} above to reveal the exam timetable.</p>
                                </div>
                            ) : exams.length === 0 ? (
                                <div className={`p-12 text-center rounded-3xl border-2 border-dashed ${isDark ? "border-gray-800 text-gray-500" : "border-gray-100 text-gray-400"}`}>
                                    <CalendarDays className="w-16 h-16 mx-auto mb-4 opacity-10" />
                                    <p className="text-xl font-semibold mb-2">No schedules found</p>
                                    <p className="text-sm">We couldn't find any generated exams for this selection. Try adjusting your filters or generate a new schedule in the first tab.</p>
                                </div>
                            ) : (
                                Object.entries(examsBySection).map(([sectionName, sectionExams]) => (
                                    <div
                                        key={sectionName}
                                        className={`rounded-2xl p-6 mb-8 shadow-sm transition hover:shadow-md ${isDark
                                            ? "bg-gray-800 border border-gray-700"
                                            : "bg-white border border-gray-100"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-6">
                                            <h3
                                                className={`text-xl font-bold ${isDark ? "text-blue-400" : "text-blue-700"
                                                    }`}
                                            >
                                                {sectionName}
                                            </h3>
                                            <div className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-xs font-bold uppercase">
                                                {sectionExams.length} Exams
                                            </div>
                                        </div>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-sm border-separate border-spacing-0">
                                                <thead
                                                    className={`${isDark
                                                        ? "bg-gray-700/50 text-gray-100"
                                                        : "bg-gray-50 text-gray-700"
                                                        }`}
                                                >
                                                    <tr>
                                                        <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-left font-bold first:rounded-tl-xl">
                                                            Subject
                                                        </th>
                                                        <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-left font-bold">
                                                            Proctor
                                                        </th>
                                                        <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-left font-bold">
                                                            Date
                                                        </th>
                                                        <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-left font-bold">
                                                            Time Period
                                                        </th>
                                                        <th className="border-b border-gray-300 dark:border-gray-600 px-4 py-3 text-left font-bold last:rounded-tr-xl">
                                                            Room
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                                    {sectionExams.map((e) => (
                                                        <tr
                                                            key={e.id}
                                                            className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors"
                                                        >
                                                            <td
                                                                className="px-4 py-4 font-medium"
                                                            >
                                                                <div className={`text-xs font-bold mb-1 ${isDark ? "text-gray-400" : "text-gray-400"}`}>{e.subject_code}</div>
                                                                <div className={isDark ? "text-white" : "text-gray-900"}>{e.subject_name}</div>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-2 h-2 rounded-full ${e.proctor ? "bg-green-500" : "bg-red-500"}`}></div>
                                                                    <span className={isDark ? "text-gray-300" : "text-gray-700"}>{e.proctor || "Unassigned"}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 font-semibold text-blue-600 dark:text-blue-400">
                                                                {e.exam_date}
                                                            </td>
                                                            <td className={`px-4 py-4 whitespace-nowrap ${isDark ? "text-gray-200" : "text-gray-900"}`}>
                                                                <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"} mb-1`}>
                                                                    {e.start_time && (e.start_time.includes("PM") || (parseInt(e.start_time.split(":")[0], 10) >= 12 && !e.start_time.includes("AM"))) ? "Afternoon Session" : "Morning Session"}
                                                                </div>
                                                                <div className="font-medium">{e.start_time} - {e.end_time}</div>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span className={`px-3 py-1 rounded-lg font-bold ${e.room && e.room !== "-"
                                                                    ? isDark ? "bg-gray-700 text-white" : "bg-gray-100 text-gray-800"
                                                                    : isDark ? "bg-red-500/20 text-red-200" : "bg-red-100 text-red-700"
                                                                    }`}>
                                                                    {e.room && e.room !== "-" ? e.room : "No Room"}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Post Exams Button */}
                        {courseId && yearId && exams.length > 0 && (
                            <button
                                onClick={async () => {
                                    const res = await api.post(
                                        `/exams/post?course_id=${courseId}&year_level_id=${yearId}&semester=${semester}`
                                    );

                                    if (res.status === 200) {
                                        showSuccess("Exams successfully posted for students to view!");
                                        await fetchExams();
                                    } else {
                                        showError("Failed to post exams.");
                                    }
                                }}
                                className="fixed bottom-10 right-10 bg-emerald-600 hover:bg-emerald-700 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center gap-3 transition-all hover:scale-110 active:scale-95 z-50 font-bold"
                            >
                                <Send className="w-6 h-6" />
                                Post Schedule
                            </button>
                        )}
                    </div>
                ) : (
                    <div className={`p-20 text-center rounded-3xl border-2 border-dashed ${isDark ? "border-gray-800 bg-gray-800/20 text-gray-600" : "border-gray-100 bg-gray-50/50 text-gray-400"}`}>
                        <CalendarDays className="w-16 h-16 mx-auto mb-4 opacity-10" />
                        <p className="text-xl font-semibold mb-2">Welcome to Schedule Viewer</p>
                        <p className="text-sm">Select an academic level above to filter and view generated schedules.</p>
                    </div>
                )}
            </div>

            {/* Confirmation Modal */}
            {showPostAllModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className={`p-8 rounded-3xl shadow-2xl max-w-md w-full transform transition-all scale-100 ${isDark ? "bg-gray-800 border border-gray-700" : "bg-white"}`}>
                        <div className="flex flex-col items-center text-center">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 shadow-lg ${isDark ? "bg-emerald-900/50 shadow-emerald-900/20" : "bg-emerald-100 shadow-emerald-200/50"}`}>
                                <Send className={`w-8 h-8 ${isDark ? "text-emerald-400" : "text-emerald-600"}`} />
                            </div>
                            <h3 className={`text-2xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
                                Post All Schedules?
                            </h3>
                            <p className={`mb-8 text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                                Are you sure you want to post ALL draft schedules for <span className="font-bold">{selectedDept}</span> (Semester {semester}) to students? This action will make them visible on their dashboards.
                            </p>
                            <div className="flex gap-4 w-full">
                                <button
                                    onClick={() => setShowPostAllModal(false)}
                                    className={`flex-1 py-3.5 rounded-xl font-bold transition-all active:scale-95 ${isDark ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-800"}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handlePostAll}
                                    className="flex-1 py-3.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-all shadow-lg shadow-emerald-600/30 active:scale-95"
                                >
                                    Yes, Post All
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className={`p-8 rounded-3xl shadow-2xl max-w-md w-full transform transition-all scale-100 ${isDark ? "bg-gray-800 border border-gray-700" : "bg-white"}`}>
                        <div className="flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-red-100 dark:bg-red-900/50 shadow-lg shadow-red-200/50 dark:shadow-red-900/20">
                                <Trash2 className="w-8 h-8 text-red-600 dark:text-red-400" />
                            </div>
                            <h3 className={`text-2xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
                                {deleteScope === "all" ? "Delete All Schedules?" : `Delete ${selectedDept} Schedule?`}
                            </h3>
                            <p className={`mb-8 text-sm leading-relaxed ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                                {deleteScope === "all" 
                                    ? "Are you sure you want to delete ALL generated exam schedules across the entire platform? This operation is permanent and cannot be undone."
                                    : `Are you sure you want to delete all generated exam schedules for ${selectedDept} (Semester ${semester})? This operation is permanent and cannot be undone.`
                                }
                            </p>
                            <div className="flex gap-4 w-full">
                                <button
                                    onClick={() => setShowDeleteModal(false)}
                                    disabled={deleting}
                                    className={`flex-1 py-3.5 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-55 ${isDark ? "bg-gray-700 hover:bg-gray-600 text-white" : "bg-gray-100 hover:bg-gray-200 text-gray-800"}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteSchedule}
                                    disabled={deleting}
                                    className="flex-1 py-3.5 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white transition-all shadow-lg shadow-red-600/30 active:scale-95 disabled:opacity-55 flex items-center justify-center gap-2"
                                >
                                    {deleting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            <span>Deleting...</span>
                                        </>
                                    ) : (
                                        <span>Yes, Delete</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
