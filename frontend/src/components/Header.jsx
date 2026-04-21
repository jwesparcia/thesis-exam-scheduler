// src/components/Header.jsx
import React from "react";
import { Search } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

/*
  Header: white bar with shadow, search, notification placeholders and toggle.
*/
export default function Header({ title = "Dashboard" }) {
  return (
    <header className="w-full flex items-center justify-between py-4 px-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-gray-100">{title}</h2>
        <div className="hidden sm:flex items-center gap-2 bg-slate-100 dark:bg-gray-700 rounded-full px-3 py-1">
          <Search className="w-4 h-4 text-slate-500" />
          <input className="bg-transparent outline-none text-sm text-slate-600 dark:text-gray-200" placeholder="Search" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="hidden md:inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-gray-700 shadow-sm">
          <span className="text-sm text-slate-600 dark:text-gray-200">Hidden widgets</span>
        </button>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-100 dark:bg-gray-700 rounded-full flex items-center justify-center">🔔</div>
            <div className="w-9 h-9 bg-slate-100 dark:bg-gray-700 rounded-full flex items-center justify-center">👤</div>
          </div>
        </div>
      </div>
    </header>
  );
}
