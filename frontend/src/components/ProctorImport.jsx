import React, { useState, useEffect } from "react";
import {
  UserIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  UsersIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  AcademicCapIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  XMarkIcon,
  CheckCircleIcon,
  IdentificationIcon,
  ShieldCheckIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import { useToast } from "../context/ToastContext";
import api from "../api";
import ConfirmationModal from "./ConfirmationModal";


function getDepartmentBadge(dept) {
  const d = (dept || "").toUpperCase();
  switch (d) {
    case "ICT":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800";
    case "THM":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800";
    case "BM":
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800";
    case "GE":
      return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800";
    case "AS":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-200 dark:border-purple-800";
    case "CRIM":
      return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800";
    case "COLLEGE":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800";
    case "SHS":
      return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 border border-violet-200 dark:border-violet-800";
    default:
      return "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700";
  }
}

export default function ProctorImport({ isGenerating }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { showSuccess, showError } = useToast();

  // Tab State: "directory" or "upload"
  const [activeTab, setActiveTab] = useState("directory");

  // Statistics State
  const [stats, setStats] = useState({ total: 0, college: 0, shs: 0 });
  const [loadingStats, setLoadingStats] = useState(false);

  // Upload & Clear State
  const [uploading, setUploading] = useState(false);
  const [clearExisting, setClearExisting] = useState(false);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Delete Individual State
  const [proctorToDelete, setProctorToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  // Directory State
  const [proctors, setProctors] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [totalProctors, setTotalProctors] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);

  // Filters State
  const [selectedDept, setSelectedDept] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

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
      const res = await api.get("/catalog/proctor-stats");
      setStats(res.data);
    } catch (err) {
      console.error("Error fetching proctor stats:", err);
    } finally {
      setLoadingStats(false);
    }
  };

  // Fetch Proctors Directory
  const fetchProctors = async (targetPage = page) => {
    setDirectoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedDept && selectedDept !== "All") params.append("department", selectedDept);
      if (debouncedSearch.trim()) params.append("search", debouncedSearch.trim());
      params.append("page", targetPage);
      params.append("page_size", pageSize);

      const res = await api.get(`/catalog/proctor-directory?${params.toString()}`);
      setProctors(res.data.items || []);
      setTotalProctors(res.data.total || 0);
      setTotalPages(res.data.total_pages || 1);
      setPage(res.data.page || targetPage);
    } catch (err) {
      console.error("Error fetching proctor directory:", err);
      showError("Failed to load proctor directory");
    } finally {
      setDirectoryLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    fetchProctors(page);
  }, [selectedDept, debouncedSearch, page, pageSize]);

  // Handle department change
  const handleDeptChange = (dept) => {
    setSelectedDept(dept);
    setPage(1);
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSelectedDept("All");
    setSearchQuery("");
    setPage(1);
  };

  // Clear All Proctors
  const executeClearAllProctors = async () => {
    setIsClearAllModalOpen(false);
    setClearing(true);
    try {
      const res = await api.post("/catalog/clear-proctors");
      showSuccess(res.data.message);
      fetchStats();
      fetchProctors(1);
    } catch (err) {
      console.error(err);
      showError(err.response?.data?.detail || "Failed to clear proctor accounts");
    } finally {
      setClearing(false);
    }
  };

  // Delete Individual Proctor
  const executeDeleteProctor = async () => {
    if (!proctorToDelete) return;
    const { id, name } = proctorToDelete;
    setDeletingId(id);
    try {
      const res = await api.delete(`/catalog/proctors/${id}`);
      showSuccess(res.data.message || `Deleted account for ${name}`);
      setProctorToDelete(null);
      fetchStats();
      fetchProctors(page);
    } catch (err) {
      console.error(err);
      showError(err.response?.data?.detail || `Failed to delete proctor ${name}`);
    } finally {
      setDeletingId(null);
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

  const downloadDummyProctors = async () => {
    try {
      const response = await api.get("/catalog/download-proctors-dummy", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "dummy_proctors.xlsx");
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      showSuccess("Proctor accounts template (dummy_proctors.xlsx) downloaded successfully!");
    } catch (err) {
      showError("Failed to download proctor template file");
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
      const res = await api.post("/catalog/upload-proctors", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      showSuccess(res.data.message);
      setImportResult(res.data.details);
      setFile(null);
      fetchStats();
      fetchProctors(1);
      setActiveTab("directory");
    } catch (err) {
      console.error(err);
      showError(err.response?.data?.detail || "An error occurred during proctor import");
    } finally {
      setUploading(false);
    }
  };

  const handleImport = async () => {
    if (!file) {
      showError("Please select a file to import");
      return;
    }

    if (isGenerating) {
      showError("Cannot upload proctor accounts while schedule generation is ongoing");
      return;
    }

    if (clearExisting) {
      setIsImportConfirmOpen(true);
    } else {
      executeImport();
    }
  };

  return (
    <div className={`space-y-6 ${isDark ? "text-slate-100" : "text-slate-800"}`}>
      {/* Top Header & Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total Proctors */}
        <div
          className={`p-5 rounded-2xl border transition-all duration-300 shadow-sm flex items-center justify-between ${
            isDark ? "bg-slate-800/80 border-slate-700/80" : "bg-white border-slate-200"
          }`}
        >
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Total Proctors
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <h4 className={`text-2xl font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}>
                {loadingStats ? "..." : (stats.total || 0).toLocaleString()}
              </h4>
              <span className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Accounts</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
            <UsersIcon className="w-6 h-6" />
          </div>
        </div>

        {/* College Proctors */}
        <div
          className={`p-5 rounded-2xl border transition-all duration-300 shadow-sm flex items-center justify-between ${
            isDark ? "bg-slate-800/80 border-slate-700/80" : "bg-white border-slate-200"
          }`}
        >
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              College Department
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <h4 className={`text-2xl font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}>
                {loadingStats ? "..." : (stats.college || 0).toLocaleString()}
              </h4>
              <span className="text-xs text-blue-500 font-medium">Faculty</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-500">
            <AcademicCapIcon className="w-6 h-6" />
          </div>
        </div>

        {/* SHS Proctors */}
        <div
          className={`p-5 rounded-2xl border transition-all duration-300 shadow-sm flex items-center justify-between ${
            isDark ? "bg-slate-800/80 border-slate-700/80" : "bg-white border-slate-200"
          }`}
        >
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              SHS Department
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <h4 className={`text-2xl font-extrabold ${isDark ? "text-white" : "text-slate-900"}`}>
                {loadingStats ? "..." : (stats.shs || 0).toLocaleString()}
              </h4>
              <span className="text-xs text-purple-500 font-medium">Faculty</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
            <BookOpenIcon className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Container with Tabs */}
      <div
        className={`rounded-2xl border overflow-hidden shadow-sm transition-all duration-300 ${
          isDark ? "bg-slate-800/80 border-slate-700/80" : "bg-white border-slate-200"
        }`}
      >
        {/* Navigation Tabs Header */}
        <div className={`flex border-b px-4 sm:px-6 pt-3 sm:pt-4 gap-4 sm:gap-6 overflow-x-auto no-scrollbar ${isDark ? "border-slate-700/80" : "border-slate-200"}`}>
          <button
            onClick={() => setActiveTab("directory")}
            className={`pb-3 sm:pb-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "directory"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <IdentificationIcon className="w-4 h-4" />
            Proctor Directory
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                activeTab === "directory"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
              }`}
            >
              {(stats.total || 0).toLocaleString()}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("upload")}
            className={`pb-3 sm:pb-4 text-xs sm:text-sm font-bold flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === "upload"
                ? "border-blue-600 text-blue-600 dark:text-blue-400"
                : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            <ArrowUpTrayIcon className="w-4 h-4" />
            Upload Proctors Excel
          </button>
        </div>

        {/* TAB 1: PROCTOR DIRECTORY */}
        {activeTab === "directory" && (
          <div className="p-4 sm:p-6 space-y-5 sm:space-y-6">
            {/* Filter Controls Bar */}
            <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-3 sm:gap-4">
              {/* Department Selector */}
              <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar py-0.5 max-w-full">
                {["All", "College", "ICT", "THM", "BM", "GE", "AS", "CRIM", "SHS"].map((dept) => (
                  <button
                    key={dept}
                    onClick={() => handleDeptChange(dept)}
                    className={`px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                      selectedDept === dept
                        ? "bg-blue-600 text-white shadow-sm"
                        : isDark
                        ? "bg-slate-700/60 text-slate-300 hover:bg-slate-700"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {dept === "All" ? "All Proctors" : dept === "College" ? "All College" : dept === "SHS" ? "SHS" : `${dept}`}
                  </button>
                ))}
              </div>

              {/* Search & Actions */}
              <div className="flex items-center gap-2 sm:gap-3 w-full lg:w-auto">
                <div className="relative flex-1 sm:w-72 min-w-0">
                  <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search name or email..."
                    className={`w-full pl-9 pr-8 py-2 rounded-xl text-xs border outline-none transition-all ${
                      isDark
                        ? "bg-slate-900/60 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500"
                        : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-blue-500"
                    }`} aria-label="Search name or email" />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" aria-label="Clear search">
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Reset filters button if active */}
                {(selectedDept !== "All" || searchQuery) && (
                  <button
                    onClick={handleResetFilters}
                    className={`p-2 rounded-xl border text-xs font-medium transition-all shrink-0 ${
                      isDark
                        ? "border-slate-700 text-slate-300 hover:bg-slate-700"
                        : "border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                    title="Reset filters" aria-label="Reset filters">
                    <ArrowPathIcon className="w-4 h-4" />
                  </button>
                )}

                {/* Clear All Proctors Button */}
                <button
                  onClick={() => setIsClearAllModalOpen(true)}
                  disabled={isGenerating || clearing || (stats.total || 0) === 0}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shrink-0 ${
                    (stats.total || 0) === 0
                      ? "opacity-50 cursor-not-allowed text-slate-400"
                      : "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 border border-red-200 dark:border-red-900/50"
                  }`}
                  title="Clear all proctor accounts"
                >
                  <TrashIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">Clear All</span>
                </button>
              </div>
            </div>

            {/* Table Area */}
            <div
              className={`rounded-xl border overflow-hidden ${
                isDark ? "border-slate-700/80 bg-slate-900/40" : "border-slate-200 bg-white"
              }`}
            >
              {directoryLoading ? (
                <div className="py-20 text-center">
                  <ArrowPathIcon className="w-8 h-8 mx-auto animate-spin text-blue-500 mb-3" />
                  <p className="text-sm font-medium text-slate-500">Loading proctor directory...</p>
                </div>
              ) : proctors.length === 0 ? (
                <div className="py-16 text-center">
                  <UsersIcon className="w-12 h-12 mx-auto text-slate-400 mb-3 opacity-60" />
                  <h4 className={`text-base font-bold ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                    No proctors found
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    {searchQuery || selectedDept !== "All"
                      ? "No records matched your search or department filter. Try adjusting your search criteria."
                      : "No proctor accounts have been uploaded yet. Switch to the 'Upload Proctors' tab to import accounts from Excel."}
                  </p>
                </div>
              ) : (
                <>
                  {/* DESKTOP TABLE VIEW (Screens >= 768px) */}
                  <div className="hidden md:block overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse text-xs min-w-[640px]">
                      <thead>
                        <tr className={`border-b font-semibold ${isDark ? "border-slate-700/80 bg-slate-800/60 text-slate-400" : "border-slate-200 bg-slate-50/80 text-slate-600"}`}>
                          <th className="py-3 px-4 w-12 text-center">#</th>
                          <th className="py-3 px-4">Proctor Name</th>
                          <th className="py-3 px-4">School Email</th>
                          <th className="py-3 px-4">Department</th>
                          <th className="py-3 px-4 text-center whitespace-nowrap">Schedule Uploaded</th>
                          <th className="py-3 px-4 text-right whitespace-nowrap">Actions</th>
                        </tr>
                      </thead>
                      <tbody className={`divide-y ${isDark ? "divide-slate-800" : "divide-slate-100"}`}>
                        {proctors.map((p, idx) => (
                          <tr
                            key={p.id}
                            className={`transition-colors ${
                              isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50/70"
                            }`}
                          >
                            <td className="py-3 px-4 text-center text-slate-400 font-mono">
                              {(page - 1) * pageSize + idx + 1}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                  {p.name ? p.name.charAt(0) : "P"}
                                </div>
                                <span className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>
                                  {p.name}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                              {p.email}
                            </td>
                            <td className="py-3 px-4 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-1 rounded-full text-xs font-semibold ${getDepartmentBadge(p.department)}`}
                              >
                                {p.department || "SHS"}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-center whitespace-nowrap">
                              {p.has_schedule ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                  <CheckCircleIcon className="w-4 h-4" />
                                  Yes
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-400">
                                  No
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right whitespace-nowrap">
                              <button
                                onClick={() => setProctorToDelete(p)}
                                disabled={deletingId === p.id}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
                                title="Delete proctor account" aria-label="Delete proctor account">
                                <TrashIcon className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* MOBILE RESPONSIVE CARDS VIEW (Screens < 768px) */}
                  <div className={`block md:hidden divide-y ${isDark ? "divide-slate-800" : "divide-slate-100"}`}>
                    {proctors.map((p, idx) => (
                      <div
                        key={p.id}
                        className={`p-4 transition-colors ${
                          isDark ? "hover:bg-slate-800/40" : "hover:bg-slate-50/70"
                        }`}
                      >
                        {/* Top: Avatar, Serial, Name, Email, and Delete Action */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-sm uppercase shrink-0">
                              {p.name ? p.name.charAt(0) : "P"}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-mono font-semibold text-slate-400">
                                  #{(page - 1) * pageSize + idx + 1}
                                </span>
                                <h5 className={`font-bold text-sm leading-tight break-words ${isDark ? "text-white" : "text-slate-900"}`}>
                                  {p.name}
                                </h5>
                              </div>
                              <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                {p.email}
                              </p>
                            </div>
                          </div>

                          {/* Delete Action Button */}
                          <button
                            onClick={() => setProctorToDelete(p)}
                            disabled={deletingId === p.id}
                            className="p-2 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all shrink-0 active:scale-95"
                            title="Delete proctor account" aria-label="Delete proctor account">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Bottom: Department Badge and Schedule Status */}
                        <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t border-dashed border-slate-200 dark:border-slate-800 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-400 font-medium">Dept:</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getDepartmentBadge(p.department)}`}>
                              {p.department || "SHS"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-slate-400 font-medium">Schedule:</span>
                            {p.has_schedule ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50">
                                <CheckCircleIcon className="w-3.5 h-3.5 text-emerald-500" />
                                Uploaded
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-400 border border-slate-200 dark:border-slate-700">
                                None
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* Pagination footer */}
              {totalPages > 1 && (
                <div
                  className={`p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-xs ${
                    isDark ? "border-slate-800 text-slate-400" : "border-slate-100 text-slate-600"
                  }`}
                >
                  <div>
                    Showing{" "}
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {(page - 1) * pageSize + 1}
                    </span>{" "}
                    to{" "}
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {Math.min(page * pageSize, totalProctors)}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-slate-900 dark:text-white">
                      {totalProctors}
                    </span>{" "}
                    proctors
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className={`p-1.5 rounded-lg border transition-all ${
                        page === 1
                          ? "opacity-40 cursor-not-allowed border-transparent"
                          : isDark
                          ? "border-slate-700 hover:bg-slate-800"
                          : "border-slate-200 hover:bg-slate-100"
                      }`} aria-label="Previous page">
                      <ChevronLeftIcon className="w-4 h-4" />
                    </button>
                    <span className="font-semibold px-2">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className={`p-1.5 rounded-lg border transition-all ${
                        page === totalPages
                          ? "opacity-40 cursor-not-allowed border-transparent"
                          : isDark
                          ? "border-slate-700 hover:bg-slate-800"
                          : "border-slate-200 hover:bg-slate-100"
                      }`} aria-label="Next page">
                      <ChevronRightIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: UPLOAD PROCTORS */}
        {activeTab === "upload" && (
          <div className="p-6 max-w-4xl mx-auto space-y-6">
            {/* Guidelines Card */}
            <div
              className={`p-5 rounded-2xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
                isDark ? "bg-slate-900/60 border-slate-700/80" : "bg-blue-50/50 border-blue-100"
              }`}
            >
              <div className="space-y-1">
                <h4 className={`text-sm font-bold flex items-center gap-2 ${isDark ? "text-blue-400" : "text-blue-900"}`}>
                  <IdentificationIcon className="w-5 h-5" />
                  Excel File Requirements
                </h4>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Your file must contain the headers: <code className="font-mono font-bold">NAME</code>,{" "}
                  <code className="font-mono font-bold">EMAIL</code>, and{" "}
                  <code className="font-mono font-bold">DEPARTMENT</code>. College departments:{" "}
                  <span className="font-semibold text-blue-600 dark:text-blue-400">ICT, THM, BM, GE, AS, CRIM</span>. Senior High School proctors must be{" "}
                  <span className="font-semibold text-violet-600 dark:text-violet-400">SHS</span>. Email format must follow{" "}
                  <code className="font-mono font-bold">name.lastname@edu.ph</code>.
                </p>
              </div>

              <button
                type="button"
                onClick={downloadDummyProctors}
                className="shrink-0 px-4 py-2 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white flex items-center gap-2 shadow-sm transition-all"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                Download Sample Excel (dummy_proctors.xlsx)
              </button>
            </div>

            {/* Clear Existing Toggle */}
            <div
              className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                clearExisting
                  ? "border-red-300 bg-red-50/30 dark:border-red-900/60 dark:bg-red-950/20"
                  : isDark
                  ? "border-slate-700 bg-slate-900/40"
                  : "border-slate-200 bg-slate-50/50"
              }`}
            >
              <div className="space-y-0.5">
                <div className={`text-xs font-bold ${clearExisting ? "text-red-700 dark:text-red-400" : isDark ? "text-white" : "text-slate-800"}`}>
                  Clear existing proctors before import
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Wipes previously uploaded proctor user accounts before inserting new records.
                </p>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={clearExisting}
                  onChange={(e) => setClearExisting(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>

            {/* Drag & Drop Upload Box */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all ${
                dragOver
                  ? "border-blue-500 bg-blue-50/20 dark:bg-blue-900/20"
                  : isDark
                  ? "border-slate-700 hover:border-slate-600 bg-slate-900/30"
                  : "border-slate-300 hover:border-slate-400 bg-slate-50/30"
              }`}
            >
              <ArrowUpTrayIcon className="w-12 h-12 mx-auto text-blue-500 mb-4 opacity-80" />
              <h5 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
                Drag and drop your proctors Excel file here
              </h5>
              <p className="text-xs text-slate-500 mt-1 mb-5">Supported formats: .xlsx, .xls</p>

              <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-sm transition-all">
                Browse Files
                <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" />
              </label>

              {file && (
                <div
                  className={`mt-6 inline-flex items-center gap-3 px-4 py-2 rounded-xl text-xs border ${
                    isDark ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white border-slate-200 text-slate-800"
                  }`}
                >
                  <IdentificationIcon className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold">{file.name}</span>
                  <span className="text-slate-400 font-mono">({(file.size / 1024).toFixed(1)} KB)</span>
                  <button
                    onClick={() => setFile(null)}
                    className="p-1 hover:text-red-500 text-slate-400 transition-colors" aria-label="Remove selected file">
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Import Button */}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleImport}
                disabled={!file || uploading || isGenerating}
                className={`px-6 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm transition-all ${
                  !file || uploading || isGenerating
                    ? "opacity-50 cursor-not-allowed bg-slate-400 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20"
                }`} aria-label="Refresh">
                {uploading ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    Importing Proctors...
                  </>
                ) : (
                  <>
                    <ArrowUpTrayIcon className="w-4 h-4" />
                    Upload & Import Proctors
                  </>
                )}
              </button>
            </div>

            {/* Results Alert */}
            {importResult && (
              <div
                className={`p-5 rounded-2xl border flex items-start gap-3.5 ${
                  isDark ? "bg-emerald-950/20 border-emerald-900/50" : "bg-emerald-50 border-emerald-200"
                }`}
              >
                <CheckCircleIcon className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <h6 className="font-bold text-emerald-800 dark:text-emerald-300">
                    Proctors Import Completed Successfully
                  </h6>
                  <p className="text-emerald-700 dark:text-emerald-400">
                    • <strong>{importResult.created}</strong> new proctor accounts created.
                  </p>
                  <p className="text-emerald-700 dark:text-emerald-400">
                    • <strong>{importResult.updated}</strong> existing accounts updated.
                  </p>
                  {importResult.skipped > 0 && (
                    <p className="text-slate-500 dark:text-slate-400">
                      • <strong>{importResult.skipped}</strong> rows skipped (missing name or invalid email).
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Clear Existing on Import */}
      <ConfirmationModal
        isOpen={isImportConfirmOpen}
        onClose={() => setIsImportConfirmOpen(false)}
        onCancel={() => setIsImportConfirmOpen(false)}
        onConfirm={executeImport}
        title="Clear Existing Proctors Before Import?"
        message="You have enabled 'Clear existing proctors before import'. All existing proctor user accounts and proctor assignments will be wiped before uploading the new file. This action cannot be undone."
        confirmLabel="Yes, Clear and Import"
        cancelLabel="Cancel"
        requireTypedConfirm={false}
        isDanger={true}
      />

      {/* Confirmation Modal for Clear All Proctors */}
      <ConfirmationModal
        isOpen={isClearAllModalOpen}
        onClose={() => setIsClearAllModalOpen(false)}
        onCancel={() => setIsClearAllModalOpen(false)}
        onConfirm={executeClearAllProctors}
        title="Clear All Proctor Accounts?"
        message={`Are you sure you want to delete all ${stats.total || 0} proctor accounts? This will remove their login access. Program Head and Student accounts will not be affected.`}
        confirmText="Yes, Delete All Proctors"
        confirmLabel="Yes, Delete All Proctors"
        cancelLabel="Cancel"
        cancelText="Cancel"
        isDanger={true}
      />

      {/* Confirmation Modal for Single Proctor Delete */}
      <ConfirmationModal
        isOpen={Boolean(proctorToDelete)}
        onClose={() => setProctorToDelete(null)}
        onCancel={() => setProctorToDelete(null)}
        onConfirm={executeDeleteProctor}
        title="Delete Proctor Account?"
        message={`Are you sure you want to delete the proctor account for "${proctorToDelete?.name}" (${proctorToDelete?.email})?`}
        confirmLabel="Delete Proctor"
        cancelLabel="Cancel"
        cancelText="Cancel"
        requireTypedConfirm={false}
        isDanger={true}
      />
    </div>
  );
}
