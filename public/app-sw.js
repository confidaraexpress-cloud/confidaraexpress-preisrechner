/* ConfidaraExpress — Service Worker der Admin- und der Partner-App (FE-2, 2026-11-22; bewusst minimal)
 *
 * Läuft nur auf admin.confidaraexpress.de und partner.confidaraexpress.de (lokal admin.localhost/partner.localhost);
 * welche App, ergibt sich allein aus dem Host — dieselbe feste Tabelle wie src/utils/appHost.mjs. Auf jedem anderen Host
 * tut er nichts. Der Kundenbereich behält seinen eigenen Service Worker (sw.js) unverändert.
 *
 * Zwei Aufgaben, sonst keine:
 *   1. Offline: Scheitert eine Seitennavigation derselben Origin am fehlenden Netz, antwortet er mit der Offline-Seite
 *      der App. Es gibt genau einen Cache, „ce-app-offline-v1", mit genau einer Datei: /admin-offline.html bzw.
 *      /partner-offline.html. Kein App-Code, keine API-Antwort, kein Dokument, keine Konto- oder Kundendaten, kein Token.
 *      Behandelt werden ausschließlich Navigationen (mode "navigate", GET) derselben Origin, Netz zuerst, immer.
 *   2. Push: Eine Mitteilung trägt nur { v, art, pfad, tag } (lib/webPush.js im Backend) — keine Namen, Beträge oder
 *      Nummern. Der sichtbare Text kommt aus der festen Tabelle unten, nie aus der Nutzlast. Passt etwas nicht (Version,
 *      Art, Pfad, Kennung), erscheint ein neutraler Hinweis, der den Start der App öffnet. Ein Klick öffnet nur Pfade der
 *      eigenen App auf der eigenen Origin — nie eine fremde Adresse. Inhalte lädt erst die App, mit gültiger Sitzung.
 *
 * Keine Anmeldedaten: kein Token, kein Authorization-Header, keine Veränderung von Requests, kein Netzabruf bei Push.
 * „pushsubscriptionchange" bleibt bewusst unbehandelt: ein erneuertes Abo kennt der Server nicht (er löscht das alte bei
 * 404/410); das Gerät schaltet die Mitteilungen in den Einstellungen der App wieder ein.
 *
 * Aktualisierung: nginx liefert diese Datei mit `Cache-Control: no-cache`; skipWaiting + clients.claim, weil hier kein
 * App-Code liegt. Notfall: nie ersatzlos entfernen (ein 404 lässt den alten Worker aktiv), sondern eine Fassung
 * ausliefern, die sich per self.registration.unregister() selbst abmeldet.
 */
"use strict";

const APP_HOSTS = {
  "admin.confidaraexpress.de": "admin",
  "partner.confidaraexpress.de": "partner",
  "admin.localhost": "admin",
  "partner.localhost": "partner",
};
const APP = Object.prototype.hasOwnProperty.call(APP_HOSTS, self.location.hostname) ? APP_HOSTS[self.location.hostname] : null;

const OFFLINE_CACHE = "ce-app-offline-v1";
const OFFLINE_URL = APP ? `/${APP}-offline.html` : null;

const NAME = { admin: "ConfidaraExpress Admin", partner: "ConfidaraExpress Partner" };
const START = { admin: "/admin", partner: "/partner" };
const SYMBOL = { admin: "/app-icon-admin-192-v1.png", partner: "/app-icon-partner-192-v1.png" };
// Dieselben Zielpfade wie das Backend (lib/pushEvents.js ZIELPFAD) — relativ zur eigenen App.
const ZIELPFAD = { admin: /^\/admin(\/[a-z-]+(\/\d+)?)?$/, partner: /^\/partner(\?page=[a-z-]+)?$/ };
const KENNUNG = /^[0-9a-f]{32}$/;

// Sichtbare Texte je Ereignisart: neutral, ohne Inhalte. Die Arten stehen wörtlich im Backend (lib/pushEvents.js).
const TEXTE = {
  admin: {
    support_new: "Eine neue Supportanfrage wartet auf Antwort.",
    cancellation_new: "Eine neue Stornierungsanfrage wartet auf Ihre Entscheidung.",
    reconciliation_open: "Ein Buchungsvorgang braucht eine Klärung.",
    invoice_document_open: "Für eine Rechnung fehlt noch das Dokument.",
    customer_pending: "Ein neues Kundenkonto wartet auf Freigabe.",
    billing_mode_request: "Ein Antrag auf Sammelrechnung wartet auf Ihre Entscheidung.",
  },
  partner: {
    partner_customer_assigned: "Ihnen wurde ein neuer Kunde zugeordnet.",
    partner_commission: "Für Sie wurde eine neue Provision erfasst.",
    partner_credit_note: "Eine neue Gutschrift liegt für Sie bereit.",
  },
};
const NEUTRAL = "Es gibt Neuigkeiten in der App.";

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    if (OFFLINE_URL) {
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.add(new Request(OFFLINE_URL, { cache: "reload" }));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Nur eigene Altstände aufräumen — fremde Caches der Seite bleiben unberührt.
    const namen = await caches.keys();
    await Promise.all(namen
      .filter((name) => name.startsWith("ce-app-offline-") && name !== OFFLINE_CACHE)
      .map((name) => caches.delete(name)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (!OFFLINE_URL || request.mode !== "navigate" || request.method !== "GET") return;
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

/** Die Nutzlast prüfen; alles Unpassende wird zum neutralen Hinweis auf den Start der App. */
function mitteilung(daten) {
  let n = null;
  try { n = daten ? daten.json() : null; } catch { n = null; }
  const gueltig = n && typeof n === "object" && n.v === 1
    && typeof n.art === "string" && Object.prototype.hasOwnProperty.call(TEXTE[APP], n.art)
    && typeof n.pfad === "string" && ZIELPFAD[APP].test(n.pfad)
    && typeof n.tag === "string" && KENNUNG.test(n.tag);
  if (!gueltig) return { text: NEUTRAL, pfad: START[APP], tag: undefined };
  return { text: TEXTE[APP][n.art], pfad: n.pfad, tag: n.tag };
}

self.addEventListener("push", (event) => {
  if (!APP) return;
  const m = mitteilung(event.data);
  event.waitUntil(self.registration.showNotification(NAME[APP], {
    body: m.text,
    tag: m.tag,
    icon: SYMBOL[APP],
    lang: "de",
    data: { pfad: m.pfad },
  }));
});

/** Nur ein Pfad der eigenen App, sonst ihr Start. */
function sichererPfad(pfad) {
  return typeof pfad === "string" && ZIELPFAD[APP].test(pfad) ? pfad : START[APP];
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  if (!APP) return;
  const ziel = new URL(sichererPfad(event.notification.data && event.notification.data.pfad), self.location.origin).href;
  event.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of fenster) {
      if (new URL(client.url).origin !== self.location.origin) continue;
      try {
        const geoeffnet = "navigate" in client ? await client.navigate(ziel) : null;
        await (geoeffnet || client).focus();
        return;
      } catch {
        // nicht steuerbar (z. B. noch nicht übernommen) — dann ein neues Fenster der App
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(ziel);
  })());
});
