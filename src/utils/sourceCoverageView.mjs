// ─────────────────────────────────────────────────────────────────────────────
// Quellenlage des Angebotsvergleichs — reine Anzeigelogik (Auftrag 2 / P5, Analysebefund C6).
//
// Der Server meldet seit Auftrag 2 in jeder Vergleichsantwort `sourceCoverage` in EINEM Wort:
//   complete     jede Einkaufsquelle hat geantwortet (auch mit null Angeboten)
//   partial      eine Quelle ist ausgefallen, eine andere hat geantwortet — die Liste ist
//                moeglicherweise unvollstaendig
//   unavailable  alle Quellen sind ausgefallen (der Server antwortet dann nicht mit 200)
// Der Kunde erfaehrt nie, WELCHE Quelle fehlt — White Label gilt auch hier. Eine Antwort ohne das
// Feld (aelterer Server) gilt als vollstaendig: es wird nichts behauptet, was der Server nicht sagt.
// ─────────────────────────────────────────────────────────────────────────────

export const SOURCE_COVERAGE = Object.freeze({ COMPLETE: "complete", PARTIAL: "partial", UNAVAILABLE: "unavailable" });

export const PARTIAL_COVERAGE_NOTICE =
  "Ein Teil der Angebote konnte gerade nicht abgerufen werden. Die Liste ist möglicherweise unvollständig – "
  + "eine erneute Berechnung in einigen Minuten kann weitere Angebote liefern.";

/** Das Wort des Servers, strikt gelesen — alles andere als die drei Werte ist `null`. */
export function readSourceCoverage(response) {
  const w = response && typeof response === "object" ? response.sourceCoverage : null;
  return typeof w === "string" && Object.values(SOURCE_COVERAGE).includes(w) ? w : null;
}

/**
 * Der Hinweis ueber der Angebotsliste — nur bei `partial`. Bei `complete`, einer fehlenden Angabe oder
 * einem unbekannten Wert gibt es nichts zu sagen (`null`).
 */
export function sourceCoverageNotice(response) {
  return readSourceCoverage(response) === SOURCE_COVERAGE.PARTIAL ? PARTIAL_COVERAGE_NOTICE : null;
}
