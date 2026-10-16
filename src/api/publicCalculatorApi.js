// ── Öffentlicher Preisrechner (preisrechner.confidaraexpress.de) ──────────────
//
// Drei Aufrufe, alle über apiFetch (keine zweite API-Schicht):
//   • preparePublicCalculator   POST /api/public/price-quote/prepare?trigger=…
//       ohne Anmeldung, OHNE Body und OHNE Kopfzeilen — ein CORS-Simple-Request,
//       also kein Preflight vor dem Aufwärmen. credentials "omit", keepalive.
//       Antwort 200 { available }. Der Aufrufer wartet nie darauf.
//   • requestPublicPriceQuote   POST /api/public/price-quote
//       ohne Anmeldung, ohne Cookies; dieselbe Frist wie der Kundenrechner
//       (75 s: Serverfrist des Anbieterquotes 55 s plus höchstens 20 s Warten
//       auf ein laufendes Aufwärmen).
//   • fetchPublicLaunchScope    GET /api/public/launch-scope
//       dieselbe Länderliste wie der Kundenrechner (derselbe Serverhandler wie
//       /api/shipping/launch-scope), ohne Kopfzeilen und ohne Cookies. Wirft nie:
//       ohne Antwort zeigt das Formular die volle Liste (launchScopeView.mjs).
//   • verifyPriceQuoteHandoff   POST /api/price-quote/handoff/verify
//       nur im Hauptportal, angemeldet (Kundenkonto). Prüft das Übergabetoken
//       beim Server — kein Preis, keine Buchung. Aufgerufen nur für Kundenkonten
//       (die Rolle prüft die Übernahmeseite vorher).
//
// Der Preisrechner ist eine eigene Domain: das öffentliche Bündel importiert aus
// dieser Datei nur die beiden öffentlichen Aufrufe (Tree-Shaking), nie den
// angemeldeten.

import { apiFetch, authH, triggerAuthError } from "./client.js";
import { parseLaunchScope } from "../utils/launchScopeView.mjs";

export const PUBLIC_QUOTE_TIMEOUT_MS = 75000;
export const PUBLIC_PREPARE_TIMEOUT_MS = 10000;
export const PUBLIC_PREPARE_TRIGGERS = Object.freeze(["page", "visible", "activity"]);

export const PUBLIC_QUOTE_PATH = "/api/public/price-quote";
export const PUBLIC_PREPARE_PATH = "/api/public/price-quote/prepare";
export const PUBLIC_LAUNCH_SCOPE_PATH = "/api/public/launch-scope";
export const HANDOFF_VERIFY_PATH = "/api/price-quote/handoff/verify";

export function preparePublicCalculator(trigger = "page") {
  const t = PUBLIC_PREPARE_TRIGGERS.includes(trigger) ? trigger : "page";
  return apiFetch(`${PUBLIC_PREPARE_PATH}?trigger=${t}`, {
    method: "POST",
    credentials: "omit",
    keepalive: true,
    timeoutMs: PUBLIC_PREPARE_TIMEOUT_MS,
  });
}

export function requestPublicPriceQuote(input, { signal } = {}) {
  return apiFetch(PUBLIC_QUOTE_PATH, {
    method: "POST",
    credentials: "omit",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: PUBLIC_QUOTE_TIMEOUT_MS,
    signal,
  });
}

export async function fetchPublicLaunchScope() {
  try {
    const r = await apiFetch(PUBLIC_LAUNCH_SCOPE_PATH, { credentials: "omit" });
    if (!r.ok) return null;
    return parseLaunchScope(await r.json());
  } catch {
    return null;
  }
}

// Bewusst OHNE `auth: true`: ein fachliches 403 (HANDOFF_NOT_FOR_ROLE) ist keine Sitzungsfrage und darf
// nicht abmelden. Eine abgelaufene Sitzung (401) meldet wie jeder angemeldete Aufruf ab — über denselben
// zentralen Handler (Muster der Passwortänderung); das wartende Token bleibt dabei im Modulspeicher.
export async function verifyPriceQuoteHandoff(token) {
  const res = await apiFetch(HANDOFF_VERIFY_PATH, {
    method: "POST",
    headers: authH(),
    body: JSON.stringify({ token }),
  });
  if (res.status === 401) triggerAuthError();
  return res;
}
