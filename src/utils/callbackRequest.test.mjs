// Rückrufwunsch der Ansprechpartnerkarte (Startklar, Betreiberentscheidung 2026-11-23) — reine Logik
// (utils/callbackRequest.mjs) und Quelltextanker des Dialogs (components/support/CallbackRequestDialog.jsx) und der
// API-Funktion (api/supportApi.js). Das Verhalten im Browser prüft tests/e2e/callbackRequestDialog.test.mjs.
//
// Run: node --test src/utils/callbackRequest.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  CALLBACK_CATEGORY, CALLBACK_FIELDS, CALLBACK_NAME_MAX, CALLBACK_NAME_MIN, CALLBACK_PHONE_MAX, CALLBACK_REASON_MAX,
  CALLBACK_TEXT, buildCallbackRequestBody, callbackFieldErrors, callbackPrefill, callbackSuccessMessage,
  mapCallbackError, rueckrufAnbieten,
} from "./callbackRequest.mjs";
import { CONTACT_DETAILS_TEXT, CONTACT_PHONE_MAXLEN } from "./contactDetails.mjs";
import { SUPPORT_GENERIC_ERROR } from "./supportRequest.mjs";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (rel) => readFileSync(path.join(SRC, rel), "utf8");
const ohneKommentare = (q) => q.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const GUELTIG = { name: "Erika Muster", phone: "+49 711 123456-78", reason: "" };

test("1 — Grenzen wie im Backend (lib/support.js); Telefon über den zentralen Kontaktvertrag", () => {
  assert.equal(CALLBACK_CATEGORY, "callback");
  assert.deepEqual([CALLBACK_NAME_MIN, CALLBACK_NAME_MAX, CALLBACK_REASON_MAX], [2, 100, 1000]);
  assert.equal(CALLBACK_PHONE_MAX, CONTACT_PHONE_MAXLEN);
  assert.equal(CALLBACK_TEXT.telefonFehler, CONTACT_DETAILS_TEXT.phoneInvalid, "derselbe Fehlertext wie die Kontakt-Telefonnummer");
  assert.deepEqual(CALLBACK_FIELDS, ["callbackName", "callbackPhone", "message"]);
});

test("2 — angeboten nur einem Kundenkonto außerhalb der Demo", () => {
  assert.equal(rueckrufAnbieten({ role: "customer" }, false), true);
  assert.equal(rueckrufAnbieten({ role: "customer" }, true), false, "die Demo hat kein Konto");
  for (const role of ["admin", "sales_partner", "", undefined]) assert.equal(rueckrufAnbieten({ role }, false), false, String(role));
  for (const user of [null, undefined, "customer", 1]) assert.equal(rueckrufAnbieten(user, false), false);
});

test("3 — Vorschlag aus dem Konto: Name und Kontakt-Telefonnummer, sonst leer (nie erfunden)", () => {
  assert.deepEqual(callbackPrefill({ name: " Erika Muster ", contact_phone: " 0711 123456 ", email: "e@x.de" }),
    { name: "Erika Muster", phone: "0711 123456" });
  assert.deepEqual(callbackPrefill({ name: "Erika Muster", contact_phone: null }), { name: "Erika Muster", phone: "" });
  assert.deepEqual(callbackPrefill(null), { name: "", phone: "" });
  assert.deepEqual(callbackPrefill({ name: 7, contact_phone: {} }), { name: "", phone: "" });
});

test("4 — Feldfehler: Name 2 bis 100 Zeichen, Telefon Pflicht und gültig, Grund optional bis 1000 Zeichen", () => {
  assert.deepEqual(callbackFieldErrors(GUELTIG), {});
  assert.deepEqual(callbackFieldErrors({ ...GUELTIG, reason: "x".repeat(1000) }), {});
  assert.deepEqual(callbackFieldErrors({ name: "", phone: "", reason: "" }),
    { callbackName: CALLBACK_TEXT.nameFehler, callbackPhone: CALLBACK_TEXT.telefonFehler });
  assert.deepEqual(callbackFieldErrors({ ...GUELTIG, name: " E " }), { callbackName: CALLBACK_TEXT.nameFehler }, "ein Zeichen nach dem Trimmen");
  assert.deepEqual(callbackFieldErrors({ ...GUELTIG, name: "x".repeat(101) }), { callbackName: CALLBACK_TEXT.nameFehler });
  assert.deepEqual(callbackFieldErrors({ ...GUELTIG, phone: "abc" }), { callbackPhone: CALLBACK_TEXT.telefonFehler });
  assert.deepEqual(callbackFieldErrors({ ...GUELTIG, phone: "   " }), { callbackPhone: CALLBACK_TEXT.telefonFehler }, "leer ist hier ein Fehler");
  assert.deepEqual(callbackFieldErrors({ ...GUELTIG, phone: "+49 711 1234567890123456789012" }), { callbackPhone: CALLBACK_TEXT.telefonFehler });
  assert.deepEqual(callbackFieldErrors({ ...GUELTIG, reason: "x".repeat(1001) }), { message: CALLBACK_TEXT.grundFehler });
  assert.deepEqual(callbackFieldErrors(), { callbackName: CALLBACK_TEXT.nameFehler, callbackPhone: CALLBACK_TEXT.telefonFehler });
});

