import React, { useEffect, useState } from "react";
import { CalendarDays, FileText, Loader2, BookOpen, Sparkles } from "lucide-react";
import { useTheme } from "../context/themeStore";
import api from "../api";
import { useToast } from "../context/ToastContext";

export default function ExamScheduler() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [courses, setCourses] = useState([]);
  const [years, setYears] = useState([]);
  const [selectedDept, setSelectedDept] = useState(""); // "" (None), "College", or "SHS"
  const [courseId, setCourseId] = useState("");
  const [yearId, setYearId] = useState("");
  const [semester, setSemester] = useState(1);
  const [details, setDetails] = useState({ sections: [] });
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { showSuccess, showError, showWarning } = useToast();
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    message: "",
    onConfirm: null
  });

  // Fetch courses and year levels
  useEffect(() => {
    const fetchOptions = async () => {
      try {
        console.log("Fetching courses...");
        const courseRes = await api.get("/catalog/courses");
        const yearRes = await api.get("/catalog/year-levels");

        setCourses(courseRes.data);
        setYears(yearRes.data);
      } catch (err) {
        console.error("Error loading options:", err);
        showError("Failed to connect to backend API");
      }
    };
    fetchOptions();
  }, []);

  // Fetch section & subject details
  useEffect(() => {
    const loadDetails = async () => {
      if (!courseId || !yearId) return;
      try {
        const res = await api.get(
          `/catalog/details?course_id=${courseId}&year_level_id=${yearId}&semester=${semester}`
        );
        setDetails(res.data);
      } catch (err) {
        console.error("Error loading details:", err);
      }
    };
    loadDetails();
  }, [courseId, yearId, semester]);

  const filteredCourses = courses.filter(c => c.category === selectedDept);
  const filteredYears = years.filter(y => 
    selectedDept === "SHS" ? y.name.includes("Grade") : !y.name.includes("Grade")
  );

  // Reset subordinate filters when dept changes
  useEffect(() => {
    setCourseId("");
    setYearId("");
  }, [selectedDept]);

  // Actual execution of generation
  const executeGeneration = async () => {
    setLoading(true);
    try {
      const res = await api.post("/exams/generate", {
        start_date: startDate,
        end_date: endDate,
      });

      const data = res.data;
      showSuccess(data.message || "Schedule Generated! View it in the Generated Schedules tab.");
    } catch (err) {
      console.error(err);
      showError("Error generating schedule");
    }
    setLoading(false);
  };

  // Generate exam schedule with confirmation
  const generate = async () => {
    if (!startDate || !endDate) {
      showError("Please select both start and end dates.");
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays < 1) {
      showError("End date must be after start date.");
      return;
    }

    let msg = "";
    if (diffDays < 3 || diffDays > 5) {
      msg = `The selected range is ${diffDays} days (recommended is 4). Do you want to proceed? This will regenerate the schedule for ALL courses based on distribution rules.`;
    } else if (diffDays !== 4) {
      msg = `The selected range is ${diffDays} days (exactly 4 is recommended). Proceed? This will regenerate the schedule for ALL courses.`;
    } else {
      msg = "This will regenerate the schedule for ALL courses based on distribution rules. Continue?";
    }

    setConfirmModal({
      isOpen: true,
      message: msg,
      onConfirm: () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        executeGeneration();
      }
    });
  };

  return (
    <div className={`min-h-screen ${isDark ? "bg-gray-900" : "bg-gray-50"} rounded-2xl`}>
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-8">
          <div className="flex items-center gap-3">
            <CalendarDays className="text-blue-500 w-8 h-8" />
            <h1 className={`text-3xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
              Exam Scheduler
            </h1>
          </div>
        </div>

        {/* Filters Card */}
        <div
          className={`rounded-xl p-6 border mb-10 ${isDark ? "bg-gray-700 border-gray-700" : "bg-white border-gray-200"
            } shadow-sm`}
        >
          <h2
            className={`text-xl font-semibold ${isDark ? "text-gray-300" : "text-gray-700"
              } mb-4 flex items-center gap-2`}
          >
            <FileText className="w-5 h-5 text-blue-500" /> Schedule Filters
          </h2>

          {/* Step 1: Select Department */}
          <div className="mb-8 p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/20">
            <label className={`block text-sm font-semibold mb-4 ${isDark ? "text-blue-300" : "text-blue-700"}`}>
              1. Choose Academic Level
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => setSelectedDept("College")}
                className={`flex-1 max-w-[220px] py-4 px-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center gap-2 ${selectedDept === "College"
                  ? "border-blue-500 bg-blue-500 text-white shadow-xl shadow-blue-500/30 scale-[1.02]"
                  : isDark
                    ? "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600 hover:bg-gray-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:text-blue-600"
                  }`}
              >
                <div className={`w-8 h-8 ${selectedDept === "College" ? "text-white" : "text-blue-500"}`} />
                <span className="font-bold text-lg">College</span>
              </button>
              <button
                onClick={() => setSelectedDept("SHS")}
                className={`flex-1 max-w-[220px] py-4 px-6 rounded-2xl border-2 transition-all duration-300 flex flex-col items-center gap-2 ${selectedDept === "SHS"
                  ? "border-blue-500 bg-blue-500 text-white shadow-xl shadow-blue-500/30 scale-[1.02]"
                  : isDark
                    ? "border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-600 hover:bg-gray-700"
                    : "border-gray-200 bg-white text-gray-500 hover:border-blue-200 hover:text-blue-600"
                  }`}
              >
                <div className={`w-8 h-8 ${selectedDept === "SHS" ? "text-white" : "text-blue-500"}`} />
                <span className="font-bold text-lg">Senior High</span>
              </button>
            </div>
          </div>

          {/* Step 2: Sequential Filters */}
          {selectedDept ? (
            <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <label className={`block text-sm font-semibold mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  2. Select {selectedDept === "SHS" ? "Strand & Grade" : "Course & Year"}
                </label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Select Course / Strand */}
                  <div className="space-y-2">
                    <label className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      {selectedDept === "SHS" ? "Strand" : "Course"}
                    </label>
                    <select
                      value={courseId}
                      onChange={(e) => setCourseId(Number(e.target.value))}
                      className={`border rounded-xl cursor-pointer p-3 w-full focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                        ? "bg-gray-800 text-gray-200 border-gray-700"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                        }`}
                    >
                      <option value="">{selectedDept === "SHS" ? "Choose a strand" : "Choose a course"}</option>
                      {filteredCourses.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Select Year / Grade */}
                  <div className="space-y-2">
                    <label className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      {selectedDept === "SHS" ? "Grade" : "Year Level"}
                    </label>
                    <select
                      value={yearId}
                      onChange={(e) => setYearId(Number(e.target.value))}
                      className={`border rounded-xl p-3 w-full cursor-pointer focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                        ? "bg-gray-800 text-gray-200 border-gray-700"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                        }`}
                    >
                      <option value="">{selectedDept === "SHS" ? "Choose a grade" : "Choose a year"}</option>
                      {filteredYears.map((y) => (
                        <option key={y.id} value={y.id}>
                          {y.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Select Semester */}
                  <div className="space-y-2">
                    <label className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      Semester
                    </label>
                    <select
                      value={semester}
                      onChange={(e) => setSemester(Number(e.target.value))}
                      className={`border rounded-xl p-3 w-full cursor-pointer focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                        ? "bg-gray-800 text-gray-200 border-gray-700"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                        }`}
                    >
                      <option value={1}>1st Semester</option>
                      <option value={2}>2nd Semester</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Exam Range */}
              <div className="pt-4 border-t border-gray-100 dark:border-gray-800">
                <label className={`block text-sm font-semibold mb-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                  3. Set Examination Period
                </label>
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 space-y-2">
                    <label className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => {
                        setStartDate(e.target.value);
                        if (e.target.value && !endDate) {
                          const d = new Date(e.target.value);
                          d.setDate(d.getDate() + 3);
                          setEndDate(d.toISOString().split('T')[0]);
                        }
                      }}
                      className={`rounded-xl p-3 w-full focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                        ? "bg-gray-800 text-gray-200 border-gray-700"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                        }`}
                    />
                  </div>
                  <div className="flex-1 space-y-2">
                    <label className={`block text-xs font-medium uppercase tracking-wider ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                      End Date
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className={`rounded-xl p-3 w-full focus:ring-2 focus:ring-blue-400 transition-all ${isDark
                        ? "bg-gray-800 text-gray-200 border-gray-700"
                        : "bg-gray-50 text-gray-700 border-gray-200"
                        }`}
                    />
                  </div>
                </div>
                <p className={`mt-3 text-xs ${isDark ? "text-gray-500" : "text-gray-400"} italic`}>
                  Recommended: Select a 4-day range. Weekends are automatically skipped.
                </p>
              </div>

              <div className="pt-6">
                <button
                  onClick={generate}
                  disabled={loading}
                  className={`flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-white font-bold text-lg transition-all shadow-xl ${loading
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 hover:shadow-blue-500/20 active:scale-95"
                    }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-6 h-6 animate-spin" /> Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-6 h-6" />
                      Generate Exam Schedule
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className={`p-10 text-center rounded-2xl border-2 border-dashed ${isDark ? "border-gray-800 bg-gray-800/20 text-gray-500" : "border-gray-100 bg-gray-50/50 text-gray-400"}`}>
              <Sparkles className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-medium">Ready to create a schedule?</p>
              <p className="text-sm mt-1">Select an academic level above to begin configuring the filters.</p>
            </div>
          )}
        </div>

        {/* Sections & Subjects */}
        {details.sections.length > 0 && (
          <div
            className={`rounded-xl p-6 mb-10 ${isDark ? "bg-gray-700 border border-gray-700" : "bg-white border border-gray-200"
              } shadow-sm`}
          >
            <h2
              className={`text-xl font-semibold ${isDark ? "text-gray-300" : "text-gray-800"
                } mb-4 flex items-center gap-2`}
            >
              <BookOpen className="w-5 h-5 text-blue-500" /> Sections & Subjects
            </h2>

            <div className="space-y-6">
              {details.sections.map((section) => (
                <div
                  key={section.id}
                  className={`border rounded-lg p-4 hover:shadow-sm transition ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"
                    }`}
                >
                  <h3
                    className={`text-lg font-medium mb-3 ${isDark ? "text-blue-400" : "text-blue-700"
                      }`}
                  >
                    {section.name}
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-separate border-spacing-0">
                      <thead
                        className={`${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-700"
                          }`}
                      >
                        <tr>
                          <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">
                            Subject Code
                          </th>
                          <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">
                            Subject
                          </th>
                          <th className="border border-gray-300 dark:border-gray-600 px-3 py-2 text-left">
                            Instructor
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.subjects.length > 0 ? (
                          section.subjects.map((s) => (
                            <tr
                              key={s.id}
                              className="hover:bg-gray-50 dark:hover:bg-gray-600 transition"
                            >
                              <td className={`${isDark ? "text-gray-200 hover:text-gray-300" : "text-gray-900 hover:text-gray-800"} border border-gray-300 dark:border-gray-600 px-3 py-2 transition-colors`}>
                                {s.code}
                              </td>
                              <td className={`${isDark ? "text-gray-200 hover:text-gray-300" : "text-gray-900 hover:text-gray-800"} border border-gray-300 dark:border-gray-600 px-3 py-2 transition-colors`}>
                                {s.name}
                              </td>
                              <td className={`${isDark ? "text-gray-200 hover:text-gray-300" : "text-gray-900 hover:text-gray-800"} border border-gray-300 dark:border-gray-600 px-3 py-2 transition-colors`}>
                                {s.teacher}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td
                              colSpan="3"
                              className={`text-center px-3 py-4 ${isDark ? "text-gray-400" : "text-gray-500"
                                }`}
                            >
                              No subjects available
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50 p-4">
          <div className={`${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"} border rounded-2xl shadow-2xl max-w-md w-full p-8 animate-slide-in`}>
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-6">
                <CalendarDays className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className={`text-xl font-bold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
                Confirm Regeneration
              </h3>
              <p className={`text-sm mb-8 ${isDark ? "text-gray-400" : "text-gray-600"} leading-relaxed`}>
                {confirmModal.message}
              </p>
              <div className="flex gap-4 w-full">
                <button
                  onClick={() => setConfirmModal({ ...confirmModal, isOpen: false })}
                  className={`flex-1 px-6 py-3 rounded-xl font-semibold transition ${isDark ? "bg-gray-700 text-gray-300 hover:bg-gray-600" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                >
                  Cancel
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="flex-1 px-6 py-3 rounded-xl font-semibold bg-blue-600 text-white hover:bg-blue-700 transition shadow-lg shadow-blue-500/30"
                >
                  Proceed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
