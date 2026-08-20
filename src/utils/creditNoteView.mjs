import { statusFallback } from "./statusFallback.mjs";

// Gemeinsame, REINE Logik für Providerstorno und Gutschrift — Adminportal und
// Kundenportal. Kein JSX, kein State, kein Fetch; testbar unter Node (`.mjs`).
//
// ─── Was dieses Modul NICHT tut ──────────────────────────────────────────────
// Es entscheidet NICHTS. Es rechnet keinen Erstattungsbetrag, es prüft keine
// Berechtigung und es leitet keinen Betrag aus einem anderen ab. Der Betrag
// einer Gutschrift entsteht ausschließlich serverseitig aus dem eingefrorenen
// Beleg; das Frontend zeigt ihn an. Diese Trennung ist dieselbe wie beim
// Gutscheincode und beim Preisrechner: die Oberfläche stellt dar, der Server
// entscheidet.
//
// Es stößt auch nichts beim Versanddienstleister an: der Providerstorno bleibt
// Betreiberhandarbeit direkt bei JUMiNGO. Die Statuszeile hält nur fest, wo der
// Betreiber steht.

// ── Providerstorno ──────────────────────────────────────────────────────────
// Vier Zustände, exakt der Backendvertrag. Unbekannt → grau + „Unbekannter
// Status" (statusFallback), nie ein roher Backendwert im Fließtext.
const PROVIDER_STATUS_META = {
  not_started: ["badge-neutral", "Noch nicht begonnen"],
  pending: ["badge-yellow", "Beim Dienstleister angefragt"],
  confirmed: ["badge-green", "Vom Dienstleister bestätigt"],
  failed: ["badge-red", "Beim Dienstleister fehlgeschlagen"],
};
export const providerCancellationMeta = (status) =>
  PROVIDER_STATUS_META[status] || statusFallback(status);

export const PROVIDER_CANCELLATION_ORDER = ["not_started", "pending", "confirmed", "failed"];

// Erlaubte Ziel-Zustände. 'confirmed' ist terminal: der Carrier hat storniert,
// das nimmt niemand zurück. 'failed' bleibt änderbar — ein zweiter Versuch beim
// Dienstleister ist ein realer Betreibervorgang.
export function allowedProviderTargets(current) {
  switch (current) {
    case "not_started": return ["pending", "confirmed", "failed"];
    case "pending":     return ["confirmed", "failed"];
    case "failed":      return ["pending", "confirmed"];
    default:            return [];
  }
}

export function providerStatusOptions(current) {
  if (!PROVIDER_STATUS_META[current]) return [];
  const set = new Set([current, ...allowedProviderTargets(current)]);
  return PROVIDER_CANCELLATION_ORDER
    .filter((s) => set.has(s))
    .map((s) => ({ value: s, label: providerCancellationMeta(s)[1] }));
}

// Der Providerstorno lässt sich erst nachtragen, wenn ConfidaraExpress die
// Anfrage angenommen hat. Sonst stünde am Vorgang, der Carrier habe storniert,
// während die Sendung fachlich weiterläuft.
export function isProviderSectionEnabled(cancellationStatus) {
  return cancellationStatus === "accepted";
}

// ── Wann darf die Gutschrift erstellt werden? ───────────────────────────────
// Die Oberfläche spiegelt die serverseitige Bedingung, sie ersetzt sie nicht:
// der Server prüft dieselben beiden Voraussetzungen noch einmal.
//
// Ausdrücklich ein EIGENER Knopf und kein Seiteneffekt der Providerbestätigung.
// Eine Gutschrift ist ein Steuerdokument mit eigener Nummer; sie nebenbei
// entstehen zu lassen hieße, sie irgendwann versehentlich auszustellen — und ein
// ausgestellter Beleg lässt sich nicht zurücknehmen, nur durch einen weiteren
// Beleg ausgleichen.
export function creditNoteAction({ cancellationStatus, providerStatus, existingCreditNote } = {}) {
  if (existingCreditNote) {
    return { canCreate: false, reason: "exists", hint: "Zu diesem Vorgang besteht bereits eine Gutschrift." };
  }
  if (cancellationStatus !== "accepted") {
    return { canCreate: false, reason: "not_accepted",
      hint: "Die Stornierungsanfrage muss zuerst angenommen werden." };
  }
  if (providerStatus !== "confirmed") {
    return { canCreate: false, reason: "provider_open",
      hint: "Erst wenn der Storno beim Versanddienstleister bestätigt ist, kann eine Gutschrift entstehen." };
  }
  return { canCreate: true, reason: null, hint: "" };
}

// ── Erstattungsstand ────────────────────────────────────────────────────────
// REIN ORGANISATORISCH. Es gibt kein Guthabenkonto, keine automatische
// Verrechnung und keine Zahlungswirkung — der Betrag wird außerhalb des Systems
// zurückgezahlt, und dieses Feld hält fest, ob das erledigt ist.
const REFUND_META = {
  open: ["badge-yellow", "Erstattung offen"],
  not_required: ["badge-neutral", "Keine Erstattung nötig"],
  refunded: ["badge-green", "Erstattet"],
};
export const refundStatusMeta = (status) => REFUND_META[status] || statusFallback(status);
export const REFUND_STATUS_ORDER = ["open", "not_required", "refunded"];
export const REFUND_STATUS_OPTIONS = REFUND_STATUS_ORDER.map((s) => ({ value: s, label: refundStatusMeta(s)[1] }));

