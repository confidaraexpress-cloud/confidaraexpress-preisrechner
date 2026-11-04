// ── Demo-Hinweis des öffentlichen Preisrechners (P2, Betreiberentscheidung 2026-11-04) ─────────────────────────
// Beim ersten Öffnen fragt ein Dialog „Möchten Sie zuerst den Kundenbereich ansehen?“: „Demo ansehen“ öffnet die
// interaktive Demo der Hauptdomain, „Zum Preisrechner“ schließt ihn (DemoHinweisDialog.jsx). Gefragt wird einmal je
// Tab-Sitzung: die Entscheidung merkt sich sessionStorage, Reload und Zurück-Taste fragen nicht erneut, ein neuer,
// unabhängiger Tab fragt wieder. Wer aus der Demo zurückkommt, trägt ?von=demo (Demo-Leiste, demo/demoModus.mjs)
// und wird nicht gefragt.
//
// Bewusste Ausnahme der Insel-Regel „kein Storage“ (publicCalculatorIsland.test.mjs): genau diese Datei, genau ein
// Schlüssel, nur ein Merker ohne Daten. Lesen und Schreiben stehen im try/catch — sperrt der Browser den Speicher,
// gilt ein Merker im Speicher der Seite. Ohne DOM prüfbar (demoHinweis.test.mjs).

/** Der eine Schlüssel im sessionStorage: „1“ = in diesem Tab entschieden. */
export const DEMO_HINWEIS_SCHLUESSEL = "ce-preisrechner-demo-hinweis";

/** Die Demo — dieselbe Adresse wie „Demo ansehen“ im Kopf und die Kundenbereich-Vorschau (preisrechner/index.html). */
export const DEMO_URL = "https://confidaraexpress.de/demo";

/** Der Parameter, den die Demo an ihren Rückweg zum Preisrechner hängt. */
export const HERKUNFT_DEMO = Object.freeze({ name: "von", wert: "demo" });

export const DEMO_HINWEIS_TEXTE = Object.freeze({
  titel: "Möchten Sie zuerst den Kundenbereich ansehen?",
  text: "Die Demo zeigt Buchung, Sendungsverfolgung, Rechnungen, Lager und Aufträge mit Beispieldaten.",
  zusatz: "Sie öffnet sich ohne Anmeldung — nichts wird gebucht.",
  demo: "Demo ansehen",
  rechner: "Zum Preisrechner",
});

/** Kommt dieser Aufruf aus der Demo (?von=demo)? */
export function kommtAusDemo(search) {
  try {
    return new URLSearchParams(typeof search === "string" ? search : "").get(HERKUNFT_DEMO.name) === HERKUNFT_DEMO.wert;
  } catch {
    return false;
  }
}

/**
 * Dieselbe Adresse ohne den Herkunftsparameter — Pfad, übrige Parameter und Anker bleiben (für history.replaceState).
 * Absolut und damit immer auf dieser Seite: ein relativer Pfad wie „//“ (aus „…de//?von=demo“, das nginx ausliefert)
 * wäre eine Adresse ohne Host, und replaceState würfe. null, wenn es nichts zu entfernen gibt oder die Adresse
 * unlesbar ist.
 */
export function adresseOhneHerkunft(href) {
  let url;
  try { url = new URL(href); } catch { return null; }
  if (!url.searchParams.has(HERKUNFT_DEMO.name)) return null;
  url.searchParams.delete(HERKUNFT_DEMO.name);
  return url.href;
}

/** Erscheint der Hinweis? Nur, solange in diesem Tab nicht entschieden ist und der Besuch nicht aus der Demo kommt. */
export function demoHinweisZeigen({ entschieden, ausDemo }) {
  return entschieden !== true && ausDemo !== true;
}

/**
 * Der Merker dieser Tab-Sitzung. `speicher` liefert sessionStorage — oder wirft, wenn der Browser ihn sperrt; dann
 * merkt sich die Seite die Entscheidung bis zum nächsten Laden selbst.
 */
export function demoHinweisMerker(speicher = () => window.sessionStorage) {
  let gemerkt = false;
  return {
    entschieden() {
      if (gemerkt) return true;
      try { return speicher().getItem(DEMO_HINWEIS_SCHLUESSEL) === "1"; } catch { return false; }
    },
    merken() {
      gemerkt = true;
      try { speicher().setItem(DEMO_HINWEIS_SCHLUESSEL, "1"); } catch { /* ohne Speicher: der Merker der Seite */ }
    },
  };
}
