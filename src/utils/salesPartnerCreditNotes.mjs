// ── Gutschriften der Vertriebspartner (Selbstabrechnung) ────────────────────
//
// Abgerechnet wird monatlich per Gutschrift: ConfidaraExpress stellt dem
// Partner über seine abrechnungsreifen Provisionen eine Gutschrift aus und
// überweist den Betrag. Ein Storno ist ein eigener Beleg; die Positionen einer
// stornierten Gutschrift können danach erneut abgerechnet werden.
//
//   GET /api/sales-partner/me/credit-notes   → { creditNotes: [ … ], openSettlement }
//   GET /api/sales-partner/me/credit-notes/:id/pdf → application/pdf (attachment)
//   GET /admin/sales-partners/:id/credit-notes → dieselbe Form plus documentStatus,
//                                                notifiedAt, paidReference,
//                                                issuedByName, cancellationReason
//
// Verbindlich:
//   • Beträge kommen in Cent als ganze Zahl, nur in EUR; nichts wird addiert
//     oder nachgerechnet. Ein fehlender Betrag ist „—", nie 0.
//   • Status, Art und Auszahlung nie als Rohwert (deutsche Labels,
//     Unbekanntes über statusFallback).
//   • Die Adminfelder (wer ausgestellt hat, Benachrichtigung, Zahlungsreferenz,
//     Stornogrund, Dokumentstatus) übernimmt die Partneransicht nicht.
//   • Eine Testgutschrift des Pre-Live-Testmodus (`isTest: true`, nur exakt
//     true) heißt sichtbar „TESTDOKUMENT – nicht steuerlich gültig“ und ihre
//     Auszahlung „Test – ausgezahlt“ / „Test – nicht ausgezahlt“.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import { formatCents, formatIsoDate, formatMonth, formatPercent, statusMetaFrom } from "./salesPartnerView.mjs";
import { statusFallback } from "./statusFallback.mjs";

const objOrNull = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const arr = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const int = (v) => (Number.isInteger(v) ? v : null);
const PROZENT = /^\d{1,3}(\.\d{1,4})?$/;
const pct = (v) => (typeof v === "string" && PROZENT.test(v.trim()) ? v.trim() : null);
/** Kennung einer Gutschrift: positive ganze Zahl oder Ziffernfolge — sonst null. */
export const creditNoteIdOf = (v) => (Number.isInteger(v) && v > 0 ? v
  : (typeof v === "string" && /^[1-9][0-9]{0,15}$/.test(v.trim()) ? v.trim() : null));

// UX-Paket 6: dieselben Geldbegriffe wie die Übersicht (MONEY_TERMS) — „auszahlbar"
// und „abgerechnet" statt des Sonderworts „abrechnungsreif"; die Bedingung der
// Gutschrift (bestätigte Abrechnungsdaten) steht dabei, statt sie zu verschweigen.
export const CREDIT_NOTE_TEXTS = Object.freeze({
  empty: "Noch keine Gutschriften.",
  settlementNote: "Auszahlbare Provisionen werden einmal im Monat mit einer Gutschrift abgerechnet. Voraussetzung sind bestätigte Abrechnungsdaten.",
  billingLink: "Abrechnungsdaten ansehen",
  carriedForward: "Ihre noch nicht abgerechneten Provisionen ergeben derzeit keinen positiven Betrag. Er wird mit der nächsten Gutschrift verrechnet.",
  documentPending: "Wird erstellt",
  payoutOpen: "Noch nicht ausgezahlt",
  loadError: "Ihre Gutschriften konnten nicht geladen werden.",
  download: "PDF herunterladen",
  downloading: "Wird geladen…",
  testDocument: "TESTDOKUMENT – nicht steuerlich gültig",
  testPaid: "Test – ausgezahlt",
  testOpen: "Test – nicht ausgezahlt",
});

