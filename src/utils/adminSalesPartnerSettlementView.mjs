// ── Admin: Abrechnung der Vertriebspartner — Abrechnungsdaten und Gutschriften ──
//
// Reine Lese-, Format- und Body-Logik für die Karten „Abrechnungsdaten“ und
// „Gutschriften“ im Partnerdetail (/admin/partners/:id). Wie in
// adminSalesPartnerView.mjs entsteht jeder Request-Body AUSSCHLIESSLICH über
// die build…Body-Funktionen dieser Datei (Allowlist, Prüfung vor dem Senden);
// verbindlich bleibt die Prüfung des Servers.
//
// Backendvertrag:
//   GET  /admin/sales-partners/:id/billing-details → { status, billingDetails (mit
//        vollständiger IBAN) | null, missingFields, accountEmail }
//   POST …/billing-details/confirm { submittedAt }       → 200 { status, noOp? }
//   POST …/billing-details/reject  { submittedAt, note } → 200 { status }
//        409 BILLING_DETAILS_CHANGED | BILLING_DETAILS_MISSING |
//            BILLING_DETAILS_INCOMPLETE { missingFields }; 400 REASON_REQUIRED (note)
//   GET  /admin/sales-partners/:id/credit-notes → { creditNotes: [ …Partnerform +
//        documentStatus, notifiedAt, paidReference, issuedByName, cancellationReason ] }
//   POST /admin/sales-partner-credit-notes/:id/payout { paidOn, reference? } → 200
//        400 PAID_ON_INVALID | PAYMENT_REFERENCE_INVALID; 404 CREDIT_NOTE_NOT_FOUND;
//        409 CREDIT_NOTE_NOT_PAYABLE | CREDIT_NOTE_CANCELLED | CREDIT_NOTE_ALREADY_PAID
//   POST …/:id/cancel { reason, acknowledgePaid } → 201 { cancellation, documentReady, notified }
//        400 REASON_REQUIRED; 409 CREDIT_NOTES_DISABLED | CREDIT_NOTE_NOT_CANCELLABLE |
//        CREDIT_NOTE_ALREADY_CANCELLED | CREDIT_NOTE_PAID_ACK_REQUIRED; 422 CREDIT_NOTE_BLOCKED
//   POST …/:id/generate-document → 200 { documentStatus, notified }
//
// Die vollständige IBAN erscheint ausschließlich in der Adminkarte
// „Abrechnungsdaten“ (manuelle Überweisung). Kein Blockier-, Status- oder
// Fehlercode erscheint roh — Unbekanntes bekommt einen neutralen deutschen Text.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

import {
  BILLING_FIELD_LABELS,
  billingFieldLabel,
  countryName,
  formatIbanGroups,
  normalizeBillingResponse,
  taxStatusLabel,
} from "./salesPartnerBilling.mjs";
import { normalizeCreditNotes } from "./salesPartnerCreditNotes.mjs";
import { statusMetaFrom } from "./salesPartnerView.mjs";
import { adminActionErrorText, formatTimestamp, isIsoDate } from "./adminSalesPartnerView.mjs";

const objOrNull = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const str = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
const trimmed = (v) => (typeof v === "string" ? v.trim() : "");
const own = (map, key) => typeof key === "string" && Object.prototype.hasOwnProperty.call(map, key);
const codeOf = (body) => (objOrNull(body) && typeof body.code === "string" ? body.code.trim() : "");
const ergebnis = (errors, body) => (Object.keys(errors).length ? { ok: false, errors } : { ok: true, body, errors: {} });

export const MAX_BILLING_REJECT_NOTE = 500;
export const MAX_CANCEL_REASON = 200;
export const MAX_PAYMENT_REFERENCE = 100;

