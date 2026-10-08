// UX-Paket 5 — Gutschriften, Versandnachweise und Pre-Live-Testbereich:
// Überblick und nächster Schritt des Abrechnungslaufs, Sprungziele ins
// Partnerdetail, der Ablauf des Versandnachweises und die Schrittfolge des
// Pre-Live-Testbereichs — plus die Struktur der Seiten.
//
// Run: node --test src/utils/adminPartnerWorkflows.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  RUN_TEXTS,
  blockerNextStep,
  issueAllLabel,
  normalizePreview,
  runCounts,
  runNextStep,
} from "./adminSalesPartnerSettlementView.mjs";
import {
  PARTNER_SECTION_IDS,
  sectionFromState,
  testRunFromState,
  withSection,
  withTestRun,
} from "./adminJumpState.mjs";
import {
  EVIDENCE_DECISION_OPTIONS,
  EVIDENCE_TEXTS,
  INPUT_TEXTS,
  MAX_EVIDENCE_NOTE_LENGTH,
  buildDispatchEvidenceBody,
  dispatchEvidenceErrorOutcome,
  evidenceDecisionEffect,
  evidenceDecisionSummary,
  evidenceTypeLabel,
} from "./adminSalesPartnerView.mjs";
import {
  PRELIVE_FLOW_STEPS,
  PRELIVE_FLOW_TEXTS,
  PRELIVE_REGISTRATION_PATH,
  PRELIVE_TEXTS,
  activeTestPartners,
  cleanupTableLabel,
  normalizePreliveAccounts,
  pendingTestPartners,
  preliveRegistrationState,
} from "./salesPartnerPrelive.mjs";
import { parseSalesPartnerPublicConfig } from "./salesPartnerPublicConfig.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(here, "..", rel), "utf8");
const ohneKommentare = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/.*$/gm, "");
// Reihenfolge im Quelltext: jedes Stück muss nach dem vorigen stehen.
function inReihenfolge(src, teile, wo) {
  let ab = -1;
  for (const t of teile) {
    const i = src.indexOf(t, ab + 1);
    assert.ok(i > ab, `${wo}: „${t}" fehlt oder steht nicht nach dem vorigen Teil`);
    ab = i;
  }
}
const TECHNIK = /SALES_PARTNER|_ENABLED|PRELIVE_|\bServer\b|\bProvider\b|undefined|null/;

const zeile = (extra) => ({ partnerUserId: 5, name: "Petra", companyName: "Vertrieb 5 GmbH", entryCount: 2,
  netCents: 10000, taxCents: 1900, grossCents: 11900, taxStatus: "with_vat", taxRatePercent: "19.00",
  status: "issuable", blockers: [], fingerprint: "fp-5", existingCreditNote: null, ...extra });
const vorschau = (partners, extra = {}) => normalizePreview({ month: "2026-09", cutoffAt: "2026-09-30T22:00:00.000Z",
  issuanceEnabled: true, globalBlockers: [], partners, ...extra });

/* ══════════ Gutschriften: Überblick und nächster Schritt ════════════════ */

