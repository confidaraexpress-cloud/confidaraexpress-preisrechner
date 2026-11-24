// Tests für die Anzeigelogik der Betriebssicht der API (Adminübersicht):
// echte Messwerte statt Schätzungen, „–“ statt einer erfundenen 0, Auffälligkeiten mit Handlung,
// Stand der Warnmail als Satz und das Ergebnis der Testwarnung.
// Läuft über Node's eingebauten Test-Runner:
//   node --test src/utils/adminRuntime.test.mjs   (bzw. `npm test`)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RUNTIME_TEXTS, alertTestOutcome, isRuntimeView, latestSample, runtimeAlertState, runtimeDateTime, runtimeFindings,
  runtimeReadouts, runtimeStamp, runtimeSummary,
} from "./adminRuntime.mjs";

// Eine Messzeile, wie die API sie liefert (Backend lib/opsMonitor.js).
const ZEILE = {
  t: "2026-11-24T15:36:18.654Z", start: "2026-11-24T15:33:17.378Z", laufzeitS: 181,
  anfragen: 1234, fehler5xx: 0, abbrueche: 0,
  laufend: { anfragenMax: 9, buchungenMax: 4, buchungenJetzt: 1 },
  db: { max: 12, belegtMax: 7, freiMin: 5, wartendMax: 0, warteSekunden: 0 },
  faden: { auslastung: 0.127, p99Ms: 21, maxMs: 23 },
  cpuPct: 12.5, rssMb: 142, heapMb: 48, heapAnteil: 0.022,
  http: { offen: 1, neu: 3, leerlaufSchluss: 0 },
};
const ANTWORT = {
  instance: "api.confidaraexpress.de", alertMailEnabled: true,
  samples: [{ ...ZEILE, t: "2026-11-24T15:35:18.654Z", anfragen: 7 }, ZEILE],
  findings: [], lastAlert: null, pendingFindings: [],
};

test("die jüngste Messzeile ist die letzte der Antwort — fehlt sie, gibt es keine Anzeige", () => {
  assert.equal(latestSample(ANTWORT).anfragen, 1234);
  for (const leer of [null, undefined, {}, { samples: [] }, { samples: "x" }, { samples: [null] }]) {
    assert.equal(latestSample(leer), null);
    assert.deepEqual(runtimeReadouts(leer), []);
    assert.equal(runtimeStamp(leer), null);
  }
});

test("fünf Anzeigen mit Einheit und einem Satz — die Werte stammen aus der Messzeile", () => {
  const a = runtimeReadouts(ANTWORT);
  assert.deepEqual(a.map((x) => x.key), ["requests", "database", "load", "memory", "bookings"]);
  assert.deepEqual(a.map((x) => x.display), ["1.234", "0 s", "13 %", "142 MB", "4"]);
  assert.equal(a[0].hint, "in der letzten Minute, kein Serverfehler");
  assert.equal(a[1].hint, "höchstens 7 von 12 Verbindungen belegt");
  assert.equal(a[2].hint, "des Hauptfadens, Verzug bis 21 ms");
  assert.equal(a[3].hint, "des API-Prozesses, Speichergrenze zu 2 % erreicht");
  assert.equal(a[4].hint, "höchster Stand der letzten Minute, jetzt 1");
  // Serverfehler stehen im Satz, mit ihrer Zahl.
  const mitFehlern = runtimeReadouts({ samples: [{ ...ZEILE, fehler5xx: 3 }] });
  assert.equal(mitFehlern[0].hint, "in der letzten Minute, davon 3 mit Serverfehler");
});

test("ein fehlender Wert steht als „–“ da — nie als 0", () => {
  const a = runtimeReadouts({ samples: [{ t: ZEILE.t }] });
  assert.deepEqual(a.map((x) => x.display), ["–", "–", "–", "–", "–"]);
  for (const x of a) assert.doesNotMatch(x.hint, /undefined|NaN|null/);
  // Auch ein unbrauchbarer Typ wird nicht zur Zahl.
  const b = runtimeReadouts({ samples: [{ anfragen: "12", db: { warteSekunden: null }, faden: "x", rssMb: NaN, laufend: [] }] });
  assert.deepEqual(b.map((x) => x.display), ["–", "–", "–", "–", "–"]);
});

