// billingModeRequestView.test.mjs — Antrag auf Sammelrechnung im Kunden- und Adminportal (P5, Canonical v2.111).
//
// Reine Funktions- und Quelltexttests: kein Browser, kein Netz, keine Buchung.
// Run: node --test src/utils/billingModeRequestView.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BILLING_MODE_REQUEST_TEXT, BILLING_MODE_REQUEST_NOTE_MAX, BILLING_MODE_REJECTION_REASON_MAX,
  billingModeRequestView, normalizeBillingModeRequest, formatTimestampDayDe, noteLength, billingModeOptionSelectable,
} from "./billingModeView.mjs";
import {
  validateRejectionReasonInput, normalizeAdminBillingModeRequest, splitAccountRequests, billingModeRequestStatusMeta,
  billingModeRequestCustomerCell, billingModeRequestEmptyState, ADMIN_BILLING_REQUEST_TEXT,
} from "./adminBillingModeRequests.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const ANTRAG = (status, extra = {}) => ({
  id: 7, status, requestedMode: "consolidated_7d", customerNote: null,
  requestedAt: "2026-11-04T09:15:00.000Z", decidedAt: null, withdrawnAt: null, rejectionReason: null, ...extra,
});

/* ── A. Kundensicht ─────────────────────────────────────────────────────────── */

test("A1 — Kalendertag in Europe/Berlin, nie geraten", () => {
  assert.equal(formatTimestampDayDe("2026-11-04T09:15:00.000Z"), "04.11.2026");
  assert.equal(formatTimestampDayDe("2026-11-04T23:30:00.000Z"), "05.11.2026", "nach Mitternacht in Berlin ist es der Folgetag");
  for (const v of ["", "kein Datum", null, undefined, 42]) assert.equal(formatTimestampDayDe(v), null, String(v));
});

test("A2 — ein unbekannter Zustand oder eine kaputte Antwort ist KEIN Antrag", () => {
  for (const raw of [null, undefined, [], "pending", { status: "offen" }, { status: null }]) {
    assert.equal(normalizeBillingModeRequest(raw), null, JSON.stringify(raw));
  }
  const r = normalizeBillingModeRequest(ANTRAG("approved", { rejectionReason: "darf nicht erscheinen", customerNote: "  " }));
  assert.equal(r.rejectionReason, null, "nur eine Ablehnung trägt einen Grund");
  assert.equal(r.customerNote, null, "ein leerer Text ist keine Begründung");
});

test("A3 — offen: Status mit Datum, Einzelrechnung gilt weiter, Rücknahme möglich, kein zweites Formular", () => {
  const v = billingModeRequestView({ mode: "single", request: ANTRAG("pending", { customerNote: "Etwa 40 Pakete pro Woche" }),
    available: true, loaded: true });
  assert.equal(v.kind, "request");
  assert.equal(v.box.title, "Beantragt am 04.11.2026 – wird geprüft");
  assert.deepEqual(v.box.lines, [BILLING_MODE_REQUEST_TEXT.pendingText, "Ihre Begründung: Etwa 40 Pakete pro Woche"]);
  assert.match(BILLING_MODE_REQUEST_TEXT.pendingText, /weiterhin eine Einzelrechnung/);
  assert.equal(v.canWithdraw, true);
  assert.equal(v.showForm, false, "ein offener Antrag darf keinen zweiten erlauben");
  assert.equal(v.showNotAvailable, false);
});

test("A4 — vor der Verfügbarkeit sagt die Karte, dass ein Antrag noch nicht genehmigt wird", () => {
  const offen = billingModeRequestView({ mode: "single", request: ANTRAG("pending"), available: false, loaded: true });
  assert.equal(offen.showNotAvailable, true);
  const neu = billingModeRequestView({ mode: "single", request: null, available: false, loaded: true });
  assert.equal(neu.showForm, true);
  assert.equal(neu.showNotAvailable, true);
  assert.match(BILLING_MODE_REQUEST_TEXT.notAvailable, /noch nicht freigeschaltet/);
  assert.match(BILLING_MODE_REQUEST_TEXT.notAvailablePending, /bleibt bis dahin in Prüfung/);
  assert.match(BILLING_MODE_REQUEST_TEXT.intro, /Ein Antrag ist noch keine Umstellung/);
});