test("5 — Body: genau Kategorie, Name, Telefon und (nur wenn angegeben) der Grund — kein Konto, kein Status", () => {
  assert.deepEqual(buildCallbackRequestBody(GUELTIG),
    { category: "callback", callbackName: "Erika Muster", callbackPhone: "+49 711 123456-78" });
  assert.deepEqual(buildCallbackRequestBody({ name: "  Erika   Muster ", phone: " 0711  123456 ", reason: "  Frage zur Rechnung  " }),
    { category: "callback", callbackName: "Erika Muster", callbackPhone: "0711 123456", message: "Frage zur Rechnung" });
  assert.deepEqual(Object.keys(buildCallbackRequestBody({ ...GUELTIG, reason: "   " })), ["category", "callbackName", "callbackPhone"]);
  const body = buildCallbackRequestBody({ ...GUELTIG, user_id: 9, status: "done", subject: "x" });
  assert.ok(!("user_id" in body) && !("status" in body) && !("subject" in body), "keine Massenzuweisung");
});

test("6 — Serverfehler: bekannte Feldcodes am Feld mit eigenem Text, alles andere allgemein (nie roh)", () => {
  assert.deepEqual(mapCallbackError(400, { code: "SUPPORT_CALLBACK_NAME_INVALID", error: "roh" }),
    { field: "callbackName", text: CALLBACK_TEXT.nameFehler });
  assert.deepEqual(mapCallbackError(400, { code: "SUPPORT_CALLBACK_PHONE_INVALID" }), { field: "callbackPhone", text: CALLBACK_TEXT.telefonFehler });
  assert.deepEqual(mapCallbackError(400, { code: "SUPPORT_CALLBACK_REASON_INVALID" }), { field: "message", text: CALLBACK_TEXT.grundFehler });
  const limit = mapCallbackError(429, { code: "SUPPORT_RATE_LIMITED", error: "Too many" });
  assert.equal(limit.field, null);
  assert.match(limit.text, /mehrere Anfragen/);
  assert.deepEqual(mapCallbackError(500, { error: "Provider XY kaputt" }), { field: null, text: SUPPORT_GENERIC_ERROR });
  assert.deepEqual(mapCallbackError(400, { code: "SUPPORT_CALLBACK_NAME_INVALID__x" }).field, null, "nur bekannte Codes");
  assert.deepEqual(mapCallbackError(503, null), { field: null, text: SUPPORT_GENERIC_ERROR });
});

test("7 — Bestätigung: Vorgangsnummer nur aus der Serverantwort, keine Zusage einer Rückrufzeit", () => {
  assert.equal(callbackSuccessMessage({ supportRequest: { ticketNumber: "SR-2026-000123" } }),
    "Ihr Rückrufwunsch ist bei uns eingegangen. Ihre Vorgangsnummer: SR-2026-000123");
  assert.equal(callbackSuccessMessage({}), "Ihr Rückrufwunsch ist bei uns eingegangen.");
  assert.equal(callbackSuccessMessage(null), "Ihr Rückrufwunsch ist bei uns eingegangen.");
  const alle = Object.values(CALLBACK_TEXT).join(" | ");
  assert.doesNotMatch(alle, /Minute|Stunde|heute|morgen|sofort|umgehend|innerhalb|garantiert|in Kürze|zeitnah|Werktag|rufen Sie .* zurück/i,
    "kein Text verspricht eine Rückrufzeit oder Antwortfrist");
});

