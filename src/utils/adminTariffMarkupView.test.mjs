// Versandpreise optimieren (Adminbereich, Preisoptimierung 2026-11-17) — Tests.
//
// Zwei Ebenen (wie customerMarkup.test.mjs, das Repo hat keine React-Render-Testinfrastruktur):
//   A) Verhalten: die reine Logik aus utils/adminTariffMarkupView.mjs (Datenmodell je Tarif und Gewichtsklasse,
//      Änderungserkennung 0–100 % ohne Untergrenze, Gewinnvorschau aus der Serverprojektion, Zustände, Verlauf, Fehlertexte).
//   B) Contract: Quelltext von API-Wrapper, Komponente und Seite — Pfade und Bodies, keine Preisformel im Browser,
//      Providerkontakt nur hinter den zwei Buttons, Speichern nur aus dem Bestätigungsdialog.
//
// Run: node --test src/utils/adminTariffMarkupView.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  TARIFF_TEXTS, STATUS_VIEW, selectTariffMarkups, countOverrides, savedOverride, savedEffective,
  parseTariffInput, tariffInputValue, draftValue, draftKey, tariffDraftChanges, buildTariffEntriesBody, sourceText,
  formatCents, formatSignedCents, formatPercent, distanceText, kgText, comparisonBaseStatus, selectComparison,
  projectionClass, hasSameDay, exampleSample, statusOf, statusText, profitRow, tariffSummary,
  rangeText, changeWarnings, selectTariffHistory, historyRevert, historyValue, customRows,
  destinationOptions, parseCustomPackageInput, tariffSaveError, comparisonError, formatDay, TARIFF_SAVE_ERRORS,
  weightTabLabel, fieldHint, reliableRecommendation, noRecommendationText, classMetrics, classWarnings,
  earningsWarning, WARNING_VIEW, NO_EARNINGS_TEXTS,
  RELATION_VIEW, VERDICT_TEXTS, tariffAreas, areaCandidates, extraComparedWith, commonScenarioId, pairLink, verdictOf,
  chanceLine, chanceText, advantageText, scenarioOf, bestChanceCents,
} from "./adminTariffMarkupView.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

const KLASSEN = [[1, "bis 5 kg"], [2, "über 5 bis 10 kg"], [3, "über 10 bis 20 kg"], [4, "über 20 kg"]];
const tarif = (provider, productKey, label, { alle = null, klassen = {}, erbt = 20, quelle = "standard" } = {}) => ({
  provider, productKey, kind: provider === "transglobal" ? "product" : "register", label, carrier: "UPS", pricingClass: "STANDARD", note: null,
  inheritedPercent: erbt, inheritedSource: quelle,
  allWeights: { overridePercent: alle, effectivePercent: alle ?? erbt, source: alle === null ? quelle : "all_weights", setAt: null, setBy: null },
  classes: KLASSEN.map(([wc, l]) => {
    const eigen = Object.prototype.hasOwnProperty.call(klassen, wc) ? klassen[wc] : null;
    return { weightClass: wc, label: l, overridePercent: eigen, effectivePercent: eigen ?? alle ?? erbt,
      source: eigen !== null ? "weight_class" : alle !== null ? "all_weights" : quelle, setAt: null, setBy: null };
  }),
});
const ANTWORT = {
  userId: 7, minimumMarkupPercent: 0, account: { standardPercent: 20, expressPercent: 30 },
  products: [{ productKey: 22, label: "UPS Standard" }],
  tariffs: [
    tarif("transglobal", 22, "UPS Standard", { alle: 0 }),                    // Bestandswert 0 % für alle Gewichte
    tarif("transglobal", 23, "UPS Express Saver", { klassen: { 2: 40 }, erbt: 30, quelle: "express" }),
    tarif("jumingo", 1, "UPS Standard"),
    { provider: "dhl", productKey: 9, label: "fremd", classes: [] },          // unbekannte Quelle fällt weg
  ],
  comparison: { destinations: [{ country: "AT", hasExampleAddress: true }, { country: "de", hasExampleAddress: true }, { country: "BG", hasExampleAddress: false }], maxAgeHours: 24 },
};
const daten = () => selectTariffMarkups(ANTWORT);

const probe = (id, kg, own, cmp, x = {}) => ({
  scenarioId: id, weightKg: kg, chargeableKg: kg,
  own: own ? { purchaseNetCents: own[0], customerNetCents: own[1], contributionCents: own[1] - own[0], pickupDate: "2026-11-18" } : null,
  comparison: cmp ? { relation: "equivalent", provider: "jumingo", label: "UPS Standard", tariffId: "3708", purchaseNetCents: cmp[0], ratePercent: 20, customerNetCents: cmp[1], pickupDate: "2026-11-18" } : null,
  reason: own ? (cmp ? null : "no_comparable") : "own_unavailable", upperBoundPercent: cmp ? 45 : null, belowFloor: false,
  differencePercent: own && cmp ? Math.round(((own[1] - cmp[1]) * 10000) / cmp[1]) / 100 : null, ...x,
});
const klasse = (wc, x = {}) => ({
  weightClass: wc, saved: { percent: 20, source: "standard", overridePercent: null }, effective: { percent: 20, source: "standard" }, draft: null,
  status: "more_profit", comparisonStatus: "more_profit", hint: null, currentPercent: 20, upperBoundPercent: 45,
  recommendedPercent: 35, suggestedPercent: 35, belowFloor: false, limitingScenarioId: "w5", exampleScenarioId: "w5", comparedSamples: 2, totalSamples: 2,
  samples: [
    probe("w2", 2, [938, 1126], [1158, 1390], { atRecommended: { percent: 35, customerNetCents: 1266, contributionCents: 328, differencePercent: -8.92 } }),
    probe("w5", 5, [1062, 1274], [1300, 1560], { atRecommended: { percent: 35, customerNetCents: 1434, contributionCents: 372, differencePercent: -8.08 } }),
  ],
  ...x,
});
const PROJEKTION = {
  runId: "41", kind: "standard", createdAt: "2026-11-17T09:12:00.000Z", expiresAt: "2099-01-01T00:00:00.000Z", destinationCountry: "DE",
  collectionDate: "2026-11-18", scenarios: [{ id: "w2", weightClass: 1 }, { id: "w5", weightClass: 1 }], sameDayReference: { productKey: 22, feeNetCents: 390 },
  tariffs: [
    { provider: "transglobal", productKey: 22, label: "UPS Standard", classes: [
      klasse(1, { sameDay: { feeNetCents: 390, ...klasse(1, { status: "good", comparisonStatus: "good", recommendedPercent: 25, suggestedPercent: null }) } }),
      klasse(2, { status: "good", comparisonStatus: "good", suggestedPercent: null, recommendedPercent: 25 }),
      klasse(3, { status: "no_comparison", comparisonStatus: "no_comparison", recommendedPercent: null, suggestedPercent: null, comparedSamples: 0, exampleScenarioId: "w2",
        samples: [probe("w2", 12, [1500, 1800], null)] }),
      klasse(4, { status: "at_risk", comparisonStatus: "at_risk", hint: "other_provider_cheaper", suggestedPercent: null, recommendedPercent: 25 }),
    ] },
    { provider: "transglobal", productKey: 23, label: "UPS Express Saver", classes: [1, 2, 3, 4].map((wc) => klasse(wc, { status: "good", comparisonStatus: "good", suggestedPercent: null })) },
    { provider: "jumingo", productKey: 1, label: "UPS Standard", classes: [1, 2, 3, 4].map((wc) => klasse(wc, {
      samples: [probe("w2", 2, [938, 1126], [1158, 1390], { atRecommended: { percent: 35, customerNetCents: 1500, contributionCents: 562, differencePercent: 7.9 } }),
        probe("w5", 5, [1062, 1274], [1300, 1560], { atRecommended: { percent: 35, customerNetCents: 1700, contributionCents: 638, differencePercent: 9 } })],
    })) },
  ],
};

