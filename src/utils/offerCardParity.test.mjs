/* Tarifkarten-Parität — eine Karte für alle Einkaufsquellen.

   Kein Netz, kein Browser: Auswertung plus Quelltextzusicherungen.

   Die drei Leitfragen:
     1. Gibt es GENAU EINE Tarifkarte — oder verzweigt irgendwo ein Provider?
     2. Wird eine Karte allein deshalb entwertet, weil man sie nicht bestellen kann?
     3. Erfindet die Karte Kalenderdaten, die kein Provider geliefert hat? */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { offerBookable, offerBlocked, offerBlockedLabel } from "./offerIdentity.mjs";
import { handoverMode, handoverLabelForTariff, HANDOVER_PICKUP, HANDOVER_DROPOFF } from "./handoverMode.mjs";
import { fmtDelivery } from "./formatters.js";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => fs.readFileSync(path.join(HIER, "..", p), "utf8");
const ohneKommentar = (p) => lies(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

const CARD = lies("components/offers/OfferCard.jsx");
const CARD_CODE = ohneKommentar("components/offers/OfferCard.jsx");
const CSS = lies("styles/offers.css");
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/* Ein Transglobal-Angebot, wie es heute wirklich ankommt: Carrier, Service,
   Übergabeart, Laufzeit als Spanne — aber KEINE Kalenderdaten, kein Tracking-Flag,
   keine Druckerangabe, kein Access Point. */
const TG_DROPOFF = {
  offerId: "a".repeat(32), publicCarrierId: "dpd", publicServiceName: "DPD PaketShop",
  serviceType: "dropoff", transitDaysMin: 1, transitDaysMax: 2,
  netPrice: 9.4, vatAmount: 1.79, finalPrice: 11.19, currency: "EUR",
  bookable: false, unavailableReason: "quote_only", requiredPriceInputs: ["deliveryIsResidential"],
};
const TG_PICKUP = {
  ...TG_DROPOFF, offerId: "b".repeat(32), publicCarrierId: "ups",
  publicServiceName: "UPS Express Saver", serviceType: "pickup",
  transitDaysMin: 1, transitDaysMax: 1,
  requiredPriceInputs: ["deliveryIsResidential", "collectionIsResidential"],
};
/* Nach oben offene Laufzeit: min gesetzt, max null, Aussage im Text. */
const TG_OFFEN = { ...TG_DROPOFF, offerId: "c".repeat(32), transitDaysMax: null, deliveryTime: "ab 1 Tag" };
/* Ein JUMiNGO-Angebot mit vollem Datenbestand. */
const JUMINGO = {
  id: 7, offerId: "d".repeat(32), publicCarrierId: "dhl", publicServiceName: "DHL Paket",
  serviceType: "pickup", transitDaysMin: 1, transitDaysMax: 2,
  pickupDate: "2026-09-10T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-09-11T00:00:00Z", trackingAvailable: true, printerRequired: false,
  netPrice: 12, vatAmount: 2.28, finalPrice: 14.28, currency: "EUR", bookable: true,
};

/* ══════════ A — EINE KARTE FÜR ALLE ═══════════════════════════════════════ */

test("(A1) es gibt GENAU EINE Tarifkarte", () => {
  const wurzel = path.join(HIER, "..", "components", "offers");
  const karten = fs.readdirSync(wurzel).filter((f) => /Card\.jsx$/.test(f));
  assert.deepEqual(karten, ["OfferCard.jsx"],
    "es existiert eine zweite Kartenkomponente: " + karten.join(", "));
});

test("(A2) die Karte verzweigt NIRGENDS auf einen Provider", () => {
  // Die eigentliche Architekturregel. Providerunterschiede gehören in die
  // Normalisierung und in die Angebotsdaten — nicht in zwei UI-Komponenten und
  // auch nicht in ein `if` mitten in einer.
  for (const verboten of ["transglobal", "jumingo", "provider ===", "providerServiceRef",
                          "providerQuoteRef", "quoteId"]) {
    assert.ok(!CARD_CODE.toLowerCase().includes(verboten.toLowerCase()),
      `OfferCard.jsx verzweigt oder liest "${verboten}"`);
  }
});

test("(A3) auch die Angebotsliste kennt keinen Provider", () => {
  const liste = ohneKommentar("components/offers/OffersList.jsx");
  for (const verboten of ["transglobal", "jumingo", "provider"]) {
    assert.ok(!liste.toLowerCase().includes(verboten.toLowerCase()),
      `OffersList.jsx liest "${verboten}"`);
  }
});

/* ══════════ B — NICHT BESTELLBAR IST NICHT MINDERWERTIG ═══════════════════ */

test("(B1) die Karte wird NICHT ausgegraut, nur weil sie nicht bestellbar ist", () => {
  // Der Kern dieses Pakets. Vorher: opacity 0.72, graue Fläche, Graustufenlogo,
  // gedämpfter UND verkleinerter Preis. Eine korrekte Preisauskunft sah damit aus
  // wie ein Fehler.
  const regeln = CSS_CODE.split("\n").filter((z) => z.includes(".offer-card--unavailable"));
  assert.ok(regeln.length > 0, "die Zustandsklasse ist ganz verschwunden — dann greift auch der Test nicht");
  const zusammen = regeln.join(" ");
  for (const verboten of ["opacity", "grayscale", "background:", "font-size"]) {
    assert.ok(!zusammen.includes(verboten),
      `die Karte wird über "${verboten}" entwertet: ${zusammen.trim()}`);
  }
});

test("(B2) der PREIS behält Größe und Farbe", () => {
  // Ihn zu dämpfen sagt dem Kunden „diese Zahl gilt nicht so richtig" — und das
  // stimmt nicht: der Preis ist real, nur bestellen kann man gerade nicht.
  const preisRegeln = CSS_CODE.split("\n")
    .filter((z) => z.includes(".offer-card--unavailable") && z.includes(".offer-price"));
  assert.deepEqual(preisRegeln, [],
    "es gibt weiterhin eine Preisregel für den nicht bestellbaren Zustand: " + preisRegeln.join(" "));
});

test("(B3) Darstellung und Buchbarkeit sind zwei getrennte Begriffe", () => {
  assert.equal(offerBookable(JUMINGO), true);
  assert.equal(offerBookable(TG_DROPOFF), false, "quote_only muss unbestellbar sein");
  assert.equal(offerBookable({ availableForDate: false }), false);
  // Ein FEHLENDES Feld sperrt nichts — sonst wäre jedes Angebot aus einer älteren
  // Antwort plötzlich gesperrt.
  assert.equal(offerBookable({}), true);
  assert.equal(offerBookable({ bookable: undefined }), true);
});

test("(B4) die Timeline steht auf JEDEM Angebot", () => {
  // Vorher ersetzte eine Hinweiszeile die ganze Zone 2 — mit ihr verschwanden
  // Übergabeart, Laufzeit und Ablauf.
  assert.ok(!/unavailable \?\s*\(\s*<div className="offer-unavail"/.test(CARD),
    "die Hinweiszeile ersetzt weiterhin die Timeline");
  const zone2 = CARD.slice(CARD.indexOf('offer-zone-2"'), CARD.indexOf('offer-zone-3"'));
  assert.ok(zone2.includes("offer-timeline"), "Zone 2 rendert keine Timeline mehr");
  assert.ok(zone2.includes("offer-handover"), "die Übergabeart fehlt in Zone 2");
});

test("(B5) der Grund steht GENAU EINMAL, und zwar am Knopf", () => {
  // Ein erster Versuch setzte eine eigene Statuszeile über den Knopf. Im Bild stand
  // derselbe Satz dann zweimal untereinander, und die Karte wurde 25 px höher als
  // eine buchbare daneben — gemessen im Browser. Der Knopf trägt den Grund bereits.
  const zone3 = CARD.slice(CARD.indexOf("offer-zone-3\""));
  assert.ok(!zone3.includes("offer-orderability-note"),
    "es gibt wieder eine zweite Stelle für denselben Satz");
  assert.equal((zone3.match(/unavailableText/g) || []).length, 2,
    "der Grundtext steht nicht genau einmal im Knopf (Beschriftung + aria-label)");
});

/* ══════════ C — KEINE ERFUNDENEN DATEN ════════════════════════════════════ */

test("(C1) ohne Kalenderdatum heißt der Knoten NICHT „Lieferung“", () => {
  // „Lieferung / 1–2 Tage" liest sich wie ein Zustelltermin, ist aber eine Dauer.
  const bau = CARD.slice(CARD.indexOf("function buildEnd"), CARD.indexOf("function fmtTransitDetail"));
  assert.ok(bau.includes('title = "Voraussichtliche Laufzeit"'),
    "der laufzeitbasierte Knoten trägt weiterhin den Titel eines Termins");
  assert.ok(/return \{ title, primary, secondary \}/.test(bau),
    "der Titel wird nicht durchgereicht — dann greift die Unterscheidung nicht");
});

test("(C2) es wird KEIN Datum aus der Laufzeit gerechnet", () => {
  // Die naheliegende und falsche Lösung: heute + n Tage. Wir kennen weder
  // Abholtag noch Feiertage noch Cutoff.
  for (const verboten of ["Date.now()", "new Date()", "addDays", "setDate("]) {
    assert.ok(!CARD_CODE.includes(verboten),
      `OfferCard.jsx rechnet mit "${verboten}" — daraus entstünde ein erfundenes Datum`);
  }
});

test("(C3) die drei Laufzeitformen werden ehrlich benannt", () => {
  assert.equal(fmtDelivery({ transitDaysMin: 1, transitDaysMax: 1 }), "1 Tag");
  assert.equal(fmtDelivery({ transitDaysMin: 1, transitDaysMax: 2 }), "1–2 Tage");
  // Nach oben offen: die Aussage steht im Providertext, es wird keine Obergrenze erfunden.
  assert.equal(fmtDelivery(TG_OFFEN), "ab 1 Tag");
  assert.equal(TG_OFFEN.transitDaysMax, null, "eine erfundene Obergrenze wäre Scheingenauigkeit");
});

/* ══════════ D — ÜBERGABEART ═══════════════════════════════════════════════ */

test("(D1) Abholung und Paketshopabgabe erscheinen auf beiden Quellen gleich", () => {
  assert.equal(handoverMode(TG_PICKUP), HANDOVER_PICKUP);
  assert.equal(handoverMode(TG_DROPOFF), HANDOVER_DROPOFF);
  assert.equal(handoverMode(JUMINGO), HANDOVER_PICKUP);
  // Derselbe Text, unabhängig von der Einkaufsquelle — beide sind Abholung.
  assert.equal(handoverLabelForTariff(TG_PICKUP), handoverLabelForTariff(JUMINGO));
  assert.ok(handoverLabelForTariff(TG_DROPOFF).length > 0);
  assert.notEqual(handoverLabelForTariff(TG_DROPOFF), handoverLabelForTariff(TG_PICKUP),
    "Abgabe und Abholung dürfen nicht denselben Text tragen");
});

/* ══════════ E — FÄHIGKEITEN NUR, WENN BELEGT ══════════════════════════════ */

test("(E1) die Featureleiste zeigt nur, was das Angebot wirklich trägt", () => {
  const bau = CARD_CODE.slice(CARD_CODE.indexOf("const metaItems = []"),
                              CARD_CODE.indexOf("const toggleDetails"));
  // Tracking nur bei ausdrücklichem Flag — nicht als Vermutung.
  assert.ok(/if \(t\.trackingAvailable\)/.test(bau));
  // Drucker DREIWERTIG: true → erforderlich, false → nicht nötig, fehlend → gar nichts.
  assert.ok(/t\.printerRequired === true/.test(bau) && /t\.printerRequired === false/.test(bau),
    "die Druckerangabe wird nicht dreiwertig gelesen — ein fehlender Wert würde behauptet");
  // Kein Platzhalter nur für gleiche Breite.
  assert.ok(!/metaItems\.push\(\{[^}]*label: ""/.test(bau));
});

test("(E2) ein TG-Angebot behauptet weder Tracking noch Druckerbedarf", () => {
  for (const feld of ["trackingAvailable", "printerRequired"]) {
    assert.equal(TG_DROPOFF[feld], undefined,
      `das Testangebot trägt ${feld} — dann misst dieser Test nicht den echten Fall`);
  }
});

/* ══════════ F — WHITE LABEL ═══════════════════════════════════════════════ */

test("(F1) kein sichtbarer Providerbezug und keine interne Referenz", () => {
  for (const verboten of ["Transglobal", "JUMiNGO", "QuoteID", "quoteId",
                          "providerServiceId", "transglobalexpress"]) {
    assert.ok(!CARD.includes(verboten), `"${verboten}" steht in der Tarifkarte`);
  }
});

test("(F2) der Vergleichsmodus bleibt sauber getrennt", () => {
  // Er darf existieren — aber nur über den Debugblock des Servers, nie über eine
  // eigene Ableitung in der Karte.
  assert.ok(CARD.includes("offerDebugView(t)"), "der Debugmodus wurde entfernt statt getrennt");
  assert.ok(!/import\.meta\.env|localStorage|VITE_/.test(CARD_CODE),
    "die Karte trägt einen eigenen Debugschalter — der Server entscheidet");
});

/* ══════════ G — AUSZEICHNUNGEN ════════════════════════════════════════════ */

test("(G1) Auszeichnungen folgen der Buchbarkeit, nicht der Einkaufsquelle", async () => {
  const { assignBadges } = await import("./offerBadges.js");
  // Zwei buchbare Angebote: das günstigere bekommt die Auszeichnung.
  const guenstig = { ...JUMINGO, offerId: "e".repeat(32), netPrice: 5, finalPrice: 5.95 };
  const b = assignBadges([guenstig, JUMINGO]);
  assert.ok(b.size > 0, "unter buchbaren Angeboten entsteht keine Auszeichnung");
  assert.ok(b.has("e".repeat(32)), "das günstigere buchbare Angebot bekam keine Auszeichnung");

  // Ein nicht bestellbares Angebot bekommt keine — ein Preisversprechen auf einem
  // Angebot, das niemand nehmen kann, wäre eine Falschauskunft. Das gilt für JEDE
  // Einkaufsquelle und ist ausdrücklich KEINE Providerregel.
  const mitGesperrt = assignBadges([{ ...TG_DROPOFF, netPrice: 1, finalPrice: 1.19 }, JUMINGO]);
  assert.ok(!mitGesperrt.has(TG_DROPOFF.offerId),
    "ein nicht bestellbares Angebot wurde als Bestpreis ausgezeichnet");

  // Sobald es buchbar IST, nimmt dasselbe TG-Angebot ganz normal teil — mit seiner
  // Laufzeitspanne auch an „Schnellste". Es fällt also nicht providerbedingt heraus.
  const tgBuchbar = { ...TG_DROPOFF, bookable: true, unavailableReason: null,
                      netPrice: 1, finalPrice: 1.19, transitDaysMin: 1, transitDaysMax: 1 };
  const offen = assignBadges([tgBuchbar, JUMINGO]);
  assert.ok(offen.has(tgBuchbar.offerId),
    "ein buchbares TG-Angebot bleibt von den Auszeichnungen ausgeschlossen");
});

/* ══════════ H — DER GESPERRTE KNOPF BLEIBT GESPERRT ═══════════════════════ */

test("(H1) ohne Buchbarkeit kein Klick, keine Auswahl, keine Folgeaktion", () => {
  assert.ok(/const handleSelect = \(\) => \{ if \(!unavailable\) onSelect\(t\); \};/.test(CARD_CODE),
    "die Kartenauswahl prüft die Buchbarkeit nicht");
  assert.ok(/if \(!unavailable\) onBook\(t\)/.test(CARD_CODE), "der CTA prüft die Buchbarkeit nicht");
  assert.ok(/disabled=\{unavailable\}/.test(CARD_CODE), "der Knopf ist nicht gesperrt");
  // Und die Paketshopsuche bleibt ein Folgeschritt der Bestellung.
  assert.ok(/\{!unavailable && <ParcelShopFinderTrigger/.test(CARD_CODE));
});

test("(H2) der Grundtext nennt keinen Provider", () => {
  const texte = [offerBlockedLabel(TG_DROPOFF), offerBlockedLabel({ availableForDate: false }),
                 offerBlockedLabel({ bookable: false, unavailableReason: "unbekannt" })];
  for (const t of texte) {
    assert.ok(typeof t === "string" && t.length > 0);
    assert.ok(!/transglobal|jumingo/i.test(t), `Providername im Grundtext: ${t}`);
  }
  assert.equal(offerBlockedLabel(JUMINGO), null, "ein buchbares Angebot trägt keinen Grund");
});
