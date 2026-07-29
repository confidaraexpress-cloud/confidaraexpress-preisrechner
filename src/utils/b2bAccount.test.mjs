// Fehlende B2B-Stammdaten in der Adminsicht + B2B-Wording der betroffenen Texte.
//
// Reine Logik aus b2bAccount.mjs plus Quelltext-Contracts für die Adminseiten und
// die Datenschutzerklärung (keine React-Render-Infrastruktur im Repo).
//
// Run: node --test src/utils/b2bAccount.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  B2B_ACCOUNT_FIELDS,
  missingB2BAccountFields,
  isAnonymizedAccount,
  b2bCompletenessHint,
  isApprovalBlocked,
} from "./b2bAccount.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel) => readFileSync(join(__dirname, rel), "utf8");
const userDetailSrc  = readSrc("../pages/admin/AdminUserDetailPage.jsx");
const usersListSrc   = readSrc("../pages/admin/AdminUsersPage.jsx");
const privacySrc     = readSrc("../pages/DatenschutzPage.jsx");

const COMPLETE = { id: 7, name: "Max Mustermann", company_name: "Muster Logistik GmbH", status: "pending" };

// ─── Erkennung fehlender Felder ───────────────────────────────────────────────

test("1 — vollständiges Konto meldet keine fehlenden Felder", () => {
  assert.deepEqual(missingB2BAccountFields(COMPLETE), []);
  assert.equal(isApprovalBlocked(COMPLETE), false);
  assert.equal(b2bCompletenessHint(COMPLETE).show, false);
});

test("2 — fehlender Firmenname wird erkannt (null, leer, Whitespace)", () => {
  for (const value of [null, undefined, "", "   "]) {
    const missing = missingB2BAccountFields({ ...COMPLETE, company_name: value });
    assert.deepEqual(missing.map((f) => f.field), ["company_name"], `Wert: ${JSON.stringify(value)}`);
    assert.equal(missing[0].missingText, "Firmenname fehlt");
  }
});

test("3 — fehlender Ansprechpartner wird erkannt (null, leer, Whitespace)", () => {
  for (const value of [null, undefined, "", "  \t "]) {
    const missing = missingB2BAccountFields({ ...COMPLETE, name: value });
    assert.deepEqual(missing.map((f) => f.field), ["name"], `Wert: ${JSON.stringify(value)}`);
    assert.equal(missing[0].missingText, "Ansprechpartner fehlt");
  }
});

test("4 — beide Felder fehlend: Reihenfolge wie im Backend (Firmenname zuerst)", () => {
  const missing = missingB2BAccountFields({ id: 8, name: "", company_name: "" });
  assert.deepEqual(missing.map((f) => f.field), ["company_name", "name"]);
  assert.deepEqual(B2B_ACCOUNT_FIELDS.map((f) => f.field), ["company_name", "name"]);
});

test("5 — Freischaltung ist bei unvollständigem Konto blockiert", () => {
  assert.equal(isApprovalBlocked({ ...COMPLETE, company_name: null }), true);
  assert.equal(isApprovalBlocked({ ...COMPLETE, name: null }), true);
});

test("6 — anonymisierte Konten lösen keinen Datenpflege-Hinweis aus", () => {
  const anon = { id: 9, name: null, company_name: null, status: "anonymized" };
  assert.equal(isAnonymizedAccount(anon), true);
  assert.equal(b2bCompletenessHint(anon).show, false);
  assert.equal(isApprovalBlocked(anon), false);

  const viaTimestamp = { id: 10, name: null, company_name: null, anonymized_at: "2026-01-01T00:00:00Z" };
  assert.equal(b2bCompletenessHint(viaTimestamp).show, false);
});