test("A5 — abgelehnt mit Grund, zurückgezogen, genehmigt-aber-zurückgewechselt: jeweils neu beantragbar", () => {
  const ab = billingModeRequestView({ mode: "single", request: ANTRAG("rejected", { decidedAt: "2026-11-06T10:00:00Z",
    rejectionReason: "Bitte erst nach drei Monaten erneut." }), available: true, loaded: true });
  assert.equal(ab.box.title, "Abgelehnt am 06.11.2026");
  assert.deepEqual(ab.box.lines, ["Begründung: Bitte erst nach drei Monaten erneut.", BILLING_MODE_REQUEST_TEXT.rejectedAgain]);
  assert.equal(ab.showForm, true);
  assert.equal(ab.canWithdraw, false);
  const zu = billingModeRequestView({ mode: "single", request: ANTRAG("withdrawn", { withdrawnAt: "2026-11-05T08:00:00Z" }),
    available: true, loaded: true });
  assert.equal(zu.box.title, "Zurückgezogen am 05.11.2026");
  assert.equal(zu.showForm, true);
  const zurueck = billingModeRequestView({ mode: "single", request: ANTRAG("approved", { decidedAt: "2026-11-05T08:00:00Z" }),
    available: true, loaded: true });
  assert.equal(zurueck.box, null, "eine erledigte Genehmigung eines zurückgewechselten Kontos steht nicht als Status da");
  assert.equal(zurueck.showForm, true);
});

test("A6 — aktiv: die Abrechnungsart des Kontos entscheidet, der Antrag nennt nur das Datum", () => {
  const v = billingModeRequestView({ mode: "consolidated_7d", request: ANTRAG("approved", { decidedAt: "2026-11-05T08:00:00Z" }) });
  assert.equal(v.kind, "active");
  assert.equal(v.box.tone, "success");
  assert.equal(v.box.title, "Sammelrechnung aktiv");
  assert.deepEqual(v.box.lines, ["Genehmigt am 05.11.2026. Sie gilt für Ihre Buchungen seit der Genehmigung."]);
  assert.equal(v.showForm, false);
  // Ein Bestandskonto ohne Antrag (Supportweg) ist ebenso aktiv — ohne erfundenes Datum.
  assert.deepEqual(billingModeRequestView({ mode: "consolidated_7d", request: null }).box.lines, []);
});

test("A7 — fail-closed: ohne gelesenen Stand kein Antragsformular", () => {
  assert.equal(billingModeRequestView({ mode: "single", request: null, loaded: false }).showForm, false);
  const fehler = billingModeRequestView({ mode: "single", request: null, failed: true });
  assert.deepEqual([fehler.kind, fehler.showForm, fehler.canWithdraw], ["error", false, false]);
});

test("A8 — die Sammelrechnung ist nie direkt wählbar; Rückweg und gespeicherte Wahl bleiben", () => {
  for (const cap of [undefined, { consolidated7dAvailable: true }, { consolidated7dAvailable: false }]) {
    assert.equal(billingModeOptionSelectable({ billing_mode: "single", billingCapabilities: cap }, "consolidated_7d"), false);
    assert.equal(billingModeOptionSelectable({ billing_mode: "consolidated_7d", billingCapabilities: cap }, "consolidated_7d"), true);
    assert.equal(billingModeOptionSelectable({ billing_mode: "consolidated_7d", billingCapabilities: cap }, "single"), true);
  }
});

test("A9 — Zeichen wie der Server (Codepunkte); Grenzen wie der Server", () => {
  assert.equal(noteLength("📦📦"), 2);
  assert.equal(noteLength(null), 0);
  assert.equal(BILLING_MODE_REQUEST_NOTE_MAX, 500);
  assert.equal(BILLING_MODE_REJECTION_REASON_MAX, 300);
});

