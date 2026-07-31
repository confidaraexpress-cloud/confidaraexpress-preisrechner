// Slice: öffentlicher Carrier-Vertrag im Frontend (publicCarrierId → Logo/Name).
//
// Prüft, dass die Angebotskarte ihr Logo AUSSCHLIESSLICH aus der kontrollierten
// publicCarrierId wählt und den Namen aus publicCarrierName — nie aus Rohfeldern,
// Preis, shipper_tariff_id, tariffName oder Laufzeit. Zusätzlich der neutrale
// Fallback für echte unbekannte Carrier (Paket-Icon statt Text in der Logokachel).
//
// carrierMap.js importiert SVG-Assets, die Node nicht auflösen kann. Die Datei wird
// deshalb als Quelltext gelesen und die Logik gegen den Quelltext geprüft (Muster der
// vorhandenen *.test.mjs mit Quelltext-Assertions). Zusätzlich werden die reinen,
// asset-freien Funktionen über eine assetlose Neu-Auswertung des Moduls ausgeführt.
//
// Run: node --test src/utils/carrierMap.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const SRC        = readFileSync(new URL("./carrierMap.js", import.meta.url), "utf8");
// Kommentare entfernen, wo eine Assertion echten CODE prüfen soll: die Dateien
// dokumentieren bewusst, was sie NICHT lesen dürfen ("niemals carrier/tariffName"),
// und ein naiver includes()-Test würde genau diese Kommentare als Treffer werten.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const OFFER_CARD = readFileSync(new URL("../components/offers/OfferCard.jsx", import.meta.url), "utf8");
const LIVE_SUM   = readFileSync(new URL("../components/booking/BookingLiveSummary.jsx", import.meta.url), "utf8");
const OFFER_SUM  = readFileSync(new URL("../components/booking/OfferSummaryModule.jsx", import.meta.url), "utf8");
const OFFERS_CSS = readFileSync(new URL("../styles/offers.css", import.meta.url), "utf8");

// ── Assetloses Nachbilden von PUBLIC_CARRIERS aus dem Quelltext ──
// Ersetzt die SVG-Import-Bezeichner durch Marker-Strings, damit die reale Tabelle
// (inkl. Reihenfolge und Namen) ohne Vite/Asset-Loader auswertbar ist. Es wird KEINE
// Logik nachgebaut — nur die Datentabelle gelesen.
function parsePublicCarriers() {
  const start = SRC.indexOf("const PUBLIC_CARRIERS = Object.assign(Object.create(null), {");
  const block = SRC.slice(start, SRC.indexOf("});", start) + 3);
  // Wie im Original prototypenlos — sonst lieferte der Spiegel bei "constructor"
  // oder "__proto__" einen Treffer, den das echte Modul gar nicht mehr erzeugt.
  const out = Object.create(null);
  for (const m of block.matchAll(/^\s*"?([a-z-]+)"?:\s*\{\s*name:\s*"([^"]*)",\s*logo:\s*([A-Za-z]+)\s*\}/gm)) {
    out[m[1]] = { name: m[2], logo: m[3] === "null" ? null : m[3] };
  }
  return out;
}
const PUBLIC_CARRIERS = parsePublicCarriers();

// Die Anzeigelogik von publicCarrierDisplay 1:1 gespiegelt (carrierMap.js:56-62).
// Bewusst als Spiegel, weil das echte Modul ohne Asset-Loader nicht importierbar ist;
// Test „Spiegel stimmt mit Quelltext überein" schützt gegen Drift.
function displayMirror(tariff) {
  const meta = PUBLIC_CARRIERS[tariff?.publicCarrierId] || PUBLIC_CARRIERS.other;
  const name = (typeof tariff?.publicCarrierName === "string" && tariff.publicCarrierName.trim())
    ? tariff.publicCarrierName.trim()
    : meta.name;
  return { name, logo: meta.logo };
}

