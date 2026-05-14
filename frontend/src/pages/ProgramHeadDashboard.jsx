import React, { useState, useEffect } from "react";
import {
  Calendar,
  Users,
  LogOut,
  Settings,
  Bell,
  LayoutGrid,
  ClipboardList,
  Target,
  Sparkles,
  CalendarDays,
  ShieldCheck,
} from "lucide-react";
import ExamScheduler from "../components/ExamScheduler";
import AddProctor from "../components/AddProctor";
import { useTheme } from "../context/themeStore";
import ThemeToggle from "../components/ThemeToggle";
import { useUser } from "../context/userStore";
import { useNavigate } from "react-router-dom";
import DistributionRulesManager from "../components/DistributionRulesManager";
import GeneratedExamSchedules from "../components/GeneratedExamSchedules";
import ProctorMonitoring from "../components/ProctorMonitoring";
import SettingsDropdown from "../components/SettingsDropdown";

import api from "../api";
import { useToast } from "../context/ToastContext";

function ReschedulingRequests() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const { showSuccess, showError } = useToast();

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true);
      try {
        const res = await api.get("/program-head/reschedule-requests");
        const pending = res.data.filter(r => r.status === "pending");
        setRequests(pending);
      } catch (err) {
        console.error("Error fetching requests:", err);
      }
      setLoading(false);
    };
    fetchRequests();
  }, []);

  const handleReview = async (id, status, comments = "") => {
    try {
      const isApproved = status === "approved";
      const res = await api.post(`/program-head/approve-reschedule/${id}?approved=${isApproved}&comments=${encodeURIComponent(comments)}`);
      if (res.status === 200) {
        setRequests(requests.filter(req => req.id !== id));
        showSuccess(`Request ${status} successfully`);
      } else {
        showError("Failed to update request");
      }
    } catch (err) {
      console.error(err);
      showError("Error updating request");
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading requests...</div>;
  }

  if (requests.length === 0) {
    return <div className="text-center py-8 text-gray-500">No pending rescheduling requests.</div>;
  }

  return (
    <div className="space-y-6">
      {requests.map((req) => (
        <div
          key={req.id}
          className={`p-6 rounded-xl border shadow-lg ${isDark ? "bg-gray-700 border-gray-600" : "bg-white border-gray-300"}`}
        >
          <div className="flex justify-between items-start mb-4">
            <div>
              <h4 className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                {req.course_name} - {req.section_name}
              </h4>
              <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                Student: {req.student_name} ({req.student_id})
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => handleReview(req.id, "approved")}
                className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition"
              >
                Approve
              </button>
              <button
                onClick={() => {
                  const comments = prompt("Rejection reason:");
                  if (comments !== null) handleReview(req.id, "rejected", comments);
                }}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition"
              >
                Reject
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-600" : "bg-gray-50"}`}>
              <h5 className={`font-medium mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>Current Exam Details</h5>
              <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Date: {req.original_exam_date}<br />
                Time: {req.original_time}<br />
                Type: {req.exam_type}
              </p>
            </div>
            <div className={`p-4 rounded-lg ${isDark ? "bg-blue-900/30" : "bg-blue-50"}`}>
              <h5 className={`font-medium mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>Requested Reschedule</h5>
              <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Mode: {req.requested_mode}<br />
                Date: {req.preferred_date || "N/A"}<br />
                Time: {req.preferred_time || "N/A"}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <h5 className={`font-medium mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>Reason for Request</h5>
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
              <strong>{req.reason_type}:</strong> {req.detailed_explanation}
            </p>
            {req.supporting_file && (
              <p className={`text-sm mt-2 ${isDark ? "text-blue-300" : "text-blue-600"}`}>
                Supporting document uploaded
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}


export default function ProgramHeadDashboard() {
  const [activeTab, setActiveTab] = useState("generate");
  const { theme } = useTheme();
  const { logout } = useUser();
  const navigate = useNavigate();
  const isDark = theme === "dark";
  const { showWarning } = useToast();

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    const fetchNotifications = async () => {
      try {
        const res = await fetch("http://localhost:8000/notifications/program_head/admin");
        if (res.ok) {
          setNotifications(await res.json());
        }
      } catch (err) {
        console.error("Error fetching notifications:", err);
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, []);

  const markRead = async (id) => {
    try {
      await fetch(`http://localhost:8000/notifications/${id}/read`, { method: "PUT" });
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // Function to warn about missing schedules (used when generating)
  const checkMissingSchedulesBeforeGenerate = async () => {
    try {
      const res = await api.get("/proctors/missing-schedules");
      const missing = res.data.filter(p => !p.excluded);
      if (missing.length > 0) {
        showWarning(`${missing.length} proctor(s) have not uploaded their schedule. They will be skipped during scheduling. You can manage them in the "Proctor Management" tab.`);
      }
    } catch (err) {
      console.error("Failed to check missing schedules", err);
    }
  };

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
            <h2 className={`text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Program Head</h2>
            <p className={`text-xs font-medium tracking-wide uppercase mt-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>Exam Management</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
          {[
            { id: "generate", icon: Calendar, label: "Generate Schedule" },
            { id: "schedules", icon: CalendarDays, label: "Generated Schedules" },
            { id: "proctors", icon: Users, label: "Proctor Management" },
            { id: "rescheduling", icon: ClipboardList, label: "Rescheduling Requests" },
            { id: "monitoring", icon: ShieldCheck, label: "Proctor Monitoring" },
            { id: "rules", icon: Target, label: "Distribution Rules" },
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
                  {activeTab === "generate" ? "Exam Schedule Generator" :
                   activeTab === "schedules" ? "Generated Exam Schedules" :
                   activeTab === "proctors" ? "Proctor Management" :
                   activeTab === "monitoring" ? "Proctor Attendance Monitoring" :
                   activeTab === "rules" ? "Distribution Rules" :
                   "Rescheduling Requests"}
                </h1>
                <p className={`text-sm mt-1 font-medium transition-colors ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Dashboard • {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Mode
                </p>
              </div>
              
              <div className="flex items-center gap-4">
                <div className={`hidden md:flex px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${isDark ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-blue-50 text-blue-700 border border-blue-100"}`}>
                  Administrator
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

                  {/* Notifications Dropdown */}
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
                            <div key={notif.id} onClick={() => { if (!notif.is_read) markRead(notif.id); }} className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 mb-1 ${notif.is_read ? (isDark ? "hover:bg-slate-700/50 opacity-60" : "hover:bg-slate-50 opacity-60") : (isDark ? "bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/30" : "bg-blue-50 hover:bg-blue-100 border border-blue-100")}`}>
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

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-6">
            <div className={`rounded-2xl shadow-sm border overflow-hidden transition-colors duration-300 ${isDark ? "bg-slate-800/50 border-slate-700/50" : "bg-white border-slate-200"}`}>
              <div className="p-6 md:p-8">
                {activeTab === "generate" ? <ExamScheduler onBeforeGenerate={checkMissingSchedulesBeforeGenerate} /> :
                  activeTab === "schedules" ? <GeneratedExamSchedules /> :
                    activeTab === "proctors" ? <AddProctor /> :
                      activeTab === "rules" ? <DistributionRulesManager /> :
                        activeTab === "monitoring" ? <ProctorMonitoring /> :
                          <ReschedulingRequests />}
              </div>
            </div>

            {activeTab === "generate" && (
              <div className={`rounded-2xl shadow-sm border overflow-hidden transition-all duration-300 ${isDark ? "bg-slate-800/50 border-slate-700/50 hover:border-slate-600" : "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100 hover:shadow-md"}`}>
                <div className="p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${isDark ? "bg-slate-700 text-yellow-400" : "bg-white text-yellow-500"}`}>
                      <Sparkles className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className={`font-bold text-lg tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>How's Your Experience?</h3>
                      <p className={`text-sm mt-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>Tell us what you think and help us improve.</p>
                    </div>
                  </div>
                  <button className={`px-6 py-2.5 rounded-xl font-semibold text-sm transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 ${isDark ? "bg-slate-700 text-white hover:bg-slate-600" : "bg-white text-blue-700 border border-blue-200 hover:bg-blue-50"}`}>
                    Give Feedback
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}