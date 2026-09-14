// TG22 Package A — das kuratierte Produktprofil im Detailbereich der Angebotskarte (utils/serviceDetailsView.mjs,
// components/offers/ServiceProfileDetails.jsx und die Verdrahtung in OfferCard.jsx).
//
// Die Oberfläche formuliert, sie entscheidet nichts: welche Angaben ein Angebot trägt, sagt der Server
// (`serviceDetails`, `tariffLimits`, `trackingAvailable`, `printerRequired`, `chargeableWeight`, Labelangaben,
// Laufzeit, Absicherung). Geprüft wird, dass genau diese Aussagen in fünf Abschnitten erscheinen — und keine
// weitere: kein Access Point, keine Samstagszustellung, keine Länge und kein Gurtmaß, kein Datum, keine Uhrzeit,
// keine Zusage, kein Anbietername. JUMiNGO und jedes Angebot ohne Profil behalten den bisherigen Detailbereich.
//
// Die Testnamen tragen die Nummern der Frontend-Pflichttests 1–21. Die Browserprüfungen 22–25 (1440 / 834 /
// 390 px, kein horizontaler Überlauf) stehen in tests/e2e/tg22ProductDetails.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  serviceDetailsView, SERVICE_DETAILS_TEXT, SERVICE_SUMMARY_TEXT, SERVICE_NOT_ACCEPTED_TEXT,
} from "./serviceDetailsView.mjs";
import { offerCardInsurance } from "./coverInsuranceView.mjs";
import { COVER_INSURANCE_TEXT } from "./insuranceTerms.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
// CRLF-Checkouts (Windows) auf LF bringen — mehrere Anker enthalten Zeilenumbrüche.
const lies = (p) => readFileSync(path.join(HIER, p), "utf8").replace(/\r\n/g, "\n");
// Ganze Zeilenkommentare zuerst, dann Blockkommentare (auch JSX), dann Restkommentare hinter Code.
const ohneKommentare = (s) => s
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const code = (p) => ohneKommentare(lies(p));
const abschnitt = (quelle, von, bis) => {
  const a = quelle.indexOf(von);
  assert.ok(a >= 0, `Anker fehlt: ${von}`);
  const b = quelle.indexOf(bis, a + von.length);
  assert.ok(b > a, `Endanker fehlt: ${bis}`);
  return quelle.slice(a, b);
};
// Intl setzt zwischen Betrag und Währung ein geschütztes Leerzeichen.
const nbsp = (s) => String(s).replace(/ /g, " ");

const MODUL = "serviceDetailsView.mjs";
const KARTE = "../components/offers/OfferCard.jsx";
const PROFIL = "../components/offers/ServiceProfileDetails.jsx";
const CSS = "../styles/offers.css";

/* ══════════ Fixtures — die Formen des Vertrags ══════════ */

// Das öffentliche TG22-Angebot, wie calculate-price es seit Package A liefert (Fixturewerte, nie gerechnet).
const TG22 = Object.freeze({
  offerId: "22pa0000000000000000000000000022", publicCarrierId: "ups", publicServiceName: "Standardversand",
  serviceType: "pickup", collectionDate: "2026-09-16", collectionReadyFrom: "09:00",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage",
  netPrice: 12.74, vatAmount: 2.42, finalPrice: 15.16, currency: "EUR",
  bookable: false, unavailableReason: "price_inputs_required", priceCompleteness: "indicative",
  requiredPriceInputs: ["deliveryIsResidential"],
  chargeableWeight: 2, labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"], labelFormatOptions: [],
  insuranceAvailable: false, insuranceDetails: null, trackingAvailable: true, printerRequired: true,
  tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }, { operant: "weight", operator: "<=", value: 70 }],
  serviceDetails: {
    summaryKey: "economy_standard", volumetricDivisor: 5000, notAccepted: ["pallets", "suitcases"],
    basicCoverMaxGoodsValue: 50, maxCoverValue: 2500,
  },
  pickupToday: false, pickupTodayUntil: null, sameDaySurchargeNet: null, sameDaySurchargeGross: null,
});
const mit = (over = {}) => ({ ...TG22, ...over });
const details = (over = {}) => ({ ...TG22.serviceDetails, ...over });

