import { apiFetch, jsonH } from "./client";

// ── Admin-Anmeldung (/admin/login, Canonical v2.130) ─────────────────────────────────────────────────────
// Öffentliche Aufrufe ohne Sitzung (auth: false): ein 401/403 hier ist eine Antwort auf die Eingabe, nie ein
// Sitzungsende — der zentrale Abmelde-Handler bleibt außen vor. Kein Aufruf protokolliert Eingaben.

/** POST /auth/admin-login — nur ein Adminkonto erhält ein Token. Kein „Angemeldet bleiben“ (Server: 7 Tage). */
export function adminAnmelden({ email, password }) {
  return apiFetch("/auth/admin-login", { method: "POST", headers: jsonH, body: JSON.stringify({ email, password }) });
}

/** POST /auth/forgot-password — immer neutrale Antwort. */
export function passwortVergessen(email) {
  return apiFetch("/auth/forgot-password", { method: "POST", headers: jsonH, body: JSON.stringify({ email }) });
}

/** GET /auth/validate-reset-token/:token → { valid, code? } */
export function resetLinkPruefen(token) {
  return apiFetch(`/auth/validate-reset-token/${encodeURIComponent(token)}`);
}

/** POST /auth/reset-password — der Link setzt genau einmal ein Passwort. */
export function passwortSetzen(token, password) {
  return apiFetch("/auth/reset-password", { method: "POST", headers: jsonH, body: JSON.stringify({ token, password }) });
}
