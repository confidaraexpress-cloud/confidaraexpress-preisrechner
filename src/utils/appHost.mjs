/* ── Welche App zeigt dieser Host? (Admin-/Partner-Apps, Betreiberauftrag 2026-11-22, FE-2) ─────────────────────────
   EIN Build, drei Oberflächen: der Kundenbereich auf confidaraexpress.de (unverändert), die Admin-App auf
   admin.confidaraexpress.de und die Partner-App auf partner.confidaraexpress.de. Jede App hat ihren eigenen Ursprung und
   damit eigenen Speicher (ce_token), einen eigenen Service Worker und eine eigene Installation — ein Admin-, ein Partner-
   und ein Kundentoken liegen nie im selben Speicher.

   Die Zuordnung ist eine feste Tabelle EXAKTER Hostnamen, kein Teilstring- oder Endungsvergleich
   (admin.confidaraexpress.de.example.com ist nicht die Admin-App). Für Entwicklung, Vorschau und Browser-E2E gelten
   admin.localhost und partner.localhost (Chromium löst *.localhost selbst auf). Jeder andere Host — auch www., Staging
   oder eine IP — ist der Kundenbereich, wie bisher.

   Eine Quelle für main.jsx, App.jsx, die Routenwächter, die Service-Worker-Registrierung, die Entwicklungs-/
   Vorschau-Weiche (vite.config.js) und nginx.conf (appHost.test.mjs gleicht ab). Reine Funktionen, kein React. */

export const APP_KUNDE = "kunde";
export const APP_ADMIN = "admin";
export const APP_PARTNER = "partner";

export const APP_HOSTS = Object.freeze({
  "admin.confidaraexpress.de": APP_ADMIN,
  "partner.confidaraexpress.de": APP_PARTNER,
  "admin.localhost": APP_ADMIN,
  "partner.localhost": APP_PARTNER,
});

// Der Kundenbereich, wenn eine App auf ihn verweist (Impressum, Datenschutz, „Zum Kundenbereich“).
export const KUNDENPORTAL_URL = "https://confidaraexpress.de";

/* Je App: Startpfad, Anmeldung, Startdokument (nginx und Weiche), Manifest, Service Worker und Name. Die Werte stehen
   wörtlich auch in nginx.conf, in den Manifesten und in public/app-sw.js (appHost.test.mjs gleicht ab). */
export const APP_INFO = Object.freeze({
  [APP_ADMIN]: Object.freeze({
    start: "/admin",
    login: "/admin/login",
    dokument: "admin.html",
    loginDokument: "admin-app-login.html",
    manifest: "/admin.webmanifest",
    serviceWorker: "/app-sw.js",
    name: "ConfidaraExpress Admin",
  }),
  [APP_PARTNER]: Object.freeze({
    start: "/partner",
    login: "/partner/login",
    dokument: "partner.html",
    loginDokument: null,
    manifest: "/partner.webmanifest",
    serviceWorker: "/app-sw.js",
    name: "ConfidaraExpress Partner",
  }),
});

/** Die App zu einem Hostnamen (ohne Port): "admin", "partner" oder "kunde". */
export function appVonHost(hostname) {
  if (typeof hostname !== "string") return APP_KUNDE;
  const h = hostname.trim().toLowerCase().replace(/\.$/, "");
  return Object.prototype.hasOwnProperty.call(APP_HOSTS, h) ? APP_HOSTS[h] : APP_KUNDE;
}

/** Die App dieser Seitenladung. Außerhalb des Browsers: der Kundenbereich. */
export function aktuelleApp() {
  return typeof window !== "undefined" && window.location ? appVonHost(window.location.hostname) : APP_KUNDE;
}

export function istAppHost(hostname) {
  return appVonHost(hostname) !== APP_KUNDE;
}

