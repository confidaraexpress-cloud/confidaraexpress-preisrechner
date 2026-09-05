/* Übergabeart: Abholung oder Abgabe im Paketshop.
   =============================================================================
   Die Kennzeichnung auf der Angebotskarte beantwortet eine Frage, die den
   Kunden praktisch betrifft: „Muss ich das wegbringen, oder wird es geholt?"
   Eine falsche Antwort schickt jemanden umsonst zum Paketshop — oder lässt ihn
   auf eine Abholung warten, die nie kommt. Deshalb hängt sie an genau EINEM
   klassifizierten Feld und an keiner Zeichenkette, die jemand frei benennt. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  handoverMode, handoverLabel, handoverLabelForTariff,
  HANDOVER_PICKUP, HANDOVER_DROPOFF,
} from "./handoverMode.mjs";

test("1 — die beiden belegten Übergabearten werden erkannt", () => {
  assert.equal(handoverMode({ serviceType: "pickup" }), HANDOVER_PICKUP);
  assert.equal(handoverMode({ serviceType: "dropoff" }), HANDOVER_DROPOFF);
});

test("2 — die Texte benennen die Handlung, nicht den Carrier", () => {
  assert.equal(handoverLabel(HANDOVER_PICKUP), "Abholung an Ihrer Adresse");
  assert.equal(handoverLabel(HANDOVER_DROPOFF), "Abgabe im Paketshop");
  // Carrierunabhängig: derselbe Satz für DPD wie für UPS.
  for (const id of ["dpd", "ups", "gls", "dhl", "other"]) {
    assert.equal(handoverLabelForTariff({ serviceType: "dropoff", publicCarrierId: id }),
      "Abgabe im Paketshop", id);
  }
});

test("3 — die Texte stehen in Satzschrift, nicht in Versalien", () => {
  // Die Versalien macht das Stylesheet (text-transform). Stünden sie im DOM,
  // spräche ein Screenreader „ABGABE" je nach Stimme als Buchstabenfolge, und
  // die Browsersuche fände den Text nicht mehr.
  for (const m of [HANDOVER_PICKUP, HANDOVER_DROPOFF]) {
    const text = handoverLabel(m);
    assert.notEqual(text, text.toUpperCase(), `${m}: steht in Versalien`);
    assert.match(text, /^[A-ZÄÖÜ][a-zäöüß]/, `${m}: beginnt nicht mit einem normalen Wort`);
  }
});

test("4 — eine Übergabeart wird nie geraten", () => {
  // Kein dritter Typ wird erfunden, und ohne Klassifikation gibt es keine
  // Kennzeichnung — lieber keine Aussage als eine falsche.
  for (const t of [
    {}, null, undefined, { serviceType: null }, { serviceType: "" },
    { serviceType: "express" }, { serviceType: "PICKUP" }, { serviceType: " pickup " },
  ]) {
    assert.equal(handoverMode(t), null, JSON.stringify(t));
    assert.equal(handoverLabelForTariff(t), null, JSON.stringify(t));
  }
  assert.equal(handoverLabel("irgendwas"), null);
  assert.equal(handoverLabel(null), null);
});

test("5 — Namen ändern das Ergebnis NICHT", () => {
  // Der Kern der Regel: Angebotsnamen sind zur Bestimmung untauglich. Ein
  // Abholtarif darf „Shopabgabe Express" heißen, ein Shopabgabetarif „UPS
  // Standardversand" — allein serviceType entscheidet.
  const irrefuehrenderAbholtarif = {
    serviceType: "pickup",
    publicCarrierName: "DPD", publicServiceName: "Shopabgabe Express",
    tariffName: "Paketshop Direkt", carrier: "Paketshop",
  };
  assert.equal(handoverMode(irrefuehrenderAbholtarif), HANDOVER_PICKUP);
  assert.equal(handoverLabelForTariff(irrefuehrenderAbholtarif), "Abholung an Ihrer Adresse");

  const irrefuehrenderShoptarif = {
    serviceType: "dropoff",
    publicCarrierName: "UPS", publicServiceName: "Standardversand",
    tariffName: "Abholung Premium", carrier: "Abholung",
  };
  assert.equal(handoverMode(irrefuehrenderShoptarif), HANDOVER_DROPOFF);
  assert.equal(handoverLabelForTariff(irrefuehrenderShoptarif), "Abgabe im Paketshop");
});

test("6 — die Übergabeart hängt NICHT an der Suchbarkeit des Carriers", () => {
  // Ein Shopabgabe-Angebot ohne auflösbaren Paketshop-Suchcode bleibt eine
  // Shopabgabe — es bekommt nur keinen Finder. Würden beide Fragen vermengt,
  // stünde bei so einem Angebot gar keine Kennzeichnung.
  assert.equal(handoverLabelForTariff({ serviceType: "dropoff", publicCarrierId: "other" }),
    "Abgabe im Paketshop");
  assert.equal(handoverLabelForTariff({ serviceType: "dropoff" }), "Abgabe im Paketshop");
});

test("7 — die Angebotskarte leitet Kennzeichnung UND Knotentitel aus diesem Modul ab", () => {
  // Quelltextprüfung: OfferCard darf serviceType nicht ein zweites Mal selbst
  // auslegen, sonst könnten Kopfzeile und Prozessknoten auseinanderlaufen.
  const src = readFileSync(new URL("../components/offers/OfferCard.jsx", import.meta.url), "utf8");
  const ohneKommentare = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
  assert.match(ohneKommentare, /handoverMode\(t\)/, "OfferCard nutzt den Helfer nicht");
  assert.doesNotMatch(ohneKommentare, /serviceType\s*===\s*["']dropoff["']/,
    "OfferCard legt „dropoff“ ein zweites Mal selbst aus");
  assert.doesNotMatch(ohneKommentare, /serviceType\s*===\s*["']pickup["']/,
    "OfferCard legt „pickup“ ein zweites Mal selbst aus");
  // Und die Paketshop-Sichtbarkeit baut ebenfalls darauf auf statt daneben.
  const cm = readFileSync(new URL("./carrierMap.js", import.meta.url), "utf8");
  assert.match(cm, /handoverMode\(tariff\) === HANDOVER_DROPOFF/,
    "offerSupportsAccessPointSearch prüft serviceType selbst statt über den Helfer");
});

/* ── Die Übergabeart gilt auch für ein Angebot, das nur eine Preisauskunft ist ──
 *
 * Bis zur Transglobal-Datenparität ersetzte die Hinweiszeile eines nicht
 * auswählbaren Angebots die GANZE Zone 2 — und mit ihr verschwand die
 * Kennzeichnung der Übergabeart. Sichtbar wurde das erst, als mit Transglobal
 * eine ganze Klasse dauerhaft nicht direkt buchbarer Angebote hinzukam: dort war
 * eine Paketshopabgabe von einer Türabholung nicht mehr zu unterscheiden.
 *
 * Die Übergabeart ist eine Eigenschaft des PRODUKTS, nicht der Buchbarkeit. Sie
 * steht deshalb VOR der Verzweigung. Diese Prüfung hält die Stelle fest — eine
 * Rückverlagerung in den Timeline-Zweig macht die Aussage wieder unsichtbar. */