test("1 — Zählung je Serverstatus; nächster Schritt in fester Rangfolge", () => {
  const gemischt = vorschau([
    zeile(),
    zeile({ partnerUserId: 6, status: "blocked", blockers: ["billing_details_unconfirmed"], fingerprint: null }),
    zeile({ partnerUserId: 7, status: "carried_forward", fingerprint: null }),
    zeile({ partnerUserId: 8, status: "already_issued", fingerprint: null, existingCreditNote: { id: 3, number: "GS-1" } }),
    zeile({ partnerUserId: 9, status: "irgendwas", fingerprint: null }),
  ]);
  assert.deepEqual(runCounts(gemischt), { issuable: 1, blocked: 1, alreadyIssued: 1, carriedForward: 1, unknown: 1 });
  assert.deepEqual(runNextStep(gemischt), { key: "issue",
    text: "1 Gutschrift kann ausgestellt werden. 1 Vertriebspartner ist blockiert – was fehlt, steht in seiner Zeile." });

  const zwei = vorschau([zeile(), zeile({ partnerUserId: 9, fingerprint: "fp-9" })]);
  assert.equal(runNextStep(zwei).text, "2 Gutschriften können ausgestellt werden.");

  const nurBlockiert = vorschau([zeile({ status: "blocked", blockers: ["billing_details_missing"], fingerprint: null }),
    zeile({ partnerUserId: 6, status: "blocked", blockers: ["agreement_missing"], fingerprint: null })]);
  assert.deepEqual(runNextStep(nurBlockiert), { key: "blocked",
    text: "2 Vertriebspartner sind blockiert – was fehlt, steht in ihrer Zeile." });

  const erledigt = vorschau([zeile({ status: "already_issued", fingerprint: null }), zeile({ partnerUserId: 6, status: "carried_forward", fingerprint: null })]);
  assert.deepEqual(runNextStep(erledigt), { key: "done", text: RUN_TEXTS.stepDone });

  // Abgeschaltet oder global blockiert: nichts ist ausstellbar — auch wenn eine Zeile es wäre.
  assert.equal(runNextStep(vorschau([zeile()], { issuanceEnabled: false, globalBlockers: ["issuance_disabled"] })).key, "closed");
  assert.equal(runNextStep(vorschau([zeile()], { globalBlockers: ["issuer_config_incomplete"] })).key, "closed");
  assert.deepEqual(runNextStep(vorschau([])), { key: "empty", text: RUN_TEXTS.empty });
  assert.equal(runNextStep(null), null);
  assert.deepEqual(runCounts(null), { issuable: 0, blocked: 0, alreadyIssued: 0, carriedForward: 0, unknown: 0 });
  // Ausstellbar zählt nur, was auch ausgestellt werden darf (Fingerabdruck, Kennung).
  assert.equal(runNextStep(vorschau([zeile({ fingerprint: null })])).key, "done");
  assert.equal(issueAllLabel(3), "Alle ausstellbaren ausstellen (3)");
  assert.equal(issueAllLabel(1, { test: true }), "Alle ausstellbaren Testgutschriften ausstellen (1)");
});

test("2 — je Blockiergrund, wer ihn beheben kann; nie ein Rohcode, nie Technik im Text", () => {
  assert.deepEqual(blockerNextStep("billing_details_unconfirmed"), { kind: "billing", text: "Abrechnungsdaten prüfen" });
  assert.deepEqual(blockerNextStep("billing_details_missing"), { kind: "wait", text: RUN_TEXTS.waitPartner });
  assert.deepEqual(blockerNextStep("agreement_missing"), { kind: "info", text: RUN_TEXTS.notFixable });
  for (const code of ["issuance_disabled", "issuer_config_incomplete", "credit_note_title_missing", "tax_status_not_enabled",
    "tax_rate_missing", "tax_note_missing", "cancellation_title_missing"]) {
    assert.deepEqual(blockerNextStep(code), { kind: "info", text: RUN_TEXTS.configHint }, code);
  }
  for (const roh of ["voellig_neu", "__proto__", "constructor", "", null, 7]) assert.equal(blockerNextStep(roh), null);
  for (const t of Object.values(RUN_TEXTS)) assert.doesNotMatch(t, TECHNIK, `Technik im Text: ${t}`);
  assert.match(RUN_TEXTS.startHint, /Auszahlung und Storno/, "der Weg zu den Folgeaktionen ist genannt");
});

/* ══════════ Sprungziele ═════════════════════════════════════════════════ */

