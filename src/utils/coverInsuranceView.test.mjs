// TG-F8 — zusätzliche Transportabsicherung. Seit TG22 Paket B ist der Versicherungswert der
// eingefrorene Warenwert der Sendung (keine eigene Eingabe mehr), und ein Tarif ohne kaufbaren
// Zusatz sagt neutral, was gilt: enthaltene Grundabsicherung oder Höchstdeckung.
//
// Zwei Ebenen (wie im Repo etabliert — es gibt keine React-Render-Testschicht):
//   A) Verhalten der reinen Logik (utils/coverInsuranceView.mjs, insuranceTerms.mjs).
//   B) Quelltextanker auf KOMMENTARFREIEM Code der Buchungsfläche, der Angebotskarte und
//      der Admin-Detailseite — dort, wo die Aussage am Rendering oder am Request hängt.
//      Der Browserbeweis steht in tests/e2e/insuranceCoverValue.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";

import {
  INSURANCE_TYPE_TRANSIT_COVER, SELECTION_MODEL_COVER_VALUE, COVER_VALUE_SOURCE_GOODS_VALUE, COVER_STATE,
  isCoverValueModel, coverExcessValue, tristateAnswer, goodsAnswerError,
  coverValueForTariff, coverInsuranceNotice, coverRepriceNotice,
  buildCoverRepricePayload, buildCoverBookInsurancePayload,
  insuranceTypeForTariff, coverRepriceErrorText, coverBookErrorText, coverBookErrorRequiresReprice,
  insuredPriceChangeView, offerCardInsurance, COVER_BOOK_ERROR_CODES, isCoverBookError,
  priceChangeBreakdownLines, COVER_PRICE_CHANGE_TEXT,
} from "./coverInsuranceView.mjs";
import {
  COVER_INSURANCE_TEXT, INSURANCE_TEXT, INSURANCE_CARD_COPY, INSURANCE_DIALOG,
  coverExcessText, coverInsuranceCardCopy, coverBasicCoverText, coverLimitText,
} from "./insuranceTerms.mjs";
import { getBookingModules } from "./bookingModules.js";
import { PRICE_CHANGE_KIND, preisIstBestaetigbar } from "./priceChangeView.mjs";
import { buchungsSeite, lies } from "../testing/quelltext.mjs";

const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/gm, "$1");
// Intl setzt zwischen Betrag und Eurozeichen ein geschütztes Leerzeichen.
const flach = (s) => String(s).replace(/\s/g, " ");

// Die Beschreibung des Servers seit TG22 Paket B: Deckung = Warenwert, mit ihren Grenzen.
const WARENWERT_DETAILS = {
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
  coverValueSource: "goods_value", coverState: "available", coverValue: 500,
  basicCoverMaxGoodsValue: 50, maxCoverValue: 2500,
};
const TG_TARIF = {
  offerId: "0123456789abcdef0123456789abcdef", netPrice: 10.8, vatAmount: 2.05, finalPrice: 12.85,
  bookable: true, insuranceAvailable: true, insuranceDetails: WARENWERT_DETAILS,
};
// Ein Tarif aus einer älteren Antwort — ohne Deckungsquelle. Er bleibt bedienbar.
const TG_TARIF_ALT = {
  ...TG_TARIF,
  insuranceDetails: { isInsurable: true, selectionModel: "cover_value", excessValue: 20,
                      requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true },
};
// Warenwert bis 50 €: kein kaufbarer Zusatz, aber eine Aussage.
const TG_GRUNDSCHUTZ = {
  ...TG_TARIF, offerId: "b".repeat(32), insuranceAvailable: false,
  insuranceDetails: { ...WARENWERT_DETAILS, isInsurable: false, priceOnSelection: false,
                      coverState: "basic_cover_included", coverValue: null },
};
const TG_HOECHSTDECKUNG = {
  ...TG_TARIF, offerId: "c".repeat(32), insuranceAvailable: false,
  insuranceDetails: { ...WARENWERT_DETAILS, isInsurable: false, priceOnSelection: false,
                      coverState: "above_cover_limit", coverValue: null },
};
const JU_TARIF = {
  id: 7, shipper_tariff_id: 3309, netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19,
  insuranceAvailable: true,
  insuranceDetails: { isInsurable: true, extraInsurancePriceBruttoPreselect: 3.99,
                      extraInsurancePremiumPriceBruttoPreselect: 7.49 },
};
const TG_NICHT_VERSICHERBAR = { offerId: "f".repeat(32), bookable: false, insuranceAvailable: false, insuranceDetails: null };

/* ══════════ A) Modellerkennung ═════════════════════════════════════════════ */

test("A1 — das Deckungsbetragsmodell kommt ausschließlich aus insuranceDetails.selectionModel", () => {
  assert.equal(SELECTION_MODEL_COVER_VALUE, "cover_value");
  assert.equal(COVER_VALUE_SOURCE_GOODS_VALUE, "goods_value");
  assert.equal(isCoverValueModel(TG_TARIF), true);
  assert.equal(isCoverValueModel(TG_TARIF_ALT), true);
  assert.equal(isCoverValueModel(TG_GRUNDSCHUTZ), true, "die Grundabsicherung gehört zum selben Modell");
  assert.equal(isCoverValueModel(JU_TARIF), false, "ein Stufentarif ist kein Deckungsbetragstarif");
  for (const t of [null, undefined, {}, { insuranceDetails: null }, { insuranceDetails: { selectionModel: "tiers" } },
                   TG_NICHT_VERSICHERBAR]) {
    assert.equal(isCoverValueModel(t), false, JSON.stringify(t));
  }
});

