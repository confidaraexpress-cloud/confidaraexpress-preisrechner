// Masteranalyse Angebotskarten 2026-11-20 — Konzept A (Betreiberentscheidung E6), der eine Übergabefilter (E4), die
// Leistungszeile nur aus belegten Feldern (§7), die abgelaufene Angebotsaussage (§5.3) und `quotedAt` im gespeicherten
// Vorgang. Synthetische Daten, keine echten Einkaufswerte.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  HANDOVER_FILTER_OPTIONS, HANDOVER_FILTER_TITLE, HANDOVER_PICKUP, HANDOVER_DROPOFF, handoverLabel,
} from "./handoverMode.mjs";
import { SERVICE_FILTER_OPTIONS } from "./publicCalculatorView.mjs";
import { offerServiceLine, SERVICE_LINE_TEXT } from "./serviceDetailsView.mjs";
import { sameDayDeadlineText, sameDayPriceNote } from "./sameDayCollectionView.mjs";
import { DROPOFF_OPENING_NOTE } from "./pickupContractView.mjs";
import { normalizeScope, dropOffers, flowFingerprint, emptyScope } from "./shippingFlowState.mjs";
import { OFFER_REFRESH_TEXT } from "./offerRefresh.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => readFileSync(path.join(__dirname, "..", rel), "utf8");
// Code ohne Kommentare: geprüft wird, was gerendert wird, nicht die Entwicklernotiz.
const code = (rel) => lies(rel).replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");
const zwischen = (quelle, von, bis) => {
  const a = quelle.indexOf(von);
  assert.ok(a >= 0, `Anker fehlt: ${von}`);
  const b = quelle.indexOf(bis, a + von.length);
  assert.ok(b > a, `Endanker fehlt: ${bis}`);
  return quelle.slice(a, b);
};

const KARTE = "components/offers/OfferCard.jsx";
const LISTE = "components/offers/OffersList.jsx";
const FILTERLEISTE = "components/offers/ShipmentFilterBar.jsx";

/* ══════════ E4 — EIN Übergabefilter ══════════ */

test("(E4-1) der Übergabefilter heißt „Abholung / Paketshop“: Alle / Abholung / Paketshop und „Abholung heute“", () => {
  assert.equal(HANDOVER_FILTER_TITLE, "Abholung / Paketshop");
  assert.deepEqual(HANDOVER_FILTER_OPTIONS.map((o) => [o.id, o.label]), [
    ["all", "Alle"], ["pickup", "Abholung"], ["dropoff", "Paketshop"], ["pickup_today", "Abholung heute"],
  ]);
  assert.ok(Object.isFrozen(HANDOVER_FILTER_OPTIONS) && HANDOVER_FILTER_OPTIONS.every(Object.isFrozen));
  for (const o of HANDOVER_FILTER_OPTIONS) {
    assert.ok(typeof o.desc === "string" && o.desc.length > 0, `${o.id}: keine Erklärung`);
    assert.ok(typeof o.icon === "string" && o.icon.length > 0, `${o.id}: kein Symbol`);
  }
  // Kein Carrierfilter, keine Sortierung nach frühester Abholung, keine wertenden Wörter.
  const texte = JSON.stringify(HANDOVER_FILTER_OPTIONS);
  assert.doesNotMatch(texte, /UPS|DHL|DPD|GLS|TNT|Carrier|früheste|günstigst|empfehl|JUMiNGO|Transglobal/i);
});

test("(E4-2) Neue Sendung, Preisrechner, öffentlicher Rechner und Filterleiste lesen dieselbe Definition", () => {
  for (const seite of ["pages/NewShipmentPage.jsx", "pages/CalculatorPage.jsx"]) {
    const c = code(seite);
    assert.match(c, /import \{ HANDOVER_FILTER_OPTIONS \} from "\.\.\/utils\/handoverMode\.mjs";/, seite);
    assert.match(c, /const SERVICE_OPTIONS = HANDOVER_FILTER_OPTIONS;/, seite);
    assert.doesNotMatch(c, /Alle Dienstleistungen|Nur Abholung|Nur Abgabe|Shopabgabe/, `${seite}: eigene Filtertexte`);
  }
  // Der öffentliche Rechner: dieselben Kennungen, Texte und Erklärungen — nur ohne Symbol.
  assert.deepEqual(SERVICE_FILTER_OPTIONS, HANDOVER_FILTER_OPTIONS.map(({ id, label, desc }) => ({ id, label, desc })));
  const leiste = code(FILTERLEISTE);
  assert.match(leiste, /<div className="service-filter-trigger-title">\{HANDOVER_FILTER_TITLE\}<\/div>/);
  assert.match(leiste, /role="radiogroup" aria-label=\{HANDOVER_FILTER_TITLE\}>/);
  assert.doesNotMatch(leiste, /Shopabgabe/, "die Filterleiste trägt den alten Titel");
  // Der Leerzustand verweist auf dieselben Wörter.
  assert.match(code(LISTE), /wählen Sie bei „Abholung \/ Paketshop" die Option „Alle"\./);
  assert.doesNotMatch(code(LISTE), /Alle Dienstleistungen/);
});

