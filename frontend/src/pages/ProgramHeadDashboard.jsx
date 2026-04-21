import React, { useState, useEffect } from "react";
import {
  Calendar,
  Users,
  LogOut,
  Settings,
  Bell,
  LayoutGrid,
  TrendingUp,
  ClipboardList,
  BookOpen,
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
        // Filter for pending only, if desire
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
        // Remove from list
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
            {/* Current Exam */}
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-600" : "bg-gray-50"}`}>
              <h5 className={`font-medium mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>Current Exam Details</h5>
              <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Date: {req.original_exam_date}<br />
                Time: {req.original_time}<br />
                Type: {req.exam_type}
              </p>
            </div>

            {/* Requested Exam */}
            <div className={`p-4 rounded-lg ${isDark ? "bg-blue-900/30" : "bg-blue-50"}`}>
              <h5 className={`font-medium mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>Requested Reschedule</h5>
              <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Mode: {req.requested_mode}<br />
                Date: {req.preferred_date || "N/A"}<br />
                Time: {req.preferred_time || "N/A"}
              </p>
            </div>
          </div>

          {/* Reason */}
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
    const interval = setInterval(fetchNotifications, 10000); // Poll every 10s
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

  return (
    <div
      className={`min-h-screen flex ${isDark ? "bg-gray-900" : "bg-gray-50"
        }`}
    >
      {/* Background - Clean solid handled by parent */}

      {showNotifications && (
        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowNotifications(false)}></div>
      )}

      {/* Sidebar */}
      <aside
        className={`w-64 px-4 py-6 flex flex-col gap-6 border-r ${isDark
          ? "bg-gray-900 border-gray-700"
          : "bg-white border-gray-200"
          }`}
      >
        {/* Logo Section */}
        <div className="flex flex-col items-center gap-3">
          <div
            className={`w-16 h-16 rounded-xl flex items-center justify-center ${isDark
              ? "bg-blue-600"
              : "bg-blue-700"
              }`}
          >
            <img
              src="/images.png"
              alt="STI Logo"
              className="rounded-xl h-12 w-12 object-contain"
            />
          </div>
          <div className="text-center">
            <h2
              className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"
                }`}
            >
              Program Head
            </h2>
            <p
              className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"
                }`}
            >
              Exam Management
            </p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-2">
          <button
            onClick={() => setActiveTab("generate")}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${activeTab === "generate"
              ? "bg-blue-50 text-blue-700"
              : isDark
                ? "text-gray-300 hover:bg-gray-700"
                : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            <Calendar className="w-5 h-5" />
            <span className="text-sm font-medium">Generate Exam Schedule</span>
          </button>

          <button
            onClick={() => setActiveTab("schedules")}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${activeTab === "schedules"
              ? "bg-blue-50 text-blue-700"
              : isDark
                ? "text-gray-300 hover:bg-gray-700"
                : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            <CalendarDays className="w-5 h-5" />
            <span className="text-sm font-medium">Generated Schedules</span>
          </button>

          <button
            onClick={() => setActiveTab("proctors")}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${activeTab === "proctors"
              ? "bg-blue-50 text-blue-700"
              : isDark
                ? "text-gray-300 hover:bg-gray-700"
                : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            <Users className="w-5 h-5" />
            <span className="text-sm font-medium">Add Proctor</span>
          </button>

          <button
            onClick={() => setActiveTab("rescheduling")}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${activeTab === "rescheduling"
              ? "bg-blue-50 text-blue-700"
              : isDark
                ? "text-gray-300 hover:bg-gray-700"
                : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            <ClipboardList className="w-5 h-5" />
            <span className="text-sm font-medium">Rescheduling Requests</span>
          </button>

          <button
            onClick={() => setActiveTab("monitoring")}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${activeTab === "monitoring"
              ? "bg-blue-50 text-blue-700"
              : isDark
                ? "text-gray-300 hover:bg-gray-700"
                : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="text-sm font-medium">Proctor Monitoring</span>
          </button>

          <button
            onClick={() => setActiveTab("rules")}
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${activeTab === "rules"
              ? "bg-blue-50 text-blue-700"
              : isDark
                ? "text-gray-300 hover:bg-gray-700"
                : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            <Target className="w-5 h-5" />
            <span className="text-sm font-medium">Distribution Rules</span>
          </button>

          <button
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${isDark
              ? "text-gray-300 hover:bg-gray-700"
              : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            <TrendingUp className="w-5 h-5" />
            <span className="text-sm font-medium">Analytics</span>
          </button>

          <button
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${isDark
              ? "text-gray-300 hover:bg-gray-700"
              : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            <ClipboardList className="w-5 h-5" />
            <span className="text-sm font-medium">Reports</span>
          </button>

          <button
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${isDark
              ? "text-gray-300 hover:bg-gray-700"
              : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            <BookOpen className="w-5 h-5" />
            <span className="text-sm font-medium">Resources</span>
          </button>

          <button
            className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg transition ${isDark
              ? "text-gray-300 hover:bg-gray-700"
              : "text-gray-700 hover:bg-gray-100"
              }`}
          >
            <Settings className="w-5 h-5" />
            <span className="text-sm font-medium">Settings</span>
          </button>
        </nav>

        {/* Logout Button */}
        {/* Logout Button Removed from Sidebar */}

        {/* Footer */}
        <footer
          className={`text-xs text-center ${isDark ? "text-gray-500" : "text-gray-400"
            }`}
        >
          v1.0 • STI System
        </footer>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {/* Header */}
        <header
          className={`sticky top-0 z-50 backdrop-blur-xl border-b ${isDark
            ? "bg-gray-900/70 border-gray-700"
            : "bg-white/70 border-gray-200"
            }`}
        >
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1
                  className={`text-2xl font-bold ${isDark
                    ? "text-white"
                    : "text-gray-900"
                    }`}
                >
                  {activeTab === "generate"
                    ? "Exam Schedule Generator"
                    : activeTab === "schedules"
                      ? "Generated Exam Schedules"
                      : activeTab === "proctors"
                        ? "Proctor Management"
                        : activeTab === "monitoring"
                          ? "Proctor Attendance Monitoring"
                          : "Rescheduling Requests"}
                </h1>
                <p
                  className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"
                    }`}
                >
                  Program Head Dashboard • exam scheduling & management
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isDark
                    ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]"
                    : "bg-blue-700 text-white shadow-md font-bold"
                    }`}
                >
                  ADMIN
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-medium ${isDark
                    ? "bg-gray-700 text-gray-300"
                    : "bg-gray-200 text-gray-700"
                    }`}
                >
                  {activeTab === "generate"
                    ? "Schedule Mode"
                    : activeTab === "schedules"
                      ? "View Mode"
                      : activeTab === "proctors"
                        ? "Proctor Mode"
                        : activeTab === "monitoring"
                          ? "Monitoring Mode"
                          : "Rescheduling Mode"}
                </div>
                <ThemeToggle />
                <div className="relative">
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className={`relative p-2 rounded-xl transition ${isDark
                      ? "text-gray-400 hover:text-gray-100 hover:bg-gray-700"
                      : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
                      }`}
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">
                        {unreadCount}
                      </span>
                    )}
                  </button>

                  {/* Notifications Dropdown */}
                  {showNotifications && (
                    <div className={`absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-xl shadow-2xl border z-50 ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                      <div className={`p-4 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
                        <h3 className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>Notifications</h3>
                      </div>
                      <div className="p-2">
                        {notifications.length === 0 ? (
                          <div className={`p-4 text-center text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                            No notifications
                          </div>
                        ) : (
                          notifications.map((notif) => (
                            <div
                              key={notif.id}
                              onClick={() => {
                                if (!notif.is_read) markRead(notif.id);
                                // Optionally navigate or expand
                                if (notif.related_id) setActiveTab("rescheduling");
                              }}
                              className={`p-3 rounded-lg cursor-pointer transition ${notif.is_read
                                ? isDark ? "hover:bg-gray-700/50 opacity-70" : "hover:bg-gray-50 opacity-70"
                                : isDark ? "bg-blue-900/20 hover:bg-blue-900/30 border border-blue-800/50" : "bg-blue-50 hover:bg-blue-100 border border-blue-100"
                                }`}
                            >
                              <div className="flex gap-3">
                                <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${notif.is_read ? "bg-gray-400" : "bg-blue-500"}`}></div>
                                <div>
                                  <p className={`text-sm ${isDark ? "text-gray-200" : "text-gray-800"}`}>{notif.message}</p>
                                  <p className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                                    {notif.created_at ? new Date(notif.created_at).toLocaleString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      year: "numeric",
                                      hour: "numeric",
                                      minute: "2-digit",
                                      hour12: true
                                    }) : "Just now"}
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
                <button
                  onClick={handleLogout}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl transition group ${isDark
                    ? "bg-gray-700 text-gray-200 hover:bg-red-900/20 hover:text-red-300"
                    : "bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-700"
                    }`}
                >
                  <LogOut className="w-5 h-5 transition-transform group-hover:scale-110" />
                  <span className="text-sm font-medium">Logout</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className="max-w-7xl mx-auto px-6 py-6">
          {/* Main Tab Content */}
          <div
            className={`rounded-lg border shadow-sm overflow-hidden ${isDark
              ? "bg-gray-800 border-gray-700"
              : "bg-white border-gray-200"
              }`}
          >
            <div
              className={`px-6 py-4 border-b ${isDark
                ? "border-gray-700 bg-gray-700/50"
                : "border-gray-200 bg-gray-50"
                }`}
            >
              <div className="flex items-center gap-2">
                {activeTab === "generate" ? (
                  <Calendar
                    className={`w-5 h-5 ${isDark ? "text-blue-400" : "text-blue-600"
                      }`}
                  />
                ) : activeTab === "schedules" ? (
                  <CalendarDays
                    className={`w-5 h-5 ${isDark ? "text-blue-400" : "text-blue-600"
                      }`}
                  />
                ) : activeTab === "proctors" ? (
                  <Users
                    className={`w-5 h-5 ${isDark ? "text-purple-400" : "text-purple-600"
                      }`}
                  />
                ) : activeTab === "monitoring" ? (
                  <ShieldCheck
                    className={`w-5 h-5 ${isDark ? "text-teal-400" : "text-teal-600"
                      }`}
                  />
                ) : (
                  <ClipboardList
                    className={`w-5 h-5 ${isDark ? "text-orange-400" : "text-orange-600"
                      }`}
                  />
                )}
                <h3
                  className={`font-semibold ${isDark ? "text-white" : "text-gray-900"
                    }`}
                >
                  {activeTab === "generate"
                    ? "Exam Schedule Generator"
                    : activeTab === "schedules"
                      ? "Generated Exam Schedules"
                      : activeTab === "proctors"
                        ? "Proctor Management System"
                        : activeTab === "monitoring"
                          ? "Proctor Attendance Monitoring"
                          : "Rescheduling Management System"}
                </h3>
              </div>
            </div>
            <div className="p-6">
              {activeTab === "generate" ? (
                <ExamScheduler />
              ) : activeTab === "schedules" ? (
                <GeneratedExamSchedules />
              ) : activeTab === "proctors" ? (
                <AddProctor />
              ) : activeTab === "rules" ? (
                <DistributionRulesManager />
              ) : activeTab === "monitoring" ? (
                <ProctorMonitoring />
              ) : (
                <ReschedulingRequests />
              )}
            </div>
          </div>

          {/* Feedback Widget - Bottom Section */}
          {activeTab === "generate" && (
            <div className={`mt-6 rounded-lg border shadow-sm overflow-hidden ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              <div
                className={`${isDark
                  ? "bg-gray-800"
                  : "bg-white"
                  } p-5`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className={`font-bold mb-1 ${isDark ? "text-white" : "text-gray-900"}`}>How's Your Experience?</h3>
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                      Tell us more about it and rate us
                    </p>
                  </div>
                  <Sparkles className="w-6 h-6 text-yellow-400" />
                </div>
                <div className="flex items-center gap-4 mt-4">
                  <div className={`rounded-lg p-3 ${isDark ? "bg-gray-700" : "bg-gray-100"}`}>
                    <div className="w-8 h-8 flex items-center justify-center">
                      <LayoutGrid className={`w-6 h-6 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                      Scan QR or visit feedback.sti.edu
                    </p>
                    <button className={`w-full mt-2 py-2 rounded-lg font-semibold text-sm transition ${isDark ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-gray-100 text-gray-900 hover:bg-gray-200"}`}>
                      Give Feedback
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
