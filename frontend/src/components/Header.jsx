// src/components/Header.jsx
import React from "react";
import { MagnifyingGlassIcon, BellIcon, UserIcon } from "@heroicons/react/24/outline";
import ThemeToggle from "./ThemeToggle";

/*
  Header: white bar with shadow, search, notification placeholders and toggle.
*/
export default function Header({ title = "Dashboard" }) {
  return (
    <header className="w-full flex items-center justify-between py-4 px-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h2>
        <div className="hidden sm:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5">
          <MagnifyingGlassIcon className="w-4 h-4 text-slate-400" />
          <input aria-label="Search" className="bg-transparent outline-none text-sm text-slate-700 dark:text-slate-200 placeholder-slate-400" placeholder="Search..." />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <div className="flex items-center gap-2">
            <button aria-label="Notifications" type="button" className="w-9 h-9 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300">
              <BellIcon className="w-5 h-5" />
            </button>
            <button aria-label="User Profile" type="button" className="w-9 h-9 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition rounded-full flex items-center justify-center text-slate-600 dark:text-slate-300">
              <UserIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