// ── A) Verhalten ────────────────────────────────────────────────────────────
test("Datenmodell: 3 Tarife mit je vier Klassen, unbekannte Quelle verworfen, alte Antwortform → null", () => {
  const d = daten();
  assert.deepEqual(d.tariffs.map((t) => t.id), ["transglobal:22", "transglobal:23", "jumingo:1"]);
  assert.ok(!("minimumMarkupPercent" in d), "das Feld wird nicht mehr gelesen (keine Untergrenze, v2.142)");
  assert.deepEqual(d.tariffs[0].classes.map((c) => c.weightClass), [1, 2, 3, 4]);
  assert.equal(d.tariffs[0].allWeights.overridePercent, 0, "0 ist ein echter Bestandswert");
  assert.deepEqual(d.comparison.destinations.map((x) => x.country), ["AT", "DE", "BG"]);
  assert.equal(selectTariffMarkups({ products: ANTWORT.products }), null, "Antwort vor der Preisoptimierung");
  assert.equal(selectTariffMarkups(null), null);
  assert.equal(countOverrides(d.tariffs), 2);
  assert.equal(savedOverride(d.tariffs[1], 2), 40);
  assert.equal(savedOverride(d.tariffs[1], 0), null);
  assert.deepEqual(savedEffective(d.tariffs[1], 3), { percent: 30, source: "express" });
  assert.equal(sourceText("all_weights"), "Satz für alle Gewichte");
  assert.equal(sourceText("weight_class"), "eigener Satz für dieses Gewicht");
});

test("Änderungen: nur echte Abweichungen; Bestandswert 0 % bleibt unangetastet; jeder Satz von 0 bis 100 % ist speicherbar", () => {
  const d = daten();
  const k = (p, key, wc) => draftKey(p, key, wc);
  assert.equal(draftValue({}, d.tariffs[0], 0), tariffInputValue(0), "Feld zeigt den Bestandswert");
  // Unverändert erneut eingegeben (auch als „0“) → keine Änderung, kein Eintrag.
  let c = tariffDraftChanges(d.tariffs, { [k("transglobal", 22, 0)]: "0" });
  assert.equal(c.count, 0);
  assert.deepEqual(c.invalid, {});
  // Neu gesetzt, geändert, entfernt.
  c = tariffDraftChanges(d.tariffs, { [k("transglobal", 22, 1)]: "35", [k("transglobal", 23, 2)]: "", [k("jumingo", 1, 4)]: "40,5" });
  assert.deepEqual(c.entries, [
    { provider: "transglobal", productKey: 22, weightClass: 1, markupPercent: 35 },
    { provider: "transglobal", productKey: 23, weightClass: 2, markupPercent: null },
    { provider: "jumingo", productKey: 1, weightClass: 4, markupPercent: 40.5 },
  ]);
  assert.deepEqual(c.invalid, {});
  // Keine Untergrenze (v2.142): Bestandswert 0 % auf 10 % ändern ist eine gewöhnliche Änderung — nichts gesperrt.
  c = tariffDraftChanges(d.tariffs, { [k("transglobal", 22, 0)]: "10" });
  assert.deepEqual(c.entries, [{ provider: "transglobal", productKey: 22, weightClass: 0, markupPercent: 10 }]);
  assert.deepEqual(c.invalid, {});
  assert.ok(!("floor" in c), "keine Untergrenzenfälle mehr");
  // Jeder Satz von 0 bis 100 % mit höchstens zwei Nachkommastellen, für jede Klasse und „alle Gewichte“; 0 bleibt 0.
  for (const [roh, wert] of [["0", 0], ["0,01", 0.01], ["5", 5], ["10", 10], ["17,55", 17.55], ["20", 20], ["24,99", 24.99], ["25", 25], ["40", 40], ["100", 100]]) {
    c = tariffDraftChanges(d.tariffs, { [k("transglobal", 22, 2)]: roh, [k("jumingo", 1, 0)]: roh });
    assert.deepEqual(c.entries.map((e) => e.markupPercent), [wert, wert], roh);
    assert.deepEqual(c.invalid, {}, roh);
  }
  // Ungültig bleiben nur Formfehler: negativ, über 100, zu viele Stellen, keine Zahl — Fehler am Feld, kein Eintrag.
  for (const roh of ["-1", "-0,01", "100,01", "101", "17,555", "abc", "1e2"]) {
    c = tariffDraftChanges(d.tariffs, { [k("transglobal", 22, 3)]: roh });
    assert.deepEqual(c.entries, [], roh);
    assert.ok(c.invalid[k("transglobal", 22, 3)], roh);
  }
  // Zurücksetzen (leer) ist immer erlaubt; Eingabefehler erscheinen als Fehler ohne Eintrag.
  c = tariffDraftChanges(d.tariffs, { [k("transglobal", 22, 0)]: "", [k("transglobal", 22, 3)]: "abc" });
  assert.deepEqual(c.entries, [{ provider: "transglobal", productKey: 22, weightClass: 0, markupPercent: null }]);
  assert.ok(c.invalid[k("transglobal", 22, 3)]);
  assert.equal(parseTariffInput("").value, null);
  assert.equal(parseTariffInput("0").value, 0, "0 ist ein Satz, nicht „leer“");
});

test("Body: genau die vier vereinbarten Felder je Eintrag", () => {
  const body = buildTariffEntriesBody([{ provider: "jumingo", productKey: 1, weightClass: 2, markupPercent: 35, label: "x", customerNetCents: 1 }]);
  assert.deepEqual(body, { entries: [{ provider: "jumingo", productKey: 1, weightClass: 2, markupPercent: 35 }] });
});

test("Formate: Prozent, Cent mit Vorzeichen, Abstand aus Kundensicht, Gewicht", () => {
  // Zahl und Einheit untrennbar: geschütztes Leerzeichen (\u00a0), kein Umbruch „15 / %“.
  assert.equal(formatPercent(35), "35\u00a0%");
  assert.equal(formatPercent(17.5), "17,5\u00a0%");
  assert.equal(formatPercent(null), "—");
  assert.equal(formatCents(1266), "12,66\u00a0€");
  assert.equal(formatSignedCents(140), "+1,40\u00a0€");
  assert.equal(formatSignedCents(-5), "−0,05\u00a0€");
  assert.equal(distanceText(-8.92), "bei uns 8,9\u00a0% günstiger");
  assert.equal(distanceText(2.3), "bei uns 2,3\u00a0% teurer");
  assert.equal(distanceText(null), null);
  assert.equal(kgText(7.5), "7,5\u00a0kg");
  assert.equal(rangeText({ min: 20, max: 35 }), "20–35\u00a0%");
  assert.equal(rangeText({ min: 25, max: 25 }), "25\u00a0%");
  assert.equal(formatDay("2026-11-18"), "18.11.2026");
});

test("Vergleichsbasis: Kunde, Zielland und Lebensdauer — eine Kontoänderung macht sie nicht ungültig", () => {
  const base = selectComparison(PROJEKTION, 7);
  assert.equal(comparisonBaseStatus({ base, userId: 7, destination: "DE" }), "ok");
  assert.equal(comparisonBaseStatus({ base, userId: 8, destination: "DE" }), "stale");
  assert.equal(comparisonBaseStatus({ base, userId: 7, destination: "AT" }), "stale");
  assert.equal(comparisonBaseStatus({ base: { ...base, expiresAt: "2026-01-01T00:00:00.000Z" }, userId: 7, destination: "DE" }), "expired");
  assert.equal(comparisonBaseStatus({ base: null, userId: 7, destination: "DE" }), "missing");
  assert.equal(selectComparison({ runId: 41, tariffs: [], scenarios: [] }, 7), null, "runId muss ein String sein");
});

