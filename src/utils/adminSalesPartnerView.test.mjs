// Admin-Vertriebspartner — Bodies (Allowlist + Vorabprüfung), Labels,
// Normalisierung, Fehlertexte.
//
// Run: node --test src/utils/adminSalesPartnerView.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LEVEL_BONUSES,
  DEFAULT_MIN_PACKAGES,
  INPUT_TEXTS,
  adminActionErrorText,
  attributionSourceLabel,
  buildAdjustmentBody,
  buildApproveBody,
  buildAttributionBody,
  buildCapBody,
  buildDeactivateBody,
  buildDispatchEvidenceBody,
  buildGlobalLevelRulesBody,
  buildLoginBody,
  buildPartnerLevelRulesBody,
  buildRatesBody,
  buildRejectBody,
  buildReverseBody,
  canReverseEntry,
  deactivationReasonLabel,
  emptyLevelRulesForm,
  evidenceSourceLabel,
  evidenceStatusMeta,
  evidenceTypeLabel,
  currentLocalMonth,
  isIsoDate,
  localIsoDate,
  loginActionErrorText,
  loginEnabledState,
  loginStatusKnown,
  loginStatusMeta,
  normalizeAdminCommissions,
  normalizeAdminPartnerDetail,
  normalizeAttribution,
  normalizeQueueItem,
  parseEuroToCents,
  parsePercentInput,
  partnerDisplayName,
  reversedDecisionIds,
  selectPartnerRows,
  toSalesPartnerApiFilters,
} from "./adminSalesPartnerView.mjs";

const TODAY = "2026-10-06";

function gefuellteRegeln(extra = {}) {
  const f = emptyLevelRulesForm();
  f.validFrom = "2026-11-01";
  f.customerLevels = f.customerLevels.map((s, i) => ({ ...s, threshold: String((i + 1) * 5) }));
  f.packageLevels = f.packageLevels.map((s, i) => ({ ...s, threshold: String((i + 1) * 100) }));
  return { ...f, ...extra };
}

/* ══════════ Eingaben ════════════════════════════════════════════════════ */

test("1 — Prozent: Komma oder Punkt, 0–100, höchstens zwei Stellen, normalisiert", () => {
  assert.deepEqual(parsePercentInput("5"), { ok: true, value: "5.00" });
  assert.deepEqual(parsePercentInput("2,5"), { ok: true, value: "2.50" });
  assert.deepEqual(parsePercentInput(" 27.50 "), { ok: true, value: "27.50" });
  assert.deepEqual(parsePercentInput("100"), { ok: true, value: "100.00" });
  assert.deepEqual(parsePercentInput("", { allowEmpty: true }), { ok: true, value: null });
  assert.equal(parsePercentInput("").ok, false);
  for (const falsch of ["100.01", "101", "-1", "1.234", "abc", "5 %"]) {
    assert.equal(parsePercentInput(falsch).ok, false, `durchgelassen: ${falsch}`);
  }
});

test("2 — Euro-Eingabe ergibt ganze Cent, darf negativ sein, nie 0", () => {
  assert.deepEqual(parseEuroToCents("25"), { ok: true, value: 2500 });
  assert.deepEqual(parseEuroToCents("-12,5"), { ok: true, value: -1250 });
  assert.deepEqual(parseEuroToCents("0,07"), { ok: true, value: 7 });
  assert.equal(parseEuroToCents("0").error, INPUT_TEXTS.amountZero);
  assert.equal(parseEuroToCents("-0,00").error, INPUT_TEXTS.amountZero);
  for (const falsch of ["", "1.234,56", "12,345", "abc", "1e3"]) {
    assert.equal(parseEuroToCents(falsch).ok, false, `durchgelassen: ${falsch}`);
  }
});

