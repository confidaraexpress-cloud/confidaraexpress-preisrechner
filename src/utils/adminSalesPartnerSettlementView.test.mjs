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
  RUN_TEXTS,
  buildIssueBody,
  canIssueRow,
  closedMonthOptions,
  issuableRows,
  issuanceOpen,
  issueAmountText,
  issueOutcome,
  issueSuccessText,
  normalizePreview,
  previewErrorText,
  previewPartnerName,
  previousMonth,
  runStatusMeta,
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
    // Bewusste Ankeränderung (UX-Paket 1): auch kein technischer Schaltername mehr im Label.
    assert.ok(label && !label.includes(code) && !/_[a-z]|[A-Z]{2,}_[A-Z]/.test(label),
      `${code}: kein deutsches Label (${label})`);
  }
  assert.equal(blockerLabel("issuance_disabled"), "Ausstellen ist derzeit abgeschaltet");
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
  // Bewusste Ankeränderung (UX-Paket 1): verständlich, ohne technischen Schalternamen.
  assert.equal(aus.text, "Das Ausstellen von Gutschriften ist derzeit abgeschaltet. Es wurde nichts angelegt.");
  assert.doesNotMatch(aus.text, /SALES_PARTNER|_ENABLED/);
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
  // UX-Paket 4: „Aktualisieren" lädt beide Karten neu (refreshKey); ihr Zustand
  // speist den Überblick (onState) — ohne zweiten Abruf, die IBAN bleibt in der Karte.
  assert.match(seite, /<SalesPartnerBillingDetailsCard partnerId=\{partnerId\} partnerName=\{partnerDisplayName\(p\)\} refreshKey=\{refreshKey\} onState=\{setBilling\} \/>/);
  assert.match(seite, /<SalesPartnerCreditNotesCard partnerId=\{partnerId\} refreshKey=\{refreshKey\} onState=\{setCreditNotes\} \/>/);

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

/* ══════════ Abrechnungslauf ═════════════════════════════════════════════ */

const VORSCHAU = {
  month: "2026-09", cutoffAt: "2026-10-03T22:00:00.000Z", issuanceEnabled: true, globalBlockers: [],
  partners: [
    { partnerUserId: 5, name: "Petra Partner", companyName: "Vertrieb Süd GmbH", entryCount: 12, netCents: 45000,
      taxCents: 8550, grossCents: 53550, taxStatus: "with_vat", taxRatePercent: "19.00", status: "issuable",
      blockers: [], fingerprint: "fp-5", existingCreditNote: null },
    { partnerUserId: "6", name: "Sam Sponsor", companyName: null, entryCount: 3, netCents: 9000, taxCents: null,
      grossCents: null, taxStatus: null, taxRatePercent: null, status: "blocked",
      blockers: ["billing_details_unconfirmed", "agreement_missing", "agreement_missing"], fingerprint: null, existingCreditNote: null },
    { partnerUserId: 7, name: "Tom Team", companyName: null, entryCount: 2, netCents: -1200, taxCents: null,
      grossCents: null, taxStatus: "with_vat", taxRatePercent: null, status: "carried_forward", blockers: [],
      fingerprint: null, existingCreditNote: null },
    { partnerUserId: 8, name: "Ida Issued", companyName: null, entryCount: 4, netCents: 2000, taxCents: 380,
      grossCents: 2380, taxStatus: "with_vat", taxRatePercent: "19.00", status: "already_issued", blockers: [],
      fingerprint: null, existingCreditNote: { id: 41, number: "GS-2026-0041" } },
  ],
};

test("12 — Monate: nur abgeschlossene, der Vormonat zuerst (reine Kalenderarithmetik)", () => {
  assert.equal(previousMonth("2026-01"), "2025-12");
  assert.equal(previousMonth("2026-10"), "2026-09");
  assert.equal(previousMonth("2026-13"), null);
  assert.deepEqual(closedMonthOptions("2026-01-15", 3).map((o) => o.value), ["2025-12", "2025-11", "2025-10"]);
  assert.equal(closedMonthOptions("2026-10-07", 1)[0].label, "September 2026");
  assert.equal(closedMonthOptions("2026-10-07").length, 24);
  assert.deepEqual(closedMonthOptions("kaputt"), []);
});