test("A2 — die Selbstbeteiligung stammt aus dem Tarif; fehlt sie, wird keine erfunden", () => {
  assert.equal(coverExcessValue(TG_TARIF), 20);
  for (const ex of [undefined, null, "20", -1, NaN]) {
    assert.equal(coverExcessValue({ insuranceDetails: { selectionModel: "cover_value", excessValue: ex } }), null);
  }
  assert.equal(flach(coverExcessText(20)), "Selbstbeteiligung: 20,00 €");
  assert.equal(flach(coverExcessText(0)), "Selbstbeteiligung: 0,00 €");
  assert.equal(coverExcessText(null), null);
  assert.equal(coverExcessText("20"), null);
});

test("A3 — eine gespeicherte Auswahl gilt nur für das Modell DIESES Tarifs", () => {
  assert.equal(insuranceTypeForTariff("transit_cover", TG_TARIF), "transit_cover");
  assert.equal(insuranceTypeForTariff("transit_cover", TG_TARIF_ALT), "transit_cover");
  assert.equal(insuranceTypeForTariff("standard", TG_TARIF), "none", "eine Stufe an einem Deckungsbetragstarif");
  assert.equal(insuranceTypeForTariff("premium", TG_TARIF), "none");
  assert.equal(insuranceTypeForTariff("transit_cover", JU_TARIF), "none", "Deckungsbetrag an einem Stufentarif");
  assert.equal(insuranceTypeForTariff("standard", JU_TARIF), "standard");
  assert.equal(insuranceTypeForTariff("premium", JU_TARIF), "premium");
  assert.equal(insuranceTypeForTariff("gold", JU_TARIF), "none");
  // TG22 Paket B: ohne kaufbaren Zusatz wird keine Absicherung wiederhergestellt.
  assert.equal(insuranceTypeForTariff("transit_cover", TG_GRUNDSCHUTZ), "none");
  assert.equal(insuranceTypeForTariff("transit_cover", TG_HOECHSTDECKUNG), "none");
});

/* ══════════ A) Validierung ═════════════════════════════════════════════════ */

test("A4 — die Fragen zur Ware sind Pflicht und dreiwertig: null ist KEINE Antwort", () => {
  assert.equal(goodsAnswerError(true), "");
  assert.equal(goodsAnswerError(false), "", "„Nein“ ist eine vollwertige Antwort");
  for (const roh of [null, undefined, "true", "false", 1, 0, ""]) {
    assert.equal(goodsAnswerError(roh), COVER_INSURANCE_TEXT.answerRequired, JSON.stringify(roh));
    assert.equal(tristateAnswer(roh), null);
  }
  assert.equal(tristateAnswer(false), false);
});

test("A5 — der Versicherungswert IST der Warenwert: vom Server am Tarif, sonst der eingefrorene Warenwert", () => {
  // Der Serverwert gewinnt — auch gegen einen abweichenden Anzeigewert des Vorgangs.
  assert.equal(coverValueForTariff(TG_TARIF, "999"), 500);
  // Ein Tarif aus einer älteren Antwort: der eingefrorene Warenwert des Vorgangs.
  assert.equal(coverValueForTariff(TG_TARIF_ALT, "250"), 250);
  assert.equal(coverValueForTariff(TG_TARIF_ALT, "250,50"), 250.5);
  assert.equal(coverValueForTariff(TG_TARIF_ALT, 75), 75);
  for (const kaputt of ["", "   ", "abc", "0", "-5", "10.123", null, undefined]) {
    assert.equal(coverValueForTariff(TG_TARIF_ALT, kaputt), null, JSON.stringify(kaputt));
  }
  // Ein unbrauchbarer Serverwert wird nicht übernommen.
  assert.equal(coverValueForTariff({ insuranceDetails: { ...WARENWERT_DETAILS, coverValue: "500" } }, "250"), 250);
  assert.equal(coverValueForTariff({ insuranceDetails: { ...WARENWERT_DETAILS, coverValue: 0 } }, ""), null);
});

/* ══════════ A) Payloads ════════════════════════════════════════════════════ */

test("A6 — die Neubepreisung sendet höchstens offerId, coverValue (= Warenwert), goodsAreNew, goodsAreFragile", () => {
  const p = buildCoverRepricePayload({ offerId: TG_TARIF.offerId, coverValue: 500, goodsAreNew: true, goodsAreFragile: false });
  assert.deepEqual(Object.keys(p).sort(), ["coverValue", "goodsAreFragile", "goodsAreNew", "offerId"]);
  assert.deepEqual(p, { offerId: TG_TARIF.offerId, coverValue: 500, goodsAreNew: true, goodsAreFragile: false });
  // Kein Preis, keine Selbstbeteiligung, kein Tarif, keine Sendungsreferenz.
  for (const verboten of ["excessValue", "price", "insuranceGross", "tariffId", "shipperTariffId", "shipmentId", "provider"]) {
    assert.ok(!(verboten in p), `${verboten} im Neubepreisungskörper`);
  }
  // Ohne gültigen Betrag reist kein Versicherungswert mit — der Server nennt ihn selbst.
  for (const kaputt of [null, undefined, 0, -1, "500", NaN, 10.123]) {
    const ohne = buildCoverRepricePayload({ offerId: TG_TARIF.offerId, coverValue: kaputt, goodsAreNew: true, goodsAreFragile: false });
    assert.deepEqual(ohne, { offerId: TG_TARIF.offerId, goodsAreNew: true, goodsAreFragile: false }, JSON.stringify(kaputt));
  }
});

