import React, { useState, useEffect, useCallback, useRef } from "react";
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
  Loader2,
  ShieldCheck,
  DoorOpen,
  BookOpen,
  User,
  MessageSquare,
  Send,
  ChevronRight,
  Edit,
  Trash2,
} from "lucide-react";
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
  const isDark = theme === "dark";
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState("pending");
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { showSuccess, showError } = useToast();

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

  const handleReview = async (id, status, comments = "") => {
    if (isGenerating) {
      showError("Cannot review rescheduling requests while schedule generation is ongoing");
      return;
    }
    try {
      const res = await api.put(`/rescheduling/${id}/review`, {
        status,
        reviewer_comments: comments,
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
      <div className={`flex border-b ${isDark ? "border-gray-700" : "border-gray-200"} mb-2`}>
        <button
          onClick={() => setActiveSubTab("pending")}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all ${activeSubTab === "pending"
            ? "border-blue-500 text-blue-500"
            : `border-transparent ${isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700"}`
            }`}
        >
          Pending Requests ({requests.length})
        </button>
        <button
          onClick={() => setActiveSubTab("history")}
          className={`px-5 py-3 text-sm font-semibold border-b-2 transition-all ${activeSubTab === "history"
            ? "border-blue-500 text-blue-500"
            : `border-transparent ${isDark ? "text-gray-400 hover:text-gray-200" : "text-gray-500 hover:text-gray-700"}`
            }`}
        >
          Rescheduling History
        </button>
      </div>

      {activeSubTab === "pending" ? (
        loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 rounded-full border-4 border-t-blue-500 animate-spin" />
            <span className={`ml-3 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Loading requests...</span>
          </div>
        ) : requests.length === 0 ? (
          <div className={`text-center py-16 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No pending rescheduling requests.</p>
            <p className="text-sm mt-1">Students with exam conflicts can submit requests from their dashboard.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {requests.map((req) => (
              <div
                key={req.id}
                className={`p-6 rounded-xl border shadow-sm transition-all ${isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-200 hover:shadow-md"}`}
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-5 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${isDark ? "bg-yellow-900/40 text-yellow-300" : "bg-yellow-100 text-yellow-700"
                        }`}>Pending</span>
                    </div>
                    <h4 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                      {req.course_name}
                    </h4>
                    <p className={`text-sm mt-0.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                      {req.student_name} &bull; Section: {req.section_name}
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => handleReview(req.id, "approved")}
                      disabled={isGenerating}
                      className={`px-4 py-2 rounded-lg font-semibold text-sm transition bg-green-500 ${isGenerating ? "bg-green-600 text-green-300 cursor-not-allowed" : "bg-green-50 hover:bg-green-500/30 text-white"
                        }`}
                      title={isGenerating ? "Cannot approve while schedule generation is running" : ""}
                    >
                      ✓ Approve
                    </button>
                    <button
                      onClick={() => {
                        if (isGenerating) return;
                        const comments = prompt("Rejection reason (optional):");
                        if (comments !== null) handleReview(req.id, "rejected", comments || "");
                      }}
                      disabled={isGenerating}
                      className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${isGenerating ? "bg-red-500/30 text-red-300 cursor-not-allowed" : "bg-red-500 hover:bg-red-600 text-white"
                        }`}
                      title={isGenerating ? "Cannot reject while schedule generation is running" : ""}
                    >
                      ✗ Reject
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className={`p-4 rounded-lg border ${isDark ? "bg-gray-700/50 border-gray-600" : "bg-gray-50 border-gray-100"}`}>
                    <h5 className={`text-xs font-bold uppercase tracking-wide mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Original Exam</h5>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                      <span className="font-medium">Date:</span> {req.original_exam_date}<br />
                      <span className="font-medium">Time:</span> {req.original_time}<br />
                      <span className="font-medium">Type:</span> {req.exam_type}
                    </p>
                  </div>
                  <div className={`p-4 rounded-lg border ${isDark ? "bg-blue-900/20 border-blue-800/40" : "bg-blue-50 border-blue-100"}`}>
                    <h5 className={`text-xs font-bold uppercase tracking-wide mb-2 ${isDark ? "text-blue-400" : "text-blue-600"}`}>Requested Schedule</h5>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                      <span className="font-medium">Mode:</span> {req.requested_mode}<br />
                      <span className="font-medium">Date:</span> {req.preferred_date || "Flexible"}<br />
                      <span className="font-medium">Time:</span> {req.preferred_time || "To be determined"}
                    </p>
                  </div>
                </div>

                <div className={`p-4 rounded-lg border ${isDark ? "bg-gray-700/30 border-gray-700" : "bg-gray-50 border-gray-100"}`}>
                  <h5 className={`text-xs font-bold uppercase tracking-wide mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Reason for Request</h5>
                  <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mr-2 mb-1 ${isDark ? "bg-gray-600 text-gray-200" : "bg-gray-200 text-gray-700"}`}>
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
            <div className="w-8 h-8 rounded-full border-4 border-t-blue-500 animate-spin" />
            <span className={`ml-3 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Loading history...</span>
          </div>
        ) : history.length === 0 ? (
          <div className={`text-center py-16 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No rescheduling history.</p>
            <p className="text-sm mt-1">Processed rescheduling requests will appear here.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {history.map((req) => (
              <div
                key={req.id}
                className={`p-6 rounded-xl border shadow-sm transition-all ${isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-200 hover:shadow-md"}`}
              >
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-5 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${req.status === "approved"
                        ? (isDark ? "bg-green-900/40 text-green-300" : "bg-green-100 text-green-700")
                        : (isDark ? "bg-red-900/40 text-red-300" : "bg-red-100 text-red-700")
                        }`}>
                        {req.status}
                      </span>
                      <span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                        ID: {req.id}
                      </span>
                    </div>
                    <h4 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>
                      {req.course_name}
                    </h4>
                    <p className={`text-sm mt-0.5 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                      {req.student_name} &bull; Section: {req.section_name}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className={`p-4 rounded-lg border ${isDark ? "bg-gray-700/50 border-gray-600" : "bg-gray-50 border-gray-100"}`}>
                    <h5 className={`text-xs font-bold uppercase tracking-wide mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Original Exam</h5>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                      <span className="font-medium">Date:</span> {req.original_exam_date}<br />
                      <span className="font-medium">Time:</span> {req.original_time}<br />
                      <span className="font-medium">Type:</span> {req.exam_type}
                    </p>
                  </div>
                  <div className={`p-4 rounded-lg border ${req.status === "approved"
                    ? (isDark ? "bg-blue-900/20 border-blue-800/40" : "bg-blue-50 border-blue-100")
                    : (isDark ? "bg-red-900/10 border-red-900/20" : "bg-red-50/50 border-red-100")
                    }`}>
                    <h5 className={`text-xs font-bold uppercase tracking-wide mb-2 ${req.status === "approved"
                      ? (isDark ? "text-blue-400" : "text-blue-600")
                      : (isDark ? "text-red-400" : "text-red-600")
                      }`}>
                      {req.status === "approved" ? "Rescheduled To" : "Requested Schedule (Rejected)"}
                    </h5>
                    <p className={`text-sm leading-relaxed ${isDark ? "text-gray-200" : "text-gray-700"}`}>
                      <span className="font-medium">Mode:</span> {req.requested_mode}<br />
                      <span className="font-medium">Date:</span> {formatPreferredDate(req.preferred_date)}<br />
                      <span className="font-medium">Time:</span> {req.preferred_time || "To be determined"}
                    </p>
                  </div>
                </div>

                <div className={`p-4 rounded-lg border mb-4 ${isDark ? "bg-gray-700/30 border-gray-700" : "bg-gray-50 border-gray-100"}`}>
                  <h5 className={`text-xs font-bold uppercase tracking-wide mb-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Reason for Request</h5>
                  <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold mr-2 mb-1 ${isDark ? "bg-gray-600 text-gray-200" : "bg-gray-200 text-gray-700"}`}>
                      {req.reason_type}
                    </span>
                    {req.detailed_explanation}
                  </p>
                </div>

                {req.reviewer_comments && (
                  <div className={`p-4 rounded-lg border border-dashed ${isDark ? "bg-slate-800/40 border-gray-700" : "bg-slate-50/50 border-gray-200"}`}>
                    <h5 className={`text-xs font-bold uppercase tracking-wide mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Reviewer Comments</h5>
                    <p className={`text-sm italic ${isDark ? "text-gray-300" : "text-gray-600"}`}>
                      "{req.reviewer_comments}"
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
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
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");

  const fetchConversations = async () => {
    try {
      const res = await api.get("/chat/conversations");
      setConversations(res.data);
    } catch (err) { console.error("conv err", err); }
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

  const deleteMessage = async (messageId) => {
    if (!window.confirm("Are you sure you want to delete this message?")) return;
    try {
      await api.delete(`/chat/messages/${messageId}`);
      await fetchMessages(activeStudentId);
      fetchConversations();
    } catch (err) {
      console.error("delete err", err);
    }
  };

  const deleteConversation = async (studentId) => {
    if (!window.confirm("Are you sure you want to clear this conversation? This will delete all messages.")) return;
    try {
      await api.delete(`/chat/conversations/${studentId}`);
      setMessages([]);
      fetchConversations();
    } catch (err) {
      console.error("clear conv err", err);
    }
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
    <div className={`flex h-[620px] rounded-xl border overflow-hidden ${isDark ? "border-gray-700" : "border-gray-200"}`}>
      {/* Left: conversation list */}
      <div className={`w-72 flex flex-col border-r ${isDark ? "bg-gray-800/60 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
        <div className={`p-4 border-b ${isDark ? "border-gray-700" : "border-gray-200"}`}>
          <h3 className={`font-bold text-sm uppercase tracking-wide ${isDark ? "text-gray-300" : "text-gray-600"}`}>
            Students
          </h3>
          <p className={`text-xs mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>{conversations.length} conversation{conversations.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {conversations.length === 0 ? (
            <div className={`p-6 text-center text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No students yet
            </div>
          ) : conversations.map((conv) => (
            <button
              key={conv.student_id}
              onClick={() => selectStudent(conv.student_id, conv.student_name, conv.student_type)}
              className={`w-full p-4 text-left border-b transition-all ${activeStudentId === conv.student_id
                ? isDark ? "bg-blue-600/20 border-blue-700/50" : "bg-blue-50 border-blue-100"
                : isDark ? "border-gray-700/50 hover:bg-gray-700/40" : "border-gray-100 hover:bg-gray-100"
                }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-semibold text-sm truncate ${isDark ? "text-white" : "text-gray-900"}`}>
                  {conv.student_name}
                </span>
                {conv.unread_count > 0 && (
                  <span className="ml-2 shrink-0 text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5">
                    {conv.unread_count}
                  </span>
                )}
              </div>
              <p className={`text-xs truncate ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                {conv.last_message || "No messages yet"}
              </p>
              {conv.last_message_time && (
                <p className={`text-[10px] mt-0.5 ${isDark ? "text-gray-600" : "text-gray-400"}`}>
                  {new Date(conv.last_message_time + "Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Right: chat window */}
      <div className={`flex-1 flex flex-col ${isDark ? "bg-gray-900" : "bg-white"}`}>
        {activeStudentId ? (
          <>
            {/* Chat header */}
            <div className={`p-4 border-b flex items-center justify-between gap-3 ${isDark ? "border-gray-700 bg-gray-800/50" : "border-gray-200 bg-gray-50"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${isDark ? "bg-blue-600/30 text-blue-300" : "bg-blue-100 text-blue-700"
                  }`}>
                  {activeStudentName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className={`font-bold text-sm ${isDark ? "text-white" : "text-gray-900"}`}>{activeStudentName}</h4>
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    {activeStudentType === "irregular" ? "Irregular Student" : "Regular Student"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => deleteConversation(activeStudentId)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/25 transition-all duration-200"
                title="Delete Conversation"
              >
                <Trash2 className="w-4 h-4" />
                Clear Chat
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
              {messages.length === 0 ? (
                <div className={`text-center py-12 text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                  <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  No messages yet. Start the conversation!
                </div>
              ) : messages.map((msg) => {
                const isMe = msg.sender_id === user?.id;
                const isEditing = editingMessageId === msg.id;
                return (
                  <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} group relative items-center gap-2`}>
                    {isMe && !isEditing && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                        <button
                          onClick={() => startEditing(msg)}
                          className={`p-1 rounded transition-colors ${
                            isDark ? "hover:bg-gray-800 text-gray-400 hover:text-white" : "hover:bg-gray-100 text-gray-500 hover:text-gray-900"
                          }`}
                          title="Edit message"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          className="p-1 rounded transition-colors hover:bg-red-500/10 text-red-500"
                          title="Delete message"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className={`max-w-[70%] px-4 py-2.5 rounded-2xl text-sm shadow-sm ${isMe
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : isDark ? "bg-gray-700 text-gray-100 rounded-bl-sm" : "bg-gray-100 text-gray-800 rounded-bl-sm"
                      }`}>
                      {isEditing ? (
                        <div className="flex flex-col gap-2 min-w-[200px]">
                          <textarea
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="p-2 text-sm rounded border outline-none text-slate-800 bg-white dark:bg-slate-800 dark:text-white dark:border-slate-700 resize-none"
                            rows={2}
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={cancelEditing}
                              className="px-2.5 py-1 text-xs bg-gray-500 hover:bg-gray-600 text-white rounded font-medium transition"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => saveEditMessage(msg.id)}
                              className="px-2.5 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded font-medium transition"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="leading-relaxed whitespace-pre-wrap">{msg.message}</p>
                          <p className={`text-[10px] mt-1 ${isMe ? "text-blue-200" : isDark ? "text-gray-500" : "text-gray-400"}`}>
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
            <div className={`p-4 border-t flex gap-3 items-end ${isDark ? "border-gray-700 bg-gray-800/30" : "border-gray-200 bg-gray-50"}`}>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message... (Enter to send)"
                rows={1}
                className={`flex-1 p-3 rounded-xl border resize-none outline-none text-sm transition ${isDark
                  ? "bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-blue-500"
                  : "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500"
                  }`}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !newMessage.trim()}
                className={`p-3 rounded-xl transition flex items-center justify-center ${sending || !newMessage.trim()
                  ? isDark ? "bg-gray-700 text-gray-500" : "bg-gray-200 text-gray-400"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          <div className={`flex-1 flex flex-col items-center justify-center gap-4 ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDark ? "bg-gray-800" : "bg-gray-100"
              }`}>
              <MessageSquare className="w-8 h-8 opacity-40" />
            </div>
            <div className="text-center">
              <p className="font-semibold">Select a conversation</p>
              <p className="text-sm mt-1">Choose a student from the list to start chatting.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgramHeadManual() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [activeSubTab, setActiveSubTab] = useState("generation");

  const topics = [
    { id: "generation", label: "Schedule Generation", icon: Calendar },
    { id: "rooms", label: "Room & Capacity Rules", icon: DoorOpen },
    { id: "proctors", label: "Proctor Management", icon: Users },
    { id: "rescheduling", label: "Rescheduling Requests", icon: ClipboardList },
    { id: "rules", label: "Distribution Rules", icon: Target },
  ];

  return (
    <div className="space-y-6">
      <div className={`p-6 rounded-2xl border ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-100"}`}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-600 text-white shadow-md shadow-blue-500/20"}`}>
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
              Program Head Interactive Guide
            </h2>
            <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Learn how to run the genetic algorithm, configure capacity constraints, set distribution rules, and manage proctoring assignments.
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
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${isSelected
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
        {activeSubTab === "generation" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">1</div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Generating the Exam Schedule</h3>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              The scheduling engine uses a multi-generation Genetic Algorithm (GA) to satisfy hard constraints (no student clashes, no proctor clashes) and optimize soft constraints (high-floor targets, balanced rooms).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Steps to Run Generation
                </h4>
                <ul className={`text-xs space-y-2.5 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">•</span>
                    <span>Navigate to <strong>Generate Schedule</strong>, select the academic <strong>Department</strong> (College/SHS).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">•</span>
                    <span>Set the <strong>Start Date</strong> and <strong>End Date</strong> for the exam cycle.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-500 font-bold">•</span>
                    <span>Click <strong>Generate Schedule</strong> to start the GA optimization. A live progress bar will track each phase.</span>
                  </li>
                </ul>
              </div>

              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span> Excluding Subjects
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Use the search and multi-checkbox interface to exclude specific subjects (like online-only or practical subjects) from the auto-scheduler. Excluded subjects will be skipped.
                </p>
                <div className={`mt-3 p-3 rounded-lg border text-[11px] leading-relaxed flex gap-2 ${isDark ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-amber-50 border-amber-100 text-amber-700"}`}>
                  <span><strong>Important:</strong> Modifying options resets draft schedules. Publishes are immutable and will be visible to students and proctors immediately.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === "rooms" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">2</div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Room Allocation & Capacity Constraints</h3>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Each room in the system has a maximum seating capacity. If a section's enrollment exceeds a room's seat limit, the schedule might fail or violate student distancing rules.
            </p>

            <div className={`p-4 rounded-xl border ${isDark ? "bg-blue-950/20 border-blue-900/40 text-blue-200" : "bg-blue-50 border-blue-100 text-blue-800"} text-xs leading-relaxed flex gap-3`}>
              <div>
                <strong className="block text-sm mb-1 font-bold">How to resolve room capacity limits:</strong>
                Before scheduling, go to the <strong>Generate Schedule</strong> dashboard. Next to each section (e.g. BSIT 3-201), use the <strong>Preferred Room</strong> dropdown to assign a specific room that accommodates the section size (e.g. Computer Lab 1 with capacity 40). The algorithm will attempt to reserve that room for all exam timeslots of that section, ensuring students are not cramped or split.
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-1.5 ${isDark ? "text-slate-200" : "text-slate-800"}`}>Auto-Allocation (Default)</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  If no room is preferred, the scheduler greedy-assigns rooms, preferring higher floor levels first and balancing loads across rooms.
                </p>
              </div>
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-1.5 ${isDark ? "text-slate-200" : "text-slate-800"}`}>Preferred Allocation (Override)</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Specifying a preferred room tells the GA to schedule the section's exams in that room unless there's a scheduling conflict, in which case it dynamically falls back to an available room.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === "proctors" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">3</div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Proctor Management & Uploads</h3>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Proctors oversee examinations. To prevent assigning proctors during their teaching hours, you must upload their schedule from an Excel spreadsheet or define their availability.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>1. Excel Upload</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Go to <strong>Proctor Management</strong>. Use the file selector to upload the official faculty loading sheets. The backend parses classrooms, teacher courses, and schedules.
                </p>
              </div>
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>2. Exclusions</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Toggle the "Exclude from scheduling" switch for specific teachers (e.g. part-time, administrative heads) so they aren't assigned supervising duties.
                </p>
              </div>
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>3. Check-ins</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Monitor proctor attendance in real time on the <strong>Proctor Monitoring</strong> tab. Check-ins are marked by proctors through their respective dashboard.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === "rescheduling" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">4</div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Rescheduling Requests</h3>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Students who experience an exam clash (e.g. irregular schedules where two exams fall in the same timeslot) will submit a Rescheduling Request with supporting files.
            </p>

            <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"} text-xs space-y-3`}>
              <h4 className={`font-bold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}>Workflow:</h4>
              <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between text-slate-500">
                <span className="flex-1 text-center py-2 px-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg font-bold">1. View Pending</span>
                <span className="text-slate-400 text-center sm:block hidden">→</span>
                <span className="flex-1 text-center py-2 px-3 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-lg font-bold">2. Check Proofs</span>
                <span className="text-slate-400 text-center sm:block hidden">→</span>
                <span className="flex-1 text-center py-2 px-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-lg font-bold">3. Approve / Deny</span>
              </div>
              <p className={`pt-2 leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                Each request lists the student's name, email, details of conflict, and uploaded proof. You can add feedback notes before hitting **Approve** or **Reject**. Approved students will automatically be assigned their requested rescheduled timeslot.
              </p>
            </div>
          </div>
        )}

        {activeSubTab === "rules" && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">5</div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Distribution Rules</h3>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Distribute exams logically to balance student workload. For example, ensure SHS Grade 11 exams only occur in the morning session, or major subjects are distributed over specific weekdays.
            </p>

            <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
              <h4 className={`font-bold text-sm mb-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>How to Configure Rules</h4>
              <ul className={`text-xs space-y-2 ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                <li>• Go to the <strong>Distribution Rules</strong> tab in the sidebar.</li>
                <li>• Add a new rule by specifying the Subject Category (major / general / shs-core etc.).</li>
                <li>• Select the allowable days (e.g. Mon, Wed, Fri only).</li>
                <li>• Select the permissible session (e.g. morning, afternoon, or any session).</li>
                <li>• The genetic algorithm constraints evaluator will read these rules and penalize/exclude placements violating these criteria.</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ProgramHeadDashboard() {
  const [activeTab, setActiveTab] = useState("generate");
  const [generationState, setGenerationState] = useState(INITIAL_GENERATION_STATE);
  const { theme } = useTheme();
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const isDark = theme === "dark";
  const { showWarning } = useToast();

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter(n => !n.is_read).length;
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
        <div className="fixed inset-0 z-40" onClick={() => setShowNotifications(false)}></div>
      )}

      {/* Sidebar */}
      <aside className={`w-72 flex flex-col border-r transition-all duration-300 z-30 ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white border-slate-200"}`}>
        <div className="p-6 flex flex-col items-center gap-4 border-b border-transparent">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105 duration-300 ${isDark ? "bg-gradient-to-br from-blue-600 to-indigo-700" : "bg-gradient-to-br from-blue-500 to-blue-700"}`}>
            <User className="w-8 h-8 text-white" />
          </div>
          <div className="text-center">
            <h2 className={`text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>{user?.name || "Admin"}</h2>
            <p className={`text-xs font-medium tracking-wide uppercase mt-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>Exam Management</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
          {[
            { id: "generate", icon: Calendar, label: "Generate Schedule" },
            { id: "schedules", icon: CalendarDays, label: "Generated Schedules" },
            { id: "proctors", icon: Users, label: "Proctor Management" },
            { id: "rooms", icon: DoorOpen, label: "Room Management" },
            { id: "rescheduling", icon: ClipboardList, label: "Rescheduling Requests" },
            { id: "chat", icon: MessageSquare, label: "Chat" },
            { id: "monitoring", icon: ShieldCheck, label: "Proctor Monitoring" },
            { id: "rules", icon: Target, label: "Distribution Rules" },
            { id: "manual", icon: BookOpen, label: "User Manual" },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-300 group ${isActive
                  ? isDark
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50"
                    : "bg-blue-600 text-white shadow-lg shadow-blue-500/30"
                  : isDark
                    ? "text-slate-300 hover:bg-slate-800/60 hover:text-white"
                    : "text-slate-600 hover:bg-blue-50 hover:text-blue-700"
                  }`}
              >
                <div className="flex items-center gap-3.5">
                  <Icon className={`w-5 h-5 transition-transform duration-300 ${isActive ? "scale-110" : "group-hover:scale-110"}`} />
                  <span className="text-sm font-semibold">{item.label}</span>
                </div>
                {item.id === "chat" && unreadChatCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                    {unreadChatCount}
                  </span>
                )}
                {item.id === "rescheduling" && pendingRescheduleCount > 0 && (
                  <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                    {pendingRescheduleCount}
                  </span>
                )}
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
                        activeTab === "rooms" ? "Room Management" :
                          activeTab === "monitoring" ? "Proctor Attendance Monitoring" :
                            activeTab === "rescheduling" ? "Rescheduling Requests" :
                              activeTab === "chat" ? "Chat" :
                                activeTab === "rules" ? "Distribution Rules" :
                                  activeTab === "manual" ? "User Manual" : "Program Head Dashboard"}
                </h1>
              </div>
              <div className="flex items-center gap-4">
                <div className={`hidden md:flex px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all shadow-sm ${isDark ? "bg-blue-500/20 text-blue-400 border border-blue-500/30" : "bg-blue-50 text-blue-700 border border-blue-100"}`}>
                  Administrator
                </div>
                <div className="relative">
                  <button onClick={() => setShowNotifications(!showNotifications)} className={`relative p-2.5 rounded-xl transition-all duration-300 ${isDark ? "text-slate-300 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}>
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900 animate-pulse"></span>}
                  </button>
                  {showNotifications && (
                    <div className={`absolute right-0 mt-3 w-80 max-h-96 flex flex-col rounded-2xl shadow-2xl border z-50 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
                      <div className={`px-5 py-4 border-b flex justify-between items-center ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                        <h3 className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>Notifications</h3>
                        {unreadCount > 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">{unreadCount} New</span>}
                      </div>
                      <div className="overflow-y-auto p-2 custom-scrollbar flex-1">
                        {notifications.length === 0 ? (
                          <div className={`p-6 text-center text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}><Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />You're all caught up!</div>
                        ) : notifications.map((notif) => (
                          <div key={notif.id} onClick={() => { if (!notif.is_read) markRead(notif.id); }} className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 mb-1 ${notif.is_read ? (isDark ? "hover:bg-slate-700/50 opacity-60" : "hover:bg-slate-50 opacity-60") : (isDark ? "bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/30" : "bg-blue-50 hover:bg-blue-100 border border-blue-100")}`}>
                            <div className="flex gap-3">
                              <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${notif.is_read ? "bg-slate-400" : "bg-blue-500"}`}></div>
                              <div>
                                <p className={`text-sm leading-snug ${isDark ? "text-slate-200" : "text-slate-800"}`}>{notif.message}</p>
                                <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>{notif.created_at ? new Date(notif.created_at).toLocaleString() : "Just now"}</p>
                              </div>
                            </div>
                          </div>
                        ))}
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
            {activeTab !== "generate" && isGenerationRunning && (
              <div className={`rounded-2xl border overflow-hidden transition-colors duration-300 ${isDark ? "bg-blue-950/40 border-blue-900/60" : "bg-blue-50 border-blue-100"}`}>
                <div className="p-4 md:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`mt-0.5 w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-white text-blue-600 shadow-sm"}`}>
                        <Loader2 className="w-5 h-5 animate-spin" />
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
              <div className="p-6 md:p-8">
                <div className={activeTab === "generate" ? "block" : "hidden"}>
                  <ExamScheduler
                    onBeforeGenerate={checkMissingSchedulesBeforeGenerate}
                    onGenerationStateChange={handleGenerationStateChange}
                  />
                </div>
                {activeTab === "schedules" ? <GeneratedExamSchedules isGenerating={isGenerationRunning} /> :
                  activeTab === "proctors" ? <AddProctor isGenerating={isGenerationRunning} /> :
                    activeTab === "rooms" ? <RoomManagement isGenerating={isGenerationRunning} /> :
                      activeTab === "rules" ? <DistributionRulesManager isGenerating={isGenerationRunning} /> :
                        activeTab === "monitoring" ? <ProctorMonitoring /> :
                          activeTab === "rescheduling" ? <ReschedulingRequests isGenerating={isGenerationRunning} onRequestsChange={handlePendingRescheduleCountChange} /> :
                            activeTab === "chat" ? <ChatSupportPanel /> :
                              activeTab === "manual" ? <ProgramHeadManual /> :
                                null}
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
