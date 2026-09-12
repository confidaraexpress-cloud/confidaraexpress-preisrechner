// Tests für die Logik der Buchungsklärung (Admin): Anzeige-Meta, kanonische
// Normalisierung, Aktionsfähigkeit mit Wartezeit, Bestätigungsvertrag und die
// Übersetzung der Serverantworten.
// Läuft über Node's eingebauten Test-Runner:
//   node --test src/utils/adminReconciliation.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RECONCILIATION_PROVIDER_FILTER_OPTIONS,
  providerLabel,
  toReconciliationApiFilters,
  reconciliationStateMeta,
  resolutionMeta,
  inventoryStateLabel,
  driftKindLabel,
  REVIEW_CODE_OPTIONS,
  normalizeReconciliationAttempt,
  selectReconciliationRows,
  finalActionAvailability,
  formatCountdown,
  tooEarlyText,
  confirmBookedRequirements,
  validateProviderReferenceInput,
  buildConfirmBookedBody,
  reconciliationActionError,
  reconciliationActionSuccess,
  reconciliationEmptyState,
  attemptLabel,
  RECONCILIATION_DIALOGS,
} from "./adminReconciliation.mjs";

const ROH = (over = {}) => ({
  bookingAttemptId: 77, shipmentId: 4711, userId: 9, provider: "jumingo", attempt: 1,
  state: "ambiguous", ambiguousReason: "TimeoutError", createdAt: "2026-09-12T10:00:00Z",
  yourReference: "CE-0123456789abcdef", providerBookingReference: null, providerFailReference: null,
  customerGross: "28.56", currency: "EUR", pricingClass: "EXPRESS", appliedMarkupPercent: 20,
  snapshotComplete: true, hasCompletionInputs: true, legalFrozen: false,
  insuranceSelected: false, insuranceConfirmation: null, invoiceDrift: null,
  shipmentStatus: "booking", inventoryState: "not_applicable",
  isLatest: true, actionableAt: "2026-09-12T10:02:00Z", retryAfterSeconds: 45, actionable: false,
  resolution: null, resolvedAt: null, resolvedBy: null,
  ...over,
});

// ── Anbieter ─────────────────────────────────────────────────────────────────
test("Anbieterfilter: nur die beiden kanonischen Werte werden gesendet", () => {
  assert.deepEqual(RECONCILIATION_PROVIDER_FILTER_OPTIONS.map((o) => o.value), ["", "transglobal", "jumingo"]);
  assert.deepEqual(toReconciliationApiFilters("jumingo"), { provider: "jumingo" });
  assert.deepEqual(toReconciliationApiFilters(""), {}, "„Alle“ sendet keinen Filter");
  for (const falsch of ["JUMINGO", " transglobal", "dhl", "constructor", null, undefined]) {
    assert.deepEqual(toReconciliationApiFilters(falsch), falsch === " transglobal" ? { provider: "transglobal" } : {},
      String(falsch));
  }
  assert.equal(providerLabel("transglobal"), "Transglobal");
  assert.equal(providerLabel("toString"), "Unbekannter Anbieter", "kein Treffer über die Prototypkette");
});

// ── Anzeige-Meta ─────────────────────────────────────────────────────────────
test("Providerausgang und Entscheidung sind getrennte, übersetzte Aussagen — nie ein Rohwert", () => {
  assert.deepEqual(reconciliationStateMeta("ambiguous"), ["badge-yellow", "Ausgang unklar"]);
  assert.deepEqual(reconciliationStateMeta("not_booked"), ["badge-gray", "Anbieter: nicht gebucht"]);
  assert.deepEqual(resolutionMeta(null), ["badge-yellow", "Ungeklärt"]);
  assert.deepEqual(resolutionMeta("confirmed_booked"), ["badge-green", "Als gebucht bestätigt"]);
  for (const unbekannt of ["weird_state", "provider_raw_FAIL"]) {
    assert.equal(reconciliationStateMeta(unbekannt)[1], "Unbekannter Status");
    assert.equal(resolutionMeta(unbekannt)[1], "Unbekannter Status");
  }
  assert.equal(inventoryStateLabel("reserved_and_consumed"), "Widerspruch: reserviert und verbraucht");
  assert.equal(driftKindLabel("provider_charged_more"), "Anbieter berechnet mehr als erwartet");
  assert.deepEqual(REVIEW_CODE_OPTIONS.map((o) => o.value), [
    "awaiting_provider_reply", "awaiting_carrier_confirmation", "evidence_inconclusive", "escalated_internally", "other",
  ], "die Prüfvermerke entsprechen exakt der serverseitigen Liste");
  assert.equal(attemptLabel({ id: 77 }), "Versuch #77");
});

