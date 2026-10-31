import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  CalendarIcon,
  UsersIcon,
  ArrowLeftStartOnRectangleIcon,
  Cog6ToothIcon,
  BellIcon,
  Squares2X2Icon,
  ClipboardDocumentListIcon,
  AdjustmentsHorizontalIcon,
  SparklesIcon,
  CalendarDaysIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  BuildingOffice2Icon,
  BookOpenIcon,
  UserIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  ChevronRightIcon,
  PencilIcon,
  TrashIcon,
  CircleStackIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  ClockIcon,
  UserGroupIcon,
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  TableCellsIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";
import ExamScheduler from "../components/ExamScheduler";
import AddProctor from "../components/AddProctor";
import { useTheme } from "../context/themeStore";
import { useUser } from "../context/userStore";
import { useNavigate } from "react-router-dom";
import DistributionRulesManager from "../components/DistributionRulesManager";
import GeneratedExamSchedules from "../components/GeneratedExamSchedules";
import ProctorMonitoring from "../components/ProctorMonitoring";
import RoomManagement from "../components/RoomManagement";
import SettingsDropdown from "../components/SettingsDropdown";
import DataImport from "../components/DataImport";
import StudentImport from "../components/StudentImport";
import ProctorImport from "../components/ProctorImport";
import ConfirmationModal from "../components/ConfirmationModal";
import FirstTimePasswordChange from "../components/FirstTimePasswordChange";
import SubjectDurationsManager from "../components/SubjectDurationsManager";
import SectionStudentList from "../components/SectionStudentList";

import api from "../api";
import { useToast } from "../context/ToastContext";

const INITIAL_GENERATION_STATE = {
  loading: false,
  progress: {
    status: "idle",
    percent: 0,
    phase: "Idle",
    detail: "",
  },
};