test("A7 — /book sendet transit_cover mit denselben Angaben und dem bestätigten Gesamtbetrag", () => {
  const repriceResult = { totals: { customerTotalGross: 22.85, insuranceGross: 10 } };
  const p = buildCoverBookInsurancePayload({ coverValue: 500, goodsAreNew: true, goodsAreFragile: false, repriceResult });
  assert.deepEqual(p, {
    insuranceSelection: { type: "transit_cover", coverValue: 500, goodsAreNew: true, goodsAreFragile: false },
    confirmedTotalGross: 22.85,
  });
  assert.equal(INSURANCE_TYPE_TRANSIT_COVER, "transit_cover");
  // Ohne Neubepreisung gibt es keinen bestätigten Betrag — es wird keiner erfunden.
  assert.equal(buildCoverBookInsurancePayload({ coverValue: 1, goodsAreNew: true, goodsAreFragile: true }).confirmedTotalGross, undefined);
  assert.ok(!("excessValue" in p.insuranceSelection), "die Selbstbeteiligung setzt der Server");
  // Ohne gültigen Betrag kein Versicherungswert — der Server bucht die Bindung mit dem Warenwert.
  const ohne = buildCoverBookInsurancePayload({ coverValue: null, goodsAreNew: true, goodsAreFragile: false, repriceResult });
  assert.deepEqual(ohne.insuranceSelection, { type: "transit_cover", goodsAreNew: true, goodsAreFragile: false });
});

/* ══════════ A) Fehler und Preisänderung ════════════════════════════════════ */

test("A8 — Fehlertexte kommen aus dem CODE, nie aus dem Rohtext des Servers", () => {
  const roh = { code: "INSURANCE_UNAVAILABLE", error: "ROHTEXT Transglobal" };
  assert.equal(coverRepriceErrorText(409, roh), COVER_INSURANCE_TEXT.unavailable);
  assert.match(coverRepriceErrorText(409, { code: "PRICE_CHANGED", price: 30 }), /neu/);
  assert.match(coverRepriceErrorText(400, { code: "INSURANCE_SELECTION_INVALID" }), /beide Fragen zur Ware/);
  assert.match(coverRepriceErrorText(409, { code: "INSURANCE_SELECTION_MISMATCH", error: "ROHTEXT" }), /Angebote neu/);
  assert.match(coverRepriceErrorText(503, {}), /nicht bestätigt/);
  assert.match(coverRepriceErrorText(429, null), /Zu viele/);
  assert.equal(coverRepriceErrorText(500, { error: "boom" }), COVER_INSURANCE_TEXT.summaryError);
  for (const code of ["INSURANCE_NOT_BOUND", "INSURANCE_SELECTION_MISMATCH", "PRICE_CONFIRMATION_REQUIRED",
                      "INSURANCE_UNAVAILABLE", "UNBEKANNT"]) {
    const t = coverBookErrorText({ code, error: "ROHTEXT Transglobal" });
    assert.ok(t && !/ROHTEXT|Transglobal/.test(t), code);
  }
  for (const code of ["INSURANCE_NOT_BOUND", "INSURANCE_SELECTION_MISMATCH", "PRICE_CONFIRMATION_REQUIRED"]) {
    assert.equal(coverBookErrorRequiresReprice({ code }), true, code);
  }
  assert.equal(coverBookErrorRequiresReprice({ code: "INSURANCE_UNAVAILABLE" }), false);
  // Ein fremder Konflikt löst keine Neubepreisung aus und gehört nicht in den Absicherungszweig.
  for (const fremd of [{ code: "DUPLICATE" }, { code: "BOOKING_FAILED" }, {}, null]) {
    assert.equal(coverBookErrorRequiresReprice(fremd), false, JSON.stringify(fremd));
    assert.equal(COVER_BOOK_ERROR_CODES.includes(fremd && fremd.code), false);
  }
});

test("A9 — versicherte Preisänderung: bestätigbar mit bisherigem und neuem Gesamtbetrag", () => {
  const v = insuredPriceChangeView({ code: "PRICE_CHANGED", price: 24.1 }, 22.85);
  assert.equal(v.kind, PRICE_CHANGE_KIND.CONFIRMABLE);
  assert.equal(v.oldPrice, 22.85);
  assert.equal(v.newPrice, 24.1);
  assert.equal(v.insured, true);
  assert.equal(preisIstBestaetigbar(v), true);
  // Fehlt einer der Beträge, gibt es nur die Neuberechnung — kein erfundener Nullbetrag.
  assert.equal(insuredPriceChangeView({ code: "PRICE_CHANGED" }, 22.85).kind, PRICE_CHANGE_KIND.RECALCULATE);
  assert.equal(insuredPriceChangeView({ code: "PRICE_CHANGED", price: 24.1 }, undefined).kind, PRICE_CHANGE_KIND.RECALCULATE);
  assert.equal(insuredPriceChangeView({ code: "PRICE_CHANGED", price: "24.1" }, 22.85).kind, PRICE_CHANGE_KIND.RECALCULATE);
  // Eine Antwort mit Paar bleibt ihr eigenes Paar.
  const paar = insuredPriceChangeView({ code: "PRICE_CHANGED", oldPrice: 1, newPrice: 2 }, 99);
  assert.deepEqual([paar.oldPrice, paar.newPrice, paar.insured], [1, 2, true]);
});

/* ══════════ A) TG22 Paket A — ausdrückliche Übernahme ══════════════════════ */

