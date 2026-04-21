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

      const userData = response.data;

      // Normalize backend role: both "teacher" and "proctor" map to "proctor"
      const backendRole = userData.role === "teacher" ? "proctor" : userData.role;
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

      // Normalize role before saving so routing works consistently
      const normalizedUserData = { ...userData, role: backendRole };
      login(normalizedUserData);
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
    <div className={`min-h-screen relative overflow-hidden flex items-center justify-center p-4 ${isDark
      ? "bg-gray-900"
      : "bg-gray-50"
      }`}>
      {/* Background - Clean solid handled by parent class */}

      <div className="absolute top-6 right-6 z-20">
        <button
          onClick={toggleTheme}
          className={`p-3 rounded-full transition-all duration-300 ${isDark
            ? "bg-gray-800 hover:bg-gray-700 text-yellow-400 border border-gray-700"
            : "bg-white hover:bg-gray-100 text-gray-700 border border-gray-200"
            } shadow-sm`}
          aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        >
          {isDark ? <Sun className="w-5 h-5 cursor-pointer" /> : <Moon className="w-5 h-5 cursor-pointer" />}
        </button>
      </div>

      <div className={`relative w-full max-w-md rounded-xl p-8 shadow-lg border ${isDark
        ? "bg-gray-800 border-gray-700"
        : "bg-white border-gray-400"
        }`}>
        <div className="text-center mb-8">
          <div className={`w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center ${isDark ? "bg-blue-600" : "bg-blue-700"
            }`}>
            <img src="/images.png" alt="logo" className="rounded-xl h-14 w-14 object-contain" />
          </div>
          <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-900"
            }`}>
            Exam Scheduler
          </h1>
          <p className={`text-sm mt-2 ${isDark ? "text-gray-400" : "text-gray-600"}`}>
            Sign in to access your personalized dashboard
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
              Email Address
            </label>
            <div className="relative group">
              <UserCircle className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition ${isDark ? "text-gray-500 group-focus-within:text-blue-400" : "text-gray-400 group-focus-within:text-blue-600"
                }`} />
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full pl-10 pr-4 py-3 rounded-lg border outline-none transition ${isDark
                  ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500"
                  : "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-600"
                  }`}
              />
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
              Password
            </label>
            <div className="relative group">
              <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition ${isDark ? "text-gray-500 group-focus-within:text-blue-400" : "text-gray-400 group-focus-within:text-blue-600"
                }`} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`w-full pl-10 pr-12 py-3 rounded-lg border outline-none transition ${isDark
                  ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-500 focus:border-blue-500"
                  : "bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-600"
                  }`}
              />
              <button
                type="button"
                onClick={togglePasswordVisibility}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded transition ${isDark
                  ? "text-gray-500 hover:text-gray-300"
                  : "text-gray-400 hover:text-gray-600"
                  }`}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <label
              className={`block text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"
                }`}
            >
              Role
            </label>

            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setRole("program_head");
                }}
                className={`p-3 rounded-lg border cursor-pointer  transition ${role === "program_head"
                  ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500"
                  : isDark
                    ? "border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
              >
                <UserCircle className="w-5 h-5 mx-auto mb-1" />
                <div className="text-xs font-medium">Admin</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRole("proctor");
                }}
                className={`p-3 rounded-lg border cursor-pointer transition ${role === "proctor"
                  ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500"
                  : isDark
                    ? "border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
              >
                <UserCircle className="w-5 h-5 mx-auto mb-1" />
                <div className="text-xs font-medium">Proctor</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setRole("student");
                }}
                className={`p-3 rounded-lg border cursor-pointer transition ${role === "student"
                  ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-500"
                  : isDark
                    ? "border-gray-600 bg-gray-700 text-gray-300 hover:bg-gray-600"
                    : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
              >
                <UserCircle className="w-5 h-5 mx-auto mb-1" />
                <div className="text-xs font-medium">Student</div>
              </button>
            </div>
          </div>



          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className={`w-full py-3 rounded-lg font-semibold text-white transition transform ${loading || !email.trim() || !password.trim()
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 hover:shadow-md"
              }`}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                <span>Authenticating...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <LogIn className="w-5 h-5 cursor-pointer" />
                <span>Sign In</span>
              </div>
            )}
          </button>
        </form>

        <div className="mt-8 text-center">
          <p className={`text-xs ${isDark ? "text-gray-500" : "text-gray-500"}`}>
            v1.0 • Built with React & FastAPI
          </p>
        </div>
      </div>
    </div>
  );
}
