import React, { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  UserCheck,
  Calendar,
  MapPin,
  Clock,
  Bell,
  AlertCircle,
  LayoutGrid,
  BookOpen,
  CalendarDays,
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  X,
  Trash2,
  Loader2
} from "lucide-react";
import { useTheme } from "../context/themeStore";
import { useUser } from "../context/userStore";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import SettingsDropdown from "../components/SettingsDropdown";
import api from "../api";

function ProctorManual() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [activeSubTab, setActiveSubTab] = useState("supervision");

  const topics = [
    { id: "supervision", label: "Supervision Duties", icon: CalendarDays },
    { id: "attendance", label: "Attendance Check-in", icon: UserCheck },
    { id: "schedule", label: "Teaching Schedule Uploads", icon: FileSpreadsheet },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className={`p-6 rounded-2xl border ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-100"}`}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-600 text-white shadow-md shadow-blue-500/20"}`}>
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
              Proctor Interactive Guide
            </h2>
            <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Understand how to track your assigned sessions, execute exam check-ins, and upload teaching hours to avoid scheduling conflicts.
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pb-2 border-b border-slate-200 dark:border-slate-700">
        {topics.map((t) => {
          const SubIcon = t.icon;
          const isSelected = activeSubTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                isSelected
                  ? isDark 
                    ? "bg-blue-600 text-white" 
                    : "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                  : isDark
                    ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                    : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              <SubIcon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className={`p-6 md:p-8 rounded-2xl border transition-all ${isDark ? "bg-slate-800/20 border-slate-800" : "bg-white border-slate-200/60"}`}>
        {activeSubTab === "supervision" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">1</div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Viewing Supervision Assignments</h3>
            </div>
            
            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              The **My Assignments** tab lists all the exam sessions you are scheduled to proctor. Each assignment contains the following details:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-1.5 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <Clock className="w-4 h-4 text-blue-500" /> Date & Time
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  The exact date and timeslot range (e.g. 7:30 AM - 9:00 AM) of the exam. Make sure to arrive 15 minutes before.
                </p>
              </div>
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-1.5 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <MapPin className="w-4 h-4 text-indigo-500" /> Location / Room
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  The room (e.g., Computer Lab 1, Room 403) allocated for the exam. Check seating guidelines for the room.
                </p>
              </div>
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-1.5 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <BookOpen className="w-4 h-4 text-emerald-500" /> Class Info
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  The subject code, subject description, and the section (e.g., BSIT 3-201) you will be supervising.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === "attendance" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">2</div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Executing Attendance Check-ins</h3>
            </div>
            
            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              To allow administrators to monitor live coverage of exams, you are required to perform a check-in upon arriving at the designated examination room.
            </p>

            <div className={`p-4 rounded-xl border ${isDark ? "bg-blue-950/20 border-blue-900/40 text-blue-200" : "bg-blue-50 border-blue-100 text-blue-800"} text-xs leading-relaxed`}>
              <strong className="block text-sm mb-1 font-bold">Check-in Steps:</strong>
              1. Open the <strong>My Assignments</strong> tab on your dashboard.<br />
              2. Find the active assignment for the current timeslot.<br />
              3. Click the <strong>Check In</strong> button. The status badge will change from "Pending" to "Checked In".<br />
              4. The Program Head will instantly see your updated attendance status on their monitoring board.
            </div>
          </div>
        )}

        {activeSubTab === "schedule" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">3</div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Teaching Schedule Upload</h3>
            </div>
            
            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Uploading your schedule is crucial to ensure you aren't assigned to proctor during hours when you have classes to teach.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-1.5 ${isDark ? "text-slate-200" : "text-slate-800"}`}>How to Upload</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Go to the <strong>My Schedule</strong> tab, select your official faculty load Excel sheet, and click <strong>Confirm Upload</strong>. The system will parse the classrooms, class slots, and automatically block out those slots.
                </p>
              </div>
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-1.5 ${isDark ? "text-slate-200" : "text-slate-800"}`}>Verification</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  After a successful upload, your weekly teaching grid will be displayed underneath. Verify that all timeslots align correctly.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
const parseTranslatedScheduleText = (text) => {
  if (!text) return null;
  const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
  const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  
  const schedule = [];
  const translations = [];
  let currentDay = null;
  let inTranslations = false;
  
  for (const line of lines) {
    if (line === "Subject Translation") {
      inTranslations = true;
      continue;
    }
    
    if (inTranslations) {
      if (line.startsWith("-")) {
        const parts = line.substring(1).split(":");
        if (parts.length >= 2) {
          translations.push({
            abbreviation: parts[0].trim(),
            meaning: parts.slice(1).join(":").trim()
          });
        }
      }
      continue;
    }
    
    if (days.includes(line)) {
      currentDay = { day: line, entries: [] };
      schedule.push(currentDay);
      continue;
    }
    
    if (currentDay && line.includes("—")) {
      const parts = line.split("—").map(p => p.trim());
      const timeRange = parts[0];
      const subjectAndType = parts[1];
      const roomPart = parts.length > 2 ? parts[2] : "";
      
      let subject = subjectAndType;
      let type = null;
      if (subjectAndType.includes("(Lab)")) {
        subject = subjectAndType.replace("(Lab)", "").trim();
        type = "Lab";
      } else if (subjectAndType.includes("(Lecture)")) {
        subject = subjectAndType.replace("(Lecture)", "").trim();
        type = "Lecture";
      }
      
      let room = "";
      if (roomPart.startsWith("Room:")) {
        room = roomPart.replace("Room:", "").trim();
      }
      
      currentDay.entries.push({
        time: timeRange,
        subject,
        type,
        room
      });
    }
  }
  
  return { schedule, translations };
};

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
  const [translatedSchedule, setTranslatedSchedule] = useState(null);
  const [scheduleView, setScheduleView] = useState("translated");
  const [filePreview, setFilePreview] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showDeleteScheduleModal, setShowDeleteScheduleModal] = useState(false);
  const [deletingSchedule, setDeletingSchedule] = useState(false);

  const handleDeleteSchedule = async () => {
    if (!user?.proctor_id) return;
    setDeletingSchedule(true);
    try {
      const res = await api.delete(`/proctors/${user.proctor_id}/schedule`);
      if (res.status === 200) {
        showSuccess(res.data.message || "Schedule deleted successfully!");
        setMySchedule([]);
        setTranslatedSchedule(null);
      } else {
        showError("Failed to delete schedule.");
      }
    } catch (err) {
      console.error(err);
      showError(err.response?.data?.detail || "Failed to delete schedule. Please try again.");
    } finally {
      setDeletingSchedule(false);
      setShowDeleteScheduleModal(false);
    }
  };

  const fetchMySchedule = useCallback(async () => {
    if (!user?.teacher_id) return;
    try {
      const res = await api.get("/proctors/schedules");
      const allSchedules = res.data;
      const mine = allSchedules.filter(s => s.teacher_name === user.name);
      setMySchedule(mine);
      
      // Also fetch the translated schedule if proctor_id is available
      if (user?.proctor_id) {
        try {
          const transRes = await api.get(`/proctors/${user.proctor_id}/translated-schedule`);
          setTranslatedSchedule(transRes.data.translated_schedule || null);
        } catch (transErr) {
          console.error("Failed to fetch translated schedule", transErr);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [user?.teacher_id, user?.proctor_id, user?.name]);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get(`/notifications/proctor/${user.id}`);
      setNotifications(res.data);
    } catch (err) {
      console.error("Failed to fetch notifications", err);
    }
  }, [user?.id]);

  useEffect(() => {
    const fetchMyExams = async () => {
      if (!user?.proctor_id) {
        setLoading(false);
        return;
      }
      try {
        const response = await api.get(`/exams?proctor_id=${user.proctor_id}&status=posted`);
        setExams(response.data);
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
  }, [user?.proctor_id, activeTab, fetchMySchedule]);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
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
      const res = await api.post(`/proctors/${user.proctor_id}/upload-my-schedule`, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      showSuccess("Schedule uploaded successfully!");
      setSelectedFile(null);
      setFilePreview(null);
      if (res.data.translated_schedule) {
        setTranslatedSchedule(res.data.translated_schedule);
      }
      const resSched = await api.get("/proctors/schedules");
      const allSchedules = resSched.data;
      const mine = allSchedules.filter(s => s.teacher_name === user.name);
      setMySchedule(mine);
    } catch (err) {
      const errMsg = err.response?.data?.detail || err.message || "Failed to upload schedule";
      showError(errMsg);
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmAttendance = async (examId) => {
    try {
      await api.post(`/proctors/${user.proctor_id}/confirm-attendance/${examId}`);
      showSuccess("Attendance confirmed!");
      const examsResponse = await api.get(`/exams?proctor_id=${user.proctor_id}&status=posted`);
      setExams(examsResponse.data);
    } catch (error) {
      console.error(error);
      const errMsg = error.response?.data?.detail || "An error occurred. Please try again.";
      showError(errMsg);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const openNotifications = () => {
    setIsMobileMenuOpen(false);
    setShowNotifications((current) => !current);
  };

  const openMobileMenu = () => {
    setShowNotifications(false);
    setIsMobileMenuOpen(true);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const parts = dateStr.split(", ");
    if (parts.length < 3) return dateStr;
    const parsedDate = new Date(`${parts[1]}, ${parts[2]}`);
    return parsedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatNotifTime = (createdAt) => {
    if (!createdAt) return "Just now";
    const normalized = createdAt.endsWith("Z") ? createdAt : createdAt + "Z";
    const date = new Date(normalized);
    if (isNaN(date)) return "Just now";
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);
    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return "Yesterday";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
      " at " + date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
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
    <div className={`min-h-dvh w-full overflow-x-hidden flex transition-colors duration-300 ${isDark ? "bg-slate-900" : "bg-slate-50"}`}>
      {/* Notifications Overlay */}
      {showNotifications && (
        <div className="fixed inset-0 z-40 bg-slate-950/10 transition-opacity" onClick={() => setShowNotifications(false)}></div>
      )}

      {/* Notifications Panel - rendered at top level to escape header stacking context */}
      {showNotifications && (
        <div onClick={(e) => e.stopPropagation()} className={`fixed left-3 right-3 top-20 sm:left-auto sm:right-6 sm:top-24 sm:w-96 max-h-[min(24rem,calc(100dvh-6rem))] flex flex-col rounded-2xl shadow-2xl border z-50 transform origin-top-right transition-all animate-in fade-in scale-95 duration-200 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
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
                        {formatNotifTime(notif.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-md lg:hidden transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 w-[min(18rem,85vw)] flex flex-col border-r transition-transform duration-300 z-50 transform ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${isDark ? "bg-slate-900/95 lg:bg-slate-900/80 border-slate-800 backdrop-blur-xl" : "bg-white/95 lg:bg-white border-slate-200 backdrop-blur-xl"}`}>
        <div className="p-6 flex flex-col items-center gap-4 border-b border-transparent relative">
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            type="button"
            aria-label="Close menu"
            className="absolute top-4 right-4 p-2 rounded-lg lg:hidden text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
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
            { id: "manual", icon: BookOpen, label: "User Manual" },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsMobileMenuOpen(false);
                }}
                type="button"
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
      <main className="flex-1 flex flex-col h-dvh overflow-hidden relative min-w-0">
        <header className={`sticky top-0 z-20 backdrop-blur-2xl border-b transition-all duration-300 ${isDark ? "bg-slate-900/70 border-slate-800" : "bg-white/70 border-slate-200"}`}>
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button 
                  onClick={openMobileMenu}
                  type="button"
                  aria-label="Open menu"
                  className={`lg:hidden p-2 -ml-2 rounded-xl transition-colors ${isDark ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  <LayoutGrid className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <div className="min-w-0">
                  <h1 className={`text-base sm:text-2xl font-bold tracking-tight transition-colors truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                    {activeTab === "assignments" ? "My Proctoring Assignments" : activeTab === "schedule" ? "My Teaching Schedule" : activeTab === "manual" ? "User Manual" : activeTab === "notifications" ? "Notifications" : "Settings"}
                  </h1>
                  <p className={`text-xs sm:text-sm mt-0.5 sm:mt-1 font-medium transition-colors truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Welcome back, {user?.name || "Proctor"}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                <div className={`hidden md:flex px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${isDark ? "bg-green-500/20 text-green-400 border border-green-500/30" : "bg-green-50 text-green-700 border border-green-100"}`}>
                  PROCTOR
                </div>
                
                <div className="relative">
                  <button
                    onClick={openNotifications}
                    type="button"
                    aria-label="Open notifications"
                    className={`relative p-2 sm:p-2.5 rounded-xl transition-all duration-300 ${isDark ? "text-slate-300 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900 animate-pulse"></span>
                    )}
                  </button>
                </div>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block"></div>
                <SettingsDropdown onLogout={handleLogout} isDark={isDark} />
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar relative">
          {/* Decorative background blurs */}
          <div className="absolute top-0 left-0 w-full h-96 overflow-hidden pointer-events-none z-0">
            <div className={`absolute top-[-20%] left-[-10%] w-[40%] h-[60%] rounded-full mix-blend-multiply filter blur-[100px] opacity-30 ${isDark ? "bg-blue-900" : "bg-blue-200"}`}></div>
            <div className={`absolute top-[10%] right-[-5%] w-[35%] h-[50%] rounded-full mix-blend-multiply filter blur-[100px] opacity-30 ${isDark ? "bg-indigo-900" : "bg-indigo-200"}`}></div>
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-5 sm:pt-8 pb-4">
            <div className={`relative overflow-hidden p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl shadow-sm border flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 ${isDark ? "bg-slate-800/80 border-slate-700/50 backdrop-blur-xl" : "bg-white/80 border-slate-200 backdrop-blur-xl"}`}>
              <div className="absolute right-0 top-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
              <div className={`w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-bold shadow-inner relative z-10 ${isDark ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white" : "bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 border border-blue-200"}`}>
                {(user?.name || "P").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <h2 className={`text-xl sm:text-3xl font-bold tracking-tight break-words ${isDark ? "text-white" : "text-gray-900"}`}>{user?.name || "Proctor Name"}</h2>
                <div className="flex flex-wrap gap-2 sm:gap-4 mt-3">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium border ${isDark ? "bg-slate-700/50 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                    <UserCheck className="w-4 h-4 text-emerald-500" />
                    <span>Licensed Proctor</span>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium border ${isDark ? "bg-slate-700/50 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                    <LayoutGrid className="w-4 h-4 text-blue-500" />
                    <span>{exams.length} Active Assignment{exams.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
              <div className="hidden lg:block relative z-10">
                <div className={`px-5 py-3 rounded-2xl border backdrop-blur-md shadow-sm ${isDark ? "bg-slate-800/80 border-slate-700/50" : "bg-white/80 border-slate-200"}`}>
                  <p className={`text-[10px] uppercase font-bold tracking-widest ${isDark ? "text-slate-500" : "text-slate-400"}`}>Current Status</p>
                  <p className={`text-sm font-bold text-emerald-500 mt-1 flex items-center gap-2`}>
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Online & Active
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative z-10 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className={`w-12 h-12 rounded-full border-4 ${isDark ? "border-slate-800" : "border-slate-200"} border-t-blue-500 animate-spin`}></div>
                <p className={`text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>Fetching your supervisory schedule...</p>
              </div>
            ) : activeTab === "schedule" ? (
              <div className="space-y-6 sm:space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className={`p-4 sm:p-8 rounded-2xl sm:rounded-3xl border ${isDark ? "bg-slate-800/80 border-slate-700/50 backdrop-blur-xl" : "bg-white/80 border-slate-200 backdrop-blur-xl shadow-sm"}`}>
                  <div className="flex items-start gap-3 sm:gap-4 mb-6">
                    <div className={`p-3 rounded-2xl shrink-0 ${isDark ? "bg-emerald-500/20" : "bg-emerald-50"}`}>
                      <FileSpreadsheet className={`w-6 h-6 ${isDark ? "text-emerald-400" : "text-emerald-500"}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Upload My Teaching Schedule</h3>
                      <p className={`text-xs sm:text-sm mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Upload your individual schedule (Excel format) to update your availability</p>
                    </div>
                  </div>
                  {!selectedFile ? (
                    <div className={`border-2 border-dashed rounded-2xl p-6 sm:p-12 flex flex-col items-center justify-center transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 border-slate-300 dark:border-slate-700`}>
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
                        <Upload className={`w-8 h-8 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
                      </div>
                      <p className={`text-sm mb-6 text-center ${isDark ? "text-slate-400" : "text-slate-500"}`}>Drag and drop your Excel file here or click to browse</p>
                      <label className="cursor-pointer w-full sm:w-auto text-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition shadow-lg shadow-blue-500/20 hover:-translate-y-0.5">
                        Select Excel File
                        <input type="file" className="hidden" accept=".xlsx, .xls" onChange={(e) => { const f = e.target.files[0]; if (!f) return; setSelectedFile(f); parseExcelPreview(f); }} />
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className={`flex flex-col sm:flex-row items-start sm:items-center gap-4 px-5 py-4 rounded-2xl border ${isDark ? "bg-slate-700/40 border-emerald-700/40" : "bg-emerald-50/50 border-emerald-200"}`}>
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate ${isDark ? "text-gray-200" : "text-gray-800"}`}>{selectedFile.name}</p>
                            <p className={`text-xs mt-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{filePreview ? `${filePreview.rows.length} data row${filePreview.rows.length !== 1 ? 's' : ''} · ${filePreview.headers.length} column${filePreview.headers.length !== 1 ? 's' : ''}` : 'Reading file…'}</p>
                          </div>
                        </div>
                        <div className="flex gap-3 w-full sm:w-auto shrink-0">
                          <button onClick={() => { setSelectedFile(null); setFilePreview(null); }} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition ${isDark ? "text-gray-300 hover:text-white bg-slate-700 hover:bg-slate-600" : "text-gray-600 hover:text-gray-900 bg-white border border-gray-200 hover:bg-gray-50"}`}>Cancel</button>
                          <button onClick={handleFileUpload} disabled={uploading} className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
                            {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <Upload className="w-4 h-4" />}
                            {uploading ? "Uploading…" : "Confirm Upload"}
                          </button>
                        </div>
                      </div>
                      {filePreview && (
                        <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-white"}`}>
                          <div className={`px-5 py-3 flex items-center gap-2 border-b text-xs font-bold uppercase tracking-wider ${isDark ? "bg-slate-800/80 border-slate-700 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                            <FileSpreadsheet className="w-4 h-4" />
                            Preview — {filePreview.sheetName || 'Sheet 1'}
                          </div>
                          <div className="overflow-x-auto max-h-[60dvh] sm:max-h-80 overflow-y-auto custom-scrollbar">
                            {filePreview.headers.length === 0 ? (
                              <p className={`text-center py-8 text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>The file appears to be empty.</p>
                            ) : (
                              <table className="w-full text-xs border-collapse min-w-[560px]">
                                <thead className={`sticky top-0 z-10 ${isDark ? "bg-blue-900/80 text-blue-300 backdrop-blur-md" : "bg-blue-600 text-white"}`}>
                                  <tr><th className={`px-3 py-3 text-right font-bold border-r w-10 ${isDark ? "border-blue-800/50 text-blue-400/70" : "border-blue-500/40 text-blue-200/70"}`}>#</th>
                                    {filePreview.headers.map((h, i) => (<th key={i} className={`px-4 py-3 text-left font-bold whitespace-nowrap border-r last:border-r-0 ${isDark ? "border-blue-800/50" : "border-blue-500/30"}`}>{h || <span className="italic opacity-50">Col {i + 1}</span>}</th>))}</tr>
                                </thead>
                                <tbody>
                                  {filePreview.rows.map((row, rIdx) => (
                                    <tr key={rIdx} className={`border-t transition-colors ${isDark ? `border-slate-700/50 ${rIdx % 2 === 0 ? "bg-slate-800/30" : "bg-slate-800/10"} hover:bg-slate-700/50` : `border-slate-100 ${rIdx % 2 === 0 ? "bg-white" : "bg-slate-50/50"} hover:bg-blue-50/30`}`}>
                                      <td className={`px-3 py-2 text-right font-mono text-[10px] border-r select-none ${isDark ? "border-slate-700 text-slate-500" : "border-slate-200 text-slate-400"}`}>{rIdx + 1}</td>
                                      {filePreview.headers.map((_, cIdx) => (<td key={cIdx} className={`px-4 py-2 border-r last:border-r-0 whitespace-nowrap ${isDark ? "border-slate-700/50 text-slate-300" : "border-slate-100 text-slate-700"}`}>{row[cIdx] !== undefined && row[cIdx] !== "" ? String(row[cIdx]) : <span className={isDark ? "text-slate-600" : "text-slate-300"}>—</span>}</td>))}
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
                  const parsed = parseTranslatedScheduleText(translatedSchedule);

                  return (
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-2">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-xl ${isDark ? "bg-blue-500/20" : "bg-blue-100"}`}>
                            <Calendar className={`w-5 h-5 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                          </div>
                          <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Weekly Teaching Schedule</h3>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {translatedSchedule && (
                            <div className={`flex items-center p-1 rounded-xl border ${isDark ? "bg-slate-900/60 border-slate-800" : "bg-slate-100/80 border-slate-200"}`}>
                              <button
                                onClick={() => setScheduleView("translated")}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  scheduleView === "translated"
                                    ? (isDark ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" : "bg-white text-blue-600 shadow-sm")
                                    : (isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800")
                                }`}
                              >
                                Translated View
                              </button>
                              <button
                                onClick={() => setScheduleView("grid")}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                  scheduleView === "grid"
                                    ? (isDark ? "bg-blue-600 text-white shadow-md shadow-blue-500/10" : "bg-white text-blue-600 shadow-sm")
                                    : (isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800")
                                }`}
                              >
                                Calendar Grid
                              </button>
                            </div>
                          )}
                          <button
                            onClick={() => setShowDeleteScheduleModal(true)}
                            className="bg-red-500 hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-700 text-white px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2 transition-all hover:scale-105 active:scale-95 font-bold text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete My Schedule
                          </button>
                        </div>
                      </div>

                      {scheduleView === "translated" && parsed && parsed.schedule.length > 0 ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {parsed.schedule.map((dayObj) => (
                              <div
                                key={dayObj.day}
                                className={`p-5 rounded-2xl border transition-all ${
                                  isDark
                                    ? "bg-slate-800/80 border-slate-700/50 backdrop-blur-xl hover:border-slate-600"
                                    : "bg-white border-slate-200 shadow-sm hover:shadow-md"
                                }`}
                              >
                                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-700/50">
                                  <h4 className={`font-bold text-base ${isDark ? "text-white" : "text-slate-800"}`}>{dayObj.day}</h4>
                                  <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold ${
                                    isDark ? "bg-slate-700 text-slate-350" : "bg-slate-100 text-slate-600"
                                  }`}>{dayObj.entries.length} items</span>
                                </div>
                                <div className="space-y-3">
                                  {dayObj.entries.length === 0 ? (
                                    <p className={`text-xs italic py-2 ${isDark ? "text-slate-500" : "text-slate-400"}`}>No classes scheduled</p>
                                  ) : (
                                    dayObj.entries.map((entry, idx) => {
                                      const isBreak = entry.subject.toLowerCase().includes("break") || entry.subject.toLowerCase() === "break";
                                      const isAdmin = entry.subject.toLowerCase().includes("admin");
                                      
                                      let badgeColor = isDark
                                        ? "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                        : "bg-blue-50 text-blue-750 border-blue-200";
                                      
                                      if (isBreak) {
                                        badgeColor = isDark
                                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                          : "bg-emerald-50 text-emerald-750 border-emerald-200";
                                      } else if (isAdmin) {
                                        badgeColor = isDark
                                          ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
                                          : "bg-amber-50 text-amber-750 border-amber-200";
                                      } else if (entry.type === "Lab") {
                                        badgeColor = isDark
                                          ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                          : "bg-purple-50 text-purple-750 border-purple-200";
                                      }
                                      
                                      return (
                                        <div
                                          key={idx}
                                          className={`p-3 rounded-xl border flex flex-col gap-1.5 transition-all ${
                                            isDark
                                              ? "bg-slate-900/40 border-slate-800 hover:bg-slate-900/60"
                                              : "bg-slate-50/50 border-slate-100 hover:bg-slate-50"
                                          }`}
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <span className={`text-[10px] font-bold ${isDark ? "text-slate-400" : "text-slate-500"}`}>{entry.time}</span>
                                            {(entry.type || isBreak || isAdmin) && (
                                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase tracking-wider ${badgeColor}`}>
                                                {isBreak ? "Break" : isAdmin ? "Admin" : entry.type}
                                              </span>
                                            )}
                                          </div>
                                          <div className={`text-xs font-bold leading-snug ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                                            {entry.subject}
                                          </div>
                                          {entry.room && (
                                            <div className={`flex items-center gap-1 text-[10px] ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                              <span className="opacity-60">Room:</span>
                                              <span className="font-semibold">{entry.room}</span>
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>

                          {parsed.translations.length > 0 && (
                            <div className={`p-6 rounded-2xl border ${
                              isDark ? "bg-slate-800/80 border-slate-700/50 backdrop-blur-xl" : "bg-white border-slate-200 shadow-sm"
                            }`}>
                              <h4 className={`font-bold text-sm mb-3 uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                                Subject Translation Reference
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                {parsed.translations.map((trans) => (
                                  <div
                                    key={trans.abbreviation}
                                    className={`px-3 py-2 rounded-xl border flex items-center justify-between text-xs gap-3 ${
                                      isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"
                                    }`}
                                  >
                                    <span className="font-mono font-bold text-blue-500 dark:text-blue-400">{trans.abbreviation}</span>
                                    <span className={`text-right font-medium truncate ${isDark ? "text-slate-300" : "text-slate-650"}`} title={trans.meaning}>
                                      {trans.meaning}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={`overflow-x-auto rounded-2xl sm:rounded-3xl border ${isDark ? "bg-slate-800/80 border-slate-700/50 backdrop-blur-xl" : "bg-white/80 border-slate-200 backdrop-blur-xl"} shadow-sm custom-scrollbar`}>
                          <table className="w-full text-xs text-center border-collapse min-w-[720px]">
                            <thead>
                              <tr className={isDark ? "bg-blue-900/60 text-blue-200" : "bg-blue-600 text-white"}>
                                <th className={`px-4 py-4 font-bold uppercase tracking-wider text-left border-r ${isDark ? "border-blue-800/50" : "border-blue-500/30"} min-w-[120px]`}>Time</th>
                                {DAYS.map(day => <th key={day} className={`px-3 py-4 font-bold uppercase tracking-wider min-w-[110px] border-r last:border-r-0 ${isDark ? "border-blue-800/50" : "border-blue-500/30"}`}>{day.slice(0, 3)}</th>)}
                              </tr>
                            </thead>
                            <tbody>{timeSlotKeys.map((slotKey, rowIdx) => {
                              const [st, et] = slotKey.split("|||"); const isEven = rowIdx % 2 === 0; return (<tr key={slotKey} className={`border-t transition-colors ${isDark ? `border-slate-700/50 ${isEven ? "bg-slate-800/30" : "bg-slate-800/10"} hover:bg-slate-700/50` : `border-slate-100 ${isEven ? "bg-white" : "bg-slate-50/50"} hover:bg-blue-50/30`}`}>
                                <td className={`px-4 py-3 text-left font-mono font-semibold border-r whitespace-nowrap ${isDark ? "text-slate-300 border-slate-700/50" : "text-slate-700 border-slate-200"}`}>{st}<br /><span className={`text-[10px] font-normal ${isDark ? "text-slate-500" : "text-slate-400"}`}>{et}</span></td>
                                {DAYS.map((_, dayIdx) => { const key = `${st}|||${et}|||${dayIdx}`; const subs = lookup[key]; return (<td key={dayIdx} className={`px-3 py-3 border-r last:border-r-0 align-middle ${isDark ? "border-slate-700/50" : "border-slate-100"}`}>{subs ? <div className="flex flex-col gap-1.5">{subs.map((s, i) => <span key={i} className={`inline-flex justify-center px-2 py-1 rounded-lg text-[10px] font-bold leading-tight shadow-sm ${isDark ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>{s}</span>)}</div> : <span className={isDark ? "text-slate-700" : "text-slate-300"}>—</span>}</td>); })}
                              </tr>);
                            })}</tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className={`text-center py-12 sm:py-20 px-4 rounded-2xl sm:rounded-3xl border-2 border-dashed transition-colors ${isDark ? "border-slate-700 bg-slate-800/30 hover:bg-slate-800/50" : "border-slate-300 bg-slate-50/50 hover:bg-slate-50"}`}>
                    <div className="max-w-sm mx-auto">
                      <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center shadow-inner ${isDark ? "bg-slate-800" : "bg-white"}`}>
                        <Calendar className={`w-12 h-12 ${isDark ? "text-slate-600" : "text-blue-300"}`} />
                      </div>
                      <h3 className={`text-xl font-bold mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>No Schedule Found</h3>
                      <p className={`text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>You haven't uploaded your teaching schedule yet. Use the upload section above to submit your Excel schedule file.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === "manual" ? (
              <ProctorManual />
            ) : exams.length === 0 ? (
              <div className={`text-center py-14 sm:py-24 px-4 rounded-2xl sm:rounded-3xl border-2 border-dashed transition-all animate-in fade-in zoom-in-95 duration-500 ${isDark ? "border-slate-700 bg-slate-800/30" : "border-slate-300 bg-white/50 backdrop-blur-sm"}`}>
                <div className="max-w-sm mx-auto">
                  <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center shadow-inner ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
                    <AlertCircle className={`w-12 h-12 ${isDark ? "text-slate-600" : "text-slate-400"}`} />
                  </div>
                  <h3 className={`text-xl sm:text-2xl font-bold mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>No Active Assignments</h3>
                  <p className={`text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>Your program head hasn't assigned any posted exams to you yet. You will receive a notification when a new assignment is available.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between px-1 sm:px-2">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${isDark ? "bg-blue-500/20" : "bg-blue-100"}`}>
                      <BookOpen className={`w-5 h-5 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                    </div>
                    <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Exam Supervision List</h3>
                  </div>
                </div>
                <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
                  {exams.map((exam) => (
                    <div key={exam.id} className={`group relative rounded-2xl sm:rounded-3xl border transition-all duration-300 hover:-translate-y-1 hover:shadow-xl overflow-hidden ${isDark ? "bg-slate-800/80 border-slate-700/50 hover:border-blue-500/50 backdrop-blur-xl" : "bg-white/90 border-slate-200 hover:border-blue-300 backdrop-blur-xl shadow-sm"}`}>
                      {/* Decorative top gradient */}
                      <div className={`absolute top-0 inset-x-0 h-1 ${exam.proctor_attendance === "attended" ? "bg-gradient-to-r from-emerald-400 to-emerald-600" : "bg-gradient-to-r from-blue-400 to-blue-600"}`}></div>
                      
                      <div className="absolute top-4 right-4 sm:top-5 sm:right-5 flex flex-col items-end gap-2">
                        <div className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider shadow-sm ${exam.proctor_attendance === "attended" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30" : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 border border-blue-200 dark:border-blue-500/30"}`}>
                          {exam.proctor_attendance === "attended" ? "Attended" : "Confirmed"}
                        </div>
                      </div>
                      
                      <div className="p-4 sm:p-6">
                        <div className="flex flex-col gap-1.5 mb-5 pr-16 sm:pr-20">
                          <span className={`inline-block w-fit px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase mb-1 ${isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-50 text-blue-600"}`}>{exam.section_name}</span>
                          <h3 className={`text-lg sm:text-xl font-bold leading-tight break-words ${isDark ? "text-white" : "text-slate-900"}`}>{exam.subject_name}</h3>
                          <p className={`text-xs font-medium ${isDark ? "text-slate-500" : "text-slate-500"}`}>ID: {exam.subject_code}</p>
                        </div>
                        
                        <div className={`space-y-3.5 pt-5 border-t ${isDark ? "border-slate-700/50" : "border-slate-100"}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-1.5 rounded-lg ${isDark ? "bg-blue-500/10" : "bg-blue-50"}`}><Calendar className={`w-4 h-4 ${isDark ? "text-blue-400" : "text-blue-500"}`} /></div>
                              <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>{formatDate(exam.exam_date)}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-1.5 rounded-lg ${isDark ? "bg-purple-500/10" : "bg-purple-50"}`}><Clock className={`w-4 h-4 ${isDark ? "text-purple-400" : "text-purple-500"}`} /></div>
                              <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>{exam.start_time} - {exam.end_time}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className={`p-1.5 rounded-lg ${isDark ? "bg-pink-500/10" : "bg-pink-50"}`}><MapPin className={`w-4 h-4 ${isDark ? "text-pink-400" : "text-pink-500"}`} /></div>
                              <span className={`text-sm font-bold ${isDark ? "text-pink-400" : "text-pink-600"}`}>{exam.room}</span>
                            </div>
                          </div>
                        </div>
                        
                        {exam.proctor_attendance === "pending" ? (
                          <button onClick={() => handleConfirmAttendance(exam.id)} className="w-full mt-7 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5">
                            <UserCheck className="w-4 h-4" /> 
                            Confirm My Attendance
                          </button>
                        ) : (
                          <div className={`w-full mt-7 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${isDark ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                            <UserCheck className="w-4 h-4 text-emerald-500" /> 
                            Attendance Confirmed
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Delete Schedule Confirmation Modal */}
      {showDeleteScheduleModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className={`p-8 rounded-3xl shadow-2xl max-w-md w-full transform transition-all scale-100 ${isDark ? "bg-slate-800 border border-slate-700" : "bg-white border border-slate-200"}`}>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-red-100 dark:bg-red-900/50 shadow-lg shadow-red-200/50 dark:shadow-red-900/20">
                <Trash2 className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className={`text-2xl font-bold mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
                Delete My Schedule?
              </h3>
              <p className={`mb-8 text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-500"}`}>
                Are you sure you want to delete your uploaded teaching schedule? Doing so will clear all blocked slots and revert to an empty schedule, notifying the administrator. This action is permanent.
              </p>
              <div className="flex gap-4 w-full">
                <button
                  onClick={() => setShowDeleteScheduleModal(false)}
                  disabled={deletingSchedule}
                  className={`flex-1 py-3.5 rounded-xl font-bold transition-all active:scale-95 disabled:opacity-55 ${isDark ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-800"}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteSchedule}
                  disabled={deletingSchedule}
                  className="flex-1 py-3.5 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white transition-all shadow-lg shadow-red-600/30 active:scale-95 disabled:opacity-55 flex items-center justify-center gap-2"
                >
                  {deletingSchedule ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <span>Yes, Delete</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
