import { apiFetch, jsonH } from "./client";

// ── Anmeldung des Partnerbereichs (/partner/login, Betreiberauftrag 2026-11-22) ─────────────────────────────────────
// Öffentlicher Aufruf ohne Sitzung (auth: false). Getrennt von der Admin-Anmeldung (api/adminAnmeldungApi.js): der
// Partnerbereich kennt „Angemeldet bleiben“, der Admin-Eingang bewusst nicht.

/** POST /auth/partner-login — nur Vertriebspartner erhalten ein Token (403 PARTNER_ACCESS_REQUIRED / ADMIN_LOGIN_REQUIRED). */
export function partnerAnmelden({ email, password, rememberMe = false }) {
  return apiFetch("/auth/partner-login", { method: "POST", headers: jsonH, body: JSON.stringify({ email, password, rememberMe }) });
}
