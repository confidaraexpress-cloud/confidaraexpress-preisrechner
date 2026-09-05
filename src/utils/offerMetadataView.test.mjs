/* Belegte Angebotsmetadaten auf der gemeinsamen Tarifkarte.

   Kein Netz, kein Browser: reine Auswertung plus Quelltextzusicherungen.

   Zwei Leitfragen, und sie ziehen in entgegengesetzte Richtungen:
     1. Erscheinen Abrechnungsgewicht und Labelformate, wenn der Server sie liefert?
     2. Kann daraus jemals eine Druckerpflicht, eine Zusage oder eine Providerabfrage
        werden — und entsteht ein leerer Block, wenn nichts belegt ist? */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  chargeableWeightLine, labelCapabilityLine, OFFER_METADATA_LABEL,
} from "./offerMetadataView.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => fs.readFileSync(path.join(HIER, "..", p), "utf8");

/* Quelltextzusicherungen werden auf KOMMENTARFREIEM Code gemessen: die Begründung, warum
   hier kein Providervergleich steht, enthält zwangsläufig einen Providernamen. */
const ohneKommentar = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ══════════ §1  ABRECHNUNGSGEWICHT ════════════════════════════════════════ */

test("(1) vorhandenes Abrechnungsgewicht wird als deutsche kg-Zeile dargestellt", () => {
  assert.equal(chargeableWeightLine({ chargeableWeight: 5.4 }), "5,40 kg");
  assert.equal(chargeableWeightLine({ chargeableWeight: 6.75 }), "6,75 kg");
  assert.equal(chargeableWeightLine({ chargeableWeight: 5 }), "5,00 kg");
  assert.equal(OFFER_METADATA_LABEL.chargeableWeight, "Abrechnungsgewicht");
});

test("(2) fehlt das Gewicht, entsteht KEIN Platzhalter", () => {
  for (const t of [{}, { chargeableWeight: null }, { chargeableWeight: undefined },
                   { chargeableWeight: 0 }, { chargeableWeight: -1 },
                   { chargeableWeight: "5.4" }, { chargeableWeight: NaN }, null, undefined]) {
    assert.equal(chargeableWeightLine(t), null, `${JSON.stringify(t)} ergab eine Zeile`);
  }
});

