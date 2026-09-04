/* Angaben zur Art der Adresse — Bedarf, Dreiwertigkeit, Payload, Oberfläche.

   Kein Netz, kein Browser: reine Auswertung plus Quelltextzusicherungen.

   Leitfrage: Kann aus „Geschäftsadresse" jemals „noch nicht beantwortet" werden —
   und kann ein Providername in die Oberfläche geraten? */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  benoetigteAdressfragen, fehlendeAdressangaben, adressangabenVollstaendig,
  adressangabenPayload, adressangabenHinweis, istBeantwortet,
  FELD_ZUSTELLUNG, FELD_ABHOLUNG, ADRESSFRAGE_TEXT,
} from "./addressTypeQuestions.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => fs.readFileSync(path.join(HIER, "..", p), "utf8");

/* Quelltextzusicherungen werden auf KOMMENTARFREIEM Code gemessen.
   Sonst prüft der Test die Erklärung statt des Programms: die Begründung, warum hier
   KEIN `<Switch>` steht, enthält zwangsläufig das Wort „Switch" — und die Begründung,
   warum kein Providername auftaucht, spricht zwangsläufig vom Einkauf. Beides hat den
   Test beim ersten Lauf rot gefärbt, obwohl der Code korrekt war. */
const ohneKommentar = (p) => lies(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ 	]*\/\/.*$/gm, "");

/* ══════════ A — WELCHE FRAGE WANN ═════════════════════════════════════════ */

test("(A1) Abholung fragt nach beiden Adressen", () => {
  assert.deepEqual(benoetigteAdressfragen("pickup"), [FELD_ABHOLUNG, FELD_ZUSTELLUNG]);
});

test("(A2) Paketshopabgabe fragt NICHT nach der Abholadresse", () => {
  // Dorthin fährt niemand — ein abholbezogener Zuschlag kann gar nicht entstehen.
  // Die Frage wäre eine Pflichtangabe ohne jede Wirkung.
  assert.deepEqual(benoetigteAdressfragen("dropoff"), [FELD_ZUSTELLUNG]);
});

test("(A3) eine unbekannte Übergabeart erfindet keine Frage", () => {
  for (const unbekannt of [undefined, null, "", "PICKUP", "abholung", 1, {}]) {
    assert.deepEqual(benoetigteAdressfragen(unbekannt), [FELD_ZUSTELLUNG],
      `${JSON.stringify(unbekannt)} hat eine Frage erfunden oder verloren`);
  }
});

/* ══════════ B — DREIWERTIG, NICHT ZWEIWERTIG ══════════════════════════════ */

test("(B1) `false` ist eine ANTWORT, kein fehlender Wert", () => {
  // Der Kern des Moduls. Mit einer Truthiness-Prüfung wäre „Geschäftsadresse"
  // ununterscheidbar von „noch nichts gesagt", und der Kunde bekäme dieselbe Frage
  // nach jeder Rückkehr erneut vorgelegt.
  assert.equal(istBeantwortet(false), true);
  assert.equal(istBeantwortet(true), true);
  for (const leer of [null, undefined, "", 0, "false", NaN]) {
    assert.equal(istBeantwortet(leer), false, `${JSON.stringify(leer)} galt als Antwort`);
  }
  const beides = { [FELD_ABHOLUNG]: false, [FELD_ZUSTELLUNG]: false };
  assert.equal(adressangabenVollstaendig(beides, "pickup"), true,
    "zwei bewusste Neins galten als unvollständig");
});

test("(B2) fehlende Angaben werden NAMENTLICH gemeldet", () => {
  assert.deepEqual(fehlendeAdressangaben({}, "pickup"), [FELD_ABHOLUNG, FELD_ZUSTELLUNG]);
  assert.deepEqual(fehlendeAdressangaben({ [FELD_ABHOLUNG]: false }, "pickup"), [FELD_ZUSTELLUNG]);
  // Eine bei Dropoff mitgelieferte Abholangabe fehlt nicht — sie wird gar nicht gebraucht.
  assert.deepEqual(fehlendeAdressangaben({ [FELD_ZUSTELLUNG]: true }, "dropoff"), []);
});

/* ══════════ C — PAYLOAD ═══════════════════════════════════════════════════ */

test("(C1) unvollständig ergibt NULL — kein halber Satz geht raus", () => {
  assert.equal(adressangabenPayload({}, "pickup"), null);
  assert.equal(adressangabenPayload({ [FELD_ABHOLUNG]: true }, "pickup"), null);
  assert.equal(adressangabenPayload({}, "dropoff"), null);
});

test("(C2) gesendet wird nur, was DIESES Angebot braucht", () => {
  // Bei Dropoff wird die Abholangabe verworfen, auch wenn sie im Zustand steht (etwa
  // weil der Kunde vorher ein Abholangebot angesehen hat). Ein Server, der sie
  // ignoriert, wäre die schwächere Garantie.
  const werte = { [FELD_ABHOLUNG]: true, [FELD_ZUSTELLUNG]: false };
  assert.deepEqual(adressangabenPayload(werte, "dropoff"), { [FELD_ZUSTELLUNG]: false });
  assert.deepEqual(adressangabenPayload(werte, "pickup"),
    { [FELD_ABHOLUNG]: true, [FELD_ZUSTELLUNG]: false });
});

