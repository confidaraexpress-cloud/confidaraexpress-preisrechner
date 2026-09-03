/* Paket 2.3 — gemischte Angebote in der Oberfläche.
   Kein Netz, kein Browser, keine Buchung.

   Vier Fragen:
     1. Bleiben zwei Angebote mit numerisch gleicher Provider-ID zwei Angebote?
     2. Wird ein nur-Preisauskunft-Angebot wirklich gesperrt dargestellt?
     3. Verschwindet der Einkaufsprovider aus allem Sichtbaren?
     4. Rechnet die Oberfläche irgendwo selbst einen Preis? */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { offerKey, sameOffer, offerBlocked, offerBlockedLabel, OFFER_BLOCKED_FALLBACK }
  from "./offerIdentity.mjs";
import { assignBadges } from "./offerBadges.js";

const wurzel     = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies       = (p) => fs.readFileSync(path.join(wurzel, p), "utf8");
const offersList = lies("components/offers/OffersList.jsx");
const offerCard  = lies("components/offers/OfferCard.jsx");
const badges     = lies("utils/offerBadges.js");

// Ein JUMiNGO-Angebot, wie es die Route liefert (gekürzt auf das Gelesene).
const jumingo = (over = {}) => ({
  offerId: "1".repeat(32), id: 23, shipper_tariff_id: 3712,
  publicCarrierId: "ups", publicCarrierName: "UPS", publicServiceName: "Expressversand",
  netPrice: 24, vatAmount: 4.56, finalPrice: 28.56, currency: "EUR",
  serviceType: "pickup", transitDaysMin: 1, transitDaysMax: 2,
  deliveryDate: "2026-09-06", deliveryDateMin: "2026-09-06", deliveryDateMax: "2026-09-07",
  availableForDate: true, bookable: true, unavailableReason: null, ...over,
});

// Ein Transglobal-Angebot: EXAKT die fünfzehn Felder der Allowlist-Projektion.
const transglobal = (over = {}) => ({
  offerId: "2".repeat(32),
  publicCarrierId: "ups", publicServiceName: "Expressversand", serviceType: "pickup",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  transitDaysMin: null, transitDaysMax: null,
  netPrice: 156, vatAmount: 29.64, finalPrice: 185.64, currency: "EUR",
  bookable: false, unavailableReason: "quote_only", ...over,
});

/* ── 1. Identität ─────────────────────────────────────────────────────────── */

test("1 — zwei Angebote mit numerisch gleicher Provider-ID sind ZWEI Angebote", () => {
  const j = jumingo({ id: 23 });
  // Dasselbe Angebot, wie es aus der zweiten Quelle käme: dort ist 23 eine ServiceID.
  const t = transglobal();
  assert.notEqual(offerKey(j), offerKey(t));
  assert.equal(sameOffer(j, t), false);
});

test("2 — ohne Identität gilt NICHTS als dasselbe Angebot", () => {
  // Das ist die eigentliche Falle: `undefined === undefined` ist true. Ein Angebot ohne
  // jede Kennung darf trotzdem nie als „ausgewählt" oder „gleich" gelten.
  assert.equal(offerKey({}), null);
  assert.equal(sameOffer({}, {}), false);
  assert.equal(sameOffer(null, null), false);
  assert.equal(sameOffer(null, jumingo()), false);
});

test("3 — die offerId hat Vorrang, die Tarif-ID ist nur Rückfall", () => {
  assert.equal(offerKey({ offerId: "a".repeat(32), id: 23 }), "a".repeat(32));
  assert.equal(offerKey({ id: 23 }), "t:23");
  assert.equal(offerKey({ id: "s-3712" }), "t:s-3712", "die Shop-Variantenkennung ging verloren");
  assert.equal(offerKey({ offerId: "   " , id: 7 }), "t:7", "Leerraum galt als Kennung");
});

