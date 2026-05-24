import React, { useEffect, useState } from "react";
import { Search, LogOut, Calendar, Clock, MapPin, BookOpen, ChevronRight, Bell, UserCheck, Edit, X, Send, Settings } from "lucide-react";
import { useTheme } from "../context/themeStore";
import ThemeToggle from "../components/ThemeToggle";
import { useUser } from "../context/userStore";
import { useNavigate } from "react-router-dom";
import api from "../api";
import { useToast } from "../context/ToastContext";
import SettingsDropdown from "../components/SettingsDropdown";

function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split(", ");
  const date = new Date(`${parts[1]}, ${parts[2]}`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
  const [expandedSection, setExpandedSection] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);
  const [conflictIds, setConflictIds] = useState(new Set());
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [filterDay, setFilterDay] = useState("all");
  const [filterSession, setFilterSession] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  // Irregular student state
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [selectedType, setSelectedType] = useState(null);
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [selectedSubjects, setSelectedSubjects] = useState([]);
  const [irregularSearchTerm, setIrregularSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("schedule");
  const [coursesList, setCoursesList] = useState([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");

  // Reschedule form states
  const [studentName, setStudentName] = useState(user?.name || "");
  const [studentId, setStudentId] = useState("");
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
  const [preferredDate, setPreferredDate] = useState("");
  const [preferredStartTime, setPreferredStartTime] = useState("");
  const [preferredEndTime, setPreferredEndTime] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [loadingRequest, setLoadingRequest] = useState(false);

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

  // Check if student type is set on first load
  useEffect(() => {
    if (user && user.role === "student") {
      if (!user.student_type || user.student_type === "") {
        setShowTypeModal(true);
      } else if (user.student_type === "irregular" && !user.course_id) {
        setSelectedType("irregular");
        setShowTypeModal(true);
      } else if (user.student_type === "irregular") {
        if (user.course_id) {
          setSelectedCourseId(user.course_id.toString());
        }
        fetchAvailableSubjects();
        fetchCustomExams();
      } else if (user.student_type === "regular") {
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
        const conflictSet = new Set();
        conflictsRes.data.forEach(c => {
          conflictSet.add(c.exam1.id);
          conflictSet.add(c.exam2.id);
        });
        setConflictIds(conflictSet);
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

  // Irregular: fetch all available subjects with sections
  const fetchAvailableSubjects = async () => {
    try {
      const res = await api.get("/student/available-subjects");
      setAvailableSubjects(res.data);
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
        const conflictSet = new Set();
        conflictsRes.data.forEach(c => {
          conflictSet.add(c.exam1.id);
          conflictSet.add(c.exam2.id);
        });
        setConflictIds(conflictSet);
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

  const addSubjectSelection = (subjectId, sectionId) => {
    // Check if this subject already has a section selected
    const alreadySelected = selectedSubjects.some(sel => sel.subject_id === subjectId);
    if (alreadySelected) {
      showWarning("You can only select one section per subject. Remove the existing selection first.");
      return;
    }
    setSelectedSubjects([...selectedSubjects, { subject_id: subjectId, section_id: sectionId }]);
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
        fetchAvailableSubjects();
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
        if (res.ok) setNotifications(res.data);
      } catch (err) { }
    };
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [user]);

  const markRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (err) { }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (!user) return <div className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gray-50"} flex items-center justify-center`}>Redirecting...</div>;

  // Filters for regular students
  const processedExams = user?.student_type === "regular" ? exams.filter(exam => {
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
  }) : exams;

  const grouped = processedExams.reduce((acc, ex) => {
    const key = ex.section_name || "Unknown Section";
    if (!acc[key]) acc[key] = [];
    acc[key].push(ex);
    return acc;
  }, {});

  const filtered = Object.entries(grouped);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className={`min-h-screen relative transition-colors duration-300 ${isDark ? "bg-slate-900" : "bg-slate-50"}`}>
      {showNotifications && <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm transition-opacity" onClick={() => setShowNotifications(false)}></div>}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 transition-opacity">
          <div className={`p-8 rounded-3xl max-w-md w-full shadow-2xl border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
            <h2 className={`text-2xl font-bold mb-6 text-center ${isDark ? "text-white" : "text-slate-900"}`}>Select Student Type</h2>
            <div className="flex gap-4 mb-6">
              <button onClick={() => setSelectedType("regular")} className={`flex-1 py-4 rounded-2xl font-bold transition-all duration-300 ${selectedType === "regular" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/40 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800 scale-105" : isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Regular</button>
              <button onClick={() => setSelectedType("irregular")} className={`flex-1 py-4 rounded-2xl font-bold transition-all duration-300 ${selectedType === "irregular" ? "bg-blue-600 text-white shadow-lg shadow-blue-500/40 ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800 scale-105" : isDark ? "bg-slate-700 text-slate-300 hover:bg-slate-600" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Irregular</button>
            </div>

            {selectedType === "irregular" && (
              <div className="mb-6 animate-fadeIn">
                <label className={`block text-sm font-semibold mb-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  What is your Course?
                </label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className={`w-full p-3 rounded-xl border outline-none font-medium transition-all ${
                    isDark
                      ? "bg-slate-700 border-slate-600 text-white focus:border-blue-500"
                      : "bg-slate-50 border-slate-200 text-slate-800 focus:border-blue-500 focus:bg-white"
                  }`}
                  required
                >
                  <option value="">-- Choose your course --</option>
                  {coursesList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.category})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button onClick={saveStudentType} disabled={!selectedType || (selectedType === "irregular" && !selectedCourseId)} className={`w-full py-4 rounded-2xl font-bold transition-all shadow-md ${(!selectedType || (selectedType === "irregular" && !selectedCourseId)) ? "opacity-50 cursor-not-allowed bg-slate-400 text-white" : "bg-emerald-600 hover:bg-emerald-500 text-white hover:shadow-lg hover:-translate-y-0.5"}`}>Confirm Selection</button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className={`sticky top-0 z-30 backdrop-blur-2xl border-b transition-all duration-300 ${isDark ? "bg-slate-900/80 border-slate-800" : "bg-white/80 border-slate-200"}`}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform hover:scale-105 ${isDark ? "bg-gradient-to-br from-blue-600 to-indigo-700" : "bg-gradient-to-br from-blue-500 to-blue-700"}`}>
                <img src="/images.png" alt="STI Logo" className="rounded-xl h-8 w-8 object-contain drop-shadow-md" />
              </div>
              <div>
                <h1 className={`text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>STI Education System</h1>
                <p className={`text-xs font-medium tracking-wide uppercase mt-0.5 ${isDark ? "text-blue-400" : "text-blue-600"}`}>Student Portal</p>
              </div>
            </div>
            
            <div className="flex-1 max-w-xl hidden md:block">
              {user?.student_type === "regular" && (
                <div className="relative group">
                  <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-500"}`} />
                  <input type="text" placeholder="Search exams..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className={`w-full pl-12 pr-5 py-3 rounded-2xl border outline-none transition-all text-sm shadow-sm ${isDark ? "bg-slate-800/50 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:bg-slate-800" : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"}`} />
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <div className={`hidden sm:block px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm ${isDark ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>STUDENT</div>
              <button onClick={() => setShowTypeModal(true)} className={`px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Change Type</button>
              
              <div className="relative">
                <button onClick={() => setShowNotifications(!showNotifications)} className={`relative p-2.5 rounded-xl transition-all duration-300 ${isDark ? "text-slate-300 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"}`}>
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900 animate-pulse"></span>}
                </button>
                {showNotifications && (
                  <div className={`absolute right-0 mt-3 w-80 max-h-96 flex flex-col rounded-2xl shadow-2xl border z-50 transform origin-top-right transition-all animate-in fade-in scale-95 duration-200 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
                    <div className={`px-5 py-4 border-b flex justify-between items-center ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                      <h3 className={`font-semibold ${isDark ? "text-white" : "text-slate-900"}`}>Notifications</h3>
                      {unreadCount > 0 && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">{unreadCount} New</span>}
                    </div>
                    <div className="overflow-y-auto p-2 custom-scrollbar flex-1">
                      {notifications.length === 0 ? <div className={`p-6 text-center text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}><Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />You're all caught up!</div> : notifications.map((notif) => (
                        <div key={notif.id} onClick={() => { if (!notif.is_read) markRead(notif.id); }} className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 mb-1 ${notif.is_read ? (isDark ? "hover:bg-slate-700/50 opacity-60" : "hover:bg-slate-50 opacity-60") : (isDark ? "bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/30" : "bg-blue-50 hover:bg-blue-100 border border-blue-100")}`}>
                          <div className="flex gap-3"><div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${notif.is_read ? "bg-slate-400" : "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"}`}></div><div><p className={`text-sm leading-snug ${isDark ? "text-slate-200" : "text-slate-800"}`}>{notif.message}</p><p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>{notif.created_at ? new Date(notif.created_at).toLocaleString() : "Just now"}</p></div></div>
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

      {/* Student Info Hero Section */}
      <div className="max-w-7xl mx-auto px-6 lg:px-8 py-8">
        <div className={`p-8 rounded-3xl shadow-sm border flex items-center gap-6 overflow-hidden relative ${isDark ? "bg-slate-800/50 border-slate-700/50" : "bg-white border-slate-200"}`}>
          <div className="absolute right-0 top-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
          <div className={`w-20 h-20 rounded-2xl flex shrink-0 items-center justify-center text-3xl font-bold shadow-inner ${isDark ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white" : "bg-gradient-to-br from-blue-50 to-indigo-100 text-blue-700 border border-blue-200"}`}>
            {(user?.name || "S").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
          </div>
          <div className="relative z-10">
            <h2 className={`text-3xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Welcome back, {user?.name || "Student"}</h2>
            <div className="flex flex-wrap items-center gap-4 mt-3">
              <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${isDark ? "bg-slate-700/50 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>Section: <strong className={isDark ? "text-white" : "text-slate-900"}>{user?.section_name || section || "N/A"}</strong></span>
              <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${isDark ? "bg-slate-700/50 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>Type: <strong className={`capitalize ${isDark ? "text-white" : "text-slate-900"}`}>{user?.student_type || "not set"}</strong></span>
              {user?.student_type === "irregular" && user?.course_id && (
                <span className={`px-3 py-1 rounded-lg text-sm font-medium border ${isDark ? "bg-slate-700/50 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                  Course: <strong className={isDark ? "text-white" : "text-slate-900"}>{coursesList.find(c => c.id === user.course_id)?.name || "Loaded"}</strong>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Irregular subject picker */}
      {user?.student_type === "irregular" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className={`p-5 rounded-xl shadow-sm border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
            <h3 className={`text-lg font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>Customize Your Exam Schedule</h3>
            <div className="flex gap-2 mb-4">
              <input type="text" placeholder="Search subject code or name" value={irregularSearchTerm} onChange={(e) => setIrregularSearchTerm(e.target.value)} className={`flex-1 p-2 rounded-lg border ${isDark ? "bg-gray-700 border-gray-600 text-white" : "bg-white border-gray-300"}`} />
            </div>
            <div className="max-h-64 overflow-y-auto mb-4 space-y-2">
              {availableSubjects.filter(s => s.name.toLowerCase().includes(irregularSearchTerm.toLowerCase()) || s.code.toLowerCase().includes(irregularSearchTerm.toLowerCase())).map(sub => (
                <div key={sub.id} className={`p-3 rounded-lg border ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                  <div className={`font-semibold ${isDark ? "text-gray-100" : "text-gray-900"}`}>{sub.code} - {sub.name}</div>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {sub.sections.map(sec => {
                      const isSubjectSelected = selectedSubjects.some(sel => sel.subject_id === sub.id);
                      return (
                        <button
                          key={sec.id}
                          onClick={() => addSubjectSelection(sub.id, sec.id)}
                          disabled={isSubjectSelected}
                          className={`px-2 py-1 text-xs rounded ${isSubjectSelected ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600 text-white'}`}
                        >
                          Add {sec.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {selectedSubjects.length > 0 && (
              <div className="mt-4">
                <h4 className={`font-semibold mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>Selected Subjects & Sections</h4>
                <ul className="space-y-1">
                  {selectedSubjects.map((sel, idx) => {
                    const sub = availableSubjects.find(s => s.id === sel.subject_id);
                    const sec = sub?.sections.find(s => s.id === sel.section_id);
                    return (
                      <li key={idx} className="flex justify-between items-center text-sm">
                        <span className={isDark ? "text-gray-200" : "text-gray-800"}>{sub?.code} - {sub?.name} ({sec?.name})</span>
                        <button onClick={() => removeSubjectSelection(idx)} className="text-red-500 text-xs">Remove</button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex gap-3 mt-3">
                  <button onClick={saveIrregularSelections} className="px-4 py-2 bg-green-600 text-white rounded-lg">
                    Save My Selections
                  </button>
                  <button onClick={fetchCustomExams} className="px-4 py-2 bg-blue-500 text-white rounded-lg">
                    Refresh Schedule
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Regular filters bar */}
      {user?.student_type === "regular" && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className={`p-4 rounded-xl shadow-sm border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2"><Calendar className={`w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-500"}`} /><span className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>Filters:</span></div>
              <select value={filterDay} onChange={(e) => setFilterDay(e.target.value)} className={`px-3 py-1.5 rounded-lg text-sm border ${isDark ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-300"}`}><option value="all">All Days</option><option>Monday</option><option>Tuesday</option><option>Wednesday</option><option>Thursday</option><option>Friday</option><option>Saturday</option></select>
              <select value={filterSession} onChange={(e) => setFilterSession(e.target.value)} className={`px-3 py-1.5 rounded-lg text-sm border ${isDark ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-300"}`}><option value="all">All Sessions</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option></select>
              <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className={`px-3 py-1.5 rounded-lg text-sm border ${isDark ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-300"}`}><option value="all">All Categories</option><option value="major">Major</option><option value="general">General</option></select>
              {(filterDay !== "all" || filterSession !== "all" || filterCategory !== "all") && <button onClick={() => { setFilterDay("all"); setFilterSession("all"); setFilterCategory("all"); }} className="text-sm text-blue-500 hover:underline ml-auto">Clear Filters</button>}
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Exam Schedule */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20"><div className="w-10 h-10 rounded-full border-4 border-t-blue-500 animate-spin"></div><p className="ml-3">Loading your schedule...</p></div>
        ) : filtered.length === 0 ? (
          <div className={`text-center py-20 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            <div className="max-w-md mx-auto"><div className={`w-20 h-20 mx-auto mb-6 rounded-2xl ${isDark ? "bg-gray-800" : "bg-white border border-gray-200"} flex items-center justify-center`}><BookOpen className={`w-10 h-10 ${isDark ? "text-gray-500" : "text-gray-400"}`} /></div><p className="text-xl font-medium mb-2">{exams.length === 0 ? "No Exams Posted" : "No Results Found"}</p><p className="text-sm leading-relaxed">{exams.length === 0 ? "Your program head hasn't posted any exams yet. Check back soon!" : "Try adjusting your search term."}</p></div>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(([sectionName, sectionExams]) => (
              <div key={sectionName} className={`rounded-lg overflow-hidden border shadow-sm ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
                <button onClick={() => setExpandedSection(expandedSection === sectionName ? null : sectionName)} className={`w-full px-6 py-4 flex items-center justify-between transition ${isDark ? "bg-gray-700/50 hover:bg-gray-700/70" : "bg-gray-50 hover:bg-gray-100"}`}>
                  <div className="flex items-center gap-4"><div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? "bg-blue-900/30 text-blue-300" : "bg-blue-50 text-blue-600"}`}><BookOpen className="w-5 h-5" /></div><div className="text-left"><h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{sectionName}</h2><p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{sectionExams.length} scheduled exam{sectionExams.length !== 1 ? "s" : ""}</p></div></div>
                  <ChevronRight className={`w-5 h-5 transition-transform ${expandedSection === sectionName ? "rotate-90 text-blue-500" : isDark ? "text-gray-500" : "text-gray-400"}`} />
                </button>
                {expandedSection === sectionName && (
                  <div className="animate-slideDown">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className={`${isDark ? "bg-gray-700/50 text-gray-300" : "bg-gray-100 text-gray-700"}`}><tr><th className="px-6 py-4 text-left font-semibold">Subject</th><th className="px-6 py-4 text-left font-semibold">Category</th><th className="px-6 py-4 text-left font-semibold">Schedule</th><th className="px-6 py-4 text-left font-semibold">Details</th><th className="px-6 py-4 text-left font-semibold">Proctor</th><th className="px-6 py-4 text-left font-semibold">Actions</th></tr></thead>
                        <tbody>
                          {sectionExams.map((exam) => {
                            const isConflicting = conflictIds.has(exam.id);
                            return (
                              <tr key={exam.id} className={`${isDark ? "hover:bg-gray-700/30" : "hover:bg-gray-50"} transition ${isConflicting ? (isDark ? "bg-red-900/20 border-l-4 border-red-500" : "bg-red-50 border-l-4 border-red-500") : ""}`}>
                                <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><div className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>{exam.subject_name}</div><div className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{exam.subject_code}</div>{isConflicting && <div className="text-xs text-red-500 font-bold mt-1">⚠ CONFLICT DETECTED</div>}</td>
                                <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><span className={`px-2 py-1 rounded-full text-xs font-medium ${exam.category === "major" ? (isDark ? "bg-purple-900/30 text-purple-300" : "bg-purple-100 text-purple-700") : (isDark ? "bg-blue-900/30 text-blue-300" : "bg-blue-100 text-blue-700")}`}>{exam.category ? exam.category.toUpperCase() : "-"}</span></td>
                                <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><div className={`flex items-center gap-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}><Calendar className="w-4 h-4 text-blue-500" />{formatDate(exam.exam_date)}</div><div className={`flex items-center gap-2 mt-1 text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}><Clock className="w-4 h-4 text-purple-500" />{exam.start_time} - {exam.end_time}</div></td>
                                <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><div className="flex items-center gap-2"><MapPin className={`w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-500"}`} /><span className={`px-2.5 py-0.5 rounded text-sm font-medium ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"}`}>{exam.room}</span></div><div className={`mt-1 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>{exam.course_name} • {exam.year_level}</div></td>
                                <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><div className={`flex items-center gap-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}><UserCheck className="w-4 h-4 text-emerald-500" /><span className="text-sm">{exam.proctor || "Unassigned"}</span></div></td>
                                <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}><div className="group relative"><button onClick={() => { if (!isConflicting) return; setSelectedExam(exam); setCourseCode(exam.subject_code); setCourseName(exam.subject_name); const parts = exam.exam_date.split(", "); const d = new Date(`${parts[1]}, ${parts[2]}`); setOriginalExamDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`); setOriginalStartTime(exam.start_time); setOriginalEndTime(exam.end_time); setExamType(exam.exam_type || "Midterm"); setIsModalOpen(true); }} disabled={!isConflicting} className={`px-3 py-1 rounded-lg text-sm font-medium transition ${isConflicting ? (isDark ? "bg-red-600 hover:bg-red-700 text-white" : "bg-red-500 hover:bg-red-600 text-white shadow-sm") : (isDark ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-gray-200 text-gray-400 cursor-not-allowed")}`}>Request Reschedule</button>{!isConflicting && <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">Rescheduling is only available if there is a conflict.</div>}</div></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* My Requests */}
        <div className={`mt-8 rounded-lg overflow-hidden border shadow-sm ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <div className={`px-6 py-4 border-b ${isDark ? "border-gray-700 bg-gray-700/50" : "border-gray-200 bg-gray-50"}`}><h3 className={`text-xl font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>My Rescheduling Requests</h3></div>
          <div className="p-6">{myRequests.length === 0 ? <p className={isDark ? "text-gray-400" : "text-gray-600"}>No rescheduling requests yet.</p> : <div className="space-y-4">{myRequests.map((req) => (<div key={req.id} className={`p-4 rounded-lg border ${isDark ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-300"}`}><div className="flex items-center justify-between"><div><p className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>Exam ID: {req.exam_id}</p><p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Requested Mode: {req.requested_mode}</p><p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Reason: {req.reason}</p></div><span className={`px-3 py-1 rounded-full text-sm font-medium ${req.status === "approved" ? "bg-green-100 text-green-800" : req.status === "rejected" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>{req.status}</span></div></div>))}</div>}</div>
        </div>

        {/* Reschedule Modal - FULL MODAL CODE */}
        {isModalOpen && selectedExam && (
          <div className="fixed inset-0 flex items-center justify-start bg-black/60 z-50">
            <div className={`w-full max-w-2xl max-h-screen overflow-y-auto p-6 rounded-none sm:rounded-r-2xl border-l shadow-2xl ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
              <div className="flex items-center justify-between mb-8 pb-4 border-b dark:border-gray-800">
                <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Request Exam Reschedule</h3>
                <button onClick={() => setIsModalOpen(false)} className={`p-2 rounded-lg transition ${isDark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={async (e) => {
                e.preventDefault();
                if (!acknowledged || !detailedExplanation.trim()) {
                  showWarning("Please acknowledge and provide detailed explanation");
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
                    preferred_date: preferredDate || null,
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
              }} className="space-y-6">
                {/* Student Information */}
                <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                  <h4 className={`font-medium mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>1. Student Information</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Student Name *</label><input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required /></div>
                    <div><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Student ID *</label><input type="text" value={studentId} onChange={(e) => setStudentId(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required /></div>
                    <div><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Program *</label><input type="text" value={program} onChange={(e) => setProgram(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required /></div>
                    <div><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Section *</label><input type="text" value={section} onChange={(e) => setSection(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required /></div>
                    <div className="md:col-span-2"><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>School Email *</label><input type="email" value={schoolEmail} onChange={(e) => setSchoolEmail(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required /></div>
                  </div>
                </div>

                {/* Exam Details */}
                <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                  <h4 className={`font-medium mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>2. Exam to Be Rescheduled</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Course Code / Course Name</label><input type="text" value={courseCode + " / " + courseName} readOnly className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} /></div>
                    <div><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Original Exam Date</label><input type="text" value={new Date(originalExamDate).toLocaleDateString()} readOnly className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} /></div>
                    <div><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Original Exam Time</label><input type="text" value={originalStartTime + " - " + originalEndTime} readOnly className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} /></div>
                  </div>
                </div>

                {/* Reason */}
                <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                  <h4 className={`font-medium mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>3. Reason for Rescheduling</h4>
                  <div className="space-y-4">
                    <div><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Reason for Request *</label><select value={reasonType} onChange={(e) => setReasonType(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required><option value="">Select a reason</option><option value="exam conflict">Exam schedule conflict</option><option value="medical">Medical reason</option><option value="emergency">Emergency</option><option value="other">Other</option></select></div>
                    <div><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Detailed Explanation *</label><textarea value={detailedExplanation} onChange={(e) => setDetailedExplanation(e.target.value)} rows={4} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required /></div>
                  </div>
                </div>

                {/* Preferred Reschedule */}
                <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                  <h4 className={`font-medium mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>4. Preferred Reschedule Details</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Preferred New Exam Date</label><input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} /></div>
                    <div><label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Preferred New Exam Time</label><div className="flex gap-2"><input type="time" value={preferredStartTime} onChange={(e) => setPreferredStartTime(e.target.value)} className={`flex-1 p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} /><input type="time" value={preferredEndTime} onChange={(e) => setPreferredEndTime(e.target.value)} className={`flex-1 p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} /></div></div>
                  </div>
                </div>

                {/* Acknowledgement */}
                <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                  <h4 className={`font-medium mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>5. Student Confirmation</h4>
                  <div className="flex items-start gap-2"><input type="checkbox" id="acknowledge" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1" /><label htmlFor="acknowledge" className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>I confirm that the information provided is accurate and subject to approval. *</label></div>
                </div>

                <div className="flex justify-end gap-4">
                  <button type="button" onClick={() => setIsModalOpen(false)} className={`px-4 py-2 rounded-lg ${isDark ? "bg-gray-600 text-white hover:bg-gray-500" : "bg-gray-300 text-gray-900 hover:bg-gray-400"}`}>Cancel</button>
                  <button type="submit" disabled={loadingRequest || !acknowledged || !detailedExplanation.trim()} className={`px-6 py-2 rounded-lg font-medium transition ${loadingRequest ? "bg-gray-400 cursor-not-allowed" : isDark ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"}`}>{loadingRequest ? "Submitting..." : "Submit Request"}</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}