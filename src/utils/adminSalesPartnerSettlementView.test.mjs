// Admin · Abrechnungsdaten und Gutschriften der Vertriebspartner — Blockier-
// gründe, Prüfung der Abrechnungsdaten (Token submittedAt), Aktionen je
// Gutschrift (Auszahlung, Storno mit ausdrücklicher Bestätigung, Dokument),
// Fehlerabbildung und Verdrahtung der Karten im Partnerdetail.
//
// Run: node --test src/utils/adminSalesPartnerSettlementView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  BLOCKER_CODES,
  MAX_BILLING_REJECT_NOTE,
  MAX_CANCEL_REASON,
  SETTLEMENT_TEXTS,
  adminBillingRows,
  billingReviewOutcome,
  billingReviewSuccessText,
  billingReviewable,
  blockerLabel,
  blockerLabels,
  buildBillingConfirmBody,
  buildBillingRejectBody,
  buildCancelBody,
  buildPayoutBody,
  canCancel,
  canDownloadAdmin,
  canMarkPaid,
  canRegenerate,
  cancelResultText,
  creditNoteActionOutcome,
  documentStatusMeta,
  missingFieldsText,
  normalizeAdminBilling,
  normalizeAdminCreditNotes,
  notificationText,
  regenerateResultText,
} from "./adminSalesPartnerSettlementView.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..");
const read = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");

const IBAN = "DE89370400440532013000";
const BILLING = {
  status: "submitted", accountEmail: "petra@partner-vertrieb.de", missingFields: [],
  billingDetails: {
    billingName: "Vertrieb Süd GmbH", street: "Musterweg 1", postalCode: "10115", city: "Berlin", country: "DE",
    taxStatus: "with_vat", taxNumber: "12/345/67890", vatId: null, accountHolder: "Vertrieb Süd GmbH",
    ibanMasked: "DE89 **** **** **** **30 00", iban: IBAN, bic: "COBADEFFXXX",
    submittedAt: "2026-10-07T09:00:00.000Z", reviewedAt: null, reviewNote: null,
  },
};
const GS = {
  id: 11, number: "GS-2026-0001", kind: "regular", title: "Gutschrift", periodMonth: "2026-09",
  issuedAt: "2026-10-02T08:00:00.000Z", issuedOn: "2026-10-02", netCents: 10000, taxCents: 1900, grossCents: 11900,
  taxRatePercent: "19.00", currency: "EUR", documentReady: true, payoutStatus: "open", paidOn: null,
  cancelled: false, cancelledByNumber: null, correctsNumber: null, replacesNumber: null,
  documentStatus: "ready", notifiedAt: "2026-10-02T08:01:00.000Z", paidReference: null, issuedByName: "Anna Admin",
  cancellationReason: null,
};
const cn = (extra) => normalizeAdminCreditNotes({ creditNotes: [{ ...GS, ...extra }] }).creditNotes[0];

/* ══════════ Blockiergründe ══════════════════════════════════════════════ */

test("1 — jeder Blockiergrund hat ein deutsches Label; Unbekanntes erscheint nie roh", () => {
  assert.deepEqual([...BLOCKER_CODES].sort(), [
    "agreement_missing", "billing_details_missing", "billing_details_unconfirmed", "cancellation_title_missing",
    "credit_note_title_missing", "issuance_disabled", "issuer_config_incomplete", "tax_note_missing",
    "tax_rate_missing", "tax_status_not_enabled",
  ]);
  for (const code of BLOCKER_CODES) {
    const label = blockerLabel(code);
    assert.ok(label && !label.includes(code) && !/_[a-z]/.test(label.replace("SALES_PARTNER_CREDIT_NOTES_ENABLED", "")),
      `${code}: kein deutsches Label (${label})`);
  }
  assert.equal(blockerLabel("issuance_disabled"), "Ausstellung ist deaktiviert (SALES_PARTNER_CREDIT_NOTES_ENABLED)");
  for (const roh of ["vat_magic", "constructor", "__proto__", "", null]) {
    assert.equal(blockerLabel(roh), "Unbekannter Blockiergrund");
  }
  assert.deepEqual(blockerLabels(["tax_rate_missing", "tax_rate_missing", "x_y", "z_w", 7]),
    ["Steuersatz fehlt", "Unbekannter Blockiergrund"]);
});

