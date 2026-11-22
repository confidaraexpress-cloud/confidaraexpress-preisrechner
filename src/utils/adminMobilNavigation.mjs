// Mobile Navigation des Adminbereichs (Betreiberauftrag 2026-11-22, D4): unter 900 px trägt eine feste Leiste unten die
// vier Hauptbereiche und „Mehr“ (öffnet die vollständige Navigation als Drawer); die Suche steht oben in der Leiste.
// Reine Hilfen ohne React — welcher Eintrag aktiv ist und welcher Titel oben steht, folgt allein aus dem Pfad.

export const ADMIN_SUCHE_PFAD = "/admin/suche";
export const ADMIN_SICHERHEIT_PFAD = "/admin/sicherheit";

export const ADMIN_TABS = Object.freeze([
  Object.freeze({ id: "uebersicht", to: "/admin", label: "Übersicht", icon: "dashboard" }),
  Object.freeze({ id: "sendungen", to: "/admin/shipments", label: "Sendungen", icon: "truck" }),
  Object.freeze({ id: "kunden", to: "/admin/users", label: "Kunden", icon: "user" }),
  Object.freeze({ id: "rechnungen", to: "/admin/invoices", label: "Rechnungen", icon: "invoice" }),
]);

const unter = (pfad, basis) => pfad === basis || pfad.startsWith(`${basis}/`);

/** Aktiver Eintrag der Leiste: einer der vier Bereiche, „mehr“ für alle übrigen Adminseiten, null für die Suche. */
export function aktiverAdminTab(pathname) {
  const pfad = String(pathname || "").replace(/\/+$/, "") || "/";
  if (pfad === "/admin") return "uebersicht";
  if (unter(pfad, "/admin/shipments")) return "sendungen";
  if (unter(pfad, "/admin/users")) return "kunden";
  // Vorschau-PDFs (/admin/invoices/backfill) stehen in der Navigation unter „Vertrieb und Verwaltung“ — also „Mehr“.
  if (unter(pfad, "/admin/invoices") && !unter(pfad, "/admin/invoices/backfill")) return "rechnungen";
  if (unter(pfad, ADMIN_SUCHE_PFAD)) return null;
  return unter(pfad, "/admin") ? "mehr" : null;
}

const TITEL = Object.freeze([
  ["/admin/suche", "Suche"],
  ["/admin/sicherheit", "Sicherheit"],
  ["/admin/invoices/backfill", "Vorschau-PDFs"],
  ["/admin/shipments", "Sendungen"],
  ["/admin/users", "Kunden"],
  ["/admin/invoices", "Rechnungen"],
  ["/admin/support-requests", "Supportanfragen"],
  ["/admin/cancellation-requests", "Stornierungsanfragen"],
  ["/admin/reconciliation", "Buchungsklärung"],
  ["/admin/billing-mode-requests", "Sammelrechnungsanträge"],
  ["/admin/partners", "Vertriebspartner"],
  ["/admin/public-calculator", "Preisrechner"],
  ["/admin/audit-logs", "Protokoll"],
]);

/** Titel der oberen Leiste am Telefon: der Bereich der aktuellen Seite, sonst „Adminbereich“. */
export function adminLeistenTitel(pathname) {
  const pfad = String(pathname || "").replace(/\/+$/, "") || "/";
  if (pfad === "/admin") return "Übersicht";
  const treffer = TITEL.find(([basis]) => unter(pfad, basis));
  return treffer ? treffer[1] : "Adminbereich";
}
