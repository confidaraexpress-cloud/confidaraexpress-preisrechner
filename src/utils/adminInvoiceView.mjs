// ─────────────────────────────────────────────────────────────────────────────
// Admin-Rechnungsverwaltung — reine, framework-freie Anzeige- und Ablauflogik.
//
// EINE Quelle für Liste und Detail: Forderungsklassifizierung, Zahlungsstatus,
// Überfälligkeit, Dokument- und E-Mail-Zustand, Zahlbarkeit, verfügbare Admin-
// aktionen, Beschriftungen, Fehler- und Leerzustände. Kein React, kein Netzwerk,
// kein State.
//
// VERBINDLICHE ABGRENZUNGEN (Backendvertrag, nicht geraten):
//   • invoices.status kennt AUSSCHLIESSLICH unpaid | paid. „Überfällig" ist KEIN
//     gespeicherter Status, sondern ein abgeleiteter Zustand.
//   • Die Forderungsklassifizierung (produktiv vs. Test/Vorschau) trifft das
//     BACKEND (lib/invoiceReceivable.js) und liefert sie als is_productive /
//     is_payable / is_overdue / document_mode_label mit. Das Frontend rechnet
//     sie NICHT nach — es liest sie und fällt nur dann auf eine konservative
//     Ersatzableitung zurück, wenn ein altes Backend die Felder nicht kennt.
//   • Beträge werden ausschließlich ANGEZEIGT, nie berechnet oder umgerechnet.
//   • Historische Rechnungsempfängerdaten (Snapshot) und aktuelle Kontodaten
//     sind zwei verschiedene Dinge und werden nie vermischt.
//   • Keine Rechnungs-, Bestell- oder Kundennummer aus technischen IDs ableiten.
//
// AUTORITÄT: Das Backend bleibt in allem verbindlich. Gesperrte Aktionen im UI
// sind Bedienkomfort — die eigentliche Sperre steht serverseitig.
// ─────────────────────────────────────────────────────────────────────────────

import { statusFallback } from "./statusFallback.mjs";
const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
// Tri-State-Deutung eines Backend-Booleans: true | false | null (Feld unbekannt).
const boolish = (v) => {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return null;
};

// ── Dokumentmodus ───────────────────────────────────────────────────────────
// Das Backend liefert document_mode_label (production|test|preview|unknown).
// Fehlt es (älteres Backend), wird konservativ aus den Rohfeldern abgeleitet —
// mit derselben Reihenfolge wie serverseitig, damit nie ein Testdokument
// versehentlich als produktiv erscheint.
export const INVOICE_MODES = Object.freeze(["production", "test", "preview", "unknown"]);

export function invoiceMode(row) {
  const r = row && typeof row === "object" ? row : {};
  const fromServer = str(firstDefined(r.document_mode_label, r.documentModeLabel));
  if (INVOICE_MODES.includes(fromServer)) return fromServer;
  const mode = str(firstDefined(r.document_mode, r.documentMode));
  const isTest = boolish(firstDefined(r.is_test_document, r.isTestDocument));
  if (mode === "preview") return "preview";
  if (isTest === true) return "test";
  if (mode === "test") return "test";
  if (mode === "production") return "production";
  if (isTest === false) return "production";
  return "unknown";
}

// Anzeigetexte je Modus. „unknown" wird EHRLICH benannt statt geraten.
const MODE_META = Object.freeze({
  production: Object.freeze({ label: "Produktivrechnung", badge: "", short: "Produktiv" }),
  test:       Object.freeze({ label: "Testrechnung", badge: "badge-yellow", short: "Test" }),
  preview:    Object.freeze({ label: "Interne Vorschau", badge: "badge-yellow", short: "Vorschau" }),
  unknown:    Object.freeze({ label: "Modus nicht bestimmbar", badge: "badge-gray", short: "Unklar" }),
});
export const invoiceModeMeta = (row) => MODE_META[invoiceMode(row)] || MODE_META.unknown;

// ── Produktive Forderung ────────────────────────────────────────────────────
// Primär das serverseitig abgeleitete Feld. Fehlt es, wird aus dem Modus
// abgeleitet — fail-closed: nur ein eindeutiger Produktivmodus zählt.
export function isProductiveInvoice(row) {
  const r = row && typeof row === "object" ? row : {};
  const flag = boolish(firstDefined(r.is_productive, r.isProductive));
  if (flag !== null) return flag;
  return invoiceMode(r) === "production";
}

