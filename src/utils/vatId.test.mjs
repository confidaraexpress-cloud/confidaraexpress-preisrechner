// Auftrag 2 / P10 (2026-10-17): USt-IdNr. bei der Neuregistrierung Pflicht — Regel, Formular, Payload.
// Die Regel spiegelt Backend lib/vatId.js; beide prüfen dieselbe Falltabelle (Prüfsumme hier und dort).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateRequiredVatId, normalizeVatId, VAT_ID_TEXT } from "./vatId.mjs";
import { getRegErrors, buildRegistrationPayload, mapApiRegistrationError } from "./registrationValidation.mjs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const FALLTABELLE_SHA256 = "6fb6c106f3ceddf3691c";
const VALID = { name: "Anna Berger", email: "einkauf@firma.de", password: "SicheresPasswort1", company_name: "Firma GmbH",
                vat_id: "DE123456789", street: "", zip: "", city: "", country: "DE" };

test("1 — die Regel besteht die gemeinsame Falltabelle (bytegleich mit dem Backend)", () => {
  const roh = lies("../testing/vatIdCases.json");
  assert.equal(createHash("sha256").update(roh).digest("hex").slice(0, 20), FALLTABELLE_SHA256,
    "die Falltabelle weicht von der Backendkopie ab");
  for (const f of JSON.parse(roh).faelle) {
    const r = validateRequiredVatId(f.eingabe);
    assert.equal(r.ok, f.ok, JSON.stringify(f));
    if (f.ok) assert.equal(r.value, f.wert, JSON.stringify(f));
    else assert.equal(r.code, f.code, JSON.stringify(f));
  }
  assert.equal(normalizeVatId(" gr-123.456/789 "), "EL123456789");
});

test("2 — Registrierung: ohne USt-IdNr. oder mit falschem Format ein Fehler am Feld; die Adresse bleibt optional", () => {
  assert.deepEqual(getRegErrors(VALID, VALID.password), {});
  assert.equal(getRegErrors({ ...VALID, vat_id: "" }, VALID.password).vat_id, VAT_ID_TEXT.required);
  assert.equal(getRegErrors({ ...VALID, vat_id: "DE12345" }, VALID.password).vat_id, VAT_ID_TEXT.invalid);
  assert.equal(getRegErrors({ ...VALID, vat_id: "CHE123456789" }, VALID.password).vat_id, VAT_ID_TEXT.notEu);
  // Ein Serverfehler mit field "vat_id" landet am Feld, nicht als Banner.
  assert.deepEqual(mapApiRegistrationError({ error: "x", code: "VAT_ID_INVALID", field: "vat_id" }),
    { fieldErrors: { vat_id: "x" }, generalError: "" });
});

test("3 — Payload: die USt-IdNr. in normalisierter Form, Feldname unverändert", () => {
  assert.equal(buildRegistrationPayload({ ...VALID, vat_id: " de 123 456 789 " }).vat_id, "DE123456789");
  assert.equal(buildRegistrationPayload({ ...VALID, vat_id: "atu-1234.5678" }).vat_id, "ATU12345678");
});

test("4 — Formular: „USt-IdNr.“ mit Pflichtstern, required, Hinweis und Fehler am Feld — kein Musterwert", () => {
  const form = lies("../components/auth/RegisterForm.jsx");
  assert.equal(VAT_ID_TEXT.label, "USt-IdNr.");
  assert.match(form, /htmlFor="reg-vat">\{VAT_ID_TEXT\.label\} <Req \/><\/label>/);
  const feld = form.slice(form.indexOf('id="reg-vat"'), form.indexOf("{errors.vat_id &&"));
  for (const muster of [/required/, /aria-required="true"/, /aria-invalid=\{errors\.vat_id \? "true" : undefined\}/,
                        /aria-describedby="reg-vat-hint"/, /autoComplete="off"/]) {
    assert.match(feld, muster);
  }
  assert.ok(!/placeholder=/.test(feld), "ein Musterwert steht im Pflichtfeld");
  assert.match(form, /<span className="auth-field-hint" id="reg-vat-hint">\{VAT_ID_TEXT\.hint\}<\/span>/);
  assert.ok(!/USt-ID <span className="auth-optional">\(optional\)<\/span>/.test(form), "das Feld heißt noch optional");
  // Keine Behauptung einer behördlichen Prüfung.
  assert.match(VAT_ID_TEXT.hint, /keine behördliche Bestätigung/);
});