test("A13 — Neubepreisung mit Übernahme: nur der vom Server genannte Gesamtbetrag, nie ein Preis", () => {
  const basis = { offerId: "0123456789abcdef0123456789abcdef", coverValue: 500, goodsAreNew: true, goodsAreFragile: false };
  assert.deepEqual(buildCoverRepricePayload({ ...basis, acceptPriceChange: { expectedTotalGross: 24.28 } }), {
    ...basis, acceptPriceChange: { expectedTotalGross: 24.28 },
  });
  // Ohne gültigen Betrag entsteht KEIN Übernahmefeld — der Körper bleibt der Vier-Felder-Körper.
  for (const kaputt of [undefined, null, {}, { expectedTotalGross: "24.28" }, { expectedTotalGross: NaN },
                        { expectedTotalGross: -1 }, "24.28"]) {
    assert.deepEqual(buildCoverRepricePayload({ ...basis, acceptPriceChange: kaputt }), basis, JSON.stringify(kaputt));
  }
  const koerper = buildCoverRepricePayload({ ...basis, acceptPriceChange: { expectedTotalGross: 24.28, customerPriceCents: 1 } });
  assert.deepEqual(Object.keys(koerper.acceptPriceChange), ["expectedTotalGross"], "fremde Felder reisen mit");
});

test("A14 — /book trägt den Preisstand nur, wenn der Server ihn genannt hat", () => {
  const totals = { customerTotalGross: 24.28 };
  const mit = buildCoverBookInsurancePayload({ coverValue: 500, goodsAreNew: true, goodsAreFragile: false,
    repriceResult: { totals, priceRevision: 1 } });
  assert.equal(mit.offerRevision, 1);
  assert.equal(mit.confirmedTotalGross, 24.28);
  for (const revision of [undefined, null, -1, "1", 1.5]) {
    const ohne = buildCoverBookInsurancePayload({ coverValue: 500, goodsAreNew: true, goodsAreFragile: false,
      repriceResult: { totals, priceRevision: revision } });
    assert.ok(!("offerRevision" in ohne), JSON.stringify(revision));
  }
});

test("A15 — die Zusammensetzung kommt vom Server: Versand geändert, Absicherung unverändert", () => {
  const v = insuredPriceChangeView({
    code: "PRICE_CHANGED", oldPrice: 22.85, newPrice: 24.28, price: 24.28, offerRevision: 0,
    priceChange: { shipping: { oldGross: 12.85, newGross: 14.28 }, insurance: { oldGross: 10, newGross: 10 } },
  }, 99);
  assert.deepEqual([v.oldPrice, v.newPrice, v.insured], [22.85, 24.28, true], "der clientseitige Altbetrag gewann");
  const zeilen = priceChangeBreakdownLines(v);
  assert.deepEqual(zeilen.map((z) => [z.id, z.oldGross, z.newGross, z.changed]),
    [["shipping", 12.85, 14.28, true], ["insurance", 10, 10, false]]);
  assert.deepEqual(zeilen.map((z) => z.label), ["Versand", "Zusätzliche Transportabsicherung"]);
  // Unbrauchbare Zusammensetzung → keine Zeilen, aber der Vergleich bleibt.
  for (const pc of [null, "x", { shipping: { oldGross: "12.85", newGross: 14.28 } }, { insurance: {} }]) {
    const w = insuredPriceChangeView({ code: "PRICE_CHANGED", oldPrice: 22.85, newPrice: 24.28, priceChange: pc }, undefined);
    assert.equal(preisIstBestaetigbar(w), true);
    assert.deepEqual(priceChangeBreakdownLines(w), [], JSON.stringify(pc));
  }
  assert.deepEqual(priceChangeBreakdownLines(null), []);
});

test("A16 — Texte der Übernahme und der Konflikte: neutral, ohne Anbieter, ohne Rohtext", () => {
  const texte = Object.values(COVER_PRICE_CHANGE_TEXT).join(" | ");
  for (const v of ["Transglobal", "transglobal", "JUMiNGO", "Anbieter", "Einkauf", "Revision"]) {
    assert.ok(!texte.includes(v), `„${v}" in den Übernahmetexten`);
  }
  assert.equal(COVER_PRICE_CHANGE_TEXT.acceptLabel, "Neuen Preis übernehmen");
  const roh = { error: "ROHTEXT transglobal" };
  assert.match(coverRepriceErrorText(409, { ...roh, code: "OFFER_PRICE_CONFLICT" }), /zwischenzeitlich aktualisiert/);
  assert.match(coverRepriceErrorText(400, { ...roh, code: "PRICE_CONFIRMATION_REQUIRED" }), /erneut/);
  assert.ok(!/ROHTEXT/.test(coverRepriceErrorText(409, { ...roh, code: "OFFER_PRICE_CONFLICT" })));
});

/* ══════════ A) TG22 Paket B — Grundabsicherung und Höchstdeckung ═══════════ */