test("3 — Datumshilfen", () => {
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("2028-02-29"), true);
  assert.equal(isIsoDate("06.10.2026"), false);
  assert.equal(localIsoDate(new Date(2026, 9, 6, 23, 30)), "2026-10-06");
  assert.equal(currentLocalMonth(new Date(2026, 0, 31, 23, 59)), "2026-01");
});

/* ══════════ Partneraktionen ═════════════════════════════════════════════ */

test("4 — Freigabe: Grundprovision Pflicht, Ebenen nur wenn angegeben (sonst Server-Default)", () => {
  assert.equal(buildApproveBody({ basePercent: "" }).ok, false);
  assert.deepEqual(buildApproveBody({ basePercent: "20" }).body, { basePercent: "20.00" });
  assert.deepEqual(buildApproveBody({ basePercent: "20", level1Percent: "4,5", level2Percent: "" }).body,
    { basePercent: "20.00", level1Percent: "4.50" });
  assert.equal(buildApproveBody({ basePercent: "20", level2Percent: "x" }).errors.level2Percent, INPUT_TEXTS.percentInvalid);
});

test("5 — Ablehnen, Deaktivieren, Login: nur Vertragsfelder", () => {
  assert.deepEqual(buildRejectBody({}).body, {});
  assert.deepEqual(buildRejectBody({ reason: "  Unvollständig " }).body, { reason: "Unvollständig" });
  assert.equal(buildDeactivateBody({ reason: "weil" }).ok, false, "nur Gründe aus der Liste");
  assert.deepEqual(buildDeactivateBody({ reason: "contract_ended", note: "" }).body, { reason: "contract_ended" });
  assert.deepEqual(buildDeactivateBody({ reason: "other", note: " Rückfrage " }).body, { reason: "other", note: "Rückfrage" });
  assert.deepEqual(buildLoginBody(false).body, { enabled: false });
  assert.equal(buildLoginBody("false").ok, false, "kein truthy-String");
});

test("6 — Satzversion: alle drei Sätze Pflicht, gültig ab heute oder später", () => {
  const ok = buildRatesBody({ validFrom: "2026-10-06", basePercent: "21", level1Percent: "5", level2Percent: "2,5" }, { today: TODAY });
  assert.deepEqual(ok.body, { validFrom: "2026-10-06", basePercent: "21.00", level1Percent: "5.00", level2Percent: "2.50" });
  const frueh = buildRatesBody({ validFrom: "2026-10-05", basePercent: "21", level1Percent: "5", level2Percent: "2" }, { today: TODAY });
  assert.equal(frueh.errors.validFrom, INPUT_TEXTS.dateNotBeforeToday);
  assert.equal(buildRatesBody({ validFrom: "2026-10-07", basePercent: "21" }, { today: TODAY }).errors.level1Percent, INPUT_TEXTS.percentRequired);
});

/* ══════════ Level-Regeln ════════════════════════════════════════════════ */

test("7 — das leere Formular belegt Schwellen NICHT vor, Boni und Mindestpakete schon", () => {
  const f = emptyLevelRulesForm();
  assert.deepEqual(DEFAULT_LEVEL_BONUSES, ["2.50", "5.00", "7.50", "10.00", "12.50"]);
  assert.equal(f.minPackagesForActiveCustomer, String(DEFAULT_MIN_PACKAGES));
  assert.equal(f.minPackagesForActiveCustomer, "3");
  for (const dim of ["customerLevels", "packageLevels"]) {
    assert.equal(f[dim].length, 5);
    assert.ok(f[dim].every((s) => s.threshold === ""), `${dim}: Schwelle vorbelegt`);
    assert.deepEqual(f[dim].map((s) => s.bonusPercent), DEFAULT_LEVEL_BONUSES.map((b) => b.replace(".", ",")),
      "Boni im deutschen Zahlformat vorbelegt");
  }
  const leer = buildGlobalLevelRulesBody({ ...f, validFrom: "2026-11-01" }, { today: TODAY });
  assert.equal(leer.ok, false, "leere Schwellen sind Pflicht");
  assert.equal(leer.errors["customerLevels.0.threshold"], INPUT_TEXTS.thresholdRequired);
});