test("3 — Sprungziele nur aus der festen Liste; Testlauf nur bei ausdrücklichem true", () => {
  const from = { from: "/admin/partners/credit-notes" };
  assert.deepEqual(withSection(from, "billing"), { from: "/admin/partners/credit-notes", bereich: "billing" });
  assert.deepEqual(withSection(from, "creditNotes"), { from: "/admin/partners/credit-notes", bereich: "creditNotes" });
  assert.equal(withSection(from, "irgendwo"), from, "ein unbekannter Bereich wird nicht mitgegeben");
  assert.equal(withSection(undefined, "kaputt"), undefined);
  assert.equal(sectionFromState({ bereich: "billing" }), "adm-sp-billing-card");
  assert.equal(sectionFromState({ bereich: "commissions" }), "adm-sp-commissions-card");
  for (const roh of [null, undefined, "billing", {}, { bereich: "__proto__" }, { bereich: "constructor" },
    { bereich: "adm-sp-billing-card" }, { bereich: ["billing"] }]) {
    assert.equal(sectionFromState(roh), null, JSON.stringify(roh));
  }
  assert.deepEqual(Object.keys(PARTNER_SECTION_IDS).sort(), ["billing", "commissions", "creditNotes"]);
  assert.deepEqual(withTestRun(from), { from: "/admin/partners/credit-notes", testlauf: true });
  assert.equal(testRunFromState({ testlauf: true }), true);
  for (const roh of [null, undefined, {}, { testlauf: "true" }, { testlauf: 1 }, true]) {
    assert.equal(testRunFromState(roh), false, JSON.stringify(roh));
  }
  // Die Ids gibt es im Partnerdetail tatsächlich.
  const karten = ["SalesPartnerBillingDetailsCard.jsx", "SalesPartnerCreditNotesCard.jsx", "SalesPartnerCommissionsCard.jsx"]
    .map((f) => read(`components/admin/${f}`)).join("\n");
  for (const id of Object.values(PARTNER_SECTION_IDS)) assert.ok(karten.includes(`id="${id}"`), `${id} fehlt im Partnerdetail`);
});

/* ══════════ Versandnachweis ═════════════════════════════════════════════ */

test("4 — Versandnachweis: Wirkung je Entscheidung, Zusammenfassung, 500 Zeichen wie der Vertrag", () => {
  assert.match(evidenceDecisionEffect("dispatched"), /Provision/);
  assert.match(evidenceDecisionEffect("not_dispatched"), /keine Provision/);
  assert.match(evidenceDecisionEffect("unclear"), /bleibt in dieser Liste/);
  assert.equal(evidenceDecisionEffect("lost"), null);
  assert.equal(evidenceDecisionEffect("__proto__"), null);
  for (const o of EVIDENCE_DECISION_OPTIONS) assert.ok(evidenceDecisionEffect(o.value), `${o.value}: keine Wirkung`);

  assert.equal(evidenceDecisionSummary({}), null);
  assert.equal(evidenceDecisionSummary({ status: "unclear" }), "Gespeichert wird: Ungeklärt.");
  assert.equal(evidenceDecisionSummary({ status: "dispatched" }), "Gespeichert wird: Versendet.");
  assert.equal(evidenceDecisionSummary({ status: "dispatched", dispatchDate: "2026-10-02", evidenceType: "carrier_portal" }),
    "Gespeichert wird: Versendet am 02.10.2026 · Carrier-Portal.");
  assert.equal(evidenceDecisionSummary({ status: "dispatched", dispatchDate: "2026-13-40", evidenceType: "magic" }),
    "Gespeichert wird: Versendet.", "Ungültiges erscheint nicht");

  assert.equal(MAX_EVIDENCE_NOTE_LENGTH, 500);
  const basis = { status: "unclear" };
  assert.equal(buildDispatchEvidenceBody({ ...basis, note: "x".repeat(500) }, { today: "2026-10-08" }).ok, true);
  assert.equal(buildDispatchEvidenceBody({ ...basis, note: "x".repeat(501) }, { today: "2026-10-08" }).errors.note,
    INPUT_TEXTS.evidenceNoteTooLong);

  // Bisherige Nachweise: auch automatische Arten verständlich.
  assert.equal(evidenceTypeLabel("carrier_pickup_scan"), "Abholscan des Carriers");
  assert.equal(evidenceTypeLabel("carrier_delivered"), "Carrier meldet: zugestellt");
  assert.equal(evidenceTypeLabel("admin_decision"), "Admin-Entscheidung");
  assert.equal(evidenceTypeLabel("ganz_neu"), "Unbekannte Nachweisart");
});

