// Pre-Live-Testmodus (Admin) — Stand, Testkonten, Bodies (Allowlist +
// Vorabprüfung), Szenarien, Provisionslauf, E-Mail-Vorschau, Bereinigung,
// Fehlerabbildung.
//
// Run: node --test src/utils/salesPartnerPrelive.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  INPUT,
  MAIL_PREVIEW_KINDS,
  PRELIVE_DISABLED_STATUS,
  PRELIVE_TEXTS,
  blockerText,
  buildAbcScenarioBody,
  buildCleanupBody,
  buildLevelsScenarioBody,
  buildMailPreviewQuery,
  buildMarkPaidBody,
  buildTeamScenarioBody,
  buildTestCustomerBody,
  buildTestDispatchBody,
  buildTestPartnerBody,
  buildTestShipmentBody,
  canMarkShipmentPaid,
  canRecordDispatch,
  cleanupDeletable,
  cleanupOutcome,
  decisionOutcomeMeta,
  isTestCustomer,
  isTestPartner,
  normalizeCleanupDryRun,
  normalizeCommissionRun,
  normalizeMailPreview,
  normalizePasswordLink,
  normalizePreliveAccounts,
  normalizePreliveShipments,
  normalizePreliveStatus,
  paidText,
  parseNonNegativeEuroToCents,
  preliveCountRows,
  preliveEnabled,
  preliveErrorOutcome,
  presetValue,
  scenarioPresets,
  scenarioResult,
  shipmentBasisCents,
  shipmentBasisPreview,
  shipmentListQuery,
  skipReasonLabel,
  testAccountName,
  testPartnerNameById,
} from "./salesPartnerPrelive.mjs";

const TODAY = "2026-10-07";

/* ══════════ Stand und Testkonten ═══════════════════════════════════════ */

test("1 — Stand: nur ein ausdrückliches enabled:true schaltet den Bereich frei", () => {
  const an = normalizePreliveStatus({ enabled: true, mailAllowlistConfigured: true, backdatingGlobalAllowed: false,
    counts: { partners: 3, customers: 4, shipments: 12, ledgerEntries: 7, creditNotes: 1 } });
  assert.equal(preliveEnabled(an), true);
  assert.equal(an.mailAllowlistConfigured, true);
  assert.deepEqual(an.counts, { partners: 3, customers: 4, shipments: 12, ledgerEntries: 7, creditNotes: 1 });
  assert.deepEqual(preliveCountRows(an).map((r) => [r.label, r.value]), [
    ["Testpartner", "3"], ["Testkunden", "4"], ["Testsendungen", "12"], ["Provisionsbuchungen", "7"], ["Testgutschriften", "1"]]);
  for (const roh of [null, {}, { enabled: "true" }, { enabled: 1 }, { enabled: false }, []]) {
    assert.equal(preliveEnabled(normalizePreliveStatus(roh)), false, JSON.stringify(roh));
  }
  assert.equal(PRELIVE_DISABLED_STATUS.enabled, false);
  assert.equal(normalizePreliveStatus({ enabled: true, counts: null }).counts, null);
  assert.ok(preliveCountRows(normalizePreliveStatus({ enabled: true })).every((r) => r.value === "—"), "fehlende Zahlen nie 0");
  assert.equal(PRELIVE_TEXTS.pageWarning,
    "Pre-Live-Testmodus aktiv – nur für interne Tests. Testdaten sind gekennzeichnet und werden vor dem Livegang bereinigt.");
});

