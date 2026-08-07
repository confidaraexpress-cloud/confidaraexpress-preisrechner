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
  accessPointEligibility,
  isUsableAccessPoint,
  splitAccessPointsByEligibility,
  accessPointCountLabel,
  moreAccessPointsLabel,
  unavailableAccessPointsLabel,
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
  DPD_ACCESS_POINTS, DPD_EXPECTED_SORTED, DPD_EXPECTED_USABLE,
  DPD_EXPECTED_UNAVAILABLE, DPD_EXPECTED_SUNDAY, DPD_EXPECTED_BEFORE_0730,
  DPD_EXPECTED_AFTER_2100, FREITAG,
} from "../../tests/fixtures/accessPointsDpd.mjs";

// Ein Freitag und ein Sonntag, jeweils mittags in Europe/Berlin.
const FR = new Date(FREITAG);
const SO = new Date("2026-08-09T12:00:00+02:00");
const freitag = (workingHours) => [{ dayName: "Freitag", workingHours, lunchBreak: null, workingDay: true }];

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

test("37 — die Zahlen beziehen sich auf die VERFÜGBARE Menge, nicht auf die Rohantwort", () => {
  // Bei 20 Rohtreffern mit 10 nutzbaren wäre „5 von 20“ ein Versprechen, das
  // die Auswahl nicht hält.
  assert.equal(accessPointCountLabel(5, 10), "5 von 10 verfügbaren Paketshops");
  assert.equal(accessPointCountLabel(10, 10), "10 verfügbare Paketshops");
  assert.equal(accessPointCountLabel(3, 3), "3 verfügbare Paketshops");
  assert.equal(accessPointCountLabel(1, 1), "1 verfügbarer Paketshop");
  assert.equal(accessPointCountLabel(1, 4), "1 von 4 verfügbaren Paketshops");
  assert.equal(accessPointCountLabel(0, 0), "Keine verfügbaren Paketshops");
});

test("38 — die Zahl der weiteren Treffer steht im Buttontext", () => {
  assert.equal(moreAccessPointsLabel(15), "Weitere 15 Paketshops anzeigen");
  assert.equal(moreAccessPointsLabel(1), "Weitere 1 Paketshop anzeigen");
  assert.equal(moreAccessPointsLabel(0), "Weitere 0 Paketshops anzeigen");
});

test("39 — nicht verfügbare Shops werden benannt, nicht verschwiegen", () => {
  assert.equal(unavailableAccessPointsLabel(10), "10 weitere Paketshops derzeit nicht verfügbar");
  assert.equal(unavailableAccessPointsLabel(1), "1 weiterer Paketshop derzeit nicht verfügbar");
  assert.equal(unavailableAccessPointsLabel(0), null, "ohne Anlass keine Zeile");
  assert.equal(unavailableAccessPointsLabel(null), null);
  assert.equal(unavailableAccessPointsLabel(-3), null);
});

// ═══════════ 5 — NUTZBARKEIT (Eligibility) ══════════════════════════════════
//
// Der frühere Test „kein Shop wird lokal entfernt, auch nicht Geschlossen“ ist
// fachlich überholt: der HAR-Vergleich hat belegt, dass JUMiNGO genau diese
// Einträge nicht zur Auswahl stellt. An seine Stelle treten zwei STRENGERE
// Regeln, die zusammen mehr zusichern als die alte eine:
//
//   A — Normalisierung und Sortierung entfernen keine Shops.
//   B — Die explizite Eligibility-Stufe entfernt AUSSCHLIESSLICH bekannte
//       nicht nutzbare workState-Werte aus der Auswahl — UND NUR für einen
//       durch Messung verifizierten Carrier. Der Mitschnitt belegt die Regel
//       bislang ausschließlich für DPD; UPS, GLS und DHL Express sind NICHT
//       verifiziert und bleiben deshalb unabhängig von workState fail-open.
//
// `carrierCode` ist überall unten derselbe String, der auch den JUMiNGO-Request
// bestimmt ("dpd" | "ups" | "gls" | "dhlexpress", siehe carrierMap.js) — keine
// zweite, eigene Carrier-Ermittlung.

