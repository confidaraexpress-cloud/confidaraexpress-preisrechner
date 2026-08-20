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

// ── Testrechnung einer eigenen Testbuchung ─────────────────────────────────
// `is_test_booking` kommt aus der Sendung (shipments.is_test_booking) und wird vom
// Server geliefert — das Frontend leitet es NICHT ab. Strikt `=== true`: ein fehlendes
// Feld (Backend vor dem Testrechnungspaket) ist keine Testrechnung.
export function isTestInvoice(inv) {
  return !!inv && inv.is_test_booking === true;
}

// ── Zahlungsstatus — vier Kundenzustände ────────────────────────────────────
//   Testrechnung      → „Testrechnung" (neutral, KEINE Forderung)
//   paid              → „Bezahlt" (positiv)
//   unpaid + overdue  → „Überfällig" (kritisch)
//   unpaid            → „Offen" (Aufmerksamkeit)
//
// ─── Warum es den Testzustand wieder gibt ──────────────────────────────────
// Bis zum Testrechnungspaket lieferte GET /kunde/invoices ausschließlich produktive
// Forderungen — ein Produktivitätscheck im Frontend wäre eine zweite, konkurrierende
// Wahrheit gewesen. Diese Voraussetzung gilt nicht mehr: die Liste enthält jetzt
// zusätzlich die EIGENEN Testrechnungen des Kunden, damit sein Testvorgang vollständig
// ist.
//
// Sie sind ausdrücklich KEINE Forderungen (`is_productive` ist für sie false, und die
// serverseitige Zusammenfassung zählt sie nicht mit). Stünde dort trotzdem „Offen",
// sähe eine Testrechnung wie eine offene Zahlungspflicht aus — genau der Fehler, den
// dieses Paket an anderer Stelle beseitigt. Der Zustand steht deshalb ZUERST: er
// beschreibt die Art des Belegs, nicht seinen Zahlungsstand.
//
// Das bleibt keine Doppellogik: entschieden wird weiterhin serverseitig, hier wird ein
// geliefertes Feld angezeigt.
// → [tone, label]
export function paymentStatus(inv) {
  if (isTestInvoice(inv)) return [TONE.NEUTRAL, "Testrechnung"];
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

// ── E-Mail-Zustand — nur die abgeschlossene Tatsache, kein Betriebszustand ──
// Zuvor wurde der ROHE Versandzustand angezeigt: „Versand ausstehend",
// „Wird versendet", „Versand fehlgeschlagen". Neben einer gültigen, vollständig
// herunterladbaren Rechnung liest sich ein rotes „Versand fehlgeschlagen" wie
// ein Rechnungs- oder Zahlungsfehler — obwohl mit der Forderung alles in
// Ordnung ist und der Kunde ohnehin nichts tun kann. Ob der Mailprovider die
// Nachricht angenommen hat, ist ein interner Zustellvorgang.
//
// Der Server liefert dafür jetzt `sent_by_email` (Boolean, routes/kunde.js);
// Providerfehler, Zustellcodes und Versuchszähler bleiben im Adminbereich.
// Angezeigt wird nur der positive, abgeschlossene Fall — sonst gar nichts.
// Rückwärtskompatibel: fehlt das Feld (älteres Backend), wird ersatzweise
// email_status === "sent" ausgewertet; jeder andere Wert ergibt „kein Hinweis".
export function emailDeliveryMeta(inv) {
  if (!inv) return null;
  // Liefert der Server das Feld, ist es maßgeblich — auch wenn es false ist.
  const sent = typeof inv.sent_by_email === "boolean"
    ? inv.sent_by_email
    : inv.email_status === "sent";           // Fallback für ein älteres Backend
  return sent ? [TONE.POSITIVE, "Per E-Mail versendet"] : null;
}

// ── Zeitraum-Zelle ───────────────────────────────────────────────────────────
// Rechnungsdatum immer; Leistungsdatum NUR wenn vorhanden UND vom Rechnungs-
// datum abweichend (Kalendertag); Fälligkeit nur solange die Forderung offen
// ist — bei bezahlten Rechnungen ist sie fachlich erledigt.
//
// Kalendertag-Vergleich: service_date ist ein FACHLICHES Kalenderdatum und
// kommt seit dem DE-Härtungspaket als "YYYY-MM-DD" (routes/kunde.js nutzt
// to_char). issued_at ist dagegen ein echter Zeitpunkt. Beide werden auf einen
// kanonischen Kalendertag gebracht, bevor sie verglichen werden — der frühere
// Vergleich über toISOString() rechnete BEIDE nach UTC und ließ dadurch den
// 31.07. (als 2026-07-30T22:00:00Z geliefert) mit dem 30.07. zusammenfallen:
// das Leistungsdatum verschwand im Portal vollständig.
// Geschäftszeitzone des Ausstellers — identisch zu lib/calendarDate.js im Backend.
// Der Kalendertag eines Zeitpunkts wird NICHT in der Zeitzone des Betrachters bestimmt,
// sondern dort, wo die Rechnung ausgestellt wurde. Sonst sähe derselbe Beleg für einen
// Kunden auf Reisen ein anderes Rechnungsdatum als auf seinem PDF.
export const BUSINESS_TIME_ZONE = "Europe/Berlin";

export function calendarDay(value) {
  if (value == null || value === "") return null;
  // Reines Kalenderdatum → unverändert übernehmen. KEIN new Date(): "2026-07-31"
  // würde als UTC-Mitternacht geparst und in westlichen Zeitzonen zum Vortag.
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  // Echter Zeitpunkt → Kalendertag in der Geschäftszeitzone (wie im PDF).
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(d);
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    const y = get("year"), mo = get("month"), da = get("day");
    if (y && mo && da) return `${y}-${mo}-${da}`;
  } catch { /* ohne volles ICU: lokaler Kalendertag als Rückfallebene */ }
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function sameCalendarDay(a, b) {
  const ca = calendarDay(a), cb = calendarDay(b);
  return ca !== null && cb !== null && ca === cb;
}
export function invoicePeriod(inv) {
  const issuedAt = (inv && (inv.issued_at || inv.created_at)) || null;
  const serviceRaw = inv && inv.service_date ? inv.service_date : null;
  const serviceAt = serviceRaw && !sameCalendarDay(serviceRaw, issuedAt) ? serviceRaw : null;
  const showDue = !!inv && inv.status !== "paid";
  const dueAt = showDue ? (inv.due_date || null) : null;
  return {
    issuedAt,
    serviceAt,
    dueAt,
    overdue: showDue && isOverdueInvoice(inv),
    // Kanonische Kalendertage für die Anzeige: alle drei Daten erscheinen im Portal exakt so
    // wie auf dem PDF — unabhängig davon, in welcher Zeitzone der Kunde gerade sitzt.
    issuedDay: calendarDay(issuedAt),
    serviceDay: calendarDay(serviceAt),
    dueDay: calendarDay(dueAt),
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
  if (filterValue === "open") {
    // Eine Testrechnung trägt technisch status='unpaid', ist aber KEINE offene Forderung
    // (is_productive ist für sie false, die Zusammenfassung zählt sie nicht mit). Ohne
    // diesen Ausschluss stünde sie unter „Offen" und läse sich wie eine Zahlungspflicht.
    // „Überfällig" und „Bezahlt" schließen sie bereits von selbst aus: is_overdue kommt aus
    // derselben Forderungsdefinition, und bezahlt ist sie nie.
    if (isTestInvoice(inv)) return false;
    return inv.status !== "paid"; // schließt überfällige mit ein (Teilmenge von „offen")
  }
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