export const SETTLEMENT_TEXTS = Object.freeze({
  noteRequired: "Bitte eine Begründung angeben.",
  noteTooLong: `Die Begründung darf höchstens ${MAX_BILLING_REJECT_NOTE} Zeichen lang sein.`,
  reasonRequired: "Bitte einen Grund angeben.",
  reasonTooLong: `Der Grund darf höchstens ${MAX_CANCEL_REASON} Zeichen lang sein.`,
  paidOnRequired: "Bitte das Auszahlungsdatum angeben.",
  paidOnInvalid: "Bitte ein gültiges Auszahlungsdatum angeben.",
  paidOnFuture: "Das Auszahlungsdatum darf nicht in der Zukunft liegen.",
  referenceTooLong: `Die Referenz darf höchstens ${MAX_PAYMENT_REFERENCE} Zeichen lang sein.`,
  ackRequired: "Bitte bestätigen Sie, dass das Storno trotz Auszahlung angelegt werden soll.",
  ackLabel: "Bereits ausgezahlt – Storno trotzdem anlegen",
  submissionMissing: "Es liegt keine Einreichung vor, die geprüft werden könnte.",
  cancelHint: "Die Positionen dieser Gutschrift können nach dem Storno erneut abgerechnet werden.",
  billingNone: "Der Vertriebspartner hat noch keine Abrechnungsdaten hinterlegt.",
  missing: "Fehlt",
});

// ── Blockiergründe (Ausstellung, Storno, Abrechnungslauf) ───────────────────
const BLOCKER_LABELS = Object.freeze({
  issuance_disabled: "Ausstellung ist deaktiviert (SALES_PARTNER_CREDIT_NOTES_ENABLED)",
  issuer_config_incomplete: "Ausstellerangaben unvollständig",
  credit_note_title_missing: "Belegtitel der Gutschrift nicht hinterlegt",
  billing_details_missing: "Abrechnungsdaten fehlen",
  billing_details_unconfirmed: "Abrechnungsdaten nicht bestätigt",
  tax_status_not_enabled: "Steuerstatus für Gutschriften nicht freigegeben",
  tax_rate_missing: "Steuersatz fehlt",
  tax_note_missing: "Steuerhinweis für den Beleg fehlt",
  agreement_missing: "Keine akzeptierte Vertriebspartnervereinbarung",
  cancellation_title_missing: "Belegtitel des Stornos nicht hinterlegt",
});
export const BLOCKER_CODES = Object.freeze(Object.keys(BLOCKER_LABELS));

/** Deutsches Label eines Blockiergrunds; ein unbekannter Code erscheint nie roh. */
export const blockerLabel = (code) => (own(BLOCKER_LABELS, code) ? BLOCKER_LABELS[code] : "Unbekannter Blockiergrund");

/** Labels einer Codeliste — ohne Wiederholung, in Serverreihenfolge. */
export function blockerLabels(codes) {
  return [...new Set((Array.isArray(codes) ? codes : []).filter((c) => typeof c === "string" && c.trim() !== "")
    .map((c) => blockerLabel(c.trim())))];
}

// ── Abrechnungsdaten (Admin) ────────────────────────────────────────────────

/** GET …/billing-details → { status, billingDetails (mit IBAN), accountEmail, missingFields }. */
export const normalizeAdminBilling = (raw) => normalizeBillingResponse(raw, { admin: true });

/** „Es fehlen: Straße und Hausnummer, IBAN." — oder null. */
export function missingFieldsText(missingFields) {
  const namen = [...new Set((Array.isArray(missingFields) ? missingFields : []).map((k) => billingFieldLabel(k)))];
  return namen.length ? `Es fehlen: ${namen.join(", ")}.` : null;
}

