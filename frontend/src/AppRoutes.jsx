import React, { useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { useUser } from "./context/userStore";
import Login from "./pages/Login";
import ProgramHeadDashboard from "./pages/ProgramHeadDashboard";
import ProctorDashboard from "./pages/ProctorDashboard";
import StudentDashboard from "./pages/StudentDashboard";

function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useUser();
  const navigate = useNavigate();

  if (!user || !user.access_token) return <Navigate to="/login" replace />;
  if (!allowedRoles.includes(user.role)) {
    if (user.role === "program_head")
      return <Navigate to="/program-head" replace />;
    if (user.role === "proctor")
      return <Navigate to="/proctor" replace />;
    else
      return <Navigate to="/student" replace />;
  }

  return children;
}

function NavigateToDashboard() {
  const { user } = useUser();

  if (!user || !user.access_token) return <Navigate to="/login" replace />;

  if (user.role === "program_head")
    return <Navigate to="/program-head" replace />;
  if (user.role === "proctor")
    return <Navigate to="/proctor" replace />;
  else
    return <Navigate to="/student" replace />;
}

export default function AppRoutes() {
  const location = useLocation();

  useEffect(() => {
    const titles = {
      "/login": "Login | Exam Scheduler",
      "/program-head": "Program Head Dashboard | Exam Scheduler",
      "/proctor": "Proctor Dashboard | Exam Scheduler",
      "/student": "Student Dashboard | Exam Scheduler",
    };
    document.title = titles[location.pathname] || "Exam Scheduler";
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/program-head"
        element={
          <ProtectedRoute allowedRoles={["program_head"]}>
            <ProgramHeadDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/proctor"
        element={
          <ProtectedRoute allowedRoles={["proctor"]}>
            <ProctorDashboard />
          </ProtectedRoute>
        }
      />

      <Route
        path="/student"
        element={
          <ProtectedRoute allowedRoles={["student"]}>
            <StudentDashboard />
          </ProtectedRoute>
        }
      />

      <Route path="/" element={<NavigateToDashboard />} />
    </Routes>
  );
}
