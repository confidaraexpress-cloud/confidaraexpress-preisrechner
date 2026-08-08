/* Zusätzliche Optionen: Progressive Disclosure für Referenznummer + Labelformat.
   =============================================================================
   Die beiden Optionen zeigen im Grundzustand nur eine Schalterzeile; die
   Detailfelder erscheinen erst nach dem Einschalten. Das ist eine reine
   UX-Änderung — die fachliche Bedeutung (erlaubte Werte, Feldnamen im
   /book-Payload, Default A4, Sanitizing der Referenznummer) bleibt gleich.

   Diese Datei prüft den Quelltext: dass es genau EIN Schalterprimitiv gibt,
   dass der Payload-Vertrag unangetastet ist und dass die beiden bewusst
   UNTERSCHIEDLICHEN Ausschaltregeln tatsächlich im Code stehen. Das gerenderte
   Verhalten prüft tests/e2e/progressiveBookingOptions.test.mjs. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
// Kommentare beschreiben oft genau das, was eine Regel verbietet („kein
// handgepflegtes aria-checked") — sie dürfen eine Prüfung nicht auslösen.
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const switchKomponente = lies("../components/ui/Switch.jsx");
const modul            = lies("../components/booking/AdditionalOptionsModule.jsx");
const bookingPage      = lies("../pages/BookingPage.jsx");
const forms            = lies("./forms.css");
const calculator       = lies("./calculator.css");

/* ══════════ Schalterprimitiv ══════════ */

test("1 — der Schalter ist ein echtes Kontrollkästchen mit role=switch", () => {
  // Nachgebautes ARIA auf einem <div> müsste Tastatur, Fokus und aria-checked
  // selbst mitbringen; ein echtes Kontrollkästchen bekommt all das vom Browser.
  assert.match(switchKomponente, /type="checkbox"/, "der Schalter muss ein checkbox-Input sein");
  assert.match(switchKomponente, /role="switch"/, "der Schalter muss sich als switch ausweisen");
  assert.doesNotMatch(ohneKommentare(switchKomponente), /aria-checked/,
    "aria-checked wird vom checked-Attribut abgeleitet und darf nicht handgepflegt werden");
  // Das Label umschließt die Eingabe → Klick auf den Text schaltet mit.
  assert.match(switchKomponente, /<label className="ce-switch">[\s\S]*<input/,
    "die Eingabe muss im Label liegen, damit der Text klickbar ist");
});

test("2 — es gibt genau EIN Schalterprimitiv, kein zweites daneben", () => {
  const uiDateien = readdirSync(new URL("../components/ui/", import.meta.url));
  const schalter = uiDateien.filter((f) => /switch|toggle/i.test(f));
  assert.deepEqual(schalter, ["Switch.jsx"], `mehr als ein Schalterprimitiv: ${schalter.join(", ")}`);
  // Und das Optionenmodul baut keinen eigenen Schalter, sondern nutzt diesen.
  assert.match(modul, /import \{ Switch \} from "\.\.\/ui\/Switch"/,
    "das Optionenmodul muss das gemeinsame Primitiv importieren");
  assert.doesNotMatch(modul, /role="switch"/,
    "das Modul darf keinen eigenen Schalter nachbauen");
});

test("3 — der Zustand steht nicht allein in der Farbe", () => {
  // Der Knopf wandert sichtbar — wer nur die Trackfarbe umschaltete, ließe
  // Menschen mit Farbsehschwäche im Unklaren.
  assert.match(forms, /\.ce-switch-input:checked ~ \.ce-switch-track \.ce-switch-knob \{[^}]*transform:\s*translateX/,
    "der Knopf muss im eingeschalteten Zustand seine Position ändern");
  assert.match(forms, /\.ce-switch-input:focus-visible ~ \.ce-switch-track \{[^}]*outline:\s*var\(--ce-focus-ring\)/,
    "der Fokusring muss auf der sichtbaren Spur liegen (die Eingabe ist versteckt)");
});

test("4 — der Schalter nutzt ausschließlich Foundation-Tokens", () => {
  const block = forms.slice(forms.indexOf("/* ── Schalter (Switch)"), forms.indexOf("/* ── Adminportal"));
  assert.ok(block.length > 200, "der Schalterblock muss auffindbar sein");
  const literale = block.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(/g) || [];
  assert.deepEqual(literale, [], `Farbliterale im Schalter: ${literale.join(", ")}`);
  // Bewegung nur als kurze Zustandsreaktion — und abschaltbar.
  assert.match(block, /@media \(prefers-reduced-motion: reduce\)/,
    "reduzierte Bewegung muss respektiert werden");
  // Trefferfläche auf Touchgeräten.
  assert.match(block, /@media \(max-width: 860px\)[\s\S]*min-height:\s*44px/,
    "unter 860px muss die Zeile 44px hoch sein (WCAG 2.5.5)");
});