/** Jede Angabe als eigene Zeile; was der Server als fehlend meldet, ist markiert. */
export function adminBillingRows(state) {
  const d = state?.billingDetails || null;
  const fehlend = new Set(Array.isArray(state?.missingFields) ? state.missingFields : []);
  const zeile = (key, wert, extra = {}) => ({ key, label: BILLING_FIELD_LABELS[key], value: wert || null, missing: fehlend.has(key), ...extra });
  return [
    zeile("billingName", d?.billingName),
    zeile("street", d?.street),
    zeile("postalCode", d?.postalCode),
    zeile("city", d?.city),
    zeile("country", countryName(d?.country)),
    zeile("taxStatus", d?.taxStatus ? taxStatusLabel(d.taxStatus) : null),
    zeile("taxNumber", d?.taxNumber),
    zeile("vatId", d?.vatId),
    zeile("accountHolder", d?.accountHolder),
    // Vollständig, in Vierergruppen — nur hier, für die manuelle Überweisung.
    zeile("iban", formatIbanGroups(d?.iban) || d?.ibanMasked, { mono: true }),
    zeile("bic", d?.bic, { mono: true }),
  ];
}

/** Bestätigen und Ablehnen gibt es nur für eine eingereichte Fassung. */
export const billingReviewable = (state) => !!state && state.status === "submitted" && !!str(state.billingDetails?.submittedAt);

/** POST …/confirm — der Einreichungszeitpunkt ist das Token der geprüften Fassung. */
export function buildBillingConfirmBody(state) {
  const submittedAt = str(state?.billingDetails?.submittedAt);
  return submittedAt ? { ok: true, body: { submittedAt }, errors: {} } : { ok: false, errors: { submittedAt: SETTLEMENT_TEXTS.submissionMissing } };
}

/** POST …/reject — Begründung Pflicht (höchstens 500 Zeichen). */
export function buildBillingRejectBody(state, form = {}) {
  const errors = {};
  const submittedAt = str(state?.billingDetails?.submittedAt);
  if (!submittedAt) errors.submittedAt = SETTLEMENT_TEXTS.submissionMissing;
  const note = trimmed(form.note);
  if (!note) errors.note = SETTLEMENT_TEXTS.noteRequired;
  else if (note.length > MAX_BILLING_REJECT_NOTE) errors.note = SETTLEMENT_TEXTS.noteTooLong;
  return ergebnis(errors, { submittedAt, note });
}

/** Erfolgsmeldung nach Bestätigen/Ablehnen. */
export function billingReviewSuccessText(kind, body) {
  if (kind === "confirm") {
    return objOrNull(body)?.noOp === true
      ? "Die Abrechnungsdaten waren bereits bestätigt. Es wurde nichts geändert."
      : "Die Abrechnungsdaten wurden bestätigt.";
  }
  return "Die Abrechnungsdaten wurden abgelehnt. Der Vertriebspartner sieht die Begründung.";
}

/** Fehlerantwort von Bestätigen/Ablehnen → { text, reload, fieldErrors }.
 *  `reload`: der Stand des Servers hat sich bewegt — neu laden, nicht raten. */
export function billingReviewOutcome(status, body) {
  const code = codeOf(body);
  if (status === 400 && code === "REASON_REQUIRED") {
    return { text: SETTLEMENT_TEXTS.noteRequired, reload: false, fieldErrors: { note: SETTLEMENT_TEXTS.noteRequired } };
  }
  if (status === 409 && code === "BILLING_DETAILS_CHANGED") {
    return { text: "Der Vertriebspartner hat seine Abrechnungsdaten inzwischen neu eingereicht. Der aktuelle Stand wurde geladen – bitte prüfen Sie ihn erneut.",
      reload: true, fieldErrors: {} };
  }
  if (status === 409 && code === "BILLING_DETAILS_MISSING") {
    return { text: "Es sind keine Abrechnungsdaten hinterlegt. Es wurde nichts geändert.", reload: true, fieldErrors: {} };
  }
  if (status === 409 && code === "BILLING_DETAILS_INCOMPLETE") {
    const fehlend = missingFieldsText(objOrNull(body)?.missingFields);
    return { text: `Die Abrechnungsdaten sind unvollständig.${fehlend ? ` ${fehlend}` : ""} Es wurde nichts geändert.`,
      reload: true, fieldErrors: {} };
  }
  return { text: adminActionErrorText(status, body), reload: false, fieldErrors: {} };
}

// ── Gutschriften (Admin) ────────────────────────────────────────────────────

