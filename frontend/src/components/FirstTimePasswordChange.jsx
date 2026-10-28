import React, { useState, useEffect } from "react";
import { 
  LockClosedIcon, 
  EyeIcon, 
  EyeSlashIcon, 
  ArrowLeftStartOnRectangleIcon, 
  PaperAirplaneIcon,
  EnvelopeIcon,
  ArrowPathIcon,
  ShieldCheckIcon
} from "@heroicons/react/24/outline";
import api from "../api";
import { useToast } from "../context/ToastContext";

export default function FirstTimePasswordChange({ user, onPasswordChanged, isDark, onLogout, onSkip }) {
  const { showSuccess, showError, showWarning } = useToast();
  
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [verifying, setVerifying] = useState(false);
  
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
    if (sendingCode) return;
    setSendingCode(true);
    try {
      await api.post("/auth/request-verification-code", {
        email: user.email
      });
      setCodeSent(true);
      setResendTimer(60);
      showSuccess("Verification code sent to " + user.email);
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
      showWarning("Please enter the verification code.");
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 12) {
      showWarning("Password must be between 8 and 12 characters.");
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
        new_password: newPassword
      });
      
      showSuccess("Password changed successfully!");
      
      const updatedUser = {
        ...user,
        is_first_login: false
      };
      
      onPasswordChanged(updatedUser);
    } catch (error) {
      console.error("Failed to change password:", error);
      showError(error.response?.data?.detail || "Verification failed. Please check the code and try again.");
    } finally {
      setVerifying(false);
    }
  };

  const isFormValid = verificationCode.trim().length === 6 && newPassword.length >= 8 && newPassword.length <= 12 && confirmPassword.length >= 8 && confirmPassword.length <= 12;

  return (
    <div className={`min-h-screen w-full flex items-center justify-center p-4 transition-colors duration-300 ${
      isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"
    }`}>
      {/* Top action controls */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 flex items-center gap-2 sm:gap-3">
        {onSkip && (
          <button
            onClick={onSkip}
            type="button"
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition border ${
              isDark 
                ? "bg-slate-900 border-slate-700 hover:bg-slate-800 text-blue-400" 
                : "bg-white border-slate-300 hover:bg-slate-50 text-blue-700"
            }`}
          >
            <span>Change Later</span>
          </button>
        )}
        <button
          onClick={onLogout}
          type="button"
          className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition border ${
            isDark 
              ? "bg-slate-900 border-slate-700 hover:bg-slate-800 text-rose-400" 
              : "bg-white border-slate-300 hover:bg-slate-50 text-rose-600"
          }`}
        >
          <ArrowLeftStartOnRectangleIcon className="w-4 h-4" />
          <span>Sign Out</span>
        </button>
      </div>

      <div className={`w-full max-w-md p-6 sm:p-8 rounded-2xl sm:rounded-3xl shadow-xl border transition-all duration-300 mt-12 sm:mt-0 ${
        isDark ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
      }`}>
        {/* Header Section */}
        <div className="text-center mb-7">
          <div className={`w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center shadow-sm border ${
            isDark ? "bg-slate-800 border-slate-700" : "bg-blue-50 border-blue-100"
          }`}>
            <img src="/images.png" alt="STI Logo" className="rounded-xl h-9 w-9 object-contain" />
          </div>
          <h1 className={`text-xl sm:text-2xl font-bold tracking-tight mb-2 ${isDark ? "text-white" : "text-slate-900"}`}>
            Secure Your Account
          </h1>
          <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? "text-slate-400" : "text-slate-600"}`}>
            Since this is your first time logging in, please verify your email and set your private password.
          </p>
        </div>

        {/* Step 1: Request Code */}
        {!codeSent ? (
          <div className="space-y-5 text-center animate-in fade-in duration-200">
            <div className={`p-4 rounded-xl border text-left ${
              isDark ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"
            }`}>
              <div className="flex items-start gap-3">
                <EnvelopeIcon className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <h3 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Registered Email
                  </h3>
                  <p className={`text-sm font-bold mt-0.5 truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                    {user?.email}
                  </p>
                </div>
              </div>
            </div>

            <p className={`text-xs leading-relaxed text-left ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              We will send a 6-digit verification code to your registered email to confirm your identity.
            </p>

            <button
              onClick={handleSendCode}
              type="button"
              disabled={sendingCode}
              className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                sendingCode
                  ? isDark 
                    ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed" 
                    : "bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-sm hover:shadow-md"
              }`}
            >
              {sendingCode ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Sending Code...</span>
                </>
              ) : (
                <>
                  <PaperAirplaneIcon className="w-4 h-4 -rotate-45" />
                  <span>Send Verification Code</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* Step 2: Verification and Password Form */
          <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in duration-200">
            <div>
              <label 
                htmlFor="verification-code"
                className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${
                  isDark ? "text-slate-300" : "text-slate-700"
                }`}
              >
                6-Digit Verification Code
              </label>
              <div className="relative">
                <input
                  id="verification-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={`w-full px-4 py-3 text-center font-mono tracking-[0.5em] text-lg font-bold rounded-xl border outline-none transition ${
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
                  className={`block text-xs font-semibold uppercase tracking-wider ${
                    isDark ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  New Password
                </label>
                <span className={`text-[11px] font-medium transition-colors ${
                  newPassword.length >= 8 && newPassword.length <= 12
                    ? "text-emerald-500 font-semibold"
                    : newPassword.length > 0
                    ? "text-amber-500"
                    : isDark ? "text-slate-500" : "text-slate-400"
                }`}>
                  {newPassword.length}/12 chars (8–12 required)
                </span>
              </div>
              <div className="relative group">
                <LockClosedIcon className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                  isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                }`} />
                <input
                  id="new-password"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="8 to 12 characters"
                  maxLength={12}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value.slice(0, 12))}
                  className={`w-full pl-11 pr-12 py-3 rounded-xl border text-sm outline-none transition ${
                    isDark
                      ? "bg-slate-950 border-slate-700 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      : "bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
                    isDark ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
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
                  className={`block text-xs font-semibold uppercase tracking-wider ${
                    isDark ? "text-slate-300" : "text-slate-700"
                  }`}
                >
                  Confirm Password
                </label>
                {confirmPassword && (
                  <span className={`text-[11px] font-medium transition-colors ${
                    confirmPassword === newPassword ? "text-emerald-500 font-semibold" : "text-rose-500"
                  }`}>
                    {confirmPassword === newPassword ? "Passwords match" : "Does not match"}
                  </span>
                )}
              </div>
              <div className="relative group">
                <LockClosedIcon className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                  isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                }`} />
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter new password"
                  maxLength={12}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value.slice(0, 12))}
                  className={`w-full pl-11 pr-12 py-3 rounded-xl border text-sm outline-none transition ${
                    isDark
                      ? "bg-slate-950 border-slate-700 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                      : "bg-slate-50 border-slate-300 text-slate-900 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
                    isDark ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800" : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                  }`}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Password Policy Hint */}
            <div className={`p-3 rounded-xl text-xs border flex items-center gap-2.5 transition-colors ${
              newPassword.length >= 8 && newPassword.length <= 12
                ? isDark ? "bg-emerald-950/30 border-emerald-800/40 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                : isDark ? "bg-slate-950/60 border-slate-800 text-slate-400" : "bg-slate-50 border-slate-200 text-slate-600"
            }`}>
              <ShieldCheckIcon className={`w-4 h-4 shrink-0 ${
                newPassword.length >= 8 && newPassword.length <= 12 ? "text-emerald-500" : "text-slate-400"
              }`} />
              <span>Password Policy: Must be <strong>8 to 12 characters</strong> only.</span>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-3">
              <button
                type="submit"
                disabled={verifying || !isFormValid}
                className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                  verifying || !isFormValid
                    ? isDark
                      ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                      : "bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 text-white shadow-sm hover:shadow-md"
                }`}
              >
                {verifying ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <span>Verify & Update Password</span>
                )}
              </button>

              {/* Resend Code Button & Countdown */}
              <div className="text-center pt-1">
                {resendTimer > 0 ? (
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Resend code in <span className="font-bold font-mono">{resendTimer}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={sendingCode}
                    className={`text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300 inline-flex items-center gap-1 transition-all ${
                      sendingCode ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    <ArrowPathIcon className={`w-3.5 h-3.5 ${sendingCode ? "animate-spin" : ""}`} />
                    Resend Code
                  </button>
                )}
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
