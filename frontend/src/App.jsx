import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { ThemeProvider } from "./context/themeStore";
import { UserProvider } from "./context/userStore";
import { ToastProvider } from "./context/ToastContext";
import AppRoutes from "./AppRoutes";

export default function App() {
  return (
    <ThemeProvider>
      <UserProvider>
        <ToastProvider>
          <Router>
            <AppRoutes />
          </Router>
        </ToastProvider>
      </UserProvider>
    </ThemeProvider>
  );
}