/** GET …/credit-notes → { creditNotes } mit Adminfeldern. */
export const normalizeAdminCreditNotes = (raw) => normalizeCreditNotes(raw, { admin: true });

const DOCUMENT_STATUS_META = Object.freeze({
  pending_document: Object.freeze(["badge-gray", "Dokument ausstehend"]),
  generating: Object.freeze(["badge-blue", "Dokument wird erzeugt"]),
  ready: Object.freeze(["badge-green", "Dokument bereit"]),
  failed: Object.freeze(["badge-red", "Dokument fehlgeschlagen"]),
});
export const documentStatusMeta = (status) => statusMetaFrom(DOCUMENT_STATUS_META, status);

/** „Benachrichtigt am 02.10.2026, 10:01" bzw. „Noch nicht benachrichtigt". */
export function notificationText(cn) {
  const am = formatTimestamp(cn?.notifiedAt, { withTime: true });
  return am !== "—" ? `Benachrichtigt am ${am}` : "Noch nicht benachrichtigt";
}

const mitKennung = (cn) => !!cn && cn.id !== null && cn.id !== undefined;
/** Als ausgezahlt markieren: nur eine offene, nicht stornierte Gutschrift. */
export const canMarkPaid = (cn) => mitKennung(cn) && cn.kind === "regular" && !cn.cancelled && cn.payoutStatus === "open";
/** Stornieren: nur eine nicht stornierte Gutschrift (kein Storno eines Stornos). */
export const canCancel = (cn) => mitKennung(cn) && cn.kind === "regular" && !cn.cancelled;
/** Dokument erneut erzeugen: solange es nicht bereit ist oder der Partner noch
 *  nicht benachrichtigt wurde. */
export const canRegenerate = (cn) => mitKennung(cn) && (cn.documentStatus !== "ready" || !cn.notifiedAt);
/** PDF: nur ein bereites Dokument. */
export const canDownloadAdmin = (cn) => mitKennung(cn) && (cn.documentReady === true || cn.documentStatus === "ready");

/** POST …/payout — Datum Pflicht, nicht in der Zukunft; Referenz optional (≤ 100). */
export function buildPayoutBody(form = {}, { today } = {}) {
  const errors = {};
  const paidOn = trimmed(form.paidOn);
  if (!paidOn) errors.paidOn = SETTLEMENT_TEXTS.paidOnRequired;
  else if (!isIsoDate(paidOn)) errors.paidOn = SETTLEMENT_TEXTS.paidOnInvalid;
  else if (isIsoDate(today) && paidOn > today) errors.paidOn = SETTLEMENT_TEXTS.paidOnFuture;
  const reference = trimmed(form.reference);
  if (reference.length > MAX_PAYMENT_REFERENCE) errors.reference = SETTLEMENT_TEXTS.referenceTooLong;
  const body = { paidOn };
  if (reference) body.reference = reference;
  return ergebnis(errors, body);
}

/** POST …/cancel — Grund Pflicht (≤ 200); `acknowledgePaid` immer als Boolean.
 *  Ist die Gutschrift bereits ausgezahlt, ist die ausdrückliche Bestätigung Pflicht. */
export function buildCancelBody(form = {}, { paid = false } = {}) {
  const errors = {};
  const reason = trimmed(form.reason);
  if (!reason) errors.reason = SETTLEMENT_TEXTS.reasonRequired;
  else if (reason.length > MAX_CANCEL_REASON) errors.reason = SETTLEMENT_TEXTS.reasonTooLong;
  const bestaetigt = form.acknowledgePaid === true;
  if (paid && !bestaetigt) errors.acknowledgePaid = SETTLEMENT_TEXTS.ackRequired;
  return ergebnis(errors, { reason, acknowledgePaid: paid ? bestaetigt : false });
}