test("8 — Schwellen streng steigend, Boni 0–100, genau fünf Level", () => {
  const ok = buildGlobalLevelRulesBody(gefuellteRegeln({ reason: "Start" }), { today: TODAY });
  assert.equal(ok.ok, true, JSON.stringify(ok.errors));
  assert.equal(ok.body.minPackagesForActiveCustomer, 3);
  assert.deepEqual(ok.body.customerLevels[0], { level: 1, threshold: 5, bonusPercent: "2.50" }, "gesendet wird das Vertragsformat");
  assert.equal(ok.body.packageLevels[4].threshold, 500);
  assert.equal(ok.body.reason, "Start");

  const f = gefuellteRegeln();
  f.customerLevels[2] = { ...f.customerLevels[2], threshold: "10" };   // == Level 2
  assert.equal(buildGlobalLevelRulesBody(f, { today: TODAY }).errors["customerLevels.2.threshold"], INPUT_TEXTS.thresholdOrder);
  const b = gefuellteRegeln();
  b.packageLevels[1] = { ...b.packageLevels[1], bonusPercent: "150" };
  assert.equal(buildGlobalLevelRulesBody(b, { today: TODAY }).errors["packageLevels.1.bonusPercent"], INPUT_TEXTS.percentInvalid);
  const vier = gefuellteRegeln();
  vier.customerLevels = vier.customerLevels.slice(0, 4);
  assert.equal(buildGlobalLevelRulesBody(vier, { today: TODAY }).ok, false);
  assert.equal(buildGlobalLevelRulesBody(gefuellteRegeln({ minPackagesForActiveCustomer: "0" }), { today: TODAY }).ok, false);
});

test("9 — Partnerregeln: „inherit“ trägt keine Stufen, „custom“ die vollständigen", () => {
  const erben = buildPartnerLevelRulesBody({ mode: "inherit", validFrom: "2026-10-06" }, { today: TODAY });
  assert.deepEqual(erben.body, { mode: "inherit", validFrom: "2026-10-06" });
  const eigen = buildPartnerLevelRulesBody(gefuellteRegeln({ mode: "custom" }), { today: TODAY });
  assert.equal(eigen.ok, true);
  assert.equal(eigen.body.mode, "custom");
  assert.equal(eigen.body.customerLevels.length, 5);
  assert.equal(buildPartnerLevelRulesBody({ validFrom: "2026-10-06" }, { today: TODAY }).errors.mode, INPUT_TEXTS.modeRequired);
});

test("10 — Obergrenzen: leer heißt keine Grenze (null)", () => {
  assert.deepEqual(buildCapBody({ validFrom: "2026-10-06" }, { today: TODAY }).body,
    { validFrom: "2026-10-06", maxOwnRatePercent: null, maxTotalRatePercent: null });
  assert.deepEqual(buildCapBody({ validFrom: "2026-10-07", maxOwnRatePercent: "35", maxTotalRatePercent: "40,5", reason: "Q4" }, { today: TODAY }).body,
    { validFrom: "2026-10-07", maxOwnRatePercent: "35.00", maxTotalRatePercent: "40.50", reason: "Q4" });
  assert.equal(buildCapBody({ validFrom: "2026-01-01" }, { today: TODAY }).ok, false);
});

/* ══════════ Provisionen, Zuordnung, Versandnachweis ═════════════════════ */

test("11 — Rücknahme: Begründung Pflicht, reprocess nur als echtes true", () => {
  assert.equal(buildReverseBody({ reason: " " }).ok, false);
  assert.deepEqual(buildReverseBody({ reason: "Storno", reprocess: "true" }).body, { reason: "Storno", reprocess: false });
  assert.deepEqual(buildReverseBody({ reason: "Storno", reprocess: true }).body, { reason: "Storno", reprocess: true });
});

