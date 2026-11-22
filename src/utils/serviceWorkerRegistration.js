import { shouldRegisterServiceWorker } from "./pwaInstallView.mjs";
import { aktuelleApp, serviceWorkerFuer } from "./appHost.mjs";

// ── Service Worker registrieren (nur Produktionsbuild) ───────────────────────
//
// Kundenbereich (confidaraexpress.de): der Service Worker (public/sw.js) hat
// genau EINE Aufgabe: eine Navigation, die am fehlenden Netz scheitert, mit der
// gebrandeten Offline-Seite zu beantworten. Er cacht keinen App-Code und keine
// Geschäftsdaten.
//
// Admin- und Partner-App (admin./partner.confidaraexpress.de, FE-2 2026-11-22):
// eigener Worker public/app-sw.js — Offline-Seite der App und freiwillige
// Push-Mitteilungen, sonst nichts. Jede App ist eine eigene Origin; ihr Worker
// sieht weder den Kundenbereich noch die andere App. Welche App, entscheidet
// allein der Host (utils/appHost.mjs); der Kundenbereich bleibt unverändert.
//
// `updateViaCache: "none"`: der Browser holt den Worker bei der Updateprüfung
// immer vom Server (zusätzlich zu `Cache-Control: no-cache` aus nginx.conf).
//
// Schlägt die Registrierung fehl, bleibt ConfidaraExpress eine ganz normale
// Website — kein Hinweis an den Kunden, keine Wiederholung.
export function registerServiceWorker() {
  const hasServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  if (!shouldRegisterServiceWorker({ prod: import.meta.env.PROD, hasServiceWorker })) return;
  const skript = serviceWorkerFuer(aktuelleApp());
  if (!skript) return;

  const registrieren = () => {
    navigator.serviceWorker
      .register(skript, { scope: "/", updateViaCache: "none" })
      .catch(() => { /* bewusst still: die Anwendung funktioniert ohne */ });
  };
  if (document.readyState === "complete") registrieren();
  else window.addEventListener("load", registrieren, { once: true });
}
