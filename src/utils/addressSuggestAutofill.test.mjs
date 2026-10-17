// Ein Vorschlagsfeld, eine Liste (Auftrag 1, P5, 2026-10-17).
//
// Kein Google Places: die doppelte Liste unter Straße und Ort war Chromes eigenes Autofill, das
// alle 16 Vorschlagsfelder über Standard-Tokens (address-line1, street-address, address-level2)
// einluden. Jetzt setzt AddressSuggestInput EINEN Nicht-Standard-Token, den kein Aufrufer
// überschreibt. Kontaktfelder behalten ihre Tokens. Was ein echter Browser daraus macht, lässt sich
// headless nicht prüfen — dafür steht die Geräteabnahme im Abschlussbericht (Chrome, Edge, Android
// Chrome, iPhone Safari).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ADDRESS_SUGGEST_AUTOCOMPLETE } from "./addressValidationView.mjs";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const jsx = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".jsx")) jsx.push(p);
  }
})(SRC);
const read = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");

function vorschlagsfelder() {
  const out = [];
  for (const f of jsx) {
    const s = read(f);
    let i = 0;
    while ((i = s.indexOf("<AddressSuggestInput", i)) !== -1) {
      const ende = s.indexOf("/>", i);
      out.push({ datei: path.relative(SRC, f), block: s.slice(i, ende) });
      i = ende;
    }
  }
  return out;
}

test("1 — der Token ist kein Standard-Autofill-Token", () => {
  assert.equal(ADDRESS_SUGGEST_AUTOCOMPLETE, "ce-vorschlagsliste");
  const standard = /^(?:on|off|street-address|address-line[123]|address-level[1-4]|postal-code|country(?:-name)?|name|organization|email|tel|new-password|nope)$/;
  assert.doesNotMatch(ADDRESS_SUGGEST_AUTOCOMPLETE, standard);
});

test("2 — die Komponente setzt den Token selbst, ein Aufrufer kann ihn nicht überschreiben", () => {
  const komp = read(path.join(SRC, "components/address/AddressSuggestInput.jsx"));
  assert.match(komp, /autoComplete=\{ADDRESS_SUGGEST_AUTOCOMPLETE\}/);
  const signatur = komp.slice(komp.indexOf("export function AddressSuggestInput("), komp.indexOf("}) {", komp.indexOf("export function AddressSuggestInput(")));
  assert.doesNotMatch(signatur, /\bautoComplete\b/, "der autoComplete-Prop ist zurück");
});

test("3 — kein Vorschlagsfeld übergibt ein eigenes autoComplete (16 Felder, 15 Fundstellen)", () => {
  // Der Preisrechner rendert Herkunft und Ziel über EINEN gemeinsamen Renderer (Auftrag 1, P11).
  const felder = vorschlagsfelder();
  assert.ok(felder.length >= 15, `nur ${felder.length} Vorschlagsfelder gefunden`);
  for (const { datei, block } of felder) {
    assert.doesNotMatch(block, /\bautoComplete=/, `${datei}: Vorschlagsfeld mit eigenem autoComplete`);
  }
});

test("4 — Kontaktfelder bleiben vom Browser füllbar", () => {
  const neu = read(path.join(SRC, "pages/NewShipmentPage.jsx"));
  for (const token of ["postal-code", "email", "tel"]) {
    assert.ok(neu.includes(`autoComplete="${token}"`) || neu.includes(`"${token}"`), `Neue Sendung: ${token} fehlt`);
  }
  const reg = read(path.join(SRC, "components/auth/RegisterForm.jsx"));
  for (const token of ["organization", "name", "email", "postal-code"]) {
    assert.ok(reg.includes(`autoComplete="${token}"`), `Registrierung: ${token} fehlt`);
  }
});
