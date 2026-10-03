import React, { useState, useEffect, useRef } from "react";
import { 
  UserIcon, 
  ArrowUpTrayIcon, 
  ArrowDownTrayIcon, 
  ExclamationTriangleIcon, 
  ArrowPathIcon, 
  UsersIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  BookOpenIcon,
  AcademicCapIcon,
  EyeIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  CheckCircleIcon,
  IdentificationIcon
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import { useToast } from "../context/ToastContext";
import api from "../api";
import ConfirmationModal from "./ConfirmationModal";

export default function StudentImport({ isGenerating }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { showSuccess, showError } = useToast();

  // Tab State: "directory" or "upload"
  const [activeTab, setActiveTab] = useState("directory");

  // Statistics State
  const [stats, setStats] = useState({ total: 0, regular: 0, irregular: 0 });
  const [loadingStats, setLoadingStats] = useState(false);

  // Upload & Clear State
  const [uploading, setUploading] = useState(false);
  const [clearExisting, setClearExisting] = useState(false);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [isClearAllStudentsModalOpen, setIsClearAllStudentsModalOpen] = useState(false);
  const [clearingStudents, setClearingStudents] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Student Directory State
  const [students, setStudents] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [totalStudents, setTotalStudents] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);

  // Filters State
  const [courses, setCourses] = useState([]);
  const [sections, setSections] = useState([]);
  const [selectedDept, setSelectedDept] = useState("All");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [selectedSection, setSelectedSection] = useState("All");
  const [selectedType, setSelectedType] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Enrolled Subjects Modal State (for irregular students)
  const [selectedStudentForModal, setSelectedStudentForModal] = useState(null);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch Stats
  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await api.get("/catalog/student-stats");
      setStats(res.data);
    } catch (err) {
      console.error("Error fetching student stats:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  // Fetch Courses
  const fetchCourses = async () => {
    try {
      const res = await api.get("/catalog/courses");
      setCourses(res.data || []);
    } catch (err) {
      console.error("Error loading courses:", err);
    }
  };

  // Fetch Sections when Course or Department changes
  const fetchSections = async () => {
    try {
      const params = {};
      if (selectedCourseId) {
        params.course_id = selectedCourseId;
      } else if (selectedDept && selectedDept !== "All") {
        params.department = selectedDept;
      }
      const res = await api.get("/catalog/sections", { params });
      setSections(res.data || []);
    } catch (err) {
      console.error("Error loading sections:", err);
    }
  };

  // Fetch Students Directory
  const fetchStudents = async (targetPage = page) => {
    setDirectoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDept && selectedDept !== "All") params.append("department", selectedDept);
      if (selectedCourseId) params.append("course_id", selectedCourseId);
      if (selectedSection && selectedSection !== "All") params.append("section_name", selectedSection);
      if (selectedType && selectedType !== "All") params.append("student_type", selectedType);
      if (debouncedSearch.trim()) params.append("search", debouncedSearch.trim());
      params.append("page", targetPage);
      params.append("page_size", pageSize);

      const res = await api.get(`/catalog/students?${params.toString()}`);
      setStudents(res.data.items || []);
      setTotalStudents(res.data.total || 0);
      setTotalPages(res.data.total_pages || 1);
      setPage(res.data.page || targetPage);
    } catch (err) {
      console.error("Error fetching students directory:", err);
      showError("Failed to load students directory");
    } finally {
      setDirectoryLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchCourses();
  }, []);

  useEffect(() => {
    fetchSections();
  }, [selectedDept, selectedCourseId]);

  useEffect(() => {
    fetchStudents(page);
  }, [selectedDept, selectedCourseId, selectedSection, selectedType, debouncedSearch, page, pageSize]);

  // Handle department change
  const handleDeptChange = (dept) => {
    setSelectedDept(dept);
    setSelectedCourseId("");
    setSelectedSection("All");
    setPage(1);
  };

  // Handle course change
  const handleCourseChange = (e) => {
    setSelectedCourseId(e.target.value ? Number(e.target.value) : "");
    setSelectedSection("All");
    setPage(1);
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSelectedDept("All");
    setSelectedCourseId("");
    setSelectedSection("All");
    setSelectedType("All");
    setSearchQuery("");
    setPage(1);
  };

  // Clear All Students
  const executeClearAllStudents = async () => {
    setIsClearAllStudentsModalOpen(false);
    setClearingStudents(true);
    try {
      const res = await api.post("/catalog/clear-students");
      showSuccess(res.data.message);
      fetchStats();
      fetchStudents(1);
    } catch (err) {
      console.error(err);
      showError(err.response?.data?.detail || "Failed to clear student accounts");
    } finally {
      setClearingStudents(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const downloadDummyStudents = async () => {
    try {
      const response = await api.get("/catalog/download-students-dummy", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "dummy_students.xlsx");
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      showSuccess("Dummy student list with auto-assigned subjects downloaded successfully!");
    } catch (err) {
      showError("Failed to download dummy student file");
    }
  };

  const executeImport = async () => {
    setIsImportConfirmOpen(false);
    setUploading(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("clear_existing", clearExisting.toString());

    try {
      const res = await api.post("/catalog/upload-students", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      showSuccess(res.data.message);
      setImportResult(res.data.details);
      setFile(null);
      fetchStats();
      fetchStudents(1);
      setActiveTab("directory");
    } catch (err) {
      console.error(err);
      showError(err.response?.data?.detail || "An error occurred during student import");
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      showError("Please select an Excel file to import");
      return;
    }

    if (isGenerating) {
      showError("Cannot upload student list while schedule generation is ongoing");
      return;
    }

    if (clearExisting) {
      setIsImportConfirmOpen(true);
    } else {
      executeImport();
    }
  };

  // Filter courses by selected department
  const filteredCourses = courses.filter((c) => {
    if (selectedDept === "All") return true;
    return c.category === selectedDept;
  });

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header Panel */}
      <div className={`p-4 sm:p-6 rounded-2xl border ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-100"}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-600 text-white shadow-md shadow-blue-500/20"}`}>
              <UsersIcon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className={`text-lg sm:text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Student Accounts & Directory
              </h2>
              <p className={`text-xs sm:text-sm mt-0.5 sm:mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                View students grouped by Course & Section, auto-enrolled irregular subjects, and upload Excel spreadsheets.
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 shrink-0 w-full sm:w-auto">
            <button
              onClick={() => {
                fetchStats();
                fetchStudents(page);
              }}
              disabled={loadingStats || directoryLoading}
              className={`w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold border transition duration-300 ${
                isDark 
                  ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700" 
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <ArrowPathIcon className={`w-4 h-4 ${loadingStats || directoryLoading ? "animate-spin" : ""}`} />
              Refresh Data
            </button>

            <button
              onClick={() => setIsClearAllStudentsModalOpen(true)}
              disabled={clearingStudents || isGenerating || stats.total === 0}
              className="w-full sm:w-auto justify-center flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              title={stats.total === 0 ? "No student accounts to delete" : "Delete all student accounts"}
            >
              {clearingStudents ? (
                <ArrowPathIcon className="w-4 h-4 animate-spin" />
              ) : (
                <TrashIcon className="w-4 h-4" />
              )}
              Clear All Students
            </button>
          </div>
        </div>
      </div>

      {/* Student Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-5">
        {[
          { label: "Total Enrolled Students", value: stats.total, icon: UsersIcon, color: "text-blue-500 bg-blue-500/10" },
          { label: "Regular Students", value: stats.regular, icon: UserIcon, color: "text-emerald-500 bg-emerald-500/10" },
          { label: "Irregular Students (Auto-Enrolled)", value: stats.irregular, icon: IdentificationIcon, color: "text-purple-500 bg-purple-500/10" },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              className={`p-4 sm:p-5 rounded-2xl border shadow-sm flex items-center justify-between transition-colors duration-300 ${
                isDark ? "bg-slate-800/40 border-slate-800" : "bg-white border-slate-200"
              }`}
            >
              <div className="space-y-0.5 sm:space-y-1">
                <p className={`text-[11px] sm:text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {card.label}
                </p>
                <p className={`text-xl sm:text-2xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  {loadingStats ? "..." : Number(card.value).toLocaleString()}
                </p>
              </div>
              <div className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0 ${card.color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Primary Tab Navigation */}
      <div className="flex border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("directory")}
          className={`pb-3 px-5 text-sm sm:text-base font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === "directory"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <UsersIcon className="w-5 h-5" />
          Student Directory by Course & Section
          <span className={`ml-1.5 px-2 py-0.5 text-xs rounded-full ${
            activeTab === "directory"
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
          }`}>
            {totalStudents.toLocaleString()}
          </span>
        </button>

        <button
          onClick={() => setActiveTab("upload")}
          className={`pb-3 px-5 text-sm sm:text-base font-bold transition-all border-b-2 flex items-center gap-2 ${
            activeTab === "upload"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <ArrowUpTrayIcon className="w-5 h-5" />
          Excel Upload & Template
        </button>
      </div>

      {/* TAB 1: STUDENT DIRECTORY */}
      {activeTab === "directory" && (
        <div className="space-y-6">
          {/* Filters Bar */}
          <div className={`p-4 sm:p-5 rounded-2xl border shadow-sm ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-white border-slate-200"}`}>
            <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <FunnelIcon className="w-4 h-4 text-blue-500" />
                <span className={`text-xs sm:text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Filter Directory
                </span>
              </div>
              <button
                onClick={handleResetFilters}
                className={`text-xs font-semibold underline self-start xl:self-auto ${isDark ? "text-blue-400 hover:text-blue-300" : "text-blue-600 hover:text-blue-800"}`}
              >
                Reset All Filters
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
              {/* Department Selector */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Department
                </label>
                <select
                  value={selectedDept}
                  onChange={(e) => handleDeptChange(e.target.value)}
                  className={`w-full p-2.5 rounded-xl text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
                    isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-gray-50 border-gray-200 text-gray-800"
                  }`}
                >
                  <option value="All">All Departments</option>
                  <option value="College">College</option>
                  <option value="SHS">Senior High School</option>
                </select>
              </div>

              {/* Course / Strand Selector */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {selectedDept === "SHS" ? "Strand" : "Course"}
                </label>
                <select
                  value={selectedCourseId}
                  onChange={handleCourseChange}
                  className={`w-full p-2.5 rounded-xl text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
                    isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-gray-50 border-gray-200 text-gray-800"
                  }`}
                >
                  <option value="">All Courses / Strands</option>
                  {filteredCourses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Section Selector */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Section
                </label>
                <select
                  value={selectedSection}
                  onChange={(e) => {
                    setSelectedSection(e.target.value);
                    setPage(1);
                  }}
                  className={`w-full p-2.5 rounded-xl text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
                    isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-gray-50 border-gray-200 text-gray-800"
                  }`}
                >
                  <option value="All">All Sections</option>
                  <option value="Irregular">Irregular</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Student Type */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Student Type
                </label>
                <select
                  value={selectedType}
                  onChange={(e) => {
                    setSelectedType(e.target.value);
                    setPage(1);
                  }}
                  className={`w-full p-2.5 rounded-xl text-xs sm:text-sm font-medium border transition-colors cursor-pointer ${
                    isDark ? "bg-slate-900 border-slate-700 text-white" : "bg-gray-50 border-gray-200 text-gray-800"
                  }`}
                >
                  <option value="All">All Types</option>
                  <option value="regular">Regular Students</option>
                  <option value="irregular">Irregular Students</option>
                </select>
              </div>

              {/* Search Box */}
              <div>
                <label className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Search Student
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search ID (02000...), Name, Email..."
                    className={`w-full pl-8 pr-3 py-2.5 rounded-xl text-xs sm:text-sm border transition-colors ${
                      isDark ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500" : "bg-gray-50 border-gray-200 text-gray-800 placeholder-gray-400"
                    }`}
                  />
                  <MagnifyingGlassIcon className="w-4 h-4 text-gray-400 absolute left-2.5 top-3" />
                </div>
              </div>
            </div>
          </div>

          {/* Directory Table */}
          <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-white border-slate-200"}`}>
            <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className={`text-xs sm:text-sm font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                  Showing {students.length > 0 ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, totalStudents)} of {totalStudents.toLocaleString()} Students
                </span>
                {directoryLoading && <ArrowPathIcon className="w-4 h-4 text-blue-500 animate-spin" />}
              </div>

              {/* Page Size Selector */}
              <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
                <span>Show:</span>
                {[25, 50, 100].map((size) => (
                  <button
                    key={size}
                    onClick={() => {
                      setPageSize(size);
                      setPage(1);
                    }}
                    className={`px-2.5 py-1 rounded-lg border transition-all ${
                      pageSize === size
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs font-bold"
                        : isDark
                          ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                          : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            <div className="w-full min-w-0">
              <div className="divide-y divide-gray-100 dark:divide-slate-800 md:hidden">
                {directoryLoading && students.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400">
                    <ArrowPathIcon className="mx-auto mb-2 h-8 w-8 animate-spin text-blue-500" />
                    Loading student records...
                  </div>
                ) : students.length === 0 ? (
                  <div className="py-12 text-center text-sm text-gray-400">No students found matching the selected filters.</div>
                ) : students.map((student) => {
                  const isIrregular = student.student_type === "irregular";
                  const enrolledCount = student.enrolled_subjects?.length || 0;
                  return (
                    <article key={student.id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="break-words font-bold text-gray-900 dark:text-white">{student.name}</h3>
                          <p className="mt-0.5 break-all font-mono text-xs text-gray-500">{student.email}</p>
                          <p className={`mt-1 inline-flex rounded-md px-2 py-1 font-mono text-xs font-bold ${isDark ? "bg-slate-800 text-blue-400" : "bg-blue-50 text-blue-700"}`}>
                            {student.student_id || "No student ID"}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${isIrregular ? "bg-purple-500/10 text-purple-600 dark:text-purple-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"}`}>
                          {student.student_type}
                        </span>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                        <div className="min-w-0">
                          <dt className="text-xs font-semibold text-gray-500">Department</dt>
                          <dd className="mt-0.5 break-words">{student.department || "-"}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs font-semibold text-gray-500">Course</dt>
                          <dd className="mt-0.5 break-words">{student.course_name || "-"}</dd>
                        </div>
                        <div className="col-span-2 min-w-0">
                          <dt className="text-xs font-semibold text-gray-500">Section</dt>
                          <dd className="mt-0.5 break-words">
                            {isIrregular
                              ? `${student.assigned_sections?.length || "Multiple"} different section${student.assigned_sections?.length === 1 ? "" : "s"}`
                              : student.section_name || "-"}
                          </dd>
                        </div>
                      </dl>
                      {isIrregular ? (
                        <button
                          onClick={() => setSelectedStudentForModal(student)}
                          className="min-h-11 w-full rounded-xl border border-purple-200 bg-purple-50 px-3 text-sm font-bold text-purple-700 dark:border-purple-500/30 dark:bg-purple-600/30 dark:text-purple-300"
                        >
                          <BookOpenIcon className="mr-1.5 inline h-4 w-4" />
                          View {enrolledCount} Enrolled Subject{enrolledCount === 1 ? "" : "s"}
                          <EyeIcon className="ml-1.5 inline h-4 w-4 opacity-70" />
                        </button>
                      ) : (
                        <p className="text-xs italic text-gray-500 dark:text-gray-400">Regular Section Curriculum</p>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left border-collapse text-xs sm:text-sm">
                <thead>
                  <tr className={`border-b text-[11px] uppercase tracking-wider font-bold ${
                    isDark ? "bg-slate-900/60 border-slate-700 text-slate-400" : "bg-gray-50 border-gray-200 text-gray-600"
                  }`}>
                    <th className="py-3.5 px-4">ID</th>
                    <th className="py-3.5 px-4">Student Name & Email</th>
                    <th className="py-3.5 px-4">Department & Course</th>
                    <th className="py-3.5 px-4">Section</th>
                    <th className="py-3.5 px-4">Type</th>
                    <th className="py-3.5 px-4 text-center">Enrolled Subjects</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-slate-800 text-slate-300" : "divide-gray-100 text-gray-700"}`}>
                  {directoryLoading && students.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-gray-400">
                        <ArrowPathIcon className="w-8 h-8 text-blue-500 animate-spin mx-auto mb-2" />
                        Loading student records...
                      </td>
                    </tr>
                  ) : students.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-16 text-center text-gray-400">
                        <UserIcon className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        No students found matching the selected filters.
                      </td>
                    </tr>
                  ) : (
                    students.map((student) => {
                      const isIrregular = student.student_type === "irregular";
                      const enrolledCount = student.enrolled_subjects?.length || 0;

                      return (
                        <tr
                          key={student.id}
                          className={`transition-colors ${
                            isDark ? "hover:bg-slate-700/30" : "hover:bg-blue-50/40"
                          }`}
                        >
                          {/* Student ID */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-md font-mono text-xs font-bold tracking-wider ${
                              isDark ? "bg-slate-800 text-blue-400 border border-blue-900/40" : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}>
                              {student.student_id || "N/A"}
                            </span>
                          </td>

                          {/* Name & Email */}
                          <td className="py-3.5 px-4">
                            <div className="font-bold text-gray-900 dark:text-white">
                              {student.name}
                            </div>
                            <div className="text-[11px] font-mono text-gray-400 dark:text-gray-500">
                              {student.email}
                            </div>
                          </td>

                          {/* Department & Course */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                student.department === "SHS"
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
                                  : "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300"
                              }`}>
                                {student.department || "-"}
                              </span>
                              <span className="font-medium text-xs">
                                {student.course_name || "-"}
                              </span>
                            </div>
                          </td>

                          {/* Section */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            {isIrregular ? (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 w-fit">
                                  Irregular
                                </span>
                                {student.assigned_sections && student.assigned_sections.length > 0 ? (
                                  <span className="text-[11px] font-mono text-purple-600 dark:text-purple-400 font-medium">
                                    {student.assigned_sections.length} different sections
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-gray-400">Multiple sections</span>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                                {student.section_name}
                              </span>
                            )}
                          </td>

                          {/* Student Type */}
                          <td className="py-3.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${
                              isIrregular
                                ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${isIrregular ? "bg-purple-500" : "bg-emerald-500"}`}></span>
                              {student.student_type}
                            </span>
                          </td>

                          {/* Enrolled Subjects Action */}
                          <td className="py-3.5 px-4 whitespace-nowrap text-center">
                            {isIrregular ? (
                              <button
                                onClick={() => setSelectedStudentForModal(student)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs transition-all ${
                                  isDark 
                                    ? "bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/30" 
                                    : "bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200"
                                }`}
                              >
                                <BookOpenIcon className="w-4 h-4" />
                                <span>{enrolledCount} {enrolledCount === 1 ? "Subject" : "Subjects"}</span>
                                <EyeIcon className="w-3.5 h-3.5 ml-0.5 opacity-70" />
                              </button>
                            ) : (
                              <span className="text-[11px] text-gray-400 dark:text-gray-500 italic">
                                Regular Section Curriculum
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                  Page {page} of {totalPages} ({totalStudents.toLocaleString()} total students)
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1 || directoryLoading}
                    className={`p-2 rounded-xl border transition-all ${
                      page === 1
                        ? "opacity-40 cursor-not-allowed border-gray-200 dark:border-gray-700 text-gray-400"
                        : isDark
                          ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <ChevronLeftIcon className="w-4 h-4" />
                  </button>

                  {/* Page indicator pills */}
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-bold ${
                    isDark ? "bg-slate-800 text-blue-400 border border-slate-700" : "bg-blue-50 text-blue-700 border border-blue-200"
                  }`}>
                    {page} / {totalPages}
                  </span>

                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages || directoryLoading}
                    className={`p-2 rounded-xl border transition-all ${
                      page === totalPages
                        ? "opacity-40 cursor-not-allowed border-gray-200 dark:border-gray-700 text-gray-400"
                        : isDark
                          ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                          : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <ChevronRightIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: EXCEL UPLOAD & TEMPLATE */}
      {activeTab === "upload" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8">
          {/* Guidance Column */}
          <div className={`lg:col-span-5 p-4 sm:p-6 rounded-2xl border ${isDark ? "bg-slate-800/30 border-slate-800" : "bg-white border-slate-200"} space-y-4 sm:space-y-5`}>
            <h3 className={`text-sm sm:text-base font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
              Student Spreadsheet Guidelines
            </h3>
            <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Please format your Excel sheet with the following column headers:
            </p>
            <ul className={`text-xs space-y-2.5 sm:space-y-3 pl-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">•</span>
                <span><strong>ID</strong> (e.g. <code>02000352553</code>) — student ID strictly formatted as <code>02000</code> + 6 digits (11 characters total). Also accepted as <code>STUDENT ID</code> or <code>STUDENT NUMBER</code>.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">•</span>
                <span><strong>NAME</strong> (e.g. Richard Santos) — student's full display name.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">•</span>
                <span><strong>COURSE</strong> (e.g. BSIT, BSCS, STEM) — matching the school's course or SHS strand.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">•</span>
                <span><strong>SECTION</strong> — for regular students (e.g. <code>BSIT 3-201</code>); leave blank or set <code>IRREGULAR</code> for irregular students.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">•</span>
                <span><strong>SCHOOL EMAIL</strong> (e.g. <code>santos_02000352553_@ortigas-cainta.sti.edu</code>).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-blue-500 font-bold">•</span>
                <span><strong>STATUS</strong> (<code>regular</code> or <code>irregular</code>).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">•</span>
                <span><strong>SUBJECT 1, SUBJECT 2, ... SUBJECT N</strong> — for irregular students: the subject name or code they are taking.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 font-bold">•</span>
                <span><strong>SECTION 1, SECTION 2, ... SECTION N</strong> — for irregular students: the specific section where each subject is taken (paired with SUBJECT 1, SUBJECT 2, etc.). Each subject can be from a <em>different section</em>. If omitted, the system auto-assigns the best-matching section.</span>
              </li>
            </ul>

            <div className="p-3.5 sm:p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-blue-400 leading-relaxed">
              <strong>Default Password:</strong> All imported students can log in immediately using their email and default password: <code className="font-bold underline">student123</code>.
            </div>

            <div className="pt-2">
              <button
                onClick={downloadDummyStudents}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-xs sm:text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition duration-300 shadow-sm shadow-blue-600/10"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Download Dummy Student List (.xlsx)
              </button>
            </div>
          </div>

          {/* File Drop and Process Column */}
          <div className={`lg:col-span-7 p-4 sm:p-6 rounded-2xl border ${isDark ? "bg-slate-800/30 border-slate-800" : "bg-white border-slate-200"} flex flex-col justify-between`}>
            <div className="space-y-4 sm:space-y-5">
              <h3 className={`text-sm sm:text-base font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                Upload Student Spreadsheet
              </h3>

              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById("student-file-selector").click()}
                className={`border-2 border-dashed rounded-2xl p-5 sm:p-8 text-center cursor-pointer transition-all duration-300 ${
                  dragOver 
                    ? "border-blue-500 bg-blue-500/5" 
                    : isDark 
                      ? "border-slate-700 hover:border-slate-600 hover:bg-slate-800/10" 
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <input
                  id="student-file-selector"
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="flex flex-col items-center justify-center gap-3">
                  <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                    <ArrowUpTrayIcon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className={`text-xs sm:text-sm font-bold ${isDark ? "text-white" : "text-slate-900"} break-all`}>
                      {file ? file.name : "Drag & Drop Student Excel File here"}
                    </p>
                    <p className={`text-[11px] sm:text-xs mt-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                      {file ? `${(file.size / 1024).toFixed(1)} KB` : "or click to select file"}
                    </p>
                  </div>
                </div>
              </div>

              {/* Options Toggle */}
              <div className={`p-3.5 sm:p-4 rounded-xl border transition-all duration-300 ${
                clearExisting 
                  ? isDark 
                    ? "bg-red-500/10 border-red-500/20 text-red-300" 
                    : "bg-red-50 border-red-100 text-red-700" 
                  : isDark 
                    ? "bg-slate-800/50 border-slate-700 text-slate-400" 
                    : "bg-slate-50 border-slate-100 text-slate-500"
              }`}>
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={clearExisting}
                    onChange={(e) => setClearExisting(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <div className="text-xs">
                    <span className="font-bold block mb-0.5">Clear existing student accounts before import</span>
                    <span>Check this to completely wipe all existing student user accounts and replace them with this list. <strong>Warning: This action is irreversible!</strong></span>
                  </div>
                </label>
              </div>
            </div>

            <div className="pt-5 sm:pt-6">
              <button
                onClick={handleImport}
                disabled={uploading || !file || isGenerating}
                className={`w-full py-3 sm:py-3.5 rounded-xl font-semibold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 ${
                  uploading || !file || isGenerating
                    ? isDark 
                      ? "bg-slate-700 text-slate-500 cursor-not-allowed" 
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/10"
                }`}
              >
                {uploading ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Importing Students...
                  </>
                ) : (
                  <>
                    <ArrowUpTrayIcon className="w-4 h-4" />
                    Upload & Import Students
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Irregular Student Enrolled Subjects Modal */}
      {selectedStudentForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className={`max-w-2xl w-full rounded-2xl border shadow-2xl overflow-hidden ${
            isDark ? "bg-slate-900 border-slate-800 text-white" : "bg-white border-gray-200 text-gray-900"
          }`}>
            <div className="p-5 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <IdentificationIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-base sm:text-lg">
                    {selectedStudentForModal.name}
                  </h3>
                  <p className="text-xs font-mono text-purple-400">
                    ID: {selectedStudentForModal.student_id} • {selectedStudentForModal.course_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentForModal(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
              <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 text-xs text-purple-800 dark:text-purple-300 flex items-start gap-2">
                <CheckCircleIcon className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />
                <span>
                  <strong>Auto-Enrolled from Excel Import:</strong> These subjects were specified in the admin's uploaded student spreadsheet. The student is automatically scheduled for these exams without needing to manually pick subjects from different sections.
                </span>
              </div>

              {selectedStudentForModal.enrolled_subjects?.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  No individual subjects enrolled for this student.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs font-semibold uppercase tracking-wider text-gray-400 px-1">
                    Enrolled Subjects ({selectedStudentForModal.enrolled_subjects.length})
                  </div>
                  <div className="divide-y divide-gray-100 dark:divide-slate-800 border rounded-xl overflow-hidden">
                    {selectedStudentForModal.enrolled_subjects.map((sub, idx) => (
                      <div key={idx} className={`p-3 flex items-center justify-between gap-3 ${
                        isDark ? "bg-slate-800/40" : "bg-gray-50"
                      }`}>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              {sub.code || `SUBJ-${idx + 1}`}
                            </span>
                            <span className="font-bold text-xs sm:text-sm">
                              {sub.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] pl-1 flex-wrap">
                            <span className="text-gray-500 capitalize">Category: {sub.category}</span>
                            {sub.section_name && sub.section_name !== "-" && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-semibold">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                                {sub.section_name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className="text-xs font-semibold px-2 py-1 rounded-md bg-gray-200/60 dark:bg-slate-700 text-gray-700 dark:text-gray-300">
                            {sub.duration_minutes ? `${sub.duration_minutes} mins` : "Standard"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-slate-900/50 flex justify-end">
              <button
                onClick={() => setSelectedStudentForModal(null)}
                className="px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-gray-200 hover:bg-gray-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-gray-800 dark:text-gray-200 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Import */}
      <ConfirmationModal
        isOpen={isImportConfirmOpen}
        onCancel={() => setIsImportConfirmOpen(false)}
        onConfirm={executeImport}
        title="Confirm Wiping Student Database"
        message="Are you absolutely sure you want to clear all existing student accounts and replace them with this list? All irregular student exam selections and student rescheduling requests will also be deleted."
        confirmText="Yes, Import List"
        confirmLabel="Yes, Import List"
        cancelLabel="Cancel"
        isDanger={true}
      />

      {/* Confirmation Modal for Clearing All Students */}
      <ConfirmationModal
        isOpen={isClearAllStudentsModalOpen}
        onCancel={() => setIsClearAllStudentsModalOpen(false)}
        onConfirm={executeClearAllStudents}
        title="Delete All Student Accounts?"
        message={`Are you sure you want to permanently delete all ${stats.total} student account(s)? This will also delete their irregular exam selections and rescheduling requests. This action cannot be undone.`}
        confirmText="Yes, Delete All Students"
        confirmLabel="Yes, Delete All Students"
        cancelLabel="Cancel"
        isDanger={true}
      />
    </div>
  );
}