/** Hinweis zum offenen Saldo (auszahlbar, noch nicht abgerechnet) — oder null. */
export function openSettlementHint(openSettlement) {
  const os = objOrNull(openSettlement);
  if (!os) return null;
  if (os.carriedForward === true) return CREDIT_NOTE_TEXTS.carriedForward;
  if (Number.isInteger(os.readyEntryCount) && os.readyEntryCount > 0 && Number.isInteger(os.readyNetCents)) {
    return `Noch nicht abgerechnet: auszahlbare Provisionen von ${formatCents(os.readyNetCents)}. Sie werden mit der nächsten Gutschrift abgerechnet.`;
  }
  return null;
}

// ── Art, Auszahlung, Korrekturen ────────────────────────────────────────────
const KIND_META = Object.freeze({
  regular: Object.freeze(["badge-blue", "Gutschrift"]),
  cancellation: Object.freeze(["badge-red", "Storno"]),
});
export const creditNoteKindMeta = (kind) => statusMetaFrom(KIND_META, kind);

/** Status einer Gutschrift (UX-Paket 6) — ausschließlich aus Art und Stornomerkmal
 *  des Servers: ein Stornobeleg ist „Storno", eine stornierte Gutschrift
 *  „Storniert", jede andere Gutschrift „Ausgestellt". Eine unbekannte Art bleibt
 *  „Unbekannter Status" (statusFallback). Über die Auszahlung sagt der Status nichts. */
export function creditNoteStatusMeta(cn) {
  if (!cn) return statusFallback(null);
  if (cn.kind === "cancellation") return KIND_META.cancellation;
  if (cn.kind !== "regular") return creditNoteKindMeta(cn.kind);
  return cn.cancelled === true ? ["badge-gray", "Storniert"] : ["badge-blue", "Ausgestellt"];
}

/** Sichtbarer Titel: der Belegtitel des Servers, sonst die Art. */
export function creditNoteTitle(cn) {
  return (cn && cn.title) || creditNoteKindMeta(cn?.kind)[1];
}

/** „Noch nicht ausgezahlt" / „Ausgezahlt am 15.10.2026"; ein Storno und eine
 *  stornierte, nie ausgezahlte Gutschrift haben keine Auszahlung („—").
 *  Testgutschrift: „Test – ausgezahlt" / „Test – nicht ausgezahlt" — es
 *  fließt kein Geld, vermerkt wird nur der Teststand. */
export function payoutText(cn) {
  if (!cn || cn.kind === "cancellation") return "—";
  if (cn.isTest === true) {
    if (cn.payoutStatus === "paid") return CREDIT_NOTE_TEXTS.testPaid;
    if (cn.payoutStatus === "open") return cn.cancelled ? "—" : CREDIT_NOTE_TEXTS.testOpen;
  }
  if (cn.payoutStatus === "paid") {
    const am = formatIsoDate(cn.paidOn);
    return am !== "—" ? `Ausgezahlt am ${am}` : "Ausgezahlt";
  }
  if (cn.payoutStatus === "open") return cn.cancelled ? "—" : CREDIT_NOTE_TEXTS.payoutOpen;
  if (cn.payoutStatus === null || cn.payoutStatus === undefined) return "—";
  return statusFallback(cn.payoutStatus)[1];
}

/** „Storniert durch GS-…", „Storno zu GS-…", „Ersetzt GS-…" — in dieser Reihenfolge. */
export function correctionHints(cn) {
  if (!cn) return [];
  const out = [];
  if (cn.cancelled) out.push(cn.cancelledByNumber ? `Storniert durch ${cn.cancelledByNumber}` : "Storniert");
  if (cn.correctsNumber) out.push(`Storno zu ${cn.correctsNumber}`);
  if (cn.replacesNumber) out.push(`Ersetzt ${cn.replacesNumber}`);
  return out;
}

/** Zeitraum (Monat) einer Gutschrift: „September 2026". */
export const creditNotePeriod = (cn) => formatMonth(cn?.periodMonth);

/** Ausstellungstag: „01.10.2026". */
export const creditNoteIssuedOn = (cn) => formatIsoDate(cn?.issuedOn);

