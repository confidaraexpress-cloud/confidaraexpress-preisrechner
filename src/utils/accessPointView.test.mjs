/* Tests für die Paketshop-Anzeige (utils/accessPointView.mjs).

   Grundlage ist ein echter JUMiNGO-Mitschnitt (siehe tests/fixtures/
   accessPointsDpd.mjs). Zwei Dinge prüfen diese Tests bewusst NICHT, weil das
   Frontend sie nicht tun darf:
     • ob ein Shop gerade offen ist — das entscheidet JUMiNGO über workState
     • wie weit ein Shop entfernt ist — das liefert JUMiNGO über distance

   Run: npm test */
import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeAccessPointWorkState,
  WORK_STATE_UNKNOWN_LABEL,
  normalizeOpeningHours,
  todayOpeningHoursText,
  HOURS_CLOSED_TODAY,
  berlinWeekdayIndex,
  toDistanceNumber,
  formatDistance,
  sortAccessPointsByDistance,
  accessPointCountLabel,
  moreAccessPointsLabel,
} from "./accessPointView.mjs";
import { DPD_ACCESS_POINTS, DPD_EXPECTED_ORDER, FREITAG } from "../../tests/fixtures/accessPointsDpd.mjs";

// Ein Freitag und ein Sonntag, jeweils mittags in Europe/Berlin.
const FR = new Date(FREITAG);
const SO = new Date("2026-08-09T12:00:00+02:00");

// ═══════════ 1 — ÖFFNUNGSSTATUS (workState) ═════════════════════════════════

test("1 — „Geöffnet“ aus dem echten Mitschnitt wird zu Geöffnet/Success", () => {
  const s = normalizeAccessPointWorkState("Geöffnet");
  assert.equal(s.key, "open");
  assert.equal(s.label, "Geöffnet");
  assert.equal(s.badgeClass, "badge badge--success");
  assert.equal(s.known, true);
});

test("2 — „schließt bald“ aus dem echten Mitschnitt wird zu Schließt bald/Warning", () => {
  const s = normalizeAccessPointWorkState("schließt bald");
  assert.equal(s.key, "closing");
  assert.equal(s.label, "Schließt bald");
  assert.equal(s.badgeClass, "badge badge--warning");
  assert.equal(s.known, true);
});

test("3 — „Geschlossen“ wird zu Geschlossen/Neutral (kein Fehlerrot)", () => {
  const s = normalizeAccessPointWorkState("Geschlossen");
  assert.equal(s.key, "closed");
  assert.equal(s.label, "Geschlossen");
  assert.equal(s.badgeClass, "badge badge--neutral");
});

test("4 — die Zuordnung ist unabhängig von Groß-/Kleinschreibung", () => {
  for (const v of ["GEÖFFNET", "geöffnet", "GeÖffNet"]) {
    assert.equal(normalizeAccessPointWorkState(v).key, "open", v);
  }
  for (const v of ["Schließt bald", "SCHLIESST BALD", "schliesst bald"]) {
    assert.equal(normalizeAccessPointWorkState(v).key, "closing", v);
  }
  for (const v of ["GESCHLOSSEN", "geschlossen"]) {
    assert.equal(normalizeAccessPointWorkState(v).key, "closed", v);
  }
});

test("5 — führende/anhängende Leerzeichen und Mehrfachleerzeichen stören nicht", () => {
  assert.equal(normalizeAccessPointWorkState("  Geöffnet  ").key, "open");
  assert.equal(normalizeAccessPointWorkState("schließt   bald").key, "closing");
});

test("6 — die in den Backend-Tests belegten englischen Tokens werden zugeordnet", () => {
  assert.equal(normalizeAccessPointWorkState("opened").key, "open");
  assert.equal(normalizeAccessPointWorkState("open").key, "open");
  assert.equal(normalizeAccessPointWorkState("closed").key, "closed");
  assert.equal(normalizeAccessPointWorkState("closing soon").key, "closing");
});