// Nach der Bindung buchbar: die zusätzliche Transportabsicherung ist für diesen Warenwert wählbar.
const COVER_DETAILS = Object.freeze({
  isInsurable: true, selectionModel: "cover_value", excessValue: 20,
  requiresGoodsAreNew: true, requiresGoodsAreFragile: true, priceOnSelection: true,
});
const BUCHBAR = mit({ bookable: true, unavailableReason: null, priceCompleteness: "complete",
                      insuranceAvailable: true, insuranceDetails: COVER_DETAILS });
// Warenwert bis zur Grundabsicherungsgrenze: keine zusätzliche Absicherung, sondern die enthaltene Grundabsicherung.
const GRUNDABSICHERUNG = mit({ bookable: true, unavailableReason: null, insuranceAvailable: false,
  insuranceDetails: { isInsurable: false, selectionModel: "cover_value", coverState: "basic_cover_included",
                      basicCoverMaxGoodsValue: 50, maxCoverValue: 2500, excessValue: 20 } });

// Ein Tarif der anderen Einkaufsquelle: Tarif-ID, eigene Grenzen, Formatwahl — kein Produktprofil.
const JUMINGO = Object.freeze({
  id: 3708, shipper_tariff_id: 3708, offerId: "ju-pa-000000000000000000000003708",
  publicCarrierId: "ups", publicServiceName: "Standardversand", serviceType: "pickup",
  transitDaysMin: 1, transitDaysMax: 2, netPrice: 11.9, vatAmount: 2.26, finalPrice: 14.16, currency: "EUR",
  trackingAvailable: true, printerRequired: true, chargeableWeight: 5.4,
  tariffLimits: [{ operant: "weight", operator: "<=", value: 31.5 }, { operant: "girth", operator: "<=", value: 300 }],
  labelFormatOptions: ["A4", "A6"], labelSizes: ["A4", "A6"], bookable: true, requiredPriceInputs: [],
});

const zeile = (bereich, id) => (bereich ? bereich.rows.find((z) => z.id === id) : undefined);
const alleTexte = (v) => nbsp(JSON.stringify(v));

/* ══════════ 1–3  HAUPTMERKMALE UND LAUFZEIT ══════════ */

test("1 — die Beschreibung entsteht aus dem Code des Servers", () => {
  const v = serviceDetailsView(TG22);
  assert.ok(v, "das Profil wurde nicht gebildet");
  assert.equal(v.main.summary, "Wirtschaftlicher Standardversand für weniger eilige Sendungen.");
  assert.deepEqual(Object.keys(SERVICE_SUMMARY_TEXT), ["economy_standard"]);
  assert.equal(serviceDetailsView(mit({ serviceDetails: details({ summaryKey: "premium_express" }) })), null);
  assert.equal(serviceDetailsView(mit({ serviceDetails: details({ summaryKey: "constructor" }) })), null);
});

test("2 — Hauptmerkmale: Abholung an Ihrer Adresse, Sendungsverfolgung inklusive, Versandlabel zum Ausdrucken", () => {
  const v = serviceDetailsView(TG22);
  assert.deepEqual(v.main.features.map((f) => f.label),
    ["Abholung an Ihrer Adresse", "Sendungsverfolgung inklusive", "Versandlabel zum Ausdrucken"]);
  assert.equal(v.main.features.find((f) => f.id === "label").value, "PDF · DIN A4 / Thermodruck");
  assert.equal(v.main.features.find((f) => f.id === "pickup").value, null);
  // Die Übergabeart kommt aus dem Angebot: eine Shopabgabe behauptet keine Abholung.
  const shop = serviceDetailsView(mit({ serviceType: "dropoff" }));
  assert.ok(!shop.main.features.some((f) => f.id === "pickup"), "eine Shopabgabe nennt eine Abholung");
});