/* ══════════ Abrechnungsdaten ════════════════════════════════════════════ */

test("2 — Admin sieht die vollständige IBAN in Vierergruppen; fehlende Angaben sind markiert", () => {
  const state = normalizeAdminBilling({ ...BILLING, missingFields: ["vatId", "bic", "irgendwas"] });
  const zeilen = Object.fromEntries(adminBillingRows(state).map((z) => [z.key, z]));
  assert.equal(zeilen.iban.value, "DE89 3704 0044 0532 0130 00");
  assert.equal(zeilen.iban.mono, true);
  assert.equal(zeilen.country.value, "Deutschland");
  assert.equal(zeilen.taxStatus.value, "Mit Umsatzsteuerausweis");
  assert.equal(zeilen.vatId.missing, true);
  assert.equal(zeilen.vatId.value, null);
  assert.equal(zeilen.billingName.missing, false);
  assert.equal(missingFieldsText(state.missingFields), "Es fehlen: USt-IdNr., BIC, Weitere Angabe.");
  assert.equal(missingFieldsText([]), null);
  // Ohne vollständige IBAN bleibt es bei der Maske.
  const maske = normalizeAdminBilling({ ...BILLING, billingDetails: { ...BILLING.billingDetails, iban: null } });
  assert.equal(Object.fromEntries(adminBillingRows(maske).map((z) => [z.key, z])).iban.value, "DE89 **** **** **** **30 00");
});

test("3 — Bestätigen/Ablehnen nur für eine Einreichung; der Einreichungszeitpunkt ist das Token", () => {
  const state = normalizeAdminBilling(BILLING);
  assert.equal(billingReviewable(state), true);
  for (const status of ["incomplete", "confirmed", "rejected", "unknown"]) {
    assert.equal(billingReviewable({ ...state, status }), false, `${status} ist nicht prüfbar`);
  }
  assert.equal(billingReviewable({ ...state, billingDetails: { ...state.billingDetails, submittedAt: null } }), false);
  assert.deepEqual(buildBillingConfirmBody(state), { ok: true, body: { submittedAt: "2026-10-07T09:00:00.000Z" }, errors: {} });
  assert.equal(buildBillingConfirmBody({ billingDetails: null }).ok, false);

  const ohne = buildBillingRejectBody(state, { note: "  " });
  assert.equal(ohne.ok, false);
  assert.equal(ohne.errors.note, SETTLEMENT_TEXTS.noteRequired);
  assert.equal(buildBillingRejectBody(state, { note: "x".repeat(MAX_BILLING_REJECT_NOTE + 1) }).errors.note, SETTLEMENT_TEXTS.noteTooLong);
  assert.deepEqual(buildBillingRejectBody(state, { note: " Steuernummer prüfen " }).body,
    { submittedAt: "2026-10-07T09:00:00.000Z", note: "Steuernummer prüfen" });
});