/* ══════════ E6 — Konzept A auf der Karte ══════════ */

test("(A1) Kennzeichen unter dem Titel: Text trägt die Bedeutung, das Symbol ist aria-hidden", () => {
  assert.equal(handoverLabel(HANDOVER_PICKUP), "Abholung bei Ihnen");
  assert.equal(handoverLabel(HANDOVER_DROPOFF), "Abgabe im Paketshop");
  const karte = code(KARTE);
  const kopf = zwischen(karte, "className={`offer-zone-1", 'className="offer-zone-2"');
  const titel = kopf.indexOf('className="offer-title"');
  const kennzeichen = kopf.indexOf("className={`offer-handover offer-handover--${uebergabe}`}");
  assert.ok(titel > 0 && kennzeichen > titel, "das Kennzeichen steht nicht unter dem Titel");
  assert.match(kopf, /<span className="offer-handover-icon" aria-hidden="true">/);
  assert.match(kopf, /<span className="offer-handover-text">\{handoverText\}<\/span>/);
  // Carrier und Produkt bilden den Titel; die Laufzeit ist eine Nebenzeile über der Zeitleiste (Zone 2).
  assert.match(kopf, /<span className="offer-carrier-name">\{carrierName\}<\/span>/);
  assert.doesNotMatch(kopf, /offer-eta/, "die Laufzeit steht wieder im Kopf");
  const ablauf = zwischen(karte, 'className="offer-zone-2"', 'className="offer-zone-3"');
  assert.match(ablauf, /<p className="offer-transit">\s*<span className="offer-transit-label">Laufzeit<\/span>/);
});

test("(A2) Startknoten: „Früheste Abholung“ / „Abgabe ab“, Buchungsschluss neben dem Tag, Abholung zuerst", () => {
  const karte = code(KARTE);
  const start = zwischen(karte, "function buildStart", "function buildEnd");
  assert.match(start, /if \(modus === HANDOVER_DROPOFF\)\s+title = "Abgabe ab";/);
  assert.match(start, /else if \(modus === HANDOVER_PICKUP\) title = "Früheste Abholung";/);
  // Eine Abgabe ohne Tag sagt kein „ab" ohne Datum.
  assert.match(start, /if \(modus === HANDOVER_DROPOFF && !primary\) title = "Abgabe";/);
  const ablauf = zwischen(karte, 'className="offer-zone-2"', 'className="offer-zone-3"');
  assert.ok(ablauf.indexOf("offer-tl-node--start") < ablauf.indexOf("offer-tl-node--end"), "Zustellung vor Abholung");
  // Skizze F.3: „bereit ab …" bleibt, der Buchungsschluss folgt DARUNTER — die Frist verdrängt die Bereitzeit nicht.
  // Beide stehen in EINEM Element der Zusatzzeile: das Raster hat genau drei gemeinsame Zeilen (Titel · Datum · Zusatz).
  assert.match(karte, /const startZusatz = start\.secondary\.length > 0 \? <span className="offer-tl-sub"><Werte>\{start\.secondary\[0\]\}<\/Werte><\/span> : null;/);
  assert.match(ablauf, /\{start\.deadline\s*\?\s*<span className="offer-tl-subs">\{startZusatz\}<span className="offer-tl-sub offer-tl-deadline"><Werte>\{start\.deadline\}<\/Werte><\/span><\/span>\s*:\s*startZusatz\}/);
  assert.equal((ablauf.match(/offer-tl-deadline/g) || []).length, 1, "der Buchungsschluss steht mehr als einmal im Ablauf");
  assert.match(code("styles/offers.css"), /\.offer-tl-sub,\s*\.offer-tl-subs,\s*\.offer-early-note \{ grid-row: 3; \}/);
});

test("(A3) Preisblock: Auszeichnung über dem Preis, Preissatz der Abholung heute darunter, keine Tarif-ID", () => {
  const karte = code(KARTE);
  const preis = zwischen(karte, 'className="offer-zone-3"', 'className="offer-zone-4"');
  const auszeichnung = preis.indexOf("{badge && !abgelaufen && (");
  const block = preis.indexOf('className="offer-price-block"');
  assert.ok(auszeichnung >= 0 && block > auszeichnung, "die Auszeichnung steht nicht über dem Preis");
  assert.ok(preis.indexOf("{preisHinweis && <p className=\"offer-price-hint\">") > block, "der Preissatz steht nicht beim Preis");
  assert.doesNotMatch(karte, /Tarif-ID/);
});

