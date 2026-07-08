// Gemeinsame, reine Anzeige-Helfer für die Admin-Rechnungsansicht. Kein JSX,
// kein State, kein Fetch — testbar unter Node (`.mjs`, wie kpis.mjs). Enthält
// bewusst KEINE Zahlungs-/Zahlungsziel-Logik: „overdue" wird ausschließlich für
// die Anzeige abgeleitet, nie berechnet oder ans Backend zurückgeschrieben.

// [badge-Klasse, Label] für Rechnungsstatus. Unbekannt → grau + Rohwert (harmlos).
const INVOICE_STATUS_META = {
  paid: ["badge-green", "Bezahlt"],
  unpaid: ["badge-yellow", "Offen"],
  overdue: ["badge-red", "Überfällig"],
  cancelled: ["badge-gray", "Storniert"],
};
export const invoiceStatusMeta = (status) => INVOICE_STATUS_META[status] || ["badge-gray", status ?? "—"];

// Auswahl für den Status-Filter (Backend-Vertrag kennt nur unpaid|paid). „Alle"
// sendet keinen Filter. „Überfällig" ist KEIN Status, sondern ein eigener Filter
// (overdue=true) und daher hier bewusst nicht enthalten.
export const INVOICE_STATUS_FILTER_OPTIONS = [
  { value: "", label: "Alle" },
  { value: "unpaid", label: "Offen" },
  { value: "paid", label: "Bezahlt" },
];

// Überfälligkeit NUR für die Anzeige ableiten: fällig in der Vergangenheit UND
// nicht bezahlt. Tages-Granularität in lokaler Zeit; fehlende/ungültige Daten →
// nicht überfällig (kein „Invalid Date", kein Raten). `now` ist injizierbar,
// damit die Logik deterministisch testbar bleibt.
export function isInvoiceOverdue(dueDate, status, now = new Date()) {
  if (status === "paid" || status === "cancelled") return false;
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return dueDay.getTime() < today.getTime();
}

// Anzeige-Meta für den Status inkl. abgeleiteter Überfälligkeit:
//   paid → Bezahlt · (nicht bezahlt & fällig < heute) → Überfällig ·
//   unpaid → Offen · sonst → Fallback (grau + Rohwert).
export function invoiceDisplayMeta(status, dueDate, now = new Date()) {
  if (status === "paid") return invoiceStatusMeta("paid");
  if (isInvoiceOverdue(dueDate, status, now)) return invoiceStatusMeta("overdue");
  if (status === "unpaid") return invoiceStatusMeta("unpaid");
  return invoiceStatusMeta(status);
}
