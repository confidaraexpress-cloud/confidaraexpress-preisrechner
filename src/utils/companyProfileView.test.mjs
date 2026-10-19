// Schritt 3 (2026-10-19): das Impressum liest die Anbieterangaben aus GET /api/legal/company-profile — fail closed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readCompanyProfile, companyNameLine, countryName } from "./companyProfileView.mjs";

const PROFIL = {
  name: "ConfidaraExpress UG (haftungsbeschränkt)", legalForm: "UG (haftungsbeschränkt)", street: "Weiherstraße 25",
  postalCode: "73207", city: "Plochingen", country: "DE", email: "kontakt@example.com", phone: null,
  managingDirectors: "Erika Echt", registerCourt: "Amtsgericht Stuttgart", registerNumber: "HRB 999999", vatId: null,
};

test("1 — nur ein freigegebener Aussteller mit allen Pflichtangaben wird gelesen", () => {
  const p = readCompanyProfile({ status: "issuer", profile: PROFIL });
  assert.equal(p.name, PROFIL.name);
  assert.equal(p.vatId, null);
  for (const kaputt of [
    null, undefined, "issuer", {}, { status: "pre_formation" }, { status: "issuer" }, { status: "issuer", profile: [] },
    { status: "issuer", profile: { ...PROFIL, name: " " } }, { status: "issuer", profile: { ...PROFIL, street: null } },
    { status: "issuer", profile: { ...PROFIL, email: 5 } },
    // Halbe Registerangabe ist keine.
    { status: "issuer", profile: { ...PROFIL, registerNumber: null } },
  ]) assert.equal(readCompanyProfile(kaputt), null, JSON.stringify(kaputt));
});

test("2 — Firmenzeile und Land: keine doppelte Rechtsform, ISO-Code ausgeschrieben", () => {
  assert.equal(companyNameLine(readCompanyProfile({ status: "issuer", profile: PROFIL })), "ConfidaraExpress UG (haftungsbeschränkt)");
  assert.equal(companyNameLine({ name: "ConfidaraExpress", legalForm: "UG (haftungsbeschränkt)" }), "ConfidaraExpress (UG (haftungsbeschränkt))");
  assert.equal(countryName("DE"), "Deutschland");
  assert.equal(countryName("AT"), "AT");
  assert.equal(countryName(null), "Deutschland");
});

test("3 — die Seite zeigt Firmenangaben nur über readCompanyProfile; sonst die Vorbereitungsdarstellung", () => {
  const seite = readFileSync(new URL("../pages/ImpressumPage.jsx", import.meta.url), "utf8");
  assert.match(seite, /setProfil\(readCompanyProfile\(json\)\)/);
  assert.match(seite, /getCompanyProfile\(\{ signal: ctrl\.signal \}\)/);
  assert.match(seite, /data-company-source="pre_formation"/);
  assert.match(seite, /\{CP\.formationStatus\}\./);
});