test("2 — Testkonten: ohne Kennung keine Zeile; Namen und Zugehörigkeit nur aus der Serverliste", () => {
  const a = normalizePreliveAccounts({
    partners: [{ id: 41, name: "Pia Test", email: "pia@test.example", companyName: "Test Vertrieb A", status: "active",
      loginStatus: "approved", sponsorUserId: null, referralCode: "TESTAB23" }, { name: "ohne Kennung" }, null],
    customers: [{ id: "77", name: null, companyName: "Testkunde GmbH", email: "kunde@test.example", partnerUserId: 41 }],
  });
  assert.equal(a.partners.length, 1);
  assert.equal(a.customers[0].id, 77, "Kennung als Zahl");
  assert.equal(testAccountName(a.partners[0]), "Test Vertrieb A");
  assert.equal(testAccountName({ id: 5 }, "Testpartner"), "Testpartner #5");
  assert.equal(testPartnerNameById(a.partners, "41"), "Test Vertrieb A");
  assert.equal(testPartnerNameById(a.partners, 99), null);
  assert.equal(isTestCustomer(a, 77), true);
  assert.equal(isTestCustomer(a, "77"), true);
  assert.equal(isTestCustomer(a, 78), false);
  assert.equal(isTestPartner(a, 41), true);
  assert.equal(isTestPartner(null, 41), false);
  assert.deepEqual(normalizePreliveAccounts(null), { partners: [], customers: [] });
});

/* ══════════ Bodies ══════════════════════════════════════════════════════ */

test("3 — Testpartner: Name und E-Mail Pflicht, Firma/Sponsor nur wenn angegeben", () => {
  assert.deepEqual(buildTestPartnerBody({ name: " Pia Test ", email: "pia@test.example", companyName: "", sponsorUserId: "" }).body,
    { name: "Pia Test", email: "pia@test.example" });
  assert.deepEqual(buildTestPartnerBody({ name: "Pia", email: "pia@test.example", companyName: "Test GmbH", sponsorUserId: "41" }).body,
    { name: "Pia", email: "pia@test.example", companyName: "Test GmbH", sponsorUserId: 41 });
  const leer = buildTestPartnerBody({});
  assert.deepEqual(Object.keys(leer.errors).sort(), ["email", "name"]);
  assert.equal(leer.errors.email, INPUT.emailInvalid);
  assert.equal(buildTestPartnerBody({ name: "x", email: "kein-at" }).errors.email, INPUT.emailInvalid);
  assert.equal(buildTestPartnerBody({ name: "x", email: "a@b.de", sponsorUserId: "abc" }).errors.sponsorUserId, INPUT.sponsorInvalid);
  assert.equal(buildTestPartnerBody({ name: "x".repeat(201), email: "a@b.de" }).errors.name, INPUT.textTooLong);
});

test("4 — Testkunde: Firma und E-Mail Pflicht; Zuordnung über Partner ODER Code; Datum darf zurückliegen", () => {
  assert.deepEqual(buildTestCustomerBody({ companyName: "Testkunde GmbH", email: "k@test.example", assignment: "none",
    partnerUserId: "41", assignedSince: "2026-01-01" }).body, { companyName: "Testkunde GmbH", email: "k@test.example" },
    "ohne Zuordnung weder Partner noch Datum");
  assert.deepEqual(buildTestCustomerBody({ companyName: "Testkunde GmbH", email: "k@test.example", name: "Kai",
    assignment: "partner", partnerUserId: "41", assignedSince: "2026-03-01" }).body,
  { companyName: "Testkunde GmbH", email: "k@test.example", name: "Kai", partnerUserId: 41, assignedSince: "2026-03-01" });
  assert.deepEqual(buildTestCustomerBody({ companyName: "T", email: "k@test.example", assignment: "code", referralCode: " testab23 " }).body,
    { companyName: "T", email: "k@test.example", referralCode: "TESTAB23" }, "Code normalisiert, Datum optional");
  assert.equal(buildTestCustomerBody({ companyName: "T", email: "k@test.example", assignment: "partner" }).errors.partnerUserId, INPUT.partnerRequired);
  assert.equal(buildTestCustomerBody({ companyName: "T", email: "k@test.example", assignment: "code", referralCode: "xy" }).errors.referralCode, INPUT.codeInvalid);
  assert.equal(buildTestCustomerBody({ companyName: "T", email: "k@test.example", assignment: "partner", partnerUserId: 41,
    assignedSince: "2026-02-30" }).errors.assignedSince, INPUT.dateInvalid);
  assert.deepEqual(Object.keys(buildTestCustomerBody({}).errors).sort(), ["companyName", "email"]);
  // Ein unbekannter Zuordnungsmodus fällt auf „ohne Zuordnung" zurück — nichts wird geraten.
  assert.deepEqual(buildTestCustomerBody({ companyName: "T", email: "k@test.example", assignment: "weird", partnerUserId: 41 }).body,
    { companyName: "T", email: "k@test.example" });
});