/** Steuersatz als Zusatzzeile: „19,00 %" oder null. */
export const creditNoteTaxRate = (cn) => (cn && cn.taxRatePercent ? formatPercent(cn.taxRatePercent) : null);

// ── Normalisierung ──────────────────────────────────────────────────────────

/** Eine Gutschrift → View-Modell. Ohne gültige Kennung bleibt die Zeile
 *  sichtbar, bietet aber keine Aktion (kein PDF, keine Adminaktion); ohne
 *  Kennung UND Nummer ist es keine Gutschrift (null). Die Adminfelder werden
 *  nur mit `admin: true` übernommen. */
export function normalizeCreditNote(raw, { admin = false } = {}) {
  const c = objOrNull(raw);
  if (!c) return null;
  const id = creditNoteIdOf(c.id);
  if (id === null && !str(c.number)) return null;
  // Beträge nur in EUR — eine andere Währung würde hier falsch als Euro erscheinen.
  const euro = c.currency === undefined || c.currency === null || c.currency === "EUR";
  const betrag = (v) => (euro ? int(v) : null);
  const out = {
    id,
    number: str(c.number),
    kind: str(c.kind),
    title: str(c.title),
    periodMonth: str(c.periodMonth),
    issuedAt: str(c.issuedAt),
    issuedOn: str(c.issuedOn),
    netCents: betrag(c.netCents),
    taxCents: betrag(c.taxCents),
    grossCents: betrag(c.grossCents),
    taxRatePercent: pct(c.taxRatePercent),
    documentReady: c.documentReady === true,
    payoutStatus: str(c.payoutStatus),
    paidOn: str(c.paidOn),
    cancelled: c.cancelled === true,
    // Unveränderliche Testkennzeichnung des Servers (Pre-Live-Testmodus).
    isTest: c.isTest === true,
    cancelledByNumber: str(c.cancelledByNumber),
    correctsNumber: str(c.correctsNumber),
    replacesNumber: str(c.replacesNumber),
  };
  if (admin) {
    out.documentStatus = str(c.documentStatus);
    out.notifiedAt = str(c.notifiedAt);
    out.paidReference = str(c.paidReference);
    out.issuedByName = str(c.issuedByName);
    out.cancellationReason = str(c.cancellationReason);
  }
  return out;
}

/** GET …/credit-notes → { creditNotes, openSettlement }. */
export function normalizeCreditNotes(raw, { admin = false } = {}) {
  const d = objOrNull(raw) || {};
  const os = objOrNull(d.openSettlement);
  return {
    creditNotes: arr(d.creditNotes).map((x) => normalizeCreditNote(x, { admin })).filter(Boolean),
    openSettlement: os ? {
      readyNetCents: int(os.readyNetCents),
      readyEntryCount: int(os.readyEntryCount),
      carriedForward: os.carriedForward === true,
    } : null,
  };
}

// ── PDF-Abruf ───────────────────────────────────────────────────────────────
export const CREDIT_NOTE_DOWNLOAD_TEXT = Object.freeze({
  netz: "Die Verbindung wurde unterbrochen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
  allgemein: "Die Gutschrift konnte nicht heruntergeladen werden. Bitte versuchen Sie es erneut.",
});

/** Verständlicher Satz zu einem gescheiterten PDF-Abruf — nie ein Rohcode. */
export function creditNoteDownloadMessage(status) {
  if (status === 404) return "Diese Gutschrift ist nicht verfügbar.";
  if (status === 409) return "Das Dokument dieser Gutschrift wird noch erstellt. Bitte versuchen Sie es später erneut.";
  if (status === 429) return "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.";
  return CREDIT_NOTE_DOWNLOAD_TEXT.allgemein;
}

/** Rückfallname, falls der Browser den Serverdateinamen nicht lesen darf. */
export function creditNoteFallbackFilename(number) {
  const n = String(number ?? "").replace(/[^A-Za-z0-9._-]/g, "");
  return n ? `gutschrift-${n}.pdf` : "gutschrift.pdf";
}
