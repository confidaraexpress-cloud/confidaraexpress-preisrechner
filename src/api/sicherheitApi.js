import { apiFetch } from "./client";

/* ── Sitzungen, Passkeys und Sicherheitsbestätigung (Betreiberauftrag 2026-11-22, D7) ───────────────────────────────
   Alle Aufrufe laufen mit `auth: true`. Der Server antwortet bei gültiger Sitzung mit 400/404/409/428 — nie mit
   401/403 —, damit ein Fachfehler (falsches Passwort, letzter Passkey, Bestätigung nötig) nicht als Sitzungsende gilt.
   Ein 428 STEP_UP_REQUIRED fängt apiFetch selbst ab (Bestätigungsdialog des Adminrahmens, danach genau eine
   Wiederholung). Kein Aufruf protokolliert Eingaben. */

const json = (method, body) => ({ method, auth: true, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

// ── Sitzungen: alle Kontorollen ──
/** GET /auth/sessions → { sessions: [{ id, channel, method, device, originHost, issuedAt, expiresAt, current }] } */
export const sitzungenLaden = ({ signal } = {}) => apiFetch("/auth/sessions", { auth: true, signal });
/** DELETE /auth/sessions/:id → { ok, current } | 404 SESSION_NOT_FOUND */
export const sitzungBeenden = (id) => apiFetch(`/auth/sessions/${encodeURIComponent(id)}`, json("DELETE"));
/** POST /auth/logout-all → { ok } — beendet jede Sitzung des Kontos, auch diese. */
export const ueberallAbmelden = () => apiFetch("/auth/logout-all", json("POST"));

// ── Passkeys und Wiederherstellungscodes: nur Admins ──
/** GET /auth/security → { passkeys, recoveryCodesRemaining, passkeyRequired, session: { secondFactor, method, stepUpUntil } } */
export const sicherheitLaden = ({ signal } = {}) => apiFetch("/auth/security", { auth: true, signal });
/** POST /auth/passkeys/registration/options → { options }; der erste Passkey verlangt das aktuelle Passwort. */
export const passkeyOptionen = (aktuellesPasswort) =>
  apiFetch("/auth/passkeys/registration/options", json("POST", aktuellesPasswort ? { currentPassword: aktuellesPasswort } : {}));
/** POST /auth/passkeys/registration/verify → 201 { passkey } bzw. beim ersten { passkey, recoveryCodes, token } */
export const passkeyRegistrieren = (response, name) =>
  apiFetch("/auth/passkeys/registration/verify", json("POST", name ? { response, name } : { response }));
/** PATCH /auth/passkeys/:id → { passkey } */
export const passkeyUmbenennen = (id, name) => apiFetch(`/auth/passkeys/${encodeURIComponent(id)}`, json("PATCH", { name }));
/** DELETE /auth/passkeys/:id → { ok, remaining } | 409 LAST_PASSKEY */
export const passkeyEntfernen = (id) => apiFetch(`/auth/passkeys/${encodeURIComponent(id)}`, json("DELETE"));
/** POST /auth/recovery-codes/regenerate → { recoveryCodes } (alte Codes werden ungültig) */
export const codesErneuern = () => apiFetch("/auth/recovery-codes/regenerate", json("POST"));

// ── Sicherheitsbestätigung (Step-up) ──
/** POST /auth/step-up/options → { options } */
export const bestaetigungOptionen = () => apiFetch("/auth/step-up/options", json("POST"));
/** POST /auth/step-up/verify → { stepUpUntil } | 400 PASSKEY_VERIFICATION_FAILED */
export const bestaetigungPruefen = (response) => apiFetch("/auth/step-up/verify", json("POST", { response }));
