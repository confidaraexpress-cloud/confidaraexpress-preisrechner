// utils/tierInsuranceCover.test.mjs — Betreiberentscheidungen E1/E2 (2026-11-10) in der Oberfläche.
//
//   E1  über der Grenze des Tarifs keine Zusatzversicherung — auch keine teilweise; der Versand bleibt buchbar
//   E2  der Versicherungswert ist nie höher als der Warenwert
//
// Die Grenze nennt der Server je Stufe (`tariff.insuranceCover`); die Oberfläche liest sie nur.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TIER_COVER_STATE, tierCoverEntry, maxInsuredValueFor, availableInsuranceTiers, tierCoverNotice,
  insuredValueError, underinsuranceHint, defaultInsuredValue,
} from "./tierInsuranceCover.mjs";
import { offerCardInsurance, insuranceTypeForTariff } from "./coverInsuranceView.mjs";
import { repriceFehlerText } from "./bookingErrors.mjs";
import { TIER_COVER_TEXT, tierCoverLimitText, tierInsuredValueHint } from "./insuranceTerms.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");
// Intl setzt vor „€" ein geschütztes Leerzeichen — für den Textvergleich ein gewöhnliches.
const leer = (s) => String(s).split(String.fromCharCode(160)).join(" ").split(String.fromCharCode(8239)).join(" ");

// Ein JUMiNGO-Stufentarif, wie /calculate-price ihn liefert (Stufenmodell: kein selectionModel).
const tarif = (insuranceCover) => ({
  insuranceAvailable: true,
  insuranceDetails: { isInsurable: true, insuranceValue: 510,
                      extraInsurancePriceBruttoPreselect: 3.99, extraInsurancePremiumPriceBruttoPreselect: 7.99 },
  insuranceCover,
});
const verfuegbar = (max) => ({ state: "available", coverLimit: 20000, maxInsuredValue: max });
const ueber = (grenze = 20000) => ({ state: "above_cover_limit", coverLimit: grenze, maxInsuredValue: null });

test("T1 beide Stufen wählbar: Höchstwert = Warenwert in ganzen Euro vom Server", () => {
  const t = tarif({ standard: verfuegbar(500), premium: verfuegbar(500) });
  assert.deepEqual(availableInsuranceTiers(t), ["standard", "premium"]);
  assert.equal(maxInsuredValueFor(t, "standard"), 500);
  assert.equal(defaultInsuredValue(t, "premium"), "500");
  assert.equal(tierCoverNotice(t), null);
});

test("T2 E1: Warenwert über der Grenze → keine Stufe, Hinweis mit der Grenze des Servers", () => {
  const t = tarif({ standard: ueber(), premium: ueber() });
  assert.deepEqual(availableInsuranceTiers(t), []);
  const hinweis = tierCoverNotice(t);
  assert.equal(hinweis.kind, TIER_COVER_STATE.ABOVE_COVER_LIMIT);
  assert.equal(leer(hinweis.text), "Für diesen Warenwert ist keine Zusatzversicherung verfügbar. Eine Zusatzversicherung ist für diesen Tarif nur bis zu einem Warenwert von 20.000 € möglich.");
});

test("T3 Stufen mit unterschiedlicher Grenze: nur die wählbare Stufe erscheint", () => {
  const t = tarif({ standard: verfuegbar(6000), premium: ueber(5000) });
  assert.deepEqual(availableInsuranceTiers(t), ["standard"]);
  assert.equal(maxInsuredValueFor(t, "premium"), null);
  assert.equal(tierCoverNotice(t), null);
  assert.deepEqual(offerCardInsurance(t).tiers, ["standard"]);
});

test("T4 ohne Serveraussage keine Stufe (fail closed) — auch keine feste Ersatzgrenze", () => {
  for (const ohne of [undefined, null, {}, { standard: { state: "cover_limit_unknown", coverLimit: null, maxInsuredValue: null } }]) {
    const t = tarif(ohne);
    assert.deepEqual(availableInsuranceTiers(t), [], JSON.stringify(ohne));
    assert.equal(tierCoverNotice(t).text, TIER_COVER_TEXT.unavailable);
  }
  // Ein „available" ohne gültigen Höchstwert ist keine wählbare Stufe.
  assert.deepEqual(availableInsuranceTiers(tarif({ standard: { state: "available", coverLimit: 20000, maxInsuredValue: 0 } })), []);
  assert.deepEqual(availableInsuranceTiers(tarif({ standard: { state: "available", coverLimit: 20000, maxInsuredValue: 499.5 } })), []);
});

test("T5 E2: Versicherungswert gleich Warenwert zulässig, ein Euro mehr abgelehnt", () => {
  assert.equal(insuredValueError("500", 500), "");
  assert.equal(insuredValueError("501", 500), TIER_COVER_TEXT.valueExceedsGoods);
  assert.equal(insuredValueError("1", 500), "");
});

