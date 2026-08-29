// eoriUx.test.mjs — EORI-Nummer im Kundenportal (Kontoeinstellungen + Zollbuchung).
//
// Reine Quelltext- und Funktionstests: kein Browser, kein Netz, keine Buchung.
// Run: node src/utils/eoriUx.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeEori, eoriFieldError, hasUsableEori, EORI_MAX_LENGTH, EORI_FORMAT_ERROR, EORI_HINT } from "./eori.mjs";
// Fail-closed Quelltextzugriff: fehlende Anker sind LAUTE Fehler, nie leere Ausschnitte.
import { schnitt, ankerPosition } from "../../scripts/governance.mjs";
import {
  COMPANY_FIELDS, FIELD_MAXLEN, companyBaseline, buildCompanyPatch,
  isCompanyDirty, validateCompanyForm, mapApiProfileError,
} from "./profileView.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");

// Quelltextzusicherungen auf KOMMENTARFREIEM Code — sonst belegt ein erklärender
// Kommentar eine Zusicherung, die der ausgeführte Code gar nicht trägt.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const eoriSrc      = strip(src("utils/eori.mjs"));
const profileSrc   = strip(src("components/dashboard/Profile.jsx"));
const bookingSrc   = strip(src("pages/BookingPage.jsx"));
const customsSrc   = strip(src("components/booking/CustomsModule.jsx"));
const sectionSrc   = strip(src("components/booking/CustomsEoriSection.jsx"));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}`); console.log(`     ${e.message}`); failed++; }
}

console.log("\nEORI-Nummer — Kontoeinstellungen & Zollbuchung\n");

// ── A. Format und Normalisierung ─────────────────────────────────────────────
console.log("── A. Format und Normalisierung ──");

test("(A1) international: zwei Buchstaben Länderpräfix, kein hartes DE", () => {
  for (const gut of ["DE123456789012345", "ATU12345678", "NL8123456789"]) {
    assert.equal(eoriFieldError(gut), "", `abgelehnt: ${gut}`);
    assert.equal(hasUsableEori(gut), true);
  }
  for (const schlecht of ["D123456", "1DE2345", "DE", "DE!2345"]) {
    assert.equal(eoriFieldError(schlecht), EORI_FORMAT_ERROR, `durchgelassen: ${schlecht}`);
  }
});

test("(A2) der Fehlertext behauptet KEINE behördliche Prüfung", () => {
  assert.ok(EORI_FORMAT_ERROR.startsWith("Format der EORI-Nummer"));
  // Und die Oberfläche schlägt nirgends nach.
  assert.ok(!/fetch|https?:|register/i.test(eoriSrc), "das Modul darf nichts nachschlagen");
});

test("(A3) Normalisierung: trim, Großschreibung, Trenner entfallen", () => {
  assert.equal(normalizeEori("  de 123-456 789 "), "DE123456789");
  for (const kaputt of [null, undefined, 42, true, [], {}]) {
    assert.equal(normalizeEori(kaputt), "", `als Wert akzeptiert: ${String(kaputt)}`);
  }
});

test("(A4) LEER ist gültig — die EORI ist optional", () => {
  for (const leer of ["", "   ", null, undefined]) {
    assert.equal(eoriFieldError(leer), "", `leer abgelehnt: ${String(leer)}`);
    assert.equal(hasUsableEori(leer), false);
  }
  // Die Prüfung ist enger als die Spaltenbreite, nie umgekehrt.
  assert.equal(EORI_MAX_LENGTH, 20);
  assert.equal(eoriFieldError("DE" + "1".repeat(15)), "");
  assert.equal(eoriFieldError("DE" + "1".repeat(16)), EORI_FORMAT_ERROR);
});

// ── B. Kontoeinstellungen ────────────────────────────────────────────────────
console.log("\n── B. Kontoeinstellungen ──");

test("(B1) eori_number gehört zur Unternehmenskarte und wird normalisiert gesendet", () => {
  assert.ok(COMPANY_FIELDS.includes("eori_number"));
  const patch = buildCompanyPatch({ company_name: "M", eori_number: " de 123-456 " });
  assert.equal(patch.eori_number, "DE123456");
  // Kein Mass Assignment: die Schlüsselmenge bleibt fix.
  assert.deepEqual(Object.keys(patch).sort(),
    ["city", "company_name", "country", "eori_number", "street", "vat_id", "zip"]);
});

test("(B2) keine zweite Längenzahl neben der Formatregel", () => {
  assert.equal(FIELD_MAXLEN.eori_number, undefined,
    "die Länge gehört zur Formatregel in eori.mjs — eine zweite Zahl wäre eine zweite Wahrheit");
});

test("(B3) eine andere Schreibweise desselben Werts ist KEINE Änderung", () => {
  const base = companyBaseline({ company_name: "M", eori_number: "DE123456" });
  assert.equal(base.eori_number, "DE123456");
  assert.equal(isCompanyDirty({ ...base, eori_number: " de 123-456 " }, base), false);
  assert.equal(isCompanyDirty({ ...base, eori_number: "DE999999" }, base), true);
});

test("(B4) ein Formatfehler erscheint AM FELD, das Leeren bleibt erlaubt", () => {
  const base = companyBaseline({ company_name: "Muster GmbH" });
  assert.equal(validateCompanyForm({ ...base, eori_number: "" }).eori_number, undefined);
  assert.equal(validateCompanyForm({ ...base, eori_number: "!!" }).eori_number, EORI_FORMAT_ERROR);
  // Und ein Backend-Feldfehler landet ebenfalls am Feld statt in der Kartenmeldung.
  const m = mapApiProfileError({ error: EORI_FORMAT_ERROR, code: "INVALID_EORI_FORMAT", field: "eori_number" });
  assert.equal(m.fieldErrors.eori_number, EORI_FORMAT_ERROR);
  assert.equal(m.generalError, "");
});

test("(B5) das Profilfeld ist optional — kein Pflichtsternchen, mit sachlichem Hilfetext", () => {
  assert.ok(profileSrc.includes('htmlFor="pf-eori"'), "das EORI-Feld fehlt in der Unternehmenskarte");
  const feld = schnitt(profileSrc, 'htmlFor="pf-eori"', 'htmlFor="pf-street"', "EORI-Feld (B5)");
  assert.ok(!feld.includes("{req}"), "die EORI darf kein Pflichtsternchen tragen");
  assert.ok(!/requiredProps\("eori_number"\)/.test(profileSrc), "die EORI darf kein B2B-Pflichtfeld sein");
  assert.ok(feld.includes("EORI_HINT"), "der Hilfetext fehlt");
  assert.ok(EORI_HINT.includes("zollpflichtige Sendungen"), "der Hilfetext nennt den Zweck nicht");
  // Die USt-ID bleibt unverändert daneben stehen.
  assert.ok(profileSrc.includes('htmlFor="pf-vat"'), "die USt-ID darf nicht verschwinden");
});

// ── C. Zollbuchung ───────────────────────────────────────────────────────────
console.log("\n── C. Zollbuchung ──");

test("(C1) fehlt die EORI, erscheint die Erfassung INLINE im Zollabschnitt", () => {
  assert.ok(customsSrc.includes("<CustomsEoriSection"), "die Sektion ist nicht eingebunden");
  assert.ok(sectionSrc.includes('data-testid="customs-eori-required"'));
  assert.ok(sectionSrc.includes('data-testid="customs-eori-ok"'));
  // Ohne Anforderung UND ohne hinterlegte Nummer entsteht gar keine Fläche.
  assert.ok(/if \(!required\) \{\s*\n\s*if \(!vorhanden\) return null;/.test(sectionSrc));
  // Und die Serverwahrheit gewinnt: `required` wird VOR dem lokal bekannten Kontowert
  // ausgewertet — lehnt /book mit EORI_REQUIRED ab, braucht der Kunde das Eingabefeld
  // und nicht eine Bestätigungszeile, die der Ablehnung widerspricht.
  assert.ok(ankerPosition(sectionSrc, "if (!required)", "required-Zweig (C1)")
          < ankerPosition(sectionSrc, 'data-testid="customs-eori-ok"', "OK-Zeile (C1)"),
    "der Kontowert darf die serverseitige Anforderung nicht überstimmen");
});

test("(C2) gespeichert wird über die BESTEHENDE Profil-API — keine zweite Strecke", () => {
  assert.ok(sectionSrc.includes('apiFetch("/kunde/profil"'), "es muss der vorhandene Profilendpunkt sein");
  assert.ok(/method:\s*"PATCH"/.test(sectionSrc));
  // GENAU EIN Schlüssel im Body: die Sektion darf keine anderen Profilfelder überschreiben.
  assert.ok(/JSON\.stringify\(\{ eori_number: kanonisch \}\)/.test(sectionSrc));
  // Und es entsteht KEINE zweite EORI an der Sendung.
  assert.ok(!/shipment|booking|customsData/i.test(sectionSrc.replace(/Buchung\w*/g, "")),
    "die Sektion darf keinen Sendungs-/Buchungszustand schreiben");
});

test("(C3) nach dem Speichern bleibt der Versandvorgang bestehen", () => {
  // Kontozustand aktualisieren statt neu laden oder navigieren.
  assert.ok(/updateUser\(d\.user\)/.test(sectionSrc), "der Kontozustand wird nicht aktualisiert");
  assert.ok(!/navigate|window\.location|location\.href|reload/.test(sectionSrc),
    "die Sektion darf nicht navigieren — der Vorgang lebt nur im Arbeitsspeicher");
  assert.ok(!/localStorage|sessionStorage/.test(sectionSrc), "nichts wird persistiert");
});

test("(C4) EORI_REQUIRED öffnet DENSELBEN Inline-Weg — nicht den Adressen-/Preiszweig", () => {
  assert.ok(bookingSrc.includes('d?.code === "EORI_REQUIRED"'), "der Zweig fehlt");
  const zweig = schnitt(bookingSrc, 'd?.code === "EORI_REQUIRED"',
    "COMMERCIAL_INVOICE_BOOK_ERRORS[d.code]", "EORI-Zweig (C4)");
  assert.ok(/setEoriRequired\(true\)/.test(zweig), "die Inline-Fläche wird nicht aktiviert");
  assert.ok(/setStep\(1\)/.test(zweig), "der Kunde landet nicht am Zollabschnitt");
  assert.ok(!/Preise? neu berechnen|priceChange|setPriceChange/.test(zweig),
    "EORI_REQUIRED darf nicht im Preis-/Adressenzweig landen");
  // Der Zweig steht VOR dem Handelsrechnungszweig — sonst könnte er dort hängenbleiben.
  assert.ok(bookingSrc.indexOf('d?.code === "EORI_REQUIRED"')
          < bookingSrc.indexOf("COMMERCIAL_INVOICE_BOOK_ERRORS[d.code]"));
});

test("(C5) das Frontend entscheidet die Zollpflicht NICHT", () => {
  // Die Fläche hängt am Backendbefund oder am leeren Kontofeld — nie an einer eigenen
  // Länderregel im Client.
  assert.ok(/eoriRequired \|\| !hasUsableEori\(user\?\.eori_number\)/.test(bookingSrc));
  for (const verboten of ["EU_COUNTRIES", "isCustomsRequired", 'country !== "DE"']) {
    assert.ok(!bookingSrc.includes(verboten), `eigene Zollregel im Client: ${verboten}`);
  }
});

test("(C6) nicht zollpflichtige Sendungen bleiben unberührt", () => {
  // Die Sektion lebt ausschließlich im Zollmodul, und das rendert nur bei modules.customs.
  assert.ok(!bookingSrc.includes("<CustomsEoriSection"), "die Sektion gehört in das Zollmodul");
  assert.ok(/\{modules\.customs && \(/.test(bookingSrc), "das Zollmodul ist nicht mehr bedingt");
});

console.log(`\n${"═".repeat(50)}`);
console.log(`${passed} bestanden, ${failed} fehlgeschlagen`);
console.log(`${"═".repeat(50)}\n`);
if (failed > 0) process.exit(1);
