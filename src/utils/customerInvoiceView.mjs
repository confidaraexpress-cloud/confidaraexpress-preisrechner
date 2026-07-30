// ─────────────────────────────────────────────────────────────────────────────
// Kunden-Rechnungs-View-Model — reine, framework-freie Fachlogik (.mjs, wie
// invoiceView/adminInvoiceView). Bündelt Zahlungsstatus, Dokumentstatus,
// E-Mail-Status, Zusammenfassung, Filter und Leerzustände an EINEM Ort statt
// verstreuter Bedingungen in InvoicesList.jsx. Kein React, kein Netzwerk, kein
// State.
//
// ── Go-live: ausschließlich produktiver Kundenbetrieb ───────────────────────
// GET /kunde/invoices liefert seit dem Go-live NUR produktive Rechnungen — die
// Trennung passiert serverseitig in der WHERE-Klausel (routes/kunde.js, zentrale
// Klassifizierung aus lib/invoiceReceivable.js). Dieses Modul kennt deshalb
// KEINE Test-, Vorschau-, Legacy- oder Modus-Zustände mehr:
//
//   • kein „Nicht zahlungswirksam", kein „Interne Vorschau", kein „Testdokument"
//   • kein „Dokumentbetrag", kein „Kein Kundenversand"
//   • kein Modus-Badge, kein „Test & Vorschau"-Filter
//
// Das ist bewusst KEINE Ausblendung: Solche Datensätze erreichen das Frontend
// gar nicht mehr. Eine erneute Produktivitätsprüfung hier wäre eine zweite,
// konkurrierende Wahrheit — genau die Doppellogik, die die Architektur
// vermeidet. Die Serverfelder bleiben die einzige Quelle.
//
// PDF-Vorschau/-Download bleiben ausschließlich in invoiceView.mjs (unverändert,
// dort bereits zentral und getestet) — dieses Modul komponiert damit, dupliziert
// es nicht. Die Downloadberechtigung kommt weiterhin allein aus dem
// serverseitigen download_available.
// ─────────────────────────────────────────────────────────────────────────────

// ── Premium-Statussystem — vier Familien, ausschließlich für Rechnungen ─────
// (inv-status--neutral/positive/attention/critical in dashboard.css). KEINE
// globale .badge-*-Migration — bewusst auf dieses Modul begrenzt.
export const TONE = Object.freeze({
  NEUTRAL: "neutral",
  POSITIVE: "positive",
  ATTENTION: "attention",
  CRITICAL: "critical",
});

// ── Überfälligkeit — AUSSCHLIESSLICH aus dem Serverfeld ─────────────────────
// Strikter Vergleich auf `true`: undefined/null/jeder andere Wert gilt als NICHT
// überfällig. Das Fälligkeitsdatum wird hier NIE selbst mit dem Tagesdatum
// verglichen — is_overdue kommt kanonisch aus derselben zentralen SQL-Definition
// wie im Adminbereich, damit Anzeige und Kennzahlen an Tagesrändern nicht
// auseinanderlaufen.
export function isOverdueInvoice(inv) {
  return !!inv && inv.is_overdue === true;
}

// ── Zahlungsstatus — drei echte Kundenzustände ──────────────────────────────
//   paid              → „Bezahlt" (positiv)
//   unpaid + overdue  → „Überfällig" (kritisch)
//   unpaid            → „Offen" (Aufmerksamkeit)
//
// Es gibt bewusst KEINEN „nicht zahlungswirksam"-Zustand mehr: der Endpunkt
// GET /kunde/invoices liefert seit dem Go-live ausschließlich produktive
// Forderungen (Filter in der WHERE-Klausel, routes/kunde.js). Ein
// Produktivitätscheck an dieser Stelle wäre eine zweite, konkurrierende
// Wahrheit im Frontend — genau die Doppellogik, die die Architektur vermeidet.
// → [tone, label]
export function paymentStatus(inv) {
  if (inv && inv.status === "paid") return [TONE.POSITIVE, "Bezahlt"];
  if (isOverdueInvoice(inv)) return [TONE.CRITICAL, "Überfällig"];
  return [TONE.ATTENTION, "Offen"];
}

// ── Dokumentstatus (PDF-Erzeugung) — kompakt, ohne Fließtext ────────────────
const DOCUMENT_STATUS_META = {
  ready: [TONE.POSITIVE, "PDF bereit"],
  pending_document: [TONE.NEUTRAL, "PDF wird erstellt"],
  generating: [TONE.NEUTRAL, "PDF wird erstellt"],
  document_failed: [TONE.CRITICAL, "PDF-Erstellung fehlgeschlagen"],
};
export function documentStatusMeta(inv) {
  const s = inv && inv.document_status;
  return DOCUMENT_STATUS_META[s] || [TONE.NEUTRAL, s || "—"];
}

// ── E-Mail-Status — nur echte Kundenversandzustände ─────────────────────────
const EMAIL_STATUS_META = {
  pending: [TONE.ATTENTION, "Versand ausstehend"],
  sending: [TONE.NEUTRAL, "Wird versendet"],
  sent: [TONE.POSITIVE, "Versendet"],
  failed: [TONE.CRITICAL, "Versand fehlgeschlagen"],
};
export function emailStatusMeta(inv) {
  const s = inv && inv.email_status;
  return EMAIL_STATUS_META[s] || [TONE.NEUTRAL, s || "—"];
}

