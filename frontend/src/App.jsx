import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { ThemeProvider } from "./context/themeStore";
import { UserProvider } from "./context/userStore";
import { ToastProvider } from "./context/ToastContext";
import AppRoutes from "./AppRoutes";
import SessionTimeout from "./components/SessionTimeout";

export default function App() {
  return (
    <ThemeProvider>
      <UserProvider>
        <ToastProvider>
          <Router>
            <SessionTimeout>
              <AppRoutes />
            </SessionTimeout>
          </Router>
        </ToastProvider>
      </UserProvider>
    </ThemeProvider>
  );
}