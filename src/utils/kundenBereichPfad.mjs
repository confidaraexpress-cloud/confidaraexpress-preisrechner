/* ── Die Pfade des Kundenbereichs (Confidara Obsidian, Betreiberauftrag 2026-11-15) ─────────────────────────────────
   Der Kundenbereich ist schwarz. Bevor DashboardLayout bzw. DashboardPage <html data-ce-bereich="kunde"> setzen
   (hooks/useCeBereich.js), zeigt die Anwendung den Ladebildschirm — während der Sitzungsprüfung und während der
   Seitenblock nachlädt. Auf diesen Pfaden steht er auf demselben Schwarz (LoadingScreen `kunde`), sonst blitzte vor
   jeder dunklen Seite eine helle Fläche auf. Nur Darstellung: keine Weiche, keine Berechtigung, kein Routing hängt
   daran — ob eine Seite tatsächlich gerendert wird, entscheiden weiterhin Router und ProtectedRoute.

   Eine Quelle für App.jsx (Hauptanwendung) und demo/DemoApp.jsx bzw. main.jsx (Demo unter /demo, Pfad ohne Basis).
   Reine Funktion, kein React. */
export const KUNDENBEREICH_PFADE = Object.freeze(["/dashboard", "/calculator", "/booking"]);
const KUNDENBEREICH_MUSTER = Object.freeze([/^\/inventory\/products\/[^/]+$/, /^\/inventory\/orders\/[^/]+$/]);

export function istKundenbereichPfad(pathname) {
  if (typeof pathname !== "string" || !pathname.startsWith("/")) return false;
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return KUNDENBEREICH_PFADE.includes(p) || KUNDENBEREICH_MUSTER.some((m) => m.test(p));
}

/** Pfad ohne die Basis der Demo (/demo); der Einstieg /demo selbst führt auf die Übersicht. Andere Pfade unverändert. */
export function ohneDemoBasis(pathname) {
  if (typeof pathname !== "string" || !/^\/demo(?=\/|$)/.test(pathname)) return pathname;
  const p = pathname.replace(/^\/demo/, "");
  return p === "" || p === "/" ? "/dashboard" : p;
}

/* Bleibt der Bereich beim Abbau einer Seite stehen? Beim Seitenwechsel innerhalb des Kundenbereichs (Übersicht →
   Buchung) baut React die alte Seite ab, bevor die neue — oft erst nach dem Nachladen ihres Seitenblocks — den Bereich
   wieder setzt. In dieser Lücke galt das Bild ohne Bereich: im schwarzen Kundenbereich ein heller Blitz, und
   Bedienelemente mit Übergang blendeten von Hell auf Dunkel (gemessen: Schalter der Buchungsoptionen, 160 ms).
   Gefragt wird nach dem Ziel der Navigation (window.location ist beim Abbau schon umgestellt). */
export function bleibtImKundenbereich(bereich, pathname) {
  return bereich === "kunde" && istKundenbereichPfad(ohneDemoBasis(pathname));
}