test("4 — Prüfung: 409 lädt neu, unvollständig nennt die Felder, 400 REASON_REQUIRED steht am Feld", () => {
  const geaendert = billingReviewOutcome(409, { code: "BILLING_DETAILS_CHANGED", error: "x" });
  assert.equal(geaendert.reload, true);
  assert.match(geaendert.text, /inzwischen neu eingereicht/);
  assert.equal(billingReviewOutcome(409, { code: "BILLING_DETAILS_MISSING" }).reload, true);
  const unvollstaendig = billingReviewOutcome(409, { code: "BILLING_DETAILS_INCOMPLETE", missingFields: ["iban", "street"] });
  assert.equal(unvollstaendig.reload, true);
  assert.match(unvollstaendig.text, /Es fehlen: IBAN, Straße und Hausnummer\./);
  const grund = billingReviewOutcome(400, { code: "REASON_REQUIRED", field: "note" });
  assert.deepEqual(grund.fieldErrors, { note: SETTLEMENT_TEXTS.noteRequired });
  assert.equal(grund.reload, false);
  assert.doesNotMatch(billingReviewOutcome(500, { error: "TypeError: boom" }).text, /TypeError/);
  assert.equal(billingReviewSuccessText("confirm", { status: "confirmed", noOp: true }),
    "Die Abrechnungsdaten waren bereits bestätigt. Es wurde nichts geändert.");
  assert.equal(billingReviewSuccessText("confirm", { status: "confirmed" }), "Die Abrechnungsdaten wurden bestätigt.");
});

/* ══════════ Gutschriften ════════════════════════════════════════════════ */

test("5 — Dokument- und Benachrichtigungsstand: deutsche Labels, nie ein Rohwert", () => {
  assert.deepEqual(documentStatusMeta("pending_document"), ["badge-gray", "Dokument ausstehend"]);
  assert.deepEqual(documentStatusMeta("failed"), ["badge-red", "Dokument fehlgeschlagen"]);
  assert.equal(documentStatusMeta("queued")[1], "Unbekannter Status");
  assert.match(notificationText(cn({})), /^Benachrichtigt am \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2}$/);
  assert.equal(notificationText(cn({ notifiedAt: null })), "Noch nicht benachrichtigt");
  const admin = cn({});
  assert.equal(admin.issuedByName, "Anna Admin", "die Adminansicht übernimmt die Adminfelder");
});

test("6 — welche Aktion eine Gutschrift anbietet", () => {
  assert.equal(canMarkPaid(cn({})), true);
  assert.equal(canMarkPaid(cn({ payoutStatus: "paid", paidOn: "2026-10-04" })), false);
  assert.equal(canMarkPaid(cn({ cancelled: true })), false);
  assert.equal(canMarkPaid(cn({ kind: "cancellation", payoutStatus: null })), false);
  assert.equal(canCancel(cn({})), true);
  assert.equal(canCancel(cn({ payoutStatus: "paid" })), true, "auch eine ausgezahlte Gutschrift ist stornierbar");
  assert.equal(canCancel(cn({ cancelled: true })), false);
  assert.equal(canCancel(cn({ kind: "cancellation" })), false, "kein Storno eines Stornos");
  // Dokument erneut erzeugen: nicht bereit ODER noch nicht benachrichtigt.
  assert.equal(canRegenerate(cn({})), false);
  assert.equal(canRegenerate(cn({ documentStatus: "failed" })), true);
  assert.equal(canRegenerate(cn({ documentStatus: "pending_document", documentReady: false })), true);
  assert.equal(canRegenerate(cn({ notifiedAt: null })), true);
  assert.equal(canRegenerate(cn({ kind: "cancellation", notifiedAt: null })), true);
  assert.equal(canDownloadAdmin(cn({})), true);
  assert.equal(canDownloadAdmin(cn({ documentReady: false, documentStatus: "generating" })), false);
  assert.equal(canMarkPaid(cn({ id: null })), false, "ohne Kennung keine Aktion");
});

test("7 — Auszahlung: Datum Pflicht und nicht in der Zukunft, Referenz optional (≤ 100)", () => {
  const heute = "2026-10-07";
  assert.equal(buildPayoutBody({}, { today: heute }).errors.paidOn, SETTLEMENT_TEXTS.paidOnRequired);
  assert.equal(buildPayoutBody({ paidOn: "2026-02-30" }, { today: heute }).errors.paidOn, SETTLEMENT_TEXTS.paidOnInvalid);
  assert.equal(buildPayoutBody({ paidOn: "2026-10-08" }, { today: heute }).errors.paidOn, SETTLEMENT_TEXTS.paidOnFuture);
  assert.deepEqual(buildPayoutBody({ paidOn: "2026-10-07", reference: "  " }, { today: heute }).body, { paidOn: "2026-10-07" });
  assert.deepEqual(buildPayoutBody({ paidOn: "2026-10-05", reference: " SEPA-4711 " }, { today: heute }).body,
    { paidOn: "2026-10-05", reference: "SEPA-4711" });
  assert.equal(buildPayoutBody({ paidOn: "2026-10-05", reference: "x".repeat(101) }, { today: heute }).errors.reference,
    SETTLEMENT_TEXTS.referenceTooLong);
});