test("Auffälligkeiten: Kategorie, Kennzahl und Handlung — Einträge ohne Text fallen weg", () => {
  const data = { findings: [
    { key: "db_stau", category: "Datenbank ausgelastet", metric: "31 s Wartezeit", affected: "alle", action: "Lage beobachten." },
    { key: "ohne_text", category: "" },
    null,
    { key: "nur_kategorie", category: "Speicher" },
  ] };
  assert.deepEqual(runtimeFindings(data), [
    { key: "db_stau", category: "Datenbank ausgelastet", metric: "31 s Wartezeit", action: "Lage beobachten." },
    { key: "nur_kategorie", category: "Speicher", metric: "", action: "" },
  ]);
  assert.deepEqual(runtimeFindings(null), []);
  assert.deepEqual(runtimeFindings({ findings: "x" }), []);
});

test("die Kurzfassung der zugeklappten Zeile nennt Zustand oder Zahl der Auffälligkeiten", () => {
  assert.equal(runtimeSummary("idle", null), RUNTIME_TEXTS.summaryIdle);
  assert.equal(runtimeSummary("loading", null), RUNTIME_TEXTS.summaryLoading);
  assert.equal(runtimeSummary("failed", null), RUNTIME_TEXTS.summaryUnavailable);
  assert.equal(runtimeSummary("ready", ANTWORT), "keine Auffälligkeit");
  assert.equal(runtimeSummary("ready", { findings: [{ key: "a", category: "A" }] }), "1 Auffälligkeit");
  assert.equal(runtimeSummary("ready", { findings: [{ key: "a", category: "A" }, { key: "b", category: "B" }] }), "2 Auffälligkeiten");
  // Ein bereits geladener Stand bleibt beim Nachladen stehen …
  assert.equal(runtimeSummary("loading", { findings: [{ key: "a", category: "A" }] }), "1 Auffälligkeit");
  // … nach einem GESCHEITERTEN Aktualisieren ist er aber kein Beleg mehr: keine Ruhemeldung aus altem Stand.
  assert.equal(runtimeSummary("failed", ANTWORT), "nicht aktualisiert");
  assert.equal(runtimeSummary("failed", { findings: [{ key: "a", category: "A" }], samples: [] }), "nicht aktualisiert");
});

test("nur eine Antwort mit ihren beiden Listen ist ein Beleg — auch für „keine Auffälligkeit“", () => {
  assert.equal(isRuntimeView(ANTWORT), true);
  assert.equal(isRuntimeView({ samples: [], findings: [] }), true);
  for (const kaputt of [null, undefined, "x", 5, [], {}, { samples: [] }, { findings: [] }, { samples: "x", findings: [] },
    { samples: [], findings: null }, { error: "Fehler" }]) {
    assert.equal(isRuntimeView(kaputt), false, JSON.stringify(kaputt));
  }
});

test("Zeitpunkte stehen in Geschäftszeit (Europe/Berlin) — unbrauchbare Werte ergeben null", () => {
  assert.equal(runtimeDateTime("2026-11-24T15:36:18.654Z"), "24.11.2026, 16:36 Uhr");
  assert.equal(runtimeDateTime("2026-07-01T22:30:00Z"), "02.07.2026, 00:30 Uhr");
  for (const falsch of [null, undefined, "", "gestern", 12, {}]) assert.equal(runtimeDateTime(falsch), null);
  assert.equal(runtimeStamp(ANTWORT), "Stand 24.11.2026, 16:36 Uhr · API läuft seit 24.11.2026, 16:33 Uhr");
  assert.equal(runtimeStamp({ samples: [{ t: ZEILE.t }] }), "Stand 24.11.2026, 16:36 Uhr");
});

