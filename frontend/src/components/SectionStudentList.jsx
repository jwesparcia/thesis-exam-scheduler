import React, { useState, useEffect, useMemo } from "react";
import {
  MagnifyingGlassIcon,
  UserGroupIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  TagIcon,
  CalendarDaysIcon,
  ClockIcon,
  BuildingOffice2Icon,
  FunnelIcon,
  XMarkIcon,
  BookOpenIcon,
  AcademicCapIcon,
  PrinterIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import api from "../api";

const STATUS_STYLES = {
  posted: {
    dark: "bg-emerald-900/30 text-emerald-300 border-emerald-800/50",
    light: "bg-emerald-50 text-emerald-700 border-emerald-200",
  },
  draft: {
    dark: "bg-amber-900/30 text-amber-300 border-amber-800/50",
    light: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

export default function SectionStudentList() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [searchStudent, setSearchStudent] = useState("");
  const [searchExam, setSearchExam] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // "all" | "posted" | "draft"
  const [filterType, setFilterType] = useState("all");     // "all" | "regular" | "irregular"

  // Expand/collapse per exam
  const [expandedExams, setExpandedExams] = useState({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/catalog/exams/attendance-roster");
      setExams(res.data);
      // Auto-expand posted exams that have students
      const expanded = {};
      res.data.forEach((exam) => {
        if (exam.status === "posted" && exam.student_count > 0) {
          expanded[exam.exam_id] = true;
        }
      });
      setExpandedExams(expanded);
    } catch (err) {
      console.error("Error fetching attendance roster:", err);
      setError("Failed to load exam roster. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const toggleExam = (examId) =>
    setExpandedExams((prev) => ({ ...prev, [examId]: !prev[examId] }));

  const expandAll = () => {
    const expanded = {};
    filteredExams.forEach((e) => (expanded[e.exam_id] = true));
    setExpandedExams(expanded);
  };

  const collapseAll = () => setExpandedExams({});

  // Derived filtered list
  const filteredExams = useMemo(() => {
    return exams
      .filter((exam) => {
        if (filterStatus !== "all" && exam.status !== filterStatus) return false;
        if (
          searchExam &&
          !exam.subject_name.toLowerCase().includes(searchExam.toLowerCase()) &&
          !exam.subject_code.toLowerCase().includes(searchExam.toLowerCase()) &&
          !exam.section_name.toLowerCase().includes(searchExam.toLowerCase())
        )
          return false;
        return true;
      })
      .map((exam) => {
        const displayStudents = exam.students.filter((s) => {
          const matchType = filterType === "all" || s.student_type === filterType;
          const matchSearch =
            !searchStudent ||
            s.name.toLowerCase().includes(searchStudent.toLowerCase()) ||
            s.email.toLowerCase().includes(searchStudent.toLowerCase()) ||
            s.student_id.toLowerCase().includes(searchStudent.toLowerCase());
          return matchType && matchSearch;
        });
        return { ...exam, displayStudents };
      })
      .filter((exam) => {
        // When filtering students, only show exams with matches
        if (searchStudent || filterType !== "all") return exam.displayStudents.length > 0;
        return true;
      });
  }, [exams, searchExam, searchStudent, filterStatus, filterType]);

  // Summary stats
  const totalExams = exams.length;
  const postedExams = exams.filter((e) => e.status === "posted").length;
  const totalStudentSlots = useMemo(
    () => exams.reduce((a, e) => a + e.student_count, 0),
    [exams]
  );

  // Print a single exam roster
  const handlePrint = (exam) => {
    const students = exam.displayStudents ?? exam.students;
    const rows = students
      .map(
        (s, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${s.name}</td>
          <td>${s.student_id || "—"}</td>
          <td>${s.student_type === "irregular" ? "Irregular" : "Regular"}</td>
          <td style="width:120px;border-bottom:1px solid #ccc;"></td>
        </tr>`
      )
      .join("");

    const html = `
      <html><head><title>Attendance Roster</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 12px; padding: 20px; }
        h2 { margin: 0; font-size: 16px; }
        .meta { margin: 8px 0 16px; color: #555; }
        table { width: 100%; border-collapse: collapse; }
        th { background: #f0f0f0; padding: 6px 8px; text-align: left; border: 1px solid #ccc; }
        td { padding: 6px 8px; border: 1px solid #ddd; }
        .footer { margin-top: 24px; font-size: 11px; color: #888; }
      </style></head>
      <body>
        <h2>Exam Attendance Roster</h2>
        <div class="meta">
          <strong>${exam.subject_code} — ${exam.subject_name}</strong><br/>
          Section: ${exam.section_name} &nbsp;|&nbsp;
          Room: ${exam.room} &nbsp;|&nbsp;
          Date: ${exam.exam_date} &nbsp;|&nbsp;
          Time: ${exam.start_time} – ${exam.end_time}
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th><th>Name</th><th>Student ID</th><th>Type</th><th>Signature</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">Generated: ${new Date().toLocaleString()} — Total: ${students.length} student(s)</div>
      </body></html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <ArrowPathIcon
          className={`w-10 h-10 animate-spin ${isDark ? "text-violet-400" : "text-violet-600"}`}
        />
        <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
          Loading exam attendance roster…
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <ExclamationTriangleIcon className="w-10 h-10 text-red-500" />
        <p className="text-sm text-red-500 font-medium">{error}</p>
        <button
          onClick={fetchData}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            isDark
              ? "bg-slate-700 hover:bg-slate-600 text-white"
              : "bg-white hover:bg-slate-50 text-slate-700 border border-slate-200"
          }`}
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div
        className={`p-5 rounded-2xl border ${
          isDark
            ? "bg-gradient-to-br from-violet-900/30 via-indigo-900/20 to-slate-900/10 border-violet-800/40"
            : "bg-gradient-to-br from-violet-50 via-indigo-50 to-white border-violet-100"
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg shrink-0 ${
              isDark
                ? "bg-violet-600/30 text-violet-300"
                : "bg-violet-600 text-white shadow-violet-500/20"
            }`}
          >
            <UserGroupIcon className="w-6 h-6" />
          </div>
          <div>
            <h2
              className={`text-xl font-bold tracking-tight ${
                isDark ? "text-white" : "text-slate-900"
              }`}
            >
              Exam Attendance Roster
            </h2>
            <p className={`text-sm mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              View students attending each scheduled exam — regular students of the section plus irregular students who selected that subject
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mt-4">
          {[
            {
              label: "Total Exams",
              value: totalExams,
              icon: BookOpenIcon,
              color: isDark ? "text-white" : "text-slate-900",
              bg: isDark ? "bg-slate-800/60 border-slate-700/50" : "bg-white/70 border-white/80",
            },
            {
              label: "Posted",
              value: postedExams,
              icon: CheckCircleIcon,
              color: "text-emerald-500",
              bg: isDark ? "bg-emerald-900/20 border-emerald-900/30" : "bg-emerald-50 border-emerald-100",
            },
            {
              label: "Total Student Slots",
              value: totalStudentSlots,
              icon: AcademicCapIcon,
              color: "text-violet-500",
              bg: isDark ? "bg-violet-900/20 border-violet-900/30" : "bg-violet-50 border-violet-100",
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className={`${stat.bg} rounded-xl p-3 text-center border flex flex-col items-center gap-1`}
              >
                <Icon className={`w-4 h-4 ${stat.color} opacity-60`} />
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                <p className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {stat.label}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Exam search */}
        <div className="relative flex-1 min-w-0">
          <BookOpenIcon
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
              isDark ? "text-slate-500" : "text-slate-400"
            }`}
          />
          <input
            type="text"
            placeholder="Search subject or section…"
            value={searchExam}
            onChange={(e) => setSearchExam(e.target.value)}
            className={`w-full pl-9 pr-9 py-2.5 rounded-xl text-sm border outline-none transition-all focus:ring-2 focus:ring-violet-500/40 ${
              isDark
                ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
            }`}
          />
          {searchExam && (
            <button
              onClick={() => setSearchExam("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <XMarkIcon className="w-4 h-4 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>

        {/* Student search */}
        <div className="relative flex-1 min-w-0">
          <MagnifyingGlassIcon
            className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
              isDark ? "text-slate-500" : "text-slate-400"
            }`}
          />
          <input
            type="text"
            placeholder="Search student name / ID / email…"
            value={searchStudent}
            onChange={(e) => setSearchStudent(e.target.value)}
            className={`w-full pl-9 pr-9 py-2.5 rounded-xl text-sm border outline-none transition-all focus:ring-2 focus:ring-violet-500/40 ${
              isDark
                ? "bg-slate-800 border-slate-700 text-white placeholder:text-slate-500"
                : "bg-white border-slate-200 text-slate-900 placeholder:text-slate-400"
            }`}
          />
          {searchStudent && (
            <button
              onClick={() => setSearchStudent("")}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <XMarkIcon className="w-4 h-4 text-slate-400 hover:text-slate-600" />
            </button>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filter */}
          <div
            className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${
              isDark ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200"
            }`}
          >
            <FunnelIcon className={`w-3.5 h-3.5 ml-1.5 ${isDark ? "text-slate-500" : "text-slate-400"}`} />
            {[
              { id: "all", label: "All" },
              { id: "posted", label: "Posted" },
              { id: "draft", label: "Draft" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterStatus(f.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  filterStatus === f.id
                    ? "bg-violet-600 text-white shadow"
                    : isDark
                    ? "text-slate-400 hover:text-white hover:bg-slate-700"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Type filter */}
          <div
            className={`flex items-center gap-1 p-1 rounded-xl border text-xs ${
              isDark ? "bg-slate-800 border-slate-700" : "bg-slate-100 border-slate-200"
            }`}
          >
            {[
              { id: "all", label: "All Types" },
              { id: "regular", label: "Regular" },
              { id: "irregular", label: "Irregular" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterType(f.id)}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                  filterType === f.id
                    ? "bg-indigo-600 text-white shadow"
                    : isDark
                    ? "text-slate-400 hover:text-white hover:bg-slate-700"
                    : "text-slate-500 hover:text-slate-800 hover:bg-white"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              isDark
                ? "border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                : "border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Expand All
          </button>
          <button
            onClick={collapseAll}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              isDark
                ? "border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                : "border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Collapse All
          </button>
          <button
            onClick={fetchData}
            title="Refresh"
            className={`p-1.5 rounded-xl border transition-all ${
              isDark
                ? "border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                : "border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <ArrowPathIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Count */}
      <p className={`text-xs font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>
        Showing {filteredExams.length} exam{filteredExams.length !== 1 ? "s" : ""}
        {(searchStudent || filterType !== "all")
          ? ` · ${filteredExams.reduce((a, e) => a + (e.displayStudents?.length ?? 0), 0)} student(s) matched`
          : ""}
      </p>

      {/* Exam Cards */}
      <div className="space-y-3">
        {filteredExams.length === 0 ? (
          <div
            className={`flex flex-col items-center justify-center py-16 rounded-2xl border ${
              isDark ? "border-slate-800 bg-slate-800/30" : "border-slate-200 bg-slate-50"
            }`}
          >
            <BookOpenIcon
              className={`w-12 h-12 mb-3 ${isDark ? "text-slate-700" : "text-slate-300"}`}
            />
            <p className={`text-sm font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              No exams match your filters
            </p>
          </div>
        ) : (
          filteredExams.map((exam) => {
            const isExpanded = !!expandedExams[exam.exam_id];
            const students = exam.displayStudents ?? exam.students;
            const regCount = students.filter((s) => s.student_type === "regular").length;
            const irrCount = students.filter((s) => s.student_type === "irregular").length;
            const statusStyle = STATUS_STYLES[exam.status] || STATUS_STYLES.draft;

            return (
              <div
                key={exam.exam_id}
                className={`rounded-2xl border overflow-hidden transition-all duration-200 ${
                  isDark ? "border-slate-700/60 bg-slate-800/40" : "border-slate-200 bg-white"
                } ${isExpanded ? "shadow-lg" : "hover:shadow-sm"}`}
              >
                {/* Exam Header */}
                <div
                  className={`flex items-start justify-between gap-3 px-5 py-4 cursor-pointer transition-colors ${
                    isExpanded
                      ? isDark
                        ? "bg-violet-900/20"
                        : "bg-violet-50"
                      : isDark
                      ? "hover:bg-slate-700/20"
                      : "hover:bg-slate-50"
                  }`}
                  onClick={() => toggleExam(exam.exam_id)}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {/* Subject icon */}
                    <div
                      className={`mt-0.5 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-[10px] font-black ${
                        isExpanded
                          ? isDark
                            ? "bg-violet-600/30 text-violet-300"
                            : "bg-violet-600 text-white shadow-sm shadow-violet-500/30"
                          : isDark
                          ? "bg-slate-700 text-slate-400"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {exam.subject_code?.slice(0, 4) || "EX"}
                    </div>

                    <div className="min-w-0 flex-1">
                      {/* Subject name + section */}
                      <div className="flex flex-wrap items-center gap-2">
                        <p className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-900"}`}>
                          {exam.subject_name}
                        </p>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                            isDark ? statusStyle.dark : statusStyle.light
                          }`}
                        >
                          {exam.status}
                        </span>
                      </div>

                      {/* Meta row */}
                      <div
                        className={`flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs ${
                          isDark ? "text-slate-400" : "text-slate-500"
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          <AcademicCapIcon className="w-3.5 h-3.5" />
                          {exam.section_name}
                        </span>
                        <span className="flex items-center gap-1">
                          <CalendarDaysIcon className="w-3.5 h-3.5" />
                          {exam.exam_date}
                        </span>
                        <span className="flex items-center gap-1">
                          <ClockIcon className="w-3.5 h-3.5" />
                          {exam.start_time} – {exam.end_time}
                        </span>
                        <span className="flex items-center gap-1">
                          <BuildingOffice2Icon className="w-3.5 h-3.5" />
                          {exam.room}
                        </span>
                      </div>

                      {/* Student type pills */}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {regCount > 0 && (
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-50 text-blue-600"
                            }`}
                          >
                            {regCount} Regular
                          </span>
                        )}
                        {irrCount > 0 && (
                          <span
                            className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                              isDark ? "bg-amber-900/40 text-amber-300" : "bg-amber-50 text-amber-600"
                            }`}
                          >
                            {irrCount} Irregular
                          </span>
                        )}
                        {students.length === 0 && (
                          <span className={`text-[11px] ${isDark ? "text-slate-600" : "text-slate-400"}`}>
                            No students
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side: count + expand + print */}
                  <div
                    className="flex items-center gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        isDark ? "text-slate-300" : "text-slate-700"
                      }`}
                    >
                      {students.length}
                    </span>
                    <button
                      onClick={() => handlePrint(exam)}
                      title="Print attendance sheet"
                      className={`p-1.5 rounded-lg transition-all ${
                        isDark
                          ? "text-slate-500 hover:text-violet-300 hover:bg-violet-900/30"
                          : "text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                      }`}
                    >
                      <PrinterIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleExam(exam.exam_id)}
                      className={`p-1.5 rounded-lg transition-all ${
                        isDark
                          ? "text-slate-500 hover:text-white hover:bg-slate-700"
                          : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {isExpanded ? (
                        <ChevronUpIcon className={`w-4 h-4 ${isDark ? "text-violet-400" : "text-violet-600"}`} />
                      ) : (
                        <ChevronDownIcon className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Student Table */}
                {isExpanded && (
                  <div
                    className={`border-t overflow-x-auto ${
                      isDark ? "border-slate-700/60" : "border-slate-200"
                    }`}
                  >
                    {students.length === 0 ? (
                      <div
                        className={`px-6 py-10 text-center text-sm ${
                          isDark ? "text-slate-600" : "text-slate-400"
                        }`}
                      >
                        No students will take this exam
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr
                            className={`text-[11px] uppercase tracking-wider font-bold ${
                              isDark
                                ? "bg-slate-900/40 text-slate-500"
                                : "bg-slate-50 text-slate-400"
                            }`}
                          >
                            <th className="text-left px-5 py-3 w-10">#</th>
                            <th className="text-left px-5 py-3">Student Name</th>
                            <th className="text-left px-4 py-3">Student ID</th>
                            <th className="text-left px-4 py-3">Type</th>
                            <th className="text-left px-4 py-3">Signature</th>
                          </tr>
                        </thead>
                        <tbody>
                          {students.map((student, idx) => (
                            <tr
                              key={student.id}
                              className={`border-t transition-colors ${
                                isDark
                                  ? "border-slate-700/40 hover:bg-slate-700/20"
                                  : "border-slate-100 hover:bg-slate-50/80"
                              }`}
                            >
                              <td
                                className={`px-5 py-3 text-xs font-medium ${
                                  isDark ? "text-slate-600" : "text-slate-400"
                                }`}
                              >
                                {idx + 1}
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                                      student.student_type === "irregular"
                                        ? isDark
                                          ? "bg-amber-900/40 text-amber-300"
                                          : "bg-amber-100 text-amber-700"
                                        : isDark
                                        ? "bg-blue-900/40 text-blue-300"
                                        : "bg-blue-100 text-blue-700"
                                    }`}
                                  >
                                    {(student.name || "?")
                                      .split(" ")
                                      .map((n) => n[0])
                                      .slice(0, 2)
                                      .join("")
                                      .toUpperCase()}
                                  </div>
                                  <span
                                    className={`font-semibold ${
                                      isDark ? "text-slate-100" : "text-slate-800"
                                    }`}
                                  >
                                    {student.name}
                                  </span>
                                </div>
                              </td>
                              <td
                                className={`px-4 py-3 font-mono text-xs ${
                                  isDark ? "text-slate-400" : "text-slate-500"
                                }`}
                              >
                                {student.student_id || (
                                  <span className="italic opacity-40">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                                    student.student_type === "irregular"
                                      ? isDark
                                        ? "bg-amber-900/30 text-amber-300 border-amber-800/50"
                                        : "bg-amber-50 text-amber-700 border-amber-200"
                                      : isDark
                                      ? "bg-blue-900/30 text-blue-300 border-blue-800/50"
                                      : "bg-blue-50 text-blue-700 border-blue-200"
                                  }`}
                                >
                                  <TagIcon className="w-2.5 h-2.5" />
                                  {student.student_type === "irregular" ? "Irregular" : "Regular"}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <div
                                  className={`h-7 w-28 rounded border-b ${
                                    isDark ? "border-slate-600" : "border-slate-300"
                                  }`}
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
