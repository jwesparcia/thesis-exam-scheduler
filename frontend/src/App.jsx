import React from "react";
import { BrowserRouter as Router } from "react-router-dom";
import { ThemeProvider } from "./context/themeStore";
import { UserProvider } from "./context/userStore";
import { ToastProvider } from "./context/ToastContext";
import AppRoutes from "./AppRoutes";
import SessionTimeout from "./components/SessionTimeout";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("React ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", background: "#1e1e2e", color: "#f38ba8", minHeight: "100vh" }}>
          <h2 style={{ color: "#cba6f7" }}>⚠ Runtime Error</h2>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#f38ba8" }}>
            {this.state.error?.toString()}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#a6e3a1", marginTop: 16 }}>
            {this.state.info?.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <ErrorBoundary>
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
    </ErrorBoundary>
  );
}