// ── Zeitraum-Zelle ───────────────────────────────────────────────────────────
// Rechnungsdatum immer; Leistungsdatum NUR wenn vorhanden UND vom Rechnungs-
// datum abweichend (Kalendertag); Fälligkeit nur solange die Forderung offen
// ist — bei bezahlten Rechnungen ist sie fachlich erledigt.
function sameCalendarDay(a, b) {
  if (!a || !b) return false;
  const da = new Date(a), db = new Date(b);
  if (Number.isNaN(da.getTime()) || Number.isNaN(db.getTime())) return false;
  return da.toISOString().slice(0, 10) === db.toISOString().slice(0, 10);
}
export function invoicePeriod(inv) {
  const issuedAt = (inv && (inv.issued_at || inv.created_at)) || null;
  const serviceRaw = inv && inv.service_date ? inv.service_date : null;
  const serviceAt = serviceRaw && !sameCalendarDay(serviceRaw, issuedAt) ? serviceRaw : null;
  const showDue = !!inv && inv.status !== "paid";
  return {
    issuedAt,
    serviceAt,
    dueAt: showDue ? (inv.due_date || null) : null,
    overdue: showDue && isOverdueInvoice(inv),
  };
}

// ── Nicht verfügbare Aktion — verständliche, EHRLICHE Begründung ───────────
// Rät NIE die Downloadpolicy nach: kennt das Backend keinen spezifischeren
// Grund, bleibt der Text bewusst allgemein statt eine falsche Ursache zu
// behaupten. Enthält keine internen Begriffe (Test, Vorschau, Modus).
export function unavailableActionReason(inv) {
  if (!inv || inv.download_available === true) return "";
  if (inv.document_status === "pending_document" || inv.document_status === "generating") return "Rechnung wird erstellt";
  if (inv.document_status === "document_failed") return "Rechnung konnte noch nicht erstellt werden";
  return "Derzeit nicht verfügbar";
}

// ── Filter (rein lokal — der Kundenendpoint liefert unpaginiert die volle
// Liste, ein Serverfilter ist nicht nötig). Ausschließlich echte
// Zahlungszustände; ein „Test & Vorschau"-Filter existiert nicht mehr, weil
// solche Dokumente den Kundenbereich gar nicht mehr erreichen. ─────────────
export const INVOICE_FILTERS = Object.freeze([
  { value: "", label: "Alle" },
  { value: "open", label: "Offen" },
  { value: "overdue", label: "Überfällig" },
  { value: "paid", label: "Bezahlt" },
]);

export function matchesInvoiceFilter(inv, filterValue) {
  if (!filterValue) return true;
  if (!inv) return false;
  if (filterValue === "paid") return inv.status === "paid";
  if (filterValue === "overdue") return isOverdueInvoice(inv);
  if (filterValue === "open") return inv.status !== "paid"; // schließt überfällige mit ein (Teilmenge von „offen")
  return true;
}

export const FILTER_EMPTY_TEXT = "Für diesen Filter wurden keine Rechnungen gefunden.";
export const LIST_EMPTY_TITLE = "Noch keine Rechnungen vorhanden";
export const LIST_EMPTY_TEXT = "Sobald eine Rechnung für eine gebuchte Sendung erstellt wurde, erscheint sie hier automatisch.";
export const LOADING_TEXT = "Rechnungen werden geladen …";
export const LOAD_ERROR_TEXT = "Die Rechnungen konnten nicht geladen werden.";

// ── Zusammenfassung oberhalb der Liste ──────────────────────────────────────
// Nutzt AUSSCHLIESSLICH die serverseitige summary als Quelle für Betrag/Anzahl/
// Fälligkeit (keine lokale Neuberechnung als primäre Wahrheit — eine paginierte
// oder künftig eingeschränkte Liste dürfte sonst falsch als vollständig gelten;
// hier ist die Liste zwar aktuell unpaginiert, aber die Summary bleibt trotzdem
// die kanonische Quelle).
//
// Zustände:
//   "empty"  — keine Rechnungen vorhanden
//   "open"   — mindestens eine offene Forderung (serverseitig)
//   "noOpen" — Rechnungen vorhanden, aber keine offene Forderung (alle bezahlt)
export function customerInvoiceSummary(invoices, serverSummary) {
  const list = Array.isArray(invoices) ? invoices : [];
  if (list.length === 0) return { state: "empty" };

  const s = serverSummary && typeof serverSummary === "object" ? serverSummary : null;
  const openCount = s && Number.isFinite(Number(s.open_count)) ? Number(s.open_count) : 0;

  if (!s || openCount <= 0) return { state: "noOpen" };
  return {
    state: "open",
    openAmount: Number(s.open_amount) || 0,
    openCount,
    overdueCount: Number(s.overdue_count) || 0,
    nextDueDate: s.next_due_date || null,
    currency: typeof s.currency === "string" && s.currency ? s.currency : "EUR",
    mixedCurrency: s.mixed_currency === true,
  };
}
