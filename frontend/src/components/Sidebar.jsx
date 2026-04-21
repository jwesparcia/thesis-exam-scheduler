// src/components/Sidebar.jsx
import React from "react";
import { Home, BookOpen, Layers, Target, Users, Grid, MoreHorizontal } from "lucide-react";

/*
  Sidebar matches STI look:
  - navy background (#0B2545 equivalent through tailwind classes)
  - STI logo at top (replace path if needed)
*/

export default function Sidebar({ className = "" }) {
  const menu = [
    { label: "Home", icon: Home },
    { label: "Courses", icon: BookOpen },
    { label: "Paths", icon: Layers },
    { label: "Goals", icon: Target },
    { label: "Groups", icon: Users },
    { label: "Catalog", icon: Grid },
    { label: "More", icon: MoreHorizontal }
  ];

  return (
    <aside className={`w-72 min-h-screen flex-shrink-0 p-5 ${className}`}>
      <div className="flex items-center gap-3 mb-8">
        {/* Replace with actual logo at /src/assets/sti-logo.png or change path */}
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-white flex items-center justify-center shadow-sm">
          <img src="/images.png" alt="STI" className="object-contain w-full h-full" onError={(e) => { e.target.onerror = null; e.target.src = 'data:image/svg+xml;charset=UTF-8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect width=%22100%22 height=%22100%22 fill=%22%230b2545%22/><text x=%2250%22 y=%2258%22 font-size=%2224%22 fill=%22%23fff%22 font-family=%22Arial%22 text-anchor=%22middle%22>STI</text></svg>' }} />
        </div>
        <div>
          <div className="text-white text-lg font-semibold">STI Education</div>
          <div className="text-sky-200 text-xs">Exam Scheduler</div>
        </div>
      </div>

      <nav className="flex flex-col gap-2">
        {menu.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.label}
              className="w-full flex items-center gap-3 text-white px-3 py-2 rounded-xl hover:bg-slate-800 transition text-left"
            >
              <div className="w-9 h-9 rounded-md bg-slate-800/30 flex items-center justify-center">
                <Icon className="w-5 h-5" />
              </div>
              <span className="font-medium">{m.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto pt-6">
        <div className="text-sky-100 text-xs">v1.0 • Minimal UI</div>
      </div>
    </aside>
  );
}
