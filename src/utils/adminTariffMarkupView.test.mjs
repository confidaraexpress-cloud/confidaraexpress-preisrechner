// Versandpreise optimieren (Adminbereich, Preisoptimierung 2026-11-17) — Tests.
//
// Zwei Ebenen (wie customerMarkup.test.mjs, das Repo hat keine React-Render-Testinfrastruktur):
//   A) Verhalten: die reine Logik aus utils/adminTariffMarkupView.mjs (Datenmodell je Tarif und Gewichtsklasse,
//      Änderungserkennung mit Untergrenze, Gewinnvorschau aus der Serverprojektion, Zustände, Verlauf, Fehlertexte).
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
  projectionClass, hasSameDay, exampleSample, statusOf, statusText, statusWithoutComparison, profitRow, tariffSummary,
  rangeText, sortTariffs, changeWarnings, selectTariffHistory, historyRevert, historyValue, customRows,
  destinationOptions, parseCustomPackageInput, tariffSaveError, comparisonError, floorText, formatDay,
  weightTabLabel, fieldHint, reliableRecommendation, noRecommendationText, classMetrics, classWarnings,
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
  userId: 7, minimumMarkupPercent: 25, account: { standardPercent: 20, expressPercent: 30 },
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
  weightClass: wc, saved: { percent: 20, source: "standard", overridePercent: null }, effective: { percent: 20, source: "standard" }, draft: null, belowMinimum: false,
  status: "more_profit", comparisonStatus: "more_profit", belowTarget: false, hint: null, currentPercent: 20, upperBoundPercent: 45,
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
      klasse(3, { status: "no_comparison", comparisonStatus: "no_comparison", recommendedPercent: 25, suggestedPercent: null, comparedSamples: 0, exampleScenarioId: "w2",
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
  assert.equal(d.minimumMarkupPercent, 25);
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

test("Änderungen: nur echte Abweichungen; Bestandswert 0 % bleibt unangetastet; neue Werte unter 25 % sperren das Speichern", () => {
  const d = daten();
  const k = (p, key, wc) => draftKey(p, key, wc);
  assert.equal(draftValue({}, d.tariffs[0], 0), tariffInputValue(0), "Feld zeigt den Bestandswert");
  // Unverändert erneut eingegeben (auch als „0“) → keine Änderung, kein Eintrag.
  let c = tariffDraftChanges(d.tariffs, { [k("transglobal", 22, 0)]: "0" }, 25);
  assert.equal(c.count, 0);
  assert.deepEqual(c.invalid, {});
  // Neu gesetzt, geändert, entfernt.
  c = tariffDraftChanges(d.tariffs, { [k("transglobal", 22, 1)]: "35", [k("transglobal", 23, 2)]: "", [k("jumingo", 1, 4)]: "40,5" }, 25);
  assert.deepEqual(c.entries, [
    { provider: "transglobal", productKey: 22, weightClass: 1, markupPercent: 35 },
    { provider: "transglobal", productKey: 23, weightClass: 2, markupPercent: null },
    { provider: "jumingo", productKey: 1, weightClass: 4, markupPercent: 40.5 },
  ]);
  assert.deepEqual(c.invalid, {});
  // Bestandswert 0 % auf 10 % ändern = neuer Wert unter der Untergrenze: Eintrag bleibt für die Vorschau, Speichern gesperrt.
  c = tariffDraftChanges(d.tariffs, { [k("transglobal", 22, 0)]: "10" }, 25);
  assert.equal(c.count, 1);
  assert.equal(c.floor[k("transglobal", 22, 0)], true);
  assert.match(c.invalid[k("transglobal", 22, 0)], /mindestens 25\u00a0%/);
  // Zurücksetzen (leer) ist immer erlaubt; Eingabefehler erscheinen als Fehler ohne Eintrag.
  c = tariffDraftChanges(d.tariffs, { [k("transglobal", 22, 0)]: "", [k("transglobal", 22, 3)]: "abc" }, 25);
  assert.deepEqual(c.entries, [{ provider: "transglobal", productKey: 22, weightClass: 0, markupPercent: null }]);
  assert.ok(c.invalid[k("transglobal", 22, 3)]);
  assert.equal(c.floor[k("transglobal", 22, 3)], undefined);
  assert.equal(parseTariffInput("").value, null);
  assert.equal(floorText(25), "Neue Aufschläge müssen mindestens 25\u00a0% betragen. Ein bestehender niedrigerer Wert bleibt, solange Sie ihn nicht ändern.");
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
  assert.equal(statusWithoutComparison(20, 25), "below_target");
  assert.equal(statusWithoutComparison(30, 25), "not_compared");
  assert.equal(statusText(projectionClass(PROJEKTION, "transglobal", 22, 4), "transglobal"), `${STATUS_VIEW.at_risk.text} JUMiNGO kauft dieses Gewicht günstiger ein.`);
  assert.equal(statusText(projectionClass(PROJEKTION, "transglobal", 22, 3), "transglobal"), STATUS_VIEW.no_comparison.text);
  const nichtVerfuegbar = klasse(3, { status: "no_comparison", samples: [probe("w12", 12, null, null)] });
  assert.equal(statusText(nichtVerfuegbar, "transglobal"), "Dieser Tarif ist für dieses Ziel und Gewicht nicht verfügbar.");
  for (const s of ["good", "more_profit", "at_risk", "below_target", "no_comparison"]) {
    assert.ok(STATUS_VIEW[s].label && STATUS_VIEW[s].text && STATUS_VIEW[s].tone, `${s}: Wortlaut und Farbton`);
  }
  assert.deepEqual(
    ["good", "more_profit", "at_risk", "below_target", "no_comparison"].map((s) => STATUS_VIEW[s].label),
    ["Gut eingestellt", "Hier ist mehr Gewinn möglich", "Preisvorteil gefährdet", "Unter dem Zielaufschlag", "Kein verlässlicher Vergleich"],
  );
});

test("Gewinnvorschau: heute gegen Empfehlung bzw. Entwurf — Werte nur aus der Serverprojektion, immer dasselbe Beispielpaket", () => {
  const heute = projectionClass(PROJEKTION, "transglobal", 22, 1);
  const r = profitRow(heute, null);
  assert.equal(r.art, "recommendation");
  assert.deepEqual(r.heute, { percent: 20, customerNetCents: 1274, contributionCents: 212, comparisonNetCents: 1560, differencePercent: -18.33 });
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

test("Tarifliste: wichtigster Zustand, Plus je Sendung, sortiert nach Plus; ohne Basis rot nur unter der Untergrenze", () => {
  const d = daten();
  const base = selectComparison(PROJEKTION, 7);
  const s = Object.fromEntries(d.tariffs.map((t) => [t.id, tariffSummary(t, base, { minimumPercent: 25 })]));
  assert.equal(s["transglobal:22"].status, "at_risk", "gefährdet geht vor mehr Gewinn");
  assert.equal(s["transglobal:22"].plusCents, 160);
  assert.equal(s["jumingo:1"].plusCents, 638 - 212);
  assert.equal(s["transglobal:23"].plusCents, null);
  assert.deepEqual(sortTariffs(d.tariffs, s).map((t) => t.id), ["jumingo:1", "transglobal:22", "transglobal:23"]);
  const ohne = tariffSummary(d.tariffs[0], null, { minimumPercent: 25 });
  assert.equal(ohne.status, "below_target", "Bestandswert 0 % ist unter dem Zielaufschlag");
  assert.equal(tariffSummary(d.tariffs[1], null, { minimumPercent: 25 }).status, "not_compared");
  assert.deepEqual(ohne.today, { min: 0, max: 0 });
});

// Eine Klasse unter der Untergrenze OHNE Vergleichsangebot: der Server schlägt die Untergrenze vor — keine Empfehlung.
const ohneVergleich = (wc) => klasse(wc, { status: "below_target", comparisonStatus: "no_comparison", belowTarget: true, currentPercent: 0,
  recommendedPercent: 25, suggestedPercent: 25, comparedSamples: 0, limitingScenarioId: null, exampleScenarioId: "w12",
  samples: [probe("w12", 12, [1500, 1500], null, { atRecommended: { percent: 25, customerNetCents: 1875, contributionCents: 375, differencePercent: null } })] });

test("Belastbare Empfehlung: nur mit Vergleichsangebot; Kurzgrund ohne Empfehlung", () => {
  assert.equal(reliableRecommendation(klasse(1)), true);
  assert.equal(reliableRecommendation(projectionClass(PROJEKTION, "transglobal", 22, 3)), false, "kein Vergleich");
  assert.equal(reliableRecommendation(ohneVergleich(1)), false, "Untergrenze ohne Vergleich ist keine Empfehlung");
  assert.equal(reliableRecommendation(null), false);
  assert.equal(noRecommendationText(klasse(1, { samples: [] })), "Kein Beispielpaket");
  assert.equal(noRecommendationText(klasse(1, { samples: [probe("w5", 5, null, null)] })), "Tarif hier nicht verfügbar");
  assert.equal(noRecommendationText(klasse(1, { samples: [{ ...probe("w5", 5, null, null), reason: "fetch_failed" }] })), "Preise nicht abrufbar");
  assert.equal(noRecommendationText(projectionClass(PROJEKTION, "transglobal", 22, 3)), "Kein vergleichbares Angebot");
  // Tarifliste: Empfohlen-Spanne nur aus belastbaren Klassen (Klasse 3 ohne Vergleich zählt nicht), ohne sie weder Plus noch Spanne.
  const d = daten();
  assert.deepEqual(tariffSummary(d.tariffs[0], selectComparison(PROJEKTION, 7), { minimumPercent: 25 }).recommended, { min: 25, max: 35 });
  const nurOhne = { ...PROJEKTION, tariffs: [{ provider: "transglobal", productKey: 22, label: "UPS Standard", classes: [1, 2, 3, 4].map(ohneVergleich) }] };
  const s = tariffSummary(d.tariffs[0], selectComparison(nurOhne, 7), { minimumPercent: 25 });
  assert.deepEqual([s.status, s.plusCents, s.recommended], ["below_target", null, null]);
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
  // Unter der Untergrenze ohne Vergleich: der Server schlägt 25 % vor, die Karte bietet trotzdem nichts zum Übernehmen an.
  m = classMetrics({ tariff: t, weightClass: 3, baseClass: ohneVergleich(3), hasBase: true });
  assert.deepEqual([m.recommended.percent, m.adoptPercent, m.more.value], [null, null, "—"]);
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

test("Sichtbare Hinweise: Preisvorteil gefährdet (mit Grund), unter der Untergrenze; Entwurf zählt über die Vorschau", () => {
  const k4 = projectionClass(PROJEKTION, "transglobal", 22, 4);
  assert.deepEqual(classWarnings({ baseClass: k4, currentPercent: 30, minimumPercent: 25, provider: "transglobal", hasBase: true }),
    [{ status: "at_risk", text: `${STATUS_VIEW.at_risk.text} JUMiNGO kauft dieses Gewicht günstiger ein.`, draft: false }]);
  assert.deepEqual(classWarnings({ currentPercent: 0, minimumPercent: 25, hasBase: false }),
    [{ status: "below_target", text: STATUS_VIEW.below_target.text, draft: false }], "ohne Vergleich: Bestandswert unter 25 %");
  assert.deepEqual(classWarnings({ currentPercent: 30, minimumPercent: 25, hasBase: false }), []);
  assert.deepEqual(classWarnings({ baseClass: ohneVergleich(1), currentPercent: 0, minimumPercent: 25, provider: "transglobal", hasBase: true }).map((w) => w.status), ["below_target"]);
  // Entwurf macht den Preisvorteil gefährdet → Hinweis aus der Vorschau; der alte „unter der Untergrenze“-Hinweis entfällt.
  const entwurf = klasse(1, { currentPercent: 30, draft: { percent: 30 }, status: "at_risk", comparisonStatus: "at_risk" });
  assert.deepEqual(classWarnings({ baseClass: ohneVergleich(1), previewClass: entwurf, currentPercent: 0, minimumPercent: 25, provider: "transglobal", hasBase: true })
    .map((w) => [w.status, w.draft]), [["at_risk", true]]);
  assert.deepEqual(classWarnings({ baseClass: projectionClass(PROJEKTION, "transglobal", 22, 1), currentPercent: 20, minimumPercent: 25, provider: "transglobal", hasBase: true }), []);
});

test("Dialoghinweise, Reiter und Wortlaute der vereinfachten Karte", () => {
  assert.deepEqual(changeWarnings(klasse(1, { status: "at_risk", comparisonStatus: "at_risk", comparedSamples: 1 })), ["at_risk", "weak"]);
  assert.deepEqual(changeWarnings(klasse(1, { status: "below_target", comparisonStatus: "no_comparison", comparedSamples: 0 })), ["no_comparison"]);
  assert.deepEqual(changeWarnings(klasse(1)), []);
  // Reiter aus den Klassenbezeichnungen des Servers — die Grenzen definiert nur der Server.
  assert.deepEqual(KLASSEN.map(([, l]) => weightTabLabel(l)), ["Bis 5 kg", "Über 5–10 kg", "Über 10–20 kg", "Über 20 kg"]);
  assert.equal(weightTabLabel(""), "");
  assert.equal(fieldHint(25), "Mindestens 25 %. Leer = kein eigener Satz.");
  assert.equal(fieldHint(null), "Leer = kein eigener Satz.");
  const T = TARIFF_TEXTS;
  assert.deepEqual([T.sectionTitle, T.current, T.recommended, T.metricMore, T.noRecommendation, T.adopt, T.custom, T.details, T.save, T.dialogConfirm],
    ["Versandpreise optimieren", "Ihr Aufschlag", "Empfohlen", "Mehr pro Sendung", "Keine Empfehlung verfügbar", "Empfehlung übernehmen", "Selbst festlegen", "Details anzeigen", "Speichern", "Ja, speichern"]);
  assert.match(T.contributionNote, /^Deckungsbeitrag = Kundenpreis minus Einkaufspreis, netto/);
});

test("Verlauf: Einträge mit Tarif und Klasse; Zurücksetzen nur, wo der alte Wert speicherbar und nicht aktuell ist", () => {
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
  assert.deepEqual(historyRevert(v[0], d.tariffs, 25), { allowed: true, reason: null, key: "transglobal:23:2", value: tariffInputValue(35) });
  assert.deepEqual(historyRevert(v[1], d.tariffs, 25), { allowed: false, reason: "floor" }, "20 % wäre ein neuer Wert unter 25 %");
  assert.equal(historyRevert(v[2], d.tariffs, 25).allowed, true, "30 % für Gruppe 1, Klasse 4");
  assert.deepEqual(historyRevert(v[3], d.tariffs, 25), { allowed: true, reason: null, key: "transglobal:23:2", value: "" }, "„set“ zurück = eigenen Satz entfernen");
  assert.deepEqual(historyRevert({ ...v[0], before: 40 }, d.tariffs, 25), { allowed: false, reason: "current" });
  assert.deepEqual(historyRevert({ ...v[0], productKey: 99 }, d.tariffs, 25), { allowed: false, reason: "unknown" });
});

test("Fehlertexte: Untergrenze am betroffenen Feld, abgelaufene Basis, Ratenbegrenzung", () => {
  const e = tariffSaveError(400, { code: "MARKUP_BELOW_MINIMUM", provider: "jumingo", productKey: 1, weightClass: 3 }, 25);
  assert.equal(e.key, "jumingo:1:3");
  assert.match(e.text, /mindestens 25\u00a0%/);
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
});

test("Seite: Karte je Kunde neu montiert, Kundenbezeichnung für Schritt 1 und Dialog", () => {
  const seite = src("pages/admin/AdminUserDetailPage.jsx");
  assert.match(seite, /<CustomerTariffMarkupSection key=\{`tarife-\$\{idOf\(u\)\}`\} userId=\{idOf\(u\)\} pricing=\{pricing\}\s+customerLabel=\{companyOf\(u\) \|\| nameOf\(u\) \|\| ""\} \/>/);
});
