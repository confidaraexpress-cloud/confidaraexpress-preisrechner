/* Paket 9A — die vier Sendungsangaben von „Neue Sendung".

   Gemessen wird das reine Modul UND die Verdrahtung im Quelltext der Seite: ein Modul,
   das richtig rechnet und nirgends aufgerufen wird, ist keine Zusage.

   Kein Netz, kein React-Renderer, kein Backend. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  DECLARED_CONTENT_MAX, DECLARED_GOODS_VALUE_MAX, blankDeclarations,
  declarationErrors, declarationsComplete, declarationsPayload,
  declarationsSnapshot, declarationsFromSnapshot,
} from "./shipmentDeclarations.mjs";
import { createEmptyShipmentForm } from "./newShipmentForm.mjs";
import { getShipmentFormSnapshot } from "./shipmentFormSnapshot.mjs";
import { buildResumeInitialState } from "./formDraftsView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => readFileSync(path.join(HIER, rel), "utf8");
const SEITE = lies("../pages/NewShipmentPage.jsx");
const BUCHUNG = lies("../pages/BookingPage.jsx");

const VOLL = (over = {}) => ({
  declaredContent: "Ersatzteile", declaredGoodsValue: "250",
  collectionIsResidential: false, deliveryIsResidential: true,
  ...over,
});

/* ══════════ Der Ausgangszustand ════════════════════════════════════════════ */

test("A1 — der Ausgangszustand erfindet nichts: kein Inhalt, kein Wert, keine Antwort", () => {
  assert.deepEqual(blankDeclarations(), {
    declaredContent: "", declaredGoodsValue: "",
    collectionIsResidential: null, deliveryIsResidential: null,
  });
  // Insbesondere KEIN `false`: das wäre die Behauptung „Geschäftsadresse", und die ist
  // preiswirksam. Und kein "Paket"/0 — dieselbe Klasse von Ersatzwert.
  const leer = createEmptyShipmentForm();
  assert.strictEqual(leer.collectionIsResidential, null);
  assert.strictEqual(leer.deliveryIsResidential, null);
  assert.strictEqual(leer.declaredContent, "");
  assert.strictEqual(leer.declaredGoodsValue, "");
});

/* ══════════ Pflicht und Dreiwertigkeit ═════════════════════════════════════ */

test("B1 — alle vier sind Pflicht, jede wird einzeln benannt", () => {
  for (const feld of ["declaredContent", "declaredGoodsValue",
                      "collectionIsResidential", "deliveryIsResidential"]) {
    const f = VOLL();
    f[feld] = feld.endsWith("Residential") ? null : "";
    const e = declarationErrors(f);
    assert.ok(e[feld], `ohne ${feld} entstand kein Fehler`);
    assert.strictEqual(declarationsComplete(f), false);
    assert.strictEqual(declarationsPayload(f), null, "eine halbe Deklaration wurde gesendet");
  }
  assert.deepEqual(declarationErrors(VOLL()), {});
});

test("B2 — `false` ist eine ANTWORT und blockiert nicht", () => {
  const f = VOLL({ collectionIsResidential: false, deliveryIsResidential: false });
  assert.deepEqual(declarationErrors(f), {},
    "zwei Geschäftsadressen wurden als unbeantwortet behandelt");
  assert.strictEqual(declarationsPayload(f).deliveryIsResidential, false);
});

test("B3 — der Warenwert folgt der Zahlendisziplin, das Dezimalkomma ist erlaubt", () => {
  for (const w of ["", "   ", null, undefined, "abc", "0", "-1", String(DECLARED_GOODS_VALUE_MAX + 1)])
    assert.ok(declarationErrors(VOLL({ declaredGoodsValue: w })).declaredGoodsValue,
      `${JSON.stringify(w)} wurde als Warenwert akzeptiert`);
  // Deutsche Tastatur: „250,50" ist dieselbe Zahl, nicht eine andere.
  assert.strictEqual(declarationsPayload(VOLL({ declaredGoodsValue: "250,50" })).goodsValue, 250.5);
  // Gesendet wird eine ZAHL, nie der Eingabetext.
  assert.strictEqual(typeof declarationsPayload(VOLL()).goodsValue, "number");
});

test("B4 — der Inhalt wird getrimmt und begrenzt, aber nie ersetzt", () => {
  assert.strictEqual(declarationsPayload(VOLL({ declaredContent: "  Ersatzteile  " })).content, "Ersatzteile");
  assert.ok(declarationErrors(VOLL({ declaredContent: "x".repeat(DECLARED_CONTENT_MAX + 1) })).declaredContent);
  assert.ok(declarationErrors(VOLL({ declaredContent: "   " })).declaredContent);
  // Es gibt keinen Rückfall auf ein Wort wie „Paket".
  assert.strictEqual(declarationsPayload(VOLL({ declaredContent: "" })), null);
});

test("B5 — der gesendete Block trägt GENAU die vier Schlüssel des Servers", () => {
  assert.deepEqual(Object.keys(declarationsPayload(VOLL())).sort(),
    ["collectionIsResidential", "content", "deliveryIsResidential", "goodsValue"]);
});

/* ══════════ Entwurf: lockerer, aber ohne Erfindung ═════════════════════════ */