export const NON_PRODUCTIVE_NOTE =
  "Diese Rechnung ist eine Test- oder Vorschau-Rechnung und keine zahlungswirksame Kundenforderung.";
export const NON_PRODUCTIVE_PAY_NOTE =
  "Test- und Vorschau-Rechnungen sind keine zahlungswirksamen Forderungen und können nicht als bezahlt markiert werden.";
export const NON_PRODUCTIVE_MAIL_NOTE =
  "Test- und Vorschau-Rechnungen werden nicht an Kunden versendet.";

// ── Überfälligkeit ──────────────────────────────────────────────────────────
// Ausschließlich der serverseitig abgeleitete Wert (is_overdue). Das Frontend
// rechnet KEINE konkurrierende Zeitzonenlogik mehr — genau die hat an Tages-
// rändern Filter und Anzeige auseinanderlaufen lassen. Fehlt das Feld (altes
// Backend), wird auf die bisherige Tagesgrenze zurückgefallen; eine nicht
// produktive Rechnung ist NIE überfällig.
export function isInvoiceOverdue(row, now = new Date()) {
  const r = row && typeof row === "object" ? row : {};
  if (!isProductiveInvoice(r)) return false;
  const flag = boolish(firstDefined(r.is_overdue, r.isOverdue));
  if (flag !== null) return flag;
  if (str(firstDefined(r.status, r.state)) === "paid") return false;
  const due = firstDefined(r.due_date, r.dueDate);
  if (!due) return false;
  const d = new Date(due);
  if (Number.isNaN(d.getTime())) return false;
  const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return dueDay.getTime() < today.getTime();
}

// ── Zahlungsstatus ──────────────────────────────────────────────────────────
// Nicht produktive Rechnungen tragen KEINEN Zahlungsstatus — sie sind keine
// Forderung. Sie zeigen deshalb nie „Offen"/„Überfällig", sondern den ehrlichen
// Zustand „Keine Forderung".
// → { cls, label, kind }  kind: "paid" | "overdue" | "open" | "none" | "unknown"
export function paymentStatus(row, now = new Date()) {
  const r = row && typeof row === "object" ? row : {};
  if (!isProductiveInvoice(r)) return { cls: "badge-gray", label: "Keine Forderung", kind: "none" };
  const status = str(firstDefined(r.status, r.state));
  if (status === "paid") return { cls: "badge-green", label: "Bezahlt", kind: "paid" };
  if (isInvoiceOverdue(r, now)) return { cls: "badge-red", label: "Überfällig", kind: "overdue" };
  if (status === "unpaid") return { cls: "badge-yellow", label: "Offen", kind: "open" };
  // Rohwert nie sichtbar — der Support sieht ihn über `raw` im title-Attribut.
  const [cls, label, raw] = statusFallback(status);
  return { cls, label, raw, kind: "unknown" };
}

// Auswahl für den Zahlungsstatus-Filter (Backendvertrag kennt nur unpaid|paid).
export const INVOICE_STATUS_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ value: "", label: "Alle" }),
  Object.freeze({ value: "unpaid", label: "Offen" }),
  Object.freeze({ value: "paid", label: "Bezahlt" }),
]);

// ── Dokumentzustand ─────────────────────────────────────────────────────────
const DOCUMENT_STATUS_META = Object.freeze({
  ready:            Object.freeze({ cls: "badge-green", label: "PDF bereit" }),
  pending_document: Object.freeze({ cls: "badge-blue", label: "PDF wird erstellt" }),
  generating:       Object.freeze({ cls: "badge-blue", label: "PDF wird erstellt" }),
  document_failed:  Object.freeze({ cls: "badge-red", label: "PDF-Erstellung fehlgeschlagen" }),
});

export function documentState(row) {
  const r = row && typeof row === "object" ? row : {};
  const status = str(firstDefined(r.document_status, r.documentStatus));
  const meta = DOCUMENT_STATUS_META[status];
  // Rohwert nie im sichtbaren Text — er steht als `raw` fürs title-Attribut bereit.
  const [unbekanntCls, unbekanntLabel, unbekanntRaw] = statusFallback(status);
  return {
    status,
    known: !!meta,
    raw: meta ? null : unbekanntRaw,
    cls: meta ? meta.cls : unbekanntCls,
    label: meta ? meta.label : unbekanntLabel,
    ready: status === "ready",
    failed: status === "document_failed",
    running: status === "generating" || status === "pending_document",
  };
}