// ── Normalisierung ──────────────────────────────────────────────────────────
test("Normalisierung: Zahlen als Zahlen, Wahrheitswerte strikt, der Aufschlagssatz wird nicht übernommen", () => {
  const a = normalizeReconciliationAttempt(ROH());
  assert.equal(a.id, 77);
  assert.equal(a.customerGross, 28.56);
  assert.equal(a.retryAfterSeconds, 45);
  assert.equal(a.actionable, false);
  assert.equal("appliedMarkupPercent" in a, false);
  assert.equal(normalizeReconciliationAttempt(ROH({ isLatest: "true" })).isLatest, false, "nur ein echtes true zählt");
  assert.equal(normalizeReconciliationAttempt({ provider: "jumingo" }), null, "ohne Kennung kein Versuch");
  const mitDrift = normalizeReconciliationAttempt(ROH({ invoiceDrift: {
    kind: "provider_charged_more", expectedNet: "20.00", actualNet: "22.52", deltaNet: "2.52",
    detectedAt: "2026-09-12T10:01:00Z", alertedAt: null, reviewedAt: null, reviewedBy: null } }));
  assert.equal(mitDrift.invoiceDrift.deltaNet, 2.52);
  assert.equal(normalizeReconciliationAttempt(ROH({ invoiceDrift: { kind: null } })).invoiceDrift, null);
  assert.deepEqual(selectReconciliationRows({ items: [ROH(), { foo: 1 }] }).map((r) => r.id), [77]);
  assert.deepEqual(selectReconciliationRows(null), []);
});

// ── Aktionsfähigkeit ────────────────────────────────────────────────────────
test("vor Ablauf des Mindestalters: gesperrt mit Restzeit — danach angeboten; der Server bleibt Autorität", () => {
  const a = normalizeReconciliationAttempt(ROH({ retryAfterSeconds: 45, actionable: false }));
  assert.deepEqual(finalActionAvailability(a, 0), { available: false, reason: "too_early", remainingSeconds: 45 });
  assert.deepEqual(finalActionAvailability(a, 44.2), { available: false, reason: "too_early", remainingSeconds: 1 });
  assert.deepEqual(finalActionAvailability(a, 45), { available: true, reason: null, remainingSeconds: 0 });
  // Ohne Wartezeit: das volle Mindestalter — nie „sofort".
  const ohne = normalizeReconciliationAttempt(ROH({ retryAfterSeconds: null, actionable: false }));
  assert.equal(finalActionAvailability(ohne, 0).remainingSeconds, 120);
  assert.deepEqual(finalActionAvailability(normalizeReconciliationAttempt(ROH({ actionable: true, retryAfterSeconds: 0 }))),
    { available: true, reason: null, remainingSeconds: 0 });
});

test("überholt, entschieden, verwaist oder nicht mehr gesperrt: nie aktionsfähig — auch nicht nach Ablauf", () => {
  const faelle = [
    [{ isLatest: false }, "superseded"],
    [{ resolution: "confirmed_not_booked" }, "resolved"],
    [{ shipmentId: null }, "orphaned"],
    [{ shipmentStatus: "draft" }, "not_booking"],
    [{ shipmentStatus: "booked" }, "not_booking"],
  ];
  for (const [over, grund] of faelle) {
    const a = normalizeReconciliationAttempt(ROH({ ...over, actionable: false, retryAfterSeconds: 0 }));
    assert.deepEqual(finalActionAvailability(a, 9999), { available: false, reason: grund, remainingSeconds: 0 }, grund);
  }
  assert.equal(finalActionAvailability(null).available, false);
});

test("Wartezeit ist lesbar formatiert", () => {
  assert.equal(formatCountdown(45), "45 s");
  assert.equal(formatCountdown(120), "2:00 min");
  assert.equal(formatCountdown(65.2), "1:06 min");
  assert.equal(formatCountdown(-3), "0 s");
  assert.match(tooEarlyText(90), /1:30 min/);
});

// ── „Als gebucht bestätigen" ────────────────────────────────────────────────
test("Referenz nur ohne gespeicherte Anbieterreferenz; Absicherungsaussage nur bei unbestätigter TG-Absicherung", () => {
  assert.deepEqual(confirmBookedRequirements(normalizeReconciliationAttempt(ROH())),
    { providerReferenceRequired: true, storedProviderReference: null, insuranceDecisionRequired: false });
  assert.equal(confirmBookedRequirements(normalizeReconciliationAttempt(ROH({ providerBookingReference: "JO-1" }))).providerReferenceRequired, false);
  const tg = (over) => confirmBookedRequirements(normalizeReconciliationAttempt(ROH({ provider: "transglobal", ...over })));
  assert.equal(tg({ insuranceSelected: true, insuranceConfirmation: null }).insuranceDecisionRequired, true);
  assert.equal(tg({ insuranceSelected: true, insuranceConfirmation: "confirmed" }).insuranceDecisionRequired, false);
  assert.equal(tg({ insuranceSelected: false }).insuranceDecisionRequired, false);
  // JUMiNGO kennt keine Absicherungsaussage — der Server lehnt sie ab.
  assert.equal(confirmBookedRequirements(normalizeReconciliationAttempt(ROH({ insuranceSelected: true }))).insuranceDecisionRequired, false);
});

