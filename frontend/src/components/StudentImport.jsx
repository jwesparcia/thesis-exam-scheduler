import React, { useState, useEffect } from "react";
import { 
  UserIcon, 
  ArrowUpTrayIcon, 
  ArrowDownTrayIcon, 
  ExclamationTriangleIcon, 
  ArrowPathIcon, 
  UsersIcon,
  TrashIcon
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import { useToast } from "../context/ToastContext";
import api from "../api";
import ConfirmationModal from "./ConfirmationModal";

export default function StudentImport({ isGenerating }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { showSuccess, showError } = useToast();

  const [stats, setStats] = useState({ total: 0, regular: 0, irregular: 0 });
  const [loadingStats, setLoadingStats] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clearExisting, setClearExisting] = useState(false);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);
  const [isClearAllStudentsModalOpen, setIsClearAllStudentsModalOpen] = useState(false);
  const [clearingStudents, setClearingStudents] = useState(false);
  const [importResult, setImportResult] = useState(null);

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

  const executeClearAllStudents = async () => {
    setIsClearAllStudentsModalOpen(false);
    setClearingStudents(true);
    try {
      const res = await api.post("/catalog/clear-students");
      showSuccess(res.data.message);
      fetchStats();
    } catch (err) {
      console.error(err);
      showError(err.response?.data?.detail || "Failed to clear student accounts");
    } finally {
      setClearingStudents(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

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
      link.setAttribute("download", "dummy_students_3000.xlsx");
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      showSuccess("Dummy student list downloaded successfully!");
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Header Panel */}
      <div className={`p-6 rounded-2xl border ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-100"}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-600 text-white shadow-md shadow-blue-500/20"}`}>
              <UsersIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Student Accounts & Uploads
              </h2>
              <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Import or update student accounts from Excel spreadsheet files, and manage login credentials.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={fetchStats}
              disabled={loadingStats}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition duration-300 ${
                isDark 
                  ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700" 
                  : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <ArrowPathIcon className={`w-4 h-4 ${loadingStats ? "animate-spin" : ""}`} />
              Refresh Stats
            </button>

            <button
              onClick={() => setIsClearAllStudentsModalOpen(true)}
              disabled={clearingStudents || isGenerating || stats.total === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
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

      {/* Student Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {[
          { label: "Total Students", value: stats.total, icon: UsersIcon, color: "text-blue-500 bg-blue-500/10" },
          { label: "Regular Students", value: stats.regular, icon: UserIcon, color: "text-green-500 bg-green-500/10" },
          { label: "Irregular Students", value: stats.irregular, icon: UserIcon, color: "text-purple-500 bg-purple-500/10" },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <div
              key={i}
              className={`p-6 rounded-2xl border shadow-sm flex items-center justify-between transition-colors duration-300 ${
                isDark ? "bg-slate-800/40 border-slate-800" : "bg-white border-slate-200"
              }`}
            >
              <div className="space-y-1">
                <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  {card.label}
                </p>
                <p className={`text-3xl font-extrabold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  {loadingStats ? "..." : card.value}
                </p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${card.color}`}>
                <Icon className="w-5 h-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Upload Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Guidance Column */}
        <div className={`lg:col-span-5 p-6 rounded-2xl border ${isDark ? "bg-slate-800/30 border-slate-800" : "bg-white border-slate-200"} space-y-5`}>
          <h3 className={`text-md font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
            Student Spreadsheet Guidelines
          </h3>
          <p className={`text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Please format your Excel sheet with the following case-insensitive column headers:
          </p>
          <ul className={`text-xs space-y-3 pl-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>COURSE</strong> (e.g. BSIT, BSCS, STEM) - mapped to databases.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>SECTION</strong> (e.g. BSIT 3-201, STEM-11A) - regular section, or set blank/IRREGULAR for irregular students.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>NAME</strong> (e.g. Richard Santos) - student's display name.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>SCHOOL EMAIL</strong> (e.g. <code>santos_0200352553_@ortigas-cainta.sti.edu</code>) - format is <code>lastname_schoolid_@ortigas-cainta.sti.edu</code>.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>STATUS</strong> (regular / irregular) - defines if the student is regular or irregular. Fallback is set based on section.</span>
            </li>
          </ul>

          <div className="p-4 rounded-xl border border-blue-500/20 bg-blue-500/5 text-xs text-blue-400 leading-relaxed">
            <strong>Default Password:</strong> Imported students can log in using their email and the default password: <code className="font-bold underline">student123</code>.
          </div>

          <div className="pt-2">
            <button
              onClick={downloadDummyStudents}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition duration-300 shadow-sm shadow-blue-600/10"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Download 3,000 Dummy Student List
            </button>
          </div>
        </div>

        {/* File Drop and Process Column */}
        <div className={`lg:col-span-7 p-6 rounded-2xl border ${isDark ? "bg-slate-800/30 border-slate-800" : "bg-white border-slate-200"} flex flex-col justify-between`}>
          <div className="space-y-5">
            <h3 className={`text-md font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
              Upload Student Spreadsheet
            </h3>

            {/* Drop Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById("student-file-selector").click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
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
              <div className="flex flex-col items-center justify-center gap-3.5">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isDark ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-500"}`}>
                  <ArrowUpTrayIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    {file ? file.name : "Drag & Drop Student Excel File here"}
                  </p>
                  <p className={`text-xs mt-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    {file ? `${(file.size / 1024).toFixed(1)} KB` : "or click to select file"}
                  </p>
                </div>
              </div>
            </div>

            {/* Options Toggle */}
            <div className={`p-4 rounded-xl border transition-all duration-300 ${
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
                  className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                />
                <div className="text-xs">
                  <span className="font-bold block mb-0.5">Clear existing student accounts before import</span>
                  <span>Check this to completely wipe all existing student user accounts and replace them with this list. <strong>Warning: This action is irreversible!</strong></span>
                </div>
              </label>
            </div>
          </div>

          <div className="pt-6">
            <button
              onClick={handleImport}
              disabled={uploading || !file || isGenerating}
              className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
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