// ── E-Mail-Zustand ──────────────────────────────────────────────────────────
// Testdokumente werden NIE versendet — der Status bleibt serverseitig 'pending'.
// Statt eines irreführenden „Versand ausstehend" zeigt die Oberfläche das
// ehrlich an. Ohne fertiges Dokument steht ebenfalls kein Versand an.
const EMAIL_STATUS_META = Object.freeze({
  pending: Object.freeze({ cls: "badge-gray", label: "Versand nach Dokumenterstellung" }),
  sending: Object.freeze({ cls: "badge-blue", label: "Versand läuft" }),
  sent:    Object.freeze({ cls: "badge-green", label: "Versendet" }),
  failed:  Object.freeze({ cls: "badge-red", label: "Versand fehlgeschlagen" }),
});

export function emailState(row) {
  const r = row && typeof row === "object" ? row : {};
  const status = str(firstDefined(r.email_status, r.emailStatus)) || "pending";
  if (!isProductiveInvoice(r)) {
    // `label` steht in der Detailkarte, `shortLabel` im kompakten Listenmarker —
    // gleiche Aussage, nur platzgerecht.
    return { status, cls: "badge-yellow",
      label: "Kein Versand bei Test-/Vorschau-Rechnung", shortLabel: "Kein Kundenversand",
      sendable: false, blockedReason: NON_PRODUCTIVE_MAIL_NOTE, action: null, running: false, failed: false };
  }
  const doc = documentState(r);
  const [unbekanntCls, unbekanntLabel, unbekanntRaw] = statusFallback(status);
  const meta = EMAIL_STATUS_META[status] || { cls: unbekanntCls, label: unbekanntLabel, raw: unbekanntRaw };
  const running = status === "sending";
  // Aktion aus dem ECHTEN Status: pending → senden, failed → erneut versuchen,
  // sent → bewusstes Resend. Das Backend klassifiziert manual_send auf failed
  // selbst als Retry — hier wird nichts vorweggenommen.
  const action = running || !doc.ready ? null
    : status === "sent" ? { kind: "resend", label: "Rechnung erneut senden" }
    : status === "failed" ? { kind: "send", label: "Versand erneut versuchen" }
    : { kind: "send", label: "Rechnung per E-Mail senden" };
  const label = !doc.ready && status === "pending" ? "Versand nach Dokumenterstellung" : meta.label;
  return {
    status,
    cls: meta.cls,
    label,
    shortLabel: label,
    sendable: !!action,
    blockedReason: running ? "" : doc.ready ? "" : "Der Versand ist erst nach erfolgreicher Dokumenterstellung möglich.",
    action,
    running,
    failed: status === "failed",
  };
}

// ── Zahlbarkeit und Adminaktionen ───────────────────────────────────────────
// → { payable, reason }  reason nur, wenn NICHT zahlbar.
export function payability(row) {
  const r = row && typeof row === "object" ? row : {};
  const flag = boolish(firstDefined(r.is_payable, r.isPayable));
  if (!isProductiveInvoice(r)) return { payable: false, reason: NON_PRODUCTIVE_PAY_NOTE };
  if (str(firstDefined(r.status, r.state)) === "paid") return { payable: false, reason: "Diese Rechnung ist bereits als bezahlt markiert." };
  if (flag === false) return { payable: false, reason: NON_PRODUCTIVE_PAY_NOTE };
  return { payable: true, reason: "" };
}

// Bestätigungstext der Zahlungsaktion — die Unwiderruflichkeit wird ausdrücklich
// benannt (es gibt serverseitig KEINE Aktion „Als offen markieren").
export const PAY_DIALOG = Object.freeze({
  title: "Rechnung als bezahlt markieren?",
  text: "Die Rechnung wird als bezahlt markiert und das Zahlungsdatum wird gespeichert. Diese Aktion kann nicht rückgängig gemacht werden.",
  confirm: "Als bezahlt markieren",
  cancel: "Abbrechen",
});

