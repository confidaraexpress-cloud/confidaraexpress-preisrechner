// Öffentliche Kundenbereich-Demo (Premium-Redesign, Betreiberentscheidung 2026-10-27): Erkennung und Zustand.
//
// Die Demo läuft unter /demo der Hauptdomain in einer eigenen Seitenladung („Demo-Welt"): main.jsx erkennt den Pfad
// VOR dem ersten Rendern, schirmt Speicher und Netz ab (demoStart.mjs) und rendert die echten Kundenseiten mit
// Beispieldaten aus dem Browser (demoBackend.mjs). Es gibt keinen Weg von der Demo zum Server: keine Anmeldung, keine
// Daten, keine Buchung, keine Provideraktion. Wer die Demo verlässt, lädt die Seite neu — die Demo-Welt endet damit.

/** Grundpfad der Demo. */
export const DEMO_BASIS = "/demo";

/**
 * Liegt dieser Pfad in der Demo? Nur „/demo“ und „/demo/…“, nie „/demonstration“ — ohne Rücksicht auf Groß- und
 * Kleinschreibung, wie die Route der Anwendung (sonst lüde „/DEMO“ dort endlos neu).
 */
export function istDemoPfad(pathname) {
  const p = typeof pathname === "string" ? pathname.toLowerCase() : "";
  return p === DEMO_BASIS || p.startsWith(`${DEMO_BASIS}/`);
}

let aktiv = false;

/** Schaltet die Demo-Welt für diese Seitenladung ein (nur demoStart.mjs). */
export function demoEinschalten() {
  aktiv = true;
}

/** Läuft diese Seitenladung als Demo? */
export function istDemo() {
  return aktiv;
}

// Führende Schrägstriche und Rückstriche (der Rückstrich als Zeichencode 92, ohne Escape im Quelltext).
const FUEHRENDE_STRICHE = new RegExp(`^[/${String.fromCharCode(92)}${String.fromCharCode(92)}]+`);

/**
 * Wohin ein Weg aus der Demo führt: immer ein Pfad derselben Seite. Führende Schrägstriche (auch Rückstriche) werden
 * zu genau einem — „/demo//fremd.example“ wird so nie zu einer protokollrelativen Adresse auf einen fremden Host.
 */
export function demoAusgangsziel(pathname, search = "", hash = "", herkunft = "https://confidaraexpress.de") {
  let ziel;
  let basis;
  try {
    basis = new URL(herkunft);
    ziel = new URL(`/${String(pathname || "").replace(FUEHRENDE_STRICHE, "")}${search || ""}${hash || ""}`, basis.origin);
  } catch {
    return "/";
  }
  return ziel.origin === basis.origin ? `${ziel.pathname}${ziel.search}${ziel.hash}` : "/";
}

/** Wohin die Aktionen der Demo-Leiste führen (Hauptdomain bzw. öffentlicher Preisrechner). */
export const DEMO_ZIELE = Object.freeze({
  registrieren: "/register",
  preisrechner: "https://preisrechner.confidaraexpress.de/",
});

/** Die Texte der Demo an einer Stelle. */
export const DEMO_TEXTE = Object.freeze({
  leiste: "Demo mit Beispieldaten",
  leisteZusatz: "Alles ist simuliert: keine echte Buchung, keine Kosten, keine Verbindung zu Versanddienstleistern.",
  registrieren: "Geschäftskonto registrieren",
  beenden: "Demo beenden",
  buchungMarke: "Simulation",
  buchungTitel: "Simulierte Buchung abgeschlossen",
  buchungSimuliert: "Simulation: Diese Buchung wurde nicht beauftragt. Es entstehen keine Kosten, kein Versanddienstleister wurde kontaktiert und keine E-Mail versendet. Label und Belege sind Beispieldokumente.",
  keineEmail: "In der Demo wird keine E-Mail versendet. Die Auftragsbestätigung (Beispiel) laden Sie oben herunter.",
  nichtVerfuegbar: "In der Demo nicht verfügbar.",
  keinServer: "In der Demo gibt es keine Verbindung zum Server.",
});