test("12 — Korrekturbuchung: Betrag ≠ 0 in Cent, Begründung Pflicht, Sendung optional", () => {
  assert.deepEqual(buildAdjustmentBody({ partnerUserId: "42", amount: "-12,50", reason: "Gutschrift" }).body,
    { partnerUserId: 42, amountCents: -1250, reason: "Gutschrift" });
  assert.deepEqual(buildAdjustmentBody({ partnerUserId: 42, amount: "5", reason: "x", shipmentId: "77" }).body,
    { partnerUserId: 42, amountCents: 500, reason: "x", shipmentId: 77 });
  const kaputt = buildAdjustmentBody({ partnerUserId: 0, amount: "0", reason: "", shipmentId: "abc" });
  assert.deepEqual(Object.keys(kaputt.errors).sort(), ["amount", "partnerUserId", "reason", "shipmentId"]);
});

test("13 — Zuordnung: Partner aus der Liste oder Entfernen; Datum ab heute; Begründung Pflicht", () => {
  assert.deepEqual(buildAttributionBody({ partnerUserId: "7", effectiveDate: "2026-10-06", reason: "Wechsel" }, { today: TODAY }).body,
    { partnerUserId: 7, effectiveDate: "2026-10-06", reason: "Wechsel" });
  assert.deepEqual(buildAttributionBody({ remove: true, effectiveDate: "2026-10-08", reason: "Ende" }, { today: TODAY }).body,
    { partnerUserId: null, effectiveDate: "2026-10-08", reason: "Ende" });
  const r = buildAttributionBody({ partnerUserId: "", effectiveDate: "2026-10-01", reason: "" }, { today: TODAY });
  assert.deepEqual(Object.keys(r.errors).sort(), ["effectiveDate", "partnerUserId", "reason"]);
});

test("14 — Versandnachweis: „Versendet“ verlangt Datum (nicht in der Zukunft) und Nachweisart", () => {
  const ok = buildDispatchEvidenceBody({ status: "dispatched", dispatchDate: "2026-10-05", evidenceType: "carrier_portal", note: "Im Portal gesehen" }, { today: TODAY });
  assert.deepEqual(ok.body, { status: "dispatched", note: "Im Portal gesehen", dispatchDate: "2026-10-05", evidenceType: "carrier_portal" });
  const ohne = buildDispatchEvidenceBody({ status: "dispatched", note: "x" }, { today: TODAY });
  assert.deepEqual(Object.keys(ohne.errors).sort(), ["dispatchDate", "evidenceType"]);
  assert.equal(buildDispatchEvidenceBody({ status: "dispatched", dispatchDate: "2026-10-07", evidenceType: "other", note: "x" }, { today: TODAY })
    .errors.dispatchDate, INPUT_TEXTS.dateInFuture);
  assert.deepEqual(buildDispatchEvidenceBody({ status: "not_dispatched", dispatchDate: "2026-10-05", evidenceType: "other", note: " Zurück " }, { today: TODAY }).body,
    { status: "not_dispatched", note: "Zurück" }, "Datum und Art nur bei „Versendet“");
  assert.equal(buildDispatchEvidenceBody({ status: "unclear", note: "" }, { today: TODAY }).errors.note, INPUT_TEXTS.noteRequired);
  assert.equal(buildDispatchEvidenceBody({ status: "lost", note: "x" }, { today: TODAY }).errors.status, INPUT_TEXTS.decisionRequired);
});

/* ══════════ Labels und Normalisierung ═══════════════════════════════════ */

