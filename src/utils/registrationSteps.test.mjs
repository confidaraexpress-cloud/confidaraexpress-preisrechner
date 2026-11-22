// Registrierung in drei Schritten — Premium UX 4.0 (Betreiberentscheidung A3, 2026-11-22).
// Reine Frontend-Führung über dasselbe Formular: jedes bekannte Feld gehört genau einem Schritt, ein Schrittwechsel
// sendet nichts, und am Ende steht dieselbe eine Anfrage POST /register mit denselben Prüfungen.
//
// Run: node --test src/utils/registrationSteps.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  REG_STEPS, REG_LAST_STEP, REG_FIELD_IDS, REG_STEP_TEXT,
  regStepOfField, regStepErrors, regFirstStepWithError, regFirstErrorFieldId, regSummary,
} from "./registrationSteps.mjs";
import { REG_KNOWN_FIELDS, getRegErrors } from "./registrationValidation.mjs";
import { VAT_ID_TEXT, VAT_ID_ABSENT_TEXT } from "./vatId.mjs";
import { SHIPMENT_VOLUME_QUESTION } from "./shipmentVolume.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));
const lies = (rel) => readFileSync(path.join(hier, rel), "utf8");
const form = lies("../components/auth/RegisterForm.jsx");
const seite = lies("../pages/AuthPage.jsx");

test("S1 — drei Schritte; jedes bekannte Feld (und die Wiederholung) gehört genau einem Schritt und hat eine Kennung", () => {
  assert.equal(REG_STEPS.length, 3);
  assert.equal(REG_LAST_STEP, 2);
  assert.ok(Object.isFrozen(REG_STEPS) && REG_STEPS.every((s) => Object.isFrozen(s) && Object.isFrozen(s.felder)));
  const alle = REG_STEPS.flatMap((s) => s.felder);
  assert.equal(new Set(alle).size, alle.length, "ein Feld in zwei Schritten");
  for (const feld of [...REG_KNOWN_FIELDS, "passwordRepeat"]) {
    assert.ok(regStepOfField(feld) >= 0, `${feld} ohne Schritt`);
    assert.match(REG_FIELD_IDS[feld] || "", /^reg-[a-z-]+$/, `${feld} ohne Kennung`);
  }
  assert.deepEqual(new Set(alle), new Set([...REG_KNOWN_FIELDS, "passwordRepeat"]), "Schritte kennen ein unbekanntes Feld");
  assert.equal(regStepOfField("gibt-es-nicht"), -1);
});

test("S2 — jede Kennung steht im Formular (Fokusziel bei einem Fehler)", () => {
  for (const [feld, id] of Object.entries(REG_FIELD_IDS)) {
    // Die Erklärungen bauen ihre Kennung aus `${id}-input`.
    const quelle = id.endsWith("-input") ? `id="${id.replace(/-input$/, "")}"` : `id="${id}"`;
    assert.ok(form.includes(quelle), `${feld}: ${quelle} fehlt in RegisterForm`);
  }
  assert.match(form, /id=\{`\$\{id\}-input`\}/, "Erklärung ohne Kennung des Eingabefelds");
});

test("S3 — Fehler je Schritt in Feldreihenfolge; erster Schritt mit Fehler; unbekanntes Feld → letzter Schritt", () => {
  const fehler = { city: "x", name: "a", passwordRepeat: "b", termsAcknowledged: "c", company_name: "" };
  assert.deepEqual(Object.keys(regStepErrors(0, fehler)), ["name", "passwordRepeat"]);
  assert.deepEqual(Object.keys(regStepErrors(1, fehler)), ["city"], "leere Meldung ist kein Fehler");
  assert.deepEqual(Object.keys(regStepErrors(2, fehler)), ["termsAcknowledged"]);
  assert.deepEqual(regStepErrors(7, fehler), {});
  assert.equal(regFirstStepWithError(fehler), 0);
  assert.equal(regFirstStepWithError({ zip: "x" }), 1);
  assert.equal(regFirstStepWithError({ allgemein: "x" }), REG_LAST_STEP);
  assert.equal(regFirstStepWithError({}), -1);
  assert.equal(regFirstStepWithError(null), -1);
  assert.equal(regFirstErrorFieldId(0, fehler), "reg-name");
  assert.equal(regFirstErrorFieldId(1, { vat_id: "x", company_name: "y" }), "reg-company");
  assert.equal(regFirstErrorFieldId(2, { businessCustomerConfirmed: "x" }), "reg-business-input");
  assert.equal(regFirstErrorFieldId(0, {}), null);
});

