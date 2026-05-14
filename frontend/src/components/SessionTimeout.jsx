import React, { useEffect, useRef } from "react";
import { useUser } from "../context/userStore";
import { useToast } from "../context/ToastContext";

const TIMEOUT_DURATION = 30 * 60 * 1000; // 30 minutes

export default function SessionTimeout({ children }) {
  const { user, logout } = useUser();
  const { showError } = useToast();
  const timerRef = useRef(null);

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      handleLogout();
    }, TIMEOUT_DURATION);
  };

  const handleLogout = () => {
    if (user) {
      logout();
      showError("Session expired due to inactivity. Please log in again.");
    }
  };

  useEffect(() => {
    if (!user) return;

    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
    ];

    const handleActivity = () => resetTimer();

    events.forEach((event) => {
      window.addEventListener(event, handleActivity);
    });

    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [user, logout]);

  return <>{children}</>;
}