test("A10 — die Karte spricht nur mit den Kundenwegen und sendet nur die Begründung", () => {
  const karte = strip(src("components/dashboard/BillingModeCard.jsx"));
  const api = strip(src("api/client.js"));
  assert.ok(!/admin\/|billing-mode\b|setAdminUserBillingMode/.test(karte), "das Kundenportal ruft einen Adminweg");
  assert.match(api, /apiFetch\(`\/kunde\/billing-mode-requests\/current`, \{ auth: true \}\)/);
  assert.match(api, /body: JSON\.stringify\(\{ note: typeof note === "string" \? note : "" \}\)/,
    "der Antrag darf ausschließlich die Begründung tragen");
  assert.match(api, /apiFetch\(`\/kunde\/billing-mode-requests\/current`, \{ method: "DELETE", auth: true \}\)/);
  // Kein Kundenweg schreibt die Sammelrechnung über den Profil-PATCH.
  assert.ok(!/buildBillingModePatch\("consolidated_7d"\)/.test(karte));
  // Status als Wort im Titel, nie allein farblich; Erfolgsmeldungen als Status hörbar.
  assert.match(karte, /<strong className="form-alert-title">\{ansicht\.box\.title\}<\/strong>/);
  assert.match(karte, /<p className="profile-saved" role="status" id="bm-request-done">/);
  // Das Freitextfeld ist beschriftet und an Hinweis und Zähler gebunden.
  assert.match(karte, /<label className="field-label mt-16" htmlFor="bm-request-note">/);
  assert.match(karte, /aria-describedby="bm-request-note-hint bm-request-note-count"/);
  assert.match(karte, /maxLength=\{BILLING_MODE_REQUEST_NOTE_MAX\}/);
});

/* ── B. Adminsicht ──────────────────────────────────────────────────────────── */

test("B1 — Ablehnungsgrund: Pflicht, 1–300 Zeichen nach dem Trimmen", () => {
  for (const v of ["", "   ", null, undefined, 42]) assert.equal(validateRejectionReasonInput(v).ok, false, String(v));
  assert.deepEqual(validateRejectionReasonInput("  Bonität nicht ausreichend.  "), { ok: true, reason: "Bonität nicht ausreichend." });
  assert.equal(validateRejectionReasonInput("ä".repeat(300)).ok, true);
  assert.equal(validateRejectionReasonInput("ä".repeat(301)).ok, false);
  assert.equal(validateRejectionReasonInput("📦".repeat(300)).ok, true, "Codepunkte, nicht UTF-16-Einheiten");
});

test("B2 — Zeilen defensiv lesen, offener Antrag getrennt vom Verlauf", () => {
  assert.equal(normalizeAdminBillingModeRequest({ id: "x" }), null);
  assert.equal(normalizeAdminBillingModeRequest(null), null);
  const { pending, history } = splitAccountRequests([
    { id: 3, status: "pending", requestedAt: "2026-11-04T09:00:00Z" },
    { id: 2, status: "rejected", decisionNote: "nein", decidedBy: { id: 1, name: "Erika Admin" } },
    { id: 1, status: "withdrawn" }, { id: 0, status: "pending" }, "kaputt",
  ]);
  assert.equal(pending.id, 3);
  assert.deepEqual(history.map((r) => r.id), [2, 1]);
  assert.equal(history[0].decidedBy.name, "Erika Admin");
  assert.deepEqual(splitAccountRequests(undefined), { pending: null, history: [] });
});

