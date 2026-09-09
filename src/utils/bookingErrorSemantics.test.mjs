// CE-19 — Fehlersemantik der Buchung: was der Server SAGT und was der Kunde LIEST.
//
// ─── Der Befund ──────────────────────────────────────────────────────────────────────
// Zwei Zustände, in denen der Provider bereits gebucht haben KANN, kamen beim Kunden als
// Aufforderung zum Wiederholen an:
//
//   1. JUMiNGO antwortet `502 BOOKING_OUTCOME_UNKNOWN` mit dem Text „bitte buchen Sie sie
//      NICHT erneut". Der Client warf den Body weg, fiel in den Sammelzweig `status >= 500`
//      und zeigte „Bitte versuchen Sie es erneut." — er überschrieb also genau die eine
//      Warnung, die vor einer zweiten kostenpflichtigen Sendung schützt. Dieser Pfad ist
//      auf dem produktiven JUMiNGO-Weg erreichbar, nicht bloß theoretisch.
//
//   2. Transglobal antwortet `202 BOOKING_PENDING`. Ein 202 hat `r.ok === true` und einen
//      lesbaren Objektbody — er lief an JEDEM Fehlerzweig der Buchungsseite vorbei bis zu
//      `setBooking(d); setStep(3)` und zeigte den ERFOLGSBILDSCHIRM für eine Buchung, deren
//      Ausgang niemand kennt.
//
// Beide Codes stammen aus dem echten Backend (`lib/booking/bookHandler.js` bzw.
// `lib/booking/transglobalBookingEntry.js`), nicht aus einer Auditbezeichnung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mapBookRestError, istOffenerAusgang, fordertNeuberechnung, BOOK_FEHLER,
} from "./bookingErrors.mjs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// Die Codes, bei denen beim Anbieter etwas liegen KANN. Für sie gilt ausnahmslos:
// keine Wiederholung, und der Text muss das ausdrücklich sagen.
const NIEMALS_WIEDERHOLEN = ["BOOKING_OUTCOME_UNKNOWN", "BOOKING_PENDING", "BOOKING_IN_PROGRESS"];