test("3 — die Laufzeit steht genau einmal, als Schätzung und ohne Zusage", () => {
  const v = serviceDetailsView(TG22);
  assert.deepEqual(v.transit.rows, [{ id: "transit", label: "Voraussichtliche Laufzeit", value: "1–2 Tage" }]);
  assert.equal(v.transit.note, "Die Laufzeit ist eine Schätzung des Versanddienstleisters und keine Zustellzusage.");
  assert.equal((alleTexte(v).match(/Voraussichtliche Laufzeit/g) || []).length, 1, "die Laufzeit steht mehrfach im Profil");
  assert.equal(serviceDetailsView(mit({ transitDaysMin: null, transitDaysMax: null, deliveryTime: null })).transit, null);
  // Die bisherige Laufzeitzeile der Merkmale steht nur im Weg OHNE Profil.
  const details = abschnitt(code(KARTE), "function DetailsPanel", "function OfferCardBase");
  assert.match(details, /\{!profil && hasMain && \(/);
});

/* ══════════ 4–8  GRÖSSE & GEWICHT ══════════ */

test("4 — Max. Gewicht 70 kg aus der Tarifgrenze des Servers", () => {
  assert.deepEqual(zeile(serviceDetailsView(TG22).size, "maxWeight"), { id: "maxWeight", label: "Max. Gewicht", value: "70 kg" });
  const halb = mit({ tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }, { operant: "weight", operator: "<=", value: 31.5 }] });
  assert.equal(zeile(serviceDetailsView(halb).size, "maxWeight").value, "31,5 kg");
  assert.equal(zeile(serviceDetailsView(mit({ tariffLimits: [{ operant: "packages_count", operator: "<=", value: 1 }] })).size, "maxWeight"),
    undefined, "ohne Grenze entstand ein Höchstgewicht");
  for (const kaputt of [{ operant: "weight", operator: "<", value: 70 }, { operant: "weight", operator: "<=", value: "70" },
                        { operant: "weight", operator: "<=", value: 0 }]) {
    assert.equal(zeile(serviceDetailsView(mit({ tariffLimits: [kaputt] })).size, "maxWeight"), undefined, JSON.stringify(kaputt));
  }
});

test("5 — Packstücke: 1 je Sendung", () => {
  assert.deepEqual(zeile(serviceDetailsView(TG22).size, "packages"), { id: "packages", label: "Packstücke", value: "1 je Sendung" });
  assert.equal(zeile(serviceDetailsView(mit({ tariffLimits: [{ operant: "packages_count", operator: "<=", value: 3 }] })).size, "packages").value,
    "bis 3 je Sendung");
});

test("6 — das Abrechnungsgewicht ist der Serverwert", () => {
  assert.equal(zeile(serviceDetailsView(TG22).size, "chargeableWeight").value, "2,00 kg");
  assert.equal(zeile(serviceDetailsView(mit({ chargeableWeight: 5.4 })).size, "chargeableWeight").value, "5,40 kg");
  assert.equal(zeile(serviceDetailsView(mit({ chargeableWeight: null })).size, "chargeableWeight"), undefined);
  assert.equal(zeile(serviceDetailsView(TG22).size, "chargeableWeight").label, "Abrechnungsgewicht");
});

test("7 — Erklärung des Volumengewichts: das höhere Gewicht zählt, L × B × H ÷ Divisor", () => {
  const v = serviceDetailsView(TG22);
  assert.equal(v.size.note, "Für die Abrechnung zählt das höhere Gewicht aus tatsächlichem Gewicht und Volumengewicht.");
  assert.equal(v.size.formula, "Volumengewicht: L × B × H ÷ 5.000");
});

