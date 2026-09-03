// Kalendersicherheit der Angebots-Fixture.
//
// Hintergrund: die Browser-E2E der Ergebnisfilter ist am 01.09.2026 geschlossen
// rot geworden. Vier Suiten klickten im Lieferdatum-Kalender fest den Tag „31";
// der September hat 30 Tage, die Zelle existierte nicht, jeder Klick lief 30 s
// in einen Timeout. Der letzte grüne main-Lauf war der 31.08.2026 — der letzte
// Tag, an dem es den Tag 31 gab.
//
// Behoben ist das nicht durch neue Datumswerte, sondern durch eine fixierte
// Browserzeit (`page.clock.setFixedTime`). Diese Datei hält die Eigenschaften
// fest, von denen diese Lösung abhängt — damit ein späterer Umbau sie nicht
// still verliert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  TARIFE_41, VERSANDZEITPUNKT, LIEFERFRIST_ISO, LIEFERFRIST_TAG,
} from "./offersFilterFixture.mjs";

const SUITEN = [
  "offersResultFilters", "reuseOffersFeedback", "deliveryTimeFilter", "offersRecalcReuse",
];
const lies = (name) =>
  readFileSync(new URL(`../../tests/e2e/${name}.test.mjs`, import.meta.url), "utf8");

// Tage eines Monats über echte Kalendermathematik (Tag 0 des Folgemonats).
const tageImMonat = (jahr, monat1basiert) => new Date(Date.UTC(jahr, monat1basiert, 0)).getUTCDate();

// Der lokale Kalendertag eines absoluten Zeitpunkts in einer Zone mit festem
// Versatz — ohne die Prozesszeitzone anzufassen.
function lokalerTag(iso, versatzStunden) {
  const d = new Date(new Date(iso).getTime() + versatzStunden * 3600_000);
  return { jahr: d.getUTCFullYear(), monat: d.getUTCMonth() + 1, tag: d.getUTCDate() };
}

test("1 — der fixierte Zeitpunkt ist absolut und trägt einen expliziten Zonenversatz", () => {
  assert.ok(/[+-]\d{2}:\d{2}$|Z$/.test(VERSANDZEITPUNKT),
    "ohne expliziten Versatz deutete ihn jede Zone anders — genau das soll fixiert sein");
  assert.equal(Number.isNaN(new Date(VERSANDZEITPUNKT).getTime()), false);
});

test("2 — er fällt in JEDER plausiblen CI-Zone auf denselben Kalendertag", () => {
  // UTC-9 (Alaska) bis UTC+13 (Neuseeland/Sommerzeit) deckt jede realistische
  // Runner- und Entwicklerzone ab. Mittag ist genau deshalb gewählt: um
  // Mitternacht kippte der Tag schon bei einer Stunde Versatz.
  const referenz = lokalerTag(VERSANDZEITPUNKT, 0);
  for (let v = -9; v <= 13; v++) {
    const t = lokalerTag(VERSANDZEITPUNKT, v);
    assert.deepEqual(t, referenz, `bei UTC${v >= 0 ? "+" : ""}${v} verschiebt sich der Kalendertag`);
  }
  assert.deepEqual(referenz, { jahr: 2026, monat: 8, tag: 28 });
});

test("3 — die Lieferfrist liegt im Monat des fixierten Zeitpunkts UND dieser Monat führt den Tag", () => {
  const [j, m, t] = LIEFERFRIST_ISO.split("-").map(Number);
  const versand = lokalerTag(VERSANDZEITPUNKT, 0);
  assert.equal(j, versand.jahr);
  assert.equal(m, versand.monat, "der Kalender zeigt den Monat des Versandtags — die Frist muss darin liegen");
  // DAS ist die Eigenschaft, an der die Suite zerbrochen war.
  assert.ok(t <= tageImMonat(j, m),
    `Tag ${t} existiert im Monat ${m}/${j} nicht (${tageImMonat(j, m)} Tage)`);
});

test("4 — die angeklickte Zelle ist genau der Tag der Frist, ohne führende Null", () => {
  const t = Number(LIEFERFRIST_ISO.split("-")[2]);
  assert.equal(LIEFERFRIST_TAG, String(t),
    "der Kalender beschriftet die Zelle ohne führende Null — „08\" träfe nichts");
});