test("5 — Euro-Eingabe ≥ 0 in Cent; Basis = Kundennetto − Einkaufsnetto", () => {
  assert.deepEqual(parseNonNegativeEuroToCents("12,50"), { ok: true, value: 1250 });
  assert.deepEqual(parseNonNegativeEuroToCents("0"), { ok: true, value: 0 }, "0 ist ein gültiger Betrag");
  assert.deepEqual(parseNonNegativeEuroToCents(" 7.5 "), { ok: true, value: 750 });
  for (const falsch of ["", "-1", "1.234,56", "12,345", "abc", "1e3"]) {
    assert.equal(parseNonNegativeEuroToCents(falsch).ok, false, `durchgelassen: ${falsch}`);
  }
  assert.equal(shipmentBasisCents(1500, 1000), 500);
  assert.equal(shipmentBasisCents(800, 1000), -200, "eine negative Basis bleibt sichtbar negativ");
  assert.equal(shipmentBasisCents(null, 1000), null);
  assert.match(shipmentBasisPreview({ customerNet: "15", purchaseNet: "10,50" }), /^4,50\s€$/);
  assert.equal(shipmentBasisPreview({ customerNet: "15", purchaseNet: "" }), null);
});

test("6 — Testsendung: Vertragsfelder in Cent, dispatched nur als true, paidOn nur mit Datum", () => {
  const ok = buildTestShipmentBody({ customerUserId: "77", shipDate: "2026-09-15", packageCount: "3",
    customerNet: "25,00", purchaseNet: "18,40", dispatched: true, paidOn: "2026-09-20" });
  assert.deepEqual(ok.body, { customerUserId: 77, shipDate: "2026-09-15", packageCount: 3, customerNetCents: 2500,
    purchaseNetCents: 1840, dispatched: true, paidOn: "2026-09-20" });
  const schlicht = buildTestShipmentBody({ customerUserId: 77, shipDate: "2026-09-15", packageCount: "1",
    customerNet: "10", purchaseNet: "0", dispatched: "true", paidOn: "" });
  assert.deepEqual(schlicht.body, { customerUserId: 77, shipDate: "2026-09-15", packageCount: 1, customerNetCents: 1000, purchaseNetCents: 0 },
    "kein truthy-String für dispatched, kein leeres paidOn");
  const kaputt = buildTestShipmentBody({ customerUserId: "", shipDate: "15.09.2026", packageCount: "0", customerNet: "-1", purchaseNet: "", paidOn: "x" });
  assert.deepEqual(Object.keys(kaputt.errors).sort(), ["customerNet", "customerUserId", "packageCount", "paidOn", "purchaseNet", "shipDate"]);
  assert.equal(buildTestShipmentBody({ customerUserId: 7, shipDate: "2026-09-15", packageCount: "10000", customerNet: "1", purchaseNet: "1" })
    .errors.packageCount, INPUT.packagesInvalid);
});

