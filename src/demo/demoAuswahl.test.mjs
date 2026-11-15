// Demo der kompakten Auswahlmenüs (Premium Control System 2.0, Betreiberauftrag 2026-11-14): Die Demo-Datenquelle
// beantwortet Zusatzversicherung und „Art der Lieferadresse" wie die echten Verträge — mit festen Beispielwerten,
// ohne Netz, und ohne je einen Schritt still durchzuwinken, den der Server ablehnen würde.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_ABSICHERUNGSGRENZE, DEMO_PRIVATZUSCHLAG, DEMO_ZUSATZVERSICHERUNG, demoAntwort, demoZuruecksetzen,
} from "./demoBackend.mjs";

const UPS = "DEMO0000000000000000000000000002";
const GLS = "DEMO0000000000000000000000000003";
const DHL = "DEMO0000000000000000000000000001";

async function ohneNetz(arbeit) {
  const echt = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Netzzugriff aus der Demo-Datenquelle"); };
  try { return await arbeit(); } finally { globalThis.fetch = echt; }
}
const anfrage = async (pfad, body) => {
  const r = await demoAntwort(pfad, body === undefined ? {} : { method: "POST", body: JSON.stringify(body) });
  return { status: r.status, daten: await r.json() };
};
const runde = (n) => Math.round(n * 100) / 100;
const angebote = async (warenwert) => {
  const body = { recipient: { country: "DE" }, packages: { packageLines: [{ quantity: 1, weight: 4 }] } };
  if (warenwert !== undefined) body.declarations = { goodsValue: warenwert };
  const r = await anfrage("/api/jumingo/calculate-price", body);
  return Object.fromEntries(r.daten.tariffs.map((t) => [t.offerId, t]));
};

test("1 — Zusatzversicherung nur mit Warenwert, Grenzen je Stufe wie die Tarifantwort", async () => {
  demoZuruecksetzen();
  await ohneNetz(async () => {
    assert.equal((await angebote())[UPS].insuranceAvailable, false, "ohne Warenwert keine Zusatzversicherung");
    const mit = (await angebote(500))[UPS];
    assert.equal(mit.insuranceAvailable, true);
    assert.equal(mit.insuranceDetails.extraInsurancePriceBruttoPreselect, DEMO_ZUSATZVERSICHERUNG.standard);
    assert.equal(mit.insuranceDetails.extraInsurancePremiumPriceBruttoPreselect, DEMO_ZUSATZVERSICHERUNG.premium);
    for (const stufe of ["standard", "premium"]) {
      assert.deepEqual(mit.insuranceCover[stufe], { state: "available", coverLimit: DEMO_ABSICHERUNGSGRENZE, maxInsuredValue: 500 });
    }
    const ueber = (await angebote(DEMO_ABSICHERUNGSGRENZE + 1))[UPS];
    assert.equal(ueber.insuranceCover.standard.state, "above_cover_limit");
    assert.equal(ueber.insuranceCover.standard.maxInsuredValue, null);
    assert.equal((await angebote(500))[DHL].insuranceAvailable, false, "nur das UPS-Beispiel zeigt die Stufen");
  });
});

test("2 — Neubepreisung: Summen mit Zusatzbetrag; ohne Zusatzversicherung im Angebot abgelehnt, nie still", async () => {
  demoZuruecksetzen();
  await ohneNetz(async () => {
    const a = (await angebote(500))[UPS];
    for (const [typ, zusatz] of [["standard", 3.99], ["premium", 7.49], ["none", 0]]) {
      const r = await anfrage("/api/insurance/reprice", { offerId: UPS, insuranceType: typ });
      assert.equal(r.status, 200, typ);
      assert.equal(r.daten.selectedInsurance, typ);
      assert.equal(r.daten.totals.insuranceGross, zusatz);
      assert.equal(r.daten.totals.customerShippingGross, a.finalPrice, "der Versandpreis selbst bleibt");
      assert.equal(r.daten.totals.customerTotalGross, runde(a.finalPrice + zusatz));
    }
    for (const [offerId, typ] of [[DHL, "standard"], [UPS, "gold"], ["DEMO_UNBEKANNT", "standard"]]) {
      const r = await anfrage("/api/insurance/reprice", { offerId, insuranceType: typ });
      assert.equal(r.status, 409, `${offerId}/${typ}`);
      assert.equal(r.daten.code, "DEMO_NOT_AVAILABLE");
    }
  });
});

