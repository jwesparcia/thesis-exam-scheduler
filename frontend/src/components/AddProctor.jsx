import React, { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import { useTheme } from "../context/themeStore";
import ThemeToggle from "../components/ThemeToggle";

function showToast(message, isError = false) {
  const toast = document.createElement("div");
  toast.textContent = message;
  toast.className = `
    fixed bottom-6 left-1/2 transform -translate-x-1/2 
    px-5 py-3 rounded-lg text-white text-sm z-50 shadow-lg
    ${isError ? "bg-red-600" : "bg-emerald-600"}
  `;
  document.body.appendChild(toast);
  setTimeout(() => (toast.style.opacity = "0"), 2200);
  setTimeout(() => toast.remove(), 2700);
}

export default function AddProctor() {
  const { theme } = useTheme();
  const [proctors, setProctors] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("http://localhost:8000/proctors");
        if (res.ok) setProctors(await res.json());
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  const addProctor = async () => {
    if (!name.trim()) return showToast("⚠️ Please enter a proctor name.", true);

    setLoading(true);
    try {
      const res = await fetch("http://localhost:8000/proctors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Failed to add proctor");

      const newProctor = await res.json();
      setProctors((s) => [...s, newProctor]);
      setName("");
      showToast("✅ Proctor added successfully!");
    } catch (err) {
      console.error(err);
      showToast("❌ Failed to add proctor.", true);
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className={`space-y-8 ${theme === "dark" ? "bg-gray-800 text-white" : "bg-white text-gray-800"}`}>
      <div className={`rounded-xl p-6 border ${theme === "dark" ? "bg-gray-700 border-gray-700" : "bg-white border-slate-200"} shadow-sm`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Users className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-medium">Add New Proctor</h2>
          </div>
          <ThemeToggle />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Enter proctor name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`flex-1 px-3 py-2 rounded-lg border focus:ring-2 focus:ring-blue-400 outline-none ${
              theme === "dark" ? "bg-gray-600 text-white border-gray-600" : "bg-white border-slate-300 text-gray-800"
            }`}
          />
          <button
            onClick={addProctor}
            disabled={loading}
            className={`flex items-center justify-center gap-2 px-5 py-2 rounded-lg text-white font-medium transition ${
              loading ? "bg-blue-400 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            <Plus className="w-4 h-4" />
            {loading ? "Adding..." : "Add Proctor"}
          </button>
        </div>
      </div>

      {/* Proctors now upload their own schedules from their personal dashboard */}

      <div>
        <h3 className="text-xl font-semibold mb-2">Proctor List</h3>
        <p className={`text-xs mb-4 ${theme === "dark" ? "text-gray-400" : "text-gray-500"}`}>
          Each proctor can upload their own teaching schedule after logging in to their portal.
        </p>

        {proctors.length === 0 ? (
          <p>No proctors added yet.</p>
        ) : (
          <div className={`overflow-x-auto rounded-xl shadow-sm ${theme === "dark" ? "bg-gray-700 border border-gray-700" : "bg-white border border-slate-200"}`}>
            <table className="w-full text-sm">
              <thead className={`${theme === "dark" ? "bg-gray-600 text-gray-200" : "bg-slate-50 text-slate-600"}`}>
                <tr>
                  <th className="py-2 px-3 text-left">ID</th>
                  <th className="py-2 px-3 text-left">Name</th>
                </tr>
              </thead>
              <tbody>
                {proctors.map((p) => (
                  <tr key={p.id} className={`border-t ${theme === "dark" ? "border-gray-600 hover:bg-gray-600" : "border-slate-100 hover:bg-slate-50"} transition`}>
                    <td className="py-2 px-3">{p.id}</td>
                    <td className="py-2 px-3">{p.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}