test("8 — Storno: Grund Pflicht (≤ 200); bei Auszahlung die ausdrückliche Bestätigung; acknowledgePaid immer Boolean", () => {
  assert.equal(buildCancelBody({ reason: "" }).errors.reason, SETTLEMENT_TEXTS.reasonRequired);
  assert.equal(buildCancelBody({ reason: "x".repeat(MAX_CANCEL_REASON + 1) }).errors.reason, SETTLEMENT_TEXTS.reasonTooLong);
  assert.deepEqual(buildCancelBody({ reason: " Betrag falsch ", acknowledgePaid: true }).body,
    { reason: "Betrag falsch", acknowledgePaid: false }, "ohne Auszahlung keine Bestätigung im Body");
  const ohneBestaetigung = buildCancelBody({ reason: "Betrag falsch" }, { paid: true });
  assert.equal(ohneBestaetigung.ok, false);
  assert.equal(ohneBestaetigung.errors.acknowledgePaid, SETTLEMENT_TEXTS.ackRequired);
  assert.deepEqual(buildCancelBody({ reason: "Betrag falsch", acknowledgePaid: true }, { paid: true }).body,
    { reason: "Betrag falsch", acknowledgePaid: true });
  assert.equal(buildCancelBody({ reason: "x", acknowledgePaid: "true" }, { paid: true }).ok, false, "nur true bestätigt");
  assert.equal(SETTLEMENT_TEXTS.ackLabel, "Bereits ausgezahlt – Storno trotzdem anlegen");
});

test("9 — Fehler der Aktionen: Feld, Blockiergründe, Bestätigung oder Neuladen — nie ein Rohcode", () => {
  assert.deepEqual(creditNoteActionOutcome(400, { code: "PAID_ON_INVALID" }).fieldErrors.paidOn !== undefined, true);
  assert.ok(creditNoteActionOutcome(400, { code: "PAYMENT_REFERENCE_INVALID" }).fieldErrors.reference);
  assert.ok(creditNoteActionOutcome(400, { code: "REASON_REQUIRED" }).fieldErrors.reason);
  const blockiert = creditNoteActionOutcome(422, { code: "CREDIT_NOTE_BLOCKED", blockers: ["cancellation_title_missing"] });
  assert.match(blockiert.text, /Belegtitel des Stornos nicht hinterlegt/);
  assert.doesNotMatch(blockiert.text, /cancellation_title_missing/);
  const ack = creditNoteActionOutcome(409, { code: "CREDIT_NOTE_PAID_ACK_REQUIRED" });
  assert.equal(ack.needsAck, true);
  assert.equal(ack.reload, false);
  for (const code of ["CREDIT_NOTE_ALREADY_PAID", "CREDIT_NOTE_CANCELLED", "CREDIT_NOTE_NOT_PAYABLE",
                      "CREDIT_NOTE_ALREADY_CANCELLED", "CREDIT_NOTE_NOT_CANCELLABLE"]) {
    const folge = creditNoteActionOutcome(409, { code, error: code });
    assert.equal(folge.reload, true, `${code}: der Stand hat sich bewegt`);
    assert.doesNotMatch(folge.text, new RegExp(code));
  }
  assert.equal(creditNoteActionOutcome(404, { code: "CREDIT_NOTE_NOT_FOUND" }).reload, true);
  const aus = creditNoteActionOutcome(409, { code: "CREDIT_NOTES_DISABLED" });
  assert.equal(aus.reload, false);
  assert.match(aus.text, /deaktiviert/);
  assert.doesNotMatch(creditNoteActionOutcome(500, { error: "TypeError" }).text, /TypeError/);
});

