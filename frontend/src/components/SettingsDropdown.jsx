import React, { useState, useRef, useEffect } from 'react';
import { Settings, LogOut, Sun, Moon } from 'lucide-react';
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
        className={`p-2 rounded-xl transition ${
          isOpen 
            ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20" 
            : isDark ? "text-gray-400 hover:text-gray-100 hover:bg-gray-700" : "text-gray-600 hover:text-gray-800 hover:bg-gray-100"
        }`}
      >
        <Settings className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className={`absolute right-0 mt-3 w-60 rounded-2xl shadow-2xl border z-[100] overflow-hidden animate-in fade-in zoom-in duration-200 ${
          isDark ? "bg-gray-800 border-gray-700 shadow-black/50" : "bg-white border-gray-200"
        }`}>
          <div className={`px-4 py-3 border-b ${isDark ? "border-gray-700 bg-gray-900/20" : "border-gray-100 bg-gray-50/50"}`}>
            <p className={`text-[10px] font-bold uppercase tracking-widest ${isDark ? "text-gray-500" : "text-gray-400"}`}>Settings & Account</p>
          </div>
          
          <div className="p-2 space-y-1">
            {/* Theme Toggle Item */}
            <div
              onClick={handleToggleTheme}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition cursor-pointer ${
                isDark ? "hover:bg-gray-700 text-gray-300" : "hover:bg-gray-50 text-gray-700"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-1.5 rounded-lg ${isDark ? "bg-gray-900/50" : "bg-white shadow-sm border border-gray-100"}`}>
                  {theme === "dark" ? <Sun className="w-4 h-4 text-yellow-400" /> : <Moon className="w-4 h-4 text-blue-500" />}
                </div>
                <span className="text-sm font-semibold">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
              </div>
              <div className={`w-10 h-5 rounded-full relative transition-colors ${theme === "dark" ? "bg-blue-600" : "bg-gray-300"}`}>
                <div className={`absolute top-1 w-3 h-3 rounded-full bg-white shadow-sm transition-all ${theme === "dark" ? "right-1" : "left-1"}`}></div>
              </div>
            </div>

            {/* Logout Item */}
            <button
              onClick={() => { setIsOpen(false); onLogout(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition group ${
                isDark ? "hover:bg-red-900/30 text-red-400" : "hover:bg-red-50 text-red-600"
              }`}
            >
              <div className={`p-1.5 rounded-lg transition ${isDark ? "bg-red-900/20 group-hover:bg-red-900/40" : "bg-red-100/50 group-hover:bg-red-100"}`}>
                <LogOut className="w-4 h-4" />
              </div>
              <span className="text-sm font-bold">Logout Session</span>
            </button>
          </div>
          
          <div className={`px-4 py-2 border-t flex items-center justify-between ${isDark ? "border-gray-700 bg-gray-900/10" : "border-gray-100 bg-gray-50/30"}`}>
            <span className={`text-[9px] font-bold uppercase tracking-tighter ${isDark ? "text-gray-600" : "text-gray-400"}`}>STI Exam Scheduler</span>
            <span className={`text-[9px] font-mono ${isDark ? "text-gray-700" : "text-gray-300"}`}>v1.0.4</span>
          </div>
        </div>
      )}
    </div>
  );
}