test("die Referenzprüfung folgt der Serverregel", () => {
  assert.deepEqual(validateProviderReferenceInput("  JO-77001/A_1 "), { ok: true, value: "JO-77001/A_1", message: null });
  for (const falsch of ["", "   ", "JO 1", "-JO", "https://x", "a".repeat(65), null]) {
    assert.equal(validateProviderReferenceInput(falsch).ok, false, String(falsch));
  }
});

test("der Bestätigungsbody enthält genau das Verlangte — und nie ein unvollständiges Paket", () => {
  const nurReferenz = { providerReferenceRequired: true, insuranceDecisionRequired: false };
  assert.deepEqual(buildConfirmBookedBody({ requirements: nurReferenz, providerReference: " JO-1 " }),
    { confirm: true, providerReference: "JO-1" });
  assert.throws(() => buildConfirmBookedBody({ requirements: nurReferenz, providerReference: "" }), /provider_reference_invalid/);
  const mitAbsicherung = { providerReferenceRequired: false, insuranceDecisionRequired: true };
  assert.deepEqual(buildConfirmBookedBody({ requirements: mitAbsicherung, insuranceConfirmed: false }),
    { confirm: true, insuranceConfirmed: false }, "false ist eine vollwertige Aussage");
  assert.throws(() => buildConfirmBookedBody({ requirements: mitAbsicherung, insuranceConfirmed: null }), /insurance_decision_missing/);
  assert.deepEqual(buildConfirmBookedBody({ requirements: { providerReferenceRequired: false }, providerReference: "JO-1" }),
    { confirm: true }, "eine gespeicherte Referenz wird nicht überschrieben");
});

// ── Serverantworten ──────────────────────────────────────────────────────────
test("409 too_early trägt die Wartezeit; Konflikte empfehlen Neuladen; kein Rohcode im Text", () => {
  const frueh = reconciliationActionError(409, { error: "x", code: "attempt_too_recent", retryAfterSeconds: 37 });
  assert.equal(frueh.kind, "too_early");
  assert.equal(frueh.retryAfterSeconds, 37);
  assert.equal(frueh.reloadRecommended, false);
  const konflikt = reconciliationActionError(409, { code: "already_resolved" });
  assert.equal(konflikt.kind, "conflict");
  assert.equal(konflikt.reloadRecommended, true);
  const vor = reconciliationActionError(422, { code: "invoice_not_issuable", missingFields: ["customer.vatId", 5] });
  assert.equal(vor.kind, "precondition");
  assert.deepEqual(vor.missingFields, ["customer.vatId"]);
  assert.equal(reconciliationActionError(400, { error: "confirmation_required" }).code, "confirmation_required");
  const unbekannt = reconciliationActionError(409, { code: "brand_new_code" });
  assert.equal(unbekannt.message.includes("brand_new_code"), false, "ein unbekannter Code erscheint nie im Text");
  assert.equal(reconciliationActionError(500, {}).message, "Die Aktion ist fehlgeschlagen. Bitte erneut versuchen.");
  assert.equal(reconciliationActionError(404, {}).kind, "not_found");
  assert.equal(reconciliationActionError(429, {}).kind, "rate_limited");
  for (const [code] of [["attempt_snapshot_changed"], ["contradictory_not_booked_evidence"], ["resource_busy"], ["customs_not_supported"]]) {
    assert.ok(!/_/.test(reconciliationActionError(409, { code }).message), `${code}: technischer Bezeichner im Text`);
  }
});

test("Erfolgsmeldungen unterscheiden Entscheidung, Wiederholung, Prüfvermerk und Rechnungsabweichung", () => {
  assert.match(reconciliationActionSuccess({ status: "resolved", resolution: "confirmed_booked" }).message, /Rechnung/);
  assert.match(reconciliationActionSuccess({ status: "resolved", resolution: "confirmed_booked", alreadyResolved: true }).message,
    /Nacharbeiten wurden erneut angestoßen/);
  assert.match(reconciliationActionSuccess({ status: "resolved", resolution: "confirmed_not_booked" }).message, /neutralen Hinweis/);
  assert.match(reconciliationActionSuccess({ status: "reviewed", resolution: null }).message, /bleibt offen/);
  assert.match(reconciliationActionSuccess({ status: "reviewed", invoiceDriftReviewedAt: "x" }).message, /als geprüft vermerkt/);
  assert.match(reconciliationActionSuccess({ status: "reviewed", invoiceDriftReviewedAt: "x", alreadyReviewed: true }).message, /bereits/);
});

test("Dialoge sagen ausdrücklich: kein Anbieterkontakt, keine Stornierung", () => {
  assert.match(RECONCILIATION_DIALOGS.booked.text, /kein Anbieter kontaktiert/);
  assert.match(RECONCILIATION_DIALOGS.notBooked.text, /nichts storniert und kein Anbieter kontaktiert/);
  assert.match(RECONCILIATION_DIALOGS.drift.text, /unverändert erhalten/);
});

test("Leerzustand unterscheidet Filter und Gesamtbestand", () => {
  assert.equal(reconciliationEmptyState({ count: 2 }).show, false);
  assert.notEqual(reconciliationEmptyState({ count: 0 }).title, reconciliationEmptyState({ count: 0, provider: "jumingo" }).title);
});