test("Klassen der Projektion: UPS 22 wahlweise mit Abholzuschlag; Beispielpaket und Zustand", () => {
  const ohne = projectionClass(PROJEKTION, "transglobal", 22, 1);
  const mit = projectionClass(PROJEKTION, "transglobal", 22, 1, { sameDay: true });
  assert.equal(ohne.status, "more_profit");
  assert.equal(mit.status, "good");
  assert.equal(mit.sameDayFeeNetCents, 390);
  assert.equal(mit.weightClass, 1);
  assert.equal(hasSameDay(PROJEKTION, "transglobal", 22), true);
  assert.equal(hasSameDay(PROJEKTION, "transglobal", 23), false);
  assert.equal(projectionClass(PROJEKTION, "transglobal", 23, 1, { sameDay: true }).status, "good", "ohne Variante bleibt die Hauptauswertung");
  assert.equal(exampleSample(ohne).scenarioId, "w5");
  assert.equal(statusOf(null), "not_compared");
  assert.equal(statusText(projectionClass(PROJEKTION, "transglobal", 22, 4), "transglobal"), `${STATUS_VIEW.at_risk.text} JUMiNGO kauft dieses Gewicht günstiger ein.`);
  assert.equal(statusText(projectionClass(PROJEKTION, "transglobal", 22, 3), "transglobal"), STATUS_VIEW.no_comparison.text);
  const nichtVerfuegbar = klasse(3, { status: "no_comparison", samples: [probe("w12", 12, null, null)] });
  assert.equal(statusText(nichtVerfuegbar, "transglobal"), "Dieser Tarif ist für dieses Ziel und Gewicht nicht verfügbar.");
  for (const s of ["good", "more_profit", "at_risk", "no_comparison"]) {
    assert.ok(STATUS_VIEW[s].label && STATUS_VIEW[s].text && STATUS_VIEW[s].tone, `${s}: Wortlaut und Farbton`);
  }
  assert.deepEqual(
    ["good", "more_profit", "at_risk", "no_comparison"].map((s) => STATUS_VIEW[s].label),
    ["Gut eingestellt", "Hier ist mehr Gewinn möglich", "Preisvorteil gefährdet", "Kein verlässlicher Vergleich"],
  );
  // Keine Untergrenze (v2.142): kein Zustand „Unter dem Zielaufschlag“; „kein Vergleich“ empfiehlt nichts.
  assert.equal(STATUS_VIEW.below_target, undefined);
  assert.equal(statusOf({ status: "below_target" }), "not_compared", "eine alte Antwortform wird nicht als Zustand gezeigt");
  assert.ok(!/Untergrenze/.test(STATUS_VIEW.no_comparison.text));
  assert.deepEqual(WARNING_VIEW.no_earnings, { tone: "warning", label: "Kein Verdienst" });
});

test("Gewinnvorschau: heute gegen Empfehlung bzw. Entwurf — Werte nur aus der Serverprojektion, immer dasselbe Beispielpaket", () => {
  const heute = projectionClass(PROJEKTION, "transglobal", 22, 1);
  const r = profitRow(heute, null);
  assert.equal(r.art, "recommendation");
  assert.deepEqual(r.heute, { percent: 20, purchaseNetCents: 1062, customerNetCents: 1274, contributionCents: 212, comparisonNetCents: 1560, differencePercent: -18.33 });
  assert.equal(r.neu.customerNetCents, 1434);
  assert.equal(r.plusCents, 372 - 212);
  // Entwurf 30 % aus der Vorschau: anderes begrenzendes Paket in der Vorschau ändert das Beispiel nicht.
  const vorschau = klasse(1, { currentPercent: 30, draft: { percent: 30 }, exampleScenarioId: "w2",
    samples: [probe("w2", 2, [938, 1219], [1158, 1390]), probe("w5", 5, [1062, 1381], [1300, 1560])] });
  const e = profitRow(heute, vorschau);
  assert.equal(e.art, "draft");
  assert.equal(e.scenarioId, "w5");
  assert.equal(e.neu.percent, 30);
  assert.equal(e.neu.customerNetCents, 1381);
  assert.equal(e.plusCents, (1381 - 1062) - 212);
  // Gut eingestellt: keine Änderung nötig.
  const gut = profitRow(projectionClass(PROJEKTION, "transglobal", 22, 2), null);
  assert.equal(gut.art, null);
  assert.equal(gut.neu, null);
  // Ohne eigenen Preis kein Beispiel.
  assert.equal(profitRow(klasse(1, { samples: [probe("w5", 5, null, null)] }), null).available, false);
});

test("Tarifliste: wichtigster Zustand, Plus je Sendung; ohne Basis „noch nicht verglichen“ — ein niedriger Satz ist kein Zustand", () => {
  const d = daten();
  const base = selectComparison(PROJEKTION, 7);
  const s = Object.fromEntries(d.tariffs.map((t) => [t.id, tariffSummary(t, base)]));
  assert.equal(s["transglobal:22"].status, "at_risk", "gefährdet geht vor mehr Gewinn");
  assert.equal(s["transglobal:22"].plusCents, 160);
  assert.equal(s["jumingo:1"].plusCents, 638 - 212);
  assert.equal(s["transglobal:23"].plusCents, null);
  const ohne = tariffSummary(d.tariffs[0], null);
  assert.equal(ohne.status, "not_compared", "Bestandswert 0 % ist ein gewöhnlicher Satz");
  assert.equal(tariffSummary(d.tariffs[1], null).status, "not_compared");
  assert.deepEqual(ohne.today, { min: 0, max: 0 });
});

// Eine Klasse mit 0 % OHNE Vergleichsangebot (v2.142): der Server liefert keine Empfehlung (null), keinen Vorschlag
// und keine Wirkung — und keinen eigenen Zustand für den niedrigen Satz.
const ohneVergleich = (wc) => klasse(wc, { status: "no_comparison", comparisonStatus: "no_comparison", currentPercent: 0,
  recommendedPercent: null, suggestedPercent: null, comparedSamples: 0, limitingScenarioId: null, exampleScenarioId: "w12",
  samples: [probe("w12", 12, [1500, 1500], null, { atRecommended: null })] });

test("Belastbare Empfehlung: nur mit Vergleichsangebot; Kurzgrund ohne Empfehlung", () => {
  assert.equal(reliableRecommendation(klasse(1)), true);
  assert.equal(reliableRecommendation(projectionClass(PROJEKTION, "transglobal", 22, 3)), false, "kein Vergleich");
  assert.equal(reliableRecommendation(ohneVergleich(1)), false, "ohne Vergleich keine Empfehlung");
  // Auch eine alte Antwortform (Wert ohne Vergleich) gilt nicht als Empfehlung; ohne sicheren Spielraum ebenso nicht.
  assert.equal(reliableRecommendation(klasse(1, { status: "no_comparison", comparisonStatus: "no_comparison", recommendedPercent: 25 })), false);
  assert.equal(reliableRecommendation(klasse(1, { status: "at_risk", comparisonStatus: "at_risk", belowFloor: true, upperBoundPercent: 0, recommendedPercent: null, suggestedPercent: null })), false);
  assert.equal(reliableRecommendation(null), false);
  assert.equal(noRecommendationText(klasse(1, { samples: [] })), "Kein Beispielpaket");
  assert.equal(noRecommendationText(klasse(1, { samples: [probe("w5", 5, null, null)] })), "Tarif hier nicht verfügbar");
  assert.equal(noRecommendationText(klasse(1, { samples: [{ ...probe("w5", 5, null, null), reason: "fetch_failed" }] })), "Preise nicht abrufbar");
  assert.equal(noRecommendationText(klasse(1, { samples: [{ ...probe("w5", 5, [1000, 1300], null), reason: "fetch_failed" }] })), "Vergleichspreise nicht abrufbar", "eigener Preis da, der andere Anbieter fiel aus");
  assert.equal(noRecommendationText(projectionClass(PROJEKTION, "transglobal", 22, 3)), "Kein vergleichbares Angebot");
  // Verglichen, aber ohne sicheren Spielraum (auch 0 % hält das Ziel nicht): eigener Grund, nicht „Kein vergleichbares Angebot“.
  assert.equal(noRecommendationText(klasse(1, { status: "at_risk", comparisonStatus: "at_risk", belowFloor: true, upperBoundPercent: 0, recommendedPercent: null, suggestedPercent: null,
    samples: [probe("w5", 5, [1300, 1690], [1100, 1320], { belowFloor: true, upperBoundPercent: 0 })] })), "Kein sicherer Spielraum, auch nicht bei 0\u00a0%");
  // Tarifliste: Empfohlen-Spanne nur aus belastbaren Klassen (Klasse 3 ohne Vergleich zählt nicht), ohne sie weder Plus noch Spanne.
  const d = daten();
  assert.deepEqual(tariffSummary(d.tariffs[0], selectComparison(PROJEKTION, 7)).recommended, { min: 25, max: 35 });
  const nurOhne = { ...PROJEKTION, tariffs: [{ provider: "transglobal", productKey: 22, label: "UPS Standard", classes: [1, 2, 3, 4].map(ohneVergleich) }] };
  const s = tariffSummary(d.tariffs[0], selectComparison(nurOhne, 7));
  assert.deepEqual([s.status, s.plusCents, s.recommended], ["no_comparison", null, null]);
});