test("C1 — der Entwurf speichert jede Angabe für sich; fehlende stehen als null", () => {
  const s = declarationsSnapshot({ declaredContent: "Ersatzteile" });
  assert.strictEqual(s.content, "Ersatzteile");
  assert.strictEqual(s.goodsValue, null);
  assert.strictEqual(s.collectionIsResidential, null);
  // Ein beantwortetes `false` bleibt `false` — sonst fände der Kunde die Frage nach dem
  // Fortsetzen unbeantwortet vor, obwohl er sie beantwortet hatte.
  assert.strictEqual(declarationsSnapshot({ collectionIsResidential: false }).collectionIsResidential, false);
});

test("C2 — ein Entwurf ohne diese Felder ergibt den leeren Zustand, keinen Fehler", () => {
  assert.deepEqual(declarationsFromSnapshot(undefined), blankDeclarations());
  assert.deepEqual(declarationsFromSnapshot(null), blankDeclarations());
  assert.deepEqual(declarationsFromSnapshot("kaputt"), blankDeclarations());
  assert.deepEqual(declarationsFromSnapshot({ goodsValue: "abc", collectionIsResidential: "true" }),
    blankDeclarations(), "ein unbrauchbarer Wert wurde übernommen");
});

test("C3 — Speichern und Fortsetzen ist verlustfrei", () => {
  const form = { ...createEmptyShipmentForm(), ...VOLL() };
  const snapshot = getShipmentFormSnapshot({ form });
  const wieder = buildResumeInitialState(snapshot);
  assert.strictEqual(wieder.form.declaredContent, "Ersatzteile");
  assert.strictEqual(wieder.form.declaredGoodsValue, "250");
  assert.strictEqual(wieder.form.collectionIsResidential, false,
    "die beantwortete Geschäftsadresse ging beim Fortsetzen verloren");
  assert.strictEqual(wieder.form.deliveryIsResidential, true);
});

/* ══════════ Verdrahtung in der Seite ═══════════════════════════════════════ */

test("D1 — die Seite prüft die vier Angaben mit DIESEM Modul, nicht mit einer zweiten Regel", () => {
  assert.match(SEITE, /declarationErrors\(form\)/, "die Prüfung ist nicht verdrahtet");
  assert.match(SEITE, /declarations:\s+declarationsPayload\(form\)/,
    "der Block wird nicht mitgesendet");
  // Keine zweite Fassung der Regeln in der Seite.
  assert.ok(!/Warenwert muss größer als 0/.test(SEITE),
    "die Seite formuliert eine eigene Warenwertregel");
});

test("D2 — die vier Angaben stehen im Recalc-Schlüssel (sie sind preisbestimmend)", () => {
  // Ohne sie behielte eine geänderte Adressart die alten Angebote — und der Kunde
  // buchte zu einem Preis, der auf einer anderen Angabe beruht.
  const start = SEITE.indexOf("calcKeyRef.current = JSON.stringify(");
  assert.ok(start > -1, "der Recalc-Schlüssel wurde nicht gefunden");
  const block = SEITE.slice(start, start + 1200);
  for (const feld of ["declaredContent", "declaredGoodsValue",
                      "collectionIsResidential", "deliveryIsResidential"])
    assert.ok(block.includes(feld), `${feld} fehlt im Recalc-Schlüssel`);
});

test("D3 — die Adressfrage wird nicht neu gebaut, sondern wiederverwendet", () => {
  assert.match(SEITE, /AddressTypeModule/, "die vorhandene Bedienoberfläche wird nicht benutzt");
  // Kein Providername im neuen Abschnitt — weder im Text noch in einem Feldnamen. Der
  // Ausschnitt endet bewusst am CTA: die Seite enthält weiter oben den ALTEN Routenpfad
  // `/api/jumingo/calculate-price`, und der ist eine technische Adresse, kein sichtbarer
  // Providername. Ein Scan über die ganze Datei würde ihn treffen und damit etwas anderes
  // messen, als hier zugesagt ist.
  const start = SEITE.indexOf("Angaben zur Sendung");
  assert.ok(start > -1, "der neue Abschnitt wurde nicht gefunden");
  const abschnitt = SEITE.slice(start, SEITE.indexOf("offers-calc-cta", start));
  assert.ok(abschnitt.length > 200, "der Ausschnitt des Abschnitts ist leer");
  for (const verboten of ["transglobal", "Transglobal", "jumingo", "JUMiNGO", "Jumingo",
                          "UPS", "DHL", "DPD", "GLS", "TNT"])
    assert.ok(!abschnitt.includes(verboten),
      `der Providername ${verboten} steht im neuen Abschnitt`);
});

test("D4 — der Warenwert wird auf der Buchungsseite nur ANGEZEIGT", () => {
  // Zwei editierbare Warenwerte wären zwei Wahrheiten über denselben Sachverhalt: der
  // Vergleich beruhte auf dem einen, die Buchung auf dem anderen.
  assert.match(BUCHUNG, /goodsValueLocked/, "das Feld ist auf der Buchungsseite nicht gesperrt");
  assert.match(BUCHUNG, /bookingData\?\.form\?\.declaredGoodsValue/,
    "der Warenwert kommt nicht aus dem Sendungsformular");
});

test("D5 — die Adressart der Buchungsseite kommt aus dem Sendungsformular", () => {
  assert.match(BUCHUNG, /bookingData\?\.form\?\.deliveryIsResidential/);
  assert.match(BUCHUNG, /bookingData\?\.form\?\.collectionIsResidential/);
});