/* ══════════ Progressive Disclosure im Modul ══════════ */

test("5 — beide Detailbereiche hängen an ihrem Schalter", () => {
  assert.match(modul, /\{referenceEnabled && \(/, "das Referenzfeld muss hinter seinem Schalter liegen");
  assert.match(modul, /\{labelFormatEnabled && \(/, "die Formatauswahl muss hinter ihrem Schalter liegen");
  // Der aufgeklappte Bereich steht als Geschwister NACH der Schalterzeile,
  // nicht im Label — sonst schaltete ein Klick ins Feld den Schalter um.
  assert.doesNotMatch(modul, /<Switch[\s\S]{0,400}addopt-reveal[\s\S]{0,80}<\/Switch>/,
    "der Detailbereich darf nicht im Schalter liegen");
});

test("6 — das Modul bleibt zustandslos (reine Darstellung)", () => {
  // Die Architektur des Bereichs: Werte UND Schalterzustände im Orchestrator.
  assert.doesNotMatch(modul, /useState|useReducer|useEffect/,
    "das Optionenmodul darf keinen eigenen Zustand halten");
  for (const prop of ["referenceEnabled", "onReferenceEnabledChange",
                      "labelFormatEnabled", "onLabelFormatEnabledChange"]) {
    assert.ok(modul.includes(prop), `die Prop ${prop} fehlt`);
    assert.ok(bookingPage.includes(prop), `BookingPage reicht ${prop} nicht durch`);
  }
});

test("7 — die Aktuell-Anzeige liest den echten Wert, sie wird nicht getippt", () => {
  assert.match(modul, /Aktuell: \$\{formatName\(labelFormat\)\}/,
    "die Zeile muss den aktiven Wert anzeigen, keinen festen Text");
  // Und die Namen kommen aus derselben Liste wie die Auswahlkarten.
  assert.match(modul, /const formatName = \(id\) =>[\s\S]*LABEL_FORMATS/);
});

/* ══════════ Unveränderte Fachlichkeit ══════════ */

test("8 — Werte, Grenzen und Texte der Referenznummer sind unverändert", () => {
  assert.match(bookingPage, /replace\(\/\[<>\]\/g, ""\)\.slice\(0, 35\)/,
    "Sanitizing und Maximallänge dürfen sich nicht ändern");
  assert.match(modul, /maxLength=\{35\}/);
  assert.match(modul, /placeholder="z\. B\. Bestellnummer, Kostenstelle …"/);
  assert.match(modul, /Max\. 35 Zeichen\./, "der Hilfetext bleibt erhalten");
  assert.match(modul, /Referenznummer \/ Bestellnummer/);
});

test("9 — die Labelformate bleiben exakt A4 und A6 mit Default A4", () => {
  const ids = [...modul.matchAll(/\{ id: "([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["A4", "A6"], "es darf kein drittes Format entstehen");
  assert.match(bookingPage, /useState\(flowBooking\?\.labelFormat \|\| "A4"\)/,
    "der Default muss A4 bleiben");
  assert.match(modul, /DIN A4/);
  assert.match(modul, /DIN A6/);
});

test("10 — der /book-Payload behält seine Feldnamen", () => {
  const bookCall = bookingPage.match(/apiFetch\(`\/api\/jumingo\/book`,\s*\{([\s\S]*?)\n\s{6}\}\);/);
  assert.ok(bookCall, "der /book-Aufruf muss auffindbar bleiben");
  const body = bookCall[1];
  assert.ok(body.includes("referenceNumber:"), "referenceNumber darf nicht umbenannt werden");
  assert.ok(body.includes("labelFormat,"), "labelFormat darf nicht umbenannt werden");
  // Kein neues Feld für den reinen UI-Zustand.
  assert.ok(!/referenceEnabled\s*[,:]/.test(body), "der Schalterzustand gehört nicht in den Payload");
  assert.ok(!/labelFormatEnabled\s*[,:]/.test(body), "der Schalterzustand gehört nicht in den Payload");
});

/* ══════════ Die beiden unterschiedlichen Ausschaltregeln ══════════ */

test("11 — ausgeschaltete Referenz wird nicht gebucht, der Wert bleibt aber stehen", () => {
  // Das Gate im Payload ist die einzige Stelle, an der der Schalter fachlich wirkt.
  assert.match(bookingPage,
    /\.\.\.\(referenceEnabled && form\.reference\.trim\(\) \? \{ referenceNumber: form\.reference\.trim\(\) \} : \{\}\)/,
    "der Payload muss auf den aktiven Schalter prüfen");
  // Ausschalten setzt den Wert NICHT zurück — versehentliches Ausschalten
  // vernichtet nichts.
  const toggle = bookingPage.match(/const toggleReference = [\s\S]*?;\n/)[0];
  assert.doesNotMatch(toggle, /setForm|upd\(|updReference/,
    "das Ausschalten der Referenz darf die Eingabe nicht löschen");
});

test("12 — ausgeschaltetes Labelformat fällt wirklich auf A4 zurück", () => {
  // Anders als die Referenznummer ist A4 ein aktiv gesendeter Wert. Bliebe A6
  // stehen, würde es unsichtbar weitergebucht, obwohl der Schalter aus ist.
  const toggle = bookingPage.match(/const toggleLabelFormat = \(on\) => \{[\s\S]*?\n  \};/)[0];
  assert.match(toggle, /if \(!on\) setLabelFormat\("A4"\);/,
    "das Ausschalten muss das Format auf A4 zurücksetzen");
});

/* ══════════ Wiederherstellung ══════════ */

test("13 — beide Schalter werden aus vorhandenen Werten abgeleitet", () => {
  // Kein gespeicherter Wert darf unsichtbar werden: eine vorhandene
  // Referenznummer bzw. ein Format ungleich A4 öffnet den jeweiligen Bereich.
  assert.match(bookingPage,
    /useState\(\s*\(\) => !!\(flowBooking\?\.reference \|\| ""\)\.trim\(\)\)/,
    "der Referenzschalter muss aus dem gespeicherten Wert abgeleitet werden");
  assert.match(bookingPage,
    /useState\(\s*\(\) => \(flowBooking\?\.labelFormat \|\| "A4"\) !== "A4"\)/,
    "der Formatschalter muss aus dem gespeicherten Format abgeleitet werden");
});

test("14 — der Vorgang spiegelt nur eine aktive Referenznummer", () => {
  // Sonst liefe die Ableitung beim nächsten Mount falsch: ein bewusst
  // ausgeschalteter Bereich stünde wieder offen.
  assert.match(bookingPage, /reference: referenceEnabled \? form\.reference : ""/,
    "die Spiegelung muss auf den aktiven Schalter prüfen");
  assert.match(bookingPage, /\}, \[step, labelFormat, referenceEnabled, form\.reference/,
    "referenceEnabled muss in den Abhängigkeiten des Spiegel-Effekts stehen");
});

test("15 — es entsteht kein neuer persistierter Schlüssel im Vorgang", () => {
  // Die Schalter sind reiner UI-Zustand; sie werden abgeleitet, nicht gespeichert.
  const flowState = lies("../utils/shippingFlowState.mjs");
  assert.ok(!/referenceEnabled|labelFormatEnabled/.test(flowState),
    "der Schalterzustand darf das Vorgangsschema nicht erweitern");
});

/* ══════════ Layout ══════════ */

test("16 — der Grundzustand ist eine ruhige Liste ohne Kartenrahmen je Option", () => {
  assert.match(calculator, /\.addopt-option \+ \.addopt-option \{[^}]*border-top/,
    "die Trennlinie steht zwischen den Optionen");
  // 44px = 32px Schalterspur + 12px Abstand. Die Zahl folgt der Schalterbreite;
  // sie wurde mit dem kompakteren Steuerelement von 52px nachgezogen.
  assert.match(calculator, /\.addopt-reveal \{[^}]*padding-left:\s*44px/,
    "der Detailbereich wird auf Höhe des Schaltertextes eingerückt");
  assert.match(calculator, /@media \(max-width: 600px\) \{ \.addopt-reveal \{ padding-left: 0/,
    "auf schmalen Viewports entfällt die Einrückung");
  // Die entfallenen Klassen dürfen nicht als tote Regeln zurückbleiben.
  for (const tot of ["addopt-field", "addopt-block", "addopt-group-label"]) {
    assert.ok(!new RegExp(`\\.${tot}\\s*[,{]`).test(calculator), `tote Regel .${tot} entfernen`);
  }
});
