/* Bundesstaat im Versandformular — Pflichtfeld für US und CA, unsichtbar für alle anderen.
   =============================================================================
   Der Providervertrag verlangt den Bundesstaat AUSDRÜCKLICH nur für die USA und Kanada.
   Confidara hat ihn nie erhoben und nie gesendet; für ein US-Ziel war die Adresse damit
   unvollständig. Dieses Paket ergänzt genau dieses eine Feld — und diese Datei hält fest,
   dass es wirklich nur dort erscheint und dass der übrige Versand unverändert bleibt.

   Das gerenderte Verhalten prüft tests/e2e/customsStateField.test.mjs. */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { requiresState, statesForCountry, normalizeStateCode, stateFieldError, US_STATES, CA_STATES }
  from "./stateCodes.mjs";
import { createEmptyShipmentForm } from "./newShipmentForm.mjs";
import { mapAddressToShipmentFormPatch } from "./addressBookView.mjs";
import { blankNewShipmentForm, buildResumeInitialState } from "./formDraftsView.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const seite = lies("../pages/NewShipmentPage.jsx");

/* ══════════ 1 — Die Landesregel ══════════ */

test("1 — Pflicht nur für US und CA, für jedes andere Land gar nicht", () => {
  assert.equal(requiresState("US"), true);
  assert.equal(requiresState("ca"), true);
  for (const land of ["DE", "AT", "CH", "FR", "GB", "CN", "AE", "", null, undefined]) {
    assert.equal(requiresState(land), false, `${land}`);
    assert.equal(stateFieldError(land, ""), "", "ohne Pflicht darf nichts blockieren");
    assert.deepEqual(statesForCountry(land), [], "ohne Pflicht gibt es keine Auswahl");
  }
});

test("2 — 51 US-Einträge (inkl. DC) und 13 kanadische, jeweils Code + Anzeigename", () => {
  assert.equal(US_STATES.length, 51);
  assert.equal(CA_STATES.length, 13);
  for (const st of [...US_STATES, ...CA_STATES]) {
    assert.match(st.code, /^[A-Z]{2}$/, `${JSON.stringify(st)}`);
    assert.ok(st.name && st.name.length > 1, `${st.code} ohne Anzeigename`);
  }
  assert.ok(US_STATES.some((s) => s.code === "DC"), "District of Columbia fehlt");
});

test("3 — die Kollision DE/NL wird pro Land aufgelöst", () => {
  // DE ist Delaware UND Deutschland, NL ist Newfoundland UND die Niederlande.
  assert.equal(normalizeStateCode("US", "DE"), "DE", "Delaware ist ein gültiger US-Code");
  assert.equal(normalizeStateCode("US", "NL"), "",   "Newfoundland ist kein US-Bundesstaat");
  assert.equal(normalizeStateCode("CA", "NL"), "NL");
  assert.equal(normalizeStateCode("CA", "DE"), "");
});

test("4 — es wird nichts geraten: ein ausgeschriebener Name ergibt keinen Code", () => {
  for (const name of ["Kalifornien", "California", "New York", "Texas"]) {
    assert.equal(normalizeStateCode("US", name), "");
  }
  assert.equal(normalizeStateCode("US", " or "), "OR", "nur Trim und Großschreibung");
});

test("5 — fehlend und ungültig ergeben verschiedene Meldungen", () => {
  assert.match(stateFieldError("US", ""),   /erforderlich/);
  assert.match(stateFieldError("US", "ZZ"), /gültigen Bundesstaat/);
  assert.equal(stateFieldError("US", "CA"), "");
});

/* ══════════ 2 — Der Feldvertrag des Formulars ══════════ */

test("6 — das leere Formular trägt beide Bundesstaatfelder als leeren String", () => {
  const f = createEmptyShipmentForm();
  // Leerer String, NICHT undefined: die Felder sind kontrollierte React-Eingaben.
  assert.equal(f.s_state, "");
  assert.equal(f.r_state, "");
  assert.ok(Object.prototype.hasOwnProperty.call(f, "s_state"));
  assert.ok(Object.prototype.hasOwnProperty.call(f, "r_state"));
});

