// Service Worker des öffentlichen Preisrechners (preisrechner.confidaraexpress.de).
//
// Er tut genau eines: sich selbst abmelden. Bis zum öffentlichen Preisrechner lieferte diese Domain die
// Kundenanwendung aus. Ein dort installierter Service Worker der Anwendung prüft bei jedem Besuch /sw.js auf
// eine neue Fassung, findet diese, installiert sie — und sie meldet sich ab und entfernt die Offline-Ablage
// der Anwendung auf dieser Domain. Kein fetch-Handler: nichts wird abgefangen, nichts gecacht. Die Seite
// selbst registriert keinen Service Worker.
"use strict";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const namen = await caches.keys();
    await Promise.all(namen.filter((name) => name.startsWith("ce-offline-")).map((name) => caches.delete(name)));
    await self.registration.unregister();
  })());
});
