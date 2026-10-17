// Auftrag 2 / P4 (2026-10-17): belegte Transglobal-Grenzen in den Angebotsdetails.
// Der Server liefert Tarifgrenzen (`tariffLimits`) und Verpackungsregeln (`packageRules`) als Codes und Zahlen; hier
// entstehen die Sätze. Beleg und Durchsetzung: Backend `docs/transglobal/servicegrenzen.md`, `tests/tg-service-limits.test.js`.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readPackageRules, packageRulesLines, PACKAGE_RULES_TEXT } from "./packageRulesView.mjs";
import { serviceDetailsView, SERVICE_DETAILS_TEXT, SERVICE_NOT_ACCEPTED_TEXT } from "./serviceDetailsView.mjs";

const karte = readFileSync(new URL("../components/offers/OfferCard.jsx", import.meta.url), "utf8");
const profilKomponente = readFileSync(new URL("../components/offers/ServiceProfileDetails.jsx", import.meta.url), "utf8");

const DPD = { notAccepted: ["pallets", "wooden_crates", "suitcases", "mailer_bags", "padded_envelopes"], handlingAidFromKg: null };
const GRENZEN_22 = [
  { operant: "packages_count", operator: "<=", value: 1 }, { operant: "weight", operator: "<=", value: 70 },
  { operant: "first_length", operator: "<=", value: 270 }, { operant: "length_and_girth", operator: "<=", value: 400 },
];

test("1 — Verpackungsregeln: nicht zugelassene Verpackungen und Ladehilfe als Sätze, in fester Reihenfolge", () => {
  assert.deepEqual(packageRulesLines({ packageRules: DPD }).map((z) => z.text),
    ["Nicht zugelassen: Paletten, Holzkisten, Koffer, Versandtaschen, Luftpolsterumschläge."]);
  assert.deepEqual(packageRulesLines({ packageRules: { notAccepted: [], handlingAidFromKg: 30 } }).map((z) => z.text),
    ["Packstücke ab 30 kg müssen auf einer Ladehilfe stehen, etwa einer Palette oder einem rollbaren Untersatz."]);
  assert.equal(PACKAGE_RULES_TEXT.handlingAid("31,5").includes("31,5 kg"), true);
  assert.deepEqual(packageRulesLines({ packageRules: { notAccepted: ["pallets"], handlingAidFromKg: 30 } }).map((z) => z.key),
    ["packageRules-notAccepted", "packageRules-handlingAid"]);
});

test("2 — fail closed: ein unbekannter Code oder eine fremde Form ergibt keine Zeile, nie einen Rohcode", () => {
  for (const kaputt of [
    null, undefined, "pallets", [], { notAccepted: ["parcels"], handlingAidFromKg: null },
    { notAccepted: ["pallets", "pallets"], handlingAidFromKg: null }, { notAccepted: [], handlingAidFromKg: null },
    { notAccepted: [], handlingAidFromKg: 0 }, { notAccepted: [], handlingAidFromKg: "30" },
    { notAccepted: ["__proto__"], handlingAidFromKg: null }, { notAccepted: "pallets", handlingAidFromKg: null },
  ]) {
    assert.equal(readPackageRules({ packageRules: kaputt }), null, JSON.stringify(kaputt));
    assert.deepEqual(packageRulesLines({ packageRules: kaputt }), []);
  }
  assert.equal(readPackageRules(null), null);
});

test("3 — jeder Code des Servers hat einen deutschen Text", () => {
  assert.deepEqual(Object.keys(SERVICE_NOT_ACCEPTED_TEXT), ["pallets", "suitcases", "wooden_crates", "mailer_bags", "padded_envelopes"]);
  for (const text of Object.values(SERVICE_NOT_ACCEPTED_TEXT)) assert.match(text, /^[A-ZÄÖÜ][a-zäöüß]+$/);
});

test("4 — Karte ohne Profil: das Gurtmaß nennt die Formel; die Verpackungsregeln stehen unter „Einschränkungen\"", () => {
  assert.match(karte, /length_and_girth: +\{ order: 3, tpl: \(op, v\) => `Das Gurtmaß eines Packstücks \(längste Seite \+ 2 × Breite \+ 2 × Höhe\) darf \$\{op\} \$\{v\} cm betragen\.` \}/);
  assert.match(karte, /const limitLines = \[\.\.\.buildLimitLines\(t\.tariffLimits\), \.\.\.packageRulesLines\(t\)\];/);
  // `girth` (ohne belegte Formel, JUMiNGO) bleibt unverändert.
  assert.match(karte, /girth: +\{ order: 3, tpl: \(op, v\) => `Das Gurtmaß eines Packstücks darf \$\{op\} \$\{v\} cm betragen\.` \}/);
});

test("5 — Karte mit Profil (22, 29): längste Seite und Gurtmaß in „Größe & Gewicht\", mit Formelhinweis", () => {
  const tarif = {
    serviceDetails: { summaryKey: "economy_standard", volumetricDivisor: 5000, notAccepted: ["pallets", "suitcases"],
                      basicCoverMaxGoodsValue: null, maxCoverValue: null },
    tariffLimits: GRENZEN_22,
  };
  const v = serviceDetailsView(tarif);
  assert.ok(v, "kein Profil");
  assert.deepEqual(v.size.rows.map((z) => [z.label, z.value]), [
    ["Packstücke", "1 je Sendung"], ["Max. Gewicht", "70 kg"], ["Max. längste Seite", "270 cm"], ["Max. Gurtmaß", "400 cm"],
  ]);
  assert.equal(v.size.girthNote, SERVICE_DETAILS_TEXT.lengthAndGirthNote);
  assert.equal(SERVICE_DETAILS_TEXT.lengthAndGirthNote, "Gurtmaß = längste Seite + 2 × Breite + 2 × Höhe.");
  assert.match(profilKomponente, /size\.girthNote && <p className="offer-profile-note" data-profile-note="girth">\{size\.girthNote\}<\/p>/);
  // Ohne Maßgrenze kein Hinweis und keine Zeile — es wird nichts ergänzt.
  const ohne = serviceDetailsView({ ...tarif, tariffLimits: GRENZEN_22.slice(0, 2) });
  assert.equal("girthNote" in ohne.size, false);
  assert.ok(!ohne.size.rows.some((z) => z.id === "maxLongestSide" || z.id === "maxLengthAndGirth"));
});