test("8 — der Divisor kommt vom Server und rechnet nichts", () => {
  assert.equal(serviceDetailsView(mit({ serviceDetails: details({ volumetricDivisor: 6000 }) })).size.formula,
    "Volumengewicht: L × B × H ÷ 6.000");
  for (const kaputt of ["5000", 0, -5000, 5000.5, null]) {
    assert.equal(serviceDetailsView(mit({ serviceDetails: details({ volumetricDivisor: kaputt }) })), null, String(kaputt));
  }
  const modul = code(MODUL);
  assert.ok(!/5\.?000/.test(modul), "der Divisor steht als Literal im Modul");
  assert.ok(!/(length|width|height|weight)\s*[*/]/.test(modul), "das Modul rechnet mit Paketmaßen");
  // Das Abrechnungsgewicht bleibt der Serverwert — auch mit anderem Divisor.
  assert.equal(zeile(serviceDetailsView(mit({ serviceDetails: details({ volumetricDivisor: 6000 }) })).size, "chargeableWeight").value, "2,00 kg");
});

/* ══════════ 9–11  ABSICHERUNG UND EINSCHRÄNKUNGEN ══════════ */

test("9 — Grundabsicherung bis 50 € Warenwert", () => {
  const v = serviceDetailsView(TG22);
  assert.deepEqual(zeile(v.cover, "basicCover") && { ...zeile(v.cover, "basicCover"), value: nbsp(zeile(v.cover, "basicCover").value) },
    { id: "basicCover", label: "Grundabsicherung", value: "bis 50 € Warenwert" });
});

test("10 — Zusätzliche Transportabsicherung bis 2.500 € Warenwert; Selbstbeteiligung nur aus dem Serverwert", () => {
  const vergleich = serviceDetailsView(TG22);
  assert.equal(nbsp(zeile(vergleich.cover, "additionalCover").value), "bis 2.500 € Warenwert");
  assert.equal(zeile(vergleich.cover, "additionalCover").label, "Zusätzliche Transportabsicherung");
  assert.equal(zeile(vergleich.cover, "excess"), undefined, "eine Preisauskunft nennt eine Selbstbeteiligung");
  assert.equal(vergleich.cover.note, null);

  assert.equal(offerCardInsurance(BUCHBAR).insurable, true, "Vorbedingung: die Absicherung ist wählbar");
  const buchbar = serviceDetailsView(BUCHBAR);
  assert.deepEqual({ ...zeile(buchbar.cover, "excess"), value: nbsp(zeile(buchbar.cover, "excess").value) },
    { id: "excess", label: "Selbstbeteiligung", value: "20,00 €" });
  assert.equal(buchbar.cover.note, COVER_INSURANCE_TEXT.offerPriceNote);

  const grund = serviceDetailsView(GRUNDABSICHERUNG);
  assert.equal(zeile(grund.cover, "excess"), undefined, "ohne wählbaren Zusatz eine Selbstbeteiligung");
  assert.equal(nbsp(grund.cover.note), "Bis zu einem Warenwert von 50 € ist bereits eine Grundabsicherung ohne Aufpreis enthalten.");

  // Ohne Grenzen am Profil: keine Grenzzeilen, und ohne weitere Aussage kein Abschnitt.
  const ohne = serviceDetailsView(mit({ serviceDetails: details({ basicCoverMaxGoodsValue: null, maxCoverValue: null }) }));
  assert.equal(ohne.cover, null);
  for (const kaputt of [{ basicCoverMaxGoodsValue: 50, maxCoverValue: null }, { basicCoverMaxGoodsValue: 2500, maxCoverValue: 50 },
                        { basicCoverMaxGoodsValue: "50", maxCoverValue: 2500 }]) {
    assert.equal(serviceDetailsView(mit({ serviceDetails: details(kaputt) })), null, JSON.stringify(kaputt));
  }
  // Ein Stufenmodell beschreibt dieses Profil nicht: dann bleibt der bisherige Detailbereich.
  const stufen = mit({ bookable: true, unavailableReason: null, insuranceAvailable: true,
                       insuranceDetails: { isInsurable: true, insuranceValue: 500, extraInsurancePriceBruttoPreselect: 4.9 } });
  if (offerCardInsurance(stufen).insurable && !offerCardInsurance(stufen).coverModel) assert.equal(serviceDetailsView(stufen), null);
});