test("10 — Rückmeldungen: Storno mit Hinweis auf erneute Abrechnung, Dokumentergebnis", () => {
  assert.equal(cancelResultText({ cancellation: { number: "GS-2026-0002" }, documentReady: true, notified: true }),
    `Das Storno GS-2026-0002 wurde angelegt. ${SETTLEMENT_TEXTS.cancelHint}`);
  assert.match(cancelResultText({ cancellation: {}, documentReady: false }), /^Das Storno wurde angelegt\. Das Dokument wird erstellt\./);
  assert.equal(regenerateResultText({ documentStatus: "ready", notified: true }),
    "Ergebnis: Dokument bereit. Der Vertriebspartner wurde benachrichtigt.");
  assert.equal(regenerateResultText({ documentStatus: "failed", notified: false }),
    "Ergebnis: Dokument fehlgeschlagen. Der Vertriebspartner wurde nicht benachrichtigt.");
});

/* ══════════ Verdrahtung ═════════════════════════════════════════════════ */

test("11 — Partnerdetail: beide Karten, Bodies nur aus den Bausteinen, PDF als Blob-Abruf", () => {
  const seite = ohneKommentare(read("pages/admin/AdminSalesPartnerDetailPage.jsx"));
  assert.match(seite, /<SalesPartnerBillingDetailsCard partnerId=\{partnerId\} partnerName=\{partnerDisplayName\(p\)\} \/>/);
  assert.match(seite, /<SalesPartnerCreditNotesCard partnerId=\{partnerId\} \/>/);

  const daten = ohneKommentare(read("components/admin/SalesPartnerBillingDetailsCard.jsx"));
  assert.match(daten, /buildBillingConfirmBody\(data\)/);
  assert.match(daten, /buildBillingRejectBody\(data, \{ note: dialog\.note \}\)/);
  assert.match(daten, /billingReviewable\(data\) &&/);
  const karten = ohneKommentare(read("components/admin/SalesPartnerCreditNotesCard.jsx"));
  assert.match(karten, /buildPayoutBody\(dialog\.form, \{ today: heute \}\)/);
  assert.match(karten, /buildCancelBody\(dialog\.form, \{ paid: ausgezahlt \}\)/);
  assert.match(karten, /downloadDocument\(adminCreditNotePdfPath\(cn\.id\), \{/);
  assert.match(karten, /SETTLEMENT_TEXTS\.ackLabel/);
  for (const src of [daten, karten]) {
    assert.doesNotMatch(src, /\bfetch\(|apiFetch|dangerouslySetInnerHTML|href=/, "kein eigener Abruf, kein Link mit Token");
  }
  // Die vollständige IBAN steht ausschließlich in der Karte „Abrechnungsdaten“.
  const andere = readdirSync(path.join(SRC, "components/admin"))
    .filter((f) => f.startsWith("SalesPartner") && f !== "SalesPartnerBillingDetailsCard.jsx")
    .map((f) => `components/admin/${f}`)
    .concat(["pages/admin/AdminSalesPartnerDetailPage.jsx", "pages/admin/AdminSalesPartnersPage.jsx"]);
  for (const datei of andere) {
    assert.doesNotMatch(ohneKommentare(read(datei)), /iban|adminBillingRows|getAdminSalesPartnerBillingDetails/i,
      `${datei}: Bankdaten außerhalb der Karte „Abrechnungsdaten“`);
  }
  const api = ohneKommentare(read("api/adminApi.js"));
  assert.match(api, /export const adminCreditNotePdfPath = \(id\) => `\$\{creditNotePath\(id\)\}\/pdf`;/);
  assert.match(api, /`\$\{partnerPath\(id\)\}\/billing-details\/confirm`/);
  assert.match(api, /`\$\{partnerPath\(id\)\}\/billing-details\/reject`/);
});
