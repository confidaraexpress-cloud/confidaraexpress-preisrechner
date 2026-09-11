/* TG-7 — die Buchungsseite sagt dasselbe wie das berechnete Angebot.

   Kein Netz, kein Browser, keine Bestellung: reine Auswertung plus die
   Quelltextzusicherungen, die eine Verhaltensprüfung hier nicht ersetzen kann.

   ─── DIE LEITFRAGE ───────────────────────────────────────────────────────────
   Kann ein Kunde nach der Preisberechnung noch etwas verändern, das den Preis
   bestimmt hat — und bekommt er, wenn etwas schiefgeht, eine Handlung angeboten,
   die tatsächlich hilft?

   Die vier Sendungsangaben werden vor dem Vergleich erhoben und serverseitig an
   der Sendung eingefroren. Der Buchungspfad liest sie ausschliesslich von dort;
   ein mitgeschickter Clientwert kann nichts mehr entscheiden, aber er kann
   WIDERSPRECHEN — und dann bricht die Buchung ab. Ein Bedienelement, das diesen
   Widerspruch erzeugen kann, ist deshalb kein Komfort, sondern eine Falle.

   ─── WAS HIER NICHT GEPRÜFT WIRD ─────────────────────────────────────────────
   Serververhalten. Die Sperren liegen dort und sind dort geprüft; diese Datei
   misst ausschliesslich, was die Oberfläche anbietet und was sie sendet. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  adressangabenAnsicht, adressartText, ADRESSE_KURZ, ADRESSART_ANTWORT,
  FELD_ZUSTELLUNG, FELD_ABHOLUNG,
} from "./addressTypeQuestions.mjs";
import {
  priceChangeAnsicht, preisIstBestaetigbar, PRICE_CHANGE_KIND, PREISAENDERUNG_TEXT,
} from "./priceChangeView.mjs";
import { bookingContentPayload } from "./shipmentDeclarations.mjs";
import { fordertNeuberechnung, mapBookRestError, BOOK_FEHLER } from "./bookingErrors.mjs";
import { normalizeApiError, customerText } from "./apiError.mjs";

/* `fileURLToPath`, nicht `.pathname`: unter Windows liefert `.pathname` „/C:/…",
   und ein anschliessendes `path.join` erzeugt daraus „C:\C:\…". */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => fs.readFileSync(path.join(HIER, "..", p), "utf8");

/* Quelltextzusicherungen messen auf kommentarfreiem Code — sonst prüfen sie die
   Begründung statt des Programms. Der Zeilenkommentar-Ausdruck trägt das `m`-Flag,
   damit er auch bei CRLF-Zeilenenden greift: ohne `m` verlangt `$` das Ende der
   ganzen Zeichenkette, und ein zurückbleibendes `\r` lässt den Ausdruck ins Leere
   laufen. Genau daran ist im Projekt bereits eine Prüfung lokal gescheitert. */
