// Schritt 3 (2026-10-17): öffentliche Unternehmensangaben an einer Stelle; keine GbR, die es nicht gibt.
// Quelltextprüfung (wie die übrigen Vertragstests), damit die Prüfung ohne JSX-Laufzeit auskommt.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const lies = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("1 — Profil: freigegebene Darstellung, keine Rechtsform, die es nicht gibt, keine erfundenen Registerangaben", () => {
  const profil = ohneKommentare(lies("./companyProfile.js"));
  assert.match(profil, /formationStatus: "Gründung einer UG \(haftungsbeschränkt\) in Vorbereitung"/);
  assert.match(profil, /COMPANY_DISPLAY_NAME = `\$\{COMPANY_PROFILE\.brand\} – \$\{COMPANY_PROFILE\.formationStatus\}`/);
  assert.doesNotMatch(profil, /GbR|Gesellschafter|i\. ?G\.|HRB|Amtsgericht|Geschäftsführ/, "das Profil behauptet eine Rechtsform oder Registerangabe");
});

test("2 — Impressum: liest das Profil, nennt keine GbR und keine Gesellschafter", () => {
  const seite = ohneKommentare(lies("../pages/ImpressumPage.jsx"));
  assert.match(seite, /from "\.\.\/config\/companyProfile"/);
  assert.doesNotMatch(seite, /GbR|Gesellschafter|Gesellschaft ist/, "das Impressum nennt eine Gesellschaft, die es nicht gibt");
  for (const feld of ["CP.brand", "CP.formationStatus", "CP.operators", "CP.registerNote", "CP.vatIdNote", "CP.email", "CP.phone",
                      "CP.contactPerson", "CP.contentResponsible"]) {
    assert.ok(seite.includes(feld), `das Impressum liest ${feld} nicht aus dem Profil`);
  }
  // Keine zweite, hart codierte Fassung der Stammdaten in der Seite.
  assert.doesNotMatch(seite, /Weiherstraße|015118003775|Anna-Fischer-Weg|016092717124|Miguel Vance|support@confidaraexpress\.de/);
});

test("2b — Gesamtauftrag C (2026-10-24): neue Anschrift und Telefonnummer, Ansprechpartner, MStV mit einer Person", async () => {
  const { COMPANY_PROFILE } = await import("./companyProfile.js");
  assert.deepEqual({ ...COMPANY_PROFILE.address },
    { street: "Anna-Fischer-Weg 11", zip: "70794", city: "Filderstadt-Bernhausen", country: "Deutschland" });
  assert.equal(COMPANY_PROFILE.phone, "016092717124");
  assert.equal(COMPANY_PROFILE.contactPerson, "Miguel Vance");
  assert.equal(COMPANY_PROFILE.contentResponsible, "Miguel Vance");
  // Vor der Gründung bleiben beide Betreiber die Diensteanbieter — der zweite erscheint sonst nirgends.
  assert.deepEqual([...COMPANY_PROFILE.operators], ["Miguel Vance", "Patrick Werner"]);
  const seite = ohneKommentare(lies("../pages/ImpressumPage.jsx"));
  // Ansprechpartner nur in der Vorbereitungsdarstellung — mit freigegebenem Aussteller gelten dessen Angaben.
  assert.match(seite, /const ansprechpartner = profil \? null : CP\.contactPerson;/);
  assert.match(seite, /Ansprechpartner: \{ansprechpartner\}/);
  // Der MStV-Abschnitt nennt vor der Gründung genau eine Person, nicht beide Betreiber.
  const mstv = seite.slice(seite.indexOf("§ 18 Abs. 2 MStV"), seite.indexOf("Datenquellen und Lizenzhinweise"));
  assert.ok(mstv.includes("CP.contentResponsible") && !mstv.includes("CP.operators"), "MStV-Abschnitt");
  // Keine Bezeichnung als Geschäftsführer vor der Beurkundung — weder im Profil noch in der Vorbereitungsdarstellung.
  const vorbereitung = seite.slice(seite.indexOf(") : ("), seite.indexOf("Umsatzsteuer-Identifikationsnummer"));
  assert.doesNotMatch(vorbereitung, /Geschäftsführ/);
});

test("3 — veröffentlichte Rechtsfassungen bleiben wortgleich (keine rückwirkende Änderung)", () => {
  // AGB 2026-08 und Datenschutzerklärung 2026-07 sind die registrierten Fassungen; sie lesen das Profil bewusst nicht.
  for (const rel of ["../pages/AGBPage.jsx", "../pages/DatenschutzPage.jsx"]) {
    const s = lies(rel);
    assert.ok(!s.includes("companyProfile"), `${rel} darf die historische Fassung nicht aus dem Profil zusammensetzen`);
  }
});