test("A17 — Grundabsicherung und Höchstdeckung sind Aussagen, keine Fehler — mit dem Betrag des Servers", () => {
  assert.deepEqual(COVER_STATE, { AVAILABLE: "available", BASIC_COVER_INCLUDED: "basic_cover_included",
                                  ABOVE_COVER_LIMIT: "above_cover_limit" });
  assert.equal(flach(coverBasicCoverText(50)),
    "Bis zu einem Warenwert von 50 € ist bereits eine Grundabsicherung ohne Aufpreis enthalten.");
  assert.equal(flach(coverLimitText(2500)),
    "Eine zusätzliche Transportabsicherung ist für diesen Tarif nur bis zu einem Warenwert von 2.500 € möglich.");
  assert.equal(flach(coverBasicCoverText(50.5)),
    "Bis zu einem Warenwert von 50,50 € ist bereits eine Grundabsicherung ohne Aufpreis enthalten.");
  // Ohne Serverbetrag der neutrale Satz — nie eine erfundene Grenze.
  for (const kaputt of [undefined, null, 0, -1, "50", NaN]) {
    assert.equal(coverBasicCoverText(kaputt), COVER_INSURANCE_TEXT.basicCoverIncludedGeneric, JSON.stringify(kaputt));
    assert.equal(coverLimitText(kaputt), COVER_INSURANCE_TEXT.coverLimitGeneric, JSON.stringify(kaputt));
  }
  assert.deepEqual(coverInsuranceNotice(TG_GRUNDSCHUTZ), { kind: COVER_STATE.BASIC_COVER_INCLUDED, text: coverBasicCoverText(50) });
  assert.deepEqual(coverInsuranceNotice(TG_HOECHSTDECKUNG), { kind: COVER_STATE.ABOVE_COVER_LIMIT, text: coverLimitText(2500) });
  for (const t of [TG_TARIF, TG_TARIF_ALT, JU_TARIF, TG_NICHT_VERSICHERBAR, null, {}]) {
    assert.equal(coverInsuranceNotice(t), null, JSON.stringify(t));
  }
  // Keine Fehlersprache und kein Anbieter in den Aussagen.
  for (const text of [coverBasicCoverText(50), coverLimitText(2500),
                      COVER_INSURANCE_TEXT.basicCoverIncludedGeneric, COVER_INSURANCE_TEXT.coverLimitGeneric]) {
    assert.ok(!/nicht bestätigt|Fehler|fehlgeschlagen|Versicherung nicht verfügbar|Preis konnte|Transglobal|JUMiNGO/i.test(text), text);
  }
  // Die Buchungsseite zeigt dafür kein Auswahlmodul — der Tarif bleibt ohne Zusatz buchbar.
  assert.equal(getBookingModules(TG_GRUNDSCHUTZ).insurance, false);
  assert.equal(getBookingModules(TG_HOECHSTDECKUNG).insurance, false);
});

test("A18 — eine Aussage der Neubepreisung wird zum Hinweis; INS = 0 bleibt ein neutraler Fehler", () => {
  assert.equal(flach(coverRepriceNotice({ code: "INSURANCE_BASIC_COVER_INCLUDED", basicCoverMaxGoodsValue: 50, error: "ROHTEXT" })),
    flach(coverBasicCoverText(50)));
  assert.equal(coverRepriceNotice({ code: "INSURANCE_BASIC_COVER_INCLUDED" }), COVER_INSURANCE_TEXT.basicCoverIncludedGeneric);
  assert.equal(flach(coverRepriceNotice({ code: "INSURANCE_COVER_LIMIT_EXCEEDED", maxCoverValue: 2500 })), flach(coverLimitText(2500)));
  for (const b of [{ code: "INSURANCE_UNAVAILABLE" }, { code: "PRICE_CHANGED" }, { code: "INSURANCE_SELECTION_MISMATCH" },
                   {}, null, "INSURANCE_BASIC_COVER_INCLUDED"]) {
    assert.equal(coverRepriceNotice(b), null, JSON.stringify(b));
  }
  // Warenwert > 50, aber der Anbieter nennt keinen positiven Preis: fail closed, neutral, ohne Anbieter.
  const unavailable = coverRepriceErrorText(409, { code: "INSURANCE_UNAVAILABLE", error: "insurance_cost_not_positive" });
  assert.equal(unavailable, COVER_INSURANCE_TEXT.unavailable);
  assert.ok(!/insurance_cost|Transglobal|INS\b/.test(unavailable));
});

/* ══════════ A) Texte ═══════════════════════════════════════════════════════ */

const STUFEN_BEGRIFFE = ["Premium", "Standard", "priorisiert", "Priorisiert", "50,00", "Status-Updates",
                         "Erweiterter Service", "Transglobal", "TRANSGLOBAL", "transglobal", "JUMiNGO", "jumingo"];

test("A10 — das Deckungsbetragsmodell nennt keine Stufe, keine 50 €, keinen Anbieter", () => {
  const texte = [
    ...Object.values(COVER_INSURANCE_TEXT),
    ...["transit_cover", "none"].flatMap((id) => {
      const c = coverInsuranceCardCopy(id, 20);
      return [c.description, ...c.bullets.map((b) => b.text)];
    }),
  ].join(" | ");
  for (const b of STUFEN_BEGRIFFE) assert.ok(!texte.includes(b), `„${b}" im Deckungsbetragsmodell`);
  assert.equal(COVER_INSURANCE_TEXT.cardName, "Zusätzliche Transportabsicherung");
  assert.equal(COVER_INSURANCE_TEXT.noneName, "Keine zusätzliche Transportabsicherung");
  assert.equal(COVER_INSURANCE_TEXT.goodsNewQuestion, "Ist die Ware neu?");
  assert.equal(COVER_INSURANCE_TEXT.goodsFragileQuestion, "Ist die Ware zerbrechlich?");
  // Die Karte trägt die Selbstbeteiligung — und keinen Detaildialog der Stufen.
  const karte = coverInsuranceCardCopy("transit_cover", 20);
  assert.equal(flach(karte.bullets[0].text), "Selbstbeteiligung: 20,00 €");
  assert.equal(karte.hasDetails, false);
  assert.equal(coverInsuranceCardCopy("transit_cover", null).bullets.length, 0, "keine erfundene Selbstbeteiligung");
  const none = coverInsuranceCardCopy("none", 20);
  assert.equal(none.hasCarrierTerms, true);
  assert.equal(none.description, INSURANCE_TEXT.carrierLiability);
  // Die Stufentexte selbst sind unverändert (JUMiNGO-Regression).
  assert.ok(INSURANCE_CARD_COPY.standard.bullets.some((b) => /50,00 €/.test(b.text)));
  assert.deepEqual(INSURANCE_DIALOG.sections.map((s) => s.id), ["standard", "premium"]);
});