test("7 — ein unbekannter Wert wird niemals sichtbar, sondern zu einem Hinweis", () => {
  const s = normalizeAccessPointWorkState("temporarily_unavailable");
  assert.equal(s.key, "unknown");
  assert.equal(s.label, WORK_STATE_UNKNOWN_LABEL);
  assert.equal(s.known, false);
  assert.ok(!s.label.includes("temporarily_unavailable"), "der Rohwert darf nicht im Text stehen");
});

test("8 — der Rohwert bleibt für den Support erhalten (nur als raw, nicht als Text)", () => {
  assert.equal(normalizeAccessPointWorkState("  weird_state ").raw, "weird_state");
  assert.equal(normalizeAccessPointWorkState("Geöffnet").raw, "Geöffnet");
});

test("9 — null/undefined/leer ergeben den Unbekannt-Zustand", () => {
  for (const v of [null, undefined, "", "   "]) {
    const s = normalizeAccessPointWorkState(v);
    assert.equal(s.key, "unknown", String(v));
    assert.equal(s.label, WORK_STATE_UNKNOWN_LABEL);
    assert.equal(s.raw, "");
  }
});

test("10 — Nicht-Strings (Zahl, Objekt, Array, Boolean) ergeben den Unbekannt-Zustand", () => {
  for (const v of [0, 1, {}, { workState: "Geöffnet" }, [], ["Geöffnet"], true, false]) {
    const s = normalizeAccessPointWorkState(v);
    assert.equal(s.key, "unknown", JSON.stringify(v));
    assert.equal(s.raw, "");
  }
});

test("11 — jeder Zustand trägt eine Designsystem-Badgeklasse (Punkt UND Text)", () => {
  const erlaubt = new Set([
    "badge badge--success", "badge badge--warning", "badge badge--neutral",
  ]);
  for (const v of ["Geöffnet", "schließt bald", "Geschlossen", "unbekannt", null]) {
    const s = normalizeAccessPointWorkState(v);
    assert.ok(erlaubt.has(s.badgeClass), `${v} → ${s.badgeClass}`);
    assert.ok(s.badgeClass.startsWith("badge "), "die Basisklasse .badge liefert den Punkt");
    assert.ok(s.label.length > 0, "ohne Text wäre der Zustand nur farbig codiert");
  }
});

test("12 — der Status wird NIE aus der Uhrzeit hergeleitet: gleiche Eingabe, gleiches Ergebnis", () => {
  // Derselbe Wert um Mitternacht und mittags — die Funktion kennt keine Uhr.
  const a = normalizeAccessPointWorkState("Geöffnet");
  const b = normalizeAccessPointWorkState("Geöffnet");
  assert.deepEqual(a, b);
  // Und: ein Shop mit Öffnungszeiten, die längst vorbei sind, bleibt „Geöffnet“,
  // solange JUMiNGO das sagt. Widerspruch wird nicht aufgelöst, nur angezeigt.
  const shop = { workState: "Geöffnet", hoursOfOperation: [{ dayName: "Freitag", workingHours: "08:00-09:00", workingDay: true }] };
  assert.equal(normalizeAccessPointWorkState(shop.workState).label, "Geöffnet");
  assert.equal(todayOpeningHoursText(shop.hoursOfOperation, FR), "Heute: 08:00–09:00");
});

// ═══════════ 2 — ÖFFNUNGSZEITEN (hoursOfOperation) ══════════════════════════

test("13 — echtes Objekt-Array: der heutige Tag wird ausgewählt und formatiert", () => {
  const ay = DPD_ACCESS_POINTS.find((s) => s.name === "AYDESIGNZ");
  assert.equal(todayOpeningHoursText(ay.hoursOfOperation, FR), "Heute: 08:30–19:30");
  const kn = DPD_ACCESS_POINTS.find((s) => s.name === "K naro Supermarket");
  assert.equal(todayOpeningHoursText(kn.hoursOfOperation, FR), "Heute: 10:00–19:30");
});