function ohneEndSchraegstrich(pathname) {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/* Die Seiten, die eine App selbst zeigt. Alles andere führt auf ihren Start (App.jsx) — so öffnet die Admin-App nie den
   Kundenbereich oder die Demo in ihrem eigenen Speicher. Admin: der ganze Adminbereich und die geschützte Vorschau der
   Rechtsseiten (nur Admins). Partner: das Partnerportal und seine Anmeldung. */
const VORSCHAU = /^\/vorschau\/rechtstexte\/[a-z0-9-]{1,40}$/;

export function pfadGehoertZurApp(app, pathname) {
  if (app === APP_KUNDE) return true;
  if (typeof pathname !== "string" || !pathname.startsWith("/") || pathname.startsWith("//")) return false;
  const p = ohneEndSchraegstrich(pathname);
  if (app === APP_ADMIN) return p === "/admin" || p.startsWith("/admin/") || VORSCHAU.test(p);
  if (app === APP_PARTNER) return p === "/partner" || p === "/partner/login";
  return false;
}

/** Service Worker einer App: der Kundenbereich behält /sw.js, Admin- und Partner-App teilen /app-sw.js (der Worker
    erkennt seine App am Host). Unbekannt: keiner. */
export function serviceWorkerFuer(app) {
  if (app === APP_KUNDE) return "/sw.js";
  return Object.prototype.hasOwnProperty.call(APP_INFO, app) ? APP_INFO[app].serviceWorker : null;
}

/** Startpfad der App ("/admin", "/partner"); im Kundenbereich null. */
export function appStartPfad(app) {
  return Object.prototype.hasOwnProperty.call(APP_INFO, app) ? APP_INFO[app].start : null;
}

/* Welches Dokument die Entwicklungs-/Vorschau-Weiche für eine Seitennavigation auf einem App-Host liefert — wie nginx.
   Die Admin-Anmeldung bekommt ihr dunkles Gerüst mit dem Kopf der Admin-App (admin-app-login.html entsteht im Build aus
   admin-login.html); im Entwicklungsserver gibt es diese Ableitung nicht, dort genügt das Gerüst selbst. */
export function appDokumentFuer(app, pathname, { build = true } = {}) {
  if (!Object.prototype.hasOwnProperty.call(APP_INFO, app) || typeof pathname !== "string") return null;
  const info = APP_INFO[app];
  if (info.loginDokument && ohneEndSchraegstrich(pathname) === info.login) return build ? info.loginDokument : "admin-login.html";
  return info.dokument;
}

/** Ursprung des Kundenbereichs von einer App aus: in Produktion confidaraexpress.de, lokal localhost mit demselben Port. */
export function kundenportalUrsprung(loc) {
  const host = loc && typeof loc.hostname === "string" ? loc.hostname.toLowerCase() : "";
  if (host === "admin.localhost" || host === "partner.localhost") {
    const port = loc.port ? `:${String(loc.port).replace(/[^0-9]/g, "")}` : "";
    return `${loc.protocol === "https:" ? "https:" : "http:"}//localhost${port}`;
  }
  return KUNDENPORTAL_URL;
}

/* Ziel eines Verweises in den Kundenbereich (Rechtsseiten, „Zum Kundenbereich“). In einer App absolut auf dessen
   Ursprung — dort gilt eine eigene Anmeldung —, im Kundenbereich der Pfad selbst wie bisher. Nur feste, eigene Pfade. */
export function kundenportalZiel(pfad, loc = typeof window !== "undefined" ? window.location : undefined) {
  if (typeof pfad !== "string" || !pfad.startsWith("/") || pfad.startsWith("//")) throw new Error("kundenportalZiel: nur eigene Pfade");
  if (appVonHost(loc && loc.hostname) === APP_KUNDE) return pfad;
  return `${kundenportalUrsprung(loc)}${pfad}`;
}

/* Absolute Adresse einer Seite des Kundenbereichs zum Kopieren und Teilen (Registrierungslinks der Partner, Pre-Live-
   Registrierung): im Kundenbereich dessen eigener Ursprung wie bisher, in einer App der Ursprung des Kundenbereichs — nie
   die Adresse der App, auf der es diese Seite nicht gibt. Außerhalb des Browsers der Pfad. Nur feste, eigene Pfade. */
export function kundenportalAdresse(pfad, loc = typeof window !== "undefined" ? window.location : undefined) {
  if (typeof pfad !== "string" || !pfad.startsWith("/") || pfad.startsWith("//")) throw new Error("kundenportalAdresse: nur eigene Pfade");
  if (!loc || typeof loc.origin !== "string") return pfad;
  if (appVonHost(loc.hostname) === APP_KUNDE) return `${loc.origin}${pfad}`;
  return `${kundenportalUrsprung(loc)}${pfad}`;
}
