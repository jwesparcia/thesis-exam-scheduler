import React, { useEffect, useMemo, useState } from "react";
import {
  ExclamationTriangleIcon,
  BuildingOfficeIcon,
  CheckCircleIcon,
  BuildingOffice2Icon,
  ArrowPathIcon,
  MagnifyingGlassIcon,
  TrashIcon,
  PencilSquareIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";
import { useToast } from "../context/ToastContext";
import { useUser } from "../context/userStore";
import api from "../api";

const statusLabels = {
  available: "Available",
  in_use: "In Use",
  conflict: "Conflict",
  rescheduled: "Has Rescheduled",
};

export default function RoomManagement({ isGenerating }) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const { showError, showSuccess } = useToast();
  const { user: currentUser } = useUser();
  const isAdmin = currentUser?.role === "admin" || currentUser?.role === "program_head";

  const [department, setDepartment] = useState("College");
  const [semester, setSemester] = useState(1);
  const [scheduleStatus, setScheduleStatus] = useState("all");
  const [roomStatus, setRoomStatus] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  // Add room modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [newRoomBuilding, setNewRoomBuilding] = useState("B");
  const [newRoomCapacity, setNewRoomCapacity] = useState(40);
  const [submitting, setSubmitting] = useState(false);

  // Edit room modal states
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [editCapacity, setEditCapacity] = useState(40);
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Delete room states
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Delete all rooms states
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  const handleOpenEdit = (room) => {
    setEditingRoom(room);
    setEditCapacity(room.capacity || 40);
    setShowEditModal(true);
  };

  const handleUpdateRoom = async (e) => {
    e.preventDefault();
    if (!editingRoom) return;
    if (isGenerating) {
      showError("Cannot edit rooms while schedule generation is ongoing");
      return;
    }
    const cap = parseInt(editCapacity, 10);
    if (!cap || cap <= 0) {
      showError("Capacity must be a positive number of seats");
      return;
    }
    setSubmittingEdit(true);
    try {
      const res = await api.put(`/exams/rooms/${editingRoom.id}`, {
        capacity: cap,
      });
      showSuccess(res.data?.message || `Room "${editingRoom.name}" capacity updated to ${cap} seats!`);
      setShowEditModal(false);
      setEditingRoom(null);
      fetchRoomStatus();
    } catch (err) {
      console.error("Failed to update room capacity", err);
      showError(err.response?.data?.detail || "Failed to update room capacity");
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleAddRoom = async (e) => {
    e.preventDefault();
    if (isGenerating) {
      showError("Cannot add rooms while schedule generation is ongoing");
      return;
    }
    if (!newRoomName.trim()) {
      showError("Room name is required");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/exams/rooms", {
        name: newRoomName.trim(),
        building: newRoomBuilding,
        capacity: newRoomCapacity,
      });
      showSuccess("Room created successfully!");
      setShowAddModal(false);
      setNewRoomName("");
      setNewRoomBuilding("B");
      setNewRoomCapacity(40);
      fetchRoomStatus();
    } catch (err) {
      console.error("Failed to create room", err);
      showError(err.response?.data?.detail || "Failed to create room");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!selectedRoomId) return;
    if (isGenerating) {
      showError("Cannot delete rooms while schedule generation is ongoing");
      return;
    }
    setDeleting(true);
    try {
      await api.delete(`/exams/rooms/${selectedRoomId}`);
      showSuccess(`Room "${selectedRoom?.name}" deleted successfully!`);
      setSelectedRoomId(null);
      setShowDeleteConfirm(false);
      fetchRoomStatus();
    } catch (err) {
      console.error("Failed to delete room", err);
      showError(err.response?.data?.detail || "Failed to delete room");
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteAllRooms = async () => {
    if (isGenerating) {
      showError("Cannot delete rooms while schedule generation is ongoing");
      return;
    }
    setDeletingAll(true);
    try {
      const res = await api.delete("/exams/rooms/all");
      showSuccess(res.data?.message || "All eligible rooms deleted successfully!");
      setShowDeleteAllConfirm(false);
      setSelectedRoomId(null);
      fetchRoomStatus();
    } catch (err) {
      console.error("Failed to delete all rooms", err);
      showError(err.response?.data?.detail || "Failed to delete rooms");
    } finally {
      setDeletingAll(false);
    }
  };

  const fetchRoomStatus = async () => {
    setLoading(true);
    try {
      const res = await api.get("/exams/rooms/status", {
        params: {
          department,
          semester,
          status: scheduleStatus,
        },
      });
      setData(res.data);
    } catch (err) {
      console.error("Failed to load room status", err);
      showError(err.response?.data?.detail || "Failed to load room status");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoomStatus();
  }, [department, semester, scheduleStatus]);

  useEffect(() => {
    setShowDeleteConfirm(false);
  }, [selectedRoomId]);

  const rooms = data?.rooms || [];
  const summary = data?.summary || {};
  const issues = [
    ...(data?.unassigned_exams || []).map((exam) => ({ ...exam, issue_type: "No Room" })),
    ...(data?.wrong_building_exams || []).map((exam) => ({ ...exam, issue_type: "Wrong Building" })),
  ];

  const filteredRooms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return rooms.filter((room) => {
      const matchesStatus = roomStatus === "all" || room.status === roomStatus;
      const matchesSearch = !query || room.name.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [rooms, roomStatus, searchQuery]);

  useEffect(() => {
    if (!filteredRooms.length) {
      setSelectedRoomId(null);
      return;
    }
    if (!filteredRooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(filteredRooms[0].id);
    }
  }, [filteredRooms, selectedRoomId]);

  const selectedRoom = filteredRooms.find((room) => room.id === selectedRoomId);
  const selectedRoomBookingDays = useMemo(() => {
    if (!selectedRoom?.bookings?.length) {
      return [];
    }

    const grouped = new Map();
    selectedRoom.bookings.forEach((exam) => {
      const dayLabel = exam.exam_date || "Unscheduled";
      if (!grouped.has(dayLabel)) {
        grouped.set(dayLabel, []);
      }
      grouped.get(dayLabel).push(exam);
    });

    return Array.from(grouped.entries()).map(([dayLabel, exams]) => ({
      dayLabel,
      exams,
    }));
  }, [selectedRoom]);

  const statCards = [
    { label: "Rooms", value: summary.total_rooms || 0, icon: BuildingOffice2Icon, tone: "blue" },
    { label: "In Use", value: summary.in_use_rooms || 0, icon: BuildingOfficeIcon, tone: "amber" },
    { label: "Available", value: summary.available_rooms || 0, icon: CheckCircleIcon, tone: "emerald" },
    { label: "Room Needed", value: summary.unassigned_exams || 0, icon: ExclamationTriangleIcon, tone: "red" },
    { label: "Wrong Building", value: summary.wrong_building_exams || 0, icon: ExclamationTriangleIcon, tone: "orange" },
  ];

  const toneClasses = {
    blue: isDark ? "bg-blue-950/40 text-blue-300 border-blue-800/60" : "bg-blue-50 text-blue-800 border-blue-200",
    amber: isDark ? "bg-amber-950/40 text-amber-300 border-amber-800/60" : "bg-amber-50 text-amber-800 border-amber-200",
    emerald: isDark ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/60" : "bg-emerald-50 text-emerald-800 border-emerald-200",
    red: isDark ? "bg-rose-950/40 text-rose-300 border-rose-800/60" : "bg-rose-50 text-rose-800 border-rose-200",
    orange: isDark ? "bg-orange-950/40 text-orange-300 border-orange-800/60" : "bg-orange-50 text-orange-800 border-orange-200",
  };

  const roomStatusClass = (status) => {
    if (status === "available") {
      return isDark ? "bg-emerald-950/50 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
    if (status === "conflict") {
      return isDark ? "bg-rose-950/50 text-rose-300 border-rose-800" : "bg-rose-50 text-rose-800 border-rose-200";
    }
    return isDark ? "bg-blue-950/50 text-blue-300 border-blue-800" : "bg-blue-50 text-blue-800 border-blue-200";
  };

  return (
    <div className={`min-h-screen rounded-2xl ${isDark ? "bg-slate-900" : "bg-slate-50"}`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
              <BuildingOffice2Icon className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
            </div>
            <div>
              <h1 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>Room Management</h1>
              <p className={`text-xs sm:text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>Monitor exam venue capacities, building allocations, and room occupancy</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full lg:w-auto">
            <button
              type="button"
              onClick={fetchRoomStatus}
              disabled={loading}
              className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition border ${
                isDark 
                  ? "bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-750 focus:ring-2 focus:ring-blue-500" 
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100 focus:ring-2 focus:ring-blue-500"
              }`}
            >
              <ArrowPathIcon className={`w-4 h-4 ${loading ? "animate-spin text-blue-600" : "text-slate-500"}`} />
              Refresh
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setShowDeleteAllConfirm(true)}
                  disabled={isGenerating || !rooms.length}
                  className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold transition border ${
                    isGenerating || !rooms.length
                      ? "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600 dark:border-slate-700"
                      : isDark
                      ? "bg-rose-950/40 text-rose-300 border-rose-800/80 hover:bg-rose-900/50"
                      : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                  }`}
                  title={isGenerating ? "Cannot delete rooms while schedule generation is ongoing" : !rooms.length ? "No rooms to delete" : "Delete all rooms without schedules"}
                >
                  <TrashIcon className="w-4 h-4" />
                  Delete All Rooms
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  disabled={isGenerating}
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl text-white px-5 py-2.5 text-xs sm:text-sm font-semibold transition shadow-sm ${
                    isGenerating
                      ? "bg-blue-600/50 opacity-50 cursor-not-allowed"
                      : "bg-blue-700 hover:bg-blue-800 active:bg-blue-900"
                  }`}
                  title={isGenerating ? "Cannot add rooms while schedule generation is ongoing" : ""}
                >
                  <BuildingOfficeIcon className="w-4 h-4" />
                  Add Room
                </button>
              </>
            )}
          </div>
        </div>

        <div className={`rounded-2xl border p-4 sm:p-5 ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"} shadow-sm`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Academic Level</label>
              <select 
                value={department} 
                onChange={(e) => setDepartment(e.target.value)} 
                className={`w-full rounded-xl border p-2.5 sm:p-3 text-xs sm:text-sm font-medium transition ${
                  isDark ? "bg-slate-900 text-slate-100 border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" : "bg-white text-slate-800 border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                }`}
              >
                <option value="College">College</option>
                <option value="SHS">Senior High</option>
                <option value="All">All Levels</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Semester</label>
              <select 
                value={semester} 
                onChange={(e) => setSemester(Number(e.target.value))} 
                className={`w-full rounded-xl border p-2.5 sm:p-3 text-xs sm:text-sm font-medium transition ${
                  isDark ? "bg-slate-900 text-slate-100 border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" : "bg-white text-slate-800 border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                }`}
              >
                <option value={1}>1st Semester</option>
                <option value={2}>2nd Semester</option>
                <option value={3}>3rd Semester</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Schedule Status</label>
              <select 
                value={scheduleStatus} 
                onChange={(e) => setScheduleStatus(e.target.value)} 
                className={`w-full rounded-xl border p-2.5 sm:p-3 text-xs sm:text-sm font-medium transition ${
                  isDark ? "bg-slate-900 text-slate-100 border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" : "bg-white text-slate-800 border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                }`}
              >
                <option value="all">All Schedules</option>
                <option value="draft">Draft Only</option>
                <option value="posted">Posted Only</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>Room Status</label>
              <select 
                value={roomStatus} 
                onChange={(e) => setRoomStatus(e.target.value)} 
                className={`w-full rounded-xl border p-2.5 sm:p-3 text-xs sm:text-sm font-medium transition ${
                  isDark ? "bg-slate-900 text-slate-100 border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" : "bg-white text-slate-800 border-slate-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                }`}
              >
                <option value="all">All Rooms</option>
                <option value="available">Available</option>
                <option value="in_use">In Use</option>
                <option value="conflict">Conflict</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className={`rounded-2xl border p-4 sm:p-5 shadow-sm transition hover:shadow-md ${toneClasses[card.tone]}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider opacity-85">{card.label}</p>
                    <p className="mt-1 sm:mt-2 text-2xl sm:text-3xl font-extrabold">{card.value}</p>
                  </div>
                  <div className="p-2 sm:p-2.5 rounded-xl bg-white/40 dark:bg-black/20 shrink-0">
                    <Icon className="w-6 h-6 sm:w-7 sm:h-7" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {issues.length > 0 && (
          <div className={`rounded-2xl border p-5 ${isDark ? "bg-rose-950/30 border-rose-800/60" : "bg-rose-50 border-rose-200"}`}>
            <div className="flex items-center gap-3 mb-4">
              <ExclamationTriangleIcon className={`w-5 h-5 shrink-0 ${isDark ? "text-rose-400" : "text-rose-700"}`} />
              <h2 className={`text-base sm:text-lg font-bold ${isDark ? "text-rose-200" : "text-rose-900"}`}>Room Assignment Issues ({issues.length})</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {issues.slice(0, 10).map((exam) => (
                <div key={`${exam.issue_type}-${exam.id}`} className={`rounded-xl border p-4 shadow-xs ${isDark ? "bg-slate-900/80 border-rose-800/40" : "bg-white border-rose-200"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-bold truncate ${isDark ? "text-white" : "text-slate-900"}`}>{exam.subject_name}</p>
                      <p className={`text-xs mt-1 font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>{exam.section_name} | {exam.exam_date} | {exam.start_time} - {exam.end_time}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold border ${isDark ? "bg-rose-950/60 text-rose-300 border-rose-800" : "bg-rose-100 text-rose-800 border-rose-200"}`}>{exam.issue_type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem] gap-6">
          <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"} shadow-sm`}>
            <div className={`p-4 sm:p-5 border-b ${isDark ? "border-slate-700 bg-slate-850/50" : "border-slate-200 bg-slate-50/50"}`}>
              <div className="relative">
                <MagnifyingGlassIcon className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? "text-slate-400" : "text-slate-500"}`} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search room by name, building, or department..."
                  className={`w-full rounded-xl border py-2.5 pl-10 pr-4 text-xs sm:text-sm outline-none transition ${
                    isDark 
                      ? "bg-slate-900 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                      : "bg-white border-slate-300 text-slate-800 placeholder:text-slate-400 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  }`}
                />
              </div>
            </div>

            <div className="w-full min-w-0">
              <div className={`md:hidden divide-y ${isDark ? "divide-slate-750" : "divide-slate-200"}`}>
                {loading ? (
                  <div className="px-5 py-12 text-center"><ArrowPathIcon className="mx-auto h-8 w-8 animate-spin text-blue-600" /></div>
                ) : filteredRooms.length === 0 ? (
                  <p className={`px-5 py-12 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>No rooms found matching filter criteria.</p>
                ) : filteredRooms.map((room) => {
                  const hasRescheduled = room.bookings?.some((booking) => booking.is_rescheduled);
                  const effectiveStatus = hasRescheduled ? "rescheduled" : room.status;
                  const statusStyle = effectiveStatus === "rescheduled"
                    ? isDark ? "bg-purple-950/50 text-purple-300 border-purple-800" : "bg-purple-50 text-purple-800 border-purple-200"
                    : roomStatusClass(room.status);
                  return (
                    <article
                      key={room.id}
                      onClick={() => setSelectedRoomId(room.id)}
                      className={`space-y-3 p-4 cursor-pointer transition ${selectedRoomId === room.id ? (isDark ? "bg-blue-950/30 border-l-4 border-l-blue-500" : "bg-blue-50/70 border-l-4 border-l-blue-600") : (isDark ? "hover:bg-slate-750/50" : "hover:bg-slate-50")}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className={`break-words text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{room.name}</h3>
                        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyle}`}>{statusLabels[effectiveStatus] || effectiveStatus}</span>
                      </div>
                      <dl className={`grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:text-sm ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                        <div><dt className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Building</dt><dd className="font-medium">{room.building}</dd></div>
                        <div><dt className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Capacity</dt><dd className="font-medium">{room.capacity} seats</dd></div>
                        <div>
                          <dt className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Sections</dt>
                          <dd className="font-bold text-blue-600 dark:text-blue-400">
                            {room.section_count ?? new Set(room.bookings?.map(b => b.section_name || b.section_id).filter(Boolean)).size ?? 0}
                          </dd>
                        </div>
                        <div><dt className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Department</dt><dd className="font-medium break-words">{room.department}</dd></div>
                      </dl>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={(event) => { event.stopPropagation(); handleOpenEdit(room); }}
                          disabled={isGenerating}
                          className="min-h-10 w-full rounded-xl border border-blue-200 bg-blue-50 px-3 text-xs font-bold text-blue-800 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800/60 dark:bg-blue-950/40 dark:text-blue-300"
                        >
                          <PencilSquareIcon className="mr-1.5 inline h-3.5 w-3.5" />Edit Capacity
                        </button>
                      )}
                    </article>
                  );
                })}
              </div>
              <div className="overflow-x-auto">
                <table className="hidden w-full min-w-[720px] text-xs sm:text-sm md:table">
                  <thead className={isDark ? "bg-slate-850 text-slate-300 border-b border-slate-700" : "bg-slate-50 text-slate-700 border-b border-slate-200"}>
                    <tr>
                      <th className="px-5 py-3 text-left font-bold uppercase tracking-wider text-[11px]">Room</th>
                      <th className="px-5 py-3 text-left font-bold uppercase tracking-wider text-[11px]">Building</th>
                      <th className="px-5 py-3 text-left font-bold uppercase tracking-wider text-[11px]">Capacity</th>
                      <th className="px-5 py-3 text-left font-bold uppercase tracking-wider text-[11px]">Sections</th>
                      <th className="px-5 py-3 text-left font-bold uppercase tracking-wider text-[11px]">Department</th>
                      <th className="px-5 py-3 text-left font-bold uppercase tracking-wider text-[11px]">Status</th>
                      {isAdmin && <th className="px-5 py-3 text-center font-bold uppercase tracking-wider text-[11px]">Action</th>}
                    </tr>
                  </thead>
                  <tbody className={isDark ? "divide-y divide-slate-700" : "divide-y divide-slate-200"}>
                    {loading ? (
                      <tr>
                        <td colSpan={isAdmin ? 7 : 6} className="px-5 py-12 text-center">
                          <ArrowPathIcon className="w-8 h-8 animate-spin text-blue-600 mx-auto" />
                        </td>
                      </tr>
                    ) : filteredRooms.length === 0 ? (
                      <tr>
                        <td colSpan={isAdmin ? 7 : 6} className={`px-5 py-12 text-center text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>No rooms found matching filter criteria.</td>
                      </tr>
                    ) : (
                      filteredRooms.map((room) => (
                        <tr
                          key={room.id}
                          onClick={() => setSelectedRoomId(room.id)}
                          className={`cursor-pointer transition ${
                            selectedRoomId === room.id 
                              ? isDark ? "bg-blue-950/40 text-blue-100" : "bg-blue-50/80 text-blue-950 font-medium" 
                              : isDark ? "hover:bg-slate-750/50" : "hover:bg-slate-50"
                          }`}
                        >
                          <td className={`px-5 py-3.5 font-bold ${isDark ? "text-white" : "text-slate-900"}`}>{room.name}</td>
                          <td className={`px-5 py-3.5 font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>Building {room.building}</td>
                          <td className={`px-5 py-3.5 font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>{room.capacity} seats</td>
                          <td className={`px-5 py-3.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                            <span className="font-bold text-blue-600 dark:text-blue-400">
                              {room.section_count ?? new Set(room.bookings?.map(b => b.section_name || b.section_id).filter(Boolean)).size ?? 0}
                            </span>
                            <span className="text-xs opacity-75 ml-1">
                              sec{(room.section_count ?? new Set(room.bookings?.map(b => b.section_name || b.section_id).filter(Boolean)).size) === 1 ? "" : "s"}
                            </span>
                          </td>
                          <td className={`px-5 py-3.5 font-medium ${isDark ? "text-slate-300" : "text-slate-700"}`}>{room.department}</td>
                          <td className="px-5 py-3.5">
                            {(() => {
                              const hasRescheduled = room.bookings?.some(b => b.is_rescheduled);
                              const effectiveStatus = hasRescheduled ? "rescheduled" : room.status;
                              const statusStyle = effectiveStatus === "rescheduled"
                                ? isDark ? "bg-purple-950/50 text-purple-300 border-purple-800" : "bg-purple-50 text-purple-800 border-purple-200"
                                : roomStatusClass(room.status);
                              return (
                                <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusStyle}`}>
                                  {statusLabels[effectiveStatus] || effectiveStatus}
                                </span>
                              );
                            })()}
                          </td>
                          {isAdmin && (
                            <td className="px-5 py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(room)}
                                disabled={isGenerating}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs ${
                                  isDark
                                    ? "bg-blue-950/40 text-blue-300 hover:bg-blue-900/50 border border-blue-800/80"
                                    : "bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200"
                                }`}
                                title="Edit room capacity (seats)"
                              >
                                <PencilSquareIcon className="w-3.5 h-3.5" />
                                <span>Edit</span>
                              </button>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <aside className={`rounded-2xl border p-5 h-fit ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"} shadow-sm`}>
            {selectedRoom ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>Selected Room</p>
                    <h2 className={`text-2xl sm:text-3xl font-extrabold mt-1 ${isDark ? "text-white" : "text-slate-900"}`}>{selectedRoom.name}</h2>
                  </div>
                  {(() => {
                    const hasRescheduled = selectedRoom.bookings?.some(b => b.is_rescheduled);
                    const effectiveStatus = hasRescheduled ? "rescheduled" : selectedRoom.status;
                    const statusStyle = effectiveStatus === "rescheduled"
                      ? isDark ? "bg-purple-950/50 text-purple-300 border-purple-800" : "bg-purple-50 text-purple-800 border-purple-200"
                      : roomStatusClass(selectedRoom.status);
                    return (
                      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${statusStyle}`}>
                        {statusLabels[effectiveStatus] || effectiveStatus}
                      </span>
                    );
                  })()}
                </div>

                <div className={`mt-5 rounded-xl border p-4 ${isDark ? "border-slate-700 bg-slate-900/50" : "border-slate-200 bg-slate-50"}`}>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs sm:text-sm">
                    <div>
                      <p className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Building</p>
                      <p className={`font-bold mt-0.5 ${isDark ? "text-slate-100" : "text-slate-900"}`}>{selectedRoom.building}</p>
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Capacity</p>
                      <p className={`font-bold mt-0.5 ${isDark ? "text-slate-100" : "text-slate-900"}`}>{selectedRoom.capacity} seats</p>
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Total Sections</p>
                      <p className="font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                        {selectedRoom.section_count ?? new Set(selectedRoom.bookings?.map(b => b.section_name || b.section_id).filter(Boolean)).size ?? 0}
                      </p>
                    </div>
                    <div>
                      <p className={`text-xs font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>Total Exams</p>
                      <p className={`font-bold mt-0.5 ${isDark ? "text-slate-100" : "text-slate-900"}`}>{selectedRoom.booking_count}</p>
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className={`mt-4 pt-4 border-t border-dashed ${isDark ? "border-slate-700" : "border-slate-200"} space-y-2.5`}>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(selectedRoom)}
                      disabled={isGenerating}
                      className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition shadow-xs ${
                        isGenerating
                          ? "bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600"
                          : isDark
                          ? "bg-blue-950/40 text-blue-300 hover:bg-blue-900/50 border border-blue-800/80"
                          : "bg-blue-50 text-blue-800 hover:bg-blue-100 border border-blue-200"
                      }`}
                      title="Edit Room Capacity"
                    >
                      <PencilSquareIcon className="w-4 h-4" />
                      Edit Room Capacity
                    </button>

                    {selectedRoom.booking_count > 0 ? (
                      <div className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-medium ${
                        isDark ? "bg-slate-800 text-slate-500 border border-slate-700" : "bg-slate-100 text-slate-500 border border-slate-200"
                      } cursor-not-allowed`}>
                        <TrashIcon className="w-4 h-4" />
                        Cannot Delete (Has Schedules)
                      </div>
                    ) : !showDeleteConfirm ? (
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isGenerating}
                        className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-xs sm:text-sm font-bold transition border ${
                          isGenerating
                            ? "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed dark:bg-slate-800 dark:text-slate-600 dark:border-slate-700"
                            : isDark
                            ? "bg-rose-950/40 text-rose-300 border-rose-800/80 hover:bg-rose-900/50"
                            : "bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100"
                        }`}
                        title={isGenerating ? "Cannot delete rooms while schedule generation is ongoing" : ""}
                      >
                        <TrashIcon className="w-4 h-4" />
                        Delete Room
                      </button>
                    ) : (
                      <div className={`rounded-xl border p-4 ${isDark ? "bg-rose-950/40 border-rose-800/80" : "bg-rose-50 border-rose-200"}`}>
                        <p className={`text-xs font-bold ${isDark ? "text-rose-200" : "text-rose-900"}`}>
                          Are you sure you want to delete room "{selectedRoom.name}"?
                        </p>
                        <p className={`text-[11px] mt-1 ${isDark ? "text-rose-300/80" : "text-rose-700"}`}>
                          This action cannot be undone.
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            type="button"
                            onClick={handleDeleteRoom}
                            disabled={deleting || isGenerating}
                            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white py-2 text-xs font-bold transition shadow-xs ${
                              (deleting || isGenerating) ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                          >
                            {deleting ? (
                              <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <TrashIcon className="w-3.5 h-3.5" />
                            )}
                            Yes, Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={deleting}
                            className={`flex-1 inline-flex items-center justify-center rounded-lg py-2 text-xs font-bold transition border ${
                              isDark
                                ? "bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-750"
                                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"
                            }`}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-5 space-y-3">
                  {selectedRoom.bookings.length === 0 ? (
                    <div className={`rounded-xl border border-dashed p-6 text-center text-xs sm:text-sm font-medium ${isDark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"}`}>
                      No scheduled exams for this room. Available for scheduling.
                    </div>
                  ) : (
                    selectedRoomBookingDays.map((day) => (
                      <div key={day.dayLabel} className="space-y-2">
                        <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${isDark ? "bg-slate-900 text-slate-200" : "bg-slate-100 text-slate-800"}`}>
                          <p className="text-xs font-black uppercase tracking-wider">{day.dayLabel}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${isDark ? "bg-blue-950/60 text-blue-300 border border-blue-800" : "bg-blue-100 text-blue-800 border border-blue-200"}`}>
                            {day.exams.length} exam{day.exams.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {day.exams.map((exam) => (
                          <div key={exam.id} className={`rounded-xl border p-3.5 ${isDark ? "border-slate-700 bg-slate-900/50" : "border-slate-200 bg-white"} shadow-xs`}>
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <p className={`font-bold text-xs sm:text-sm leading-tight ${isDark ? "text-white" : "text-slate-900"}`}>{exam.subject_name}</p>
                              {exam.is_rescheduled && (
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                  isDark ? "bg-purple-950/60 text-purple-300 border border-purple-800" : "bg-purple-100 text-purple-800 border border-purple-200"
                                }`}>Rescheduled</span>
                              )}
                            </div>
                            <p className={`text-xs mt-0.5 font-medium ${isDark ? "text-slate-400" : "text-slate-600"}`}>{exam.section_name}</p>
                            <p className={`text-xs mt-1 font-semibold ${isDark ? "text-blue-300" : "text-blue-700"}`}>{exam.start_time} – {exam.end_time}</p>
                            <div className="flex flex-wrap items-center gap-1.5 mt-2">
                              {selectedRoom?.capacity && exam.student_count > selectedRoom.capacity ? (
                                <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 border ${
                                  isDark ? "bg-rose-950/60 text-rose-300 border-rose-800" : "bg-rose-50 text-rose-800 border-rose-200"
                                }`} title={`Over capacity: ${exam.student_count} students in a ${selectedRoom.capacity}-seat room`}>
                                  ⚠️ {exam.student_count} / {selectedRoom.capacity} seats
                                </span>
                              ) : (
                                <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border ${
                                  isDark ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                }`} title={`${exam.student_count ?? "—"} students scheduled (${(selectedRoom?.capacity || 0) - (exam.student_count || 0)} excess seats)`}>
                                  👤 {exam.student_count ?? "—"} / {selectedRoom?.capacity ?? "—"} seats
                                </span>
                              )}
                              <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 border uppercase text-[10px] ${
                                exam.status === "posted"
                                  ? isDark ? "bg-emerald-950/60 text-emerald-300 border-emerald-800" : "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : isDark ? "bg-amber-950/60 text-amber-300 border-amber-800" : "bg-amber-50 text-amber-800 border-amber-200"
                              }`}>{exam.status}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className={`rounded-xl border border-dashed p-8 text-center text-sm ${isDark ? "border-slate-700 text-slate-400" : "border-slate-300 text-slate-500"}`}>
                Select a room from the directory to inspect its exam timetable and occupancy details.
              </div>
            )}
          </aside>
        </div>
      </div>

      {/* Add Room Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fade-in" onClick={() => setShowAddModal(false)} />
          
          <div className={`relative w-full max-w-md rounded-2xl sm:rounded-3xl border p-5 sm:p-6 shadow-2xl transition-all ${
            isDark ? "bg-slate-850 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                <BuildingOffice2Icon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold">Add Exam Room</h3>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>Register a new room for examinations</p>
              </div>
            </div>
            
            <form onSubmit={handleAddRoom} className="space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Room Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. B208"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className={`w-full rounded-xl border p-3 text-sm font-semibold outline-none transition ${
                    isDark 
                      ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                      : "bg-white border-slate-300 text-slate-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  }`}
                />
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Building
                  </label>
                  <select
                    value={newRoomBuilding}
                    onChange={(e) => setNewRoomBuilding(e.target.value)}
                    className={`w-full rounded-xl border p-3 text-sm font-semibold outline-none transition ${
                      isDark 
                        ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500" 
                        : "bg-white border-slate-300 text-slate-800 focus:border-blue-600"
                    }`}
                  >
                    <option value="B">Building B (College)</option>
                    <option value="C">Building C (SHS)</option>
                  </select>
                </div>
                
                <div>
                  <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Capacity (Seats)
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newRoomCapacity}
                    onChange={(e) => setNewRoomCapacity(Number(e.target.value))}
                    className={`w-full rounded-xl border p-3 text-sm font-semibold outline-none transition ${
                      isDark 
                        ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500" 
                        : "bg-white border-slate-300 text-slate-800 focus:border-blue-600"
                    }`}
                  />
                </div>
              </div>
              
              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 sm:gap-3 pt-4 mt-2 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition border ${
                    isDark 
                      ? "bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700" 
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || isGenerating}
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white transition shadow-sm ${
                    (submitting || isGenerating)
                      ? "bg-blue-600/50 opacity-50 cursor-not-allowed"
                      : "bg-blue-700 hover:bg-blue-800 active:bg-blue-900"
                  }`}
                >
                  {(submitting || isGenerating) && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                  Save Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Room Capacity Modal */}
      {showEditModal && editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fade-in" onClick={() => !submittingEdit && setShowEditModal(false)} />
          <div className={`relative w-full max-w-md rounded-2xl sm:rounded-3xl border p-5 sm:p-6 shadow-2xl transition-all ${
            isDark ? "bg-slate-850 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                  <PencilSquareIcon className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold">Edit Room Capacity</h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Room {editingRoom.name} (Building {editingRoom.building} - {editingRoom.department})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className={`p-1.5 rounded-lg transition ${isDark ? "hover:bg-slate-750 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateRoom} className="space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                  Capacity (Seats)
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  max="500"
                  value={editCapacity}
                  onChange={(e) => setEditCapacity(e.target.value)}
                  className={`w-full rounded-xl border p-3 text-sm font-semibold outline-none transition ${
                    isDark 
                      ? "bg-slate-900 border-slate-700 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500" 
                      : "bg-white border-slate-300 text-slate-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
                  }`}
                  placeholder="e.g. 40"
                />
                <p className={`text-xs mt-1.5 ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                  Maximum number of student exam seats allocated for this room. Sections with more students than this capacity will not be scheduled here.
                </p>
              </div>

              <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 sm:gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  disabled={submittingEdit}
                  className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition border ${
                    isDark 
                      ? "bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700" 
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit || isGenerating}
                  className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white transition shadow-sm ${
                    (submittingEdit || isGenerating)
                      ? "bg-blue-600/50 opacity-50 cursor-not-allowed"
                      : "bg-blue-700 hover:bg-blue-800 active:bg-blue-900"
                  }`}
                >
                  {submittingEdit && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                  Save Capacity
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete All Rooms Confirmation Modal */}
      {showDeleteAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs animate-fade-in" onClick={() => !deletingAll && setShowDeleteAllConfirm(false)} />
          <div className={`relative w-full max-w-md rounded-2xl sm:rounded-3xl border p-5 sm:p-6 shadow-2xl transition-all ${
            isDark ? "bg-slate-850 border-slate-700 text-white" : "bg-white border-slate-200 text-slate-900"
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-rose-600/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                <TrashIcon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold">Delete All Rooms</h3>
                <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>This action cannot be undone</p>
              </div>
            </div>

            <div className={`rounded-xl border p-4 mb-5 ${isDark ? "bg-rose-950/40 border-rose-800/80" : "bg-rose-50 border-rose-200"}`}>
              <p className={`text-sm font-semibold ${isDark ? "text-rose-200" : "text-rose-900"}`}>
                Are you sure you want to delete all rooms?
              </p>
              <p className={`text-xs mt-2 ${isDark ? "text-rose-300/80" : "text-rose-700"}`}>
                Only rooms <strong>without scheduled exams</strong> will be deleted. Rooms with assigned schedules will be preserved.
              </p>
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => setShowDeleteAllConfirm(false)}
                disabled={deletingAll}
                className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition border ${
                  isDark 
                    ? "bg-slate-800 hover:bg-slate-750 text-slate-200 border-slate-700" 
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300"
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAllRooms}
                disabled={deletingAll || isGenerating}
                className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold text-white transition shadow-sm ${
                  (deletingAll || isGenerating)
                    ? "bg-rose-600/50 opacity-50 cursor-not-allowed"
                    : "bg-rose-700 hover:bg-rose-800 active:bg-rose-900"
                }`}
              >
                {deletingAll && <ArrowPathIcon className="w-4 h-4 animate-spin" />}
                Yes, Delete All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
