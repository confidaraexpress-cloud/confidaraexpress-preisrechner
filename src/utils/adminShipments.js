// Gemeinsame, PII-arme Anzeige-Helfer für die Admin-Sendungsansichten (Liste +
// Detail). Reine Funktionen (kein JSX, kein State, kein Fetch) — die Badge-
// Darstellung bleibt in den Komponenten.

// Zeigt AUSSCHLIESSLICH die letzten 4 Zeichen — unabhängig davon, ob das Backend
// bereits maskiert oder (versehentlich) eine volle ID liefert. So kann nie eine
// vollständige tracking_number / jumingo_shipment_id / order_number ins DOM
// gelangen. Gibt null zurück, wenn kein Wert vorhanden ist (Aufrufer zeigt „—").
export function maskTail(value) {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  if (!s) return null;
  return `••••${s.slice(-4)}`;
}

// [badge-Klasse, Label] für Sendungsstatus. Unbekannt → grau + Rohwert (harmlos).
const STATUS_META = {
  draft: ["badge-gray", "Entwurf"],
  booking: ["badge-yellow", "In Buchung"],
  booked: ["badge-blue", "Gebucht"],
  label_ready: ["badge-blue", "Label bereit"],
};
export const shipmentStatusMeta = (status) => STATUS_META[status] || ["badge-gray", status ?? "—"];
export const SHIPMENT_STATUS_OPTIONS = Object.keys(STATUS_META);

// Serviceart: nur die belegten Werte pickup/dropoff werden übersetzt, alles
// andere → „Unbekannt" (kein Raten, keine rohe Anzeige technischer Werte).
const SERVICE_LABELS = { pickup: "Abholung", dropoff: "Paketshop" };
export function serviceLabel(v) {
  if (v === undefined || v === null || v === "") return "Unbekannt";
  return SERVICE_LABELS[String(v).toLowerCase()] || "Unbekannt";
}

// Rechnungsstatus-Anzeige (invoiceStatusMeta) ist nach utils/adminInvoices.mjs
// umgezogen — dort liegt die gesamte Rechnungs-Anzeigelogik als testbare Einheit.