test("Kennzahlen je Gewichtsklasse: Ihr Aufschlag, Empfohlen, Mehr pro Sendung — nur Serverwerte", () => {
  const t = daten().tariffs[0]; // UPS Standard (Transglobal), Bestandswert 0 % für alle Gewichte
  const k = (wc, opts) => projectionClass(PROJEKTION, "transglobal", 22, wc, opts);
  // Ohne Preisvergleich: nur der gespeicherte Satz, keine Empfehlung, keine Zahl.
  let m = classMetrics({ tariff: t, weightClass: 1 });
  assert.deepEqual(m.current, { percent: 0, source: "all_weights" }, "der Satz für alle Gewichte gilt — als solcher erkennbar");
  assert.deepEqual(m.recommended, { percent: null, note: "Erst Preise vergleichen" });
  assert.equal(m.adoptPercent, null);
  assert.deepEqual([m.more.value, m.more.note, m.more.label], ["—", "Erst Preise vergleichen", "Mehr pro Sendung"]);
  // Mehr Gewinn möglich: Empfehlung 35 %, übernehmbar, +1,60 € Deckungsbeitrag am begrenzenden Beispielpaket (5 kg).
  m = classMetrics({ tariff: t, weightClass: 1, baseClass: k(1), hasBase: true });
  assert.deepEqual(m.recommended, { percent: 35, note: null });
  assert.equal(m.adoptPercent, 35);
  assert.deepEqual(m.more, { cents: 160, direction: "more", art: "recommendation", label: "Mehr pro Sendung", value: "+1,60 €",
    note: "mit Empfehlung", example: "Deckungsbeitrag, Beispiel 5 kg" });
  // Gut eingestellt: Empfehlung sichtbar, nichts zu übernehmen.
  m = classMetrics({ tariff: t, weightClass: 2, baseClass: k(2), hasBase: true });
  assert.deepEqual(m.recommended, { percent: 25, note: "Passt bereits" });
  assert.equal(m.adoptPercent, null);
  assert.deepEqual([m.more.value, m.more.note], ["—", "Keine Änderung vorgeschlagen"]);
  // Kein Vergleichsangebot: „Keine Empfehlung verfügbar“ mit Grund; nichts erfunden.
  m = classMetrics({ tariff: t, weightClass: 3, baseClass: k(3), hasBase: true });
  assert.deepEqual(m.recommended, { percent: null, note: "Kein vergleichbares Angebot" });
  assert.deepEqual([m.adoptPercent, m.more.value, m.more.note], [null, "—", "Keine Empfehlung verfügbar"]);
  // Gefährdet, Empfehlung schon erreicht: kein „Passt bereits“ — der sichtbare Hinweis erklärt.
  m = classMetrics({ tariff: t, weightClass: 4, baseClass: k(4), hasBase: true });
  assert.deepEqual(m.recommended, { percent: 25, note: null });
  // 0 % ohne Vergleich: keine Empfehlung, nichts zum Übernehmen.
  m = classMetrics({ tariff: t, weightClass: 3, baseClass: ohneVergleich(3), hasBase: true });
  assert.deepEqual([m.recommended.percent, m.adoptPercent, m.more.value], [null, null, "—"]);
  // Sichere Obergrenze unter 25 % (v2.142): die Karte zeigt und übernimmt den Serverwert unverändert — keine 25-%-Klemme.
  const eng = klasse(1, { status: "at_risk", comparisonStatus: "at_risk", hint: "little_headroom", currentPercent: 25, upperBoundPercent: 15,
    recommendedPercent: 15, suggestedPercent: 15 });
  m = classMetrics({ tariff: t, weightClass: 1, baseClass: eng, hasBase: true });
  assert.deepEqual([m.recommended.percent, m.adoptPercent], [15, 15]);
  // Mit Abholzuschlag (UPS 22): Variante des Servers, Hinweis an der Empfehlung.
  m = classMetrics({ tariff: t, weightClass: 1, baseClass: k(1, { sameDay: true }), hasBase: true, sameDay: true });
  assert.deepEqual(m.recommended, { percent: 25, note: "Passt bereits, mit Abholzuschlag" });
  // Entwurf: Wert aus der Vorschau, „mit Ihrer Eingabe“; solange die Vorschau aussteht, keine veraltete Zahl.
  const vorschau = klasse(1, { currentPercent: 30, draft: { percent: 30 }, samples: [probe("w2", 2, [938, 1219], [1158, 1390]), probe("w5", 5, [1062, 1381], [1300, 1560])] });
  m = classMetrics({ tariff: t, weightClass: 1, baseClass: k(1), previewClass: vorschau, hasBase: true });
  assert.deepEqual([m.more.art, m.more.value, m.more.note], ["draft", "+1,07 €", "mit Ihrer Eingabe"]);
  m = classMetrics({ tariff: t, weightClass: 1, baseClass: k(1), previewClass: vorschau, hasBase: true, pending: true });
  assert.deepEqual([m.more.value, m.more.note], ["—", "Vorschau wird berechnet …"]);
  m = classMetrics({ tariff: t, weightClass: 1, baseClass: k(1), hasBase: true, pending: true, previewFailed: true });
  assert.equal(m.more.note, "Keine Vorschau");
  // Empfehlung senkt den Deckungsbeitrag (Preisvorteil schützen): „Weniger pro Sendung“ statt eines negativen Plus.
  const senken = klasse(1, { status: "at_risk", comparisonStatus: "at_risk", currentPercent: 35, recommendedPercent: 25, suggestedPercent: 25,
    samples: [probe("w5", 5, [1062, 1434], [1300, 1400], { atRecommended: { percent: 25, customerNetCents: 1328, contributionCents: 266, differencePercent: -5.14 } })] });
  m = classMetrics({ tariff: t, weightClass: 1, baseClass: senken, hasBase: true });
  assert.deepEqual([m.adoptPercent, m.more.direction, m.more.label, m.more.value], [25, "less", "Weniger pro Sendung", "1,06 €"]);
});

test("Sichtbare Hinweise: Preisvorteil gefährdet (mit Grund) und kein Verdienst am Beispiel — nie wegen eines niedrigen Satzes", () => {
  const t = daten().tariffs[0]; // UPS Standard (Transglobal), Bestandswert 0 % für alle Gewichte
  const k4 = projectionClass(PROJEKTION, "transglobal", 22, 4);
  assert.deepEqual(classWarnings({ baseClass: k4, provider: "transglobal", hasBase: true }),
    [{ status: "at_risk", text: `${STATUS_VIEW.at_risk.text} JUMiNGO kauft dieses Gewicht günstiger ein.`, draft: false }]);
  // Ohne Preisvergleich: kein Hinweis — auch nicht für 0 % (keine belastbare Berechnungsgrundlage).
  assert.deepEqual(classWarnings({ hasBase: false }), []);
  assert.deepEqual(classWarnings({ hasBase: false, numbers: { available: true, contributionCents: 0 } }), []);
  // 0 % mit Serverzahl am Beispielpaket (Deckungsbeitrag 0 Cent): „Kein Verdienst bei diesem Beispiel“, nicht blockierend.
  const m0 = classMetrics({ tariff: t, weightClass: 1, baseClass: ohneVergleich(1), hasBase: true });
  assert.deepEqual(classWarnings({ baseClass: ohneVergleich(1), provider: "transglobal", hasBase: true, numbers: m0.numbers }),
    [{ status: "no_earnings", text: NO_EARNINGS_TEXTS.zero, draft: false }]);
  // Entwurf 0 % laut Vorschau ⇒ Hinweis „mit Ihrer Eingabe“; ein Entwurf mit Verdienst hebt ihn auf.
  const k1 = projectionClass(PROJEKTION, "transglobal", 22, 1);
  const null0 = klasse(1, { currentPercent: 0, draft: { percent: 0 }, samples: [probe("w2", 2, [938, 938], [1158, 1390]), probe("w5", 5, [1062, 1062], [1300, 1560])] });
  const mz = classMetrics({ tariff: t, weightClass: 1, baseClass: k1, previewClass: null0, hasBase: true });
  assert.deepEqual(classWarnings({ baseClass: k1, previewClass: null0, provider: "transglobal", hasBase: true, numbers: mz.numbers }),
    [{ status: "no_earnings", text: NO_EARNINGS_TEXTS.zero, draft: true }]);
  const mit30 = klasse(1, { currentPercent: 30, draft: { percent: 30 }, samples: [probe("w2", 2, [938, 1219], [1158, 1390]), probe("w5", 5, [1062, 1381], [1300, 1560])] });
  const mp = classMetrics({ tariff: t, weightClass: 1, baseClass: k1, previewClass: mit30, hasBase: true });
  assert.deepEqual(classWarnings({ baseClass: k1, previewClass: mit30, provider: "transglobal", hasBase: true, numbers: mp.numbers }), []);
  // Entwurf macht den Preisvorteil gefährdet → Hinweis aus der Vorschau.
  const entwurf = klasse(1, { currentPercent: 30, draft: { percent: 30 }, status: "at_risk", comparisonStatus: "at_risk" });
  assert.deepEqual(classWarnings({ baseClass: ohneVergleich(1), previewClass: entwurf, provider: "transglobal", hasBase: true })
    .map((w) => [w.status, w.draft]), [["at_risk", true]]);
  assert.deepEqual(classWarnings({ baseClass: k1, provider: "transglobal", hasBase: true, numbers: classMetrics({ tariff: t, weightClass: 1, baseClass: k1, hasBase: true }).numbers }), []);
  // earningsWarning: nur Serverzahlen, keine Schwelle über 0 Cent.
  assert.equal(earningsWarning(null), null);
  assert.equal(earningsWarning({ available: false, reason: "own_unavailable" }), null);
  assert.equal(earningsWarning({ available: true, contributionCents: 1 }), null, "1 Cent Verdienst ist Verdienst");
  assert.equal(earningsWarning({ available: true, contributionCents: null }), null);
  assert.deepEqual(earningsWarning({ available: true, contributionCents: 0 }), { status: "no_earnings", text: NO_EARNINGS_TEXTS.zero, draft: false });
  assert.deepEqual(earningsWarning({ available: true, contributionCents: -5 }), { status: "no_earnings", text: NO_EARNINGS_TEXTS.negative, draft: false });
  assert.equal(earningsWarning({ available: true, contributionCents: 0, draft: { percent: 10, customerCents: 1100, contributionCents: 100 } }), null, "der Entwurf zählt");
});

