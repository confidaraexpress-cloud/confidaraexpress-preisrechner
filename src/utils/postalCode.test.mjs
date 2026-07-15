// Paket 1: länderspezifische Postleitzahl-Validierung + Metadaten-Abdeckung (Frontend).
// Läuft über Node's eingebauten Test-Runner:  node --test src/utils/postalCode.test.mjs  (bzw. `npm test`)
//
// FACHLICHE GRENZE: nur FORMAT. Ein formal gültiger Wert ist NICHT als existent oder
// als zum Ort/zur Straße passend bewiesen. FR + 63743 bleibt formal gültig.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  validatePostalCode, normalizePostalCode, isPostalCodeRequired, hasPostalCode,
  getPostalCodeRule, postalCodeExample, postalCodeInputMode, postalRulesVersion,
} from "./postalCode.mjs";
import { rules } from "./generated/postalCodeRules.mjs";
import { countries } from "./countries.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rawText  = fs.readFileSync(path.join(__dirname, "libaddressinput-raw.json"), "utf8");
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, "address-metadata.json"), "utf8"));

// Gemeinsame Versionskennung Frontend↔Backend (identischer Snapshot).
const EXPECTED_VERSION = "2026-07-15.2";

const ok  = (cc, v) => assert.equal(validatePostalCode(cc, v).valid, true,  `${cc} ${JSON.stringify(v)} sollte gültig sein`);
const bad = (cc, v, code) => {
  const r = validatePostalCode(cc, v);
  assert.equal(r.valid, false, `${cc} ${JSON.stringify(v)} sollte ungültig sein`);
  if (code) assert.equal(r.code, code);
};

// ── Formatmatrix (Phase 16) ──────────────────────────────────────────────────
test("China: 100096 gültig; 5/7 Ziffern + Buchstabe ungültig; führende Null bleibt String", () => {
  ok("CN", "100096"); bad("CN", "10009"); bad("CN", "1000967"); bad("CN", "A00096");
  assert.equal(validatePostalCode("CN", "010096").normalizedValue, "010096");
});
test("Deutschland: 63743 gültig; 4/6 Ziffern + Buchstaben ungültig", () => {
  ok("DE", "63743"); bad("DE", "6374"); bad("DE", "637430"); bad("DE", "6374A");
});
test("Frankreich: 63743 bleibt formal gültig (NICHT wegen FR ungültig)", () => {
  ok("FR", "33380"); ok("FR", "63743"); bad("FR", "6374"); bad("FR", "637430"); bad("FR", "ABCDE");
});
test("Großbritannien: Formate + Groß-/Kleinschreibung + Leerzeichennormalisierung", () => {
  for (const v of ["SW1A 1AA", "M1 1AE", "B33 8TH", "CR2 6XH", "DN55 1PT"]) ok("GB", v);
  ok("GB", "sw1a 1aa");
  assert.equal(validatePostalCode("GB", " sw1a  1aa ").normalizedValue, "SW1A 1AA");
  bad("GB", "1AA");
});
test("Kanada: alphanumerisch, Normalisierung, ungültige Buchstaben", () => {
  ok("CA", "K1A 0B1");
  assert.equal(validatePostalCode("CA", "k1a0b1").normalizedValue, "K1A0B1");
  bad("CA", "D1A 0B1");
});
test("USA: ZIP und ZIP+4; falsche Länge", () => {
  ok("US", "95014"); ok("US", "95014-1234"); bad("US", "9501"); bad("US", "950140");
});
test("Niederlande: 4 Ziffern + 2 Buchstaben; case-insensitiv gültig; falsche Länge", () => {
  ok("NL", "1071 DK"); ok("NL", "1071dk"); // case-insensitiv gültig
  // libaddressinput NL trägt kein upper=Z → keine Uppercase-Normalisierung (Quelle faithful):
  assert.equal(validatePostalCode("NL", "1071dk").normalizedValue, "1071dk");
  bad("NL", "107 DK"); bad("NL", "1071 D");
});
test("Pflichtland leer → POSTAL_CODE_REQUIRED; kein-PLZ-Land leer → gültig", () => {
  bad("DE", "", "POSTAL_CODE_REQUIRED");
  ok("AE", ""); ok("HK", "");
  assert.equal(isPostalCodeRequired("DE"), true);
  assert.equal(isPostalCodeRequired("AE"), false);
});
test("Normalisierung fügt nie Ziffern hinzu (CN 10096 bleibt 10096 → ungültig, nicht aufgefüllt)", () => {
  assert.equal(normalizePostalCode("CN", "10096"), "10096");
  bad("CN", "10096");
});

