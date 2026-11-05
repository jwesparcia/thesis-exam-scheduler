import axios from "axios";
import { getFriendlyErrorMessage } from "./utils/friendlyError";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

// Add logic to check for token in localStorage or sessionStorage and add to headers
api.interceptors.request.use(
  (config) => {
    const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.access_token) {
          config.headers.Authorization = `Bearer ${user.access_token}`;
        }
      } catch (e) {
        console.error("Error parsing user from storage", e);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Replace technical error text with a message users can understand.
// Also intercept 401 session invalidations (e.g., account logged in from another device)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    try {
      if (error.response && error.response.status === 401) {
        const isLoginReq = error.config?.url && error.config.url.includes("/auth/login");
        if (!isLoginReq) {
          localStorage.removeItem("user");
          sessionStorage.removeItem("user");
          const detail = String(error.response.data?.detail || "");
          if (detail.toLowerCase().includes("superseded")) {
            sessionStorage.setItem(
              "auth_notice",
              "Your account was signed in from another device or browser. This session has been terminated."
            );
          }
          if (window.location.pathname !== "/login" && window.location.pathname !== "/") {
            window.location.href = "/login";
          }
        }
      }

      const friendly = getFriendlyErrorMessage(error);
      if (!error.response) {
        error.response = { status: 0, data: { detail: friendly } };
      } else {
        if (!error.response.data || typeof error.response.data !== "object") {
          error.response.data = {};
        }
        error.response.data.detail = friendly;
      }
    } catch (e) {
      console.error("Error while formatting API error", e);
    }
    return Promise.reject(error);
  }
);

export default api;
