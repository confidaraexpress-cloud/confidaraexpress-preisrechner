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