test("die Übergabeart hängt nicht an der Buchbarkeit", () => {
  // Diese Zusicherung hat ihre FORM geändert, nicht ihre Absicht.
  //
  // Sie verlangte, dass die Übergabeart VOR der Verzweigung `{unavailable ? (` steht —
  // denn innerhalb wäre sie auf einem gesperrten Angebot unsichtbar gewesen, und eine
  // Paketshopabgabe ließe sich nicht mehr von einer Türabholung unterscheiden.
  //
  // Die Verzweigung gibt es nicht mehr: Zone 2 rendert Übergabeart UND Timeline
  // unabhängig davon, ob man das Angebot gerade bestellen kann. Damit ist die
  // ursprüngliche Sorge stärker erledigt als durch eine Reihenfolge — es gibt keinen
  // Zweig, in den etwas hineinrutschen könnte.
  const src = readFileSync(new URL("../components/offers/OfferCard.jsx", import.meta.url), "utf8");
  const zone2 = src.slice(src.indexOf('className="offer-zone-2"'),
                          src.indexOf('className="offer-zone-3"'));

  assert.ok(zone2.indexOf('className="offer-handover"') > 0, "die Übergabeart fehlt in Zone 2");
  assert.ok(zone2.indexOf('className="offer-timeline"') > 0, "die Timeline fehlt in Zone 2");
  assert.ok(!zone2.includes("{unavailable ? ("),
    "Zone 2 verzweigt wieder auf die Buchbarkeit — damit verschwindet auf einem "
    + "gesperrten Angebot entweder die Übergabeart oder der Ablauf");
});
