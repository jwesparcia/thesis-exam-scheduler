import React from "react";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "../context/themeStore";

export default function ThemeToggle({ className = "" }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={`p-2 rounded-lg transition flex items-center justify-center ${className} ${
        theme === "dark" ? "bg-gray-700 hover:bg-gray-600" : "bg-gray-100 hover:bg-gray-200"
      }`}
    >
      {theme === "dark" ? <Sun className="w-5 h-5 text-yellow-400 cursor-pointer" /> : <Moon className="w-5 h-5 text-gray-700 cursor-pointer" />}
    </button>
  );
}