test("7 — Hinweistext benennt die konkret fehlenden Felder", () => {
  const hint = b2bCompletenessHint({ id: 11, name: null, company_name: null });
  assert.equal(hint.show, true);
  assert.equal(hint.headline, "Firmenname fehlt · Ansprechpartner fehlt");
  assert.match(hint.text, /Geschäftskundenplattform/);
  assert.match(hint.text, /keine Angaben schätzen/, "Admin darf keine Daten erfinden");
});

test("8 — abweichende Feldnamen der Adminantwort werden mitgelesen", () => {
  assert.deepEqual(missingB2BAccountFields({ company: "Alt GmbH", name: "Erika" }), []);
  assert.deepEqual(
    missingB2BAccountFields({ firma: "Alt GmbH", contact_name: "Erika" }).map((f) => f.field),
    [],
  );
});

test("9 — nicht-objektartige Eingaben führen nicht zum Absturz", () => {
  for (const value of [null, undefined, 42, "text"]) {
    assert.equal(Array.isArray(missingB2BAccountFields(value)), true);
  }
});

// ─── Quelltext-Contract: Adminsicht ───────────────────────────────────────────

test("10 — Kundendetail zeigt fehlende B2B-Felder statt nur eines Gedankenstrichs", () => {
  assert.match(userDetailSrc, /from "\.\.\/\.\.\/utils\/b2bAccount\.mjs"/);
  assert.match(userDetailSrc, /b2bHint\.show/, "Warnbanner muss gerendert werden");
  assert.match(userDetailSrc, /missingField\(u, "name"\)/);
  assert.match(userDetailSrc, /missingField\(u, "company_name"\)/);
  assert.match(userDetailSrc, /\["Firmenname", missingField/, "Feld heißt im Detail Firmenname");
  assert.match(userDetailSrc, /\["Ansprechpartner", missingField/);
});

test("11 — Kundenliste warnt vor dem Freischalten und wertet den 409-Guard aus", () => {
  // Die Sperre liegt seit der UX-Bereinigung im Aktionsmodell der Zeile
  // (buildCustomerMenuModel) — inklusive sichtbarem Grund statt stummem Button.
  const viewSrc = readSrc("../utils/adminCustomerView.mjs").replace(/^\s*\/\/[^\n]*$/gm, "");
  assert.match(viewSrc, /isApprovalBlocked\(user\)/, "Freischalt-Aktion muss gesperrt werden können");
  assert.match(viewSrc, /const approveDisabled = self \|\| b2bReason !== "";/,
    "Sperre gilt nur für die Freischaltung …");
  assert.equal(/key: "block"[^}]*disabled: approveDisabled/.test(viewSrc), false,
    "… nie für das Blockieren");
  assert.match(usersListSrc, /409:/, "409 muss im Fehlerkatalog stehen");
  assert.match(usersListSrc, /r\.status === 409/, "konkrete Backend-Meldung muss gelesen werden");
  assert.match(usersListSrc, /missingB2B\?\.length > 0/, "Bestätigungsdialog weist auf fehlende Daten hin");
  assert.match(usersListSrc, /missingB2BAccountFields\(u\)/, "fehlende Felder werden für den Dialog gelesen");
  assert.match(usersListSrc, /Firmenname fehlt/);
  assert.match(usersListSrc, /Ansprechpartner fehlt/);
});

test("12 — kein automatischer Entzug einer bestehenden Freischaltung im Frontend", () => {
  // Das Frontend darf nirgends selbsttätig einen Status setzen; Statusziele
  // entstehen ausschließlich aus statusAction() nach einem Adminklick.
  const autoCalls = usersListSrc.match(/setAdminUserStatus\(/g) || [];
  assert.equal(autoCalls.length, 1, "genau ein Aufruf, im bestätigten Handler");
  assert.match(usersListSrc, /const target = key === "approve" \? "approved" : "blocked";/,
    "das Ziel entsteht ausschließlich aus der Menüauswahl des Admins");
  assert.match(usersListSrc, /const \{ id, target, status \} = confirm;/, "Ziel kommt aus der Bestätigung");
});

// ─── Quelltext-Contract: Texte ────────────────────────────────────────────────

test("13 — Datenschutzerklärung nennt Firmenname und Ansprechpartner als Pflichtfelder", () => {
  const section = privacySrc.slice(privacySrc.indexOf("4.1 Erfasste Daten"), privacySrc.indexOf("4.3 Speicherdauer"));
  const pflicht = section.slice(section.indexOf("Pflichtfelder"), section.indexOf("Optionale Felder"));
  assert.match(pflicht, /Firmenname/, "Firmenname muss als Pflichtfeld beschrieben sein");
  assert.match(pflicht, /Vor- und Nachname/, "Ansprechpartner muss als Pflichtfeld beschrieben sein");
  assert.match(pflicht, /geschäftliche E-Mail-Adresse/);
  assert.match(pflicht, /Passwort/);

  const optional = section.slice(section.indexOf("Optionale Felder"));
  assert.equal(/Firmenname/.test(optional), false, "Firmenname darf nicht mehr als optional gelten");
  assert.match(optional, /Umsatzsteuer-Identifikationsnummer/, "USt-ID bleibt optional");
});

test("14 — Datenschutzerklärung beschreibt die Plattform als reines B2B-Angebot", () => {
  const section = privacySrc.slice(privacySrc.indexOf("4.1 Erfasste Daten"), privacySrc.indexOf("4.3 Speicherdauer"));
  assert.match(section, /ausschließlich an Unternehmen und Geschäftskunden/);
  assert.match(section, /Firmenkonto/);
});

// Sammelt jeden Treffer samt Umgebung, damit erlaubte Ausnahmen gezielt und
// nachvollziehbar ausgenommen werden können (statt pauschal zu filtern).
function findTerms(src, pattern) {
  const re = new RegExp(pattern.source, "gi");
  const out = [];
  for (const m of src.matchAll(re)) {
    out.push(src.slice(Math.max(0, m.index - 80), m.index + m[0].length + 80));
  }
  return out;
}

const B2C_TERMS = [/Privatkunde/, /Privatperson/, /Verbraucher/, /\bB2C\b/];

test("15 — Adminsicht enthält kein Privatkunden-Wording", () => {
  for (const [label, src] of [["AdminUserDetail", userDetailSrc], ["AdminUsers", usersListSrc]]) {
    for (const term of B2C_TERMS) {
      const hits = findTerms(src, term);
      assert.deepEqual(hits, [], `${label}: unerwünschtes Wording ${term}`);
    }
  }
});

test("16 — Datenschutz §4 nennt Privatpersonen nur als ausdrücklichen Ausschluss", () => {
  const section = privacySrc.slice(privacySrc.indexOf("4.1 Erfasste Daten"), privacySrc.indexOf("4.3 Speicherdauer"));

  // Erlaubt ist genau eine Stelle: der Satz, der die Privatregistrierung ausschließt.
  const privatperson = findTerms(section, /Privatperson/);
  assert.equal(privatperson.length, 1, "genau eine Erwähnung von Privatperson erwartet");
  assert.match(privatperson[0], /nicht vorgesehen/, "die Erwähnung muss ein Ausschluss sein");

  // Alle übrigen B2C-Begriffe dürfen dort gar nicht auftauchen.
  for (const term of [/Privatkunde/, /Verbraucher/, /\bB2C\b/]) {
    assert.deepEqual(findTerms(section, term), [], `unerwünschtes Wording ${term}`);
  }
});

test("17 — der Wording-Check greift tatsächlich (Selbsttest der Prüflogik)", () => {
  const sample = "Ein Angebot fuer Privatkunden und Verbraucher.";
  assert.equal(findTerms(sample, /Privatkunde/).length, 1);
  assert.equal(findTerms(sample, /Verbraucher/).length, 1);
  assert.equal(findTerms(sample, /\bB2C\b/).length, 0);
});
