// Auftrag 2 / P8 (2026-10-17): Kontakt-E-Mail und Telefon des Ansprechpartners — Regel, Profilansicht, Karte, Admin.
// Die Regel spiegelt Backend lib/contactDetails.js; beide prüfen dieselbe Falltabelle (Prüfsumme hier und dort).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateContactEmail, validateContactPhone } from "./contactDetails.mjs";
import {
  contactBaseline, buildContactPatch, isContactDirty, validateContactForm, canSaveContact, contactSaveConfirmed,
  mapApiProfileError, CONTACT_FIELDS, PROFILE_TEXT,
} from "./profileView.mjs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const FALLTABELLE_SHA256 = "ff984d38227966539362";

test("1 — die Regel besteht die gemeinsame Falltabelle (bytegleich mit dem Backend)", () => {
  const roh = lies("../testing/contactDetailsCases.json");
  assert.equal(createHash("sha256").update(roh).digest("hex").slice(0, 20), FALLTABELLE_SHA256,
    "die Falltabelle weicht von der Backendkopie ab");
  const faelle = JSON.parse(roh);
  for (const [liste, fn] of [[faelle.email, validateContactEmail], [faelle.phone, validateContactPhone]]) {
    for (const f of liste) {
      const r = fn(f.eingabe);
      assert.equal(r.ok, f.ok, JSON.stringify(f));
      if (f.ok) assert.equal(r.value, f.wert, JSON.stringify(f));
      else assert.ok(r.error, JSON.stringify(f));
    }
  }
});

test("2 — Profilansicht: Baseline, PATCH mit allen drei Feldern, Dirty nur bei echter Änderung", () => {
  assert.deepEqual(CONTACT_FIELDS, ["name", "contact_email", "contact_phone"]);
  const user = { name: "Anna Berger", contact_email: "anna@firma.de", contact_phone: "0711 123456", email: "login@firma.de" };
  const basis = contactBaseline(user);
  assert.deepEqual(basis, { name: "Anna Berger", contact_email: "anna@firma.de", contact_phone: "0711 123456" });
  assert.deepEqual(contactBaseline({ name: "X" }), { name: "X", contact_email: "", contact_phone: "" }, "Bestandskonto ohne Angaben");
  assert.deepEqual(buildContactPatch({ ...basis, contact_phone: "  0711   123456 " }),
    { name: "Anna Berger", contact_email: "anna@firma.de", contact_phone: "0711 123456" });
  assert.ok(!("email" in buildContactPatch({ ...basis, email: "neu@firma.de" })), "die Login-E-Mail im PATCH");
  assert.equal(isContactDirty({ ...basis, contact_phone: " 0711  123456" }, basis), false, "nur Leerraum ist keine Änderung");
  assert.equal(isContactDirty({ ...basis, contact_email: "" }, basis), true, "Leeren ist eine Änderung");
  assert.equal(canSaveContact({ ...basis, contact_email: "neu@firma.de" }, basis, false), true);
  assert.equal(canSaveContact({ ...basis, contact_email: "neu@firma.de" }, basis, true), false, "während des Speicherns");
});

test("3 — Feldfehler direkt am Feld: Client-Vorprüfung und Backendfehler", () => {
  const e = validateContactForm({ name: "Anna", contact_email: "anna@firma", contact_phone: "12345" });
  assert.deepEqual(Object.keys(e).sort(), ["contact_email", "contact_phone"]);
  assert.equal(canSaveContact({ name: "Anna", contact_email: "anna@firma", contact_phone: "" }, contactBaseline({ name: "Anna" }), false), false);
  assert.deepEqual(validateContactForm({ name: "Anna", contact_email: "", contact_phone: "" }), {}, "leer ist erlaubt");
  assert.deepEqual(mapApiProfileError({ error: "Bitte geben Sie eine gültige Telefonnummer ein.", field: "contact_phone", code: "INVALID_CONTACT_PHONE" }),
    { fieldErrors: { contact_phone: "Bitte geben Sie eine gültige Telefonnummer ein." }, generalError: "" });
});

test("4 — „Gespeichert\" nur, wenn die Serverantwort die gesendeten Werte trägt", () => {
  const patch = { name: "Anna Berger", contact_email: "anna@firma.de", contact_phone: "0711 123456" };
  assert.equal(contactSaveConfirmed(patch, { ...patch, email: "login@firma.de" }), true);
  assert.equal(contactSaveConfirmed({ ...patch, contact_email: "", contact_phone: "" }, { name: "Anna Berger", contact_email: null, contact_phone: null }), true,
    "geleerte Felder kommen als null zurück");
  // Ein Backend ohne die Felder ignoriert sie still und antwortet 200 — ohne die Schlüssel ist das kein Erfolg.
  assert.equal(contactSaveConfirmed(patch, { name: "Anna Berger", email: "login@firma.de" }), false);
  assert.equal(contactSaveConfirmed(patch, { ...patch, contact_phone: "0711 999999" }), false);
  assert.equal(contactSaveConfirmed(patch, null), false);
});

test("5 — Karte „Ansprechpartner\": beide Felder optional, Bestätigung geprüft, Login-E-Mail unberührt", () => {
  const karte = lies("../components/dashboard/Profile.jsx");
  for (const muster of [/id="pf-contact-email" type="email"/, /id="pf-contact-phone" type="tel"/,
                        /autoComplete="email" maxLength=\{254\}/, /autoComplete="tel" maxLength=\{30\}/,
                        /if \(which === "contact" && !contactSaveConfirmed\(patch, d\.user\)\)/,
                        /k: PROFILE_TEXT\.contactEmailLabel, v: user\?\.contact_email \|\| "Nicht angegeben"/,
                        /k: PROFILE_TEXT\.contactPhoneLabel, v: user\?\.contact_phone \|\| "Nicht angegeben"/]) {
    assert.match(karte, muster);
  }
  assert.ok(!/„Telefon" wird bewusst NICHT geführt/.test(karte), "der alte Hinweis steht noch");
  assert.ok(!/required[^>]*pf-contact|pf-contact[^>]*required/.test(karte), "ein Kontaktfeld ist Pflicht");
  assert.match(PROFILE_TEXT.contactOptionalHint, /nicht Ihre Login-E-Mail/);
});

test("6 — Admin-Kundendetail: Kontakt-E-Mail und Kontakt-Telefon neben der Login-E-Mail", () => {
  const seite = lies("../pages/admin/AdminUserDetailPage.jsx");
  assert.match(seite, /\["Kontakt-E-Mail", dash\(u\.contact_email\)\],\s*\["Kontakt-Telefon", dash\(u\.contact_phone\)\],\s*\["Login-E-Mail", dash\(emailOf\(u\)\)\]/);
});