test("Dialoghinweise, Reiter und Wortlaute der vereinfachten Karte", () => {
  assert.deepEqual(changeWarnings(klasse(1, { status: "at_risk", comparisonStatus: "at_risk", comparedSamples: 1 })), ["at_risk", "weak"]);
  assert.deepEqual(changeWarnings(klasse(1, { status: "no_comparison", comparisonStatus: "no_comparison", comparedSamples: 0 })), ["no_comparison"]);
  assert.deepEqual(changeWarnings(klasse(1)), []);
  // Kein Verdienst am Beispiel der Vorschau (Deckungsbeitrag ≤ 0 Cent) — nur mit Beispielzeile.
  assert.deepEqual(changeWarnings(klasse(1), { available: true, art: "draft", neu: { percent: 0, customerNetCents: 1062, contributionCents: 0 } }), ["no_earnings"]);
  assert.deepEqual(changeWarnings(klasse(1), { available: true, art: "draft", neu: { percent: 5, customerNetCents: 1115, contributionCents: 53 } }), []);
  assert.deepEqual(changeWarnings(klasse(1), { available: false }), []);
  assert.equal(TARIFF_TEXTS.dialogWarnNoEarnings, "Kein Verdienst bei diesem Beispiel");
  // Reiter aus den Klassenbezeichnungen des Servers — die Grenzen definiert nur der Server.
  assert.deepEqual(KLASSEN.map(([, l]) => weightTabLabel(l)), ["Bis 5 kg", "5–10 kg", "10–20 kg", "Über 20 kg"]);
  assert.equal(weightTabLabel(""), "");
  assert.equal(fieldHint(), "0–100\u00a0% frei wählbar. Leer = kein eigener Satz.");
  assert.equal(TARIFF_TEXTS.newValue, "Ihr Aufschlag", "Feldbezeichnung");
  assert.ok(!("minimum" in TARIFF_TEXTS) && !("belowMinimumShort" in TARIFF_TEXTS) && !("revertFloor" in TARIFF_TEXTS), "keine Untergrenzentexte");
  assert.ok(!Object.values(TARIFF_TEXTS).some((v) => /Untergrenze|Zielaufschlag/.test(v)), "kein Wortlaut nennt eine Untergrenze");
  const T = TARIFF_TEXTS;
  assert.deepEqual([T.sectionTitle, T.current, T.recommended, T.metricMore, T.noRecommendation, T.adopt, T.custom, T.details, T.save, T.dialogConfirm],
    ["Versandpreise optimieren", "Ihr Aufschlag", "Empfohlen", "Mehr pro Sendung", "Keine Empfehlung verfügbar", "Empfehlung übernehmen", "Selbst festlegen", "Details anzeigen", "Änderungen prüfen", "Ja, speichern"]);
  assert.deepEqual([T.purchase, T.customerPays, T.earnings, T.moreTariffs, T.possible, T.exampleCalc],
    ["Unser Einkauf", "Kunde zahlt", "Unser Verdienst", "Weitere JUMiNGO-Tarife", "Möglich", "Beispielrechnung"]);
  assert.match(T.contributionNote, /^„Unser Verdienst“ ist der Deckungsbeitrag: Kundenpreis minus Einkaufspreis, netto/);
  assert.match(T.contributionNote, /kein Nettogewinn/);
});

// ── Gemeinsame Tarifübersicht (finale Vereinfachung 2026-11-17) ─────────────
const tg = (productKey, label, x = {}) => ({ ...tarif("transglobal", productKey, label), ...x });
const ju = (productKey, label, x = {}) => ({ ...tarif("jumingo", productKey, label), ...x });
const tarifeAus = (liste) => selectTariffMarkups({ ...ANTWORT, tariffs: liste }).tariffs;
// Vergleichsangebot eines JUMiNGO-Pakets: ein Transglobal-Produkt (Tarif-ID = Produktschlüssel).
const vergleichMitTg = (productKey, relation = "similar") => ({ relation, provider: "transglobal", label: "UPS Standard", tariffId: String(productKey),
  purchaseNetCents: 900, ratePercent: 20, customerNetCents: 1080, pickupDate: "2026-11-18", purchaseAdvantagePercent: -10 });
const juKlasse = (wc, cmp) => klasse(wc, { exampleScenarioId: "w2", samples: [probe("w2", 2, [990, 1188], null, { comparison: cmp, reason: cmp ? null : "no_comparable" })] });
const nurPaar = (l) => (l ? { relation: l.relation, from: l.from } : null);

test("Tarifübersicht: je Transglobal-Produkt ein Bereich; Paar nur als eindeutige Registergruppe mit gleicher Bezeichnung und gleichem Carrier", () => {
  const tarife = tarifeAus([
    tg(22, "UPS Standard"), tg(23, "UPS Express Saver"), tg(84, "DHL Express 9:00", { carrier: "DHL" }),
    ju(1, "UPS Standard"),                                   // Registerpaar zu 22
    ju(2, "UPS Express Saver", { carrier: "DHL" }),          // anderer Carrier → kein Paar
    ju(4, "DHL Express 9:00", { carrier: "DHL" }),
    ju(14, "DHL Express 9:00", { carrier: "DHL" }),           // zweite gleichnamige Registergruppe → mehrdeutig, kein Paar
    ju(8, "UPS Standard", { kind: "price_group" }),          // Preisgruppe: nie gepaart, auch bei gleicher Bezeichnung
  ]);
  const { areas, extra } = tariffAreas(tarife);
  assert.deepEqual(areas.map((a) => [a.id, a.label, a.pair ? a.pair.id : null]), [
    ["transglobal:22", "UPS Standard", "jumingo:1"],
    ["transglobal:23", "UPS Express Saver", null],
    ["transglobal:84", "DHL Express 9:00", null],
  ]);
  assert.deepEqual(extra.map((j) => j.id), ["jumingo:2", "jumingo:4", "jumingo:14", "jumingo:8"], "nichts geht verloren, Reihenfolge des Servers");
  assert.equal(areas.length + areas.filter((a) => a.pair).length + extra.length, tarife.length, "jeder Tarif genau einmal");
  // Mehrdeutig auf der Transglobal-Seite: zwei Produkte gleicher Bezeichnung → keines gepaart.
  const zweiTg = tariffAreas(tarifeAus([tg(85, "DHL X", { carrier: "DHL" }), tg(86, "DHL X", { carrier: "DHL" }), ju(5, "DHL X", { carrier: "DHL" })]));
  assert.deepEqual(zweiTg.areas.map((a) => a.pair), [null, null]);
  assert.deepEqual(zweiTg.extra.map((j) => j.id), ["jumingo:5"]);
  // Ohne Carrier keine Zuordnung.
  assert.equal(tariffAreas(tarifeAus([tg(22, "UPS Standard", { carrier: "" }), ju(1, "UPS Standard", { carrier: "" })])).areas[0].pair, null);
  assert.deepEqual(tariffAreas(null), { areas: [], extra: [] });
});

