// ─────────────────────────────────────────────────────────────────────────────
// Kunden-Rechnungs-View-Model (Phase 5) — reine, framework-freie Fachlogik (.mjs,
// wie invoiceView/adminInvoiceView). Bündelt Forderungsstatus, Dokumentmodus,
// Dokumentstatus, E-Mail-Status, Zusammenfassung, Filter und Leerzustände an
// EINEM Ort statt verstreuter Bedingungen in InvoicesList.jsx. Kein React, kein
// Netzwerk, kein State.
//
// Serverfelder haben IMMER Vorrang. Fehlen die neuen Felder (is_productive/
// is_payable/is_overdue/document_mode_label — z. B. bei einem älteren
// Backend-/Frontend-Versionsstand), reagiert dieses Modul FAIL-CLOSED:
// unbekannt/mehrdeutig wird NIEMALS als echte, zahlungswirksame Forderung
// dargestellt. Es wird NIEMALS allein aus status === "unpaid" auf eine
// produktive Forderung geschlossen — das war genau der ursprüngliche Fehler.
//
// PDF-Vorschau/-Download/E-Mail-Rohstatus bleiben ausschließlich in
// invoiceView.mjs (unverändert, dort bereits zentral und getestet) — dieses
// Modul komponiert damit, dupliziert es nicht.
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

// ── Forderungsklassifizierung — AUSSCHLIESSLICH aus den Serverfeldern ───────
// Strikter Vergleich auf `true`: undefined/null/jeder andere Wert gilt als
// NICHT produktiv/überfällig/zahlbar. Das ist die fail-closed-Eigenschaft, die
// ein fehlendes Feld automatisch sicher behandelt, ohne dass die Aufrufer das
// gesondert prüfen müssen.
export function isProductiveInvoice(inv) {
  return !!inv && inv.is_productive === true;
}
export function isPayableInvoice(inv) {
  return !!inv && inv.is_payable === true;
}
export function isOverdueInvoice(inv) {
  return !!inv && inv.is_overdue === true;
}

// ── Zahlungsstatus — verbindliche Priorität ─────────────────────────────────
//   nicht produktiv              → „Nicht zahlungswirksam" (neutral)
//   produktiv + paid              → „Bezahlt" (positiv)
//   produktiv + unpaid + overdue  → „Überfällig" (kritisch)
//   produktiv + unpaid            → „Offen" (Aufmerksamkeit)
// Diese Reihenfolge ist absichtlich verzweigt (nicht deklarativ als Tabelle):
// „nicht produktiv" muss ALLES andere schlagen, auch wenn status zufällig
// "paid" wäre (Test-/Preview-Rechnungen werden ohnehin nie als bezahlt
// markiert — siehe Backend-Guard — aber diese Funktion verlässt sich darauf
// nicht und bleibt auch ohne diese Garantie korrekt).
// → [tone, label]
export function paymentStatus(inv) {
  if (!isProductiveInvoice(inv)) return [TONE.NEUTRAL, "Nicht zahlungswirksam"];
  if (inv.status === "paid") return [TONE.POSITIVE, "Bezahlt"];
  if (isOverdueInvoice(inv)) return [TONE.CRITICAL, "Überfällig"];
  return [TONE.ATTENTION, "Offen"];
}

// ── Dokumentmodus — EIN Label statt dreier Rohfelder ────────────────────────
// document_mode_label kommt bereits verdichtet vom Server (production|test|
// preview|unknown). Production zeigt bewusst KEIN Badge (Normalfall, keine
// visuelle Zusatzlast). test und preview sind jetzt UNTERSCHEIDBAR (vorher
// identisches „Interne Vorschau"-Badge für beide).
const DOCUMENT_MODE_META = {
  test: [TONE.NEUTRAL, "Testdokument"],
  preview: [TONE.NEUTRAL, "Interne Vorschau"],
  unknown: [TONE.NEUTRAL, "Nicht zahlungswirksam"],
};
// → [tone, label] | null (production → kein Badge)
export function documentModeMeta(inv) {
  const mode = inv && typeof inv.document_mode_label === "string" ? inv.document_mode_label : "unknown";
  if (mode === "production") return null;
  return DOCUMENT_MODE_META[mode] || DOCUMENT_MODE_META.unknown;
}

// Kompakter Zusatzhinweis (Tooltip/„title"-Attribut oder Detailtext) statt
// eines langen Fließtexts in der Tabellenzeile. null bei production.
export function documentModeHint(inv) {
  const mode = inv && typeof inv.document_mode_label === "string" ? inv.document_mode_label : "unknown";
  if (mode === "production") return null;
  return "Dient ausschließlich der internen Prüfung — nicht für den Zahlungsverkehr freigegeben.";
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

// ── E-Mail-Status — Testdokumente werden NIE an Kunden versendet ───────────
const EMAIL_STATUS_META = {
  pending: [TONE.ATTENTION, "Versand ausstehend"],
  sending: [TONE.NEUTRAL, "Wird versendet"],
  sent: [TONE.POSITIVE, "Versendet"],
  failed: [TONE.CRITICAL, "Versand fehlgeschlagen"],
};
export function emailStatusMeta(inv) {
  if (!isProductiveInvoice(inv)) return [TONE.NEUTRAL, "Kein Kundenversand"];
  const s = inv && inv.email_status;
  return EMAIL_STATUS_META[s] || [TONE.NEUTRAL, s || "—"];
}

// ── Zeitraum-Zelle ───────────────────────────────────────────────────────────
// Rechnungsdatum immer; Leistungsdatum NUR wenn vorhanden UND vom Rechnungs-
// datum abweichend (Kalendertag); Fälligkeit NUR bei produktiver, nicht
// bezahlter Forderung (offen ODER überfällig) — sonst fachlich bedeutungslos.
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
  const productive = isProductiveInvoice(inv);
  const showDue = productive && !!inv && inv.status !== "paid";
  return {
    issuedAt,
    serviceAt,
    dueAt: showDue ? (inv.due_date || null) : null,
    overdue: showDue && isOverdueInvoice(inv),
    nonPayableNote: !productive,
  };
}