test("7 — bezahlt und Versandnachweis: Datum Pflicht, nicht in der Zukunft; Nachweis exakt im Vertragsformat", () => {
  assert.deepEqual(buildMarkPaidBody({ paidOn: "2026-10-01" }, { today: TODAY }).body, { paidOn: "2026-10-01" });
  assert.equal(buildMarkPaidBody({ paidOn: "2026-10-08" }, { today: TODAY }).errors.paidOn, INPUT.dateInFuture);
  assert.equal(buildMarkPaidBody({}, { today: TODAY }).errors.paidOn, INPUT.dateRequired);
  assert.deepEqual(buildTestDispatchBody({ dispatchDate: "2026-09-16" }, { today: TODAY }).body,
    { status: "dispatched", dispatchDate: "2026-09-16", evidenceType: "other", note: "Pre-Live-Test" });
  assert.equal(buildTestDispatchBody({ dispatchDate: "2026-10-09" }, { today: TODAY }).errors.dispatchDate, INPUT.dateInFuture);
});

test("8 — Sendungsliste: defensiv gelesen, Filter nur mit gültigen Kennungen", () => {
  const l = normalizePreliveShipments({ total: 2, items: [
    { id: 9001, reference: "CE-TEST-9001", customerUserId: 77, customerCompanyName: "Testkunde GmbH", partnerUserId: 41,
      shipDate: "2026-09-15", packageCount: 3, customerNetCents: 2500, purchaseNetCents: 1840, basisCents: 660,
      evidence: { status: "dispatched", dispatchDate: "2026-09-16" }, paidAt: null, decision: { outcome: "accrued" } },
    { reference: "ohne Kennung" },
  ] });
  assert.equal(l.items.length, 1);
  assert.equal(l.total, 2);
  const s = l.items[0];
  assert.equal(s.basisCents, 660);
  assert.equal(canRecordDispatch(s), false, "bereits versendet");
  assert.equal(canMarkShipmentPaid(s), true);
  assert.equal(paidText(s), "Offen");
  assert.equal(paidText({ paidAt: "2026-09-20" }), "Bezahlt am 20.09.2026");
  assert.deepEqual(decisionOutcomeMeta(s.decision), ["badge-green", "Provision gutgeschrieben"]);
  assert.deepEqual(decisionOutcomeMeta(null), ["badge-gray", "Noch keine Entscheidung"]);
  assert.equal(decisionOutcomeMeta({ outcome: "weird" })[1], "Unbekannter Status", "kein Rohwert");
  assert.equal(canRecordDispatch({ evidence: null }), true);
  assert.equal(canRecordDispatch({ evidence: { status: "unclear" } }), true);
  assert.deepEqual(shipmentListQuery({ customerUserId: "77", partnerUserId: "", page: 2 }), { limit: 25, offset: 25, customerUserId: 77 });
  assert.deepEqual(shipmentListQuery({ customerUserId: "x", partnerUserId: 41 }), { limit: 25, offset: 0, partnerUserId: 41 });
});

/* ══════════ Szenarien ═══════════════════════════════════════════════════ */

test("9 — Level-Szenario: Pflichtfelder, optionale Felder nur mit Wert", () => {
  assert.deepEqual(buildLevelsScenarioBody({ partnerUserId: "41", month: "2026-09", activeCustomers: "3", packages: "100" }).body,
    { kind: "levels", partnerUserId: 41, month: "2026-09", activeCustomers: 3, packages: 100 });
  assert.deepEqual(buildLevelsScenarioBody({ partnerUserId: 41, month: "2026-09", activeCustomers: "0", packages: "0",
    packagesPerShipment: "2", inactiveCustomers: "4" }).body,
  { kind: "levels", partnerUserId: 41, month: "2026-09", activeCustomers: 0, packages: 0, packagesPerShipment: 2, inactiveCustomers: 4 });
  const kaputt = buildLevelsScenarioBody({ partnerUserId: "", month: "2026-13", activeCustomers: "-1", packages: "x", packagesPerShipment: "0" });
  assert.deepEqual(Object.keys(kaputt.errors).sort(), ["activeCustomers", "month", "packages", "packagesPerShipment", "partnerUserId"]);
});

