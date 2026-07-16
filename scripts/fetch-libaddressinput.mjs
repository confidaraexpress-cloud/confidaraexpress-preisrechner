#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// OFFICIAL REFRESH (the "Alternativ" path). Fetches the supported libaddressinput
// country responses (+ ZZ fallback) directly from the upstream endpoint and writes
// src/utils/libaddressinput-raw.json deterministically. NEEDS NETWORK to
// chromium-i18n.appspot.com — blocked by the Claude build env's egress policy, so
// run on a machine that permits it.
//
// The committed raw snapshot was obtained instead from the hash-pinned PyPI package
// google-i18n-address==3.1.1 (vendors this dataset). This script re-derives it
// straight from Google when network allows.
//
// After running: bump VERSION in scripts/build-address-metadata.mjs, run the builder
// + generator, review the diff, run `npm test`. Never imported at runtime.
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENDPOINT = "https://chromium-i18n.appspot.com/ssl-address/data/";
// ZZ (fallback) first, then the 74 supported destinations in countries.js order.
const CODES = ["ZZ",
  "DE","AT","CH","AL","BE","BA","BG","DK","EE","FI","FR","GR","GB","IE","IS","IT","XK","HR","LV","LI",
  "LT","LU","MT","MD","ME","NL","MK","NO","PL","PT","RO","RU","SE","RS","SK","SI","ES","CZ","TR","UA",
  "HU","BY","CY","AR","BR","CL","CA","CO","MX","US","AE","AU","CN","IN","ID","IL","JP","KZ","MY","NZ",
  "PH","SA","SG","KR","TW","TH","VN","HK","DZ","EG","KE","MA","NG","ZA"];
const OUT = path.join(__dirname, "..", "src", "utils", "libaddressinput-raw.json");

if (typeof fetch !== "function") { console.error("global fetch() unavailable — use Node >= 18"); process.exit(1); }
const raw = {};
for (const cc of CODES) {
  let res;
  try { res = await fetch(ENDPOINT + cc, { headers: { Accept: "application/json" } }); }
  catch (e) { console.error(`fetch ${cc} failed: ${e.message} (endpoint blocked? run on a networked machine)`); process.exit(1); }
  if (!res.ok) { console.error(`fetch ${cc} failed: HTTP ${res.status}`); process.exit(1); }
  raw[cc] = await res.json();
}
fs.writeFileSync(OUT, JSON.stringify(raw, null, 2) + "\n");
console.log(`[fetch-libaddressinput] wrote ${Object.keys(raw).length} responses to src/utils/libaddressinput-raw.json`);
