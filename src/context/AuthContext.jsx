import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API, apiFetch, setAuthErrorHandler, token as getToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authed, setAuthed] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Central auth-error handler: a 401/403 on a protected request (blocked /
  // pending / deleted account, or an expired token) resets the auth state and
  // redirects to /login with a one-time notice. Guarded against redirect loops
  // (no navigation when already on /login).
  useEffect(() => {
    setAuthErrorHandler(() => {
      localStorage.removeItem("ce_token");
      setAuthed(false);
      setUser(null);
      setSessionExpired(true);
      if (window.location.pathname !== "/login") {
        navigate("/login", { replace: true });
      }
    });
    return () => setAuthErrorHandler(null);
  }, [navigate]);

  useEffect(() => {
    const t = getToken();
    if (!t) { setLoadingUser(false); return; }
    apiFetch(`/kundenbereich`, { auth: true })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d => { setUser(d.user); setAuthed(true); })
      .catch(() => localStorage.removeItem("ce_token"))
      .finally(() => setLoadingUser(false));
  }, []);

  const login = useCallback(async (t) => {
    try {
      const r = await fetch(`${API}/kundenbereich`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setUser(d.user);
      setAuthed(true);
      setSessionExpired(false);
      return true;
    } catch {
      localStorage.removeItem("ce_token");
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("ce_token");
    setAuthed(false);
    setUser(null);
    setSessionExpired(false);
  }, []);

  const updateUser = useCallback((partial) => {
    setUser(prev => ({ ...prev, ...partial }));
  }, []);

  return (
    <AuthContext.Provider value={{ user, authed, loadingUser, sessionExpired, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