// ── Kompakte Marker für die Listenspalte „Dokument & Versand" ───────────────
// Fachlich getrennt (Dokument ≠ Versand), aber ohne zwei breite Spalten.
// → [{ key, cls, label }]
export function invoiceMarkers(row) {
  const doc = documentState(row);
  const mail = emailState(row);
  const out = [];
  if (doc.status) out.push({ key: "document", cls: doc.cls, label: doc.label });
  if (mail.status) out.push({ key: "email", cls: mail.cls, label: mail.shortLabel || mail.label });
  return out;
}

// ── Beträge (nur Anzeige) ───────────────────────────────────────────────────
// Liest ausschließlich gespeicherte Felder. Es wird NICHTS gerechnet — auch
// kein Netto aus Brutto minus Steuer.
export function amountFields(row) {
  const r = row && typeof row === "object" ? row : {};
  return {
    gross: numOrNull(firstDefined(r.amount, r.gross_amount, r.grossAmount)),
    net: numOrNull(firstDefined(r.net_amount, r.netAmount)),
    vat: numOrNull(firstDefined(r.vat_amount, r.vatAmount)),
    vatRate: numOrNull(firstDefined(r.vat_rate, r.vatRate)),
    shippingGross: numOrNull(firstDefined(r.shipping_gross, r.shippingGross)),
    shippingVat: numOrNull(firstDefined(r.shipping_vat_amount, r.shippingVatAmount)),
    insuranceGross: numOrNull(firstDefined(r.insurance_gross, r.insuranceGross)),
    currency: str(firstDefined(r.currency)) || "EUR",
    paymentTerm: numOrNull(firstDefined(r.payment_term, r.paymentTerm)),
  };
}

// ── Rechnungsempfänger: historisch vs. aktuell ──────────────────────────────
// Der Snapshot ist für die Rechnung maßgeblich. Aktuelle Stammdaten dürfen ihn
// NIE ersetzen — sie erscheinen ausschließlich als getrennt beschrifteter
// Kontobezug. Fehlt der Snapshot (Bestandsrechnung), wird das ehrlich benannt
// statt still auf die Live-Daten auszuweichen.
// → { known, company, name, email, customerNumber, vatId }
export function snapshotRecipient(row) {
  const r = row && typeof row === "object" ? row : {};
  const company = str(firstDefined(r.snapshot_company, r.snapshotCompany));
  const name = str(firstDefined(r.snapshot_name, r.snapshotName));
  const email = str(firstDefined(r.snapshot_email, r.snapshotEmail));
  const customerNumber = str(firstDefined(r.customer_number, r.customerNumber));
  const vatId = str(firstDefined(r.snapshot_vat_id, r.snapshotVatId));
  return { known: !!(company || name || email || customerNumber || vatId), company, name, email, customerNumber, vatId };
}

export const SNAPSHOT_MISSING_NOTE =
  "Für diese Bestandsrechnung sind keine eingefrorenen Empfängerdaten gespeichert.";

// Aktuelles Kundenkonto — bewusst getrennt und klar als „aktuell" beschriftet.
// → { userId, company, name, email, customerNumber, linkable }
export function currentAccount(row) {
  const r = row && typeof row === "object" ? row : {};
  const userId = firstDefined(r.user_id, r.userId) ?? null;
  return {
    userId,
    company: str(firstDefined(r.company_name, r.companyName)),
    name: str(firstDefined(r.name)),
    email: str(firstDefined(r.email)),
    customerNumber: str(firstDefined(r.current_customer_number, r.currentCustomerNumber)),
    linkable: userId !== null && userId !== "",
  };
}

// Kundendarstellung in der LISTE: Firma primär, Kundennummer sekundär. Die
// technische user_id ist NIE die Hauptdarstellung.
// → { primary, secondary, known }
export function customerCell(row) {
  const r = row && typeof row === "object" ? row : {};
  const company = str(firstDefined(r.company_name, r.companyName));
  const number = str(firstDefined(r.customer_number, r.customerNumber));
  const name = str(firstDefined(r.name));
  if (company) return { primary: company, secondary: number, known: true };
  if (name) return { primary: name, secondary: number, known: true };
  if (number) return { primary: number, secondary: "", known: true };
  return { primary: "Kunde nicht auflösbar", secondary: "", known: false };
}