test("8 — API: dieselbe Route wie jede Supportanfrage, angemeldet, mit Idempotenzschlüssel, Body nur aus dem Modul", () => {
  const api = ohneKommentare(lies("api/supportApi.js"));
  assert.match(api, /export function createCallbackRequest\(fields, idempotencyKey\) \{\s*return apiFetch\(`\/kunde\/support-requests`, \{\s*method: "POST",\s*auth: true,\s*headers: idempotencyHeader\(idempotencyKey\),\s*body: JSON\.stringify\(buildCallbackRequestBody\(fields\)\),\s*\}\);\s*\}/);
});

test("9 — Dialog: ein Schlüssel je Sitzung, Ref-Sperre gegen Mehrfachklicks, nichts gesendet bei Feldfehlern", () => {
  const d = ohneKommentare(lies("components/support/CallbackRequestDialog.jsx"));
  assert.match(d, /const \[schluessel\] = useState\(\(\) => newIdempotencyKey\(\)\);/);
  assert.equal((d.match(/newIdempotencyKey\(/g) || []).length, 1, "kein neuer Schlüssel je Klick");
  assert.match(d, /if \(inFlight\.current\) return;/);
  assert.match(d, /inFlight\.current = true;\s*setBusy\(true\);/);
  assert.match(d, /finally \{\s*inFlight\.current = false;\s*setBusy\(false\);\s*\}/);
  // Feldfehler vor dem Senden: Rückkehr vor dem Aufruf.
  const vorab = d.indexOf("const vorab = callbackFieldErrors(");
  const aufruf = d.indexOf("await createCallbackRequest(");
  assert.ok(vorab > 0 && aufruf > vorab, "die Prüfung steht nicht vor dem Senden");
  assert.match(d.slice(vorab, aufruf), /if \(Object\.keys\(vorab\)\.length > 0\) \{[\s\S]*?return;\s*\}/);
  assert.match(d, /await createCallbackRequest\(\{ name, phone, reason \}, schluessel\)/);
  assert.equal((d.match(/createCallbackRequest\(/g) || []).length, 1);
  // 401/403 erledigt apiFetch (Abmeldung) — keine zweite Meldung.
  assert.match(d, /if \(r\.status === 401 \|\| r\.status === 403\) return;/);
  // Escape und Klick daneben schließen nicht, solange gesendet wird; useDialog bekommt ein konstantes closeOnEscape.
  assert.match(d, /const schliessenWennFrei = \(\) => \{ if \(!inFlight\.current\) onClose\(\); \};/);
  assert.match(d, /useDialog\(\{ onClose: schliessenWennFrei, returnFocusTo \}\)/);
  assert.match(d, /onMouseDown=\{\(e\) => \{ if \(e\.target === e\.currentTarget\) schliessenWennFrei\(\); \}\}/);
});

test("10 — Dialog: zugänglich (Rolle, Titel, Feldfehler am Feld), eine Primärschaltfläche, Erfolg im Fokus", () => {
  const d = ohneKommentare(lies("components/support/CallbackRequestDialog.jsx"));
  assert.match(d, /role="dialog"\s+aria-modal="true"\s+aria-labelledby=\{titleId\}/);
  assert.match(d, /<form onSubmit=\{absenden\} noValidate>/);
  assert.match(d, /"aria-invalid": fehler\[feld\] \? "true" : undefined,/);
  assert.match(d, /<span className="field-error" id=\{fehlerId\(feld\)\}>\{fehler\[feld\]\}<\/span>/);
  assert.match(d, /type="tel"\s+inputMode="tel"\s+autoComplete="tel"\s+maxLength=\{CALLBACK_PHONE_MAX\}\s+required/);
  assert.match(d, /type="text"\s+autoComplete="name"\s+maxLength=\{CALLBACK_NAME_MAX\}\s+required/);
  assert.equal((d.match(/className="btn btn-primary"/g) || []).length, 2, "je Ansicht genau eine Primärschaltfläche");
  assert.match(d, /<button ref=\{absendenRef\} type="submit" className="btn btn-primary" disabled=\{busy\} aria-busy=\{busy \|\| undefined\}>/);
  assert.match(d, /<p ref=\{erfolgRef\} tabIndex=\{-1\} className="sup-dialog-success" role="status">\{erfolg\.text\}<\/p>/);
  // Kein roher Servertext im Dialog: Fehler nur über mapCallbackError und den festen Netzwerktext.
  assert.doesNotMatch(d, /d\.error|d\.message|body\.error|dangerouslySetInnerHTML/);
  // Keine Daten im Speicher oder in der Konsole.
  assert.doesNotMatch(d, /localStorage|sessionStorage|console\./);
});