test("14 — rund um die Uhr (00:01-23:59) wird unverändert übernommen", () => {
  const st = DPD_ACCESS_POINTS.find((s) => s.name === "DPD-Paketstation");
  assert.equal(todayOpeningHoursText(st.hoursOfOperation, FR), "Heute: 00:01–23:59");
  assert.equal(todayOpeningHoursText(st.hoursOfOperation, SO), "Heute: 00:01–23:59");
});

test("15 — workingDay: false ergibt „Heute geschlossen“", () => {
  const h = [
    { dayName: "Freitag", workingHours: null, lunchBreak: null, workingDay: false },
  ];
  assert.equal(todayOpeningHoursText(h, FR), HOURS_CLOSED_TODAY);
  assert.equal(HOURS_CLOSED_TODAY, "Heute geschlossen");
});

test("16 — workingHours: „Geschlossen“ ergibt ebenfalls „Heute geschlossen“", () => {
  for (const wert of ["Geschlossen", "geschlossen", "closed", "Ruhetag"]) {
    const h = [{ dayName: "Freitag", workingHours: wert, workingDay: true }];
    assert.equal(todayOpeningHoursText(h, FR), HOURS_CLOSED_TODAY, wert);
  }
});

test("17 — null, leeres Array und fehlendes Feld ergeben keine Zeile (keine Behauptung)", () => {
  assert.equal(todayOpeningHoursText(null, FR), null);
  assert.equal(todayOpeningHoursText(undefined, FR), null);
  assert.equal(todayOpeningHoursText([], FR), null);
  assert.equal(todayOpeningHoursText({}, FR), null);
});

test("18 — ein Tag ohne Eintrag behauptet nichts (weder offen noch geschlossen)", () => {
  const nurFreitag = [{ dayName: "Freitag", workingHours: "08:30-19:30", workingDay: true }];
  assert.equal(todayOpeningHoursText(nurFreitag, SO), null, "Sonntag fehlt → keine Zeile");
});

test("19 — lunchBreak wird ausgewiesen, nicht verschluckt", () => {
  const h = [{ dayName: "Freitag", workingHours: "08:00-18:00", lunchBreak: "13:00-14:00", workingDay: true }];
  assert.equal(todayOpeningHoursText(h, FR), "Heute: 08:00–18:00 (Pause 13:00–14:00)");
});

test("20 — mehrere Einträge für denselben Tag werden zusammengeführt", () => {
  const h = [
    { dayName: "Freitag", workingHours: "08:00-12:00", workingDay: true },
    { dayName: "Freitag", workingHours: "14:00-18:00", workingDay: true },
  ];
  assert.equal(todayOpeningHoursText(h, FR), "Heute: 08:00–12:00 · 14:00–18:00");
});

test("21 — niemals wird ein Objekt roh gerendert", () => {
  const kaputt = [
    { dayName: "Freitag", workingHours: { unerwartet: true }, workingDay: true },
    { dayName: "Freitag", workingHours: [{ tief: 1 }], workingDay: true },
  ];
  const text = todayOpeningHoursText(kaputt, FR);
  assert.equal(text, null);
  const alles = JSON.stringify(normalizeOpeningHours(kaputt));
  assert.ok(!alles.includes("[object Object]"), "kein durchgereichtes Objekt");
  assert.ok(!alles.includes("unerwartet"), "kein Fremdfeld in der Anzeige");
});

test("22 — eine Von-/Bis-Objektform wird sicher zu Text, statt verworfen zu werden", () => {
  const h = [{ dayName: "Freitag", workingHours: { from: "09:00", to: "17:00" }, workingDay: true }];
  assert.equal(todayOpeningHoursText(h, FR), "Heute: 09:00–17:00");
});

test("23 — Alt-Format String bleibt lesbar (unverändertes Verhalten)", () => {
  assert.equal(todayOpeningHoursText("Mo-Fr 08:00-18:00", FR), "Mo-Fr 08:00–18:00");
  assert.equal(todayOpeningHoursText("   ", FR), null);
});

test("24 — Alt-Format String-Array bleibt lesbar (unverändertes Verhalten)", () => {
  assert.equal(todayOpeningHoursText(["Mo 08:00-18:00", "Sa 09:00-13:00"], FR), "Mo 08:00–18:00 · Sa 09:00–13:00");
  assert.equal(todayOpeningHoursText(["", "  "], FR), null);
});

