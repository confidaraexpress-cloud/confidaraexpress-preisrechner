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
} from "./accessPointView.mjs";
import {
  DPD_ACCESS_POINTS, DPD_EXPECTED_SORTED, DPD_EXPECTED_USABLE,
  DPD_EXPECTED_UNAVAILABLE, FREITAG,
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
//       nicht nutzbare workState-Werte aus der Auswahl.

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

test("41 (B) — „Geschlossen“ ist nicht nutzbar (deutsch, klein, englisch)", () => {
  for (const v of ["Geschlossen", "geschlossen", "GESCHLOSSEN", "  Geschlossen  ", "closed", "CLOSED"]) {
    const e = accessPointEligibility({ workState: v });
    assert.equal(e.usable, false, v);
    assert.equal(e.reason, "work_state_closed", v);
    assert.equal(isUsableAccessPoint({ workState: v }), false, v);
  }
});

test("42 (B) — „Geöffnet“/„open“/„opened“ sind nutzbar", () => {
  for (const v of ["Geöffnet", "geöffnet", "GEÖFFNET", "open", "opened", "offen"]) {
    assert.equal(isUsableAccessPoint({ workState: v }), true, v);
  }
});

test("43 (B) — „schließt bald“ bleibt nutzbar und sichtbar", () => {
  for (const v of ["schließt bald", "Schließt bald", "SCHLIESST BALD", "schliesst bald", "closing soon"]) {
    assert.equal(isUsableAccessPoint({ workState: v }), true, v);
  }
});

test("44 (B) — FAIL-OPEN: unbekannt, fehlend, leer, Nicht-String → nutzbar", () => {
  const faelle = [
    { workState: "temporarily_unavailable" }, { workState: "irgendwas_neues" },
    { workState: null }, { workState: undefined }, { workState: "" }, { workState: "   " },
    { workState: 0 }, { workState: 1 }, { workState: true }, { workState: false },
    { workState: {} }, { workState: [] }, { workState: ["Geschlossen"] },
    {}, { name: "ohne Status" },
  ];
  for (const f of faelle) {
    assert.equal(isUsableAccessPoint(f), true, JSON.stringify(f));
  }
  // Auch das Objekt selbst darf fehlen, ohne dass etwas verschwindet.
  for (const v of [null, undefined, {}, "", 0]) assert.equal(isUsableAccessPoint(v), true, String(v));
});

test("45 (B) — ein verschachteltes „Geschlossen“ blendet nichts aus", () => {
  // Nur das eigene Feld workState zählt. Ein gleichlautender Wert an anderer
  // Stelle darf keinen Shop entfernen.
  assert.equal(isUsableAccessPoint({ name: "Geschlossen", workState: "Geöffnet" }), true);
  assert.equal(isUsableAccessPoint({ type: "Geschlossen", workState: "schließt bald" }), true);
  assert.equal(isUsableAccessPoint({ hoursOfOperation: [{ workingHours: "Geschlossen" }] }), true);
});

test("46 — Eligibility ist unabhängig von der Uhrzeit", () => {
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
    assert.equal(isUsableAccessPoint(shop), false, String(t));
  }
  assert.equal(accessPointEligibility.length, 1, "die Funktion nimmt keinen Zeitparameter");
});

test("47 — Eligibility ist unabhängig von hoursOfOperation", () => {
  // Innerhalb der Öffnungszeiten und trotzdem nicht nutzbar — genau der real
  // gemessene Fall (Kopier und Werbestudio, 10:00–17:00, um 16:06).
  const zu = { workState: "Geschlossen", hoursOfOperation: freitag("10:00-17:00") };
  assert.equal(isUsableAccessPoint(zu), false);
  assert.equal(todayOpeningHoursText(zu.hoursOfOperation, FR), "Heute: 10:00–17:00",
    "die Öffnungszeit bleibt daneben als Information korrekt");

  // Und umgekehrt: geschlossener Wochentag, aber nutzbar laut JUMiNGO.
  const offen = {
    workState: "Geöffnet",
    hoursOfOperation: [{ dayName: "Freitag", workingHours: null, workingDay: false }],
  };
  assert.equal(isUsableAccessPoint(offen), true);
  assert.equal(todayOpeningHoursText(offen.hoursOfOperation, FR), HOURS_CLOSED_TODAY);

  // Ganz ohne Öffnungszeiten ändert sich nichts.
  assert.equal(isUsableAccessPoint({ workState: "Geschlossen" }), false);
  assert.equal(isUsableAccessPoint({ workState: "Geöffnet" }), true);
});