test("Kandidaten: Registerpaar plus weitere Gruppen nur, wenn der Server sie mit genau diesem Produkt vergleicht", () => {
  const tarife = tarifeAus([tg(22, "UPS Standard"), tg(23, "UPS Express Saver"), ju(1, "UPS Standard"), ju(8, "UPS Sondertarif", { kind: "price_group" })]);
  const base = selectComparison({ ...PROJEKTION, tariffs: [...PROJEKTION.tariffs,
    { provider: "jumingo", productKey: 8, label: "UPS Sondertarif", classes: [juKlasse(1, vergleichMitTg(22)), juKlasse(2, null), juKlasse(3, vergleichMitTg(23)), juKlasse(4, null)] }] }, 7);
  const { areas, extra } = tariffAreas(tarife);
  const ids = (liste) => liste.map((c) => [c.tariff.id, c.relation]);
  assert.deepEqual(ids(areaCandidates(areas[0], extra, base)), [["jumingo:1", "equivalent"], ["jumingo:8", "similar"]]);
  assert.deepEqual(ids(areaCandidates(areas[1], extra, base)), [["jumingo:8", "similar"]], "auch ohne Registerpaar wählbar");
  assert.deepEqual(ids(areaCandidates(areas[0], extra, null)), [["jumingo:1", "equivalent"]], "ohne Vergleich nur das Registerpaar");
  const tgListe = tarife.filter((t) => t.provider === "transglobal");
  assert.deepEqual(extraComparedWith(base, extra[0], tgListe).map((x) => [x.tariff.id, x.relation]), [["transglobal:22", "similar"], ["transglobal:23", "similar"]]);
  assert.deepEqual(extraComparedWith(null, extra[0], tgListe), []);
});

test("Gemeinsames Beispielpaket: beide Seiten mit eigenem Preis, sonst das Beispielpaket einer Seite", () => {
  const tgK = klasse(1); // w2 und w5 mit Preis, Beispielpaket w5
  const juOhneW5 = klasse(1, { exampleScenarioId: "w2", samples: [probe("w2", 2, [990, 1188], null), probe("w5", 5, null, null)] });
  assert.equal(commonScenarioId(tgK, klasse(1)), "w5", "zuerst das Beispielpaket des Servers für Transglobal");
  assert.equal(commonScenarioId(tgK, juOhneW5), "w2", "sonst das erste Paket mit Preis auf beiden Seiten");
  assert.equal(commonScenarioId(tgK, null), "w5");
  assert.equal(commonScenarioId(null, juOhneW5), "w2");
  assert.equal(commonScenarioId(tgK, klasse(1, { exampleScenarioId: "w9", samples: [probe("w9", 9, [990, 1188], null)] })), "w5", "kein gemeinsames Paket");
  assert.equal(commonScenarioId(null, null), null);
  const base = selectComparison(PROJEKTION, 7);
  assert.deepEqual(scenarioOf(base, "w5"), { id: "w5", weightClass: 1 });
  assert.equal(scenarioOf(base, "w9"), null);
  assert.equal(scenarioOf(null, "w5"), null);
});

test("Verbindung und Kernaussage nur aus Vergleichsurteilen des Servers", () => {
  const tgK = klasse(1); // Vergleichsangebot: JUMiNGO „UPS Standard“, gleichwertig
  const juK = klasse(1, { samples: [probe("w5", 5, [1100, 1320], null, { comparison: vergleichMitTg(22, "equivalent"), reason: null })] });
  assert.deepEqual(nurPaar(pairLink({ tgClass: tgK, juClass: juK, tgProductKey: 22, isPair: true, scenarioId: "w5" })), { relation: "equivalent", from: "transglobal" });
  assert.deepEqual(nurPaar(pairLink({ tgClass: tgK, juClass: juK, tgProductKey: 22, isPair: false, scenarioId: "w5" })), { relation: "equivalent", from: "jumingo" },
    "ohne Registerpaar zählt nur der Vergleich der JUMiNGO-Seite mit genau diesem Produkt");
  assert.equal(pairLink({ tgClass: tgK, juClass: juK, tgProductKey: 23, isPair: false, scenarioId: "w5" }), null, "verglichen mit einem anderen Produkt");
  const juAehnlich = klasse(1, { samples: [probe("w5", 5, [1100, 1320], null, { comparison: vergleichMitTg(22), reason: null })] });
  assert.equal(pairLink({ juClass: juAehnlich, tgProductKey: 22, scenarioId: "w5" }).relation, "similar");
  assert.equal(pairLink({ tgClass: tgK, juClass: juK, tgProductKey: 22, isPair: true, scenarioId: "w9" }), null, "anderes Paket");
  const ohnePreis = klasse(1, { samples: [probe("w5", 5, null, null)] });
  assert.equal(pairLink({ tgClass: ohnePreis, juClass: ohnePreis, tgProductKey: 22, isPair: true, scenarioId: "w5" }), null);

  const link = { relation: "equivalent", from: "transglobal" };
  assert.equal(verdictOf({ hasBase: false, link, tgPurchaseCents: 1, juPurchaseCents: 2 }), "not_compared");
  assert.equal(verdictOf({ hasBase: true, link: null, tgPurchaseCents: 1062, juPurchaseCents: 1300 }), "none", "ohne Verbindung keine Aussage");
  assert.equal(verdictOf({ hasBase: true, link, tgPurchaseCents: 1062, juPurchaseCents: null }), "none");
  assert.equal(verdictOf({ hasBase: true, link, tgPurchaseCents: 1062, juPurchaseCents: 1300 }), "transglobal");
  assert.equal(verdictOf({ hasBase: true, link, tgPurchaseCents: 1400, juPurchaseCents: 1300 }), "jumingo");
  assert.equal(verdictOf({ hasBase: true, link, tgPurchaseCents: 1300, juPurchaseCents: 1300 }), "same");
  assert.deepEqual([VERDICT_TEXTS.transglobal, VERDICT_TEXTS.jumingo, VERDICT_TEXTS.none],
    ["Transglobal kauft günstiger ein.", "JUMiNGO kauft günstiger ein.", "Diese Angebote sind nicht direkt vergleichbar."]);
  assert.deepEqual(Object.values(RELATION_VIEW).map((v) => v.label), ["Gleichwertig", "Ähnlicher Tarif", "Kein direkter Vergleich möglich"]);
  assert.equal(advantageText("transglobal", { provider: "jumingo", purchaseAdvantagePercent: 18.31 }), "Transglobal kauft 18,3 % günstiger ein als JUMiNGO");
  assert.equal(advantageText("jumingo", { provider: "transglobal", purchaseAdvantagePercent: -12.5 }), "JUMiNGO kauft 12,5 % teurer ein als Transglobal");
  assert.equal(advantageText("transglobal", { provider: "jumingo", purchaseAdvantagePercent: 0 }), "Transglobal kauft gleich teuer ein wie JUMiNGO");
  assert.equal(advantageText("transglobal", { provider: "jumingo", purchaseAdvantagePercent: null }), null);
  assert.equal(advantageText("transglobal", null), null);
});

