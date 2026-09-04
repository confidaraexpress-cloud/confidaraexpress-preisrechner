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

/* ══════════ A — DIE LISTE KOMMT VOM SERVER ═══════════════════════════════ */

const TG_PICKUP  = ["deliveryIsResidential", "collectionIsResidential"];
const TG_DROPOFF = ["deliveryIsResidential"];
const JUMINGO    = [];

test("(A1) es wird genau das gefragt, was das Angebot deklariert", () => {
  assert.deepEqual(benoetigteAdressfragen(TG_PICKUP), [FELD_ZUSTELLUNG, FELD_ABHOLUNG]);
  assert.deepEqual(benoetigteAdressfragen(TG_DROPOFF), [FELD_ZUSTELLUNG]);
  assert.deepEqual(benoetigteAdressfragen(JUMINGO), []);
});

test("(A2) ein Angebot ohne Zusatzbedarf erzeugt KEINE Pflichtfrage", () => {
  // Der Kern der Korrektur. Eine frühere Fassung leitete aus der Übergabeart ab und
  // verlangte die Zustellfrage im Zweifel IMMER — dadurch bekam auch ein Angebot, dessen
  // Preis überhaupt nicht an einer Wohnadressdeklaration hängt, ein Pflichtfeld, und der
  // bestehende Buchungsweg war blockiert. Zehn Browser-Suiten sind daran gescheitert.
  assert.deepEqual(fehlendeAdressangaben({}, JUMINGO), []);
  assert.equal(adressangabenVollstaendig({}, JUMINGO), true,
    "ein Angebot ohne Zusatzbedarf galt als unvollständig");
  assert.equal(adressangabenHinweis({}, JUMINGO), "");
  assert.equal(adressangabenPayload({}, JUMINGO), null,
    "ohne nötige Angaben darf kein leeres priceInputs entstehen");
});

test("(A3) ein FEHLENDES Feld ist leer — nicht \"sicherheitshalber fragen\"", () => {
  // Ein Angebot aus einem älteren Bundle, ein wiederhergestellter Vorgang oder ein Tarif
  // ohne zugehöriges Angebot dürfen keine neue Pflichtfrage erzeugen. Die Sperre liegt
  // serverseitig; ein zu vorsichtiges Frontend erzeugt hier keinen Schutz, sondern nur
  // eine Frage für ein Angebot, dessen Preis gar nicht daran hängt.
  for (const fehlt of [undefined, null, "", 0, false, {}, "deliveryIsResidential"]) {
    assert.deepEqual(benoetigteAdressfragen(fehlt), [],
      `${JSON.stringify(fehlt)} hat eine Frage erfunden`);
    assert.equal(adressangabenVollstaendig({}, fehlt), true);
  }
});

test("(A4) ein unbekannter Schlüssel wird verworfen, nicht angezeigt", () => {
  // Eine Frage ohne Text und ohne Bedienelement wäre ein leeres Pflichtfeld — also eine
  // Sperre ohne Ausweg. Auch der bewusst NICHT erhobene Stapelbarkeitsschlüssel fällt
  // hier heraus, falls ihn je ein Server mitschickt.
  assert.deepEqual(benoetigteAdressfragen(["itemsAreStackable"]), []);
  assert.deepEqual(benoetigteAdressfragen(["itemsAreStackable", FELD_ZUSTELLUNG]), [FELD_ZUSTELLUNG]);
  assert.deepEqual(benoetigteAdressfragen(["quatsch", FELD_ABHOLUNG, 42]), [FELD_ABHOLUNG]);
});

test("(A5) die Reihenfolge des Servers bleibt erhalten", () => {
  assert.deepEqual(benoetigteAdressfragen([FELD_ABHOLUNG, FELD_ZUSTELLUNG]),
    [FELD_ABHOLUNG, FELD_ZUSTELLUNG]);
  assert.deepEqual(benoetigteAdressfragen([FELD_ZUSTELLUNG, FELD_ABHOLUNG]),
    [FELD_ZUSTELLUNG, FELD_ABHOLUNG]);
});

test("(A6) das Frontend prüft NIRGENDS einen Provider", () => {
  const quellen = [
    ohneKommentar("utils/addressTypeQuestions.mjs"),
    ohneKommentar("components/booking/AddressTypeModule.jsx"),
  ].join(String.fromCharCode(10));
  for (const verboten of ["transglobal", "jumingo", "provider", "serviceType",
                          "fulfillmentMode", "pickup", "dropoff"]) {
    assert.ok(!quellen.toLowerCase().includes(verboten.toLowerCase()),
      `"${verboten}" steht in der Adressfragenlogik — die Ableitung gehört auf den Server`);
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
  assert.equal(adressangabenVollstaendig(beides, TG_PICKUP), true,
    "zwei bewusste Neins galten als unvollständig");
});

test("(B2) fehlende Angaben werden NAMENTLICH gemeldet", () => {
  // Reihenfolge wie vom Server deklariert: Zustellung zuerst.
  assert.deepEqual(fehlendeAdressangaben({}, TG_PICKUP), [FELD_ZUSTELLUNG, FELD_ABHOLUNG]);
  assert.deepEqual(fehlendeAdressangaben({ [FELD_ABHOLUNG]: false }, TG_PICKUP), [FELD_ZUSTELLUNG]);
  // Eine bei Dropoff mitgelieferte Abholangabe fehlt nicht — sie wird gar nicht gebraucht.
  assert.deepEqual(fehlendeAdressangaben({ [FELD_ZUSTELLUNG]: true }, TG_DROPOFF), []);
});

/* ══════════ C — PAYLOAD ═══════════════════════════════════════════════════ */

test("(C1) unvollständig ergibt NULL — kein halber Satz geht raus", () => {
  assert.equal(adressangabenPayload({}, TG_PICKUP), null);
  assert.equal(adressangabenPayload({ [FELD_ABHOLUNG]: true }, TG_PICKUP), null);
  assert.equal(adressangabenPayload({}, TG_DROPOFF), null);
});

test("(C2) gesendet wird nur, was DIESES Angebot braucht", () => {
  // Bei Dropoff wird die Abholangabe verworfen, auch wenn sie im Zustand steht (etwa
  // weil der Kunde vorher ein Abholangebot angesehen hat). Ein Server, der sie
  // ignoriert, wäre die schwächere Garantie.
  const werte = { [FELD_ABHOLUNG]: true, [FELD_ZUSTELLUNG]: false };
  assert.deepEqual(adressangabenPayload(werte, TG_DROPOFF), { [FELD_ZUSTELLUNG]: false });
  assert.deepEqual(adressangabenPayload(werte, TG_PICKUP),
    { [FELD_ABHOLUNG]: true, [FELD_ZUSTELLUNG]: false });
});

test("(C3) `false` überlebt den Payload unverändert", () => {
  const p = adressangabenPayload({ [FELD_ABHOLUNG]: false, [FELD_ZUSTELLUNG]: false }, TG_PICKUP);
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
  assert.equal(adressangabenHinweis({ [FELD_ABHOLUNG]: true, [FELD_ZUSTELLUNG]: true }, TG_PICKUP), "");
  const beide = adressangabenHinweis({}, TG_PICKUP);
  assert.match(beide, /Abhol- und Lieferadresse/);
  assert.match(adressangabenHinweis({ [FELD_ZUSTELLUNG]: false }, TG_PICKUP), /Abholadresse/);
  assert.match(adressangabenHinweis({ [FELD_ABHOLUNG]: false }, TG_PICKUP), /Lieferadresse/);
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
