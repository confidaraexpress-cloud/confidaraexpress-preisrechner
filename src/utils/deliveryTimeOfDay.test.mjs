// P4 Zustelluhrzeiten (Betreiberentscheidung 2026-11-04) — die Tageszeit der Zustellung, eine Regel für alle Flächen
// (utils/deliveryTimeView.mjs, `deliveryTimeOfDay`):
//
//   belegte Uhrzeit                         → „bis 12:00 Uhr" (vor 15:00 zusätzlich „Lieferung bis 12:00 Uhr")
//   Zustelltag oder Prognose ohne Uhrzeit   → „Zustellung im Tagesverlauf"
//   keine Zustellangabe / Uhrzeit im Namen  → nichts
//
// Geprüft werden die 15 Transglobal-Launchprodukte mit den Zeitleistungen des Servers (TG-L1: nur DHL 85/86/87 DE→DE,
// Laufzeit 1), UPS Express 29 und TNT 49 mit und ohne Carrierbeleg (der Beleg wäre eine reine Datenergänzung des
// Servers), JUMiNGO mit 09:00, 12:00, 17:00 und 18:00 Uhr, Angebote ohne Uhrzeit und ohne Zustellprognose, Laufzeiten
// und Strecken, die Unabhängigkeit von Lieferzeitfilter und Fristgruppen sowie dieselbe Zeile auf Karte, Detailbereich,
// Buchungsleiste, öffentlichem Preisrechner und Demo. Die Browserprüfungen stehen in tests/e2e/deliveryTimeOfDay.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pruefeImTestlauf } from "../../scripts/governance.mjs";
import {
  deliveryTimeOfDay, deliveryTimeOfDayLabel, earlyDeliveryNote, deliveryTimeOptions, uhrzeitenImText,
  DELIVERY_TIME_OF_DAY_KIND, DELIVERY_DAY_COURSE_TEXT,
} from "./deliveryTimeView.mjs";
import { deliveryInfo } from "./bookingSummaryView.mjs";
import { offerDeliveryView } from "./publicCalculatorView.mjs";
import { serviceDetailsView } from "./serviceDetailsView.mjs";
import { deliveryDeadlineAssessment, deliveryDeadlineGroups, applyResultFilters } from "./offersFilterView.mjs";
import { demoAngebote } from "../demo/demoBackend.mjs";
import { TARIFE_41 } from "./offersFilterFixture.mjs";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (rel) => readFileSync(path.join(SRC, rel), "utf8").replace(/\r\n/g, "\n");
const ohneKommentare = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "")
  .replace(/(^|[^:"'`])\/\/.*$/gm, "$1")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const TAGESVERLAUF = "Zustellung im Tagesverlauf";

/* ══════════ Fixtures ══════════ */

// Ein Transglobal-Angebot, wie der Server es ausliefert: keine Anbieterdaten, die Prognose aus Abholtag und Laufzeit,
// eine Uhrzeit nur aus der kuratierten Zeitleistung (TG-L1).
const tg = (publicServiceName, { dateMin = "2026-11-10", dateMax = dateMin, timeUntil = null, serviceType = "pickup",
  transit = [1, 1] } = {}) => Object.freeze({
  publicServiceName, serviceType,
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null, deliveryTimeUntil: null, deliveryTimeUntilMinutes: null,
  transitDaysMin: transit[0], transitDaysMax: transit[1],
  deliveryProjection: { kind: "estimated", dateMin, dateMax, timeUntil },
});

// Ein JUMiNGO-Angebot mit Zustelldaten des Anbieters.
const jumingo = (publicServiceName, zeit, minuten, { min = "2026-11-10T00:00:00Z", max = min } = {}) => Object.freeze({
  publicServiceName, serviceType: "pickup", transitDaysMin: 1, transitDaysMax: 1,
  deliveryDate: min, deliveryDateMin: min, deliveryDateMax: max,
  deliveryTimeUntil: zeit, deliveryTimeUntilMinutes: minuten, deliveryProjection: null,
});

/* ══════════ 1) Die drei Fälle ══════════ */

test("1 — drei Fälle, drei Formen: Uhrzeit, Tagesverlauf, nichts", () => {
  assert.deepEqual(DELIVERY_TIME_OF_DAY_KIND, { TIME: "time", DAY_COURSE: "dayCourse", NONE: "none" });
  assert.deepEqual(DELIVERY_DAY_COURSE_TEXT, { line: TAGESVERLAUF, inline: "im Tagesverlauf" });
  assert.deepEqual({ ...deliveryTimeOfDay(jumingo("Standard", "18:00", 1080)) },
    { kind: "time", line: "bis 18:00 Uhr", inline: "bis 18:00 Uhr" });
  assert.deepEqual({ ...deliveryTimeOfDay(tg("Standardversand")) },
    { kind: "dayCourse", line: TAGESVERLAUF, inline: "im Tagesverlauf" });
  assert.deepEqual({ ...deliveryTimeOfDay({ transitDaysMin: 1, transitDaysMax: 2 }) }, { kind: "none", line: "", inline: null });
  assert.equal(deliveryTimeOfDayLabel({}), "");
  assert.equal(deliveryTimeOfDayLabel(null), "");
});

/* ══════════ 2) Die 15 Transglobal-Launchprodukte ══════════ */

// Name (Kurationsstand der Policy), Strecke, Laufzeit des Quotes und die Prognose, die der Server daraus rechnet.
// `zeit` ist die Zeitleistung des Servers (nur 85/86/87, DE→DE, Laufzeit 1).
const LAUNCH = [
  { id: 22, name: "Standardversand", strecke: "DE", erwartet: TAGESVERLAUF },
  { id: 22, name: "Standardversand", strecke: "EU", dateMax: "2026-11-11", transit: [1, 2], erwartet: TAGESVERLAUF },
  { id: 23, name: "Expressversand", strecke: "DE", erwartet: TAGESVERLAUF },
  { id: 26, name: "Standardversand Mehrpaket", strecke: "DE", dateMax: "2026-11-16", transit: [1, 5], erwartet: TAGESVERLAUF },
  { id: 29, name: "Express", strecke: "DE", erwartet: TAGESVERLAUF },
  { id: 29, name: "Express", strecke: "EU", erwartet: TAGESVERLAUF },
  { id: 41, name: "Economy Express", strecke: "EU", dateMin: "2026-11-11", transit: [2, 2], erwartet: TAGESVERLAUF },
  { id: 44, name: "Express", strecke: "EU", erwartet: TAGESVERLAUF },
  { id: 49, name: "Express 12:00", strecke: "DE", erwartet: "" },
  { id: 84, name: "Domestic Express", strecke: "DE", erwartet: TAGESVERLAUF },
  { id: 85, name: "Domestic Express 9:00", strecke: "DE", zeit: "09:00", erwartet: "bis 09:00 Uhr", feld: "Lieferung bis 09:00 Uhr" },
  { id: 86, name: "Domestic Express 10:30", strecke: "DE", zeit: "10:30", erwartet: "bis 10:30 Uhr", feld: "Lieferung bis 10:30 Uhr" },
  { id: 87, name: "Domestic Express 12:00", strecke: "DE", zeit: "12:00", erwartet: "bis 12:00 Uhr", feld: "Lieferung bis 12:00 Uhr" },
  { id: 107, name: "Economy Select", strecke: "EU", dateMax: "2026-11-12", transit: [1, 3], erwartet: TAGESVERLAUF },
  { id: 110, name: "Pick&Ship", strecke: "DE", erwartet: TAGESVERLAUF },
  { id: 124, name: "PaketShop", strecke: "DE", serviceType: "dropoff", erwartet: TAGESVERLAUF },
  { id: 137, name: "Classic", strecke: "DE", erwartet: TAGESVERLAUF },
];

test("2 — alle 15 Launchprodukte: belegte Uhrzeit nur bei DHL 85/86/87, sonst „Zustellung im Tagesverlauf“, TNT 49 nichts", () => {
  assert.equal(new Set(LAUNCH.map((p) => p.id)).size, 15, "nicht alle 15 Launchprodukte geprüft");
  for (const p of LAUNCH) {
    const angebot = tg(p.name, { dateMin: p.dateMin, dateMax: p.dateMax ?? p.dateMin, timeUntil: p.zeit ?? null,
      serviceType: p.serviceType, transit: p.transit });
    assert.equal(deliveryTimeOfDayLabel(angebot), p.erwartet, `${p.id} ${p.strecke}`);
    assert.equal(earlyDeliveryNote(angebot), p.feld ?? "", `${p.id} ${p.strecke}: grünes Feld`);
  }
});

test("3 — die Zeitprodukte ohne belegte Uhrzeit (andere Laufzeit, offenes Fenster): kein Tagesverlauf neben der Uhrzeit im Namen", () => {
  // DHL 85 mit Laufzeit 2 trägt keine Zeitleistung (Server, TG-L1) — der Name nennt 9:00, also kein Widerspruch daneben.
  assert.equal(deliveryTimeOfDayLabel(tg("Domestic Express 9:00", { dateMax: "2026-11-11", transit: [1, 2] })), "");
  // TNT 49 mit „1+" (Staging): nur „ab …", keine Uhrzeit, kein Tagesverlauf.
  assert.equal(deliveryTimeOfDayLabel(tg("Express 12:00", { dateMax: null, transit: [1, null] })), "");
  // Ein Ersatzname der Oberfläche trägt nie eine Uhrzeit — ohne kuratierten Namen gilt der Tagesverlauf.
  assert.equal(deliveryTimeOfDayLabel(tg(undefined)), TAGESVERLAUF);
});

/* ══════════ 3) UPS Express 29 und TNT 49 — mit und ohne Carrierbeleg ══════════ */

test("4 — UPS Express 29 ohne Carrierbeleg (heute): Tagesverlauf auf jeder Strecke und Laufzeit, keine Obergrenze", () => {
  for (const angebot of [tg("Express"), tg("Express", { dateMax: "2026-11-11", transit: [1, 2] }),
                         tg("Express", { dateMax: null, transit: [1, null] })]) {
    assert.equal(deliveryTimeOfDayLabel(angebot), TAGESVERLAUF);
    assert.equal(earlyDeliveryNote(angebot), "");
    assert.ok(!/\d{1,2}:\d{2}/.test(JSON.stringify(deliveryTimeOfDay(angebot))), "eine Uhrzeit ohne Beleg");
  }
});

test("5 — UPS Express 29 mit Carrierbeleg: die Uhrzeit käme allein vom Server (Zeitleistung), die Oberfläche ändert nichts", () => {
  // Hätte die Policy eine belegte Obergrenze (DE→DE, Laufzeit 1), trüge die Prognose `timeUntil` — mehr nicht.
  const belegt = tg("Express", { timeUntil: "12:00" });
  assert.equal(deliveryTimeOfDayLabel(belegt), "bis 12:00 Uhr");
  assert.equal(earlyDeliveryNote(belegt), "Lieferung bis 12:00 Uhr");
  // An einem Zeitraum (DE→EU, Laufzeit 1–2) gilt eine Uhrzeit nie — und eine verworfene Uhrzeit wird kein Tagesverlauf.
  assert.equal(deliveryTimeOfDayLabel(tg("Express", { dateMax: "2026-11-11", timeUntil: "12:00", transit: [1, 2] })), "");
});

test("6 — TNT 49 mit und ohne belegte Uhrzeit: der Name bleibt, daneben nie „im Tagesverlauf“", () => {
  const ohne = tg("Express 12:00");
  assert.equal(deliveryTimeOfDayLabel(ohne), "");
  assert.equal(deliveryTimeOfDay(ohne).inline, null);
  assert.equal(earlyDeliveryNote(ohne), "");
  const mit = tg("Express 12:00", { timeUntil: "12:00" });
  assert.equal(deliveryTimeOfDayLabel(mit), "bis 12:00 Uhr");
  assert.equal(earlyDeliveryNote(mit), "Lieferung bis 12:00 Uhr");
});

/* ══════════ 4) JUMiNGO und Angebote ohne Angabe ══════════ */

test("7 — JUMiNGO: 09:00 und 12:00 grün, 17:00 und 18:00 wörtlich grau — nie „im Tagesverlauf“ statt einer Anbieterzeit", () => {
  for (const [zeit, minuten, feld] of [["09:00", 540, true], ["12:00", 720, true], ["17:00", 1020, false], ["18:00", 1080, false]]) {
    const angebot = jumingo("Express", zeit, minuten);
    assert.equal(deliveryTimeOfDayLabel(angebot), `bis ${zeit} Uhr`, zeit);
    assert.equal(earlyDeliveryNote(angebot), feld ? `Lieferung bis ${zeit} Uhr` : "", `${zeit}: grünes Feld`);
  }
  // Die echte Antwort (41 Tarife, alle mit Anbieterzeit): keine einzige Karte bekommt den Tagesverlauf.
  for (const t of TARIFE_41) assert.match(deliveryTimeOfDayLabel(t), /^bis \d{2}:\d{2} Uhr$/, t.id);
});

test("8 — JUMiNGO mit Zustelldatum ohne Uhrzeit: Tagesverlauf; mit Uhrzeit im Namen: nichts", () => {
  assert.equal(deliveryTimeOfDayLabel(jumingo("Standard", null, null)), TAGESVERLAUF);
  assert.equal(deliveryTimeOfDayLabel(jumingo("Standard", null, null, { max: "2026-11-12T00:00:00Z" })), TAGESVERLAUF);
  assert.equal(deliveryTimeOfDayLabel(jumingo("Express 12:00", null, null)), "");
  assert.equal(deliveryTimeOfDayLabel(jumingo("Express National 9:00", null, null)), "");
});

test("9 — ohne Uhrzeit und ohne Zustellprognose entsteht keine Aussage", () => {
  assert.equal(deliveryTimeOfDayLabel({ transitDaysMin: 1, transitDaysMax: 2, deliveryTime: "1–2 Tage" }), "");
  assert.equal(deliveryTimeOfDayLabel({ publicServiceName: "Standard" }), "");
  assert.equal(deliveryTimeOfDayLabel({ deliveryProjection: { kind: "estimated", dateMin: "2026-02-30", dateMax: null } }), "");
  assert.equal(deliveryTimeOfDayLabel({ deliveryProjection: { kind: "anders", dateMin: "2026-11-10", dateMax: "2026-11-10" } }), "");
});

test("10 — fail-closed: eine Uhrzeitangabe, die sich nicht lesen lässt, wird weder gezeigt noch zum Tagesverlauf", () => {
  assert.equal(deliveryTimeOfDayLabel(jumingo("Standard", "gegen Mittag", null)), "");
  assert.equal(deliveryTimeOfDayLabel(jumingo("Standard", null, 720)), "");
  assert.equal(deliveryTimeOfDayLabel(tg("Standardversand", { timeUntil: "9:00" })), "");
  assert.equal(deliveryTimeOfDayLabel(tg("Standardversand", { timeUntil: "24:00" })), "");
});

test("11 — die Uhrzeiterkennung im Namen: ganze Uhrzeiten, keine Scheintreffer", () => {
  assert.deepEqual(uhrzeitenImText("Express 12:00").map((u) => [u.text, u.minutes]), [["12:00", 720]]);
  assert.deepEqual(uhrzeitenImText("Domestic Express 9:00").map((u) => u.text), ["9:00"]);
  for (const kein of ["Express", "123:45", "12:345", "12:00:00", "25:00", "", null, 42]) {
    assert.deepEqual(uhrzeitenImText(kein), [], String(kein));
  }
});

/* ══════════ 5) Lieferzeitfilter und Fristgruppen bleiben unberührt ══════════ */

test("12 — „Zustellung im Tagesverlauf“ ist keine Uhrzeit: keine Fristoption, keine erfüllte Fristuhrzeit, Gruppen wie bisher", () => {
  const ups29 = tg("Express");
  const dpd137 = tg("Classic", { dateMax: "2026-11-11", transit: [1, 2] });
  const dhl87 = tg("Domestic Express 12:00", { timeUntil: "12:00" });
  // Keine Uhrzeitoption aus einem Tagesverlauf — nur die belegte 12:00.
  assert.deepEqual(deliveryTimeOptions([ups29, dpd137, dhl87]), ["12:00"]);
  // Frist am Zustelltag mit Uhrzeit: Tagesverlauf ist nicht bestätigt (C), die belegte Uhrzeit passt (B).
  const frist = { latestDeliveryDate: "2026-11-10", latestDeliveryTime: "12:00" };
  assert.equal(deliveryDeadlineAssessment(ups29, frist), "not_assessable");
  assert.equal(deliveryDeadlineAssessment(dhl87, frist), "projected");
  assert.equal(deliveryDeadlineAssessment(dpd137, frist), "too_late");
  // Frist ohne Uhrzeit am Zustelltag: der Tag reicht (B) — unabhängig vom Tagesverlauf-Satz.
  assert.equal(deliveryDeadlineAssessment(ups29, { latestDeliveryDate: "2026-11-10" }), "projected");
  const gruppen = deliveryDeadlineGroups(applyResultFilters([ups29, dpd137, dhl87], frist), frist);
  assert.deepEqual([gruppen.confirmed.length, gruppen.projected.length, gruppen.unconfirmed.length], [0, 1, 1]);
  // Dieselbe Bewertung wie ohne den Namen, der den Tagesverlauf unterdrückt — der Name wirkt nicht auf den Filter.
  assert.equal(deliveryDeadlineAssessment(tg("Express 12:00"), frist), deliveryDeadlineAssessment(ups29, frist));
});

test("13 — Filter, Fristgruppen, Uhrzeitauswahl, Sortierung und Auszeichnungen lesen die Tageszeit-Regel nicht", () => {
  for (const datei of ["utils/offersFilterView.mjs", "utils/offerBadges.js", "components/offers/OffersList.jsx",
                       "components/offers/DeliveryTimeSelect.jsx", "components/offers/ShipmentFilterBar.jsx"]) {
    const q = ohneKommentare(lies(datei));
    assert.ok(!/deliveryTimeOfDay|Tagesverlauf/.test(q), `${datei} liest die Tageszeit-Regel`);
  }
});

/* ══════════ 6) Eine Zeile auf allen Flächen ══════════ */

test("14 — dieselbe Aussage auf Karte, Buchungsleiste, Preisrechner und Detailbereich", () => {
  const faelle = [tg("Express"), tg("Classic", { dateMax: "2026-11-11", transit: [1, 2] }), tg("Express 12:00"),
                  tg("Domestic Express 12:00", { timeUntil: "12:00" }), jumingo("Standard", "18:00", 1080),
                  jumingo("Standard", null, null), { transitDaysMin: 1, transitDaysMax: 2 }];
  for (const t of faelle) {
    const karte = deliveryTimeOfDayLabel(t);
    assert.equal(deliveryInfo(t).timeOfDay, karte || null, "Buchungsleiste");
    // Der Preisrechner zeigt eine frühe Uhrzeit wie die Karte im grünen Wortlaut, sonst dieselbe Zeile.
    const pc = offerDeliveryView(t).time;
    assert.equal(pc, earlyDeliveryNote(t) || karte || null, "Preisrechner");
  }
  // Detailbereich: hinter den Tagen bzw. als Zeile „Zustellung" die Kurzform — dieselbe Entscheidung.
  for (const t of faelle) {
    const kurz = deliveryTimeOfDay(t).inline;
    const lang = deliveryTimeOfDayLabel(t);
    assert.equal(kurz === null, lang === "", "Kurz- und Langform laufen auseinander");
    if (deliveryTimeOfDay(t).kind === "dayCourse") assert.equal(kurz, "im Tagesverlauf");
    if (deliveryTimeOfDay(t).kind === "time") assert.equal(kurz, lang);
  }
  // Die Profilzeile der Transglobal-Angebote prüft serviceDetailsView.test.mjs (TG23, TG29: „…, im Tagesverlauf").
  assert.equal(typeof serviceDetailsView, "function");
});

test("15 — die Flächen rufen die Regel auf, statt eigene Varianten zu bauen", () => {
  const karte = ohneKommentare(lies("components/offers/OfferCard.jsx"));
  assert.match(karte, /const zeitText = deliveryTimeOfDayLabel\(t\);/);
  assert.match(karte, /const tageszeit = deliveryTimeOfDay\(t\);/);
  assert.match(karte, /<DetailRow label="Zustellung" value=\{tageszeit\.inline\} \/>/);
  assert.match(karte, /value=\{prognoseZusatz \? `\$\{prognoseText\}, \$\{prognoseZusatz\}` : prognoseText\}/);
  const leiste = ohneKommentare(lies("components/booking/BookingLiveSummary.jsx"));
  assert.match(leiste, /\{zustellung\.timeOfDay && <span className="blsum-sub">\{zustellung\.timeOfDay\}<\/span>\}/);
  assert.match(ohneKommentare(lies("utils/bookingSummaryView.mjs")), /timeOfDay: deliveryTimeOfDayLabel\(tariff\) \|\| null/);
  assert.match(ohneKommentare(lies("utils/publicCalculatorView.mjs")), /time: frueh \|\| deliveryTimeOfDayLabel\(offer\) \|\| null/);
  assert.match(ohneKommentare(lies("utils/serviceDetailsView.mjs")), /const prognoseZusatz = prognose \? deliveryTimeOfDay\(t\)\.inline : null;/);
  // Der Satz steht genau einmal im Produktivcode — als Konstante der Regel.
  const treffer = [];
  const lauf = (rel) => {
    for (const e of readdirSync(path.join(SRC, rel), { withFileTypes: true })) {
      const p = path.join(rel, e.name);
      if (e.isDirectory()) { lauf(p); continue; }
      if (!/\.(jsx|js|mjs)$/.test(e.name) || /\.test\.mjs$/.test(e.name)) continue;
      if (/Tagesverlauf/.test(ohneKommentare(lies(p)))) treffer.push(p.split(path.sep).join("/"));
    }
  };
  lauf(".");
  assert.deepEqual(treffer, ["utils/deliveryTimeView.mjs"]);
});

test("16 — keine Zusage: kein Garantiewort, keine erfundene Obergrenze in den Texten der Regel", () => {
  const q = ohneKommentare(lies("utils/deliveryTimeView.mjs"));
  const literale = q.match(/"[^"\n]*"|`[^`\n]*`/g) || [];
  for (const wort of ["garantiert", "zugesichert", "spätestens", "pünktlich"]) {
    assert.ok(!literale.some((l) => l.toLowerCase().includes(wort)), `„${wort}“ in einem Textliteral`);
  }
});

/* ══════════ 7) Demo ══════════ */

test("17 — Demo: Inland vier Prognosen im Tagesverlauf und DHL 12:00 mit Uhrzeit; Ausland ohne Uhrzeit neben dem Namen", () => {
  const inland = demoAngebote({ recipient: { country: "DE" }, packages: { packageLines: [{ quantity: 1, weight: 2 }] } });
  const ausland = demoAngebote({ recipient: { country: "FR" }, packages: { packageLines: [{ quantity: 1, weight: 2 }] } });
  assert.deepEqual(inland.tariffs.map(deliveryTimeOfDayLabel), [TAGESVERLAUF, TAGESVERLAUF, TAGESVERLAUF, TAGESVERLAUF, "bis 12:00 Uhr"]);
  assert.equal(earlyDeliveryNote(inland.tariffs[4]), "Lieferung bis 12:00 Uhr");
  assert.deepEqual(ausland.tariffs.map(deliveryTimeOfDayLabel), [TAGESVERLAUF, TAGESVERLAUF, TAGESVERLAUF, TAGESVERLAUF, ""]);
});

test("Q — diese Testdatei läuft im Unit-Testlauf mit", () => {
  pruefeImTestlauf("src/utils/deliveryTimeOfDay.test.mjs");
});