test("der Stand der Warnmail ist ein Satz — letzter Versand, abgeschalteter Versand, Vorgemerktes", () => {
  assert.equal(runtimeAlertState(null), null);
  assert.equal(runtimeAlertState(ANTWORT), RUNTIME_TEXTS.alertNever);
  assert.equal(
    runtimeAlertState({ ...ANTWORT, lastAlert: { am: "2026-11-24T15:35:18.000Z", befunde: ["mail_liegt"], beendet: [], ausgang: "gesendet" } }),
    "Letzte Warnmail: 24.11.2026, 16:35 Uhr — gesendet.");
  assert.equal(
    runtimeAlertState({ ...ANTWORT, lastAlert: { am: "2026-11-24T15:35:18.000Z", ausgang: "fehlgeschlagen" }, pendingFindings: ["db_stau"] }),
    "Letzte Warnmail: 24.11.2026, 16:35 Uhr — Versand fehlgeschlagen — der nächste Versuch folgt nach einer Minute. "
    + "Eine Auffälligkeit ist vorgemerkt und steht in der nächsten Warnmail.");
  assert.equal(
    runtimeAlertState({ ...ANTWORT, alertMailEnabled: false, pendingFindings: ["a", "b"] }),
    `${RUNTIME_TEXTS.mailOff} ${RUNTIME_TEXTS.alertNever} 2 Auffälligkeiten sind vorgemerkt und stehen in der nächsten Warnmail.`);
  // Ein unbekannter Ausgang wird nicht geraten und nicht roh angezeigt.
  const unbekannt = runtimeAlertState({ ...ANTWORT, lastAlert: { am: "kaputt", ausgang: "<b>x</b>" } });
  assert.equal(unbekannt, "Letzte Warnmail: Zeitpunkt unbekannt.");
  // Auch eine Eigenschaft des Prototyps ist kein bekannter Ausgang.
  assert.equal(runtimeAlertState({ ...ANTWORT, lastAlert: { am: "2026-11-24T15:35:18.000Z", ausgang: "toString" } }),
    "Letzte Warnmail: 24.11.2026, 16:35 Uhr.");
});

test("das Ergebnis der Testwarnung: nur 200 heißt „gesendet“ — jeder andere Ausgang sagt, dass nichts hinausging", () => {
  assert.deepEqual(alertTestOutcome(200, { message: "x", sentAt: "2026-11-24T15:40:00Z" }),
    { kind: "ok", text: "Testwarnung gesendet. Bitte das Postfach kontakt@confidaraexpress.de prüfen." });
  const abgeschaltet = alertTestOutcome(409, { code: "OPS_ALERT_DISABLED" });
  assert.equal(abgeschaltet.kind, "error");
  assert.match(abgeschaltet.text, /abgeschaltet\. Es wurde nichts gesendet\.$/);
  const zurueckgehalten = alertTestOutcome(409, { code: "OPS_ALERT_SUPPRESSED" });
  assert.match(zurueckgehalten.text, /zurückgehalten\. Es wurde nichts gesendet\.$/);
  assert.match(alertTestOutcome(429, null).text, /Zu viele Testwarnungen/);
  assert.match(alertTestOutcome(502, { code: "OPS_ALERT_SEND_FAILED" }).text, /Mailversand prüfen/);
  // Unbekannter Status, Netzfehler, unbekannter 409-Code: nie „gesendet“.
  for (const [status, body] of [[0, null], [500, {}], [409, { code: "ANDERES" }], [409, null], [201, {}], [404, "x"]]) {
    const r = alertTestOutcome(status, body);
    assert.equal(r.kind, "error", `${status}`);
    assert.doesNotMatch(r.text, /^Testwarnung gesendet/);
  }
  // „Gesendet“ nur mit dem Versandzeitpunkt der Antwort — der Status 200 allein ist kein Beleg.
  for (const body of [null, {}, "ok", { message: "x" }, { sentAt: "" }, { sentAt: 5 }, { sentAt: null }]) {
    const r = alertTestOutcome(200, body);
    assert.equal(r.kind, "error", JSON.stringify(body));
    assert.match(r.text, /^Der Ausgang der Testwarnung ist unbekannt\./);
  }
  // Keine Antwort (Zeitüberschreitung, Abbruch): der Ausgang ist unbekannt — nicht „nicht gesendet“. Erst prüfen.
  const offen = alertTestOutcome(0, null);
  assert.match(offen.text, /^Der Ausgang der Testwarnung ist unbekannt\. Bitte zuerst das Postfach .* prüfen und erst danach erneut senden\.$/);
  assert.doesNotMatch(offen.text, /konnte nicht gesendet werden/);
});

test("kein Text nennt einen Einkaufsanbieter oder eine technische Kennung des Mailanbieters", () => {
  const alles = [...Object.values(RUNTIME_TEXTS), ...runtimeReadouts(ANTWORT).flatMap((x) => [x.label, x.hint]),
    alertTestOutcome(200, { sentAt: "2026-11-24T15:40:00Z" }).text, alertTestOutcome(200, {}).text,
    alertTestOutcome(0, null).text, alertTestOutcome(502, {}).text].join(" ");
  assert.doesNotMatch(alles, /jumingo|transglobal|resend/i);
  // Der Hinweistext nennt den Takt der Warnmails nicht (das Repository ist öffentlich).
  assert.doesNotMatch(RUNTIME_TEXTS.note, /Stunde|Minute[n]? Abstand|höchstens eine/);
});
