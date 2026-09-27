import { shouldRegisterServiceWorker } from "./pwaInstallView.mjs";

// ── Service Worker registrieren (nur Produktionsbuild) ───────────────────────
//
// Der Service Worker (public/sw.js) hat genau EINE Aufgabe: eine Navigation,
// die am fehlenden Netz scheitert, mit der gebrandeten Offline-Seite zu
// beantworten. Er cacht keinen App-Code und keine Geschäftsdaten.
//
// `updateViaCache: "none"`: der Browser holt sw.js bei der Updateprüfung immer
// vom Server (zusätzlich zu `Cache-Control: no-cache` aus nginx.conf).
//
// Schlägt die Registrierung fehl, bleibt ConfidaraExpress eine ganz normale
// Website — kein Hinweis an den Kunden, keine Wiederholung.
export function registerServiceWorker() {
  const hasServiceWorker = typeof navigator !== "undefined" && "serviceWorker" in navigator;
  if (!shouldRegisterServiceWorker({ prod: import.meta.env.PROD, hasServiceWorker })) return;

  const registrieren = () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => { /* bewusst still: die Anwendung funktioniert ohne */ });
  };
  if (document.readyState === "complete") registrieren();
  else window.addEventListener("load", registrieren, { once: true });
}