test("5 — Versandnachweis: Fehler des Servers am Feld, bewegter Stand lädt neu, nie ein Rohcode", () => {
  const feld = (code) => dispatchEvidenceErrorOutcome(400, { code, error: "x" });
  assert.deepEqual(feld("DISPATCH_DATE_BEFORE_BOOKING"), { text: INPUT_TEXTS.dispatchBeforeBooking, field: "dispatchDate", reload: false });
  assert.deepEqual(feld("DISPATCH_DATE_IN_FUTURE"), { text: INPUT_TEXTS.dateInFuture, field: "dispatchDate", reload: false });
  assert.deepEqual(feld("DISPATCH_DATE_REQUIRED"), { text: INPUT_TEXTS.dateRequired, field: "dispatchDate", reload: false });
  assert.equal(feld("DISPATCH_EVIDENCE_TYPE_REQUIRED").field, "evidenceType");
  assert.equal(feld("DISPATCH_EVIDENCE_NOTE_REQUIRED").field, "note");
  assert.equal(feld("DISPATCH_EVIDENCE_STATUS_INVALID").field, "status");
  assert.deepEqual(dispatchEvidenceErrorOutcome(409, { code: "COMMISSION_DECISION_EXISTS", error: "x" }),
    { text: EVIDENCE_TEXTS.decisionExists, field: null, reload: true });
  assert.deepEqual(dispatchEvidenceErrorOutcome(409, { code: "SHIPMENT_NOT_BOOKED", error: "x" }),
    { text: EVIDENCE_TEXTS.notBooked, field: null, reload: true });
  const sonst = dispatchEvidenceErrorOutcome(500, { code: "DB_KAPUTT", error: "stack" });
  assert.equal(sonst.field, null);
  assert.doesNotMatch(sonst.text, /DB_KAPUTT|stack/);
  assert.equal(dispatchEvidenceErrorOutcome(400, { code: "__proto__" }).field, null);
  for (const t of Object.values(EVIDENCE_TEXTS)) assert.doesNotMatch(t, TECHNIK, t);
});

/* ══════════ Pre-Live: Schrittfolge ═════════════════════════════════════ */

test("6 — Pre-Live: die neun Schritte des Primärwegs in der Reihenfolge des Auftrags", () => {
  assert.deepEqual(PRELIVE_FLOW_STEPS.map((s) => s.title), [
    "Partner öffentlich registrieren", "Im Admin freigeben", "Als Partner anmelden", "Kundenlink benutzen",
    "Testkunden zuordnen", "Testsendung und Versandnachweis erzeugen", "Provisionen prüfen", "Testgutschrift prüfen",
    "Testdaten kontrolliert bereinigen",
  ]);
  assert.equal(new Set(PRELIVE_FLOW_STEPS.map((s) => s.key)).size, 9);
  // Die öffentliche Registrierung ist eine echte Route des Frontends.
  assert.equal(PRELIVE_REGISTRATION_PATH, "/partner-registrieren");
  assert.ok(read("App.jsx").includes(`<Route path="${PRELIVE_REGISTRATION_PATH}" element={<PartnerRegisterPage />} />`));
  // Ehrliche Aussagen statt Versprechen, die der Server nicht hält.
  assert.match(PRELIVE_FLOW_TEXTS.customerLink, /keinen Kunden zu/);
  assert.match(PRELIVE_FLOW_TEXTS.customerLink, /Empfehlungscode des Testpartners/);
  assert.match(PRELIVE_FLOW_TEXTS.registerProduction, /echt, kein Test/);
  assert.match(PRELIVE_FLOW_TEXTS.creditNote, /nicht steuerlich gültig/);
  assert.match(PRELIVE_FLOW_TEXTS.partnerToolNote, /Ersetzt nicht die öffentliche Registrierung/);
  assert.match(PRELIVE_TEXTS.pageSafety, /keine echte Buchung, Zahlung, Auszahlung oder steuerlich gültige Gutschrift/);
  assert.match(PRELIVE_TEXTS.pageSafety, /Ausnahmeliste/);
  assert.equal(PRELIVE_TEXTS.commissionRunLabel, "Provisionen jetzt berechnen (nur Testdaten)");
  for (const t of [...Object.values(PRELIVE_FLOW_TEXTS), PRELIVE_TEXTS.pageSafety, PRELIVE_TEXTS.customerCodeNote]) {
    assert.doesNotMatch(t, TECHNIK, `Technik im Text: ${t}`);
  }
});