/* ══════════ A) Angebotskarte ═══════════════════════════════════════════════ */

test("A11 — die Angebotskarte benutzt DASSELBE Gate wie die Buchungsseite", () => {
  const faelle = [
    TG_TARIF, TG_TARIF_ALT, JU_TARIF, TG_NICHT_VERSICHERBAR, TG_GRUNDSCHUTZ, TG_HOECHSTDECKUNG, {},
    // Ein „ab"-Preis ALLEIN machte die Karte früher versicherbar — die Buchung nicht.
    { insuranceDetails: { extraInsurancePriceBruttoPreselect: 3.99 } },
    { insuranceDetails: { insuranceValue: 500 } },
    { insuranceAvailable: false, insuranceDetails: { isInsurable: false } },
  ];
  for (const t of faelle) {
    assert.equal(offerCardInsurance(t).insurable, getBookingModules(t).insurance, JSON.stringify(t));
  }
  assert.deepEqual(offerCardInsurance(TG_TARIF),
    { insurable: true, explicitlyUnavailable: false, coverModel: true, excessValue: 20, notice: null });
  assert.equal(offerCardInsurance(JU_TARIF).coverModel, false);
  assert.equal(offerCardInsurance(JU_TARIF).notice, null);
  assert.equal(offerCardInsurance(TG_NICHT_VERSICHERBAR).insurable, false);
  assert.equal(offerCardInsurance(TG_NICHT_VERSICHERBAR).explicitlyUnavailable, true);
  // TG22 Paket B: die Grundabsicherung ist KEIN „nicht verfügbar", sondern eine Aussage.
  assert.deepEqual(offerCardInsurance(TG_GRUNDSCHUTZ), {
    insurable: false, explicitlyUnavailable: false, coverModel: false, excessValue: 20,
    notice: { kind: COVER_STATE.BASIC_COVER_INCLUDED, text: coverBasicCoverText(50) },
  });
  assert.equal(offerCardInsurance(TG_HOECHSTDECKUNG).notice.kind, COVER_STATE.ABOVE_COVER_LIMIT);
  assert.equal(offerCardInsurance(TG_HOECHSTDECKUNG).explicitlyUnavailable, false);
});

test("A12 — die Angebotskarte behauptet nicht mehr „nicht online auswählbar“ und nennt keinen Preis vorab", () => {
  const karte = ohneKommentare(lies("src/components/offers/OfferCard.jsx"));
  assert.ok(!/nicht online auswählbar/.test(karte), "der veraltete Hinweis lebt noch");
  assert.match(karte, /const insOffer = offerCardInsurance\(t\)/);
  assert.match(karte, /insInsurable && insOffer\.coverModel \?/);
  assert.match(karte, /COVER_INSURANCE_TEXT\.offerPriceNote/);
  // Das frühere Zweit-Gate (Preis → versicherbar) ist weg.
  assert.ok(!/insBaseCoverage != null \|\| insStandardPrice != null/.test(karte));
  // TG22 Paket B: die Aussage ohne kaufbaren Zusatz steht als Hinweis — vor „nicht verfügbar".
  assert.match(karte, /const hasInsuranceSection = insInsurable \|\| insExplicitlyUnavailable \|\| insOffer\.notice !== null/);
  assert.match(karte, /\) : insOffer\.notice \? \(\s*<p className="offer-insurance-note">\{insOffer\.notice\.text\}<\/p>/);
});

/* ══════════ B) Buchungsseite ═══════════════════════════════════════════════ */

const seite = ohneKommentare(buchungsSeite());
const modul = ohneKommentare(lies("src/components/booking/InsuranceModule.jsx"));

test("B1 — das Modell kommt aus dem Tarif; transit_cover ist versichert", () => {
  assert.match(seite, /const coverModel = isCoverValueModel\(tariff\)/);
  assert.match(seite, /const isInsured = isInsuredType\(insuranceType\)/);
  // TG22 Paket B: die gespeicherte Auswahl läuft weiterhin durch insuranceTypeForTariff — jetzt im
  // angebotsgebundenen Startzustand (utils/insuranceRestore.mjs), nicht mehr direkt auf der Seite.
  assert.match(seite, /useState\(\(\) => startzustand\.insuranceType\)/);
  assert.match(ohneKommentare(lies("src/utils/insuranceRestore.mjs")),
    /insuranceTypeForTariff\(flowBooking\.insuranceType \|\| "none", tariff\)/);
});