test("13 — Vorschau: Felder des Vertrags, Kennungen als Zahl, Blockiergründe ohne Wiederholung", () => {
  const v = normalizePreview(VORSCHAU);
  assert.equal(v.month, "2026-09");
  assert.equal(v.issuanceEnabled, true);
  assert.equal(v.partners.length, 4);
  assert.equal(v.partners[1].partnerUserId, 6);
  assert.deepEqual(v.partners[1].blockers, ["billing_details_unconfirmed", "agreement_missing"]);
  assert.deepEqual(v.partners[3].existingCreditNote, { id: 41, number: "GS-2026-0041" });
  assert.equal(previewPartnerName(v.partners[0]), "Vertrieb Süd GmbH");
  assert.equal(previewPartnerName(v.partners[1]), "Sam Sponsor");
  assert.equal(normalizePreview({ ...VORSCHAU, issuanceEnabled: "true" }).issuanceEnabled, false, "nur true schaltet frei");
  assert.equal(normalizePreview({ ...VORSCHAU, month: "2026-9" }).month, null);
  assert.deepEqual(normalizePreview(null).partners, []);
  assert.deepEqual(runStatusMeta("carried_forward"), ["badge-gray", "Wird vorgetragen"]);
  assert.equal(runStatusMeta("issuable")[1], "Ausstellbar");
  assert.equal(runStatusMeta("pending")[1], "Unbekannter Status");
});

test("14 — ausgestellt wird nur, was der Server freigibt — sonst fail-closed nicht", () => {
  const v = normalizePreview(VORSCHAU);
  assert.equal(issuanceOpen(v), true);
  assert.deepEqual(issuableRows(v).map((r) => r.partnerUserId), [5]);
  assert.deepEqual(buildIssueBody(v, v.partners[0]), { ok: true, body: { partnerUserId: 5, month: "2026-09", fingerprint: "fp-5" }, errors: {} });
  for (const row of v.partners.slice(1)) assert.equal(buildIssueBody(v, row).ok, false, `${row.status} ist nicht ausstellbar`);
  const aus = normalizePreview({ ...VORSCHAU, issuanceEnabled: false });
  assert.equal(issuanceOpen(aus), false);
  assert.deepEqual(issuableRows(aus), [], "abgeschaltet: nichts ausstellbar");
  const global = normalizePreview({ ...VORSCHAU, globalBlockers: ["issuer_config_incomplete"] });
  assert.deepEqual(issuableRows(global), [], "globaler Blockiergrund: nichts ausstellbar");
  const ohneFingerabdruck = normalizePreview({ ...VORSCHAU, partners: [{ ...VORSCHAU.partners[0], fingerprint: null }] });
  assert.equal(canIssueRow(ohneFingerabdruck, ohneFingerabdruck.partners[0]), false);
  const mitBlocker = normalizePreview({ ...VORSCHAU, partners: [{ ...VORSCHAU.partners[0], blockers: ["tax_rate_missing"] }] });
  assert.equal(canIssueRow(mitBlocker, mitBlocker.partners[0]), false);
});