// ── Betrag-Zelle — Beschriftung je Produktivität ────────────────────────────
// Nicht-produktive Rechnungen zeigen weiterhin einen Betrag (Transparenz), aber
// unter „Dokumentbetrag" statt „Betrag" — suggeriert keine Zahlungsaufforderung.
export function amountLabel(inv) {
  return isProductiveInvoice(inv) ? "Betrag" : "Dokumentbetrag";
}

// ── Nicht verfügbare Aktion — verständliche, EHRLICHE Begründung ───────────
// Rät NIE die Downloadpolicy nach: kennt das Backend keinen spezifischeren
// Grund (z. B. produktiv+bereit, aber dennoch gesperrt — globale Testbetriebs-
// sperre), bleibt der Text bewusst allgemein statt eine falsche Ursache zu
// behaupten.
export function unavailableActionReason(inv) {
  if (!inv || inv.download_available === true) return "";
  if (!isProductiveInvoice(inv)) return "Nicht für den Kundenversand vorgesehen";
  if (inv.document_status === "pending_document" || inv.document_status === "generating") return "Rechnung wird erstellt";
  if (inv.document_status === "document_failed") return "Rechnung konnte noch nicht erstellt werden";
  return "Derzeit nicht verfügbar";
}

// ── Filter (rein lokal — der Kundenendpoint liefert unpaginiert die volle
// Liste, ein Serverfilter ist nicht nötig). Filter bauen ausschließlich auf
// den bereits abgeleiteten Feldern auf, nie auf status allein. ─────────────
export const INVOICE_FILTERS = Object.freeze([
  { value: "", label: "Alle" },
  { value: "open", label: "Offen" },
  { value: "overdue", label: "Überfällig" },
  { value: "paid", label: "Bezahlt" },
  { value: "preview", label: "Test & Vorschau" },
]);

export function matchesInvoiceFilter(inv, filterValue) {
  if (!filterValue) return true;
  if (filterValue === "preview") return !isProductiveInvoice(inv);
  if (!isProductiveInvoice(inv)) return false; // die übrigen Filter sind Zahlungszustände produktiver Forderungen
  if (filterValue === "paid") return inv.status === "paid";
  if (filterValue === "overdue") return isOverdueInvoice(inv);
  if (filterValue === "open") return inv.status !== "paid"; // schließt überfällige mit ein (Teilmenge von „offen")
  return true;
}

export const FILTER_EMPTY_TEXT = "Für diesen Filter wurden keine Rechnungen gefunden.";
export const LIST_EMPTY_TITLE = "Noch keine Rechnungen vorhanden.";
export const LIST_EMPTY_TEXT = "Sobald eine Rechnung erstellt wurde, erscheint sie hier.";
export const LOADING_TEXT = "Rechnungen werden geladen …";
export const LOAD_ERROR_TEXT = "Die Rechnungen konnten nicht geladen werden.";

// ── Zusammenfassung oberhalb der Liste ──────────────────────────────────────
// Nutzt AUSSCHLIESSLICH die serverseitige summary als Quelle für Betrag/Anzahl/
// Fälligkeit (keine lokale Neuberechnung als primäre Wahrheit — eine paginierte
// oder künftig eingeschränkte Liste dürfte sonst falsch als vollständig gelten;
// hier ist die Liste zwar aktuell unpaginiert, aber die Summary bleibt trotzdem
// die kanonische Quelle). previewCount (Anzahl interner Test-/Vorschau-
// dokumente) wird lokal aus der bereits vollständig geladenen Liste gezählt —
// das ist unkritisch, weil GET /kunde/invoices nie paginiert.
//
// Zustände:
//   "empty"      — keine Rechnungen überhaupt
//   "open"       — mindestens eine offene produktive Forderung (serverseitig)
//   "noOpen"     — keine offene produktive Forderung; ggf. mit previewCount > 0
export function customerInvoiceSummary(invoices, serverSummary) {
  const list = Array.isArray(invoices) ? invoices : [];
  if (list.length === 0) return { state: "empty" };

  const previewCount = list.filter((i) => !isProductiveInvoice(i)).length;
  const s = serverSummary && typeof serverSummary === "object" ? serverSummary : null;
  const openCount = s && Number.isFinite(Number(s.open_count)) ? Number(s.open_count) : 0;

  if (!s || openCount <= 0) {
    return { state: "noOpen", previewCount };
  }
  return {
    state: "open",
    openAmount: Number(s.open_amount) || 0,
    openCount,
    overdueCount: Number(s.overdue_count) || 0,
    nextDueDate: s.next_due_date || null,
    currency: typeof s.currency === "string" && s.currency ? s.currency : "EUR",
    mixedCurrency: s.mixed_currency === true,
    previewCount,
  };
}
