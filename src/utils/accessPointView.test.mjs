/* Tests für die Paketshop-Anzeige (utils/accessPointView.mjs).

   Grundlage ist ein echter JUMiNGO-Mitschnitt (siehe tests/fixtures/
   accessPointsDpd.mjs). Zwei Dinge prüfen diese Tests bewusst NICHT, weil das
   Frontend sie nicht tun darf:
     • ob ein Shop gerade offen ist — das entscheidet JUMiNGO über workState
     • wie weit ein Shop entfernt ist — das liefert JUMiNGO über distance

   WICHTIGE KORREKTUR: Eine frühere Fassung dieser Datei enthielt eine
   workState-basierte „Eligibility“-Stufe (accessPointEligibility() /
   isUsableAccessPoint() / splitAccessPointsByEligibility()), die
   workState === "Geschlossen" als generellen Sichtbarkeits-Filter behandelte.
   Ein direkter 1:1-Vergleich mit JUMiNGOs eigener Oberfläche hat das
   widerlegt: bei „Alle Öffnungszeiten“ zeigt JUMiNGO dieselbe Menge wie die
   Rohantwort. Die Funktionen sind ersatzlos entfernt; workState ist jetzt
   ausschließlich Darstellung (Abschnitt 1). Siehe Git-Historie für die
   entfernte Eligibility-Stufe.

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
  OPENING_FILTER_ALL,
  OPENING_FILTER_SUNDAY,
  OPENING_FILTER_BEFORE_0730,
  OPENING_FILTER_AFTER_2100,
  OPENING_FILTER_OPTIONS,
  parseWorkingHourRanges,
  accessPointOpensOnSunday,
  accessPointOpensBefore0730,
  accessPointOpensAfter2100,
  matchesOpeningFilter,
  filterAccessPointsByOpening,
  openingFilterCountLabel,
  openingFilterExcludedLabel,
  openingFilterEmptyText,
} from "./accessPointView.mjs";
import {
  DPD_ACCESS_POINTS, DPD_EXPECTED_SORTED, DPD_WORKSTATE_CLOSED,
  DPD_EXPECTED_SUNDAY, DPD_EXPECTED_BEFORE_0730, DPD_EXPECTED_AFTER_2100, FREITAG,
} from "../../tests/fixtures/accessPointsDpd.mjs";

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

test("28 — alle echten Shops werden aufsteigend nach Entfernung sortiert", () => {
  const sortiert = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  assert.deepEqual(sortiert.map((s) => s.name), DPD_EXPECTED_SORTED);
  assert.equal(sortiert.length, DPD_ACCESS_POINTS.length, "Sortieren entfernt nichts");
  const werte = sortiert.map((s) => s.distance);
  for (let i = 1; i < werte.length; i++) assert.ok(werte[i - 1] <= werte[i], "aufsteigend");
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

test("37 — die Zahlen beschreiben die tatsächlich gelieferte Menge, keine Nutzbarkeit", () => {
  // Bei 20 Treffern und initial 5 sichtbar: „5 von 20 Paketshops“ — kein Wort
  // „verfügbar“/„nutzbar“, denn das würde eine aus workState abgeleitete
  // Aussage behaupten, die es nicht mehr gibt.
  assert.equal(accessPointCountLabel(5, 20), "5 von 20 Paketshops");
  assert.equal(accessPointCountLabel(20, 20), "20 Paketshops");
  assert.equal(accessPointCountLabel(3, 3), "3 Paketshops");
  assert.equal(accessPointCountLabel(1, 1), "1 Paketshop");
  assert.equal(accessPointCountLabel(1, 4), "1 von 4 Paketshops");
  assert.equal(accessPointCountLabel(0, 0), "Keine Paketshops gefunden");
  for (const label of [accessPointCountLabel(5, 20), accessPointCountLabel(20, 20)]) {
    assert.ok(!/verfügbar|nutzbar/i.test(label), label);
  }
});

test("38 — die Zahl der weiteren Treffer steht im Buttontext", () => {
  assert.equal(moreAccessPointsLabel(15), "Weitere 15 Paketshops anzeigen");
  assert.equal(moreAccessPointsLabel(1), "Weitere 1 Paketshop anzeigen");
  assert.equal(moreAccessPointsLabel(0), "Weitere 0 Paketshops anzeigen");
});

// ═══════════ 5 — WORKSTATE IST REINE DARSTELLUNG (kein Sichtbarkeits-Gate) ══
//
// WICHTIGE KORREKTUR: Eine frühere Fassung filterte hier über eine
// „Eligibility“-Stufe, die workState === "Geschlossen" als generelles
// Sichtbarkeitsmerkmal behandelte (zusätzlich carrier-spezifisch nur für
// DPD). Ein direkter 1:1-Vergleich mit JUMiNGOs eigener Oberfläche hat das
// widerlegt:
//
//   DPD, Weiherstraße 25, 73207 Plochingen, 10 km, „Alle Öffnungszeiten“
//   → JUMiNGO zeigt DEUTLICH MEHR als die 2 Shops, die eine workState-Filterung
//     übrig gelassen hätte — dieselbe Menge wie die Rohantwort.
//
// Die vier hier geprüften Regeln ersetzen die alte Eligibility-Suite:
//
//   1 — „Alle Öffnungszeiten“ entfernt KEINEN Shop aufgrund von workState.
//   2 — Normalisierung entfernt keine technisch gültigen Shops.
//   3 — Sortierung entfernt keine Shops.
//   4 — hoursOfOperation wird NUR von den drei expliziten Öffnungszeitenfiltern
//       gelesen — workState dient ausschließlich der Statusdarstellung.

test("39 — Normalisierung/Sortierung behalten jeden technisch gültigen Shop, unabhängig von workState", () => {
  const items = [
    ...DPD_ACCESS_POINTS,
    { name: "Zu", distance: 4, workState: "Geschlossen" },
    { name: "Ohne Status", distance: 5 },
  ];
  const sortiert = sortAccessPointsByDistance(items);
  assert.equal(sortiert.length, items.length, "die Sortierstufe ist kein Filter");
  const namen = sortiert.map((s) => s.name);
  for (const n of [...DPD_EXPECTED_SORTED, "Zu", "Ohne Status"]) {
    assert.ok(namen.includes(n), `${n} darf beim Sortieren nicht verschwinden`);
  }
});

test("40 — DPD-Paketstation wird korrekt in die Gesamtliste einsortiert (2,571 km)", () => {
  const sortiert = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const idx = sortiert.findIndex((s) => s.name === "DPD-Paketstation");
  assert.equal(idx, 2, "an dritter Stelle — nach Kopier und Werbestudio (0,579) und Intermarkt (0,893)");
  assert.equal(sortiert[idx].distance, 2.5707870263878085);
});

test("41 — workState „Geschlossen“ bleibt ein regulärer, sichtbarer Treffer", () => {
  for (const v of ["Geschlossen", "geschlossen", "GESCHLOSSEN", "closed", "CLOSED"]) {
    const s = normalizeAccessPointWorkState(v);
    assert.equal(s.label, "Geschlossen", v);
    assert.equal(s.badgeClass, "badge badge--neutral", v);
    assert.equal(s.known, true, v);
    // Es gibt keine Funktion mehr, die aus diesem Wert „nicht sichtbar“ macht —
    // der Beleg ist, dass keine solche Funktion im Modul existiert (siehe
    // Import-Liste oben: accessPointEligibility/isUsableAccessPoint sind weg).
  }
});

test("42 — workState „Geöffnet“ bleibt sichtbar", () => {
  const s = normalizeAccessPointWorkState("Geöffnet");
  assert.equal(s.label, "Geöffnet");
  assert.equal(s.badgeClass, "badge badge--success");
});

test("43 — workState „Schließt bald“ bleibt sichtbar", () => {
  const s = normalizeAccessPointWorkState("schließt bald");
  assert.equal(s.label, "Schließt bald");
  assert.equal(s.badgeClass, "badge badge--warning");
});

test("44 — ein unbekannter workState bleibt sichtbar (kein Sonderweg gegenüber „Geschlossen“)", () => {
  const s = normalizeAccessPointWorkState("irgendwas_neues");
  assert.equal(s.label, WORK_STATE_UNKNOWN_LABEL);
  assert.equal(s.known, false);
  assert.ok(!s.label.includes("irgendwas_neues"));
});

test("45 — Referenzfall: die vollständige DPD-Antwort bleibt bei „Alle Öffnungszeiten“ vollständig (20 von 20)", () => {
  // Genau TEIL 14 der Aufgabenstellung: 20 rein, 20 raus, sortiert, kein
  // einziger Shop verschwindet wegen workState.
  const sortiert = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const r = filterAccessPointsByOpening(sortiert, OPENING_FILTER_ALL);
  assert.equal(r.filtered, false);
  assert.equal(r.matching.length, 20);
  assert.equal(r.excluded.length, 0);
  assert.deepEqual(r.matching.map((s) => s.name), DPD_EXPECTED_SORTED);
  // Der erste sichtbare 5er-Block entspricht exakt TEIL 3 der Aufgabenstellung.
  assert.deepEqual(r.matching.slice(0, 5).map((s) => s.name), [
    "Kopier und Werbestudio", "Intermarkt", "DPD-Paketstation",
    "NKD Deutschland GmbH", "Änderungsschneiderei Sadra",
  ]);
  assert.deepEqual(r.matching.slice(5, 8).map((s) => s.name), [
    "AYDESIGNZ", "K naro Supermarket", "Aral Tankstelle LD DPD-Paketstation",
  ]);
});

test("46 — Kopier und Werbestudio bleibt bei „Alle Öffnungszeiten“ sichtbar, mit Status und Öffnungszeit", () => {
  const s = DPD_ACCESS_POINTS.find((x) => x.name === "Kopier und Werbestudio");
  const r = filterAccessPointsByOpening(sortAccessPointsByDistance(DPD_ACCESS_POINTS), OPENING_FILTER_ALL);
  assert.ok(r.matching.includes(s));
  assert.equal(s.workState, "Geschlossen");
  assert.equal(normalizeAccessPointWorkState(s.workState).label, "Geschlossen");
  assert.equal(todayOpeningHoursText(s.hoursOfOperation, FR), "Heute: 10:00–17:00");
});

test("47 — Intermarkt bleibt sichtbar", () => {
  const s = DPD_ACCESS_POINTS.find((x) => x.name === "Intermarkt");
  const r = filterAccessPointsByOpening(sortAccessPointsByDistance(DPD_ACCESS_POINTS), OPENING_FILTER_ALL);
  assert.ok(r.matching.includes(s));
  assert.equal(s.workState, "Geschlossen");
});

test("48 — NKD Deutschland GmbH bleibt sichtbar (beide Einträge)", () => {
  // Der Name kommt zweimal vor (2,66 km „Geschlossen“, 5,25 km „schließt
  // bald“) — beide müssen erhalten bleiben, Objektidentität statt Namen.
  const treffer = DPD_ACCESS_POINTS.filter((x) => x.name === "NKD Deutschland GmbH");
  assert.equal(treffer.length, 2);
  const r = filterAccessPointsByOpening(sortAccessPointsByDistance(DPD_ACCESS_POINTS), OPENING_FILTER_ALL);
  for (const t of treffer) assert.ok(r.matching.includes(t), `${t.distance} km muss erhalten bleiben`);
});

test("49 — Änderungsschneiderei Sadra bleibt sichtbar", () => {
  const s = DPD_ACCESS_POINTS.find((x) => x.name === "Änderungsschneiderei Sadra");
  const r = filterAccessPointsByOpening(sortAccessPointsByDistance(DPD_ACCESS_POINTS), OPENING_FILTER_ALL);
  assert.ok(r.matching.includes(s));
  assert.equal(s.workState, "Geschlossen");
});

test("50 — AYDESIGNZ bleibt sichtbar", () => {
  const s = DPD_ACCESS_POINTS.find((x) => x.name === "AYDESIGNZ");
  const r = filterAccessPointsByOpening(sortAccessPointsByDistance(DPD_ACCESS_POINTS), OPENING_FILTER_ALL);
  assert.ok(r.matching.includes(s));
  assert.equal(s.workState, "schließt bald");
});

test("51 — K naro Supermarket bleibt sichtbar", () => {
  const s = DPD_ACCESS_POINTS.find((x) => x.name === "K naro Supermarket");
  const r = filterAccessPointsByOpening(sortAccessPointsByDistance(DPD_ACCESS_POINTS), OPENING_FILTER_ALL);
  assert.ok(r.matching.includes(s));
  assert.equal(s.workState, "schließt bald");
});

test("52 — alle 10 Shops mit workState „Geschlossen“ bleiben bei „Alle Öffnungszeiten“ sichtbar", () => {
  const r = filterAccessPointsByOpening(sortAccessPointsByDistance(DPD_ACCESS_POINTS), OPENING_FILTER_ALL);
  const sichtbar = r.matching.map((s) => s.name);
  assert.equal(DPD_WORKSTATE_CLOSED.length, 10);
  for (const n of DPD_WORKSTATE_CLOSED) assert.ok(sichtbar.includes(n), `${n} muss sichtbar bleiben`);
});

test("53 — es gibt keine DPD-spezifische Sonderbehandlung von workState mehr", () => {
  // Beleg über Abwesenheit: die Modulschnittstelle exportiert keine Funktion
  // mehr, die einen carrierCode entgegennimmt, um workState zu bewerten.
  assert.equal(typeof accessPointCountLabel, "function");
  // filterAccessPointsByOpening kennt nur (items, filter) — kein Carrier.
  assert.equal(filterAccessPointsByOpening.length, 2);
  assert.equal(matchesOpeningFilter.length, 2);
  // DPD und ein beliebiger anderer (fiktiver) Carrier ergeben für denselben
  // Datensatz und denselben Filter IMMER dieselbe Menge — es gibt keinen
  // Code-Pfad mehr, der den Carrier überhaupt liest.
  const sortiert = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const alle = filterAccessPointsByOpening(sortiert, OPENING_FILTER_ALL).matching;
  assert.equal(alle.length, 20);
});

test("54 — UPS/GLS/DHL Express benötigen keinen Eligibility-Sonderfall mehr", () => {
  // Es gibt keinen Parameter, über den ein Carrier UPS/GLS/DHL Express
  // anders behandeln könnte als DPD — die Funktionen kennen `carrierCode`
  // an keiner Stelle. workState ist für jeden Carrier gleichermaßen reine
  // Darstellung.
  const sortiert = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const r1 = filterAccessPointsByOpening(sortiert, OPENING_FILTER_ALL);
  const r2 = filterAccessPointsByOpening(sortiert, OPENING_FILTER_ALL);
  assert.deepEqual(r1.matching.map((s) => s.name), r2.matching.map((s) => s.name));
  assert.equal(r1.matching.length, 20, "unabhängig von jedem gedachten Carrier bleiben alle 20 sichtbar");
});

// ═══════════ 6 — ÖFFNUNGSZEITENFILTER (JUMiNGOs vier Optionen) ══════════════
//
// Der frühere Haken „Nur aktuell geöffnete Shops“ ist ersatzlos entfallen —
// JUMiNGO kennt ihn nicht. An seiner Stelle stehen vier Merkmale, die eine
// EIGENSCHAFT des Shops beschreiben, nicht seinen Zustand gerade jetzt.
// Deshalb kommt in diesem ganzen Abschnitt keine aktuelle Uhrzeit vor.
//
// Ein direkter 1:1-Vergleich mit JUMiNGOs eigener Oberfläche hat die drei
// Spezialfilter (Sonntag/vor 7:30/nach 21:00) als bereits korrekt bestätigt —
// diese Logik (accessPointOpensOnSunday/-Before0730/-After2100) ist deshalb
// UNVERÄNDERT. Geändert hat sich nur die Eingabe: statt der (jetzt entfallenen)
// eligibility-gefilterten Teilmenge läuft der Filter auf der VOLLEN sortierten
// Liste — mit identischem Ergebnis, weil kein einziger Sonntags-/Früh-/Spät-
// Treffer in dieser Fixture workState „Geschlossen“ trägt.

const shopMit = (...tage) => ({
  hoursOfOperation: ["Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag", "Sonntag"]
    .map((dayName, i) => ({
      dayName,
      workingHours: tage[i] ?? "Geschlossen",
      lunchBreak: null,
      workingDay: (tage[i] ?? "Geschlossen") !== "Geschlossen",
    })),
});
const anAllenTagen = (h) => shopMit(h, h, h, h, h, h, h);

test("55 — das Dropdown hat exakt vier Optionen in JUMiNGOs Reihenfolge", () => {
  assert.equal(OPENING_FILTER_OPTIONS.length, 4);
  assert.deepEqual(OPENING_FILTER_OPTIONS.map((o) => o.label), [
    "Alle Öffnungszeiten", "Sonntags geöffnet", "Offen vor 7:30 Uhr", "Offen nach 21:00 Uhr",
  ]);
  assert.deepEqual(OPENING_FILTER_OPTIONS.map((o) => o.value), [
    "all", "sunday", "before_0730", "after_2100",
  ]);
  // Kein sichtbarer Text verrät den internen Wert.
  for (const o of OPENING_FILTER_OPTIONS) assert.ok(!/[a-z]+_[a-z0-9]+/.test(o.label), o.label);
  // Und es gibt bewusst KEINE Option „Nur aktuell geöffnet“.
  assert.ok(!OPENING_FILTER_OPTIONS.some((o) => /aktuell/i.test(o.label)));
  assert.equal(OPENING_FILTER_ALL, "all", "der Standard ist die erste Option");
  assert.equal(OPENING_FILTER_OPTIONS[0].value, OPENING_FILTER_ALL);
});

// ── A — ALLE ÖFFNUNGSZEITEN ────────────────────────────────────────────────

test("56 (A) — „Alle Öffnungszeiten“ filtert nachweislich nichts, auch keinen „Geschlossen“-Shop", () => {
  const alle = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const r = filterAccessPointsByOpening(alle, OPENING_FILTER_ALL);
  assert.equal(r.filtered, false, "die Stufe meldet sich ausdrücklich als inaktiv");
  assert.equal(r.matching, alle, "es wird nicht einmal eine neue Liste gebaut");
  assert.equal(r.excluded.length, 0);
  assert.equal(r.matching.length, 20);
  // Unbekannte/kaputte Filterwerte verhalten sich genauso — nie fail-closed.
  for (const v of [undefined, null, "", "kaputt", 5, {}]) {
    assert.equal(filterAccessPointsByOpening(alle, v).matching.length, alle.length, String(v));
  }
});

// ── B — SONNTAGS GEÖFFNET (unverändert korrekt, siehe Kopfkommentar) ───────

test("57 (B) — Sonntag mit echter Öffnungszeit → sichtbar", () => {
  assert.equal(accessPointOpensOnSunday(shopMit(null, null, null, null, null, null, "10:00-16:00")), true);
  assert.equal(accessPointOpensOnSunday(anAllenTagen("00:01-23:59")), true);
});

test("58 (B) — Sonntag mit workingDay: false → nicht sichtbar", () => {
  const shop = { hoursOfOperation: [{ dayName: "Sonntag", workingHours: "10:00-16:00", workingDay: false }] };
  assert.equal(accessPointOpensOnSunday(shop), false, "das Flag schlägt die Zeitangabe");
});

test("59 (B) — Sonntag „Geschlossen“ → nicht sichtbar", () => {
  assert.equal(accessPointOpensOnSunday(shopMit("09:00-18:00", null, null, null, null, null, "Geschlossen")), false);
  const nurWort = { hoursOfOperation: [{ dayName: "Sonntag", workingHours: "Geschlossen", workingDay: true }] };
  assert.equal(accessPointOpensOnSunday(nurWort), false, "auch ohne das Flag zählt das Wort");
});

test("60 (B) — leere Sonntagszeit und fehlender Sonntagseintrag → nicht sichtbar", () => {
  for (const wert of ["", "   ", "-", null]) {
    const shop = { hoursOfOperation: [{ dayName: "Sonntag", workingHours: wert, workingDay: true }] };
    assert.equal(accessPointOpensOnSunday(shop), false, JSON.stringify(wert));
  }
  const ohneSonntag = { hoursOfOperation: [{ dayName: "Montag", workingHours: "09:00-18:00", workingDay: true }] };
  assert.equal(accessPointOpensOnSunday(ohneSonntag), false);
});

test("61 (B) — Referenzfall auf der vollen Liste: dieselben drei Shops sind sonntags geöffnet", () => {
  const alle = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const r = filterAccessPointsByOpening(alle, OPENING_FILTER_SUNDAY);
  assert.equal(r.filtered, true);
  assert.deepEqual(r.matching.map((s) => s.name), DPD_EXPECTED_SUNDAY);
  assert.deepEqual(r.matching.map((s) => s.name), [
    "DPD-Paketstation", "Aral Tankstelle LD DPD-Paketstation", "Sonnenstudio Soleil",
  ]);
  assert.equal(r.excluded.length, 17, "die übrigen 17 der VOLLEN Liste sind sonntags zu");
  assert.equal(r.matching.length + r.excluded.length, alle.length, "nichts geht verloren");
});

// ── C — OFFEN VOR 7:30 UHR (unverändert korrekt, siehe Kopfkommentar) ──────

test("62 (C) — 06:00 und 07:00 zählen als „offen vor 7:30“", () => {
  assert.equal(accessPointOpensBefore0730(anAllenTagen("06:00-18:00")), true);
  assert.equal(accessPointOpensBefore0730(anAllenTagen("07:00-17:00")), true);
});

test("63 (C) — 07:29 zählt noch, 07:30 nicht mehr", () => {
  assert.equal(accessPointOpensBefore0730(anAllenTagen("07:29-20:00")), true);
  assert.equal(accessPointOpensBefore0730(anAllenTagen("07:30-20:00")), false,
    "exakt 07:30 ist nicht VOR 07:30");
});

test("64 (C) — 08:00 zählt nicht, 00:01 zählt", () => {
  assert.equal(accessPointOpensBefore0730(anAllenTagen("08:00-20:00")), false);
  assert.equal(accessPointOpensBefore0730(anAllenTagen("00:01-23:59")), true);
});

test("65 (C) — ein einziger früher Tag in der Woche genügt", () => {
  // Nur der Samstag öffnet früh — die Eigenschaft gilt trotzdem.
  const shop = shopMit("09:00-18:00", "09:00-18:00", "09:00-18:00", "09:00-18:00", "09:00-18:00", "06:30-12:00", "Geschlossen");
  assert.equal(accessPointOpensBefore0730(shop), true);
});

test("66 (C) — Referenzfall auf der vollen Liste: nur die beiden Paketstationen öffnen vor 7:30", () => {
  const alle = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const r = filterAccessPointsByOpening(alle, OPENING_FILTER_BEFORE_0730);
  assert.deepEqual(r.matching.map((s) => s.name), DPD_EXPECTED_BEFORE_0730);
  assert.deepEqual(r.matching.map((s) => s.name), ["DPD-Paketstation", "Aral Tankstelle LD DPD-Paketstation"]);
  // Der echte Grenzfall: gaumenfreuden öffnet um exakt 07:30 und zählt nicht —
  // unabhängig davon, dass sein workState „Geschlossen“ ist.
  const gauf = DPD_ACCESS_POINTS.find((s) => s.name === "gaumenfreuden");
  assert.equal(gauf.hoursOfOperation[0].workingHours, "07:30-16:30", "Rohwert aus dem Mitschnitt");
  assert.equal(accessPointOpensBefore0730(gauf), false);
});

// ── D — OFFEN NACH 21:00 UHR (unverändert korrekt, siehe Kopfkommentar) ────

test("67 (D) — Ende 22:00, 23:59 und 21:01 zählen als „offen nach 21:00“", () => {
  assert.equal(accessPointOpensAfter2100(anAllenTagen("09:00-22:00")), true);
  assert.equal(accessPointOpensAfter2100(anAllenTagen("00:01-23:59")), true);
  assert.equal(accessPointOpensAfter2100(anAllenTagen("09:00-21:01")), true);
});

test("68 (D) — Ende 21:00 und 20:59 zählen nicht", () => {
  assert.equal(accessPointOpensAfter2100(anAllenTagen("09:00-21:00")), false,
    "exakt 21:00 ist nicht NACH 21:00");
  assert.equal(accessPointOpensAfter2100(anAllenTagen("09:00-20:59")), false);
});

test("69 (D) — ein Bereich über Mitternacht (18:00–01:00) zählt", () => {
  assert.equal(accessPointOpensAfter2100(anAllenTagen("18:00-01:00")), true);
  assert.equal(accessPointOpensAfter2100(anAllenTagen("22:00-06:00")), true);
  // Derselbe Bereich deckt auch den frühen Morgen ab und zählt deshalb
  // konsequenterweise ebenso als „offen vor 7:30“.
  assert.equal(accessPointOpensBefore0730(anAllenTagen("18:00-01:00")), true);
});

test("70 (D) — Referenzfall auf der vollen Liste: nur die beiden Paketstationen haben nach 21:00 offen", () => {
  const alle = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const r = filterAccessPointsByOpening(alle, OPENING_FILTER_AFTER_2100);
  assert.deepEqual(r.matching.map((s) => s.name), DPD_EXPECTED_AFTER_2100);
  // Sonnenstudio Soleil und AWG schließen um 20:00 — knapp daneben.
  const soleil = DPD_ACCESS_POINTS.find((s) => s.name === "Sonnenstudio Soleil");
  assert.equal(accessPointOpensAfter2100(soleil), false);
});

// ── E — ALLGEMEIN ──────────────────────────────────────────────────────────

test("71 (E) — mehrere Intervalle an einem Tag werden beide berücksichtigt", () => {
  const geteilt = anAllenTagen("07:00-12:00, 14:00-22:00");
  assert.equal(accessPointOpensBefore0730(geteilt), true, "das erste Intervall zählt");
  assert.equal(accessPointOpensAfter2100(geteilt), true, "das zweite Intervall zählt");
  // Auch andere Trenner und der Halbgeviertstrich.
  assert.equal(accessPointOpensAfter2100(anAllenTagen("09:00–12:00; 15:00–22:00")), true);
  assert.equal(accessPointOpensBefore0730(anAllenTagen("09:00-12:00 / 15:00-22:00")), false);
});

test("72 (E) — eine Mittagspause verändert die Eigenschaft nicht", () => {
  // Reale Form: Intermarkt hat 09:00-18:00 mit Pause 13:00-15:00.
  const inter = DPD_ACCESS_POINTS.find((s) => s.street === "Käthe-Kollwitz-Weg 4");
  assert.equal(inter.hoursOfOperation[0].lunchBreak, "13:00-15:00", "Rohwert aus dem Mitschnitt");
  assert.equal(accessPointOpensBefore0730(inter), false, "09:00 bleibt 09:00");
  assert.equal(accessPointOpensAfter2100(inter), false, "18:00 bleibt 18:00");
  // Eine Pause bis nach 21:00 darf keine späte Öffnung vortäuschen.
  const fies = {
    hoursOfOperation: [{ dayName: "Montag", workingHours: "09:00-18:00", lunchBreak: "21:30-22:30", workingDay: true }],
  };
  assert.equal(accessPointOpensAfter2100(fies), false, "die Pause wird nicht als Öffnungszeit gelesen");
});

test("73 (E) — fehlende oder kaputte hoursOfOperation stürzen nicht ab", () => {
  const faelle = [
    {}, { hoursOfOperation: null }, { hoursOfOperation: [] }, { hoursOfOperation: "kaputt" },
    { hoursOfOperation: [{ dayName: "Montag", workingHours: { unerwartet: true }, workingDay: true }] },
    { hoursOfOperation: [{ dayName: "Montag", workingHours: "25:99-99:99", workingDay: true }] },
    { hoursOfOperation: [{ dayName: "Montag", workingHours: "abc-def", workingDay: true }] },
    { hoursOfOperation: [null, 5, "text"] },
    null, undefined, "abc", 42,
  ];
  for (const f of faelle) {
    assert.equal(accessPointOpensOnSunday(f), false, JSON.stringify(f));
    assert.equal(accessPointOpensBefore0730(f), false, JSON.stringify(f));
    assert.equal(accessPointOpensAfter2100(f), false, JSON.stringify(f));
  }
  assert.deepEqual(parseWorkingHourRanges("Geschlossen"), []);
  assert.deepEqual(parseWorkingHourRanges(null), []);
  assert.deepEqual(parseWorkingHourRanges("24:00-25:00"), [], "unmögliche Uhrzeit wird verworfen");
});

test("74 (E) — die Filterstufe verliert nie einen Eintrag und sortiert nie um", () => {
  const alle = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  for (const f of [OPENING_FILTER_SUNDAY, OPENING_FILTER_BEFORE_0730, OPENING_FILTER_AFTER_2100]) {
    const r = filterAccessPointsByOpening(alle, f);
    assert.equal(r.matching.length + r.excluded.length, r.total, f);
    assert.equal(r.total, alle.length, f);
    const idx = (teil) => teil.map((s) => alle.indexOf(s));
    for (const teil of [r.matching, r.excluded]) {
      assert.ok(idx(teil).every((v, i, a) => i === 0 || a[i - 1] < v), `${f}: Reihenfolge erhalten`);
    }
  }
  for (const v of [null, undefined, "abc", 7]) {
    assert.deepEqual(filterAccessPointsByOpening(v, OPENING_FILTER_SUNDAY),
      { matching: [], excluded: [], total: 0, filtered: false });
  }
});

test("75 (E) — ein Shop mit workState „Geschlossen“ kann trotzdem einem Öffnungszeitenfilter entsprechen", () => {
  // Die Umkehrung des früheren (falschen) Tests: workState und Öffnungszeiten-
  // merkmal sind unabhängig. Ein „Geschlossen“-Shop, der sonntags öffnet,
  // MUSS im Sonntagsfilter erscheinen — genau das ist jetzt das gewünschte
  // Verhalten, nicht der Ausschluss.
  const sonntagsGeschlossen = {
    name: "Test-Geschlossen-aber-Sonntagsoffen", workState: "Geschlossen", distance: 1,
    hoursOfOperation: [{ dayName: "Sonntag", workingHours: "10:00-14:00", workingDay: true }],
  };
  assert.equal(accessPointOpensOnSunday(sonntagsGeschlossen), true);
  const r = filterAccessPointsByOpening([sonntagsGeschlossen], OPENING_FILTER_SUNDAY);
  assert.equal(r.matching.length, 1, "workState „Geschlossen“ darf den Öffnungszeitenfilter nicht überstimmen");
  assert.equal(r.matching[0], sonntagsGeschlossen);
});

test("76 (E) — der Filter kennt keine Uhrzeit und keinen heutigen Wochentag", () => {
  // Die Funktionen nehmen gar keinen Zeitparameter entgegen …
  assert.equal(accessPointOpensOnSunday.length, 1);
  assert.equal(accessPointOpensBefore0730.length, 1);
  assert.equal(accessPointOpensAfter2100.length, 1);
  assert.equal(matchesOpeningFilter.length, 2, "Access Point und Filterwert — keine Zeit");
  // … und liefern für denselben Shop immer dasselbe, egal wann.
  const shop = anAllenTagen("06:00-22:00");
  const vorher = [accessPointOpensOnSunday(shop), accessPointOpensBefore0730(shop), accessPointOpensAfter2100(shop)];
  assert.deepEqual(vorher, [true, true, true]);
  assert.deepEqual(
    [accessPointOpensOnSunday(shop), accessPointOpensBefore0730(shop), accessPointOpensAfter2100(shop)],
    vorher);
});

test("77 (E) — der Filter fasst workState nicht an", () => {
  const knaro = DPD_ACCESS_POINTS.find((s) => s.name === "K naro Supermarket");
  const vorher = normalizeAccessPointWorkState(knaro.workState);
  filterAccessPointsByOpening([knaro], OPENING_FILTER_SUNDAY);
  assert.deepEqual(normalizeAccessPointWorkState(knaro.workState), vorher);
  assert.equal(vorher.label, "Schließt bald");
  assert.equal(knaro.workState, "schließt bald", "der Rohwert bleibt unberührt");
});

// ── F — ZÄHLER UND LEERZUSTAND ─────────────────────────────────────────────

test("78 (F) — der Zähler bei aktivem Filter nennt die passende Menge", () => {
  assert.equal(openingFilterCountLabel(3, 3), "3 Paketshops mit passenden Öffnungszeiten");
  assert.equal(openingFilterCountLabel(5, 7), "5 von 7 Paketshops mit passenden Öffnungszeiten");
  assert.equal(openingFilterCountLabel(1, 1), "1 Paketshop mit passenden Öffnungszeiten");
  assert.equal(openingFilterCountLabel(0, 0), "Keine Paketshops mit passenden Öffnungszeiten");
});

test("79 (F) — die Randnotiz zum Öffnungszeitenfilter nennt nur diese eine Ursache", () => {
  assert.equal(openingFilterExcludedLabel(7), "7 weitere Paketshops haben andere Öffnungszeiten");
  assert.equal(openingFilterExcludedLabel(1), "1 weiterer Paketshop hat andere Öffnungszeiten");
  assert.equal(openingFilterExcludedLabel(0), null);
  assert.ok(!openingFilterExcludedLabel(7).includes("verfügbar"), "keine Nutzbarkeits-Sprache mehr");
});

test("80 (F) — der Leerzustand benennt den gewählten Filter", () => {
  assert.match(openingFilterEmptyText(OPENING_FILTER_SUNDAY), /Sonntags geöffnet/);
  assert.match(openingFilterEmptyText(OPENING_FILTER_BEFORE_0730), /Offen vor 7:30 Uhr/);
  assert.match(openingFilterEmptyText(OPENING_FILTER_AFTER_2100), /Offen nach 21:00 Uhr/);
  for (const f of [OPENING_FILTER_SUNDAY, OPENING_FILTER_BEFORE_0730, OPENING_FILTER_AFTER_2100]) {
    const t = openingFilterEmptyText(f);
    assert.ok(!/Keine Paketshops gefunden/.test(t), "gefunden wurden welche — sie passen nur nicht");
    assert.match(t, /Öffnungszeitenfilter/);
  }
});

test("81 (F) — die Referenzzahlen der vier Optionen stimmen auf der VOLLEN Liste", () => {
  const alle = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const zahl = (f) => filterAccessPointsByOpening(alle, f).matching.length;
  assert.equal(zahl(OPENING_FILTER_ALL), 20, "nicht mehr 10 — die Eligibility-Kürzung ist entfallen");
  assert.equal(zahl(OPENING_FILTER_SUNDAY), 3);
  assert.equal(zahl(OPENING_FILTER_BEFORE_0730), 2);
  assert.equal(zahl(OPENING_FILTER_AFTER_2100), 2);
  assert.equal(openingFilterCountLabel(3, zahl(OPENING_FILTER_SUNDAY)), "3 Paketshops mit passenden Öffnungszeiten");
  assert.equal(openingFilterExcludedLabel(20 - zahl(OPENING_FILTER_SUNDAY)),
    "17 weitere Paketshops haben andere Öffnungszeiten");
  assert.equal(accessPointCountLabel(5, zahl(OPENING_FILTER_ALL)), "5 von 20 Paketshops");
});