// ── UI-Guidance-Helfer ───────────────────────────────────────────────────────
test("postalCodeExample/inputMode/hasPostalCode liefern sinnvolle Werte", () => {
  assert.equal(postalCodeExample("CN"), "266033"); // libaddressinput zipex[0] für CN
  assert.equal(postalCodeInputMode("DE"), "numeric"); // reine Ziffern
  assert.equal(postalCodeInputMode("GB"), "text");    // alphanumerisch
  assert.equal(hasPostalCode("DE"), true);
  assert.equal(hasPostalCode("AE"), false);           // kein PLZ-System → Feld optional/ausblendbar
});

// ── Abdeckung / Integrität (Phase 15) ────────────────────────────────────────
test("Version identisch zu Snapshot UND zur gemeinsamen Frontend/Backend-Kennung", () => {
  assert.equal(postalRulesVersion, EXPECTED_VERSION);
  assert.equal(snapshot.version, EXPECTED_VERSION);
});
test("Jeder im Frontend auswählbare ISO-Code (countries.js) besitzt eine Regel", () => {
  for (const c of countries) assert.ok(rules[c.code], `Regel fehlt für auswählbares Land ${c.code}`);
});
test("Jede Regel besitzt einen gültigen ISO-Code, der auch auswählbar ist (kein Waise)", () => {
  const selectable = new Set(countries.map(c => c.code));
  for (const cc of Object.keys(rules)) {
    assert.ok(/^[A-Z]{2}$/.test(cc), `ungültiger ISO-Code: ${cc}`);
    assert.ok(selectable.has(cc), `Regel-Land ${cc} ist nicht im Frontend auswählbar`);
  }
  // Exakte Deckungsgleichheit (keine fehlende/überzählige Regel).
  assert.equal(Object.keys(rules).length, selectable.size);
});
test("Keine doppelten Ländercodes in countries.js", () => {
  const codes = countries.map(c => c.code);
  assert.equal(new Set(codes).size, codes.length);
});
test("Jedes Muster kompiliert (verankert) und das Beispiel besteht die eigene Regel", () => {
  for (const [cc, r] of Object.entries(rules)) {
    if (r.pattern == null) continue;
    const re = new RegExp("^(?:" + r.pattern + ")$", "i");
    if (r.example != null) {
      const ex = r.uppercase ? String(r.example).toUpperCase() : String(r.example);
      assert.ok(re.test(ex), `${cc}: Beispiel "${r.example}" besteht die eigene Regel nicht`);
      assert.equal(validatePostalCode(cc, r.example).valid, true);
    }
  }
});
test("Länder ohne PLZ-System ausdrücklich modelliert (pattern=null ⇒ required=false)", () => {
  let nulls = 0;
  for (const [cc, r] of Object.entries(rules)) {
    if (r.pattern == null) { nulls++; assert.equal(r.required, false, `${cc}: null-Muster aber required`); }
  }
  assert.ok(nulls >= 1);
});
test("Keine Regel fällt auf eine generische Global-Regex zurück", () => {
  for (const [cc, v] of [["DE", "12"], ["CN", "12"], ["FR", "12"], ["US", "12"]]) {
    assert.equal(validatePostalCode(cc, v).valid, false, `${cc} ${v} dürfte nicht generisch akzeptiert werden`);
  }
  assert.equal(getPostalCodeRule("ZZ"), null); // unbekanntes Land → keine erfundene Regel
});

test("Metadaten deterministisch aus dem Roh-Snapshot (rawSnapshotSha256 = SHA-256 der Rohdatei)", () => {
  const actual = crypto.createHash("sha256").update(rawText).digest("hex");
  assert.equal(snapshot.rawSnapshotSha256, actual);
  assert.equal(snapshot.generatedFrom, "libaddressinput-raw.json");
});

test("ZZ-require-Fallback + korrigierte Länder (maschinell, keine Handannahme)", () => {
  const raw = JSON.parse(rawText);
  assert.equal(raw.ZZ.require, "AC"); // Default: keine Pflicht-PLZ
  assert.equal(rules.AL.pattern, "\\d{4}"); assert.equal(rules.AL.required, false);
  assert.equal(rules.IE.pattern, "[\\dA-Z]{3} ?[\\dA-Z]{4}"); assert.equal(rules.IE.example, "A65 F4E2");
  assert.equal(rules.XK.pattern, "[1-7]\\d{4}");
  assert.equal(rules.AE.pattern, null); assert.equal(rules.HK.pattern, null); // nur diese ohne PLZ-System
  assert.equal(rules.DE.required, true); assert.equal(rules.XK.required, false);
});
