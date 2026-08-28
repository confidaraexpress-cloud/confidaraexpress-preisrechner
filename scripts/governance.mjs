/* Hilfen für Governance-Tests: „läuft diese Testdatei tatsächlich mit?"
 *
 * Bis zum Härtungspaket führte `package.json` jede Testdatei einzeln auf, und
 * mehrere Governance-Tests prüften ihre Fortdauer über
 * `pkg.scripts.test.includes("…/meineDatei.test.mjs")`. Dieses Maß hatte zwei
 * Lücken, und beide sind eingetreten:
 *
 *   • Eine Datei EXISTIERTE, stand aber in keiner Liste — sie lief nie.
 *     (`src/utils/voucherUx.test.mjs`, 30 Prüfungen, und
 *      `tests/e2e/addressValidation.test.mjs`, 10 Browserprüfungen.)
 *   • Umgekehrt hätte ein Name in der Liste stehen können, ohne dass es die
 *     Datei noch gibt — dann bricht der ganze Lauf an einem fehlenden Pfad.
 *
 * Seit der Umstellung auf Auffindung gilt: WAS DA IST, LÄUFT. Das richtige Maß
 * ist deshalb nicht mehr „steht der Name im Skript", sondern die Konjunktion
 * aus beidem — das Skript sucht wirklich rekursiv, UND die Datei liegt im
 * durchsuchten Bereich. Genau das prüfen die beiden Funktionen hier.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function skripte() {
  return JSON.parse(readFileSync(path.join(WURZEL, "package.json"), "utf8")).scripts;
}

/** Wirft mit einer sprechenden Meldung, wenn `relPfad` nicht im Unit-Testlauf
 *  landet. `relPfad` ist projektrelativ, z. B. "src/styles/typography.test.mjs". */
export function pruefeImTestlauf(relPfad) {
  const s = skripte().test || "";
  if (!/node --test .*src\/\*\*\/\*\.test\.mjs/.test(s)) {
    throw new Error(
      `\`npm test\` sucht nicht mehr rekursiv in src/ (aktuell: ${s}). ` +
      "Ohne Auffindung kann eine neue Testdatei wieder unbemerkt liegen bleiben."
    );
  }
  if (!relPfad.startsWith("src/") || !relPfad.endsWith(".test.mjs")) {
    throw new Error(`${relPfad} liegt außerhalb des durchsuchten Bereichs (src/**/*.test.mjs)`);
  }
  if (!existsSync(path.join(WURZEL, relPfad))) {
    throw new Error(`${relPfad} existiert nicht — die Governance ist ersatzlos verschwunden`);
  }
  return true;
}

/** Dasselbe für den Browser-E2E-Lauf. Der läuft über scripts/run-e2e.mjs, das
 *  `tests/e2e/` vollständig aufsucht — es gibt dort keine Ausnahmeliste. */
export function pruefeImE2eLauf(relPfad) {
  const s = skripte()["test:e2e"] || "";
  if (!/scripts\/run-e2e\.mjs/.test(s)) {
    throw new Error(
      `\`npm run test:e2e\` läuft nicht mehr über die Auffindung (aktuell: ${s}).`
    );
  }
  if (!relPfad.startsWith("tests/e2e/") || !relPfad.endsWith(".test.mjs")) {
    throw new Error(`${relPfad} liegt außerhalb von tests/e2e/*.test.mjs`);
  }
  if (!existsSync(path.join(WURZEL, relPfad))) {
    throw new Error(`${relPfad} existiert nicht — die Browserprüfung ist ersatzlos verschwunden`);
  }
  return true;
}

/** Gegenprobe: die Datei darf es NICHT mehr geben. Ersetzt das frühere
 *  „steht nicht mehr im Skript" — unter Auffindung wäre das bedeutungslos,
 *  denn eine wieder angelegte Datei liefe automatisch mit. */
export function pruefeNichtVorhanden(relPfad) {
  if (existsSync(path.join(WURZEL, relPfad))) {
    throw new Error(`${relPfad} ist wieder da — unter Auffindung läuft sie damit auch wieder mit`);
  }
  return true;
}

/* ── Fail-closed Quelltext-Scans ──────────────────────────────────────────────
 *
 * Viele Governance-Tests prüfen Produktionsdateien als Text (readFileSync +
 * indexOf + slice). Dieses Muster hat zwei stille Fehlerzustände, beide belegt:
 * ein Anker, der die Datei verlässt (etwa weil Code in ein eigenes Modul
 * umzieht), liefert indexOf -1 — `slice(-1)` macht daraus einen leeren bzw.
 * falschen Ausschnitt, und jede „darf-nicht-enthalten"-Prüfung darauf wird
 * GRÜN, ohne irgendetwas zu prüfen. Die drei Helfer machen beide Fälle LAUT.
 * Vorbild ist schnitt() aus proformaSuccessDownload.test.mjs. */

/** Liest eine Quelldatei projektrelativ; eine fehlende Datei ist ein LAUTER
 *  Fehler, nie ein leerer Scan. */
export function leseQuelle(relPfad) {
  const voll = path.join(WURZEL, relPfad);
  if (!existsSync(voll)) {
    throw new Error(
      `Quelldatei fehlt: ${relPfad} — dieser Quelltext-Scan zeigt ins Leere. ` +
      "Wurde der Code verschoben, muss der Test auf die neue Datei zeigen."
    );
  }
  return readFileSync(voll, "utf8");
}

/** Position eines Ankers — -1 ist immer ein Testfehler. */
export function ankerPosition(quelle, anker, kontext) {
  const idx = quelle.indexOf(anker);
  if (idx === -1) {
    throw new Error(
      `Anker nicht gefunden${kontext ? ` (${kontext})` : ""}: „${String(anker).slice(0, 60)}…" — ` +
      "der Scan würde sonst still einen leeren/falschen Ausschnitt prüfen."
    );
  }
  return idx;
}

/** Ausschnitt zwischen zwei Ankern; der End-Anker wird NACH dem Start gesucht
 *  und muss existieren — der Ausschnitt darf nie still bis zum Dateiende
 *  wachsen. Ohne `bis` läuft der Ausschnitt ausdrücklich bis zum Dateiende. */
export function schnitt(quelle, von, bis, kontext) {
  const start = ankerPosition(quelle, von, kontext);
  if (bis === undefined) return quelle.slice(start);
  const ende = quelle.indexOf(bis, start + String(von).length);
  if (ende === -1) {
    throw new Error(
      `End-Anker nicht gefunden${kontext ? ` (${kontext})` : ""}: „${String(bis).slice(0, 60)}…"`
    );
  }
  return quelle.slice(start, ende);
}
