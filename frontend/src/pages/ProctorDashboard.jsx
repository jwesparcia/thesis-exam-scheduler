import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  CheckBadgeIcon,
  CalendarIcon,
  MapPinIcon,
  ClockIcon,
  BellIcon,
  ExclamationCircleIcon,
  Squares2X2Icon,
  BookOpenIcon,
  CalendarDaysIcon,
  TableCellsIcon,
  ArrowUpTrayIcon,
  CheckCircleIcon,
  XMarkIcon,
  TrashIcon,
  ArrowPathIcon,
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  PencilIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  ChevronRightIcon,
  Bars3Icon,
  ShieldCheckIcon,
  InformationCircleIcon,
  SparklesIcon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import { useUser } from "../context/userStore";
import { useNavigate } from "react-router-dom";
import { useToast } from "../context/ToastContext";
import SettingsDropdown from "../components/SettingsDropdown";
import ConfirmationModal from "../components/ConfirmationModal";
import FirstTimePasswordChange from "../components/FirstTimePasswordChange";
import api from "../api";

function ProctorManual() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [activeSubTab, setActiveSubTab] = useState("assignments");
  const [searchQuery, setSearchQuery] = useState("");

  const topics = [
    { id: "assignments", label: "My Assignments & Views", icon: CalendarDaysIcon, badge: "Dual View" },
    { id: "attendance", label: "Attendance Check-in", icon: CheckBadgeIcon, badge: "Live Status" },
    { id: "schedule", label: "Teaching Schedule Upload", icon: TableCellsIcon, badge: "Excel Ingest" },
    { id: "consecutive", label: "Workload & 2-Duty Rule", icon: ShieldCheckIcon, badge: "Fairness" },
    { id: "chat", label: "Chat Support", icon: ChatBubbleLeftRightIcon, badge: "Direct Msg" },
    { id: "notifications", label: "Notification Alerts", icon: BellIcon, badge: "Real-time" },
  ];

  const filteredTopics = topics.filter(t =>
    t.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.badge.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
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
                  Faculty Proctor Operational Guide
                </h2>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  isDark ? "bg-blue-500/20 text-blue-300 border border-blue-500/30" : "bg-blue-100 text-blue-700"
                }`}>
                  Current Version
                </span>
              </div>
              <p className={`text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Learn how to view supervisory slots in Grid or List view, perform live room check-ins, upload teaching availability, and connect with administrators.
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative min-w-[240px] sm:min-w-[280px]">
            <MagnifyingGlassIcon className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
            <input
              type="text"
              placeholder="Search proctor guide..."
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

      {/* Sub-tab Navigation */}
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

      {/* Content Panels */}
      <div className={`p-4 sm:p-7 md:p-8 rounded-3xl border transition-all ${
        isDark ? "bg-slate-900/50 border-slate-800/80 backdrop-blur-xl" : "bg-white border-slate-200/70 shadow-sm"
      }`}>
        {/* TAB 1: Assignments & Views */}
        {activeSubTab === "assignments" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-base shadow-sm">1</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Viewing Supervisory Assignments (Grid & List View)
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Comprehensive Examination Timetable, Room Locations, and Class Information
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                Core Feature
              </span>
            </div>
            
            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              The <strong>My Assignments</strong> dashboard displays every exam session assigned to you by the Program Head. The current version includes both **Grid View** and **List View** with horizontal date scrolling controls.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <ClockIcon className="w-4 h-4 text-blue-500" /> Exam Date & Timeslot
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Shows the exact date and timeslot range (e.g. 7:30 AM - 9:00 AM). The system guarantees start and end times match your declared faculty availability.
                </p>
              </div>

              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <MapPinIcon className="w-4 h-4 text-indigo-500" /> Room & Building Floor
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Lists the exact assigned venue (e.g., Computer Lab 1, Room 402, 4th Floor). If assigned to the <em>Consultation Area</em>, this is an irregular student rescheduled slot.
                </p>
              </div>

              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <BookOpenIcon className="w-4 h-4 text-emerald-500" /> Section & Headcount
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Subject code, descriptive title, section code (e.g., BSIT 3-201), and total enrolled student headcount to supervise.
                </p>
              </div>
            </div>

            <div className={`p-4 rounded-xl border text-xs flex items-center gap-3 ${
              isDark ? "bg-blue-950/20 border-blue-900/40 text-blue-200" : "bg-blue-50 border-blue-200/70 text-blue-800"
            }`}>
              <InformationCircleIcon className="w-5 h-5 shrink-0 text-blue-500" />
              <span><strong>View Toggle:</strong> Click the <strong>List View</strong> button to view a compact chronological table, or <strong>Grid View</strong> for date-by-date matrix cards with smooth horizontal navigation.</span>
            </div>
          </div>
        )}

        {/* TAB 2: Attendance Check-in */}
        {activeSubTab === "attendance" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-bold text-base shadow-sm">2</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Executing Attendance Check-ins
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Live On-Site Verification and Program Head Monitoring Sync
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                Mandatory Duty
              </span>
            </div>
            
            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              To allow administrators to monitor live coverage of exams across all rooms, proctors are required to perform a digital check-in upon arriving at the designated examination room.
            </p>

            <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"} space-y-3`}>
              <h4 className={`font-bold text-sm ${isDark ? "text-slate-200" : "text-slate-800"}`}>Standard Check-in Procedure:</h4>
              <ol className={`text-xs space-y-2.5 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-[11px] shrink-0">1</span>
                  <span><strong>Arrive 15 Minutes Early:</strong> Reach your assigned examination room 15 minutes before the exam start time to prepare materials and supervise seating.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-[11px] shrink-0">2</span>
                  <span><strong>Open My Assignments:</strong> On your mobile phone, tablet, or laptop, open the <strong>My Assignments</strong> tab.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-[11px] shrink-0">3</span>
                  <span><strong>Click "Check In":</strong> Locate the active exam card and click the green <strong>Check In</strong> button. The status badge will change from "Pending" to "Checked In".</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center font-bold text-[11px] shrink-0">4</span>
                  <span><strong>Live Sync:</strong> The Program Head's <em>Proctor Attendance Monitoring</em> board will immediately show your green checkmark, confirming the exam is covered.</span>
                </li>
              </ol>
            </div>

            <div className={`p-4 rounded-xl border text-xs ${isDark ? "bg-amber-950/20 border-amber-900/40 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-800"}`}>
              <strong>Emergency Absence Protocol:</strong> If you fall ill or cannot make it to an assigned exam, immediately notify the Program Head via the in-app <strong>Chat</strong> tab so an emergency substitute proctor can be dispatched.
            </div>
          </div>
        )}

        {/* TAB 3: Teaching Schedule Upload */}
        {activeSubTab === "schedule" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-base shadow-sm">3</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Teaching Schedule Upload & Availability Matrix
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Faculty Loading Spreadsheet Ingestion and Conflict Prevention
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-500 border border-indigo-500/20">
                Setup
              </span>
            </div>
            
            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              Uploading your official teaching schedule is essential to ensure the automated scheduler never assigns proctoring duties during hours when you have classes to teach.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <ArrowUpTrayIcon className="w-4 h-4 text-indigo-500" />
                  Excel Ingestion (.xlsx)
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  Navigate to <strong>My Schedule</strong>. Select your official faculty load Excel spreadsheet, and click <strong>Confirm Upload</strong>. The backend parses course sections, days, and timeslots.
                </p>
              </div>

              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 flex items-center gap-2 ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                  <TableCellsIcon className="w-4 h-4 text-emerald-500" />
                  Weekly Availability Grid
                </h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
                  After ingestion, your weekly calendar grid appears underneath. Blocked teaching slots are marked in blue, while available supervisory windows are open for exam assignments.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Workload & 2-Consecutive Duty Rule */}
        {activeSubTab === "consecutive" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-purple-600 dark:text-purple-400 font-bold text-base shadow-sm">4</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Faculty Workload & The 2-Consecutive Duty Rule
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Institutional Safeguards Protecting Proctors from Fatigue
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-purple-500/10 text-purple-600 border border-purple-500/20">
                Faculty Welfare
              </span>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              The scheduling engine is engineered with strict fairness constraints to ensure faculty members are not overburdened with excessive continuous proctoring duties.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 text-purple-500`}>2 Consecutive Proctoring Limit</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  No faculty member can be assigned more than <strong>2 consecutive exam timeslots</strong> in a single day. If you proctor Slot 1 and Slot 2, the algorithm is mathematically prohibited from assigning you Slot 3, ensuring a mandatory rest break.
                </p>
              </div>

              <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-sm mb-2 text-indigo-500`}>Contractual Hours Enforcement</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  The system enforces each proctor's daily <strong>Start Time</strong> and <strong>End Time</strong>. If your contract ends at 4:30 PM, the scheduler will never schedule you for late afternoon or evening exam slots.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: In-App Chat Support */}
        {activeSubTab === "chat" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold text-base shadow-sm">5</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    In-App Chat Support & Directory
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Direct Real-Time Communication with Administration and Students
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                Direct Contact
              </span>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              The <strong>Chat</strong> panel enables immediate communication between faculty proctors, Program Heads, and students without relying on external messaging apps.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-xs uppercase tracking-wider text-blue-500 mb-1`}>1. Contact Directory</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Click <strong>New Chat</strong> to search for administrators or students enrolled in your supervised sections.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-xs uppercase tracking-wider text-blue-500 mb-1`}>2. Edit & Delete</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Hover over your sent messages to edit typos or delete messages with confirmation dialogs.
                </p>
              </div>

              <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/50 border-slate-700/60" : "bg-slate-50 border-slate-200/80"}`}>
                <h4 className={`font-bold text-xs uppercase tracking-wider text-blue-500 mb-1`}>3. Unread Badges</h4>
                <p className={`text-xs leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Real-time red badge counters keep you informed of incoming student inquiries or admin notices.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: Notifications & Alerts */}
        {activeSubTab === "notifications" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 dark:text-amber-400 font-bold text-base shadow-sm">6</div>
                <div>
                  <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Notification Center & Live Action Alerts
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Immediate Alerts for New Timetable Releases and Emergency Re-assignments
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                Alerts
              </span>
            </div>

            <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              The bell icon in the header rings with unread counters whenever a schedule event occurs. Floating banner alerts appear with direct buttons:
            </p>

            <div className={`p-4 rounded-2xl border flex items-center justify-between flex-wrap gap-3 ${
              isDark ? "bg-slate-800/60 border-slate-700 text-slate-200" : "bg-slate-50 border-slate-200 text-slate-800"
            }`}>
              <div className="flex items-center gap-3">
                <BellIcon className="w-5 h-5 text-amber-500" />
                <span className="text-xs font-medium">New assignment scheduled for Finals Week in Computer Lab 1.</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-lg text-xs font-bold bg-blue-600 text-white">View Details</span>
                <span className="p-1 rounded-lg text-slate-400"><XMarkIcon className="w-4 h-4" /></span>
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

function ProctorChatPanel() {
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
  const [adminsList, setAdminsList] = useState([]);
  const [studentsList, setStudentsList] = useState([]);
  const [contactSearch, setContactSearch] = useState("");
  const [contactTab, setContactTab] = useState("admins");

  const fetchConversations = async () => {
    try {
      const res = await api.get("/chat/conversations");
      setConversations(res.data);
    } catch (err) { console.error("conv err", err); }
  };

  const openNewChatModal = async () => {
    setIsNewChatModalOpen(true);
    try {
      const [adminRes, studRes] = await Promise.all([
        api.get("/chat/admins"),
        api.get("/chat/students")
      ]);
      setAdminsList(adminRes.data);
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
          student_type: contact.student_type || "admin",
          role: contact.student_type ? "student" : "admin",
          last_message: "",
          last_message_time: null,
          unread_count: 0
        },
        ...prev
      ]);
    }
    selectStudent(contact.id, contact.name, contact.student_type || "admin");
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
    <div className={`flex h-[min(70dvh,600px)] min-h-[360px] sm:h-[600px] min-w-0 rounded-2xl border overflow-hidden relative ${isDark ? "bg-slate-800/20 border-slate-700/50 backdrop-blur-xl" : "bg-white border-slate-200"}`}>
      {/* Left: conversation list */}
      <div className={`w-full min-w-0 md:w-72 md:shrink-0 flex flex-col border-r ${isDark ? "bg-slate-800/60 border-slate-800" : "bg-slate-50 border-slate-200"} ${activeStudentId ? "hidden md:flex" : "flex"}`}>
        <div className={`p-4 border-b flex justify-between items-center ${isDark ? "border-slate-800" : "border-slate-200"}`}>
          <div>
            <h3 className={`font-bold text-sm uppercase tracking-wide ${isDark ? "text-slate-350" : "text-slate-600"}`}>
              Conversations
            </h3>
            <p className={`text-xs mt-0.5 ${isDark ? "text-slate-500" : "text-slate-400"}`}>{conversations.length} active</p>
          </div>
          <button
            onClick={openNewChatModal}
            className={`p-1.5 rounded-lg border transition-all ${
              isDark 
                ? "bg-slate-700 border-slate-600 text-slate-200 hover:bg-slate-600" 
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 shadow-sm"
            }`}
            title="Start New Chat"
          >
            <PlusIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          {conversations.length === 0 ? (
            <div className={`p-6 text-center text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>
              <ChatBubbleLeftRightIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
              No conversations yet
            </div>
          ) : conversations.map((conv) => (
            <button
              key={conv.student_id}
              onClick={() => selectStudent(conv.student_id, conv.student_name, conv.student_type)}
              className={`w-full p-4 text-left border-b transition-all ${activeStudentId === conv.student_id
                ? isDark ? "bg-blue-600/20 border-blue-700/50" : "bg-blue-50 border-blue-100"
                : isDark ? "border-slate-800 hover:bg-slate-800/40" : "border-slate-100 hover:bg-slate-100"
                }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`font-semibold text-sm truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                  {conv.student_name}
                </span>
                {conv.unread_count > 0 && (
                  <span className="ml-2 shrink-0 text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5">
                    {conv.unread_count}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className={`text-xs truncate flex-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  {conv.last_message || "No messages yet"}
                </p>
                <span className={`text-[9px] uppercase px-1.5 py-0.5 rounded-full font-bold select-none whitespace-nowrap ${
                  conv.role === "admin" || conv.student_type === "admin" || conv.role === "program_head" || conv.student_type === "program_head"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/10"
                    : conv.student_type === "irregular"
                    ? "bg-purple-500/20 text-purple-400 border border-purple-500/10"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/10"
                }`}>
                  {conv.role === "admin" || conv.student_type === "admin" || conv.role === "program_head" || conv.student_type === "program_head" ? "Admin" : conv.student_type === "irregular" ? "Irregular" : "Student"}
                </span>
              </div>
              {conv.last_message_time && (
                <p className={`text-[10px] mt-1 ${isDark ? "text-slate-600" : "text-slate-400"}`}>
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
            <div className={`p-3 sm:p-4 border-b flex items-center justify-between gap-3 ${isDark ? "border-slate-800 bg-slate-800/50" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <button
                  onClick={() => setActiveStudentId(null)}
                  className="p-1.5 rounded-lg md:hidden hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition shrink-0"
                  title="Back to conversations"
                >
                  <ChevronRightIcon className="w-5 h-5 rotate-180" />
                </button>
                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isDark ? "bg-blue-600/30 text-blue-300" : "bg-blue-100 text-blue-700"
                  }`}>
                  {(activeStudentName || "").split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h4 className={`font-bold text-sm truncate ${isDark ? "text-white" : "text-slate-900"}`}>{activeStudentName}</h4>
                  <p className={`text-xs truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {activeStudentType === "irregular" ? "Irregular Student" : activeStudentType === "admin" || activeStudentType === "program_head" ? "Program Head / Admin" : activeStudentType === "regular" ? "Regular Student" : "Student"}
                  </p>
                </div>
              </div>

              <button
                onClick={() => deleteConversation(activeStudentId)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-500/10 border border-transparent hover:border-red-500/25 transition-all duration-200 shrink-0"
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
                  <ChatBubbleLeftRightIcon className="w-10 h-10 mx-auto mb-2 opacity-20" />
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
                          className={`p-1 rounded transition-colors ${
                            isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
                          }`}
                          title="Edit message"
                        >
                          <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteMessage(msg.id)}
                          className="p-1 rounded transition-colors hover:bg-red-500/10 text-red-500"
                          title="Delete message"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <div className={`min-w-0 max-w-[90%] sm:max-w-[70%] px-3 sm:px-4 py-2.5 rounded-2xl text-sm shadow-sm ${isMe
                      ? "bg-blue-600 text-white rounded-br-sm"
                      : isDark ? "bg-slate-800 text-slate-100 rounded-bl-sm border border-slate-700/50" : "bg-slate-100 text-slate-800 rounded-bl-sm"
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
                              className="px-2.5 py-1 text-xs bg-slate-500 hover:bg-slate-600 text-white rounded font-medium transition"
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
                          <p className="leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{msg.message}</p>
                          <p className={`text-[10px] mt-1 ${isMe ? "text-blue-200" : isDark ? "text-slate-505" : "text-slate-400"}`}>
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
            <div className={`p-2 sm:p-4 border-t flex gap-2 sm:gap-3 items-end ${isDark ? "border-slate-800 bg-slate-800/30" : "border-slate-200 bg-slate-50"}`}>
              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message..."
                rows={1}
                aria-label="Type your message"
                className={`min-w-0 min-h-11 flex-1 p-3 rounded-xl border resize-none outline-none text-base sm:text-sm transition ${isDark
                  ? "bg-slate-700 border-slate-600 text-white placeholder-slate-500 focus:border-blue-500"
                  : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-500"
                  }`}
              />
              <button
                onClick={sendMessage}
                disabled={sending || !newMessage.trim()}
                aria-label="Send message"
                className={`w-11 h-11 shrink-0 rounded-xl transition flex items-center justify-center ${sending || !newMessage.trim()
                  ? isDark ? "bg-slate-800 text-slate-500" : "bg-slate-200 text-slate-400"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
                  }`}
              >
                <PaperAirplaneIcon className="w-5 h-5" />
              </button>
            </div>
          </>
        ) : (
          <div className={`flex-1 flex flex-col items-center justify-center gap-4 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${isDark ? "bg-slate-850" : "bg-slate-100"
              }`}>
              <ChatBubbleLeftRightIcon className="w-8 h-8 opacity-40" />
            </div>
            <div className="text-center">
              <p className="font-semibold">Select a conversation</p>
              <p className="text-sm mt-1">Choose an administrator or a student from the list to start chatting.</p>
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
                onClick={() => setContactTab("admins")}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                  contactTab === "admins"
                    ? "bg-blue-600 text-white"
                    : isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-blue-600"
                }`}
              >
                Administrators
              </button>
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
                adminsList
                  .filter(a => a.name.toLowerCase().includes(contactSearch.toLowerCase()))
                  .map(a => (
                    <button
                      key={a.id}
                      onClick={() => startChatWithContact(a)}
                      className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition ${
                        isDark ? "hover:bg-slate-700/50" : "hover:bg-slate-50 border border-transparent hover:border-slate-100"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm truncate">{a.name}</p>
                        <p className={`text-xs truncate ${isDark ? "text-slate-400" : "text-slate-500"}`}>{a.email}</p>
                      </div>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-400">
                        Admin
                      </span>
                    </button>
                  ))
              )}
              {((contactTab === "students" && studentsList.filter(s => s.name.toLowerCase().includes(contactSearch.toLowerCase())).length === 0) ||
                (contactTab === "admins" && adminsList.filter(a => a.name.toLowerCase().includes(contactSearch.toLowerCase())).length === 0)) && (
                <p className={`text-center py-6 text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>No contacts found</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProctorDashboard() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { user, login, logout } = useUser();
  const navigate = useNavigate();
  const { showSuccess, showError } = useToast();
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("assignments");
  const [assignmentViewMode, setAssignmentViewMode] = useState(() => {
    return localStorage.getItem("proctor_assignment_view_mode") || "list";
  });
  const [assignmentFilter, setAssignmentFilter] = useState("all");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [confirmingExamId, setConfirmingExamId] = useState(null);

  const isAttendanceConfirmed = useCallback((attendance) => {
    return attendance === "confirmed" || attendance === "attended";
  }, []);

  const handleViewModeChange = (mode) => {
    setAssignmentViewMode(mode);
    localStorage.setItem("proctor_assignment_view_mode", mode);
  };

  const pendingExamsCount = useMemo(() => exams.filter(e => !isAttendanceConfirmed(e.proctor_attendance)).length, [exams, isAttendanceConfirmed]);
  const confirmedExamsCount = useMemo(() => exams.filter(e => isAttendanceConfirmed(e.proctor_attendance)).length, [exams, isAttendanceConfirmed]);

  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      const isConfirmed = isAttendanceConfirmed(exam.proctor_attendance);
      if (assignmentFilter === "confirmed" && !isConfirmed) return false;
      if (assignmentFilter === "pending" && isConfirmed) return false;

      if (assignmentSearch.trim()) {
        const query = assignmentSearch.toLowerCase();
        const matchName = (exam.subject_name || "").toLowerCase().includes(query);
        const matchCode = (exam.subject_code || "").toLowerCase().includes(query);
        const matchSection = (exam.section_name || "").toLowerCase().includes(query);
        const matchRoom = (exam.room || "").toLowerCase().includes(query);
        const matchDate = (exam.exam_date || "").toLowerCase().includes(query);
        if (!matchName && !matchCode && !matchSection && !matchRoom && !matchDate) return false;
      }

      return true;
    });
  }, [exams, assignmentFilter, assignmentSearch, isAttendanceConfirmed]);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [mySchedule, setMySchedule] = useState([]);
  const [translatedSchedule, setTranslatedSchedule] = useState(null);
  const [scheduleView, setScheduleView] = useState("translated");
  const [filePreview, setFilePreview] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isClearNotifModalOpen, setIsClearNotifModalOpen] = useState(false);
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
    if (!user?.id) return;
    try {
      await api.delete(`/notifications/clear/proctor/${user.id}`);
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
    if (msg.includes("teaching schedule") || msg.includes("upload")) {
      setActiveTab("schedule");
    } else {
      setActiveTab("assignments");
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
    if (confirmingExamId) return; // Prevent spamming / multiple concurrent clicks

    const targetExam = exams.find((e) => e.id === examId);
    if (targetExam && isAttendanceConfirmed(targetExam.proctor_attendance)) {
      showError("Attendance has already been confirmed for this exam.");
      return;
    }

    setConfirmingExamId(examId);

    // Optimistically update attendance in state so button immediately switches to verified
    setExams((prev) =>
      prev.map((e) => (e.id === examId ? { ...e, proctor_attendance: "confirmed" } : e))
    );

    try {
      const response = await api.post(`/proctors/${user.proctor_id}/confirm-attendance/${examId}`);
      showSuccess(response.data?.message || "Attendance confirmed!");
      const examsResponse = await api.get(`/exams?proctor_id=${user.proctor_id}&status=posted`);
      setExams(examsResponse.data);
    } catch (error) {
      console.error(error);
      // Revert optimistic update on failure
      try {
        const examsResponse = await api.get(`/exams?proctor_id=${user.proctor_id}&status=posted`);
        setExams(examsResponse.data);
      } catch (fetchErr) {
        if (targetExam) {
          setExams((prev) => prev.map((e) => (e.id === examId ? targetExam : e)));
        }
      }
      const errMsg = error.response?.data?.detail || "An error occurred. Please try again.";
      showError(errMsg);
    } finally {
      setConfirmingExamId(null);
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
    try {
      const parts = dateStr.split(", ");
      if (parts.length >= 3) {
        const weekday = parts[0];
        const datePart = `${parts[1]}, ${parts[2]}`;
        const parsedDate = new Date(datePart);
        if (!isNaN(parsedDate)) {
          return `${weekday}, ${parsedDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
        }
        return dateStr;
      }
      const parsedDate = new Date(dateStr.includes("T") ? dateStr : `${dateStr}T00:00:00`);
      if (!isNaN(parsedDate)) {
        return parsedDate.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric"
        });
      }
    } catch (e) {
      console.error("formatDate error", e);
    }
    return dateStr;
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
      <div className={`min-h-screen ${isDark ? "bg-slate-900" : "bg-slate-50"} flex items-center justify-center`}>
        <p className={isDark ? "text-slate-300" : "text-slate-600"}>Redirecting to login...</p>
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

  const unreadCount = notifications.filter(n => !n.is_read).length;
  const latestUnreadNotif = notifications.find(n => !n.is_read);

  return (
    <div className={`h-screen h-dvh w-full overflow-hidden flex transition-colors duration-300 ${isDark ? "bg-slate-900" : "bg-slate-50"}`}>
      {/* Notifications Overlay */}
      {showNotifications && (
        <div className="fixed inset-0 z-40 bg-slate-950/10 transition-opacity" onClick={() => setShowNotifications(false)}></div>
      )}

      {/* Notifications Panel - rendered at top level to escape header stacking context */}
      {showNotifications && (
        <div onClick={(e) => e.stopPropagation()} className={`fixed left-3 right-3 top-20 sm:left-auto sm:right-6 sm:top-24 sm:w-96 max-h-[min(24rem,calc(100dvh-6rem))] flex flex-col rounded-2xl shadow-2xl border z-50 transform origin-top-right transition-all animate-in fade-in scale-95 duration-200 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}>
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
              <div className={`p-6 text-center text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                <BellIcon className="w-8 h-8 mx-auto mb-2 opacity-20" />
                You're all caught up!
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3.5 rounded-xl cursor-pointer transition-all duration-200 mb-1 group relative ${notif.is_read ? (isDark ? "hover:bg-slate-700/50 opacity-60" : "hover:bg-slate-50 opacity-60") : (isDark ? "bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/30" : "bg-blue-50 hover:bg-blue-100 border border-blue-100")}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex gap-3 min-w-0 flex-1">
                      <div className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${notif.is_read ? "bg-slate-400" : "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]"}`}></div>
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm leading-snug ${isDark ? "text-slate-200" : "text-slate-800"}`}>{notif.message}</p>
                        <p className={`text-[11px] mt-1.5 font-medium ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                          {formatNotifTime(notif.created_at)}
                        </p>
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
            <img src="/images.png" alt="STI Logo" className="rounded-xl h-10 w-10 object-contain drop-shadow-md" />
          </div>
          <div className="text-center">
            <h2 className={`text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Proctor Portal</h2>
            <p className={`text-xs font-medium tracking-wide uppercase mt-1 ${isDark ? "text-blue-400" : "text-blue-600"}`}>STI Education System</p>
          </div>
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto custom-scrollbar">
          {[
            { id: "assignments", icon: CalendarDaysIcon, label: "My Assignments" },
            { id: "schedule", icon: TableCellsIcon, label: "My Schedule" },
            { id: "chat", icon: ChatBubbleLeftRightIcon, label: "Chat" },
            { id: "manual", icon: BookOpenIcon, label: "User Manual" },
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
      <main className="flex-1 flex flex-col h-full overflow-hidden relative min-w-0">
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
                  <Squares2X2Icon className="w-5 h-5 sm:w-6 sm:h-6" />
                </button>
                <div className="min-w-0">
                  <h1 className={`text-base sm:text-2xl font-bold tracking-tight transition-colors truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                    {activeTab === "assignments" ? "My Proctoring Assignments" : activeTab === "schedule" ? "My Teaching Schedule" : activeTab === "chat" ? "Chat Support" : activeTab === "manual" ? "User Manual" : activeTab === "notifications" ? "Notifications" : "Settings"}
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
                    <BellIcon className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-900 animate-pulse">
                        {unreadCount}
                      </span>
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
            {latestUnreadNotif && (
              <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-300 relative z-10">
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

            <div className={`relative overflow-hidden p-4 sm:p-6 md:p-8 rounded-2xl sm:rounded-3xl shadow-sm border flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 ${isDark ? "bg-slate-800/80 border-slate-700/50 backdrop-blur-xl" : "bg-white/80 border-slate-200 backdrop-blur-xl"}`}>
              <div className="absolute right-0 top-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
              <div className={`w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-2xl flex items-center justify-center text-xl sm:text-2xl font-bold shadow-inner relative z-10 ${isDark ? "bg-gradient-to-br from-blue-600 to-indigo-700 text-white" : "bg-gradient-to-br from-blue-100 to-indigo-100 text-blue-700 border border-blue-200"}`}>
                {(user?.name || "P").split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2)}
              </div>
              <div className="flex-1 min-w-0 relative z-10">
                <h2 className={`text-xl sm:text-3xl font-bold tracking-tight break-words ${isDark ? "text-white" : "text-slate-900"}`}>{user?.name || "Proctor Name"}</h2>
                <div className="flex flex-wrap gap-2 sm:gap-4 mt-3">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium border ${isDark ? "bg-slate-700/50 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                    <CheckBadgeIcon className="w-4 h-4 text-emerald-500" />
                    <span>Licensed Proctor</span>
                  </div>
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium border ${isDark ? "bg-slate-700/50 border-slate-600 text-slate-300" : "bg-slate-50 border-slate-200 text-slate-600"}`}>
                    <Squares2X2Icon className="w-4 h-4 text-blue-500" />
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
                      <TableCellsIcon className={`w-6 h-6 ${isDark ? "text-emerald-400" : "text-emerald-500"}`} />
                    </div>
                    <div className="min-w-0">
                      <h3 className={`text-lg sm:text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Upload My Teaching Schedule</h3>
                      <p className={`text-xs sm:text-sm mt-1 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Upload your individual schedule (Excel format) to update your availability</p>
                    </div>
                  </div>
                  {!selectedFile ? (
                    <div className={`border-2 border-dashed rounded-2xl p-6 sm:p-12 flex flex-col items-center justify-center transition-all hover:bg-slate-50 dark:hover:bg-slate-800/50 border-slate-300 dark:border-slate-700`}>
                      <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isDark ? "bg-slate-800" : "bg-slate-100"}`}>
                        <ArrowUpTrayIcon className={`w-8 h-8 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
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
                          <CheckCircleIcon className="w-6 h-6 text-emerald-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>{selectedFile.name}</p>
                            <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>{filePreview ? `${filePreview.rows.length} data row${filePreview.rows.length !== 1 ? 's' : ''} · ${filePreview.headers.length} column${filePreview.headers.length !== 1 ? 's' : ''}` : 'Reading file…'}</p>
                          </div>
                        </div>
                        <div className="flex gap-3 w-full sm:w-auto shrink-0">
                          <button onClick={() => { setSelectedFile(null); setFilePreview(null); }} className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition ${isDark ? "text-slate-300 hover:text-white bg-slate-700 hover:bg-slate-600" : "text-slate-600 hover:text-slate-900 bg-white border border-slate-200 hover:bg-slate-50"}`}>Cancel</button>
                          <button onClick={handleFileUpload} disabled={uploading} className="flex-1 sm:flex-none px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-xs font-bold transition shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
                            {uploading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <ArrowUpTrayIcon className="w-4 h-4" />}
                            {uploading ? "Uploading…" : "Confirm Upload"}
                          </button>
                        </div>
                      </div>
                      {filePreview && (
                        <div className={`rounded-2xl border overflow-hidden shadow-sm ${isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-white"}`}>
                          <div className={`px-5 py-3 flex items-center gap-2 border-b text-xs font-bold uppercase tracking-wider ${isDark ? "bg-slate-800/80 border-slate-700 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-500"}`}>
                            <TableCellsIcon className="w-4 h-4" />
                            Preview — {filePreview.sheetName || 'Sheet 1'}
                          </div>
                          <div className="overflow-x-auto max-h-[60dvh] sm:max-h-80 overflow-y-auto custom-scrollbar">
                            {filePreview.headers.length === 0 ? (
                              <p className={`text-center py-8 text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>The file appears to be empty.</p>
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
                            <CalendarIcon className={`w-5 h-5 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
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
                            <TrashIcon className="w-3.5 h-3.5" />
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
                        <div className={`min-w-0 rounded-2xl border shadow-sm sm:rounded-3xl ${isDark ? "border-slate-700/50 bg-slate-800/80 backdrop-blur-xl" : "border-slate-200 bg-white/80 backdrop-blur-xl"}`}>
                          <div className="space-y-3 p-3 md:hidden">
                            {DAYS.map((day, dayIdx) => {
                              const daySlots = timeSlotKeys.flatMap((slotKey) => {
                                const [start, end] = slotKey.split("|||");
                                const subjects = lookup[`${start}|||${end}|||${dayIdx}`];
                                return subjects?.length ? [{ start, end, subjects }] : [];
                              });
                              return (
                                <section key={day} className={`rounded-xl border p-4 ${isDark ? "border-slate-700 bg-slate-900/50" : "border-slate-200 bg-white"}`}>
                                  <h4 className={`mb-3 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{day}</h4>
                                  {daySlots.length ? (
                                    <div className="space-y-3">
                                      {daySlots.map((slot) => (
                                        <div key={`${slot.start}-${slot.end}`} className={`grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3 border-t pt-3 first:border-0 first:pt-0 ${isDark ? "border-slate-700" : "border-slate-100"}`}>
                                          <p className={`text-xs font-semibold leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                            {slot.start}<br />{slot.end}
                                          </p>
                                          <div className="flex min-w-0 flex-col gap-2">
                                            {slot.subjects.map((subject, idx) => (
                                              <span key={`${subject}-${idx}`} className={`break-words rounded-lg px-3 py-2 text-sm font-semibold ${isDark ? "border border-blue-500/30 bg-blue-500/20 text-blue-300" : "border border-blue-200 bg-blue-50 text-blue-700"}`}>
                                                {subject}
                                              </span>
                                            ))}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className={`text-sm ${isDark ? "text-slate-500" : "text-slate-400"}`}>No classes scheduled</p>
                                  )}
                                </section>
                              );
                            })}
                          </div>
                          <div className="hidden overflow-x-auto md:block">
                          <table className="w-full min-w-[900px] text-xs text-center border-collapse">
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
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <div className={`text-center py-12 sm:py-20 px-4 rounded-2xl sm:rounded-3xl border-2 border-dashed transition-colors ${isDark ? "border-slate-700 bg-slate-800/30 hover:bg-slate-800/50" : "border-slate-300 bg-slate-50/50 hover:bg-slate-50"}`}>
                    <div className="max-w-sm mx-auto">
                      <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center shadow-inner ${isDark ? "bg-slate-800" : "bg-white"}`}>
                        <CalendarIcon className={`w-12 h-12 ${isDark ? "text-slate-600" : "text-blue-300"}`} />
                      </div>
                      <h3 className={`text-xl font-bold mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>No Schedule Found</h3>
                      <p className={`text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>You haven't uploaded your teaching schedule yet. Use the upload section above to submit your Excel schedule file.</p>
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === "chat" ? (
              <ProctorChatPanel />
            ) : activeTab === "manual" ? (
              <ProctorManual />
            ) : exams.length === 0 ? (
              <div className={`text-center py-14 sm:py-24 px-4 rounded-2xl sm:rounded-3xl border-2 border-dashed transition-all animate-in fade-in zoom-in-95 duration-500 ${isDark ? "border-slate-700 bg-slate-800/30" : "border-slate-300 bg-white/50 backdrop-blur-sm"}`}>
                <div className="max-w-sm mx-auto">
                  <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center shadow-inner ${isDark ? "bg-slate-800" : "bg-slate-50"}`}>
                    <ExclamationCircleIcon className={`w-12 h-12 ${isDark ? "text-slate-600" : "text-slate-400"}`} />
                  </div>
                  <h3 className={`text-xl sm:text-2xl font-bold mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>No Active Assignments</h3>
                  <p className={`text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>Your program head hasn't assigned any posted exams to you yet. You will receive a notification when a new assignment is available.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Header Controls: Title, Filter Pills, Search & View Switcher */}
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-3 mr-1">
                      <div className={`p-2 rounded-xl ${isDark ? "bg-blue-500/20" : "bg-blue-100"}`}>
                        <BookOpenIcon className={`w-5 h-5 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                      </div>
                      <h3 className={`text-lg sm:text-xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                        Exam Supervision List
                      </h3>
                    </div>

                    {/* Filter Pills matching reference image [Enroled 13] [Completed 52] */}
                    <div className="flex items-center gap-1 p-1 rounded-full bg-slate-200/70 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 shadow-xs max-w-full overflow-x-auto no-scrollbar">
                      <button
                        onClick={() => setAssignmentFilter("all")}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                          assignmentFilter === "all"
                            ? (isDark ? "bg-blue-600 text-white shadow-xs" : "bg-blue-600 text-white shadow-xs")
                            : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                        }`}
                      >
                        All <span className="ml-1 opacity-80">({exams.length})</span>
                      </button>
                      <button
                        onClick={() => setAssignmentFilter("pending")}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                          assignmentFilter === "pending"
                            ? (isDark ? "bg-amber-600 text-white shadow-xs" : "bg-amber-600 text-white shadow-xs")
                            : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                        }`}
                      >
                        Pending <span className="ml-1 opacity-80">({pendingExamsCount})</span>
                      </button>
                      <button
                        onClick={() => setAssignmentFilter("confirmed")}
                        className={`px-3 py-1 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                          assignmentFilter === "confirmed"
                            ? (isDark ? "bg-emerald-600 text-white shadow-xs" : "bg-emerald-600 text-white shadow-xs")
                            : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                        }`}
                      >
                        Confirmed <span className="ml-1 opacity-80">({confirmedExamsCount})</span>
                      </button>
                    </div>
                  </div>

                  {/* Search and View Mode Switcher */}
                  <div className="flex items-center gap-2 sm:gap-2.5 w-full lg:w-auto">
                    <div className="relative flex-1 sm:w-64 min-w-0">
                      <MagnifyingGlassIcon className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? "text-slate-400" : "text-slate-400"}`} />
                      <input
                        type="text"
                        placeholder="Search assignments..."
                        value={assignmentSearch}
                        onChange={(e) => setAssignmentSearch(e.target.value)}
                        className={`w-full pl-9 pr-8 py-2 rounded-xl text-xs border outline-none transition ${
                          isDark
                            ? "bg-slate-800/80 border-slate-700 text-white placeholder-slate-400 focus:border-blue-500"
                            : "bg-white border-slate-200 text-slate-800 placeholder-slate-400 focus:border-blue-500 shadow-xs"
                        }`}
                      />
                      {assignmentSearch && (
                        <button
                          onClick={() => setAssignmentSearch("")}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        >
                          <XMarkIcon className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* View Switcher: List vs Grid */}
                    <div className={`flex items-center p-1 rounded-xl border ${isDark ? "bg-slate-800/80 border-slate-700" : "bg-slate-100 border-slate-200"}`}>
                      <button
                        type="button"
                        onClick={() => handleViewModeChange("list")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          assignmentViewMode === "list"
                            ? (isDark ? "bg-blue-600 text-white shadow-xs" : "bg-white text-blue-700 shadow-xs")
                            : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                        }`}
                        title="List View"
                      >
                        <Bars3Icon className="w-4 h-4" />
                        <span className="hidden sm:inline">List</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleViewModeChange("grid")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          assignmentViewMode === "grid"
                            ? (isDark ? "bg-blue-600 text-white shadow-xs" : "bg-white text-blue-700 shadow-xs")
                            : (isDark ? "text-slate-400 hover:text-white" : "text-slate-600 hover:text-slate-900")
                        }`}
                        title="Grid View"
                      >
                        <Squares2X2Icon className="w-4 h-4" />
                        <span className="hidden sm:inline">Grid</span>
                      </button>
                    </div>
                  </div>
                </div>

                {filteredExams.length === 0 ? (
                  <div className={`text-center py-12 px-4 rounded-2xl border-2 border-dashed ${isDark ? "border-slate-800 bg-slate-900/30 text-slate-400" : "border-slate-200 bg-slate-50/50 text-slate-500"}`}>
                    <ExclamationCircleIcon className="w-10 h-10 mx-auto mb-3 opacity-40 text-blue-500" />
                    <p className="text-base font-bold mb-1 text-slate-900 dark:text-slate-100">No Assignments Found</p>
                    <p className="text-xs">No exam assignments match your current filter or search criteria.</p>
                    {(assignmentFilter !== "all" || assignmentSearch) && (
                      <button
                        onClick={() => { setAssignmentFilter("all"); setAssignmentSearch(""); }}
                        className="mt-3 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                      >
                        Clear Filters
                      </button>
                    )}
                  </div>
                ) : assignmentViewMode === "list" ? (
                  /* LIST VIEW - Fully responsive for all devices */
                  <div className="space-y-4">
                    {/* DESKTOP TABLE VIEW (lg and larger: >= 1024px) */}
                    <div className={`hidden lg:block rounded-2xl border overflow-hidden shadow-sm ${
                      isDark ? "border-slate-700/80 bg-slate-900/60" : "border-slate-200 bg-white"
                    }`}>
                      <div className="overflow-x-auto custom-scrollbar">
                        <table className="w-full text-left border-collapse text-xs min-w-[760px]">
                          <thead>
                            <tr className={`border-b font-semibold uppercase tracking-wider text-[11px] ${
                              isDark ? "border-slate-700/80 bg-slate-800/60 text-slate-400" : "border-slate-200 bg-slate-50/80 text-slate-600"
                            }`}>
                              <th className="py-3.5 px-4 sm:px-6">Name</th>
                              <th className="py-3.5 px-4 whitespace-nowrap">Schedule Date</th>
                              <th className="py-3.5 px-4 whitespace-nowrap">Time Period</th>
                              <th className="py-3.5 px-4 whitespace-nowrap">Room</th>
                              <th className="py-3.5 px-4 text-center whitespace-nowrap">Attendance</th>
                              <th className="py-3.5 px-4 sm:px-6 text-right whitespace-nowrap">Actions</th>
                            </tr>
                          </thead>
                          <tbody className={`divide-y ${isDark ? "divide-slate-800/80 text-slate-200" : "divide-slate-100 text-slate-800"}`}>
                            {filteredExams.map((exam) => {
                              const isConfirmed = isAttendanceConfirmed(exam.proctor_attendance);
                              return (
                                <tr
                                  key={exam.id}
                                  className={`transition-colors ${
                                    isDark ? "hover:bg-slate-800/40" : "hover:bg-blue-50/40"
                                  }`}
                                >
                                  {/* Name column with image/icon, subject title, and subtitle [code • section] */}
                                  <td className="py-4 px-4 sm:px-6">
                                    <div className="flex items-center gap-3.5">
                                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-900/20 shrink-0">
                                        <BookOpenIcon className="w-5 h-5" />
                                      </div>
                                      <div className="min-w-0">
                                        <h4 className={`font-bold text-sm leading-tight break-words ${isDark ? "text-white" : "text-slate-900"}`}>
                                          {exam.subject_name}
                                        </h4>
                                        <p className={`text-xs mt-1 font-medium flex items-center gap-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                          <span className="font-mono font-bold text-slate-400 dark:text-slate-500">{exam.subject_code}</span>
                                          <span>•</span>
                                          <span className="font-semibold text-blue-600 dark:text-blue-400">{exam.section_name}</span>
                                        </p>
                                      </div>
                                    </div>
                                  </td>

                                  {/* Schedule Date with Day of the Week */}
                                  <td className="py-4 px-4 whitespace-nowrap">
                                    <div className="flex items-center gap-2">
                                      <CalendarIcon className="w-4 h-4 text-blue-500 shrink-0" />
                                      <span className="font-semibold text-xs sm:text-sm">
                                        {formatDate(exam.exam_date)}
                                      </span>
                                    </div>
                                  </td>

                                  {/* Time Period */}
                                  <td className="py-4 px-4 whitespace-nowrap">
                                    <div className="flex items-center gap-2 font-mono text-xs">
                                      <ClockIcon className="w-4 h-4 text-purple-500 shrink-0" />
                                      <span>{exam.start_time} – {exam.end_time}</span>
                                    </div>
                                  </td>

                                  {/* Room */}
                                  <td className="py-4 px-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                      isDark
                                        ? "bg-slate-800 text-pink-400 border-slate-700"
                                        : "bg-pink-50 text-pink-600 border-pink-200"
                                    }`}>
                                      <MapPinIcon className="w-3.5 h-3.5 shrink-0" />
                                      {exam.room}
                                    </span>
                                  </td>

                                  {/* Attendance Status */}
                                  <td className="py-4 px-4 text-center whitespace-nowrap">
                                    {isConfirmed ? (
                                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
                                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                                        Confirmed
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 shadow-xs">
                                        <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                        Pending
                                      </span>
                                    )}
                                  </td>

                                  {/* Actions */}
                                  <td className="py-4 px-4 sm:px-6 text-right whitespace-nowrap">
                                    {isConfirmed ? (
                                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                        <CheckBadgeIcon className="w-4 h-4 text-emerald-500" />
                                        Verified
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleConfirmAttendance(exam.id)}
                                        disabled={confirmingExamId === exam.id}
                                        className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition hover:shadow-md hover:-translate-y-0.5 ${
                                          confirmingExamId === exam.id ? "opacity-60 cursor-not-allowed" : ""
                                        }`}
                                      >
                                        {confirmingExamId === exam.id ? (
                                          <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <CheckBadgeIcon className="w-4 h-4" />
                                        )}
                                        {confirmingExamId === exam.id ? "Confirming..." : "Confirm Attendance"}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* MOBILE & TABLET RESPONSIVE LIST VIEW (Screens < 1024px) */}
                    <div className="block lg:hidden space-y-3">
                      {filteredExams.map((exam) => {
                        const isConfirmed = isAttendanceConfirmed(exam.proctor_attendance);
                        return (
                          <div
                            key={exam.id}
                            className={`rounded-2xl border p-4 sm:p-5 transition-all duration-200 shadow-xs hover:shadow-md ${
                              isDark
                                ? "bg-slate-900/60 border-slate-700/80 hover:border-slate-600"
                                : "bg-white border-slate-200 hover:border-blue-200"
                            }`}
                          >
                            {/* Top Row: Icon + Subject Info + Attendance Status Badge */}
                            <div className="flex items-start justify-between gap-3 mb-3.5">
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-900/20 shrink-0 mt-0.5">
                                  <BookOpenIcon className="w-5 h-5" />
                                </div>
                                <div className="min-w-0">
                                  <h4 className={`font-bold text-sm sm:text-base leading-snug break-words ${isDark ? "text-white" : "text-slate-900"}`}>
                                    {exam.subject_name}
                                  </h4>
                                  <p className={`text-xs mt-1 font-medium flex items-center gap-1.5 flex-wrap ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                                    <span className="font-mono font-bold text-slate-400 dark:text-slate-500">{exam.subject_code}</span>
                                    <span>•</span>
                                    <span className="font-semibold text-blue-600 dark:text-blue-400">{exam.section_name}</span>
                                  </p>
                                </div>
                              </div>

                              {/* Status Badge */}
                              <div className="shrink-0">
                                {isConfirmed ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Confirmed
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60 shadow-xs">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                                    Pending
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Details Grid / Chips */}
                            <div className={`grid grid-cols-1 sm:grid-cols-3 gap-2.5 py-3 border-y text-xs ${
                              isDark ? "border-slate-800/80 text-slate-300" : "border-slate-100 text-slate-600"
                            }`}>
                              {/* Schedule Date */}
                              <div className="flex items-center gap-2">
                                <CalendarIcon className="w-4 h-4 text-blue-500 shrink-0" />
                                <span className="font-medium text-xs">
                                  {formatDate(exam.exam_date)}
                                </span>
                              </div>

                              {/* Time Period */}
                              <div className="flex items-center gap-2 font-mono text-xs">
                                <ClockIcon className="w-4 h-4 text-purple-500 shrink-0" />
                                <span>{exam.start_time} – {exam.end_time}</span>
                              </div>

                              {/* Room */}
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                  isDark
                                    ? "bg-slate-800 text-pink-400 border-slate-700"
                                    : "bg-pink-50 text-pink-600 border-pink-200"
                                }`}>
                                  <MapPinIcon className="w-3.5 h-3.5 shrink-0" />
                                  {exam.room}
                                </span>
                              </div>
                            </div>

                            {/* Action Button */}
                            <div className="mt-3.5 pt-0.5">
                              {isConfirmed ? (
                                <div className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                                  isDark
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                }`}>
                                  <CheckBadgeIcon className="w-4 h-4 text-emerald-500" />
                                  Attendance Verified
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleConfirmAttendance(exam.id)}
                                  disabled={confirmingExamId === exam.id}
                                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-500/20 active:scale-[0.99] ${
                                    confirmingExamId === exam.id ? "opacity-60 cursor-not-allowed" : ""
                                  }`}
                                >
                                  {confirmingExamId === exam.id ? (
                                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <CheckBadgeIcon className="w-4 h-4" />
                                  )}
                                  {confirmingExamId === exam.id ? "Confirming..." : "Confirm Attendance"}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* GRID VIEW */
                  <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
                    {filteredExams.map((exam) => {
                      const isConfirmed = isAttendanceConfirmed(exam.proctor_attendance);
                      return (
                      <div key={exam.id} className={`rounded-2xl sm:rounded-3xl border transition-all duration-300 hover:shadow-lg relative overflow-hidden group ${isDark ? "bg-slate-800/90 border-slate-700/50 hover:border-slate-600" : "bg-white border-slate-200 hover:border-blue-200 shadow-sm"}`}>
                        <div className={`h-2 w-full ${isConfirmed ? "bg-emerald-500" : "bg-amber-500"}`}></div>
                        
                        <div className="p-4 sm:p-6">
                          <div className="flex flex-col gap-1.5 mb-5 pr-16 sm:pr-20">
                            <span className={`inline-block w-fit px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase mb-1 ${isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-50 text-blue-600"}`}>{exam.section_name}</span>
                            <h3 className={`text-lg sm:text-xl font-bold leading-tight break-words ${isDark ? "text-white" : "text-slate-900"}`}>{exam.subject_name}</h3>
                            <p className={`text-xs font-medium ${isDark ? "text-slate-500" : "text-slate-500"}`}>ID: {exam.subject_code}</p>
                          </div>
                          
                          <div className={`space-y-3.5 pt-5 border-t ${isDark ? "border-slate-700/50" : "border-slate-100"}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`p-1.5 rounded-lg ${isDark ? "bg-blue-500/10" : "bg-blue-50"}`}><CalendarIcon className={`w-4 h-4 ${isDark ? "text-blue-400" : "text-blue-500"}`} /></div>
                                <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>{formatDate(exam.exam_date)}</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`p-1.5 rounded-lg ${isDark ? "bg-purple-500/10" : "bg-blue-50"}`}><ClockIcon className={`w-4 h-4 ${isDark ? "text-purple-400" : "text-purple-500"}`} /></div>
                                <span className={`text-sm font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>{exam.start_time} - {exam.end_time}</span>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className={`p-1.5 rounded-lg ${isDark ? "bg-pink-500/10" : "bg-pink-50"}`}><MapPinIcon className={`w-4 h-4 ${isDark ? "text-pink-400" : "text-pink-500"}`} /></div>
                                <span className={`text-sm font-bold ${isDark ? "text-pink-400" : "text-pink-600"}`}>{exam.room}</span>
                              </div>
                            </div>
                          </div>
                          
                          {!isConfirmed ? (
                            <button
                              onClick={() => handleConfirmAttendance(exam.id)}
                              disabled={confirmingExamId === exam.id}
                              className={`w-full mt-7 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5 ${
                                confirmingExamId === exam.id ? "opacity-60 cursor-not-allowed" : ""
                              }`}
                            >
                              {confirmingExamId === exam.id ? (
                                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                              ) : (
                                <CheckBadgeIcon className="w-4 h-4" />
                              )}
                              {confirmingExamId === exam.id ? "Confirming..." : "Confirm My Attendance"}
                            </button>
                          ) : (
                            <div className={`w-full mt-7 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 ${isDark ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                              <CheckBadgeIcon className="w-4 h-4 text-emerald-500" /> 
                              Attendance Confirmed
                            </div>
                          )}
                        </div>
                      </div>
                    );})}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Delete Schedule Confirmation Modal */}
      {showDeleteScheduleModal && (
        <div 
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-200"
        >
          <div 
            className="absolute inset-0"
            onClick={() => !deletingSchedule && setShowDeleteScheduleModal(false)}
          />
          <div className={`relative p-5 sm:p-8 rounded-2xl sm:rounded-3xl shadow-2xl max-w-md w-full transform transition-all scale-100 ${isDark ? "bg-slate-800 border border-slate-700" : "bg-white border border-slate-200"}`}>
            <button
              type="button"
              onClick={() => setShowDeleteScheduleModal(false)}
              disabled={deletingSchedule}
              aria-label="Close dialog"
              className={`absolute top-4 right-4 p-1.5 rounded-lg transition ${
                isDark ? "hover:bg-slate-700 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
              }`}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
            <div className="flex flex-col items-center text-center">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-4 sm:mb-6 bg-red-100 dark:bg-red-900/50 shadow-lg shadow-red-200/50 dark:shadow-red-900/20">
                <TrashIcon className="w-7 h-7 sm:w-8 sm:h-8 text-red-600 dark:text-red-400" />
              </div>
              <h3 className={`text-xl sm:text-2xl font-bold mb-2 sm:mb-3 ${isDark ? "text-white" : "text-slate-900"}`}>
                Delete My Schedule?
              </h3>
              <p className={`mb-6 sm:mb-8 text-xs sm:text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-500"}`}>
                Are you sure you want to delete your uploaded teaching schedule? Doing so will clear all blocked slots and revert to an empty schedule, notifying the administrator. This action is permanent.
              </p>
              <div className="flex flex-col-reverse sm:flex-row gap-2.5 sm:gap-4 w-full">
                <button
                  type="button"
                  onClick={() => setShowDeleteScheduleModal(false)}
                  disabled={deletingSchedule}
                  className={`w-full py-3 sm:py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95 disabled:opacity-55 ${isDark ? "bg-slate-700 hover:bg-slate-600 text-white" : "bg-slate-100 hover:bg-slate-200 text-slate-800"}`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeleteSchedule}
                  disabled={deletingSchedule}
                  className="w-full py-3 sm:py-3.5 rounded-xl font-bold text-sm bg-red-600 hover:bg-red-700 text-white transition-all shadow-lg shadow-red-600/30 active:scale-95 disabled:opacity-55 flex items-center justify-center gap-2"
                >
                  {deletingSchedule ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
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