test("15 — Labels ohne Rohwerte", () => {
  // loginStatus ist users.status: genau pending | approved | blocked | anonymized.
  assert.deepEqual([...loginStatusMeta("approved")], ["badge-green", "Login aktiv"]);
  assert.deepEqual([...loginStatusMeta("blocked")], ["badge-red", "Login gesperrt"]);
  assert.deepEqual([...loginStatusMeta("pending")], ["badge-yellow", "Noch kein Login"]);
  assert.equal(loginEnabledState("approved"), true, "aktiv: Aktion „sperren“");
  assert.equal(loginEnabledState("blocked"), false, "gesperrt: Aktion „entsperren“");
  assert.equal(loginEnabledState("pending"), null, "noch kein Login: keine Aktion");
  // anonymized und alles Unbekannte: statusFallback, keine Aktion (fail-closed) —
  // ausdrücklich auch die früher geratenen Aliasse.
  for (const wert of ["anonymized", "enabled", "active", "disabled", "inactive", "strange", "constructor", "__proto__", "toString"]) {
    const [, label, roh] = loginStatusMeta(wert);
    assert.equal(label, "Unbekannter Status", `${wert} wird zugeordnet`);
    assert.equal(roh, wert, "der Rohwert steht nur im title");
    assert.equal(loginEnabledState(wert), null, `${wert}: Login-Aktion angeboten`);
    assert.equal(loginStatusKnown(wert), false);
  }
  assert.deepEqual(loginStatusMeta(null), ["badge-gray", "—", null]);
  assert.equal(loginStatusKnown("pending"), true);
  assert.equal(deactivationReasonLabel("contract_ended"), "Vertrag beendet");
  assert.equal(deactivationReasonLabel("x"), "Unbekannter Grund");
  assert.equal(attributionSourceLabel("referral_link"), "Empfehlungslink");
  assert.equal(attributionSourceLabel("admin_assignment"), "Zuordnung durch Admin");
  assert.deepEqual(evidenceStatusMeta(null), ["badge-yellow", "Nachweis fehlt"]);
  assert.equal(evidenceStatusMeta("unclear")[1], "Ungeklärt");
  assert.equal(evidenceStatusMeta("weird")[1], "Unbekannter Status");
  assert.equal(evidenceTypeLabel("handover_receipt"), "Übergabebeleg");
  assert.equal(evidenceSourceLabel("carrier_tracking"), "Sendungsverfolgung");
});

test("15b — Login-Aktion: Konfliktcodes des Servers mit eigenem Text", () => {
  assert.match(loginActionErrorText(409, { code: "SALES_PARTNER_NOT_APPROVED", error: "x" }), /erst nach der Freigabe/);
  assert.match(loginActionErrorText(409, { code: "ACCOUNT_ANONYMIZED", error: "x" }), /anonymisiert/);
  assert.equal(loginActionErrorText(409, { code: "ANDERS", error: "Serverhinweis" }), "Serverhinweis");
  assert.match(loginActionErrorText(500, { code: "ACCOUNT_ANONYMIZED" }), /nicht ausgeführt/, "Codes nur bei 409");
  for (const meta of [loginStatusMeta("approved"), evidenceStatusMeta("unclear")]) {
    assert.ok(Array.isArray(meta) && meta.length >= 2);
  }
  // Auch die übrigen Zuordnungen lesen nur eigene Schlüssel.
  assert.equal(evidenceStatusMeta("constructor")[1], "Unbekannter Status");
});

test("16 — Filter: nur bekannte Statuswerte, Suche getrimmt", () => {
  assert.deepEqual(toSalesPartnerApiFilters({ status: "pending", q: "  acme " }), { status: "pending", q: "acme" });
  assert.deepEqual(toSalesPartnerApiFilters({ status: "anonymized", q: "" }), {});
});