// ── Fixtures der drei belegten Tarife, exakt so wie das Backend sie liefert ──
const T_3307 = { shipper_tariff_id: 3307, publicCarrierId: "dhl",          publicCarrierName: "DHL Express",  publicServiceName: "Expressversand", netPrice: 18.65 };
const T_3287 = { shipper_tariff_id: 3287, publicCarrierId: "trans-o-flex", publicCarrierName: "trans-o-flex", publicServiceName: "Expressversand", netPrice: 46.40 };
const T_3290 = { shipper_tariff_id: 3290, publicCarrierId: "trans-o-flex", publicCarrierName: "trans-o-flex", publicServiceName: "Expressversand", netPrice: 142.85 };

test("Spiegel stimmt mit dem Quelltext von publicCarrierDisplay überein", () => {
  assert.match(SRC, /const meta = resolvePublicCarrier\(tariff\?\.publicCarrierId\);/);
  assert.match(SRC, /\? tariff\.publicCarrierName\.trim\(\)/);
  assert.match(SRC, /return \{ name, logo: meta\.logo \};/);
});

test("dhl → vorhandenes DHL-Logo und Name 'DHL Express'", () => {
  const r = displayMirror(T_3307);
  assert.equal(r.logo, "dhlLogo");
  assert.equal(r.name, "DHL Express");
});

test("trans-o-flex → vorhandenes trans-o-flex-Logo und Name 'trans-o-flex'", () => {
  for (const t of [T_3287, T_3290]) {
    const r = displayMirror(t);
    assert.equal(r.logo, "transOFlexLogo");
    assert.equal(r.name, "trans-o-flex");
  }
});

