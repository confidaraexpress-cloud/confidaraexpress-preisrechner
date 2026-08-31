// ── Launch-Modus des Frontends ───────────────────────────────────────────────────────────────
//
// ConfidaraExpress startet ohne Zollprozess. Angeboten werden ausschließlich Sendungen
// innerhalb der EU; Drittlandversand, Proformarechnung, Handelsrechnung und EORI gibt es im
// Launch nicht.
//
// ─── Was dieser Schalter IST ─────────────────────────────────────────────────────────────────
// Eine Sichtbarkeitsentscheidung. Er blendet Oberflächen aus, die es im Launch nicht gibt.
//
// ─── Was er ausdrücklich NICHT ist ───────────────────────────────────────────────────────────
// Er ist KEINE Sicherheitsmaßnahme. Die Durchsetzung liegt vollständig serverseitig:
// `lib/launchRoutePolicy.js` sperrt jede nicht angebotene Route an fünf Providerpfaden, und
// `lib/customsMode.js` schaltet den Zollprozess ab. Wer diese Konstante auf `true` dreht,
// bekommt Formularfelder zurück — aber keine buchbare Drittlandsendung.
//
// Genau deshalb steht sie hier und nicht in einer Umgebungsvariable: sie ist eine
// Produktaussage im ausgelieferten Bundle, kein Betriebsschalter. Eine Vite-Variable
// (`import.meta.env.*`) hätte suggeriert, sich damit ließe der Launch-Modus verändern; er
// wird aber vom Server bestimmt, und die beiden auseinanderlaufen zu lassen wäre schlimmer
// als gar kein Schalter.
//
// ─── Für Customs V2 ──────────────────────────────────────────────────────────────────────────
// Diese Konstante auf `true` zu setzen genügt NICHT. Nötig sind zusätzlich serverseitig
// `CUSTOMS_ENABLED=true` UND die Aufnahme der Zielländer in `config/launchScope.js`. Die
// ausgeblendeten Komponenten sind vollständig erhalten und unverändert lauffähig — es wurde
// keine Zolldatei gelöscht, kein Feld entfernt und kein Zustand aufgegeben.
export const CUSTOMS_UI_ENABLED = false;
