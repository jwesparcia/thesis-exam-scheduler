import React, { useState, useEffect } from "react";
import { AlertTriangle, Info, X } from "lucide-react";
import { useTheme } from "../context/themeStore";

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isDanger = false,
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [inputVal, setInputVal] = useState("");

  // Reset input when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setInputVal("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isConfirmedEnabled = !confirmText || inputVal.trim() === confirmText;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        onClick={onCancel}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
      ></div>

      {/* Modal Card */}
      <div 
        className={`relative w-full max-w-md p-6 rounded-2xl border shadow-2xl transition-all duration-300 transform scale-100 animate-in zoom-in-95 duration-200 ${
          isDark 
            ? "bg-slate-900 border-slate-800 text-white" 
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              isDanger 
                ? "bg-red-500/10 text-red-500" 
                : "bg-blue-500/10 text-blue-500"
            }`}>
              {isDanger ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
            </div>
            <h3 className="text-md font-bold leading-tight">{title}</h3>
          </div>
          <button 
            onClick={onCancel}
            className={`p-1.5 rounded-lg transition ${
              isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 mb-6">
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            {message}
          </p>

          {confirmText && (
            <div className="space-y-2">
              <label className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? "text-slate-500" : "text-slate-400"}`}>
                Please type <span className="text-red-500 font-bold">"{confirmText}"</span> to confirm:
              </label>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={`Type "${confirmText}"`}
                className={`w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 transition ${
                  isDark
                    ? "bg-slate-950 border-slate-800 text-white focus:ring-blue-500/30 focus:border-blue-500"
                    : "bg-slate-50 border-slate-200 text-slate-900 focus:ring-blue-500/30 focus:border-blue-500"
                }`}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
              isDark
                ? "border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white"
                : "border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={!isConfirmedEnabled}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white transition shadow-sm ${
              !isConfirmedEnabled
                ? "bg-slate-500/20 cursor-not-allowed text-slate-500"
                : isDanger
                  ? "bg-red-600 hover:bg-red-700 shadow-red-600/10"
                  : "bg-blue-600 hover:bg-blue-700 shadow-blue-600/10"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
