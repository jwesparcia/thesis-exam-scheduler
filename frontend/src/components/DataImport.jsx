import React, { useState, useEffect } from "react";
import { 
  CircleStackIcon, 
  ArrowUpTrayIcon, 
  ArrowDownTrayIcon, 
  ExclamationTriangleIcon, 
  CheckCircleIcon, 
  ArrowPathIcon, 
  BookOpenIcon, 
  UsersIcon, 
  Square2StackIcon, 
  QuestionMarkCircleIcon
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import { useToast } from "../context/ToastContext";
import api from "../api";
import ConfirmationModal from "./ConfirmationModal";

export default function DataImport({ isGenerating }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { showSuccess, showError, showWarning } = useToast();

  const [stats, setStats] = useState({ courses: 0, sections: 0, subjects: 0, teachers: 0 });
  const [loadingStats, setLoadingStats] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [clearExisting, setClearExisting] = useState(false);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [clearing, setClearing] = useState(false);
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [isImportConfirmOpen, setIsImportConfirmOpen] = useState(false);

  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const res = await api.get("/catalog/stats");
      setStats(res.data);
    } catch (err) {
      console.error("Error fetching stats:", err);
    } finally {
      setLoadingStats(false);
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

  const downloadTemplate = async () => {
    try {
      const response = await api.get("/catalog/download-template", {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "school_curriculum.xlsx");
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      showSuccess("Curriculum downloaded successfully!");
    } catch (err) {
      showError("Failed to download curriculum file");
    }
  };

  const executeClearDatabase = async () => {
    setIsClearModalOpen(false);
    setClearing(true);
    try {
      const res = await api.post("/catalog/clear", { confirm_text: "confirm" });
      showSuccess(res.data.message);
      setImportResult(null);
      fetchStats();
    } catch (err) {
      console.error(err);
      showError(err.response?.data?.detail || "An error occurred while resetting the database");
    } finally {
      setClearing(false);
    }
  };

  const handleClearDatabase = () => {
    if (isGenerating) {
      showError("Cannot clear database while schedule generation is ongoing");
      return;
    }
    setIsClearModalOpen(true);
  };

  const executeImport = async () => {
    setUploading(true);
    setImportResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("clear_existing", clearExisting.toString());

    try {
      const res = await api.post("/catalog/upload", formData, {
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
      showError(err.response?.data?.detail || "An error occurred during curriculum import");
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
      showError("Cannot upload curriculum while schedule generation is ongoing");
      return;
    }

    if (clearExisting) {
      setIsImportConfirmOpen(true);
    } else {
      executeImport();
    }
  };

  return (
    <div className="space-y-8">
      {/* Header Panel */}
      <div className={`p-6 rounded-2xl border ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-100"}`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-600 text-white shadow-md shadow-blue-500/20"}`}>
              <CircleStackIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                Curriculum & Catalog Import
              </h2>
              <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Initialize or update your school's courses, sections, subjects, and teachers using Excel sheet uploads.
              </p>
            </div>
          </div>
          <button
            onClick={fetchStats}
            disabled={loadingStats}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold border transition duration-300 shrink-0 ${
              isDark 
                ? "bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700" 
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <ArrowPathIcon className={`w-4 h-4 ${loadingStats ? "animate-spin" : ""}`} />
            Refresh Stats
          </button>
        </div>
      </div>

      {/* Database Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[
          { label: "Total Courses", value: stats.courses, icon: Square2StackIcon, color: "text-blue-500 bg-blue-500/10" },
          { label: "Total Sections", value: stats.sections, icon: BookOpenIcon, color: "text-green-500 bg-green-500/10" },
          { label: "Total Subjects", value: stats.subjects, icon: CircleStackIcon, color: "text-purple-500 bg-purple-500/10" },
          { label: "Total Teachers", value: stats.teachers, icon: UsersIcon, color: "text-orange-500 bg-orange-500/10" },
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

      {/* Main Import Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Instructions Panel */}
        <div className={`lg:col-span-5 p-6 rounded-2xl border ${isDark ? "bg-slate-800/30 border-slate-800" : "bg-white border-slate-200"} space-y-5`}>
          <h3 className={`text-md font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
            Curriculum Spreadsheet Guide
          </h3>
          <p className={`text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Ensure your Excel file contains the standard curriculum layout. The importer will match fields using flexible column matching:
          </p>
          <ul className={`text-xs space-y-3 pl-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>Course / Program</strong> (e.g. BSIT, BSCS, STEM)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>Category</strong> (e.g. College or SHS)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>Year Level</strong> (e.g. 1st Year, Grade 11)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>Section Name</strong> (e.g. BSIT 3-201, STEM-11A)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>Subject Code & Name</strong> (e.g. CS102 / Computer Programming 2)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>Semester</strong> (1, 2, or 3 for college; optional for SHS)</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-blue-500 font-bold">•</span>
              <span><strong>Teacher Name</strong> (will auto-create login accounts with default password: <code>proctor123</code>)</span>
            </li>
          </ul>

          <div className="pt-2">
            <button
              onClick={downloadTemplate}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition duration-300 shadow-sm shadow-blue-600/10"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              Download Current Curriculum
            </button>
          </div>
        </div>

        {/* Upload Action Panel */}
        <div className={`lg:col-span-7 p-6 rounded-2xl border ${isDark ? "bg-slate-800/30 border-slate-800" : "bg-white border-slate-200"} flex flex-col justify-between`}>
          <div className="space-y-5">
            <h3 className={`text-md font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
              Select Curriculum File
            </h3>

            {/* Upload Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById("excel-file-selector").click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-300 ${
                dragOver 
                  ? "border-blue-500 bg-blue-500/5" 
                  : isDark 
                    ? "border-slate-700 hover:border-slate-600 hover:bg-slate-800/10" 
                    : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                id="excel-file-selector"
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
                    {file ? file.name : "Drag & Drop Excel File here"}
                  </p>
                  <p className={`text-xs mt-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                    {file ? `${(file.size / 1024).toFixed(1)} KB` : "or click to browse from files"}
                  </p>
                </div>
              </div>
            </div>

            {/* Settings Options */}
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
                  <span className="font-bold block mb-0.5">Clear existing curriculum catalog data</span>
                  <span>Enable this to replace existing courses, sections, and subjects. <strong>Warning: This also deletes all current active/draft exam schedules. Student accounts are not affected.</strong></span>
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
                  Importing Curriculum Data...
                </>
              ) : (
                <>
                  <ArrowUpTrayIcon className="w-4 h-4" />
                  Upload & Import Data
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Results View Panel */}
      {importResult && (
        <div className={`p-6 rounded-2xl border ${isDark ? "bg-slate-800/20 border-slate-800" : "bg-white border-slate-200"} animate-in fade-in duration-300`}>
          <div className="flex items-center gap-3 mb-6">
            <CheckCircleIcon className="w-5 h-5 text-green-500" />
            <h3 className={`text-md font-bold ${isDark ? "text-white" : "text-slate-800"}`}>
              Curriculum Data Successfully Synced!
            </h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Courses Created", value: importResult.courses_created },
              { label: "Year Levels Created", value: importResult.year_levels_created },
              { label: "Sections Created", value: importResult.sections_created },
              { label: "Subjects Created", value: importResult.subjects_created },
              { label: "Teachers Created", value: importResult.teachers_created },
              { label: "Proctors Created", value: importResult.proctors_created },
              { label: "Proctor Logins", value: importResult.users_created },
              { label: "Teaching Assignments", value: importResult.teaching_assignments },
            ].map((stat, i) => (
              <div key={i} className={`p-4 rounded-xl border text-center ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <p className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  {stat.label}
                </p>
                <p className={`text-xl font-extrabold tracking-tight mt-1 ${stat.value > 0 ? "text-blue-500" : isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Danger Zone */}
      <div className={`p-6 rounded-2xl border ${isDark ? "bg-red-950/10 border-red-900/30" : "bg-red-50/50 border-red-100"} mt-12`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-wider flex items-center gap-2">
              <ExclamationTriangleIcon className="w-4 h-4" />
              Danger Zone
            </h4>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Permanently delete all curriculum data (Courses, Sections, Subjects, Teachers, Proctor Accounts, and Schedules). Student accounts are <strong>not</strong> affected.
            </p>
          </div>
          <button
            onClick={handleClearDatabase}
            disabled={clearing || isGenerating}
            className={`flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-bold transition duration-300 shrink-0 ${
              clearing || isGenerating
                ? isDark ? "bg-slate-800 text-slate-600 border border-slate-700 cursor-not-allowed" : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                : "bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/10"
            }`}
          >
            {clearing ? (
              <>
                <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                Deleting Curriculum...
              </>
            ) : (
              "Delete Curriculum"
            )}
          </button>
        </div>
      </div>

      <ConfirmationModal
        isOpen={isClearModalOpen}
        title="Delete Curriculum Data"
        message="This will permanently delete all courses, year levels, sections, subjects, teachers, proctors, proctor accounts, and ALL active exam schedules. Student accounts will NOT be deleted."
        confirmText="confirm"
        confirmLabel="Delete Curriculum"
        isDanger={true}
        onConfirm={executeClearDatabase}
        onCancel={() => setIsClearModalOpen(false)}
      />

      <ConfirmationModal
        isOpen={isImportConfirmOpen}
        title="Confirm Curriculum Import"
        message="WARNING: You have enabled 'Clear existing data'. This will wipe out all current courses, year levels, sections, subjects, and generated exam schedules before importing the new file. Student accounts will NOT be deleted. Are you sure you want to proceed?"
        confirmLabel="Wipe and Import Data"
        isDanger={true}
        onConfirm={() => {
          setIsImportConfirmOpen(false);
          executeImport();
        }}
        onCancel={() => setIsImportConfirmOpen(false)}
      />
    </div>
  );
}
