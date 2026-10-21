import React, { useEffect, useState, useRef, useMemo } from "react";
import {
    CalendarDaysIcon,
    DocumentTextIcon,
    ArrowPathIcon,
    PaperAirplaneIcon,
    ArrowDownTrayIcon,
    TrashIcon,
    DocumentCheckIcon,
    PencilSquareIcon,
    XMarkIcon,
    MagnifyingGlassIcon,
    ChevronDownIcon,
    CheckIcon,
    UserIcon
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import api from "../api";
import { useToast } from "../context/ToastContext";

export default function GeneratedExamSchedules({ isGenerating }) {
    const { theme } = useTheme();
    const isDark = theme === "dark";
    const { showSuccess, showError, showWarning } = useToast();
    const [courses, setCourses] = useState([]);
    const [years, setYears] = useState([]);
    const [selectedDept, setSelectedDept] = useState("College"); // "College" or "SHS"
    const [courseId, setCourseId] = useState("");
    const [yearId, setYearId] = useState("");
    const [semester, setSemester] = useState(1);
    const [selectedTerm, setSelectedTerm] = useState("Midterm");
    const [exams, setExams] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showPostAllModal, setShowPostAllModal] = useState(false);
    const [showSaveAllModal, setShowSaveAllModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [deleteScope, setDeleteScope] = useState("dept"); // "dept" or "all"

    // Edit Exam Modal State
    const [editingExam, setEditingExam] = useState(null);
    const [availableRooms, setAvailableRooms] = useState([]);
    const [availableTimeslots, setAvailableTimeslots] = useState([]);
    const [availableProctors, setAvailableProctors] = useState([]);
    const [editRoomId, setEditRoomId] = useState("");
    const [editTimeslotId, setEditTimeslotId] = useState("");
    const [editProctorId, setEditProctorId] = useState("");
    const [editSaving, setEditSaving] = useState(false);

    // Searchable Proctor Dropdown State
    const [eligibleProctors, setEligibleProctors] = useState([]);
    const [loadingEligibleProctors, setLoadingEligibleProctors] = useState(false);
    const [proctorSearchQuery, setProctorSearchQuery] = useState("");
    const [isProctorDropdownOpen, setIsProctorDropdownOpen] = useState(false);
    const proctorDropdownRef = useRef(null);
    const proctorSearchInputRef = useRef(null);

    const handleDownload = async () => {
        setDownloading(true);
        try {
            const params = new URLSearchParams({ semester });
            if (selectedDept)  params.append("department",    selectedDept);
            if (selectedTerm)  params.append("term",          selectedTerm);

            const res = await api.get(`/exams/download?${params}`, {
                responseType: "blob",
            });

            const disposition = res.headers["content-disposition"] || "";
            const match = disposition.match(/filename="?([^"]+)"?/);
            const filename = match ? match[1] : `ExamSchedule_${selectedDept}_Sem${semester}_${selectedTerm}.xlsx`;

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
        if (isGenerating) {
            showError("Cannot post schedules while schedule generation is ongoing");
            return;
        }
        setShowPostAllModal(false);
        try {
            const res = await api.post(
                `/exams/post?semester=${semester}&department=${selectedDept}&term=${selectedTerm}`
            );
            if (res.status === 200) {
                showSuccess(res.data.message || `Successfully posted all ${selectedDept} ${selectedTerm} schedules to students' dashboards!`);
                fetchExams();
            } else {
                showError("Failed to post schedules.");
            }
        } catch (err) {
            console.error(err);
            showError(err.response?.data?.detail || `No draft or saved ${selectedTerm} schedules found to post.`);
        }
    };

    const handleSaveAll = async () => {
        if (isGenerating) {
            showError("Cannot save schedules while schedule generation is ongoing");
            return;
        }
        setShowSaveAllModal(false);
        setSaving(true);
        try {
            const res = await api.post(
                `/exams/save?semester=${semester}&department=${selectedDept}&term=${selectedTerm}`
            );
            if (res.status === 200) {
                showSuccess(`Successfully saved all ${selectedDept} ${selectedTerm} schedules!`);
                fetchExams();
            } else {
                showError("Failed to save schedules.");
            }
        } catch (err) {
            console.error(err);
            showError(err.response?.data?.detail || `No draft ${selectedTerm} schedules found to save.`);
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteSchedule = async () => {
        if (isGenerating) {
            showError("Cannot delete schedules while schedule generation is ongoing");
            return;
        }
        setDeleting(true);
        try {
            let url = "/exams/clear";
            if (deleteScope === "shs") {
                url += "?department=SHS";
            } else if (deleteScope === "dept") {
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

    const handleOpenEdit = async (exam) => {
        setEditingExam(exam);
        setEditRoomId(exam.room_id ? String(exam.room_id) : "");
        setEditTimeslotId(exam.timeslot_id ? String(exam.timeslot_id) : "");
        setEditProctorId(exam.proctor_id ? String(exam.proctor_id) : "");
        setProctorSearchQuery("");
        setIsProctorDropdownOpen(false);

        try {
            const [roomsRes, timeslotsRes, proctorsRes] = await Promise.all([
                api.get("/exams/rooms", { params: { department: selectedDept } }),
                api.get("/exams/timeslots"),
                api.get("/proctors/")
            ]);
            setAvailableRooms(roomsRes.data || []);
            setAvailableTimeslots(timeslotsRes.data || []);
            setAvailableProctors(proctorsRes.data || []);
        } catch (err) {
            console.error("Error loading edit options:", err);
            showError("Failed to load room, timeslot, or proctor options.");
        }
    };

    // Dynamically fetch only eligible proctors for the current exam and timeslot
    useEffect(() => {
        if (!editingExam) {
            setEligibleProctors([]);
            return;
        }
        let isMounted = true;
        const fetchEligible = async () => {
            setLoadingEligibleProctors(true);
            try {
                const res = await api.get(`/exams/${editingExam.id}/eligible-proctors`, {
                    params: {
                        timeslot_id: editTimeslotId ? parseInt(editTimeslotId, 10) : undefined
                    }
                });
                if (isMounted) {
                    setEligibleProctors(res.data || []);
                }
            } catch (err) {
                console.error("Error loading eligible proctors:", err);
            } finally {
                if (isMounted) {
                    setLoadingEligibleProctors(false);
                }
            }
        };
        fetchEligible();
        return () => {
            isMounted = false;
        };
    }, [editingExam?.id, editTimeslotId]);

    // Handle outside clicks and keyboard interactions for proctor searchable dropdown
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (proctorDropdownRef.current && !proctorDropdownRef.current.contains(e.target)) {
                setIsProctorDropdownOpen(false);
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                setIsProctorDropdownOpen(false);
            }
        };
        if (isProctorDropdownOpen) {
            document.addEventListener("mousedown", handleClickOutside);
            document.addEventListener("keydown", handleKeyDown);
            setTimeout(() => {
                proctorSearchInputRef.current?.focus();
            }, 50);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isProctorDropdownOpen]);

    // Resolve currently selected proctor details
    const selectedProctorObj = useMemo(() => {
        if (!editProctorId) return null;
        const pId = parseInt(editProctorId, 10);
        return (
            eligibleProctors.find((p) => p.id === pId) ||
            availableProctors.find((p) => p.id === pId) ||
            null
        );
    }, [editProctorId, eligibleProctors, availableProctors]);

    // Filter eligible proctors dynamically as user types (supports partial matches)
    const filteredEligibleProctors = useMemo(() => {
        if (!proctorSearchQuery.trim()) return eligibleProctors;
        const q = proctorSearchQuery.toLowerCase().trim();
        return eligibleProctors.filter((p) =>
            (p.name && p.name.toLowerCase().includes(q)) ||
            (p.department && p.department.toLowerCase().includes(q))
        );
    }, [eligibleProctors, proctorSearchQuery]);

    const handleSaveEdit = async (e) => {
        e.preventDefault();
        if (!editingExam) return;
        setEditSaving(true);
        try {
            const res = await api.put(`/exams/${editingExam.id}`, {
                room_id: editRoomId ? parseInt(editRoomId, 10) : null,
                timeslot_id: editTimeslotId ? parseInt(editTimeslotId, 10) : null,
                proctor_id: editProctorId ? parseInt(editProctorId, 10) : null,
            });
            showSuccess(res.data?.message || `Successfully updated exam for ${editingExam.subject_code}!`);
            setEditingExam(null);
            fetchExams();
        } catch (err) {
            console.error("Failed to update exam:", err);
            showError(err.response?.data?.detail || "Failed to update exam.");
        } finally {
            setEditSaving(false);
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
                term: selectedTerm,
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
    }, [courseId, yearId, semester, selectedTerm]);

    const filteredCourses = courses.filter(c => c.category === selectedDept);
    const filteredYears = years.filter(y => 
        selectedDept === "SHS" ? y.name.includes("Grade") : !y.name.includes("Grade")
    );

    // Reset subordinate filters and set term/semester defaults when dept changes
    useEffect(() => {
        setCourseId("");
        setYearId("");
        if (selectedDept === "SHS") {
            setSelectedTerm("ST1");
        } else {
            setSelectedTerm("Midterm");
            if (semester > 2) {
                setSemester(1);
            }
        }
    }, [selectedDept]);

    const examsBySection = exams.reduce((groups, exam) => {
        if (!groups[exam.section_name]) groups[exam.section_name] = [];
        groups[exam.section_name].push(exam);
        return groups;
    }, {});

    return (
        <div className={`min-h-screen ${isDark ? "bg-slate-900/50" : "bg-slate-50"} rounded-2xl transition-colors`}>
            <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-10">
                {/* Header */}
                <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 mb-6 sm:mb-8">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                        <CalendarDaysIcon className="text-blue-600 dark:text-blue-400 w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
                        <h1 className={`text-xl sm:text-3xl font-bold tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                            Generated Exam Schedules
                        </h1>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 sm:gap-2.5 items-center w-full xl:w-auto">
                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={downloading}
                            className="flex-1 sm:flex-none bg-blue-600 hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white px-3.5 sm:px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all font-semibold text-xs sm:text-sm"
                        >
                            {downloading ? (
                                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                            ) : (
                                <ArrowDownTrayIcon className="w-4 h-4" />
                            )}
                            {downloading ? "Downloading..." : "Export Excel"}
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowSaveAllModal(true)}
                            disabled={isGenerating}
                            className={`flex-1 sm:flex-none text-white px-3.5 sm:px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all font-semibold text-xs sm:text-sm ${
                                isGenerating
                                    ? "bg-slate-600/50 opacity-50 cursor-not-allowed"
                                    : "bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600"
                            }`}
                            title={isGenerating ? "Cannot save schedules while schedule generation is ongoing" : ""}
                        >
                            <DocumentCheckIcon className="w-4 h-4" />
                            Save All
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowPostAllModal(true)}
                            disabled={isGenerating}
                            className={`flex-1 sm:flex-none text-white px-3.5 sm:px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all font-semibold text-xs sm:text-sm ${
                                isGenerating
                                    ? "bg-emerald-600/50 opacity-50 cursor-not-allowed"
                                    : "bg-emerald-600 hover:bg-emerald-700"
                            }`}
                            title={isGenerating ? "Cannot post schedules while schedule generation is ongoing" : ""}
                        >
                            <PaperAirplaneIcon className="w-4 h-4" />
                            Post All {selectedDept}
                        </button>
                        {selectedDept === "SHS" ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setDeleteScope("shs");
                                    setShowDeleteModal(true);
                                }}
                                disabled={isGenerating}
                                className={`flex-1 sm:flex-none border border-rose-300 dark:border-rose-900/60 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-3.5 sm:px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all font-semibold text-xs sm:text-sm ${
                                    isGenerating ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                                title={isGenerating ? "Cannot delete schedules while schedule generation is ongoing" : "Delete all Senior High School schedules"}
                            >
                                <TrashIcon className="w-4 h-4" />
                                Delete All SHS Schedule
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={() => {
                                    setDeleteScope("dept");
                                    setShowDeleteModal(true);
                                }}
                                disabled={isGenerating}
                                className={`flex-1 sm:flex-none border border-rose-300 dark:border-rose-900/60 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-3.5 sm:px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all font-semibold text-xs sm:text-sm ${
                                    isGenerating ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                                title={isGenerating ? "Cannot delete schedules while schedule generation is ongoing" : ""}
                            >
                                <TrashIcon className="w-4 h-4" />
                                Delete College Schedule
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setDeleteScope("all");
                                setShowDeleteModal(true);
                            }}
                            disabled={isGenerating}
                            className={`flex-1 sm:flex-none bg-rose-600 hover:bg-rose-700 text-white px-3.5 sm:px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-center gap-1.5 transition-all font-semibold text-xs sm:text-sm ${
                                isGenerating ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                            title={isGenerating ? "Cannot delete schedules while schedule generation is ongoing" : ""}
                        >
                            <TrashIcon className="w-4 h-4" />
                            Delete All
                        </button>
                    </div>
                </div>

                {/* Step 1: Select Department */}
                <div className={`rounded-2xl p-4 sm:p-6 border mb-6 sm:mb-8 transition-all ${isDark ? "bg-slate-850 border-slate-750 shadow-xs" : "bg-white border-slate-200 shadow-xs"}`}>
                    <label className={`block text-xs sm:text-sm font-semibold mb-4 sm:mb-6 ${isDark ? "text-blue-300" : "text-blue-800"}`}>
                        1. Choose Academic Level to View Schedules
                    </label>
                    <div className="flex gap-3 sm:gap-4">
                        <button
                            type="button"
                            onClick={() => setSelectedDept("College")}
                            className={`flex-1 max-w-[220px] py-3 sm:py-4 px-3 sm:px-6 rounded-xl sm:rounded-2xl border-2 transition-all duration-200 flex flex-col items-center gap-1.5 sm:gap-2 ${selectedDept === "College"
                                ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20 font-bold"
                                : isDark
                                    ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-750 font-medium"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-600 font-medium"
                                }`}
                        >
                            <DocumentTextIcon className={`w-6 h-6 sm:w-8 sm:h-8 ${selectedDept === "College" ? "text-white" : "text-blue-600 dark:text-blue-400"}`} />
                            <span className="font-bold text-base sm:text-lg">College</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setSelectedDept("SHS")}
                            className={`flex-1 max-w-[220px] py-3 sm:py-4 px-3 sm:px-6 rounded-xl sm:rounded-2xl border-2 transition-all duration-200 flex flex-col items-center gap-1.5 sm:gap-2 ${selectedDept === "SHS"
                                ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20 font-bold"
                                : isDark
                                    ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-750 font-medium"
                                    : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-600 font-medium"
                                }`}
                        >
                            <CalendarDaysIcon className={`w-6 h-6 sm:w-8 sm:h-8 ${selectedDept === "SHS" ? "text-white" : "text-blue-600 dark:text-blue-400"}`} />
                            <span className="font-bold text-base sm:text-lg">Senior High</span>
                        </button>
                    </div>
                </div>

                {/* Step 2: Sequential Filters and Results */}
                {selectedDept ? (
                    <div className="space-y-6 sm:space-y-10 animate-in fade-in slide-in-from-top-4 duration-500">
                        {/* Filters Card */}
                        <div
                            className={`rounded-2xl p-4 sm:p-6 border ${isDark ? "bg-slate-850 border-slate-750" : "bg-white border-slate-200"
                                } shadow-xs`}
                        >
                            <h2
                                className={`text-lg sm:text-xl font-bold ${isDark ? "text-slate-100" : "text-slate-900"
                                    } mb-4 sm:mb-6 flex items-center gap-2`}
                            >
                                <DocumentTextIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" /> 2. Refine Results ({selectedDept})
                            </h2>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                                {/* Select Course / Strand */}
                                <div className="space-y-2">
                                    <label
                                        className={`block text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`}
                                    >
                                        {selectedDept === "SHS" ? "Strand" : "Course"}
                                    </label>
                                    <select
                                        value={courseId}
                                        onChange={(e) => setCourseId(Number(e.target.value))}
                                        className={`border rounded-xl cursor-pointer p-3 w-full focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all ${isDark
                                            ? "bg-slate-800 text-slate-100 border-slate-700"
                                            : "bg-slate-50 text-slate-800 border-slate-200"
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
                                        className={`block text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`}
                                    >
                                        {selectedDept === "SHS" ? "Grade" : "Year Level"}
                                    </label>
                                    <select
                                        value={yearId}
                                        onChange={(e) => setYearId(Number(e.target.value))}
                                        className={`border rounded-xl p-3 w-full cursor-pointer focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all ${isDark
                                            ? "bg-slate-800 text-slate-100 border-slate-700"
                                            : "bg-slate-50 text-slate-800 border-slate-200"
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
                                        className={`block text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`}
                                    >
                                        Semester
                                    </label>
                                    <select
                                        value={semester}
                                        onChange={(e) => setSemester(Number(e.target.value))}
                                        className={`border rounded-xl p-3 w-full cursor-pointer focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all ${isDark
                                            ? "bg-slate-800 text-slate-100 border-slate-700"
                                            : "bg-slate-50 text-slate-800 border-slate-200"
                                            }`}
                                    >
                                        <option value={1}>1st Semester</option>
                                        <option value={2}>2nd Semester</option>
                                        {selectedDept === "SHS" && (
                                            <option value={3}>3rd Semester</option>
                                        )}
                                    </select>
                                </div>

                                {/* Select Term */}
                                <div className="space-y-2">
                                    <label
                                        className={`block text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`}
                                    >
                                        Exam Term
                                    </label>
                                    <select
                                        value={selectedTerm}
                                        onChange={(e) => setSelectedTerm(e.target.value)}
                                        className={`border rounded-xl p-3 w-full cursor-pointer focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all ${isDark
                                            ? "bg-slate-800 text-slate-100 border-slate-700"
                                            : "bg-slate-50 text-slate-800 border-slate-200"
                                            }`}
                                    >
                                        {selectedDept === "SHS" ? (
                                            <>
                                                <option value="ST1">Summative Test 1 (ST1)</option>
                                                <option value="ST2">Summative Test 2 (ST2)</option>
                                                <option value="T1">Term 1 (T1)</option>
                                            </>
                                        ) : (
                                            <>
                                                <option value="Prelim">Prelim</option>
                                                <option value="Midterm">Midterm</option>
                                                <option value="Pre-Final">Pre-Final</option>
                                                <option value="Final">Final</option>
                                            </>
                                        )}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Generated Exams Table */}
                        <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                            <h2
                                className={`text-2xl font-bold tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"
                                    } mb-6 flex items-center gap-3`}
                            >
                                <CalendarDaysIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" /> Generated Schedule Results
                            </h2>

                            {loading ? (
                                <div className="flex flex-col items-center justify-center py-20 bg-white/50 dark:bg-slate-850/50 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
                                    <ArrowPathIcon className="w-12 h-12 animate-spin text-blue-600 dark:text-blue-400 mb-4" />
                                    <span className={`text-lg font-medium ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                                        Fetching your schedules...
                                    </span>
                                </div>
                            ) : (!courseId || !yearId) ? (
                                <div className={`p-12 text-center rounded-3xl border-2 border-dashed ${isDark ? "border-slate-800 text-slate-400 bg-slate-850/20" : "border-slate-200 text-slate-500 bg-slate-50/50"}`}>
                                    <DocumentTextIcon className="w-16 h-16 mx-auto mb-4 opacity-20 text-blue-500" />
                                    <p className="text-xl font-bold mb-2">Ready to view schedules?</p>
                                    <p className="text-sm">Please select a {selectedDept === "SHS" ? "strand and grade" : "course and year level"} above to reveal the exam timetable.</p>
                                </div>
                            ) : exams.length === 0 ? (
                                <div className={`p-12 text-center rounded-3xl border-2 border-dashed ${isDark ? "border-slate-800 text-slate-400 bg-slate-850/20" : "border-slate-200 text-slate-500 bg-slate-50/50"}`}>
                                    <CalendarDaysIcon className="w-16 h-16 mx-auto mb-4 opacity-20 text-blue-500" />
                                    <p className="text-xl font-bold mb-2">No schedules found</p>
                                    <p className="text-sm">We couldn't find any generated exams for this selection. Try adjusting your filters or generate a new schedule in the first tab.</p>
                                </div>
                            ) : (
                                Object.entries(examsBySection).map(([sectionName, sectionExams]) => (
                                    <div
                                        key={sectionName}
                                        className={`rounded-2xl p-6 mb-8 shadow-xs transition hover:shadow-sm ${isDark
                                            ? "bg-slate-850 border border-slate-750"
                                            : "bg-white border border-slate-200"
                                            }`}
                                    >
                                        <div className="flex items-center justify-between mb-6">
                                            <h3
                                                className={`text-xl font-bold ${isDark ? "text-blue-400" : "text-blue-700"
                                                    }`}
                                            >
                                                {sectionName}
                                            </h3>
                                            <div className="px-3 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900/50 text-xs font-bold uppercase">
                                                {sectionExams.length} Exams
                                            </div>
                                        </div>
                                        <div className="space-y-3 md:hidden">
                                            {sectionExams.map((exam) => (
                                                <article
                                                    key={exam.id}
                                                    className={`rounded-xl border p-4 ${isDark ? "border-slate-700 bg-slate-900/40" : "border-slate-200 bg-slate-50"}`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0">
                                                            <p className={`break-words text-xs font-bold font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>{exam.subject_code}</p>
                                                            <h4 className={`mt-1 break-words font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{exam.subject_name}</h4>
                                                        </div>
                                                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold uppercase ${
                                                            exam.status === "posted"
                                                                ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
                                                                : exam.status === "saved"
                                                                ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
                                                                : "border-slate-200 bg-slate-100 text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                                        }`}>
                                                            {exam.status || "draft"}
                                                        </span>
                                                    </div>
                                                    <dl className={`mt-4 grid grid-cols-1 gap-x-3 gap-y-3 border-t pt-3 text-sm sm:grid-cols-2 ${isDark ? "border-slate-700 text-slate-300" : "border-slate-200 text-slate-700"}`}>
                                                        <div className="min-w-0">
                                                            <dt className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Proctor</dt>
                                                            <dd className="mt-1 break-words font-medium">{exam.proctor || "Unassigned"}</dd>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <dt className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Date</dt>
                                                            <dd className="mt-1 break-words font-semibold text-blue-600 dark:text-blue-400">{exam.exam_date}</dd>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <dt className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Time</dt>
                                                            <dd className="mt-1 break-words font-medium">{exam.start_time} - {exam.end_time}</dd>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <dt className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Room</dt>
                                                            <dd className="mt-1 break-words font-semibold">{exam.room && exam.room !== "-" ? exam.room : "No Room"}</dd>
                                                        </div>
                                                    </dl>
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenEdit(exam)}
                                                        className={`mt-4 min-h-11 w-full rounded-lg border px-4 text-sm font-semibold transition ${
                                                            isDark
                                                                ? "border-blue-500/30 bg-blue-600/20 text-white hover:bg-blue-600/40"
                                                                : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
                                                        }`}
                                                        title="Edit Room, Timeslot, or Proctor"
                                                    >
                                                        <PencilSquareIcon className="mr-1.5 inline h-4 w-4" />
                                                        Edit Schedule
                                                    </button>
                                                </article>
                                            ))}
                                        </div>
                                        <div className="hidden overflow-x-auto custom-scrollbar md:block">
                                            <table className="w-full text-xs sm:text-sm border-separate border-spacing-0 min-w-[640px]">
                                                <thead
                                                    className={`${isDark
                                                        ? "bg-slate-750 text-slate-200"
                                                        : "bg-slate-100 text-slate-700"
                                                        }`}
                                                >
                                                    <tr>
                                                        <th className="border-b border-slate-300 dark:border-slate-600 px-4 py-3 text-left font-bold first:rounded-tl-xl">
                                                            Subject
                                                        </th>
                                                        <th className="border-b border-slate-300 dark:border-slate-600 px-4 py-3 text-left font-bold">
                                                            Proctor
                                                        </th>
                                                        <th className="border-b border-slate-300 dark:border-slate-600 px-4 py-3 text-left font-bold">
                                                            Date
                                                        </th>
                                                        <th className="border-b border-slate-300 dark:border-slate-600 px-4 py-3 text-left font-bold">
                                                            Time Period
                                                        </th>
                                                        <th className="border-b border-slate-300 dark:border-slate-600 px-4 py-3 text-left font-bold">
                                                            Room
                                                        </th>
                                                        <th className="border-b border-slate-300 dark:border-slate-600 px-4 py-3 text-center font-bold last:rounded-tr-xl">
                                                            Actions
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                    {sectionExams.map((e) => (
                                                        <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-2 mb-1">
                                                                    <span className={`text-xs font-bold font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>{e.subject_code}</span>
                                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                                                                        e.status === "posted"
                                                                            ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60"
                                                                            : e.status === "saved"
                                                                            ? "bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60"
                                                                            : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                                                    }`}>
                                                                        {e.status || "draft"}
                                                                    </span>
                                                                </div>
                                                                <div className={`font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>{e.subject_name}</div>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-2 h-2 rounded-full ${e.proctor ? "bg-emerald-500" : "bg-rose-500"}`}></div>
                                                                    <span className={isDark ? "text-slate-300" : "text-slate-700"}>{e.proctor || "Unassigned"}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-4 font-semibold text-blue-600 dark:text-blue-400">
                                                                {e.exam_date}
                                                            </td>
                                                            <td className={`px-4 py-4 whitespace-nowrap ${isDark ? "text-slate-200" : "text-slate-900"}`}>
                                                                <div className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"} mb-0.5`}>
                                                                    {e.start_time && (e.start_time.includes("PM") || (parseInt(e.start_time.split(":")[0], 10) >= 12 && !e.start_time.includes("AM"))) ? "Afternoon Session" : "Morning Session"}
                                                                </div>
                                                                <div className="font-medium font-mono text-xs">{e.start_time} - {e.end_time}</div>
                                                            </td>
                                                            <td className="px-4 py-4">
                                                                <span className={`px-2.5 py-1 rounded-lg font-bold text-xs border ${e.room && e.room !== "-"
                                                                    ? isDark ? "bg-slate-750 text-slate-100 border-slate-600" : "bg-slate-100 text-slate-800 border-slate-200"
                                                                    : isDark ? "bg-rose-950/40 text-rose-300 border-rose-900/50" : "bg-rose-50 text-rose-700 border-rose-200"
                                                                    }`}>
                                                                    {e.room && e.room !== "-" ? e.room : "No Room"}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-4 text-center whitespace-nowrap">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleOpenEdit(e)}
                                                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition shadow-xs ${
                                                                        isDark
                                                                            ? "bg-slate-750 hover:bg-slate-700 text-slate-100 border border-slate-600"
                                                                            : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-300"
                                                                    }`}
                                                                    title="Edit Room, Timeslot, or Proctor"
                                                                >
                                                                    <PencilSquareIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                                                                    <span>Edit</span>
                                                                </button>
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

                        {/* Floating Action Buttons */}
                        {courseId && yearId && exams.length > 0 && (
                            <div className="fixed bottom-4 right-4 sm:bottom-10 sm:right-10 flex flex-col sm:flex-row gap-2.5 sm:gap-4 z-50 max-w-[calc(100vw-2rem)]">
                                {/* Save Schedule Button */}
                                {exams.some(e => e.status === "draft") && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (isGenerating) {
                                                showError("Cannot save schedules while schedule generation is ongoing");
                                                return;
                                            }
                                            setSaving(true);
                                            try {
                                                const res = await api.post(
                                                    `/exams/save?course_id=${courseId}&year_level_id=${yearId}&semester=${semester}&term=${selectedTerm}`
                                                );

                                                if (res.status === 200) {
                                                    showSuccess("Exams successfully saved!");
                                                    await fetchExams();
                                                } else {
                                                    showError("Failed to save exams.");
                                                }
                                            } catch (err) {
                                                console.error(err);
                                                showError(err.response?.data?.detail || "Failed to save exams.");
                                            } finally {
                                                setSaving(false);
                                            }
                                        }}
                                        disabled={isGenerating || saving}
                                        className={`text-white px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-2 sm:gap-2.5 transition-all font-semibold text-xs sm:text-sm ${
                                            isGenerating || saving
                                                ? "bg-slate-600/50 opacity-50 cursor-not-allowed"
                                                : "bg-slate-750 hover:bg-slate-700 border border-slate-650"
                                        }`}
                                        title={isGenerating ? "Cannot save schedules while schedule generation is ongoing" : ""}
                                    >
                                        {saving ? (
                                            <ArrowPathIcon className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <DocumentCheckIcon className="w-5 h-5" />
                                        )}
                                        {saving ? "Saving..." : "Save Schedule"}
                                    </button>
                                )}

                                {/* Post Schedule Button */}
                                {exams.some(e => e.status === "draft" || e.status === "saved") && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (isGenerating) {
                                                showError("Cannot post schedules while schedule generation is ongoing");
                                                return;
                                            }
                                            try {
                                                const res = await api.post(
                                                    `/exams/post?course_id=${courseId}&year_level_id=${yearId}&semester=${semester}&term=${selectedTerm}`
                                                );

                                                if (res.status === 200) {
                                                    showSuccess(res.data.message || "Exams successfully posted for students to view!");
                                                    await fetchExams();
                                                } else {
                                                    showError("Failed to post exams.");
                                                }
                                            } catch (err) {
                                                console.error(err);
                                                showError(err.response?.data?.detail || "Failed to post exams.");
                                            }
                                        }}
                                        disabled={isGenerating}
                                        className={`text-white px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl shadow-lg flex items-center justify-center gap-2 sm:gap-2.5 transition-all font-semibold text-xs sm:text-sm ${
                                            isGenerating
                                                ? "bg-emerald-600/50 opacity-50 cursor-not-allowed"
                                                : "bg-emerald-600 hover:bg-emerald-700"
                                        }`}
                                        title={isGenerating ? "Cannot post schedules while schedule generation is ongoing" : ""}
                                    >
                                        <PaperAirplaneIcon className="w-5 h-5" />
                                        Post Schedule
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={`p-10 sm:p-20 text-center rounded-3xl border-2 border-dashed ${isDark ? "border-slate-800 bg-slate-850/20 text-slate-400" : "border-slate-200 bg-slate-50/50 text-slate-500"}`}>
                        <CalendarDaysIcon className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 opacity-20 text-blue-500" />
                        <p className="text-lg sm:text-xl font-bold mb-2 text-slate-900 dark:text-slate-100">Welcome to Schedule Viewer</p>
                        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400">Select an academic level above to filter and view generated schedules.</p>
                    </div>
                )}
            </div>

            {/* Confirmation Modal */}
            {showPostAllModal && (
                <div 
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
                >
                    <div 
                        className="absolute inset-0"
                        onClick={() => setShowPostAllModal(false)}
                    />
                    <div className={`relative p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full border ${isDark ? "bg-slate-900 border-slate-750" : "bg-white border-slate-200"}`}>
                        <button
                            type="button"
                            onClick={() => setShowPostAllModal(false)}
                            aria-label="Close dialog"
                            className={`absolute top-4 right-4 p-1.5 rounded-lg transition ${
                                isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                            }`}
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                        <div className="flex flex-col items-center text-center">
                            <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-4 sm:mb-6 ${isDark ? "bg-emerald-950/50 text-emerald-400" : "bg-emerald-100 text-emerald-600"}`}>
                                <PaperAirplaneIcon className="w-7 h-7 sm:w-8 sm:h-8" />
                            </div>
                            <h3 className={`text-xl sm:text-2xl font-bold mb-2 sm:mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
                                Post All Schedules?
                            </h3>
                            <p className={`mb-6 sm:mb-8 text-xs sm:text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                                Are you sure you want to post ALL draft schedules for <span className="font-bold text-slate-900 dark:text-white">{selectedDept}</span> (Semester {semester}) to students? This action will make them visible on their dashboards.
                            </p>
                            <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 w-full">
                                <button
                                    type="button"
                                    onClick={() => setShowPostAllModal(false)}
                                    className={`w-full py-3 sm:py-3.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-200" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handlePostAll}
                                    disabled={isGenerating}
                                    className={`w-full py-3 sm:py-3.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-md ${
                                        isGenerating
                                            ? "bg-emerald-600/50 opacity-50 cursor-not-allowed"
                                            : "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20"
                                    }`}
                                >
                                    Yes, Post All
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Save All Confirmation Modal */}
            {showSaveAllModal && (
                <div 
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
                >
                    <div 
                        className="absolute inset-0"
                        onClick={() => !saving && setShowSaveAllModal(false)}
                    />
                    <div className={`relative p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full border ${isDark ? "bg-slate-900 border-slate-750" : "bg-white border-slate-200"}`}>
                        <button
                            type="button"
                            onClick={() => setShowSaveAllModal(false)}
                            disabled={saving}
                            aria-label="Close dialog"
                            className={`absolute top-4 right-4 p-1.5 rounded-lg transition ${
                                isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                            }`}
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                        <div className="flex flex-col items-center text-center">
                            <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-4 sm:mb-6 ${isDark ? "bg-slate-800 text-slate-200" : "bg-slate-100 text-slate-700"}`}>
                                <DocumentCheckIcon className="w-7 h-7 sm:w-8 sm:h-8" />
                            </div>
                            <h3 className={`text-xl sm:text-2xl font-bold mb-2 sm:mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
                                Save All Schedules?
                            </h3>
                            <p className={`mb-6 sm:mb-8 text-xs sm:text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                                Are you sure you want to save all draft schedules for <span className="font-bold text-slate-900 dark:text-white">{selectedDept}</span> <span className="font-bold text-slate-900 dark:text-white">{selectedTerm}</span> (Semester {semester})? They will not be visible to students until posted.
                            </p>
                            <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 w-full">
                                <button
                                    type="button"
                                    onClick={() => setShowSaveAllModal(false)}
                                    disabled={saving}
                                    className={`w-full py-3 sm:py-3.5 rounded-xl font-bold text-xs sm:text-sm transition-all ${isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-200" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleSaveAll}
                                    disabled={saving || isGenerating}
                                    className={`w-full py-3 sm:py-3.5 rounded-xl font-bold text-xs sm:text-sm text-white transition-all shadow-md ${
                                        isGenerating || saving
                                            ? "bg-slate-600/50 opacity-50 cursor-not-allowed"
                                            : "bg-slate-700 hover:bg-slate-800 dark:bg-slate-700 dark:hover:bg-slate-600 shadow-slate-700/20"
                                    }`}
                                >
                                    {saving ? "Saving..." : "Yes, Save All"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div 
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
                >
                    <div 
                        className="absolute inset-0"
                        onClick={() => !deleting && setShowDeleteModal(false)}
                    />
                    <div className={`relative p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full border ${isDark ? "bg-slate-900 border-slate-750" : "bg-white border-slate-200"}`}>
                        <button
                            type="button"
                            onClick={() => setShowDeleteModal(false)}
                            disabled={deleting}
                            aria-label="Close dialog"
                            className={`absolute top-4 right-4 p-1.5 rounded-lg transition ${
                                isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                            }`}
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                        <div className="flex flex-col items-center text-center">
                            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-4 sm:mb-6 bg-rose-100 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400">
                                <TrashIcon className="w-7 h-7 sm:w-8 sm:h-8" />
                            </div>
                            <h3 className={`text-xl sm:text-2xl font-bold mb-2 sm:mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
                                {deleteScope === "all" 
                                    ? "Delete All Schedules?" 
                                    : deleteScope === "shs"
                                    ? "Delete All SHS Schedules?"
                                    : `Delete ${selectedDept} Schedule?`
                                }
                            </h3>
                            <p className={`mb-6 sm:mb-8 text-xs sm:text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                                {deleteScope === "all" 
                                    ? "Are you sure you want to delete ALL generated exam schedules across the entire platform? This operation is permanent and cannot be undone."
                                    : deleteScope === "shs"
                                    ? "Are you sure you want to delete ALL Senior High School (SHS) exam schedules across all strands, terms, and semesters? This operation is permanent and cannot be undone."
                                    : `Are you sure you want to delete all generated exam schedules for ${selectedDept} (Semester ${semester})? This operation is permanent and cannot be undone.`
                                }
                            </p>
                            <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 w-full">
                                <button
                                    type="button"
                                    onClick={() => setShowDeleteModal(false)}
                                    disabled={deleting}
                                    className={`w-full py-3 sm:py-3.5 rounded-xl font-bold text-xs sm:text-sm transition-all disabled:opacity-55 ${isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-200" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDeleteSchedule}
                                    disabled={deleting || isGenerating}
                                    className="w-full py-3 sm:py-3.5 rounded-xl font-bold text-xs sm:text-sm bg-rose-600 hover:bg-rose-700 text-white transition-all shadow-md shadow-rose-600/20 disabled:opacity-55 flex items-center justify-center gap-2"
                                >
                                    {deleting ? (
                                        <>
                                            <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                            <span>Deleting...</span>
                                        </>
                                    ) : (
                                        <span>{deleteScope === "shs" ? "Yes, Delete All SHS" : "Yes, Delete"}</span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Exam Schedule Modal */}
            {editingExam && (
                <div 
                    role="dialog"
                    aria-modal="true"
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-200"
                >
                    <div 
                        className="absolute inset-0"
                        onClick={() => !editSaving && setEditingExam(null)}
                    />
                    <div className={`relative p-5 sm:p-6 rounded-2xl sm:rounded-3xl shadow-2xl max-w-lg w-full border ${isDark ? "bg-slate-900 border-slate-750 text-slate-100" : "bg-white border-slate-200 text-slate-900"}`}>
                        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-750">
                            <div className="flex items-center gap-2.5">
                                <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                                    <PencilSquareIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-base sm:text-lg font-bold">Edit Scheduled Exam</h3>
                                    <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                        {editingExam.subject_code} - {editingExam.subject_name} ({editingExam.section_name})
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingExam(null)}
                                className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
                            >
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSaveEdit} className="space-y-4">
                            <div>
                                <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                                    Timeslot & Date
                                </label>
                                <select
                                    value={editTimeslotId}
                                    onChange={(e) => setEditTimeslotId(e.target.value)}
                                    className={`w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm border outline-none transition ${
                                        isDark
                                            ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500"
                                            : "bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-600"
                                    }`}
                                >
                                    <option value="">-- Keep Current Timeslot ({editingExam.exam_date} {editingExam.start_time}) --</option>
                                    {availableTimeslots.map((ts) => (
                                        <option key={ts.id} value={ts.id}>
                                            {ts.label}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                                    Examination Room
                                </label>
                                <select
                                    value={editRoomId}
                                    onChange={(e) => setEditRoomId(e.target.value)}
                                    className={`w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm border outline-none transition ${
                                        isDark
                                            ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500"
                                            : "bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-600"
                                    }`}
                                >
                                    <option value="">-- Unassigned / No Room --</option>
                                    {availableRooms.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            {r.name} (Bldg {r.building || "-"}, Capacity: {r.capacity || 40} seats)
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="relative" ref={proctorDropdownRef}>
                                <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                                    Assigned Proctor
                                </label>
                                
                                {/* Dropdown Trigger Button */}
                                <button
                                    type="button"
                                    onClick={() => setIsProctorDropdownOpen(!isProctorDropdownOpen)}
                                    className={`w-full px-3 py-2.5 rounded-xl text-xs sm:text-sm border outline-none transition flex items-center justify-between text-left ${
                                        isDark
                                            ? "bg-slate-800 border-slate-700 text-slate-100 focus:border-blue-500 hover:bg-slate-750"
                                            : "bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-600 hover:bg-slate-100"
                                    }`}
                                    aria-haspopup="listbox"
                                    aria-expanded={isProctorDropdownOpen}
                                >
                                    <span className="truncate flex items-center gap-2">
                                        <UserIcon className={`w-4 h-4 shrink-0 ${editProctorId ? (isDark ? "text-blue-400" : "text-blue-600") : "text-slate-400"}`} />
                                        {selectedProctorObj ? (
                                            <span className="font-medium truncate">
                                                {selectedProctorObj.name}
                                                {selectedProctorObj.department && (
                                                    <span className={`ml-2 text-xs font-normal px-2 py-0.5 rounded-full border ${
                                                        isDark ? "bg-slate-700 text-slate-300 border-slate-600" : "bg-slate-200/70 text-slate-700 border-slate-300"
                                                    }`}>
                                                        {selectedProctorObj.department}
                                                    </span>
                                                )}
                                            </span>
                                        ) : (
                                            <span className={isDark ? "text-slate-400" : "text-slate-500"}>
                                                -- Unassigned / No Proctor --
                                            </span>
                                        )}
                                    </span>
                                    <div className="flex items-center gap-1.5 ml-2 shrink-0">
                                        {editProctorId && (
                                            <span
                                                role="button"
                                                tabIndex={0}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditProctorId("");
                                                }}
                                                title="Clear assigned proctor"
                                                className={`p-1 rounded-md transition ${isDark ? "hover:bg-slate-700 text-slate-400 hover:text-slate-200" : "hover:bg-slate-200 text-slate-400 hover:text-slate-600"}`}
                                            >
                                                <XMarkIcon className="w-3.5 h-3.5" />
                                            </span>
                                        )}
                                        <ChevronDownIcon className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isProctorDropdownOpen ? "rotate-180" : ""}`} />
                                    </div>
                                </button>

                                {/* Dropdown Menu with Search Bar */}
                                {isProctorDropdownOpen && (
                                    <div className={`absolute left-0 right-0 top-full mt-1.5 z-50 rounded-xl border shadow-xl backdrop-blur-md overflow-hidden ${
                                        isDark
                                            ? "bg-slate-850/95 border-slate-700 shadow-black/50"
                                            : "bg-white/95 border-slate-200 shadow-slate-400/20"
                                    }`}>
                                        {/* Search Input */}
                                        <div className={`p-2.5 border-b ${isDark ? "border-slate-750 bg-slate-900/60" : "border-slate-100 bg-slate-50/70"}`}>
                                            <div className="relative">
                                                <MagnifyingGlassIcon className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-slate-400" : "text-slate-400"}`} />
                                                <input
                                                    ref={proctorSearchInputRef}
                                                    type="text"
                                                    value={proctorSearchQuery}
                                                    onChange={(e) => setProctorSearchQuery(e.target.value)}
                                                    placeholder="Search eligible proctor name..."
                                                    className={`w-full pl-9 pr-8 py-1.5 rounded-lg text-xs sm:text-sm border outline-none transition ${
                                                        isDark
                                                            ? "bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                                            : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                                                    }`}
                                                />
                                                {proctorSearchQuery && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setProctorSearchQuery("")}
                                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                                    >
                                                        <XMarkIcon className="w-3.5 h-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Proctors List */}
                                        <div className="max-h-56 overflow-y-auto p-1.5 space-y-0.5">
                                            {/* Unassigned Option */}
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setEditProctorId("");
                                                    setIsProctorDropdownOpen(false);
                                                    setProctorSearchQuery("");
                                                }}
                                                className={`w-full px-3 py-2 rounded-lg text-left text-xs sm:text-sm flex items-center justify-between transition ${
                                                    !editProctorId
                                                        ? isDark ? "bg-blue-950/60 text-blue-300 font-semibold" : "bg-blue-50 text-blue-700 font-semibold"
                                                        : isDark ? "text-slate-300 hover:bg-slate-800 hover:text-slate-100" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                                                }`}
                                            >
                                                <span className="italic opacity-80">-- Unassigned / No Proctor --</span>
                                                {!editProctorId && <CheckIcon className="w-4 h-4 text-blue-500 shrink-0" />}
                                            </button>

                                            {loadingEligibleProctors ? (
                                                <div className={`p-4 text-center text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                                    <ArrowPathIcon className="w-4 h-4 animate-spin inline-block mr-1.5" />
                                                    Checking eligibility & schedule availability...
                                                </div>
                                            ) : filteredEligibleProctors.length === 0 ? (
                                                <div className={`p-4 text-center text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                                    {proctorSearchQuery ? (
                                                        <>
                                                            No eligible proctors match <span className="font-semibold text-slate-300">"{proctorSearchQuery}"</span>
                                                        </>
                                                    ) : (
                                                        "No eligible proctors available for this timeslot."
                                                    )}
                                                </div>
                                            ) : (
                                                filteredEligibleProctors.map((p) => {
                                                    const isSelected = String(p.id) === String(editProctorId);
                                                    return (
                                                        <button
                                                            key={p.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setEditProctorId(String(p.id));
                                                                setIsProctorDropdownOpen(false);
                                                                setProctorSearchQuery("");
                                                            }}
                                                            className={`w-full px-3 py-2 rounded-lg text-left text-xs sm:text-sm flex items-center justify-between transition ${
                                                                isSelected
                                                                    ? isDark
                                                                        ? "bg-blue-950/60 text-blue-300 font-semibold"
                                                                        : "bg-blue-50 text-blue-700 font-semibold"
                                                                    : isDark
                                                                    ? "text-slate-200 hover:bg-slate-800 hover:text-blue-400"
                                                                    : "text-slate-700 hover:bg-blue-50/70 hover:text-blue-700"
                                                            }`}
                                                        >
                                                            <div className="flex items-center gap-2 truncate">
                                                                <span className="truncate">{p.name}</span>
                                                                {p.department && (
                                                                    <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded border shrink-0 ${
                                                                        isDark
                                                                            ? "bg-slate-800 text-slate-300 border-slate-700"
                                                                            : "bg-slate-100 text-slate-600 border-slate-200"
                                                                    }`}>
                                                                        {p.department}
                                                                    </span>
                                                                )}
                                                                {p.is_current && (
                                                                    <span className="text-[10px] font-medium text-emerald-500 dark:text-emerald-400 shrink-0">
                                                                        (Current)
                                                                    </span>
                                                                )}
                                                            </div>
                                                            {isSelected && <CheckIcon className="w-4 h-4 text-blue-500 shrink-0 ml-2" />}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>

                                        {/* Dropdown Footer: Eligible Count */}
                                        {!loadingEligibleProctors && (
                                            <div className={`px-3 py-1.5 text-[11px] border-t flex items-center justify-between ${
                                                isDark ? "border-slate-750 bg-slate-900/60 text-slate-400" : "border-slate-100 bg-slate-50/60 text-slate-500"
                                            }`}>
                                                <span>
                                                    {filteredEligibleProctors.length} eligible proctor{filteredEligibleProctors.length === 1 ? "" : "s"}
                                                </span>
                                                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                                                    Availability & conflicts verified
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex items-center justify-end gap-2.5 sm:gap-3 pt-3 border-t border-slate-200 dark:border-slate-750">
                                <button
                                    type="button"
                                    onClick={() => setEditingExam(null)}
                                    disabled={editSaving}
                                    className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition ${
                                        isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-200" : "bg-slate-100 hover:bg-slate-200 text-slate-700"
                                    }`}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={editSaving}
                                    className="px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 transition disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {editSaving ? "Saving Changes..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