test("(C3) `false` überlebt den Payload unverändert", () => {
  const p = adressangabenPayload({ [FELD_ABHOLUNG]: false, [FELD_ZUSTELLUNG]: false }, "pickup");
  assert.equal(p[FELD_ABHOLUNG], false);
  assert.equal(p[FELD_ZUSTELLUNG], false);
  assert.equal(JSON.parse(JSON.stringify(p))[FELD_ZUSTELLUNG], false,
    "nach der Serialisierung war das Nein weg");
});

/* ══════════ D — WAS DER KUNDE LIEST ═══════════════════════════════════════ */

test("(D1) kein Providername in irgendeinem sichtbaren Text", () => {
  const quellen = [
    ohneKommentar("utils/addressTypeQuestions.mjs"),
    ohneKommentar("components/booking/AddressTypeModule.jsx"),
  ].join("\n").toLowerCase();
  for (const w of ["transglobal", "jumingo", " tg ", "provider-", "einkauf"]) {
    assert.ok(!quellen.includes(w), `"${w}" steht in der Adressfragen-Oberfläche`);
  }
});

test("(D2) der Hinweis nennt, WAS fehlt — nicht nur dass etwas fehlt", () => {
  assert.equal(adressangabenHinweis({ [FELD_ABHOLUNG]: true, [FELD_ZUSTELLUNG]: true }, "pickup"), "");
  const beide = adressangabenHinweis({}, "pickup");
  assert.match(beide, /Abhol- und Lieferadresse/);
  assert.match(adressangabenHinweis({ [FELD_ZUSTELLUNG]: false }, "pickup"), /Abholadresse/);
  assert.match(adressangabenHinweis({ [FELD_ABHOLUNG]: false }, "pickup"), /Lieferadresse/);
});

test("(D3) die Texte stehen im Modul, nicht im JSX", () => {
  const jsx = lies("components/booking/AddressTypeModule.jsx");
  for (const feld of [FELD_ZUSTELLUNG, FELD_ABHOLUNG]) {
    assert.ok(ADRESSFRAGE_TEXT[feld].label.length > 0);
    assert.ok(!jsx.includes(ADRESSFRAGE_TEXT[feld].label),
      "der Fragetext steht doppelt — im Modul und im JSX");
  }
});

/* ══════════ E — DIE OBERFLÄCHE SAGT DIE WAHRHEIT ══════════════════════════ */

test("(E1) KEIN Schalter für eine dreiwertige Angabe", () => {
  // Ein `<Switch>` steht beim Öffnen auf „aus" und behauptet damit eine Antwort, die
  // niemand gegeben hat — genau daraus entsteht ein Preis für eine Adressart, die
  // nie erklärt wurde. Zwei Radios ohne Vorauswahl sagen die Wahrheit.
  const jsx = ohneKommentar("components/booking/AddressTypeModule.jsx");
  assert.ok(!/<Switch/.test(jsx), "ein Schalter kann den Zustand -noch nicht beantwortet- nicht ausdruecken");
  assert.equal((jsx.match(/type="radio"/g) || []).length, 2);
  assert.ok(!/defaultChecked/.test(jsx), "eine Vorauswahl wäre eine unterstellte Antwort");
  // `checked` vergleicht strikt — sonst markierte `null` die Nein-Option.
  assert.ok(jsx.includes("wert === true") && jsx.includes("wert === false"),
    "ohne strikten Vergleich markiert null die falsche Option");
});

test("(E2) die Buchungsseite ist doppelt abgesichert und spiegelt dreiwertig", () => {
  const seite = lies("pages/BookingPage.jsx");
  // Weiter-Gate UND Buchungs-Guard — dieselbe doppelte Absicherung wie bei den Zollangaben.
  assert.equal((seite.match(/if \(!adresstypVollstaendig\)/g) || []).length, 2,
    "es fehlt eine der beiden Absicherungen");
  // Der Ausgangswert darf ein gespeichertes `false` nicht verlieren.
  assert.ok(seite.includes("flowBooking?.deliveryIsResidential ?? null"),
    "der Ausgangswert nutzt nicht ??, sondern verliert damit ein gespeichertes Nein");
  assert.ok(!/flowBooking\?\.deliveryIsResidential \|\|/.test(seite),
    "|| macht aus einem bewussten Nein ein -nicht beantwortet-");
});

test("(E3) die Angebotskennung geht mit, und Tarifwerte wählen nichts mehr aus", () => {
  const seite = lies("pages/BookingPage.jsx");
  assert.ok(/offerId:\s+tariff\?\.offerId/.test(seite), "die Angebotskennung fehlt im Payload");
  assert.ok(/priceInputs:\s+adressangabenPayload\(/.test(seite),
    "die Adressangaben werden nicht über den geprüften Erbauer gesendet");
  // Der Client baut den Payload NICHT aus dem Rohzustand — sonst könnte ein
  // unvollständiger Satz doch hinausgehen.
  assert.ok(!/priceInputs:\s+adresstyp[,\s}]/.test(seite),
    "der Rohzustand wird direkt gesendet, am Vollständigkeitsguard vorbei");
});
