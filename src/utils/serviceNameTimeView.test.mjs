// ─── Uhrzeit im sichtbaren Servicenamen — rein visuelle Hervorhebung ─────────
//
// Betreiberentscheidung 2026-10-03: eine BEREITS im Servicenamen sichtbare frühe
// Uhrzeit („Express 9:00“) darf grün erscheinen. Diese Datei hält fest, dass das
// ausschließlich Darstellung bleibt: derselbe Text, keine Zustellzeit, kein
// Filter, keine Sortierung, keine Buchung — und dieselbe Grünfamilie wie das
// Frühzeit-Hinweisfeld.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pruefeImTestlauf } from "../../scripts/governance.mjs";
import { serviceNameSegments } from "./serviceNameTimeView.mjs";
import { FRUEHZUSTELLUNG_GRENZE_MINUTEN, earlyDeliveryNote } from "./deliveryTimeView.mjs";
import { deliveryDeadlineAssessment } from "./offersFilterView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HIER, "..");
const lies = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (q) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const zusammen = (segmente) => segmente.map((s) => s.text).join("");
const zeiten = (segmente) => segmente.filter((s) => s.time).map((s) => s.text);

/* ══════════ Z) Zerlegung — derselbe Text, nur die frühe Uhrzeit markiert ══════════ */

test("Z1 — die sichtbare Uhrzeit der Zeitprodukte wird markiert, der Text bleibt zeichengleich", () => {
  for (const [name, zeit] of [
    ["Express 9:00", "9:00"], ["Express 10:00", "10:00"], ["Express 12:00", "12:00"],
    ["Domestic Express 9:00", "9:00"], ["Domestic Express 10:30", "10:30"], ["Domestic Express 12:00", "12:00"],
  ]) {
    const s = serviceNameSegments(name);
    assert.equal(zusammen(s), name, `${name}: der Text wurde verändert`);
    assert.deepEqual(zeiten(s), [zeit], name);
  }
  // Nichts wird ergänzt oder umformatiert: kein „Uhr“, kein „bis“, keine führende Null.
  assert.deepEqual(serviceNameSegments("Express 9:00"),
    [{ text: "Express ", time: false }, { text: "9:00", time: true }]);
});

test("Z2 — ohne Uhrzeit bleibt der Name ein einziges neutrales Segment", () => {
  for (const name of ["Standardversand", "Expressversand", "Economy Select", "Pick&Ship", "Domestic Express"]) {
    assert.deepEqual(serviceNameSegments(name), [{ text: name, time: false }], name);
  }
});

test("Z3 — nur eine FRÜHE Uhrzeit wird markiert — dieselbe Grenze wie das Frühzeit-Hinweisfeld", () => {
  assert.equal(FRUEHZUSTELLUNG_GRENZE_MINUTEN, 900);
  assert.deepEqual(zeiten(serviceNameSegments("Express 14:59")), ["14:59"]);
  for (const name of ["Express 15:00", "Express 18:00", "Express 23:59"]) {
    const s = serviceNameSegments(name);
    assert.deepEqual(zeiten(s), [], `${name}: eine Tagesendzeit wird hervorgehoben`);
    assert.equal(zusammen(s), name);
  }
});

test("Z4 — keine Scheintreffer: lange Zahlen, ungültige Zeiten und Sekundenangaben bleiben Text", () => {
  for (const name of ["Express 123:45", "Express 9:005", "Express 24:00", "Express 9:60", "Paket 1:2", "Express 9:00:00"]) {
    const s = serviceNameSegments(name);
    assert.deepEqual(zeiten(s), [], name);
    assert.equal(zusammen(s), name, name);
  }
});

test("Z5 — leere und fremde Eingaben ergeben keine Segmente", () => {
  for (const v of [null, undefined, "", 12, {}, []]) assert.deepEqual(serviceNameSegments(v), [], String(v));
});

test("Z6 — Text vor und nach der Uhrzeit bleibt vollständig erhalten", () => {
  assert.deepEqual(serviceNameSegments("Express 9:00 Termin"), [
    { text: "Express ", time: false }, { text: "9:00", time: true }, { text: " Termin", time: false },
  ]);
  assert.deepEqual(serviceNameSegments("10:30 Express"), [
    { text: "10:30", time: true }, { text: " Express", time: false },
  ]);
});

