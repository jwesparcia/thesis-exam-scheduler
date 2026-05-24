import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, FileText, Loader2, BookOpen, Sparkles } from "lucide-react";
import { useTheme } from "../context/themeStore";
import api from "../api";
import { useToast } from "../context/ToastContext";

const INITIAL_GENERATION_PROGRESS = {
  status: "idle",
  percent: 0,
  phase: "Idle",
  detail: "",
};

export default function ExamScheduler({ onBeforeGenerate, onGenerationStateChange }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [courses, setCourses] = useState([]);
  const [years, setYears] = useState([]);
  const [selectedDept, setSelectedDept] = useState(""); // "" (None), "College", or "SHS"
  const [courseId, setCourseId] = useState("");
  const [yearId, setYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [details, setDetails] = useState({ sections: [] });
  const [loading, setLoading] = useState(false);
  const progressPollRef = useRef(null);
  const activeProgressJobRef = useRef(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState("");
  const [excludedSubjects, setExcludedSubjects] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [generationProgress, setGenerationProgress] = useState(INITIAL_GENERATION_PROGRESS);
  const { showSuccess, showError, showWarning } = useToast();
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    message: "",
    onConfirm: null
  });

  useEffect(() => {
    onGenerationStateChange?.({
      loading,
      progress: generationProgress,
    });
  }, [loading, generationProgress, onGenerationStateChange]);

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

  // Fetch subjects when department or semester changes
  useEffect(() => {
    if (!selectedDept) {
      setSubjects([]);
      setSubjectsLoading(false);
      setSubjectsError("");
      setExcludedSubjects(new Set());
      return;
    }

    let isCurrentRequest = true;
    const fetchSubjects = async () => {
      setSubjectsLoading(true);
      setSubjectsError("");
      setSearchQuery("");
      try {
        const res = await api.get("/exams/subjects", {
          params: {
            department: selectedDept,
            semester,
          },
        });
        if (!isCurrentRequest) return;

        const subjectNames = Array.isArray(res.data)
          ? res.data.filter(Boolean).map(String)
          : [];
        setSubjects(subjectNames);
        setExcludedSubjects(new Set());
      } catch (err) {
        if (!isCurrentRequest) return;
        console.error("Error loading subjects:", err);
        const message = err.response?.data?.detail || "Unable to load subjects for this selection.";
        setSubjects([]);
        setSubjectsError(message);
        showError(message);
      } finally {
        if (isCurrentRequest) {
          setSubjectsLoading(false);
        }
      }
    };
    fetchSubjects();

    return () => {
      isCurrentRequest = false;
    };
  }, [selectedDept, semester]);

  // Fetch details when specific course/year/semester changes
  useEffect(() => {
    loadDetails();
  }, [courseId, yearId, semester]);

  useEffect(() => {
    return () => {
      if (progressPollRef.current) {
        clearInterval(progressPollRef.current);
      }
      activeProgressJobRef.current = null;
    };
  }, []);

  const loadDetails = async () => {
    if (!courseId || !yearId) {
      setDetails({ sections: [] });
      return;
    }
    try {
      const res = await api.get(`/catalog/details?course_id=${courseId}&year_level_id=${yearId}&semester=${semester}`);
      setDetails(res.data);
    } catch (err) {
      console.error("Error loading details:", err);
    }
  };

  const filteredCourses = courses.filter(c => c.category === selectedDept);
  const filteredYears = years.filter(y =>
    selectedDept === "SHS" ? y.name.includes("Grade") : !y.name.includes("Grade")
  );

  // Reset subordinate filters when dept changes
  useEffect(() => {
    setCourseId("");
    setYearId("");
  }, [selectedDept]);

  // Check for missing schedules before generation (warning only)
  const checkMissingSchedules = async () => {
    try {
      const res = await api.get("/proctors/missing-schedules");
      const missing = res.data.filter(p => !p.excluded);
      if (missing.length > 0) {
        showWarning(`${missing.length} proctor(s) have not uploaded their schedule. They will be skipped during scheduling. You can manage them in the "Proctor Schedules" tab.`);
      }
    } catch (err) {
      console.error("Failed to check missing schedules", err);
    }
  };

  const stopProgressPolling = (jobId = null) => {
    if (progressPollRef.current) {
      clearInterval(progressPollRef.current);
      progressPollRef.current = null;
    }
    if (!jobId || activeProgressJobRef.current === jobId) {
      activeProgressJobRef.current = null;
    }
  };

  const fetchGenerationProgress = async (jobId) => {
    try {
      const res = await api.get("/exams/generate/progress", {
        params: { job_id: jobId }
      });
      if (activeProgressJobRef.current !== jobId) {
        return;
      }
      setGenerationProgress(res.data);
    } catch (err) {
      console.error("Failed to fetch generation progress", err);
    }
  };

  const startProgressPolling = (jobId) => {
    stopProgressPolling();
    activeProgressJobRef.current = jobId;
    fetchGenerationProgress(jobId);
    progressPollRef.current = setInterval(() => fetchGenerationProgress(jobId), 700);
  };

  // Actual execution of generation
  const executeGeneration = async () => {
    const jobId = `schedule-${Date.now()}`;
    setLoading(true);
    setGenerationProgress({
      status: "running",
      percent: 1,
      phase: "Preparing schedule",
      detail: "Sending generation request to the scheduler",
    });
    startProgressPolling(jobId);

    try {
      const res = await api.post("/exams/generate", {
        start_date: startDate,
        end_date: endDate,
        department: selectedDept,
        semester: semester,
        excluded_subjects: Array.from(excludedSubjects),
        job_id: jobId
      });
      const data = res.data;
      setGenerationProgress({
        status: "completed",
        percent: 100,
        phase: "Schedule generated",
        detail: data.message,
      });
      showSuccess(data.message);
    } catch (err) {
      console.error(err);
      const message = err.response?.data?.detail || "Error generating schedule";
      setGenerationProgress((current) => ({
        ...current,
        status: "failed",
        phase: "Generation failed",
        detail: message,
      }));
      showError(message);
    } finally {
      stopProgressPolling(jobId);
      setLoading(false);
    }
  };

  // Generate exam schedule with confirmation
  const generate = async () => {
    if (!startDate || !endDate) {
      showError("Please select both start and end dates.");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = end - start;

    if (diffTime < 0) {
      showError("End date must be after start date.");
      return;
    }

    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    // Call external warning from parent (if any)
    if (onBeforeGenerate) {
      await onBeforeGenerate();
    }
    // Also call local warning
    await checkMissingSchedules();

    let msg = "";
    if (diffDays < 3 || diffDays > 5) {
      msg = `The selected range is ${diffDays} days (recommended is 4). Do you want to proceed? This will regenerate the schedule for ALL ${selectedDept} courses at once.`;
    } else if (diffDays !== 4) {
      msg = `The selected range is ${diffDays} days (exactly 4 is recommended). Proceed? This will regenerate the schedule for ALL ${selectedDept} courses at once.`;
    } else {
      msg = `This will regenerate the schedule for ALL ${selectedDept} courses at once, ensuring shared subjects are taken simultaneously. Continue?`;
    }

    setConfirmModal({
      isOpen: true,
      message: msg,
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        executeGeneration();
      }
    });
  };

  const generationPercent = Math.max(0, Math.min(100, Number(generationProgress.percent) || 0));
  const showGenerationProgress = loading || generationProgress.status !== "idle";
  const progressBarColor = generationProgress.status === "failed"
    ? "bg-red-500"
    : generationProgress.status === "completed"
      ? "bg-emerald-500"
      : "bg-blue-600";
  const filteredSubjects = subjects.filter(subject =>
    subject.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  return (
    <div className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gray-50"} rounded-2xl`}>
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <CalendarDays className="text-blue-500 w-8 h-8" />
            <h1 className={`text-3xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
              Exam Scheduler
            </h1>
          </div>
        </div>

        <div className={`rounded-xl p-6 border mb-10 ${isDark ? "bg-gray-700 border-gray-700" : "bg-white border-gray-200"} shadow-sm`}>
          <h2 className={`text-xl font-semibold ${isDark ? "text-gray-300" : "text-gray-700"} mb-4 flex items-center gap-2`}>
            <FileText className="w-5 h-5 text-blue-500" /> Schedule Filters
          </h2>

          {/* Step 1: Select Department & Semester */}
          <div className="mb-8 p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20">
            <label className={`block text-sm font-semibold mb-4 ${isDark ? "text-blue-300" : "text-blue-700"}`}>
              1. Choose Academic Level & Semester
            </label>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex flex-1 gap-4">
                <button
                  onClick={() => setSelectedDept("College")}
                  className={`flex-1 max-w-[220px] py-4 px-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center gap-2 ${selectedDept === "College"
                    ? "border-blue-500 bg-blue-500 text-white shadow-xl shadow-blue-500/30 scale-[1.02]"
                    : isDark
                      ? "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600 hover:bg-gray-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:text-blue-600"
                    }`}
                >
                  <div className={`w-8 h-8 ${selectedDept === "College" ? "text-white" : "text-blue-500"}`} />
                  <span className="font-bold text-lg">College</span>
                </button>
                <button
                  onClick={() => setSelectedDept("SHS")}
                  className={`flex-1 max-w-[220px] py-4 px-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center gap-2 ${selectedDept === "SHS"
                    ? "border-blue-500 bg-blue-500 text-white shadow-xl shadow-blue-500/30 scale-[1.02]"
                    : isDark
                      ? "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600 hover:bg-gray-700"
                      : "border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:text-blue-600"
                    }`}
                >
                  <div className={`w-8 h-8 ${selectedDept === "SHS" ? "text-white" : "text-blue-500"}`} />
                  <span className="font-bold text-lg">Senior High</span>
                </button>
              </div>
              <div className="w-full md:w-64">
                <label className={`block text-xs font-medium uppercase tracking-wider mb-2 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                  Semester
                </label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                  className={`border rounded-xl cursor-pointer p-4 w-full focus:ring-2 focus:ring-blue-400 transition-all font-semibold ${isDark
                    ? "bg-gray-800 text-gray-200 border-gray-700"
                    : "bg-white text-gray-700 border-gray-200"
                    }`}
                >
                  <option value={1}>1st Semester</option>
                  <option value={2}>2nd Semester</option>
                </select>
              </div>
            </div>
          </div>

          {selectedDept ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
              {/* Step 2: Course & Year (Optional Preview) */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <label className={`block text-sm font-semibold mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  2. Preview {selectedDept === "SHS" ? "Strand & Grade" : "Course & Year"} (Optional)
                </label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      {selectedDept === "SHS" ? "Strand" : "Course"}
                    </label>
                    <select
                      value={courseId}
                      onChange={(e) => setCourseId(Number(e.target.value))}
                      className={`border rounded-xl cursor-pointer p-3 w-full focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                        ? "bg-gray-800 text-gray-200 border-gray-700"
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

                  <div className="space-y-2">
                    <label className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      {selectedDept === "SHS" ? "Grade" : "Year Level"}
                    </label>
                    <select
                      value={yearId}
                      onChange={(e) => setYearId(Number(e.target.value))}
                      className={`border rounded-xl p-3 w-full cursor-pointer focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                        ? "bg-gray-800 text-gray-200 border-gray-700"
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
                </div>
              </div>

              {/* Exam Range */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <label className={`block text-sm font-semibold mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  2. Set Examination Period
                </label>
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-2">
                    <label className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (e.target.value && !endDate) {
                          const d = new Date(e.target.value);
                          d.setDate(d.getDate() + 3);
                          setEndDate(d.toISOString().split('T')[0]);
                        }
                      }}
                      className={`rounded-xl p-3 w-full focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                        ? "bg-gray-800 text-gray-200 border-gray-700"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                        }`}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      End Date
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={`rounded-xl p-3 w-full focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                        ? "bg-gray-800 text-gray-200 border-gray-700"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                        }`}
                    />
                  </div>
                </div>
                <p className={`mt-3 text-xs ${isDark ? "text-gray-500" : "text-gray-400"} italic`}>
                  Recommended: Select a 4-day range. Weekends are automatically skipped.
                </p>
              </div>

              {/* Subject Checklist */}
              <div className="pt-6 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center justify-between mb-4">
                  <label className={`block text-sm font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    3. Select Subjects for Exam
                  </label>
                  <span className={`text-xs px-2 py-1 rounded-full ${isDark ? "bg-blue-900/30 text-blue-400" : "bg-blue-50 text-blue-600"}`}>
                    {subjects.length - excludedSubjects.size} / {subjects.length} selected
                  </span>
                </div>

                <p className={`text-xs mb-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  Uncheck subjects that do not require a written exam (e.g. Practicums, Project-based).
                </p>

                <div className="mb-4 relative">
                  <input
                    type="text"
                    placeholder="Search subjects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full rounded-xl pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                      ? "bg-gray-800 text-gray-200 border-gray-700"
                      : "bg-gray-50 text-gray-700 border-gray-200 border"
                      }`}
                  />
                  <FileText className={`absolute left-3 top-2.5 w-4 h-4 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                </div>

                <div className={`max-h-64 overflow-y-auto rounded-xl border p-2 ${isDark ? "border-gray-700 bg-gray-800/50" : "border-gray-200 bg-gray-50"}`}>
                  {subjectsLoading ? (
                    <div className={`p-4 text-center text-sm flex items-center justify-center gap-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Loading subjects...
                    </div>
                  ) : subjectsError ? (
                    <div className={`p-4 text-center text-sm ${isDark ? "text-red-300" : "text-red-600"}`}>
                      {subjectsError}
                    </div>
                  ) : filteredSubjects.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {filteredSubjects
                        .map(subject => {
                          const isChecked = !excludedSubjects.has(subject);
                          return (
                            <label
                              key={subject}
                              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all border ${isChecked
                                  ? isDark ? "border-blue-900/50 bg-blue-900/10" : "border-blue-100 bg-blue-50/50"
                                  : isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
                                }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const newSet = new Set(excludedSubjects);
                                  if (e.target.checked) {
                                    newSet.delete(subject);
                                  } else {
                                    newSet.add(subject);
                                  }
                                  setExcludedSubjects(newSet);
                                }}
                                className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                              />
                              <span className={`text-sm ${isChecked
                                  ? isDark ? "text-gray-200" : "text-gray-800"
                                  : isDark ? "text-gray-500 line-through" : "text-gray-400 line-through"
                                }`}>
                                {subject}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  ) : subjects.length === 0 ? (
                    <div className={`p-4 text-center text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                      No written exam subjects found for {selectedDept} semester {semester}.
                    </div>
                  ) : (
                    <div className={`p-4 text-center text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                      No subjects match your search.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-gray-100 dark:border-gray-800 pb-8">
                {showGenerationProgress && (
                  <div className={`mb-5 rounded-2xl border p-4 ${isDark ? "bg-gray-800/70 border-gray-700" : "bg-blue-50/60 border-blue-100"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className={`text-sm font-bold ${isDark ? "text-gray-100" : "text-gray-800"}`}>
                          {generationProgress.phase || (loading ? "Generating schedule" : "Schedule status")}
                        </p>
                        <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                          {generationProgress.detail || (loading ? "Preparing scheduler tasks..." : "Generation status is ready.")}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${isDark ? "bg-gray-700 text-gray-100" : "bg-white text-blue-700 border border-blue-100"}`}>
                        {generationPercent}%
                      </span>
                    </div>
                    <div
                      className={`mt-4 h-3 overflow-hidden rounded-full ${isDark ? "bg-gray-700" : "bg-white"}`}
                      role="progressbar"
                      aria-valuenow={generationPercent}
                      aria-valuemin="0"
                      aria-valuemax="100"
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${progressBarColor}`}
                        style={{ width: `${generationPercent}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                <button
                  onClick={generate}
                  disabled={loading}
                  className={`flex items-center justify-center gap-3 px-8 py-4 rounded-2xl w-full md:w-auto text-white font-bold text-lg transition-all shadow-xl ${loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/20 active:scale-95"
                    }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-6 h-6" />
                      Generate Schedule for All {selectedDept} Courses
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className={`p-10 text-center rounded-2xl border-2 border-dashed ${isDark ? "border-gray-800 bg-gray-800/20 text-gray-500" : "border-gray-100 bg-gray-50/50 text-gray-400"}`}>
              <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">Ready to create a schedule?</p>
              <p className="text-sm mt-1">Select an academic level above to begin configuring the filters.</p>
            </div>
          )}
        </div>


        {details.sections.length > 0 && (
          <div className={`rounded-xl p-6 mb-10 ${isDark ? "bg-gray-700 border border-gray-700" : "bg-white border border-gray-200"} shadow-sm`}>
            <h2 className={`text-xl font-semibold ${isDark ? "text-gray-300" : "text-gray-800"} mb-4 flex items-center gap-2`}>
              <BookOpen className="w-5 h-5 text-blue-500" /> Sections & Subjects
            </h2>
            <div className="space-y-6">
              {details.sections.map((section) => (
                <div key={section.id} className={`border rounded-lg p-4 hover:shadow-sm transition ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"}`}>
                  <h3 className={`text-lg font-medium mb-3 ${isDark ? "text-blue-400" : "text-blue-700"}`}>
                    {section.name}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-separate border-spacing-0">
                      <thead className={`${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                        <tr>
                          <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">Subject Code</th>
                          <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">Subject</th>
                          <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">Instructor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.subjects.length > 0 ? (
                          section.subjects.map((s) => (
                            <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-600 transition">
                              <td className={`${isDark ? "text-gray-200" : "text-gray-900"} border border-gray-300 dark:border-gray-600 px-3 py-2`}>{s.code}</td>
                              <td className={`${isDark ? "text-gray-200" : "text-gray-900"} border border-gray-300 dark:border-gray-600 px-3 py-2`}>{s.name}</td>
                              <td className={`${isDark ? "text-gray-200" : "text-gray-900"} border border-gray-300 dark:border-gray-600 px-3 py-2`}>{s.teacher}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="3" className={`text-center px-3 py-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>No subjects available</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {confirmModal.isOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className={`${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} border rounded-2xl shadow-2xl max-w-md w-full p-8 animate-slide-in`}>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-6">
                <CalendarDays className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className={`text-xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>Confirm Regeneration</h3>
              <p className={`text-sm mb-8 ${isDark ? "text-gray-400" : "text-gray-600"} leading-relaxed`}>{confirmModal.message}</p>
              <div className="flex gap-4 w-full">
                <button onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} className={`flex-1 px-6 py-3 rounded-xl font-semibold transition ${isDark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>Cancel</button>
                <button onClick={confirmModal.onConfirm} className="flex-1 px-6 py-3 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition shadow-lg shadow-blue-500/30">Proceed</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
