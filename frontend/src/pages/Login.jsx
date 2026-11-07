import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/userStore";
import { useTheme } from "../context/themeStore";
import { 
  EyeIcon, 
  EyeSlashIcon, 
  ArrowRightStartOnRectangleIcon, 
  UserCircleIcon, 
  SunIcon, 
  MoonIcon, 
  LockClosedIcon,
  EnvelopeIcon,
  KeyIcon,
  XMarkIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon
} from "@heroicons/react/24/outline";
import api from "../api";
import { useToast } from "../context/ToastContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);
  const isSubmittingRef = useRef(false);

  // Forgot Password modal state
  const [showForgotModal, setShowForgotModal] = useState(false);
  const [forgotStep, setForgotStep] = useState(1); // 1 = request code, 2 = verify & reset
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotCode, setForgotCode] = useState("");
  const [forgotNewPassword, setForgotNewPassword] = useState("");
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState("");
  const [showForgotNewPassword, setShowForgotNewPassword] = useState(false);
  const [showForgotConfirmPassword, setShowForgotConfirmPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const { user, login, logout } = useUser();
  const navigate = useNavigate();

  const [authNotice, setAuthNotice] = useState(() => {
    const notice = sessionStorage.getItem("auth_notice");
    if (notice) {
      sessionStorage.removeItem("auth_notice");
      return notice;
    }
    return "";
  });

  const isFormValid = email.trim().length > 0 && password.trim().length > 0;

  const handleSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (isSubmittingRef.current || loading || !isFormValid) return;

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      const response = await api.post("/auth/login", {
        email: email.trim(),
        password: password
      });

      const { access_token, user: backendUser } = response.data;
      const backendRole = backendUser.role;

      const loginPayload = {
        ...backendUser,
        access_token: access_token
      };

      login(loginPayload);
      showSuccess("Login successful!");

      if (backendRole === "program_head" || backendRole === "admin") {
        navigate("/program-head", { replace: true });
      } else if (backendRole === "proctor") {
        navigate("/proctor", { replace: true });
      } else if (backendRole === "student") {
        navigate("/student", { replace: true });
      } else {
        console.error("Unknown role:", backendRole);
        showError("Login successful but unknown role.");
      }
    } catch (error) {
      console.error("Login failed:", error);
      showError(error.response?.data?.detail || "Login failed. Please check your credentials.");
    } finally {
      isSubmittingRef.current = false;
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleRequestForgotCode = async (e) => {
    if (e) e.preventDefault();
    const clean = forgotEmail.trim().toLowerCase();
    if (!clean || !clean.includes("@") || !clean.includes(".")) {
      showError("Please enter a valid registered email address.");
      return;
    }
    setForgotLoading(true);
    try {
      const res = await api.post("/auth/forgot-password/request-code", { email: clean });
      showSuccess(res.data?.message || "Verification code sent! Please check your email inbox.");
      setForgotStep(2);
    } catch (err) {
      showError(err.response?.data?.detail || "Could not send verification code. Please check your email.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleResetForgotPassword = async (e) => {
    if (e) e.preventDefault();
    const cleanEmail = forgotEmail.trim().toLowerCase();
    const cleanCode = forgotCode.trim();
    if (!cleanCode || cleanCode.length < 6) {
      showError("Please enter the 6-digit verification code sent to your email.");
      return;
    }
    if (!forgotNewPassword || forgotNewPassword.length < 8 || forgotNewPassword.length > 20) {
      showError("New password must be between 8 and 20 characters long.");
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      showError("New password and confirmation password do not match.");
      return;
    }
    setForgotLoading(true);
    try {
      const res = await api.post("/auth/forgot-password/reset", {
        email: cleanEmail,
        code: cleanCode,
        new_password: forgotNewPassword,
      });
      showSuccess(res.data?.message || "Password reset successfully! You can now sign in.");
      setEmail(cleanEmail);
      setPassword(forgotNewPassword);
      setShowForgotModal(false);
      setForgotCode("");
      setForgotNewPassword("");
      setForgotConfirmPassword("");
    } catch (err) {
      showError(err.response?.data?.detail || "Failed to reset password. Please check your code.");
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex w-full transition-colors duration-300 ${isDark ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      {/* Left side - Academic Visual Hero */}
      <div className="hidden lg:flex flex-1 relative bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 overflow-hidden">
        <img 
          src="/orca.jpg" 
          alt="Campus Academic Visual" 
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-luminosity transition-transform duration-10000 hover:scale-105"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent"></div>
        <div className="absolute inset-0 bg-blue-900/20 mix-blend-multiply"></div>
        
        <div className="relative z-10 flex flex-col justify-end p-12 lg:p-20 text-white w-full pb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-200 text-xs font-semibold uppercase tracking-wider mb-6 w-fit backdrop-blur-sm">
            <span>Official Academic Platform</span>
          </div>
          <h2 className="text-3xl lg:text-5xl font-extrabold mb-4 tracking-tight leading-tight text-white drop-shadow-md">
            Examination Scheduling System
          </h2>
          <p className="text-base lg:text-lg text-slate-300 max-w-lg font-normal leading-relaxed drop-shadow-sm">
            Automated conflict-free scheduling, proctor monitoring, irregular student enrollment, and departmental timetable administration.
          </p>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className={`w-full lg:w-[540px] xl:w-[580px] flex flex-col justify-center px-6 sm:px-14 relative shadow-2xl z-10 ${
        isDark ? "bg-slate-900 border-l border-slate-800" : "bg-white border-l border-slate-200"
      }`}>
        <div className="absolute top-6 right-6 z-20">
          <button
            onClick={toggleTheme}
            type="button"
            className={`p-2.5 rounded-xl border transition-colors ${
              isDark
                ? "bg-slate-800 hover:bg-slate-700 text-yellow-400 border-slate-700"
                : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
            }`}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5 text-slate-700" />}
          </button>
        </div>

        <div className="w-full max-w-md mx-auto py-12">
          <div className="text-left mb-8">
            <div className={`w-14 h-14 mb-6 rounded-2xl flex items-center justify-center shadow-sm border ${
              isDark ? "bg-slate-800 border-slate-700" : "bg-blue-50 border-blue-100"
            }`}>
              <img src="/images.png" alt="STI Logo" className="rounded-xl h-9 w-9 object-contain" />
            </div>
            <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight mb-2 ${isDark ? "text-white" : "text-slate-900"}`}>
              Account Sign In
            </h1>
            <p className={`text-sm ${isDark ? "text-slate-400" : "text-slate-600"}`}>
              Enter your credentials to access your exam scheduler portal
            </p>
          </div>

          {authNotice && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-3 shadow-sm animate-in fade-in duration-200">
              <ExclamationTriangleIcon className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
              <div className="flex-1">
                <span className="font-bold block mb-0.5">Session Terminated</span>
                <span>{authNotice}</span>
              </div>
            </div>
          )}

          {user && user.access_token ? (
            <div className={`p-6 rounded-2xl border shadow-sm ${
              isDark ? "bg-slate-800/80 border-slate-700 text-slate-200" : "bg-blue-50/80 border-blue-200 text-slate-800"
            }`}>
              <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-blue-600/10 dark:bg-blue-400/20 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <UserCircleIcon className="w-7 h-7" />
              </div>
              <h2 className="text-base font-bold text-center">Active Session in this Browser</h2>
              <p className="text-xs mt-2 text-center text-slate-500 dark:text-slate-400 leading-relaxed">
                You are currently signed in as <span className="font-bold text-blue-600 dark:text-blue-400">{user.name}</span> ({user.role === 'program_head' || user.role === 'admin' ? 'Program Head / Admin' : user.role === 'proctor' ? 'Proctor' : 'Student'}).
              </p>
              <p className="text-[11px] mt-1 text-center text-slate-400 dark:text-slate-500">
                A single browser session only supports one active account. To sign in with a different account, please log out first.
              </p>
              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (user.role === "program_head" || user.role === "admin") navigate("/program-head", { replace: true });
                    else if (user.role === "proctor") navigate("/proctor", { replace: true });
                    else navigate("/student", { replace: true });
                  }}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                  <span>Continue to Dashboard</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setAuthNotice("");
                  }}
                  className="w-full py-2.5 px-4 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Log Out of {user.name}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5" noValidate>
              <div>
                <label 
                  htmlFor="login-email" 
                  className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}
                >
                  Email Address
                </label>
                <div className="relative group">
                  <UserCircleIcon 
                    aria-hidden="true"
                    className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                      isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                    }`} 
                  />
                  <input
                    id="login-email"
                    type="email"
                    name="email"
                    autoComplete="username"
                    required
                    disabled={loading}
                    placeholder="name@sti.edu.ph"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`w-full pl-11 pr-4 py-3 rounded-xl border text-sm outline-none transition-all ${
                      isDark
                        ? "bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    }`}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label 
                    htmlFor="login-password" 
                    className={`block text-xs font-semibold uppercase tracking-wider ${isDark ? "text-slate-300" : "text-slate-700"}`}
                  >
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotEmail(email.trim());
                      setShowForgotModal(true);
                      setForgotStep(1);
                      setForgotCode("");
                      setForgotNewPassword("");
                      setForgotConfirmPassword("");
                      setShowForgotNewPassword(false);
                      setShowForgotConfirmPassword(false);
                    }}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative group">
                  <LockClosedIcon 
                    aria-hidden="true"
                    className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                      isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                    }`} 
                  />
                  <input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    name="password"
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`w-full pl-11 pr-12 py-3 rounded-xl border text-sm outline-none transition-all ${
                      isDark
                        ? "bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    }`}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isDark
                        ? "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                    }`}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !isFormValid}
                className={`w-full py-3.5 mt-2 rounded-xl font-semibold text-sm transition-all duration-200 shadow-sm flex items-center justify-center gap-2 ${
                  loading || !isFormValid
                    ? isDark
                      ? "bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed"
                      : "bg-slate-200 text-slate-400 border border-slate-200 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white shadow-blue-600/20 hover:shadow-md active:scale-[0.99]"
                }`} aria-label="Action button">
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Authenticating...</span>
                  </>
                ) : (
                  <>
                    <ArrowRightStartOnRectangleIcon className="w-5 h-5" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>
          )}

          <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
            <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
              STI Thesis Exam Scheduler • Integrated Academic Portal
            </p>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {showForgotModal && (
        <div 
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200"
        >
          <div 
            className="absolute inset-0"
            onClick={() => !forgotLoading && setShowForgotModal(false)}
          />
          <div className={`relative w-full max-w-md rounded-2xl border shadow-2xl p-6 sm:p-7 z-10 transition-all ${
            isDark ? "bg-slate-900 border-slate-700 text-slate-100" : "bg-white border-slate-200 text-slate-900"
          }`}>
            {/* Header */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isDark ? "bg-blue-600/20 text-blue-400 border border-blue-500/30" : "bg-blue-50 text-blue-600 border border-blue-200"
                }`}>
                  <KeyIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className={`text-lg font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
                    Reset Account Password
                  </h3>
                  <p className={`text-xs ${isDark ? "text-slate-400" : "text-slate-500"}`}>
                    {forgotStep === 1 ? "Step 1: Verify your registered email" : "Step 2: Enter code & set new password"}
                  </p>
                </div>
              </div>
              <button 
                type="button"
                onClick={() => !forgotLoading && setShowForgotModal(false)}
                className={`p-1.5 rounded-lg transition ${
                  isDark ? "hover:bg-slate-800 text-slate-400 hover:text-white" : "hover:bg-slate-100 text-slate-500 hover:text-slate-800"
                }`}
                aria-label="Close dialog"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Request Code */}
            {forgotStep === 1 && (
              <form onSubmit={handleRequestForgotCode} className="space-y-4">
                <p className={`text-xs sm:text-sm leading-relaxed ${isDark ? "text-slate-300" : "text-slate-600"}`}>
                  Enter your registered Outlook or school email address. The system will send a 6-digit verification code to confirm your identity.
                </p>

                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Registered Email (Outlook / STI Email)
                  </label>
                  <div className="relative group">
                    <EnvelopeIcon className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                      isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                    }`} />
                    <input
                      type="email"
                      required
                      placeholder="e.g. yourname@sti.edu.ph"
                      value={forgotEmail}
                      onChange={(e) => setForgotEmail(e.target.value)}
                      className={`w-full pl-11 pr-4 py-3 rounded-xl border text-sm outline-none transition-all ${
                        isDark
                          ? "bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                      }`}
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    disabled={forgotLoading}
                    className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                      isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotEmail.trim()}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {forgotLoading ? (
                      <>
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        <span>Sending Code...</span>
                      </>
                    ) : (
                      <>
                        <EnvelopeIcon className="w-4 h-4" />
                        <span>Send Verification Code</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: Enter Code & New Password */}
            {forgotStep === 2 && (
              <form onSubmit={handleResetForgotPassword} className="space-y-4">
                <div className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                  isDark ? "bg-blue-950/30 border-blue-800/40 text-blue-200" : "bg-blue-50 border-blue-200 text-blue-900"
                }`}>
                  <div className="truncate">
                    <span className="font-semibold">Code sent to: </span>
                    <strong className="underline">{forgotEmail}</strong>
                    <span className="ml-1.5 opacity-80">(Valid for 5 mins)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="text-blue-500 dark:text-blue-400 hover:underline text-xs font-bold shrink-0 cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    value={forgotCode}
                    onChange={(e) => setForgotCode(e.target.value.replace(/\D/g, ""))}
                    className={`w-full py-2.5 px-4 rounded-xl border text-center font-mono text-xl tracking-[0.4em] font-bold outline-none transition-all ${
                      isDark
                        ? "bg-slate-950 border-slate-700 text-white placeholder-slate-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                        : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                    }`}
                  />
                  <div className="flex justify-end mt-1">
                    <button
                      type="button"
                      onClick={handleRequestForgotCode}
                      disabled={forgotLoading}
                      className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Resend verification code
                    </button>
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    New Password (8-20 characters)
                  </label>
                  <div className="relative group">
                    <LockClosedIcon className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                      isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                    }`} />
                    <input
                      type={showForgotNewPassword ? "text" : "password"}
                      required
                      minLength={8}
                      maxLength={20}
                      placeholder="Enter new password"
                      value={forgotNewPassword}
                      onChange={(e) => setForgotNewPassword(e.target.value)}
                      className={`w-full pl-11 pr-12 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                        isDark
                          ? "bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotNewPassword(!showForgotNewPassword)}
                      className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"
                      }`}
                      aria-label="Toggle new password visibility"
                    >
                      {showForgotNewPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className={`block text-xs font-semibold uppercase tracking-wider mb-1.5 ${isDark ? "text-slate-300" : "text-slate-700"}`}>
                    Confirm New Password
                  </label>
                  <div className="relative group">
                    <LockClosedIcon className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors ${
                      isDark ? "text-slate-500 group-focus-within:text-blue-400" : "text-slate-400 group-focus-within:text-blue-600"
                    }`} />
                    <input
                      type={showForgotConfirmPassword ? "text" : "password"}
                      required
                      minLength={8}
                      maxLength={20}
                      placeholder="Confirm new password"
                      value={forgotConfirmPassword}
                      onChange={(e) => setForgotConfirmPassword(e.target.value)}
                      className={`w-full pl-11 pr-12 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                        isDark
                          ? "bg-slate-950 border-slate-700 text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                          : "bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowForgotConfirmPassword(!showForgotConfirmPassword)}
                      className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors cursor-pointer ${
                        isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"
                      }`}
                      aria-label="Toggle confirm password visibility"
                    >
                      {showForgotConfirmPassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                    </button>
                  </div>
                  {forgotNewPassword && forgotConfirmPassword && (
                    <div className="mt-1 text-xs">
                      {forgotNewPassword === forgotConfirmPassword ? (
                        <span className="text-emerald-500 font-semibold flex items-center gap-1">
                          <CheckCircleIcon className="w-4 h-4" /> Passwords match
                        </span>
                      ) : (
                        <span className="text-rose-500 font-semibold">
                          Passwords do not match
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <div className="pt-2 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowForgotModal(false)}
                    disabled={forgotLoading}
                    className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition ${
                      isDark ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading || !forgotCode || forgotCode.length < 6 || !forgotNewPassword || forgotNewPassword !== forgotConfirmPassword}
                    className="px-5 py-2.5 rounded-xl text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white transition shadow-sm flex items-center gap-2 disabled:opacity-50"
                  >
                    {forgotLoading ? (
                      <>
                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                        <span>Updating Password...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon className="w-4 h-4" />
                        <span>Reset Password</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
