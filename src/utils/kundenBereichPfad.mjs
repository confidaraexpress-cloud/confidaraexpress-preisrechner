/* ── Die Pfade des Kundenbereichs (Confidara Obsidian 2026-11-15, Premium Blue Light 2026-11-16) ─────────────────────
   Der Kundenbereich hat einen eigenen Grund (Blauweiß, kunde-obsidian.css). Bevor DashboardLayout bzw. DashboardPage
   <html data-ce-bereich="kunde"> setzen (hooks/useCeBereich.js), zeigt die Anwendung den Ladebildschirm — während der
   Sitzungsprüfung und während der Seitenblock nachlädt. Auf diesen Pfaden steht er auf demselben Grund (LoadingScreen
   `kunde`), sonst wechselte vor jeder Seite die Fläche. Nur Darstellung: keine Weiche, keine Berechtigung, kein Routing
   hängt daran — ob eine Seite tatsächlich gerendert wird, entscheiden weiterhin Router und ProtectedRoute.

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
   wieder setzt. In dieser Lücke galt das Bild ohne Bereich: ein Farbsprung (in der dunklen Fassung gemessen: ein
   heller Blitz, Schalter der Buchungsoptionen blendeten 160 ms von Hell auf Dunkel).
   Gefragt wird nach dem Ziel der Navigation (window.location ist beim Abbau schon umgestellt). */
export function bleibtImKundenbereich(bereich, pathname) {
  return bereich === "kunde" && istKundenbereichPfad(ohneDemoBasis(pathname));
}

/* ── Die Pfade des Adminpanels (Confidara Leitstand Nacht, 2026-11-17) ──────────────────────────────────────────────
   Das Adminpanel steht auf dunklem Grund (admin-nacht.css). Während die Sitzung geprüft wird oder eine Adminseite
   nachlädt, steht der Ladebildschirm auf diesen Pfaden dunkel (LoadingScreen `dunkel`), und beim Seitenwechsel
   innerhalb des Adminpanels bleibt „admin“ am Wurzelelement stehen — sonst blitzte das helle Bild ohne Bereich auf.
   /admin/login gehört nicht dazu: Die Admin-Anmeldung ist eine Anmeldeseite (Bereich „auth“, eigene Bühne).
   Nur Darstellung: keine Weiche, keine Berechtigung — ob eine Adminseite gerendert wird, entscheidet AdminRoute. */
export function istAdminbereichPfad(pathname) {
  if (typeof pathname !== "string") return false;
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return (p === "/admin" || p.startsWith("/admin/")) && p !== "/admin/login";
}

/** Bleibt „admin“ beim Abbau einer Seite stehen? Nur, wenn die Navigation auf einen Pfad des Adminpanels führt. */
export function bleibtImAdminbereich(bereich, pathname) {
  return bereich === "admin" && istAdminbereichPfad(pathname);
}