test("B3 — Status als Wort im Badge; Kunde mit Firma, Nummer und Ansprechpartner", () => {
  assert.deepEqual(billingModeRequestStatusMeta("pending"), ["badge-yellow", "Offen"]);
  assert.deepEqual(billingModeRequestStatusMeta("approved"), ["badge-green", "Genehmigt"]);
  assert.deepEqual(billingModeRequestStatusMeta("rejected"), ["badge-red", "Abgelehnt"]);
  assert.deepEqual(billingModeRequestStatusMeta("withdrawn"), ["badge-gray", "Zurückgezogen"]);
  // Unbekannt: der zentrale Rückfall — nie der Rohwert als Beschriftung.
  assert.deepEqual(billingModeRequestStatusMeta("neu"), ["badge-gray", "Unbekannter Status", "neu"]);
  const c = billingModeRequestCustomerCell(normalizeAdminBillingModeRequest({ id: 1, userId: 9,
    customer: { id: 9, company: "Muster GmbH", contactName: "Jane Doe", customerNumber: "CE-K-10031" } }));
  assert.deepEqual(c, { primary: "Muster GmbH", secondary: "CE-K-10031 · Jane Doe", known: true });
  assert.equal(billingModeRequestCustomerCell({}).known, false);
  assert.equal(billingModeRequestEmptyState("pending").title, "Keine offenen Anträge");
});

test("B4 — Genehmigen nur mit Bestätigung und nur bei Verfügbarkeit; der Text verspricht keine Rechnung", () => {
  const panel = strip(src("components/admin/BillingModeRequestsPanel.jsx"));
  assert.match(panel, /disabled=\{!!busy \|\| !state\.approvalAvailable\}/);
  assert.match(panel, /onClick=\{\(\) => setBestaetigen\(true\)\}/, "Genehmigen öffnet erst den Bestätigungsdialog");
  assert.match(panel, /<ConfirmDialog/);
  assert.match(ADMIN_BILLING_REQUEST_TEXT.approveConfirmText, /Es wird keine Rechnung ausgestellt/);
  assert.match(ADMIN_BILLING_REQUEST_TEXT.approvalUnavailable, /Sammelrechnungslauf und reguläre Rechnungsstellung/);
  assert.match(ADMIN_BILLING_REQUEST_TEXT.rejectHint, /Der Kunde sieht diesen Text/);
  // Der Grund wird vor dem Senden geprüft; der Server bleibt verbindlich.
  assert.match(panel, /const v = validateRejectionReasonInput\(grund\);/);
  assert.match(panel, /maxLength=\{BILLING_MODE_REJECTION_REASON_MAX\}/);
  const api = strip(src("api/adminApi.js"));
  assert.match(api, /`\/admin\/billing-mode-requests\/\$\{encodeURIComponent\(requestId\)\}\/approve`, \{ method: "POST", auth: true \}/,
    "die Genehmigung trägt keinen Body");
  assert.match(api, /body: JSON\.stringify\(\{ reason: typeof reason === "string" \? reason : "" \}\)/);
});

test("B5 — Liste: Zustandsmuster und mobile Karten wie die übrigen Adminlisten", () => {
  const seite = strip(src("pages/admin/AdminBillingModeRequestsPage.jsx"));
  for (const m of [/<ListSkeleton\b/, /<ErrorState\b/, /adm-bmr-cards/, /adm-bmr-table/, /<caption className="sr-only">/]) {
    assert.match(seite, m);
  }
  const css = src("styles/admin.css");
  assert.match(css, /\.adm-bmr-cards \{ display: none/);
  assert.match(css, /\.adm-bmr-table \{ display: none/);
  const app = strip(src("App.jsx"));
  assert.match(app, /<Route path="\/admin\/billing-mode-requests"\s+element=\{<AdminBillingModeRequestsPage \/>\} \/>/);
});

test("B6 — Demo: Stand lesbar, Antrag und Rücknahme „In der Demo nicht verfügbar.“", async () => {
  const demo = strip(src("demo/demoBackend.mjs"));
  assert.match(demo, /pfad === "\/kunde\/billing-mode-requests\/current" \|\| pfad === "\/kunde\/billing-mode-requests"/);
  assert.match(demo, /if \(methode !== "GET" \|\| pfad !== "\/kunde\/billing-mode-requests\/current"\) return nichtVerfuegbar\(\);/);
  assert.match(demo, /billingCapabilities: \{ consolidated7dAvailable: false \}/);
});
