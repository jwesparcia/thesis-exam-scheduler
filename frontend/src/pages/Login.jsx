import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "../context/userStore";
import { useTheme } from "../context/themeStore";
import { Eye, EyeOff, LogIn, UserCircle, Sun, Moon, Lock } from "lucide-react";
import api from "../api";
import { useToast } from "../context/ToastContext";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const { showSuccess, showError } = useToast();
  // ... existing states
  const [role, setRole] = useState("program_head");

  const [loading, setLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const { login } = useUser();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return;

    setLoading(true);
    try {
      const response = await api.post("/auth/login", {
        email: email,
        password: password
      });

      const { access_token, user: backendUser } = response.data;

      // Map roles
      const backendRole = backendUser.role;
      const selectedRole = role;

      if (selectedRole !== backendRole) {
        throw {
          response: {
            data: {
              detail: `Invalid credentials for ${selectedRole === "program_head" ? "Admin" : selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)} role. This account is registered as a ${backendRole === "proctor" ? "Proctor" : backendRole}.`
            }
          }
        };
      }

      // Store combined object for api.js
      const loginPayload = {
        ...backendUser,
        access_token: access_token
      };

      login(loginPayload);
      showSuccess("Login successful!");

      // Navigate based on normalized role
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
    <div className={`min-h-screen flex w-full ${isDark ? "bg-gray-900" : "bg-white"}`}>
      {/* Left side - Image */}
      <div className="hidden lg:flex flex-1 relative bg-gray-900 overflow-hidden">
        <img 
          src="/orca.jpg" 
          alt="Orca Background" 
          className="absolute inset-0 w-full h-full object-cover opacity-90 transition-transform duration-10000 hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/40 to-transparent"></div>
        <div className="absolute inset-0 bg-blue-900/10 mix-blend-multiply"></div>
        <div className="relative z-10 flex flex-col justify-end p-12 lg:p-20 text-white w-full pb-24">
          <h2 className="text-4xl lg:text-5xl font-bold mb-6 tracking-tight drop-shadow-lg">
            Automated Exam<br/>Scheduling Platform
          </h2>
          <p className="text-lg lg:text-xl text-gray-200 max-w-lg font-light leading-relaxed drop-shadow-md">
            Efficiently manage exams, schedules, proctors, and student information through an integrated academic platform.
          </p>
        </div>
      </div>

      {/* Right side - Form */}
      <div className={`w-full lg:w-[550px] xl:w-[600px] flex flex-col justify-center px-8 sm:px-16 relative shadow-2xl z-10 ${isDark ? "bg-gray-800" : "bg-white"}`}>
        <div className="absolute top-6 right-6 z-20">
          <button
            onClick={toggleTheme}
            className={`p-3 rounded-full transition-all duration-300 ${isDark
              ? "bg-gray-700 hover:bg-gray-600 text-yellow-400 border border-gray-600"
              : "bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200"
              } shadow-sm`}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {isDark ? <Sun className="w-5 h-5 cursor-pointer" /> : <Moon className="w-5 h-5 cursor-pointer" />}
          </button>
        </div>

        <div className="w-full max-w-md mx-auto">
          <div className="text-left mb-10 mt-12">
            <div className={`w-16 h-16 mb-8 rounded-2xl flex items-center justify-center shadow-md ${isDark ? "bg-gray-700" : "bg-blue-50"}`}>
              <img src="/images.png" alt="logo" className="rounded-xl h-10 w-10 object-contain" />
            </div>
            <h1 className={`text-3xl font-bold tracking-tight mb-2 ${isDark ? "text-white" : "text-gray-900"}`}>
              Welcome back
            </h1>
            <p className={`text-base ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              Sign in to access your dashboard
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Email Address
              </label>
              <div className="relative group">
                <UserCircle className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition ${isDark ? "text-gray-500 group-focus-within:text-blue-400" : "text-gray-400 group-focus-within:text-blue-600"}`} />
                <input
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full pl-10 pr-4 py-3.5 rounded-xl border outline-none transition ${isDark
                    ? "bg-gray-900/50 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:bg-gray-700"
                    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:bg-white"
                    }`}
                />
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Password
              </label>
              <div className="relative group">
                <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition ${isDark ? "text-gray-500 group-focus-within:text-blue-400" : "text-gray-400 group-focus-within:text-blue-600"}`} />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-10 pr-12 py-3.5 rounded-xl border outline-none transition ${isDark
                    ? "bg-gray-900/50 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:bg-gray-700"
                    : "bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400 focus:border-blue-600 focus:bg-white"
                    }`}
                />
                <button
                  type="button"
                  onClick={togglePasswordVisibility}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg transition ${isDark
                    ? "text-gray-500 hover:text-gray-300 hover:bg-gray-600"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-200"
                    }`}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className={`block text-sm font-medium mb-3 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                Select Role
              </label>

              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setRole("program_head")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 ${role === "program_head"
                    ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-600 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500 dark:ring-blue-500"
                    : isDark
                      ? "border-gray-600 bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    }`}
                >
                  <UserCircle className="w-5 h-5 mx-auto mb-1.5" />
                  <div className="text-xs font-semibold">Admin</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("proctor")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 ${role === "proctor"
                    ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-600 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500 dark:ring-blue-500"
                    : isDark
                      ? "border-gray-600 bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    }`}
                >
                  <UserCircle className="w-5 h-5 mx-auto mb-1.5" />
                  <div className="text-xs font-semibold">Proctor</div>
                </button>

                <button
                  type="button"
                  onClick={() => setRole("student")}
                  className={`p-3 rounded-xl border cursor-pointer transition-all duration-200 ${role === "student"
                    ? "border-blue-600 bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-600 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500 dark:ring-blue-500"
                    : isDark
                      ? "border-gray-600 bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    }`}
                >
                  <UserCircle className="w-5 h-5 mx-auto mb-1.5" />
                  <div className="text-xs font-semibold">Student</div>
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              className={`w-full py-3.5 mt-4 rounded-xl font-semibold text-white transition-all transform duration-200 shadow-md ${loading || !email.trim() || !password.trim()
                ? "bg-blue-400/50 cursor-not-allowed shadow-none"
                : "bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:shadow-md"
                }`}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>Authenticating...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <LogIn className="w-5 h-5" />
                  <span>Sign In</span>
                </div>
              )}
            </button>
          </form>

          <div className="mt-10 text-center">
            <p className={`text-xs font-medium ${isDark ? "text-gray-500" : "text-gray-400"}`}>
              v1.0 • Built with React & FastAPI
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