test("B2 — Neubepreisung: Deckungsbetragsmodell mit dem Warenwert als Versicherungswert, Stufen unverändert plus offerId", () => {
  assert.match(seite, /const coverValueNum = coverModel \? coverValueForTariff\(tariff, goodsValue\) : null/);
  assert.match(seite, /buildCoverRepricePayload\(\{ offerId: tariff\?\.offerId, coverValue: coverValueNum, goodsAreNew, goodsAreFragile \}\)/);
  assert.match(seite, /insuranceType:\s+type,/, "der Stufenkörper sendet insuranceType weiterhin flach");
  assert.match(seite, /extraInsuranceValue: insNum,/, "der Stufenkörper sendet seinen Versicherungswert unverändert");
  assert.match(seite, /\.\.\.\(tariff\?\.offerId \? \{ offerId: tariff\.offerId \} : \{\}\)/);
  assert.match(seite, /coverModel \? coverRepriceErrorText\(r\.status, d\)/);
  // TG22 Paket B: eine Aussage des Servers (Grundabsicherung, Höchstdeckung) ist ein Hinweis, kein Fehler.
  assert.match(seite, /const hinweis = coverModel \? coverRepriceNotice\(d\) : null;\s*if \(hinweis\) \{\s*setRepriceStale\(false\); setRepriceNotice\(hinweis\);/);
});

test("B3 — die Fragen zur Ware blockieren Neubepreisung und Buchung, bis sie beantwortet sind", () => {
  assert.match(seite, /const goodsAnswersValid = goodsAreNewError === "" && goodsAreFragileError === ""/);
  assert.match(seite, /if \(!insValid \|\| !goodsAnswersValid\) \{ setRepriceResult\(null\); return; \}/);
  assert.match(seite, /if \(isInsured && !goodsAnswersValid\) \{/);
  assert.match(seite, /insValid: insValid && goodsAnswersValid/);
  // Die Fragen hängen in den Abhängigkeiten des Auto-Reprice.
  assert.match(seite, /\}, \[insuranceType, goodsValue, insuranceValue, goodsAreNew, goodsAreFragile\]\);/);
});

test("B4 — /book: transit_cover mit dem Warenwert und dem bestätigten Gesamtbetrag; der Stufenkörper bleibt Zeile für Zeile", () => {
  assert.match(seite, /buildCoverBookInsurancePayload\(\{ coverValue: coverValueNum, goodsAreNew, goodsAreFragile, repriceResult \}\)/);
  assert.match(seite, /value:\s+insuranceValueNum,/);
  assert.match(seite, /\{ insuranceSelection: \{ type: "none" \} \}/);
  // Ohne gültigen Warenwert gibt es im Deckungsbetragsmodell nichts zu bepreisen und nichts zu buchen.
  assert.match(seite, /coverModel\s+\? \(coverValueNum == null \? COVER_INSURANCE_TEXT\.coverValueMissing : ""\)/);
});