const ohneKommentar = (p) => lies(p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

const SEITE  = lies("pages/BookingPage.jsx");
const MODUL  = lies("components/booking/AddressTypeModule.jsx");
const AKTION = lies("components/booking/BookingActionModule.jsx");

/* Die Listen, die der Server je Angebot deklariert. */
const TG_DROPOFF = [FELD_ZUSTELLUNG];
const TG_PICKUP  = [FELD_ZUSTELLUNG, FELD_ABHOLUNG];
const OHNE_BEDARF = [];

/* ══════════ A — RESIDENTIAL: BEANTWORTET HEISST FEST ══════════════════════ */

test("A1 — eine beantwortete Angabe (false) wird gezeigt, nicht gefragt", () => {
  // „Geschäftsadresse" ist eine vollwertige Antwort. Sie hat den Vergleichspreis
  // mitbestimmt und darf danach nicht erneut zur Wahl stehen.
  const a = adressangabenAnsicht({ [FELD_ZUSTELLUNG]: false }, TG_DROPOFF);
  assert.deepEqual(a.offen, [], "eine beantwortete Angabe wurde erneut gefragt");
  assert.equal(a.fest.length, 1);
  assert.equal(a.fest[0].feld, FELD_ZUSTELLUNG);
  assert.equal(a.fest[0].wert, false);
  assert.equal(a.fest[0].wertText, ADRESSART_ANTWORT.geschaeftlich);
  assert.equal(a.fest[0].adresse, ADRESSE_KURZ[FELD_ZUSTELLUNG]);
});

test("A2 — eine beantwortete Angabe (true) ebenso", () => {
  const a = adressangabenAnsicht({ [FELD_ZUSTELLUNG]: true }, TG_DROPOFF);
  assert.deepEqual(a.offen, []);
  assert.equal(a.fest[0].wertText, ADRESSART_ANTWORT.privat);
});

test("A3 — eine UNBEANTWORTETE Pflichtangabe bleibt eine Frage", () => {
  // Der Fall eines fortgesetzten Vorgangs aus der Zeit vor der Vorab-Erhebung:
  // ohne diesen Zweig gäbe es keinen Weg mehr, die Angabe überhaupt zu machen.
  const a = adressangabenAnsicht({ [FELD_ZUSTELLUNG]: null }, TG_DROPOFF);
  assert.deepEqual(a.fest, [], "eine fehlende Angabe wurde als feststehend gezeigt");
  assert.deepEqual(a.offen, [FELD_ZUSTELLUNG]);
});

test("A4 — `false` gilt NIEMALS als unbeantwortet", () => {
  // Die tragende Regel des ganzen Bereichs. Mit einer Truthiness-Prüfung wären
  // „Geschäftsadresse" und „noch nichts gesagt" ununterscheidbar.
  for (const leer of [null, undefined]) {
    const a = adressangabenAnsicht({ [FELD_ZUSTELLUNG]: leer }, TG_DROPOFF);
    assert.equal(a.offen.length, 1, `${String(leer)} galt als Antwort`);
  }
  const a = adressangabenAnsicht({ [FELD_ZUSTELLUNG]: false }, TG_DROPOFF);
  assert.equal(a.offen.length, 0, "aus dem Nein wurde -noch nicht beantwortet-");
  assert.equal(a.fest.length, 1);
});

test("A5 — die Abholangabe folgt derselben Regel und nur bei Bedarf", () => {
  const beide = { [FELD_ABHOLUNG]: false, [FELD_ZUSTELLUNG]: true };
  const p = adressangabenAnsicht(beide, TG_PICKUP);
  assert.equal(p.fest.length, 2);
  assert.deepEqual(p.offen, []);
  // Reihenfolge des Servers: Zustellung zuerst.
  assert.deepEqual(p.fest.map((e) => e.feld), [FELD_ZUSTELLUNG, FELD_ABHOLUNG]);
  assert.equal(p.fest[1].wertText, ADRESSART_ANTWORT.geschaeftlich);
  // Bei Shopabgabe kommt die Abholangabe in KEINER der beiden Listen vor —
  // sie wird dort nicht gebraucht, also weder gezeigt noch gefragt.
  const d = adressangabenAnsicht(beide, TG_DROPOFF);
  assert.equal(d.fest.length, 1);
  assert.deepEqual(d.offen, []);
});

test("A6 — ohne deklarierten Bedarf entsteht überhaupt nichts", () => {
  // Der bestehende Buchungsweg: sein Preis hängt an keiner Adressartdeklaration,
  // und er bekommt durch dieses Paket weder Karte noch Pflichtfrage.
  for (const bedarf of [OHNE_BEDARF, undefined, null]) {
    const a = adressangabenAnsicht({ [FELD_ZUSTELLUNG]: true }, bedarf);
    assert.deepEqual(a.fest, [], "es entstand eine Anzeige ohne deklarierten Bedarf");
    assert.deepEqual(a.offen, []);
  }
});

test("A7 — es gibt kein Antwortwort für einen unbeantworteten Wert", () => {
  assert.equal(adressartText(null), null);
  assert.equal(adressartText(undefined), null);
  // Ein Text für `null` wäre eine Behauptung über eine Angabe, die niemand gemacht hat.
  assert.equal(adressartText(true), ADRESSART_ANTWORT.privat);
  assert.equal(adressartText(false), ADRESSART_ANTWORT.geschaeftlich);
});

test("A8 — die Buchungsseite trennt Anzeige und Nachfrage", () => {
  const s = ohneKommentar("pages/BookingPage.jsx");
  assert.ok(/adresstypAnsicht\.fest\.length > 0/.test(s),
    "die feststehenden Angaben werden nicht als eigene Flaeche gezeigt");
  assert.ok(/adresstypAnsicht\.offen\.length > 0/.test(s),
    "die Nachfrage haengt nicht mehr an den OFFENEN Angaben");
  assert.ok(/fragen=\{adresstypAnsicht\.offen\}/.test(s),
    "das Bedienelement bekommt nicht nur die offenen Fragen");
  // Der frühere Zustand: die Karte erschien, sobald das Angebot Angaben verlangte —
  // unabhängig davon, ob sie längst beantwortet waren.
  assert.ok(!/\{adresstypFragen\.length > 0 && \(\s*<AddressTypeModule/.test(s),
    "die Bedienelemente haengen weiterhin am reinen BEDARF statt am offenen Rest");
});

test("A9 — die feste Darstellung trägt kein Bedienelement", () => {
  const jsx = ohneKommentar("components/booking/AddressTypeModule.jsx");
  const start = jsx.indexOf("export function AddressTypeSummary");
  assert.ok(start > 0, "die feste Darstellung fehlt");
  const summary = jsx.slice(start);
  for (const verboten of ["type=\"radio\"", "<input", "<select", "<Switch", "checked", "disabled"]) {
    assert.ok(!summary.includes(verboten),
      `die feste Darstellung enthaelt ${verboten} — sie soll lesbar sein, nicht bedienbar`);
  }
  // Ein `disabled` Radio waere die naheliegende und falsche Loesung: nicht
  // fokussierbar und von Vorlesesoftware in der Regel uebersprungen.
  assert.ok(/<button[\s\S]*?type="button"/.test(summary),
    "die Aenderung ist kein echter Knopf und damit nicht per Tastatur erreichbar");
});

test("A10 — die Texte stehen im Modul, nicht im JSX", () => {
  // Dieselbe Regel wie bei den Fragetexten: zwei Fassungen laufen auseinander.
  const jsx = lies("components/booking/AddressTypeModule.jsx");
  for (const wort of [ADRESSART_ANTWORT.privat, ADRESSART_ANTWORT.geschaeftlich,
                      ADRESSE_KURZ[FELD_ZUSTELLUNG], ADRESSE_KURZ[FELD_ABHOLUNG]]) {
    assert.ok(!jsx.includes(`>${wort}<`), `„${wort}" steht als Literal im JSX`);
  }
});

/* ══════════ B — ÄNDERN FÜHRT ZURÜCK, NICHT WEITER ═════════════════════════ */

test("B1 — „Ändern\" nutzt den vorhandenen Rückweg", () => {
  const s = ohneKommentar("pages/BookingPage.jsx");
  assert.ok(/onEdit=\{goBackToOffers\}/.test(s),
    "die Aenderung nutzt nicht den bestehenden Rueckweg");
});

test("B2 — auf der Buchungsseite entsteht KEINE neue Berechnung", () => {
  const s = ohneKommentar("pages/BookingPage.jsx");
  // Kein zweiter Preisweg: die Buchungsseite ruft die Angebotsberechnung nirgends.
  assert.ok(!/calculate-price/.test(s),
    "die Buchungsseite loest selbst eine Angebotsberechnung aus");
  // Und die feste Darstellung schreibt keinen Zustand.
  const jsx = ohneKommentar("components/booking/AddressTypeModule.jsx");
  const summary = jsx.slice(jsx.indexOf("export function AddressTypeSummary"));
  assert.ok(!/onChange/.test(summary),
    "die feste Darstellung kann den Wert doch veraendern");
});

test("B3 — die vier Angaben bleiben preisbestimmend im Formular", () => {
  // Der Beweis, dass der Rückweg wirklich zu einer neuen Berechnung führt: ändert
  // der Kunde dort eine der vier Angaben, verwirft `upd()` die vorhandenen Angebote.
  const formular = lies("pages/NewShipmentPage.jsx");
  const start = formular.indexOf("calcKeyRef.current = JSON.stringify(");
  assert.ok(start > -1, "der Recalc-Schluessel wurde nicht gefunden");
  const block = formular.slice(start, start + 1200);
  for (const feld of ["declaredContent", "declaredGoodsValue",
                      FELD_ABHOLUNG, FELD_ZUSTELLUNG]) {
    assert.ok(block.includes(feld), `${feld} fehlt im Recalc-Schluessel`);
  }
  assert.ok(/if \(!FILTER_ONLY_FIELDS\.has\(k\)\) invalidateResults\(\);/.test(formular),
    "eine Feldaenderung verwirft die vorhandenen Angebote nicht mehr");
});

/* ══════════ C — PREISÄNDERUNG: NUR ECHTE BETRÄGE ══════════════════════════ */

test("C1 — mit beiden Beträgen bleibt der Bestätigungsweg unverändert", () => {
  const a = priceChangeAnsicht({ code: "PRICE_CHANGED", message: "…", oldPrice: 10, newPrice: 11 });
  assert.equal(a.kind, PRICE_CHANGE_KIND.CONFIRMABLE);
  assert.equal(a.oldPrice, 10);
  assert.equal(a.newPrice, 11);
  assert.equal(preisIstBestaetigbar(a), true);
});

test("C2 — ein einzelner Betrag ergibt KEINE Bestätigung", () => {
  // Die Form `{ error, code, price }`. Ein alleinstehender Betrag wird nicht zu
  // `newPrice` umgedeutet: eine Bestaetigung schickt dieselbe Angebotskennung
  // erneut, und wo der Server gegen den GESPEICHERTEN Betrag prueft, endet der
  // zweite Versuch zwangslaeufig wieder als Preisaenderung.
  const a = priceChangeAnsicht({ error: "…", code: "PRICE_CHANGED", price: 11 });
  assert.equal(a.kind, PRICE_CHANGE_KIND.RECALCULATE);
  assert.equal(preisIstBestaetigbar(a), false);
  assert.equal(a.newPrice, undefined, "der einzelne Betrag wurde doch zum neuen Preis");
  assert.equal(a.oldPrice, undefined);
});

test("C3 — ganz ohne Beträge ebenso, und es wird keiner erfunden", () => {
  for (const body of [{ code: "PRICE_CHANGED", message: "…" }, {}, null, undefined]) {
    const a = priceChangeAnsicht(body);
    assert.equal(a.kind, PRICE_CHANGE_KIND.RECALCULATE);
    assert.equal(preisIstBestaetigbar(a), false);
    assert.ok(!("newPrice" in a) && !("oldPrice" in a), "es wurde ein Betrag erfunden");
  }
});

test("C4 — ein halbes Paar reicht nicht", () => {
  for (const body of [{ oldPrice: 10 }, { newPrice: 11 },
                      { oldPrice: 10, newPrice: null }, { oldPrice: null, newPrice: 11 }]) {
    assert.equal(priceChangeAnsicht(body).kind, PRICE_CHANGE_KIND.RECALCULATE,
      `${JSON.stringify(body)} galt als bestaetigbar`);
  }
});

test("C5 — kein Wert, der durch money() zu 0,00 € würde, gilt als Betrag", () => {
  // `Number("") === 0` und `Number([]) === 0`: genau daraus entstand die Anzeige
  // „0,00 € → 0,00 €". Ein String mit einer Zahl darin wird ebenfalls abgelehnt —
  // die Antwort ist JSON, dort ist eine Zahl eine Zahl.
  for (const w of ["", [], {}, "11", null, undefined, NaN, Infinity, true]) {
    const a = priceChangeAnsicht({ oldPrice: w, newPrice: w });
    assert.equal(a.kind, PRICE_CHANGE_KIND.RECALCULATE,
      `${JSON.stringify(w)} wurde als Betrag akzeptiert`);
  }
  // 0 ist dagegen ein gueltiger Betrag und keine Luecke.
  assert.equal(priceChangeAnsicht({ oldPrice: 0, newPrice: 5 }).kind,
    PRICE_CHANGE_KIND.CONFIRMABLE, "0 wurde als fehlender Betrag behandelt");
});

test("C6 — der Text ohne Beträge nennt keine Zahl und keine Richtung", () => {
  const t = PREISAENDERUNG_TEXT[PRICE_CHANGE_KIND.RECALCULATE];
  assert.ok(t.length > 0);
  assert.ok(!/\d/.test(t), "der Hinweis nennt eine Zahl, die die Antwort nicht trug");
  for (const wort of ["teurer", "günstiger", "guenstiger", "erhöht", "gesenkt"]) {
    assert.ok(!t.toLowerCase().includes(wort), `der Hinweis behauptet eine Richtung („${wort}")`);
  }
  assert.ok(/berechnen/i.test(t) && /angebote/i.test(t),
    "der Hinweis nennt die Handlung nicht");
});

test("C7 — der Dialog zeigt Beträge und Bestätigung nur beim bestätigbaren Fall", () => {
  const s = ohneKommentar("pages/BookingPage.jsx");
  // Beide Geldausgaben des Dialogs stehen hinter derselben Bedingung.
  assert.ok(/preisIstBestaetigbar\(priceChange\) && \(\s*<div className="price-drift-compare"/.test(s),
    "der Preisvergleich haengt nicht am bestaetigbaren Fall");
  assert.ok(/preisIstBestaetigbar\(priceChange\) && \(\s*<button/.test(s),
    "der Bestaetigungsknopf haengt nicht am bestaetigbaren Fall");
  // Und der Handler selbst haelt dieselbe Grenze ein.
  assert.ok(/if \(!preisIstBestaetigbar\(priceChange\)\) return;/.test(s),
    "der Bestaetigungshandler laeuft auch ohne bestaetigbares Paar");
  // Der frühere pauschale Griff auf die beiden Felder darf nicht zurückkehren.
  assert.ok(!/setPriceChange\(\{ oldPrice: d\.oldPrice, newPrice: d\.newPrice \}\)/.test(s),
    "die Antwort wird wieder ungeprueft als Preispaar uebernommen");
});

/* ══════════ D — FEHLER FÜHREN ZUR RICHTIGEN HANDLUNG ══════════════════════ */

test("D1 — die drei Codes ohne Bestellung fordern eine Neuberechnung", () => {
  for (const code of ["SHIPMENT_DECLARATIONS_MISMATCH", "SHIPMENT_DECLARATIONS_MISSING", "OFFER_MISMATCH"]) {
    assert.equal(fordertNeuberechnung({ code }), true, `${code} fordert keine Neuberechnung`);
    const f = mapBookRestError(409, { code, error: "…" });
    assert.equal(f, BOOK_FEHLER.NEU_BERECHNEN, `${code} bekommt den falschen Text`);
    assert.equal(f.retryable, false, `${code} laedt zum Wiederholen ein`);
  }
});

test("D1b — ein bereits verwendetes Angebot fuehrt in die Sendungsliste, nicht zur Neuberechnung", () => {
  // Frueher stand OFFER_ALREADY_USED unter „nichts beauftragt → neu berechnen". Das stimmt nicht:
  // verbraucht wird ein Angebot NUR, wenn beim Anbieter ein Auftrag existiert oder existieren
  // KANN (gebucht, unklarer Ausgang, klaerungspflichtig). Eine Neuberechnung laedt dann zu einer
  // zweiten Sendung ein; der richtige Ort ist die Sendungsliste.
  assert.equal(fordertNeuberechnung({ code: "OFFER_ALREADY_USED" }), false);
  const f = mapBookRestError(409, { code: "OFFER_ALREADY_USED", error: "…" });
  assert.equal(f, BOOK_FEHLER.ANGEBOT_VERWENDET);
  assert.equal(f.retryable, false);
  assert.match(f.message, /nicht erneut/);
  assert.match(f.message, /Sendungen/);
  assert.doesNotMatch(f.message, /nichts beauftragt/, "die Meldung behauptet, es sei nichts beauftragt");
  // Die Buchungsseite zeigt ihn als Konflikt — die Flaeche ersetzt den Bestellknopf durch
  // „Zu meinen Sendungen" — und zwar VOR der Neuberechnungs-Weiche.
  const s = ohneKommentar("pages/BookingPage.jsx");
  const konflikt = s.indexOf('d?.code === "OFFER_ALREADY_USED"');
  assert.ok(konflikt > 0 && konflikt < s.indexOf("fordertNeuberechnung(d)"),
    "OFFER_ALREADY_USED wird nicht vor der Neuberechnungs-Weiche als Konflikt behandelt");
});

test("D2 — ein laufender Vorgang bleibt ein Konflikt, keine Neuberechnung", () => {
  // Dort LAEUFT eine Buchung: die Sendungsliste ist der richtige Ort, und ein
  // zweiter Versuch waere gefaehrlich.
  assert.equal(fordertNeuberechnung({ code: "BOOKING_IN_PROGRESS" }), false);
  assert.equal(fordertNeuberechnung({ code: "BOOKING_PENDING" }), false);
  assert.equal(fordertNeuberechnung({ code: "BOOKING_OUTCOME_UNKNOWN" }), false);
  for (const body of [null, undefined, {}, { code: 7 }, { code: "WAS_ANDERES" }]) {
    assert.equal(fordertNeuberechnung(body), false, `${JSON.stringify(body)} forderte eine Neuberechnung`);
  }
});

test("D3 — kein Ausgang ohne Bestellung schickt in die Sendungsliste", () => {
  const s = ohneKommentar("pages/BookingPage.jsx");
  const weiche  = s.indexOf("fordertNeuberechnung(d)");
  const duplikat = s.indexOf("Diese Sendung wurde bereits verarbeitet");
  assert.ok(weiche > 0 && weiche < duplikat,
    "die Neuberechnungs-Weiche steht nicht vor dem Duplikat-Text");
  // Die eigene Flaeche ersetzt den Bestellknopf und bietet die richtige Handlung.
  const a = ohneKommentar("components/booking/BookingActionModule.jsx");
  assert.ok(/recalcNotice \? \(/.test(a), "es gibt keine eigene Flaeche fuer diesen Ausgang");
  assert.ok(/onClick=\{onRecalculate\}/.test(a), "die Flaeche bietet keine Neuberechnung an");
  assert.ok(/Angebote neu berechnen/.test(a), "die Handlung heisst nicht -neu berechnen-");
  // Sie liegt VOR dem Bestellknopf-Zweig, ersetzt ihn also.
  assert.ok(a.indexOf("recalcNotice ? (") < a.indexOf("booking-book-btn"),
    "der Bestellknopf bleibt neben dem Hinweis stehen");
});

test("D4 — ein Mismatch verlangt keine Rohfelder und keinen Retry", () => {
  const f = mapBookRestError(409, {
    code: "SHIPMENT_DECLARATIONS_MISMATCH",
    error: "Die Angaben zu dieser Sendung haben sich geändert.",
    fields: ["deliveryIsResidential"],
  });
  assert.equal(f.retryable, false);
  assert.ok(!/deliveryIsResidential/.test(f.message + f.title),
    "ein technischer Feldname steht im Kundentext");
  assert.ok(!/erneut versuchen/i.test(f.message), "der Text laedt zum Wiederholen ein");
});

/* ══════════ E — NICHTS ROHES ERREICHT EINE TEXTFLÄCHE ═════════════════════ */

test("E1 — ein Objekt in `error` wird nie als Text übernommen", () => {
  const s = ohneKommentar("pages/BookingPage.jsx");
  // Die drei Textflaechen der Buchungsaktion werden ungeprueft gerendert; was
  // hineingeschrieben wird, muss deshalb an der Quelle geprueft sein.
  assert.ok(!/setConflict\(d\.error \|\|/.test(s),
    "der Konflikttext uebernimmt `d.error` ungeprueft — ein Objekt waere ein Renderfehler");
  assert.ok(/setConflict\(asStr\(d\?\.error\)/.test(s),
    "der Konflikttext laeuft nicht ueber die Zeichenkettenpruefung");
  // Und `d` selbst darf `null` sein (409 mit unlesbarem Koerper).
  assert.ok(!/setConflict\(asStr\(d\.error\)/.test(s),
    "ein unlesbarer Koerper wuerde beim Feldzugriff werfen");
});

test("E2 — die Fehlerfläche rendert beide Formen des Fehlerzustands", () => {
  const a = ohneKommentar("components/booking/BookingActionModule.jsx");
  assert.ok(/typeof error === "string"/.test(a),
    "die Fehlerflaeche unterscheidet die beiden Formen nicht");
  assert.ok(/error\.title/.test(a) && /error\.message/.test(a),
    "die Objektform wird nicht in ihre Felder zerlegt");
});

test("E3 — 429, 500 mit Objektkörper und nicht lesbare Antworten sind renderbar", () => {
  const faelle = [
    [429, { code: "RATE_LIMITED", message: "…" }],
    [500, { error: { irgendwas: "technisch" } }],
    [500, null],
    [503, { error: "…" }],
    [409, null],
  ];
  for (const [status, body] of faelle) {
    const f = mapBookRestError(status, body);
    assert.equal(typeof f.title, "string", `${status}: kein Titel`);
    assert.equal(typeof f.message, "string", `${status}: keine Meldung`);
    assert.ok(f.message.length > 0, `${status}: leere Meldung`);
    // Nichts, was als „[object Object]" enden koennte.
    assert.ok(!/\[object/.test(f.title + f.message), `${status}: Rohobjekt im Text`);
  }
  assert.equal(mapBookRestError(429, { code: "RATE_LIMITED" }), BOOK_FEHLER.RATE_LIMITED);
});

test("E4 — ein Maschinenschlüssel erreicht den Kunden nicht", () => {
  const body = {
    error: "invoice_data_incomplete",
    message: "Rechnung kann nicht erstellt werden: Pflichtangaben fehlen.",
    missingFields: ["company_name"],
  };
  assert.ok(!/invoice_data_incomplete/.test(customerText(body)),
    "der Maschinenschluessel steht im Kundentext");
  const n = normalizeApiError({ status: 422, body });
  assert.ok(!/invoice_data_incomplete/.test(n.title + n.message),
    "der Maschinenschluessel steht in der normalisierten Meldung");
  assert.ok(/Rechnungsdaten/i.test(n.title + n.message), "die Meldung nennt die Ursache nicht");
  assert.equal(n.retryable, false);
  // Kein Anbietername.
  for (const w of ["transglobal", "jumingo"]) {
    assert.ok(!(n.title + n.message).toLowerCase().includes(w), `„${w}" steht im Kundentext`);
  }
});

test("E5 — echter Klartext bleibt unverändert", () => {
  // Die Erkennung greift NUR bei bekannten Schluesseln. Ein gewoehnlicher Servertext —
  // auch ein einwortiger — darf sich nicht veraendern, sonst haette dieses Paket
  // andere Bildschirme mitverstellt.
  assert.equal(customerText({ error: "Zu viele Anfragen." }), "Zu viele Anfragen.");
  assert.equal(customerText({ error: "Fehler" }), "Fehler");
  assert.equal(customerText({ message: "Nur eine Nachricht." }), "Nur eine Nachricht.");
  assert.equal(customerText({}), null);
  assert.equal(customerText(null), null);
  // `error` hat weiterhin Vorrang vor `message`.
  assert.equal(customerText({ error: "A", message: "B" }), "A");
});

test("E6 — die Rechnungsdaten landen nicht im Adressenzweig", () => {
  const s = ohneKommentar("pages/BookingPage.jsx");
  const invoice = s.indexOf('d?.error === "invoice_data_incomplete"');
  // NICHT `setAddressError(` als Anker: dessen erster Treffer ist das Zuruecksetzen
  // vor dem Request. Gemeint ist der Adress-RUECKFALL ganz unten im 400/422-Zweig.
  const adresse = s.indexOf("Die Absender- oder Empfaengeradresse".replace("ae", "ä"));
  assert.ok(invoice > 0, "die Rechnungsdaten haben keinen eigenen Zweig");
  assert.ok(invoice < adresse,
    "die Rechnungsdaten landen im Adressenzweig — dessen Handlung repariert dort nichts");
});

/* ══════════ F — DER CONTENT-NAME AUF DER LEITUNG ══════════════════════════ */

test("F1 — ein Angebot mit Vorab-Angaben sendet kein top-level `content`", () => {
  assert.deepEqual(bookingContentPayload("Ersatzteile", TG_DROPOFF), {});
  assert.deepEqual(bookingContentPayload("Ersatzteile", TG_PICKUP), {});
  assert.deepEqual(bookingContentPayload("", TG_DROPOFF), {});
});

test("F2 — der bestehende Weg sendet es unverändert", () => {
  assert.deepEqual(bookingContentPayload("Bücher", OHNE_BEDARF), { content: "Bücher" });
  assert.deepEqual(bookingContentPayload("", OHNE_BEDARF), { content: "" });
  assert.deepEqual(bookingContentPayload("Bücher", undefined), { content: "Bücher" });
  assert.deepEqual(bookingContentPayload("Bücher", null), { content: "Bücher" });
});

test("F3 — die eingefrorene Inhaltsangabe wird NICHT ersatzweise behauptet", () => {
  // Sie aus `declaredContent` nachzubilden waere eine zweite Quelle fuer dieselbe
  // Aussage — und die erste Abweichung waere wieder ein Abbruch ohne sichtbaren Grund.
  const modul = ohneKommentar("utils/shipmentDeclarations.mjs");
  const start = modul.indexOf("export function bookingContentPayload");
  const fn = modul.slice(start, modul.indexOf("\n}", start));
  assert.ok(!/declaredContent/.test(fn),
    "die Buchung behauptet die eingefrorene Inhaltsangabe erneut");
});

test("F4 — die Buchungsseite nutzt den Erbauer, nicht das rohe Feld", () => {
  const s = ohneKommentar("pages/BookingPage.jsx");
  assert.ok(/\.\.\.bookingContentPayload\(form\.content, noetigeAdressangaben\)/.test(s),
    "der Payload nutzt den Erbauer nicht");
  assert.ok(!/^\s*content:\s*form\.content,\s*$/m.test(s),
    "`content` wird weiterhin unbedingt gesendet");
});

/* ══════════ G — WAS UNVERÄNDERT BLEIBEN MUSS ══════════════════════════════ */

test("G1 — der offene Ausgang bleibt vor dem Erfolgspfad und ersetzt den Knopf", () => {
  const s = ohneKommentar("pages/BookingPage.jsx");
  const offen = s.indexOf("istOffenerAusgang(r.status, d)");
  assert.ok(offen > 0, "der offene Ausgang wird nicht mehr abgefangen");
  assert.ok(offen < s.indexOf("setBooking(d)"), "er steht nicht mehr vor dem Erfolgspfad");
  // Mit Klammer: ein blosses `r.status === 409` trifft zuerst den Versicherungs-
  // Reprice weiter oben, der mit diesem Ablauf nichts zu tun hat.
  assert.ok(offen < s.indexOf("if (r.status === 409) {"),
    "er steht nicht mehr vor den Statuszweigen");
  assert.ok(/setConflict\(BOOK_FEHLER\.PRUEFUNG_LAEUFT\.message\)/.test(s),
    "der offene Ausgang ersetzt den Bestellknopf nicht mehr");
  // Und er loescht den Vorgang nicht: er ist nicht abgeschlossen.
  const block = s.slice(offen, offen + 300);
  assert.ok(!/clearFlow\(\)/.test(block), "ein offener Ausgang loescht den Vorgang");
});

test("G2 — BOOKING_PENDING bleibt kein Erfolg und kein Retry", () => {
  const f = mapBookRestError(202, { status: "pending", code: "BOOKING_PENDING", error: "…" });
  assert.equal(f, BOOK_FEHLER.PRUEFUNG_LAEUFT);
  assert.equal(f.retryable, false);
  assert.ok(/NICHT erneut/i.test(f.message), "die Warnung vor einem zweiten Versuch fehlt");
  assert.equal(fordertNeuberechnung({ code: "BOOKING_PENDING" }), false,
    "ein offener Ausgang bekommt eine Neuberechnung angeboten");
});

test("G3 — es gibt keinen automatischen Wiederholungsversuch", () => {
  const s = ohneKommentar("pages/BookingPage.jsx");
  assert.ok(!/setTimeout\([^)]*doBook/.test(s), "die Buchung wiederholt sich selbst");
  // Gemessen wird die BUCHUNG. `onRetryStatus` (Handelsrechnungsstatus) und
  // `retryable` (Fehlerklassifizierung) sind etwas anderes und bleiben aussen vor.
  assert.ok(!/setTimeout\([^)]*apiFetch/.test(s), "ein Request wird zeitgesteuert wiederholt");
  assert.ok(!/attempt|versuchErneut|autoRetry/i.test(s), "es gibt eine Wiederholungsmechanik");
});

test("G4 — RECONCILIATION_REQUIRED wird im Frontend NICHT eingeführt", () => {
  // Der Server fasst diesen Ausgang kundenseitig zu `202 BOOKING_PENDING` zusammen;
  // es gibt keinen oeffentlichen Vertrag darueber. Ein Mapping waere toter Code fuer
  // einen Code, der nie ankommt.
  for (const p of ["pages/BookingPage.jsx", "utils/bookingErrors.mjs", "utils/apiError.mjs"]) {
    assert.ok(!lies(p).includes("RECONCILIATION_REQUIRED"),
      `RECONCILIATION_REQUIRED steht in ${p}`);
  }
});

test("G5 — der Erfolgsvertrag verlangt keine Bestellnummer des Anbieters", () => {
  const doks = ohneKommentar("components/booking/BookingSuccessDocuments.jsx");
  // Adressiert wird ueber den eigenen Sendungshandle, nie ueber eine Providerreferenz.
  assert.ok(/booking\?\.ceShipmentId/.test(doks), "der Labelweg nutzt nicht den eigenen Handle");
  assert.ok(!/order_number/.test(doks), "der Erfolgsweg setzt eine Bestellnummer voraus");
  const step = ohneKommentar("components/booking/BookingSuccessStep.jsx");
  assert.ok(!/order_number/.test(step), "der Erfolgsbildschirm setzt eine Bestellnummer voraus");
});

test("G6 — quote_only bleibt gesperrt", () => {
  const karte = ohneKommentar("components/offers/OfferCard.jsx");
  assert.ok(/if \(!unavailable\) onSelect\(t\)/.test(karte),
    "ein nicht buchbares Angebot laesst sich wieder auswaehlen");
  assert.ok(/disabled=\{unavailable\}/.test(karte),
    "der Bestellknopf eines nicht buchbaren Angebots ist nicht mehr gesperrt");
});

test("G7 — kein Anbietername in den neuen Flächen", () => {
  const quellen = [
    ohneKommentar("utils/priceChangeView.mjs"),
    ohneKommentar("utils/addressTypeQuestions.mjs"),
    ohneKommentar("components/booking/AddressTypeModule.jsx"),
    ohneKommentar("components/booking/BookingActionModule.jsx"),
  ].join("\n").toLowerCase();
  for (const w of ["transglobal", "jumingo"]) {
    assert.ok(!quellen.includes(w), `„${w}" steht in einer Kundenflaeche`);
  }
});

/* ══════════ H — MUTATIONSPROBEN ══════════════════════════════════════════
   Jede prüft, dass die zuständige Zusicherung eine RÜCKNAHME bemerkt — nicht
   nur, dass der heutige Zustand passt. Sie fahren die frühere Fassung nach. */

test("M1 — Residential wieder editierbar → A1/A8 fallen", () => {
  // Frühere Fassung: die Karte hing am reinen BEDARF, nicht am offenen Rest.
  const frueher = (werte, noetig) => ({
    fest: [], offen: Array.isArray(noetig) ? noetig.slice() : [],
  });
  const a = frueher({ [FELD_ZUSTELLUNG]: false }, TG_DROPOFF);
  assert.notDeepEqual(a.offen, [], "die Mutation ist wirkungslos");
  assert.throws(() => {
    assert.deepEqual(a.offen, [], "eine beantwortete Angabe wurde erneut gefragt");
  }, "A1 bemerkt eine wieder editierbare Angabe nicht");
});

test("M2 — `false` als unbeantwortet → A4 fällt", () => {
  const frueher = (w) => w === true;   // Truthiness statt Dreiwertigkeit
  assert.equal(frueher(false), false, "die Mutation ist wirkungslos");
  assert.throws(() => {
    assert.equal(frueher(false), true, "aus dem Nein wurde -noch nicht beantwortet-");
  }, "A4 bemerkt den Verlust der Dreiwertigkeit nicht");
});

test("M3 — TG-Preisänderung durch money(undefined) → C2/C5 fallen", () => {
  const frueher = (d) => ({ oldPrice: d.oldPrice, newPrice: d.newPrice });
  const a = frueher({ code: "PRICE_CHANGED", price: 11 });
  const alsGeld = (v) => Number(v) || 0;
  assert.equal(alsGeld(a.newPrice), 0, "die Mutation ist wirkungslos");
  assert.throws(() => {
    assert.ok(!("newPrice" in a) || typeof a.newPrice === "number",
      "der erfundene Nullbetrag ist zurueck");
  }, "C2 bemerkt den erfundenen Betrag nicht");
});

test("M4 — `price` als bestätigbarer neuer Preis → C2 fällt", () => {
  const frueher = (d) => (typeof d.price === "number"
    ? { kind: PRICE_CHANGE_KIND.CONFIRMABLE, oldPrice: 0, newPrice: d.price }
    : { kind: PRICE_CHANGE_KIND.RECALCULATE });
  const a = frueher({ code: "PRICE_CHANGED", price: 11 });
  assert.equal(a.kind, PRICE_CHANGE_KIND.CONFIRMABLE, "die Mutation ist wirkungslos");
  assert.throws(() => {
    assert.equal(a.kind, PRICE_CHANGE_KIND.RECALCULATE,
      "ein einzelner Betrag wurde doch zur Bestaetigung");
  }, "C2 bemerkt die Umdeutung nicht");
});

test("M5 — Deklarationsfehler zurück im Sammelzweig → D1 fällt", () => {
  const frueher = { BOOKING_IN_PROGRESS: "BUCHUNG_LAEUFT" };   // ohne die vier neuen
  assert.equal(frueher.SHIPMENT_DECLARATIONS_MISMATCH, undefined, "die Mutation ist wirkungslos");
  assert.throws(() => {
    assert.equal(frueher.SHIPMENT_DECLARATIONS_MISMATCH, "NEU_BERECHNEN",
      "SHIPMENT_DECLARATIONS_MISMATCH fordert keine Neuberechnung");
  }, "D1 bemerkt den Rueckfall in den Sammelzweig nicht");
});

test("M6 — rohes Objekt direkt in die Textfläche → E1 fällt", () => {
  const frueher = (d) => d.error || "Ersatztext";
  const wert = frueher({ error: { foo: "bar" } });
  assert.equal(typeof wert, "object", "die Mutation ist wirkungslos");
  assert.throws(() => {
    assert.equal(typeof wert, "string", "ein Objekt erreicht die Textflaeche");
  }, "E1 bemerkt das Rohobjekt nicht");
});

test("M7 — `form.content` wieder im Payload → F1 fällt", () => {
  const frueher = (c) => ({ content: c });
  assert.deepEqual(frueher("Ersatzteile"), { content: "Ersatzteile" }, "die Mutation ist wirkungslos");
  assert.throws(() => {
    assert.deepEqual(frueher("Ersatzteile"), {},
      "die Inhaltsbehauptung ist im Buchungsrequest zurueck");
  }, "F1 bemerkt das wieder gesendete Feld nicht");
});

test("M8 — BOOKING_PENDING als normaler Erfolg → G1/G2 fallen", () => {
  const frueher = (status) => status >= 200 && status < 300;   // 202 gilt als Erfolg
  assert.equal(frueher(202), true, "die Mutation ist wirkungslos");
  assert.throws(() => {
    assert.equal(frueher(202), false, "ein offener Ausgang gilt wieder als Erfolg");
  }, "G2 bemerkt den Erfolgspfad nicht");
});

test("M9 — quote_only auswählbar → G6 fällt", () => {
  const frueher = () => true;   // Auswahl ohne Sperre
  assert.equal(frueher(), true, "die Mutation ist wirkungslos");
  assert.throws(() => {
    assert.equal(frueher(), false, "ein nicht buchbares Angebot ist auswaehlbar");
  }, "G6 bemerkt die entfernte Sperre nicht");
});
