import React, { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  UserCheck,
  Calendar,
  MapPin,
  Clock,
  LogOut,
  Bell,
  AlertCircle,
  LayoutGrid,
  Settings,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  Upload,
  CheckCircle2
} from "lucide-react";
import { useTheme } from "../context/themeStore";
import ThemeToggle from "../components/ThemeToggle";
import { useUser } from "../context/userStore";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import SettingsDropdown from "../components/SettingsDropdown";

export default function ProctorDashboard() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("assignments");
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [mySchedule, setMySchedule] = useState([]);
  const [filePreview, setFilePreview] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    const fetchMyExams = async () => {
      if (!user?.proctor_id) {
        setLoading(false);
        return;
      }
      try {
        const response = await fetch(`http://localhost:8000/exams?proctor_id=${user.proctor_id}&status=posted`);
        if (response.ok) {
          const myExams = await response.json();
          setExams(myExams);
        }
      } catch (error) {
        console.error('Error fetching exams:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMyExams();

    if (activeTab === "schedule") {
      fetchMySchedule();
    }
  }, [user, activeTab]);

  const fetchMySchedule = async () => {
    if (!user?.teacher_id) return;
    try {
      const res = await fetch("http://localhost:8000/proctors/schedules");
      if (res.ok) {
        const allSchedules = await res.json();
        const mine = allSchedules.filter(s => s.teacher_name === user.name);
        setMySchedule(mine);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchNotifications = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`http://localhost:8000/notifications/proctor/${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const markRead = async (id) => {
    try {
      await fetch(`http://localhost:8000/notifications/${id}/read`, { method: "PUT" });
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const parseExcelPreview = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      let targetSheetName = workbook.SheetNames[0];
      if (workbook.SheetNames.length > 1 && user?.name) {
        const proctorLastName = user.name.split(" ").pop().toLowerCase();
        for (const name of workbook.SheetNames) {
          if (name === "BLANK" || name === "CHANGES" || name === "SIMS SYNC") continue;
          if (name.toLowerCase().includes(proctorLastName) || name.toLowerCase().includes(user.name.toLowerCase())) {
            targetSheetName = name;
            break;
          }
        }
        if (targetSheetName === workbook.SheetNames[0] && ['BLANK', 'CHANGES', 'SIMS SYNC'].includes(targetSheetName)) {
          for (const name of workbook.SheetNames) {
            if (!['BLANK', 'CHANGES', 'SIMS SYNC'].includes(name)) {
              targetSheetName = name;
              break;
            }
          }
        }
      }
      const sheet = workbook.Sheets[targetSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      if (rows.length === 0) { setFilePreview({ headers: [], rows: [], sheetName: targetSheetName }); return; }
      const headers = rows[0].map(String);
      const body = rows.slice(1);
      setFilePreview({ headers, rows: body, sheetName: targetSheetName });
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return showError("Please select a file first");
    setUploading(true);
    const formData = new FormData();
    formData.append("file", selectedFile);
    try {
      const res = await fetch(`http://localhost:8000/proctors/${user.proctor_id}/upload-my-schedule`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Upload failed");
      }
      showSuccess("Schedule uploaded successfully!");
      setSelectedFile(null);
      setFilePreview(null);
      const resSched = await fetch("http://localhost:8000/proctors/schedules");
      if (resSched.ok) {
        const allSchedules = await resSched.json();
        const mine = allSchedules.filter(s => s.teacher_name === user.name);
        setMySchedule(mine);
      }
    } catch (err) {
      showError(err.message || "Failed to upload schedule");
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const parts = dateStr.split(", ");
    if (parts.length < 3) return dateStr;
    const parsedDate = new Date(`${parts[1]}, ${parts[2]}`);
    return parsedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  if (!user) {
    return (
      <div className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gray-50"} flex items-center justify-center`}>
        <p className={isDark ? "text-gray-300" : "text-gray-600"}>Redirecting to login...</p>
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className={`min-h-screen flex transition-colors duration-300 ${isDark ? "bg-slate-900" : "bg-slate-50"}`}>
      {showNotifications && (
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity" onClick={() => setShowNotifications(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`w-72 flex flex-col border-r transition-all duration-300 z-30 ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"}`}>
        <div className="p-6 flex flex-col items-center gap-4 border-b border-transparent">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105 duration-300 ${isDark ? "bg-gradient-to-br from-blue-600 to-indigo-700" : "bg-gradient-to-br from-blue-500 to-blue-700"}`}>
            <img src="/images.png" alt="STI Logo" className="rounded-xl h-10 w-10 object-contain drop-shadow-md" />
          </div>
          <div className="text-center">
            <h2 className={`text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Proctor Portal</h2>
            <p className={`text-xs font-medium tracking-wide uppercase mt-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>STI Education System</p>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
          {[
            { id: "assignments", icon: CalendarDays, label: "My Assignments" },
            { id: "schedule", icon: FileSpreadsheet, label: "My Schedule" },
            { id: "notifications", icon: Bell, label: "Notifications" },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3.5 px-4 py-3.5 rounded-xl transition-all duration-300 group ${
                  isActive
                    ? isDark 
                      ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50" 
                      : "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                    : isDark
                      ? "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                      : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? "scale-110" : "group-hover:scale-110"}`} />
                <span className="text-sm font-semibold">{item.label}</span>
              </button>
            );
          })}
        </nav>
        
        <footer className={`p-6 text-xs text-center font-medium border-t transition-colors ${isDark ? "border-slate-800 text-slate-500" : "border-slate-100 text-slate-400"}`}>
          v1.0 • Built with React
        </footer>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className={`sticky top-0 z-20 backdrop-blur-2xl border-b transition-all duration-300 ${isDark ? "bg-slate-900/70 border-slate-800" : "bg-white/70 border-slate-200"}`}>
          <div className="max-w-7xl mx-auto px-8 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h1 className={`text-2xl font-bold tracking-tight transition-colors ${isDark ? "text-white" : "text-slate-900"}`}>
                  {activeTab === "assignments" ? "My Proctoring Assignments" : activeTab === "schedule" ? "My Teaching Schedule" : activeTab === "notifications" ? "Notifications" : "Settings"}
                </h1>
                <p className={`text-sm mt-1 font-medium transition-colors ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Welcome back, {user?.name || "Proctor"}
                </p>
              </div>
              
              <div className="flex items-center gap-4">
                <div className={`hidden md:flex px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${isDark ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-green-50 text-green-700 border border-green-100"}`}>
                  PROCTOR
                </div>
                
                <div className="relative">
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className={`relative p-2.5 rounded-xl transition-all duration-300 ${isDark ? "text-slate-300 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900 animate-pulse"></span>
                    )}
                  </button>
                  
                  {showNotifications && (
                    <div className={`absolute right-0 mt-3 w-80 max-h-96 flex flex-col rounded-2xl shadow-2xl border z-50 transform origin-top-right transition-all animate-in fade-in scale-95 duration-200 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
                      <div className={`px-5 py-4 border-b flex justify-between items-center ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                        <h3 className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>Notifications</h3>
                        {unreadCount > 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">{unreadCount} New</span>}
                      </div>
                      <div className="overflow-y-auto p-2 custom-scrollbar flex-1">
                        {notifications.length === 0 ? (
                          <div className={`p-6 text-center text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                            <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            You're all caught up!
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => { if (!notif.is_read) markRead(notif.id); }}
                              className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 mb-1 ${notif.is_read ? (isDark ? "hover:bg-slate-700/50 opacity-60" : "hover:bg-slate-50 opacity-60") : (isDark ? "bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/30" : "bg-blue-50 hover:bg-blue-100 border border-blue-100")}`}
                            >
                              <div className="flex gap-3">
                                <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${notif.is_read ? "bg-slate-400" : "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"}`}></div>
                                <div>
                                  <p className={`text-sm leading-snug ${isDark ? "text-slate-200" : "text-slate-800"}`}>{notif.message}</p>
                                  <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                                    {notif.created_at ? new Date(notif.created_at).toLocaleString() : "Just now"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2 hidden sm:block"></div>
                <SettingsDropdown onLogout={handleLogout} isDark={isDark} />
              </div>
            </div>
          </div>
        </header>

        <div className="max-w-7xl mx-auto px-6 pt-8 pb-4">
          <div className={`p-6 rounded-2xl shadow-sm border flex items-center gap-6 ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shadow-inner ${isDark ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-700"}`}>
              {(user?.name || "P").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
            </div>
            <div className="flex-1">
              <h2 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{user?.name || "Proctor Name"}</h2>
              <div className="flex flex-wrap gap-4 mt-2">
                <div className={`flex items-center gap-2 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  <UserCheck className="w-4 h-4 text-green-500" />
                  <span>Licensed Proctor</span>
                </div>
                <div className={`flex items-center gap-2 text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  <LayoutGrid className="w-4 h-4 text-blue-500" />
                  <span>{exams.length} Active Assignment{exams.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
            <div className="hidden md:block">
              <div className={`px-4 py-2 rounded-xl border ${isDark ? "bg-gray-700/30 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                <p className={`text-[10px] uppercase font-bold tracking-widest ${isDark ? "text-gray-500" : "text-gray-400"}`}>Current Status</p>
                <p className={`text-sm font-semibold text-green-500 mt-1`}>● Online & Active</p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className={`w-12 h-12 rounded-full border-4 ${isDark ? "border-gray-800" : "border-gray-200"} border-t-blue-500 animate-spin`}></div>
              <p className={`text-sm font-medium ${isDark ? "text-gray-400" : "text-gray-600"}`}>Fetching your supervisory schedule...</p>
            </div>
          ) : activeTab === "schedule" ? (
            <div className="space-y-8">
              <div className={`p-6 rounded-2xl border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200 shadow-sm"}`}>
                <div className="flex items-center gap-3 mb-4">
                  <FileSpreadsheet className={`w-6 h-6 ${isDark ? "text-emerald-400" : "text-emerald-500"}`} />
                  <div>
                    <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Upload My Teaching Schedule</h3>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Upload your individual schedule (Excel format) to update your availability</p>
                  </div>
                </div>
                {!selectedFile ? (
                  <div className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all border-gray-200 dark:border-gray-700`}>
                    <Upload className={`w-8 h-8 mb-2 ${isDark ? "text-gray-600" : "text-gray-300"}`} />
                    <p className={`text-sm mb-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Drag and drop or click to browse</p>
                    <label className="cursor-pointer px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition">
                      Select File
                      <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => { const f = e.target.files[0]; if (!f) return; setSelectedFile(f); parseExcelPreview(f); }} />
                    </label>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${isDark ? "bg-gray-700/40 border-emerald-700/40" : "bg-emerald-50 border-emerald-200"}`}>
                      <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>{selectedFile.name}</p>
                        <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>{filePreview ? `${filePreview.rows.length} data row${filePreview.rows.length !== 1 ? 's' : ''} · ${filePreview.headers.length} column${filePreview.headers.length !== 1 ? 's' : ''}` : 'Reading file…'}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button onClick={handleFileUpload} disabled={uploading} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold transition flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" />
                          {uploading ? "Uploading…" : "Confirm Upload"}
                        </button>
                        <button onClick={() => { setSelectedFile(null); setFilePreview(null); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${isDark ? "text-gray-400 hover:text-gray-200 bg-gray-700 hover:bg-gray-600" : "text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200"}`}>Cancel</button>
                      </div>
                    </div>
                    {filePreview && (
                      <div className={`rounded-xl border overflow-hidden ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                        <div className={`px-4 py-2 flex items-center gap-2 border-b text-xs font-bold uppercase tracking-wider ${isDark ? "bg-gray-700/60 border-gray-700 text-gray-400" : "bg-gray-50 border-gray-200 text-gray-500"}`}>
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          File Preview — {filePreview.sheetName || 'Sheet 1'}
                        </div>
                        <div className="overflow-x-auto max-h-80 overflow-y-auto">
                          {filePreview.headers.length === 0 ? (
                            <p className={`text-center py-8 text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>The file appears to be empty.</p>
                          ) : (
                            <table className="w-full text-xs border-collapse">
                              <thead className={`sticky top-0 z-10 ${isDark ? "bg-blue-900/60 text-blue-300" : "bg-blue-600 text-white"}`}>
                                <tr><th className={`px-2 py-2 text-right font-bold border-r w-8 ${isDark ? "border-gray-700 text-gray-500" : "border-blue-500/40 text-blue-200/70"}`}>#</th>
                                  {filePreview.headers.map((h, i) => (<th key={i} className={`px-3 py-2 text-left font-bold whitespace-nowrap border-r last:border-r-0 ${isDark ? "border-blue-800/50" : "border-blue-500/30"}`}>{h || <span className="italic opacity-50">Column {i + 1}</span>}</th>))}</tr>
                              </thead>
                              <tbody>
                                {filePreview.rows.map((row, rIdx) => (
                                  <tr key={rIdx} className={`border-t transition-colors ${isDark ? `border-gray-700 ${rIdx % 2 === 0 ? "bg-gray-800" : "bg-gray-800/50"} hover:bg-gray-700/60` : `border-gray-100 ${rIdx % 2 === 0 ? "bg-white" : "bg-gray-50/60"} hover:bg-blue-50/40`}`}>
                                    <td className={`px-2 py-1.5 text-right font-mono text-[10px] border-r select-none ${isDark ? "border-gray-700 text-gray-600" : "border-gray-200 text-gray-300"}`}>{rIdx + 1}</td>
                                    {filePreview.headers.map((_, cIdx) => (<td key={cIdx} className={`px-3 py-1.5 border-r last:border-r-0 whitespace-nowrap ${isDark ? "border-gray-700 text-gray-300" : "border-gray-100 text-gray-700"}`}>{row[cIdx] !== undefined && row[cIdx] !== "" ? String(row[cIdx]) : <span className={isDark ? "text-gray-700" : "text-gray-300"}>—</span>}</td>))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {mySchedule.length > 0 ? (() => {
                const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                const timeSlotKeys = [...new Set(mySchedule.map(s => `${s.start_time}|||${s.end_time}`))].sort((a, b) => {
                  const parseTime = (t) => { if (!t) return 0; const [time, mod] = t.split(" "); let [h, m] = time.split(":").map(Number); if (mod === "PM" && h < 12) h += 12; if (mod === "AM" && h === 12) h = 0; return h * 60 + m; };
                  return parseTime(a.split("|||")[0]) - parseTime(b.split("|||")[0]);
                });
                const lookup = {};
                mySchedule.forEach(s => { const key = `${s.start_time}|||${s.end_time}|||${s.day_of_week}`; if (!lookup[key]) lookup[key] = []; lookup[key].push(s.subject); });
                return (
                  <div className="space-y-4">
                    <h3 className={`text-lg font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}><Calendar className="w-5 h-5 text-blue-500" /> Weekly Teaching Schedule</h3>
                    <div className={`overflow-x-auto rounded-2xl border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} shadow-sm`}>
                      <table className="w-full text-xs text-center border-collapse">
                        <thead><tr className={isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-600 text-white"}><th className="px-3 py-3 font-bold uppercase tracking-wider text-left border-r border-blue-500/30 min-w-[110px]">Time</th>{DAYS.map(day => <th key={day} className="px-2 py-3 font-bold uppercase tracking-wider min-w-[90px] border-r border-blue-500/20 last:border-r-0">{day.slice(0, 3)}</th>)}</tr></thead>
                        <tbody>{timeSlotKeys.map((slotKey, rowIdx) => {
                          const [st, et] = slotKey.split("|||"); const isEven = rowIdx % 2 === 0; return (<tr key={slotKey} className={`border-t ${isDark ? `border-gray-700 ${isEven ? "bg-gray-800" : "bg-gray-750"}` : `border-gray-100 ${isEven ? "bg-white" : "bg-gray-50/50"}`}`}>
                            <td className={`px-3 py-2 text-left font-mono font-semibold border-r whitespace-nowrap ${isDark ? "text-gray-300 border-gray-700" : "text-gray-600 border-gray-200"}`}>{st}<br /><span className={`text-[10px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>{et}</span></td>
                            {DAYS.map((_, dayIdx) => { const key = `${st}|||${et}|||${dayIdx}`; const subs = lookup[key]; return (<td key={dayIdx} className={`px-2 py-2 border-r last:border-r-0 align-middle ${isDark ? "border-gray-700" : "border-gray-100"}`}>{subs ? <div className="flex flex-col gap-1">{subs.map((s, i) => <span key={i} className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold leading-tight ${isDark ? "bg-blue-900/50 text-blue-300 border border-blue-700/50" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>{s}</span>)}</div> : <span className={isDark ? "text-gray-700" : "text-gray-200"}>—</span>}</td>); })}
                          </tr>);
                        })}</tbody>
                      </table>
                    </div>
                  </div>
                );
              })() : (
                <div className={`text-center py-20 rounded-2xl border-2 border-dashed ${isDark ? "border-gray-800 bg-gray-900/50" : "border-gray-200 bg-white/50"}`}>
                  <div className="max-w-sm mx-auto"><div className={`w-20 h-20 mx-auto mb-6 rounded-3xl flex items-center justify-center ${isDark ? "bg-gray-800" : "bg-blue-50"}`}><Calendar className={`w-10 h-10 ${isDark ? "text-gray-600" : "text-blue-400"}`} /></div><h3 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>No Schedule Uploaded</h3><p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-gray-500"}`}>You haven't uploaded your teaching schedule yet. Use the upload section above to submit your Excel schedule file.</p></div>
                </div>
              )}
            </div>
          ) : exams.length === 0 ? (
            <div className={`text-center py-20 rounded-2xl border-2 border-dashed ${isDark ? "border-gray-800 bg-gray-900/50" : "border-gray-200 bg-white/50"}`}>
              <div className="max-w-sm mx-auto"><div className={`w-20 h-20 mx-auto mb-6 rounded-3xl flex items-center justify-center ${isDark ? "bg-gray-800" : "bg-gray-50"}`}><AlertCircle className={`w-10 h-10 ${isDark ? "text-gray-600" : "text-gray-400"}`} /></div><h3 className={`text-xl font-bold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>No Active Assignments</h3><p className={`text-sm leading-relaxed ${isDark ? "text-gray-400" : "text-gray-500"}`}>Your program head hasn't assigned any posted exams to you yet. You will receive a notification when a new assignment is available.</p></div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="flex items-center justify-between"><h3 className={`text-lg font-bold flex items-center gap-2 ${isDark ? "text-white" : "text-gray-900"}`}><BookOpen className="w-5 h-5 text-blue-500" /> Exam Supervision List</h3></div>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {exams.map((exam) => (
                  <div key={exam.id} className={`group relative rounded-2xl border transition-all duration-300 hover:scale-[1.02] hover:shadow-xl ${isDark ? "bg-gray-800 border-gray-700 hover:border-blue-500/50" : "bg-white border-gray-200 hover:border-blue-300"}`}>
                    <div className="absolute top-0 right-0 pt-4 pr-4 flex flex-col items-end gap-2"><div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tighter ${exam.proctor_attendance === "attended" ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" : "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"}`}>{exam.proctor_attendance === "attended" ? "Attended" : "Confirmed"}</div></div>
                    <div className="p-5">
                      <div className="flex flex-col gap-1 mb-4"><span className={`text-[10px] font-bold tracking-widest uppercase ${isDark ? "text-blue-500" : "text-blue-600"}`}>{exam.section_name}</span><h3 className={`text-lg font-bold leading-tight ${isDark ? "text-white" : "text-gray-900"}`}>{exam.subject_name}</h3><p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>ID: {exam.subject_code}</p></div>
                      <div className="space-y-3 pt-4 border-t dark:border-gray-700"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-blue-500" /><span className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-700"}`}>{formatDate(exam.exam_date)}</span></div></div><div className="flex items-center justify-between"><div className="flex items-center gap-2"><Clock className="w-4 h-4 text-purple-500" /><span className={`text-sm font-medium ${isDark ? "text-gray-200" : "text-gray-700"}`}>{exam.start_time} - {exam.end_time}</span></div></div><div className="flex items-center justify-between"><div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-pink-500" /><span className={`text-sm font-bold ${isDark ? "text-pink-400" : "text-pink-600"}`}>{exam.room}</span></div></div></div>
                      {exam.proctor_attendance === "pending" ? (
                        <button onClick={async () => { try { const response = await fetch(`http://localhost:8000/proctors/${user.proctor_id}/confirm-attendance/${exam.id}`, { method: 'POST' }); if (response.ok) { showSuccess("Attendance confirmed!"); const examsResponse = await fetch(`http://localhost:8000/exams?proctor_id=${user.proctor_id}&status=posted`); if (examsResponse.ok) setExams(await examsResponse.json()); } else { const err = await response.json(); showError(err.detail || "Failed to confirm attendance"); } } catch (error) { console.error(error); showError("An error occurred. Please try again."); } }} className="w-full mt-6 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/20"><UserCheck className="w-3.5 h-3.5" /> Confirm My Attendance</button>
                      ) : (
                        <div className={`w-full mt-6 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 ${isDark ? "bg-green-900/20 text-green-400 border border-green-800/50" : "bg-green-50 text-green-700 border border-green-100"}`}><UserCheck className="w-3.5 h-3.5 text-green-500" /> Attendance Confirmed</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}