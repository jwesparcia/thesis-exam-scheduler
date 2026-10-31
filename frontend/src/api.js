import axios from "axios";
import { getFriendlyErrorMessage } from "./utils/friendlyError";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
});

// Add logic to check for token in localStorage and add to headers
api.interceptors.request.use(
  (config) => {
    const userStr = sessionStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.access_token) {
          config.headers.Authorization = `Bearer ${user.access_token}`;
        }
      } catch (e) {
        console.error("Error parsing user from sessionStorage", e);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Replace technical error text with a message users can understand.
// Components keep reading `err.response.data.detail`, which is now always friendly.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    try {
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