// ── Zugehörige Sendung ──────────────────────────────────────────────────────
// Es wird KEINE Nummer erfunden. Fehlt die Bestellnummer, wird der Bestandsfall
// ehrlich benannt.
// → { linked, shipmentId, orderNumber, orderNumberKnown, carrier, route, status, packages }
// `orderNumber` trägt die AUFTRAGSBESTÄTIGUNGSNUMMER (CE-AB…) der verknüpften Sendung —
// die sichtbare Vorgangsnummer. Die interne Bestellnummer (CE-BS…) wird hier bewusst
// NICHT mehr gelesen: sie bleibt technisch bestehen, hat aber keine Anzeigerolle mehr.
// Der Feldname bleibt `orderNumber`, damit der Vertrag der Seite unverändert bleibt.
export const SHIPMENT_NO_ORDER_NUMBER = "Bestandsrechnung ohne Vorgangsnummer";

export function linkedShipment(row) {
  const r = row && typeof row === "object" ? row : {};
  const shipmentId = firstDefined(r.shipment_id, r.shipmentId) ?? null;
  const orderNumber = str(firstDefined(
    r.shipment_order_confirmation_number, r.shipmentOrderConfirmationNumber));
  const from = str(firstDefined(r.shipment_from_country, r.shipmentFromCountry)).toUpperCase();
  const to = str(firstDefined(r.shipment_to_country, r.shipmentToCountry)).toUpperCase();
  const packages = numOrNull(firstDefined(r.shipment_package_count, r.shipmentPackageCount));
  return {
    linked: shipmentId !== null && str(shipmentId) !== "",
    shipmentId,
    orderNumber,
    orderNumberKnown: !!orderNumber,
    carrier: str(firstDefined(r.shipment_carrier, r.shipmentCarrier)),
    route: from || to ? `${from || "?"} → ${to || "?"}` : "",
    status: str(firstDefined(r.shipment_status, r.shipmentStatus)),
    packages,
  };
}

// ── Filter ──────────────────────────────────────────────────────────────────
// AUSSCHLIESSLICH die vom Backend belegten Query-Parameter: status, user_id,
// overdue, limit/offset. Es gibt serverseitig KEINE Freitextsuche — es wird
// deshalb auch keine vorgetäuscht.
export const EMPTY_INVOICE_FILTERS = Object.freeze({ status: "", user_id: "", overdue: false });

export function toInvoiceApiFilters(f) {
  const s = f && typeof f === "object" ? f : {};
  const p = {};
  if (str(s.status)) p.status = str(s.status);
  if (str(s.user_id)) p.user_id = str(s.user_id);
  if (s.overdue === true) p.overdue = "true";
  return p;
}

export function validateInvoiceFilters(f) {
  const s = f && typeof f === "object" ? f : {};
  if (str(s.user_id) && !/^\d+$/.test(str(s.user_id))) {
    return { valid: false, error: "Die Kunden-ID muss eine Zahl sein." };
  }
  return { valid: true, error: "" };
}

export function hasActiveInvoiceFilters(f) {
  const s = f && typeof f === "object" ? f : {};
  return !!str(s.status) || !!str(s.user_id) || s.overdue === true;
}

export function activeInvoiceFilterChips(f) {
  const s = f && typeof f === "object" ? f : {};
  const chips = [];
  if (str(s.status)) {
    const o = INVOICE_STATUS_FILTER_OPTIONS.find((x) => x.value === s.status);
    chips.push({ key: "status", label: `Status: ${o ? o.label : s.status}` });
  }
  if (s.overdue === true) chips.push({ key: "overdue", label: "Nur überfällige Forderungen" });
  if (str(s.user_id)) chips.push({ key: "user_id", label: `Kunden-ID: ${str(s.user_id)}` });
  return chips;
}

// ── Lade-, Fehler- und Leerzustände ─────────────────────────────────────────
export function invoiceEmptyState({ count = 0, filters = EMPTY_INVOICE_FILTERS } = {}) {
  if (count > 0) return { show: false, title: "", text: "" };
  if (hasActiveInvoiceFilters(filters)) {
    return { show: true, title: "Für diese Filter wurden keine Rechnungen gefunden.",
      text: "Passen Sie die Filter an — oder setzen Sie sie zurück." };
  }
  return { show: true, title: "Noch keine Rechnungen vorhanden.",
    text: "Sobald Kunden buchen, erscheinen die Rechnungen hier." };
}

