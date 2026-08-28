/* Die späteste Lieferzeit ist eine KUNDENFRIST und muss vor der ersten
 * Preisberechnung wählbar sein.
 *
 * Vorher entstand die Auswahlliste ausschließlich aus den geladenen Tarifen.
 * Vor dem ersten Klick auf „Angebote vergleichen“ ist `tariffs` leer, also war
 * die Liste leer: das Feld stand nach der Datumswahl bedienbar da und bot
 * einzig „Beliebig“ an. Der Kunde konnte seine Frist erst benennen, nachdem er
 * die Angebote bereits gesehen hatte — genau umgekehrt zur Reihenfolge, die
 * die Seite meint (Absender, Empfänger, Paket, Datum, Frist, DANN vergleichen).
 *
 * Run: node --test src/utils/deliveryDeadlineOptions.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pruefeImTestlauf, schnitt } from "../../scripts/governance.mjs";

import {
  LIEFERFRIST_RASTER, deliveryDeadlineOptions, deliveryTimeOptions,
} from "./deliveryTimeView.mjs";
import { applyResultFilters } from "./offersFilterView.mjs";
import { TARIFE_41 } from "./offersFilterFixture.mjs";

const lies = (rel) => readFileSync(path.join(process.cwd(), rel), "utf8");
const SEITEN = ["src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx"];

/* ── T1: ohne Tarife trägt das Raster allein ─────────────────────────────── */

test("T1 — ohne Tarife stehen genau die sieben Rasterfristen zur Wahl", () => {
  const erwartet = ["08:00", "09:00", "10:00", "12:00", "13:00", "16:00", "18:00"];
  for (const leer of [[], null, undefined, "nichts"]) {
    assert.deepEqual(deliveryDeadlineOptions(leer), erwartet,
      "vor der ersten Berechnung wäre das Feld sonst wieder leer");
  }
  assert.deepEqual([...LIEFERFRIST_RASTER], erwartet);
});

test("T1b — das Raster ist unveränderlich und liegt an genau EINER Stelle", () => {
  assert.equal(Object.isFrozen(LIEFERFRIST_RASTER), true);
  // Keine Seite und kein Bauteil darf eine eigene Zeitliste führen — sonst
  // driften die beiden Einstiegsseiten auseinander.
  for (const datei of [...SEITEN, "src/components/offers/ShipmentFilterBar.jsx",
                       "src/components/offers/DeliveryTimeSelect.jsx",
                       "src/components/offers/OffersList.jsx"]) {
    const treffer = (lies(datei).match(/"[0-2]\d:[0-5]\d"/g) || []).filter((x) => x !== '""');
    assert.deepEqual(treffer, [], `${datei}: eigene Uhrzeit ${treffer.join(", ")}`);
  }
});

/* ── T2/T3: Tarife ergänzen das Raster ───────────────────────────────────── */

test("T2 — echte Tarifzeiten kommen hinzu, sortiert und ohne Verlust", () => {
  const o = deliveryDeadlineOptions([
    { deliveryTimeUntil: "10:30" }, { deliveryTimeUntil: "17:00" },
  ]);
  assert.deepEqual(o,
    ["08:00", "09:00", "10:00", "10:30", "12:00", "13:00", "16:00", "17:00", "18:00"]);
});

test("T2b — an der echten Antwort: Raster plus die beiden Sonderzeiten", () => {
  const o = deliveryDeadlineOptions(TARIFE_41);
  assert.deepEqual(o,
    ["08:00", "09:00", "10:00", "10:30", "12:00", "13:00", "16:00", "17:00", "18:00"]);
  // Jede reale Tarifzeit ist enthalten — es geht nichts verloren.
  for (const z of deliveryTimeOptions(TARIFE_41)) assert.ok(o.includes(z), z);
  // Und jede Rasterfrist bleibt erhalten — daran hängt T4.
  for (const z of LIEFERFRIST_RASTER) assert.ok(o.includes(z), z);
});