test("10 — A/B/C- und Team-Szenario", () => {
  assert.deepEqual(buildAbcScenarioBody({ activeSince: "2026-06-01" }).body, { kind: "abc", activeSince: "2026-06-01" });
  assert.deepEqual(buildAbcScenarioBody({ activeSince: "2026-06-01", packagesPerCustomer: "5" }).body,
    { kind: "abc", activeSince: "2026-06-01", packagesPerCustomer: 5 });
  assert.equal(buildAbcScenarioBody({}).errors.activeSince, INPUT.dateRequired);
  assert.deepEqual(buildTeamScenarioBody({ sponsorUserId: "41", count: "10", activeSince: "2026-05-01" }).body,
    { kind: "team", sponsorUserId: 41, count: 10, activeSince: "2026-05-01" });
  assert.deepEqual(Object.keys(buildTeamScenarioBody({ count: "0" }).errors).sort(), ["activeSince", "count", "sponsorUserId"]);
});

test("11 — Vorgaben aus Serverregeln: Level 1/3/5, knapp darunter/genau/knapp darüber", () => {
  const BONI = ["2.50", "5.00", "7.50", "10.00", "12.50"];
  const regeln = {
    customerLevels: [3, 6, 10, 15, 25].map((threshold, i) => ({ level: i + 1, threshold, bonusPercent: BONI[i] })),
    packageLevels: [100, 250, 500, 1000, 2000].map((threshold, i) => ({ level: i + 1, threshold, bonusPercent: BONI[i] })),
  };
  const p = scenarioPresets(regeln);
  assert.deepEqual(p.customer, [{ level: 1, threshold: 3 }, { level: 3, threshold: 10 }, { level: 5, threshold: 25 }]);
  assert.deepEqual(p.package.map((x) => x.threshold), [100, 500, 2000]);
  assert.equal(presetValue(10, -1), "9");
  assert.equal(presetValue(10, 0), "10");
  assert.equal(presetValue(10, 1), "11");
  assert.equal(presetValue(0, -1), "0", "nie negativ");
  assert.equal(presetValue(10, 7), "10", "nur bekannte Lagen");
  assert.equal(scenarioPresets(null), null, "ohne Serverregeln keine Vorgaben");
  assert.equal(scenarioPresets({ customerLevels: regeln.customerLevels, packageLevels: [] }), null);
});

test("12 — Szenario-Ergebnisse als deutscher Satz mit Links", () => {
  assert.equal(scenarioResult("levels", { created: { customers: 3, shipments: 9, packages: 100 } }).text,
    "Angelegt: 3 Kunden, 9 Sendungen, 100 Pakete.");
  assert.deepEqual(scenarioResult("abc", { partners: { a: 51, b: 52, c: "53" } }).links,
    [{ id: 51, label: "Partner A" }, { id: 52, label: "Partner B" }, { id: 53, label: "Partner C" }]);
  const team = scenarioResult("team", { partnerIds: [61, 62, "x"] });
  assert.equal(team.text, "Angelegt: 2 Teampartner.");
  assert.deepEqual(team.links.map((l) => l.id), [61, 62]);
});

/* ══════════ Provisionslauf, Vorschau, Bereinigung ══════════════════════ */

test("13 — Provisionslauf: skippedTick ist „gerade aktiv“; Gründe nie roh", () => {
  const r = normalizeCommissionRun({ stats: { skippedTick: false, assessments: 2, decided: 5, accrued: 4,
    skipped: { assessment_not_due: 1, ganz_neu: 2, null_wert: 0 }, failed: 0 } });
  assert.equal(r.busy, false);
  assert.deepEqual(r.rows.map((x) => x.value), ["2", "5", "4", "0"]);
  assert.deepEqual(r.skipped, [
    { code: "assessment_not_due", label: "Monatsbewertung noch nicht fällig", count: 1 },
    { code: "ganz_neu", label: "Sonstiger Grund", count: 2 },
  ]);
  assert.equal(normalizeCommissionRun({ stats: { skippedTick: true } }).busy, true);
  assert.equal(PRELIVE_TEXTS.commissionRunBusy, "Ein Lauf ist gerade aktiv – bitte erneut versuchen");
  assert.equal(skipReasonLabel("constructor"), "Sonstiger Grund");
  assert.deepEqual(normalizeCommissionRun(null).skipped, []);
});

