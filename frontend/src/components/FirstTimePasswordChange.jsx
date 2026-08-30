import React, { useState, useEffect } from "react";
import { 
  LockClosedIcon, 
  EyeIcon, 
  EyeSlashIcon, 
  ArrowLeftStartOnRectangleIcon, 
  PaperAirplaneIcon,
  EnvelopeIcon,
  ArrowPathIcon
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
    if (newPassword.length < 6) {
      showWarning("Password must be at least 6 characters.");
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
      
      // Update the user state locally and in storage to remove first login state
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

  return (
    <div className={`min-h-screen w-full flex items-center justify-center p-4 transition-colors duration-300 ${
      isDark ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-950"
    }`}>
      {/* Settings drop menu substitute for first time change */}
      <div className="absolute top-6 right-6 flex items-center gap-3">
        {onSkip && (
          <button
            onClick={onSkip}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition shadow-sm border ${
              isDark 
                ? "bg-slate-800 border-slate-700 hover:bg-slate-700 text-blue-400" 
                : "bg-white border-slate-200 hover:bg-slate-50 text-blue-600"
            }`}
          >
            <span>Change Later</span>
          </button>
        )}
        <button
          onClick={onLogout}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold transition shadow-sm border ${
            isDark 
              ? "bg-slate-800 border-slate-700 hover:bg-slate-700 text-red-400" 
              : "bg-white border-slate-200 hover:bg-slate-50 text-red-600"
          }`}
        >
          <ArrowLeftStartOnRectangleIcon className="w-5 h-5" />
          <span>Logout</span>
        </button>
      </div>

      <div className={`w-full max-w-md p-8 rounded-3xl shadow-2xl border transition-all duration-300 ${
        isDark ? "bg-slate-800 border-slate-700/80" : "bg-white border-slate-200/60"
      }`}>
        {/* Header Section */}
        <div className="text-center mb-8">
          <div className={`w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center shadow-md ${
            isDark ? "bg-slate-700" : "bg-blue-50"
          }`}>
            <img src="/images.png" alt="STI Logo" className="rounded-xl h-10 w-10 object-contain" />
          </div>
          <h1 className={`text-2xl font-bold tracking-tight mb-2 ${isDark ? "text-white" : "text-slate-950"}`}>
            Secure Your Account
          </h1>
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-500"}`}>
            Since this is your first time logging in, you are required to change your default password.
          </p>
        </div>

        {/* Step 1: Request Code */}
        {!codeSent ? (
          <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
            <div className={`p-5 rounded-2xl border text-left ${
              isDark ? "bg-slate-900/40 border-slate-700/60" : "bg-slate-50 border-slate-100"
            }`}>
              <div className="flex items-start gap-3">
                <EnvelopeIcon className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
                <div>
                  <h3 className={`text-xs font-bold uppercase tracking-wider ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Registered Email
                  </h3>
                  <p className={`text-sm font-semibold mt-1 truncate ${isDark ? "text-slate-200" : "text-slate-800"}`}>
                    {user?.email}
                  </p>
                </div>
              </div>
            </div>

            <p className={`text-xs leading-relaxed text-left ${isDark ? "text-slate-400" : "text-slate-500"}`}>
              We will send a 6-digit verification code to this email to verify your identity. Make sure you have access to it before requesting.
            </p>

            <button
              onClick={handleSendCode}
              disabled={sendingCode}
              className={`w-full py-3.5 rounded-xl font-semibold text-white transition-all transform duration-200 shadow-md flex items-center justify-center gap-2 ${
                sendingCode
                  ? "bg-blue-400/50 cursor-not-allowed shadow-none"
                  : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
              }`}
            >
              {sendingCode ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Sending Verification Code...</span>
                </>
              ) : (
                <>
                  <PaperAirplaneIcon className="w-5 h-5 -rotate-45" />
                  <span>Send Verification Code</span>
                </>
              )}
            </button>
          </div>
        ) : (
          /* Step 2: Verification and Password Form */
          <form onSubmit={handleSubmit} className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                isDark ? "text-slate-400" : "text-slate-500"
              }`}>
                6-Digit Code sent to {user.email}
              </label>
              <div className="relative group">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="Enter 6-digit code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className={`w-full px-4 py-3.5 text-center font-mono tracking-[0.5em] text-lg rounded-xl border outline-none transition ${
                    isDark
                      ? "bg-slate-900/50 border-slate-600 text-white focus:border-blue-500 focus:bg-slate-700/50"
                      : "bg-slate-50 border-slate-200 text-slate-950 focus:border-blue-600 focus:bg-white"
                  }`}
                  required
                />
              </div>
            </div>

            {/* New Password Input */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                isDark ? "text-slate-400" : "text-slate-500"
              }`}>
                New Password
              </label>
              <div className="relative group">
                <LockClosedIcon className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition ${
                  isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                }`} />
                <input
                  type={showNewPassword ? "text" : "password"}
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`w-full pl-10 pr-12 py-3.5 rounded-xl border outline-none transition ${
                    isDark
                      ? "bg-slate-900/50 border-slate-600 text-white focus:border-blue-500 focus:bg-slate-700/50"
                      : "bg-slate-50 border-slate-200 text-slate-950 focus:border-blue-600 focus:bg-white"
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition ${
                    isDark ? "text-slate-500 hover:text-slate-300 hover:bg-slate-700" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {showNewPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Confirm Password Input */}
            <div>
              <label className={`block text-xs font-bold uppercase tracking-wider mb-2 ${
                isDark ? "text-slate-400" : "text-slate-500"
              }`}>
                Confirm Password
              </label>
              <div className="relative group">
                <LockClosedIcon className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition ${
                  isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                }`} />
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-10 pr-12 py-3.5 rounded-xl border outline-none transition ${
                    isDark
                      ? "bg-slate-900/50 border-slate-600 text-white focus:border-blue-500 focus:bg-slate-700/50"
                      : "bg-slate-50 border-slate-200 text-slate-950 focus:border-blue-600 focus:bg-white"
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition ${
                    isDark ? "text-slate-500 hover:text-slate-300 hover:bg-slate-700" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {showConfirmPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <button
                type="submit"
                disabled={verifying || !verificationCode || !newPassword || !confirmPassword}
                className={`w-full py-3.5 rounded-xl font-semibold text-white transition-all transform duration-200 shadow-md flex items-center justify-center gap-2 ${
                  verifying || !verificationCode || !newPassword || !confirmPassword
                    ? "bg-blue-400/50 cursor-not-allowed shadow-none"
                    : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0"
                }`}
              >
                {verifying ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Changing Password...</span>
                  </>
                ) : (
                  <span>Verify & Change Password</span>
                )}
              </button>

              {/* Resend Code Button & Countdown */}
              <div className="text-center mt-2">
                {resendTimer > 0 ? (
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    Resend code in <span className="font-bold font-mono">{resendTimer}s</span>
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={sendingCode}
                    className={`text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 mx-auto transition-all ${
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