test("(2b) es wird nichts aus Paketmassen gerechnet", () => {
  // 30 x 30 x 30 cm ergaeben bei einem Divisor von 5000 rechnerisch 5,4 kg. Diese Zahl
  // darf nur entstehen, wenn der SERVER sie geliefert hat.
  assert.equal(chargeableWeightLine({ length: 30, width: 30, height: 30, weight: 5 }), null);
  const code = ohneKommentar(lies("utils/offerMetadataView.mjs"));
  // Gesucht wird das LESEN einer Paketabmessung, nicht das Wort „length": `formate.length`
  // ist eine Arraylänge und kein Karton. Ein pauschales Verbot hätte den korrekten Code
  // rot gefärbt und wäre damit kein Beweis, sondern ein Hindernis.
  for (const verboten of ["5000", "6000", "volum", "lengthCm", "widthCm", "heightCm",
                          ".width", ".height", ".weight"]) {
    assert.ok(!code.includes(verboten), `das Modul rechnet ein Gewicht: "${verboten}"`);
  }
  assert.ok(!/\.length\s*[*/]/.test(code), "das Modul multipliziert oder teilt eine Länge");
  // Und es rechnet ueberhaupt nicht: keine Multiplikation, keine Division.
  assert.ok(!/[*/]=?\s*\d/.test(code.replace(/\/\//g, "")), "das Modul enthaelt eine Rechnung");
});

/* ══════════ §3  LABELFAEHIGKEITEN ═════════════════════════════════════════ */

test("(3) Formate und Groessen werden als eine neutrale Zeile dargestellt", () => {
  assert.equal(
    labelCapabilityLine({ labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"] }),
    "PDF · A4 / Thermal");
  assert.equal(labelCapabilityLine({ labelFormats: ["PDF"], labelSizes: [] }), "PDF");
  assert.equal(labelCapabilityLine({ labelFormats: [], labelSizes: ["A4"] }), "A4");
  assert.equal(OFFER_METADATA_LABEL.labelCapability, "Verfügbare Labelformate");
});

test("(4) ohne Labeldaten entsteht KEINE Zeile — und damit kein leerer Block", () => {
  for (const t of [{}, { labelFormats: [], labelSizes: [] }, { labelFormats: null, labelSizes: null },
                   { labelFormats: "PDF" }, { labelFormats: [""] }, { labelSizes: [null, 42] },
                   null, undefined]) {
    assert.equal(labelCapabilityLine(t), null, `${JSON.stringify(t)} ergab eine Zeile`);
  }
});

/* ══════════ §5–§6  KEINE DRUCKERPFLICHT ═══════════════════════════════════ */

test("(5) aus Labelformaten wird NIEMALS eine Druckeraussage", () => {
  const zeile = labelCapabilityLine({ labelFormats: ["PDF"], labelSizes: ["A4", "Thermal"] });
  for (const wort of ["Drucker", "drucken", "erforderlich", "Thermodrucker", "benötigt"]) {
    assert.ok(!zeile.includes(wort), `die Labelzeile sagt „${wort}": ${zeile}`);
  }
  // Und das Modul kennt das Feld gar nicht.
  const code = ohneKommentar(lies("utils/offerMetadataView.mjs"));
  assert.ok(!code.includes("printerRequired"), "das Modul liest printerRequired");
  assert.ok(!/Drucker|drucken/.test(code), "das Modul erzeugt eine Druckeraussage");
});

test("(6) das bestehende printerRequired-Verhalten der Karte ist unveraendert", () => {
  const karte = lies("components/offers/OfferCard.jsx");
  // Die vorhandene Zeile im Merkmalsraster — unveraendert.
  assert.ok(karte.includes(
    'if (t.printerRequired != null)   features.push({ icon: "printer", label: "Drucker",'),
    "die printerRequired-Zeile der Karte wurde veraendert");
  // Und die neue Labelzeile haengt NICHT daran.
  const neue = karte.split("\n").filter((z) => z.includes("labelCapabilityLine"));
  assert.ok(neue.length >= 1, "die Labelzeile fehlt in der Karte");
  for (const z of neue) {
    assert.ok(!z.includes("printerRequired"), "die Labelzeile ist an printerRequired gekoppelt: " + z.trim());
  }
});

/* ══════════ §7  KEINE PROVIDERABFRAGE ═════════════════════════════════════ */

test("(7) weder das Modul noch die Kartenzeilen fragen nach dem Provider", () => {
  const modul = ohneKommentar(lies("utils/offerMetadataView.mjs"));
  for (const verboten of ["transglobal", "jumingo", "debug", "provider"]) {
    assert.ok(!modul.toLowerCase().includes(verboten),
      `das Modul kennt „${verboten}"`);
  }
  const karte = lies("components/offers/OfferCard.jsx");
  for (const z of karte.split("\n").filter((x) => x.includes("chargeableWeightLine") || x.includes("labelCapabilityLine"))) {
    assert.ok(!/provider|debug/i.test(z), "eine Metadatenzeile fragt nach dem Provider: " + z.trim());
  }
});

test("(7b) die Darstellung haengt allein an der Anwesenheit der Daten", () => {
  const karte = ohneKommentar(lies("components/offers/OfferCard.jsx"));
  // Beide Zeilen stehen unter einer reinen Anwesenheitsbedingung.
  assert.ok(/if \(gewichtZeile !== null\)\s+features\.push/.test(karte),
    "das Gewicht steht nicht unter einer reinen Anwesenheitsbedingung");
  assert.ok(/if \(labelZeile !== null\)\s+features\.push/.test(karte),
    "die Labelzeile steht nicht unter einer reinen Anwesenheitsbedingung");
});

/* ══════════ §8  DIE KARTE BLEIBT, WIE SIE IST ═════════════════════════════ */

test("(8) es entsteht kein neuer UI-Block und kein zweites Kartenmuster", () => {
  const karte = lies("components/offers/OfferCard.jsx");
  // Die neuen Angaben reihen sich in das BESTEHENDE Merkmalsraster ein — kein neuer
  // `offer-details-section`, keine neue Klasse, kein eigenes Markup.
  const abschnitte = (karte.match(/offer-details-section/g) || []).length;
  assert.equal(abschnitte, 8,
    `die Zahl der Detailabschnitte hat sich geaendert (${abschnitte}) — es entstand ein neuer Block`);
  for (const verboten of ["offer-metadata", "offer-weight", "offer-label-", "chargeable-weight"]) {
    assert.ok(!karte.includes(verboten), `neue Kartenklasse eingefuehrt: ${verboten}`);
  }
  // Und es gibt weiterhin genau EINE Tarifkarte.
  const dateien = fs.readdirSync(path.join(HIER, "..", "components", "offers"));
  assert.deepEqual(dateien.filter((f) => /Card\.jsx$/.test(f)), ["OfferCard.jsx"],
    "es gibt eine zweite Kartenkomponente");
});

test("(8b) die Beschriftungen stehen im Modul, nicht im JSX", () => {
  const karte = lies("components/offers/OfferCard.jsx");
  for (const text of ['"Abrechnungsgewicht"', '"Verfügbare Labelformate"']) {
    assert.ok(!karte.includes(text),
      `die Beschriftung ${text} steht als Literal in der Karte statt im Modul`);
  }
  assert.ok(karte.includes("OFFER_METADATA_LABEL.chargeableWeight"));
  assert.ok(karte.includes("OFFER_METADATA_LABEL.labelCapability"));
});

/* ══════════ §9  WAS NICHT ANGEZEIGT WIRD ══════════════════════════════════ */

test("(9) Abholschluss und Unterschriftsfaehigkeit erscheinen NICHT", () => {
  // Beide bleiben serverseitig intern; die Karte darf sie auch dann nicht darstellen,
  // wenn sie eines Tages versehentlich im Vertrag auftauchen.
  const karte = ohneKommentar(lies("components/offers/OfferCard.jsx"));
  for (const verboten of ["sameDayCollectionCutOffTime", "signatureRequiredAvailable",
                          "providerServiceName", "providerServiceRef"]) {
    assert.ok(!karte.includes(verboten), `die Karte liest „${verboten}"`);
  }
  const modul = ohneKommentar(lies("utils/offerMetadataView.mjs"));
  for (const verboten of ["sameDay", "signature", "cutOff", "Unterschrift"]) {
    assert.ok(!modul.includes(verboten), `das Modul kennt „${verboten}"`);
  }
});