test("3 — Art der Lieferadresse: ohne Angabe nicht buchbar, Bindung nur mit bestätigtem Preis und frischer Auswahl", async () => {
  demoZuruecksetzen();
  await ohneNetz(async () => {
    const a = (await angebote())[GLS];
    assert.equal(a.bookable, false);
    assert.equal(a.unavailableReason, "price_inputs_required");
    assert.deepEqual(a.requiredPriceInputs, ["deliveryIsResidential"]);

    const opt = await anfrage("/api/offers/price-input-options", { offerId: GLS, offerRevision: 0 });
    assert.equal(opt.status, 200);
    assert.equal(opt.daten.boundValue, null, "nichts ist vorgewählt");
    const [geschaeft, privat] = opt.daten.options;
    assert.equal(geschaeft.value, false);
    assert.equal(geschaeft.totals.customerShippingGross, a.finalPrice);
    assert.equal(privat.value, true);
    assert.deepEqual(privat.surcharge, { ...DEMO_PRIVATZUSCHLAG });
    assert.equal(privat.totals.customerShippingGross, runde(a.finalPrice + DEMO_PRIVATZUSCHLAG.gross));

    const binden = (extra) => anfrage("/api/offers/price-inputs", {
      offerId: GLS, offerRevision: 0, optionsId: opt.daten.optionsId, deliveryIsResidential: true,
      expectedShippingGross: privat.totals.customerShippingGross, ...extra,
    });
    assert.equal((await binden({ expectedShippingGross: geschaeft.totals.customerShippingGross })).daten.code, "PRICE_CONFIRMATION_REQUIRED",
      "ein anderer als der angezeigte Preis wird nie gebunden");
    assert.equal((await binden({ optionsId: "x".repeat(32) })).daten.code, "PRICE_INPUT_OPTIONS_EXPIRED");
    assert.equal((await binden({ offerRevision: 3 })).daten.code, "OFFER_PRICE_CONFLICT");

    const ok = await binden({});
    assert.equal(ok.status, 200);
    assert.equal(ok.daten.idempotent, false);
    assert.equal(ok.daten.offerRevision, 1);
    assert.equal(ok.daten.offer.bookable, true);
    assert.equal(ok.daten.offer.finalPrice, privat.totals.customerShippingGross);
    assert.deepEqual(ok.daten.components.map((k) => k.type), ["shipping_base", "residential_delivery_surcharge"]);

    const nochmal = await binden({});
    assert.equal(nochmal.daten.idempotent, true, "dieselbe Wahl noch einmal ist kein zweiter Wechsel");
    const alt = await anfrage("/api/offers/price-input-options", { offerId: GLS, offerRevision: 0 });
    assert.equal(alt.status, 409, "eine alte Revision bekommt keine neuen Optionen");
    assert.equal(alt.daten.code, "OFFER_PRICE_CONFLICT");
    assert.equal((await anfrage("/api/offers/price-input-options", { offerId: UPS, offerRevision: 0 })).status, 404,
      "ein Angebot ohne die Angabe hat keine Optionen");
  });
});

test("4 — die Buchung trägt den Zusatzbetrag nur, wo das Angebot ihn trägt", async () => {
  demoZuruecksetzen();
  await ohneNetz(async () => {
    const liste = await angebote(500);
    const mit = await anfrage("/api/jumingo/book", { offerId: UPS, insuranceSelection: { type: "premium" } });
    assert.equal(mit.daten.amount, runde(liste[UPS].finalPrice + DEMO_ZUSATZVERSICHERUNG.premium));
    assert.equal(mit.daten.testBooking, true);
    const ohne = await anfrage("/api/jumingo/book", { offerId: DHL, insuranceSelection: { type: "premium" } });
    assert.equal(ohne.daten.amount, liste[DHL].finalPrice, "kein Zusatzbetrag ohne Zusatzversicherung im Angebot");
  });
  demoZuruecksetzen();
});
