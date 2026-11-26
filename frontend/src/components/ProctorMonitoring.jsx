import React, { useEffect, useState, useCallback } from "react";
import {
  ShieldCheckIcon,
  ClockIcon,
  MapPinIcon,
  CalendarIcon,
  UsersIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ArrowPathIcon,
  BookOpenIcon,
  AcademicCapIcon,
  CheckBadgeIcon,
  FunnelIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import { useToast } from "../context/ToastContext";
import { useUser } from "../context/userStore";
import { getExamTermLabel, getExamTerms } from "../utils/examTerms";
import api from "../api";
import AttendanceProofPhoto from "./AttendanceProofPhoto";
import ConfirmationModal from "./ConfirmationModal";

const examTermOrder = [...getExamTerms("College"), ...getExamTerms("SHS")].map(({ value }) => value);

// ─── Utility ────────────────────────────────────────────────────────────────

function AttendanceBadge({ status }) {
  const attended = status === "attended" || status === "confirmed";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
        attended
          ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
          : "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
      }`}
    >
      {attended ? (
        <CheckCircleIcon className="w-3.5 h-3.5" />
      ) : (
        <ExclamationCircleIcon className="w-3.5 h-3.5" />
      )}
      {attended ? "Attended" : "Pending"}
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ProctorMonitoring({ isGenerating }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user } = useUser();
  const { showError, showSuccess } = useToast();

  const [courseGroups, setCourseGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [filterTerm, setFilterTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | pending | attended
  const [searchText, setSearchText] = useState("");
  const [replacementExam, setReplacementExam] = useState(null);
  const [reassigningId, setReassigningId] = useState(null);
  const [absenceRequests, setAbsenceRequests] = useState({});
  const [replacementOptions, setReplacementOptions] = useState(null);
  const [replacementOptionsError, setReplacementOptionsError] = useState("");
  const [selectedReplacement, setSelectedReplacement] = useState("");

  // ── Fetch data ──────────────────────────────────────────────────────────
  const fetchMonitoring = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/proctors/monitoring");
      setCourseGroups(res.data);
      setLastRefreshed(new Date());
    } catch (err) {
      console.error("Error fetching proctor monitoring:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAbsenceRequests = useCallback(async () => {
    try {
      const { data } = await api.get("/proctors/absence-requests");
      setAbsenceRequests(Object.fromEntries(data.map(request => [request.exam_id, request])));
    } catch (err) {
      console.error("Error fetching substitute requests:", err);
    }
  }, []);

  const refreshMonitoring = useCallback(() => Promise.all([fetchMonitoring(), fetchAbsenceRequests()]), [fetchMonitoring, fetchAbsenceRequests]);

  useEffect(() => {
    refreshMonitoring();
    // Auto-refresh every 30 seconds
    const interval = setInterval(refreshMonitoring, 30_000);
    return () => clearInterval(interval);
  }, [refreshMonitoring]);

  const replacementExamId = replacementExam?.exam_id;
  useEffect(() => {
    if (!replacementExamId) return;
    const controller = new AbortController();
    api.get(`/proctors/monitoring/${replacementExamId}/replacement-options`, { signal: controller.signal })
      .then(({ data }) => {
        if (!controller.signal.aborted) setReplacementOptions(data);
      })
      .catch(err => {
        if (!controller.signal.aborted) setReplacementOptionsError(err.response?.data?.detail || "Could not load eligible proctors.");
      });
    return () => controller.abort();
  }, [replacementExamId]);

  const getAbsenceRequest = (exam) => {
    const request = absenceRequests[exam.exam_id];
    return request && request.proctor_id === exam.proctor_id && request.timeslot_id === exam.timeslot_id && request.room_id === exam.room_id ? request : null;
  };

  const isExamAttended = (status) => status === "attended" || status === "confirmed";
  const departments = user?.department_codes?.length ? user.department_codes : [user?.department_code];
  const managedDepartments = departments.map(code => String(code || "").trim().toUpperCase()).filter(Boolean);

  const requestReplacement = async () => {
    if (!replacementExam || reassigningId !== null) return;
    const exam = replacementExam;
    setReplacementExam(null);
    if (isGenerating) {
      showError("Wait for schedule generation to finish before requesting a replacement.");
      return;
    }

    setReassigningId(exam.exam_id);
    try {
      const { data } = await api.post(`/proctors/monitoring/${exam.exam_id}/reassign`, {
        expected_proctor_id: exam.proctor_id,
        expected_timeslot_id: exam.timeslot_id,
        expected_room_id: exam.room_id,
        ...(selectedReplacement ? { replacement_proctor_id: Number(selectedReplacement) } : {}),
      });
      setCourseGroups(previous => previous.map(group => ({
        ...group,
        exams: group.exams.map(row => row.exam_id === exam.exam_id ? {
          ...row,
          proctor_id: data.proctor_id,
          proctor_name: data.proctor_name,
          attendance_proof: null,
          attendance_status: "pending",
        } : row),
      })));
      showSuccess(data.message);
    } catch (err) {
      showError(err.response?.data?.detail || "Could not request a replacement proctor.");
    } finally {
      await refreshMonitoring();
      setReassigningId(null);
    }
  };

  const renderReplacementAction = (exam) => {
    const department = String(exam.department_code || "").trim().toUpperCase();
    const canManage = user?.is_super_admin || managedDepartments.includes(department);
    const hasTimeLeft = Date.parse(exam.reassign_until) > (lastRefreshed?.getTime() ?? 0);
    if (!canManage || isExamAttended(exam.attendance_status) || !hasTimeLeft) return null;

    return (
      <button
        type="button"
        onClick={() => {
          setReplacementOptions(null);
          setReplacementOptionsError("");
          setSelectedReplacement("");
          setReplacementExam(exam);
        }}
        disabled={isGenerating || reassigningId !== null}
        aria-label={`Request replacement for ${exam.proctor_name}, ${exam.subject_name}, ${exam.section_name}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
      >
        <ArrowPathIcon className={`h-3.5 w-3.5 ${reassigningId === exam.exam_id ? "animate-spin" : ""}`} />
        {reassigningId === exam.exam_id ? "Assigning replacement…" : getAbsenceRequest(exam) ? "Review Substitute Request" : "Request Replacement"}
      </button>
    );
  };

  const availableTerms = new Set(courseGroups.flatMap(group => group.exams.map(exam => exam.term)).filter(Boolean));
  // Keep the selected term available even if a refresh returns no exams for it.
  if (filterTerm) availableTerms.add(filterTerm);
  const termOptions = [
    ...examTermOrder.filter(term => availableTerms.has(term)),
    ...[...availableTerms].filter(term => !examTermOrder.includes(term)).sort(),
  ];
  const termGroups = filterTerm
    ? courseGroups.map(group => ({ ...group, exams: group.exams.filter(exam => exam.term === filterTerm) }))
    : courseGroups;
  const termExams = termGroups.flatMap(group => group.exams);
  const totalExams = termExams.length;
  const attendedCount = termExams.filter((e) => isExamAttended(e.attendance_status)).length;
  const pendingCount = totalExams - attendedCount;
  const completionPct = totalExams > 0 ? Math.round((attendedCount / totalExams) * 100) : 0;

  // ── Filtering ───────────────────────────────────────────────────────────
  const filteredGroups = termGroups
    .map((group) => {
      let exams = group.exams;
      if (filterStatus === "attended") {
        exams = exams.filter((e) => isExamAttended(e.attendance_status));
      } else if (filterStatus === "pending") {
        exams = exams.filter((e) => !isExamAttended(e.attendance_status));
      } else if (filterStatus === "requested") {
        exams = exams.filter(getAbsenceRequest);
      }
      if (searchText.trim()) {
        const q = searchText.toLowerCase();
        exams = exams.filter(
          (e) =>
            e.proctor_name.toLowerCase().includes(q) ||
            e.subject_name.toLowerCase().includes(q) ||
            e.section_name.toLowerCase().includes(q) ||
            e.subject_code.toLowerCase().includes(q)
        );
      }
      return { ...group, exams };
    })
    .filter((group) => group.exams.length > 0);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full space-y-6">
      <ConfirmationModal
        isOpen={replacementExam !== null}
        title="Request a replacement proctor?"
        message={replacementExam && (
          <div className="space-y-2">
            <p><strong>{replacementExam.subject_name}</strong> for {replacementExam.section_name}</p>
            <p>{replacementExam.exam_date} · {replacementExam.start_time} – {replacementExam.end_time} · {replacementExam.room}</p>
            {getAbsenceRequest(replacementExam) && (
              <p className="whitespace-pre-wrap break-words rounded-lg bg-amber-50 p-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">{getAbsenceRequest(replacementExam).reason}</p>
            )}
            <p>Assign a substitute for <strong>{replacementExam.proctor_name}</strong> at the posted room and time.</p>
            <label className="block font-semibold">
              Replacement proctor
              <select value={selectedReplacement} onChange={event => setSelectedReplacement(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 dark:border-slate-600 dark:bg-slate-900">
                <option value="">Find automatically</option>
                {replacementOptions?.map(proctor => <option key={proctor.id} value={proctor.id}>{proctor.name}</option>)}
              </select>
            </label>
            <p role="status" className="text-xs text-slate-600 dark:text-slate-400">
              {replacementOptionsError || (replacementOptions === null ? "Loading eligible proctors…" :
                replacementOptions.length === 0 ? "No eligible substitutes are currently available for this time." : "Choose an eligible proctor or let the system find one.")}
            </p>
          </div>
        )}
        confirmLabel={selectedReplacement ? "Assign Selected Proctor" : "Find and Assign"}
        onConfirm={requestReplacement}
        onCancel={() => setReplacementExam(null)}
      />
      <div className="w-full space-y-6">

        {/* ── Page Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="p-2.5 sm:p-3 rounded-2xl shrink-0 bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
              <ShieldCheckIcon className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div>
              <h1 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Proctor Attendance Monitoring
              </h1>
              <p className={`text-xs sm:text-sm mt-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Real-time tracking of exam proctor assignments and attendance check-ins
                {lastRefreshed && (
                  <span className="opacity-75 block sm:inline sm:ml-2">
                    · Last updated {lastRefreshed.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            <label className={`flex min-w-0 flex-1 items-center gap-2 text-xs font-semibold sm:flex-none sm:text-sm ${isDark ? "text-slate-200" : "text-slate-700"}`}>
              <span className="shrink-0">Exam term</span>
              <select
                value={filterTerm}
                onChange={(e) => setFilterTerm(e.target.value)}
                className={`min-w-0 max-w-full flex-1 rounded-xl border px-3 py-2.5 sm:max-w-56 ${isDark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-300 text-slate-800"}`}
              >
                <option value="">All terms</option>
                {termOptions.map(term => <option key={term} value={term}>{getExamTermLabel(term)}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={refreshMonitoring}
              disabled={loading}
              className={`shrink-0 justify-center inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition border shadow-xs ${
                isDark
                  ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750"
                  : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : "text-slate-500"}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {[
            {
              label: "Total Assignments",
              value: totalExams,
              icon: BookOpenIcon,
              tone: isDark ? "bg-blue-950/40 text-blue-300 border-blue-800/60" : "bg-blue-50 text-blue-800 border-blue-200",
            },
            {
              label: "Attended",
              value: attendedCount,
              icon: CheckCircleIcon,
              tone: isDark ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/60" : "bg-emerald-50 text-emerald-800 border-emerald-200",
            },
            {
              label: "Pending",
              value: pendingCount,
              icon: ExclamationCircleIcon,
              tone: isDark ? "bg-amber-950/40 text-amber-300 border-amber-800/60" : "bg-amber-50 text-amber-800 border-amber-200",
            },
            {
              label: "Completion Rate",
              value: `${completionPct}%`,
              icon: CheckBadgeIcon,
              tone: isDark ? "bg-purple-950/40 text-purple-300 border-purple-800/60" : "bg-purple-50 text-purple-800 border-purple-200",
            },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className={`rounded-2xl border p-4 sm:p-5 shadow-xs transition hover:shadow-md ${tone}`}>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider opacity-85">{label}</div>
                  <div className="mt-1 text-2xl sm:text-3xl font-extrabold">{value}</div>
                </div>
                <div className="p-2 sm:p-2.5 rounded-xl bg-white/40 dark:bg-black/20 shrink-0">
                  <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Progress Bar ── */}
        <div className={`rounded-2xl border p-4 sm:p-5 shadow-xs ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-xs sm:text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-800"}`}>
              {filterTerm ? `${getExamTermLabel(filterTerm)} Attendance Completion` : "Overall Attendance Completion"}
            </span>
            <span className={`text-xs sm:text-sm font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}>
              {attendedCount} of {totalExams} ({completionPct}%)
            </span>
          </div>
          <div className={`w-full h-3 rounded-full overflow-hidden ${isDark ? "bg-slate-700" : "bg-slate-100"}`}>
            <div
              className="h-full rounded-full bg-emerald-600 transition-all duration-700"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <p className={`text-xs mt-2 font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            {completionPct}% of proctor assignments have verified their attendance at examination venues.
          </p>
        </div>

        {/* ── Filters ── */}
        <div className={`rounded-2xl border p-4 sm:px-5 sm:py-4 shadow-xs ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="flex items-center gap-2">
              <FunnelIcon className={`w-4 h-4 shrink-0 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
              <span className={`text-xs sm:text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Filter Status:
              </span>
            </div>

            {/* Status filter */}
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: "All" },
                { value: "pending", label: "Pending" },
                { value: "attended", label: "Attended" },
                { value: "requested", label: "Substitute Requests" },
              ].map(({ value, label }) => (
                <button
                  type="button"
                  key={value}
                  onClick={() => setFilterStatus(value)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${
                    filterStatus === value
                      ? "bg-blue-700 text-white border-blue-700 shadow-xs"
                      : isDark
                      ? "bg-slate-750 text-slate-300 border-slate-700 hover:bg-slate-700"
                      : "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search proctor, course, section, or code..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={`border rounded-xl px-3.5 py-2 text-xs sm:text-sm outline-none transition w-full sm:flex-1 sm:min-w-[200px] ${
                isDark 
                  ? "bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                  : "bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              }`} aria-label="Search proctor, course, section, or code" />
          </div>
        </div>

        {/* ── Loading / Empty ── */}
        {loading && courseGroups.length === 0 ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <div
              className={`w-10 h-10 rounded-full border-4 border-t-blue-500 animate-spin ${
                isDark ? "border-slate-700" : "border-slate-200"
              }`}
            />
            <span className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Loading monitoring data…
            </span>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div
            className={`text-center py-16 sm:py-20 rounded-2xl border-2 border-dashed p-4 ${
              isDark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"
            }`}
          >
            <UsersIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <div className={`text-base sm:text-lg font-bold mb-1 ${isDark ? "text-slate-200" : "text-slate-800"}`}>No Assignments Found</div>
            <p className="text-xs sm:text-sm max-w-sm mx-auto font-medium">
              {totalExams === 0 && !filterTerm
                ? "No posted exams with proctor assignments yet. Please generate and post schedules first."
                : "No proctor assignments match your current filter or search criteria."}
            </p>
          </div>
        ) : (
          /* ── Course Groups ── */
          <div className="space-y-6 sm:space-y-8">
            {filteredGroups.map(({ course_name, exams }) => {
              const courseAttended = exams.filter((e) => isExamAttended(e.attendance_status)).length;
              const coursePct =
                exams.length > 0 ? Math.round((courseAttended / exams.length) * 100) : 0;

              return (
                <div key={course_name} className={`rounded-2xl border shadow-xs overflow-hidden ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
                  {/* Course Header */}
                  <div
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b ${
                      isDark ? "border-slate-700 bg-slate-850/60" : "border-slate-200 bg-slate-50/80"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2.5 rounded-xl shrink-0 ${
                          isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-600/10 text-blue-600"
                        }`}
                      >
                        <AcademicCapIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <h2
                          className={`font-bold text-sm sm:text-base ${
                            isDark ? "text-white" : "text-slate-900"
                          }`}
                        >
                          {course_name}
                        </h2>
                        <p
                          className={`text-xs mt-0.5 font-medium ${
                            isDark ? "text-slate-400" : "text-slate-500"
                          }`}
                        >
                          {exams.length} exam{exams.length !== 1 ? "s" : ""} assigned ·{" "}
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{courseAttended} attended</span>
                        </p>
                      </div>
                    </div>
                    {/* Mini progress */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-700">
                      <div className="text-right">
                        <span
                          className={`text-base sm:text-lg font-extrabold ${
                            coursePct === 100
                              ? "text-emerald-600 dark:text-emerald-400"
                              : isDark
                              ? "text-white"
                              : "text-slate-900"
                          }`}
                        >
                          {coursePct}%
                        </span>
                      </div>
                      <div
                        className={`w-20 sm:w-28 h-2.5 rounded-full overflow-hidden ${
                          isDark ? "bg-slate-700" : "bg-slate-200"
                        }`}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            coursePct === 100
                              ? "bg-emerald-600"
                              : "bg-blue-600"
                          }`}
                          style={{ width: `${coursePct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="w-full min-w-0">
                    <div className={`md:hidden divide-y ${isDark ? "divide-slate-750" : "divide-slate-200"}`}>
                      {exams.map((exam) => (
                        <article key={exam.exam_id} className={`space-y-3 p-4 ${isExamAttended(exam.attendance_status) ? isDark ? "bg-emerald-950/20" : "bg-emerald-50/50" : ""}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h4 className={`break-words font-bold text-sm ${isDark ? "text-white" : "text-slate-900"}`}>{exam.subject_name}</h4>
                              <p className={`mt-0.5 text-xs font-mono font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>{exam.subject_code}</p>
                            </div>
                            <AttendanceBadge status={exam.attendance_status} />
                          </div>
                          <div className={`grid grid-cols-1 gap-x-4 gap-y-2 text-xs sm:text-sm sm:grid-cols-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                            <p className="break-words"><span className={`font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Proctor:</span> <span className="font-medium">{exam.proctor_name}</span></p>
                            <p className="break-words"><span className={`font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Section:</span> <span className="font-medium">{exam.section_name}</span></p>
                            <p className="break-words"><span className={`font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Date:</span> <span className="font-medium">{exam.exam_date}</span></p>
                            <p className="break-words"><span className={`font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Time:</span> <span className="font-mono font-medium">{exam.start_time} – {exam.end_time}</span></p>
                            <p className="break-words"><span className={`font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Room:</span> <span className="font-medium">{exam.room}</span></p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <AttendanceProofPhoto exam={exam} />
                            {renderReplacementAction(exam)}
                          </div>
                        </article>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[900px] text-xs sm:text-sm">
                        <thead className={`${isDark ? "bg-slate-850 text-slate-300 border-b border-slate-700" : "bg-slate-50 text-slate-700 border-b border-slate-200"}`}>
                          <tr>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-xs">Proctor</th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-xs">Section</th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-xs">Course</th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-xs">
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="w-3.5 h-3.5" /> Date
                              </span>
                            </th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-xs">
                              <span className="flex items-center gap-1">
                                <ClockIcon className="w-3.5 h-3.5" /> Time
                              </span>
                            </th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-xs">
                              <span className="flex items-center gap-1">
                                <MapPinIcon className="w-3.5 h-3.5" /> Venue
                              </span>
                            </th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-xs">Attendance</th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-xs">Actions</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? "divide-slate-750 text-slate-200" : "divide-slate-200 text-slate-800"}`}>
                          {exams.map((exam) => (
                            <tr
                              key={exam.exam_id}
                              className={`transition ${
                                isExamAttended(exam.attendance_status)
                                  ? isDark
                                  ? "bg-emerald-950/20 hover:bg-emerald-950/30"
                                  : "bg-emerald-50/50 hover:bg-emerald-50"
                                  : isDark
                                  ? "hover:bg-slate-750/50"
                                  : "hover:bg-slate-50"
                              }`}
                            >
                              {/* Proctor */}
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                                      isDark
                                        ? "bg-blue-950 text-blue-300 border border-blue-800"
                                        : "bg-blue-100 text-blue-800 border border-blue-200"
                                    }`}
                                  >
                                    {exam.proctor_name
                                      .split(" ")
                                      .map((n) => n[0])
                                      .join("")
                                      .toUpperCase()
                                      .slice(0, 2)}
                                  </div>
                                  <span className={`font-bold text-xs sm:text-sm ${isDark ? "text-white" : "text-slate-900"}`}>{exam.proctor_name}</span>
                                </div>
                              </td>
                              {/* Section */}
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                                    isDark
                                      ? "bg-slate-800 text-slate-200 border-slate-700"
                                      : "bg-slate-100 text-slate-800 border-slate-200"
                                  }`}
                                >
                                  {exam.section_name}
                                </span>
                              </td>
                              {/* Subject */}
                              <td className="py-3.5 px-4">
                                <div className={`font-semibold text-xs sm:text-sm ${isDark ? "text-white" : "text-slate-900"}`}>{exam.subject_name}</div>
                                <p
                                  className={`text-xs font-mono mt-0.5 ${
                                    isDark ? "text-slate-400" : "text-slate-500"
                                  }`}
                                >
                                  {exam.subject_code}
                                </p>
                              </td>
                              {/* Date */}
                              <td className="py-3.5 px-4 whitespace-nowrap text-xs sm:text-sm font-medium">{exam.exam_date}</td>
                              {/* Time */}
                              <td className="py-3.5 px-4 whitespace-nowrap">
                                <span className="font-mono text-xs font-medium">
                                  {exam.start_time} – {exam.end_time}
                                </span>
                              </td>
                              {/* Room */}
                              <td className="py-3.5 px-4">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                                    isDark 
                                      ? "bg-slate-800 text-slate-200 border-slate-700" 
                                      : "bg-slate-100 text-slate-800 border-slate-200"
                                  }`}
                                >
                                  <MapPinIcon className="w-3 h-3 text-blue-600 dark:text-blue-400" /> {exam.room}
                                </span>
                              </td>
                              {/* Attendance */}
                              <td className="py-3.5 px-4">
                                <AttendanceBadge status={exam.attendance_status} />
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="flex flex-col items-start gap-2">
                                  <AttendanceProofPhoto exam={exam} />
                                  {renderReplacementAction(exam)}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
