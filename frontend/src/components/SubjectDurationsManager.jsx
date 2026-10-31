import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  SparklesIcon,
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  ArrowPathIcon,
  AcademicCapIcon,
  BookmarkSquareIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  BookOpenIcon,
  TagIcon,
  CheckIcon,
  ClockIcon,
  ArrowsPointingInIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import { useToast } from "../context/ToastContext";
import api from "../api";

const COLLEGE_TERMS = ["All", "Prelim", "Midterm", "Pre-Final", "Final"];
const SHS_TERMS = ["All", "ST1", "ST2", "T1"];

const formatTime12 = (timeStr) => {
  if (!timeStr) return "";
  const parts = String(timeStr).split(":");
  let h = parseInt(parts[0], 10);
  const m = parts[1] || "00";
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${String(h).padStart(2, "0")}:${m} ${ampm}`;
};

const addMinutesToTime = (timeStr, minutes) => {
  if (!timeStr) return "08:45";
  const [hStr, mStr] = String(timeStr).split(":");
  const totalMin = (parseInt(hStr, 10) || 0) * 60 + (parseInt(mStr, 10) || 0) + (parseInt(minutes, 10) || 75);
  const newH = Math.floor(totalMin / 60) % 24;
  const newM = totalMin % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
};

const getStandardSlotsForDuration = (durMins) => {
  const dur = parseInt(durMins, 10) || 75;
  const breakMin = 15;
  const startHour = 7;
  const startMin = 30;
  const endLimitMin = 18 * 60; // 6:00 PM
  const slots = [];
  let cur = startHour * 60 + startMin;
  while (cur + dur <= endLimitMin) {
    const end = cur + dur;
    const startStr = `${String(Math.floor(cur / 60)).padStart(2, "0")}:${String(cur % 60).padStart(2, "0")}`;
    const endStr = `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
    slots.push({ start: startStr, end: endStr });
    cur = end + breakMin;
  }
  return slots;
};

