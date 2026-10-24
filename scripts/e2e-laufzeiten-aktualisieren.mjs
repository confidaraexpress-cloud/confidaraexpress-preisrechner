#!/usr/bin/env node
/* Erneuert scripts/e2e-laufzeiten.json aus CI-Protokollen der Browser-E2E.
 *
 * Quelle sind die Zeilen, die scripts/run-e2e.mjs je Suite schreibt:
 *     E2E-Laufzeit tests/e2e/<datei> <sekunden> s · …
 * Protokolle holen (nur lesend):  gh run view <lauf-id> --log > lauf.log
 * Aufruf:                         node scripts/e2e-laufzeiten-aktualisieren.mjs lauf.log [weitere.log …]
 *
 * Mehrere Protokolle werden je Suite gemittelt. Suiten, die in keinem Protokoll vorkommen, behalten ihren
 * bisherigen Wert — die Datei beeinflusst nur die Balance der Teile, nie, welche Suiten laufen.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { suitenSchluessel } from "./e2eVerteilung.mjs";

const DATEI = path.join(path.dirname(fileURLToPath(import.meta.url)), "e2e-laufzeiten.json");
const protokolle = process.argv.slice(2);
if (protokolle.length === 0) {
  console.error("Aufruf: node scripts/e2e-laufzeiten-aktualisieren.mjs <protokoll> [weitere …]");
  process.exit(2);
}

const messungen = new Map();
for (const p of protokolle) {
  for (const zeile of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /E2E-Laufzeit (\S+\.test\.mjs) (\d+(?:\.\d+)?) s/.exec(zeile);
    if (!m) continue;
    const k = suitenSchluessel(m[1]);
    messungen.set(k, [...(messungen.get(k) || []), Number(m[2])]);
  }
}
if (messungen.size === 0) {
  console.error("Keine Zeile „E2E-Laufzeit …“ gefunden — ist es ein Protokoll der Browser-E2E?");
  process.exit(1);
}

const bisher = existsSync(DATEI) ? JSON.parse(readFileSync(DATEI, "utf8")) : { suiten: {} };
const suiten = { ...(bisher.suiten || {}) };
for (const [k, werte] of messungen) suiten[k] = Math.round((werte.reduce((a, b) => a + b, 0) / werte.length) * 10) / 10;

const sortiert = Object.fromEntries(Object.keys(suiten).sort().map((k) => [k, suiten[k]]));
writeFileSync(DATEI, JSON.stringify({
  hinweis: "Gemessene CI-Laufzeit je E2E-Suite in Sekunden; nur für die Verteilung auf Teile (scripts/e2eVerteilung.mjs).",
  stand: new Date().toISOString().slice(0, 10),
  suiten: sortiert,
}, null, 2) + "\n");
console.log(`${messungen.size} Suiten gemessen, ${Object.keys(sortiert).length} in ${path.relative(process.cwd(), DATEI)}.`);