export const INVOICE_LIST_ERROR = "Die Rechnungen konnten nicht geladen werden.";
export const INVOICE_DETAIL_ERROR = "Die Rechnung konnte nicht geladen werden.";
export const INVOICE_NOT_FOUND = "Die Rechnung wurde nicht gefunden.";

// → { text, notFound, retryable }; 401/403 → null (zentrales Auth-Verhalten).
export function invoiceDetailError(status) {
  if (status === 401 || status === 403) return null;
  if (status === 404) return { text: INVOICE_NOT_FOUND, notFound: true, retryable: false };
  if (status === 429) return { text: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.", notFound: false, retryable: true };
  return { text: INVOICE_DETAIL_ERROR, notFound: false, retryable: true };
}

// ── Fehlermeldungen der Adminaktionen ───────────────────────────────────────
// Serverseitige Fehlercodes → verständliche deutsche Texte. Es wird NIE ein
// roher Providertext oder Backendcode angezeigt.
const PAY_ERROR_BY_CODE = Object.freeze({
  invoice_not_payable_test_document: NON_PRODUCTIVE_PAY_NOTE,
});
const PAY_ERROR_BY_STATUS = Object.freeze({
  404: "Rechnung wurde nicht gefunden oder existiert nicht mehr.",
  409: NON_PRODUCTIVE_PAY_NOTE,
  429: "Zu viele Admin-Aktionen. Bitte kurz warten.",
});
export const PAY_ERROR_GENERIC = "Die Rechnung konnte nicht als bezahlt markiert werden.";

export function payErrorMessage(status, code) {
  if (code && PAY_ERROR_BY_CODE[code]) return PAY_ERROR_BY_CODE[code];
  return PAY_ERROR_BY_STATUS[status] || PAY_ERROR_GENERIC;
}

// Technische Dokument-/Versandfehler verständlich einordnen. Der rohe Code wird
// NICHT als Meldung gezeigt; er gehört (gekürzt) in die technischen Infos.
export const DOCUMENT_ERROR_NOTE =
  "Die Dokumenterstellung ist fehlgeschlagen. Die Rechnung selbst ist davon unberührt; ein erneuter Versuch ist möglich.";
export const EMAIL_ERROR_NOTE =
  "Der letzte Versandversuch ist fehlgeschlagen. Die Rechnung und das Dokument sind davon unberührt.";

// Gekürzter technischer Code für den Technikbereich (nie als Hauptmeldung).
export function technicalCode(value, max = 120) {
  const s = str(value);
  if (!s) return "";
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// ── Erfolgsmeldungen ────────────────────────────────────────────────────────
// Einheitliche Texte; werden NIE vor der Backendbestätigung gezeigt.
export const SUCCESS_TEXT = Object.freeze({
  paid: "Rechnung als bezahlt markiert",
  alreadyPaid: "Diese Rechnung war bereits als bezahlt markiert.",
  documentStarted: "PDF-Erstellung gestartet",
  documentReady: "PDF erstellt",
  documentInProgress: "Die Dokumenterstellung läuft bereits.",
  emailStarted: "E-Mail-Versand gestartet",
  emailResent: "E-Mail erneut versendet",
  emailAlreadySent: "Diese Rechnung wurde bereits versendet. Für einen erneuten Versand bitte „Rechnung erneut senden“ verwenden.",
  emailInProgress: "Ein Versand läuft bereits.",
});

// Outcome des Dokument-Endpunkts → Meldung. Unbekanntes Outcome ⇒ Fehlertext.
export function documentOutcomeMessage(outcome) {
  if (outcome === "generated") return { type: "success", text: SUCCESS_TEXT.documentReady };
  if (outcome === "already_ready") return { type: "info", text: "Das Rechnungsdokument ist bereits fertig." };
  if (outcome === "in_progress") return { type: "info", text: SUCCESS_TEXT.documentInProgress };
  return { type: "error", text: DOCUMENT_ERROR_NOTE };
}

export function emailOutcomeMessage(outcome, kind) {
  if (outcome === "sent") return { type: "success", text: kind === "resend" ? SUCCESS_TEXT.emailResent : SUCCESS_TEXT.emailStarted };
  if (outcome === "already_sent") return { type: "info", text: SUCCESS_TEXT.emailAlreadySent };
  if (outcome === "in_progress") return { type: "info", text: SUCCESS_TEXT.emailInProgress };
  return { type: "error", text: EMAIL_ERROR_NOTE };
}