test("T3 — mehrfach vorkommende Zeiten erscheinen genau einmal", () => {
  const o = deliveryDeadlineOptions([
    { deliveryTimeUntil: "12:00" }, { deliveryTimeUntil: "12:00" },
    { deliveryTimeUntil: "12:00" }, { deliveryTimeUntil: "08:00" },
  ]);
  assert.equal(o.filter((z) => z === "12:00").length, 1);
  assert.equal(o.filter((z) => z === "08:00").length, 1);
  assert.equal(new Set(o).size, o.length, "die Liste enthält Dubletten");
  // aufsteigend sortiert
  assert.deepEqual([...o].sort(), o);
});

test("T3b — unbrauchbare Tarifzeiten ergänzen nichts und zerstören nichts", () => {
  const o = deliveryDeadlineOptions([
    { deliveryTimeUntil: null }, {}, { deliveryTimeUntil: "" },
    { deliveryTimeUntil: "kaputt" }, { deliveryTimeUntil: "99:99" },
  ]);
  assert.deepEqual(o, [...LIEFERFRIST_RASTER]);
});

/* ── T4: eine vorab gewählte Frist überlebt die Berechnung ───────────────── */

test("T4 — eine vor der Berechnung gewählte Frist bleibt danach wählbar", () => {
  // Genau dieser Durchlauf ist der Kern: der Kunde wählt die Frist auf einer
  // leeren Seite, die Tarife kommen an — und die Auswahl darf nicht auf
  // „Beliebig“ zurückfallen.
  const gewaehlt = "12:00";
  assert.ok(deliveryDeadlineOptions([]).includes(gewaehlt), "vorher nicht wählbar");
  assert.ok(deliveryDeadlineOptions(TARIFE_41).includes(gewaehlt), "nachher verloren");

  // Das Auswahlfeld setzt den Wert genau dann zurück, wenn er nicht mehr in
  // seiner Optionsliste steht (`werte.includes(value) ? value : ""`). Dieselbe
  // Regel hier nachgestellt — für JEDE Rasterfrist, nicht nur für eine.
  const aktiv = (value, tariffs) =>
    (["", ...deliveryDeadlineOptions(tariffs)].includes(value) ? value : "");
  for (const z of LIEFERFRIST_RASTER) {
    assert.equal(aktiv(z, []), z, `${z} war vor der Berechnung nicht haltbar`);
    assert.equal(aktiv(z, TARIFE_41), z, `${z} ging bei der Berechnung verloren`);
  }
  // Und eine reale Tarifzeit, die nicht im Raster steht, bleibt ebenfalls.
  assert.equal(aktiv("10:30", TARIFE_41), "10:30");
});

/* ── T5: Fristsemantik — kleiner-gleich, nicht gleich ────────────────────── */

test("T5 — die Frist schließt alles Frühere ein und nur Späteres aus", () => {
  const tag = "2026-08-31";
  const tarif = (id, zeit) => ({
    id, netPrice: 10, deliveryDateMax: `${tag}T00:00:00`, deliveryTimeUntil: zeit,
  });
  const alle = [tarif("a", "10:30"), tarif("b", "12:00"), tarif("c", "13:00")];

  const ids = (zeit) => applyResultFilters(alle, {
    latestDeliveryDate: tag, latestDeliveryTime: zeit,
  }).map((t) => t.id);

  assert.deepEqual(ids("12:00"), ["a", "b"], "12:00 ist eine Frist, kein Gleichheitsfilter");
  assert.deepEqual(ids("10:30"), ["a"]);
  assert.deepEqual(ids("13:00"), ["a", "b", "c"]);
  assert.deepEqual(ids(""), ["a", "b", "c"], "ohne Uhrzeit filtert nur das Datum");
});