test("7 — das Feld erscheint AUSSCHLIESSLICH bei Bundesstaatpflicht", () => {
  assert.match(seite, /const stateSelect = \(p\) => \{\s*\n\s*if \(!requiresState\(form\[`\$\{p\}_country`\]\)\) return null;/,
    "ohne diese Bedingung erschiene das Feld auch bei nationalem Versand");
  // Und es steht als Auswahlfeld da, nicht als Freitext — ein ausgeschriebener Name würde
  // providerseitig abgelehnt.
  const block = seite.slice(seite.indexOf("const stateSelect"), seite.indexOf("const stateSelect") + 1100);
  assert.match(block, /as="select"/);
  assert.match(block, /statesForCountry\(form\[`\$\{p\}_country`\]\)\.map/);
});

test("8 — beide Seiten rendern das Feld direkt hinter dem Land", () => {
  assert.match(seite, /\{countrySelect\("s"\)\}\s*\n\s*\{stateSelect\("s"\)\}/);
  assert.match(seite, /\{countrySelect\("r"\)\}\s*\n\s*\{stateSelect\("r"\)\}/);
});

test("9 — der Payload trägt den Bundesstaat nur, wenn er gesetzt ist", () => {
  assert.match(seite, /\.\.\.\(form\[`\$\{p\}_state`\] \? \{ state: form\[`\$\{p\}_state`\] \} : \{\}\)/,
    "ein leeres Feld darf kein state: \"\" erzeugen");
});

test("10 — die Formularprüfung nutzt dieselbe Landesregel wie der Server", () => {
  assert.match(seite, /stateFieldError\(form\.s_country, form\.s_state\)/);
  assert.match(seite, /stateFieldError\(form\.r_country, form\.r_state\)/);
});

/* ══════════ 3 — Übernahme und Wiederherstellung ══════════ */

test("11 — Adressbuch: Freitext wird NICHT als Bundesstaat übernommen", () => {
  // Das Adressbuchfeld heißt „Bundesland / Region" und ist historisch Freitext.
  const frei = mapAddressToShipmentFormPatch({ country: "US", state: "Kalifornien" }, "r");
  assert.equal(frei.r_state, "", "ein Freitext darf nicht als Code durchgereicht werden");
  const code = mapAddressToShipmentFormPatch({ country: "US", state: "ny" }, "r");
  assert.equal(code.r_state, "NY");
  const de = mapAddressToShipmentFormPatch({ country: "DE", state: "Bayern" }, "s");
  assert.equal(de.s_state, "", "ohne Bundesstaatpflicht bleibt das Feld leer");
});

test("12 — Entwurf fortsetzen: der Bundesstaat kommt gegen das Land geprüft zurück", () => {
  const init = buildResumeInitialState({
    sender:    { country: "DE", state: "Bayern" },
    recipient: { country: "US", state: "or" },
  });
  assert.equal(init.form.r_state, "OR", "gültiger Code wird normalisiert zurückgeholt");
  assert.equal(init.form.s_state, "", "ein Wert ohne Landesbezug wird verworfen");
  // Und das Basisformular des Entwurfs kennt die Felder überhaupt.
  const b = blankNewShipmentForm();
  assert.equal(b.s_state, "");
  assert.equal(b.r_state, "");
});

test("13 — ein Entwurf mit falschem Landesbezug bringt keinen Code zurück", () => {
  // NL ist Newfoundland (CA) — für ein US-Ziel ungültig und darf nicht überleben.
  const init = buildResumeInitialState({ recipient: { country: "US", state: "NL" } });
  assert.equal(init.form.r_state, "");
});

/* ══════════ 4 — Was unverändert bleiben muss ══════════ */

test("14 — nationaler Versand ist unberührt", () => {
  const f = createEmptyShipmentForm();
  f.s_country = "DE"; f.r_country = "DE";
  assert.equal(stateFieldError(f.s_country, f.s_state), "", "DE→DE darf nie am Bundesstaat scheitern");
  assert.equal(stateFieldError(f.r_country, f.r_state), "");
  assert.equal(requiresState("DE"), false);
});

test("15 — keine Preis-, Aufschlags- oder MwSt-Berührung im Frontend", () => {
  const modul = lies("./stateCodes.mjs");
  for (const verboten of ["price", "markup", "vat", "netto", "brutto", "tarif"]) {
    assert.ok(!new RegExp(verboten, "i").test(modul.replace(/\/\*[\s\S]*?\*\//g, "")),
      `${verboten} gehört nicht in die Bundesstaatlogik`);
  }
});
