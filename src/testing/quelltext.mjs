// Fail-closed Quelltextzugriff für die Governance-Tests des Frontends.
//
// ─── Warum es diese Datei gibt ───────────────────────────────────────────────
// 31 Prüfdateien trugen bis hierher eine eigene, wörtlich kopierte `lies()`-
// Funktion, und 27 davon lesen `pages/BookingPage.jsx` an einer festen Position.
// Zwei Folgen, beide gemessen:
//
//   1. FAIL-OPEN. Wer einen Ausschnitt über `quelle.indexOf(ANKER)` bildet und
//      der Anker fehlt, bekommt bei -1 einen LEEREN Ausschnitt — und jedes
//      `assert.ok(!ausschnitt.includes("VERBOTEN"))` besteht dann grundlos. Der
//      Test misst nichts mehr und sagt es nicht.
//   2. POSITIONSBINDUNG. Sobald ein Buchungsblock in eine eigene Komponente
//      wandert, findet der Scan ihn nicht mehr — obwohl der Code nur umgezogen
//      ist. Die Prüfung meldet dann „Feld X fehlt" statt „Feld X ist woanders".
//
// Beide Fehlerklassen sind im Backend belegt und dort mit demselben Muster
// geschlossen worden (tests/helpers/sourceText.js). Diese Datei ist ihr
// Gegenstück fürs Frontend.
//
// ─── Die Regel ───────────────────────────────────────────────────────────────
// Ein fehlender Anker ist ein LAUTER Fehler, nie ein leerer Ausschnitt. Eine
// Fläche wird GESUCHT, nicht an einer Dateiposition vorausgesetzt.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

const HIER = path.dirname(fileURLToPath(import.meta.url));
/** Projektwurzel — von src/testing/ aus zwei Ebenen hoch. */
export const WURZEL = path.resolve(HIER, "..", "..");

/** Liest eine Quelldatei relativ zur Projektwurzel. Fehlt sie, wirft es. */
export function lies(rel) {
  const voll = path.join(WURZEL, rel);
  assert.ok(existsSync(voll), `Quelldatei nicht gefunden: ${rel} — ein leerer Scan würde still bestehen.`);
  return readFileSync(voll, "utf8");
}

/** Position eines Ankers — wirft, statt -1 zu liefern. */
export function ankerPosition(quelle, anker, kontext) {
  const i = quelle.indexOf(anker);
  assert.ok(
    i !== -1,
    `Anker nicht gefunden${kontext ? ` (${kontext})` : ""}: „${anker}". ` +
      "Ein roher indexOf lieferte hier -1 und der Ausschnitt wäre leer — jede negative " +
      "Zusage darauf bestünde grundlos."
  );
  return i;
}

/** Ausschnitt zwischen zwei Ankern. Beide müssen existieren, sonst wirft es. */
export function schneideZwischen(quelle, von, bis, kontext) {
  const a = ankerPosition(quelle, von, kontext);
  const b = ankerPosition(quelle, bis, kontext);
  assert.ok(
    b > a,
    `Ankerreihenfolge vertauscht${kontext ? ` (${kontext})` : ""}: „${bis}" steht vor „${von}".`
  );
  return quelle.slice(a, b);
}

/** Ausschnitt ab einem Anker bis zum Dateiende. */
export function schneideAb(quelle, von, kontext) {
  return quelle.slice(ankerPosition(quelle, von, kontext));
}

// ─── Die Buchungsfläche ──────────────────────────────────────────────────────
// Der Buchungsablauf ist keine DATEI, sondern eine FLÄCHE: die Seite plus die
// bereits ausgelagerten Buchungsbausteine. Wer sie liest, misst weiter, wenn ein
// Block in eine eigene Komponente wandert — genau das soll möglich werden.
export const BUCHUNGSSEITE = "src/pages/BookingPage.jsx";
const BUCHUNGSKOMPONENTEN = "src/components/booking";

/** Alle Buchungskomponenten in fester, alphabetischer Ordnung. */
export function buchungsKomponenten() {
  const dir = path.join(WURZEL, BUCHUNGSKOMPONENTEN);
  assert.ok(existsSync(dir), `${BUCHUNGSKOMPONENTEN}/ fehlt — die Buchungsfläche wäre unvollständig.`);
  const dateien = readdirSync(dir).filter((n) => n.endsWith(".jsx")).sort();
  assert.ok(dateien.length >= 1, `${BUCHUNGSKOMPONENTEN}/ ist leer — der Scan wäre wertlos.`);
  return dateien.map((n) => path.posix.join(BUCHUNGSKOMPONENTEN, n));
}

/** Nur die Seite. Für Aussagen über die Seite selbst (Reihenfolge, Aufrufstellen). */
export function buchungsSeite() {
  return lies(BUCHUNGSSEITE);
}

/**
 * Seite PLUS Buchungskomponenten. Für Aussagen über den Buchungsablauf als
 * Ganzes — insbesondere für NEGATIVE Zusagen („nirgends im Buchungspfad steht
 * X"), die sonst still grün würden, sobald X in eine Komponente umzieht.
 *
 * Die Seite steht ZUERST: Aussagen über Reihenfolge innerhalb der Seite bleiben
 * damit gültig. Eine Reihenfolgeaussage über die GRENZE Seite↔Komponente hinweg
 * ist dagegen keine mehr — sie gehört an die Aufrufstelle in der Seite.
 */
export function buchungsFlaeche() {
  return [buchungsSeite(), ...buchungsKomponenten().map(lies)].join("\n");
}