test("S4 — Schritt 1 prüft dieselbe Regel: ein leeres Formular hält in Schritt 1 an, ein gefüllter Zugang nicht", () => {
  const leer = { name: "", email: "", password: "", company_name: "", vat_id: "", street: "", zip: "", city: "", country: "DE",
    vat_id_absent: false, legal_form: "", monthly_shipment_volume: "" };
  assert.ok(Object.keys(regStepErrors(0, getRegErrors(leer, ""))).length > 0);
  const zugang = { ...leer, name: "Max Muster", email: "max@beispiel.de", password: "geheim-12345" };
  assert.deepEqual(regStepErrors(0, getRegErrors(zugang, "geheim-12345")), {});
  assert.ok(Object.keys(regStepErrors(1, getRegErrors(zugang, "geheim-12345"))).length > 0, "Unternehmen fehlt noch");
});

test("S5 — Zusammenfassung: kein Passwort im Klartext, USt-IdNr. oder Rechtsform, Volumen, Adresse oder „Keine Angabe“", () => {
  const basis = { name: " Max Muster ", email: "max@beispiel.de", password: "streng-geheim-99", company_name: "Muster GmbH",
    vat_id: "DE123456789", street: "", zip: "", city: "", country: "DE", vat_id_absent: false, legal_form: "",
    monthly_shipment_volume: "11_50" };
  const g = regSummary(basis, { landName: (c) => (c === "DE" ? "Deutschland" : c) });
  assert.deepEqual(g.map((x) => x.schritt), [0, 1]);
  const text = JSON.stringify(g);
  assert.ok(!text.includes("streng-geheim-99"), "Passwort im Klartext");
  const zeile = (gruppe, feld) => g[gruppe].zeilen.find((z) => z.feld === feld);
  assert.equal(zeile(0, "name").wert, "Max Muster");
  assert.equal(zeile(0, "password").wert, REG_STEP_TEXT.passwortGesetzt);
  assert.equal(zeile(1, "vat_id").label, VAT_ID_TEXT.label);
  assert.equal(zeile(1, "vat_id").wert, "DE123456789");
  assert.equal(zeile(1, "monthly_shipment_volume").label, SHIPMENT_VOLUME_QUESTION);
  assert.ok(zeile(1, "monthly_shipment_volume").wert.length > 0);
  assert.equal(zeile(1, "street").wert, REG_STEP_TEXT.keineAngabe, "ohne Adresse kein Land allein");

  const ohne = regSummary({ ...basis, vat_id_absent: true, legal_form: "sole_proprietorship", street: "Musterweg 1", zip: "10115", city: "Berlin" },
    { landName: (c) => (c === "DE" ? "Deutschland" : c) });
  const z2 = (feld) => ohne[1].zeilen.find((z) => z.feld === feld);
  assert.equal(z2("vat_id"), undefined, "ohne USt-IdNr. keine Nummer");
  assert.equal(z2("vat_id_absent").wert, VAT_ID_ABSENT_TEXT.toggle);
  assert.equal(z2("legal_form").label, VAT_ID_ABSENT_TEXT.legalFormLabel);
  assert.equal(z2("street").wert, "Musterweg 1, 10115 Berlin, Deutschland");
});

