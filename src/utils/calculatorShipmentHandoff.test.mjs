// Preisrechner → „Neue Sendung": Übergabe eines gewählten Angebots (Produktionsbefund 2026-10-02).
//
// Befund: „Angebot auswählen" im Preisrechner öffnete „Neue Sendung" leer — Route, Paket, Versanddatum
// und Tarif waren weg. Ursache: Bereich „calculator" → Bereich „shipment" wurde nie übergeben.
//
//   A  Mapping des Produktionsfalls (97421 Schweinfurt → 10115 Berlin, 1 × 2 kg, 30×20×15, 09.10.2026)
//   B  keine erfundenen Werte: Straße, Name, Firma, Kontakt und Sendungsangaben bleiben leer
//   C  Vorrang: ein fortgesetzter Entwurf und der Adressbuch-Prefill schlagen die Übergabe
//   D  die Absicht überlebt den Weg durch den Vorgang (nur im Bereich „shipment")
//   E  kein Altpreis: nichts Buchbares, kein Preis, kein `selected`, keine Sendungskennung
//   F  kein falscher Match: nur GENAU EIN auswählbares Angebot derselben Identität
//   G  Hinweise: offen, ausgewählt (nur solange ausgewählt), nicht zuzuordnen
//   H  Verdrahtung in Preisrechner und „Neue Sendung"
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calculatorSelectionToShipmentTransfer, resolveCalculatorIntent, calculatorIntentNotice,
  normalizeCalculatorIntent, CALCULATOR_INTENT_SOURCE,
} from "./calculatorShipmentHandoff.mjs";
import { normalizeScope, formHasInput, pickRestoreSource } from "./shippingFlowState.mjs";
import { packageComplete, shippingContactErrors } from "./newShipmentForm.mjs";
import { declarationErrors } from "./shipmentDeclarations.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const lies = (rel) => readFileSync(path.join(WURZEL, rel), "utf8");
const ohneKommentare = (q) => q.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

// Der Produktionsfall als Preisrechner-Stand.
const RECHNER = Object.freeze({
  form: {
    from_country: "DE", from_zip: "97421", from_city: "Schweinfurt",
    to_country: "DE", to_zip: "10115", to_city: "Berlin",
    packageCount: "1", weight: "2", length: "30", width: "20", height: "15",
    max_price: "", latestDeliveryDate: "", latestDeliveryTime: "",
  },
  shippingDate: "2026-10-09",
  serviceFilter: "all",
  shippingModeFilter: "all",
  vatMode: "net",
});
// UPS „Standard Samstagszustellung", JUMiNGO-Tarif 3588 — repräsentatives Fixture.
const UPS_SAMSTAG = Object.freeze({
  id: 3588, shipper_tariff_id: 3588, offerId: "e".repeat(32),
  publicCarrierId: "ups", publicCarrierName: "UPS", publicServiceName: "Standard Samstagszustellung",
  serviceType: "pickup", netPrice: 14.2, vatAmount: 2.7, finalPrice: 16.9, currency: "EUR",
  bookable: true, unavailableReason: null, deliveryOnSaturday: true,
});
const LABEL = "UPS · Standard Samstagszustellung";
const uebergabe = (patch = {}) => calculatorSelectionToShipmentTransfer({
  calculator: RECHNER, tariff: UPS_SAMSTAG, label: LABEL, ...patch,
});

/* ══════════ A  MAPPING ═══════════════════════════════════════════════════════ */

test("A — Produktionsfall: Route, Paket und Versanddatum gehen 1:1 in „Neue Sendung“", () => {
  const u = uebergabe();
  const f = u.form;
  assert.deepEqual([f.s_country, f.s_zip, f.s_city], ["DE", "97421", "Schweinfurt"]);
  assert.deepEqual([f.r_country, f.r_zip, f.r_city], ["DE", "10115", "Berlin"]);
  assert.deepEqual([f.packageCount, f.weight, f.length, f.width, f.height], ["1", "2", "30", "20", "15"]);
  assert.equal(u.shippingDate, "2026-10-09", "das Datum springt auf heute");
  assert.equal(u.vatMode, "net");
  assert.equal(packageComplete(f), true, "das Paket ist nach der Übergabe unvollständig");
  // Abhol- und Versandartfilter werden übernommen, der Carrierfilter nicht (Liste fehlt noch).
  const mitFilter = uebergabe({ calculator: { ...RECHNER, serviceFilter: "pickup", shippingModeFilter: "standard",
                                              vatMode: "gross", selectedPublicCarrierIds: ["ups"] } });
  assert.deepEqual([mitFilter.serviceFilter, mitFilter.shippingModeFilter, mitFilter.vatMode], ["pickup", "standard", "gross"]);
  assert.deepEqual(mitFilter.selectedPublicCarrierIds, []);
  // Unbekannte Werte fallen auf die sicheren Vorgaben.
  const kaputt = uebergabe({ calculator: { ...RECHNER, serviceFilter: "x", shippingModeFilter: "y", vatMode: "z", shippingDate: "09.10.2026" } });
  assert.deepEqual([kaputt.serviceFilter, kaputt.shippingModeFilter, kaputt.vatMode, kaputt.shippingDate], ["all", "all", "net", null]);
});