test("1 — DER KERNBEFUND: ein unklarer JUMiNGO-Ausgang fordert NICHT zum Wiederholen auf", () => {
  const f = mapBookRestError(502, {
    error: "Der Buchungsstatus konnte nicht bestätigt werden. Diese Sendung wird geprüft — "
         + "bitte buchen Sie sie NICHT erneut. Der Support meldet sich.",
    code: "BOOKING_OUTCOME_UNKNOWN",
  });
  assert.equal(f, BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(f.retryable, false, "ein offener Ausgang darf niemals als wiederholbar gelten");
  assert.match(f.message, /NICHT erneut/,
    "der Text muss das Wiederholen ausdrücklich untersagen, nicht bloß nicht dazu einladen");
});

test("2 — der generische 5xx bleibt unverändert wiederholbar", () => {
  // Die Gegenprobe zu (1): der Codezweig darf den Sammelzweig nicht ersetzen, nur
  // vorwegnehmen. Ein echter Serverfehler ohne Code ist weiterhin ein Wiederholungsfall.
  assert.equal(mapBookRestError(500, { error: "Buchung fehlgeschlagen" }), BOOK_FEHLER.SERVER);
  assert.equal(mapBookRestError(502, null), BOOK_FEHLER.SERVER);
  assert.equal(BOOK_FEHLER.SERVER.retryable, true);
});

test("3 — jeder Code mit möglicherweise bestellter Sendung ist nicht wiederholbar", () => {
  for (const code of NIEMALS_WIEDERHOLEN) {
    const f = mapBookRestError(409, { code });
    assert.equal(f.retryable, false, `${code} gilt als wiederholbar`);
    assert.match(f.message, /nicht erneut|NICHT erneut/,
      `${code} sagt dem Kunden nicht, dass er nicht erneut senden soll`);
  }
});

test("4 — ein Zustand OHNE Bestellung darf und soll wiederholt werden", () => {
  // `PRICE_UNCONFIRMED` entsteht, BEVOR bestellt wird. Ihn wie einen offenen Ausgang zu
  // behandeln wäre der umgekehrte Fehler: der Kunde käme nie zu seiner Buchung.
  const f = mapBookRestError(503, { code: "PRICE_UNCONFIRMED" });
  assert.equal(f, BOOK_FEHLER.PREIS_UNBESTAETIGT);
  assert.equal(f.retryable, true);
  assert.match(f.message, /nichts beauftragt/);
});

test("5 — ein nicht mehr buchbares Angebot führt zum NEU BERECHNEN, nicht zum Wiederholen", () => {
  for (const code of ["OFFER_NOT_BOOKABLE", "BOOKING_FAILED"]) {
    const f = mapBookRestError(409, { code });
    assert.equal(f, BOOK_FEHLER.NEU_BERECHNEN, `${code} wird falsch abgebildet`);
    assert.match(f.message, /neu berechnen/);
  }
});

test("6 — der Code entscheidet VOR dem Status", () => {
  // Ohne diese Reihenfolge fiele `BOOKING_OUTCOME_UNKNOWN` weiterhin in `status >= 500`.
  // Gemessen an einem Statuscode, der sonst eindeutig anders abgebildet würde.
  assert.equal(mapBookRestError(404, { code: "BOOKING_PENDING" }), BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(mapBookRestError(429, { code: "BOOKING_OUTCOME_UNKNOWN" }),
               BOOK_FEHLER.PRUEFUNG_LAEUFT);
  // Ohne Code gilt unverändert der Status.
  assert.equal(mapBookRestError(429, {}), BOOK_FEHLER.RATE_LIMITED);
});

test("7 — istOffenerAusgang erkennt beide Provider und NUR sie", () => {
  assert.equal(istOffenerAusgang(202, { status: "pending", code: "BOOKING_PENDING" }), true);
  assert.equal(istOffenerAusgang(502, { code: "BOOKING_OUTCOME_UNKNOWN" }), true);
  // Ein Erfolg ist kein offener Ausgang — sonst bekäme jede gelungene Buchung den
  // Klärungshinweis statt des Erfolgsbildschirms.
  assert.equal(istOffenerAusgang(200, { success: true, status: "booked" }), false);
  assert.equal(istOffenerAusgang(409, { code: "PRICE_CHANGED" }), false);
  assert.equal(istOffenerAusgang(200, null), false);
  assert.equal(istOffenerAusgang(500, "kein objekt"), false);
});

/* ══════════ Verdrahtung auf der Buchungsseite ═══════════════════════════════════════ */

const seite = src("../pages/BookingPage.jsx");

test("8 — DER KERNBEFUND: der offene Ausgang wird VOR dem Erfolgspfad abgefangen", () => {
  const pruefung = seite.indexOf("istOffenerAusgang(");
  const erfolg   = seite.indexOf("setBooking(d)");
  assert.ok(pruefung > 0, "die Buchungsseite prüft den offenen Ausgang gar nicht");
  assert.ok(erfolg > 0, "der Erfolgspfad wurde nicht gefunden — der Anker stimmt nicht mehr");
  assert.ok(pruefung < erfolg,
    "ein 202 BOOKING_PENDING erreicht weiterhin den Erfolgsbildschirm");
});

test("9 — der offene Ausgang steht auch vor den Statuszweigen", () => {
  // Ein 202 ist `r.ok` — er wird von keinem Statuszweig gefangen. Die Prüfung muss
  // trotzdem davor stehen, damit sie nicht von einer künftigen Umsortierung überholt wird.
  assert.ok(seite.indexOf("istOffenerAusgang(") < seite.indexOf("if (r.status === 409)"),
    "die Prüfung des offenen Ausgangs steht hinter den Statuszweigen");
});

test("10 — der offene Ausgang sperrt den Buchen-Knopf, statt nur zu warnen", () => {
  // `setConflict` ersetzt den Buchen-Knopf durch „Zu meinen Sendungen"; `setError` liesse
  // ihn stehen. Bei einer möglicherweise bereits bestellten Sendung ist das der ganze
  // Unterschied zwischen einem Hinweis und einer Schranke.
  const block = seite.slice(seite.indexOf("istOffenerAusgang("),
                            seite.indexOf("istOffenerAusgang(") + 320);
  assert.match(block, /setConflict\(/,
    "der offene Ausgang setzt keinen Konfliktzustand — der Buchen-Knopf bliebe bedienbar");
  assert.doesNotMatch(block, /clearFlow\(\)/,
    "der Vorgang wird verworfen, obwohl sein Ausgang noch offen ist");
});

test("11 — die 409-Codes ohne Bestellung landen nicht im Duplikat-Text", () => {
  /* Die Zusicherung ist unveraendert: ein Ausgang, bei dem NICHTS beauftragt wurde,
     darf weder im Duplikat-Text noch im Versicherungs-Reprice landen. Gemessen wird
     sie seit TG-7 an der Stelle, die das jetzt entscheidet — die Codeliste steht in
     `bookingErrors.mjs` und nicht mehr als Literal auf der Seite.

     Der frueher hier gepinnte Ausdruck `d?.code === "OFFER_NOT_BOOKABLE"` war ein
     Quelltextanker auf EINEN von inzwischen sechs Codes; die Behauptung galt fuer die
     anderen fuenf nie mit. Die Pruefung laeuft deshalb jetzt ueber die Funktion selbst
     und deckt damit alle ab. */
  for (const code of ["OFFER_NOT_BOOKABLE", "BOOKING_FAILED"]) {
    assert.equal(fordertNeuberechnung({ code }), true,
      `${code} fordert keine Neuberechnung`);
  }
  const codeZweig = seite.indexOf("fordertNeuberechnung(d)");
  const duplikat  = seite.indexOf("Diese Sendung wurde bereits verarbeitet");
  const reprice   = seite.indexOf("if (isInsured)");
  assert.ok(codeZweig > 0, "die Neuberechnungs-Weiche fehlt auf der Buchungsseite");
  assert.ok(codeZweig < duplikat, "ein Ausgang ohne Bestellung landet im Duplikat-Text");
  assert.ok(codeZweig < reprice,
    "ein Ausgang ohne Bestellung landet bei versicherter Buchung im Versicherungs-Reprice");
});

test("12 — die Fehlerfläche rendert BEIDE Formen des Fehlerzustands", () => {
  // `mapBookRestError` liefert ein Objekt, die fachlichen Zweige eine Zeichenkette. Ein
  // Objekt als React-Kind ist ein Renderfehler, kein Text — und er träfe genau die
  // Antworten, die dem Kunden etwas Wichtiges zu sagen hätten.
  const modul = src("../components/booking/BookingActionModule.jsx");
  assert.match(modul, /typeof error === "string"/,
    "die Fehlerfläche unterscheidet die beiden Formen nicht — ein Objekt bricht das Rendern");
  assert.match(modul, /error\.message/, "die Meldung des Fehlerobjekts wird nicht angezeigt");
});