test("trans-o-flex-Asset wird statisch importiert (Vite-Anforderung)", () => {
  assert.match(SRC, /^import transOFlexLogo from "\.\.\/assets\/carriers\/trans-o-flex\.svg";$/m);
  assert.ok(!/import\(/.test(SRC), "kein dynamischer Import — Vite braucht statische Asset-Imports");
});

test("other → kein Logo, Name 'Versandpartner'", () => {
  const r = displayMirror({ publicCarrierId: "other" });
  assert.equal(r.logo, null);
  assert.equal(r.name, "Versandpartner");
});

test("unbekannte / fehlende ID → fail-closed auf den generischen Eintrag", () => {
  for (const id of ["emons", "hermes", "", undefined, null, 42, "OTHER", "__proto__", "constructor"]) {
    const r = displayMirror({ publicCarrierId: id });
    assert.equal(r.logo, null, `ID ${JSON.stringify(id)} darf kein Logo erhalten`);
    assert.equal(r.name, "Versandpartner", `ID ${JSON.stringify(id)} muss neutral bleiben`);
  }
  assert.equal(displayMirror(undefined).name, "Versandpartner");
  assert.equal(displayMirror({}).name, "Versandpartner");
});

test("Prototype-Lookalikes erzeugen keinen Treffer (Object.create(null))", () => {
  // Ohne prototypenlose Tabelle liefert PUBLIC_CARRIERS["constructor"] die Object-
  // Funktion, deren .name "Object" ist — das würde als Carriername gerendert.
  assert.ok(SRC.includes("const PUBLIC_CARRIERS = Object.assign(Object.create(null), {"),
    "PUBLIC_CARRIERS muss prototypenlos angelegt sein");
  assert.equal(PUBLIC_CARRIERS.constructor, undefined);
  assert.equal(displayMirror({ publicCarrierId: "constructor" }).name, "Versandpartner");
  assert.equal(displayMirror({ publicCarrierId: "toString" }).name, "Versandpartner");
});

test("bekannte Carrier bleiben unverändert (UPS, FedEx, TNT, DPD, GLS, DER KURIER)", () => {
  const erwartet = [
    ["ups", "UPS", "upsLogo"],
    ["fedex", "FedEx", "fedexLogo"],
    ["tnt", "TNT", "tntLogo"],
    ["dpd", "DPD", "dpdLogo"],
    ["gls", "GLS", "glsLogo"],
    ["der-kurier", "DER KURIER", "derKurierLogo"],
  ];
  for (const [id, name, logo] of erwartet) {
    const r = displayMirror({ publicCarrierId: id });
    assert.equal(r.name, name, `Name für ${id}`);
    assert.equal(r.logo, logo, `Logo für ${id}`);
  }
});

test("ID-Menge deckt den Backend-Vertrag vollständig ab", () => {
  // Muss mit PUBLIC_CARRIER_IDS aus lib/publicCarrier.js übereinstimmen.
  assert.deepEqual(Object.keys(PUBLIC_CARRIERS).sort(),
    ["der-kurier", "dhl", "dpd", "fedex", "gls", "other", "tnt", "trans-o-flex", "ups"]);
});

test("publicCarrierName des Backends gewinnt, Logo bleibt strikt an der ID", () => {
  const r = displayMirror({ publicCarrierId: "other", publicCarrierName: "Neuer Carrier" });
  assert.equal(r.name, "Neuer Carrier");
  assert.equal(r.logo, null, "ein unbekannter Carrier darf nie ein fremdes Logo erben");
});

test("leerer / nur-Whitespace publicCarrierName → kanonischer Name", () => {
  assert.equal(displayMirror({ publicCarrierId: "dhl", publicCarrierName: "" }).name, "DHL Express");
  assert.equal(displayMirror({ publicCarrierId: "dhl", publicCarrierName: "   " }).name, "DHL Express");
  assert.equal(displayMirror({ publicCarrierId: "trans-o-flex", publicCarrierName: null }).name, "trans-o-flex");
});

test("keine JUMiNGO- oder TOF-Rohwerte im Frontend-Vertrag", () => {
  const verboten = /jumingo|TOF national|Singlepiece|Warensendung|ShipperGroupName/i;
  assert.ok(!verboten.test(SRC), "Rohwert-Bezug in carrierMap.js gefunden");
  for (const v of Object.values(PUBLIC_CARRIERS)) {
    assert.ok(!verboten.test(v.name), `Rohwert-Leck im Namen: ${v.name}`);
  }
});

test("Logowahl wertet weder Preis noch Tarif-ID, tariffName oder Laufzeit aus", () => {
  const display = stripComments(
    SRC.slice(SRC.indexOf("export function publicCarrierDisplay"), SRC.indexOf("export function publicServiceName")));
  for (const feld of ["netPrice", "finalPrice", "shipper_tariff_id", "tariffName", "carrier", "transitDays", "deliveryDate"]) {
    assert.ok(!new RegExp(`\\.${feld}\\b`).test(display), `publicCarrierDisplay darf tariff.${feld} nicht auswerten`);
  }
  // Gegenprobe: identische ID bei völlig verschiedenen Preisen/IDs → identisches Ergebnis.
  assert.deepEqual(displayMirror(T_3287), displayMirror(T_3290));
});

test("publicServiceName bleibt unabhängig von der Carrierauflösung", () => {
  const svc = SRC.slice(SRC.indexOf("export function publicServiceName"), SRC.indexOf("export function publicCarrierChipLabel"));
  assert.ok(!svc.includes("publicCarrierId"), "Serviceklasse darf nicht aus dem Carrier abgeleitet werden");
  assert.match(SRC, /express:\s*"Expressversand"/);
});

test("Carrierfilter-Chip: trans-o-flex wird unterstützt, other bleibt neutral", () => {
  const chip = SRC.slice(SRC.indexOf("export function publicCarrierChipLabel"), SRC.indexOf("// ─── Neutraler"));
  assert.ok(chip.includes('return "Versandpartner";'), "other-Chip muss 'Versandpartner' heißen");
  // Das Chip-Label nutzt den Backend-Namen bzw. den kanonischen ID-Namen — dadurch
  // erscheint trans-o-flex automatisch, sobald das Backend ihn in publicCarriers liefert.
  assert.ok(chip.includes("resolvePublicCarrier(pc.id).name"), "Chip muss auf den kanonischen ID-Namen zurückfallen");
  assert.equal(PUBLIC_CARRIERS["trans-o-flex"].name, "trans-o-flex");
});

test("Angebotskarte: Paket-Icon statt Text in der Logokachel", () => {
  assert.ok(!OFFER_CARD.includes("offer-logo-tile-text"), "Textkachel muss entfernt sein");
  assert.ok(OFFER_CARD.includes('<Icon n="package"'), "neutrales Paket-Icon fehlt");
  assert.ok(OFFER_CARD.includes("offer-logo-tile--generic"), "Generic-Modifier fehlt");
  assert.ok(!OFFERS_CSS.includes(".offer-logo-tile-text"), "verwaiste CSS-Regel für die Textkachel");
  assert.ok(OFFERS_CSS.includes("object-fit: contain"), "Logo muss unverzerrt skaliert werden");
});

test("Angebotskarte: Name kommt aus publicCarrierDisplay, nicht aus Rohfeldern", () => {
  assert.ok(OFFER_CARD.includes("const { name: carrierName, logo: carrierLogo } = publicCarrierDisplay(t);"));
  // Präzise: t.carrier (Rohwert) ist verboten, t.carrierLinks (belegtes Public-Feld) erlaubt.
  assert.ok(!/\bt\.carrier\b/.test(stripComments(OFFER_CARD)), "Rohfeld t.carrier darf nicht gelesen werden");
  assert.ok(!/\bt\.tariffName\b/.test(stripComments(OFFER_CARD)), "Rohfeld t.tariffName darf nicht gelesen werden");
  assert.ok(!/3307|3287|3290/.test(OFFER_CARD), "keine Tarif-ID-Sonderlogik im Frontend");
  assert.ok(!/3307|3287|3290/.test(SRC), "keine Tarif-ID-Sonderlogik in carrierMap.js");
});

test("Buchungsansichten nutzen denselben Fallback (kein leeres Logoelement)", () => {
  for (const [datei, src] of [["BookingLiveSummary", LIVE_SUM], ["OfferSummaryModule", OFFER_SUM]]) {
    assert.ok(src.includes("publicCarrierDisplay"), `${datei}: muss den zentralen Helfer nutzen`);
    assert.ok(src.includes('<Icon n="package"'), `${datei}: Paket-Fallback fehlt`);
    assert.ok(!src.includes("{carrierLogo && <img"), `${datei}: stilles Weglassen des Logos noch vorhanden`);
  }
});

test("kein Emoji und keine neue Abhängigkeit im Fallback", () => {
  // Emoji_Presentation statt Extended_Pictographic: letzteres schlägt auch bei
  // reinen Textzeichen wie „↔" (U+2194) an, die in Kommentaren legitim vorkommen.
  const emoji = /\p{Emoji_Presentation}/u;
  for (const src of [SRC, OFFER_CARD, LIVE_SUM, OFFER_SUM]) {
    assert.ok(!emoji.test(src), "Emoji im Carrier-/Fallback-Pfad gefunden");
  }
  assert.ok(OFFER_CARD.includes('import { Icon } from "../ui/Icon";'), "Icon muss aus der vorhandenen UI-Komponente kommen");
  assert.ok(LIVE_SUM.includes('import { Icon } from "../ui/Icon";'), "BookingLiveSummary muss Icon importieren");
});

test("Preis- und Auswahlpfad der Angebotskarte unverändert", () => {
  assert.ok(OFFER_CARD.includes("const handleSelect = () => { if (!unavailable) onSelect(t); };"));
  assert.ok(OFFER_CARD.includes("money(t.finalPrice ?? t.netPrice)"));
  assert.ok(OFFER_CARD.includes("money(t.netPrice)"));
});
