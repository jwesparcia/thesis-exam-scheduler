import React, { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck,
  Clock,
  MapPin,
  Calendar,
  Users,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  BookOpen,
  GraduationCap,
  UserCheck,
  Filter,
} from "lucide-react";
import { useTheme } from "../context/themeStore";
import api from "../api";

// ─── Utility ────────────────────────────────────────────────────────────────

function AttendanceBadge({ status }) {
  const attended = status === "attended";
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide ${
        attended
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      }`}
    >
      {attended ? (
        <CheckCircle2 className="w-3 h-3" />
      ) : (
        <AlertCircle className="w-3 h-3" />
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

  // ── Styles ──────────────────────────────────────────────────────────────
  const card = `rounded-2xl border shadow-sm ${
    isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
  }`;
  const th = `px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${
    isDark ? "text-gray-300 bg-gray-750" : "text-gray-500 bg-gray-50"
  }`;
  const td = `px-4 py-3 text-sm ${isDark ? "text-gray-200" : "text-gray-700"}`;
  const inputCls = `border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    isDark
      ? "bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500"
      : "bg-white border-gray-300 text-gray-800 placeholder-gray-400"
  }`;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-full ${isDark ? "bg-gray-900" : "bg-gray-50"} rounded-2xl`}>
      <div className="max-w-7xl mx-auto px-2 py-8 space-y-8">

        {/* ── Page Header ── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`p-3 rounded-2xl ${isDark ? "bg-blue-600/20" : "bg-blue-50"}`}>
              <ShieldCheck className="w-7 h-7 text-blue-500" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                Proctor Attendance Monitoring
              </h1>
              <p className={`text-sm mt-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                Live overview of proctor assignments and attendance confirmations
                {lastRefreshed && (
                  <span className="ml-2 opacity-70">
                    · Last updated {lastRefreshed.toLocaleTimeString()}
                  </span>
                )}
              </p>
            </div>
          </div>
          <button
            onClick={fetchMonitoring}
            disabled={loading}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
              isDark
                ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
                : "bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
            } shadow-sm`}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {/* ── Summary Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Total Assignments",
              value: totalExams,
              icon: <BookOpen className="w-5 h-5 text-blue-500" />,
              color: "blue",
            },
            {
              label: "Attended",
              value: attendedCount,
              icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
              color: "emerald",
            },
            {
              label: "Pending",
              value: pendingCount,
              icon: <AlertCircle className="w-5 h-5 text-amber-500" />,
              color: "amber",
            },
            {
              label: "Completion",
              value: `${completionPct}%`,
              icon: <UserCheck className="w-5 h-5 text-purple-500" />,
              color: "purple",
            },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className={`${card} p-5`}>
              <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-xl bg-${color}-100 dark:bg-${color}-900/20`}>
                  {icon}
                </div>
              </div>
              <p className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                {value}
              </p>
              <p className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {label}
              </p>
            </div>
          ))}
        </div>

        {/* ── Progress Bar ── */}
        <div className={`${card} p-5`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-semibold ${isDark ? "text-gray-200" : "text-gray-700"}`}>
              Overall Attendance Completion
            </span>
            <span className={`text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
              {attendedCount} / {totalExams}
            </span>
          </div>
          <div className={`w-full h-3 rounded-full overflow-hidden ${isDark ? "bg-gray-700" : "bg-gray-200"}`}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
              style={{ width: `${completionPct}%` }}
            />
          </div>
          <p className={`text-xs mt-1.5 ${isDark ? "text-gray-400" : "text-gray-400"}`}>
            {completionPct}% of proctors have confirmed their attendance
          </p>
        </div>

        {/* ── Filters ── */}
        <div className={`${card} px-5 py-4`}>
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="flex items-center gap-2">
              <Filter className={`w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-500"}`} />
              <span className={`text-sm font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Filters
              </span>
            </div>

            {/* Status filter */}
            <div className="flex gap-2">
              {[
                { value: "all", label: "All" },
                { value: "pending", label: "Pending" },
                { value: "attended", label: "Attended" },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setFilterStatus(value)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    filterStatus === value
                      ? "bg-blue-600 text-white shadow"
                      : isDark
                      ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search proctor, subject, section…"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className={`${inputCls} flex-1 min-w-[200px]`}
            />
          </div>
        </div>

        {/* ── Loading / Empty ── */}
        {loading && courseGroups.length === 0 ? (
          <div className="flex items-center justify-center py-20 gap-3">
            <div
              className={`w-10 h-10 rounded-full border-4 border-t-blue-500 animate-spin ${
                isDark ? "border-gray-700" : "border-gray-200"
              }`}
            />
            <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              Loading monitoring data…
            </span>
          </div>
        ) : filteredGroups.length === 0 ? (
          <div
            className={`text-center py-20 rounded-2xl border-2 border-dashed ${
              isDark ? "border-gray-700 text-gray-500" : "border-gray-200 text-gray-400"
            }`}
          >
            <Users className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p className="text-lg font-semibold mb-1">No Assignments Found</p>
            <p className="text-sm">
              {totalExams === 0
                ? "No posted exams with proctor assignments yet. Post exams first."
                : "No results match your current filters."}
            </p>
          </div>
        ) : (
          /* ── Course Groups ── */
          <div className="space-y-8">
            {filteredGroups.map(({ course_name, exams }) => {
              const courseAttended = exams.filter((e) => e.attendance_status === "attended").length;
              const coursePct =
                exams.length > 0 ? Math.round((courseAttended / exams.length) * 100) : 0;

              return (
                <div key={course_name} className={card}>
                  {/* Course Header */}
                  <div
                    className={`flex items-center justify-between px-6 py-4 border-b ${
                      isDark ? "border-gray-700 bg-gray-750/40" : "border-gray-100 bg-gray-50"
                    } rounded-t-2xl`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-xl ${
                          isDark ? "bg-blue-600/20" : "bg-blue-50"
                        }`}
                      >
                        <GraduationCap className="w-5 h-5 text-blue-500" />
                      </div>
                      <div>
                        <h2
                          className={`font-bold text-base ${
                            isDark ? "text-white" : "text-gray-900"
                          }`}
                        >
                          {course_name}
                        </h2>
                        <p
                          className={`text-xs mt-0.5 ${
                            isDark ? "text-gray-400" : "text-gray-500"
                          }`}
                        >
                          {exams.length} exam{exams.length !== 1 ? "s" : ""} assigned ·{" "}
                          {courseAttended} attended
                        </p>
                      </div>
                    </div>
                    {/* Mini progress */}
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span
                          className={`text-lg font-bold ${
                            coursePct === 100
                              ? "text-emerald-500"
                              : isDark
                              ? "text-white"
                              : "text-gray-900"
                          }`}
                        >
                          {coursePct}%
                        </span>
                      </div>
                      <div
                        className={`w-24 h-2.5 rounded-full overflow-hidden ${
                          isDark ? "bg-gray-700" : "bg-gray-200"
                        }`}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            coursePct === 100
                              ? "bg-emerald-500"
                              : "bg-gradient-to-r from-blue-500 to-cyan-400"
                          }`}
                          style={{ width: `${coursePct}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr
                          className={`border-b ${
                            isDark ? "border-gray-700" : "border-gray-100"
                          }`}
                        >
                          <th className={th}>Proctor</th>
                          <th className={th}>Section</th>
                          <th className={th}>Subject</th>
                          <th className={th}>
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> Date
                            </span>
                          </th>
                          <th className={th}>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Time
                            </span>
                          </th>
                          <th className={th}>
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3 h-3" /> Room
                            </span>
                          </th>
                          <th className={th}>Attendance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                        {exams.map((exam) => (
                          <tr
                            key={exam.exam_id}
                            className={`transition-colors ${
                              exam.attendance_status === "attended"
                                ? isDark
                                  ? "bg-emerald-900/10 hover:bg-emerald-900/20"
                                  : "bg-emerald-50/60 hover:bg-emerald-50"
                                : isDark
                                ? "hover:bg-gray-700/40"
                                : "hover:bg-gray-50"
                            }`}
                          >
                            {/* Proctor */}
                            <td className={td}>
                              <div className="flex items-center gap-2.5">
                                <div
                                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                    isDark
                                      ? "bg-blue-600/20 text-blue-400"
                                      : "bg-blue-100 text-blue-700"
                                  }`}
                                >
                                  {exam.proctor_name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                    .toUpperCase()
                                    .slice(0, 2)}
                                </div>
                                <span className="font-medium">{exam.proctor_name}</span>
                              </div>
                            </td>
                            {/* Section */}
                            <td className={td}>
                              <span
                                className={`inline-block px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                                  isDark
                                    ? "bg-gray-700 text-gray-300"
                                    : "bg-gray-100 text-gray-700"
                                }`}
                              >
                                {exam.section_name}
                              </span>
                            </td>
                            {/* Subject */}
                            <td className={td}>
                              <p className="font-medium">{exam.subject_name}</p>
                              <p
                                className={`text-[11px] mt-0.5 ${
                                  isDark ? "text-gray-400" : "text-gray-400"
                                }`}
                              >
                                {exam.subject_code}
                              </p>
                            </td>
                            {/* Date */}
                            <td className={`${td} whitespace-nowrap`}>{exam.exam_date}</td>
                            {/* Time */}
                            <td className={`${td} whitespace-nowrap`}>
                              <span className="font-mono text-xs">
                                {exam.start_time} – {exam.end_time}
                              </span>
                            </td>
                            {/* Room */}
                            <td className={td}>
                              <span
                                className={`inline-flex items-center gap-1 text-xs font-semibold ${
                                  isDark ? "text-pink-400" : "text-pink-600"
                                }`}
                              >
                                <MapPin className="w-3 h-3" /> {exam.room}
                              </span>
                            </td>
                            {/* Attendance */}
                            <td className={td}>
                              <AttendanceBadge status={exam.attendance_status} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