test("4 — die Liste benutzt die Identität für Key, Badge UND Auswahl", () => {
  assert.match(offersList, /key=\{offerKey\(t\)/);
  assert.match(offersList, /badge=\{badges\.get\(offerKey\(t\)\)/);
  assert.match(offersList, /selected=\{sameOffer\(selected, t\)\}/);
  assert.ok(!/selected\?\.id === t\.id/.test(offersList), "der alte Auswahlvergleich steht noch da");
  assert.ok(!/key=\{t\.id\}/.test(offersList), "der alte React-Key steht noch da");
});

test("5 — die Karte bildet ihre DOM-Kennung aus der Identität", () => {
  assert.match(offerCard, /const detailsId = `offer-details-\$\{offerKey\(t\)/);
  assert.ok(!/offer-details-\$\{t\.id\}/.test(offerCard),
    "mehrere Angebote ohne id trügen wieder denselben Knotennamen");
});

/* ── 2. Buchbarkeit ───────────────────────────────────────────────────────── */

test("6 — beide Sperrgründe sperren, ein fehlendes Feld nicht", () => {
  assert.equal(offerBlocked(transglobal()), true, "eine Preisauskunft wurde als buchbar gelesen");
  assert.equal(offerBlocked(jumingo({ availableForDate: false })), true);
  assert.equal(offerBlocked(jumingo()), false);
  // Der entscheidende Fall: eine Antwort aus einem älteren Bundle kennt `bookable` nicht.
  assert.equal(offerBlocked({ netPrice: 5 }), false, "ein fehlendes Feld hat gesperrt");
  assert.equal(offerBlocked({ bookable: undefined }), false);
});

test("7 — der Grund wird übersetzt, nie durchgereicht", () => {
  assert.equal(offerBlockedLabel(transglobal()), "Derzeit nicht direkt buchbar");
  assert.equal(offerBlockedLabel(jumingo({ availableForDate: false })), "Nicht verfügbar für dieses Datum");
  // Unbekannter Grund → neutraler Satz. Nie der Rohwert.
  const roh = "provider_specific_internal_code";
  assert.equal(offerBlockedLabel({ bookable: false, unavailableReason: roh }), OFFER_BLOCKED_FALLBACK);
  assert.ok(!OFFER_BLOCKED_FALLBACK.includes(roh));
  // Das Datum ist die konkretere Aussage und hat Vorrang.
  assert.equal(offerBlockedLabel({ availableForDate: false, bookable: false, unavailableReason: "quote_only" }),
    "Nicht verfügbar für dieses Datum");
});

test("8 — ein gesperrtes Angebot navigiert nicht und bekommt keinen Folgeschritt", () => {
  // Auswahl und Buchung hängen beide am selben Zustand …
  assert.match(offerCard, /const handleSelect = \(\) => \{ if \(!unavailable\) onSelect\(t\); \};/);
  assert.match(offerCard, /if \(!unavailable\)[\s\S]{0,80}onBook\(t\)/);
  assert.match(offerCard, /disabled=\{unavailable\}/);
  // … und der Paketshop-Finder erscheint dort ebenfalls nicht.
  assert.match(offerCard, /\{!unavailable && <ParcelShopFinderTrigger/);
});

test("9 — kein Badge auf einem gesperrten Angebot, aus welchem Grund auch immer", () => {
  const m = assignBadges([transglobal({ netPrice: 1, transitDaysMax: 1, transitDaysMin: 1 }),
                          jumingo({ netPrice: 20, transitDaysMax: 3, transitDaysMin: 2 }),
                          jumingo({ offerId: "3".repeat(32), id: 29, netPrice: 12, transitDaysMax: 4, transitDaysMin: 3 })]);
  assert.equal(m.has("2".repeat(32)), false, "das gesperrte Angebot trägt ein Badge");
  assert.equal(m.get("3".repeat(32))?.key, "cheapest");
});

/* ── 3. White Label ───────────────────────────────────────────────────────── */

test("10 — kein Einkaufsprovider im sichtbaren Text der Angebotsflächen", () => {
  // Gemessen wird der CODE ohne Kommentare: das White-Label-Gebot schützt, was der Kunde
  // sieht — interne Entwicklernotizen sind davon ausdrücklich ausgenommen, und die Karte
  // trägt seit jeher Kommentare, die die Herkunft eines Feldes erklären. Ein Test, der die
  // mitzählt, misst die falsche Sache und wird beim nächsten erklärenden Satz rot.
  const ohneKommentar = (q) => q
    .replace(/\/\*[\s\S]*?\*\//g, "")   // Blockkommentare, auch die in JSX
    .split("\n").map((z) => z.replace(/(^|\s)\/\/.*$/, "")).join("\n");
  for (const [name, quelle] of [["OffersList", offersList], ["OfferCard", offerCard],
                                ["offerBadges", badges], ["offerIdentity", lies("utils/offerIdentity.mjs")]]) {
    const klein = ohneKommentar(quelle).toLowerCase();
    for (const wort of ["jumingo", "transglobal"]) {
      assert.ok(!klein.includes(wort), `„${wort}" steht im Code von ${name}`);
    }
  }
  // Gegenprobe, dass die Kommentarentfernung nicht alles wegwirft.
  assert.ok(ohneKommentar(offerCard).includes("offer-cta-btn"), "die Messung hat den Code mit entfernt");
});

test("11 — die Übersetzungstabelle nennt keinen Provider und keinen Rohcode", () => {
  const quelle = lies("utils/offerIdentity.mjs").toLowerCase();
  for (const wort of ["jumingo", "transglobal", "provider a", "provider b", "anbieter a"]) {
    assert.ok(!quelle.includes(wort), `„${wort}" steht in der Übersetzung`);
  }
});

/* ── 4. Preise ────────────────────────────────────────────────────────────── */

test("12 — die Oberfläche rechnet KEINEN Preis, auch nicht für das zweite Angebot", () => {
  for (const [name, quelle] of [["OfferCard", offerCard], ["OffersList", offersList]]) {
    assert.ok(!/\*\s*1\.19|\*\s*0\.19|\/\s*1\.19/.test(quelle), `${name} rechnet MwSt.`);
    assert.ok(!/netPrice\s*\+\s*vatAmount/.test(quelle), `${name} addiert den Bruttopreis selbst`);
  }
  // Der Umschalter wählt einen gelieferten Betrag aus, er bildet keinen.
  assert.match(offerCard, /vatMode === "gross"[\s\S]{0,120}money\(t\.finalPrice/);
});

test("13 — der Preis eines gesperrten Angebots bleibt sichtbar", () => {
  // Ein Angebot, das man nicht auswählen kann, ist trotzdem eine Preisauskunft — genau
  // dafür ist es da. Die Preiszeile hängt am Betrag, nicht am Sperrzustand.
  assert.match(offerCard, /\{t\.netPrice != null \? \(/);
  const preisBlock = offerCard.slice(offerCard.indexOf("{t.netPrice != null ? ("),
                                    offerCard.indexOf("offer-cta-btn"));
  assert.ok(!/unavailable/.test(preisBlock), "die Preisanzeige hängt am Sperrzustand");
});