test("T6 ganze Euro: Cent, 0, leer und Unsinn werden abgelehnt, nichts gerundet", () => {
  assert.equal(insuredValueError("499,50", 500), TIER_COVER_TEXT.valueWholeEuros);
  assert.equal(insuredValueError("499.5", 500), TIER_COVER_TEXT.valueWholeEuros);
  assert.equal(insuredValueError("0", 500), TIER_COVER_TEXT.valueMin);
  assert.equal(insuredValueError("", 500), TIER_COVER_TEXT.valueRequired);
  assert.equal(insuredValueError("abc", 500), TIER_COVER_TEXT.valueInvalid);
  assert.equal(insuredValueError("100", null), TIER_COVER_TEXT.unavailable, "ohne Höchstwert keine wählbare Stufe");
});

test("T7 Unterversicherung wird gesagt, volle Versicherung nicht", () => {
  assert.equal(underinsuranceHint("400", "500"), TIER_COVER_TEXT.underinsurance);
  assert.equal(underinsuranceHint("500", "500"), "");
  assert.equal(underinsuranceHint("500", "500.50"), TIER_COVER_TEXT.underinsurance, "500 € von 500,50 € ist nicht voll");
  assert.equal(underinsuranceHint("", "500"), "");
  assert.equal(underinsuranceHint("499.5", "500"), "", "ein unzulässiger Wert bekommt den Fehler, nicht den Hinweis");
});

test("T8 Angebotskarte und Buchungsseite: dieselbe Entscheidung (insurable nur mit wählbarer Stufe)", () => {
  const ja = offerCardInsurance(tarif({ standard: verfuegbar(300), premium: verfuegbar(300) }));
  assert.equal(ja.insurable, true);
  assert.equal(ja.notice, null);
  const nein = offerCardInsurance(tarif({ standard: ueber(), premium: ueber() }));
  assert.equal(nein.insurable, false);
  assert.equal(nein.explicitlyUnavailable, false, "über der Grenze ist eine Aussage, kein „nicht verfügbar“");
  assert.match(nein.notice.text, /^Für diesen Warenwert ist keine Zusatzversicherung verfügbar\./);
  // Das Deckungsbetragsmodell (Transportabsicherung) ist davon unberührt.
  const deckung = offerCardInsurance({ insuranceAvailable: true, insuranceDetails: { isInsurable: true, selectionModel: "cover_value" } });
  assert.equal(deckung.insurable, true);
  assert.deepEqual(deckung.tiers, []);
});

test("T9 eine gespeicherte Stufe wird nur wiederhergestellt, wenn der Server sie anbietet", () => {
  const t = tarif({ standard: verfuegbar(300), premium: ueber(200) });
  assert.equal(insuranceTypeForTariff("standard", t), "standard");
  assert.equal(insuranceTypeForTariff("premium", t), "none");
  assert.equal(insuranceTypeForTariff("standard", tarif(undefined)), "none");
});

test("T10 Neubepreisungsfehler: Codes statt Rohtext, Grenze im Satz", () => {
  assert.equal(repriceFehlerText({ code: "INSURANCE_COVER_LIMIT_EXCEEDED", maxCoverValue: 20000 }), tierCoverLimitText(20000));
  assert.equal(repriceFehlerText({ code: "INSURANCE_COVER_LIMIT_EXCEEDED" }), TIER_COVER_TEXT.limitExceeded);
  assert.equal(repriceFehlerText({ code: "INSURANCE_VALUE_EXCEEDS_GOODS_VALUE" }), "Der Versicherungswert darf den Warenwert nicht überschreiten.");
  assert.equal(repriceFehlerText({ code: "INSURANCE_UNAVAILABLE" }), TIER_COVER_TEXT.unavailable);
  assert.equal(repriceFehlerText({ code: "INSURANCE_VALUE_INVALID" }), TIER_COVER_TEXT.valueWholeEuros);
  assert.doesNotMatch(repriceFehlerText({ code: "INSURANCE_VALUE_INVALID" }), /20\.000/);
});

test("T11 Hinweis unter dem Versicherungswert nennt den Höchstwert, sonst neutral", () => {
  assert.equal(leer(tierInsuredValueHint(500)), "Höchstens 500 € (Warenwert in ganzen Euro). Standardmäßig entspricht er dem Warenwert.");
  assert.equal(tierInsuredValueHint(null), "Standardmäßig entspricht er dem Warenwert.");
});

test("T12 keine feste Grenze und kein Anbietername in den neuen Modulen", () => {
  const quelle = lies("tierInsuranceCover.mjs").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(quelle, /20000|20\.000/);
  for (const t of Object.values(TIER_COVER_TEXT)) assert.doesNotMatch(t, /jumingo|kravag|transglobal/i);
});

test("T13 tierCoverEntry liest nur echte Einträge der beiden Stufen", () => {
  assert.equal(tierCoverEntry(tarif({ standard: verfuegbar(1) }), "none"), null);
  assert.equal(tierCoverEntry(tarif({ standard: "x" }), "standard"), null);
  assert.deepEqual(tierCoverEntry(tarif({ standard: verfuegbar(1) }), "standard"), verfuegbar(1));
});
