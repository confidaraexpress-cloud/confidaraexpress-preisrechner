export const API = import.meta.env.VITE_API_URL;

export const token = () => localStorage.getItem("ce_token");

export const authH = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${token()}`,
});

export const jsonH = { "Content-Type": "application/json" };

// ── Central auth-error handler ───────────────────────────────────────────────
// AuthContext registers a handler here; apiFetch invokes it on a 401/403 from
// an authenticated request (auth: true). Public requests never trigger it.
let authErrorHandler = null;
export const setAuthErrorHandler = (fn) => { authErrorHandler = fn; };

// Macht den registrierten Handler für Sonderfälle aufrufbar, die bewusst kein
// `auth: true` nutzen (z.B. Passwortänderung, wo ein 401 meist "falsches
// Passwort" statt "Session ungültig" bedeutet, aber im P3-Fall doch Session-
// Invalidierung sein kann).
export const triggerAuthError = () => { if (authErrorHandler) authErrorHandler(); };

// ── Minimal central fetch wrapper (no dependency, no global fetch patch) ─────
// apiFetch("/path", { auth, method, body, headers, ... })
//   - auth: true  → adds Authorization (Bearer) + JSON Content-Type via authH()
//   - On 401/403 for an authenticated request: removes ce_token and fires the
//     central auth-error handler (→ logout + redirect). The raw Response is
//     still returned so existing callers keep their own .ok/.json()/status logic.
//   - Public requests (auth falsy) pass through untouched; their 401/403 is
//     returned normally and never triggers a logout.
export async function apiFetch(pathOrUrl, options = {}) {
  const { auth = false, headers, ...rest } = options;
  const url = /^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${API}${pathOrUrl}`;
  const finalHeaders = auth ? { ...authH(), ...headers } : headers;
  const res = await fetch(url, { ...rest, headers: finalHeaders });
  if (auth && (res.status === 401 || res.status === 403)) {
    localStorage.removeItem("ce_token");
    if (authErrorHandler) authErrorHandler();
  }
  return res;
}