test("14 — E-Mail-Vorschau: Abfrage nach Art; HTML nur als Zeichenkette für srcdoc", () => {
  assert.deepEqual(MAIL_PREVIEW_KINDS.map((k) => k.value),
    ["partner_registration_pending", "partner_approved", "billing_details_changed", "credit_note_available"]);
  assert.deepEqual(buildMailPreviewQuery({ kind: "partner_approved", partnerUserId: "41" }).query, { kind: "partner_approved", partnerUserId: 41 });
  assert.deepEqual(buildMailPreviewQuery({ kind: "credit_note_available", creditNoteId: "8", partnerUserId: "41" }).query,
    { kind: "credit_note_available", creditNoteId: 8 });
  assert.equal(buildMailPreviewQuery({ kind: "credit_note_available", partnerUserId: "41" }).ok, false);
  assert.equal(buildMailPreviewQuery({ kind: "fremd", partnerUserId: "41" }).ok, false);
  const v = normalizeMailPreview({ kind: "partner_approved", subject: "Willkommen", html: "<p>Hallo</p>", recipient: "p***@test.example" });
  assert.equal(v.html, "<p>Hallo</p>", "unverändert — es wird nur im Sandbox-iframe gezeigt");
  assert.equal(normalizeMailPreview({ subject: "x" }), null);
  assert.equal(normalizeMailPreview({ html: 5 }), null);
  assert.equal(PRELIVE_TEXTS.mailPreviewNote, "Vorschau – es wird keine E-Mail versendet.");
});

test("15 — Bereinigung: erst Probelauf, Löschen nur ohne Blockade, nur mit Token", () => {
  const dry = normalizeCleanupDryRun({ counts: { users: 6, shipments: 12, bogus: "x" }, blockers: [], confirmToken: "tok-1", nothingToDelete: false });
  assert.deepEqual(dry.counts, [{ key: "users", count: 6 }, { key: "shipments", count: 12 }]);
  assert.equal(cleanupDeletable(dry), true);
  assert.deepEqual(buildCleanupBody(dry).body, { confirmToken: "tok-1" });
  const blockiert = normalizeCleanupDryRun({ counts: { users: 6 }, blockers: [{ table: "invoices", column: "user_id", count: 2 }, { column: "x" }],
    confirmToken: "tok-2" });
  assert.equal(blockiert.blockers.length, 1);
  assert.equal(cleanupDeletable(blockiert), false, "Blockade sperrt das Löschen");
  assert.equal(buildCleanupBody(blockiert).ok, false);
  assert.equal(blockerText(blockiert.blockers[0]), "Tabelle invoices, Spalte user_id: 2 Verweise");
  assert.equal(blockerText({ table: "x", column: null, count: 1 }), "Tabelle x: 1 Verweis");
  assert.equal(cleanupDeletable(normalizeCleanupDryRun({ counts: {}, blockers: [], confirmToken: "t", nothingToDelete: true })), false);
  assert.equal(cleanupDeletable(normalizeCleanupDryRun({ counts: { users: 1 }, blockers: [] })), false, "ohne Token nie");
  assert.equal(PRELIVE_TEXTS.cleanupConfirmTitle, "Alle Pre-Live-Testdaten endgültig löschen?");

  assert.deepEqual(cleanupOutcome(200, { deleted: { users: 6 } }).deleted, [{ key: "users", count: 6 }]);
  assert.equal(cleanupOutcome(200, { nothingToDelete: true }).kind, "nothing");
  const b = cleanupOutcome(409, { code: "CLEANUP_BLOCKED", error: "x", blockers: [{ table: "invoices", column: "user_id", count: 1 }] });
  assert.equal(b.kind, "blocked");
  assert.equal(b.blockers.length, 1);
  assert.equal(b.reload, true);
  assert.equal(cleanupOutcome(409, { code: "CLEANUP_STALE", error: "x" }).text, PRELIVE_TEXTS.cleanupStale);
  assert.equal(cleanupOutcome(404, { code: "PRELIVE_TEST_MODE_DISABLED" }).kind, "disabled");
  assert.equal(cleanupOutcome(503, null).reload, true, "offener Ausgang: neu laden, nichts behaupten");
});

