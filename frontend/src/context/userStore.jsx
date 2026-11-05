import { createContext, useContext, useState, useEffect } from "react";

const UserContext = createContext(null);

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem("user") || sessionStorage.getItem("user");
    return saved ? JSON.parse(saved) : null;
  });

  const login = (userData) => {
    localStorage.setItem("user", JSON.stringify(userData));
    sessionStorage.setItem("user", JSON.stringify(userData));
    setUser(userData);
  };

  const logout = async () => {
    try {
      const userStr = localStorage.getItem("user") || sessionStorage.getItem("user");
      if (userStr) {
        const u = JSON.parse(userStr);
        if (u?.access_token) {
          const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
          fetch(`${apiUrl}/auth/logout`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${u.access_token}`,
              "Content-Type": "application/json",
            },
          }).catch(() => {});
        }
      }
    } catch (e) {
      // Ignore network/parse errors during logout cleanup
    }
    localStorage.removeItem("user");
    sessionStorage.removeItem("user");
    setUser(null);
  };

  // Cross-tab synchronization: ensures all tabs in the same browser session stay in sync
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === "user") {
        if (!e.newValue) {
          setUser(null);
        } else {
          try {
            const updatedUser = JSON.parse(e.newValue);
            setUser(updatedUser);
          } catch (err) {
            console.error("Error updating user from cross-tab event:", err);
          }
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  return (
    <UserContext.Provider value={{ user, login, logout }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error("useUser must be used within UserProvider");
  return context;
};