/* ══════════ B  NICHTS ERFINDEN ═══════════════════════════════════════════════ */

test("B — Straße, Name, Firma, Kontakt und Sendungsangaben bleiben leer", () => {
  const f = uebergabe().form;
  for (const seite of ["s", "r"]) {
    for (const k of ["company", "firstName", "lastName", "fullName", "street", "addition", "phone", "email"]) {
      assert.equal(f[`${seite}_${k}`], "", `${seite}_${k} wurde erfunden: ${JSON.stringify(f[`${seite}_${k}`])}`);
    }
  }
  assert.equal(f.declaredContent, "");
  assert.equal(f.declaredGoodsValue, "");
  // Ergebnisfilter des Preisrechners werden nicht übernommen.
  assert.deepEqual([f.max_price, f.latestDeliveryDate, f.latestDeliveryTime], ["", "", ""]);
  // Genau diese Lücken fordert „Neue Sendung" an — Route und Paket dagegen nicht.
  const kontakt = { ...shippingContactErrors(f, "s"), ...shippingContactErrors(f, "r") };
  assert.ok(Object.keys(kontakt).length > 0, "fehlende Kontaktangaben werden nicht angefordert");
  assert.ok(Object.keys(declarationErrors(f)).length > 0, "fehlende Sendungsangaben werden nicht angefordert");
  // Ohne Preisrechner-Wert bleibt die Paketanzahl bei ihrer Vorgabe.
  assert.equal(uebergabe({ calculator: { ...RECHNER, form: { ...RECHNER.form, packageCount: "" } } }).form.packageCount, "1");
});

/* ══════════ C  VORRANG ═══════════════════════════════════════════════════════ */

test("C — Entwurf > Adressbuch-Prefill > Vorgang: die Übergabe überschreibt keinen Entwurf", () => {
  // Die Übergabe ist ein laufender Vorgang — sie tritt nur an, wenn weder Entwurf noch Prefill da sind.
  assert.equal(pickRestoreSource({ hasDraft: true, hasPrefill: false, hasFlow: true }), "draft");
  assert.equal(pickRestoreSource({ hasDraft: false, hasPrefill: true, hasFlow: true }), "prefill");
  assert.equal(pickRestoreSource({ hasDraft: false, hasPrefill: false, hasFlow: true }), "flow");
  // Der übergebene Bereich zählt als Vorgang (sonst bliebe „Neue Sendung" leer).
  const scope = normalizeScope(uebergabe(), "shipment");
  assert.equal(formHasInput(scope.form, "shipment"), true);
  // Die Seite bleibt bei ihrer Vorrangregel und leert den Vorgang bei einem Entwurf.
  const seite = ohneKommentare(lies("src/pages/NewShipmentPage.jsx"));
  assert.match(seite, /pickRestoreSource\(\{ hasDraft: !!resumeInit, hasPrefill: !!prefillAddress, hasFlow: hatVorgang \}\) === "flow"/);
  assert.ok(seite.includes("resumeInit ? resumeInit.form : flowInit ? flowInit.form : leeresFormular()"));
  assert.match(seite, /if \(!resumeInit\) return;\s*clearFlowScope\("shipment"\);/);
  // Die Absicht kommt ausschließlich mit dem Vorgang herein — nie neben einem Entwurf.
  assert.ok(seite.includes("useState(() => (flowInit && flowInit.calculatorIntent) || null)"));
});

/* ══════════ D  DIE ABSICHT ÜBERLEBT DEN WEG ══════════════════════════════════ */

test("D — die Absicht überlebt den Vorgang und trägt nur Name und bestehende Identität", () => {
  const scope = normalizeScope(uebergabe(), "shipment");
  assert.deepEqual({ ...scope.calculatorIntent },
    { source: CALCULATOR_INTENT_SOURCE, offerId: "e".repeat(32), tariffId: 3588, label: LABEL });
  // Der Preisrechner-Bereich trägt keine Absicht.
  assert.equal(normalizeScope({ calculatorIntent: scope.calculatorIntent }, "calculator").calculatorIntent, null);
  // Unbrauchbares wird verworfen, nie halb übernommen.
  for (const roh of [null, {}, { source: "x", offerId: "a", label: "L" }, { source: "calculator", label: "L" },
                     { source: "calculator", offerId: "a".repeat(65), label: "L" },
                     { source: "calculator", tariffId: "3588; drop", label: "L" },
                     { source: "calculator", offerId: "a", label: "   " }]) {
    assert.equal(normalizeCalculatorIntent(roh), null, JSON.stringify(roh));
  }
  // Ein Angebot ohne Identität ergibt keine Absicht.
  assert.equal(uebergabe({ tariff: { publicServiceName: "X" } }).calculatorIntent, null);
});