// ── Normalisierung ──────────────────────────────────────────────────────────
// EINE kanonische Frontendform. Das Backend liefert camelCase; snake_case wird
// hier einmal zentral abgebildet, damit keine Komponente Feldvarianten kennt.
function firstOf(obj, ...keys) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
// 0 ist ein gültiger Betrag — es wird ausschließlich über Number.isFinite
// geprüft, nie über eine Falsy-Abfrage. Eine Gutschrift über 0,00 € entsteht
// serverseitig zwar nicht, aber eine Falsy-Prüfung hier hätte aus jeder 0 ein
// „fehlt" gemacht und die Anzeige leer gelassen.
function num(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v.trim()) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

export function normalizeCreditNote(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    id: firstOf(r, "id") ?? null,
    creditNoteNumber: firstOf(r, "creditNoteNumber", "credit_note_number") ?? null,
    invoiceId: firstOf(r, "invoiceId", "invoice_id") ?? null,
    invoiceNumber: firstOf(r, "invoiceNumber", "invoice_number") ?? null,
    shipmentId: firstOf(r, "shipmentId", "shipment_id") ?? null,
    businessOrderNumber: firstOf(r, "businessOrderNumber", "business_order_number") ?? null,
    netAmount: num(firstOf(r, "netAmount", "net_amount")),
    vatAmount: num(firstOf(r, "vatAmount", "vat_amount")),
    vatRate: num(firstOf(r, "vatRate", "vat_rate")),
    grossAmount: num(firstOf(r, "grossAmount", "gross_amount")),
    insuranceGross: num(firstOf(r, "insuranceGross", "insurance_gross")),
    currency: firstOf(r, "currency") || "EUR",
    issuedAt: firstOf(r, "issuedAt", "issued_at") ?? null,
    creditDate: firstOf(r, "creditDate", "credit_date") ?? null,
    refundStatus: firstOf(r, "refundStatus", "refund_status") || "open",
    documentStatus: firstOf(r, "documentStatus", "document_status") ?? null,
    downloadAvailable: firstOf(r, "downloadAvailable", "download_available") === true
      || (firstOf(r, "documentStatus", "document_status") === "ready"),
  };
}

export function normalizeCreditNoteList(body) {
  const list = body && Array.isArray(body.creditNotes) ? body.creditNotes : [];
  return list.map(normalizeCreditNote);
}

// ── Anzeige im Kundenportal ─────────────────────────────────────────────────
export const CREDIT_NOTE_EMPTY_TITLE = "Noch keine Gutschriften";
export const CREDIT_NOTE_EMPTY_TEXT =
  "Sobald eine stornierte Sendung erstattet wird, finden Sie den Beleg hier.";
export const CREDIT_NOTE_LIST_ERROR = "Die Gutschriften konnten nicht geladen werden.";

// Der Hinweis, den der Kunde neben einer Gutschrift liest. Er sagt AUSDRÜCKLICH,
// dass die Rechnung bestehen bleibt — sonst nimmt der Kunde an, sie sei
// verschwunden oder ersetzt worden.
export const CREDIT_NOTE_EXPLANATION =
  "Eine Gutschrift ist ein eigener Beleg. Die zugehörige Rechnung bleibt unverändert bestehen; "
  + "der gutgeschriebene Betrag wird erstattet oder mindert den noch offenen Betrag.";

// Ist zu dieser Rechnung etwas gutgeschrieben? Der Betrag kommt serverseitig als
// `credited_amount` mit — er wird hier NICHT aus anderen Feldern erschlossen.
export function invoiceCreditInfo(invoice) {
  const inv = invoice && typeof invoice === "object" ? invoice : {};
  const credited = num(firstOf(inv, "creditedAmount", "credited_amount"));
  const effective = num(firstOf(inv, "effectiveAmount", "effective_amount"));
  const amount = num(firstOf(inv, "amount"));
  if (credited === null || credited <= 0) {
    return { hasCredit: false, credited: 0, effective: effective !== null ? effective : amount, fullyCredited: false };
  }
  const eff = effective !== null ? effective : Math.max((amount || 0) - credited, 0);
  return {
    hasCredit: true,
    credited,
    effective: eff,
    // „Vollständig gutgeschrieben" heißt: nichts mehr offen. Der Beleg bleibt
    // sichtbar, er ist nur keine Forderung mehr.
    fullyCredited: eff <= 0,
  };
}

// Zusatzzeile unter dem Rechnungsbetrag. Nur wenn tatsächlich etwas
// gutgeschrieben ist — ohne Gutschrift bleibt die Anzeige exakt wie bisher.
export function invoiceCreditLine(invoice, formatMoney) {
  const info = invoiceCreditInfo(invoice);
  if (!info.hasCredit) return null;
  const fmt = typeof formatMoney === "function" ? formatMoney : (v) => String(v);
  return info.fullyCredited
    ? `Vollständig gutgeschrieben (${fmt(info.credited)})`
    : `Gutschrift ${fmt(info.credited)} · offen ${fmt(info.effective)}`;
}