function ReschedulingRequests({ isGenerating, onRequestsChange }) {
  const { theme } = useTheme();
  const { user } = useUser();
  const isDark = theme === "dark";
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState("pending");
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { showSuccess, showError } = useToast();
  // Room selection state for approve modal
  const [approveModalReq, setApproveModalReq] = useState(null);
  const [availableRooms, setAvailableRooms] = useState([]);
  const [availableProctors, setAvailableProctors] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedProctorId, setSelectedProctorId] = useState("");

  useEffect(() => {
    const fetchRequests = async () => {
      setLoading(true);
      try {
        const res = await api.get("/rescheduling/pending");
        setRequests(res.data);
        if (onRequestsChange) {
          onRequestsChange(res.data.length);
        }
      } catch (err) {
        console.error("Error fetching requests:", err);
      }
      setLoading(false);
    };
    fetchRequests();
  }, [onRequestsChange]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get("/rescheduling/history");
      setHistory(res.data);
    } catch (err) {
      console.error("Error fetching history:", err);
    }
    setLoadingHistory(false);
  };

  useEffect(() => {
    if (activeSubTab === "history") {
      fetchHistory();
    }
  }, [activeSubTab]);

  const handleApproveClick = async (req) => {
    if (isGenerating) {
      showError("Cannot review rescheduling requests while schedule generation is ongoing");
      return;
    }
    setApproveModalReq(req);
    setSelectedRoomId("");
    setSelectedProctorId("");
    setLoadingRooms(true);
    try {
      if (req.consultation_area) {
        const res = await api.get("/proctors/");
        setAvailableProctors(res.data);
        setAvailableRooms([]);
      } else {
        const res = await api.get(`/rescheduling/${req.id}/available-rooms`);
        setAvailableRooms(res.data);
        setAvailableProctors([]);
      }
    } catch (err) {
      console.error("Error fetching approval assignments:", err);
      setAvailableRooms([]);
      setAvailableProctors([]);
    }
    setLoadingRooms(false);
  };

  const handleReview = async (id, status, comments = "", roomId = null, proctorId = null) => {
    if (isGenerating) {
      showError("Cannot review rescheduling requests while schedule generation is ongoing");
      return;
    }
    try {
      const res = await api.put(`/rescheduling/${id}/review`, {
        status,
        reviewer_comments: comments,
        room_id: roomId || null,
        proctor_id: proctorId || null,
      });
      if (res.status === 200) {
        setRequests(prev => {
          const updated = prev.filter(req => req.id !== id);
          if (onRequestsChange) {
            onRequestsChange(updated.length);
          }
          return updated;
        });
        showSuccess(`Request ${status} successfully`);
      } else {
        showError("Failed to update request");
      }
    } catch (err) {
      console.error(err);
      showError(err.response?.data?.detail || "Error updating request");
    }
  };

  const handleAutoAssign = async (id) => {
    if (isGenerating) {
      showError("Cannot review rescheduling requests while schedule generation is ongoing");
      return;
    }
    try {
      const res = await api.post(`/rescheduling/${id}/auto-assign`, {});
      if (res.status === 200) {
        setRequests(prev => {
          const updated = prev.filter(req => req.id !== id);
          if (onRequestsChange) {
            onRequestsChange(updated.length);
          }
          return updated;
        });
        showSuccess(res.data.message || "Request approved and automatically scheduled!");
      } else {
        showError("Failed to auto-assign request");
      }
    } catch (err) {
      console.error(err);
      showError(err.response?.data?.detail || "Error auto-assigning request");
    }
  };

  const formatPreferredDate = (dateStr) => {
    if (!dateStr) return "Flexible";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("en-US", { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Sub-tab navigation */}
      <div className={`flex border-b ${isDark ? "border-slate-800" : "border-slate-200"} mb-2 overflow-x-auto no-scrollbar`}>
        <button
          onClick={() => setActiveSubTab("pending")}
          className={`px-4 sm:px-5 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap shrink-0 ${activeSubTab === "pending"
            ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
            : `border-transparent ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800"}`
            }`}
        >
          Pending Requests ({requests.length})
        </button>
        <button
          onClick={() => setActiveSubTab("history")}
          className={`px-4 sm:px-5 py-3 text-sm font-bold border-b-2 transition-all whitespace-nowrap shrink-0 ${activeSubTab === "history"
            ? "border-blue-600 text-blue-600 dark:border-blue-500 dark:text-blue-400"
            : `border-transparent ${isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800"}`
            }`}
        >
          Rescheduling History
        </button>
      </div>

      {/* Department Routing Notice */}
      <div className={`p-4 rounded-2xl border flex items-center justify-between text-xs transition-all ${
        user?.is_super_admin
          ? isDark ? "bg-amber-950/20 border-amber-800/40 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-900"
          : isDark ? "bg-blue-950/20 border-blue-800/40 text-blue-200" : "bg-blue-50 border-blue-200 text-blue-900"
      }`}>
        <div className="flex items-center gap-2.5">
          {user?.is_super_admin ? (
            <ShieldCheckIcon className="w-5 h-5 text-amber-500 shrink-0" />
          ) : (
            <BuildingOffice2Icon className="w-5 h-5 text-blue-500 shrink-0" />
          )}
          <div>
            <span className="font-bold uppercase tracking-wider block text-[11px]">
              {user?.is_super_admin ? "Super Admin Authority (General Education)" : `${user?.department_code || "Department"} Administrator`}
            </span>
            <p className="mt-0.5 text-xs opacity-90">
              {user?.is_super_admin
                ? "Full cross-department access active: You can review, approve, and auto-assign requests across all school departments and academic programs."
                : `Student rescheduling requests for ${user?.department_code || "your department"} are automatically routed here. Cross-department approvals are restricted to Super Admin.`}
            </p>
          </div>
        </div>
      </div>

      {activeSubTab === "pending" ? (
        loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
            <span className={`ml-3 text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>Loading requests...</span>
          </div>
        ) : requests.length === 0 ? (
          <div className={`text-center py-16 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            <ClipboardDocumentListIcon className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
            <p className="font-semibold text-base">No pending rescheduling requests.</p>
            <p className="text-sm mt-1 text-slate-400">Students with exam conflicts can submit requests from their dashboard.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {requests.map((req) => (
              <div
                key={req.id}
                className={`p-4 sm:p-6 rounded-2xl border shadow-sm transition-all ${isDark ? "bg-slate-800/60 border-slate-700" : "bg-white border-slate-200 hover:shadow-md"}`}
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-5 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${isDark ? "bg-amber-950/40 text-amber-300 border-amber-800/60" : "bg-amber-50 text-amber-900 border-amber-300"
                        }`}>Pending</span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        req.department_code === "GE"
                          ? isDark ? "bg-purple-950/50 text-purple-300 border-purple-800/60" : "bg-purple-50 text-purple-800 border-purple-200"
                          : req.department_code === "ICT"
                          ? isDark ? "bg-blue-950/50 text-blue-300 border-blue-800/60" : "bg-blue-50 text-blue-800 border-blue-200"
                          : isDark ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-slate-100 text-slate-800 border-slate-200"
                      }`}>
                        Dept: {req.department_code || req.department || "General"}
                      </span>
                    </div>
                    <h4 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                      {req.course_name}
                    </h4>
                    <p className={`text-sm mt-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      {req.student_name} {req.program ? <> &bull; Program: <strong className="font-semibold text-blue-600 dark:text-blue-400">{req.program}</strong></> : null} &bull; Section: <strong className="font-semibold">{req.section_name}</strong>
                    </p>
                  </div>
                  {(() => {
                    const canReview = user?.is_super_admin || !req.department_code || user?.department_code === req.department_code;
                    if (!canReview) {
                      return (
                        <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                          <ShieldCheckIcon className="w-4 h-4 shrink-0" />
                          <span>Requires {req.department_code} Admin / Super Admin</span>
                        </div>
                      );
                    }
                    return (
                      <div className="flex flex-wrap gap-2 shrink-0 w-full sm:w-auto">
                        {req.auto_assignment?.success ? (
                          <>
                            <button
                              onClick={() => handleAutoAssign(req.id)}
                              disabled={isGenerating}
                              className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-bold text-sm transition shadow-sm flex items-center justify-center gap-1.5 ${
                                isGenerating
                                  ? "bg-emerald-800/50 text-emerald-300 cursor-not-allowed"
                                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-900/20"
                              }`}
                              title={isGenerating ? "Cannot approve while schedule generation is running" : "Approve with automatically assigned time and room"}
                            >
                              <CheckBadgeIcon className="w-4 h-4" />
                              <span>Approve (Auto-Assigned)</span>
                            </button>
                            <button
                              onClick={() => handleApproveClick(req)}
                              disabled={isGenerating}
                              className={`flex-1 sm:flex-initial px-3.5 py-2.5 rounded-xl font-semibold text-xs transition border ${
                                isDark
                                  ? "border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700"
                                  : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100"
                              }`}
                              title="Manually override time slot or room"
                            >
                              Manual Review
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleApproveClick(req)}
                            disabled={isGenerating}
                            className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-bold text-sm transition ${
                              isGenerating ? "bg-emerald-800/50 text-emerald-300 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700 text-white"
                            }`}
                            title={isGenerating ? "Cannot approve while schedule generation is running" : ""}
                          >
                            {req.student_type === "irregular" ? "Manual Review & Approve" : "Approve"}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (isGenerating) return;
                            const comments = prompt("Rejection reason (optional):");
                            if (comments !== null) handleReview(req.id, "rejected", comments || "");
                          }}
                          disabled={isGenerating}
                          className={`flex-1 sm:flex-initial px-4 py-2.5 rounded-xl font-bold text-sm transition ${isGenerating ? "bg-rose-900/40 text-rose-300 cursor-not-allowed" : "bg-rose-600 hover:bg-rose-700 text-white"
                            }`}
                          title={isGenerating ? "Cannot reject while schedule generation is running" : ""}
                        >
                          Reject
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Auto-Assignment Recommendation Box */}
                {req.auto_assignment?.success && (
                  <div className={`p-4 rounded-xl border mb-4 shadow-sm ${isDark ? "bg-emerald-950/20 border-emerald-800/60" : "bg-emerald-50/70 border-emerald-200"}`}>
                    <div className="flex items-center justify-between mb-2.5">
                      <h5 className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${isDark ? "text-emerald-300" : "text-emerald-800"}`}>
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        Automatically Assigned Schedule
                      </h5>
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${isDark ? "bg-emerald-900/50 text-emerald-300 border-emerald-700/60" : "bg-emerald-100 text-emerald-800 border-emerald-300"}`}>
                        Conflict-Free Validated
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                      <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-900/70 border-slate-800" : "bg-white border-emerald-100"}`}>
                        <span className={`text-[11px] block uppercase font-bold tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>Examination Date & Time</span>
                        <span className={`font-bold block mt-1 ${isDark ? "text-white" : "text-slate-900"}`}>{req.auto_assignment.date_formatted}</span>
                        <div className={`text-xs font-semibold mt-0.5 ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>{req.auto_assignment.time_formatted}</div>
                      </div>
                      <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-900/70 border-slate-800" : "bg-white border-emerald-100"}`}>
                        <span className={`text-[11px] block uppercase font-bold tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>Assigned Room</span>
                        <span className={`font-bold block mt-1 ${isDark ? "text-white" : "text-slate-900"}`}>
                          {req.auto_assignment.room_name === "Consultation Area" ? "Consultation Area" : `Room ${req.auto_assignment.room_name}`}
                        </span>
                        <div className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                          {req.auto_assignment.room_name !== "Consultation Area" && (
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                              {req.auto_assignment.room_name.startsWith("B") ? "Building B (College) · " : req.auto_assignment.room_name.startsWith("C") ? "Building C (SHS) · " : ""}
                            </span>
                          )}
                          Capacity: {req.auto_assignment.room_capacity} seats
                        </div>
                        {req.auto_assignment.joined_section_name && (
                          <div className={`text-[11px] mt-1 font-medium ${isDark ? "text-emerald-300/90" : "text-emerald-700"}`}>
                            Joining: {req.auto_assignment.joined_section_name}
                            {req.auto_assignment.joined_subject_name ? ` (${req.auto_assignment.joined_subject_name})` : ""}
                          </div>
                        )}
                      </div>
                      <div className={`p-3 rounded-xl border ${isDark ? "bg-slate-900/70 border-slate-800" : "bg-white border-emerald-100"}`}>
                        <span className={`text-[11px] block uppercase font-bold tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                          {req.auto_assignment.is_consultation ? "Proctoring" : "Regular Session Sit-In"}
                        </span>
                        <span className={`font-bold block mt-1 ${isDark ? "text-white" : "text-slate-900"}`}>
                          {req.auto_assignment.is_consultation ? "Admin Personal Assignment" : `${req.auto_assignment.assigned_student_count} student(s) scheduled`}
                        </span>
                        <div className={`text-xs font-semibold mt-0.5 ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>
                          {req.auto_assignment.is_consultation ? "Without proctor assignment" : `${req.auto_assignment.remaining_capacity} seats available${req.auto_assignment.proctor_name ? ` · Proctor: ${req.auto_assignment.proctor_name}` : ""}`}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning when no valid slot or room could be auto-assigned */}
                {req.student_type === "irregular" && req.auto_assignment && !req.auto_assignment.success && (
                  <div className={`p-4 rounded-xl border mb-4 flex items-start gap-3 ${isDark ? "bg-amber-950/30 border-amber-800/60" : "bg-amber-50 border-amber-300"}`}>
                    <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h5 className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-amber-300" : "text-amber-900"}`}>
                        Automatic Assignment Notice
                      </h5>
                      <p className={`text-xs mt-1 leading-relaxed ${isDark ? "text-amber-200/90" : "text-amber-800"}`}>
                        {req.auto_assignment.message}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                    <h5 className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Original Exam</h5>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Date:</span> {req.original_exam_date}<br />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Time:</span> {req.original_time}<br />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Type:</span> {req.exam_type}
                    </p>
                  </div>
                  <div className={`p-4 rounded-xl border ${isDark ? "bg-blue-950/20 border-blue-800/40" : "bg-blue-50/70 border-blue-200"}`}>
                    <h5 className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-blue-300" : "text-blue-700"}`}>Requested Schedule</h5>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Mode:</span> {req.requested_mode}<br />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Date:</span> {req.preferred_date || "Flexible"}<br />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Time:</span> {req.preferred_time || "To be determined"}
                    </p>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-800/30 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                  <h5 className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Reason for Request</h5>
                  <p className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold mr-2 mb-1 border ${isDark ? "bg-slate-700 border-slate-600 text-slate-200" : "bg-slate-200 border-slate-300 text-slate-800"}`}>
                      {req.reason_type}
                    </span>
                    {req.detailed_explanation}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )
      ) : (
        loadingHistory ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-blue-600 border-t-transparent animate-spin" />
            <span className={`ml-3 text-sm font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>Loading history...</span>
          </div>
        ) : history.length === 0 ? (
          <div className={`text-center py-16 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            <ClipboardDocumentListIcon className="w-12 h-12 mx-auto mb-3 opacity-30 text-slate-400" />
            <p className="font-semibold text-base">No rescheduling history.</p>
            <p className="text-sm mt-1 text-slate-400">Processed rescheduling requests will appear here.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {history.map((req) => (
              <div
                key={req.id}
                className={`p-6 rounded-2xl border shadow-sm transition-all ${isDark ? "bg-slate-800/60 border-slate-700" : "bg-white border-slate-200 hover:shadow-md"}`}
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-5 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider border ${req.status === "approved"
                        ? (isDark ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/60" : "bg-emerald-50 text-emerald-900 border-emerald-300")
                        : (isDark ? "bg-rose-950/40 text-rose-300 border-rose-800/60" : "bg-rose-50 text-rose-900 border-rose-300")
                        }`}>
                        {req.status}
                      </span>
                      <span className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                        ID: {req.id}
                      </span>
                      {req.department_code && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${isDark ? "bg-slate-800 text-slate-300 border-slate-700" : "bg-slate-100 text-slate-700 border-slate-200"}`}>
                          Dept: {req.department_code}
                        </span>
                      )}
                    </div>
                    <h4 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                      {req.course_name}
                    </h4>
                    <p className={`text-sm mt-0.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      {req.student_name} {req.program ? <> &bull; Program: <strong className="font-semibold text-blue-600 dark:text-blue-400">{req.program}</strong></> : null} &bull; Section: <strong className="font-semibold">{req.section_name}</strong>
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                    <h5 className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Original Exam</h5>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Date:</span> {req.original_exam_date}<br />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Time:</span> {req.original_time}<br />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Type:</span> {req.exam_type}
                    </p>
                  </div>
                  <div className={`p-4 rounded-xl border ${req.status === "approved"
                    ? (isDark ? "bg-blue-950/20 border-blue-800/40" : "bg-blue-50/70 border-blue-200")
                    : (isDark ? "bg-rose-950/20 border-rose-800/40" : "bg-rose-50/70 border-rose-200")
                    }`}>
                    <h5 className={`text-xs font-bold uppercase tracking-wider mb-2 ${req.status === "approved"
                      ? (isDark ? "text-blue-300" : "text-blue-700")
                      : (isDark ? "text-rose-300" : "text-rose-700")
                      }`}>
                      {req.status === "approved" ? "Rescheduled To" : "Requested Schedule (Rejected)"}
                    </h5>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Mode:</span> {req.requested_mode}<br />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Date:</span> {formatPreferredDate(req.preferred_date)}<br />
                      <span className="font-semibold text-slate-900 dark:text-slate-100">Time:</span> {req.preferred_time || "To be determined"}<br />
                      {req.room && (
                        <>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">Room:</span> {req.room === "Consultation Area" ? "Consultation Area" : `Room ${req.room}`}
                          {req.room_capacity ? ` (Cap: ${req.room_capacity})` : ""}
                          {req.student_count !== null && req.student_count !== undefined ? ` · ${req.student_count} student(s) assigned` : ""}<br />
                        </>
                      )}
                      {req.proctor ? (
                        <><span className="font-semibold text-slate-900 dark:text-slate-100">Proctor:</span> {req.proctor}<br /></>
                      ) : req.room === "Consultation Area" ? (
                        <><span className="font-semibold text-slate-900 dark:text-slate-100">Proctor:</span> <span className="italic">To be assigned personally by admin</span><br /></>
                      ) : null}
                    </p>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border mb-4 ${isDark ? "bg-slate-800/30 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
                  <h5 className={`text-xs font-bold uppercase tracking-wider mb-2 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Reason for Request</h5>
                  <p className={`text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-bold mr-2 mb-1 border ${isDark ? "bg-slate-700 border-slate-600 text-slate-200" : "bg-slate-200 border-slate-300 text-slate-800"}`}>
                      {req.reason_type}
                    </span>
                    {req.detailed_explanation}
                  </p>
                </div>

                {req.reviewer_comments && (
                  <div className={`p-4 rounded-xl border border-dashed ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-slate-50 border-slate-300"}`}>
                    <h5 className={`text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Reviewer Comments</h5>
                    <p className={`text-sm italic ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                      "{req.reviewer_comments}"
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {/* ── Room Selection Approval Modal ── */}
      {approveModalReq && (
        <div 
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            className="absolute inset-0"
            onClick={() => setApproveModalReq(null)}
          />
          <div className={`relative w-full max-w-md rounded-2xl border shadow-2xl p-6 ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
            <div className="flex items-center justify-between mb-5">
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                {approveModalReq.consultation_area ? "Approve Consultation Area Exam" : "Assign Room & Approve"}
              </h3>
              <button 
                type="button"
                onClick={() => setApproveModalReq(null)} 
                aria-label="Close dialog"
                className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-800"}`}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
            <p className={`text-sm mb-4 leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Approving <strong className="text-slate-900 dark:text-slate-100">{approveModalReq.course_name}</strong> for <strong className="text-slate-900 dark:text-slate-100">{approveModalReq.student_name}</strong>
              {approveModalReq.department && (
                <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${
                  approveModalReq.department === "College"
                    ? isDark ? "bg-blue-900/40 text-blue-300 border-blue-700/50" : "bg-blue-100 text-blue-800 border-blue-300"
                    : isDark ? "bg-purple-900/40 text-purple-300 border-purple-700/50" : "bg-purple-100 text-purple-800 border-purple-300"
                }`}>
                  {approveModalReq.department === "College" ? "College — Building B Only" : "SHS — Building C Only"}
                </span>
              )}
              .<br />
              {approveModalReq.consultation_area
                ? "This reschedule is scheduled for 5:00 PM onwards and will take place in the Consultation Area without a proctor assignment. The admin will assign the proctor personally."
                : (approveModalReq.department === "College"
                  ? "Select an available Building B room (B___). Building C is reserved for SHS. If another exam is already using it during this time, the irregular student's exam will join that session."
                  : "Select an available Building C room (C___). Building B is reserved for College. If another exam is already using it during this time, the irregular student's exam will join that session."
                )}
            </p>
            <div className={`mb-4 p-3 rounded-xl text-xs border ${isDark ? "bg-blue-950/30 text-blue-300 border-blue-800/50" : "bg-blue-50 text-blue-800 border-blue-200"}`}>
              <span className="font-bold">Requested timeslot:</span>{" "}
              {approveModalReq.preferred_date ? `${approveModalReq.preferred_date} · ${approveModalReq.preferred_time || "5:00 PM onwards"}` : (approveModalReq.auto_assignment?.date_formatted ? `${approveModalReq.auto_assignment.date_formatted} · ${approveModalReq.auto_assignment.time_formatted}` : "5:00 PM onwards")}
            </div>
            {loadingRooms ? (
              <div className="flex items-center gap-2 py-4">
                <div className="w-5 h-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                <span className={`text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  {approveModalReq.consultation_area ? "Loading details..." : "Loading rooms with active exams..."}
                </span>
              </div>
            ) : approveModalReq.consultation_area ? (
              <>
                <div className={`mb-4 rounded-xl border p-3 text-sm ${isDark ? "border-emerald-800/60 bg-emerald-950/30 text-emerald-200" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
                  Location: <strong>Consultation Area (Automated)</strong>
                  <p className={`text-xs mt-1 ${isDark ? "text-emerald-300/80" : "text-emerald-700"}`}>
                    Exam location is automatically assigned to Consultation Area.
                  </p>
                </div>
                <div className={`mb-4 p-3 rounded-xl border text-xs ${isDark ? "bg-amber-950/30 border-amber-800/60 text-amber-300" : "bg-amber-50 border-amber-300 text-amber-900"}`}>
                  <p className="font-bold mb-0.5">No Proctor Required to Approve</p>
                  <p>Exam will be approved without proctoring assignment. The admin will personally assign a supervising proctor.</p>
                </div>
                <label className={`mb-2 block text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`} htmlFor="consultation-proctor">
                  Supervising proctor (Optional)
                </label>
                <select
                  id="consultation-proctor"
                  value={selectedProctorId}
                  onChange={(e) => setSelectedProctorId(e.target.value)}
                  className={`mb-4 w-full rounded-xl border p-3 text-sm outline-none transition focus:ring-2 focus:ring-blue-500/40 ${isDark ? "border-slate-700 bg-slate-800 text-white" : "border-slate-300 bg-slate-50 text-slate-800"}`}
                >
                  <option value="">— None (Admin will assign personally) —</option>
                  {availableProctors.map((proctor) => (
                    <option key={proctor.id} value={proctor.id}>{proctor.name}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                {availableRooms.length === 0 ? (
                  <div className={`p-3 rounded-xl text-sm mb-4 border ${isDark ? "bg-amber-950/30 text-amber-300 border-amber-800/50" : "bg-amber-50 text-amber-900 border-amber-200"}`}>
                    No rooms are available for the full requested time slot.
                  </div>
                ) : (
                  <>
                    <p className={`text-xs mb-2 font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                      Available rooms for this time ({approveModalReq.department === "College" ? "Building B" : "Building C"}):
                    </p>
                    <select
                      value={selectedRoomId}
                      onChange={(e) => setSelectedRoomId(e.target.value)}
                      className={`w-full p-3 rounded-xl border text-sm mb-4 outline-none transition focus:ring-2 focus:ring-blue-500/40 ${isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-300 text-slate-800"}`}
                    >
                      <option value="">— Select a room —</option>
                      {availableRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}{r.building ? ` — Building ${r.building}` : ""}{r.exam_subject ? ` · ${r.exam_subject}` : ""}{r.capacity ? ` (cap: ${r.capacity})` : ""}
                        </option>
                      ))}
                    </select>
                  </>
                )}
              </>
            )}
            <div className="flex gap-3 justify-end mt-2">
              <button
                type="button"
                onClick={() => setApproveModalReq(null)}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition ${isDark ? "bg-slate-800 text-slate-200 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const roomId = selectedRoomId ? parseInt(selectedRoomId) : null;
                  const proctorId = selectedProctorId ? parseInt(selectedProctorId) : null;
                  await handleReview(approveModalReq.id, "approved", "", roomId, proctorId);
                  setApproveModalReq(null);
                }}
                disabled={approveModalReq.consultation_area ? false : !selectedRoomId}
                title={approveModalReq.consultation_area ? "Approve reschedule in Consultation Area" : "Select a room"}
                className="px-5 py-2.5 rounded-xl text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
              >
                Confirm Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


function ChatSupportPanel() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user } = useUser();
  const [conversations, setConversations] = useState([]);
  const [activeStudentId, setActiveStudentId] = useState(null);
  const [activeStudentName, setActiveStudentName] = useState("");
  const [activeStudentType, setActiveStudentType] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [isDeleteMsgModalOpen, setIsDeleteMsgModalOpen] = useState(false);
  const [msgToDeleteId, setMsgToDeleteId] = useState(null);
  const [isClearConvModalOpen, setIsClearConvModalOpen] = useState(false);
  const [convToClearStudentId, setConvToClearStudentId] = useState(null);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");

  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [proctorsList, setProctorsList] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactTab, setContactTab] = useState("students");

  const fetchConversations = async () => {
    try {
      const res = await api.get("/chat/conversations");
      setConversations(res.data);
    } catch (err) { console.error("conv err", err); }
  };

  const openNewChatModal = async () => {
    setIsNewChatModalOpen(true);
    try {
      const [procRes, studRes] = await Promise.all([
        api.get("/chat/proctors"),
        api.get("/chat/students")
      ]);
      setProctorsList(procRes.data);
      setStudentsList(studRes.data);
    } catch (err) {
      console.error("Error fetching contacts", err);
    }
  };

  const startChatWithContact = (contact) => {
    const existing = conversations.find(c => c.student_id === contact.id);
    if (!existing) {
      setConversations(prev => [
        {
          student_id: contact.id,
          student_name: contact.name,
          student_email: contact.email,
          student_type: contact.student_type || "proctor",
          role: contact.student_type ? "student" : "proctor",
          last_message: "",
          last_message_time: null,
          unread_count: 0
        },
        ...prev
      ]);
    }
    selectStudent(contact.id, contact.name, contact.student_type || "proctor");
    setIsNewChatModalOpen(false);
    setContactSearch("");
  };

  const fetchMessages = async (studentId) => {
    if (!studentId) return;
    try {
      const res = await api.get(`/chat/messages/${studentId}`);
      setMessages(res.data);
      api.put(`/chat/read/${studentId}`).catch(() => { });
    } catch (err) { console.error("msg err", err); }
  };

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 8000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeStudentId) return;
    fetchMessages(activeStudentId);
    const interval = setInterval(() => fetchMessages(activeStudentId), 4000);
    return () => clearInterval(interval);
  }, [activeStudentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeStudentId || sending) return;
    setSending(true);
    try {
      await api.post("/chat/send", { recipient_id: activeStudentId, message: newMessage.trim() });
      setNewMessage("");
      await fetchMessages(activeStudentId);
      fetchConversations();
    } catch (err) { console.error(err); }
    setSending(false);
  };

  const startEditing = (msg) => {
    setEditingMessageId(msg.id);
    setEditingText(msg.message);
  };

  const cancelEditing = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const saveEditMessage = async (messageId) => {
    if (!editingText.trim()) return;
    try {
      await api.put(`/chat/messages/${messageId}`, { message: editingText.trim() });
      setEditingMessageId(null);
      setEditingText("");
      await fetchMessages(activeStudentId);
      fetchConversations();
    } catch (err) {
      console.error("edit err", err);
    }
  };

  const executeDeleteMessage = async () => {
    if (!msgToDeleteId) return;
    try {
      await api.delete(`/chat/messages/${msgToDeleteId}`);
      await fetchMessages(activeStudentId);
      fetchConversations();
    } catch (err) {
      console.error("delete err", err);
    } finally {
      setIsDeleteMsgModalOpen(false);
      setMsgToDeleteId(null);
    }
  };

  const deleteMessage = (messageId) => {
    setMsgToDeleteId(messageId);
    setIsDeleteMsgModalOpen(true);
  };

  const executeClearConversation = async () => {
    if (!convToClearStudentId) return;
    try {
      await api.delete(`/chat/conversations/${convToClearStudentId}`);
      setMessages([]);
      fetchConversations();
    } catch (err) {
      console.error("clear conv err", err);
    } finally {
      setIsClearConvModalOpen(false);
      setConvToClearStudentId(null);
    }
  };

  const deleteConversation = (studentId) => {
    setConvToClearStudentId(studentId);
    setIsClearConvModalOpen(true);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const selectStudent = (id, name, type) => {
    setActiveStudentId(id);
    setActiveStudentName(name);
    setActiveStudentType(type);
    setMessages([]);
    setEditingMessageId(null);
    setEditingText("");
  };

  return (
    <div className={`flex h-[min(70dvh,620px)] min-h-[360px] sm:h-[620px] min-w-0 rounded-2xl border overflow-hidden relative shadow-sm ${isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"}`}>
      {/* Left: conversation list */}
      <div className={`w-full min-w-0 md:w-72 md:shrink-0 flex flex-col border-r ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-slate-50 border-slate-200"} ${activeStudentId ? "hidden md:flex" : "flex"}`}>
        <div className={`p-4 border-b flex justify-between items-center ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <div>
            <h3 className={`font-bold text-xs uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Conversations
            </h3>
            <p className={`text-xs mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{conversations.length} active</p>
          </div>
          <button
            onClick={openNewChatModal}
            className={`p-1.5 rounded-xl border transition-all ${
              isDark 
                ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700" 
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-100 shadow-sm"
            }`}
            title="Start New Chat"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          {conversations.length === 0 ? (
            <div className={`p-6 text-center text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              <ChatBubbleLeftRightIcon className="w-8 h-8 mx-auto mb-2 opacity-30 text-slate-400" />
              No conversations yet
            </div>
          ) : conversations.map((conv) => (
            <button
              key={conv.student_id}
              onClick={() => selectStudent(conv.student_id, conv.student_name, conv.student_type)}
              className={`w-full p-4 text-left border-b transition-all ${activeStudentId === conv.student_id
                ? isDark ? "bg-blue-950/40 border-blue-900/60" : "bg-blue-50 border-blue-200"
                : isDark ? "border-slate-800 hover:bg-slate-800/50" : "border-slate-100 hover:bg-slate-100/70"
                }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-bold text-sm truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                  {conv.student_name}
                </span>
                {conv.unread_count > 0 && (
                  <span className="ml-2 shrink-0 text-[10px] font-bold bg-rose-600 text-white rounded-full px-1.5 py-0.5 animate-pulse">
                    {conv.unread_count}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs truncate flex-1 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  {conv.last_message || "No messages yet"}
                </p>
                <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded-full font-bold select-none whitespace-nowrap border ${
                  conv.role === "proctor" || conv.student_type === "proctor"
                    ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50"
                    : conv.student_type === "irregular"
                    ? "bg-purple-50 text-purple-800 border-purple-300 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800/50"
                    : "bg-blue-50 text-blue-800 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50"
                }`}>
                  {conv.role === "proctor" || conv.student_type === "proctor" ? "Proctor" : conv.student_type}
                </span>
              </div>
              {conv.last_message_time && (
                <p className={`text-[10px] mt-1 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  {new Date(conv.last_message_time + "Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right: chat window */}
      <div className={`min-w-0 flex-1 flex flex-col ${isDark ? "bg-slate-900" : "bg-white"} ${!activeStudentId ? "hidden md:flex" : "flex"}`}>
        {activeStudentId ? (
          <>
            {/* Chat header */}
            <div className={`p-3 sm:p-4 border-b flex items-center justify-between gap-3 ${isDark ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                  onClick={() => setActiveStudentId(null)}
                  className="p-1.5 rounded-xl md:hidden hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition shrink-0"
                  title="Back to conversations"
                >
                  <ChevronRightIcon className="w-5 h-5 rotate-180" />
                </button>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isDark ? "bg-blue-600/30 text-blue-300 border border-blue-500/40" : "bg-blue-100 text-blue-800 border border-blue-200"
                  }`}>
                  {activeStudentName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h4 className={`font-bold text-sm truncate ${isDark ? "text-white" : "text-slate-900"}`}>{activeStudentName}</h4>
                  <p className={`text-xs truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {activeStudentType === "irregular" ? "Irregular Student" : activeStudentType === "proctor" ? "Proctor" : "Regular Student"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => deleteConversation(activeStudentId)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 border border-transparent hover:border-rose-200 dark:hover:border-rose-800 transition-all shrink-0"
                title="Delete Conversation"
              >
                <TrashIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Clear Chat</span>
              </button>
            </div>

            {/* Messages */}
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 custom-scrollbar">
              {messages.length === 0 ? (
                <div className={`text-center py-12 text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                  <ChatBubbleLeftRightIcon className="w-10 h-10 mx-auto mb-2 opacity-20 text-slate-400" />
                  No messages yet. Start the conversation!
                </div>
              ) : messages.map((msg) => {
                const isMe = msg.sender_id === user?.id;
                const isEditing = editingMessageId === msg.id;
                return (
                  <div key={msg.id} className={`min-w-0 flex ${isMe ? "justify-end" : "justify-start"} group relative items-start gap-2`}>
                    {isMe && !isEditing && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <button
                          onClick={() => startEditing(msg)}
                          className={`p-1 rounded-lg transition-colors ${
                            isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                          }`}
                          title="Edit message"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          className="p-1 rounded-lg transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600"
                          title="Delete message"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className={`min-w-0 max-w-[90%] sm:max-w-[70%] px-3.5 sm:px-4 py-2.5 rounded-2xl text-sm shadow-sm ${isMe
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : isDark ? "bg-slate-800 text-slate-100 border border-slate-700 rounded-bl-sm" : "bg-slate-100 text-slate-800 border border-slate-200 rounded-bl-sm"
                      }`}>
                      {isEditing ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="p-2 text-sm rounded-xl border outline-none text-slate-800 bg-white dark:bg-slate-900 dark:text-white dark:border-slate-700 resize-none focus:ring-2 focus:ring-blue-500"
                            rows={2}
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={cancelEditing}
                              className="px-2.5 py-1 text-xs bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEditMessage(msg.id)}
                              className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.message}</p>
                          <p className={`text-[10px] mt-1 ${isMe ? "text-blue-100" : isDark ? "text-slate-400" : "text-slate-500"}`}>
                            {new Date(msg.created_at + "Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className={`p-2 sm:p-4 border-t flex gap-2 sm:gap-3 items-end ${isDark ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-slate-50"}`}>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                aria-label="Type your message"
                className={`min-w-0 min-h-11 flex-1 p-3 rounded-xl border resize-none outline-none text-base sm:text-sm transition focus:ring-2 focus:ring-blue-500/40 ${isDark
                  ? "bg-slate-800 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500"
                  : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500"
                  }`}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !newMessage.trim()}
                aria-label="Send message"
                className={`w-11 h-11 shrink-0 rounded-xl transition flex items-center justify-center ${sending || !newMessage.trim()
                  ? isDark ? "bg-slate-800 text-slate-500 cursor-not-allowed" : "bg-slate-200 text-slate-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                  }`}
              >
                <PaperAirplaneIcon className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          <div className={`flex-1 flex flex-col items-center justify-center gap-4 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center border ${isDark ? "bg-slate-800/60 border-slate-700" : "bg-slate-100 border-slate-200"
              }`}>
              <ChatBubbleLeftRightIcon className="w-8 h-8 opacity-40 text-slate-400" />
            </div>
            <div className="text-center">
              <p className="font-bold text-slate-700 dark:text-slate-300 text-base">Select a conversation</p>
              <p className="text-sm mt-1 text-slate-400">Choose a student or proctor from the list or start a new chat.</p>
            </div>
          </div>
        )}
      </div>

      {/* Custom Confirmation Modals */}
      <ConfirmationModal
        isOpen={isDeleteMsgModalOpen}
        title="Delete Chat Message"
        message="Are you sure you want to delete this message? This action cannot be undone."
        confirmLabel="Delete Message"
        isDanger={true}
        onConfirm={executeDeleteMessage}
        onCancel={() => {
          setIsDeleteMsgModalOpen(false);
          setMsgToDeleteId(null);
        }}
      />

      <ConfirmationModal
        isOpen={isClearConvModalOpen}
        title="Clear Conversation History"
        message="Are you sure you want to clear this conversation? This will permanently delete all messages."
        confirmLabel="Clear Conversation"
        isDanger={true}
        onConfirm={executeClearConversation}
        onCancel={() => {
          setIsClearConvModalOpen(false);
          setConvToClearStudentId(null);
        }}
      />

      {/* New Chat Modal */}
      {isNewChatModalOpen && (
        <div 
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200"
        >
          <div 
            className="absolute inset-0"
            onClick={() => {
              setIsNewChatModalOpen(false);
              setContactSearch("");
            }}
          />
          <div className={`relative w-full max-w-md rounded-2xl border p-6 flex flex-col gap-4 shadow-2xl ${
            isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"
          }`}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-lg">Start a New Chat</h3>
              <button 
                type="button"
                onClick={() => {
                  setIsNewChatModalOpen(false);
                  setContactSearch("");
                }}
                aria-label="Close dialog"
                className={`p-1.5 rounded-lg transition ${
                  isDark ? "hover:bg-slate-700 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                }`}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Tab Selection */}
            <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
              <button
                onClick={() => setContactTab("students")}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  contactTab === "students"
                    ? "bg-blue-600 text-white"
                    : isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-blue-600"
                }`}
              >
                Students
              </button>
              <button
                onClick={() => setContactTab("proctors")}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  contactTab === "proctors"
                    ? "bg-blue-600 text-white"
                    : isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-blue-600"
                }`}
              >
                Proctors
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <MagnifyingGlassIcon className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${
                isDark ? "text-slate-500" : "text-slate-400"
              }`} />
              <input
                type="text"
                placeholder={`Search ${contactTab}...`}
                value={contactSearch}
                onChange={(e) => setContactSearch(e.target.value)}
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm outline-none transition ${
                  isDark 
                    ? "bg-slate-700 border-slate-600 text-white focus:border-blue-500" 
                    : "bg-white border-slate-200 text-slate-800 focus:border-blue-500 shadow-sm"
                }`}
              />
            </div>

            {/* Contact List */}
            <div className="flex-1 max-h-60 overflow-y-auto custom-scrollbar space-y-1 pr-1">
              {contactTab === "students" ? (
                studentsList
                  .filter(s => s.name.toLowerCase().includes(contactSearch.toLowerCase()))
                  .map(s => (
                    <button
                      key={s.id}
                      onClick={() => startChatWithContact(s)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition ${
                        isDark ? "hover:bg-slate-700/50" : "hover:bg-slate-50 border border-transparent hover:border-slate-100"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{s.name}</p>
                        <p className={`text-xs truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>{s.email}</p>
                      </div>
                      <span className={`text-[10px] px-2 py-0.5 rounded capitalize ${
                        s.student_type === "irregular" ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"
                      }`}>
                        {s.student_type}
                      </span>
                    </button>
                  ))
              ) : (
                proctorsList
                  .filter(p => p.name.toLowerCase().includes(contactSearch.toLowerCase()))
                  .map(p => (
                    <button
                      key={p.id}
                      onClick={() => startChatWithContact(p)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition ${
                        isDark ? "hover:bg-slate-700/50" : "hover:bg-slate-50 border border-transparent hover:border-slate-100"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{p.name}</p>
                        <p className={`text-xs truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>{p.email}</p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
                        Proctor
                      </span>
                    </button>
                  ))
              )}
              {((contactTab === "students" && studentsList.filter(s => s.name.toLowerCase().includes(contactSearch.toLowerCase())).length === 0) ||
                (contactTab === "proctors" && proctorsList.filter(p => p.name.toLowerCase().includes(contactSearch.toLowerCase())).length === 0)) && (
                <p className={`text-center py-6 text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>No contacts found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProgramHeadManual() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [activeSubTab, setActiveSubTab] = useState("generation");
  const [searchQuery, setSearchQuery] = useState("");

  const topics = [
    { id: "generation", label: "Schedule Generator", icon: CalendarIcon, badge: "AI Engine" },
    { id: "schedules", label: "Master Schedules & Export", icon: TableCellsIcon, badge: "Excel Export" },
    { id: "durations", label: "Subject Durations", icon: ClockIcon, badge: "Allotted Time" },
    { id: "rooms", label: "Room Management", icon: BuildingOffice2Icon, badge: "Capacities" },
    { id: "proctors", label: "Proctors & Live Monitoring", icon: UsersIcon, badge: "Check-ins" },
    { id: "rescheduling", label: "Rescheduling & Irregular", icon: ClipboardDocumentListIcon, badge: "Smart Auto" },
    { id: "rules", label: "Distribution Rules", icon: AdjustmentsHorizontalIcon, badge: "Policies" },
    { id: "data", label: "Data Ingestion & Rosters", icon: CircleStackIcon, badge: "Excel Ingest" },
    { id: "chat_notif", label: "Chat & Notifications", icon: ChatBubbleLeftRightIcon, badge: "Real-time" },
  ];

  const filteredTopics = topics.filter(t =>
    t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.badge.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className={`p-6 sm:p-8 rounded-3xl border transition-all relative overflow-hidden ${
        isDark
          ? "bg-gradient-to-br from-slate-900/90 via-slate-800/80 to-blue-950/40 border-slate-700/60 shadow-xl"
          : "bg-gradient-to-br from-blue-50/90 via-indigo-50/60 to-white border-blue-200/70 shadow-sm"
      }`}>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-start sm:items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
              isDark
                ? "bg-blue-600/30 text-blue-400 border border-blue-500/30 shadow-blue-900/30"
                : "bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-blue-500/25"
            }`}>
              <BookOpenIcon className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className={`text-xl sm:text-2xl font-black tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  Program Head Master Manual
                </h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isDark ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "bg-blue-100 text-blue-700"
                }`}>
                  Current Version
                </span>
              </div>
              <p className={`text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Comprehensive operational guide covering the multi-generation Genetic Algorithm engine, dynamic room capacities, 2-consecutive proctor rules, irregular student auto-routing, and live attendance monitoring.
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[240px] sm:min-w-[280px]">
            <MagnifyingGlassIcon className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
            <input
              type="text"
              placeholder="Search guide topics..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs sm:text-sm font-medium border transition-all focus:outline-none focus:ring-2 ${
                isDark
                  ? "bg-slate-900/70 border-slate-700 text-white placeholder-slate-500 focus:ring-blue-500/50"
                  : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:ring-blue-500/30 shadow-sm"
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <XMarkIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Topic Tabs */}
      <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1 border-b border-slate-200/80 dark:border-slate-800">
        {filteredTopics.map((t) => {
          const SubIcon = t.icon;
          const isSelected = activeSubTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveSubTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap shrink-0 group ${
                isSelected
                  ? isDark
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40"
                    : "bg-blue-600 text-white shadow-md shadow-blue-500/25"
                  : isDark
                    ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                    : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              <SubIcon className={`w-4 h-4 transition-transform group-hover:scale-110 ${isSelected ? "text-white" : isDark ? "text-slate-400" : "text-slate-500"}`} />
              <span>{t.label}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase ${
                isSelected
                  ? "bg-white/20 text-white"
                  : isDark
                    ? "bg-slate-800 text-slate-400 group-hover:text-slate-200"
                    : "bg-slate-100 text-slate-600"
              }`}>
                {t.badge}
              </span>
            </button>
          );
        })}
      </div>

      {/* Guide Content Display */}
      <div className={`p-4 sm:p-7 md:p-8 rounded-3xl border transition-all ${
        isDark ? "bg-slate-900/50 border-slate-800/80 backdrop-blur-xl" : "bg-white border-slate-200/70 shadow-sm"
      }`}>
        {/* TAB 1: Schedule Generation */}
        {activeSubTab === "generation" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-base shadow-sm">1</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    AI-Powered Schedule Generation
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Multi-Generation Genetic Algorithm Engine with Strict Hard & Soft Constraint Solvers
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                Core Module
              </span>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              The scheduling engine creates a conflict-free, multi-day examination timetable by evaluating millions of permutations against strict institutional constraints.
            </p>

            {/* Step-by-Step Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <div className="flex items-center gap-2 mb-2 font-bold text-sm text-blue-500">
                  <span className="w-6 h-6 rounded-lg bg-blue-500/10 flex items-center justify-center text-xs">A</span>
                  Target Parameters
                </div>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Choose the academic <strong>Department</strong> (College or Senior High School), the current <strong>Term</strong> (Midterm, Final), and the exact <strong>Start Date</strong> and <strong>End Date</strong> of the examination cycle.
                </p>
              </div>

              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <div className="flex items-center gap-2 mb-2 font-bold text-sm text-indigo-500">
                  <span className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center text-xs">B</span>
                  Preferred Rooms & Exclusions
                </div>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Override room auto-assignment by pinning specific rooms to sections (e.g., Computer Lab 1 for BSIT). Use the <strong>Exclude Subjects</strong> filter to skip online, OJT/practicum, or physical education courses.
                </p>
              </div>

              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <div className="flex items-center gap-2 mb-2 font-bold text-sm text-emerald-500">
                  <span className="w-6 h-6 rounded-lg bg-emerald-500/10 flex items-center justify-center text-xs">C</span>
                  GA Execution & Publishing
                </div>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Click <strong>Generate Schedule</strong>. Watch live generation stages (Chromosome generation, crossover, mutation, fitness evaluation). Review the draft, then click <strong>Publish</strong> to release immutable schedules to proctors and students.
                </p>
              </div>
            </div>

            {/* Current Engine Rules Callout */}
            <div className={`p-5 rounded-2xl border ${isDark ? "bg-blue-950/30 border-blue-900/50 text-blue-200" : "bg-blue-50 border-blue-200/70 text-blue-900"}`}>
              <h4 className="font-bold text-sm flex items-center gap-2 mb-2">
                <SparklesIcon className="w-4 h-4 text-blue-500" />
                Active Scheduling Engine Rules (Current Version)
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-relaxed">
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  <span><strong>Consecutive Breaks:</strong> Enforces configured mandatory break intervals (e.g. 15 or 30 minutes) between exams per section to prevent student mental fatigue.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  <span><strong>2-Proctor Consecutive Limit:</strong> Faculty members cannot be scheduled for more than 2 consecutive exam slots, guaranteeing proctor rest periods.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  <span><strong>Proctor Work Hours:</strong> Start and end teaching hours uploaded via faculty sheets are strictly respected; no duty is assigned outside availability.</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-blue-500 font-bold">•</span>
                  <span><strong>Same-Floor Optimization:</strong> Greedy heuristic groups a section's exams on the same floor or building wing to eliminate unnecessary student rush.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Master Schedules & Export */}
        {activeSubTab === "schedules" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-base shadow-sm">2</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Generated Schedules & Master Excel Export
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Interactive Timetable Views, Search Filters, and Institutional Spreadsheet Export
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                Reporting & Timetable
              </span>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              The <strong>Generated Schedules</strong> console allows administrators to inspect published or draft schedules across all departments, sections, dates, and venues.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <TableCellsIcon className="w-4 h-4 text-indigo-500" />
                  Dual View Modes & Multi-Filters
                </h4>
                <ul className={`text-xs space-y-2.5 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-500 font-bold">•</span>
                    <span><strong>Grid / Matrix View:</strong> Visual time-block matrix showing exam distribution across dates and rooms at a glance.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-500 font-bold">•</span>
                    <span><strong>List / Table View:</strong> Compact chronological list ideal for auditing proctors, section names, and student headcounts.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-indigo-500 font-bold">•</span>
                    <span><strong>Dynamic Filters:</strong> Quickly filter by Date, Section, Proctor Name, Course Code, or Room Number.</span>
                  </li>
                </ul>
              </div>

              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <ArrowDownTrayIcon className="w-4 h-4 text-emerald-500" />
                  Master Excel Export (.xlsx)
                </h4>
                <p className={`text-xs leading-relaxed mb-3 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Click <strong>Export to Excel</strong> to generate an officially formatted, color-coded spreadsheet with separate sheets for College, SHS, and Proctor Duty Rosters.
                </p>
                <div className={`p-3 rounded-xl border text-[11px] leading-relaxed flex items-center gap-2 ${
                  isDark ? "bg-emerald-950/20 border-emerald-900/40 text-emerald-300" : "bg-emerald-50 border-emerald-200 text-emerald-800"
                }`}>
                  <CheckCircleIcon className="w-4 h-4 shrink-0 text-emerald-500" />
                  <span>Exports include timestamps, room numbers, proctor names, course descriptions, and total section student counts.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Subject Durations */}
        {activeSubTab === "durations" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold text-base shadow-sm">3</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Subject Durations & Allotted Time
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Custom Examination Time Allocations per Course and Department
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                Time Settings
              </span>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Not all exams require standard 90-minute blocks. The <strong>Subject Management</strong> tab empowers Program Heads to tailor exact exam durations according to course intensity and institutional policy.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-500">60 Minutes</span>
                <h4 className={`font-bold text-sm mt-2 mb-1 ${isDark ? "text-slate-200" : "text-slate-800"}`}>General / Minor Courses</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Suitable for 1 to 2-unit introductory subjects, values education, or multiple-choice midterm assessments.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500">90 Minutes (Standard)</span>
                <h4 className={`font-bold text-sm mt-2 mb-1 ${isDark ? "text-slate-200" : "text-slate-800"}`}>Standard Lecture Courses</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Default allocation for 3-unit collegiate courses and standard SHS core academic subjects.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-500">120 Minutes</span>
                <h4 className={`font-bold text-sm mt-2 mb-1 ${isDark ? "text-slate-200" : "text-slate-800"}`}>Technical & Major Courses</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Assigned to rigorous majors, programming practicals, accounting problems, and engineering mathematics.
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-xl border text-xs ${isDark ? "bg-slate-800/40 border-slate-700 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
              <strong>How to Edit:</strong> Go to <strong>Subject Management</strong> in the sidebar. Search for the subject code (e.g., `ITEC301`). Select the duration dropdown or enter custom minutes. Click <strong>Save Changes</strong>. The scheduling algorithm will automatically allocate timeslot blocks matching each subject's configured length.
            </div>
          </div>
        )}

        {/* TAB 4: Room Management */}
        {activeSubTab === "rooms" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-base shadow-sm">4</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Room Management & Dynamic Seating Capacities
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Capacity Limits, Building Restrictions, and Consultation Overflow Room
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20">
                Facility Setup
              </span>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Every examination room is registered with a maximum seating limit, floor level, and building designation. The scheduler dynamically balances student distribution to prevent room overcrowding.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                  Dynamic Capacity Editing
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Program Heads can adjust room capacities in real-time under <strong>Room Management</strong>. When a section exceeds a room's seat limit, the system flags a capacity conflict and blocks the assignment.
                </p>
                <div className="mt-3 text-[11px] font-mono p-2 rounded bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
                  Rule: Section Enrollment ≤ Room Seating Capacity
                </div>
              </div>

              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  Building Restrictions & Consultation Area
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Rooms are partitioned by department buildings (e.g. Main College Building vs Annex). During manual rescheduling reviews, the system validates and rejects cross-building assignments.
                </p>
                <p className={`text-xs leading-relaxed mt-2 ${isDark ? "text-amber-300" : "text-amber-700"}`}>
                  <strong>Consultation Area:</strong> Dedicated fallback venue used for after 5:00 PM overflow when no standard daytime slot fits an irregular student.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: Proctor Management & Monitoring */}
        {activeSubTab === "proctors" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-base shadow-sm">5</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Proctor Management & Live Attendance Monitoring
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Availability Ingestion, 2-Consecutive Rules, and Real-Time Room Check-ins
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                Staff Supervision
              </span>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Manage faculty proctoring duties fairly while monitoring on-site attendance during live exam days.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-1.5 ${isDark ? "text-slate-200" : "text-slate-800"}`}>1. Ingest Teaching Loads</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Under <strong>Proctor Management</strong>, upload the faculty teaching load Excel sheet. The engine automatically marks teaching hours as unavailable so teachers are never double-booked.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-1.5 ${isDark ? "text-slate-200" : "text-slate-800"}`}>2. Exclusions & Limits</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Toggle exclusion switches for department heads or part-time staff. The system strictly caps assignments at <strong>2 consecutive duties</strong> and balances cumulative hours across the roster.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-1.5 ${isDark ? "text-slate-200" : "text-slate-800"}`}>3. Live Check-In Board</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  The <strong>Proctor Monitoring</strong> board displays active rooms in real-time. Badges update instantly when proctors click "Check In" on their devices. Program Heads can confirm attendance or reassign an emergency substitute.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: Rescheduling & Irregular Students */}
        {activeSubTab === "rescheduling" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-900/40 flex items-center justify-center text-rose-600 dark:text-rose-400 font-bold text-base shadow-sm">6</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Rescheduling Requests & Irregular Student Engine
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Conflict Detection, Smart Auto-Assignment, 5:00 PM Consultation Area, and Manual Review
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                Conflict Resolution
              </span>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              When irregular curriculum enrollments produce overlapping exams, students submit rescheduling petitions with supporting documentation. The system provides both automated and manual resolution pathways.
            </p>

            <div className={`p-5 rounded-2xl border ${isDark ? "bg-rose-950/20 border-rose-900/40 text-rose-200" : "bg-rose-50 border-rose-200/70 text-rose-900"}`}>
              <h4 className="font-bold text-sm mb-2 flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-rose-500" />
                Irregular Student Smart Auto-Assignment Workflow
              </h4>
              <p className="text-xs leading-relaxed mb-3">
                When an irregular student submits a conflict request, clicking <strong>Approve</strong> triggers the automated placement engine:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs leading-relaxed">
                <div>
                  <strong>1. Earliest Conflict-Free Timeslot:</strong> Finds the next available slot on the scheduled date, guaranteeing a mandatory 15-minute gap from any other exam the student is taking.
                </div>
                <div>
                  <strong>2. Room Capacity & Load Balancing:</strong> Evaluates room occupancy and assigns the student to a room with the lowest headcount within capacity limits.
                </div>
                <div>
                  <strong>3. Building Restriction Match:</strong> Ensures the exam is kept within the student's designated department building.
                </div>
                <div>
                  <strong>4. After 5:00 PM Consultation Fallback:</strong> If no daytime slot fits before 5:00 PM, the system automatically schedules the exam to 5:00 PM in the Consultation Area without a proctor, notifying the Admin to personally assign an examiner.
                </div>
              </div>
            </div>

            {/* Manual Review Callout */}
            <div className={`p-4 rounded-xl border text-xs ${isDark ? "bg-slate-800/40 border-slate-700 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
              <h5 className="font-bold text-sm mb-1 text-blue-500">Manual Review Option:</h5>
              Program Heads can click <strong>Manual Review</strong> to inspect conflicting subjects, select a custom date, pick an alternate room, and view attached medical or institutional proof. The system validates building restrictions and room capacity before letting you save.
            </div>
          </div>
        )}

        {/* TAB 7: Distribution Rules */}
        {activeSubTab === "rules" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/40 flex items-center justify-center text-cyan-600 dark:text-cyan-400 font-bold text-base shadow-sm">7</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Distribution Rules Engine
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Curriculum Subject Balancing, Session Directives, and Maximum Daily Loads
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-cyan-500/10 text-cyan-600 border border-cyan-500/20">
                Institutional Policy
              </span>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Configure academic scheduling policies that the Genetic Algorithm optimizes as hard and soft constraints.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <AdjustmentsHorizontalIcon className="w-4 h-4 text-cyan-500" />
                  Subject Category Distribution
                </h4>
                <ul className={`text-xs space-y-2 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  <li>• <strong>General Education (GE):</strong> Constrain GE subjects to morning sessions across Day 1 to Day 3.</li>
                  <li>• <strong>Major Subjects:</strong> Spread heavy technical courses across non-adjacent days to prevent exam stacking.</li>
                  <li>• <strong>SHS Core Subjects:</strong> Dedicate morning time blocks for core subjects and afternoon for specialized strands.</li>
                </ul>
              </div>

              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <ClockIcon className="w-4 h-4 text-cyan-500" />
                  Daily Student Load Caps
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Set the <strong>Maximum Exams Per Day</strong> (default: 2 or 3). The algorithm heavily penalizes schedules that force students into 4 consecutive examinations in one day.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 8: Data Ingestion & Section Rosters */}
        {activeSubTab === "data" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center text-teal-600 dark:text-teal-400 font-bold text-base shadow-sm">8</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Data Ingestion & Section Rosters
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Bulk Excel Ingestion for Curricula, Proctors, Students, and Printable Attendance Sheets
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-teal-500/10 text-teal-600 border border-teal-500/20">
                Data Management
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-xs uppercase tracking-wider text-teal-500 mb-1`}>1. Curriculum Catalog</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Under <strong>Data Import</strong>, upload the official course catalog with course codes, units, and year levels.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-xs uppercase tracking-wider text-teal-500 mb-1`}>2. Proctor Accounts</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Under <strong>Proctor Accounts</strong>, bulk ingest proctor credentials, departments, and contracted hours via Excel.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-xs uppercase tracking-wider text-teal-500 mb-1`}>3. Student Accounts</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Under <strong>Student Accounts</strong>, upload enrollment sheets. The system automatically tags regular and irregular students.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-xs uppercase tracking-wider text-teal-500 mb-1`}>4. Section List</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Open <strong>Section List</strong> to inspect enrolled students per section and export official room attendance sign-in sheets.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 9: Chat & Notifications */}
        {activeSubTab === "chat_notif" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-base shadow-sm">9</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    In-App Chat Support & Notification Broadcasts
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Real-Time Messaging with Faculty Proctors and Students
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                Direct Communications
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <ChatBubbleLeftRightIcon className="w-4 h-4 text-blue-500" />
                  Live Chat Directory
                </h4>
                <ul className={`text-xs space-y-2.5 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">•</span>
                    <span><strong>Directory Search:</strong> Start a conversation with any enrolled student or faculty proctor by searching their name.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">•</span>
                    <span><strong>Rich Controls:</strong> Edit sent messages, delete messages, or clear chat history with modal confirmations.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">•</span>
                    <span><strong>Badge Counters:</strong> Unread notification badges on the navigation bar alert you to incoming questions in real-time.</span>
                  </li>
                </ul>
              </div>

              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <BellIcon className="w-4 h-4 text-blue-500" />
                  System Announcements & Alerts
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Publishing an exam timetable or approving a rescheduling petition automatically generates in-app notifications and email alerts to all affected users, ensuring instant synchronization.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NavGroup({ label, icon: GroupIcon, children, defaultOpen = false, isDark }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all duration-200 group ${
          isDark
            ? "text-slate-500 hover:text-slate-300"
            : "text-slate-400 hover:text-slate-600"
        }`}
      >
        <div className="flex items-center gap-2">
          <GroupIcon className="w-3.5 h-3.5" />
          <span className="text-[11px] font-bold uppercase tracking-widest">{label}</span>
        </div>
        <ChevronRightIcon
          className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
        />
      </button>
      {open && (
        <div className="space-y-1 ml-0">
          {children}
        </div>
      )}
    </div>
  );
}

function NavItem({ item, activeTab, setActiveTab, isDark, badge, onSelect }) {
  const Icon = item.icon;
  const isActive = activeTab === item.id;
  return (
    <button
      onClick={() => {
        setActiveTab(item.id);
        if (onSelect) onSelect();
      }}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 group ${
        isActive
          ? isDark
            ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50"
            : "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
          : isDark
            ? "text-slate-300 hover:bg-slate-800/60 hover:text-white"
            : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon className={`w-4.5 h-4.5 transition-transform duration-200 ${isActive ? "scale-110" : "group-hover:scale-110"}`} />
        <span className="text-sm font-semibold">{item.label}</span>
      </div>
      {badge > 0 && (
        <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
          {badge}
        </span>
      )}
    </button>
  );
}

function NavSidebar({ activeTab, setActiveTab, isDark, unreadChatCount, pendingRescheduleCount, onSelectNavItem }) {
  const schedulingIds = ["generate", "schedules", "durations"];
  const managementIds = ["proctors", "rooms", "monitoring", "rescheduling", "chat", "section-students"];
  const dataIds = ["import", "proctors-import", "students", "rules"];

  const isSchedulingActive = schedulingIds.includes(activeTab);
  const isManagementActive = managementIds.includes(activeTab);
  const isDataActive = dataIds.includes(activeTab);

  return (
    <nav className="flex-1 px-4 py-5 space-y-3 overflow-y-auto custom-scrollbar">
      {/* Scheduling Group */}
      <NavGroup label="Scheduling" icon={CalendarIcon} defaultOpen={isSchedulingActive} isDark={isDark}>
        <NavItem item={{ id: "generate", icon: CalendarIcon, label: "Generate Schedule" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
        <NavItem item={{ id: "schedules", icon: CalendarDaysIcon, label: "Generated Schedules" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
        <NavItem item={{ id: "durations", icon: ClockIcon, label: "Subject Management" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
      </NavGroup>

      {/* Management Group */}
      <NavGroup label="Management" icon={UsersIcon} defaultOpen={isManagementActive} isDark={isDark}>
        <NavItem item={{ id: "proctors", icon: UsersIcon, label: "Proctor Management" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
        <NavItem item={{ id: "rooms", icon: BuildingOffice2Icon, label: "Room Management" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
        <NavItem item={{ id: "monitoring", icon: ShieldCheckIcon, label: "Proctor Monitoring" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
        <NavItem item={{ id: "rescheduling", icon: ClipboardDocumentListIcon, label: "Rescheduling" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={pendingRescheduleCount} onSelect={onSelectNavItem} />
        <NavItem item={{ id: "chat", icon: ChatBubbleLeftRightIcon, label: "Chat" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={unreadChatCount} onSelect={onSelectNavItem} />
        <NavItem item={{ id: "section-students", icon: UserGroupIcon, label: "Section List" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
      </NavGroup>

      {/* Data & Imports Group */}
      <NavGroup label="Data & Imports" icon={CircleStackIcon} defaultOpen={isDataActive} isDark={isDark}>
        <NavItem item={{ id: "import", icon: CircleStackIcon, label: "Data Import" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
        <NavItem item={{ id: "proctors-import", icon: UsersIcon, label: "Proctor Accounts" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
        <NavItem item={{ id: "students", icon: UserIcon, label: "Student Accounts" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
        <NavItem item={{ id: "rules", icon: AdjustmentsHorizontalIcon, label: "Distribution Rules" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
      </NavGroup>

      {/* Help standalone */}
      <div className={`pt-2 border-t ${isDark ? "border-slate-800" : "border-slate-100"}`}>
        <NavItem item={{ id: "manual", icon: BookOpenIcon, label: "User Manual" }} activeTab={activeTab} setActiveTab={setActiveTab} isDark={isDark} badge={0} onSelect={onSelectNavItem} />
      </div>
    </nav>
  );
}

export default function ProgramHeadDashboard() {
  const [activeTab, setActiveTab] = useState("generate");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [generationState, setGenerationState] = useState(INITIAL_GENERATION_STATE);
  const { theme } = useTheme();
  const { user, login, logout } = useUser();
  const navigate = useNavigate();
  const isDark = theme === "dark";
  const { showWarning } = useToast();

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isClearNotifModalOpen, setIsClearNotifModalOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const latestUnreadNotif = notifications.find(n => !n.is_read);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [pendingRescheduleCount, setPendingRescheduleCount] = useState(0);

  const handlePendingRescheduleCountChange = useCallback((count) => {
    setPendingRescheduleCount(count);
  }, []);

  const handleGenerationStateChange = useCallback((nextState) => {
    setGenerationState(nextState);
  }, []);
  const generationProgress = generationState.progress || INITIAL_GENERATION_STATE.progress;
  const generationPercent = Math.max(0, Math.min(100, Number(generationProgress.percent) || 0));
  const isGenerationRunning = generationState.loading || generationProgress.status === "running";

  useEffect(() => {
    if (!user) return;
    const fetchNotifications = async () => {
      try {
        const res = await api.get(`/notifications/program_head/${user.id}`);
        if (res.data) {
          setNotifications(res.data);
        }
      } catch (err) {
        console.error("Error fetching notifications:", err);
      }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000);
    return () => clearInterval(interval);
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const checkUnread = () => {
      api.get("/chat/unread-count")
        .then(res => setUnreadChatCount(res.data.unread_count))
        .catch(() => {});
    };
    checkUnread();
    const interval = setInterval(checkUnread, 8000);
    return () => clearInterval(interval);
  }, [user, activeTab]);

  useEffect(() => {
    if (!user) return;
    const fetchPendingRescheduleCount = async () => {
      try {
        const res = await api.get("/rescheduling/pending/count");
        setPendingRescheduleCount(res.data.count);
      } catch (err) {
        console.error("Error fetching pending reschedule count:", err);
      }
    };
    fetchPendingRescheduleCount();
    const interval = setInterval(fetchPendingRescheduleCount, 10000);
    return () => clearInterval(interval);
  }, [user]);

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNotification = async (e, id) => {
    e.stopPropagation();
    try {
      await api.delete(`/notifications/${id}`);
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err) {
      console.error("Error deleting notification:", err);
    }
  };

  const confirmClearAllNotifications = (e) => {
    e.stopPropagation();
    setShowNotifications(false);
    setIsClearNotifModalOpen(true);
  };

  const executeClearAllNotifications = async () => {
    if (!user) return;
    try {
      await api.delete(`/notifications/clear/program_head/${user.id}`);
      setNotifications([]);
    } catch (err) {
      console.error("Error clearing notifications:", err);
    } finally {
      setIsClearNotifModalOpen(false);
    }
  };

  const handleNotificationClick = (notif) => {
    setShowNotifications(false);
    
    if (!notif.is_read) {
      markRead(notif.id);
    }
    
    const msg = (notif.message || "").toLowerCase();
    const type = (notif.type || "").toLowerCase();
    
    if (msg.includes("rescheduling") || msg.includes("reschedule") || type.includes("reschedule")) {
      setActiveTab("rescheduling");
    } else if (msg.includes("attendance") || msg.includes("confirm")) {
      setActiveTab("monitoring");
    } else if (msg.includes("proctor") || msg.includes("teaching schedule") || msg.includes("schedule")) {
      if (msg.includes("attendance") || msg.includes("confirmed")) {
        setActiveTab("monitoring");
      } else if (msg.includes("rescheduling") || msg.includes("reschedule")) {
        setActiveTab("rescheduling");
      } else {
        setActiveTab("proctors");
      }
    } else {
      setActiveTab("rescheduling");
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

  if (!user) {
    return (
      <div className={`min-h-screen ${isDark ? "bg-slate-900" : "bg-slate-50"} flex items-center justify-center`}>
        <p className={isDark ? "text-slate-300" : "text-slate-600"}>Redirecting...</p>
      </div>
    );
  }

  if (user && user.is_first_login) {
    return (
      <FirstTimePasswordChange
        user={user}
        onPasswordChanged={(updatedUser) => login(updatedUser)}
        isDark={isDark}
        onLogout={handleLogout}
        onSkip={() => login({
          ...user,
          is_first_login: false,
          temporary_skip: true
        })}
      />
    );
  }

  return (
    <div className={`h-screen h-dvh flex overflow-hidden transition-colors duration-300 ${isDark ? "bg-slate-900" : "bg-slate-50"}`}>
      {showNotifications && (
        <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}></div>
      )}
      {showNotifications && (
        <div 
          onClick={(e) => e.stopPropagation()} 
          className={`fixed left-3 right-3 top-20 sm:left-auto sm:right-6 sm:top-24 sm:w-80 max-h-96 flex flex-col rounded-2xl shadow-2xl border z-50 transform origin-top-right transition-all animate-in fade-in scale-95 duration-200 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
        >
          <div className={`px-5 py-4 border-b flex justify-between items-center ${isDark ? "border-slate-700" : "border-slate-100"}`}>
            <div className="flex items-center gap-2">
              <h3 className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>Notifications</h3>
              {unreadCount > 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">{unreadCount} New</span>}
            </div>
            {notifications.length > 0 && (
              <button
                onClick={confirmClearAllNotifications}
                className="text-xs font-semibold text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1.5"
                title="Clear all notifications"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            )}
          </div>
          <div className="overflow-y-auto p-2 custom-scrollbar flex-1">
            {notifications.length === 0 ? (
              <div className={`p-6 text-center text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}><BellIcon className="w-8 h-8 mx-auto mb-2 opacity-20" />You're all caught up!</div>
            ) : notifications.map((notif) => (
              <div key={notif.id} onClick={() => handleNotificationClick(notif)} className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 mb-1 group relative ${notif.is_read ? (isDark ? "hover:bg-slate-700/50 opacity-60" : "hover:bg-slate-50 opacity-60") : (isDark ? "bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/30" : "bg-blue-50 hover:bg-blue-100 border border-blue-100")}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-3 min-w-0 flex-1">
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${notif.is_read ? "bg-slate-400" : "bg-blue-500"}`}></div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${isDark ? "text-slate-200" : "text-slate-800"}`}>{notif.message}</p>
                      <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>{notif.created_at ? new Date(notif.created_at).toLocaleString() : "Just now"}</p>
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleDeleteNotification(e, notif.id)}
                    className={`p-1 rounded-lg transition-colors shrink-0 ${isDark ? "text-slate-400 hover:text-red-400 hover:bg-slate-700" : "text-slate-400 hover:text-red-600 hover:bg-slate-200/70"}`}
                    title="Delete notification"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
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
      <aside className={`fixed lg:static inset-y-0 left-0 w-[min(18rem,85vw)] h-full flex flex-col border-r transition-transform duration-300 z-50 shrink-0 transform ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"} ${isDark ? "bg-slate-900/95 lg:bg-slate-900/80 border-slate-800 backdrop-blur-xl" : "bg-white/95 lg:bg-white border-slate-200 backdrop-blur-xl"}`}>
        <div className="p-6 flex flex-col items-center gap-4 border-b border-transparent relative">
          <button 
            onClick={() => setIsMobileMenuOpen(false)}
            type="button"
            aria-label="Close menu"
            className="absolute top-4 right-4 p-2 rounded-lg lg:hidden text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105 duration-300 ${isDark ? "bg-gradient-to-br from-blue-600 to-indigo-700" : "bg-gradient-to-br from-blue-500 to-blue-700"}`}>
            <UserIcon className="w-8 h-8 text-white" />
          </div>
          <div className="text-center">
            <h2 className={`text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>{user?.name || "Admin"}</h2>
            <div className="flex items-center justify-center gap-1 mt-1">
              {user?.is_super_admin ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 text-amber-400 border border-amber-500/30">
                  Super Admin (GE)
                </span>
              ) : (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isDark ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
                  {user?.department_code ? `${user.department_code} Admin` : "Exam Management"}
                </span>
              )}
            </div>
          </div>
        </div>

        <NavSidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          isDark={isDark}
          unreadChatCount={unreadChatCount}
          pendingRescheduleCount={pendingRescheduleCount}
          onSelectNavItem={() => setIsMobileMenuOpen(false)}
        />

        <footer className={`p-6 text-xs text-center font-medium border-t transition-colors ${isDark ? "border-slate-800 text-slate-500" : "border-slate-100 text-slate-400"}`}>
          v1.0 • Built with React
        </footer>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
        <header className={`sticky top-0 z-20 backdrop-blur-2xl border-b transition-all duration-300 ${isDark ? "bg-slate-900/70 border-slate-800" : "bg-white/70 border-slate-200"}`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button 
                  onClick={() => setIsMobileMenuOpen(true)}
                  type="button"
                  aria-label="Open menu"
                  className={`lg:hidden p-2 -ml-2 rounded-xl transition-colors ${isDark ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"}`}
                >
                  <Squares2X2Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <div className="min-w-0">
                  <h1 className={`text-base sm:text-2xl font-bold tracking-tight transition-colors truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                    {activeTab === "generate" ? "Exam Schedule Generator" :
                      activeTab === "schedules" ? "Generated Exam Schedules" :
                        activeTab === "durations" ? "Subject Management" :
                          activeTab === "proctors" ? "Proctor Management" :
                            activeTab === "rooms" ? "Room Management" :
                              activeTab === "monitoring" ? "Proctor Attendance Monitoring" :
                                activeTab === "rescheduling" ? "Rescheduling Requests" :
                                  activeTab === "chat" ? "Chat" :
                                    activeTab === "rules" ? "Distribution Rules" :
                                      activeTab === "import" ? "Curriculum & Catalog Import" :
                                        activeTab === "proctors-import" ? "Proctor Accounts & Import" :
                                         activeTab === "students" ? "Student Accounts & Import" :
                                           activeTab === "section-students" ? "Section List" :
                                             activeTab === "manual" ? "User Manual" : "Program Head Dashboard"}
                  </h1>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:gap-4 shrink-0">
                <div className={`hidden md:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${
                  user?.is_super_admin
                    ? isDark ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-amber-50 text-amber-800 border border-amber-200"
                    : isDark ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-blue-50 text-blue-700 border border-blue-100"
                }`}>
                  <ShieldCheckIcon className="w-3.5 h-3.5" />
                  {user?.is_super_admin ? "Super Admin (GE)" : `${user?.department_code || "Dept"} Admin`}
                </div>
                <div className="relative">
                  <button onClick={() => setShowNotifications(!showNotifications)} className={`relative p-2.5 rounded-xl transition-all duration-300 ${isDark ? "text-slate-300 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}>
                    <BellIcon className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-900 animate-pulse">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                </div>
                <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-2 hidden sm:block"></div>
                <SettingsDropdown onLogout={handleLogout} isDark={isDark} />
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6 lg:p-8">
          <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
            {latestUnreadNotif && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-300 relative z-10">
                <div className={`p-3.5 sm:p-4 rounded-2xl border backdrop-blur-md shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                  isDark 
                    ? "bg-blue-950/40 border-blue-900/60 text-blue-100" 
                    : "bg-blue-50/95 border-blue-200/80 text-blue-900"
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-600 text-white shadow-sm"
                    }`}>
                      <BellIcon className="w-5 h-5 animate-bounce" />
                    </div>
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider block opacity-75">New Notification</span>
                      <p className="text-sm font-semibold mt-0.5 leading-snug">{latestUnreadNotif.message}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    <button 
                      onClick={() => handleNotificationClick(latestUnreadNotif)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        isDark 
                          ? "bg-blue-600 hover:bg-blue-500 text-white" 
                          : "bg-blue-600 hover:bg-blue-700 text-white"
                      }`}
                    >
                      View Details
                    </button>
                    <button 
                      onClick={() => markRead(latestUnreadNotif.id)}
                      className={`p-2 rounded-lg transition-all ${
                        isDark 
                          ? "text-blue-400 hover:text-white hover:bg-slate-800" 
                          : "text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                      }`}
                      title="Mark as read"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab !== "generate" && isGenerationRunning && (
              <div className={`rounded-2xl border overflow-hidden transition-colors duration-300 ${isDark ? "bg-blue-950/40 border-blue-900/60" : "bg-blue-50 border-blue-100"}`}>
                <div className="p-4 md:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-white text-blue-600 shadow-sm"}`}>
                        <ArrowPathIcon className="w-5 h-5 animate-spin" />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-sm font-bold ${isDark ? "text-blue-100" : "text-blue-900"}`}>
                          {generationProgress.phase || "Generating schedule"}
                        </p>
                        <p className={`mt-1 text-xs leading-relaxed ${isDark ? "text-blue-200/80" : "text-blue-700"}`}>
                          {generationProgress.detail || "Generation is running in the background."}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveTab("generate")}
                      className={`shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition ${isDark ? "bg-blue-500 text-white hover:bg-blue-400" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                    >
                      View Progress
                    </button>
                  </div>
                  <div className={`mt-4 h-2 overflow-hidden rounded-full ${isDark ? "bg-blue-950" : "bg-white"}`}>
                    <div
                      className="h-full rounded-full bg-blue-600 transition-all duration-500"
                      style={{ width: `${generationPercent}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            )}

            <div className={`rounded-2xl shadow-sm border overflow-hidden transition-colors duration-300 ${isDark ? "bg-slate-800/50 border-slate-700/50" : "bg-white border-slate-200"}`}>
              <div className="p-3.5 sm:p-6 md:p-8">
                <div className={activeTab === "generate" ? "block" : "hidden"}>
                  <ExamScheduler
                    onBeforeGenerate={checkMissingSchedulesBeforeGenerate}
                    onGenerationStateChange={handleGenerationStateChange}
                  />
                </div>
                <div className={activeTab === "import" ? "block" : "hidden"}>
                  <DataImport isGenerating={isGenerationRunning} />
                </div>
                <div className={activeTab === "students" ? "block" : "hidden"}>
                  <StudentImport isGenerating={isGenerationRunning} />
                </div>
                <div className={activeTab === "proctors-import" ? "block" : "hidden"}>
                  <ProctorImport isGenerating={isGenerationRunning} />
                </div>
                {activeTab === "schedules" ? <GeneratedExamSchedules isGenerating={isGenerationRunning} /> :
                  activeTab === "durations" ? <SubjectDurationsManager isGenerating={isGenerationRunning} /> :
                    activeTab === "proctors" ? <AddProctor isGenerating={isGenerationRunning} /> :
                      activeTab === "rooms" ? <RoomManagement isGenerating={isGenerationRunning} /> :
                        activeTab === "rules" ? <DistributionRulesManager isGenerating={isGenerationRunning} /> :
                          activeTab === "monitoring" ? <ProctorMonitoring /> :
                            activeTab === "rescheduling" ? <ReschedulingRequests isGenerating={isGenerationRunning} onRequestsChange={handlePendingRescheduleCountChange} /> :
                              activeTab === "chat" ? <ChatSupportPanel /> :
                                activeTab === "section-students" ? <SectionStudentList /> :
                                  activeTab === "manual" ? <ProgramHeadManual /> :
                                    null}
              </div>
            </div>

            {activeTab === "generate" && (
              <div className={`rounded-2xl shadow-sm border overflow-hidden transition-all duration-300 ${isDark ? "bg-slate-800/50 border-slate-700/50 hover:border-slate-600" : "bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100 hover:shadow-md"}`}>
                <div className="p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-inner ${isDark ? "bg-slate-700 text-yellow-400" : "bg-white text-yellow-500"}`}>
                      <SparklesIcon className="w-6 h-6" />
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

      <ConfirmationModal
        isOpen={isClearNotifModalOpen}
        title="Clear All Notifications"
        message="Are you sure you want to clear all notifications? This action cannot be undone."
        confirmLabel="Clear All"
        isDanger={true}
        onConfirm={executeClearAllNotifications}
        onCancel={() => setIsClearNotifModalOpen(false)}
      />
    </div>
  );
}