/* ══════════ §7 — Leistungszeile nur aus belegten Feldern ══════════ */

const VERSICHERBAR = Object.freeze({ insuranceAvailable: true,
  insuranceDetails: Object.freeze({ isInsurable: true, selectionModel: "cover_value" }) });

test("(L1) Sendungsverfolgung, „Versicherung zubuchbar“, „Kein Labeldruck nötig“ — je nur mit Beleg", () => {
  assert.deepEqual(offerServiceLine({ trackingAvailable: true, ...VERSICHERBAR, labelHandling: "carrier_at_pickup" })
    .map((d) => d.id), ["tracking", "insurance", "labelAtPickup"]);
  assert.equal(SERVICE_LINE_TEXT.tracking, "Sendungsverfolgung");
  assert.equal(SERVICE_LINE_TEXT.insurance, "Versicherung zubuchbar");
  assert.equal(SERVICE_LINE_TEXT.labelAtPickup, "Kein Labeldruck nötig");
  // Ohne Beleg kein Eintrag: kein truthy-Schluss, keine Annahme.
  assert.deepEqual(offerServiceLine({}), []);
  assert.deepEqual(offerServiceLine({ trackingAvailable: "true", insuranceAvailable: "true", labelHandling: "customer" }), []);
  assert.deepEqual(offerServiceLine({ trackingAvailable: 1 }), []);
  assert.deepEqual(offerServiceLine(null), []);
  assert.deepEqual(offerServiceLine("pickup"), []);
  // Versicherbar heißt zubuchbar, nie inklusive.
  const texte = JSON.stringify(SERVICE_LINE_TEXT);
  assert.doesNotMatch(texte, /inklusive|inkl\.|enthalten|kostenlos|gratis|garant/i);
  // Die Karte zeigt die Zeile als Liste mit aria-hidden-Häkchen, nur wenn es Einträge gibt.
  const karte = code(KARTE);
  assert.match(karte, /const dienste = offerServiceLine\(t\);/);
  assert.match(karte, /\{dienste\.length > 0 && \(\s*<ul className="offer-services" aria-label="Leistungen">/);
  assert.match(karte, /<span className="offer-service-check" aria-hidden="true">/);
});

/* ══════════ §5.1 / E1 — Buchungsschluss und Preissatz ══════════ */

test("(S1) „buchbar bis“ nur mit belegter Uhrzeit und strikt `pickupToday === true`", () => {
  assert.equal(sameDayDeadlineText({ pickupToday: true, pickupTodayUntil: "16:45" }), "buchbar bis 16:45 Uhr");
  for (const t of [{ pickupToday: "true", pickupTodayUntil: "16:45" }, { pickupToday: 1, pickupTodayUntil: "16:45" },
                   { pickupToday: true }, { pickupToday: true, pickupTodayUntil: null },
                   { pickupToday: true, pickupTodayUntil: "später" }, { pickupToday: false, pickupTodayUntil: "16:45" },
                   null, undefined, "heute"]) {
    assert.equal(sameDayDeadlineText(t), null, JSON.stringify(t));
  }
  // Ohne beide Serverbeträge kein Preissatz — „keine Gebühr bekannt" ist kein Beleg für „keine Gebühr".
  assert.equal(sameDayPriceNote({ pickupToday: true, pickupTodayUntil: "16:45" }, "gross"), null);
  assert.equal(sameDayPriceNote(null, "net"), null);
});

/* ══════════ §7 — Shopabgabe ══════════ */

test("(D1) Abgabe: Satz zu den Öffnungszeiten in „Termin & Abholung“, ohne erfundene Uhrzeit", () => {
  assert.match(DROPOFF_OPENING_NOTE, /Öffnungszeiten des Paketshops/);
  assert.doesNotMatch(DROPOFF_OPENING_NOTE, /\d{1,2}:\d{2}|garant|JUMiNGO|Transglobal/i);
  const details = zwischen(code(KARTE), "function DetailsPanel", "function OfferCardBase");
  assert.match(details, /\{abholung\.handover === HANDOVER_DROPOFF && \(\s*<p className="offer-detail-note offer-dropoff-note">\{DROPOFF_OPENING_NOTE\}<\/p>/);
});

/* ══════════ §5.3 — abgelaufene Angebotsaussage ══════════ */

test("(X1) abgelaufen: keine Auszeichnung, keine Auswahl, „Angebote aktualisieren“ statt des Knopfs", () => {
  const karte = code(KARTE);
  const flaeche = karte.slice(karte.indexOf("function OfferCardBase"));
  assert.match(flaeche, /const unavailable = !offerSelectableFor\(t, selectionStage\) \|\| abgelaufen;/);
  assert.match(flaeche, /const unavailableText = abgelaufen \? OFFER_REFRESH_TEXT\.status : offerBlockedLabel\(t\);/);
  assert.match(flaeche, /const mitAktualisieren = abgelaufen && typeof onRefresh === "function";/);
  // Der Aktualisieren-Knopf wählt und bucht nichts: er ruft nur die erneute Abfrage.
  const aktualisieren = zwischen(flaeche, "const handleRefresh = (e) => {", "};");
  assert.match(aktualisieren, /if \(typeof onRefresh === "function"\) onRefresh\(\);/);
  assert.doesNotMatch(aktualisieren, /onBook|onSelect/);
  assert.match(flaeche, /onClick=\{handleRefresh\}[\s\S]{0,160}\{OFFER_REFRESH_TEXT\.action\}/);
  assert.match(OFFER_REFRESH_TEXT.action, /aktualisieren/i);
});

test("(X2) die Liste: EIN Zeitgeber, abgelaufene Auswahl wird aufgehoben, ein Hinweis mit role=status", () => {
  const liste = code(LISTE);
  assert.match(liste, /const aktualitaet = useOfferRefresh\(tariffs, \{ quotedAt, receivedAtMs \}\);/);
  assert.equal((liste.match(/useOfferRefresh\(/g) || []).length, 1, "mehr als ein Zeitgeber");
  assert.match(liste, /if \(selected && istAbgelaufen\(selected\) && typeof onSelect === "function"\) onSelect\(null\);/);
  assert.match(liste, /expired=\{istAbgelaufen\(t\)\}/);
  assert.match(liste, /className="alert alert-info offers-refresh-notice" role="status" aria-live="polite"/);
  // Kein Polling: weder Intervall noch eigener Abruf in Liste oder Karte.
  for (const datei of [LISTE, KARTE]) assert.doesNotMatch(code(datei), /setInterval|fetch\(/, datei);
});

/* ══════════ §5.3 — `quotedAt` im gespeicherten Vorgang ══════════ */

test("(Q1) `quotedAt`: nur ein lesbarer ISO-Zeitpunkt bleibt, ohne Angebote keiner, nicht im Fingerabdruck", () => {
  assert.equal(emptyScope("shipment").quotedAt, null);
  assert.equal(normalizeScope({ quotedAt: "2026-11-20T15:10:00.000Z" }, "shipment").quotedAt, "2026-11-20T15:10:00.000Z");
  for (const roh of [null, undefined, "", "gestern", 1763651400000, {}, "2".repeat(41)]) {
    assert.equal(normalizeScope({ quotedAt: roh }, "calculator").quotedAt, null, JSON.stringify(roh));
  }
  assert.equal(dropOffers({ ...emptyScope("shipment"), quotedAt: "2026-11-20T15:10:00.000Z" }).quotedAt, null);
  const basis = { step: "offers", shipment: emptyScope("shipment"), calculator: emptyScope("calculator"), booking: null };
  const mitZeit = { ...basis, shipment: { ...basis.shipment, quotedAt: "2026-11-20T15:10:00.000Z" } };
  assert.equal(flowFingerprint(mitZeit), flowFingerprint(basis), "eine neue Serverzeit löst eine Spiegelschleife aus");
});

/* ══════════ FE-8 — Kundenservice-Karte ══════════ */

test("(K1) die Kundenservice-Karte überdeckt keine Angebotsaktion: die Liste fordert die kleine Form an", () => {
  const liste = code(LISTE);
  assert.match(liste, /import \{ useAnsprechKarteKompakt \} from "\.\.\/layout\/AccountManagerCard";/);
  // Erste Anweisung der Liste — unbedingt, also keine Hook-Reihenfolge, die von Daten abhängt.
  assert.match(liste, /export function OffersList\(\{[\s\S]*?\n\}\) \{\s*useAnsprechKarteKompakt\(\);/);
  // Beide Seiten hängen die Liste nur mit Ergebnissen oder beim Laden ein: die Anforderung gilt genau auf dem
  // Angebotsschritt und endet mit ihm (wie auf der Erfolgsseite).
  for (const seite of ["pages/NewShipmentPage.jsx", "pages/CalculatorPage.jsx"]) {
    assert.match(code(seite), /\{\(hasResults \|\| loading\) && \(\s*<div ref=\{offersRef\}[^>]*>[\s\S]{0,400}?<OffersList/, seite);
  }
  assert.match(code("components/booking/BookingSuccessStep.jsx"), /useAnsprechKarteKompakt\(\);/);
});
