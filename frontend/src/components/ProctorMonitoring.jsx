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
import api from "../api";

// ─── Utility ────────────────────────────────────────────────────────────────

function AttendanceBadge({ status }) {
  const attended = status === "attended";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border ${
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

export default function ProctorMonitoring() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [courseGroups, setCourseGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all"); // all | pending | attended
  const [searchText, setSearchText] = useState("");

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

  useEffect(() => {
    fetchMonitoring();
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchMonitoring, 30_000);
    return () => clearInterval(interval);
  }, [fetchMonitoring]);

  // ── Derived stats ───────────────────────────────────────────────────────
  const allExams = courseGroups.flatMap((g) => g.exams);
  const totalExams = allExams.length;
  const attendedCount = allExams.filter((e) => e.attendance_status === "attended").length;
  const pendingCount = totalExams - attendedCount;
  const completionPct = totalExams > 0 ? Math.round((attendedCount / totalExams) * 100) : 0;

  // ── Filtering ───────────────────────────────────────────────────────────
  const filteredGroups = courseGroups
    .map((group) => {
      let exams = group.exams;
      if (filterStatus !== "all") {
        exams = exams.filter((e) => e.attendance_status === filterStatus);
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
    <div className={`min-h-full ${isDark ? "bg-slate-900" : "bg-slate-50"} rounded-2xl`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">

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
          <button
            type="button"
            onClick={fetchMonitoring}
            disabled={loading}
            className={`w-full sm:w-auto justify-center inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition border shadow-xs ${
              isDark
                ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-750"
                : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : "text-slate-500"}`} />
            Refresh
          </button>
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
                  <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider opacity-85">{label}</p>
                  <p className="mt-1 text-2xl sm:text-3xl font-extrabold">{value}</p>
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
              Overall Attendance Completion
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
          <p className={`text-[11px] sm:text-xs mt-2 font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>
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
            <div className="flex gap-2 shrink-0">
              {[
                { value: "all", label: "All" },
                { value: "pending", label: "Pending" },
                { value: "attended", label: "Attended" },
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
              placeholder="Search proctor, subject, section, or code..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={`border rounded-xl px-3.5 py-2 text-xs sm:text-sm outline-none transition w-full sm:flex-1 sm:min-w-[200px] ${
                isDark 
                  ? "bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                  : "bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
              }`}
            />
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
            <p className={`text-base sm:text-lg font-bold mb-1 ${isDark ? "text-slate-200" : "text-slate-800"}`}>No Assignments Found</p>
            <p className="text-xs sm:text-sm max-w-sm mx-auto font-medium">
              {totalExams === 0
                ? "No posted exams with proctor assignments yet. Please generate and post schedules first."
                : "No proctor assignments match your current filter or search criteria."}
            </p>
          </div>
        ) : (
          /* ── Course Groups ── */
          <div className="space-y-6 sm:space-y-8">
            {filteredGroups.map(({ course_name, exams }) => {
              const courseAttended = exams.filter((e) => e.attendance_status === "attended").length;
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
                        <article key={exam.exam_id} className={`space-y-3 p-4 ${exam.attendance_status === "attended" ? isDark ? "bg-emerald-950/20" : "bg-emerald-50/50" : ""}`}>
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
                        </article>
                      ))}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[900px] text-xs sm:text-sm">
                        <thead className={`${isDark ? "bg-slate-850 text-slate-300 border-b border-slate-700" : "bg-slate-50 text-slate-700 border-b border-slate-200"}`}>
                          <tr>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-[11px]">Proctor</th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-[11px]">Section</th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-[11px]">Subject</th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-[11px]">
                              <span className="flex items-center gap-1">
                                <CalendarIcon className="w-3.5 h-3.5" /> Date
                              </span>
                            </th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-[11px]">
                              <span className="flex items-center gap-1">
                                <ClockIcon className="w-3.5 h-3.5" /> Time
                              </span>
                            </th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-[11px]">
                              <span className="flex items-center gap-1">
                                <MapPinIcon className="w-3.5 h-3.5" /> Venue
                              </span>
                            </th>
                            <th className="py-3 px-4 text-left font-bold uppercase tracking-wider text-[11px]">Attendance</th>
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? "divide-slate-750 text-slate-200" : "divide-slate-200 text-slate-800"}`}>
                          {exams.map((exam) => (
                            <tr
                              key={exam.exam_id}
                              className={`transition ${
                                exam.attendance_status === "attended"
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
                                <p className={`font-semibold text-xs sm:text-sm ${isDark ? "text-white" : "text-slate-900"}`}>{exam.subject_name}</p>
                                <p
                                  className={`text-[11px] font-mono mt-0.5 ${
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
