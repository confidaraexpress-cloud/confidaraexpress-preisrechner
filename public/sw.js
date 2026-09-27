/* ConfidaraExpress — Service Worker (bewusst minimal)
 *
 * Genau EINE Aufgabe: Scheitert eine Seitennavigation derselben Origin am
 * fehlenden Netz, antwortet er mit der gebrandeten Offline-Seite.
 *
 * Harte Grenzen — jede davon ist durch Tests abgesichert:
 *   • Es gibt genau einen Cache: "ce-offline-v1". Darin liegt genau eine
 *     Datei: /offline.html. Kein App-Code, keine API-Antwort, kein Dokument,
 *     keine Kundendaten.
 *   • Behandelt werden ausschließlich Navigationen (request.mode "navigate")
 *     derselben Origin. Alles andere — API, Bilder, JS, CSS, PDFs, Labels,
 *     Rechnungen, Tracking, Karten — erreicht der Browser ohne ihn.
 *   • Netz zuerst, immer. Die Offline-Seite erscheint nur, wenn das Netz
 *     tatsächlich scheitert — nie als Abkürzung, nie wegen Langsamkeit.
 *   • Keine Anmeldedaten: kein Token, kein Authorization-Header, keine
 *     Veränderung von Requests.
 *
 * Aktualisierung: nginx liefert diese Datei mit `Cache-Control: no-cache`.
 * Weil hier kein App-Code liegt, darf eine neue Fassung sofort übernehmen
 * (skipWaiting + clients.claim) — es gibt keine alte App-Version zu mischen.
 *
 * Notfall: Diese Datei nie ersatzlos entfernen (ein 404 lässt den alten
 * Service Worker aktiv). Stattdessen eine Fassung ausliefern, die sich per
 * self.registration.unregister() selbst abmeldet.
 */
"use strict";

const OFFLINE_CACHE = "ce-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE_CACHE)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Nur eigene Altstände aufräumen — fremde Caches der Seite bleiben unberührt.
    const namen = await caches.keys();
    await Promise.all(
      namen
        .filter((name) => name.startsWith("ce-offline-") && name !== OFFLINE_CACHE)
        .map((name) => caches.delete(name))
    );
    if (self.registration.navigationPreload) {
      await self.registration.navigationPreload.enable();
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.mode !== "navigate" || request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const vorgeladen = await event.preloadResponse;
      if (vorgeladen) return vorgeladen;
      return await fetch(request);
    } catch {
      const offline = await caches.match(OFFLINE_URL, { cacheName: OFFLINE_CACHE });
      return offline || Response.error();
    }
  })());
});