test("15 — Ausstellen: veraltet hält an und lädt neu; ein offener Ausgang behauptet nichts", () => {
  const veraltet = issueOutcome(409, { code: "CREDIT_NOTE_PREVIEW_STALE", error: "x" });
  assert.deepEqual([veraltet.kind, veraltet.abort, veraltet.reload], ["stale", true, true]);
  assert.equal(veraltet.text, RUN_TEXTS.stale);
  assert.deepEqual([issueOutcome(409, { code: "CREDIT_NOTES_DISABLED" }).abort, issueOutcome(409, { code: "CREDIT_NOTES_DISABLED" }).reload], [true, true]);
  const schon = issueOutcome(409, { code: "CREDIT_NOTE_ALREADY_ISSUED", existing: { id: 41, number: "GS-2026-0041" } });
  assert.equal(schon.text, "Für diesen Monat besteht bereits die Gutschrift GS-2026-0041.");
  assert.equal(schon.abort, false, "die übrigen Partner laufen weiter");
  assert.equal(issueOutcome(409, { code: "CREDIT_NOTE_NOTHING_TO_ISSUE" }).abort, false);
  const blockiert = issueOutcome(422, { code: "CREDIT_NOTE_BLOCKED", blockers: ["billing_details_unconfirmed"] });
  assert.equal(blockiert.text, "Blockiert: Abrechnungsdaten nicht bestätigt.");
  assert.equal(issueOutcome(400, { code: "PERIOD_NOT_CLOSED" }).abort, true);
  assert.equal(issueOutcome(400, { code: "PARTNER_INVALID" }).abort, false);
  assert.equal(issueOutcome(404, { code: "PARTNER_NOT_FOUND" }).text, "Der Vertriebspartner wurde nicht gefunden.");
  const fuenf = issueOutcome(502, { error: "Bad Gateway" });
  assert.deepEqual([fuenf.abort, fuenf.reload], [true, true]);
  assert.doesNotMatch(fuenf.text, /nicht ausgestellt|Bad Gateway/, "ein offener Ausgang wird nicht als „nicht ausgestellt“ behauptet");
  assert.doesNotMatch(fuenf.text, /Server/, "kein Technikbegriff im sichtbaren Text (UX-Paket 1)");
  for (const code of ["CREDIT_NOTE_PREVIEW_STALE", "CREDIT_NOTE_BLOCKED", "PERIOD_NOT_CLOSED"]) {
    assert.doesNotMatch(issueOutcome(code === "CREDIT_NOTE_BLOCKED" ? 422 : code === "PERIOD_NOT_CLOSED" ? 400 : 409, { code }).text,
      new RegExp(code), "kein Rohcode");
  }
});

test("16 — Rückmeldungen der Vorschau und des Ausstellens", () => {
  assert.equal(previewErrorText(400, { code: "PERIOD_NOT_CLOSED" }),
    "Dieser Monat ist noch nicht abgeschlossen. Abgerechnet werden nur abgeschlossene Monate.");
  assert.equal(previewErrorText(400, { code: "PERIOD_INVALID" }), "Bitte wählen Sie einen gültigen, abgeschlossenen Monat.");
  assert.equal(previewErrorText(500, {}), RUN_TEXTS.previewError);
  assert.equal(issueSuccessText({ creditNote: { number: "GS-2026-0042" }, documentReady: true, notified: true }),
    "Gutschrift GS-2026-0042 ausgestellt. Der Vertriebspartner wurde benachrichtigt.");
  assert.equal(issueSuccessText({ creditNote: {}, documentReady: false, notified: false }),
    "Gutschrift ausgestellt. Das Dokument wird erstellt. Der Vertriebspartner wurde noch nicht benachrichtigt.");
});

