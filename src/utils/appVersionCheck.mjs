// ── Neue Version verfügbar? Reine Vergleichslogik ─────────────────────────────
//
// Nach einem Deployment trägt index.html einen neuen, gehashten Einstiegspunkt
// (/assets/index-<hash>.js). Eine lange geöffnete Sitzung — besonders ein
// installiertes App-Fenster ohne Neu-laden-Knopf — läuft sonst tagelang auf
// dem alten Stand. Verglichen wird deshalb der Einstiegspunkt der laufenden
// Seite mit dem der aktuell ausgelieferten index.html.
//
// Diese Datei entscheidet nur. Es wird NIE automatisch neu geladen: der Kunde
// sieht einen Hinweis und entscheidet selbst — laufende Eingaben dürfen nicht
// plötzlich verschwinden.

// Frühestens alle 15 Minuten prüfen (bei Fokus/Sichtbarkeit), zusätzlich alle
// 30 Minuten, solange die Seite sichtbar ist.
export const UPDATE_CHECK_MIN_INTERVAL_MS = 15 * 60 * 1000;
export const UPDATE_CHECK_PERIOD_MS = 30 * 60 * 1000;

const EINSTIEG = /^\/assets\/index-[A-Za-z0-9_-]+\.js$/;

/** Einstiegspunkt aus einem HTML-Text (die ausgelieferte index.html). */
export function extractEntryScript(html) {
  if (typeof html !== "string" || html.length === 0) return null;
  for (const tag of html.match(/<script\b[^>]*>/gi) || []) {
    if (!/\btype\s*=\s*"module"/i.test(tag)) continue;
    const src = tag.match(/\bsrc\s*=\s*"([^"]+)"/i);
    if (src && EINSTIEG.test(src[1])) return src[1];
  }
  return null;
}

/** Nur ein gehashter Einstiegspunkt ist vergleichbar. Im Entwicklungsserver
 *  gibt es keinen — dort bleibt die Prüfung aus. */
export function isComparableEntry(src) {
  return typeof src === "string" && EINSTIEG.test(src);
}

/** Ist eine andere Version ausgeliefert als die, die gerade läuft? */
export function hasNewerVersion(currentEntry, fetchedHtml) {
  if (!isComparableEntry(currentEntry)) return false;
  const neu = extractEntryScript(fetchedHtml);
  return neu !== null && neu !== currentEntry;
}

/** Im laufenden Versandvorgang wird kein Update-Hinweis gezeigt: dort hätte
 *  ein Neuladen die ungespeicherten Eingaben gekostet. */
export function updateNoticeSuppressed({ pathname = "", page = "" } = {}) {
  return pathname === "/booking" || page === "new";
}

// Hinweistexte der Shell. `navigator.onLine` dient ausschließlich diesem
// Hinweis — maßgeblich bleiben die Fehlerpfade der API-Aufrufe.
export const APP_NOTICE_TEXT = Object.freeze({
  offline: "Keine Internetverbindung. Aktuelle Preise und Buchungen sind erst wieder verfügbar, wenn die Verbindung besteht.",
  update: "Eine neue Version von ConfidaraExpress ist verfügbar.",
  reload: "Neu laden",
});
