import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  DoorOpen,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useTheme } from "../context/themeStore";
import { useToast } from "../context/ToastContext";
import { useUser } from "../context/userStore";
import api from "../api";

const statusLabels = {
  available: "Available",
  in_use: "In Use",
  conflict: "Conflict",
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

  // Delete room states
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    { label: "Rooms", value: summary.total_rooms || 0, icon: DoorOpen, tone: "blue" },
    { label: "In Use", value: summary.in_use_rooms || 0, icon: Building2, tone: "amber" },
    { label: "Available", value: summary.available_rooms || 0, icon: CheckCircle2, tone: "emerald" },
    { label: "Room Needed", value: summary.unassigned_exams || 0, icon: AlertTriangle, tone: "red" },
    { label: "Wrong Building", value: summary.wrong_building_exams || 0, icon: AlertTriangle, tone: "orange" },
  ];

  const toneClasses = {
    blue: isDark ? "bg-blue-500/10 text-blue-300 border-blue-500/20" : "bg-blue-50 text-blue-700 border-blue-100",
    amber: isDark ? "bg-amber-500/10 text-amber-300 border-amber-500/20" : "bg-amber-50 text-amber-700 border-amber-100",
    emerald: isDark ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-100",
    red: isDark ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-red-50 text-red-700 border-red-100",
    orange: isDark ? "bg-orange-500/10 text-orange-300 border-orange-500/20" : "bg-orange-50 text-orange-700 border-orange-100",
  };

  const roomStatusClass = (status) => {
    if (status === "available") {
      return isDark ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" : "bg-emerald-50 text-emerald-700 border-emerald-100";
    }
    if (status === "conflict") {
      return isDark ? "bg-red-500/10 text-red-300 border-red-500/20" : "bg-red-50 text-red-700 border-red-100";
    }
    return isDark ? "bg-blue-500/10 text-blue-300 border-blue-500/20" : "bg-blue-50 text-blue-700 border-blue-100";
  };

  return (
    <div className={`min-h-screen rounded-2xl ${isDark ? "bg-gray-900" : "bg-gray-50"}`}>
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <DoorOpen className="w-8 h-8 text-blue-500" />
            <h1 className={`text-3xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>Room Management</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchRoomStatus}
              disabled={loading}
              className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${isDark ? "bg-gray-800 text-gray-100 hover:bg-gray-700" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-50"}`}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Refresh
            </button>
            {isAdmin && (
              <button
                onClick={() => setShowAddModal(true)}
                disabled={isGenerating}
                className={`inline-flex items-center justify-center gap-2 rounded-xl text-white px-4 py-2.5 text-sm font-bold transition shadow-md ${
                  isGenerating
                    ? "bg-blue-600/50 opacity-50 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                }`}
                title={isGenerating ? "Cannot add rooms while schedule generation is ongoing" : ""}
              >
                + Add Room
              </button>
            )}
          </div>
        </div>

        <div className={`rounded-2xl border p-5 ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"} shadow-sm`}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className={`block text-xs font-bold uppercase mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Academic Level</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value)} className={`w-full rounded-xl border p-3 text-sm font-semibold ${isDark ? "bg-gray-900 text-gray-100 border-gray-700" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
                <option value="College">College</option>
                <option value="SHS">Senior High</option>
                <option value="All">All</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Semester</label>
              <select value={semester} onChange={(e) => setSemester(Number(e.target.value))} className={`w-full rounded-xl border p-3 text-sm font-semibold ${isDark ? "bg-gray-900 text-gray-100 border-gray-700" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
                <option value={1}>1st Semester</option>
                <option value={2}>2nd Semester</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Schedule Status</label>
              <select value={scheduleStatus} onChange={(e) => setScheduleStatus(e.target.value)} className={`w-full rounded-xl border p-3 text-sm font-semibold ${isDark ? "bg-gray-900 text-gray-100 border-gray-700" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
                <option value="all">All Schedules</option>
                <option value="draft">Draft Only</option>
                <option value="posted">Posted Only</option>
              </select>
            </div>
            <div>
              <label className={`block text-xs font-bold uppercase mb-2 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Room Status</label>
              <select value={roomStatus} onChange={(e) => setRoomStatus(e.target.value)} className={`w-full rounded-xl border p-3 text-sm font-semibold ${isDark ? "bg-gray-900 text-gray-100 border-gray-700" : "bg-gray-50 text-gray-700 border-gray-200"}`}>
                <option value="all">All Rooms</option>
                <option value="available">Available</option>
                <option value="in_use">In Use</option>
                <option value="conflict">Conflict</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
          {statCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className={`rounded-2xl border p-5 ${toneClasses[card.tone]}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase opacity-75">{card.label}</p>
                    <p className="mt-2 text-3xl font-black">{card.value}</p>
                  </div>
                  <Icon className="w-8 h-8 opacity-70" />
                </div>
              </div>
            );
          })}
        </div>

        {issues.length > 0 && (
          <div className={`rounded-2xl border p-5 ${isDark ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-100"}`}>
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className={isDark ? "text-red-300" : "text-red-600"} />
              <h2 className={`text-lg font-bold ${isDark ? "text-red-100" : "text-red-900"}`}>Room Assignment Issues</h2>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {issues.slice(0, 10).map((exam) => (
                <div key={`${exam.issue_type}-${exam.id}`} className={`rounded-xl border p-4 ${isDark ? "bg-gray-900/50 border-red-500/20" : "bg-white border-red-100"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className={`font-bold truncate ${isDark ? "text-white" : "text-gray-900"}`}>{exam.subject_name}</p>
                      <p className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{exam.section_name} | {exam.exam_date} | {exam.start_time} - {exam.end_time}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${isDark ? "bg-red-500/20 text-red-200" : "bg-red-100 text-red-700"}`}>{exam.issue_type}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_24rem] gap-6">
          <div className={`rounded-2xl border overflow-hidden ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"} shadow-sm`}>
            <div className={`p-5 border-b ${isDark ? "border-gray-700" : "border-gray-100"}`}>
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${isDark ? "text-gray-500" : "text-gray-400"}`} />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search room"
                  className={`w-full rounded-xl border py-3 pl-10 pr-4 text-sm outline-none transition ${isDark ? "bg-gray-900 border-gray-700 text-gray-100" : "bg-gray-50 border-gray-200 text-gray-700"}`}
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className={isDark ? "bg-gray-900/60 text-gray-300" : "bg-gray-50 text-gray-600"}>
                  <tr>
                    <th className="px-5 py-3 text-left font-bold">Room</th>
                    <th className="px-5 py-3 text-left font-bold">Building</th>
                    <th className="px-5 py-3 text-left font-bold">Capacity</th>
                    <th className="px-5 py-3 text-left font-bold">For</th>
                    <th className="px-5 py-3 text-left font-bold">Total Section</th>
                    <th className="px-5 py-3 text-left font-bold">Status</th>
                  </tr>
                </thead>
                <tbody className={isDark ? "divide-y divide-gray-700" : "divide-y divide-gray-100"}>
                  {loading ? (
                    <tr>
                      <td colSpan="6" className="px-5 py-12 text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto" />
                      </td>
                    </tr>
                  ) : filteredRooms.length === 0 ? (
                    <tr>
                      <td colSpan="6" className={`px-5 py-12 text-center ${isDark ? "text-gray-500" : "text-gray-400"}`}>No rooms found.</td>
                    </tr>
                  ) : (
                    filteredRooms.map((room) => (
                      <tr
                        key={room.id}
                        onClick={() => setSelectedRoomId(room.id)}
                        className={`cursor-pointer transition ${selectedRoomId === room.id ? isDark ? "bg-blue-500/10" : "bg-blue-50" : isDark ? "hover:bg-gray-700/50" : "hover:bg-gray-50"}`}
                      >
                        <td className={`px-5 py-4 font-black ${isDark ? "text-white" : "text-gray-900"}`}>{room.name}</td>
                        <td className={`px-5 py-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>Building {room.building}</td>
                        <td className={`px-5 py-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>{room.capacity} seats</td>
                        <td className={`px-5 py-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>{room.department}</td>
                        <td className={`px-5 py-4 ${isDark ? "text-gray-300" : "text-gray-700"}`}>{room.booking_count}</td>
                        <td className="px-5 py-4">
                          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-bold ${roomStatusClass(room.status)}`}>
                            {statusLabels[room.status] || room.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <aside className={`rounded-2xl border p-5 h-fit ${isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-100"} shadow-sm`}>
            {selectedRoom ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-xs font-bold uppercase ${isDark ? "text-gray-500" : "text-gray-400"}`}>Selected Room</p>
                    <h2 className={`text-3xl font-black mt-1 ${isDark ? "text-white" : "text-gray-900"}`}>{selectedRoom.name}</h2>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs font-bold ${roomStatusClass(selectedRoom.status)}`}>{statusLabels[selectedRoom.status]}</span>
                </div>

                <div className={`mt-5 rounded-xl border p-4 ${isDark ? "border-gray-700 bg-gray-900/40" : "border-gray-100 bg-gray-50"}`}>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className={isDark ? "text-gray-500" : "text-gray-400"}>Building</p>
                      <p className={`font-bold ${isDark ? "text-gray-100" : "text-gray-800"}`}>{selectedRoom.building}</p>
                    </div>
                    <div>
                      <p className={isDark ? "text-gray-500" : "text-gray-400"}>Capacity</p>
                      <p className={`font-bold ${isDark ? "text-gray-100" : "text-gray-800"}`}>{selectedRoom.capacity} seats</p>
                    </div>
                    <div>
                      <p className={isDark ? "text-gray-500" : "text-gray-400"}>Total Section</p>
                      <p className={`font-bold ${isDark ? "text-gray-100" : "text-gray-800"}`}>{selectedRoom.booking_count}</p>
                    </div>
                  </div>
                </div>

                {isAdmin && (
                  <div className="mt-4 pt-4 border-t border-dashed border-gray-200 dark:border-gray-700">
                    {!showDeleteConfirm ? (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={isGenerating}
                        className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                          isGenerating
                            ? "bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-700 dark:text-gray-400"
                            : isDark
                            ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                            : "bg-red-50 text-red-600 hover:bg-red-100"
                        }`}
                        title={isGenerating ? "Cannot delete rooms while schedule generation is ongoing" : ""}
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete Room
                      </button>
                    ) : (
                      <div className={`rounded-xl border p-4 ${isDark ? "bg-red-500/10 border-red-500/20" : "bg-red-50 border-red-100"}`}>
                        <p className={`text-xs font-bold ${isDark ? "text-red-300" : "text-red-800"}`}>
                          Are you sure you want to delete room "{selectedRoom.name}"?
                        </p>
                        <p className={`text-[11px] mt-1 ${isDark ? "text-red-400/80" : "text-red-700/80"}`}>
                          Any exams scheduled in this room will be unassigned.
                        </p>
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={handleDeleteRoom}
                            disabled={deleting || isGenerating}
                            className={`flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white py-2 text-xs font-bold transition shadow-sm ${
                              (deleting || isGenerating) ? "opacity-50 cursor-not-allowed" : ""
                            }`}
                          >
                            {deleting ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                            Yes, Delete
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(false)}
                            disabled={deleting}
                            className={`flex-1 inline-flex items-center justify-center rounded-lg py-2 text-xs font-bold transition ${
                              isDark
                                ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
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
                    <div className={`rounded-xl border border-dashed p-6 text-center ${isDark ? "border-gray-700 text-gray-500" : "border-gray-200 text-gray-400"}`}>Available</div>
                  ) : (
                    selectedRoomBookingDays.map((day) => (
                      <div key={day.dayLabel} className="space-y-2">
                        <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${isDark ? "bg-gray-900 text-gray-200" : "bg-gray-100 text-gray-700"}`}>
                          <p className="text-xs font-black uppercase">{day.dayLabel}</p>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${isDark ? "bg-blue-500/20 text-blue-200" : "bg-blue-100 text-blue-700"}`}>
                            {day.exams.length} exam{day.exams.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        {day.exams.map((exam) => (
                          <div key={exam.id} className={`rounded-xl border p-4 ${isDark ? "border-gray-700 bg-gray-900/40" : "border-gray-100 bg-gray-50"}`}>
                            <p className={`font-bold ${isDark ? "text-white" : "text-gray-900"}`}>{exam.subject_name}</p>
                            <p className={`text-xs mt-1 ${isDark ? "text-gray-400" : "text-gray-500"}`}>{exam.section_name}</p>
                            <p className={`text-xs mt-1 font-semibold ${isDark ? "text-blue-300" : "text-blue-700"}`}>{exam.start_time} - {exam.end_time}</p>
                          </div>
                        ))}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className={`rounded-xl border border-dashed p-8 text-center ${isDark ? "border-gray-700 text-gray-500" : "border-gray-200 text-gray-400"}`}>No room selected.</div>
            )}
          </aside>
        </div>
      </div>

      {/* Add Room Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowAddModal(false)} />
          
          {/* Modal Content */}
          <div className={`relative w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-all transform scale-100 duration-300 animate-scale-in ${isDark ? "bg-gray-800 border-gray-700 text-white" : "bg-white border-gray-100 text-gray-900"}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                <DoorOpen className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold">Add Exam Room</h3>
                <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>Register a new room for examinations</p>
              </div>
            </div>
            
            <form onSubmit={handleAddRoom} className="space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase mb-1.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  Room Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. B208"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  className={`w-full rounded-xl border p-3 text-sm font-semibold outline-none transition ${isDark ? "bg-gray-900 border-gray-700 text-white focus:border-blue-500" : "bg-gray-50 border-gray-200 text-gray-800 focus:border-blue-500"}`}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={`block text-xs font-bold uppercase mb-1.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    Building
                  </label>
                  <select
                    value={newRoomBuilding}
                    onChange={(e) => setNewRoomBuilding(e.target.value)}
                    className={`w-full rounded-xl border p-3 text-sm font-semibold outline-none transition ${isDark ? "bg-gray-900 border-gray-700 text-white" : "bg-gray-50 border-gray-200 text-gray-800"}`}
                  >
                    <option value="B">Building B (College)</option>
                    <option value="C">Building C (SHS)</option>
                  </select>
                </div>
                
                <div>
                  <label className={`block text-xs font-bold uppercase mb-1.5 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                    Capacity
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={newRoomCapacity}
                    onChange={(e) => setNewRoomCapacity(Number(e.target.value))}
                    className={`w-full rounded-xl border p-3 text-sm font-semibold outline-none transition ${isDark ? "bg-gray-900 border-gray-700 text-white focus:border-blue-500" : "bg-gray-50 border-gray-200 text-gray-800 focus:border-blue-500"}`}
                  />
                </div>
              </div>
              
              <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-gray-200/10">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-bold transition ${isDark ? "bg-gray-700 hover:bg-gray-600 text-gray-200" : "bg-gray-100 hover:bg-gray-200 text-gray-700"}`}
                >
                  Cancel
                </button>
                 <button
                  type="submit"
                  disabled={submitting || isGenerating}
                  className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white transition shadow-md ${
                    (submitting || isGenerating)
                      ? "bg-blue-600/50 opacity-50 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700 shadow-blue-500/20"
                  }`}
                >
                  {(submitting || isGenerating) && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