test("17 — Abrechnungslauf: Route vor '/:id', Eintrag „Gutschriften“ in der Teilnavigation, nacheinander statt parallel", () => {
  const app = ohneKommentare(read("App.jsx"));
  const statisch = app.indexOf('path="/admin/partners/credit-notes"');
  assert.ok(statisch > 0 && statisch < app.indexOf('path="/admin/partners/:id"'), "statische Unterseite vor '/:id'");
  assert.match(app, /const AdminSalesPartnerCreditNotesPage = React\.lazy\(\(\) => import\("\.\/pages\/admin\/AdminSalesPartnerCreditNotesPage"\)\);/);
  // UX-Paket 2 (bewusste Ankeränderung): der Weg zum Abrechnungslauf ist kein
  // Kopfbutton der Liste mehr, sondern der Eintrag „Gutschriften" der
  // Teilnavigation — mit derselben Id, auf der Liste und auf jeder Unterseite.
  const navi = ohneKommentare(read("components/admin/SalesPartnerAdminNav.jsx"));
  assert.match(navi, /\{ to: "\/admin\/partners\/credit-notes", label: "Gutschriften", id: "adm-sp-credit-notes-link" \}/);
  const liste = ohneKommentare(read("pages/admin/AdminSalesPartnersPage.jsx"));
  assert.match(liste, /<SalesPartnerAdminNav prelive=\{prelive\} \/>/);

  const seite = ohneKommentare(read("pages/admin/AdminSalesPartnerCreditNotesPage.jsx"));
  assert.match(seite, /for \(let i = 0; i < zeilen\.length; i \+= 1\) \{\s*const folge = await ausstellenZeile\(preview, zeilen\[i\]\);/,
    "je Partner einzeln und nacheinander");
  assert.doesNotMatch(seite, /Promise\.all|Promise\.allSettled/, "nie parallel");
  assert.match(seite, /const gebaut = buildIssueBody\(preview, row\);/);
  assert.match(seite, /if \(folge\.abort\) \{\s*abbruch = folge;/);
  // Pre-Live-Testlauf (bewusste Ankeränderung): neu geladen wird im Bereich,
  // mit dem die Vorschau geladen wurde — nie im inzwischen umgestellten.
  assert.match(seite, /await laden\(preview\.month, preview\.scope\);/);
  assert.match(seite, /closedMonthOptions\(localIsoDate\(\), 24\)/);
  assert.doesNotMatch(seite, /\bfetch\(|apiFetch|dangerouslySetInnerHTML/);
  // Genau EIN Dialog (keine unnötigen Modals) — er bestätigt seit UX-Paket 1
  // (Betreiberentscheidung) den Sammellauf UND jede Einzelausstellung: auch EINE
  // Gutschrift wird erst nach bewusster Bestätigung ausgestellt.
  assert.equal((seite.match(/<ConfirmDialog/g) || []).length, 1);
  assert.match(seite, /onClick=\{\(\) => \{ setMessage\(null\); setBestaetigen\(\{ art: "einzeln", row \}\); \}\}/,
    "der Zeilenknopf öffnet die Bestätigung, er stellt nicht selbst aus");
  assert.doesNotMatch(seite, /onClick=\{\(\) => einzeln\(row\)\}/, "Einzelausstellen ohne Bestätigung ist zurück");
  assert.match(seite, /onConfirm=\{einzelZeile \? \(\) => einzeln\(einzelZeile\) : alle\}/);
  assert.match(seite, /confirmId=\{einzelZeile \? "adm-cn-issue-confirm" : "adm-cn-issue-all-confirm"\}/);
  assert.match(seite, /const einzeln = async \(row\) => \{\s*setBestaetigen\(null\);\s*const preview = vorschau\.data;\s*if \(!preview \|\| inFlight\.current\) return;/,
    "Doppelausstellung: der Dialog schließt, ein laufender Vorgang sperrt jeden weiteren");

  const api = ohneKommentare(read("api/adminApi.js"));
  assert.match(api, /apiFetch\(`\/admin\/sales-partner-credit-notes\/preview\$\{buildQuery\(query, CREDIT_NOTE_PREVIEW_PARAMS\)\}`, \{ auth: true \}\)/);
  assert.match(api, /apiFetch\("\/admin\/sales-partner-credit-notes", \{\s*method: "POST", auth: true, body: JSON\.stringify\(body\)/);
});

test("17b — Bestätigung der Einzelausstellung: Betrag nur aus Serverwerten, klare Texte (UX-Paket 1)", () => {
  const vorschau = normalizePreview({ month: "2026-09", issuanceEnabled: true, globalBlockers: [], partners: [
    { partnerUserId: 5, name: "Petra", companyName: "Vertrieb 5 GmbH", status: "issuable", blockers: [], fingerprint: "fp-5",
      netCents: 10000, taxCents: 1900, grossCents: 11900 },
    { partnerUserId: 6, status: "issuable", blockers: [], fingerprint: "fp-6", netCents: 2500, taxCents: null, grossCents: null },
    { partnerUserId: 7, status: "issuable", blockers: [], fingerprint: "fp-7" },
  ] });
  assert.match(issueAmountText(vorschau.partners[0]), /^119,00\s€ \(100,00\s€ netto \+ 19,00\s€ Steuer\)$/);
  assert.match(issueAmountText(vorschau.partners[1]), /^25,00\s€ netto$/);
  assert.equal(issueAmountText(vorschau.partners[2]), null, "ohne Beträge kein erfundener Betrag");
  assert.equal(issueAmountText(null), null);
  assert.equal(RUN_TEXTS.singleTitle, "Gutschrift ausstellen");
  assert.equal(RUN_TEXTS.singleConfirm, "Gutschrift ausstellen");
  assert.equal(RUN_TEXTS.singleTitleTest, "Testgutschrift ausstellen");
  assert.match(RUN_TEXTS.singleText, /nur durch ein Storno korrigieren/);
  assert.equal(RUN_TEXTS.issuanceDisabled, "Das Ausstellen von Gutschriften ist derzeit abgeschaltet.");
  for (const t of Object.values(RUN_TEXTS)) assert.doesNotMatch(t, /SALES_PARTNER|_ENABLED|Server/, `Technik im Text: ${t}`);
});

/* ══════════ Pre-Live: Testlauf ═══════════════════════════════════════════ */

test("Pre-Live — Testlauf: scope der geladenen Vorschau, scope im Body nur im Testlauf", () => {
  const roh = { month: "2026-09", issuanceEnabled: true, globalBlockers: [], partners: [
    { partnerUserId: 41, name: "Pia Test", status: "issuable", blockers: [], fingerprint: "fp-41", netCents: 1000 }] };
  const test = normalizePreview(roh, { scope: "test" });
  const regulaer = normalizePreview(roh);
  assert.equal(test.scope, "test");
  assert.equal(regulaer.scope, null);
  assert.equal(normalizePreview(roh, { scope: "TEST" }).scope, null, "nur genau „test“");
  assert.deepEqual(buildIssueBody(test, test.partners[0]).body, { partnerUserId: 41, month: "2026-09", fingerprint: "fp-41", scope: "test" });
  assert.deepEqual(buildIssueBody(regulaer, regulaer.partners[0]).body, { partnerUserId: 41, month: "2026-09", fingerprint: "fp-41" });
  assert.equal(RUN_TEXTS.testScopeNote, "Testgutschriften (CE-TEST-PG …) – nicht steuerlich gültig, keine E-Mail, keine Auszahlung");
});

test("Pre-Live — neue Fehlercodes des Laufs und der Belegaktionen", () => {
  assert.equal(previewErrorText(409, { code: "PRELIVE_TEST_MODE_DISABLED" }), RUN_TEXTS.testModeDisabled);
  assert.equal(previewErrorText(404, { code: "PRELIVE_TEST_MODE_DISABLED" }), RUN_TEXTS.testModeDisabled);
  const aus = issueOutcome(409, { code: "PRELIVE_TEST_MODE_DISABLED", error: "x" });
  assert.deepEqual([aus.kind, aus.abort, aus.reload], ["testModeDisabled", true, false], "Modus aus: Lauf anhalten");
  const nichtTest = issueOutcome(409, { code: "PARTNER_NOT_TEST", error: "x" });
  assert.deepEqual([nichtTest.text, nichtTest.abort, nichtTest.reload], [RUN_TEXTS.partnerNotTest, false, true]);
  const istTest = issueOutcome(409, { code: "PARTNER_IS_TEST", error: "x" });
  assert.deepEqual([istTest.text, istTest.abort], [RUN_TEXTS.partnerIsTest, false]);
  const aktion = creditNoteActionOutcome(409, { code: "PRELIVE_TEST_MODE_DISABLED", error: "x" });
  assert.match(aktion.text, /Pre-Live-Testmodus ist nicht aktiv/);
  assert.equal(aktion.reload, false, "ein Schalter bewegt keinen Stand");
  for (const t of [RUN_TEXTS.partnerNotTest, RUN_TEXTS.partnerIsTest, aktion.text]) {
    assert.doesNotMatch(t, /PARTNER_|PRELIVE_/, "kein Rohcode im Text");
  }
});
