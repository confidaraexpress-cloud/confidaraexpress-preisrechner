import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { API, authH, token as getToken } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [authed, setAuthed] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (!t) { setLoadingUser(false); return; }
    fetch(`${API}/kundenbereich`, { headers: authH() })
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
  }, []);

  return (
    <AuthContext.Provider value={{ user, authed, loadingUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