/* ══════════ E  KEIN ALTPREIS ═════════════════════════════════════════════════ */

test("E — die Übergabe ist nicht buchbar: kein Preis, kein Angebot, keine Sendungskennung", () => {
  const u = uebergabe();
  assert.deepEqual([u.selected, u.ceShipmentId, u.customs, u.calculatedAt], [null, null, null, null]);
  assert.deepEqual([u.tariffs, u.publicCarriers], [[], []]);
  // Die Absicht trägt weder Preis noch Buchbarkeit noch das Angebot selbst.
  const schluessel = Object.keys(u.calculatorIntent).sort();
  assert.deepEqual(schluessel, ["label", "offerId", "source", "tariffId"]);
  assert.ok(!/14[.,]2|16[.,]9/.test(JSON.stringify(u)), "ein Preisrechner-Betrag reist mit");
  // Die Buchungsseite nimmt den Vorgang nur mit `selected` UND Sendungskennung — beides fehlt.
  const buchung = ohneKommentare(lies("src/pages/BookingPage.jsx"));
  assert.match(buchung, /if \(flowShipment\?\.selected && flowShipment\.ceShipmentId != null\) \{/);
  assert.ok(!/calculatorIntent/.test(buchung), "die Buchungsseite liest die Absicht");
});

/* ══════════ F  KEIN FALSCHER MATCH ═══════════════════════════════════════════ */

const intent = normalizeScope(uebergabe(), "shipment").calculatorIntent;
const frisch = (patch = {}) => ({ ...UPS_SAMSTAG, offerId: "f".repeat(32), netPrice: 15.1, finalPrice: 17.97, ...patch });

test("F1 — dieselbe Tarif-ID in der NEUEN Berechnung → ausgewählt, mit dem NEUEN Serverpreis", () => {
  const neu = frisch();
  const r = resolveCalculatorIntent([frisch({ id: 3264, shipper_tariff_id: 3264, offerId: "1".repeat(32) }), neu], intent);
  assert.equal(r.outcome, "matched");
  assert.equal(r.offer, neu, "es wurde nicht das frische Angebot gewählt");
  assert.equal(r.offer.netPrice, 15.1, "der alte Preisrechner-Preis wurde erzwungen");
});

test("F2 — keine eindeutige Identität → nichts ausgewählt (kein ähnliches Angebot)", () => {
  // Shopvariante desselben Tarifs ist ein anderes Angebot.
  assert.equal(resolveCalculatorIntent([frisch({ id: "s-3588" })], intent).outcome, "unmatched");
  // Gleicher Carrier, gleicher Name, andere Tarif-ID: ähnlich, nicht dasselbe.
  assert.equal(resolveCalculatorIntent([frisch({ id: 3264 })], intent).outcome, "unmatched");
  // Zwei Treffer sind kein eindeutiger Treffer.
  assert.equal(resolveCalculatorIntent([frisch(), frisch({ offerId: "2".repeat(32) })], intent).outcome, "unmatched");
  // Ein nicht auswählbares Angebot wird nicht markiert.
  assert.equal(resolveCalculatorIntent([frisch({ bookable: false, unavailableReason: "quote_only" })], intent).outcome, "unmatched");
  // Leere Liste.
  assert.equal(resolveCalculatorIntent([], intent).outcome, "unmatched");
});

test("F3 — Transglobal ohne dauerhafte Kennung: nach der Neuberechnung ehrlich gelöst, nie geraten", () => {
  const tgAlt = { offerId: "a".repeat(32), publicCarrierId: "ups", publicServiceName: "Standardversand", serviceType: "pickup", bookable: true };
  const tgIntent = normalizeScope(calculatorSelectionToShipmentTransfer({ calculator: RECHNER, tariff: tgAlt, label: "UPS · Standardversand" }), "shipment").calculatorIntent;
  assert.deepEqual([tgIntent.offerId, tgIntent.tariffId], ["a".repeat(32), null]);
  // Dasselbe Produkt mit neuer Angebotskennung: keine Zuordnung — der Name allein trägt nicht.
  assert.equal(resolveCalculatorIntent([{ ...tgAlt, offerId: "b".repeat(32) }], tgIntent).outcome, "unmatched");
  // Dieselbe Angebotskennung (dieselbe Antwort) wäre eindeutig.
  assert.equal(resolveCalculatorIntent([tgAlt], tgIntent).outcome, "matched");
});

/* ══════════ G  HINWEISE ══════════════════════════════════════════════════════ */

test("G — Hinweise: offen nennt den Weg, ausgewählt nur solange ausgewählt, sonst ehrlich", () => {
  const offen = calculatorIntentNotice({ intent });
  assert.match(offen, /^Ihr Angebot aus dem Preisrechner: UPS · Standard Samstagszustellung\./);
  assert.match(offen, /neu berechnet/);
  assert.ok(!/€|\d+,\d{2}/.test(offen), "der Hinweis nennt einen Preis");
  const neu = frisch();
  const r = resolveCalculatorIntent([neu], intent);
  assert.match(calculatorIntentNotice({ resolution: r, selected: neu }), /ist ausgewählt: UPS · Standard Samstagszustellung/);
  assert.equal(calculatorIntentNotice({ resolution: r, selected: null }), "", "der Hinweis bleibt nach einer anderen Auswahl stehen");
  assert.equal(calculatorIntentNotice({ resolution: r, selected: frisch({ offerId: "9".repeat(32) }) }), "");
  const nein = resolveCalculatorIntent([], intent);
  assert.match(calculatorIntentNotice({ resolution: nein }), /nicht eindeutig zuordnen\. Bitte wählen Sie ein Angebot aus der Liste\./);
  assert.equal(calculatorIntentNotice({}), "");
});

/* ══════════ H  VERDRAHTUNG ═══════════════════════════════════════════════════ */

test("H1 — Preisrechner: der Knopf übergibt explizit und ersetzt einen alten Sendungsvorgang vollständig", () => {
  const rechner = ohneKommentare(lies("src/pages/CalculatorPage.jsx"));
  const fn = rechner.match(/const handleBook = useCallback\(\(tariff\) => \{[\s\S]*?\n  \}, \[navigate, setFlowScope, clearFlowScope\]\);/);
  assert.ok(fn, "handleBook nicht gefunden");
  const k = fn[0];
  for (const teil of ["calculatorSelectionToShipmentTransfer({", 'clearFlowScope("shipment");', 'setFlowScope("shipment", uebergabe);',
                      'navigate("/dashboard?page=new");']) {
    assert.ok(k.includes(teil), `handleBook: „${teil}" fehlt`);
  }
  // Reihenfolge: erst leeren, dann übergeben, dann navigieren.
  assert.ok(k.indexOf('clearFlowScope("shipment")') < k.indexOf('setFlowScope("shipment", uebergabe)'));
  assert.ok(k.indexOf('setFlowScope("shipment", uebergabe)') < k.indexOf("navigate("));
  // Kein Preis, kein Netz, keine Buchung im Knopf.
  assert.ok(!/apiFetch|netPrice|finalPrice|\/book|\/booking/.test(k), "handleBook rechnet, ruft oder bucht");
});

test("H2 — „Neue Sendung“: Absicht gespiegelt, nach der Neuberechnung genau einmal aufgelöst, beim Reset verworfen", () => {
  const seite = ohneKommentare(lies("src/pages/NewShipmentPage.jsx"));
  assert.match(seite, /inventoryContext, calculatorIntent,\s*calculatedAt: calculatedAtRef\.current,/);
  const rechnen = seite.slice(seite.indexOf("const calculate = async () => {"), seite.indexOf("const reloadFormDraft"));
  const aufloesung = rechnen.indexOf("resolveCalculatorIntent(d.tariffs, calculatorIntent)");
  assert.ok(aufloesung > rechnen.indexOf("setTariffs(Array.isArray(d.tariffs) ? d.tariffs : []);"),
    "die Absicht wird nicht gegen die frische Liste aufgelöst");
  assert.ok(rechnen.includes("setCalculatorIntent(null);"), "die Absicht wird nicht verbraucht");
  // Fehlende Angaben werden nach einer Übergabe sofort angefordert — die Vorrangkette des Initialisierers bleibt.
  assert.ok(seite.includes("useState(() => (resumeInit ? getErrors(resumeInit.form) : {}))"));
  assert.match(seite, /if \(flowInit && flowInit\.calculatorIntent\) setErrors\(getErrors\(flowInit\.form\)\);/);
  const reset = seite.match(/const resetToFreshShipment = \(\) => \{[\s\S]*?\n  \};/)[0];
  assert.ok(reset.includes("setCalculatorIntent(null);") && reset.includes("setCalculatorIntentResolution(null);"));
});