test("5 — die Frist liegt nicht VOR dem Versandtag", () => {
  const v = lokalerTag(VERSANDZEITPUNKT, 0);
  const versandISO = `${v.jahr}-${String(v.monat).padStart(2, "0")}-${String(v.tag).padStart(2, "0")}`;
  assert.ok(LIEFERFRIST_ISO >= versandISO,
    "DateCalendar deaktiviert alles vor minDate (= Versanddatum) — ein früherer Tag wäre nicht klickbar");
});

test("6 — die Frist trifft die erwarteten 21 von 41 Tarifen", () => {
  const treffer = TARIFE_41.filter((t) => t.deliveryDateMax <= LIEFERFRIST_ISO);
  assert.equal(TARIFE_41.length, 41);
  assert.equal(treffer.length, 21, "die Fixture und die Frist gehören zusammen");
});

test("7 — die Monatsmathematik greift wirklich (Gegenprobe an echten Monaten)", () => {
  // Ohne diese Gegenprobe könnte die Prüfung aus (3) tautologisch sein.
  assert.equal(tageImMonat(2026, 2), 28, "Februar 2026");
  assert.equal(tageImMonat(2024, 2), 29, "Februar 2024 (Schaltjahr)");
  assert.equal(tageImMonat(2026, 4), 30, "April");
  assert.equal(tageImMonat(2026, 8), 31, "August");
  assert.equal(tageImMonat(2026, 9), 30, "September — hier lief der Klick ins Leere");
  assert.equal(tageImMonat(2026, 12), 31, "Dezember");
  assert.equal(tageImMonat(2027, 1), 31, "Januar über die Jahresgrenze");
  // Der Tag 31 existiert im August, aber in keinem der Monate, an denen die
  // Suite gescheitert wäre.
  for (const m of [2, 4, 9]) {
    assert.ok(Number(LIEFERFRIST_TAG) > tageImMonat(2026, m),
      `Monat ${m} führt den Tag ${LIEFERFRIST_TAG} entgegen der Annahme doch`);
  }
});

test("8 — jede betroffene Suite fixiert die Uhr und klickt keinen verdrahteten Tag mehr", () => {
  for (const name of SUITEN) {
    const src = lies(name);
    assert.match(src, /page\.clock\.setFixedTime\(new Date\(VERSANDZEITPUNKT\)\)/,
      `${name}: ohne fixierte Uhr hängt der Kalender wieder am realen Monat`);
    assert.match(src, /LIEFERFRIST_TAG/,
      `${name}: der angeklickte Tag muss aus der gemeinsamen Konstante kommen`);
    assert.doesNotMatch(src, /\^31\$|\(page, "31"\)/,
      `${name}: eine abgeschriebene „31\" ist genau das Copy/Paste-Datum, das den Ausfall erzeugt hat`);
  }
});

test("9 — die Uhr wird im gemeinsamen Einstieg gesetzt, nicht je Testfall", () => {
  // Gemessen wird die STRUKTUR, nicht die Zeilennummer: der Aufruf muss im Kopf
  // von `setupRoutes` stehen — der Funktion, durch die jede navigierende Seite
  // dieser Dateien läuft — und dort vor der Routenregistrierung.
  for (const name of SUITEN) {
    const src = lies(name);
    const start = src.indexOf("function setupRoutes(");
    const route = src.indexOf("await page.route(", start);
    assert.ok(start !== -1 && route !== -1, `${name}: setupRoutes nicht gefunden`);
    const kopf = src.slice(start, route);
    assert.match(kopf, /page\.clock\.setFixedTime\(new Date\(VERSANDZEITPUNKT\)\)/,
      `${name}: die Uhr muss im Kopf von setupRoutes stehen, sonst greift sie nicht für jede Seite`);
    assert.equal(src.split("page.clock.setFixedTime").length - 1, 1,
      `${name}: genau EIN Ort — je Testfall wiederholt wäre es wieder Copy/Paste`);
  }
});
