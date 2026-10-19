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
  for (const feld of ["CP.brand", "CP.formationStatus", "CP.operators", "CP.registerNote", "CP.vatIdNote", "CP.email", "CP.phone"]) {
    assert.ok(seite.includes(feld), `das Impressum liest ${feld} nicht aus dem Profil`);
  }
  // Keine zweite, hart codierte Fassung der Stammdaten in der Seite.
  assert.doesNotMatch(seite, /Weiherstraße|015118003775|support@confidaraexpress\.de/);
});

test("3 — veröffentlichte Rechtsfassungen bleiben wortgleich (keine rückwirkende Änderung)", () => {
  // AGB 2026-08 und Datenschutzerklärung 2026-07 sind die registrierten Fassungen; sie lesen das Profil bewusst nicht.
  for (const rel of ["../pages/AGBPage.jsx", "../pages/DatenschutzPage.jsx"]) {
    const s = lies(rel);
    assert.ok(!s.includes("companyProfile"), `${rel} darf die historische Fassung nicht aus dem Profil zusammensetzen`);
  }
});
