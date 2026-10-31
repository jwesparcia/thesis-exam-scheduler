import React, { useState, useEffect, useMemo, useDeferredValue, useCallback } from "react";
import {
  MagnifyingGlassIcon,
  UserGroupIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInitials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((n) => n[0] || "")
    .join("")
    .toUpperCase();
}

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

  // Deferred search queries keep input typing lag-free even across 3,000+ exams
  const deferredSearchExam = useDeferredValue(searchExam);
  const deferredSearchStudent = useDeferredValue(searchStudent);

  // Pagination & expansion state (cards start collapsed so 2M+ DOM nodes are never mounted at once)
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [expandedExams, setExpandedExams] = useState({});

  // Avoid mounting duplicate hidden mobile + desktop tables simultaneously
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : true
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e) => setIsDesktop(e.matches);
    if (mq.addEventListener) {
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/catalog/exams/attendance-roster", {
        params: { compact: true },
      });
      const payload = res.data;

      let hydratedExams = [];
      if (payload && payload.compact && payload.students_by_id && Array.isArray(payload.exams)) {
        const studentLookup = {};
        for (const [idKey, s] of Object.entries(payload.students_by_id)) {
          studentLookup[idKey] = {
            ...s,
            _initials: getInitials(s.name),
            _search: `${s.name || ""} ${s.email || ""} ${s.student_id || ""}`.toLowerCase(),
          };
        }
        hydratedExams = payload.exams.map((exam) => {
          const students = (exam.student_ids || [])
            .map((sid) => studentLookup[String(sid)])
            .filter(Boolean);
          const regCount =
            typeof exam.regular_count === "number"
              ? exam.regular_count
              : students.reduce((acc, s) => acc + (s.student_type === "regular" ? 1 : 0), 0);
          const irrCount =
            typeof exam.irregular_count === "number"
              ? exam.irregular_count
              : students.reduce((acc, s) => acc + (s.student_type === "irregular" ? 1 : 0), 0);
          return {
            ...exam,
            students,
            regular_count: regCount,
            irregular_count: irrCount,
            _search: `${exam.subject_name || ""} ${exam.subject_code || ""} ${exam.section_name || ""} ${exam.room || ""} ${exam.course_name || ""}`.toLowerCase(),
          };
        });
      } else if (Array.isArray(payload)) {
        hydratedExams = payload.map((exam) => {
          const students = (exam.students || []).map((s) => ({
            ...s,
            _initials: getInitials(s.name),
            _search: `${s.name || ""} ${s.email || ""} ${s.student_id || ""}`.toLowerCase(),
          }));
          const regCount =
            typeof exam.regular_count === "number"
              ? exam.regular_count
              : students.reduce((acc, s) => acc + (s.student_type === "regular" ? 1 : 0), 0);
          const irrCount =
            typeof exam.irregular_count === "number"
              ? exam.irregular_count
              : students.reduce((acc, s) => acc + (s.student_type === "irregular" ? 1 : 0), 0);
          return {
            ...exam,
            students,
            regular_count: regCount,
            irregular_count: irrCount,
            _search: `${exam.subject_name || ""} ${exam.subject_code || ""} ${exam.section_name || ""} ${exam.room || ""} ${exam.course_name || ""}`.toLowerCase(),
          };
        });
      }

      setExams(hydratedExams);
      setExpandedExams({});
      setCurrentPage(1);
    } catch (err) {
      console.error("Error fetching attendance roster:", err);
      setError("Failed to load exam roster. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset pagination to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchExam, deferredSearchStudent, filterStatus, filterType, pageSize]);

  const toggleExam = useCallback((examId) => {
    setExpandedExams((prev) => ({ ...prev, [examId]: !prev[examId] }));
  }, []);

  // Derived filtered list (fast pre-indexed string checks)
  const filteredExams = useMemo(() => {
    const examQ = deferredSearchExam.trim().toLowerCase();
    const studentQ = deferredSearchStudent.trim().toLowerCase();
    const hasStudentFilter = Boolean(studentQ) || filterType !== "all";

    const result = [];
    for (let i = 0; i < exams.length; i += 1) {
      const exam = exams[i];
      if (filterStatus !== "all" && exam.status !== filterStatus) continue;
      if (examQ && !exam._search.includes(examQ)) continue;

      if (!hasStudentFilter) {
        result.push({
          ...exam,
          displayStudents: exam.students,
          displayRegCount: exam.regular_count,
          displayIrrCount: exam.irregular_count,
        });
        continue;
      }

      // Fast skip when filtering by type without student text query
      if (!studentQ) {
        if (filterType === "regular" && exam.regular_count === 0) continue;
        if (filterType === "irregular" && exam.irregular_count === 0) continue;
      }

      const displayStudents = [];
      let dReg = 0;
      let dIrr = 0;
      const srcStudents = exam.students;
      for (let j = 0; j < srcStudents.length; j += 1) {
        const s = srcStudents[j];
        if (filterType !== "all" && s.student_type !== filterType) continue;
        if (studentQ && !s._search.includes(studentQ)) continue;
        displayStudents.push(s);
        if (s.student_type === "irregular") dIrr += 1;
        else dReg += 1;
      }

      if (displayStudents.length > 0) {
        result.push({
          ...exam,
          displayStudents,
          displayRegCount: dReg,
          displayIrrCount: dIrr,
        });
      }
    }
    return result;
  }, [exams, deferredSearchExam, deferredSearchStudent, filterStatus, filterType]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredExams.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageStartIndex = (safePage - 1) * pageSize;
  const paginatedExams = useMemo(
    () => filteredExams.slice(pageStartIndex, pageStartIndex + pageSize),
    [filteredExams, pageStartIndex, pageSize]
  );

  // Expand only current page's exams to keep DOM light and responsive
  const expandCurrentPage = () => {
    setExpandedExams((prev) => {
      const next = { ...prev };
      paginatedExams.forEach((e) => {
        next[e.exam_id] = true;
      });
      return next;
    });
  };

  const collapseAll = () => setExpandedExams({});

  // Summary stats (memoized)
  const { totalExams, postedExams, totalStudentSlots } = useMemo(() => {
    let posted = 0;
    let slots = 0;
    for (let i = 0; i < exams.length; i += 1) {
      if (exams[i].status === "posted") posted += 1;
      slots += exams[i].student_count || 0;
    }
    return {
      totalExams: exams.length,
      postedExams: posted,
      totalStudentSlots: slots,
    };
  }, [exams]);

  const matchedStudentCount = useMemo(() => {
    if (!deferredSearchStudent.trim() && filterType === "all") return 0;
    return filteredExams.reduce((acc, e) => acc + (e.displayStudents?.length ?? 0), 0);
  }, [filteredExams, deferredSearchStudent, filterType]);

  // Print a single exam attendance / signature sheet
  const handlePrint = (exam) => {
    // When printing an exam card found via student search, print the full exam roster
    // unless a specific student type filter (Regular/Irregular) was selected.
    const students =
      filterType === "all" ? exam.students : (exam.displayStudents ?? exam.students);
    const fontSize = Math.max(4, Math.min(10, 420 / Math.max(students.length, 1)));
    const cellPadding = Math.max(0.5, Math.min(4, 160 / Math.max(students.length, 1)));
    const rows = students
      .map(
        (s, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${escapeHtml(s.name)}</td>
          <td>${escapeHtml(s.student_id || "—")}</td>
          <td>${s.student_type === "irregular" ? "Irregular" : "Regular"}</td>
          <td style="width:120px;border-bottom:1px solid #ccc;"></td>
        </tr>`
      )
      .join("");

    const html = `
      <!DOCTYPE html>
      <html><head><title>Attendance Roster</title>
      <style>
        @page { size: A4 landscape; margin: 5mm; }
        @media print {
          @page { size: A4 landscape; margin: 5mm; }
        }
        * { box-sizing: border-box; }
        html, body { width: 287mm; height: 200mm; margin: 0; overflow: hidden; }
        body { font-family: Arial, sans-serif; font-size: ${fontSize}px; line-height: 1.1; }
        #sheet { width: 287mm; height: 200mm; overflow: hidden; }
        #fit-content { width: 100%; transform-origin: top left; }
        h2 { margin: 0 0 2mm; font-size: 1.5em; }
        .meta { margin: 0 0 3mm; color: #555; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        th { background: #f0f0f0; text-align: left; border: 1px solid #ccc; }
        th, td { padding: ${cellPadding}px 4px; }
        td { border: 1px solid #ddd; }
        .footer { margin-top: 2mm; font-size: 0.9em; color: #888; }
        tr { break-inside: avoid; page-break-inside: avoid; }
      </style></head>
      <body>
        <main id="sheet"><div id="fit-content">
        <h2>Exam Attendance Roster</h2>
        <div class="meta">
          <strong>${escapeHtml(exam.subject_code)} — ${escapeHtml(exam.subject_name)}</strong><br/>
          Section: ${escapeHtml(exam.section_name)}${exam.is_rescheduled ? " (Rescheduled)" : ""} &nbsp;|&nbsp;
          Room: ${escapeHtml(exam.room)} &nbsp;|&nbsp;
          Date: ${escapeHtml(exam.exam_date)} &nbsp;|&nbsp;
          Time: ${escapeHtml(exam.start_time)} – ${escapeHtml(exam.end_time)}
        </div>
        <table>
          <thead>
            <tr>
              <th style="width:40px;">#</th><th>Name</th><th style="width:140px;">Student ID</th><th style="width:95px;">Type</th><th style="width:160px;">Signature</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="footer">Generated: ${escapeHtml(new Date().toLocaleString())} — Total: ${students.length} student(s)</div>
        </div></main>
        <script>
          requestAnimationFrame(() => {
            const content = document.getElementById("fit-content");
            const scale = Math.min(1, 756 / content.scrollHeight, 1084 / content.scrollWidth);
            content.style.transform = \`scale(\${scale})\`;
            window.print();
          });
        </script>
      </body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
      win.focus();
    }
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

  const autoExpandForStudentSearch = Boolean(deferredSearchStudent.trim());

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
              Section List
            </h2>
            <p className={`text-sm mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              View students attending each scheduled exam — regular students of the section plus irregular students scheduled in that specific section and subject
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 gap-3 mt-4 sm:grid-cols-3">
          {[
            {
              label: "Total Exams",
              value: totalExams.toLocaleString(),
              icon: BookOpenIcon,
              color: isDark ? "text-white" : "text-slate-900",
              bg: isDark ? "bg-slate-800/60 border-slate-700/50" : "bg-white/70 border-white/80",
            },
            {
              label: "Posted",
              value: postedExams.toLocaleString(),
              icon: CheckCircleIcon,
              color: "text-emerald-500",
              bg: isDark ? "bg-emerald-900/20 border-emerald-900/30" : "bg-emerald-50 border-emerald-100",
            },
            {
              label: "Total Student Slots",
              value: totalStudentSlots.toLocaleString(),
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
            placeholder="Search subject, section, or room…"
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

        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            aria-label="Exams per page"
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border outline-none ${
              isDark
                ? "bg-slate-800 border-slate-700 text-slate-300"
                : "bg-white border-slate-200 text-slate-600"
            }`}
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
          <button
            onClick={expandCurrentPage}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              isDark
                ? "border-slate-700 text-slate-400 hover:text-white hover:border-slate-600"
                : "border-slate-200 text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            Expand Page
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-xs font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>
          {filteredExams.length === 0
            ? "Showing 0 exams"
            : `Showing ${pageStartIndex + 1}–${Math.min(
                pageStartIndex + pageSize,
                filteredExams.length
              )} of ${filteredExams.length.toLocaleString()} exam${
                filteredExams.length !== 1 ? "s" : ""
              }`}
          {deferredSearchStudent.trim() || filterType !== "all"
            ? ` · ${matchedStudentCount.toLocaleString()} student slot(s) matched`
            : ""}
        </p>
        {totalPages > 1 && (
          <p className={`text-xs font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            Page {safePage} of {totalPages}
          </p>
        )}
      </div>

      {/* Exam Cards (Paginated) */}
      <div className="space-y-3">
        {paginatedExams.length === 0 ? (
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
          paginatedExams.map((exam) => {
            const isExpanded = Boolean(expandedExams[exam.exam_id]) || autoExpandForStudentSearch;
            const students = exam.displayStudents ?? exam.students;
            const regCount = exam.displayRegCount ?? exam.regular_count ?? 0;
            const irrCount = exam.displayIrrCount ?? exam.irregular_count ?? 0;
            const statusStyle = STATUS_STYLES[exam.status] || STATUS_STYLES.draft;

            return (
              <div
                key={exam.exam_id}
                className={`rounded-2xl border overflow-hidden transition-colors duration-150 ${
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
                      {/* Subject name + status */}
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
                        {exam.is_rescheduled && (
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                              isDark
                                ? "bg-purple-900/30 text-purple-300 border-purple-800/50"
                                : "bg-purple-50 text-purple-700 border-purple-200"
                            }`}
                          >
                            Rescheduled
                          </span>
                        )}
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

                  {/* Right side: count + print + expand */}
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

                {/* Student Table (lazy-mounted only when expanded) */}
                {isExpanded && (
                  <div
                    className={`min-w-0 border-t ${
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
                    ) : !isDesktop ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-700/40">
                        {students.map((student, idx) => (
                          <article key={student.id} className="space-y-3 p-4">
                            <div className="flex items-start gap-3">
                              <span className={`pt-1 text-xs font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                                {idx + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <h4 className={`break-words font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>
                                  {student.name}
                                </h4>
                                <p className={`mt-0.5 break-all font-mono text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                  {student.student_id || "No student ID"}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                  student.student_type === "irregular"
                                    ? isDark
                                      ? "border-amber-800/50 bg-amber-900/30 text-amber-300"
                                      : "border-amber-200 bg-amber-50 text-amber-700"
                                    : isDark
                                    ? "border-blue-800/50 bg-blue-900/30 text-blue-300"
                                    : "border-blue-200 bg-blue-50 text-blue-700"
                                }`}
                              >
                                {student.student_type === "irregular" ? "Irregular" : "Regular"}
                              </span>
                            </div>
                            <div
                              className={`ml-6 h-8 rounded border-b ${isDark ? "border-slate-600" : "border-slate-300"}`}
                              aria-label="Signature line"
                            />
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[720px] text-sm">
                          <thead>
                            <tr
                              className={`text-xs uppercase tracking-wider font-semibold border-b ${
                                isDark
                                  ? "bg-slate-800/80 border-slate-700 text-slate-300"
                                  : "bg-slate-100/90 border-slate-200 text-slate-700"
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
                                  className={`px-5 py-3 text-xs font-semibold ${
                                    isDark ? "text-slate-400" : "text-slate-500"
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
                                            ? "bg-amber-900/40 text-amber-300 border border-amber-800/40"
                                            : "bg-amber-100 text-amber-800 border border-amber-200"
                                          : isDark
                                          ? "bg-blue-900/40 text-blue-300 border border-blue-800/40"
                                          : "bg-blue-100 text-blue-800 border border-blue-200"
                                      }`}
                                    >
                                      {student._initials || getInitials(student.name)}
                                    </div>
                                    <span
                                      className={`font-semibold ${
                                        isDark ? "text-slate-100" : "text-slate-900"
                                      }`}
                                    >
                                      {student.name}
                                    </span>
                                  </div>
                                </td>
                                <td
                                  className={`px-4 py-3 font-mono text-xs font-semibold ${
                                    isDark ? "text-slate-300" : "text-slate-700"
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-2xl border ${
            isDark ? "bg-slate-800/40 border-slate-700/60" : "bg-white border-slate-200"
          }`}
        >
          <span className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Page {safePage} of {totalPages} ({filteredExams.length.toLocaleString()} exams)
          </span>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safePage <= 1}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isDark
                  ? "border-slate-700 text-slate-300 hover:bg-slate-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              First
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className={`p-1.5 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isDark
                  ? "border-slate-700 text-slate-300 hover:bg-slate-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <ChevronLeftIcon className="w-4 h-4" />
            </button>
            <span
              className={`px-3 py-1 rounded-lg text-xs font-bold ${
                isDark ? "bg-violet-900/40 text-violet-300" : "bg-violet-50 text-violet-700"
              }`}
            >
              {safePage}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className={`p-1.5 rounded-lg border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isDark
                  ? "border-slate-700 text-slate-300 hover:bg-slate-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safePage >= totalPages}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                isDark
                  ? "border-slate-700 text-slate-300 hover:bg-slate-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
