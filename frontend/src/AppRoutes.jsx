import React from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useUser } from "./context/userStore";
import Login from "./pages/Login";
import ProgramHeadDashboard from "./pages/ProgramHeadDashboard";
import ProctorDashboard from "./pages/ProctorDashboard";
import StudentDashboard from "./pages/StudentDashboard";

function ProtectedRoute({ children, allowedRoles }) {
  const { user } = useUser();
  const navigate = useNavigate();

  if (!user) return <Navigate to="/login" replace />;
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

  if (!user) return <Navigate to="/login" replace />;

  if (user.role === "program_head")
    return <Navigate to="/program-head" replace />;
  if (user.role === "proctor")
    return <Navigate to="/proctor" replace />;
  else
    return <Navigate to="/student" replace />;
}

export default function AppRoutes() {
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
