// Carrier-Logos in der Darstellung (P2, Betreiberentscheidung 2026-11-04): Die öffentliche Kundenbereich-Demo unter
// /demo zeigt keine Carrier-Logos — Carrier und Service stehen dort als lesbarer Text wie im öffentlichen
// Preisrechner, ohne Logokachel und ohne Paket-Zeichen. Der echte Kundenbereich zeigt seine Logos unverändert.
//
// Jede Fläche, die ein Carrier-Logo zeigen könnte, fragt HIER, was sie zeigt. Das Logo selbst löst weiter
// carrierMap.js auf; dieses Modul entscheidet nur, ob es erscheint. Bewusst getrennt von carrierMap.js: die Insel des
// Preisrechners importiert carrierMap.js und zieht kein Modul der Demo (publicCalculatorIsland.test.mjs).
//
// Die Demo schaltet sich vor dem ersten Rendern ein (demo/demoStart.mjs ist der erste Import von main.jsx) — schon
// das erste Bild einer Demo-Seite kommt deshalb ohne Logo aus, nichts blitzt kurz auf.
import { istDemo } from "../demo/demoModus.mjs";

const NUR_TEXT = Object.freeze({ logo: null, kachel: false });

/**
 * Was eine Fläche vom Carrier zeigt — aus dem Logo, das carrierMap.js aufgelöst hat (oder null):
 *   { logo, kachel: true }        echter Kundenbereich: das Logo bzw. ohne Logodatei das neutrale Paket-Zeichen in
 *                                 der Kachel (Flächen ohne Kachel lassen das Bild dann einfach weg)
 *   { logo: null, kachel: false } Demo: weder Logo noch Kachel, nur der Name als Text
 */
export function carrierLogoAnzeige(logo) {
  if (istDemo()) return NUR_TEXT;
  return { logo: logo || null, kachel: true };
}