// ─── Add / Edit Subject Modal ─────────────────────────────────────────────────
function SubjectModal({ open, onClose, onSave, courses, yearLevels, departments = [], initial }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isEdit = !!initial;
  const [form, setForm] = useState({
    code: "", name: "", course_id: "", year_level_id: "",
    semester: 1, term: "All", category: "major", exam_type: "written", duration_minutes: 75,
    department_code: "", program_ids: [],
    is_fixed_timeslot: false, fixed_day: 1, fixed_start_time: "07:30", fixed_end_time: "08:45",
  });
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  const selectedCourse = courses.find((c) => String(c.id) === String(form.course_id));
  const isSHS = selectedCourse?.category === "SHS" || form.department_code === "SHS";
  const termOptions = isSHS ? SHS_TERMS : COLLEGE_TERMS;

  const filteredYears = useMemo(() => {
    if (!selectedCourse) return yearLevels;
    return isSHS
      ? yearLevels.filter((y) => y.name.includes("Grade"))
      : yearLevels.filter((y) => !y.name.includes("Grade"));
  }, [selectedCourse, yearLevels, isSHS]);

  useEffect(() => {
    if (open) {
      if (initial) {
        const initialPrograms = initial.program_ids && initial.program_ids.length > 0
          ? initial.program_ids
          : (initial.course_id ? [initial.course_id] : []);
        setForm({
          code: initial.code || "", name: initial.name || "",
          course_id: initial.course_id || "", year_level_id: initial.year_level_id || "",
          semester: initial.semester || 1, term: initial.term || "All",
          category: initial.category || "major", exam_type: initial.exam_type || "written",
          duration_minutes: initial.duration_minutes || 75,
          department_code: initial.department_code || (initial.course_category === "SHS" ? "SHS" : "GE"),
          program_ids: initialPrograms,
          is_fixed_timeslot: Boolean(initial.is_fixed_timeslot),
          fixed_day: initial.fixed_day || 1,
          fixed_start_time: initial.fixed_start_time || "07:30",
          fixed_end_time: initial.fixed_end_time || addMinutesToTime(initial.fixed_start_time || "07:30", initial.duration_minutes || 75),
        });
      } else {
        const defaultDept = departments.length > 0 ? departments[0].code : "GE";
        setForm({
          code: "", name: "", course_id: "", year_level_id: "", semester: 1, term: "All",
          category: "major", exam_type: "written", duration_minutes: 75,
          department_code: defaultDept, program_ids: [],
          is_fixed_timeslot: false, fixed_day: 1, fixed_start_time: "07:30", fixed_end_time: "08:45",
        });
      }
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open, initial, departments]);

  useEffect(() => {
    if (isSHS && !SHS_TERMS.includes(form.term)) setForm((f) => ({ ...f, term: "ST1" }));
    else if (!isSHS && !COLLEGE_TERMS.includes(form.term)) setForm((f) => ({ ...f, term: "Midterm" }));
  }, [isSHS]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.course_id) return;
    setSaving(true);
    const progIds = Array.from(new Set([
      ...(form.program_ids || []).map(Number),
      ...(form.course_id ? [Number(form.course_id)] : [])
    ])).filter(Boolean);

    try {
      await onSave({
        ...form,
        course_id: Number(form.course_id),
        year_level_id: form.year_level_id ? Number(form.year_level_id) : null,
        semester: Number(form.semester),
        duration_minutes: Number(form.duration_minutes),
        department_code: form.department_code || null,
        program_ids: progIds,
        is_fixed_timeslot: Boolean(form.is_fixed_timeslot),
        fixed_day: form.is_fixed_timeslot ? Number(form.fixed_day) : null,
        fixed_start_time: form.is_fixed_timeslot ? form.fixed_start_time : null,
        fixed_end_time: form.is_fixed_timeslot ? form.fixed_end_time : null,
      });
      onClose();
    } catch { } finally { setSaving(false); }
  };

  if (!open) return null;

  const inp = `w-full px-3 py-2 rounded-xl text-sm border outline-none transition focus:ring-2 focus:ring-blue-500/40 ${
    isDark
      ? "bg-slate-800/80 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500"
      : "bg-white border-slate-200 text-slate-900 placeholder-slate-400 focus:border-blue-500"
  }`;

  const lbl = `block text-xs font-bold uppercase tracking-wider mb-1 ${isDark ? "text-slate-400" : "text-slate-500"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-xl rounded-2xl shadow-2xl border overflow-hidden ${isDark ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"}`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? "border-slate-700" : "border-slate-100"}`}>
          <div className="flex items-center gap-2">
            <BookOpenIcon className="w-5 h-5 text-blue-500" />
            <h2 className={`font-bold text-base ${isDark ? "text-white" : "text-slate-900"}`}>
              {isEdit ? "Edit Subject" : "Add New Subject"}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white" aria-label="Close modal">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl} htmlFor="subjectdurationsmanager-field-1">Subject Name <span className="text-red-500">*</span></label>
              <input ref={nameRef} type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Fundamentals of Accounting" className={inp} required id="subjectdurationsmanager-field-1" aria-label="Subject Name" />
            </div>
            <div>
              <label className={lbl} htmlFor="subjectdurationsmanager-field-2">Subject Code</label>
              <input type="text" value={form.code} onChange={(e) => set("code", e.target.value)}
                placeholder="Auto-generated if blank" className={inp} id="subjectdurationsmanager-field-2" aria-label="Subject Code" />
            </div>
            <div>
              <label className={lbl} htmlFor="subjectdurationsmanager-field-3">Exam Type</label>
              <select value={form.exam_type} onChange={(e) => set("exam_type", e.target.value)} className={inp} id="subjectdurationsmanager-field-3" aria-label="Exam Type">
                <option value="written">Written</option>
                <option value="practical">Practical (No Exam)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} htmlFor="subjectdurationsmanager-field-4">Department / Program Group <span className="text-red-500">*</span></label>
              <select
                value={form.department_code}
                onChange={(e) => set("department_code", e.target.value)}
                className={inp}
                required id="subjectdurationsmanager-field-4" aria-label="Department / Program Group">
                <option value="">Select Department...</option>
                {departments.map((dept) => (
                  <option key={dept.code} value={dept.code}>
                    {dept.name} ({dept.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl} htmlFor="subjectdurationsmanager-field-5">Primary Course / Strand <span className="text-red-500">*</span></label>
              <select
                value={form.course_id}
                onChange={(e) => {
                  const cid = e.target.value;
                  set("course_id", cid);
                  if (cid && !form.program_ids.includes(Number(cid))) {
                    set("program_ids", [...form.program_ids, Number(cid)]);
                  }
                }}
                className={inp}
                required id="subjectdurationsmanager-field-5" aria-label="Primary Course / Strand">
                <option value="">Select course...</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.category})</option>
                ))}
              </select>
            </div>
          </div>

          {/* Multiple Program Assignment (Shared / GE Subjects) */}
          <div className={`p-3.5 rounded-xl border text-xs space-y-2 ${isDark ? "bg-slate-800/50 border-slate-700" : "bg-slate-50 border-slate-200"}`}>
            <div className="flex items-center justify-between">
              <div className={`font-bold uppercase tracking-wider text-xs ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Multi-Program Assignment (Shared / GE Subjects)
              </div>
              <span className="text-xs text-slate-400">
                {form.program_ids.length} program{form.program_ids.length !== 1 ? "s" : ""} assigned
              </span>
            </div>
            <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Assign this subject to multiple programs/courses when shared across curricula (e.g., General Education subjects).
            </p>
            {/* Quick bulk selection buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              <button
                type="button"
                onClick={() => {
                  const collegeIds = courses.filter((c) => c.category === "College").map((c) => c.id);
                  const primaryId = form.course_id ? Number(form.course_id) : null;
                  const combined = Array.from(new Set([...form.program_ids, ...collegeIds, ...(primaryId ? [primaryId] : [])]));
                  set("program_ids", combined);
                }}
                className={`px-2 py-0.5 rounded text-xs font-semibold border transition ${
                  isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600" : "bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-sm"
                }`}
              >
                + All College
              </button>
              <button
                type="button"
                onClick={() => {
                  const shsIds = courses.filter((c) => c.category === "SHS").map((c) => c.id);
                  const primaryId = form.course_id ? Number(form.course_id) : null;
                  const combined = Array.from(new Set([...form.program_ids, ...shsIds, ...(primaryId ? [primaryId] : [])]));
                  set("program_ids", combined);
                }}
                className={`px-2 py-0.5 rounded text-xs font-semibold border transition ${
                  isDark ? "bg-slate-700 hover:bg-slate-600 text-slate-200 border-slate-600" : "bg-white hover:bg-slate-100 text-slate-700 border-slate-300 shadow-sm"
                }`}
              >
                + All SHS
              </button>
              <button
                type="button"
                onClick={() => {
                  const primaryId = form.course_id ? Number(form.course_id) : null;
                  set("program_ids", primaryId ? [primaryId] : []);
                }}
                className={`px-2 py-0.5 rounded text-xs font-semibold border transition ${
                  isDark ? "hover:bg-slate-700 text-slate-400 border-slate-700" : "hover:bg-slate-100 text-slate-500 border-slate-300"
                }`}
              >
                Reset
              </button>
            </div>

            <div className="max-h-32 overflow-y-auto grid grid-cols-2 gap-1.5 pt-1">
              {courses.map((c) => {
                const isPrimary = String(form.course_id) === String(c.id);
                const isChecked = form.program_ids.includes(c.id) || isPrimary;
                return (
                  <label key={c.id} className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer text-xs transition ${
                    isChecked
                      ? isDark ? "bg-blue-950/40 text-blue-300 border border-blue-800/60" : "bg-blue-50 text-blue-900 border border-blue-200"
                      : isDark ? "hover:bg-slate-700/50 text-slate-400" : "hover:bg-slate-100 text-slate-600"
                  }`}>
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={isPrimary}
                      onChange={(e) => {
                        const cid = c.id;
                        if (e.target.checked) {
                          set("program_ids", [...form.program_ids, cid]);
                        } else {
                          set("program_ids", form.program_ids.filter((id) => id !== cid));
                        }
                      }}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="truncate">{c.name} ({c.category})</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} htmlFor="subjectdurationsmanager-field-6">Year Level</label>
              <select value={form.year_level_id} onChange={(e) => set("year_level_id", e.target.value)} className={inp} id="subjectdurationsmanager-field-6" aria-label="Year Level">
                <option value="">Select year...</option>
                {filteredYears.map((y) => (<option key={y.id} value={y.id}>{y.name}</option>))}
              </select>
            </div>
            <div>
              <label className={lbl} htmlFor="subjectdurationsmanager-field-7">Semester</label>
              <select value={form.semester} onChange={(e) => set("semester", e.target.value)} className={inp} id="subjectdurationsmanager-field-7" aria-label="Semester">
                <option value={1}>1st Semester</option>
                <option value={2}>2nd Semester</option>
                {isSHS && <option value={3}>3rd Semester</option>}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl} htmlFor="subjectdurationsmanager-field-8">Category</label>
              <select value={form.category} onChange={(e) => {
                const cat = e.target.value;
                set("category", cat);
                if (cat === "general" && !form.department_code) {
                  set("department_code", "GE");
                }
              }} className={inp} id="subjectdurationsmanager-field-8" aria-label="Category">
                <option value="major">Major Subject</option>
                <option value="general">General Education / Minor</option>
              </select>
            </div>
            <div>
              <label className={lbl} htmlFor="subjectdurationsmanager-field-9">Exam Term</label>
              <select value={form.term} onChange={(e) => set("term", e.target.value)} className={inp} id="subjectdurationsmanager-field-9" aria-label="Exam Term">
                {termOptions.map((t) => (
                  <option key={t} value={t}>{t === "All" ? "All Terms" : t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl} htmlFor="subjectdurationsmanager-field-10">Exam Duration</label>
              <select
                value={form.duration_minutes}
                onChange={(e) => {
                  const newDur = Number(e.target.value);
                  setForm((f) => ({
                    ...f,
                    duration_minutes: newDur,
                    fixed_end_time: addMinutesToTime(f.fixed_start_time, newDur),
                  }));
                }}
                className={inp} id="subjectdurationsmanager-field-10" aria-label="Exam Duration">
                <option value={60}>1h 00m (60 mins)</option>
                <option value={75}>1h 15m (75 mins - Standard)</option>
                <option value={90}>1h 30m (90 mins)</option>
                <option value={120}>2h 00m (120 mins)</option>
                <option value={150}>2h 30m (150 mins)</option>
                <option value={180}>3h 00m (180 mins)</option>
              </select>
            </div>
          </div>

          {/* Time Slot Scheduling Policy */}
          <div className={`p-4 rounded-xl border space-y-3.5 ${
            isDark ? "bg-slate-800/60 border-slate-700" : "bg-slate-50 border-slate-200"
          }`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-blue-500" />
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-200" : "text-slate-700"}`}>
                  Time Slot Scheduling Policy
                </span>
              </div>
              {form.is_fixed_timeslot && (
                <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  Fixed Slot Active
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set("is_fixed_timeslot", false)}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  !form.is_fixed_timeslot
                    ? isDark
                      ? "bg-blue-950/40 border-blue-500 text-white shadow-sm ring-1 ring-blue-500/30"
                      : "bg-blue-50 border-blue-500 text-blue-950 shadow-sm ring-1 ring-blue-500/30"
                    : isDark
                      ? "bg-slate-800/40 border-slate-700 text-slate-400 hover:border-slate-600"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                    !form.is_fixed_timeslot ? "border-blue-500 bg-blue-500" : "border-slate-400"
                  }`}>
                    {!form.is_fixed_timeslot && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="text-xs font-bold">Follow Distribution Rules</span>
                </div>
                <p className="text-xs mt-1.5 opacity-80 leading-snug">
                  Automatic scheduling adhering to GE/Major rules across Days 1–4.
                </p>
              </button>

              <button
                type="button"
                onClick={() => set("is_fixed_timeslot", true)}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                  form.is_fixed_timeslot
                    ? isDark
                      ? "bg-amber-950/40 border-amber-500 text-white shadow-sm ring-1 ring-amber-500/30"
                      : "bg-amber-50 border-amber-500 text-amber-950 shadow-sm ring-1 ring-amber-500/30"
                    : isDark
                      ? "bg-slate-800/40 border-slate-700 text-slate-400 hover:border-slate-600"
                      : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                    form.is_fixed_timeslot ? "border-amber-500 bg-amber-500" : "border-slate-400"
                  }`}>
                    {form.is_fixed_timeslot && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  <span className="text-xs font-bold">Fixed Time Slot</span>
                </div>
                <p className="text-xs mt-1.5 opacity-80 leading-snug">
                  Strictly schedule on a specific day & time slot. Excess sections spill over to next slot.
                </p>
              </button>
            </div>

            {form.is_fixed_timeslot && (
              <div className={`p-3.5 rounded-xl border space-y-3.5 animate-in fade-in duration-200 ${
                isDark ? "bg-slate-900/60 border-slate-700" : "bg-white border-slate-200"
              }`}>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className={lbl} htmlFor="subjectdurationsmanager-field-11">Exam Day <span className="text-red-500">*</span></label>
                    <select
                      value={form.fixed_day}
                      onChange={(e) => set("fixed_day", Number(e.target.value))}
                      className={inp} id="subjectdurationsmanager-field-11" aria-label="Exam Day">
                      <option value={1}>Exam Day 1</option>
                      <option value={2}>Exam Day 2</option>
                      <option value={3}>Exam Day 3</option>
                      <option value={4}>Exam Day 4</option>
                    </select>
                  </div>
                  <div>
                    <label className={lbl} htmlFor="subjectdurationsmanager-field-12">Start Time <span className="text-red-500">*</span></label>
                    <input
                      type="time"
                      value={form.fixed_start_time}
                      onChange={(e) => {
                        const newStart = e.target.value;
                        set("fixed_start_time", newStart);
                        set("fixed_end_time", addMinutesToTime(newStart, form.duration_minutes));
                      }}
                      className={inp}
                      required id="subjectdurationsmanager-field-12" aria-label="Start Time" />
                  </div>
                  <div>
                    <label className={lbl} htmlFor="subjectdurationsmanager-field-13">End Time <span className="text-red-500">*</span></label>
                    <input
                      type="time"
                      value={form.fixed_end_time}
                      onChange={(e) => set("fixed_end_time", e.target.value)}
                      className={inp}
                      required id="subjectdurationsmanager-field-13" aria-label="End Time" />
                  </div>
                </div>

                {/* Quick preset chips */}
                <div>
                  <div className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                    Standard Presets ({form.duration_minutes}m duration)
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {getStandardSlotsForDuration(form.duration_minutes).map((slot, sIdx) => {
                      const isSelected = form.fixed_start_time === slot.start && form.fixed_end_time === slot.end;
                      return (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => {
                            set("fixed_start_time", slot.start);
                            set("fixed_end_time", slot.end);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                            isSelected
                              ? "bg-amber-500 text-white border-amber-600 shadow-sm"
                              : isDark
                                ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                          }`}
                        >
                          {formatTime12(slot.start)} - {formatTime12(slot.end)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Room Overflow Policy Note */}
                <div className={`p-2.5 rounded-lg text-xs leading-relaxed flex items-start gap-2 ${
                  isDark ? "bg-amber-950/20 text-amber-300/90 border border-amber-800/40" : "bg-amber-50/80 text-amber-900 border border-amber-200"
                }`}>
                  <span className="font-bold text-amber-500 mt-0.5">Room Policy:</span>
                  <span>
                    When sections for this subject exceed total available exam rooms in this slot (e.g. shared GE subjects taken by all programs), the scheduler will fill this slot to capacity and automatically spill excess sections into the <strong>next consecutive time slot</strong>.
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className={`p-3 rounded-xl border text-xs ${isDark ? "bg-blue-950/20 border-blue-800/40 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-700"}`}>
            <strong>Tip:</strong> The <em>Department</em> links this subject to the department administrator, and multiple programs can take this subject.
          </div>
        </form>

        <div className={`flex items-center justify-end gap-3 px-6 py-4 border-t ${isDark ? "border-slate-700" : "border-slate-100"}`}>
          <button type="button" onClick={onClose} disabled={saving}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${isDark ? "bg-slate-800 hover:bg-slate-700 text-slate-300" : "bg-slate-100 hover:bg-slate-200 text-slate-700"}`}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving || !form.name.trim() || !form.course_id}
            className="px-5 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition disabled:opacity-50 flex items-center gap-2">
            {saving ? <ArrowPathIcon className="w-4 h-4 animate-spin" /> : <CheckIcon className="w-4 h-4" />}
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Add Subject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SubjectDurationsManager() {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { showSuccess, showError } = useToast();

  const [subjects, setSubjects] = useState([]);
  const [courses, setCourses] = useState([]);
  const [yearLevels, setYearLevels] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [localDurations, setLocalDurations] = useState({});
  const [localTerms, setLocalTerms] = useState({});
  const [localCategories, setLocalCategories] = useState({});

  const [departmentFilter, setDepartmentFilter] = useState("All");
  const [courseFilter, setCourseFilter] = useState("All");
  const [yearFilter, setYearFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [termFilter, setTermFilter] = useState("All");
  const [slotPolicyFilter, setSlotPolicyFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkDuration, setBulkDuration] = useState(75);
  const [modal, setModal] = useState({ open: false, subject: null });
  const [consolidating, setConsolidating] = useState(false);

  const handleConsolidateShared = async () => {
    if (!window.confirm("Consolidate shared subjects across programs? Identical minor/GE and common major subjects will be merged into single master records with multi-program assignments. All section teaching assignments and exams will be safely preserved.")) {
      return;
    }
    setConsolidating(true);
    try {
      const res = await api.post("/catalog/subjects/consolidate-shared");
      showSuccess(res.data?.message || "Consolidated shared subjects successfully!");
      await fetchSubjects();
    } catch (err) {
      showError(err.response?.data?.detail || "Failed to consolidate subjects");
    } finally {
      setConsolidating(false);
    }
  };

  const fetchMetadata = async () => {
    try {
      const [cRes, yRes, dRes] = await Promise.all([
        api.get("/catalog/courses"),
        api.get("/catalog/year-levels"),
        api.get("/catalog/departments"),
      ]);
      setCourses(cRes.data || []);
      setYearLevels(yRes.data || []);
      setDepartments(dRes.data || []);
    } catch (err) { console.error("Failed to fetch catalog metadata:", err); }
  };

  const fetchSubjects = async () => {
    setLoading(true);
    try {
      const res = await api.get("/catalog/subjects/durations");
      const data = res.data || [];
      setSubjects(data);
      const durMap = {}, termMap = {}, catMap = {};
      data.forEach((s) => {
        durMap[s.id] = s.duration_minutes || 75;
        termMap[s.id] = s.term || "All";
        catMap[s.id] = s.category || "major";
      });
      setLocalDurations(durMap);
      setLocalTerms(termMap);
      setLocalCategories(catMap);
    } catch (err) {
      console.error("Failed to load subjects:", err);
      showError("Failed to load subjects");
    } finally { setLoading(false); }
  };

  useEffect(() => { fetchMetadata(); fetchSubjects(); }, []);

  const formatDur = (mins) => {
    const m = parseInt(mins, 10) || 75;
    const h = Math.floor(m / 60), r = m % 60;
    if (h > 0 && r > 0) return `${h}h ${r}m`;
    if (h > 0) return `${h}h 00m`;
    return `${r}m`;
  };

  const hasDraftChanges = (sub) =>
    Number(localDurations[sub.id]) !== Number(sub.duration_minutes) ||
    localTerms[sub.id] !== (sub.term || "All") ||
    localCategories[sub.id] !== (sub.category || "major");

  const handleSaveIndividual = async (sub) => {
    setSavingId(sub.id);
    try {
      await api.put(`/catalog/subjects/${sub.id}`, {
        duration_minutes: parseInt(localDurations[sub.id], 10),
        term: localTerms[sub.id],
        category: localCategories[sub.id],
      });
      setSubjects((prev) => prev.map((s) =>
        s.id === sub.id
          ? { ...s, duration_minutes: parseInt(localDurations[sub.id], 10), term: localTerms[sub.id], category: localCategories[sub.id] }
          : s
      ));
      showSuccess("Subject updated");
    } catch (err) {
      showError(err.response?.data?.detail || "Failed to update subject");
    } finally { setSavingId(null); }
  };

  const handleModalSave = async (formData) => {
    const isEdit = !!modal.subject;
    try {
      if (isEdit) {
        await api.put(`/catalog/subjects/${modal.subject.id}`, formData);
        showSuccess("Subject updated");
      } else {
        await api.post("/catalog/subjects", formData);
        showSuccess("Subject added");
      }
      await fetchSubjects();
    } catch (err) {
      showError(err.response?.data?.detail || "Failed to save subject");
      throw err;
    }
  };

  const handleDelete = async (sub) => {
    if (!window.confirm(`Delete subject "${sub.name}"?\nThis also removes any draft exams using it.`)) return;
    setDeletingId(sub.id);
    try {
      await api.delete(`/catalog/subjects/${sub.id}`);
      showSuccess(`"${sub.name}" deleted.`);
      setSubjects((prev) => prev.filter((s) => s.id !== sub.id));
    } catch (err) {
      showError(err.response?.data?.detail || "Failed to delete subject");
    } finally { setDeletingId(null); }
  };

  const handleApplyPreset = async (presetKey, label) => {
    if (!window.confirm(`Apply "${label}" preset to all subjects?`)) return;
    setBulkApplying(true);
    try {
      const res = await api.put("/catalog/subjects/bulk-duration", { preset: presetKey });
      showSuccess(res.data?.message || `Preset applied!`);
      await fetchSubjects();
    } catch (err) {
      showError(err.response?.data?.detail || "Failed to apply preset");
    } finally { setBulkApplying(false); }
  };

  const handleApplyBulkToFiltered = async () => {
    if (filteredSubjects.length === 0) { showError("No subjects matched"); return; }
    if (!window.confirm(`Apply ${formatDur(bulkDuration)} to ${filteredSubjects.length} subjects?`)) return;
    setBulkApplying(true);
    try {
      const res = await api.put("/catalog/subjects/bulk-duration", {
        subject_ids: filteredSubjects.map((s) => s.id),
        duration_minutes: parseInt(bulkDuration, 10),
      });
      showSuccess(res.data?.message || "Updated!");
      await fetchSubjects();
    } catch (err) {
      showError(err.response?.data?.detail || "Failed");
    } finally { setBulkApplying(false); }
  };

  const filteredSubjects = useMemo(() => subjects.filter((sub) => {
    if (departmentFilter !== "All") {
      const match = sub.department_code === departmentFilter ||
        (departmentFilter === "College" && sub.course_category === "College") ||
        (departmentFilter === "SHS" && sub.course_category === "SHS");
      if (!match) return false;
    }
    if (courseFilter !== "All" && sub.course_name !== courseFilter) return false;
    if (yearFilter !== "All" && sub.year_level_name !== yearFilter) return false;
    if (categoryFilter !== "All" && sub.category !== categoryFilter) return false;
    if (termFilter !== "All" && sub.term !== termFilter) return false;
    if (slotPolicyFilter === "fixed" && !sub.is_fixed_timeslot) return false;
    if (slotPolicyFilter === "auto" && sub.is_fixed_timeslot) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!sub.name.toLowerCase().includes(q) &&
          !(sub.course_name || "").toLowerCase().includes(q) &&
          !(sub.code || "").toLowerCase().includes(q) &&
          !(sub.department_code || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [subjects, departmentFilter, courseFilter, yearFilter, categoryFilter, termFilter, slotPolicyFilter, searchQuery]);

  const stats = useMemo(() => {
    let major = 0, minor = 0, d75 = 0, d120 = 0, fixedCount = 0;
    subjects.forEach((s) => {
      if (s.category === "major") major++; else minor++;
      if (s.duration_minutes === 75) d75++; else if (s.duration_minutes === 120) d120++;
      if (s.is_fixed_timeslot) fixedCount++;
    });
    return { major, minor, d75, d120, fixedCount, total: subjects.length };
  }, [subjects]);

  const courseNames = useMemo(() => {
    const seen = new Set();
    return courses.filter((c) => { if (seen.has(c.name)) return false; seen.add(c.name); return true; });
  }, [courses]);

  const allTermsInData = useMemo(() => {
    const s = new Set(["All"]);
    subjects.forEach((sub) => { if (sub.term) s.add(sub.term); });
    return [...s];
  }, [subjects]);

  const selectCls = `w-full px-3 py-2 rounded-xl text-xs font-medium border outline-none transition ${
    isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"
  }`;

  const termBadgeCls = (t) => {
    const map = {
      ST1: "bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800/60",
      ST2: "bg-cyan-50 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800/60",
      T1: "bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800/60",
      Prelim: "bg-violet-50 dark:bg-violet-950/40 text-violet-800 dark:text-violet-300 border border-violet-300 dark:border-violet-800/60",
      Midterm: "bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800/60",
      "Pre-Final": "bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-800/60",
      Final: "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800/60",
    };
    return `px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider inline-flex items-center justify-center ${
      map[t] || (isDark ? "bg-slate-800 text-slate-300 border border-slate-700" : "bg-slate-100 text-slate-700 border border-slate-300")
    }`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>Subject Management</h2>
          <p className={`text-xs mt-0.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Set subject category (major/minor), exam term, and duration. Schedule generation uses <strong>term</strong> to filter which subjects to include.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleConsolidateShared}
            disabled={consolidating}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border transition ${
              isDark
                ? "bg-purple-950/40 text-purple-300 border-purple-800/60 hover:bg-purple-900/40"
                : "bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100 shadow-sm"
            } disabled:opacity-50`}
            title="Merge duplicate shared subjects into single multi-program entries and link across all sections"
          >
            <ArrowsPointingInIcon className={`w-4 h-4 ${consolidating ? "animate-spin" : ""}`} />
            {consolidating ? "Consolidating..." : "Consolidate Shared"}
          </button>
          <button
            onClick={() => setModal({ open: true, subject: null })}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow transition"
          >
            <PlusIcon className="w-4 h-4" /> Add Subject
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Subjects", value: stats.total, color: "text-slate-700 dark:text-slate-200" },
          { label: "Major Subjects", value: stats.major, color: "text-indigo-600 dark:text-indigo-400" },
          { label: "GE / Minor", value: stats.minor, color: "text-purple-600 dark:text-purple-400" },
          { label: "75-min Standard", value: stats.d75, color: "text-blue-600 dark:text-blue-400" },
          { label: "Fixed Time Slots", value: stats.fixedCount, color: "text-amber-600 dark:text-amber-400" },
        ].map((s) => (
          <div key={s.label} className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/60 border-slate-700" : "bg-white border-slate-200 shadow-sm"}`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Preset Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Preset 1 */}
        <div className={`p-5 rounded-2xl border flex flex-col justify-between transition-all duration-300 ${
          isDark ? "bg-slate-800/60 border-slate-700 hover:border-blue-500/50" : "bg-white border-slate-200 hover:border-blue-400 shadow-sm hover:shadow-md"
        }`}>
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500"><SparklesIcon className="w-5 h-5" /></span>
              <h3 className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-900"}`}>School Standard Preset</h3>
            </div>
            <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              Sets all subjects to <strong className="text-blue-500">1:15h (75 mins)</strong>.
            </p>
          </div>
          <div className={`mt-4 pt-3 border-t ${isDark ? "border-slate-700/60" : "border-slate-100"} flex items-center justify-between`}>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">1h 15m Universal</span>
            <button onClick={() => handleApplyPreset("school_defaults", "School Defaults")} disabled={bulkApplying}
              className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50">Apply</button>
          </div>
        </div>

        {/* Preset 2 */}
        <div className={`p-5 rounded-2xl border flex flex-col justify-between transition-all duration-300 ${
          isDark ? "bg-gradient-to-br from-indigo-950/30 to-purple-950/30 border-indigo-700/50 hover:border-indigo-500" : "bg-gradient-to-br from-indigo-50/50 to-purple-50/50 border-indigo-200 hover:border-indigo-400 shadow-sm hover:shadow-md"
        }`}>
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"><AcademicCapIcon className="w-5 h-5" /></span>
              <h3 className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-900"}`}>BSA Majors 2h Preset</h3>
            </div>
            <p className={`text-xs leading-relaxed ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              BSA major subjects to <strong className="text-indigo-500">2:00h (120 mins)</strong>, others 1:15h.
            </p>
          </div>
          <div className={`mt-4 pt-3 border-t ${isDark ? "border-indigo-800/40" : "border-indigo-100"} flex items-center justify-between`}>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">BSA 2h / Others 1h 15m</span>
            <button onClick={() => handleApplyPreset("bsa_majors_2h", "BSA Majors 2h")} disabled={bulkApplying}
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-50">Apply</button>
          </div>
        </div>

        {/* Bulk duration */}
        <div className={`p-5 rounded-2xl border flex flex-col justify-between ${isDark ? "bg-slate-800/60 border-slate-700" : "bg-white border-slate-200 shadow-sm"}`}>
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500"><AdjustmentsHorizontalIcon className="w-5 h-5" /></span>
              <h3 className={`font-bold text-sm ${isDark ? "text-white" : "text-slate-900"}`}>Bulk Update Filtered</h3>
            </div>
            <p className={`text-xs leading-relaxed mb-3 ${isDark ? "text-slate-400" : "text-slate-500"}`}>Apply custom duration to all <strong>filtered</strong> subjects.</p>
            <select value={bulkDuration} onChange={(e) => setBulkDuration(Number(e.target.value))}
              className={`w-full px-3 py-1.5 rounded-xl text-xs font-semibold border outline-none transition ${isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"}`} aria-label="Bulk Exam Duration">
              <option value={60}>1h 00m (60 mins)</option>
              <option value={75}>1h 15m (75 mins — Standard)</option>
              <option value={90}>1h 30m (90 mins)</option>
              <option value={120}>2h 00m (120 mins)</option>
              <option value={150}>2h 30m (150 mins)</option>
            </select>
          </div>
          <div className={`mt-4 pt-3 border-t ${isDark ? "border-slate-700/60" : "border-slate-100"} flex items-center justify-between`}>
            <span className={`text-xs font-medium ${isDark ? "text-slate-400" : "text-slate-500"}`}>{filteredSubjects.length} matched</span>
            <button onClick={handleApplyBulkToFiltered} disabled={bulkApplying || filteredSubjects.length === 0}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition disabled:opacity-40">Apply to Filtered</button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={`p-5 rounded-2xl border ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-white border-slate-200 shadow-sm"}`}>
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-700/60">
          <div className="relative flex-1 min-w-[240px]">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" placeholder="Search subject by name or code..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-sm border outline-none transition ${isDark ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500"}`} aria-label="Search subject by name or code" />
          </div>
          <button onClick={fetchSubjects} disabled={loading}
            className={`p-2 rounded-xl border transition ${isDark ? "text-slate-400 hover:text-white border-slate-700 hover:bg-slate-700" : "text-slate-400 hover:text-slate-700 border-slate-200 hover:bg-slate-50"}`}
            title="Refresh" aria-label="Refresh">
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4">
          <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1" htmlFor="subjectdurationsmanager-field-14">Department</label>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className={selectCls} id="subjectdurationsmanager-field-14" aria-label="Department">
              <option value="All">All Departments</option>
              {departments.map((d) => (
                <option key={d.code} value={d.code}>{d.name} ({d.code})</option>
              ))}
              <option value="College">All College</option>
              <option value="SHS">All Senior High</option>
            </select>
          </div>
          <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1" htmlFor="subjectdurationsmanager-field-15">Course</label>
            <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className={selectCls} id="subjectdurationsmanager-field-15" aria-label="Course">
              <option value="All">All Courses</option>
              {courseNames.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1" htmlFor="subjectdurationsmanager-field-16">Year Level</label>
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className={selectCls} id="subjectdurationsmanager-field-16" aria-label="Year Level">
              <option value="All">All Years</option>
              {yearLevels.map((y) => <option key={y.id} value={y.name}>{y.name}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1" htmlFor="subjectdurationsmanager-field-17">Category</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectCls} id="subjectdurationsmanager-field-17" aria-label="Category">
              <option value="All">All</option><option value="major">Major</option><option value="general">GE / Minor</option>
            </select>
          </div>
          <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1" htmlFor="subjectdurationsmanager-field-18">Term</label>
            <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className={selectCls} id="subjectdurationsmanager-field-18" aria-label="Term">
              {allTermsInData.map((t) => <option key={t} value={t}>{t === "All" ? "All Terms" : t}</option>)}
            </select>
          </div>
          <div><label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1" htmlFor="subjectdurationsmanager-field-19">Time Slot Policy</label>
            <select value={slotPolicyFilter} onChange={(e) => setSlotPolicyFilter(e.target.value)} className={selectCls} id="subjectdurationsmanager-field-19" aria-label="Time Slot Policy">
              <option value="All">All Policies</option>
              <option value="fixed">Fixed Slot Only</option>
              <option value="auto">Auto (Rules) Only</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-slate-800/40 border-slate-700" : "bg-white border-slate-200 shadow-sm"}`}>
        <div className={`p-4 border-b ${isDark ? "border-slate-700/60" : "border-slate-100"} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <BookOpenIcon className="w-4 h-4 text-blue-500" />
            <span className={`text-sm font-bold ${isDark ? "text-slate-200" : "text-slate-700"}`}>All Subjects</span>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
              {filteredSubjects.length} / {subjects.length}
            </span>
          </div>
          <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-400"}`}>Edit term & category inline, then Save</p>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
            <span className="text-xs font-medium">Loading subjects...</span>
          </div>
        ) : filteredSubjects.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <BookmarkSquareIcon className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm font-medium">No subjects found</p>
            <p className="text-xs mt-1 text-slate-500">Try adjusting filters or add a new subject</p>
          </div>
        ) : (
          <div className="w-full min-w-0 max-h-[620px] overflow-y-auto">
            <div className="space-y-3 p-3 md:hidden">
              {filteredSubjects.map((sub) => {
                const dDur = localDurations[sub.id] ?? sub.duration_minutes;
                const dTerm = localTerms[sub.id] ?? sub.term ?? "All";
                const dCat = localCategories[sub.id] ?? sub.category ?? "major";
                const hasChanges = hasDraftChanges(sub);
                const termOpts = sub.course_category === "SHS" ? SHS_TERMS : COLLEGE_TERMS;
                const fieldClass = `w-full min-h-11 rounded-lg border px-3 py-2 text-sm ${isDark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`;
                return (
                  <article key={sub.id} className={`space-y-3 rounded-xl border p-4 ${hasChanges
                    ? isDark ? "border-amber-800 bg-amber-900/10" : "border-amber-200 bg-amber-50/60"
                    : isDark ? "border-slate-700 bg-slate-800/50" : "border-slate-200 bg-white"
                    }`}>
                    <div>
                      <h3 className={`break-words font-semibold ${isDark ? "text-slate-100" : "text-slate-800"}`}>{sub.name}</h3>
                      <p className="mt-0.5 text-xs text-slate-500">{sub.code}</p>
                    </div>
                    <div className={`grid grid-cols-2 gap-x-3 gap-y-2 text-xs ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                      <p className="break-words"><span className="font-semibold">Course:</span> {sub.course_name} ({sub.course_category})</p>
                      <p><span className="font-semibold">Year:</span> {sub.year_level_name || "—"}</p>
                      <p><span className="font-semibold">Semester:</span> {sub.semester}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label className={`space-y-1 text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Category
                        <select value={dCat} onChange={(e) => setLocalCategories((p) => ({ ...p, [sub.id]: e.target.value }))} className={fieldClass}>
                          <option value="major">Major</option>
                          <option value="general">GE/Minor</option>
                        </select>
                      </label>
                      <label className={`space-y-1 text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Exam term
                        <select value={dTerm} onChange={(e) => setLocalTerms((p) => ({ ...p, [sub.id]: e.target.value }))} className={fieldClass}>
                          {termOpts.map((term) => <option key={term} value={term}>{term === "All" ? "All Terms" : term}</option>)}
                        </select>
                      </label>
                      <label className={`space-y-1 text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                        Duration
                        <select value={dDur} onChange={(e) => setLocalDurations((p) => ({ ...p, [sub.id]: Number(e.target.value) }))} className={fieldClass}>
                          <option value={60}>1:00 hour</option>
                          <option value={75}>1:15 hours</option>
                          <option value={90}>1:30 hours</option>
                          <option value={120}>2:00 hours</option>
                          <option value={150}>2:30 hours</option>
                          <option value={180}>3:00 hours</option>
                        </select>
                      </label>
                    </div>
                    <div className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                      sub.is_fixed_timeslot
                        ? isDark ? "bg-amber-950/20 border-amber-800/40 text-amber-300" : "bg-amber-50 border-amber-200 text-amber-900"
                        : isDark ? "bg-slate-800/40 border-slate-700 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"
                    }`}>
                      <div className="flex items-center gap-1.5">
                        <ClockIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="font-semibold">
                          {sub.is_fixed_timeslot
                            ? `Fixed Slot: Day ${sub.fixed_day || 1} • ${formatTime12(sub.fixed_start_time)} - ${formatTime12(sub.fixed_end_time)}`
                            : "Policy: Auto (Follows distribution rules)"}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setModal({ open: true, subject: sub })}
                        className="text-xs font-bold text-blue-500 hover:underline shrink-0"
                      >
                        Change
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
                      {hasChanges && (
                        <button onClick={() => handleSaveIndividual(sub)} disabled={savingId === sub.id} className="min-h-11 flex-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                          {savingId === sub.id ? "Saving…" : "Save"}
                        </button>
                      )}
                      <button onClick={() => setModal({ open: true, subject: sub })} className={`min-h-11 flex-1 rounded-lg border px-4 text-sm font-semibold ${isDark ? "border-slate-600 text-slate-200" : "border-slate-200 text-slate-700"}`}>Edit</button>
                      <button onClick={() => handleDelete(sub)} disabled={deletingId === sub.id} className="min-h-11 flex-1 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-600 disabled:opacity-50 dark:border-red-900/50 dark:text-red-400">Delete</button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1040px] text-left text-xs border-collapse">
              <thead className={`sticky top-0 z-10 text-xs font-bold uppercase tracking-wider border-b ${
                isDark ? "bg-slate-800/90 text-slate-400 border-slate-700 backdrop-blur-md" : "bg-slate-50 text-slate-500 border-slate-200"
              }`}>
                <tr>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Course</th>
                  <th className="py-3 px-4">Year</th>
                  <th className="py-3 px-4">Sem</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Exam Term</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Time Slot Policy</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-medium">
                {filteredSubjects.map((sub) => {
                  const dDur = localDurations[sub.id] ?? sub.duration_minutes;
                  const dTerm = localTerms[sub.id] ?? sub.term ?? "All";
                  const dCat = localCategories[sub.id] ?? sub.category ?? "major";
                  const hasChanges = hasDraftChanges(sub);
                  const isSHSCourse = sub.course_category === "SHS";
                  const termOpts = isSHSCourse ? SHS_TERMS : COLLEGE_TERMS;

                  return (
                    <tr key={sub.id} className={`transition-colors ${isDark ? "hover:bg-slate-700/20" : "hover:bg-slate-50/70"} ${hasChanges ? (isDark ? "bg-amber-900/10" : "bg-amber-50/60") : ""}`}>
                      <td className="py-3 px-4 max-w-[240px] whitespace-normal">
                        <div className={`font-semibold break-words ${isDark ? "text-slate-100" : "text-slate-800"}`}>{sub.name}</div>
                        <div className="text-xs text-slate-400">{sub.code}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wide border ${
                          sub.department_code === "GE"
                            ? "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800"
                            : sub.department_code === "ICT"
                            ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                        }`}>
                          {sub.department_code || sub.course_category || "—"}
                        </span>
                        {sub.program_names && sub.program_names.length > 1 && (
                          <div className="text-xs text-purple-600 dark:text-purple-400 font-semibold mt-0.5" title={sub.program_names.join(", ")}>
                            Shared ({sub.program_names.length} programs)
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>{sub.course_name}</span>
                        <div className="text-xs text-slate-400">{sub.course_category}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">{sub.year_level_name || "—"}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">{sub.semester}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <select value={dCat} onChange={(e) => setLocalCategories((p) => ({ ...p, [sub.id]: e.target.value }))}
                          className={`px-2 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border outline-none transition cursor-pointer ${
                            dCat === "major"
                              ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
                              : isDark ? "bg-slate-800 border-slate-700 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-600"
                          }`} aria-label="Subject Category">
                          <option value="major">Major</option>
                          <option value="general">GE/Minor</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <select value={dTerm} onChange={(e) => setLocalTerms((p) => ({ ...p, [sub.id]: e.target.value }))}
                          className={`px-2 py-1 rounded-lg text-xs font-bold border outline-none transition cursor-pointer ${isDark ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white border-slate-200 text-slate-700"}`} aria-label="Subject Exam Term">
                          {termOpts.map((t) => <option key={t} value={t}>{t === "All" ? "All Terms" : t}</option>)}
                        </select>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <select value={dDur} onChange={(e) => setLocalDurations((p) => ({ ...p, [sub.id]: Number(e.target.value) }))}
                          className={`px-2 py-1 rounded-lg text-xs font-semibold border outline-none transition cursor-pointer ${
                            dDur === 120 ? "border-purple-400 bg-purple-50/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                              : dDur === 75 ? "border-blue-400 bg-blue-50/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                              : isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"
                          }`} aria-label="Subject Exam Duration">
                          <option value={60}>1:00h</option>
                          <option value={75}>1:15h</option>
                          <option value={90}>1:30h</option>
                          <option value={120}>2:00h</option>
                          <option value={150}>2:30h</option>
                          <option value={180}>3:00h</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {sub.is_fixed_timeslot ? (
                          <button
                            type="button"
                            onClick={() => setModal({ open: true, subject: sub })}
                            className={`inline-flex flex-col items-start px-2.5 py-1 rounded-xl text-left transition border ${
                              isDark
                                ? "bg-amber-950/30 hover:bg-amber-900/40 text-amber-300 border-amber-800/60"
                                : "bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200"
                            }`}
                            title="Click to edit fixed slot"
                          >
                            <div className="flex items-center gap-1 font-bold text-xs uppercase tracking-wider">
                              <ClockIcon className="w-3 h-3 text-amber-500" />
                              <span>Day {sub.fixed_day || 1}</span>
                            </div>
                            <div className="text-xs font-semibold mt-0.5">
                              {formatTime12(sub.fixed_start_time)} – {formatTime12(sub.fixed_end_time)}
                            </div>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setModal({ open: true, subject: sub })}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold border transition ${
                              isDark
                                ? "bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 border-slate-700"
                                : "bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200"
                            }`}
                            title="Click to set fixed slot"
                          >
                            <span>Auto (Rules)</span>
                          </button>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {hasChanges && (
                            <button onClick={() => handleSaveIndividual(sub)} disabled={savingId === sub.id}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition disabled:opacity-50">
                              {savingId === sub.id ? "Saving…" : "Save"}
                            </button>
                          )}
                          <button onClick={() => setModal({ open: true, subject: sub })}
                            className={`p-1.5 rounded-lg transition ${isDark ? "text-slate-400 hover:text-white hover:bg-slate-700" : "text-slate-400 hover:text-slate-700 hover:bg-slate-100"}`}
                            title="Edit" aria-label="Edit">
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(sub)} disabled={deletingId === sub.id}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-40"
                            title="Delete" aria-label="Delete">
                            {deletingId === sub.id ? <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" /> : <TrashIcon className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* Term legend */}
      <div className={`p-4 rounded-2xl border ${isDark ? "bg-slate-800/30 border-slate-700/60" : "bg-slate-50 border-slate-200"}`}>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <TagIcon className="w-3.5 h-3.5" /> Term Guide — Schedule Generation Filters Subjects By This
        </div>
        <div className="flex flex-wrap gap-2">
          {["All", "Prelim", "Midterm", "Pre-Final", "Final", "ST1", "ST2", "T1"].map((t) => (
            <span key={t} className={termBadgeCls(t)}>
              {t === "All" ? "All (always included)" : t}
            </span>
          ))}
        </div>
        <p className={`text-xs mt-3 ${isDark ? "text-slate-500" : "text-slate-400"}`}>
          When generating for a specific term (e.g. <strong>Midterm</strong>), only subjects assigned to that term — or <strong>All</strong> — are included.
          SHS uses <strong>ST1</strong>, <strong>ST2</strong>, <strong>T1</strong>; College uses <strong>Prelim</strong>, <strong>Midterm</strong>, <strong>Pre-Final</strong>, <strong>Final</strong>.
        </p>
      </div>

      {/* Modal */}
      <SubjectModal
        open={modal.open}
        onClose={() => setModal({ open: false, subject: null })}
        onSave={handleModalSave}
        courses={courses}
        yearLevels={yearLevels}
        departments={departments}
        initial={modal.subject}
      />
    </div>
  );
}
