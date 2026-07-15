#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Deterministic builder:  src/utils/libaddressinput-raw.json
//                         →  src/utils/address-metadata.json
//
// Machine-derives the canonical postal-code metadata from the UNMODIFIED raw
// libaddressinput responses (no hand transcription). Identical logic + version to
// the backend builder (scripts/build-address-metadata.js). Derivation per country:
//
//   postalCodePattern  = Country.zip ?? null
//   postalCodeExample  = first(Country.zipex) ?? null
//   postalCodeRequired = (Country.require ?? ZZ.require).includes("Z")   ← ZZ fallback
//   postalCodeUppercase= (Country.upper   ?? ZZ.upper).includes("Z")
//
// Run:  node scripts/build-address-metadata.mjs
//       node scripts/build-address-metadata.mjs --check
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// MUST match the backend builder + the coverage tests' EXPECTED_VERSION in both repos.
const VERSION = "2026-07-15.2";

const RAW = path.join(__dirname, "..", "src", "utils", "libaddressinput-raw.json");
const OUT = path.join(__dirname, "..", "src", "utils", "address-metadata.json");

const PROVENANCE = {
  source: "Google libaddressinput (Chrome i18n address metadata) — zip/zipex/require/upper fields, verbatim",
  sourceUpstream: "https://chromium-i18n.appspot.com/ssl-address/data/{regionCode}",
  sourcePackage: "google-i18n-address==3.1.1 (PyPI), bundles the libaddressinput dataset under i18naddress/data/",
  sourcePackageWheelSha256: "f66f4fd2b75d1cd371fc0a7678a1d656da4aa3b32932279e78dd6cae776fc23d",
  retrievedAt: "2026-07-15",
  dataLicense: "Apache-2.0 (Google libaddressinput address data)",
  packageLicense: "BSD-3-Clause (google-i18n-address, Mirumee Software)",
  requireSemantics: "postalCodeRequired = (Country.require ?? ZZ.require='AC').includes('Z'); postalCodeUppercase likewise from `upper`.",
  limitation: "Format only. A pattern-valid code is NOT proven to exist, nor proven to match the entered city/street (e.g. FR + 63743 stays valid).",
  refresh: "node scripts/fetch-libaddressinput.mjs (needs network to the upstream endpoint), then re-run this builder + the coverage tests and review the country-rule diff.",
};

function build() {
  const rawText = fs.readFileSync(RAW, "utf8");
  const rawSnapshotSha256 = crypto.createHash("sha256").update(rawText).digest("hex");
  const raw = JSON.parse(rawText);
  const ZZ = raw.ZZ || {};
  const zzRequire = String(ZZ.require || "");
  const zzUpper = String(ZZ.upper || "");

  const codes = Object.keys(raw).filter((k) => k !== "ZZ");
  const errors = [];
  const countries = {};
  for (const cc of codes) {
    if (!/^[A-Z]{2}$/.test(cc)) { errors.push(`invalid ISO code: ${cc}`); continue; }
    const c = raw[cc] || {};
    const require = (c.require != null ? String(c.require) : zzRequire);
    const upper = (c.upper != null ? String(c.upper) : zzUpper);
    const pattern = c.zip != null ? String(c.zip) : null;
    const example = c.zipex != null ? String(c.zipex).split(",")[0].trim() : null;
    const required = require.includes("Z");
    const uppercase = upper.includes("Z");

    if (pattern != null) {
      let re;
      try { re = new RegExp("^(?:" + pattern + ")$", "i"); }
      catch (e) { errors.push(`${cc}: zip pattern does not compile: ${e.message}`); continue; }
      if (example != null) {
        const ex = uppercase ? example.toUpperCase() : example;
        if (!re.test(ex)) errors.push(`${cc}: zipex example "${example}" fails its own zip pattern`);
      }
    } else if (required) {
      errors.push(`${cc}: required (require contains Z) but no zip pattern`);
    }
    countries[cc] = {
      postalCodeRequired: required,
      postalCodePattern: pattern,
      postalCodeExample: example,
      postalCodeUppercase: uppercase,
    };
  }
  if (errors.length) {
    console.error("[build-address-metadata] raw-derivation FAILED:\n  - " + errors.join("\n  - "));
    process.exit(1);
  }

  const meta = {
    version: VERSION,
    generatedFrom: "libaddressinput-raw.json",
    rawSnapshotSha256,
    ...PROVENANCE,
    count: codes.length,
    countries,
  };
  return { body: JSON.stringify(meta, null, 2) + "\n", count: codes.length };
}

const checkOnly = process.argv.includes("--check");
const { body, count } = build();
if (checkOnly) {
  const existing = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (existing !== body) { console.error("[build-address-metadata] --check: address-metadata.json is STALE. Run the builder."); process.exit(1); }
  console.log(`[build-address-metadata] --check OK (${count} countries, version ${VERSION})`);
} else {
  fs.writeFileSync(OUT, body);
  console.log(`[build-address-metadata] wrote src/utils/address-metadata.json (${count} countries, version ${VERSION})`);
}