test("25 — deutsche und englische Tagesnamen sowie Kurzformen werden erkannt", () => {
  for (const name of ["Freitag", "freitag", "Fr", "Fr.", "Friday", "fri"]) {
    const h = [{ dayName: name, workingHours: "08:30-19:30", workingDay: true }];
    assert.equal(todayOpeningHoursText(h, FR), "Heute: 08:30–19:30", name);
  }
});

test("26 — der Wochentag wird in Europe/Berlin bestimmt, nicht in UTC", () => {
  // 22:30 UTC am Freitag ist in Berlin bereits Samstag (Sommerzeit, UTC+2).
  const spaet = new Date("2026-08-07T22:30:00Z");
  assert.equal(berlinWeekdayIndex(spaet), 6, "Berlin: Samstag");
  assert.equal(spaet.getUTCDay(), 5, "UTC: Freitag — genau der Unterschied");
  const h = [
    { dayName: "Freitag", workingHours: "08:30-19:30", workingDay: true },
    { dayName: "Samstag", workingHours: "09:00-14:00", workingDay: true },
  ];
  assert.equal(todayOpeningHoursText(h, spaet), "Heute: 09:00–14:00");
  // Und im Winter (UTC+1) liegt die Grenze eine Stunde später.
  assert.equal(berlinWeekdayIndex(new Date("2026-01-09T23:30:00Z")), 6, "Winterzeit: 23:30 UTC = Samstag");
  assert.equal(berlinWeekdayIndex(new Date("2026-01-09T22:30:00Z")), 5, "Winterzeit: 22:30 UTC = noch Freitag");
});

test("27 — ein ungültiges Datum führt zu keiner Aussage statt zu einer falschen", () => {
  assert.equal(berlinWeekdayIndex(new Date("kein datum")), null);
  const h = [{ dayName: "Freitag", workingHours: "08:30-19:30", workingDay: true }];
  assert.equal(todayOpeningHoursText(h, new Date("kein datum")), null);
});

// ═══════════ 3 — ENTFERNUNG UND SORTIERUNG ══════════════════════════════════

test("28 — die drei echten Shops werden aufsteigend nach Entfernung sortiert", () => {
  const sortiert = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  assert.deepEqual(sortiert.map((s) => s.name), DPD_EXPECTED_ORDER);
  assert.deepEqual(sortiert.map((s) => s.distance), [2.570787, 2.957714, 3.462022]);
});

test("29 — gleiche Entfernungen behalten ihre ursprüngliche Reihenfolge", () => {
  const items = [
    { name: "A", distance: 2 }, { name: "B", distance: 1 }, { name: "C", distance: 2 },
    { name: "D", distance: 1 }, { name: "E", distance: 2 },
  ];
  assert.deepEqual(sortAccessPointsByDistance(items).map((x) => x.name), ["B", "D", "A", "C", "E"]);
});

test("30 — Einträge ohne Entfernung gehen nicht verloren, sondern hängen hinten an", () => {
  const items = [
    { name: "ohne1" }, { name: "fern", distance: 9 }, { name: "ohne2", distance: null },
    { name: "nah", distance: 1 }, { name: "ohne3", distance: "keine Zahl" },
  ];
  const sortiert = sortAccessPointsByDistance(items);
  assert.equal(sortiert.length, items.length, "kein Eintrag darf verschwinden");
  assert.deepEqual(sortiert.map((x) => x.name), ["nah", "fern", "ohne1", "ohne2", "ohne3"]);
});

test("31 — numerische Strings werden als Zahl sortiert, nicht als Text", () => {
  const items = [{ name: "10", distance: "10" }, { name: "9", distance: "9" }, { name: "2,5", distance: "2,5" }];
  assert.deepEqual(sortAccessPointsByDistance(items).map((x) => x.name), ["2,5", "9", "10"]);
});