test("48 — Eligibility kennt keine Namens- oder Carrier-Heuristik", () => {
  // Ein Laden ohne „DPD“ im Namen ist ein vollwertiger Access Point …
  assert.equal(isUsableAccessPoint({ name: "AYDESIGNZ", workState: "schließt bald" }), true);
  assert.equal(isUsableAccessPoint({ name: "K naro Supermarket", workState: "schließt bald" }), true);
  assert.equal(isUsableAccessPoint({ name: "Sonnenstudio Soleil", workState: "Geöffnet" }), true);
  // … und „DPD“ im Namen rettet einen nicht nutzbaren Punkt nicht.
  assert.equal(isUsableAccessPoint({ name: "DPD-Paketstation", workState: "Geschlossen" }), false);
});

test("49 — die Auswahlstufe ist eine eigene Stufe: nichts geht verloren", () => {
  const { usable, unavailable, total } = splitAccessPointsByEligibility(DPD_ACCESS_POINTS);
  assert.equal(total, DPD_ACCESS_POINTS.length);
  assert.equal(usable.length + unavailable.length, total, "die Summe bleibt vollständig");
  // Die Reihenfolge der Eingabe bleibt in beiden Teillisten erhalten.
  const eingabe = DPD_ACCESS_POINTS.map((s) => s.name);
  const reihenfolgeErhalten = (teil) =>
    teil.map((s) => eingabe.indexOf(s.name)).every((v, i, a) => i === 0 || a[i - 1] < v);
  assert.ok(reihenfolgeErhalten(usable), "die Auswahlstufe sortiert nicht um");
  assert.ok(reihenfolgeErhalten(unavailable), "auch die Restliste behält ihre Reihenfolge");
  for (const v of [null, undefined, "abc", 5]) {
    assert.deepEqual(splitAccessPointsByEligibility(v), { usable: [], unavailable: [], total: 0 });
  }
});

test("50 — Referenzfall: die echte DPD-Antwort ergibt JUMiNGOs sichtbare Liste", () => {
  // Die verbindliche Kette: normalisieren → sortieren → Eligibility.
  const sortiert = sortAccessPointsByDistance(DPD_ACCESS_POINTS);
  const { usable, unavailable } = splitAccessPointsByEligibility(sortiert);

  assert.deepEqual(usable.map((s) => s.name), DPD_EXPECTED_USABLE);
  assert.deepEqual(unavailable.map((s) => s.name).sort(), [...DPD_EXPECTED_UNAVAILABLE].sort());

  // Und ausdrücklich: die vier gemessenen Einträge stehen NICHT zur Auswahl …
  const angeboten = usable.map((s) => s.name);
  for (const n of ["Kopier und Werbestudio", "Intermarkt", "NKD Deutschland GmbH", "Änderungsschneiderei Sadra"]) {
    assert.ok(!angeboten.includes(n), `${n} darf nicht angeboten werden`);
  }
  // … die näheren „Geschlossen“-Treffer stehen also auch nicht vorne.
  assert.equal(angeboten[0], "DPD-Paketstation", "vorher standen hier 0,579 km und 0,893 km");
  assert.equal(angeboten[1], "AYDESIGNZ");
  assert.equal(angeboten[2], "K naro Supermarket");
});

test("51 — die Zähler der Referenzantwort stimmen mit der Auswahl überein", () => {
  const { usable, unavailable } = splitAccessPointsByEligibility(
    sortAccessPointsByDistance(DPD_ACCESS_POINTS));
  assert.equal(usable.length, 5);
  assert.equal(unavailable.length, 4);
  assert.equal(accessPointCountLabel(5, usable.length), "5 verfügbare Paketshops");
  assert.equal(accessPointCountLabel(3, usable.length), "3 von 5 verfügbaren Paketshops");
  assert.equal(moreAccessPointsLabel(usable.length - 3), "Weitere 2 Paketshops anzeigen");
  assert.equal(unavailableAccessPointsLabel(unavailable.length),
    "4 weitere Paketshops derzeit nicht verfügbar");
});

test("52 — die Anzeigebeschriftung bleibt von der Nutzbarkeit unberührt", () => {
  // „Geschlossen“ verschwindet aus der AUSWAHL, nicht aus dem Statusmodell:
  // der Wert bleibt normalisierbar (PR #303) und behält Text und Badge.
  const s = normalizeAccessPointWorkState("Geschlossen");
  assert.equal(s.label, "Geschlossen");
  assert.equal(s.badgeClass, "badge badge--neutral");
  assert.equal(s.known, true);
  // Die beiden Stufen sind getrennt: derselbe Wert, zwei verschiedene Fragen.
  assert.equal(isUsableAccessPoint({ workState: "Geschlossen" }), false);
  assert.equal(normalizeAccessPointWorkState("Geschlossen").key, "closed");
});