test("7 — Pre-Live: Registrierungsweg nur aus der Antwort des Servers, fail-closed", () => {
  const cfg = (raw) => ({ ok: true, config: parseSalesPartnerPublicConfig(raw) });
  assert.equal(preliveRegistrationState(null), "loading");
  assert.equal(preliveRegistrationState({ ok: false, config: parseSalesPartnerPublicConfig(null) }), "unknown");
  assert.equal(preliveRegistrationState({ ok: true }), "unknown");
  assert.equal(preliveRegistrationState(cfg({ registrationEnabled: false, registrationMode: "prelive_test" })), "prelive_test");
  assert.equal(preliveRegistrationState(cfg({ registrationEnabled: false, registrationMode: "closed" })), "closed");
  assert.equal(preliveRegistrationState(cfg({ registrationEnabled: false, registrationMode: "PRELIVE_TEST" })), "closed");
  // Der produktive Weg hat Vorrang — nie ein Testweg, wenn der Server echte Anträge annimmt.
  assert.equal(preliveRegistrationState(cfg({ registrationEnabled: true, registrationMode: "prelive_test" })), "closed",
    "widersprüchlich: weder produktiv (ohne Vereinbarung) noch Testweg");
  const produktiv = cfg({ registrationEnabled: true, registrationMode: "production", agreementVersion: "1.0",
    agreement: { version: "1.0", effectiveFrom: "2026-10-01", documentPath: "/api/legal/sales_partner_agreement/1.0" } });
  assert.equal(preliveRegistrationState(produktiv), "production");

  const konten = normalizePreliveAccounts({ partners: [
    { id: 41, name: "Pia", status: "active" }, { id: 42, name: "Paul", status: "pending" },
    { id: 43, name: "Rita", status: "rejected" }, { id: 44, name: "Tina", status: "pending" }] });
  assert.deepEqual(pendingTestPartners(konten).map((p) => p.id), [42, 44]);
  assert.deepEqual(activeTestPartners(konten).map((p) => p.id), [41]);
  assert.deepEqual(pendingTestPartners(null), []);
});

test("8 — Bereinigung: verständliche Namen für jede Tabelle der festen Löschfolge", () => {
  const FOLGE = ["sales_partner_credit_note_documents", "sales_partner_credit_note_items", "sales_partner_credit_notes",
    "sales_partner_commission_entries", "sales_partner_commission_decisions", "sales_partner_level_assessment_items",
    "sales_partner_level_assessments", "shipment_dispatch_evidence", "shipments", "sales_partner_customer_attributions",
    "sales_partner_billing_details", "sales_partner_cap_versions", "sales_partner_level_rules", "sales_partner_level_rule_sets",
    "sales_partner_rate_versions", "sales_partner_status_events", "sales_partner_profiles", "password_resets", "users",
    "sales_partner_test_credit_note_counters"];
  for (const t of FOLGE) {
    const label = cleanupTableLabel(t);
    assert.ok(label && !label.includes("_"), `${t}: kein verständlicher Name`);
  }
  assert.equal(cleanupTableLabel("shipments"), "Testsendungen");
  assert.equal(cleanupTableLabel("users"), "Testkonten");
  for (const roh of ["invoices", "__proto__", "constructor", "", null]) assert.equal(cleanupTableLabel(roh), null);
  const karte = ohneKommentare(read("components/admin/PreliveCleanupCard.jsx"));
  assert.ok(karte.includes("cleanupTableLabel(r.key)"), "die Zählung nennt den Namen");
  assert.ok(karte.includes("<span className={`adm-mono${label ? \" adm-sp-sub adm-pl-table-key\" : \"\"}`}>{r.key}</span>"),
    "der technische Name bleibt sichtbar");
  assert.ok(karte.includes("confirmLabel=\"Endgültig löschen\""), "die Bestätigung bleibt");
  assert.ok(karte.includes("buildCleanupBody(probe.data)"), "gelöscht wird nur mit dem Token des Probelaufs");
});

