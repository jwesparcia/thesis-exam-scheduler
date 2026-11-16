import React, { useEffect, useRef, useState } from "react";
import { CalendarDaysIcon, DocumentTextIcon, ArrowPathIcon, SparklesIcon, XMarkIcon, ExclamationTriangleIcon, ClockIcon } from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import api from "../api";
import { useToast } from "../context/ToastContext";
import { getExamTerms } from "../utils/examTerms";

const INITIAL_GENERATION_PROGRESS = {
  status: "idle",
  percent: 0,
  phase: "Idle",
  detail: "",
};

const toLocalISODate = (d) => {
  if (!d || isNaN(d.getTime())) return "";
  const y = String(d.getFullYear()).padStart(4, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

const formatDateWithDay = (dateStr) => {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "";
  const [y, m, day] = dateStr.split("-").map(Number);
  const d = new Date(y, m - 1, day);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};

const getExamDaysList = (startStr, endStr) => {
  if (!startStr || !endStr || !/^\d{4}-\d{2}-\d{2}$/.test(startStr) || !/^\d{4}-\d{2}-\d{2}$/.test(endStr)) return [];
  const [sy, sm, sd] = startStr.split("-").map(Number);
  const [ey, em, ed] = endStr.split("-").map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  if (cur > end) return [];
  const list = [];
  while (cur <= end) {
    if (cur.getDay() !== 0) { // Always skip Sunday (no classes)
      list.push(new Date(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return list;
};

export default function ExamScheduler({ onBeforeGenerate, onGenerationStateChange }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [selectedDept, setSelectedDept] = useState(""); // "" (None), "College", or "SHS"
  const [semester, setSemester] = useState(1);
  const [term, setTerm] = useState("Midterm");
  const [loading, setLoading] = useState(false);
  const [generationBusy, setGenerationBusy] = useState(false);
  const [generationStatusChecking, setGenerationStatusChecking] = useState(true);
  const [generationStatusError, setGenerationStatusError] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const progressPollRef = useRef(null);
  const activeProgressJobRef = useRef(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dailyStartTime, setDailyStartTime] = useState("07:30");
  const [dailyEndTime, setDailyEndTime] = useState("17:00");
  const [subjects, setSubjects] = useState([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);
  const [subjectsError, setSubjectsError] = useState("");
  const [excludedSubjects, setExcludedSubjects] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [generationProgress, setGenerationProgress] = useState(INITIAL_GENERATION_PROGRESS);
  const [existingExamCount, setExistingExamCount] = useState(0);
  const [existingExamChecking, setExistingExamChecking] = useState(false);
  const [isPreflighting, setIsPreflighting] = useState(false);
  const [overwriteModal, setOverwriteModal] = useState({ isOpen: false });
  const { showSuccess, showError, showWarning } = useToast();
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    message: "",
    onConfirm: null
  });
  const generationBlocked = generationBusy || generationStatusChecking || generationStatusError;

  // Every admin observes the same server lock, including after a page refresh.
  useEffect(() => {
    let disposed = false;
    let checking = false;
    const checkGenerationStatus = async () => {
      if (checking) return;
      checking = true;
      try {
        const res = await api.get("/exams/generate/status");
        if (!disposed) {
          setGenerationBusy(Boolean(res.data.running));
          setGenerationStatusError(false);
        }
      } catch {
        if (!disposed) setGenerationStatusError(true);
      } finally {
        checking = false;
        if (!disposed) setGenerationStatusChecking(false);
      }
    };
    checkGenerationStatus();
    const interval = setInterval(checkGenerationStatus, 2000);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    onGenerationStateChange?.({
      loading: loading || generationBusy,
      progress: !loading && generationBusy ? {
        status: "running",
        percent: 0,
        phase: "Schedule generation in progress",
        detail: "An admin is generating an exam schedule. Please wait until it finishes.",
      } : generationProgress,
    });
  }, [loading, generationBusy, generationProgress, onGenerationStateChange]);

  // Fetch exam settings
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [settingsRes] = await Promise.allSettled([
          api.get("/exams/settings"),
        ]);
        if (settingsRes.status === "fulfilled" && settingsRes.value.data) {
          if (settingsRes.value.data.daily_start_time) {
            setDailyStartTime(settingsRes.value.data.daily_start_time);
          }
          if (settingsRes.value.data.daily_end_time) {
            setDailyEndTime(settingsRes.value.data.daily_end_time);
          }
        }
      } catch (err) {
        console.error("Error loading options:", err);
        showError(err.response?.data?.detail || "Failed to load schedule settings.");
      }
    };
    fetchOptions();
  }, []);

  // Fetch subjects for the selected department, semester, and term
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
        const params = {
          department: selectedDept,
          semester,
          term,
        };
        const res = await api.get("/exams/subjects", { params });
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
  }, [selectedDept, semester, term]);

  // Check only this term, including after a background generation finishes.
  useEffect(() => {
    if (!selectedDept) {
      setExistingExamCount(0);
      setExistingExamChecking(false);
      return;
    }
    let current = true;
    const checkExisting = async () => {
      setExistingExamChecking(true);
      try {
        const res = await api.get("/exams/count", {
          params: { department: selectedDept, semester, term }
        });
        if (current) setExistingExamCount(res.data.count || 0);
      } catch {
        if (current) setExistingExamCount(0);
      } finally {
        if (current) setExistingExamChecking(false);
      }
    };
    checkExisting();
    return () => { current = false; };
  }, [selectedDept, semester, term, loading]);


  useEffect(() => {
    return () => {
      if (progressPollRef.current) {
        clearInterval(progressPollRef.current);
      }
      activeProgressJobRef.current = null;
    };
  }, []);

  // Adjust term and semester defaults when the department changes
  useEffect(() => {
    if (selectedDept === "SHS") {
      setTerm("ST1");
    } else {
      setTerm("Midterm");
      if (semester > 2) {
        setSemester(1);
      }
    }
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
      if (["completed", "failed", "cancelled"].includes(res.data.status)) {
        stopProgressPolling(jobId);
        setLoading(false);
        setActiveJobId(null);
        if (res.data.status === "completed") {
          showSuccess(res.data.detail || "Schedule generated successfully.");
        } else if (res.data.status === "failed") {
          showError(res.data.detail || "Schedule generation failed.");
        } else {
          showWarning(res.data.detail || "Schedule generation was cancelled.");
        }
      }
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

  // Cancel generation handler
  const cancelGeneration = async () => {
    setCancelling(true);
    try {
      await api.post("/exams/generate/cancel", null, {
        params: { job_id: activeJobId }
      });
      showWarning("Cancellation requested. Stopping schedule generation...");
    } catch (err) {
      console.error("Error requesting cancellation:", err);
      showError(err.response?.data?.detail || "Failed to request cancellation");
    } finally {
      setCancelling(false);
    }
  };

  // Actual execution of generation
  const executeGeneration = async (forceOverwrite = false) => {
    if (loading || generationBlocked) {
      showWarning("Schedule generation is unavailable. Please wait for the current generation or status check to finish.");
      return;
    }
    const jobId = `schedule-${Date.now()}`;
    let generationQueued = false;
    setActiveJobId(jobId);
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
        term: term,
        excluded_subjects: Array.from(excludedSubjects),
        job_id: jobId,
        force_overwrite: forceOverwrite,
        daily_start_time: dailyStartTime,
        daily_end_time: dailyEndTime,
      });
      const data = res.data;
      if (data.status === "accepted") {
        setGenerationBusy(true);
        generationQueued = true;
        return;
      }
      setGenerationProgress({
        status: "completed",
        percent: 100,
        phase: "Schedule generated",
        detail: data.message,
      });
      showSuccess(data.message);
    } catch (err) {
      console.error(err);
      const status = err.response?.status;
      const message = err.response?.data?.detail || "Error generating schedule";
      const isCancelled = /schedule generation (?:was )?cancelled/i.test(message);
      const isRateLimited = status === 429;
      const isGenerationBusy = status === 409 && message.includes("already generating");

      if (isGenerationBusy) {
        setGenerationBusy(true);
        setGenerationProgress(INITIAL_GENERATION_PROGRESS);
        showWarning(message);
      } else if (isRateLimited) {
        // Reset to idle — don't show a failed progress bar for rate limit
        setGenerationProgress(INITIAL_GENERATION_PROGRESS);
        showWarning(message);
      } else if (isCancelled) {
        setGenerationProgress({
          status: "cancelled",
          percent: 0,
          phase: "Generation cancelled",
          detail: message,
        });
        showWarning("Schedule generation was cancelled.");
      } else {
        setGenerationProgress({
          status: "failed",
          percent: 0,
          phase: "Generation failed",
          detail: message,
        });
        showError(message);
      }
    } finally {
      if (generationQueued) {
        return;
      }
      stopProgressPolling(jobId);
      setLoading(false);
      setActiveJobId(null);
      // Refresh existing exam count after generation attempt
      try {
        const res = await api.get("/exams/count", { params: { department: selectedDept, semester, term } });
        setExistingExamCount(res.data.count || 0);
      } catch { /* ignore */ }
    }
  };

  // Generate exam schedule with confirmation
  const generate = async () => {
    if (loading || generationBlocked) {
      showWarning("Schedule generation is unavailable. Please wait for the current generation or status check to finish.");
      return;
    }
    if (!startDate || !endDate) {
      showError("Please select both start and end dates.");
      return;
    }

    const [sy, sm, sd] = startDate.split("-").map(Number);
    const [ey, em, ed] = endDate.split("-").map(Number);
    const start = new Date(sy, sm - 1, sd);
    const end = new Date(ey, em - 1, ed);

    if (start.getDay() === 0) {
      showError("Start date cannot be on a Sunday because there are no classes. Please select a Monday through Saturday.");
      return;
    }
    if (end.getDay() === 0) {
      showError("End date cannot be on a Sunday because there are no classes. Please select a Monday through Saturday.");
      return;
    }

    if (end < start) {
      showError("End date must be after start date.");
      return;
    }

    // Show loading state immediately so the button is disabled & shows a spinner
    setIsPreflighting(true);

    try {
      // Guard: ensure students have been uploaded before generating
      try {
        const studentRes = await api.get("/catalog/student-stats");
        if (studentRes.data.total === 0) {
          showError("Cannot generate schedule: no student accounts have been uploaded. Please import students first.");
          return;
        }
      } catch (err) {
        showError(err.response?.data?.detail || "Could not verify student accounts. Please try again.");
        return;
      }

      // Guard: block if existing schedule already exists — must overwrite or delete first
      let currentExamCount = existingExamCount;
      try {
        const countRes = await api.get("/exams/count", {
          params: { department: selectedDept, semester, term }
        });
        currentExamCount = countRes.data.count || 0;
        setExistingExamCount(currentExamCount);
      } catch {
        // Fall back to state value
      }

      if (currentExamCount > 0) {
        setOverwriteModal({ isOpen: true });
        return;
      }

      const examDays = getExamDaysList(startDate, endDate);
      const diffDays = examDays.length;

      // Call external warning from parent (if any)
      if (onBeforeGenerate) {
        await onBeforeGenerate();
      }
      // Also call local warning
      await checkMissingSchedules();

      let msg = "";
      if (diffDays < 3 || diffDays > 5) {
        msg = `The selected range covers ${diffDays} exam days (recommended is 4, Sundays skipped). Do you want to proceed? This will generate the schedule for ALL ${selectedDept} courses at once.`;
      } else if (diffDays !== 4) {
        msg = `The selected range covers ${diffDays} exam days (exactly 4 is recommended, Sundays skipped). Proceed? This will generate the schedule for ALL ${selectedDept} courses at once.`;
      } else {
        msg = `This will generate the schedule for ALL ${selectedDept} courses at once across ${diffDays} exam days (Sundays excluded), ensuring shared subjects are taken simultaneously. Continue?`;
      }

      setConfirmModal({
        isOpen: true,
        message: msg,
        onConfirm: () => {
          setConfirmModal(prev => ({ ...prev, isOpen: false }));
          executeGeneration(false);
        }
      });
    } finally {
      setIsPreflighting(false);
    }
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
    <div className="w-full space-y-6">
      <div className="w-full">
        <div className="flex items-center justify-between gap-3 mb-5 sm:mb-8">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <CalendarDaysIcon className="text-blue-600 dark:text-blue-400 w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
            <h1 className={`text-xl sm:text-3xl font-bold tracking-tight ${isDark ? "text-slate-100" : "text-slate-900"}`}>
              Exam Scheduler
            </h1>
          </div>
        </div>

        <div className={`rounded-2xl sm:rounded-3xl p-4 sm:p-6 border mb-6 sm:mb-10 ${isDark ? "bg-slate-850 border-slate-750" : "bg-white border-slate-200"} shadow-sm`}>
          <h2 className={`text-lg sm:text-xl font-bold ${isDark ? "text-slate-100" : "text-slate-900"} mb-4 flex items-center gap-2`}>
            <DocumentTextIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" /> Schedule Filters
          </h2>

          {/* Step 1: Select Department & Semester */}
          <div className="mb-6 sm:mb-8 p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
            <div className={`block text-xs sm:text-sm font-semibold mb-3 sm:mb-4 ${isDark ? "text-blue-300" : "text-blue-800"}`}>
              1. Choose Academic Level, Semester & Term
            </div>
            <div className="flex flex-col md:flex-row gap-4 sm:gap-6">
              <div className="flex flex-1 gap-2.5 sm:gap-4">
                <button
                  type="button"
                  onClick={() => setSelectedDept("College")}
                  className={`flex-1 max-w-[220px] py-3 sm:py-4 px-3 sm:px-6 rounded-xl sm:rounded-2xl border-2 transition-all duration-200 flex flex-col items-center gap-1.5 sm:gap-2 ${selectedDept === "College"
                    ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20 font-bold"
                    : isDark
                      ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-750"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-600"
                    }`}
                >
                  <span className="font-bold text-base sm:text-lg">College</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDept("SHS")}
                  className={`flex-1 max-w-[220px] py-3 sm:py-4 px-3 sm:px-6 rounded-xl sm:rounded-2xl border-2 transition-all duration-200 flex flex-col items-center gap-1.5 sm:gap-2 ${selectedDept === "SHS"
                    ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20 font-bold"
                    : isDark
                      ? "border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-750"
                      : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-600"
                    }`}
                >
                  <span className="font-bold text-base sm:text-lg">Senior High</span>
                </button>
              </div>
              <div className="w-full md:w-64">
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? "text-slate-300" : "text-slate-700"}`} htmlFor="examscheduler-field-1">
                  Semester
                </label>
                <select
                  value={semester}
                  onChange={(e) => setSemester(Number(e.target.value))}
                  disabled={loading}
                  className={`border rounded-xl cursor-pointer p-4 w-full focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all font-semibold ${isDark
                    ? "bg-slate-800 text-slate-100 border-slate-700"
                    : "bg-white text-slate-800 border-slate-200"
                    } ${loading ? "opacity-60 cursor-not-allowed" : ""}`} id="examscheduler-field-1" aria-label="Semester">
                  <option value={1}>1st Semester</option>
                  <option value={2}>2nd Semester</option>
                  {selectedDept === "SHS" && (
                    <option value={3}>3rd Semester</option>
                  )}
                </select>
              </div>
              <div className="w-full md:w-64">
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? "text-slate-300" : "text-slate-700"}`} htmlFor="examscheduler-field-2">
                  Exam Term
                </label>
                <select
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  disabled={loading}
                  className={`border rounded-xl cursor-pointer p-4 w-full focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all font-semibold ${isDark
                    ? "bg-slate-800 text-slate-100 border-slate-700"
                    : "bg-white text-slate-800 border-slate-200"
                    } ${loading ? "opacity-60 cursor-not-allowed" : ""}`} id="examscheduler-field-2" aria-label="Exam Term">
                  {getExamTerms(selectedDept).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </div>
            </div>
          </div>

          {selectedDept ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
              {/* Exam Range & Daily Time Window */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-5">
                <div className={`block text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  2. Set Examination Period & Daily Time Window
                </div>
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className={`block text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`} htmlFor="examscheduler-field-5">
                        Start Date
                      </label>
                      {startDate && (
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                          {formatDateWithDay(startDate)}
                        </span>
                      )}
                    </div>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        const picked = e.target.value;
                        if (!picked) {
                          setStartDate("");
                          return;
                        }
                        // Always auto-set end date (+3 exam days, skipping Sundays) whenever a valid start date is selected
                        if (/^\d{4}-\d{2}-\d{2}$/.test(picked)) {
                          const [y, m, day] = picked.split("-").map(Number);
                          if (y >= 2000 && y <= 2100) {
                            let d = new Date(y, m - 1, day);
                            if (!isNaN(d.getTime())) {
                              let finalStart = picked;
                              if (d.getDay() === 0) {
                                // Sunday has no classes! Always skip Sunday and move to Monday
                                d.setDate(d.getDate() + 1);
                                finalStart = toLocalISODate(d);
                                showWarning(`Sundays have no classes. Start date adjusted to Monday (${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}).`);
                              }
                              setStartDate(finalStart);

                              const endD = new Date(d);
                              let remaining = 3;
                              while (remaining > 0) {
                                endD.setDate(endD.getDate() + 1);
                                if (endD.getDay() !== 0) remaining -= 1;
                              }
                              setEndDate(toLocalISODate(endD));
                              return;
                            }
                          }
                        }
                        setStartDate(picked);
                      }}
                      className={`rounded-xl p-3 w-full border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all ${isDark
                        ? "bg-slate-800 text-slate-100 border-slate-700"
                        : "bg-slate-50 text-slate-800 border-slate-200"
                        }`} id="examscheduler-field-5" aria-label="Start Date" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className={`block text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`} htmlFor="examscheduler-field-6">
                        End Date
                      </label>
                      <div className="flex items-center gap-3">
                        {endDate && (
                          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                            {formatDateWithDay(endDate)}
                          </span>
                        )}
                        {startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && (
                          <button
                            type="button"
                            onClick={() => {
                              const [y, m, day] = startDate.split("-").map(Number);
                              let d = new Date(y, m - 1, day);
                              if (!isNaN(d.getTime())) {
                                if (d.getDay() === 0) {
                                  d.setDate(d.getDate() + 1);
                                  setStartDate(toLocalISODate(d));
                                  showWarning("Sundays have no classes. Start date adjusted to Monday.");
                                }
                                const endD = new Date(d);
                                let remaining = 3;
                                while (remaining > 0) {
                                  endD.setDate(endD.getDate() + 1);
                                  if (endD.getDay() !== 0) remaining -= 1;
                                }
                                setEndDate(toLocalISODate(endD));
                              }
                            }}
                            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                          >
                            Auto-set +3 exam days
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => {
                        const picked = e.target.value;
                        if (!picked) {
                          setEndDate("");
                          return;
                        }
                        if (/^\d{4}-\d{2}-\d{2}$/.test(picked)) {
                          const [y, m, day] = picked.split("-").map(Number);
                          if (y >= 2000 && y <= 2100) {
                            let d = new Date(y, m - 1, day);
                            if (!isNaN(d.getTime())) {
                              if (d.getDay() === 0) {
                                // Sunday has no classes! Always skip Sunday and move to Monday
                                d.setDate(d.getDate() + 1);
                                const finalEnd = toLocalISODate(d);
                                setEndDate(finalEnd);
                                showWarning(`Sundays have no classes. End date adjusted to Monday (${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}).`);
                                return;
                              }
                            }
                          }
                        }
                        setEndDate(picked);
                      }}
                      className={`rounded-xl p-3 w-full border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all ${isDark
                        ? "bg-slate-800 text-slate-100 border-slate-700"
                        : "bg-slate-50 text-slate-800 border-slate-200"
                        }`} id="examscheduler-field-6" aria-label="End Date" />
                  </div>
                </div>

                {/* Exam Period & Sunday Skip Indicator */}
                {startDate && endDate && (
                  <div className={`p-3 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2.5 transition-all ${
                    isDark ? "bg-slate-800/60 border-slate-700/80 text-slate-300" : "bg-blue-50/70 border-blue-200 text-blue-950"
                  }`}>
                    <div className="flex items-center gap-2">
                      <CalendarDaysIcon className="w-4 h-4 text-blue-500 shrink-0" />
                      <div>
                        <span className="font-bold">
                          Exam Period: {formatDateWithDay(startDate)} &rarr; {formatDateWithDay(endDate)}
                        </span>
                        <span className="ml-2 px-2 py-0.5 rounded-full font-semibold border text-[11px] bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400">
                          {getExamDaysList(startDate, endDate).length} exam days
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 font-medium text-[11px] text-amber-600 dark:text-amber-400">
                      <span>Sundays are automatically skipped (no classes)</span>
                    </div>
                  </div>
                )}

                {/* Daily Exam Hours */}
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-2">
                    <label className={`block text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`} htmlFor="examscheduler-field-7">
                      <ClockIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Daily Exam Start Time
                    </label>
                    <input
                      type="time"
                      value={dailyStartTime}
                      onChange={(e) => setDailyStartTime(e.target.value)}
                      className={`rounded-xl p-3 w-full border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all ${isDark
                        ? "bg-slate-800 text-slate-100 border-slate-700"
                        : "bg-slate-50 text-slate-800 border-slate-200"
                        }`} id="examscheduler-field-7" aria-label="Daily Exam Start Time" />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className={`block text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? "text-slate-400" : "text-slate-600"}`} htmlFor="examscheduler-field-8">
                      <ClockIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      Daily Exam End Time
                    </label>
                    <input
                      type="time"
                      value={dailyEndTime}
                      onChange={(e) => setDailyEndTime(e.target.value)}
                      className={`rounded-xl p-3 w-full border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all ${isDark
                        ? "bg-slate-800 text-slate-100 border-slate-700"
                        : "bg-slate-50 text-slate-800 border-slate-200"
                        }`} id="examscheduler-field-8" aria-label="Daily Exam End Time" />
                  </div>
                </div>

                {/* Subject Allotted Time Info Banner */}
                <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isDark ? "bg-blue-950/30 border-blue-800/40 text-blue-200" : "bg-blue-50/80 border-blue-200 text-blue-900"
                }`}>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-blue-600/10 dark:bg-blue-400/10 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                      <ClockIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider">Exam Allotted Durations</h4>
                      <p className="text-xs mt-0.5 opacity-90 leading-relaxed">
                        School Standard: <strong>1h 15m (75 mins)</strong> &bull; BA Major Subjects: <strong>2h 00m (120 mins)</strong>
                      </p>
                      <p className="text-xs opacity-75 mt-0.5">
                        To customize allotted time for specific subjects or courses, open the <strong>Subject Durations</strong> tab.
                      </p>
                    </div>
                  </div>
                </div>

                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"} italic`}>
                  Recommended: 4-day period. Exam sessions run continuously from {dailyStartTime} to {dailyEndTime} throughout the day without a lunch break.
                </p>
              </div>

              {/* Subject Checklist */}
              <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between mb-4">
                  <div className={`block text-sm font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                    3. Select Subjects for Exam
                  </div>
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-800"}`}>
                    {subjects.length - excludedSubjects.size} / {subjects.length} selected
                  </span>
                </div>

                <p className={`text-xs mb-4 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Uncheck subjects that do not require a written exam (e.g. Practicums, Project-based).
                </p>

                <div className="mb-4 relative">
                  <input
                    type="text"
                    placeholder="Search subjects..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className={`w-full rounded-xl pl-10 pr-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all ${isDark
                      ? "bg-slate-800 text-slate-100 border-slate-700 placeholder:text-slate-500"
                      : "bg-slate-50 text-slate-800 border-slate-200 border placeholder:text-slate-400"
                      }`} aria-label="Search subjects" />
                  <DocumentTextIcon className={`absolute left-3 top-3 w-4 h-4 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
                </div>

                <div className={`max-h-64 overflow-y-auto custom-scrollbar rounded-xl border p-2 ${isDark ? "border-slate-700 bg-slate-800/40" : "border-slate-200 bg-slate-50/50"}`}>
                  {subjectsLoading ? (
                    <div className={`p-4 text-center text-sm flex items-center justify-center gap-2 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      <ArrowPathIcon className="w-4 h-4 animate-spin text-blue-600 dark:text-blue-400" />
                      Loading subjects...
                    </div>
                  ) : subjectsError ? (
                    <div className={`p-4 text-center text-sm ${isDark ? "text-rose-400" : "text-rose-600"}`}>
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
                                  ? isDark ? "border-blue-900/60 bg-blue-950/20 text-slate-100" : "border-blue-200 bg-blue-50/60 text-slate-900"
                                  : isDark ? "border-slate-700/60 bg-slate-800/50 text-slate-500 line-through" : "border-slate-200 bg-white text-slate-400 line-through"
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
                              <span className="text-sm font-medium">
                                {subject}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                  ) : subjects.length === 0 ? (
                    <div className={`p-4 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      No written exam subjects found for {selectedDept} semester {semester}.
                    </div>
                  ) : (
                    <div className={`p-4 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      No subjects match your search.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6 border-t border-slate-200 dark:border-slate-800 pb-8">
                {showGenerationProgress && (
                  <div className={`mb-5 rounded-2xl border p-4 ${isDark ? "bg-slate-800/80 border-slate-700" : "bg-blue-50/60 border-blue-100"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className={`text-sm font-bold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                          {generationProgress.phase || (loading ? "Generating schedule" : "Schedule status")}
                        </div>
                        <p className={`mt-1 break-words whitespace-pre-wrap text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          {generationProgress.detail || (loading ? "Preparing scheduler tasks..." : "Generation status is ready.")}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${isDark ? "bg-slate-700 text-slate-100" : "bg-white text-blue-700 border border-blue-200"}`}>
                        {generationPercent}%
                      </span>
                    </div>
                    <div
                      className={`mt-4 h-3 overflow-hidden rounded-full ${isDark ? "bg-slate-700" : "bg-slate-200"}`}
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

                {/* Existing schedule warning banner */}
                {existingExamCount > 0 && !loading && (
                  <div className={`mb-5 flex items-start gap-3 rounded-2xl border p-4 ${
                    isDark ? "bg-amber-950/30 border-amber-800/50" : "bg-amber-50 border-amber-200"
                  }`}>
                    <div className={`shrink-0 mt-0.5 ${isDark ? "text-amber-400" : "text-amber-600"}`}>
                      <ExclamationTriangleIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className={`text-sm font-bold ${isDark ? "text-amber-300" : "text-amber-900"}`}>
                        Existing Schedule Detected
                      </div>
                      <p className={`text-xs mt-1 ${isDark ? "text-amber-400/90" : "text-amber-800"}`}>
                        There are already <strong>{existingExamCount} {term} exams</strong> generated for {selectedDept} Semester {semester}.
                        You can replace this term's schedule or select a different term to generate independently.
                      </p>
                    </div>
                  </div>
                )}

                {!loading && (generationBusy || generationStatusError) && (
                  <p role="status" className="mb-4 text-sm text-amber-700 dark:text-amber-300">
                    {generationBusy
                      ? "An admin is currently generating an exam schedule. You can generate another after it finishes."
                      : "Could not check schedule generation status. Retrying automatically..."}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
                  <button
                    type="button"
                    onClick={generate}
                    disabled={loading || generationBlocked || existingExamChecking || isPreflighting}
                    className={`flex items-center justify-center gap-2.5 sm:gap-3 px-5 sm:px-8 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl w-full sm:w-auto text-white font-bold text-sm sm:text-base transition-all shadow-md ${
                      loading || generationBlocked || existingExamChecking || isPreflighting
                        ? "bg-slate-400 dark:bg-slate-700 cursor-not-allowed opacity-60"
                        : existingExamCount > 0
                          ? "bg-amber-600 hover:bg-amber-700 hover:shadow-amber-600/20 active:scale-95"
                          : "bg-blue-600 hover:bg-blue-700 hover:shadow-blue-600/20 active:scale-95"
                    }`} aria-label="Generate exam schedule">
                    {loading ? (
                      <>
                        <ArrowPathIcon className="w-5 h-5 animate-spin" /> Generating...
                      </>
                    ) : generationBusy ? (
                      <>
                        <ClockIcon className="w-5 h-5" /> Generation in progress
                      </>
                    ) : generationStatusError ? (
                      <>Waiting for generation status...</>
                    ) : generationStatusChecking || existingExamChecking || isPreflighting ? (
                      <>
                        <ArrowPathIcon className="w-5 h-5 animate-spin" /> Checking...
                      </>
                    ) : existingExamCount > 0 ? (
                      <>
                        <SparklesIcon className="w-5 h-5" />
                        Overwrite Existing Schedule
                      </>
                    ) : (
                      <>
                        <SparklesIcon className="w-5 h-5" />
                        Generate Schedule for All {selectedDept} Courses
                      </>
                    )}
                  </button>

                  {loading && (
                    <button
                      type="button"
                      onClick={cancelGeneration}
                      disabled={cancelling}
                      className="flex items-center justify-center gap-2 px-5 sm:px-6 py-3.5 sm:py-4 rounded-xl sm:rounded-2xl w-full sm:w-auto text-rose-600 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 dark:text-rose-400 font-bold text-sm sm:text-base transition-all border border-rose-200 dark:border-rose-800/50" aria-label="Close">
                      {cancelling ? (
                        <>
                          <ArrowPathIcon className="w-5 h-5 animate-spin" /> Cancelling...
                        </>
                      ) : (
                        <>
                          <XMarkIcon className="w-5 h-5" /> Cancel Generation
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className={`p-8 sm:p-10 text-center rounded-2xl border-2 border-dashed ${isDark ? "border-slate-800 bg-slate-800/20 text-slate-400" : "border-slate-200 bg-slate-50/50 text-slate-500"}`}>
              <SparklesIcon className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 opacity-30 text-blue-500" />
              <div className="text-base sm:text-lg font-bold">Ready to create a schedule?</div>
              <p className="text-xs sm:text-sm mt-1">Select an academic level above to begin configuring the filters.</p>
            </div>
          )}
        </div>


      </div>

      {/* Overwrite existing schedule modal */}
      {overwriteModal.isOpen && (
        <div 
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs z-50 p-3 sm:p-4"
        >
          <div 
            className="absolute inset-0"
            onClick={() => setOverwriteModal({ isOpen: false })}
          />
          <div className={`relative ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"} border rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-8`}>
            <button
              type="button"
              onClick={() => setOverwriteModal({ isOpen: false })}
              aria-label="Close dialog"
              className={`absolute top-4 right-4 p-1.5 rounded-lg transition ${
                isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
              }`}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center mb-4 sm:mb-5">
                <ExclamationTriangleIcon className="w-7 h-7 sm:w-8 sm:h-8 text-amber-600 dark:text-amber-400" />
              </div>
              <h3 className={`text-lg sm:text-xl font-bold mb-2 ${isDark ? "text-white" : "text-slate-900"}`}>
                Schedule Already Exists
              </h3>
              <p className={`text-xs sm:text-sm mb-2 ${isDark ? "text-slate-300" : "text-slate-600"} leading-relaxed`}>
                There are already <strong>{existingExamCount} exams</strong> generated for{" "}
                <strong>{selectedDept}</strong> Semester <strong>{semester}</strong>, <strong>{term}</strong>.
              </p>
              <p className={`text-xs mb-6 sm:mb-8 px-1 sm:px-2 ${isDark ? "text-amber-400" : "text-amber-700"} leading-relaxed`}>
                Generate a replacement <strong>{term}</strong> schedule for this department and semester.
                Other terms will stay saved. Students will see the replacement after you post it.
              </p>
              <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-3 w-full">
                <button
                  type="button"
                  onClick={() => setOverwriteModal({ isOpen: false })}
                  className={`w-full py-3 rounded-xl font-bold text-xs sm:text-sm transition ${isDark ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOverwriteModal({ isOpen: false });
                    executeGeneration(true);
                  }}
                  disabled={loading || generationBlocked}
                  className="w-full py-3 rounded-xl font-bold text-xs sm:text-sm bg-amber-600 hover:bg-amber-700 text-white transition shadow-md shadow-amber-600/20 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  Overwrite Schedule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmModal.isOpen && (
        <div 
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs z-50 p-3 sm:p-4"
        >
          <div 
            className="absolute inset-0"
            onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
          />
          <div className={`relative ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"} border rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-8 animate-slide-in`}>
            <button
              type="button"
              onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
              aria-label="Close dialog"
              className={`absolute top-4 right-4 p-1.5 rounded-lg transition ${
                isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
              }`}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center mb-4 sm:mb-6">
                <CalendarDaysIcon className="w-7 h-7 sm:w-8 sm:h-8 text-blue-600 dark:text-blue-400" />
              </div>
              <h3 className={`text-lg sm:text-xl font-bold mb-2 sm:mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>Confirm Generation</h3>
              <p className={`text-xs sm:text-sm mb-6 sm:mb-8 ${isDark ? "text-slate-300" : "text-slate-600"} leading-relaxed`}>{confirmModal.message}</p>
              <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-4 w-full">
                <button type="button" onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })} className={`w-full py-3 rounded-xl font-bold text-xs sm:text-sm transition ${isDark ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>Cancel</button>
                <button type="button" onClick={confirmModal.onConfirm} disabled={loading || generationBlocked} className="w-full py-3 rounded-xl font-bold text-xs sm:text-sm bg-blue-600 text-white hover:bg-blue-700 transition shadow-md shadow-blue-600/20 disabled:opacity-60 disabled:cursor-not-allowed">Proceed</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

