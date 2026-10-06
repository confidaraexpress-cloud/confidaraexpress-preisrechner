import { apiFetch, jsonH } from "./client";
import { FAIL_CLOSED_PUBLIC_CONFIG, parseSalesPartnerPublicConfig } from "../utils/salesPartnerPublicConfig.mjs";

// ── Vertriebspartnerprogramm (dünner Wrapper um das zentrale apiFetch) ────────
// Zwei Arten von Aufrufen, strikt getrennt:
//   • ÖFFENTLICH (ohne Anmeldung, ohne `auth`): Konfiguration und
//     Partnerregistrierung. Ein 401/403 löst hier niemals den zentralen Logout
//     aus — es gibt keine Sitzung, die man beenden könnte.
//   • PARTNERPORTAL (`auth: true`): nur für die Rolle `sales_partner`. Die
//     Seite wird ausschließlich hinter PartnerRoute gerendert; ein Kunde oder
//     Admin erreicht diese Aufrufe nicht.
// Kein Cache über die laufende Seite hinaus, kein Logging von Antwortdaten.
// Rohe Responses zurück (außer der Konfiguration) — der Aufrufer wertet
// Status und Body selbst aus.

const CONFIG_PATH = "/api/sales-partner/public-config";
const MONAT = /^\d{4}-(0[1-9]|1[0-2])$/;

let konfiguration = null;

/**
 * GET /api/sales-partner/public-config — liefert immer { ok, config }.
 * `config` ist normalisiert und fail-closed; bei einem Fehler ist es der
 * geschlossene Zustand und `ok` false. Ein Erfolg gilt für die laufende Seite,
 * ein Fehler wird nicht festgehalten (ein späterer Aufruf versucht es erneut).
 */
export function loadSalesPartnerPublicConfig() {
  if (konfiguration) return konfiguration;
  const laufend = (async () => {
    try {
      // Einfacher GET ohne Zusatzheader (kein CORS-Preflight), wie der Launch-Scope.
      const r = await apiFetch(CONFIG_PATH, { timeoutMs: 15000 });
      if (!r.ok) throw new Error("public_config_unavailable");
      const d = await r.json();
      return { ok: true, config: parseSalesPartnerPublicConfig(d) };
    } catch {
      if (konfiguration === laufend) konfiguration = null;
      return { ok: false, config: FAIL_CLOSED_PUBLIC_CONFIG };
    }
  })();
  konfiguration = laufend;
  return laufend;
}

/** POST /api/sales-partner/register — öffentlich. Body aus
 *  buildPartnerRegistrationPayload (utils/registrationValidation.mjs). */
export function registerSalesPartner(body) {
  return apiFetch("/api/sales-partner/register", {
    method: "POST",
    headers: jsonH,
    body: JSON.stringify(body),
  });
}

/** GET /api/sales-partner/me/overview — Kennzahlen, Links, Sätze, Monat. */
export function getPartnerOverview({ signal } = {}) {
  return apiFetch("/api/sales-partner/me/overview", { auth: true, signal });
}

/** GET /api/sales-partner/me/customers — zugeordnete Kunden ohne Adressen/Preise. */
export function getPartnerCustomers({ signal } = {}) {
  return apiFetch("/api/sales-partner/me/customers", { auth: true, signal });
}

/** GET /api/sales-partner/me/commissions?month=YYYY-MM — nur ein gültiger Monat
 *  geht hinaus; ohne Monat entscheidet der Server (aktueller Monat). */
export function getPartnerCommissions(month, { signal } = {}) {
  const q = typeof month === "string" && MONAT.test(month) ? `?month=${month}` : "";
  return apiFetch(`/api/sales-partner/me/commissions${q}`, { auth: true, signal });
}

/** GET /api/sales-partner/me/team — Ebenen 1 und 2. */
export function getPartnerTeam({ signal } = {}) {
  return apiFetch("/api/sales-partner/me/team", { auth: true, signal });
}