test("16 — Passwort-Link: nur mit Link; kein Rest im Modul", () => {
  assert.deepEqual(normalizePasswordLink({ resetUrl: "https://confidaraexpress.de/login?reset=abc", expiresAt: "2026-10-07T10:15:00Z" }),
    { resetUrl: "https://confidaraexpress.de/login?reset=abc", expiresAt: "2026-10-07T10:15:00Z" });
  assert.equal(normalizePasswordLink({ resetUrl: "" }), null);
  assert.equal(normalizePasswordLink({ resetUrl: "https://x y" }), null);
  assert.equal(normalizePasswordLink(null), null);
  assert.equal(PRELIVE_TEXTS.passwordLinkHint,
    "Link gilt 15 Minuten, einmalig. Öffnen Sie ihn in einem privaten Fenster, um das Passwort des Testkontos zu setzen.");
});

test("17 — Fehlerabbildung: feste deutsche Texte am richtigen Feld, Modus aus erkannt", () => {
  const aus = preliveErrorOutcome(404, { code: "PRELIVE_TEST_MODE_DISABLED", error: "Not found" });
  assert.equal(aus.disabled, true);
  assert.equal(aus.text, PRELIVE_TEXTS.disabledAction);
  assert.deepEqual(preliveErrorOutcome(409, { code: "EMAIL_EXISTS", error: "x" }),
    { text: "Zu dieser E-Mail-Adresse gibt es bereits ein Konto.", field: "email", disabled: false, reload: false });
  assert.equal(preliveErrorOutcome(404, { code: "REFERRAL_CODE_UNKNOWN" }).field, "referralCode");
  assert.equal(preliveErrorOutcome(404, { code: "SPONSOR_NOT_FOUND" }).field, "sponsorUserId");
  assert.equal(preliveErrorOutcome(409, { code: "CUSTOMER_NOT_TEST" }).field, "customerUserId");
  assert.equal(preliveErrorOutcome(400, { code: "AMOUNT_INVALID", field: "purchaseNetCents" },
    { fieldMap: { purchaseNetCents: "purchaseNet", customerNetCents: "customerNet" } }).field, "purchaseNet");
  const sz = preliveErrorOutcome(400, { code: "SCENARIO_INVALID", field: "packages", error: "Pakete: höchstens 5000" });
  assert.deepEqual([sz.field, sz.text], ["packages", "Pakete: höchstens 5000"]);
  assert.equal(preliveErrorOutcome(409, { code: "PARTNER_NOT_TEST" }, { fieldMap: { partnerUserId: "sponsorUserId" } }).field, "sponsorUserId");
  assert.equal(preliveErrorOutcome(409, { code: "ALREADY_PAID" }).reload, true);
  assert.equal(preliveErrorOutcome(409, { code: "UNBEKANNT", error: "Servertext" }).text, "Servertext");
  assert.match(preliveErrorOutcome(500, { code: "EMAIL_EXISTS", error: "TypeError" }).text, /nicht ausgeführt/, "Codes nur bei 4xx");
});
