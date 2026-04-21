import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000",
});

// Add logic to check for token in localStorage and add to headers
api.interceptors.request.use(
  (config) => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.access_token) {
          config.headers.Authorization = `Bearer ${user.access_token}`;
        }
      } catch (e) {
        console.error("Error parsing user from localStorage", e);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

export default api;
