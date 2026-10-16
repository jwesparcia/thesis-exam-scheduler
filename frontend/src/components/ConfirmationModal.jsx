import React, { useState, useEffect } from "react";
import { ExclamationTriangleIcon, InformationCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useTheme } from "../context/themeStore";

export default function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmText = "",
  confirmLabel,
  cancelLabel = "Cancel",
  cancelText,
  onConfirm,
  onCancel,
  onClose,
  isDanger = false,
  type = "",
  requireTypedConfirm,
}) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const [inputVal, setInputVal] = useState("");

  const handleCancel = () => {
    if (typeof onCancel === "function") {
      onCancel();
    } else if (typeof onClose === "function") {
      onClose();
    }
  };

  const effectiveCancelLabel = cancelText || cancelLabel || "Cancel";
  const effectiveConfirmLabel = confirmLabel || (confirmText && !requireTypedConfirm ? confirmText : "Confirm");
  const effectiveIsDanger = isDanger || type === "danger";

  // If requireTypedConfirm is explicitly false, no text required.
  // If requireTypedConfirm is true, require confirmText.
  // If requireTypedConfirm is undefined, require confirmText only if confirmText is non-empty.
  const hasTypedConfirm = requireTypedConfirm === true || (requireTypedConfirm !== false && Boolean(confirmText));
  const isConfirmedEnabled = !hasTypedConfirm || inputVal.trim().toLowerCase() === confirmText.toLowerCase();

  // Reset input when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setInputVal("");
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        handleCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onCancel, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmation-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
    >
      {/* Backdrop */}
      <div 
        onClick={handleCancel}
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 animate-in fade-in"
      ></div>

      {/* Modal Card */}
      <div 
        className={`relative w-full max-w-md p-6 rounded-2xl border shadow-2xl transition-all duration-300 transform scale-100 animate-in zoom-in-95 duration-200 ${
          isDark 
            ? "bg-slate-900 border-slate-700/80 text-slate-100" 
            : "bg-white border-slate-200 text-slate-900"
        }`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              effectiveIsDanger 
                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400" 
                : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
            }`}>
              {effectiveIsDanger ? <ExclamationTriangleIcon className="w-5 h-5" /> : <InformationCircleIcon className="w-5 h-5" />}
            </div>
            <h3 id="confirmation-modal-title" className="text-base sm:text-lg font-bold leading-tight">
              {title}
            </h3>
          </div>
          <button 
            type="button"
            onClick={handleCancel}
            aria-label="Close dialog"
            className={`p-1.5 rounded-lg transition ${
              isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
            }`}
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 mb-6">
          <p className={`text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
            {message}
          </p>

          {hasTypedConfirm && (
            <div className="space-y-2">
              <label className={`block text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Please type <span className="text-rose-600 dark:text-rose-400 font-bold">"{confirmText}"</span> to confirm:
              </label>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder={`Type "${confirmText}"`}
                className={`w-full px-3.5 py-2.5 text-sm rounded-xl border focus:outline-none focus:ring-2 transition ${
                  isDark
                    ? "bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:ring-blue-500/30 focus:border-blue-500"
                    : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:ring-blue-500/30 focus:border-blue-600 focus:bg-white"
                }`}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3">
          <button
            onClick={handleCancel}
            type="button"
            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${
              isDark
                ? "border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
                : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {effectiveCancelLabel}
          </button>
          <button
            onClick={onConfirm}
            type="button"
            disabled={!isConfirmedEnabled}
            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm ${
              !isConfirmedEnabled
                ? isDark
                  ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                  : "bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed"
                : effectiveIsDanger
                  ? "bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20 active:scale-95"
                  : "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20 active:scale-95"
            }`}
          >
            {effectiveConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
