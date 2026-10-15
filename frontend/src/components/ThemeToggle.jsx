import React from "react";
import { SunIcon, MoonIcon } from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";

export default function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      type="button"
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`p-2.5 rounded-xl border transition-colors flex items-center justify-center ${
        theme === "dark" 
          ? "bg-slate-800 hover:bg-slate-700 text-yellow-400 border-slate-700" 
          : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
      } ${className}`}
    >
      {theme === "dark" ? (
        <SunIcon className="w-5 h-5 text-yellow-400" />
      ) : (
        <MoonIcon className="w-5 h-5 text-slate-700" />
      )}
    </button>
  );
}