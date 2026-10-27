/* ── Die Pfade der Kunden-Anmeldung (Abschnitt 5, 2026-10-27) ──────────────────────────────────────────────
   Für diese Pfade liefert nginx ein statisches Seitengerüst (login.html, register.html), und die Anwendung
   rendert die Anmeldeseite sofort — ohne den globalen Ladebildschirm der Sitzungsprüfung und ohne Ladefläche des
   Seitenwechsels (main.jsx lädt die Seite vor dem ersten Rendern). Partnerregistrierung, Admin und Partnerportal
   gehören nicht dazu und bleiben unverändert.

   Eine Quelle für main.jsx, App.jsx, die Entwicklungs-/Vorschau-Weiche (vite.config.js) und nginx.conf
   (authSeitenGeruest.test.mjs gleicht ab). Reine Funktion, kein React. */
export const KUNDEN_AUTH_PFADE = Object.freeze(["/login", "/register", "/registrieren", "/confirm-email-change"]);

export function istKundenAuthPfad(pathname) {
  if (typeof pathname !== "string") return false;
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return KUNDEN_AUTH_PFADE.includes(p);
}

/* Welche Pfade ein statisches Seitengerüst bekommen (nginx.conf, vite.config.js): Anmeldung und Registrierung — die
   Einstiege vom Preisrechner und aus den E-Mails. Die E-Mail-Bestätigung (/confirm-email-change) hat ein eigenes,
   anderes Blatt; sie bleibt bei index.html und wird nur vorgeladen. */
export const STATISCHE_AUTH_SEITEN = Object.freeze({
  "/login": "login.html",
  "/register": "register.html",
  "/registrieren": "register.html",
});

export function statischeAuthSeite(pathname) {
  if (typeof pathname !== "string") return null;
  const p = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return Object.prototype.hasOwnProperty.call(STATISCHE_AUTH_SEITEN, p) ? STATISCHE_AUTH_SEITEN[p] : null;
}