test("11 — Nicht zugelassen: Paletten, Koffer", () => {
  assert.deepEqual(serviceDetailsView(TG22).restrictions.rows,
    [{ id: "notAccepted", label: "Nicht zugelassen", value: "Paletten, Koffer" }]);
  assert.deepEqual(SERVICE_NOT_ACCEPTED_TEXT, { pallets: "Paletten", suitcases: "Koffer" });
  for (const kaputt of [[], ["pallets", "pallets"], ["dangerous_goods"], "pallets", ["Paletten"]]) {
    assert.equal(serviceDetailsView(mit({ serviceDetails: details({ notAccepted: kaputt }) })), null, JSON.stringify(kaputt));
  }
});

/* ══════════ 12–13  TRACKING UND LABEL ══════════ */

test("12 — Sendungsverfolgung nur mit der Serveraussage — ohne sie keine Zeile und kein „nicht verfügbar“", () => {
  for (const wert of [false, null, undefined, "true"]) {
    const v = serviceDetailsView(mit({ trackingAvailable: wert }));
    assert.ok(!v.main.features.some((f) => f.id === "tracking"), String(wert));
    assert.ok(!/Sendungsverfolgung|nicht verfügbar/i.test(alleTexte(v)), String(wert));
  }
});

test("13 — „Versandlabel zum Ausdrucken“ nur mit Druckpflicht; die Formate nur, wenn sie belegt sind", () => {
  const ohneFormate = serviceDetailsView(mit({ labelFormats: [], labelSizes: [] }));
  assert.deepEqual(ohneFormate.main.features.find((f) => f.id === "label"),
    { id: "label", icon: "printer", label: "Versandlabel zum Ausdrucken", value: null });
  for (const wert of [false, null, undefined]) {
    assert.ok(!serviceDetailsView(mit({ printerRequired: wert })).main.features.some((f) => f.id === "label"), String(wert));
  }
  // Keine neue Labelfunktion: das Profil verlinkt nichts und lädt nichts.
  assert.ok(!/href|download|onClick|fetch\(|apiFetch/.test(code(PROFIL)), "der Profilbereich bekam eine Aktion");
});

/* ══════════ 14–20  WAS NICHT ERSCHEINT ══════════ */

const VIEWS = () => [serviceDetailsView(TG22), serviceDetailsView(BUCHBAR), serviceDetailsView(GRUNDABSICHERUNG)];

test("14 — kein Access Point", () => {
  for (const v of VIEWS()) assert.ok(!/access\s*point|paketshop|abgabestelle|shop/i.test(alleTexte(v)));
  for (const datei of [MODUL, PROFIL]) assert.ok(!/accessPoint|access_point|ParcelShop/i.test(code(datei)), datei);
});

test("15 — keine Samstagszustellung", () => {
  for (const v of VIEWS()) assert.ok(!/samstag|saturday|wochenende/i.test(alleTexte(v)));
  for (const datei of [MODUL, PROFIL]) assert.ok(!/samstag|saturday/i.test(code(datei)), datei);
});

test("16 — keine Länge und kein Gurtmaß als Zahl", () => {
  for (const v of VIEWS()) {
    assert.ok(!/länge|gurtmaß|girth|umfang|\d+\s*cm/i.test(alleTexte(v)), "eine Maßangabe im Profil");
  }
  // Selbst eine gelieferte Maßgrenze wird im Profil nicht dargestellt.
  const mitMass = serviceDetailsView(mit({ tariffLimits: [...TG22.tariffLimits, { operant: "girth", operator: "<=", value: 300 },
                                                          { operant: "length", operator: "<=", value: 270 }] }));
  assert.ok(!/300|270|cm/.test(alleTexte(mitMass)));
  assert.ok(!/girth|first_length|Gurt|Länge/.test(code(MODUL)));
});

test("17 — kein Datum", () => {
  for (const v of VIEWS()) assert.ok(!/\d{1,2}\.\d{1,2}\.\d{2,4}|\d{4}-\d{2}-\d{2}/.test(alleTexte(v)), "ein Datum im Profil");
  const mitDatum = serviceDetailsView(mit({ deliveryDate: "2026-09-18", deliveryDateMin: "2026-09-17", deliveryDateMax: "2026-09-18" }));
  assert.ok(!/2026|18\.09/.test(alleTexte(mitDatum)), "das Profil übernahm ein Zustelldatum");
  assert.ok(!/new Date|Date\.now|toLocaleDateString|deliveryDate|isoDayDE|fmtDay/.test(code(MODUL)));
});

test("18 — keine Zustelluhrzeit", () => {
  const mitZeit = serviceDetailsView(mit({ deliveryTimeUntil: "bis 12:00", pickupTodayUntil: "16:45" }));
  assert.ok(!/\d{1,2}:\d{2}|\bUhr\b/.test(alleTexte(mitZeit)), "eine Uhrzeit im Profil");
  assert.ok(!/deliveryTimeUntil|pickupTodayUntil|collectionReadyFrom/.test(code(MODUL)));
});

test("19 — kein „garantiert“ und keine Zusage", () => {
  for (const v of VIEWS()) {
    const text = alleTexte(v);
    assert.ok(!/garant/i.test(text), "eine Garantie im Profil");
    // „Zusage“ steht ausschließlich verneint in der Laufzeitnotiz.
    assert.equal((text.match(/zusage/gi) || []).length, 1);
    assert.match(text, /keine Zustellzusage/);
  }
});

test("20 — kein Anbietername, keine ServiceID, keine Providerabfrage in Modul, Profil und Karte", () => {
  for (const v of VIEWS()) assert.ok(!/transglobal|jumingo|UPS Standard Single|serviceId|ServiceID/i.test(alleTexte(v)));
  for (const datei of [MODUL, PROFIL]) {
    assert.ok(!/transglobal|jumingo|provider|serviceId|providerServiceRef|debug/i.test(code(datei)), datei);
  }
  const details = abschnitt(code(KARTE), "function DetailsPanel", "function OfferCardBase");
  assert.ok(!/providerServiceRef|serviceId|=== ?22\b|"22"/.test(details), "die Karte fragt nach einer ServiceID");
  // Das Profil liest nur seine Ansicht — kein Angebot, keine Texte im JSX.
  const profil = code(PROFIL);
  assert.match(profil, /export function ServiceProfileDetails\(\{ view \}\)/);
  assert.ok(!/tariff|dangerouslySetInnerHTML/.test(profil));
  for (const text of ["Hauptmerkmale", "Laufzeit", "Größe", "Transportabsicherung", "Einschränkungen", "Paletten", "70 kg"]) {
    assert.ok(!profil.includes(text), `„${text}“ steht als Literal im Profil statt im Modul`);
  }
});

/* ══════════ 21  JUMINGO UND ANGEBOTE OHNE PROFIL ══════════ */

test("21 — JUMiNGO und jedes Angebot ohne Profil behalten den bisherigen Detailbereich", () => {
  assert.equal(serviceDetailsView(JUMINGO), null);
  for (const fehlt of [undefined, null, "economy_standard", [], {}]) {
    assert.equal(serviceDetailsView(mit({ serviceDetails: fehlt })), null, JSON.stringify(fehlt));
  }
  assert.equal(serviceDetailsView(null), null);

  const karte = code(KARTE);
  const details = abschnitt(karte, "function DetailsPanel", "function OfferCardBase");
  // Verdrahtung: das Profil ersetzt ausschließlich Hauptmerkmale, Einschränkungen und Versicherung.
  assert.match(karte, /import \{ serviceDetailsView \} from "\.\.\/\.\.\/utils\/serviceDetailsView\.mjs";/);
  assert.match(karte, /import \{ ServiceProfileDetails \} from "\.\/ServiceProfileDetails";/);
  assert.match(details, /const profil = serviceDetailsView\(t\);/);
  assert.match(details, /\{profil && <ServiceProfileDetails view=\{profil\} \/>\}/);
  assert.match(details, /\{!profil && hasMain && \(/);
  assert.match(details, /\{!profil && hasLimits && \(/);
  assert.match(details, /\{!profil && hasInsuranceSection && \(/);
  // Termin & Abholung, Preisaufschlüsselung, Links und Zusatzhinweise bleiben für jedes Angebot.
  for (const anker of ["{hasTermin && (", "{hasPrice && (", "{hasLinks && (", "{hasHinweise && ("]) {
    assert.ok(details.includes(anker), `${anker} hängt am Profil`);
  }
  // Der bisherige Weg ist unverändert: dieselben Merkmalszeilen wie vor Package A.
  assert.ok(lies(KARTE).includes('if (t.printerRequired != null)   features.push({ icon: "printer", label: "Drucker",'));
  assert.ok(lies(KARTE).includes('if (transitDetail)               features.push({ icon: "clock",   label: "Voraussichtliche Laufzeit", value: transitDetail });'));
});

/* ══════════ Profilkomponente und Umbruchschutz ══════════ */

test("Profil — fünf Abschnitte in fester Reihenfolge, Zeilen im bestehenden Detailmuster", () => {
  const profil = code(PROFIL);
  const reihenfolge = ["main", "transit", "size", "cover", "restrictions"].map((id) => profil.indexOf(`id="${id}"`));
  assert.ok(reihenfolge.every((i) => i >= 0), `ein Abschnitt fehlt: ${reihenfolge}`);
  assert.deepEqual([...reihenfolge].sort((a, b) => a - b), reihenfolge, "die Abschnitte stehen in anderer Reihenfolge");
  assert.match(profil, /className="offer-detail-row offer-profile-row"/);
  assert.match(profil, /className="offer-details-section offer-profile-section"/);
  for (const titel of ["mainTitle", "transitTitle", "sizeTitle", "coverTitle", "restrictionsTitle"]) {
    assert.ok(profil.includes(`SERVICE_DETAILS_TEXT.${titel}`), titel);
  }
  assert.deepEqual([SERVICE_DETAILS_TEXT.mainTitle, SERVICE_DETAILS_TEXT.transitTitle, SERVICE_DETAILS_TEXT.sizeTitle,
                    SERVICE_DETAILS_TEXT.coverTitle, SERVICE_DETAILS_TEXT.restrictionsTitle],
    ["Hauptmerkmale", "Laufzeit", "Größe & Gewicht", "Transportabsicherung", "Einschränkungen"]);
});

test("Umbruchschutz — lange Werte brechen um; auf schmalen Karten steht die Beschriftung über dem Wert", () => {
  const css = lies(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  const regel = (selektor) => {
    const m = css.match(new RegExp(`${selektor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `${selektor} fehlt`);
    return m[1];
  };
  assert.match(regel(".offer-profile-row .offer-detail-value"), /overflow-wrap:\s*break-word/);
  assert.match(regel(".offer-profile-row .offer-detail-value"), /min-width:\s*0/);
  assert.match(regel(".offer-profile-row"), /flex-wrap:\s*wrap/);
  assert.match(regel(".offer-profile-note"), /overflow-wrap:\s*break-word/);
  const schmal = css.slice(css.indexOf("@media (max-width: 480px)"));
  assert.match(schmal, /\.offer-profile-row\s*\{[^}]*flex-direction:\s*column/);
  assert.match(schmal, /\.offer-profile-row \.offer-detail-value\s*\{[^}]*text-align:\s*left/);
  const mobil = css.slice(css.indexOf("@media (max-width: 767px)"));
  assert.match(mobil, /\.offer-profile-features\s*\{[^}]*grid-template-columns:\s*1fr;/);
  assert.ok(!/#[0-9a-f]{3,8}\b/i.test([".offer-profile-summary", ".offer-profile-feature-label", ".offer-profile-note"]
    .map(regel).join("")), "Farbliteral im Profil");
});