test("Vier Zahlen je Anbieter am gezeigten Paket; „Möglich“ nur aus belastbarer Empfehlung, mit Entwurf die Wirkung laut Vorschau", () => {
  const t22 = daten().tariffs.find((t) => t.id === "transglobal:22");
  const base = selectComparison(PROJEKTION, 7);
  const bk = projectionClass(base, "transglobal", 22, 1);
  assert.deepEqual(classMetrics({ tariff: t22, weightClass: 1, hasBase: false }).numbers, { available: false, reason: "not_compared" });
  const m = classMetrics({ tariff: t22, weightClass: 1, baseClass: bk, hasBase: true, scenarioId: "w2" });
  assert.deepEqual(m.numbers, { available: true, reason: null, weightKg: 2, purchaseCents: 938, customerCents: 1126, contributionCents: 188, draft: null });
  assert.deepEqual(chanceLine("transglobal", m), { provider: "transglobal", art: "recommendation", cents: 140, fromPercent: 20, toPercent: 35, weightKg: 2 });
  assert.deepEqual(chanceText(chanceLine("transglobal", m)), {
    lead: "Möglich: +1,40 € pro Sendung", detail: "wenn der Transglobal-Aufschlag von 20 % auf 35 % steigt (Beispielpaket 2 kg).",
  });
  // Ohne scenarioId das Beispielpaket des Servers (w5).
  assert.equal(classMetrics({ tariff: t22, weightClass: 1, baseClass: bk, hasBase: true }).numbers.purchaseCents, 1062);
  // Entwurf: Kundenpreis und Verdienst laut Vorschau, auch wenn weniger.
  const vorschau = (prozent, kunde) => klasse(1, { currentPercent: prozent, draft: { percent: prozent }, samples: [probe("w2", 2, [938, kunde], [1158, 1390])] });
  const hoeher = classMetrics({ tariff: t22, weightClass: 1, baseClass: bk, previewClass: vorschau(45, 1360), hasBase: true, scenarioId: "w2" });
  assert.deepEqual(hoeher.numbers.draft, { percent: 45, customerCents: 1360, contributionCents: 422 });
  assert.deepEqual(chanceText(chanceLine("transglobal", hoeher)), {
    lead: "Mit Ihrer Eingabe: +2,34 € pro Sendung", detail: "Transglobal-Aufschlag 20 % → 45 % (Beispielpaket 2 kg).",
  });
  const niedriger = classMetrics({ tariff: t22, weightClass: 1, baseClass: bk, previewClass: vorschau(10, 1032), hasBase: true, scenarioId: "w2" });
  assert.equal(chanceText(chanceLine("transglobal", niedriger)).lead, "Mit Ihrer Eingabe: −0,94 € pro Sendung");
  // Vorschau ausstehend: keine veraltete Zahl, keine Zeile.
  const wartet = classMetrics({ tariff: t22, weightClass: 1, baseClass: bk, previewClass: vorschau(45, 1360), hasBase: true, pending: true, scenarioId: "w2" });
  assert.equal(wartet.numbers.draft, null);
  assert.equal(chanceLine("transglobal", wartet), null);
  // Empfehlung mit weniger Verdienst (schützt den Preisvorteil) und Klasse ohne Vergleich: kein „Möglich“.
  const schuetzt = klasse(1, { currentPercent: 40, suggestedPercent: 25, recommendedPercent: 25, status: "at_risk", comparisonStatus: "at_risk",
    samples: [probe("w5", 5, [1062, 1487], [1300, 1560], { atRecommended: { percent: 25, customerNetCents: 1328, contributionCents: 266, differencePercent: -14.87 } })] });
  assert.equal(chanceLine("transglobal", classMetrics({ tariff: t22, weightClass: 1, baseClass: schuetzt, hasBase: true, scenarioId: "w5" })), null);
  assert.equal(chanceLine("transglobal", classMetrics({ tariff: t22, weightClass: 3, baseClass: projectionClass(base, "transglobal", 22, 3), hasBase: true })), null);
  // Ohne eigenen Preis im gezeigten Paket: der Grund des Servers.
  const ausfall = klasse(1, { samples: [{ ...probe("w5", 5, null, null), reason: "fetch_failed" }] });
  assert.deepEqual(classMetrics({ tariff: t22, weightClass: 1, baseClass: ausfall, hasBase: true, scenarioId: "w5" }).numbers, { available: false, reason: "fetch_failed", weightKg: 5 });
  assert.deepEqual(profitRow(klasse(1), null, "w9"), { available: false, scenarioId: "w9", reason: null, weightKg: null });
  assert.equal(profitRow(klasse(1), null, "w2").heute.purchaseNetCents, 938);
});

test("Verlauf: Einträge mit Tarif und Klasse; Zurücksetzen überall, wo der alte Wert nicht aktuell ist — auch unter 25 %", () => {
  const d = daten();
  const payload = { logs: [
    { id: 9, created_at: "2026-11-17T10:00:00.000Z", actor: { id: 1, name: "Anna Admin" }, metadata: { tariff_provider: "transglobal", tariff_product_key: 23, tariff_weight_class: 2, tariff_markup_percent: 40, tariff_markup_percent_before: 35, tariff_markup_change: "changed" } },
    { id: 8, created_at: "2026-11-16T10:00:00.000Z", actor: null, metadata: { tariff_provider: "transglobal", tariff_product_key: 22, tariff_markup_percent: 0, tariff_markup_percent_before: 20, tariff_markup_change: "changed" } },
    { id: 7, created_at: "2026-11-15T10:00:00.000Z", actor: { id: 2, name: "Ben" }, metadata: { tariff_provider: "jumingo", tariff_product_key: 1, tariff_weight_class: 4, tariff_markup_percent_before: 30, tariff_markup_change: "cleared" } },
    { id: 6, created_at: "2026-11-14T10:00:00.000Z", actor: { id: 2, name: "Ben" }, metadata: { tariff_provider: "transglobal", tariff_product_key: 23, tariff_weight_class: 2, tariff_markup_percent: 35, tariff_markup_change: "set" } },
  ] };
  const v = selectTariffHistory(payload, d.tariffs);
  assert.equal(v.length, 4);
  assert.deepEqual([v[0].tariffLabel, v[0].classLabel, v[0].before, v[0].after, v[0].actorName], ["UPS Express Saver", "über 5 bis 10 kg", 35, 40, "Anna Admin"]);
  assert.equal(v[1].weightClass, 0, "ältere Einträge ohne Klasse = alle Gewichte");
  assert.equal(v[1].classLabel, "Alle Gewichte");
  assert.equal(v[2].after, null);
  assert.equal(historyValue(null), "kein eigener Satz");
  assert.deepEqual(historyRevert(v[0], d.tariffs), { allowed: true, reason: null, key: "transglobal:23:2", value: tariffInputValue(35) });
  assert.deepEqual(historyRevert(v[1], d.tariffs), { allowed: true, reason: null, key: "transglobal:22:0", value: tariffInputValue(20) }, "20 % ist wieder speicherbar (v2.142)");
  assert.equal(historyRevert(v[2], d.tariffs).allowed, true, "30 % für Gruppe 1, Klasse 4");
  assert.deepEqual(historyRevert(v[3], d.tariffs), { allowed: true, reason: null, key: "transglobal:23:2", value: "" }, "„set“ zurück = eigenen Satz entfernen");
  assert.deepEqual(historyRevert({ ...v[0], before: 40 }, d.tariffs), { allowed: false, reason: "current" });
  assert.deepEqual(historyRevert({ ...v[0], productKey: 99 }, d.tariffs), { allowed: false, reason: "unknown" });
  assert.deepEqual(historyRevert({ ...v[0], before: 0 }, d.tariffs), { allowed: true, reason: null, key: "transglobal:23:2", value: tariffInputValue(0) }, "auch 0 %");
});

test("Fehlertexte: betroffenes Feld, abgelaufene Basis, Ratenbegrenzung — kein Untergrenzentext mehr", () => {
  const e = tariffSaveError(400, { code: "INVALID_TARIFF_MARKUP_PERCENT", provider: "jumingo", productKey: 1, weightClass: 3 });
  assert.equal(e.key, "jumingo:1:3");
  assert.equal(e.text, TARIFF_SAVE_ERRORS.INVALID_TARIFF_MARKUP_PERCENT);
  assert.match(e.text, /0 bis 100 Prozent/);
  assert.ok(!("MARKUP_BELOW_MINIMUM" in TARIFF_SAVE_ERRORS));
  assert.equal(tariffSaveError(400, { code: "MARKUP_BELOW_MINIMUM" }).text, TARIFF_SAVE_ERRORS.default, "ein alter Code bekommt keinen eigenen Text");
  assert.equal(tariffSaveError(403, null), null);
  assert.equal(tariffSaveError(500, null).text, "Die Aufschläge konnten nicht gespeichert werden. Es wurde nichts geändert.");
  assert.equal(tariffSaveError(400, { code: "INVALID_WEIGHT_CLASS" }).key, null);
  const c = comparisonError(410, { code: "COMPARISON_EXPIRED" });
  assert.equal(c.stale, true);
  assert.equal(comparisonError(429, { code: "RATE_LIMITED" }).text, "Höchstens fünf Preisvergleiche je 15 Minuten. Bitte etwas später erneut versuchen.");
  assert.equal(comparisonError(401, null), null);
  // Sicherheitsprüfung 2026-11-17: ein zweiter gleichzeitiger Vergleich desselben Administrators endet mit 409.
  assert.deepEqual(comparisonError(409, { code: "COMPARISON_RUNNING" }), { text: "Es läuft bereits ein Preisvergleich. Bitte warten, bis er abgeschlossen ist.", code: "COMPARISON_RUNNING", stale: false });
});