test("17 — Liste und Detail werden defensiv gelesen", () => {
  const rows = selectPartnerRows({ partners: [{ id: 5, name: "Petra", companyName: "Vertrieb Süd", status: "active",
    customersCount: 4, packagesLastMonth: 120, teamLevel1Count: 2, teamLevel2Count: 1, ownRatePercent: "27.50" }, null] });
  assert.equal(rows.length, 1);
  assert.equal(partnerDisplayName(rows[0]), "Vertrieb Süd");
  const d = normalizeAdminPartnerDetail({ partner: { id: 5, name: "Petra", sponsor: { id: 2, name: "Sam" } },
    levelRules: { mode: "custom", current: { id: 9, validFrom: "2026-10-01", customerLevels: [{ level: 1, threshold: 5, bonusPercent: "2.50" }] } } });
  assert.deepEqual(d.partner.sponsor, { id: 2, name: "Sam" });
  assert.equal(d.levelRules.mode, "custom");
  assert.equal(d.levelRules.current.customerLevels[0].threshold, 5);
  assert.deepEqual(d.team, { level1: [], level2: [] });
  assert.equal(normalizeAdminPartnerDetail(null).rates.current, null);
});

test("17b — akzeptierte Vereinbarung: nur ein Dokumentpfad auf diese API wird verlinkt", () => {
  const mit = normalizeAdminPartnerDetail({ partner: { id: 5, agreementVersion: "1.0",
    agreementDocumentPath: "/api/legal/sales_partner_agreement/1.0" } });
  assert.equal(mit.partner.agreementDocumentPath, "/api/legal/sales_partner_agreement/1.0");
  for (const fremd of ["https://example.com/x.pdf", "//example.com/x.pdf", "javascript:alert(1)", "", null, 7]) {
    const d = normalizeAdminPartnerDetail({ partner: { id: 5, agreementVersion: "1.0", agreementDocumentPath: fremd } });
    assert.equal(d.partner.agreementDocumentPath, null, `${JSON.stringify(fremd)} durchgelassen`);
  }
  assert.equal(normalizeAdminPartnerDetail({ partner: { id: 5 } }).partner.agreementDocumentPath, null);
});

test("18 — Rücknahme nur für Provisionsbuchungen mit offener Entscheidung", () => {
  const c = normalizeAdminCommissions({ month: "2026-10", entries: [
    { id: 1, decisionId: 11, type: "accrual", amountCents: 100 },
    { id: 2, decisionId: 12, type: "accrual", amountCents: 100 },
    { id: 3, decisionId: 12, type: "reversal", amountCents: -100 },
    { id: 4, decisionId: null, type: "adjustment", amountCents: 50 },
  ] });
  const zurueck = reversedDecisionIds(c.entries);
  assert.equal(canReverseEntry(c.entries[0], zurueck), true);
  assert.equal(canReverseEntry(c.entries[1], zurueck), false, "bereits zurückgenommen");
  assert.equal(canReverseEntry(c.entries[3], zurueck), false, "Korrekturen haben keine Entscheidung");
});

test("19 — Queue und Zuordnung", () => {
  assert.equal(normalizeQueueItem({ provider: "transglobal" }), null, "ohne Sendung keine Zeile");
  const q = normalizeQueueItem({ shipmentId: 77, trackingReferences: ["1Z1", "", 5], evidenceStatus: null });
  assert.deepEqual(q.trackingReferences, ["1Z1"]);
  assert.equal(q.evidenceStatus, null);
  const a = normalizeAttribution({ current: { partnerId: 5, partnerName: "Petra", validFrom: "2026-10-01", source: "referral_link" }, history: [{}] });
  assert.equal(a.current.partnerName, "Petra");
  assert.equal(a.history.length, 1);
  assert.equal(normalizeAttribution(null).current, null);
});

test("20 — Fehlertexte: Servertext nur bei Eingabe-/Konfliktfehlern", () => {
  assert.equal(adminActionErrorText(409, { error: "Partner ist bereits aktiv.", code: "X" }), "Partner ist bereits aktiv.");
  assert.match(adminActionErrorText(404, { error: "intern" }), /nicht gefunden/);
  assert.match(adminActionErrorText(500, { error: "TypeError" }), /nicht ausgeführt/);
  assert.match(adminActionErrorText(400, {}), /nicht ausgeführt/);
});
