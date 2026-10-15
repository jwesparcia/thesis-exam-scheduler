import React, { useState, useRef, useEffect } from 'react';
import { Cog6ToothIcon, ArrowLeftStartOnRectangleIcon, SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../context/themeStore';

export default function SettingsDropdown({ onLogout, isDark }) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggleTheme = (e) => {
    e.stopPropagation();
    toggleTheme();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Settings and account menu"
        aria-expanded={isOpen}
        aria-haspopup="true"
        type="button"
        className={`p-2.5 rounded-xl transition ${
          isOpen 
            ? "bg-blue-600 text-white shadow-md shadow-blue-500/20" 
            : isDark ? "text-slate-300 hover:text-white hover:bg-slate-800" : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
        }`}
      >
        <Cog6ToothIcon className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className={`absolute right-0 mt-3 w-64 rounded-2xl shadow-2xl border z-[100] overflow-hidden animate-in fade-in zoom-in duration-200 ${
          isDark ? "bg-slate-900 border-slate-700/80 shadow-black/50" : "bg-white border-slate-200"
        }`}>
          <div className={`px-4 py-3 border-b ${isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50/70"}`}>
            <p className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>Settings & Account</p>
          </div>
          
          <div className="p-2 space-y-1">
            {/* Theme Toggle Item */}
            <button
              onClick={handleToggleTheme}
              type="button"
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition cursor-pointer text-left ${
                isDark ? "hover:bg-slate-800 text-slate-200" : "hover:bg-slate-100 text-slate-800"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg ${isDark ? "bg-slate-800 text-yellow-400" : "bg-slate-100 text-blue-600 border border-slate-200"}`}>
                  {theme === "dark" ? <SunIcon className="w-4 h-4" /> : <MoonIcon className="w-4 h-4" />}
                </div>
                <span className="text-sm font-semibold">{theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}</span>
              </div>
              <div className={`w-9 h-5 rounded-full relative transition-colors ${theme === "dark" ? "bg-blue-600" : "bg-slate-300"}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${theme === "dark" ? "right-0.5" : "left-0.5"}`}></div>
              </div>
            </button>

            {/* Logout Item */}
            <button
              onClick={() => { setIsOpen(false); onLogout(); }}
              type="button"
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition group text-left ${
                isDark ? "hover:bg-rose-950/40 text-rose-400" : "hover:bg-rose-50 text-rose-600"
              }`}
            >
              <div className={`p-1.5 rounded-lg transition ${isDark ? "bg-rose-950/30 group-hover:bg-rose-900/50" : "bg-rose-100 group-hover:bg-rose-200/70"}`}>
                <ArrowLeftStartOnRectangleIcon className="w-4 h-4" />
              </div>
              <span className="text-sm font-semibold">Sign Out</span>
            </button>
          </div>
          
          <div className={`px-4 py-2.5 border-t flex items-center justify-between ${isDark ? "border-slate-800 bg-slate-950/40" : "border-slate-100 bg-slate-50/70"}`}>
            <span className={`text-[11px] font-semibold ${isDark ? "text-slate-400" : "text-slate-500"}`}>STI Exam Scheduler</span>
            <span className={`text-[11px] font-mono ${isDark ? "text-slate-400" : "text-slate-500"}`}>v1.0</span>
          </div>
        </div>
      )}
    </div>
  );
}