test("T5b — eine Rasterfrist ohne exakten Tarif wirkt trotzdem sinnvoll", () => {
  // 16:00 trägt kein einziger Tarif der echten Antwort — als FRIST ist die
  // Option trotzdem wahr: sie lässt alles durch, was früher zustellt.
  assert.ok(!deliveryTimeOptions(TARIFE_41).includes("16:00"));
  assert.ok(LIEFERFRIST_RASTER.includes("16:00"));

  const tag = "2026-08-31";
  const alle = [
    { id: "frueh", netPrice: 10, deliveryDateMax: `${tag}T00:00:00`, deliveryTimeUntil: "13:00" },
    { id: "spaet", netPrice: 10, deliveryDateMax: `${tag}T00:00:00`, deliveryTimeUntil: "17:00" },
  ];
  assert.deepEqual(
    applyResultFilters(alle, { latestDeliveryDate: tag, latestDeliveryTime: "16:00" })
      .map((t) => t.id),
    ["frueh"]);
});

/* ── T6/T7: was unverändert bleiben MUSS ─────────────────────────────────── */

test("T6 — ohne Datum bleibt das Uhrzeitfeld gesperrt und erklärt sich", () => {
  const q = lies("src/components/offers/DeliveryTimeSelect.jsx");
  assert.match(q, /disabled=\{!hasDate\}/, "die Sperre ohne Datum ist entfallen");
  assert.match(q, /Erst ein Datum wählen/, "der Hinweis ohne Datum ist entfallen");
  // Und eine offene Liste schließt, sobald das Datum wegfällt.
  assert.match(q, /if \(!hasDate && open\) setOpen\(false\)/);
});

test("T7 — die Uhrzeit bleibt reiner Anzeigefilter (kein Preisschlüssel)", () => {
  for (const seite of SEITEN) {
    const q = lies(seite);
    assert.match(q, /FILTER_ONLY_FIELDS = new Set\(\["max_price", "latestDeliveryDate", "latestDeliveryTime"\]\)/,
      `${seite}: latestDeliveryTime ist kein reiner Filter mehr`);
    // Der Preisschlüssel darf keine der drei Filtergrößen enthalten — sonst
    // löste eine Uhrzeitwahl eine neue Preisberechnung aus.
    const block = schnitt(q, "calcKeyRef.current = JSON.stringify({", "});", seite);
    for (const feld of ["latestDeliveryTime", "latestDeliveryDate", "max_price"]) {
      assert.ok(!block.includes(feld), `${seite}: ${feld} steht im Preisschlüssel`);
    }
  }
});

test("T7b — beide Seiten benutzen dieselbe Quelle, ohne Drift", () => {
  for (const seite of SEITEN) {
    const q = lies(seite);
    assert.match(q, /import \{ deliveryDeadlineOptions \} from "\.\.\/utils\/deliveryTimeView\.mjs";/, seite);
    assert.match(q, /const zeitOptionen = useMemo\(\(\) => deliveryDeadlineOptions\(tariffs\), \[tariffs\]\);/, seite);
    assert.match(q, /deliveryTimeOptions=\{zeitOptionen\}/, `${seite}: Prop nicht mehr verdrahtet`);
  }
  // Der Feld-Formatierer lebt seit der Modularisierung in der EINEN gemeinsamen
  // Filterleiste — nicht mehr je Seite (das war das 222-Zeilen-Duplikat).
  assert.match(lies("src/components/offers/ShipmentFilterBar.jsx"),
    /import \{ latestDeliveryFieldValue \} from "\.\.\/\.\.\/utils\/deliveryTimeView\.mjs";/,
    "die Filterleiste importiert den Formatierer aus derselben Quelle");
});

test("T8 — keine Zusicherung im Fristentext", () => {
  // Das Raster sind Kundenfristen, keine Carrierzusagen. Es gibt kein Feld, das
  // eine Zustellzeit als garantiert ausweist.
  const q = lies("src/utils/deliveryTimeView.mjs");
  const codeOhneKommentar = q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const wort of [/garantiert/i, /zugesichert/i, /\bfix\b/i, /Zusage/i]) {
    assert.doesNotMatch(codeOhneKommentar, wort);
  }
});

test("T9 — diese Datei läuft im Unit-Testlauf tatsächlich mit", () => {
  pruefeImTestlauf("src/utils/deliveryDeadlineOptions.test.mjs");
});
