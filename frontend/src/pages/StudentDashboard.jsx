import React, { useEffect, useState } from "react";
import { Search, LogOut, Calendar, Clock, MapPin, BookOpen, ChevronRight, Bell, UserCheck, Edit, X, Send } from "lucide-react";
import { useTheme } from "../context/themeStore";
import ThemeToggle from "../components/ThemeToggle";
import { useUser } from "../context/userStore";
import { useNavigate } from "react-router-dom";

function formatDate(dateStr) {
  if (!dateStr) return "";
  const parts = dateStr.split(", ");
  // Parse "Month Day, Year" (parts[1], parts[2])
  const date = new Date(`${parts[1]}, ${parts[2]}`);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

import api from "../api";

// ... existing imports

export default function StudentDashboard() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSection, setExpandedSection] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState(null);

  // Conflict IDs
  const [conflictIds, setConflictIds] = useState(new Set());

  // ... form states (keep existing)
  const [studentName, setStudentName] = useState(user?.name || "");
  const [studentId, setStudentId] = useState(user?.student_id || "");
  const [program, setProgram] = useState(user?.program || "");
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

  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Filters (keep existing)
  const [filterDay, setFilterDay] = useState("all");
  const [filterSession, setFilterSession] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    // We rely on user being logged in (token in api interceptor)
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch Exams
        const examsRes = await api.get("/student/exams");
        setExams(examsRes.data);

        // 2. Fetch Conflicts
        try {
          const conflictsRes = await api.get("/student/conflicts");
          const conflictSet = new Set();
          conflictsRes.data.forEach(c => {
            conflictSet.add(c.exam1.id);
            conflictSet.add(c.exam2.id);
          });
          setConflictIds(conflictSet);
        } catch (e) {
          console.error("Error fetching conflicts", e);
        }

        // 3. Fetch My Requests
        try {
          const requestsRes = await api.get("/student/requests");
          setMyRequests(requestsRes.data);
        } catch (e) {
          console.error("Error fetching requests", e);
        }

        // 4. Notifications (optional, might fail if endpoint not updated)
        if (user.section) {
          // api.get(...)
        }

      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [user]);

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (!user) return <div className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gray-50"} flex items-center justify-center`}>
    <p className={isDark ? "text-gray-400" : "text-gray-600"}>Redirecting to login...</p>
  </div>;

  if (loading) return <div className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gray-50"} flex items-center justify-center`}>
    <div className="flex items-center gap-3">
      <div className={`w-10 h-10 rounded-full border-4 ${isDark ? "border-gray-700" : "border-gray-200"} border-t-blue-500 animate-spin`}></div>
      <p className={isDark ? "text-gray-300" : "text-gray-600"}>Loading your schedule...</p>
    </div>
  </div>;

  // Process exams: Filter by written, search, and dropdowns
  const processedExams = exams.filter(exam => {
    // 1. Only Written Exams
    if (exam.exam_type?.toLowerCase() !== "written") return false;

    // 2. Search Term
    if (searchTerm && !exam.subject_name.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !exam.subject_code.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }

    // 3. Dropdown Filters
    if (filterDay !== "all" && !exam.exam_date.includes(filterDay)) return false;
    if (filterCategory !== "all" && exam.category?.toLowerCase() !== filterCategory.toLowerCase()) return false;
    if (filterSession !== "all") {
      const isMorning = exam.start_time.includes("AM");
      if (filterSession === "morning" && !isMorning) return false;
      if (filterSession === "afternoon" && isMorning) return false;
    }

    return true;
  });

  // const conflicts = detectConflicts(exams); 
  const conflicts = conflictIds; // Use backend reported conflicts

  const grouped = processedExams.reduce((acc, ex) => {
    const key = ex.section_name || "Unknown Section";
    if (!acc[key]) acc[key] = [];
    acc[key].push(ex);
    return acc;
  }, {});

  const filtered = Object.entries(grouped);

  return (
    <div className={`min-h-screen relative ${isDark ? "bg-gray-900" : "bg-gray-50"}`}>
      {/* Background - Clean solid color handled by parent class */}

      {showNotifications && (
        <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowNotifications(false)}></div>
      )}

      {/* Header */}
      <header className={`sticky top-0 z-50 border-b ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between gap-4">
            {/* Logo + Brand */}
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? "bg-blue-600" : "bg-blue-700"}`}>
                <img src="/images.png" alt="STI Logo" className="rounded-lg h-8 w-8 object-contain" />
              </div>
              <div>
                <h1 className={`text-lg font-bold ${isDark ? "text-white" : "text-gray-900"}`}>STI Education System</h1>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Student Portal</p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex-1 max-w-md hidden md:block">
              <div className="relative group">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition ${isDark ? "text-gray-500 group-focus-within:text-blue-400" : "text-gray-400 group-focus-within:text-blue-500"}`} />
                <input
                  type="text"
                  placeholder="Search exams..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl border outline-none transition text-sm ${isDark ? "bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500" : "bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-blue-500"}`}
                />
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-3">
              <div
                className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${isDark
                  ? "bg-emerald-600 text-white shadow-[0_0_15px_rgba(5,150,105,0.3)]"
                  : "bg-emerald-600 text-white shadow-md"
                  }`}
              >
                STUDENT
              </div>
              <ThemeToggle />

              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={`relative p-2 rounded-xl transition ${isDark ? "text-gray-400 hover:text-gray-100 hover:bg-gray-700" : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"}`}
                >
                  <Bell className="w-5 h-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                      {unreadCount}
                    </span>
                  )}
                </button>

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
                            }}
                            className={`p-3 rounded-lg cursor-pointer transition ${notif.is_read ? (isDark ? "hover:bg-gray-700/50 opacity-70" : "hover:bg-gray-50 opacity-70") : (isDark ? "bg-blue-900/20 hover:bg-blue-900/30 border border-blue-800/50" : "bg-blue-50 hover:bg-blue-100 border border-blue-100")}`}
                          >
                            <div className="flex gap-3">
                              <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${notif.is_read ? "bg-gray-400" : notif.type === 'error' ? "bg-red-500" : "bg-green-500"}`}></div>
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
                className={`flex items-center gap-2 px-3 py-2 rounded-xl transition group ${isDark ? "bg-gray-700 text-gray-200 hover:bg-red-900/20 hover:text-red-300" : "bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-700"}`}
              >
                <LogOut className="w-5 h-5 transition-transform group-hover:scale-110" />
                <span className="text-sm font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Student Info Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
        <div className={`p-5 rounded-xl shadow-sm border flex items-center gap-4 ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${isDark ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-700"}`}>
            {(user?.name || "S").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
          </div>
          <div>
            <h2 className={`text-lg font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>{user?.name || "Student"}</h2>
            <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>Section: <span className="font-medium">{user?.section_name || section || "N/A"}</span></p>
          </div>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className={`p-4 rounded-xl shadow-sm border ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Calendar className={`w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-500"}`} />
              <span className={`text-sm font-medium ${isDark ? "text-gray-300" : "text-gray-700"}`}>Filters:</span>
            </div>

            <select
              value={filterDay}
              onChange={(e) => setFilterDay(e.target.value)}
              className={`px-3 py-1.5 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-300 text-gray-900"}`}
            >
              <option value="all">All Days</option>
              <option value="Monday">Monday</option>
              <option value="Tuesday">Tuesday</option>
              <option value="Wednesday">Wednesday</option>
              <option value="Thursday">Thursday</option>
              <option value="Friday">Friday</option>
              <option value="Saturday">Saturday</option>
            </select>

            <select
              value={filterSession}
              onChange={(e) => setFilterSession(e.target.value)}
              className={`px-3 py-1.5 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-300 text-gray-900"}`}
            >
              <option value="all">All Sessions</option>
              <option value="morning">Morning</option>
              <option value="afternoon">Afternoon</option>
            </select>

            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className={`px-3 py-1.5 rounded-lg text-sm border outline-none focus:ring-2 focus:ring-blue-500 ${isDark ? "bg-gray-700 border-gray-600 text-white" : "bg-gray-50 border-gray-300 text-gray-900"}`}
            >
              <option value="all">All Categories</option>
              <option value="major">Major</option>
              <option value="general">General</option>
            </select>

            {(filterDay !== "all" || filterSession !== "all" || filterCategory !== "all") && (
              <button
                onClick={() => {
                  setFilterDay("all");
                  setFilterSession("all");
                  setFilterCategory("all");
                }}
                className="text-sm text-blue-500 hover:underline ml-auto"
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - ONLY Exam Schedule */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {
          filtered.length === 0 ? (
            <div className={`text-center py-20 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              <div className="max-w-md mx-auto">
                <div className={`w-20 h-20 mx-auto mb-6 rounded-2xl ${isDark ? "bg-gray-800" : "bg-white border border-gray-200"} flex items-center justify-center`}>
                  <BookOpen className={`w-10 h-10 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                </div>
                <p className="text-xl font-medium mb-2">
                  {exams.length === 0 ? "No Exams Posted" : "No Results Found"}
                </p>
                <p className="text-sm leading-relaxed">
                  {exams.length === 0
                    ? "Your program head hasn't posted any exams yet. Check back soon or contact your program head!"
                    : "Try adjusting your search term to find what you're looking for."}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map(([sectionName, sectionExams]) => (
                <div key={sectionName} className={`rounded-lg overflow-hidden border shadow-sm ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
                  }`}>
                  <button
                    onClick={() => setExpandedSection(expandedSection === sectionName ? null : sectionName)}
                    className={`w-full px-6 py-4 flex items-center justify-between transition ${isDark ? "bg-gray-700/50 hover:bg-gray-700/70" : "bg-gray-50 hover:bg-gray-100"
                      }`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isDark ? "bg-blue-900/30 text-blue-300" : "bg-blue-50 text-blue-600"
                        }`}>
                        <BookOpen className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <h2 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{sectionName}</h2>
                        <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                          {sectionExams.length} scheduled exam{sectionExams.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className={`w-5 h-5 transition-transform ${expandedSection === sectionName ? "rotate-90 text-blue-500" : isDark ? "text-gray-500" : "text-gray-400"
                      }`} />
                  </button>

                  {expandedSection === sectionName && (
                    <div className="animate-slideDown">
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className={`${isDark ? "bg-gray-700/50 text-gray-300" : "bg-gray-100 text-gray-700"}`}>
                            <tr>
                              <th className="px-6 py-4 text-left font-semibold">Subject</th>
                              <th className="px-6 py-4 text-left font-semibold">Category</th>
                              <th className="px-6 py-4 text-left font-semibold">Schedule</th>
                              <th className="px-6 py-4 text-left font-semibold">Details</th>
                              <th className="px-6 py-4 text-left font-semibold">Proctor</th>
                              <th className="px-6 py-4 text-left font-semibold">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sectionExams
                              .sort((a, b) => {
                                const parseParams = (d) => d.split(", ").slice(1).join(", ");
                                return new Date(parseParams(a.exam_date)) - new Date(parseParams(b.exam_date));
                              })
                              .map((exam) => {
                                const isConflicting = conflicts.has(exam.id);
                                return (
                                  <tr key={exam.id} className={`${isDark ? "hover:bg-gray-700/30" : "hover:bg-gray-50"} transition ${isConflicting ? (isDark ? "bg-red-900/20 border-l-4 border-red-500" : "bg-red-50 border-l-4 border-red-500") : ""}`}>
                                    <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                      <div className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>{exam.subject_name}</div>
                                      <div className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>{exam.subject_code}</div>
                                      {isConflicting && <div className="text-xs text-red-500 font-bold mt-1">⚠ CONFLICT DETECTED</div>}
                                    </td>
                                    <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${exam.category === "major"
                                        ? (isDark ? "bg-purple-900/30 text-purple-300" : "bg-purple-100 text-purple-700")
                                        : (isDark ? "bg-blue-900/30 text-blue-300" : "bg-blue-100 text-blue-700")
                                        }`}>
                                        {exam.category ? exam.category.toUpperCase() : "-"}
                                      </span>
                                    </td>
                                    <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                      <div className={`flex items-center gap-2 ${isDark ? "text-gray-200" : "text-gray-800"}`}>
                                        <Calendar className="w-4 h-4 text-blue-500" />
                                        {formatDate(exam.exam_date)}
                                      </div>
                                      <div className={`flex items-center gap-2 mt-1 text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                        <Clock className="w-4 h-4 text-purple-500" />
                                        {exam.start_time} - {exam.end_time}
                                      </div>
                                    </td>
                                    <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                      <div className="flex items-center gap-2">
                                        <MapPin className={`w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-500"}`} />
                                        <span className={`px-2.5 py-0.5 rounded text-sm font-medium ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"
                                          }`}>
                                          {exam.room}
                                        </span>
                                      </div>
                                      <div className={`mt-1 text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                                        {exam.course_name} • {exam.year_level}
                                      </div>
                                    </td>
                                    <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                      <div className={`flex items-center gap-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                                        <UserCheck className="w-4 h-4 text-emerald-500" />
                                        <span className="text-sm">{exam.proctor || "Unassigned"}</span>
                                      </div>
                                    </td>
                                    <td className={`px-6 py-4 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
                                      <div className="group relative">
                                        <button
                                          onClick={() => {
                                            if (!isConflicting) return;
                                            setSelectedExam(exam);
                                            // Populate form
                                            setCourseCode(exam.subject_code);
                                            setCourseName(exam.subject_name);
                                            const parts = exam.exam_date.split(", ");
                                            const d = new Date(`${parts[1]}, ${parts[2]}`);
                                            setOriginalExamDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
                                            setOriginalStartTime(exam.start_time);
                                            setOriginalEndTime(exam.end_time);
                                            setExamType(exam.exam_type || "Midterm");
                                            setIsModalOpen(true);
                                          }}
                                          disabled={!isConflicting}
                                          className={`px-3 py-1 rounded-lg text-sm font-medium transition ${isConflicting
                                            ? (isDark ? "bg-red-600 hover:bg-red-700 text-white" : "bg-red-500 hover:bg-red-600 text-white shadow-sm")
                                            : (isDark ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-gray-200 text-gray-400 cursor-not-allowed")
                                            }`}
                                        >
                                          Request Reschedule
                                        </button>
                                        {!isConflicting && (
                                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition pointer-events-none z-10">
                                            Rescheduling is only available if there is a conflict.
                                          </div>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )
        }

        {/* My Requests */}
        <div className={`mt-8 rounded-lg overflow-hidden border shadow-sm ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"}`}>
          <div className={`px-6 py-4 border-b ${isDark ? "border-gray-700 bg-gray-700/50" : "border-gray-200 bg-gray-50"}`}>
            <h3 className={`text-xl font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>My Rescheduling Requests</h3>
          </div>
          <div className="p-6">
            {myRequests.length === 0 ? (
              <p className={isDark ? "text-gray-400" : "text-gray-600"}>No rescheduling requests yet.</p>
            ) : (
              <div className="space-y-4">
                {myRequests.map((req) => (
                  <div key={req.id} className={`p-4 rounded-lg border ${isDark ? "bg-gray-700 border-gray-600" : "bg-gray-50 border-gray-300"}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>Exam ID: {req.exam_id}</p>
                        <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Requested Mode: {req.requested_mode}</p>
                        <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>Reason: {req.reason}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${req.status === "approved" ? "bg-green-100 text-green-800" : req.status === "rejected" ? "bg-red-100 text-red-800" : "bg-yellow-100 text-yellow-800"}`}>
                        {req.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reschedule Modal */}
        {
          isModalOpen && selectedExam && (
            <div className="fixed inset-0 flex items-center justify-start bg-black/60 z-50">
              <div className={`w-full max-w-2xl max-h-screen overflow-y-auto p-6 rounded-none sm:rounded-r-2xl border-l shadow-2xl ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
                <div className="flex items-center justify-between mb-8 pb-4 border-b dark:border-gray-800">
                  <h3 className={`text-xl font-bold ${isDark ? "text-white" : "text-gray-900"}`}>Request Exam Reschedule</h3>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className={`p-2 rounded-lg transition ${isDark ? "hover:bg-gray-800 text-gray-400" : "hover:bg-gray-100 text-gray-500"}`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={async (e) => {
                  e.preventDefault();
                  console.log("Submitting request..."); // Debug log
                  if (!acknowledged || !detailedExplanation.trim()) {
                    showWarning("Please acknowledge and provide detailed explanation");
                    return;
                  }
                  setLoadingRequest(true);
                  try {
                    const formData = new FormData();
                    if (supportingFile) formData.append("supporting_file", supportingFile);

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
                      exam_type: "Midterm", // Hardcoded default
                      reason_type: reasonType,
                      detailed_explanation: detailedExplanation,
                      supporting_file: null, // will handle separately
                      requested_mode: "offline", // Hardcoded as per request
                      preferred_date: preferredDate || null,
                      preferred_start_time: preferredStartTime || null,
                      preferred_end_time: preferredEndTime || null,
                      acknowledged: acknowledged,
                    };

                    const res = await api.post("/student/reschedule-request", requestData);
                    if (res.status === 200 || res.status === 201) {
                      showSuccess("Request submitted successfully!");
                      setIsModalOpen(false);
                      // Refresh requests
                      const requestsRes = await api.get("/student/requests");
                      setMyRequests(requestsRes.data);
                    } else {
                      // ... error
                    }
                  } catch (err) {
                    console.error("Submission error:", err);
                    showError(err.response?.data?.detail || "Error submitting request");
                  }
                  setLoadingRequest(false);
                }} className="space-y-6">

                  {/* 1. Student Information */}
                  <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                    <h4 className={`font-medium mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>1. Student Information</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Student Name *</label>
                        <input type="text" value={studentName} onChange={(e) => setStudentName(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required />
                      </div>
                      <div>
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Student ID *</label>
                        <input type="text" value={studentId} onChange={(e) => setStudentId(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required />
                      </div>
                      <div>
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Program *</label>
                        <input type="text" value={program} onChange={(e) => setProgram(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required />
                      </div>
                      <div>
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Section *</label>
                        <input type="text" value={section} onChange={(e) => setSection(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required />
                      </div>
                      <div className="md:col-span-2">
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>School Email *</label>
                        <input type="email" value={schoolEmail} onChange={(e) => setSchoolEmail(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required />
                      </div>
                    </div>
                  </div>

                  {/* 2. Exam to Be Rescheduled */}
                  <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                    <h4 className={`font-medium mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>2. Exam to Be Rescheduled</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Course Code / Course Name</label>
                        <input type="text" value={courseCode + " / " + courseName} readOnly className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} />
                      </div>
                      <div>
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Original Exam Date</label>
                        <input type="text" value={new Date(originalExamDate).toLocaleDateString()} readOnly className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} />
                      </div>
                      <div>
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Original Exam Time</label>
                        <input type="text" value={originalStartTime + " - " + originalEndTime} readOnly className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} />
                      </div>
                    </div>
                  </div>

                  {/* 3. Reason for Rescheduling */}
                  <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                    <h4 className={`font-medium mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>3. Reason for Rescheduling</h4>
                    <div className="space-y-4">
                      <div>
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Reason for Request *</label>
                        <select value={reasonType} onChange={(e) => setReasonType(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`}>
                          <option value="">Select a reason</option>
                          <option value="exam conflict">Exam schedule conflict</option>
                          <option value="medical">Medical reason</option>
                          <option value="emergency">Emergency</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Detailed Explanation *</label>
                        <textarea value={detailedExplanation} onChange={(e) => setDetailedExplanation(e.target.value)} rows={4} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} required />
                      </div>
                    </div>
                  </div>

                  {/* 4. Supporting Documents */}
                  <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                    <h4 className={`font-medium mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>4. Supporting Documents (Optional)</h4>
                    <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Upload Supporting File</label>
                    <input type="file" accept="image/*,application/pdf" onChange={(e) => setSupportingFile(e.target.files[0])} className={`${isDark ? "text-white" : "text-gray-900"}`} />
                  </div>

                  {/* 5. Preferred Reschedule Details */}
                  <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                    <h4 className={`font-medium mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>5. Preferred Reschedule Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Preferred New Exam Date</label>
                        <input type="date" value={preferredDate} onChange={(e) => setPreferredDate(e.target.value)} className={`w-full p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} />
                      </div>
                      <div>
                        <label className={`block text-sm mb-1 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Preferred New Exam Time</label>
                        <div className="flex gap-2">
                          <input type="time" value={preferredStartTime} onChange={(e) => setPreferredStartTime(e.target.value)} className={`flex-1 p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} />
                          <input type="time" value={preferredEndTime} onChange={(e) => setPreferredEndTime(e.target.value)} className={`flex-1 p-2 rounded-lg border ${isDark ? "bg-gray-600 text-white border-gray-500" : "bg-white text-gray-900 border-gray-300"}`} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 7. Student Confirmation */}
                  <div className={`p-4 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-50"}`}>
                    <h4 className={`font-medium mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>7. Student Confirmation</h4>
                    <div className="flex items-start gap-2">
                      <input type="checkbox" id="acknowledge" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-1" />
                      <label htmlFor="acknowledge" className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        I confirm that the information provided is accurate and subject to approval. *
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-4">
                    <button type="button" onClick={() => setIsModalOpen(false)} className={`px-4 py-2 rounded-lg ${isDark ? "bg-gray-600 text-white hover:bg-gray-500" : "bg-gray-300 text-gray-900 hover:bg-gray-400"}`}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loadingRequest || !acknowledged || !detailedExplanation.trim()}
                      className={`px-6 py-2 rounded-lg font-medium transition ${loadingRequest ? "bg-gray-400 cursor-not-allowed" : isDark ? "bg-blue-600 hover:bg-blue-700 text-white" : "bg-blue-500 hover:bg-blue-600 text-white"}`}
                    >
                      {loadingRequest ? "Submitting..." : "Submit Request"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )
        }
      </div >
    </div >
  );
}