test("Eigenes Paket und Zielländer", () => {
  const eigen = { ...PROJEKTION, kind: "custom", scenarios: [{ id: "custom", weightClass: 1 }],
    tariffs: [{ provider: "transglobal", productKey: 22, label: "UPS Standard", classes: [klasse(1, { samples: [probe("custom", 3, [900, 1100], [1100, 1300])] })] }] };
  assert.deepEqual(customRows(eigen), [{ id: "transglobal:22", label: "UPS Standard", provider: "transglobal", customerNetCents: 1100, comparisonNetCents: 1300, differencePercent: -15.38, reason: null }]);
  assert.deepEqual(destinationOptions([{ country: "AT" }, { country: "DE" }], { AT: "Österreich", DE: "Deutschland" }).map((x) => x.code), ["DE", "AT"]);
  assert.equal(parseCustomPackageInput({ weight: "2,5", length: "30", width: "20", height: "10" }).ok, true);
  assert.equal(parseCustomPackageInput({ weight: "", length: "30", width: "20", height: "10" }).ok, false);
});

test("„Möglich bis“ in der Übersicht: größter Mehrverdienst aus belastbaren Empfehlungen, am selben Beispielpaket wie die Fläche", () => {
  const d = daten();
  const base = selectComparison(PROJEKTION, 7);
  const t = (id) => d.tariffs.find((x) => x.id === id);
  assert.equal(bestChanceCents({ base, transglobal: t("transglobal:22"), jumingo: t("jumingo:1") }), 638 - 212, "der größere Wert beider Spalten");
  assert.equal(bestChanceCents({ base, transglobal: t("transglobal:22") }), 372 - 212, "nur Klasse 1 hat eine Empfehlung nach oben (Beispielpaket 5 kg)");
  assert.equal(bestChanceCents({ base, transglobal: t("transglobal:23") }), null, "gut eingestellt: nichts möglich");
  assert.equal(bestChanceCents({ base: null, transglobal: t("transglobal:22") }), null);
});

// ── B) Contract (Quelltext) ─────────────────────────────────────────────────
test("API-Wrapper: PUT sendet genau eine Form (entries oder markups), Vorschau sendet entries oder einen leeren Body", () => {
  const api = src("api/adminApi.js");
  const block = api.slice(api.indexOf("export function updateAdminCustomerTariffMarkups"), api.indexOf("// ── Entfernt: setAdminUserTestBooking"));
  assert.match(block, /JSON\.stringify\(entries \? \{ entries: entries\.map\(tariffEntry\) \} : \{ markups \}\)/);
  assert.match(block, /JSON\.stringify\(liste\.length > 0 \? \{ entries: liste\.map\(tariffEntry\) \} : \{\}\)/);
  assert.match(block, /return \{ provider: e\.provider, productKey: e\.productKey, weightClass: e\.weightClass, markupPercent: e\.markupPercent \};/);
  assert.match(block, /\/tariff-comparison\/\$\{encodeURIComponent\(runId\)\}\/preview/);
});

test("Komponente: Providerkontakt nur hinter zwei Buttons, Speichern nur aus dem Dialog, keine Preisformel im Browser", () => {
  const k = src("components/admin/CustomerTariffMarkupSection.jsx");
  assert.equal(k.split("refreshAdminTariffComparison(userId").length - 1, 2, "nur „Preise vergleichen“ und „Vergleichen“");
  assert.match(k, /const aktualisieren = async \(\) => \{[\s\S]*?refreshAdminTariffComparison\(userId, \{ destinationCountry: destination \}\)/);
  assert.equal(k.split("updateAdminCustomerTariffMarkups(userId").length - 1, 1, "genau ein Speicherweg");
  assert.match(k, /const speichern = async \(\) => \{[\s\S]*?updateAdminCustomerTariffMarkups\(userId, buildTariffEntriesBody\(changes\.entries\)\)/);
  assert.match(k, /onConfirm=\{speichern\}/);
  assert.equal(k.split("speichern()").length - 1, 0, "speichern wird nirgends direkt aufgerufen");
  assert.ok(!/Cents\s*[*/]/.test(k), "keine Rechnung mit Centbeträgen");
  assert.ok(!/\(\s*1\s*\+\s*[a-zA-Z]/.test(k), "keine Aufschlagsformel (1 + m)");
  assert.match(k, /listAuditLogs\(\{ action: "user\.tariff_markup_change", target_user_id: userId/);
  // Vereinfachung 2026-11-17: „Empfehlung übernehmen“ füllt nur das Feld; Kennzahlen kommen aus classMetrics.
  const uebernehmen = k.slice(k.indexOf("const uebernehmen = "), k.indexOf("const selbstFestlegen = "));
  assert.match(uebernehmen, /setzeEntwurf\(key, tariffInputValue\(percent\)\)/);
  assert.ok(!/update|refresh|preview|setDialogOpen/.test(uebernehmen), "übernehmen speichert, vergleicht und bestätigt nichts");
  assert.match(k, /classMetrics\(\{ tariff: t, weightClass: wc, baseClass: bk, previewClass: pk, hasBase: baseOk/);
  // Gewichtsklassen als Reiter nach WAI-ARIA (Rolle, Auswahl, Bezug, Pfeiltasten).
  assert.match(k, /role="tablist"/);
  assert.match(k, /role="tab" id=\{`adm-po-tab-\$\{s\}-\$\{c\.weightClass\}`\}/);
  assert.match(k, /aria-selected=\{aktiv \? "true" : "false"\} aria-controls=\{`adm-po-tabpanel-\$\{s\}`\} tabIndex=\{aktiv \? 0 : -1\}/);
  assert.match(k, /role="tabpanel" id=\{`adm-po-tabpanel-\$\{s\}`\}/);
  assert.match(k, /e\.key === "ArrowRight"/);
  assert.ok(!/flowStep|TARIFF_STEPS|adm-po-step/.test(k), "keine Ablaufschritte mehr");
  // Finale Vereinfachung 2026-11-17: eine Tarifübersicht; die Kandidatenwahl ändert nur die Anzeige; „Weitere
  // JUMiNGO-Tarife“ bleiben erreichbar; die Kernaussage kommt aus verdictOf.
  assert.match(k, /const \{ areas, extra \} = useMemo\(\(\) => tariffAreas\(tariffs\), \[tariffs\]\)/);
  assert.match(k, /onChange=\{\(\) => setKandidaten\(\(k\) => \(\{ \.\.\.k, \[area\.id\]: c\.tariff\.id \}\)\)\}/);
  assert.match(k, /id="adm-po-more"/);
  assert.match(k, /const urteil = verdictOf\(\{/);
  assert.ok(!/sortTariffs/.test(k), "keine Sortierung nach Plus mehr");
  // Keine Untergrenze (v2.142): weder Feld noch Zustand, Marke, Sperre oder Rücknahmesperre.
  assert.ok(!/minimumMarkupPercent|minimum\b|below_target|belowMinimum|MARKUP_BELOW_MINIMUM|revertFloor|floorText/.test(k), "keine Untergrenze in der Karte");
  assert.match(k, /\{fieldHint\(\)\}/);
  assert.match(k, /classWarnings\(\{ baseClass: x\.bk, previewClass: x\.wartet \? null : x\.pk, provider: t\.provider, hasBase: baseOk, numbers: m\.numbers \}\)/);
  assert.match(k, /changeWarnings\(pk, r\)/);
});

test("Seite: Karte je Kunde neu montiert, Kundenbezeichnung für Schritt 1 und Dialog", () => {
  const seite = src("pages/admin/AdminUserDetailPage.jsx");
  assert.match(seite, /<CustomerTariffMarkupSection key=\{`tarife-\$\{idOf\(u\)\}`\} userId=\{idOf\(u\)\} pricing=\{pricing\}\s+customerLabel=\{companyOf\(u\) \|\| nameOf\(u\) \|\| ""\} \/>/);
});