test("40 (A) — Sortieren entfernt nichts, auch keinen „Geschlossen“-Eintrag", () => {
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

test("41 (B) — DPD + „Geschlossen“/„closed“ ist nicht nutzbar (deutsch, klein, englisch)", () => {
  for (const v of ["Geschlossen", "geschlossen", "GESCHLOSSEN", "  Geschlossen  ", "closed", "CLOSED"]) {
    const e = accessPointEligibility({ workState: v }, "dpd");
    assert.equal(e.usable, false, v);
    assert.equal(e.reason, "work_state_closed", v);
    assert.equal(isUsableAccessPoint({ workState: v }, "dpd"), false, v);
  }
});

test("42 (B) — DPD + „Geöffnet“/„open“/„opened“ ist nutzbar", () => {
  for (const v of ["Geöffnet", "geöffnet", "GEÖFFNET", "open", "opened", "offen"]) {
    assert.equal(isUsableAccessPoint({ workState: v }, "dpd"), true, v);
  }
});

test("43 (B) — DPD + „schließt bald“ bleibt nutzbar und sichtbar", () => {
  for (const v of ["schließt bald", "Schließt bald", "SCHLIESST BALD", "schliesst bald", "closing soon"]) {
    assert.equal(isUsableAccessPoint({ workState: v }, "dpd"), true, v);
  }
});

test("44 (B) — DPD + unbekannt/fehlend/leer/Nicht-String → FAIL-OPEN nutzbar", () => {
  const faelle = [
    { workState: "temporarily_unavailable" }, { workState: "irgendwas_neues" },
    { workState: null }, { workState: undefined }, { workState: "" }, { workState: "   " },
    { workState: 0 }, { workState: 1 }, { workState: true }, { workState: false },
    { workState: {} }, { workState: [] }, { workState: ["Geschlossen"] },
    {}, { name: "ohne Status" },
  ];
  for (const f of faelle) {
    assert.equal(isUsableAccessPoint(f, "dpd"), true, JSON.stringify(f));
  }
  // Auch das Objekt selbst darf fehlen, ohne dass etwas verschwindet.
  for (const v of [null, undefined, {}, "", 0]) assert.equal(isUsableAccessPoint(v, "dpd"), true, String(v));
});

test("45 (B) — ein verschachteltes „Geschlossen“ blendet nichts aus (DPD)", () => {
  // Nur das eigene Feld workState zählt. Ein gleichlautender Wert an anderer
  // Stelle darf keinen Shop entfernen.
  assert.equal(isUsableAccessPoint({ name: "Geschlossen", workState: "Geöffnet" }, "dpd"), true);
  assert.equal(isUsableAccessPoint({ type: "Geschlossen", workState: "schließt bald" }, "dpd"), true);
  assert.equal(isUsableAccessPoint({ hoursOfOperation: [{ workingHours: "Geschlossen" }] }, "dpd"), true);
});

test("46 — Eligibility ist unabhängig von der Uhrzeit (DPD)", () => {
  const shop = { workState: "Geschlossen", hoursOfOperation: freitag("10:00-17:00") };
  // Derselbe Shop, vier verschiedene Zeitpunkte — identisches Ergebnis. Die
  // Funktion nimmt gar keine Zeit entgegen; hier wird belegt, dass sie auch
  // keine heimlich liest.
  const zeiten = [
    new Date("2026-08-07T09:00:00+02:00"), new Date("2026-08-07T16:06:00+02:00"),
    new Date("2026-08-07T18:00:00+02:00"), new Date("2026-08-09T03:00:00+02:00"),
  ];
  for (const t of zeiten) {
    void t;
    assert.equal(isUsableAccessPoint(shop, "dpd"), false, String(t));
  }
  assert.equal(accessPointEligibility.length, 2,
    "die Funktion nimmt Access Point und carrierCode entgegen — keinen Zeitparameter");
});

test("47 — Eligibility ist unabhängig von hoursOfOperation (DPD)", () => {
  // Innerhalb der Öffnungszeiten und trotzdem nicht nutzbar — genau der real
  // gemessene Fall (Kopier und Werbestudio, 10:00–17:00, um 16:06).
  const zu = { workState: "Geschlossen", hoursOfOperation: freitag("10:00-17:00") };
  assert.equal(isUsableAccessPoint(zu, "dpd"), false);
  assert.equal(todayOpeningHoursText(zu.hoursOfOperation, FR), "Heute: 10:00–17:00",
    "die Öffnungszeit bleibt daneben als Information korrekt");

  // Und umgekehrt: geschlossener Wochentag, aber nutzbar laut JUMiNGO.
  const offen = {
    workState: "Geöffnet",
    hoursOfOperation: [{ dayName: "Freitag", workingHours: null, workingDay: false }],
  };
  assert.equal(isUsableAccessPoint(offen, "dpd"), true);
  assert.equal(todayOpeningHoursText(offen.hoursOfOperation, FR), HOURS_CLOSED_TODAY);

  // Ganz ohne Öffnungszeiten ändert sich nichts.
  assert.equal(isUsableAccessPoint({ workState: "Geschlossen" }, "dpd"), false);
  assert.equal(isUsableAccessPoint({ workState: "Geöffnet" }, "dpd"), true);
});

test("48 — Eligibility kennt keine Namensheuristik (DPD)", () => {
  // Ein Laden ohne „DPD“ im Namen ist ein vollwertiger Access Point …
  assert.equal(isUsableAccessPoint({ name: "AYDESIGNZ", workState: "schließt bald" }, "dpd"), true);
  assert.equal(isUsableAccessPoint({ name: "K naro Supermarket", workState: "schließt bald" }, "dpd"), true);
  assert.equal(isUsableAccessPoint({ name: "Sonnenstudio Soleil", workState: "Geöffnet" }, "dpd"), true);
  // … und „DPD“ im Namen rettet einen nicht nutzbaren Punkt nicht.
  assert.equal(isUsableAccessPoint({ name: "DPD-Paketstation", workState: "Geschlossen" }, "dpd"), false);
});

test("49 — die Auswahlstufe ist eine eigene Stufe: nichts geht verloren (DPD)", () => {
  const { usable, unavailable, total } = splitAccessPointsByEligibility(DPD_ACCESS_POINTS, "dpd");
  assert.equal(total, DPD_ACCESS_POINTS.length);
  assert.equal(usable.length + unavailable.length, total, "die Summe bleibt vollständig");
  // Die Reihenfolge der Eingabe bleibt in beiden Teillisten erhalten. Verglichen
  // wird über die Objektidentität, NICHT über den Namen: „NKD Deutschland GmbH“
  // kommt in der echten Antwort zweimal vor.
  const reihenfolgeErhalten = (teil) =>
    teil.map((s) => DPD_ACCESS_POINTS.indexOf(s)).every((v, i, a) => i === 0 || a[i - 1] < v);
  assert.ok(reihenfolgeErhalten(usable), "die Auswahlstufe sortiert nicht um");
  assert.ok(reihenfolgeErhalten(unavailable), "auch die Restliste behält ihre Reihenfolge");
  for (const v of [null, undefined, "abc", 5]) {
    assert.deepEqual(splitAccessPointsByEligibility(v, "dpd"), { usable: [], unavailable: [], total: 0 });
  }
});

test("50 — Referenzfall: die echte DPD-Antwort ergibt JUMiNGOs sichtbare Liste", () => {
  // Die verbindliche Kette: normalisieren → sortieren → Eligibility (DPD).
  const sortiert = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const { usable, unavailable } = splitAccessPointsByEligibility(sortiert, "dpd");

  assert.deepEqual(usable.map((s) => s.name), DPD_EXPECTED_USABLE);
  assert.deepEqual(unavailable.map((s) => s.name), DPD_EXPECTED_UNAVAILABLE);
  assert.equal(usable.length, 10, "10 von 20 sind nutzbar");
  assert.equal(unavailable.length, 10, "10 × workState „Geschlossen“");

  // Die beiden NÄCHSTEN Treffer der Antwort werden nicht angeboten …
  const angeboten = usable.map((s) => s.name);
  for (const n of ["Kopier und Werbestudio", "Intermarkt", "Änderungsschneiderei Sadra"]) {
    assert.ok(!angeboten.includes(n), `${n} darf nicht angeboten werden`);
  }
  // … deshalb steht vorne der drittnächste Treffer.
  assert.equal(angeboten[0], "DPD-Paketstation", "vorher standen hier 0,579 km und 0,893 km");
  assert.equal(angeboten[1], "AYDESIGNZ");
  assert.equal(angeboten[2], "K naro Supermarket");
});

test("51 — die Zähler der Referenzantwort stimmen mit der Auswahl überein (DPD)", () => {
  const { usable, unavailable } = splitAccessPointsByEligibility(
    sortAccessPointsByDistance(DPD_ACCESS_POINTS), "dpd");
  assert.equal(usable.length, 10);
  assert.equal(unavailable.length, 10);
  // Genau der Fall aus der Aufgabenstellung: 20 roh, 10 nutzbar, 10 nicht.
  assert.equal(accessPointCountLabel(5, usable.length), "5 von 10 verfügbaren Paketshops");
  assert.equal(accessPointCountLabel(10, usable.length), "10 verfügbare Paketshops");
  assert.equal(moreAccessPointsLabel(usable.length - 5), "Weitere 5 Paketshops anzeigen");
  assert.equal(unavailableAccessPointsLabel(unavailable.length),
    "10 weitere Paketshops derzeit nicht verfügbar");
});

test("52 — die Anzeigebeschriftung bleibt von der Nutzbarkeit unberührt", () => {
  // „Geschlossen“ verschwindet aus der AUSWAHL, nicht aus dem Statusmodell:
  // der Wert bleibt normalisierbar (PR #303) und behält Text und Badge.
  const s = normalizeAccessPointWorkState("Geschlossen");
  assert.equal(s.label, "Geschlossen");
  assert.equal(s.badgeClass, "badge badge--neutral");
  assert.equal(s.known, true);
  // Die beiden Stufen sind getrennt: derselbe Wert, zwei verschiedene Fragen.
  assert.equal(isUsableAccessPoint({ workState: "Geschlossen" }, "dpd"), false);
  assert.equal(normalizeAccessPointWorkState("Geschlossen").key, "closed");
});

// ═══════════ 6 — CARRIER-SCOPE: NUR DPD IST VERIFIZIERT ═════════════════════
//
// Die Eligibility-Regel wurde ausschließlich mit echten DPD-Daten verifiziert.
// Für UPS, GLS und DHL Express liegt KEIN eigener Mitschnitt vor — ein Access
// Point dieser Carrier könnte unter „Geschlossen“ etwas anderes verstehen
// (z. B. eine echte, tageszeitabhängige Ladenöffnungszeit). Bis ein eigener
// Nachweis vorliegt, entfernt die Eligibility-Stufe dort NICHTS.

test("53 — DPD: „Geschlossen“ und „closed“ bleiben nicht nutzbar", () => {
  assert.equal(isUsableAccessPoint({ workState: "Geschlossen" }, "dpd"), false);
  assert.equal(isUsableAccessPoint({ workState: "closed" }, "dpd"), false);
});

test("54 — DPD: „Geöffnet“ und „schließt bald“ bleiben nutzbar", () => {
  assert.equal(isUsableAccessPoint({ workState: "Geöffnet" }, "dpd"), true);
  assert.equal(isUsableAccessPoint({ workState: "schließt bald" }, "dpd"), true);
});

test("55 — DPD: ein unbekannter Wert bleibt nutzbar (fail-open gilt auch hier)", () => {
  assert.equal(isUsableAccessPoint({ workState: "irgendwas_neues" }, "dpd"), true);
});

test("56 — UPS: „Geschlossen“ ist NICHT verifiziert und bleibt nutzbar", () => {
  const e = accessPointEligibility({ workState: "Geschlossen" }, "ups");
  assert.equal(e.usable, true);
  assert.equal(e.reason, "carrier_unverified");
  assert.equal(isUsableAccessPoint({ workState: "closed" }, "ups"), true);
});

test("57 — GLS: „Geschlossen“ ist NICHT verifiziert und bleibt nutzbar", () => {
  const e = accessPointEligibility({ workState: "Geschlossen" }, "gls");
  assert.equal(e.usable, true);
  assert.equal(e.reason, "carrier_unverified");
  assert.equal(isUsableAccessPoint({ workState: "closed" }, "gls"), true);
});

test("58 — DHL Express: „Geschlossen“ ist NICHT verifiziert und bleibt nutzbar", () => {
  // "dhlexpress" ist der exakte Code aus carrierMap.js (toAccessPointSearchCode
  // "dhl-express" → "dhlexpress"); kein Namens-Shortcut wie "dhl".
  const e = accessPointEligibility({ workState: "Geschlossen" }, "dhlexpress");
  assert.equal(e.usable, true);
  assert.equal(e.reason, "carrier_unverified");
  assert.equal(isUsableAccessPoint({ workState: "closed" }, "dhlexpress"), true);
});

test("59 — ein unbekannter/fehlender Carrier bleibt fail-open", () => {
  for (const carrier of ["hermes", "fedex", "DPD", "Dpd", " dpd ", "", null, undefined, 123, {}]) {
    // Groß-/Kleinschreibung und Whitespace NICHT normalisieren: „DPD“ (groß)
    // ist nicht derselbe Wert, den toAccessPointSearchCode liefert — die
    // Eligibility darf sich hier nicht großzügiger zeigen als der Request
    // selbst. " dpd " mit Leerraum ist ebenfalls nicht der exakte Code.
    if (carrier === "dpd") continue;
    assert.equal(isUsableAccessPoint({ workState: "Geschlossen" }, carrier), true, String(carrier));
  }
  // Ohne zweites Argument (Aufrufer vergisst carrierCode) — ebenfalls fail-open,
  // nie fail-closed. Ein fehlender Parameter darf nie zu weniger Shops führen.
  assert.equal(isUsableAccessPoint({ workState: "Geschlossen" }), true);
});

test("60 — splitAccessPointsByEligibility ist für nicht verifizierte Carrier eine reine Identität", () => {
  const items = DPD_ACCESS_POINTS; // enthält bekanntlich 4 „Geschlossen“-Einträge
  for (const carrier of ["ups", "gls", "dhlexpress", "hermes", undefined]) {
    const { usable, unavailable, total } = splitAccessPointsByEligibility(items, carrier);
    assert.equal(usable.length, total, `bei carrier=${carrier} darf nichts aussortiert werden`);
    assert.equal(unavailable.length, 0, `bei carrier=${carrier} darf keine Restliste entstehen`);
    assert.deepEqual(usable.map((s) => s.name), items.map((s) => s.name),
      `bei carrier=${carrier} bleibt die Reihenfolge der vollständigen Liste erhalten`);
  }
});

test("61 — derselbe Datensatz liefert bei DPD eine kleinere Auswahl als bei jedem anderen Carrier", () => {
  const sortiert = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const beiDpd = splitAccessPointsByEligibility(sortiert, "dpd");
  const beiUps = splitAccessPointsByEligibility(sortiert, "ups");
  assert.equal(beiDpd.usable.length, 10);
  assert.equal(beiUps.usable.length, 20, "ohne Verifikation bleibt die volle Menge nutzbar");
  assert.ok(beiDpd.usable.length < beiUps.usable.length);
});

// ═══════════ 7 — ÖFFNUNGSZEITENFILTER (JUMiNGOs vier Optionen) ══════════════
//
// Der frühere Haken „Nur aktuell geöffnete Shops“ ist ersatzlos entfallen —
// JUMiNGO kennt ihn nicht. An seiner Stelle stehen vier Merkmale, die eine
// EIGENSCHAFT des Shops beschreiben, nicht seinen Zustand gerade jetzt.
// Deshalb kommt in diesem ganzen Abschnitt keine aktuelle Uhrzeit vor.

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

test("62 — das Dropdown hat exakt vier Optionen in JUMiNGOs Reihenfolge", () => {
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

test("63 (A) — „Alle Öffnungszeiten“ filtert nachweislich nichts", () => {
  const usable = splitAccessPointsByEligibility(
    sortAccessPointsByDistance(DPD_ACCESS_POINTS), "dpd").usable;
  const r = filterAccessPointsByOpening(usable, OPENING_FILTER_ALL);
  assert.equal(r.filtered, false, "die Stufe meldet sich ausdrücklich als inaktiv");
  assert.equal(r.matching, usable, "es wird nicht einmal eine neue Liste gebaut");
  assert.equal(r.excluded.length, 0);
  // Unbekannte/kaputte Filterwerte verhalten sich genauso — nie fail-closed.
  for (const v of [undefined, null, "", "kaputt", 5, {}]) {
    assert.equal(filterAccessPointsByOpening(usable, v).matching.length, usable.length, String(v));
  }
});

test("64 (A) — die bekannte DPD-Reihenfolge bleibt unverändert erhalten", () => {
  const usable = splitAccessPointsByEligibility(
    sortAccessPointsByDistance(DPD_ACCESS_POINTS), "dpd").usable;
  const r = filterAccessPointsByOpening(usable, OPENING_FILTER_ALL);
  assert.deepEqual(r.matching.map((s) => s.name), DPD_EXPECTED_USABLE);
  assert.deepEqual(r.matching.slice(0, 5).map((s) => s.name), [
    "DPD-Paketstation", "AYDESIGNZ", "K naro Supermarket",
    "Aral Tankstelle LD DPD-Paketstation", "Sonnenstudio Soleil",
  ]);
});

// ── B — SONNTAGS GEÖFFNET ──────────────────────────────────────────────────

test("65 (B) — Sonntag mit echter Öffnungszeit → sichtbar", () => {
  assert.equal(accessPointOpensOnSunday(shopMit(null, null, null, null, null, null, "10:00-16:00")), true);
  assert.equal(accessPointOpensOnSunday(anAllenTagen("00:01-23:59")), true);
});

test("66 (B) — Sonntag mit workingDay: false → nicht sichtbar", () => {
  const shop = { hoursOfOperation: [{ dayName: "Sonntag", workingHours: "10:00-16:00", workingDay: false }] };
  assert.equal(accessPointOpensOnSunday(shop), false, "das Flag schlägt die Zeitangabe");
});

test("67 (B) — Sonntag „Geschlossen“ → nicht sichtbar", () => {
  assert.equal(accessPointOpensOnSunday(shopMit("09:00-18:00", null, null, null, null, null, "Geschlossen")), false);
  const nurWort = { hoursOfOperation: [{ dayName: "Sonntag", workingHours: "Geschlossen", workingDay: true }] };
  assert.equal(accessPointOpensOnSunday(nurWort), false, "auch ohne das Flag zählt das Wort");
});

test("68 (B) — leere Sonntagszeit und fehlender Sonntagseintrag → nicht sichtbar", () => {
  for (const wert of ["", "   ", "-", null]) {
    const shop = { hoursOfOperation: [{ dayName: "Sonntag", workingHours: wert, workingDay: true }] };
    assert.equal(accessPointOpensOnSunday(shop), false, JSON.stringify(wert));
  }
  const ohneSonntag = { hoursOfOperation: [{ dayName: "Montag", workingHours: "09:00-18:00", workingDay: true }] };
  assert.equal(accessPointOpensOnSunday(ohneSonntag), false);
});

test("69 (B) — Referenzfall: genau drei echte Shops sind sonntags geöffnet", () => {
  const usable = splitAccessPointsByEligibility(
    sortAccessPointsByDistance(DPD_ACCESS_POINTS), "dpd").usable;
  const r = filterAccessPointsByOpening(usable, OPENING_FILTER_SUNDAY);
  assert.equal(r.filtered, true);
  assert.deepEqual(r.matching.map((s) => s.name), DPD_EXPECTED_SUNDAY);
  assert.deepEqual(r.matching.map((s) => s.name), [
    "DPD-Paketstation", "Aral Tankstelle LD DPD-Paketstation", "Sonnenstudio Soleil",
  ]);
  assert.equal(r.excluded.length, 7, "die übrigen sieben nutzbaren sind sonntags zu");
  assert.equal(r.matching.length + r.excluded.length, usable.length, "nichts geht verloren");
});

// ── C — OFFEN VOR 7:30 UHR ─────────────────────────────────────────────────

test("70 (C) — 06:00 und 07:00 zählen als „offen vor 7:30“", () => {
  assert.equal(accessPointOpensBefore0730(anAllenTagen("06:00-18:00")), true);
  assert.equal(accessPointOpensBefore0730(anAllenTagen("07:00-17:00")), true);
});

test("71 (C) — 07:29 zählt noch, 07:30 nicht mehr", () => {
  assert.equal(accessPointOpensBefore0730(anAllenTagen("07:29-20:00")), true);
  assert.equal(accessPointOpensBefore0730(anAllenTagen("07:30-20:00")), false,
    "exakt 07:30 ist nicht VOR 07:30");
});

test("72 (C) — 08:00 zählt nicht, 00:01 zählt", () => {
  assert.equal(accessPointOpensBefore0730(anAllenTagen("08:00-20:00")), false);
  assert.equal(accessPointOpensBefore0730(anAllenTagen("00:01-23:59")), true);
});

test("73 (C) — ein einziger früher Tag in der Woche genügt", () => {
  // Nur der Samstag öffnet früh — die Eigenschaft gilt trotzdem.
  const shop = shopMit("09:00-18:00", "09:00-18:00", "09:00-18:00", "09:00-18:00", "09:00-18:00", "06:30-12:00", "Geschlossen");
  assert.equal(accessPointOpensBefore0730(shop), true);
});

test("74 (C) — Referenzfall: nur die beiden Paketstationen öffnen vor 7:30", () => {
  const usable = splitAccessPointsByEligibility(
    sortAccessPointsByDistance(DPD_ACCESS_POINTS), "dpd").usable;
  const r = filterAccessPointsByOpening(usable, OPENING_FILTER_BEFORE_0730);
  assert.deepEqual(r.matching.map((s) => s.name), DPD_EXPECTED_BEFORE_0730);
  assert.deepEqual(r.matching.map((s) => s.name), ["DPD-Paketstation", "Aral Tankstelle LD DPD-Paketstation"]);
  // Der echte Grenzfall: gaumenfreuden öffnet um exakt 07:30 und zählt nicht.
  const gauf = DPD_ACCESS_POINTS.find((s) => s.name === "gaumenfreuden");
  assert.equal(gauf.hoursOfOperation[0].workingHours, "07:30-16:30", "Rohwert aus dem Mitschnitt");
  assert.equal(accessPointOpensBefore0730(gauf), false);
});

// ── D — OFFEN NACH 21:00 UHR ───────────────────────────────────────────────

test("75 (D) — Ende 22:00, 23:59 und 21:01 zählen als „offen nach 21:00“", () => {
  assert.equal(accessPointOpensAfter2100(anAllenTagen("09:00-22:00")), true);
  assert.equal(accessPointOpensAfter2100(anAllenTagen("00:01-23:59")), true);
  assert.equal(accessPointOpensAfter2100(anAllenTagen("09:00-21:01")), true);
});

test("76 (D) — Ende 21:00 und 20:59 zählen nicht", () => {
  assert.equal(accessPointOpensAfter2100(anAllenTagen("09:00-21:00")), false,
    "exakt 21:00 ist nicht NACH 21:00");
  assert.equal(accessPointOpensAfter2100(anAllenTagen("09:00-20:59")), false);
});

test("77 (D) — ein Bereich über Mitternacht (18:00–01:00) zählt", () => {
  assert.equal(accessPointOpensAfter2100(anAllenTagen("18:00-01:00")), true);
  assert.equal(accessPointOpensAfter2100(anAllenTagen("22:00-06:00")), true);
  // Derselbe Bereich deckt auch den frühen Morgen ab und zählt deshalb
  // konsequenterweise ebenso als „offen vor 7:30“.
  assert.equal(accessPointOpensBefore0730(anAllenTagen("18:00-01:00")), true);
});

test("78 (D) — Referenzfall: nur die beiden Paketstationen haben nach 21:00 offen", () => {
  const usable = splitAccessPointsByEligibility(
    sortAccessPointsByDistance(DPD_ACCESS_POINTS), "dpd").usable;
  const r = filterAccessPointsByOpening(usable, OPENING_FILTER_AFTER_2100);
  assert.deepEqual(r.matching.map((s) => s.name), DPD_EXPECTED_AFTER_2100);
  // Sonnenstudio Soleil und AWG schließen um 20:00 — knapp daneben.
  const soleil = DPD_ACCESS_POINTS.find((s) => s.name === "Sonnenstudio Soleil");
  assert.equal(accessPointOpensAfter2100(soleil), false);
});

// ── E — ALLGEMEIN ──────────────────────────────────────────────────────────

test("79 (E) — mehrere Intervalle an einem Tag werden beide berücksichtigt", () => {
  const geteilt = anAllenTagen("07:00-12:00, 14:00-22:00");
  assert.equal(accessPointOpensBefore0730(geteilt), true, "das erste Intervall zählt");
  assert.equal(accessPointOpensAfter2100(geteilt), true, "das zweite Intervall zählt");
  // Auch andere Trenner und der Halbgeviertstrich.
  assert.equal(accessPointOpensAfter2100(anAllenTagen("09:00–12:00; 15:00–22:00")), true);
  assert.equal(accessPointOpensBefore0730(anAllenTagen("09:00-12:00 / 15:00-22:00")), false);
});

test("80 (E) — eine Mittagspause verändert die Eigenschaft nicht", () => {
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

test("81 (E) — fehlende oder kaputte hoursOfOperation stürzen nicht ab", () => {
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

test("82 (E) — die Filterstufe verliert nie einen Eintrag und sortiert nie um", () => {
  const usable = splitAccessPointsByEligibility(
    sortAccessPointsByDistance(DPD_ACCESS_POINTS), "dpd").usable;
  for (const f of [OPENING_FILTER_SUNDAY, OPENING_FILTER_BEFORE_0730, OPENING_FILTER_AFTER_2100]) {
    const r = filterAccessPointsByOpening(usable, f);
    assert.equal(r.matching.length + r.excluded.length, r.total, f);
    assert.equal(r.total, usable.length, f);
    const idx = (teil) => teil.map((s) => usable.indexOf(s));
    for (const teil of [r.matching, r.excluded]) {
      assert.ok(idx(teil).every((v, i, a) => i === 0 || a[i - 1] < v), `${f}: Reihenfolge erhalten`);
    }
  }
  for (const v of [null, undefined, "abc", 7]) {
    assert.deepEqual(filterAccessPointsByOpening(v, OPENING_FILTER_SUNDAY),
      { matching: [], excluded: [], total: 0, filtered: false });
  }
});

test("83 (E) — die Eligibility greift VOR dem Öffnungszeitenfilter", () => {
  // „Kopier und Werbestudio“ ist „Geschlossen“ (nicht nutzbar). Ein
  // Öffnungszeitenfilter darf ihn deshalb nie zurückholen — auch dann nicht,
  // wenn er zum Merkmal passen würde.
  const alle = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const usable = splitAccessPointsByEligibility(alle, "dpd").usable;
  for (const f of [OPENING_FILTER_ALL, OPENING_FILTER_SUNDAY, OPENING_FILTER_BEFORE_0730, OPENING_FILTER_AFTER_2100]) {
    const namen = filterAccessPointsByOpening(usable, f).matching.map((s) => s.name);
    for (const n of DPD_EXPECTED_UNAVAILABLE) {
      assert.ok(!namen.includes(n) || DPD_EXPECTED_USABLE.includes(n),
        `${n} darf über den Filter „${f}“ nicht zurückkommen`);
    }
  }
  // Und umgekehrt: „gaumenfreuden“ ist nicht nutzbar UND passt nicht — beides
  // wird an unterschiedlichen Stufen entschieden.
  const gauf = DPD_ACCESS_POINTS.find((s) => s.name === "gaumenfreuden");
  assert.equal(isUsableAccessPoint(gauf, "dpd"), false, "Stufe 1: nicht nutzbar");
  assert.equal(matchesOpeningFilter(gauf, OPENING_FILTER_BEFORE_0730), false, "Stufe 2: passt nicht");
  // „schließt bald“ bleibt in Stufe 1 grundsätzlich nutzbar.
  const knaro = DPD_ACCESS_POINTS.find((s) => s.name === "K naro Supermarket");
  assert.equal(isUsableAccessPoint(knaro, "dpd"), true);
});

test("84 (E) — der Filter ist carrier-unabhängig, die Eligibility nicht", () => {
  // Derselbe Öffnungszeitenfilter, aber ein nicht verifizierter Carrier: die
  // Eligibility lässt alle 20 durch, der Öffnungsfilter wirkt trotzdem.
  const alle = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const beiUps = splitAccessPointsByEligibility(alle, "ups").usable;
  assert.equal(beiUps.length, 20);
  const sonntagUps = filterAccessPointsByOpening(beiUps, OPENING_FILTER_SUNDAY).matching;
  // Bei UPS bleiben dieselben drei Sonntagsshops — plus keiner mehr, weil in
  // den echten Daten kein „Geschlossen“-Eintrag sonntags offen hat.
  assert.deepEqual(sonntagUps.map((s) => s.name), DPD_EXPECTED_SUNDAY);
});

test("85 (E) — der Filter kennt keine Uhrzeit und keinen heutigen Wochentag", () => {
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

test("86 (E) — der Filter fasst workState nicht an", () => {
  const knaro = DPD_ACCESS_POINTS.find((s) => s.name === "K naro Supermarket");
  const vorher = normalizeAccessPointWorkState(knaro.workState);
  filterAccessPointsByOpening([knaro], OPENING_FILTER_SUNDAY);
  assert.deepEqual(normalizeAccessPointWorkState(knaro.workState), vorher);
  assert.equal(vorher.label, "Schließt bald");
  assert.equal(knaro.workState, "schließt bald", "der Rohwert bleibt unberührt");
});

// ── F — ZÄHLER UND LEERZUSTAND ─────────────────────────────────────────────

test("87 (F) — der Zähler bei aktivem Filter nennt die passende Menge", () => {
  assert.equal(openingFilterCountLabel(3, 3), "3 Paketshops mit passenden Öffnungszeiten");
  assert.equal(openingFilterCountLabel(5, 7), "5 von 7 Paketshops mit passenden Öffnungszeiten");
  assert.equal(openingFilterCountLabel(1, 1), "1 Paketshop mit passenden Öffnungszeiten");
  assert.equal(openingFilterCountLabel(0, 0), "Keine Paketshops mit passenden Öffnungszeiten");
});

test("88 (F) — die beiden Ursachen bekommen verschiedene Sätze", () => {
  // Nutzbarkeit …
  assert.equal(unavailableAccessPointsLabel(10), "10 weitere Paketshops derzeit nicht verfügbar");
  // … und Öffnungszeiten. Kein Satz nennt die Ursache des anderen.
  assert.equal(openingFilterExcludedLabel(7), "7 weitere Paketshops haben andere Öffnungszeiten");
  assert.equal(openingFilterExcludedLabel(1), "1 weiterer Paketshop hat andere Öffnungszeiten");
  assert.equal(openingFilterExcludedLabel(0), null);
  assert.ok(!openingFilterExcludedLabel(7).includes("verfügbar"));
  assert.ok(!unavailableAccessPointsLabel(10).includes("Öffnungszeit"));
});

test("89 (F) — der Leerzustand benennt den gewählten Filter", () => {
  assert.match(openingFilterEmptyText(OPENING_FILTER_SUNDAY), /Sonntags geöffnet/);
  assert.match(openingFilterEmptyText(OPENING_FILTER_BEFORE_0730), /Offen vor 7:30 Uhr/);
  assert.match(openingFilterEmptyText(OPENING_FILTER_AFTER_2100), /Offen nach 21:00 Uhr/);
  for (const f of [OPENING_FILTER_SUNDAY, OPENING_FILTER_BEFORE_0730, OPENING_FILTER_AFTER_2100]) {
    const t = openingFilterEmptyText(f);
    assert.ok(!/Keine Paketshops gefunden/.test(t), "gefunden wurden welche — sie passen nur nicht");
    assert.match(t, /Öffnungszeitenfilter/);
  }
});

test("90 (F) — die Referenzzahlen der vier Optionen stimmen", () => {
  const usable = splitAccessPointsByEligibility(
    sortAccessPointsByDistance(DPD_ACCESS_POINTS), "dpd").usable;
  const zahl = (f) => filterAccessPointsByOpening(usable, f).matching.length;
  assert.equal(zahl(OPENING_FILTER_ALL), 10);
  assert.equal(zahl(OPENING_FILTER_SUNDAY), 3);
  assert.equal(zahl(OPENING_FILTER_BEFORE_0730), 2);
  assert.equal(zahl(OPENING_FILTER_AFTER_2100), 2);
  assert.equal(openingFilterCountLabel(3, zahl(OPENING_FILTER_SUNDAY)), "3 Paketshops mit passenden Öffnungszeiten");
  assert.equal(openingFilterExcludedLabel(10 - zahl(OPENING_FILTER_SUNDAY)),
    "7 weitere Paketshops haben andere Öffnungszeiten");
});
