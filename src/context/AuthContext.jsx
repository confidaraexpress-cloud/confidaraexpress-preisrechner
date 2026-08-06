import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API, apiFetch, setAuthErrorHandler, token as getToken } from "../api/client";
import { clearShippingFlowStorage } from "../utils/shippingFlowStorage";

const AuthContext = createContext(null);

// Formt die /kundenbereich-Antwort in das User-Objekt. Das additive Feld
// `pendingEmailChange` (ausstehende Login-E-Mail-Änderung) liegt laut Backend-
// Vertrag TOP-LEVEL neben `user`; es wird bewusst in das User-Objekt gefaltet,
// damit es die einzige Quelle der Wahrheit ist, Reloads übersteht (AuthContext
// lädt /kundenbereich beim Mount) und über updateUser/refreshUser synchron
// bleibt — ohne neue globale State-Bibliothek. Defensiv: falls das Backend es
// je unter `user` liefert, wird auch das übernommen; sonst null.
function userFromKundenbereich(d) {
  const u = (d && d.user) || {};
  const pending = d?.pendingEmailChange ?? u.pendingEmailChange ?? null;
  return { ...u, pendingEmailChange: pending };
}

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [authed, setAuthed] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Central auth-error handler: a 401/403 on a protected request (blocked /
  // pending / deleted account, or an expired token) resets the auth state and
  // redirects to /login with a one-time notice. Guarded against redirect loops
  // (no navigation when already on /login). Ausnahme: die ÖFFENTLICHE
  // Bestätigungsseite /confirm-email-change darf NICHT weggeleitet werden —
  // sie arbeitet mit einem eigenen E-Mail-Token und muss auch bei stale/abge-
  // laufener Session erreichbar bleiben. Das ist KEINE generelle Abschwächung
  // des 401-Handlings: Token/State werden weiterhin bereinigt, nur die
  // Weiterleitung entfällt für genau diese eine öffentliche Route.
  useEffect(() => {
    setAuthErrorHandler(() => {
      localStorage.removeItem("ce_token");
      clearShippingFlowStorage();   // dieselbe Bereinigung wie beim Abmelden
      setAuthed(false);
      setUser(null);
      setSessionExpired(true);
      const path = window.location.pathname;
      if (path !== "/login" && path !== "/confirm-email-change") {
        navigate("/login", { replace: true });
      }
    });
    return () => setAuthErrorHandler(null);
  }, [navigate]);

  // Sitzungsprüfung beim App-Start. Vorher löschte JEDER Fehlschlag das Token
  // (`catch(() => localStorage.removeItem("ce_token"))`) — ein Netz-Blip oder
  // ein 500 loggte den Kunden damit KOMMENTARLOS aus. Jetzt wird das Token nur
  // noch bei einem echten Auth-Fehler verworfen (401/403 — das erledigt bereits
  // der zentrale apiFetch-Handler samt sessionExpired-Hinweis). Netzwerk-/
  // Serverfehler und unlesbare Antworten setzen stattdessen sessionCheckFailed:
  // ProtectedRoute zeigt dann einen erklärten Zustand mit manuellem „Erneut
  // versuchen" — bewusst KEIN automatischer Retry (keine Endlosschleife).
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);

  const checkSession = useCallback(async () => {
    const t = getToken();
    if (!t) { setLoadingUser(false); return; }
    setLoadingUser(true);
    setSessionCheckFailed(false);
    try {
      const r = await apiFetch(`/kundenbereich`, { auth: true });
      if (r.status === 401 || r.status === 403) { setLoadingUser(false); return; } // zentraler Handler: Token weg + Hinweis
      if (!r.ok) { setSessionCheckFailed(true); setLoadingUser(false); return; }   // 5xx: Token BEHALTEN
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!d) { setSessionCheckFailed(true); setLoadingUser(false); return; }      // unlesbare Antwort ≠ ungültige Sitzung
      setUser(userFromKundenbereich(d));
      setAuthed(true);
      setLoadingUser(false);
    } catch {
      setSessionCheckFailed(true);                                                 // Netzfehler: Token BEHALTEN
      setLoadingUser(false);
    }
  }, []);

  useEffect(() => { checkSession(); }, [checkSession]);

  const login = useCallback(async (t) => {
    try {
      const r = await fetch(`${API}/kundenbereich`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
      });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setUser(userFromKundenbereich(d));
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
    // Temporären Versandvorgang mit abräumen: er enthält Adress- und
    // Sendungsdaten. Der Speicherschlüssel wird hier SYNCHRON entfernt; den
    // Zustand im Arbeitsspeicher leert der ShippingFlowProvider über seinen
    // authed-Wächter. Bewusst eine reine Funktion ohne React — keine Kopplung
    // von client.js oder AuthContext an einen weiteren Kontext.
    clearShippingFlowStorage();
    setAuthed(false);
    setUser(null);
    setSessionExpired(false);
    setSessionCheckFailed(false);
  }, []);

  const updateUser = useCallback((partial) => {
    setUser(prev => ({ ...prev, ...partial }));
  }, []);

  // Kontrollierter Refetch von /kundenbereich (Serverwahrheit). Wird nach Start/
  // Resend/Abbruch der E-Mail-Änderung aufgerufen, um den Pending-Zustand mit dem
  // Server zu synchronisieren. Nutzt `auth: true` — ein echter Session-401 löst
  // hier korrekt den globalen Logout aus. Liefert { ok }.
  const refreshUser = useCallback(async () => {
    try {
      const r = await apiFetch(`/kundenbereich`, { auth: true });
      if (!r.ok) return { ok: false };
      const d = await r.json();
      setUser(userFromKundenbereich(d));
      setAuthed(true);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, authed, loadingUser, sessionExpired, sessionCheckFailed, retrySessionCheck: checkSession, login, logout, updateUser, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