test("32 — die Sortierung erzeugt eine neue Liste und lässt die Eingabe unberührt", () => {
  const items = [{ name: "B", distance: 2 }, { name: "A", distance: 1 }];
  const sortiert = sortAccessPointsByDistance(items);
  assert.deepEqual(items.map((x) => x.name), ["B", "A"], "die Eingabeliste bleibt, wie sie war");
  assert.notEqual(sortiert, items);
  assert.equal(sortiert[0], items[1], "die Elemente selbst werden nicht kopiert");
});

test("33 — Nicht-Arrays ergeben eine leere Liste statt eines Absturzes", () => {
  for (const v of [null, undefined, {}, "abc", 5]) assert.deepEqual(sortAccessPointsByDistance(v), []);
});

test("34 — Entfernungen werden gelesen, nie berechnet", () => {
  assert.equal(toDistanceNumber(2.570787), 2.570787);
  assert.equal(toDistanceNumber("2.5"), 2.5);
  assert.equal(toDistanceNumber("2,5"), 2.5);
  assert.equal(toDistanceNumber("  3  "), 3);
  for (const v of [null, undefined, "", "   ", "abc", {}, [], NaN, Infinity, true]) {
    assert.equal(toDistanceNumber(v), null, JSON.stringify(v));
  }
});

test("35 — die Entfernung wird deutsch formatiert, die Einheit kommt von JUMiNGO", () => {
  assert.equal(formatDistance(2.570787, "km"), "2,6 km");
  assert.equal(formatDistance(2.957714, "km"), "3,0 km");
  assert.equal(formatDistance(3.462022, "km"), "3,5 km");
  assert.equal(formatDistance(1234.5, "km"), "1.234,5 km");
  assert.equal(formatDistance(1.5, "mi"), "1,5 mi", "distanceCode wird verbatim übernommen");
  assert.equal(formatDistance(1.5, null), "1,5 km", "sinnvoller Default ohne distanceCode");
  assert.equal(formatDistance(null, "km"), null);
});

test("36 — 2,957714 und 3,462022 dürfen nicht beide als dieselbe Zahl erscheinen", () => {
  // Genau dieser Fall war der Beleg dafür, dass die alte Suche einen anderen
  // Mittelpunkt benutzte: der Kunde sah zweimal denselben Wert.
  assert.notEqual(formatDistance(2.957714, "km"), formatDistance(3.462022, "km"));
});

// ═══════════ 4 — ERGEBNISZAHLEN ═════════════════════════════════════════════

test("37 — die Liste sagt, wie viel von wie viel sie zeigt", () => {
  assert.equal(accessPointCountLabel(5, 20), "5 von 20 Paketshops");
  assert.equal(accessPointCountLabel(20, 20), "20 Paketshops");
  assert.equal(accessPointCountLabel(3, 3), "3 Paketshops");
  assert.equal(accessPointCountLabel(1, 1), "1 Paketshop");
  assert.equal(accessPointCountLabel(1, 4), "1 von 4 Paketshops");
});

test("38 — die Zahl der weiteren Treffer steht im Buttontext", () => {
  assert.equal(moreAccessPointsLabel(15), "Weitere 15 Paketshops anzeigen");
  assert.equal(moreAccessPointsLabel(1), "Weitere 1 Paketshop anzeigen");
  assert.equal(moreAccessPointsLabel(0), "Weitere 0 Paketshops anzeigen");
});

// ═══════════ 5 — ES WIRD NICHT GEFILTERT ════════════════════════════════════

test("39 — kein Shop wird lokal entfernt, auch nicht „schließt bald“ oder „Geschlossen“", () => {
  const items = [
    ...DPD_ACCESS_POINTS,
    { name: "Zu", distance: 4, workState: "Geschlossen" },
    { name: "Ohne Status", distance: 5 },
  ];
  const sortiert = sortAccessPointsByDistance(items);
  assert.equal(sortiert.length, items.length);
  const namen = sortiert.map((s) => s.name);
  for (const n of ["AYDESIGNZ", "K naro Supermarket", "Zu", "Ohne Status"]) {
    assert.ok(namen.includes(n), `${n} darf nicht herausgefiltert werden`);
  }
});
