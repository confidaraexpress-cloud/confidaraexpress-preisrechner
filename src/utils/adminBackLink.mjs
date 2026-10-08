/* ── Rückwege im Adminbereich (UX-Paket 2) ──────────────────────────────────
   Ein Zurück-Link führt dorthin, woher der Admin kam — wenn die Herkunft beim
   Öffnen mitgegeben wurde (Router-State `from`, gesetzt über returnState) und
   sie ein Adminpfad dieser Anwendung ist. Sonst gilt der feste Rückweg der
   Seite (in der Regel ihre Liste).

   Sicherheit: `from` stammt aus dem History-State des Browsers und wird wie
   eine Eingabe behandelt. Erlaubt sind ausschließlich Pfade unter `/admin` —
   ohne Schema, ohne Host, ohne doppelte Schrägstriche, ohne Backslash, ohne
   Punktsegmente und ohne Steuerzeichen. So entsteht nie ein Link aus dem
   Adminbereich hinaus (keine offene Weiterleitung), und eine Berechtigung
   ändert sich dadurch nicht: das Ziel prüft der Routenschutz wie jeder Link. */

const MAX_LAENGE = 300;

/** Ein sicherer Rückweg-Pfad unter /admin (mit Query, ohne Hash) — oder null. */
export function safeAdminReturnPath(value) {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (v === "" || v.length > MAX_LAENGE) return null;
  if (!/^\/admin(?:[/?]|$)/.test(v)) return null;
  if (v.includes("//") || v.includes("\\") || /[\u0000-\u001f\u007f]/.test(v)) return null;
  const [mitQuery] = v.split("#");
  const pfad = mitQuery.split("?")[0];
  if (pfad.split("/").some((s) => s === "." || s === ".." || /%2e/i.test(s) || /%2f|%5c/i.test(s))) return null;
  return mitQuery;
}

// Beschriftung je Herkunft — die Reihenfolge zählt (Unterseiten vor `/:id`).
const ZIELE = Object.freeze([
  [/^\/admin$/, "Zurück zur Übersicht"],
  [/^\/admin\/users$/, "Zurück zu den Kunden"],
  [/^\/admin\/users\/[^/]+$/, "Zurück zum Kunden"],
  [/^\/admin\/partners$/, "Zurück zu den Vertriebspartnern"],
  [/^\/admin\/partners\/dispatch-evidence$/, "Zurück zu den Versandnachweisen"],
  [/^\/admin\/partners\/credit-notes$/, "Zurück zu den Gutschriften"],
  [/^\/admin\/partners\/prelive$/, "Zurück zum Pre-Live-Test"],
  [/^\/admin\/partners\/settings$/, "Zurück zu den Einstellungen"],
  [/^\/admin\/partners\/[^/]+$/, "Zurück zum Vertriebspartner"],
  [/^\/admin\/shipments$/, "Zurück zu den Sendungen"],
  [/^\/admin\/shipments\/[^/]+$/, "Zurück zur Sendung"],
  [/^\/admin\/invoices$/, "Zurück zu den Rechnungen"],
  [/^\/admin\/invoices\/backfill$/, "Zurück zu den Vorschau-PDFs"],
  [/^\/admin\/invoices\/[^/]+$/, "Zurück zur Rechnung"],
  [/^\/admin\/cancellation-requests$/, "Zurück zu den Stornierungsanfragen"],
  [/^\/admin\/cancellation-requests\/[^/]+$/, "Zurück zur Stornierungsanfrage"],
  [/^\/admin\/support-requests$/, "Zurück zu den Supportanfragen"],
  [/^\/admin\/support-requests\/[^/]+$/, "Zurück zur Supportanfrage"],
  [/^\/admin\/reconciliation$/, "Zurück zur Buchungsklärung"],
  [/^\/admin\/reconciliation\/[^/]+$/, "Zurück zum Buchungsvorgang"],
  [/^\/admin\/audit-logs$/, "Zurück zum Protokoll"],
]);

/** Beschriftung für einen Rückweg — null, wenn der Pfad keiner bekannten Adminseite entspricht. */
export function adminBackLabel(path) {
  const sicher = safeAdminReturnPath(path);
  if (!sicher) return null;
  const pfad = sicher.split("?")[0];
  const treffer = ZIELE.find(([muster]) => muster.test(pfad));
  return treffer ? treffer[1] : null;
}

/**
 * Ziel und Beschriftung des Zurück-Links: die mitgegebene Herkunft, wenn sie
 * sicher und bekannt ist — sonst der feste Rückweg der Seite.
 */
export function resolveAdminBack(state, fallback) {
  const from = state && typeof state === "object" ? safeAdminReturnPath(state.from) : null;
  const label = from ? adminBackLabel(from) : null;
  if (from && label) return { to: from, label };
  return { to: fallback.to, label: fallback.label };
}

/** Router-State für einen Link in eine Detailseite: merkt sich die aktuelle Adminseite. */
export function returnState(location) {
  if (!location || typeof location !== "object") return undefined;
  const from = safeAdminReturnPath(`${location.pathname || ""}${location.search || ""}`);
  return from ? { from } : undefined;
}