/* ══════════ R) Reine Darstellung — keine fachliche Wirkung ══════════ */

test("R1 — nur die Tarifkarte liest das Modul: kein Filter, keine Sortierung, keine Auszeichnung, keine Buchung", () => {
  const treffer = [];
  const lauf = (rel) => {
    for (const e of readdirSync(path.join(SRC, rel), { withFileTypes: true })) {
      const p = path.join(rel, e.name);
      if (e.isDirectory()) { lauf(p); continue; }
      if (!/\.(jsx|js|mjs)$/.test(e.name) || /\.test\.mjs$/.test(e.name)) continue;
      if (/serviceNameTimeView/.test(ohneKommentare(lies(p)))) treffer.push(p.split(path.sep).join("/"));
    }
  };
  lauf(".");
  assert.deepEqual(treffer, ["components/offers/OfferCard.jsx"]);
});

test("R2 — aus dem Namen entsteht keine Zustellzeit: Hinweisfeld und Lieferzeitfilter bleiben unberührt", () => {
  const tg = { publicServiceName: "Domestic Express 9:00", deliveryDate: null, deliveryDateMax: null };
  // Das grüne Hinweisfeld hängt weiter allein an den Lieferzeitfeldern des Angebots.
  assert.equal(earlyDeliveryNote(tg), "");
  // Der Lieferzeitfilter bewertet das Angebot unverändert als „nicht bewertbar“ (K2).
  assert.equal(deliveryDeadlineAssessment(tg, { latestDeliveryDate: "2026-10-05", latestDeliveryTime: "10:00" }),
    "not_assessable");
  // Und das Modul selbst kennt weder Lieferzeitfelder noch Provider, Carrier oder ServiceIDs.
  const modul = ohneKommentare(lies("utils/serviceNameTimeView.mjs"));
  for (const verboten of ["deliveryTimeUntil", "deliveryDate", "shippingMode", "provider", "serviceId", "publicCarrierId"]) {
    assert.ok(!modul.includes(verboten), `das Modul liest „${verboten}“`);
  }
});

test("R3 — die Karte rendert den Servicenamen über die Segmente; die Uhrzeit trägt nur eine Klasse", () => {
  const karte = ohneKommentare(lies("components/offers/OfferCard.jsx"));
  assert.match(karte, /serviceNameSegments\(publicServiceName\(t\)\)/);
  assert.match(karte, /<span key=\{i\} className="offer-service-time">\{s\.text\}<\/span>/);
  // Das Frühzeit-Hinweisfeld liest weiter ausschließlich die Lieferzeitfelder.
  assert.match(karte, /const earlyNote = earlyDeliveryNote\(t\);/);
});

/* ══════════ G) Gestaltung — dieselbe Grünfamilie, lesbar ══════════ */

const luminanz = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const kontrast = (a, b) => {
  const [l1, l2] = [luminanz(a), luminanz(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};

test("G1 — dieselbe Grünfamilie wie das Frühzeit-Hinweisfeld, kein freier Farbwert", () => {
  const css = lies("styles/offers.css").replace(/\/\*[\s\S]*?\*\//g, "");
  const zeit = css.match(/\.offer-service-time\s*\{([^}]*)\}/);
  assert.ok(zeit, ".offer-service-time fehlt");
  assert.match(zeit[1], /color:\s*var\(--ce-color-status-success-fg\)/);
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(zeit[1]), "freier Farbwert");
  const hinweis = css.match(/\.offer-early-note\s*\{([^}]*)\}/);
  assert.match(hinweis[1], /color:\s*var\(--ce-color-status-success-fg\)/, "das Hinweisfeld nutzt eine andere Grünstufe");
});

test("G2 — die grüne Uhrzeit hält WCAG AA auf der Karte und auf der ausgewählten Karte", () => {
  const vars = lies("styles/variables.css");
  const wert = (name) => vars.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  const gruen = wert("ce-color-status-success-fg");
  for (const flaeche of ["ce-color-surface", "ce-color-brand-soft"]) {
    const k = kontrast(gruen, wert(flaeche));
    assert.ok(k >= 4.5, `${flaeche}: Kontrast ${k.toFixed(2)}:1 unter 4,5:1`);
  }
});

test("Q — diese Testdatei läuft im Unit-Testlauf mit", () => {
  pruefeImTestlauf("src/utils/serviceNameTimeView.test.mjs");
});
