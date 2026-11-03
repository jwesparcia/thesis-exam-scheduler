import React, { useState, useEffect } from "react";
import {
  XMarkIcon,
  KeyIcon,
  EyeIcon,
  EyeSlashIcon,
  LockClosedIcon,
  EnvelopeIcon,
  PaperAirplaneIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";
import api from "../api";
import { useToast } from "../context/ToastContext";
import { useUser } from "../context/userStore";

export default function ChangePasswordModal({ isOpen, onClose, isDark }) {
  const { user, login } = useUser();
  const { showSuccess, showError, showWarning } = useToast();

  const [mode, setMode] = useState("direct"); // "direct" or "email"

  // Direct change states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Email verification states
  const [verificationCode, setVerificationCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const [submitting, setSubmitting] = useState(false);

  // Reset form when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setVerificationCode("");
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setSubmitting(false);
    }
  }, [isOpen]);

  // Countdown timer for resending email code
  useEffect(() => {
    let interval = null;
    if (resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else if (resendTimer === 0 && interval) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [resendTimer]);

  if (!isOpen) return null;

  const handleSendCode = async () => {
    if (sendingCode || !user?.email) return;
    setSendingCode(true);
    try {
      await api.post("/auth/request-verification-code", {
        email: user.email,
      });
      setResendTimer(60);
      showSuccess(`Verification code sent to ${user.email}`);
    } catch (err) {
      console.error("Failed to send code:", err);
      showError(err.response?.data?.detail || "Failed to send code. Please check your email configuration.");
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (newPassword.length < 8 || newPassword.length > 20) {
      showWarning("New password must be between 8 and 20 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      showWarning("New passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      if (mode === "direct") {
        if (!currentPassword) {
          showWarning("Please enter your current password.");
          setSubmitting(false);
          return;
        }

        await api.post("/auth/change-password", {
          current_password: currentPassword,
          new_password: newPassword,
        });

        showSuccess("Password changed successfully!");
      } else {
        if (!verificationCode.trim()) {
          showWarning("Please enter the 6-digit verification code.");
          setSubmitting(false);
          return;
        }

        await api.post("/auth/verify-and-change-password", {
          email: user.email,
          code: verificationCode.trim(),
          new_password: newPassword,
        });

        showSuccess("Password changed successfully!");
      }

      if (user) {
        login({
          ...user,
          is_first_login: false,
        });
      }

      onClose();
    } catch (err) {
      console.error("Change password error:", err);
      showError(err.response?.data?.detail || "Failed to change password. Please check your inputs.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className={`w-full max-w-md rounded-2xl shadow-2xl border overflow-hidden transition-all duration-200 ${
          isDark
            ? "bg-slate-900 border-slate-700/80 text-slate-100 shadow-black/80"
            : "bg-white border-slate-200 text-slate-900 shadow-xl"
        }`}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between ${
            isDark ? "border-slate-800 bg-slate-950/50" : "border-slate-100 bg-slate-50/80"
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-600/10 text-blue-600 border border-blue-600/20">
              <KeyIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold">Change Password</h3>
              <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                Secure your account with a new password
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg transition ${
              isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-900"
            }`}
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className={`px-6 pt-4 pb-2 flex gap-2 border-b ${isDark ? "border-slate-800" : "border-slate-100"}`}>
          <button
            type="button"
            onClick={() => setMode("direct")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
              mode === "direct"
                ? "bg-blue-600 text-white shadow-sm"
                : isDark
                ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Using Current Password
          </button>
          <button
            type="button"
            onClick={() => setMode("email")}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition ${
              mode === "email"
                ? "bg-blue-600 text-white shadow-sm"
                : isDark
                ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Via Email Code
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === "direct" ? (
            /* Current Password field */
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Current Password
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm pr-10 outline-none transition ${
                    isDark
                      ? "bg-slate-800/80 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500"
                      : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 transition"
                >
                  {showCurrent ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ) : (
            /* Email Code field */
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                Verification Code (sent to {user?.email || "your email"})
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="6-digit code"
                  className={`flex-1 px-3.5 py-2.5 rounded-xl border text-sm text-center font-mono tracking-widest outline-none transition ${
                    isDark
                      ? "bg-slate-800/80 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500"
                      : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600"
                  }`}
                />
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode || resendTimer > 0}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 ${
                    resendTimer > 0
                      ? "opacity-60 cursor-not-allowed bg-slate-800 text-slate-400 border-slate-700"
                      : "bg-blue-600 hover:bg-blue-500 text-white border-transparent cursor-pointer"
                  }`}
                >
                  {sendingCode ? (
                    <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <PaperAirplaneIcon className="w-3.5 h-3.5" />
                  )}
                  {resendTimer > 0 ? `${resendTimer}s` : "Send Code"}
                </button>
              </div>
            </div>
          )}

          {/* New Password field */}
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              New Password <span className="text-xs font-normal opacity-70">(8–20 characters)</span>
            </label>
            <div className="relative">
              <input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                minLength={8}
                maxLength={20}
                required
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm pr-10 outline-none transition ${
                  isDark
                    ? "bg-slate-800/80 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500"
                    : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 transition"
              >
                {showNew ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password field */}
          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
              Confirm New Password
            </label>
            <div className="relative">
              <input
                type={showConfirm ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                minLength={8}
                maxLength={20}
                required
                className={`w-full px-3.5 py-2.5 rounded-xl border text-sm pr-10 outline-none transition ${
                  isDark
                    ? "bg-slate-800/80 border-slate-700 text-white placeholder-slate-500 focus:border-blue-500"
                    : "bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600"
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-3 text-slate-400 hover:text-slate-200 transition"
              >
                {showConfirm ? <EyeSlashIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="mt-1 text-xs text-rose-500 font-medium">Passwords do not match</p>
            )}
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={`px-4 py-2.5 rounded-xl text-xs font-semibold border transition ${
                isDark
                  ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                  : "border-slate-200 text-slate-600 hover:bg-slate-100"
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !newPassword || newPassword !== confirmPassword}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${
                submitting || !newPassword || newPassword !== confirmPassword
                  ? "bg-blue-600/50 text-white/70 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/25 cursor-pointer"
              }`}
            >
              {submitting ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <CheckCircleIcon className="w-4 h-4" />
                  Save Password
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
