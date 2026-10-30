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
 * Staff session mirrored from the server. The session token itself lives in an
 * httpOnly cookie — nothing sensitive is stored in the browser.
 *
 * Customers never sign in on this site, so the session is only checked when the
 * admin panel calls `refresh()`; catalogue pages make no auth request at all.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(read);
  // With a backend configured, /admin must verify the cookie session before
  // showing the login form — otherwise staff see a login flash on every visit.
  const [checking, setChecking] = useState(hasAPI);

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

  /** Confirms the cookie session with the backend (used by /admin on mount). */
  const refresh = async () => {
    if (!hasAPI) return;
    setChecking(true);
    try {
      setUser(await authMe());
    } finally {
      setChecking(false);
    }
  };

  const logout = async () => {
    try {
      await authLogout();
    } finally {
      setUser(null);
    }
  };

  return <AuthCtx.Provider value={{ user, setUser, refresh, logout, checking }}>{children}</AuthCtx.Provider>;
}
