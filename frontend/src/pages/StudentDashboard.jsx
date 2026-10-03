import React, { useEffect, useState, useRef } from "react";
import {
  MagnifyingGlassIcon,
  ArrowLeftStartOnRectangleIcon,
  CalendarIcon,
  ClockIcon,
  MapPinIcon,
  BookOpenIcon,
  ChevronRightIcon,
  BellIcon,
  CheckBadgeIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  PaperAirplaneIcon,
  Cog6ToothIcon,
  ChatBubbleLeftRightIcon,
  PlusIcon,
  ArrowPathIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import ThemeToggle from "../components/ThemeToggle";
import { useUser } from "../context/userStore";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { useToast } from "../context/ToastContext";
import SettingsDropdown from "../components/SettingsDropdown";
import ConfirmationModal from "../components/ConfirmationModal";
import FirstTimePasswordChange from "../components/FirstTimePasswordChange";

function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split(", ");
  const date = new Date(`${parts[1]}, ${parts[2]}`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function buildConflictExamMap(conflicts, scheduledExams) {
  const examsById = new Map(scheduledExams.map((exam) => [exam.id, exam]));
  const conflictMap = new Map();

  conflicts.forEach(({ exam1, exam2 }) => {
    const firstExam = examsById.get(exam1.id);
    const secondExam = examsById.get(exam2.id);
    if (!firstExam || !secondExam) return;

    conflictMap.set(firstExam.id, [...(conflictMap.get(firstExam.id) || []), secondExam]);
    conflictMap.set(secondExam.id, [...(conflictMap.get(secondExam.id) || []), firstExam]);
  });

  return conflictMap;
}

function StudentManual() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [activeSubTab, setActiveSubTab] = useState("schedule");

  const topics = [
    { id: "schedule", label: "My Schedule Guide", icon: CalendarIcon },
    { id: "rescheduling", label: "Reschedule Requests", icon: PencilIcon },
  ];

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className={`p-6 rounded-2xl border ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border-blue-100"}`}>
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-blue-500/20 text-blue-300" : "bg-blue-600 text-white shadow-md shadow-blue-500/20"}`}>
            <BookOpenIcon className="w-6 h-6" />
          </div>
          <div>
            <h2 className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
              Student Interactive Guide
            </h2>
            <p className={`text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Learn how to customize your exam calendar, view schedules/rooms/proctors, and request exam reschedules for conflicts.
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
        {activeSubTab === "schedule" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">1</div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Reading your Exam Schedule</h3>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              The exam grid lists all the details you need for your exams. Here's a guide to each item on your list:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-1.5 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <ClockIcon className="w-4 h-4 text-blue-500" /> Exam Date & Time
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Note if the exam is in the Morning or Afternoon. Make sure to arrive early.
                </p>
              </div>
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-1.5 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <MapPinIcon className="w-4 h-4 text-indigo-500" /> Exam Room
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  The room code and building floor where your exam is scheduled.
                </p>
              </div>
              <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800" : "bg-slate-50 border-slate-100"}`}>
                <h4 className={`font-bold text-sm mb-1.5 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <CheckBadgeIcon className="w-4 h-4 text-emerald-500" /> Proctor Name
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  The faculty member supervising your exam session.
                </p>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === "rescheduling" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">2</div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Requesting a Reschedule</h3>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              If you have two exams scheduled in the same timeslot (a conflict/clash), a red "Conflict Detected" warning will show. You can click <strong>Request Reschedule</strong> to apply for an alternative date.
            </p>

            <div className={`p-4 rounded-xl border ${isDark ? "bg-blue-950/20 border-blue-900/40 text-blue-200" : "bg-blue-50 border-blue-100 text-blue-800"} text-xs leading-relaxed`}>
              <strong className="block text-sm mb-1 font-bold">Important Notes:</strong>
              • Rescheduling is only allowed for valid scheduling conflicts, medical issues, or extreme emergencies.<br />
              • Fill out the form completely, including your preferred new date and timeslot.<br />
              • Check back under the "My Rescheduling Requests" section to track approvals.
            </div>
          </div>
        )}

        {activeSubTab === "irregular" && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-sm">3</div>
              <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Customized Schedule Guide</h3>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              If you are taking subjects from different sections or year levels (e.g., due to late enrollment or a customized curriculum), choosing the **Customized Schedule** option gives you access to the Custom Schedule builder.
            </p>

            <div className={`p-4 rounded-xl border ${isDark ? "bg-slate-900/40 border-slate-800 text-slate-300" : "bg-slate-50 border-slate-100"} text-xs space-y-2`}>
              <p>• <strong>Step 1:</strong> Select your current degree program.</p>
              <p>• <strong>Step 2:</strong> Use the subject builder to search for the subjects you are enrolled in.</p>
              <p>• <strong>Step 3:</strong> Select the correct section for each subject (e.g., BSIT 3-201 or BSIT 2-202).</p>
              <p>• <strong>Step 4:</strong> Click <strong>Save My Selections</strong>. The system will compile your personalized exam schedule.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StudentChatPanel() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user } = useUser();
  const { showSuccess, showError } = useToast();

  const [conversations, setConversations] = useState([]);
  const [activeContactId, setActiveContactId] = useState(null);
  const [activeContactName, setActiveContactName] = useState("");
  const [activeContactRole, setActiveContactRole] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatSending, setChatSending] = useState(false);
  const [loadingConv, setLoadingConv] = useState(true);

  // New chat directory states
  const [isNewChatModalOpen, setIsNewChatModalOpen] = useState(false);
  const [adminsList, setAdminsList] = useState([]);
  const [proctorsList, setProctorsList] = useState([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactTab, setContactTab] = useState("admins"); // 'admins' or 'proctors'

  // Edit / Delete states
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");
  const [isDeleteMsgModalOpen, setIsDeleteMsgModalOpen] = useState(false);
  const [msgToDeleteId, setMsgToDeleteId] = useState(null);
  const [isClearConvModalOpen, setIsClearConvModalOpen] = useState(false);
  const [convToClearId, setConvToClearId] = useState(null);

  const [showMobileSidebar, setShowMobileSidebar] = useState(true);
  const chatEndRef = useRef(null);

  // Fetch active conversations
  const fetchConversations = async (selectFirst = false) => {
    try {
      const res = await api.get("/chat/conversations");
      setConversations(res.data);
      if (selectFirst && res.data.length > 0 && !activeContactId) {
        const first = res.data[0];
        setActiveContactId(first.student_id);
        setActiveContactName(first.student_name);
        setActiveContactRole(first.role);
        setShowMobileSidebar(false);
      }
    } catch (err) {
      console.error("Error fetching conversations:", err);
    } finally {
      setLoadingConv(false);
    }
  };

  // Fetch directory list for new chat
  const fetchContacts = async () => {
    try {
      const [adminsRes, proctorsRes] = await Promise.all([
        api.get("/chat/admins"),
        api.get("/chat/proctors")
      ]);
      setAdminsList(adminsRes.data);
      setProctorsList(proctorsRes.data);
    } catch (err) {
      console.error("Error fetching contacts:", err);
    }
  };

  // Poll conversations
  useEffect(() => {
    fetchConversations(true);
    const interval = setInterval(() => fetchConversations(false), 8000);
    return () => clearInterval(interval);
  }, []);

  // Poll messages for active contact
  useEffect(() => {
    if (!activeContactId) return;
    const fetchMsgs = async () => {
      try {
        const res = await api.get(`/chat/messages/${activeContactId}`);
        setChatMessages(res.data);
        api.put(`/chat/read/${activeContactId}`).catch(() => {});
      } catch (err) {
        console.error("Error fetching messages:", err);
      }
    };
    fetchMsgs();
    const interval = setInterval(fetchMsgs, 4000);
    return () => clearInterval(interval);
  }, [activeContactId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const handleSend = async () => {
    if (!chatInput.trim() || !activeContactId || chatSending) return;
    setChatSending(true);
    try {
      await api.post("/chat/send", { recipient_id: activeContactId, message: chatInput.trim() });
      setChatInput("");
      const res = await api.get(`/chat/messages/${activeContactId}`);
      setChatMessages(res.data);
      fetchConversations(false);
    } catch (err) {
      showError("Failed to send message");
    } finally {
      setChatSending(false);
    }
  };

  const startNewChat = (contact, role) => {
    setActiveContactId(contact.id);
    setActiveContactName(contact.name);
    setActiveContactRole(role);
    setChatMessages([]);
    setIsNewChatModalOpen(false);
    setShowMobileSidebar(false);
    
    if (!conversations.some(c => c.student_id === contact.id)) {
      setConversations(prev => [
        {
          student_id: contact.id,
          student_name: contact.name,
          student_email: contact.email,
          role: role,
          last_message: null,
          last_message_time: null,
          unread_count: 0
        },
        ...prev
      ]);
    }
  };

  const executeClearConversation = async () => {
    if (!convToClearId) return;
    try {
      await api.delete(`/chat/conversations/${convToClearId}`);
      setChatMessages([]);
      setConversations(prev => prev.filter(c => c.student_id !== convToClearId));
      if (activeContactId === convToClearId) {
        setActiveContactId(null);
        setActiveContactName("");
        setActiveContactRole("");
      }
      showSuccess("Conversation cleared");
    } catch (err) {
      showError("Failed to clear conversation");
    } finally {
      setIsClearConvModalOpen(false);
      setConvToClearId(null);
    }
  };

  const executeDeleteChatMessage = async () => {
    if (!msgToDeleteId) return;
    try {
      await api.delete(`/chat/messages/${msgToDeleteId}`);
      setChatMessages(prev => prev.filter(m => m.id !== msgToDeleteId));
    } catch (err) {
      showError("Failed to delete message");
    } finally {
      setIsDeleteMsgModalOpen(false);
      setMsgToDeleteId(null);
    }
  };

  const saveEditChatMessage = async (msgId, newText) => {
    if (!newText.trim()) return;
    try {
      await api.put(`/chat/messages/${msgId}`, { message: newText.trim() });
      setChatMessages(prev => prev.map(m => m.id === msgId ? { ...m, message: newText.trim() } : m));
      setEditingMessageId(null);
      setEditingText("");
    } catch (err) {
      showError("Failed to edit message");
    }
  };

  const selectContact = (conv) => {
    setActiveContactId(conv.student_id);
    setActiveContactName(conv.student_name);
    setActiveContactRole(conv.role);
    setShowMobileSidebar(false);
  };

  const filteredConversations = conversations.filter(c => 
    c.student_name.toLowerCase().includes(contactSearch.toLowerCase())
  );

  return (
    <div className="w-full max-w-6xl min-w-0 mx-auto px-2 sm:px-6 lg:px-8 py-4 sm:py-6 h-[min(70dvh,600px)] min-h-[360px] sm:h-[600px] flex gap-2 sm:gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Sidebar container */}
      <div className={`w-full min-w-0 md:w-80 flex-shrink-0 flex flex-col rounded-2xl border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"} ${!showMobileSidebar && "hidden md:flex"}`}>
        {/* Sidebar Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className={`font-bold text-base ${isDark ? "text-white" : "text-slate-900"}`}>Chats</h3>
            <button
              onClick={() => {
                fetchContacts();
                setIsNewChatModalOpen(true);
              }}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition flex items-center justify-center gap-1.5 text-xs font-semibold"
            >
              <PlusIcon className="w-3.5 h-3.5" />
              New Chat
            </button>
          </div>
          {/* Active Chats Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={contactSearch}
              onChange={(e) => setContactSearch(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs outline-none border transition ${
                isDark 
                  ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500" 
                  : "bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500"
              }`}
            />
          </div>
        </div>

        {/* Conversations List */}
        <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
          {loadingConv ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2">
              <ArrowPathIcon className="w-6 h-6 animate-spin text-blue-500" />
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Loading conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="text-center py-12 text-slate-400 dark:text-slate-500">
              <ChatBubbleLeftRightIcon className="w-8 h-8 mx-auto mb-2 opacity-35" />
              <p className="text-xs">No active chats</p>
              <p className="text-[10px] mt-1">Click "New Chat" to start a discussion</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isActive = activeContactId === conv.student_id;
              return (
                <button
                  key={conv.student_id}
                  onClick={() => selectContact(conv)}
                  className={`w-full text-left p-3 rounded-xl transition duration-155 flex items-center gap-3 relative ${
                    isActive
                      ? "bg-blue-600 text-white"
                      : isDark
                        ? "hover:bg-slate-700/50 text-slate-200"
                        : "hover:bg-slate-50 text-slate-800"
                  }`}
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold shadow-inner ${
                    isActive 
                      ? "bg-white/20 text-white" 
                      : isDark 
                        ? "bg-slate-700 text-blue-300" 
                        : "bg-blue-50 text-blue-700 border border-blue-100"
                  }`}>
                    {(conv.student_name || "").split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`font-semibold text-xs truncate ${isActive ? "text-white" : isDark ? "text-slate-100" : "text-slate-900"}`}>
                        {conv.student_name}
                      </p>
                      {conv.last_message_time && (
                        <span className={`text-[9px] ${isActive ? "text-blue-200" : "text-slate-400"}`}>
                          {new Date(conv.last_message_time + "Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                    </div>
                    <p className={`text-[10px] mt-0.5 truncate capitalize ${isActive ? "text-blue-100" : "text-slate-400"}`}>
                      {conv.role === "admin" || conv.role === "program_head" ? "Admin" : "Proctor"}
                    </p>
                    {conv.last_message && (
                      <p className={`text-[10px] mt-1 truncate ${isActive ? "text-blue-200" : isDark ? "text-slate-400" : "text-slate-500"}`}>
                        {conv.last_message}
                      </p>
                    )}
                  </div>
                  {conv.unread_count > 0 && (
                    <span className="absolute top-3 right-3 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white shadow">
                      {conv.unread_count}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Chat Window Area */}
      <div className={`min-w-0 flex-1 flex flex-col rounded-2xl border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"} ${showMobileSidebar && "hidden md:flex"}`}>
        {activeContactId ? (
          <>
            {/* Chat Window Header */}
            <div className={`p-3 sm:p-4 border-b flex items-center justify-between gap-2 sm:gap-3 ${isDark ? "bg-slate-800/80 border-slate-700" : "bg-slate-50/80 border-slate-200"}`}>
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                {/* Mobile Back Button */}
                <button
                  onClick={() => setShowMobileSidebar(true)}
                  className="p-1.5 rounded-lg md:hidden hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                >
                  <ChevronRightIcon className="w-5 h-5 rotate-180 text-slate-500 dark:text-slate-400" />
                </button>
                <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold ${isDark ? "bg-blue-600/30 text-blue-300" : "bg-blue-100 text-blue-700"}`}>
                  {(activeContactName || "").split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className={`font-bold text-sm truncate ${isDark ? "text-white" : "text-slate-900"}`}>{activeContactName}</h3>
                  <p className={`text-[10px] uppercase font-bold tracking-wider truncate ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                    {activeContactRole === "admin" || activeContactRole === "program_head" ? "Admin / Program Head" : "Proctor / Invigilator"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setConvToClearId(activeContactId);
                  setIsClearConvModalOpen(true);
                }}
                className="shrink-0 flex items-center gap-1.5 px-2 sm:px-3 py-2 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/25 transition"
                title="Clear conversation history"
              >
                <TrashIcon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Clear Chat</span>
              </button>
            </div>

            {/* Chat Messages Body */}
            <div className={`min-h-0 flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 custom-scrollbar ${isDark ? "bg-slate-900/40" : "bg-slate-50/40"}`}>
              {chatMessages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400 dark:text-slate-500">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
                    <ChatBubbleLeftRightIcon className="w-8 h-8 opacity-30" />
                  </div>
                  <div className="text-center max-w-xs">
                    <p className="font-semibold text-sm">Start a conversation</p>
                    <p className="text-xs mt-1">Send a message to clarify any schedule details, room locations, or rescheduling requirements.</p>
                  </div>
                </div>
              ) : (
                chatMessages.map((msg, idx) => {
                  const isMe = msg.sender_id === user?.id;
                  const isEditing = editingMessageId === msg.id;
                  const prevMsg = idx > 0 ? chatMessages[idx - 1] : null;
                  const showSenderName = !isMe && (!prevMsg || prevMsg.sender_id !== msg.sender_id);
                  return (
                    <div key={msg.id} className={`min-w-0 flex ${isMe ? "justify-end" : "justify-start"} group relative items-start gap-2`}>
                      {isMe && !isEditing && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition duration-150">
                          <button
                            onClick={() => {
                              setEditingMessageId(msg.id);
                              setEditingText(msg.message);
                            }}
                            className={`p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition`}
                            title="Edit message"
                          >
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setMsgToDeleteId(msg.id);
                              setIsDeleteMsgModalOpen(true);
                            }}
                            className="p-1 rounded hover:bg-red-500/10 text-red-500 transition"
                            title="Delete message"
                          >
                            <TrashIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}

                      <div className={`min-w-0 max-w-[90%] sm:max-w-[75%] px-3 sm:px-4 py-2.5 rounded-2xl text-sm relative ${
                        isMe
                          ? "bg-blue-600 text-white rounded-br-sm shadow-md shadow-blue-500/10"
                          : isDark ? "bg-slate-700 text-slate-100 rounded-bl-sm" : "bg-white text-slate-800 rounded-bl-sm border border-slate-200 shadow-sm"
                      }`}>
                        {showSenderName && (
                          <p className={`text-[9px] font-bold mb-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                            {msg.sender_name}
                          </p>
                        )}
                        {isEditing ? (
                          <div className="flex flex-col gap-2 min-w-[200px] py-1">
                            <textarea
                              value={editingText}
                              onChange={(e) => setEditingText(e.target.value)}
                              className="w-full p-2 text-xs rounded-xl border outline-none text-slate-800 bg-white dark:bg-slate-800 dark:text-white dark:border-slate-700 resize-none focus:border-blue-500"
                              rows={2}
                            />
                            <div className="flex gap-2 justify-end">
                              <button
                                onClick={() => {
                                  setEditingMessageId(null);
                                  setEditingText("");
                                }}
                                className="px-2.5 py-1 text-[10px] bg-slate-500 hover:bg-slate-600 text-white rounded-lg font-medium transition"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => saveEditChatMessage(msg.id, editingText)}
                                className="px-2.5 py-1 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <p className="leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.message}</p>
                            <p className={`text-[9px] mt-1 text-right ${isMe ? "text-blue-200" : "text-slate-400 dark:text-slate-500"}`}>
                              {new Date(msg.created_at + "Z").toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Message Input Footer */}
            <div className={`p-2 sm:p-4 border-t flex gap-2 sm:gap-3 items-end ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`}>
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message..."
                rows={1}
                aria-label="Type your message"
                className={`min-w-0 min-h-11 flex-1 p-3 rounded-xl border resize-none outline-none text-base sm:text-sm transition ${
                  isDark
                    ? "bg-slate-900 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500"
                    : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500"
                }`}
              />
              <button
                onClick={handleSend}
                disabled={chatSending || !chatInput.trim()}
                aria-label="Send message"
                className={`w-11 h-11 shrink-0 rounded-xl transition flex items-center justify-center ${
                  chatSending || !chatInput.trim()
                    ? isDark ? "bg-slate-700 text-slate-500" : "bg-slate-200 text-slate-400"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/25"
                }`}
              >
                <PaperAirplaneIcon className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400 dark:text-slate-500">
            <ChatBubbleLeftRightIcon className="w-12 h-12 mb-3 opacity-30 text-blue-500" />
            <h3 className="font-bold text-sm mb-1 text-slate-700 dark:text-slate-300">No Chat Selected</h3>
            <p className="text-xs text-center max-w-xs leading-relaxed">
              Select an active conversation from the list or click the "New Chat" button to contact an administrator or proctor.
            </p>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      {isNewChatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className={`w-full max-w-md rounded-2xl border shadow-xl flex flex-col overflow-hidden ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`} style={{ maxHeight: "80vh" }}>
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-900"}`}>Start New Chat</h3>
              <button
                onClick={() => setIsNewChatModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <XMarkIcon className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Tabs for Admins/Proctors */}
            <div className="flex border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20 p-2 gap-1">
              <button
                onClick={() => setContactTab("admins")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  contactTab === "admins"
                    ? "bg-blue-600 text-white shadow-sm"
                    : isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-800"
                }`}
              >
                Admins
              </button>
              <button
                onClick={() => setContactTab("proctors")}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  contactTab === "proctors"
                    ? "bg-blue-600 text-white shadow-sm"
                    : isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-600 hover:text-slate-800"
                }`}
              >
                Proctors (Teachers)
              </button>
            </div>

            {/* Contact Directory Search */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-700">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={`Search ${contactTab === "admins" ? "admins" : "proctors"}...`}
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs outline-none border transition ${
                    isDark 
                      ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500" 
                      : "bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500"
                  }`}
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {(contactTab === "admins" ? adminsList : proctorsList)
                .filter(u => u.name.toLowerCase().includes(contactSearch.toLowerCase()) || u.email.toLowerCase().includes(contactSearch.toLowerCase()))
                .map((u) => (
                  <button
                    key={u.id}
                    onClick={() => startNewChat(u, contactTab === "admins" ? "admin" : "proctor")}
                    className={`w-full text-left p-3 rounded-xl transition duration-150 flex items-center gap-3 ${
                      isDark ? "hover:bg-slate-700/60 text-slate-200" : "hover:bg-slate-50 text-slate-800"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
                      isDark ? "bg-slate-700 text-blue-300" : "bg-blue-50 text-blue-600 border border-blue-100"
                    }`}>
                      {(u.name || "").split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className={`font-semibold text-xs ${isDark ? "text-slate-100" : "text-slate-900"}`}>{u.name}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5">{u.email}</p>
                    </div>
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modals */}
      {isClearConvModalOpen && (
        <ConfirmationModal
          isOpen={isClearConvModalOpen}
          onClose={() => setIsClearConvModalOpen(false)}
          onConfirm={executeClearConversation}
          title="Clear Conversation"
          message="Are you sure you want to clear your conversation history with this contact? This action will permanently remove all messages for you."
          confirmText="Yes, Clear"
          cancelText="Cancel"
          type="danger"
        />
      )}

      {isDeleteMsgModalOpen && (
        <ConfirmationModal
          isOpen={isDeleteMsgModalOpen}
          onClose={() => setIsDeleteMsgModalOpen(false)}
          onConfirm={executeDeleteChatMessage}
          title="Delete Message"
          message="Are you sure you want to delete this message? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
        />
      )}
    </div>
  );
}

export default function StudentDashboard() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user, login, logout } = useUser();
  const navigate = useNavigate();
  const { showSuccess, showError, showWarning } = useToast();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [scheduleViewMode, setScheduleViewMode] = useState("bySection");
  const [myRequests, setMyRequests] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [conflictingExamsById, setConflictingExamsById] = useState(new Map());
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isClearNotifModalOpen, setIsClearNotifModalOpen] = useState(false);
  const [filterDay, setFilterDay] = useState("all");
  const [filterSession, setFilterSession] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  // Irregular student state
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [activeTab, setActiveTab] = useState("schedule");
  const [coursesList, setCoursesList] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");

  const toggleSection = (sectionName) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionName)) {
        next.delete(sectionName);
      } else {
        next.add(sectionName);
      }
      return next;
    });
  };

  // Reschedule form states — pre-filled from logged-in user, read-only
  const [studentName, setStudentName] = useState(user?.name || "");
  const [studentId, setStudentId] = useState(user?.student_id || "");
  const [program, setProgram] = useState("");
  const [section, setSection] = useState(user?.section_name || "");
  const [schoolEmail, setSchoolEmail] = useState(user?.email || "");
  const [courseCode, setCourseCode] = useState("");
  const [courseName, setCourseName] = useState("");
  const [originalExamDate, setOriginalExamDate] = useState("");
  const [originalStartTime, setOriginalStartTime] = useState("");
  const [originalEndTime, setOriginalEndTime] = useState("");
  const [examType, setExamType] = useState("");
  const [reasonType, setReasonType] = useState("");
  const [detailedExplanation, setDetailedExplanation] = useState("");
  const [supportingFile, setSupportingFile] = useState(null);
  const [requestedMode, setRequestedMode] = useState("online");
  const [preferredStartTime, setPreferredStartTime] = useState("");
  const [preferredEndTime, setPreferredEndTime] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [loadingRequest, setLoadingRequest] = useState(false);

  // Chat states
  const [unreadChatCount, setUnreadChatCount] = useState(0);

  // Fetch courses list
  const fetchCourses = async () => {
    try {
      const res = await api.get("/catalog/courses");
      setCoursesList(res.data);
    } catch (err) {
      console.error("Error fetching courses:", err);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  // Resolve program name once coursesList is loaded
  useEffect(() => {
    if (user?.course_id && coursesList.length > 0) {
      const found = coursesList.find(c => c.id === user.course_id);
      if (found) setProgram(found.name);
    } else if (user?.section_name) {
      // Fallback: derive rough program from section name
      setProgram(user.section_name);
    }
  }, [coursesList, user]);

  useEffect(() => {
    if (user && user.role === "student") {
      if (user.student_type === "irregular") {
        fetchCustomExams();
      } else {
        fetchData();
      }
    }
  }, [user]);

  // Regular data fetch
  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const examsRes = await api.get("/student/exams");
      setExams(examsRes.data);
      try {
        const conflictsRes = await api.get("/student/conflicts");
        setConflictingExamsById(buildConflictExamMap(conflictsRes.data, examsRes.data));
      } catch (e) { }
      try {
        const requestsRes = await api.get("/student/requests");
        setMyRequests(requestsRes.data);
      } catch (e) { }
    } catch (err) {
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Irregular: fetch all available subjects with sections.
  // Pass courseId=0 to get all programs, or a positive id to filter by one program.
  const fetchAvailableSubjects = async (courseIdOverride) => {
    try {
      const targetCourse = courseIdOverride !== undefined ? courseIdOverride : 0;
      // course_id=0 → backend returns all programs (no filter)
      const params = targetCourse > 0 ? { course_id: targetCourse } : {};
      const res = await api.get("/student/available-subjects", { params });
      setAvailableSubjects(res.data);
      // Accumulate into subjectCache so the Selected list always shows names
      setSubjectCache(prev => {
        const updated = { ...prev };
        res.data.forEach(sub => { updated[sub.id] = sub; });
        return updated;
      });
      try {
        const savedRes = await api.get("/student/selected-subjects");
        setSelectedSubjects(savedRes.data);
      } catch (e) {
        console.error("Error fetching saved selections:", e);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Irregular: fetch custom exams based on saved selections
  const fetchCustomExams = async () => {
    console.log("Fetch custom exams called");
    setLoading(true);
    try {
      const res = await api.get("/student/custom-exams");
      console.log("Custom exams loaded:", res.data.length, res.data);
      setExams(res.data);
      if (res.data.length === 0) {
        console.warn("No exams found for your selections. Make sure exams are posted for those subjects/sections.");
      }
      try {
        const conflictsRes = await api.get("/student/conflicts");
        setConflictingExamsById(buildConflictExamMap(conflictsRes.data, res.data));
      } catch (e) { }
      try {
        const requestsRes = await api.get("/student/requests");
        setMyRequests(requestsRes.data);
      } catch (e) { }
    } catch (err) {
      console.error("Error fetching custom exams:", err);
    } finally {
      setLoading(false);
    }
  };

  // Save irregular selections
  const saveIrregularSelections = async () => {
    if (selectedSubjects.length === 0) {
      showWarning("Please select at least one subject and section.");
      return;
    }
    try {
      await api.post("/student/save-selected", selectedSubjects);
      showSuccess("Custom exam schedule saved!");
      await fetchCustomExams();
    } catch (err) {
      console.error(err);
      showError("Failed to save selections");
    }
  };

  const toggleSubjectSelection = (subjectId, sectionId) => {
    const existingIndex = selectedSubjects.findIndex(sel => sel.subject_id === subjectId);
    if (existingIndex >= 0) {
      if (selectedSubjects[existingIndex].section_id === sectionId) {
        // Deselect if clicking the same section
        const newList = [...selectedSubjects];
        newList.splice(existingIndex, 1);
        setSelectedSubjects(newList);
        return;
      } else {
        // Switch to the new section directly
        const newList = [...selectedSubjects];
        newList[existingIndex] = { subject_id: subjectId, section_id: sectionId };
        setSelectedSubjects(newList);
        return;
      }
    }
    // Add new selection
    setSelectedSubjects([...selectedSubjects, { subject_id: subjectId, section_id: sectionId }]);
  };

  const addSubjectSelection = (subjectId, sectionId) => {
    toggleSubjectSelection(subjectId, sectionId);
  };

  const removeSubjectSelection = (index) => {
    const newList = [...selectedSubjects];
    newList.splice(index, 1);
    setSelectedSubjects(newList);
  };

  // Set student type (regular/irregular)
  const saveStudentType = async () => {
    if (!selectedType) return;
    if (selectedType === "irregular" && !selectedCourseId) {
      showWarning("Please select your course.");
      return;
    }
    try {
      const payload = {
        student_type: selectedType,
        course_id: selectedType === "irregular" ? parseInt(selectedCourseId) : null
      };
      const res = await api.post("/student/set-student-type", payload);

      const updatedUser = {
        ...user,
        student_type: selectedType,
        course_id: res.data.course_id
      };
      login(updatedUser);
      setShowTypeModal(false);

      if (selectedType === "irregular") {
        fetchAvailableSubjects(0);
        fetchCustomExams();
      } else {
        fetchData();
      }
    } catch (err) {
      showError("Failed to set student type");
    }
  };

  // Notifications
  useEffect(() => {
    const fetchNotifications = async () => {
      if (!user?.id) return;
      try {
        const res = await api.get(`/notifications/student/${user.id}`);
        if (res.data) setNotifications(res.data);
      } catch (err) { }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [user]);



  // Smart suggestion: find the last exam on the same day as a conflicting exam
  // Format minutes from midnight to 12-hour format string (e.g., 420 -> "07:00 AM")
  const formatMinsTo12 = (mins) => {
    let h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    const meridiem = h >= 12 ? "PM" : "AM";
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${meridiem}`;
  };

  // Parse 12-hour format string to minutes from midnight
  const parseTime12 = (t) => {
    if (!t || t === "-") return 0;
    const [timePart, meridiem] = t.trim().split(" ");
    let [h, m] = timePart.split(":").map(Number);
    if (meridiem === "PM" && h !== 12) h += 12;
    if (meridiem === "AM" && h === 12) h = 0;
    return h * 60 + m;
  };

  // Find all vacant blocks of at least the required exam duration on the same day as the conflicting exam,
  // but ONLY after the conflicting exam ends (can't reschedule before your own exam finishes)
  const getExamDurationMins = (exam) => {
    if (!exam) return 75;
    if (exam.duration_minutes > 0) return Number(exam.duration_minutes);
    const s = parseTime12(exam.start_time);
    const e = parseTime12(exam.end_time);
    if (s !== null && e !== null && e > s) return e - s;
    return exam.duration_minutes || 75;
  };

  const getVacantHoursSuggestions = (conflictingExam) => {
    if (!conflictingExam) return [];
    
    // The conflicting exam's own end time is the minimum start for a reschedule
    const conflictEndMins = parseTime12(conflictingExam.end_time);
    const reqDuration = getExamDurationMins(conflictingExam);
    
    // Get all other exams on the same day (excluding the conflicting exam itself)
    const otherExams = exams.filter(e => e.exam_date === conflictingExam.exam_date && e.id !== conflictingExam.id);
    
    const WINDOW_START = 420; // 7:00 AM
    const WINDOW_END = 1050;  // 5:30 PM
    
    // Include the conflicting exam itself as a busy block so its slot is excluded
    let busy = [
      [parseTime12(conflictingExam.start_time), parseTime12(conflictingExam.end_time)],
      ...otherExams.map(e => [parseTime12(e.start_time), parseTime12(e.end_time)])
    ];
    
    // Sort and merge busy intervals
    busy.sort((a, b) => a[0] - b[0]);
    let mergedBusy = [];
    for (let interval of busy) {
      if (mergedBusy.length === 0) {
        mergedBusy.push(interval);
      } else {
        let last = mergedBusy[mergedBusy.length - 1];
        if (interval[0] <= last[1]) {
          last[1] = Math.max(last[1], interval[1]);
        } else {
          mergedBusy.push(interval);
        }
      }
    }
    
    // Find free intervals within the window
    let freeIntervals = [];
    let current = WINDOW_START;
    
    for (let interval of mergedBusy) {
      if (interval[0] > current) {
        if (interval[0] - current >= reqDuration) {
          freeIntervals.push([current, interval[0]]);
        }
      }
      current = Math.max(current, interval[1]);
    }
    
    if (WINDOW_END > current) {
      if (WINDOW_END - current >= reqDuration) {
        freeIntervals.push([current, WINDOW_END]);
      }
    }
    
    // Only show slots that start at or AFTER the conflicting exam ends
    return freeIntervals.filter(interval => interval[0] >= conflictEndMins);
  };

  const canIrregularReschedule = (exam) => {
    if (!exam) return false;
    const conflictingExams = exams.filter((peer) =>
      peer.id !== exam.id &&
      peer.exam_date === exam.exam_date &&
      parseTime12(exam.start_time) < parseTime12(peer.end_time) &&
      parseTime12(peer.start_time) < parseTime12(exam.end_time)
    );
    if (conflictingExams.length === 0) return false;
    const conflictExamIds = new Set([exam.id, ...conflictingExams.map((peer) => peer.id)]);
    const conflictAlreadyHandled = myRequests.some((request) =>
      conflictExamIds.has(request.exam_id) && ["pending", "approved"].includes(request.status)
    );
    if (conflictAlreadyHandled) return false;
    return !(exam.category === "major" && conflictingExams.some((peer) => peer.category !== "major"));
  };

  const getIrregularRescheduleSuggestions = (exam) => {
    if (!exam) return [];
    const duration = getExamDurationMins(exam);
    const otherExams = exams.filter((peer) => peer.exam_date === exam.exam_date && peer.id !== exam.id);
    let nextStart = parseTime12(exam.end_time);

    while (nextStart + duration <= 24 * 60) {
      const overlaps = otherExams.filter((peer) =>
        nextStart < parseTime12(peer.end_time) &&
        parseTime12(peer.start_time) < nextStart + duration
      );
      if (overlaps.length === 0) break;
      nextStart = Math.max(...overlaps.map((peer) => parseTime12(peer.end_time)));
    }

    if (nextStart + duration > 24 * 60) return [];
    if (nextStart < 17 * 60 && nextStart + duration <= 17 * 60) {
      return [{ start: nextStart, end: nextStart + duration, consultation: false }];
    }

    let consultationStart = Math.max(nextStart, 17 * 60);
    const dayExams = exams.filter((peer) => peer.exam_date === exam.exam_date);
    const conflictTargets = new Set();
    for (let firstIndex = 0; firstIndex < dayExams.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < dayExams.length; secondIndex += 1) {
        const firstExam = dayExams[firstIndex];
        const secondExam = dayExams[secondIndex];
        const overlaps = parseTime12(firstExam.start_time) < parseTime12(secondExam.end_time) &&
          parseTime12(secondExam.start_time) < parseTime12(firstExam.end_time);
        if (!overlaps) continue;
        if (firstExam.category === "major" && secondExam.category !== "major") {
          conflictTargets.add(secondExam.id);
        } else if (secondExam.category === "major" && firstExam.category !== "major") {
          conflictTargets.add(firstExam.id);
        } else {
          conflictTargets.add(firstExam.id);
          conflictTargets.add(secondExam.id);
        }
      }
    }
    const optionCount = Math.max(2, conflictTargets.size);
    const suggestions = [];

    for (let index = 0; index < optionCount && consultationStart + duration <= 24 * 60; index += 1) {
      const overlaps = otherExams.filter((peer) =>
        consultationStart < parseTime12(peer.end_time) &&
        parseTime12(peer.start_time) < consultationStart + duration
      );
      if (overlaps.length > 0) {
        consultationStart = Math.max(...overlaps.map((peer) => parseTime12(peer.end_time)));
        index -= 1;
        continue;
      }
      suggestions.push({
        start: consultationStart,
        end: consultationStart + duration,
        consultation: true,
      });
      consultationStart += duration + 15;
    }
    return suggestions;
  };

  const applyVacantHoursSuggestion = (startMins, duration = 75) => {
    const toHHMM = (mins) => {
      const h = Math.floor(mins / 60) % 24;
      const m = mins % 60;
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    };
    setPreferredStartTime(toHHMM(startMins));
    setPreferredEndTime(toHHMM(startMins + duration));
  };

  useEffect(() => {
    if (!isModalOpen || !selectedExam) return;
    setPreferredStartTime("");
    setPreferredEndTime("");
  }, [isModalOpen, selectedExam]);

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) { }
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
      await api.delete(`/notifications/clear/student/${user.id}`);
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
    setActiveTab("schedule");
    
    if (msg.includes("rescheduling") || msg.includes("reschedule") || msg.includes("request")) {
      setTimeout(() => {
        const element = document.getElementById("my-rescheduling-requests-section");
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        }
      }, 150);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (!user) return <div className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gray-50"} flex items-center justify-center`}>Redirecting...</div>;

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

  // Filters for exams
  const processedExams = exams.filter(exam => {
    if (exam.exam_type?.toLowerCase() !== "written") return false;
    if (searchTerm && !exam.subject_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !exam.subject_code.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filterDay !== "all" && !exam.exam_date.includes(filterDay)) return false;
    if (filterCategory !== "all" && exam.category?.toLowerCase() !== filterCategory.toLowerCase()) return false;
    if (filterSession !== "all") {
      const isMorning = exam.start_time.includes("AM");
      if (filterSession === "morning" && !isMorning) return false;
      if (filterSession === "afternoon" && isMorning) return false;
    }
    return true;
  });

  const grouped = processedExams.reduce((acc, ex) => {
    const key = ex.section_name || "Unknown Section";
    if (!acc[key]) acc[key] = [];
    acc[key].push(ex);
    return acc;
  }, {});

  const filtered = Object.entries(grouped);
  const unreadCount = notifications.filter(n => !n.is_read).length;
  const latestUnreadNotif = notifications.find(n => !n.is_read);
  const openRescheduleRequest = (exam) => {
    setSelectedExam(exam);
    setCourseCode(exam.subject_code);
    setCourseName(exam.subject_name);
    const parts = exam.exam_date.split(", ");
    const date = new Date(`${parts[1]}, ${parts[2]}`);
    setOriginalExamDate(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
    setOriginalStartTime(exam.start_time);
    setOriginalEndTime(exam.end_time);
    setExamType(exam.exam_type || "Midterm");
    setIsModalOpen(true);
  };
  const renderMobileExamCards = (examList, showSection = false) => (
    <div className="md:hidden space-y-3 p-3">
      {examList.map((exam) => {
        const conflictingExams = conflictingExamsById.get(exam.id) || [];
        const isConflicting = conflictingExams.length > 0;
        const isIrregular = user?.student_type === "irregular";
        const canReschedule = isIrregular ? canIrregularReschedule(exam) : isConflicting;

        return (
          <article
            key={exam.id}
            className={`rounded-xl border p-4 ${isConflicting
              ? isDark ? "border-red-500/60 bg-red-950/20" : "border-red-300 bg-red-50"
              : isDark ? "border-gray-700 bg-gray-800" : "border-gray-200 bg-white"
              }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className={`font-bold text-base leading-snug break-words ${isDark ? "text-white" : "text-gray-900"}`}>
                  {exam.subject_name}
                </h3>
                <p className={`mt-1 text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  {exam.subject_code}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${exam.category === "major"
                ? isDark ? "bg-purple-900/40 text-purple-300" : "bg-purple-100 text-purple-700"
                : isDark ? "bg-blue-900/40 text-blue-300" : "bg-blue-100 text-blue-700"
                }`}>
                {exam.category ? exam.category.toUpperCase() : "OTHER"}
              </span>
            </div>

            <div className={`mt-4 grid grid-cols-1 gap-3 border-t pt-3 text-sm sm:grid-cols-2 ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              {showSection && (
                <div className="min-w-0">
                  <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-gray-400" : "text-gray-500"}`}>Section</p>
                  <p className={`mt-1 break-words ${isDark ? "text-gray-200" : "text-gray-800"}`}>{exam.section_name || "-"}</p>
                </div>
              )}
              <div className="min-w-0">
                <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-gray-400" : "text-gray-500"}`}>Date &amp; time</p>
                <p className={`mt-1 flex items-start gap-2 break-words ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                  <CalendarIcon className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <span>{formatDate(exam.exam_date)}</span>
                </p>
                <p className={`mt-1 flex items-start gap-2 break-words ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  <ClockIcon className="mt-0.5 h-4 w-4 shrink-0 text-purple-500" />
                  <span>{exam.start_time} - {exam.end_time}</span>
                </p>
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-gray-400" : "text-gray-500"}`}>Room &amp; program</p>
                <p className={`mt-1 flex items-start gap-2 break-words ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                  <MapPinIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
                  <span>{exam.room || "Room not assigned"}</span>
                </p>
                <p className={`mt-1 break-words text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                  {[exam.course_name, exam.year_level].filter(Boolean).join(" • ") || "Program not specified"}
                </p>
              </div>
              <div className="min-w-0">
                <p className={`text-xs font-semibold uppercase tracking-wide ${isDark ? "text-gray-400" : "text-gray-500"}`}>Proctor</p>
                <p className={`mt-1 flex items-start gap-2 break-words ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                  <CheckBadgeIcon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                  <span>{exam.proctor || "Unassigned"}</span>
                </p>
              </div>
            </div>

            {isConflicting && (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
                <p className="font-bold">Schedule conflict</p>
                {conflictingExams.map((peer) => (
                  <p key={peer.id} className="mt-1 break-words">
                    Overlaps with {peer.subject_name} ({peer.start_time} - {peer.end_time})
                  </p>
                ))}
              </div>
            )}

            <div className="mt-4 border-t pt-3">
              <button
                type="button"
                onClick={() => openRescheduleRequest(exam)}
                disabled={!canReschedule}
                className={`min-h-11 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition ${canReschedule
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : isDark ? "cursor-not-allowed bg-gray-700 text-gray-400" : "cursor-not-allowed bg-gray-200 text-gray-500"
                  }`}
              >
                Request Reschedule
              </button>
              {!canReschedule && (
                <p className={`mt-2 text-center text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  Available only for eligible exam conflicts.
                </p>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );

  return (
    <div className={`min-h-screen relative transition-colors duration-300 ${isDark ? "bg-slate-900" : "bg-slate-50"}`}>
      {showNotifications && <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity" onClick={() => setShowNotifications(false)}></div>}
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
            {notifications.length === 0 ? <div className={`p-6 text-center text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}><BellIcon className="w-8 h-8 mx-auto mb-2 opacity-20" />You're all caught up!</div> : notifications.map((notif) => (
              <div key={notif.id} onClick={() => handleNotificationClick(notif)} className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 mb-1 group relative ${notif.is_read ? (isDark ? "hover:bg-slate-700/50 opacity-60" : "hover:bg-slate-50 opacity-60") : (isDark ? "bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/30" : "bg-blue-50 hover:bg-blue-100 border border-blue-100")}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex gap-3 min-w-0 flex-1">
                    <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${notif.is_read ? "bg-slate-400" : "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"}`}></div>
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


      {/* Header */}
      <header className={`sticky top-0 z-30 backdrop-blur-2xl border-b transition-all duration-300 ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white/80 border-slate-200"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
          <div className="flex items-center justify-between gap-3 sm:gap-6">
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg transition-transform hover:scale-105 ${isDark ? "bg-gradient-to-br from-blue-600 to-indigo-700" : "bg-gradient-to-br from-blue-500 to-blue-700"}`}>
                <img src="/images.png" alt="STI Logo" className="rounded-xl h-7 w-7 sm:h-8 sm:w-8 object-contain drop-shadow-md" />
              </div>
              <div className="min-w-0">
                <h1 className={`text-base sm:text-xl font-bold tracking-tight truncate ${isDark ? "text-white" : "text-slate-900"}`}>STI Education System</h1>
                <p className={`text-[10px] sm:text-xs font-medium tracking-wide uppercase mt-0.5 ${isDark ? "text-blue-400" : "text-blue-600"}`}>Student Portal</p>
              </div>
            </div>

            <div className="flex-1 max-w-xl hidden md:block">
              {user?.student_type === "regular" && (
                <div className="relative group">
                  <MagnifyingGlassIcon className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-500"}`} />
                  <input type="text" placeholder="Search exams..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`w-full pl-12 pr-5 py-3 rounded-2xl border outline-none transition-all text-sm shadow-sm ${isDark ? "bg-slate-800/50 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:bg-slate-800" : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"}`} />
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-4 shrink-0">
              <div className={`hidden sm:block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${isDark ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>STUDENT</div>

              <div className="relative">
                <button onClick={() => setShowNotifications(!showNotifications)} className={`relative p-2 sm:p-2.5 rounded-xl transition-all duration-300 ${isDark ? "text-slate-300 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}>
                  <BellIcon className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-900 animate-pulse">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </div>
              <div className="h-8 w-px bg-slate-200 dark:bg-slate-700 mx-1 sm:mx-2 hidden sm:block"></div>
              <SettingsDropdown onLogout={handleLogout} isDark={isDark} />
            </div>
          </div>
        </div>
      </header>

      {/* Latest Notification Banner */}
      {latestUnreadNotif && (
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 -mb-2 sm:-mb-4">
          <div className="animate-in fade-in slide-in-from-top-4 duration-300 relative z-10">
            <div className={`p-3.5 sm:p-4 rounded-2xl border backdrop-blur-md shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 transition-all ${
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
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-bold uppercase tracking-wider block opacity-75">New Notification</span>
                  <p className="text-xs sm:text-sm font-semibold mt-0.5 leading-snug">{latestUnreadNotif.message}</p>
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
        </div>
      )}

      {/* Student Info Hero Section */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-8">
        <div className={`p-4 sm:p-8 rounded-2xl sm:rounded-3xl shadow-sm border flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 overflow-hidden relative ${isDark ? "bg-slate-800/50 border-slate-700/50" : "bg-white border-slate-200"}`}>
          <div className="absolute right-0 top-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          <div className={`w-14 h-14 sm:w-20 sm:h-20 rounded-2xl flex shrink-0 items-center justify-center text-xl sm:text-3xl font-bold shadow-inner ${isDark ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white" : "bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-700 border border-blue-200"}`}>
            {(user?.name || "S").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
          </div>
          <div className="relative z-10 min-w-0">
            <h2 className={`text-xl sm:text-3xl font-bold tracking-tight truncate ${isDark ? "text-white" : "text-slate-900"}`}>Welcome back, {user?.name || "Student"}</h2>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 mt-2 sm:mt-3">
              <span className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-medium border ${isDark ? "bg-slate-700/50 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>Section: <strong className={isDark ? "text-white" : "text-slate-900"}>{user?.section_name || section || "N/A"}</strong></span>
              <span className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-medium border ${isDark ? "bg-slate-700/50 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>Type: <strong className={`capitalize ${isDark ? "text-white" : "text-slate-900"}`}>{user?.student_type === "regular" ? "Regular" : user?.student_type === "irregular" ? "Irregular" : "Not set"}</strong></span>
              {user?.student_type === "irregular" && user?.course_id && (
                <span className={`px-2.5 py-1 rounded-lg text-xs sm:text-sm font-medium border ${isDark ? "bg-slate-700/50 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                  Course: <strong className={isDark ? "text-white" : "text-slate-900"}>{coursesList.find(c => c.id === user.course_id)?.name || "Loaded"}</strong>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Selection */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 mb-4 sm:mb-6">
        <div className="flex gap-2 sm:gap-4 border-b border-slate-200 dark:border-slate-700 pb-2 overflow-x-auto no-scrollbar whitespace-nowrap">
          <button
            onClick={() => setActiveTab("schedule")}
            className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold shrink-0 transition-all ${activeTab === "schedule"
              ? isDark
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50"
                : "bg-blue-600 text-white shadow-md shadow-blue-500/25"
              : isDark
                ? "text-slate-400 hover:text-white"
                : "text-slate-600 hover:text-blue-600"
              }`}
          >
            My Schedule
          </button>
          <button
            onClick={() => setActiveTab("chat")}
            className={`flex items-center gap-2 px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold shrink-0 transition-all ${activeTab === "chat"
              ? isDark
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50"
                : "bg-blue-600 text-white shadow-md shadow-blue-500/25"
              : isDark
                ? "text-slate-400 hover:text-white"
                : "text-slate-600 hover:text-blue-600"
              }`}
          >
            <div className="relative flex items-center justify-center">
              <ChatBubbleLeftRightIcon className="w-4 h-4" />
              {unreadChatCount > 0 && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse border-2 border-white dark:border-slate-900"></span>
              )}
            </div>
            <span>Chat Support</span>
          </button>
          <button
            onClick={() => setActiveTab("manual")}
            className={`px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold shrink-0 transition-all ${activeTab === "manual"
              ? isDark
                ? "bg-blue-600 text-white shadow-lg shadow-blue-900/50"
                : "bg-blue-600 text-white shadow-md shadow-blue-500/25"
              : isDark
                ? "text-slate-400 hover:text-white"
                : "text-slate-600 hover:text-blue-600"
              }`}
          >
            User Manual
          </button>
        </div>
      </div>

      {activeTab === "chat" ? (
        <StudentChatPanel />
      ) : activeTab === "schedule" ? (
        <>




          {/* Filters bar */}
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 sm:py-4">
            <div className={`p-3.5 sm:p-4 rounded-2xl shadow-sm border ${isDark ? "bg-gray-800/80 border-gray-700" : "bg-white border-gray-200"}`}>
              <div className="md:hidden mb-3">
                <div className="relative">
                  <MagnifyingGlassIcon className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? "text-slate-400" : "text-slate-400"}`} />
                  <input 
                    type="text" 
                    placeholder="Search exams..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    className={`w-full pl-10 pr-4 py-2 rounded-xl border outline-none text-xs ${isDark ? "bg-slate-700 border-slate-600 text-slate-100 placeholder-slate-400 focus:border-blue-500" : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-blue-500"}`} 
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5 sm:gap-4 items-center">
                <div className="flex items-center gap-2"><CalendarIcon className={`w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-500"}`} /><span className={`text-xs sm:text-sm font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>Filters:</span></div>
                <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs sm:text-sm border ${isDark ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-300"}`}><option value="all">All Days</option><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option></select>
                <select value={filterSession} onChange={(e) => setFilterSession(e.target.value)} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs sm:text-sm border ${isDark ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-300"}`}><option value="all">All Sessions</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option></select>
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg text-xs sm:text-sm border ${isDark ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-300"}`}><option value="all">All Categories</option><option value="major">Major</option><option value="general">General</option></select>
                {(filterDay !== "all" || filterSession !== "all" || filterCategory !== "all") && <button onClick={() => { setFilterDay("all"); setFilterSession("all"); setFilterCategory("all"); }} className="text-xs sm:text-sm font-medium text-blue-500 hover:underline ml-auto">Clear Filters</button>}
              </div>
            </div>
          </div>

          {/* Main Content - Exam Schedule */}
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
            {loading ? (
              <div className="flex items-center justify-center py-20"><div className="w-10 h-10 rounded-full border-4 border-t-blue-500 animate-spin"></div><p className="ml-3 text-sm font-medium">Loading your schedule...</p></div>
            ) : filtered.length === 0 ? (
              <div className={`text-center py-16 sm:py-20 px-4 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                <div className="max-w-md mx-auto"><div className={`w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-5 rounded-2xl ${isDark ? "bg-gray-800" : "bg-white border border-gray-200"} flex items-center justify-center`}><BookOpenIcon className={`w-8 h-8 sm:w-10 sm:h-10 ${isDark ? "text-gray-500" : "text-gray-400"}`} /></div><p className="text-lg sm:text-xl font-bold mb-2">{exams.length === 0 ? "No Exams Posted" : "No Results Found"}</p><p className="text-xs sm:text-sm leading-relaxed">{exams.length === 0 ? "Your program head hasn't posted any exams yet. Check back soon!" : "Try adjusting your search term."}</p></div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* View controls & Section controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs sm:text-sm font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                      Scheduled Exams ({processedExams.length})
                    </span>
                    {filtered.length > 1 && (
                      <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${isDark ? "bg-slate-800 text-slate-300 border border-slate-700" : "bg-slate-100 text-slate-600 border border-slate-200"}`}>
                        Across {filtered.length} Sections
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {/* View Switcher: All in One Table vs By Section (All Open) */}
                    <div className={`flex rounded-xl p-1 border ${isDark ? "bg-gray-800/80 border-gray-700" : "bg-gray-100 border-gray-200"}`}>
                      <button
                        type="button"
                        onClick={() => setScheduleViewMode("all")}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                          scheduleViewMode === "all"
                            ? (isDark ? "bg-blue-600 text-white shadow" : "bg-white text-blue-700 shadow-sm")
                            : (isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900")
                        }`}
                      >
                        All in One Table
                      </button>
                      <button
                        type="button"
                        onClick={() => setScheduleViewMode("bySection")}
                        className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                          scheduleViewMode === "bySection"
                            ? (isDark ? "bg-blue-600 text-white shadow" : "bg-white text-blue-700 shadow-sm")
                            : (isDark ? "text-gray-400 hover:text-white" : "text-gray-600 hover:text-gray-900")
                        }`}
                      >
                        By Section (All Open)
                      </button>
                    </div>

                    {scheduleViewMode === "bySection" && filtered.length > 1 && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <button
                          type="button"
                          onClick={() => setCollapsedSections(new Set())}
                          className="font-semibold text-blue-500 hover:underline"
                        >
                          Expand All
                        </button>
                        <span className="text-gray-400">/</span>
                        <button
                          type="button"
                          onClick={() => setCollapsedSections(new Set(filtered.map(([name]) => name)))}
                          className="text-gray-500 hover:underline"
                        >
                          Collapse All
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* View Mode 1: Unified Single Table (Shows ALL scheduled exams at once) */}
                {scheduleViewMode === "all" ? (
                  <div className={`rounded-2xl overflow-hidden border shadow-sm ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                    <div className="hidden md:block overflow-x-auto custom-scrollbar">
                      <table className="w-full text-xs sm:text-sm min-w-[700px]">
                        <thead className={`${isDark ? "bg-gray-700/50 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                          <tr>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Subject</th>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Section</th>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Category</th>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Schedule</th>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Details</th>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Proctor</th>
                            <th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {processedExams.map((exam) => {
                            const conflictingExams = conflictingExamsById.get(exam.id) || [];
                            const isConflicting = conflictingExams.length > 0;
                            const isIrregular = user?.student_type === "irregular";
                            const canReschedule = isIrregular ? canIrregularReschedule(exam) : isConflicting;
                            return (
                              <tr key={exam.id} className={`${isDark ? "hover:bg-gray-700/30" : "hover:bg-gray-50"} transition ${isConflicting ? (isDark ? "bg-red-900/20 border-l-4 border-red-500" : "bg-red-50 border-l-4 border-red-500") : ""}`}>
                                <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                  <div className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{exam.subject_name}</div>
                                  <div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>{exam.subject_code}</div>
                                  {isConflicting && <div className="mt-1 space-y-0.5 text-[10px] sm:text-xs text-red-500"><div className="font-bold">CONFLICT DETECTED</div>{conflictingExams.map((peer) => <div key={peer.id} className="font-medium">Overlaps with {peer.subject_name} ({peer.category || "uncategorized"}) · {peer.start_time} - {peer.end_time}</div>)}</div>}
                                </td>
                                <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                  <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${isDark ? "bg-blue-900/40 text-blue-300 border border-blue-800" : "bg-blue-50 text-blue-700 border border-blue-200"}`}>
                                    {exam.section_name || "-"}
                                  </span>
                                </td>
                                <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${exam.category === "major" ? (isDark ? "bg-purple-900/30 text-purple-300" : "bg-purple-100 text-purple-700") : (isDark ? "bg-blue-900/30 text-blue-300" : "bg-blue-100 text-blue-700")}`}>{exam.category ? exam.category.toUpperCase() : "-"}</span>
                                </td>
                                <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                  <div className={`flex items-center gap-1.5 ${isDark ? "text-gray-200" : "text-gray-800"}`}><CalendarIcon className="w-3.5 h-3.5 text-blue-500" />{formatDate(exam.exam_date)}</div>
                                  <div className={`flex items-center gap-1.5 mt-1 text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}><ClockIcon className="w-3.5 h-3.5 text-purple-500" />{exam.start_time} - {exam.end_time}</div>
                                </td>
                                <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                  <div className="flex items-center gap-1.5"><MapPinIcon className={`w-3.5 h-3.5 ${isDark ? "text-gray-400" : "text-gray-500"}`} /><span className={`px-2 py-0.5 rounded text-xs font-medium ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"}`}>{exam.room}</span></div>
                                  <div className={`mt-1 text-[11px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>{exam.course_name} • {exam.year_level}</div>
                                </td>
                                <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                  <div className={`flex items-center gap-1.5 ${isDark ? "text-gray-300" : "text-gray-700"}`}><CheckBadgeIcon className="w-3.5 h-3.5 text-emerald-500" /><span className="text-xs sm:text-sm">{exam.proctor || "Unassigned"}</span></div>
                                </td>
                                <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                  <div className="group relative">
                                    <button onClick={() => { if (!canReschedule) return; setSelectedExam(exam); setCourseCode(exam.subject_code); setCourseName(exam.subject_name); const parts = exam.exam_date.split(", "); const d = new Date(`${parts[1]}, ${parts[2]}`); setOriginalExamDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); setOriginalStartTime(exam.start_time); setOriginalEndTime(exam.end_time); setExamType(exam.exam_type || "Midterm"); setIsModalOpen(true); }} disabled={!canReschedule} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${canReschedule ? (isDark ? "bg-red-600 hover:bg-red-700 text-white" : "bg-red-500 hover:bg-red-600 text-white shadow-sm") : (isDark ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-gray-200 text-gray-400 cursor-not-allowed")}`}>Request Reschedule</button>
                                    {!canReschedule && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">Rescheduling is only available for eligible exam conflicts.</div>}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {renderMobileExamCards(processedExams, true)}
                  </div>
                ) : (
                  /* View Mode 2: By Section (ALL SECTIONS OPEN SIMULTANEOUSLY BY DEFAULT) */
                  filtered.map(([sectionName, sectionExams]) => {
                    const isExpanded = !collapsedSections.has(sectionName);
                    return (
                      <div key={sectionName} className={`rounded-2xl overflow-hidden border shadow-sm ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                        <button onClick={() => toggleSection(sectionName)} className={`w-full px-4 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between transition ${isDark ? "bg-gray-700/50 hover:bg-gray-700/70" : "bg-gray-50 hover:bg-gray-100"}`}>
                          <div className="flex items-center gap-3 sm:gap-4">
                            <div className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ${isDark ? "bg-blue-900/30 text-blue-300" : "bg-blue-50 text-blue-600"}`}>
                              <BookOpenIcon className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                              <h2 className={`text-base sm:text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{sectionName}</h2>
                              <p className={`text-xs sm:text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{sectionExams.length} scheduled exam{sectionExams.length !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                          <ChevronRightIcon className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-90 text-blue-500" : isDark ? "text-gray-500" : "text-gray-400"}`} />
                        </button>
                        {isExpanded && (
                          <div className="animate-slideDown">
                            <div className="hidden md:block overflow-x-auto custom-scrollbar">
                              <table className="w-full text-xs sm:text-sm min-w-[640px]">
                                <thead className={`${isDark ? "bg-gray-700/50 text-gray-300" : "bg-gray-100 text-gray-700"}`}><tr><th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Subject</th><th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Category</th><th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Schedule</th><th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Details</th><th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Proctor</th><th className="px-4 sm:px-6 py-3 sm:py-4 text-left font-bold">Actions</th></tr></thead>
                                <tbody>
                                  {sectionExams.map((exam) => {
                                    const conflictingExams = conflictingExamsById.get(exam.id) || [];
                                    const isConflicting = conflictingExams.length > 0;
                                    const isIrregular = user?.student_type === "irregular";
                                    const canReschedule = isIrregular ? canIrregularReschedule(exam) : isConflicting;
                                    return (
                                      <tr key={exam.id} className={`${isDark ? "hover:bg-gray-700/30" : "hover:bg-gray-50"} transition ${isConflicting ? (isDark ? "bg-red-900/20 border-l-4 border-red-500" : "bg-red-50 border-l-4 border-red-500") : ""}`}>
                                        <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><div className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{exam.subject_name}</div><div className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>{exam.subject_code}</div>{isConflicting && <div className="mt-1 space-y-0.5 text-[10px] sm:text-xs text-red-500"><div className="font-bold">CONFLICT DETECTED</div>{conflictingExams.map((peer) => <div key={peer.id} className="font-medium">Overlaps with {peer.subject_name} ({peer.category || "uncategorized"}) · {peer.start_time} - {peer.end_time}</div>)}</div>}</td>
                                        <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold ${exam.category === "major" ? (isDark ? "bg-purple-900/30 text-purple-300" : "bg-purple-100 text-purple-700") : (isDark ? "bg-blue-900/30 text-blue-300" : "bg-blue-100 text-blue-700")}`}>{exam.category ? exam.category.toUpperCase() : "-"}</span></td>
                                        <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><div className={`flex items-center gap-1.5 ${isDark ? "text-gray-200" : "text-gray-800"}`}><CalendarIcon className="w-3.5 h-3.5 text-blue-500" />{formatDate(exam.exam_date)}</div><div className={`flex items-center gap-1.5 mt-1 text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}><ClockIcon className="w-3.5 h-3.5 text-purple-500" />{exam.start_time} - {exam.end_time}</div></td>
                                        <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><div className="flex items-center gap-1.5"><MapPinIcon className={`w-3.5 h-3.5 ${isDark ? "text-gray-400" : "text-gray-500"}`} /><span className={`px-2 py-0.5 rounded text-xs font-medium ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"}`}>{exam.room}</span></div><div className={`mt-1 text-[11px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>{exam.course_name} • {exam.year_level}</div></td>
                                        <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><div className={`flex items-center gap-1.5 ${isDark ? "text-gray-300" : "text-gray-700"}`}><CheckBadgeIcon className="w-3.5 h-3.5 text-emerald-500" /><span className="text-xs sm:text-sm">{exam.proctor || "Unassigned"}</span></div></td>
                                        <td className={`px-4 sm:px-6 py-3 sm:py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><div className="group relative"><button onClick={() => { if (!canReschedule) return; setSelectedExam(exam); setCourseCode(exam.subject_code); setCourseName(exam.subject_name); const parts = exam.exam_date.split(", "); const d = new Date(`${parts[1]}, ${parts[2]}`); setOriginalExamDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); setOriginalStartTime(exam.start_time); setOriginalEndTime(exam.end_time); setExamType(exam.exam_type || "Midterm"); setIsModalOpen(true); }} disabled={!canReschedule} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${canReschedule ? (isDark ? "bg-red-600 hover:bg-red-700 text-white" : "bg-red-500 hover:bg-red-600 text-white shadow-sm") : (isDark ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-gray-200 text-gray-400 cursor-not-allowed")}`}>Request Reschedule</button>{!canReschedule && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">Rescheduling is only available for eligible exam conflicts.</div>}</div></td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                            {renderMobileExamCards(sectionExams)}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* My Requests */}
            <div id="my-rescheduling-requests-section" className={`mt-6 sm:mt-8 rounded-2xl overflow-hidden border shadow-sm ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
              <div className={`px-4 sm:px-6 py-3.5 sm:py-4 border-b ${isDark ? "border-gray-700 bg-gray-700/50" : "border-gray-200 bg-gray-50"}`}><h3 className={`text-base sm:text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>My Rescheduling Requests</h3></div>
              <div className="p-4 sm:p-6">{myRequests.length === 0 ? <p className={`text-xs sm:text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>No rescheduling requests yet.</p> : <div className="space-y-3 sm:space-y-4">{myRequests.map((req) => (<div key={req.id} className={`p-3.5 sm:p-4 rounded-xl border ${isDark ? "bg-gray-700/50 border-gray-600" : "bg-gray-50 border-gray-300"}`}><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className={`font-bold text-xs sm:text-sm ${isDark ? "text-white" : "text-gray-900"}`}>Exam ID: {req.exam_id}</p><p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Requested Mode: {req.requested_mode}</p>{req.preferred_date && <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Rescheduled: {req.preferred_date} {req.preferred_start_time || ""}{req.preferred_end_time ? ` - ${req.preferred_end_time}` : ""}</p>}{req.status === "approved" && req.assigned_room && <p className={`text-xs font-semibold ${isDark ? "text-emerald-300" : "text-emerald-700"}`}>Location: {req.assigned_room}</p>}{req.status === "approved" && req.assigned_proctor && <p className={`text-xs ${isDark ? "text-gray-300" : "text-gray-700"}`}>Supervising proctor: {req.assigned_proctor}</p>}<p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>Reason: {req.reason}</p></div><span className={`px-3 py-1 rounded-full text-xs font-semibold self-start sm:self-auto ${req.status === "approved" ? "bg-green-100 text-green-800" : req.status === "rejected" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>{req.status}</span></div></div>))}</div>}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-6">
          <StudentManual />
        </div>
      )}

      {/* Reschedule Modal - FULL MODAL CODE */}
      {isModalOpen && selectedExam && (
        <div className="fixed inset-0 flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200">
          <div className={`w-full max-w-2xl max-h-[92dvh] overflow-y-auto p-5 sm:p-7 rounded-2xl sm:rounded-3xl border shadow-2xl custom-scrollbar ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
            <div className="flex items-center justify-between mb-6 pb-3 border-b dark:border-gray-800">
              <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Request Exam Reschedule</h3>
              <button onClick={() => setIsModalOpen(false)} className={`p-2 rounded-xl transition ${isDark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!acknowledged || !detailedExplanation.trim() || (user?.student_type === "irregular" && (!preferredStartTime || !preferredEndTime))) {
                showWarning("Please choose the consultation time, acknowledge, and provide a detailed explanation");
                return;
              }
              setLoadingRequest(true);
              try {
                const requestData = {
                  exam_id: selectedExam.id,
                  section_name: section,
                  student_name: studentName,
                  student_id: studentId,
                  program: program,
                  school_email: schoolEmail,
                  course_code: courseCode,
                  course_name: courseName,
                  original_exam_date: originalExamDate,
                  original_start_time: originalStartTime,
                  original_end_time: originalEndTime,
                  exam_type: "Midterm",
                  reason_type: reasonType,
                  detailed_explanation: detailedExplanation,
                  supporting_file: null,
                  requested_mode: "offline",
                  preferred_date: originalExamDate,
                  preferred_start_time: preferredStartTime || null,
                  preferred_end_time: preferredEndTime || null,
                  acknowledged: acknowledged,
                };
                const res = await api.post("/student/reschedule-request", requestData);
                if (res.status === 200 || res.status === 201) {
                  showSuccess("Request submitted successfully!");
                  setIsModalOpen(false);
                  const requestsRes = await api.get("/student/requests");
                  setMyRequests(requestsRes.data);
                } else {
                  showError("Submission failed");
                }
              } catch (err) {
                console.error("Submission error:", err);
                showError(err.response?.data?.detail || "Error submitting request");
              }
              setLoadingRequest(false);
            }} className="space-y-5 sm:space-y-6">
              {/* Student Information */}
              <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800/80" : "bg-gray-50"}`}>
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`text-xs sm:text-sm font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-gray-900"}`}>1. Student Information</h4>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isDark ? "bg-slate-700 text-slate-400" : "bg-slate-200 text-slate-500"}`}>Auto-filled from your account</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Student Name</label>
                    <input type="text" value={studentName} readOnly className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border cursor-not-allowed ${isDark ? "bg-slate-700/50 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-700 border-slate-200"}`} />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Student ID</label>
                    <input type="text" value={studentId} readOnly className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border cursor-not-allowed font-mono ${isDark ? "bg-slate-700/50 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-700 border-slate-200"}`} />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Program / Course</label>
                    <input type="text" value={program} readOnly className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border cursor-not-allowed ${isDark ? "bg-slate-700/50 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-700 border-slate-200"}`} />
                  </div>
                  <div>
                    <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Section</label>
                    <input type="text" value={section} readOnly className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border cursor-not-allowed ${isDark ? "bg-slate-700/50 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-700 border-slate-200"}`} />
                  </div>
                  <div className="md:col-span-2">
                    <label className={`block text-xs font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>School Email</label>
                    <input type="email" value={schoolEmail} readOnly className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border cursor-not-allowed ${isDark ? "bg-slate-700/50 text-slate-300 border-slate-600" : "bg-slate-100 text-slate-700 border-slate-200"}`} />
                  </div>
                </div>
              </div>

              {/* Exam Details */}
              <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800/80" : "bg-gray-50"}`}>
                <h4 className={`text-xs sm:text-sm font-bold uppercase tracking-wider mb-3 ${isDark ? "text-slate-300" : "text-gray-900"}`}>2. Exam to Be Rescheduled</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                  <div><label className={`block text-xs font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Course Code / Course Name</label><input type="text" value={courseCode + " / " + courseName} readOnly className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border ${isDark ? "bg-gray-700 text-white border-gray-600" : "bg-white text-gray-900 border-gray-300"}`} /></div>
                  <div><label className={`block text-xs font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Original Exam Date</label><input type="text" value={new Date(originalExamDate).toLocaleDateString()} readOnly className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border ${isDark ? "bg-gray-700 text-white border-gray-600" : "bg-white text-gray-900 border-gray-300"}`} /></div>
                  <div><label className={`block text-xs font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Original Exam Time</label><input type="text" value={originalStartTime + " - " + originalEndTime} readOnly className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border ${isDark ? "bg-gray-700 text-white border-gray-600" : "bg-white text-gray-900 border-gray-300"}`} /></div>
                </div>
              </div>

              {/* Reason */}
              <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800/80" : "bg-gray-50"}`}>
                <h4 className={`text-xs sm:text-sm font-bold uppercase tracking-wider mb-3 ${isDark ? "text-slate-300" : "text-gray-900"}`}>3. Reason for Rescheduling</h4>
                <div className="space-y-3 sm:space-y-4">
                  <div><label className={`block text-xs font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Reason for Request *</label><select value={reasonType} onChange={(e) => setReasonType(e.target.value)} className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border ${isDark ? "bg-gray-700 text-white border-gray-600" : "bg-white text-gray-900 border-gray-300"}`} required><option value="">Select a reason</option><option value="exam conflict">Exam schedule conflict</option><option value="medical">Medical reason</option><option value="emergency">Emergency</option><option value="other">Other</option></select></div>
                  <div><label className={`block text-xs font-semibold mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Detailed Explanation *</label><textarea value={detailedExplanation} onChange={(e) => setDetailedExplanation(e.target.value)} rows={4} className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border ${isDark ? "bg-gray-700 text-white border-gray-600" : "bg-white text-gray-900 border-gray-300"}`} required /></div>
                </div>
              </div>

              {/* Preferred Reschedule */}
              <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800/80" : "bg-gray-50"}`}>
                <h4 className={`text-xs sm:text-sm font-bold uppercase tracking-wider mb-3 ${isDark ? "text-slate-300" : "text-gray-900"}`}>4. Preferred Reschedule Details</h4>
                {/* Smart vacant hours suggestions */}
                {selectedExam && (() => {
                  const reqDur = getExamDurationMins(selectedExam);
                  const durHours = Math.floor(reqDur / 60);
                  const durMinsRemain = reqDur % 60;
                  const durLabel = durHours > 0 && durMinsRemain > 0 
                    ? `${durHours}h ${durMinsRemain}m` 
                    : durHours > 0 ? `${durHours}h` : `${durMinsRemain}m`;

                  const isIrregular = user?.student_type === "irregular";
                  const suggestions = isIrregular
                    ? getIrregularRescheduleSuggestions(selectedExam)
                    : getVacantHoursSuggestions(selectedExam);
                  if (suggestions.length === 0) {
                    return (
                      <div className={`mb-4 p-3 rounded-lg border-l-4 border-yellow-500 ${isDark ? "bg-yellow-950/30" : "bg-yellow-50"}`}>
                        <p className={`text-xs font-bold uppercase tracking-wide mb-1 ${isDark ? "text-yellow-400" : "text-yellow-700"}`}>
                          No Replacement Times Found
                        </p>
                        <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                          No available same-day time fits this exam's {durLabel} duration. Please contact the Program Head.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className={`mb-4 p-3 rounded-lg border-l-4 border-blue-500 ${isDark ? "bg-blue-950/20" : "bg-blue-50"}`}>
                      <p className={`text-xs font-bold uppercase tracking-wide mb-1.5 ${isDark ? "text-blue-400" : "text-blue-700"}`}>
                        Suggested Times ({durLabel} each):
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {isIrregular ? suggestions.map((suggestion, idx) => {
                          const label = `${formatMinsTo12(suggestion.start)} - ${formatMinsTo12(suggestion.end)}`;
                          const isSelected = preferredStartTime === `${String(Math.floor(suggestion.start / 60)).padStart(2, "0")}:${String(suggestion.start % 60).padStart(2, "0")}`;
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => applyVacantHoursSuggestion(suggestion.start, reqDur)}
                              aria-pressed={isSelected}
                              className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition ${
                                isSelected
                                  ? "bg-emerald-600 text-white"
                                  : isDark ? "bg-blue-600 hover:bg-blue-500 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"
                              }`}
                            >
                              {label}{suggestion.consultation ? " · Consultation Area" : ""}
                            </button>
                          );
                        }) : suggestions.flatMap((s, idx) => {
                          const slots = [];
                          let slotStart = s[0];
                          while (slotStart + reqDur <= s[1]) {
                            slots.push(slotStart);
                            slotStart += reqDur;
                          }
                          return slots.map((slotStartMins, slotIdx) => {
                            const label = `${formatMinsTo12(slotStartMins)} - ${formatMinsTo12(slotStartMins + reqDur)}`;
                            return (
                              <button
                                key={`${idx}-${slotIdx}`}
                                type="button"
                                onClick={() => applyVacantHoursSuggestion(slotStartMins, reqDur)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition hover:-translate-y-0.5 ${
                                  isDark 
                                    ? "bg-blue-600 hover:bg-blue-500 text-white" 
                                    : "bg-blue-500 hover:bg-blue-600 text-white"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          });
                        })}
                      </div>
                    </div>
                  );
                })()}
                {user?.student_type === "irregular" ? (
                  <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                    Select one suggested time above. Consultation Area options begin at 5:00 PM.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className={`block text-xs sm:text-sm mb-1.5 font-semibold ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        Preferred New Exam Time (Within the Day)
                      </label>
                      <div className="flex gap-3 sm:gap-4">
                        <div className="flex-1">
                          <label className={`block text-xs mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>Start Time</label>
                          <input type="time" value={preferredStartTime} onChange={(e) => setPreferredStartTime(e.target.value)} className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border ${isDark ? "bg-gray-700 text-white border-gray-600" : "bg-white text-gray-900 border-gray-300"}`} />
                        </div>
                        <div className="flex-1">
                          <label className={`block text-xs mb-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>End Time</label>
                          <input type="time" value={preferredEndTime} onChange={(e) => setPreferredEndTime(e.target.value)} className={`w-full p-2.5 rounded-xl text-xs sm:text-sm border ${isDark ? "bg-gray-700 text-white border-gray-600" : "bg-white text-gray-900 border-gray-300"}`} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Acknowledgement */}
              <div className={`p-4 rounded-xl ${isDark ? "bg-gray-800/80" : "bg-gray-50"}`}>
                <h4 className={`text-xs sm:text-sm font-bold uppercase tracking-wider mb-3 ${isDark ? "text-slate-300" : "text-gray-900"}`}>5. Student Confirmation</h4>
                <div className="flex items-start gap-2.5"><input type="checkbox" id="acknowledge" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1 rounded" /><label htmlFor="acknowledge" className={`text-xs sm:text-sm leading-snug ${isDark ? "text-gray-300" : "text-gray-700"}`}>I confirm that the information provided is accurate and subject to approval. *</label></div>
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className={`w-full sm:w-auto px-5 py-3 rounded-xl font-bold text-xs sm:text-sm ${isDark ? "bg-gray-700 text-white hover:bg-gray-600" : "bg-gray-200 text-gray-900 hover:bg-gray-300"}`}>Cancel</button>
                <button type="submit" disabled={loadingRequest || !acknowledged || !detailedExplanation.trim() || (user?.student_type === "irregular" && (!preferredStartTime || !preferredEndTime))} className={`w-full sm:w-auto px-6 py-3 rounded-xl font-bold text-xs sm:text-sm transition shadow-md ${loadingRequest ? "bg-gray-400 cursor-not-allowed" : isDark ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/40" : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/25"}`}>{loadingRequest ? "Submitting..." : "Submit Request"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

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