const AKTION_TEXTE = Object.freeze({
  CREDIT_NOTE_NOT_FOUND: "Die Gutschrift wurde nicht gefunden. Es wurde nichts geändert.",
  CREDIT_NOTE_NOT_PAYABLE: "Diese Gutschrift kann nicht als ausgezahlt markiert werden. Es wurde nichts geändert.",
  CREDIT_NOTE_CANCELLED: "Die Gutschrift ist storniert. Es wurde nichts geändert.",
  CREDIT_NOTE_ALREADY_PAID: "Die Gutschrift ist bereits als ausgezahlt markiert. Es wurde nichts geändert.",
  CREDIT_NOTES_DISABLED: "Die Ausstellung von Gutschriften ist deaktiviert (SALES_PARTNER_CREDIT_NOTES_ENABLED). Es wurde nichts angelegt.",
  CREDIT_NOTE_NOT_CANCELLABLE: "Diese Gutschrift kann nicht storniert werden. Es wurde nichts angelegt.",
  CREDIT_NOTE_ALREADY_CANCELLED: "Die Gutschrift ist bereits storniert. Es wurde nichts angelegt.",
  CREDIT_NOTE_PAID_ACK_REQUIRED: "Die Gutschrift ist bereits ausgezahlt. Bitte bestätigen Sie ausdrücklich, dass das Storno trotzdem angelegt werden soll.",
});
const FELD_FEHLER = Object.freeze({
  PAID_ON_INVALID: ["paidOn", "Das Auszahlungsdatum ist ungültig oder liegt in der Zukunft."],
  PAYMENT_REFERENCE_INVALID: ["reference", "Die Referenz ist ungültig (höchstens 100 Zeichen)."],
  REASON_REQUIRED: ["reason", SETTLEMENT_TEXTS.reasonRequired],
});

/** Fehlerantwort von Auszahlung/Storno → { text, fieldErrors, needsAck, reload }. */
export function creditNoteActionOutcome(status, body) {
  const code = codeOf(body);
  if (status === 400 && own(FELD_FEHLER, code)) {
    const [feld, text] = FELD_FEHLER[code];
    return { text, fieldErrors: { [feld]: text }, needsAck: false, reload: false };
  }
  if (status === 422 && code === "CREDIT_NOTE_BLOCKED") {
    const gruende = blockerLabels(objOrNull(body)?.blockers);
    return { text: `Die Aktion ist blockiert${gruende.length ? `: ${gruende.join(", ")}` : ""}. Es wurde nichts angelegt.`,
      fieldErrors: {}, needsAck: false, reload: false };
  }
  if (status === 409 && code === "CREDIT_NOTE_PAID_ACK_REQUIRED") {
    return { text: AKTION_TEXTE[code], fieldErrors: {}, needsAck: true, reload: false };
  }
  if ((status === 409 || status === 404) && own(AKTION_TEXTE, code)) {
    // Der Stand hat sich bewegt (bezahlt, storniert, nicht mehr vorhanden) — neu laden.
    return { text: AKTION_TEXTE[code], fieldErrors: {}, needsAck: false, reload: code !== "CREDIT_NOTES_DISABLED" };
  }
  return { text: adminActionErrorText(status, body), fieldErrors: {}, needsAck: false, reload: false };
}

/** Rückmeldung nach „Dokument erneut erzeugen". */
export function regenerateResultText(body) {
  const d = objOrNull(body) || {};
  const [, label] = documentStatusMeta(d.documentStatus);
  const teile = [`Ergebnis: ${label}.`];
  if (d.notified === true) teile.push("Der Vertriebspartner wurde benachrichtigt.");
  else if (d.notified === false) teile.push("Der Vertriebspartner wurde nicht benachrichtigt.");
  return teile.join(" ");
}

/** Rückmeldung nach einem Storno. */
export function cancelResultText(body) {
  const d = objOrNull(body) || {};
  const nummer = str(objOrNull(d.cancellation)?.number);
  const teile = [nummer ? `Das Storno ${nummer} wurde angelegt.` : "Das Storno wurde angelegt."];
  if (d.documentReady === false) teile.push("Das Dokument wird erstellt.");
  teile.push(SETTLEMENT_TEXTS.cancelHint);
  return teile.join(" ");
}
