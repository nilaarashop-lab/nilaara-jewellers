import { createContext, useContext, useEffect, useState } from "react";
import { authMe, authLogout, setUnauthorizedHandler, hasAPI } from "../api/client";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

const read = () => {
  try {
    const v = localStorage.getItem("nilaara-user");
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};

/**
 * Auth state mirrors the server session. The session token itself lives in an
 * httpOnly cookie — nothing sensitive is stored in the browser.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(read);
  const [checking, setChecking] = useState(!hasAPI);

  // Validate the session cookie against the backend when the app boots.
  useEffect(() => {
    if (!hasAPI) return;
    let alive = true;
    authMe()
      .then((u) => {
        if (!alive) return;
        setUser(u);
        setChecking(false);
      })
      .catch(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      if (user) localStorage.setItem("nilaara-user", JSON.stringify(user));
      else localStorage.removeItem("nilaara-user");
    } catch {
      /* storage unavailable */
    }
  }, [user]);

  // Any 401/403 from an authenticated API call clears the stale local user.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  const logout = async () => {
    try {
      await authLogout();
    } finally {
      setUser(null);
    }
  };

  return <AuthCtx.Provider value={{ user, setUser, logout, checking }}>{children}</AuthCtx.Provider>;
}