test("B5 — eine versicherte Preisänderung öffnet den Dialog und übernimmt beim Fortfahren AUSDRÜCKLICH", () => {
  assert.match(seite, /setPriceChange\(insuredPriceChangeView\(d, repriceResult\?\.totals\?\.customerTotalGross\)\)/);
  const fortfahren = seite.slice(seite.indexOf("const continueWithNewPrice = "));
  const zweig = fortfahren.slice(0, fortfahren.indexOf("confirmedFinalPriceRef.current = np"));
  assert.match(zweig, /if \(priceChange\.insured\) \{/);
  // TG22 Paket A: nicht mehr eine erneute Neubepreisung, die am alten Preisstand scheiterte, sondern
  // die ausdrückliche Übernahme genau des vom Server genannten neuen Betrags.
  assert.match(zweig, /acceptInsuredPriceChange\(priceChange\.newPrice\)/);
  const annahme = seite.slice(seite.indexOf("const acceptInsuredPriceChange = "), seite.indexOf("const continueWithNewPrice = "));
  assert.match(annahme, /acceptPriceChange: \{ expectedTotalGross: neuerPreis \}/);
  assert.match(annahme, /coverValue: coverValueNum/, "die Übernahme nennt einen anderen Versicherungswert als die Neubepreisung");
  assert.ok(!/doBook\(|\/api\/jumingo\/book/.test(annahme), "die Übernahme bucht");
  // Eine erneute Preisänderung führt zurück in den Dialog — keine Schleife, kein Stillschweigen.
  assert.match(annahme, /if \(erneut && preisIstBestaetigbar\(erneut\)\) \{\s*setPriceChange\(erneut\);/);
  // Die gewöhnliche Neubepreisung öffnet denselben Dialog statt einer Fehlermeldung.
  assert.match(seite, /coverModel && d\?\.code === "PRICE_CHANGED" \? insuredPriceChangeView\(d, undefined\) : null/);
  // Ein versicherter Vorgang fällt NIE in den price_final-Weg ohne Versicherung.
  assert.ok(zweig.indexOf("return;") > -1 && zweig.indexOf("doBook()") === -1,
    "die versicherte Bestätigung darf nicht still ohne neue Bindung buchen");
  assert.match(seite, /price_final:\s+\(!isInsured && confirmedFinalPriceRef\.current != null\)/);
});

test("B6 — versicherte Buchungsablehnungen verwerfen die Absicherung nicht still", () => {
  // Der ganze Zweig als EIN Ausdruck — `\s*` trägt auch CRLF-Zeilenenden. Es gibt zwei
  // `if (isInsured && coverModel)`-Stellen (Preisänderung und diese); gemeint ist die mit
  // der Ablehnungsmeldung.
  assert.match(seite, /if \(isInsured && coverModel && isCoverBookError\(d\)\) \{\s*setRepriceResult\(null\); setRepriceStale\(true\);\s*setError\(coverBookErrorText\(d\)\);\s*if \(coverBookErrorRequiresReprice\(d\) && insValid && goodsAnswersValid\) \{\s*runReprice\(/,
    "der Zweig der versicherten Ablehnung fehlt, bepreist nicht neu oder faengt fremde Konflikte");
  // Der Zweig gilt nur fuer die Codes der Absicherung selbst.
  for (const code of COVER_BOOK_ERROR_CODES) assert.equal(isCoverBookError({ code }), true, code);
  for (const fremd of [{ code: "DUPLICATE" }, { code: "OFFER_NOT_BOOKABLE" }, {}, null]) {
    assert.equal(isCoverBookError(fremd), false, JSON.stringify(fremd));
  }
  // Nirgends auf der Seite wird die Absicherung still abgewählt.
  assert.ok(!/setInsuranceType\("none"\)/.test(seite), "die Absicherung wurde still abgewählt");
});

test("B7 — das Modul zeigt beide Pflichtfragen ohne Vorbelegung und KEIN Versicherungswert-Feld im Deckungsbetragsmodell", () => {
  assert.match(modul, /checked=\{wert === true\}/);
  assert.match(modul, /checked=\{wert === false\}/);
  assert.match(modul, /COVER_INSURANCE_TEXT\.goodsNewQuestion/);
  assert.match(modul, /COVER_INSURANCE_TEXT\.goodsFragileQuestion/);
  // TG22 Paket B: der frei wählbare Versicherungswert gehört ausschließlich zum Stufenmodell; im
  // Deckungsbetragsmodell sagt der gesperrte Warenwert, bis wohin abgesichert wird.
  assert.match(modul, /\{!coverModel && \(insValueFieldVisible \? \(/);
  assert.match(modul, /max=\{insuranceValueMax\}/);
  assert.match(modul, /coverModel \? COVER_INSURANCE_TEXT\.goodsValueCoverHint/);
  assert.match(seite, /const insValueFieldVisible = !coverModel && \(insValueRevealed \|\| insValueManual \|\| goodsOverMax\)/);
  assert.match(modul, /coverInsuranceCardCopy\(c\.id, excessValue\)/);
  assert.match(modul, /\{!coverModel && \(\s*<InsuranceDetailsDialog/, "der Stufendialog darf im Deckungsbetragsmodell nicht erscheinen");
  assert.ok(!/<Switch/.test(modul), "kein Schalter für eine dreiwertige Angabe");
  assert.match(seite, /excessValue=\{coverExcessValue\(tariff\)\}/);
  assert.match(seite, /goodsOverMax = !coverModel && goodsExceedsInsuranceMax\(goodsValue\)/);
});

test("B8 — Preiszusammenfassung und Live-Leiste zählen transit_cover als versichert, mit neutraler Bezeichnung", () => {
  const summe = ohneKommentare(lies("src/components/booking/PriceSummaryModule.jsx"));
  const live = ohneKommentare(lies("src/components/booking/BookingLiveSummary.jsx"));
  for (const [name, src] of [["PriceSummaryModule", summe], ["BookingLiveSummary", live]]) {
    assert.match(src, /const insured = isInsuredType\(v\.selectedInsuranceType\)/, name);
    assert.match(src, /v\.selectedInsuranceType === INSURANCE_TYPE_TRANSIT_COVER/, name);
  }
  assert.match(summe, /COVER_INSURANCE_TEXT\.insuredAmountLabel/);
  assert.match(summe, /COVER_INSURANCE_TEXT\.excessLabel/);
});

test("B9 — kein Anbietername in den kundenseitigen Flächen der Absicherung", () => {
  for (const datei of ["src/components/booking/InsuranceModule.jsx", "src/components/booking/PriceSummaryModule.jsx",
                       "src/components/booking/BookingLiveSummary.jsx", "src/utils/coverInsuranceView.mjs",
                       "src/utils/insuranceTerms.mjs"]) {
    const src = lies(datei);
    assert.ok(!/transglobal/i.test(src), `${datei} nennt den Anbieter`);
  }
});

test("B11 — ohne kaufbaren Zusatz: Hinweisfläche statt „nicht verfügbar“, ohne Bedienelement und ohne Preis", () => {
  assert.match(seite, /const coverNotice = coverInsuranceNotice\(tariff\)/);
  assert.match(seite, /\) : coverNotice \? \(\s*<InsuranceCoverNotice text=\{coverNotice\.text\} \/>/);
  assert.match(seite, /repriceNotice=\{repriceNotice\}/);
  assert.match(modul, /export function InsuranceCoverNotice\(\{ text \}\)/);
  assert.match(modul, /\) : repriceNotice \? \(\s*<span className="field-hint" id="ins-reprice-notice">\{repriceNotice\}<\/span>/);
  const hinweis = modul.slice(modul.indexOf("export function InsuranceCoverNotice"), modul.indexOf("export function InsuranceModule"));
  assert.ok(hinweis.length > 0, "die Hinweisfläche fehlt");
  assert.ok(!/<input|<button|field-error|ins-status-error|money\(/.test(hinweis),
    "die Hinweisfläche trägt ein Bedienelement, einen Fehlerzustand oder einen Preis");
  // Jede neue Eingabe verwirft einen alten Hinweis, bevor neu bepreist wird.
  assert.match(seite, /setRepriceLoading\(true\); setRepriceError\(""\); setRepriceNotice\(""\);/);
  assert.match(seite, /if \(insuranceType === "none"\) \{\s*setRepriceResult\(null\); setRepriceStale\(false\); setRepriceError\(""\); setRepriceNotice\(""\);/);
});

/* ══════════ B) Admin-Detail ═══════════════════════════════════════════════ */

test("B10 — die Admin-Detailseite zeigt die Versicherung nur, wenn die Sendung eine trägt", () => {
  const detail = ohneKommentare(lies("src/pages/admin/AdminShipmentDetailPage.jsx"));
  assert.match(detail, /const insurance = shipmentInsuranceView\(s\)/);
  assert.match(detail, /\{insurance && \(/);
  assert.match(detail, /\["Selbstbeteiligung", money\(insurance\.excessValue\)\]/);
});
