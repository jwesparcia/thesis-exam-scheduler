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
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import { useToast } from "../context/ToastContext";
import api from "../api";

const COLLEGE_TERMS = ["All", "Prelim", "Midterm", "Pre-Final", "Final"];
const SHS_TERMS = ["All", "ST1", "ST2", "T1"];

// ─── Add / Edit Subject Modal ─────────────────────────────────────────────────
function SubjectModal({ open, onClose, onSave, courses, yearLevels, initial }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const isEdit = !!initial;
  const [form, setForm] = useState({
    code: "", name: "", course_id: "", year_level_id: "",
    semester: 1, term: "All", category: "major", exam_type: "written", duration_minutes: 75,
  });
  const [saving, setSaving] = useState(false);
  const nameRef = useRef(null);

  const selectedCourse = courses.find((c) => String(c.id) === String(form.course_id));
  const isSHS = selectedCourse?.category === "SHS";
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
        setForm({
          code: initial.code || "", name: initial.name || "",
          course_id: initial.course_id || "", year_level_id: initial.year_level_id || "",
          semester: initial.semester || 1, term: initial.term || "All",
          category: initial.category || "major", exam_type: initial.exam_type || "written",
          duration_minutes: initial.duration_minutes || 75,
        });
      } else {
        setForm({ code: "", name: "", course_id: "", year_level_id: "", semester: 1, term: "All", category: "major", exam_type: "written", duration_minutes: 75 });
      }
      setSaving(false);
      setTimeout(() => nameRef.current?.focus(), 50);
    }
  }, [open, initial]);

  useEffect(() => {
    if (isSHS && !SHS_TERMS.includes(form.term)) setForm((f) => ({ ...f, term: "ST1" }));
    else if (!isSHS && !COLLEGE_TERMS.includes(form.term)) setForm((f) => ({ ...f, term: "Midterm" }));
  }, [isSHS]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.course_id) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        course_id: Number(form.course_id),
        year_level_id: form.year_level_id ? Number(form.year_level_id) : null,
        semester: Number(form.semester),
        duration_minutes: Number(form.duration_minutes),
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
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={lbl}>Subject Name <span className="text-red-500">*</span></label>
              <input ref={nameRef} type="text" value={form.name} onChange={(e) => set("name", e.target.value)}
                placeholder="e.g. Fundamentals of Accounting" className={inp} required />
            </div>
            <div>
              <label className={lbl}>Subject Code</label>
              <input type="text" value={form.code} onChange={(e) => set("code", e.target.value)}
                placeholder="Auto-generated if blank" className={inp} />
            </div>
            <div>
              <label className={lbl}>Exam Type</label>
              <select value={form.exam_type} onChange={(e) => set("exam_type", e.target.value)} className={inp}>
                <option value="written">Written</option>
                <option value="practical">Practical (No Exam)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Course / Strand <span className="text-red-500">*</span></label>
              <select value={form.course_id} onChange={(e) => set("course_id", e.target.value)} className={inp} required>
                <option value="">Select course...</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.name} ({c.category})</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Year Level</label>
              <select value={form.year_level_id} onChange={(e) => set("year_level_id", e.target.value)} className={inp}>
                <option value="">Select year...</option>
                {filteredYears.map((y) => (<option key={y.id} value={y.id}>{y.name}</option>))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Semester</label>
              <select value={form.semester} onChange={(e) => set("semester", e.target.value)} className={inp}>
                <option value={1}>1st Semester</option>
                <option value={2}>2nd Semester</option>
                {isSHS && <option value={3}>3rd Semester</option>}
              </select>
            </div>
            <div>
              <label className={lbl}>Exam Term</label>
              <select value={form.term} onChange={(e) => set("term", e.target.value)} className={inp}>
                {termOptions.map((t) => (
                  <option key={t} value={t}>{t === "All" ? "All Terms" : t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Category</label>
              <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inp}>
                <option value="major">Major Subject</option>
                <option value="general">General Education / Minor</option>
              </select>
            </div>
            <div>
              <label className={lbl}>Exam Duration</label>
              <select value={form.duration_minutes} onChange={(e) => set("duration_minutes", e.target.value)} className={inp}>
                <option value={60}>1h 00m (60 mins)</option>
                <option value={75}>1h 15m (75 mins - Standard)</option>
                <option value={90}>1h 30m (90 mins)</option>
                <option value={120}>2h 00m (120 mins)</option>
                <option value={150}>2h 30m (150 mins)</option>
                <option value={180}>3h 00m (180 mins)</option>
              </select>
            </div>
          </div>

          <div className={`p-3 rounded-xl border text-xs ${isDark ? "bg-blue-950/20 border-blue-800/40 text-blue-300" : "bg-blue-50 border-blue-200 text-blue-700"}`}>
            <strong>Tip:</strong> The <em>Exam Term</em> controls which schedule generation this subject appears in.
            Subjects set to <em>All Terms</em> always appear.
            {isSHS && <> SHS uses <strong>ST1</strong>, <strong>ST2</strong>, <strong>T1</strong>.</>}
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
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkDuration, setBulkDuration] = useState(75);
  const [modal, setModal] = useState({ open: false, subject: null });

  const fetchMetadata = async () => {
    try {
      const [cRes, yRes] = await Promise.all([
        api.get("/catalog/courses"),
        api.get("/catalog/year-levels"),
      ]);
      setCourses(cRes.data || []);
      setYearLevels(yRes.data || []);
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
    if (departmentFilter !== "All" && sub.course_category !== departmentFilter) return false;
    if (courseFilter !== "All" && sub.course_name !== courseFilter) return false;
    if (yearFilter !== "All" && sub.year_level_name !== yearFilter) return false;
    if (categoryFilter !== "All" && sub.category !== categoryFilter) return false;
    if (termFilter !== "All" && sub.term !== termFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!sub.name.toLowerCase().includes(q) && !(sub.course_name || "").toLowerCase().includes(q) && !(sub.code || "").toLowerCase().includes(q)) return false;
    }
    return true;
  }), [subjects, departmentFilter, courseFilter, yearFilter, categoryFilter, termFilter, searchQuery]);

  const stats = useMemo(() => {
    let major = 0, minor = 0, d75 = 0, d120 = 0;
    subjects.forEach((s) => {
      if (s.category === "major") major++; else minor++;
      if (s.duration_minutes === 75) d75++; else if (s.duration_minutes === 120) d120++;
    });
    return { major, minor, d75, d120, total: subjects.length };
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
      ST1: "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300",
      ST2: "bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300",
      T1: "bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300",
      Prelim: "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300",
      Midterm: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300",
      "Pre-Final": "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
      Final: "bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300",
    };
    return `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
      map[t] || (isDark ? "bg-slate-700 text-slate-300" : "bg-slate-100 text-slate-600")
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
        <button
          onClick={() => setModal({ open: true, subject: null })}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow transition"
        >
          <PlusIcon className="w-4 h-4" /> Add Subject
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Subjects", value: stats.total, color: "text-slate-700 dark:text-slate-200" },
          { label: "Major Subjects", value: stats.major, color: "text-indigo-600 dark:text-indigo-400" },
          { label: "GE / Minor", value: stats.minor, color: "text-slate-500 dark:text-slate-400" },
          { label: "75-min Standard", value: stats.d75, color: "text-blue-600 dark:text-blue-400" },
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
              className={`w-full px-3 py-1.5 rounded-xl text-xs font-semibold border outline-none transition ${isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-800"}`}>
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
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-sm border outline-none transition ${isDark ? "bg-slate-800 border-slate-700 text-white focus:border-blue-500" : "bg-slate-50 border-slate-200 text-slate-900 focus:border-blue-500"}`} />
          </div>
          <button onClick={fetchSubjects} disabled={loading}
            className={`p-2 rounded-xl border transition ${isDark ? "text-slate-400 hover:text-white border-slate-700 hover:bg-slate-700" : "text-slate-400 hover:text-slate-700 border-slate-200 hover:bg-slate-50"}`}
            title="Refresh">
            <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-4">
          <div><label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Department</label>
            <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)} className={selectCls}>
              <option value="All">All</option><option value="College">College</option><option value="SHS">Senior High</option>
            </select>
          </div>
          <div><label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Course</label>
            <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)} className={selectCls}>
              <option value="All">All Courses</option>
              {courseNames.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div><label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Year Level</label>
            <select value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className={selectCls}>
              <option value="All">All Years</option>
              {yearLevels.map((y) => <option key={y.id} value={y.name}>{y.name}</option>)}
            </select>
          </div>
          <div><label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Category</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectCls}>
              <option value="All">All</option><option value="major">Major</option><option value="general">GE / Minor</option>
            </select>
          </div>
          <div><label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">Term</label>
            <select value={termFilter} onChange={(e) => setTermFilter(e.target.value)} className={selectCls}>
              {allTermsInData.map((t) => <option key={t} value={t}>{t === "All" ? "All Terms" : t}</option>)}
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
            <table className="w-full min-w-[900px] text-left text-xs border-collapse">
              <thead className={`sticky top-0 z-10 text-[11px] font-bold uppercase tracking-wider border-b ${
                isDark ? "bg-slate-800/90 text-slate-400 border-slate-700 backdrop-blur-md" : "bg-slate-50 text-slate-500 border-slate-200"
              }`}>
                <tr>
                  <th className="py-3 px-4">Subject</th>
                  <th className="py-3 px-4">Course</th>
                  <th className="py-3 px-4">Year</th>
                  <th className="py-3 px-4">Sem</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Exam Term</th>
                  <th className="py-3 px-4">Duration</th>
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
                        <div className="text-[10px] text-slate-400">{sub.code}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className={`font-semibold ${isDark ? "text-slate-300" : "text-slate-700"}`}>{sub.course_name}</span>
                        <div className="text-[10px] text-slate-400">{sub.course_category}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">{sub.year_level_name || "—"}</td>
                      <td className="py-3 px-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">{sub.semester}</td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <select value={dCat} onChange={(e) => setLocalCategories((p) => ({ ...p, [sub.id]: e.target.value }))}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider border outline-none transition cursor-pointer ${
                            dCat === "major"
                              ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
                              : isDark ? "bg-slate-800 border-slate-700 text-slate-400" : "bg-slate-100 border-slate-200 text-slate-600"
                          }`}>
                          <option value="major">Major</option>
                          <option value="general">GE/Minor</option>
                        </select>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <select value={dTerm} onChange={(e) => setLocalTerms((p) => ({ ...p, [sub.id]: e.target.value }))}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border outline-none transition cursor-pointer ${isDark ? "bg-slate-800 border-slate-700 text-slate-200" : "bg-white border-slate-200 text-slate-700"}`}>
                          {termOpts.map((t) => <option key={t} value={t}>{t === "All" ? "All Terms" : t}</option>)}
                        </select>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <select value={dDur} onChange={(e) => setLocalDurations((p) => ({ ...p, [sub.id]: Number(e.target.value) }))}
                          className={`px-2 py-1 rounded-lg text-[10px] font-semibold border outline-none transition cursor-pointer ${
                            dDur === 120 ? "border-purple-400 bg-purple-50/50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300"
                              : dDur === 75 ? "border-blue-400 bg-blue-50/50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
                              : isDark ? "bg-slate-800 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-800"
                          }`}>
                          <option value={60}>1:00h</option>
                          <option value={75}>1:15h</option>
                          <option value={90}>1:30h</option>
                          <option value={120}>2:00h</option>
                          <option value={150}>2:30h</option>
                          <option value={180}>3:00h</option>
                        </select>
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
                            title="Edit">
                            <PencilIcon className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDelete(sub)} disabled={deletingId === sub.id}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition disabled:opacity-40"
                            title="Delete">
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
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <TagIcon className="w-3.5 h-3.5" /> Term Guide — Schedule Generation Filters Subjects By This
        </p>
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
        initial={modal.subject}
      />
    </div>
  );
}