/* ══════════ Struktur der Seiten ═════════════════════════════════════════ */

test("9 — Gutschriften: Überblick, Sprunglinks, Testlauf aus dem Router-State; die Bestätigung bleibt", () => {
  const seite = ohneKommentare(read("pages/admin/AdminSalesPartnerCreditNotesPage.jsx"));
  assert.ok(seite.includes("const zaehlung = runCounts(data);"));
  assert.ok(seite.includes("const schritt = runNextStep(data);"));
  assert.ok(seite.includes('id="adm-cn-next-step" data-step={schritt.key}'));
  assert.ok(seite.includes("state={withSection(from, \"billing\")}"), "Abrechnungsdaten prüfen öffnet den Bereich");
  assert.ok(seite.includes("state={withSection(from, \"creditNotes\")}"), "eine ausgestellte Gutschrift führt zu ihrem Bereich");
  assert.ok(seite.includes("useState(() => testRunFromState(location.state))"), "Testlauf nur aus dem Router-State");
  assert.ok(seite.includes(": issueAllLabel(ausstellbar.length, { test: testlaufAktiv })}"), "im Testlauf heißt es Testgutschriften");
  // Eine Hauptaktion: die Zeilen stellen nur über die Bestätigung aus und sind nicht primär.
  assert.equal((seite.match(/<ConfirmDialog/g) || []).length, 1);
  assert.ok(seite.includes('className="btn btn-outline btn-sm" id={mitId && id !== null ? `adm-cn-issue-${id}` : undefined}'));
  assert.ok(seite.includes("onClick={() => { setMessage(null); setBestaetigen({ art: \"einzeln\", row }); }}"));
  assert.ok(seite.includes('className={`btn ${data ? "btn-outline" : "btn-primary"} btn-sm`} id="adm-cn-preview"'));
  assert.ok(!seite.includes("zulässig"), "ein Begriff: ausstellbar");
  assert.doesNotMatch(seite, /\bfetch\(|apiFetch|dangerouslySetInnerHTML/);
});

test("10 — Partnerdetail öffnet den genannten Bereich einmal; eine Fassung des Öffnens", () => {
  const seite = ohneKommentare(read("pages/admin/AdminSalesPartnerDetailPage.jsx"));
  assert.ok(seite.includes("const zielBereich = sectionFromState(location.state);"));
  assert.ok(seite.includes("useEffect(() => { if (zielBereich) bereichOeffnen(zielBereich); }, [zielBereich]);"));
  assert.ok(seite.includes("const bereichOeffnen = (id) => { openAdminSection(id); };"));
  assert.ok(!seite.includes("scrollIntoView"), "keine zweite Fassung des Öffnens");
  const karte = ohneKommentare(read("components/admin/AdminDisclosureCard.jsx"));
  assert.ok(karte.includes("export function openAdminSection(id)"));
  assert.ok(karte.includes("if (!d.open) d.open = true;"), "auch umgebende Bereiche gehen auf");
});

test("11 — Versandnachweis: der Dialog folgt dem Ablauf; Fehler am Feld; Trackingstand nie roh", () => {
  const seite = ohneKommentare(read("pages/admin/AdminDispatchEvidencePage.jsx"));
  inReihenfolge(seite, [
    'id="adm-sp-evidence-shipment-title">Sendung</h3>',
    'id="adm-sp-evidence-history-title">Vorhandene Nachweise</h3>',
    'id="adm-sp-evidence-status-title">Versandstatus</h3>',
    "<legend className=\"adm-edit-label\">Entscheidung (Pflicht)</legend>",
    'htmlFor="adm-sp-evidence-note">Begründung (Pflicht)</label>',
    'id="adm-sp-evidence-summary"',
  ], "Versanddialog");
  assert.ok(seite.includes("maxLength={MAX_EVIDENCE_NOTE_LENGTH}"));
  assert.ok(seite.includes("const folge = dispatchEvidenceErrorOutcome(r.status, body);"));
  assert.ok(seite.includes("<span>{evidenceTrackingText(item)}</span>"));
  assert.ok(seite.includes("{evidenceDecisionEffect(o.value)}"));
  assert.ok(seite.includes('confirmId="adm-sp-evidence-confirm"'), "die Bestätigung bleibt");
  assert.equal((seite.match(/<ConfirmDialog/g) || []).length, 1);
});

test("12 — Pre-Live: Schrittfolge oben, Arbeitsbereiche darunter, Zusatzwerkzeuge eingeklappt; keine neue Abfrage", () => {
  const seite = ohneKommentare(read("pages/admin/AdminSalesPartnerPrelivePage.jsx"));
  inReihenfolge(seite, [
    'id="adm-pl-warning"', 'id="adm-pl-status-card"', "<PreliveFlowCard ", "<PreliveAccountsCard ",
    "<PreliveShipmentsCard ", "<PreliveCommissionRunCard ", "<PreliveCleanupCard ", 'id="adm-pl-tools"',
    "<PreliveScenariosCard ", "<PreliveMailPreviewCard ",
  ], "Pre-Live-Seite");
  assert.ok(seite.includes("{PRELIVE_TEXTS.pageSafety}"));
  // Die öffentliche Konfiguration nur bei aktivem Modus; sonst kein Abruf.
  assert.ok(seite.includes("if (!enabled) return undefined;\n    let aktiv = true;\n    loadSalesPartnerPublicConfig()"));
  const flow = ohneKommentare(read("components/admin/PreliveFlowCard.jsx"));
  assert.doesNotMatch(flow, /api\/|apiFetch|\bfetch\(/, "die Schrittfolge fragt nichts selbst ab");
  assert.ok(flow.includes("const zustand = preliveRegistrationState(registration);"));
  assert.ok(flow.includes('if (zustand === "prelive_test") {'), "der Registrierungslink nur im Testweg");
  assert.equal((flow.match(/<CopyableNumber /g) || []).length, 1);
  assert.ok(flow.includes('to="/admin/partners/credit-notes" state={withTestRun(from)}'));
  assert.ok(flow.includes("<Link to={partnerPath(p.id)} state={from}>"), "Freigabe mit Rückweg hierher");
  // Formulare eingeklappt, Zusatzwerkzeuge als einklappbare Karten.
  const konten = read("components/admin/PreliveAccountsCard.jsx");
  inReihenfolge(konten, ['<AdminSubDisclosure id="adm-pl-customer-fold" title="Testkunde anlegen">',
    '<AdminSubDisclosure id="adm-pl-partner-fold" title={PRELIVE_FLOW_TEXTS.partnerToolTitle}>'], "Testkonten");
  assert.ok(read("components/admin/PreliveShipmentsCard.jsx").includes('<AdminSubDisclosure id="adm-pl-shipment-fold" title="Testsendung anlegen">'));
  assert.ok(read("components/admin/PreliveScenariosCard.jsx").includes('<AdminDisclosureCard id="adm-pl-scenarios-card" title="Schnellszenarien"'));
  assert.ok(read("components/admin/PreliveMailPreviewCard.jsx").includes('<AdminDisclosureCard id="adm-pl-mail-card" title="E-Mail-Vorschau"'));
});

test("14 — Pre-Live-Tabellen: Testkunden ohne Passwort-Link (Vertrag), Testsendungen in vier Spalten, mobil Karten", () => {
  // Der Server lehnt den Passwort-Link für Testkunden ab (409 ACCOUNT_LOGIN_NOT_SUPPORTED): keine tote Aktion.
  const konten = ohneKommentare(read("components/admin/PreliveAccountsCard.jsx"));
  assert.ok(!konten.includes('passwortLink(k, "Testkunde"'), "kein Passwort-Link für Testkunden");
  assert.ok(konten.includes('passwortLink(p, "Testpartner", e.currentTarget)'), "der Passwort-Link der Testpartner bleibt");
  assert.ok(konten.includes("{PRELIVE_TEXTS.customerNoLogin}"));
  assert.match(PRELIVE_TEXTS.customerNoLogin, /melden sich nicht an/);
  const sendungen = ohneKommentare(read("components/admin/PreliveShipmentsCard.jsx"));
  const tabelle = sendungen.slice(sendungen.indexOf('id="adm-pl-shipments"'), sendungen.indexOf("</table>"));
  assert.equal((tabelle.match(/<th scope="col"/g) || []).length, 4, "vier Spalten");
  assert.equal((tabelle.match(/<td(?![^>]*data-label)/g) || []).length, 0, "jede Zelle trägt ihre Spaltenbeschriftung");
  // Alle Werte bleiben sichtbar: Kunde, Versandtag, Pakete, beide Netto-Beträge, Basis, Versand, Zahlung, Provision.
  for (const teil of ["s.customerCompanyName", "formatTimestamp(s.shipDate)", "formatCount(s.packageCount)",
    "formatCents(s.customerNetCents)", "formatCents(s.purchaseNetCents)", "formatCents(s.basisCents)",
    "evidenceStatusMeta(s.evidence ? s.evidence.status : null)", "formatTimestamp(s.evidence.dispatchDate)", "paidText(s)",
    "decisionOutcomeMeta(s.decision)"]) {
    assert.ok(tabelle.includes(teil), `${teil} fehlt`);
  }
  // Der Stand folgt dem Testablauf: Versand, Zahlung, Provision.
  inReihenfolge(tabelle, ["<dt>Versand</dt>", "<dt>Zahlung</dt>", "<dt>Provision</dt>"], "Stand der Testsendung");
  for (const [datei, id] of [["PreliveAccountsCard.jsx", "adm-pl-partners"], ["PreliveAccountsCard.jsx", "adm-pl-customers"],
    ["PreliveShipmentsCard.jsx", "adm-pl-shipments"]]) {
    const huelle = read(`components/admin/${datei}`).match(new RegExp('className="([^"]*)" id="' + id + '"'));
    assert.ok(huelle && huelle[1].split(" ").includes("adm-sp-cardtable"), `${id}: mobil keine Karten`);
  }
  // Gutschriften: Karten ohne leeren Aktionsblock; der Monat steht einmal (im Titel).
  const lauf = ohneKommentare(read("pages/admin/AdminSalesPartnerCreditNotesPage.jsx"));
  assert.ok(lauf.includes('{hatAktion(row) && <div className="adm-scard-actions">{aktion(row, { mitId: false })}</div>}'));
  assert.ok(!lauf.includes("<dt>Monat</dt>"), "der Monat steht nicht doppelt");
});

test("13 — Gestaltung: Mobil volle Trefferfläche über das Token, keine Farbliterale im neuen Block", () => {
  const css = read("styles/admin.css");
  const anfang = css.indexOf("/* ── Gutschriften, Versandnachweise, Pre-Live (UX-Paket 5)");
  assert.ok(anfang > 0, "der Block fehlt");
  const block = css.slice(anfang, css.indexOf("@media (max-width: 900px)", anfang) + 400);
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b|rgba?\(|box-shadow/);
  assert.ok(block.includes("min-height: var(--ce-size-touch-target);"));
});
