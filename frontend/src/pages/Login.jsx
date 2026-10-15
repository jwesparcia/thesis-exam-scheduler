import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/userStore";
import { useTheme } from "../context/themeStore";
import { EyeIcon, EyeSlashIcon, ArrowRightStartOnRectangleIcon, UserCircleIcon, SunIcon, MoonIcon, LockClosedIcon } from "@heroicons/react/24/outline";
import api from "../api";
import { useToast } from "../context/ToastContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { showSuccess, showError } = useToast();
  const [loading, setLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const { login } = useUser();
  const navigate = useNavigate();

  const isFormValid = email.trim().length > 0 && password.trim().length > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;

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

      if (backendRole === "program_head") {
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
      setLoading(false);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
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
            Thesis & Examination<br />Scheduling System
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
              <label 
                htmlFor="login-password" 
                className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${isDark ? "text-slate-300" : "text-slate-700"}`}
              >
                Password
              </label>
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
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${
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
              }`}
            >
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

          <div className="mt-10 pt-6 border-t border-slate-200 dark:border-slate-800 text-center">
            <p className={`text-xs ${isDark ? "text-slate-500" : "text-slate-500"}`}>
              STI Thesis Exam Scheduler • Integrated Academic Portal
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
