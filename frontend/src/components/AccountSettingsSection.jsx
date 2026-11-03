import React, { useState, useEffect } from "react";
import {
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  PaperAirplaneIcon,
  EnvelopeIcon,
  ArrowPathIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";
import api from "../api";
import { useToast } from "../context/ToastContext";
import { useUser } from "../context/userStore";

export default function AccountSettingsSection({ isDark }) {
  const { user, login } = useUser();
  const { showSuccess, showError, showWarning } = useToast();

  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [demoCode, setDemoCode] = useState("");

  const [resendTimer, setResendTimer] = useState(0);

  // Countdown timer for resending verification code
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

  const handleSendCode = async () => {
    if (sendingCode || !user?.email) return;
    setSendingCode(true);
    setDemoCode("");
    try {
      const res = await api.post("/auth/request-verification-code", {
        email: user.email,
      });
      setCodeSent(true);
      setResendTimer(60);
      showSuccess(`Verification code sent to ${user.email}`);

      // If backend provides demo code for test/school.edu accounts
      if (res.data?.code) {
        setDemoCode(res.data.code);
        setVerificationCode(res.data.code);
      }
    } catch (error) {
      console.error("Failed to send code:", error);
      showError(error.response?.data?.detail || "Failed to send verification code. Please try again.");
    } finally {
      setSendingCode(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!verificationCode.trim()) {
      showWarning("Please enter the 6-digit verification code.");
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 12) {
      showWarning("Password must be between 8 and 12 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      showWarning("Passwords do not match.");
      return;
    }

    setVerifying(true);
    try {
      await api.post("/auth/verify-and-change-password", {
        email: user.email,
        code: verificationCode.trim(),
        new_password: newPassword,
      });

      showSuccess("Password changed successfully!");

      // Update user state so first login flag is cleared
      if (user) {
        login({
          ...user,
          is_first_login: false,
        });
      }

      // Reset form
      setVerificationCode("");
      setNewPassword("");
      setConfirmPassword("");
      setCodeSent(false);
      setDemoCode("");
    } catch (error) {
      console.error("Failed to change password:", error);
      showError(error.response?.data?.detail || "Verification failed. Please check the code and try again.");
    } finally {
      setVerifying(false);
    }
  };

  const isFormValid =
    verificationCode.trim().length === 6 &&
    newPassword.length >= 8 &&
    newPassword.length <= 12 &&
    confirmPassword.length >= 8 &&
    confirmPassword.length <= 12 &&
    newPassword === confirmPassword;

  return (
    <div className={`space-y-6 max-w-4xl mx-auto pb-12 animate-in fade-in duration-300 ${
      isDark ? "text-slate-100" : "text-slate-900"
    }`}>
      {/* Top Banner */}
      <div
        className={`p-6 sm:p-8 rounded-3xl border shadow-sm relative overflow-hidden transition-all ${
          isDark
            ? "bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 border-slate-800"
            : "bg-gradient-to-br from-white via-white to-blue-50/60 border-slate-200"
        }`}
      >
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 sm:p-3.5 rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/30">
              <KeyIcon className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className={`text-xl sm:text-2xl font-bold tracking-tight ${isDark ? "text-white" : "text-slate-900"}`}>
                  Account Settings & Security
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  Password Management
                </span>
              </div>
              <p className={`text-xs sm:text-sm mt-1 leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                Verify your identity via registered email code to update your private password.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Account Profile Overview */}
        <div className="space-y-6">
          <div
            className={`p-6 rounded-3xl border shadow-sm ${
              isDark ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"
            }`}
          >
            <h2 className={`text-xs font-bold uppercase tracking-wider mb-4 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
              User Profile
            </h2>
            <div className="flex items-center gap-3.5 mb-5">
              <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center font-bold text-lg border border-blue-500/20">
                {user?.name ? user.name[0].toUpperCase() : "U"}
              </div>
              <div className="min-w-0">
                <div className={`font-bold text-sm sm:text-base truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                  {user?.name || "User"}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    {user?.is_super_admin ? "Super Admin (GE)" : user?.department_code ? `${user.department_code} Admin` : user?.role || "Active Account"}
                  </span>
                </div>
              </div>
            </div>

            <div className={`p-4 rounded-2xl border text-left space-y-2 ${
              isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
            }`}>
              <div className="flex items-center gap-2">
                <EnvelopeIcon className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Registered Email
                </span>
              </div>
              <div className={`text-sm font-bold truncate ${isDark ? "text-white" : "text-slate-900"}`}>
                {user?.email}
              </div>
            </div>

            {/* Bullet points info box */}
            <div className={`mt-5 space-y-2.5 text-xs leading-relaxed ${isDark ? "text-slate-200" : "text-slate-700"}`}>
              <div className="flex items-center gap-2.5">
                <CheckCircleIcon className="w-4 h-4 text-blue-500 shrink-0" />
                <span className={isDark ? "text-slate-200 font-medium" : "text-slate-700"}>
                  Verification code will be sent to this email
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircleIcon className="w-4 h-4 text-blue-500 shrink-0" />
                <span className={isDark ? "text-slate-200 font-medium" : "text-slate-700"}>
                  Codes remain active for 15 minutes
                </span>
              </div>
              <div className="flex items-center gap-2.5">
                <CheckCircleIcon className="w-4 h-4 text-blue-500 shrink-0" />
                <span className={isDark ? "text-slate-200 font-medium" : "text-slate-700"}>
                  Password must be between 8 and 12 characters
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Password Change Form */}
        <div className="lg:col-span-2">
          <div
            className={`p-6 sm:p-8 rounded-3xl border shadow-sm ${
              isDark ? "bg-slate-900/90 border-slate-800" : "bg-white border-slate-200"
            }`}
          >
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h2 className={`text-base font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                  Email Verification & Password Change
                </h2>
                <p className={`text-xs mt-1 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Step 1: Request 6-digit code → Step 2: Set your new password
                </p>
              </div>
              {codeSent && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <CheckCircleIcon className="w-3.5 h-3.5" />
                  Code Dispatched
                </span>
              )}
            </div>

            {/* Step 1: Request Code button */}
            {!codeSent ? (
              <div className="space-y-6 text-center py-4">
                <div className={`p-5 rounded-2xl border text-left ${
                  isDark ? "bg-slate-950/60 border-slate-800" : "bg-blue-50/50 border-blue-100"
                }`}>
                  <div className="flex items-start gap-3.5">
                    <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0 shadow-md shadow-blue-600/20">
                      <EnvelopeIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={`text-sm font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                        Send Security Verification Code
                      </h3>
                      <p className={`text-xs leading-relaxed mt-1.5 ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                        Click below to generate and send a 6-digit one-time code to{" "}
                        <strong className={`font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                          {user?.email}
                        </strong>
                        . Once received, enter the code along with your new password.
                      </p>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={sendingCode}
                  className={`w-full py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    sendingCode
                      ? "bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white shadow-lg shadow-blue-600/30"
                  }`}
                >
                  {sendingCode ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      <span>Sending Verification Code...</span>
                    </>
                  ) : (
                    <>
                      <PaperAirplaneIcon className="w-4 h-4 -rotate-45" />
                      <span>Send 6-Digit Verification Code</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* Step 2: Verification Code & Password Form */
              <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in duration-200">
                {/* Demo Code Helper (if provided by backend) */}
                {demoCode && (
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between">
                    <span className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                      Security Code auto-detected:
                    </span>
                    <span className="font-mono text-sm font-extrabold tracking-widest text-amber-600 dark:text-amber-400">
                      {demoCode}
                    </span>
                  </div>
                )}

                {/* 6-Digit Code Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="verification-code"
                      className={`block text-xs font-bold uppercase tracking-wider ${
                        isDark ? "text-slate-200" : "text-slate-700"
                      }`}
                    >
                      6-Digit Verification Code
                    </label>
                    <button
                      type="button"
                      onClick={handleSendCode}
                      disabled={sendingCode || resendTimer > 0}
                      className={`text-xs font-semibold transition ${
                        resendTimer > 0
                          ? "text-slate-400 cursor-not-allowed"
                          : "text-blue-600 hover:text-blue-500 underline cursor-pointer"
                      }`}
                    >
                      {resendTimer > 0 ? `Resend code in ${resendTimer}s` : "Resend Code"}
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      id="verification-code"
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className={`w-full px-4 py-3 text-center font-mono tracking-[0.5em] text-xl font-bold rounded-2xl border outline-none transition ${
                        isDark
                          ? "bg-slate-950 border-slate-700 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          : "bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                      }`}
                      required
                    />
                  </div>
                </div>

                {/* New Password Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="new-password"
                      className={`block text-xs font-bold uppercase tracking-wider ${
                        isDark ? "text-slate-200" : "text-slate-700"
                      }`}
                    >
                      New Password
                    </label>
                    <span
                      className={`text-xs font-medium transition-colors ${
                        newPassword.length >= 8 && newPassword.length <= 12
                          ? "text-emerald-500 font-bold"
                          : newPassword.length > 0
                          ? "text-amber-500"
                          : isDark
                          ? "text-slate-300"
                          : "text-slate-500"
                      }`}
                    >
                      {newPassword.length}/12 chars (8–12 required)
                    </span>
                  </div>
                  <div className="relative group">
                    <LockClosedIcon
                      className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                        isDark ? "text-slate-400 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                      }`}
                    />
                    <input
                      id="new-password"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="8 to 12 characters"
                      maxLength={12}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value.slice(0, 12))}
                      className={`w-full pl-11 pr-12 py-3 rounded-2xl border text-sm outline-none transition ${
                        isDark
                          ? "bg-slate-950 border-slate-700 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          : "bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword(!showNewPassword)}
                      className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isDark ? "text-slate-300 hover:text-white" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {showNewPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password Input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label
                      htmlFor="confirm-password"
                      className={`block text-xs font-bold uppercase tracking-wider ${
                        isDark ? "text-slate-200" : "text-slate-700"
                      }`}
                    >
                      Confirm Password
                    </label>
                    {confirmPassword && (
                      <span
                        className={`text-xs font-medium transition-colors ${
                          confirmPassword === newPassword ? "text-emerald-500 font-bold" : "text-rose-500"
                        }`}
                      >
                        {confirmPassword === newPassword ? "Passwords match" : "Does not match"}
                      </span>
                    )}
                  </div>
                  <div className="relative group">
                    <LockClosedIcon
                      className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                        isDark ? "text-slate-400 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                      }`}
                    />
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Re-enter password"
                      maxLength={12}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value.slice(0, 12))}
                      className={`w-full pl-11 pr-12 py-3 rounded-2xl border text-sm outline-none transition ${
                        isDark
                          ? "bg-slate-950 border-slate-700 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          : "bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                      }`}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isDark ? "text-slate-300 hover:text-white" : "text-slate-500 hover:text-slate-700"
                      }`}
                    >
                      {showConfirmPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Form Buttons */}
                <div className="pt-3 flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => {
                      setCodeSent(false);
                      setVerificationCode("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition border ${
                      isDark
                        ? "border-slate-700 hover:bg-slate-800 text-slate-200 hover:text-white"
                        : "border-slate-300 hover:bg-slate-100 text-slate-700"
                    }`}
                  >
                    Start Over
                  </button>

                  <button
                    type="submit"
                    disabled={!isFormValid || verifying}
                    className={`px-6 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2 ${
                      !isFormValid || verifying
                        ? "bg-slate-300 dark:bg-slate-800 text-slate-500 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 cursor-pointer"
                    }`}
                  >
                    {verifying ? (
                      <>
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        <span>Verifying & Updating...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheckIcon className="w-4 h-4" />
                        <span>Save New Password</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