test("S6 — Formular: Schrittleiste, drei Schritte mit hidden, genau EIN Absendeknopf je Schritt, Zurück ohne Absenden", () => {
  assert.match(form, /<ol className="auth-reg-leiste" aria-label=\{REG_STEP_TEXT\.fortschritt\}>/);
  assert.match(form, /aria-current=\{i === step \? "step" : undefined\}/);
  assert.equal([...form.matchAll(/className="auth-reg-schritt" role="group"/g)].length, 3);
  assert.equal([...form.matchAll(/hidden=\{step !== [012]\}/g)].length, 3);
  // Weiter und Konto beantragen schließen sich aus: ein Ausdruck, zwei Zweige.
  assert.match(form, /\{step < REG_LAST_STEP \? \(\s*<button key="weiter" type="submit"[\s\S]*?\) : \(\s*<button key="absenden" type="submit"/);
  assert.equal([...form.matchAll(/type="submit"/g)].length, 2, "nur Weiter und Konto beantragen sind Absendeknöpfe");
  assert.match(form, /<button type="button" className="auth-reg-zurueck" onClick=\{\(e\) => \{ if \(e\.detail <= 1\) onBack\(\); \}\}>/);
  assert.match(form, /className="auth-cta auth-reg-absenden" disabled=\{loading \|\| !regValid\}/);
  // Ein Doppelklick zählt einmal: Weiter und Konto beantragen liegen an derselben Stelle.
  assert.match(form, /const nurEinKlick = \(e\) => \{ if \(e\.detail > 1\) e\.preventDefault\(\); \};/);
  assert.match(form, /className="auth-cta auth-reg-weiter" onClick=\{nurEinKlick\}/);
  assert.match(form, /className="auth-cta auth-reg-absenden" disabled=\{loading \|\| !regValid\} onClick=\{nurEinKlick\}/);
  assert.match(form, /onSubmit=\{\(e\) => \{ e\.preventDefault\(\); if \(step < REG_LAST_STEP\) onNext\(\); else onRegister\(\); \}\}/);
  // Fokus nach dem Schrittwechsel auf die Überschrift (tabIndex -1), mit „Schritt n von 3“ für Screenreader.
  assert.match(form, /<h3 className="auth-reg-titel"[^>]*tabIndex=\{-1\}/);
  assert.match(form, /REG_STEP_TEXT\.schrittVon\(i \+ 1, REG_STEPS\.length\)/);
});

test("S7 — Seite: Weiter prüft nur den Schritt und sendet nichts; Absenden einmal; nach Erfolg leer am Anfang", () => {
  const weiter = seite.slice(seite.indexOf("const handleRegNext"), seite.indexOf("const handleRegBack"));
  assert.ok(weiter.length > 50, "handleRegNext nicht gefunden");
  assert.match(weiter, /regStepErrors\(regStep, getRegErrors\(regForm, regPasswordRepeat\)\)/);
  assert.ok(!/fetch|API|setLoading|localStorage|sessionStorage/.test(weiter), "Weiter darf nichts senden oder speichern");
  // Zurück und Sprung über die Leiste nur rückwärts.
  assert.match(seite, /const handleRegGoTo = \(schritt\) => \{ if \(schritt >= 0 && schritt < regStep\)/);
  // Mehrfachversand: Guard über loading UND eine Sperre zwischen zwei Renderläufen.
  assert.match(seite, /if \(loading\) return;\s*\n\s*if \(regInFlight\.current\) return;/);
  assert.match(seite, /regInFlight\.current = true;/);
  assert.match(seite, /finally \{ regInFlight\.current = false; \}/);
  // Fehler (Browser oder Server) führen in den Schritt ihres Felds.
  assert.match(seite, /setRegErrors\(errs\); zeigeRegFehler\(errs\); return;/);
  assert.match(seite, /setRegErrors\(fieldErrors\);\s*\n\s*setError\(generalError\);\s*\n\s*zeigeRegFehler\(fieldErrors\);/);
  // Nach Erfolg: kein Passwort im Zustand, erster Schritt.
  assert.match(seite, /setRegForm\(leeresRegFormular\(\)\); setRegPasswordRepeat\(""\); setRegDeclarations\(emptyRegistrationDeclarations\(\)\);/);
  // Nichts davon landet im Browserspeicher.
  const register = seite.slice(seite.indexOf("const handleRegNext"), seite.indexOf("const handleForgot"));
  assert.ok(!/localStorage|sessionStorage|indexedDB/.test(register), "Registrierungsdaten im Browserspeicher");
});

test("S9 — schmale Schrittleiste: Punkte nach Inhalt, sehr eng auch der aktuelle Name nur für Screenreader", () => {
  const css = lies("../styles/premium-redesign.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.auth-reg-leiste \{[^}]*container: reg-leiste \/ inline-size;/);
  // Jeder Name zweimal: sichtbar (ohne aria-hidden, damit die Layout-Wächter ihn prüfen) und als .sr-only-Fassung, die
  // breit nicht angezeigt wird — angezeigt ist immer genau eine, der Screenreader liest jeden Namen einmal.
  assert.ok(form.includes('<span className="auth-reg-name">{s.kurz}</span>'));
  assert.ok(form.includes('<span className="sr-only auth-reg-name-sr">{s.kurz}</span>'));
  assert.match(css, /\[data-ce-bereich="auth"\] \.auth-reg-name-sr \{ display: none; \}/);
  // Schmal (30em): Punkte nach ihrem Inhalt, damit ein langer Name („Unternehmen“) nicht über seinen Punkt ragt; die
  // übrigen Namen nur für Screenreader. Kein eigenes Abschneide-Muster: das meldete premiumLayoutGuard als abgeschnitten.
  const schmal = css.slice(css.indexOf("@media (max-width: 30em) {", css.indexOf(".auth-reg-leiste {")));
  assert.match(schmal, /^@media \(max-width: 30em\) \{\s*\[data-ce-bereich="auth"\] \.auth-reg-punkt \{ flex: 1 1 auto; min-width: auto; \}\s*\[data-ce-bereich="auth"\] \.auth-reg-punkt:not\(\.auth-reg-punkt--aktiv\) \.auth-reg-name \{ display: none; \}\s*\[data-ce-bereich="auth"\] \.auth-reg-punkt:not\(\.auth-reg-punkt--aktiv\) \.auth-reg-name-sr \{ display: inline; \}/);
  // Sehr eng (große Browserschrift): auch der aktuelle Name nur für Screenreader — gemessen an der Leiste selbst.
  const eng = css.slice(css.indexOf("@container reg-leiste (width < 16rem) {"));
  assert.ok(eng.length > 40, "die enge Stufe fehlt");
  assert.match(eng, /^@container reg-leiste \(width < 16rem\) \{\s*\[data-ce-bereich="auth"\] \.auth-reg-punkt--aktiv \.auth-reg-name \{ display: none; \}\s*\[data-ce-bereich="auth"\] \.auth-reg-punkt--aktiv \.auth-reg-name-sr \{ display: inline; \}/);
  assert.ok(!/\.auth-reg-name \{[^}]*clip:/.test(css), "die sichtbare Fassung wird wieder abgeschnitten statt ausgeblendet");
  // Darauf stützt sich die enge Stufe: Die Überschrift des Schritts nennt ihn sichtbar.
  assert.ok(form.includes('<h3 className="auth-reg-titel"'));
  assert.ok(form.includes('<span className="sr-only">{REG_STEP_TEXT.schrittVon(i + 1, REG_STEPS.length)}: </span>{REG_STEPS[i].titel}'));
});

test("S8 — der Hinweis vor dem Absenden behauptet nicht, vorher werde nichts übertragen (Adressvorschläge sind öffentlich)", () => {
  assert.match(REG_STEP_TEXT.pruefenText, /erst mit „Konto beantragen“ gesendet/);
  assert.doesNotMatch(REG_STEP_TEXT.pruefenText, /nichts|keine Daten|übertragen/i);
});
