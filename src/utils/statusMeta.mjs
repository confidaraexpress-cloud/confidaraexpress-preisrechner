// ═══════════════════════════════════════════════════════════════════════════
// Zentrale Status-Metadatenbasis (Design Foundation, PR 1)
// ───────────────────────────────────────────────────────────────────────────
// Reine Daten + getStatusMeta(status, domain). Kein JSX, kein State, kein Fetch
// → testbar unter Node (`.mjs`). In DIESEM PR bewusst NICHT in gerenderte
// Komponenten (StatusBadge, Admin-Badges) eingebunden — additiv/vorbereitend.
//
// `tone` ∈ green|blue|yellow|red|gray und bildet 1:1 auf die bestehenden
// .badge-<tone>-Klassen ab (dashboard.css). `label` spiegelt die bestehenden,
// bereits sichtbaren Labels der jeweiligen Domäne — es werden KEINE sichtbaren
// Fachlabels geändert.
//
// Wichtig — Labels sind domänenspezifisch und werden bewusst NICHT global
// vereinheitlicht:
//   • `account` (kundenseitiger Nutzerstatus, wie ui/StatusBadge) vs
//     `admin` (Admin-Nutzerverwaltung, wie utils/adminUsers.js) verwenden für
//     denselben Wert unterschiedliche Labels ("Aktiv" vs "Freigegeben" …).
//   • `cancellation` folgt der KUNDEN-Semantik (utils/customerCancellation.mjs);
//     dort ist `rejected` bewusst GRAU. Die Admin-Stornierungsanzeige (rot)
//     bleibt in utils/adminCancellations.mjs und wird hier NICHT überschrieben.
// Diese Trennung ist Absicht (keine erzwungene globale Übersetzung).
// ═══════════════════════════════════════════════════════════════════════════

const REGISTRY = {
  // Kundenseitiger Nutzer-/Kontostatus (Spiegel von ui/StatusBadge)
  account: {
    active:     { label: "Aktiv",        tone: "green",  iconKey: "check" },
    approved:   { label: "Aktiv",        tone: "green",  iconKey: "check" },
    pending:    { label: "Ausstehend",   tone: "yellow", iconKey: "clock" },
    blocked:    { label: "Gesperrt",     tone: "red",    iconKey: "ban" },
    anonymized: { label: "Anonymisiert", tone: "gray",   iconKey: "ban" },   // bekannte Ergänzung
  },

  // Sendungsstatus (Spiegel von ui/StatusBadge; `booking` als bekannte Ergänzung)
  shipment: {
    draft:       { label: "Entwurf",     tone: "gray",   iconKey: "form" },
    booking:     { label: "In Buchung",  tone: "yellow", iconKey: "clock" },   // bekannte Ergänzung (wie Admin)
    booked:      { label: "Gebucht",     tone: "blue",   iconKey: "package" },
    label_ready: { label: "Label bereit",tone: "blue",   iconKey: "printer" },
    in_transit:  { label: "Unterwegs",   tone: "blue",   iconKey: "truck" },
    delivered:   { label: "Zugestellt",  tone: "green",  iconKey: "check" },
    delayed:     { label: "Verzögert",   tone: "yellow", iconKey: "clock" },
  },

  // Rechnungsstatus (Spiegel von ui/StatusBadge; overdue/cancelled als bekannte Ergänzung)
  invoice: {
    paid:      { label: "Bezahlt",   tone: "green",  iconKey: "check" },
    unpaid:    { label: "Offen",     tone: "yellow", iconKey: "clock" },
    overdue:   { label: "Überfällig",tone: "red",    iconKey: "clock" },   // bekannte Ergänzung (wie Admin)
    cancelled: { label: "Storniert", tone: "gray",   iconKey: "x" },       // bekannte Ergänzung (wie Admin)
  },

  // Kunden-Stornierungsanfrage (Spiegel von utils/customerCancellation.mjs)
  // rejected ist hier GRAU (kundenseitig) — NICHT rot wie in der Admin-Ansicht.
  cancellation: {
    pending:   { label: "Stornierung angefragt",              tone: "yellow", iconKey: "clock" },
    in_review: { label: "Stornierungsanfrage in Bearbeitung", tone: "blue",   iconKey: "clock" },
    accepted:  { label: "Stornierungsanfrage angenommen",     tone: "green",  iconKey: "check" },
    rejected:  { label: "Stornierungsanfrage abgelehnt",      tone: "gray",   iconKey: "x" },
  },

  // Entwurf (Typ-Tag)
  draft: {
    draft: { label: "Entwurf", tone: "gray", iconKey: "form" },
  },

  // Admin-Nutzerverwaltung (Spiegel von utils/adminUsers.js) — Labels bewusst
  // anders als in `account` (Freigegeben/Wartet/Blockiert statt Aktiv/…).
  admin: {
    pending:    { label: "Wartet",       tone: "yellow", iconKey: "clock" },
    approved:   { label: "Freigegeben",  tone: "green",  iconKey: "check" },
    blocked:    { label: "Blockiert",    tone: "red",    iconKey: "ban" },
    anonymized: { label: "Anonymisiert", tone: "gray",   iconKey: "ban" },
  },
};

/** Liste der unterstützten Domänen. */
export const STATUS_DOMAINS = Object.keys(REGISTRY);

/** Rohes Register (für Tests/Introspektion; nicht mutieren). */
export const STATUS_META = REGISTRY;

/**
 * Liefert Anzeige-Metadaten für einen Status innerhalb einer Domäne.
 * Unbekannter Status → sicherer, harmloser Fallback (grau + Rohwert), analog
 * zum bestehenden Verhalten von ui/StatusBadge und den *Meta-Helfern.
 *
 * @param {string} status
 * @param {"account"|"shipment"|"invoice"|"cancellation"|"draft"|"admin"} [domain="shipment"]
 * @returns {{ label: string, tone: "green"|"blue"|"yellow"|"red"|"gray", iconKey: string|null }}
 */
export function getStatusMeta(status, domain = "shipment") {
  const table = REGISTRY[domain] || REGISTRY.shipment;
  const hit = table[status];
  if (hit) return { ...hit };
  return {
    label: status === undefined || status === null || status === "" ? "—" : String(status),
    tone: "gray",
    iconKey: null,
  };
}

/** Bequemer Helfer: nur die Badge-Klasse (`badge badge-<tone>`) für einen Status. */
export function statusBadgeClass(status, domain = "shipment") {
  return `badge badge-${getStatusMeta(status, domain).tone}`;
}
