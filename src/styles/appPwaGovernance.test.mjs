// Admin- und Partner-App als installierbare Apps (FE-2, 2026-11-22): Hosttabelle ↔ nginx ↔ Manifeste ↔ Startdokumente
// ↔ Service Worker ↔ Offline-Seiten ↔ Build. Der Kundenbereich bleibt unverändert; seine Verträge prüfen weiterhin
// pwaGovernance.test.mjs, authSeitenGeruest.test.mjs und preisrechnerGovernance.test.mjs.
//
// Run: node --test src/styles/appPwaGovernance.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { APP_ADMIN, APP_HOSTS, APP_INFO, APP_KUNDE, APP_PARTNER, serviceWorkerFuer } from "../utils/appHost.mjs";
import { ADMIN_APP_KOPF, adminAppLoginHtml } from "../utils/appDokumente.mjs";

const lies = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const gibt = (p) => existsSync(new URL(`../../${p}`, import.meta.url));
const ohneNginxKommentare = (s) => s.replace(/^\s*#.*$/gm, "");
const ohneHtmlKommentare = (s) => s.replace(/<!--[\s\S]*?-->/g, "");

const NGINX = ohneNginxKommentare(lies("nginx.conf"));
const BLOECKE = NGINX.split(/^server \{$/m).slice(1).map((b) => `server {${b}`);
const ANWENDUNG = BLOECKE[0];
const kopfVon = (block) => block.slice(0, block.indexOf("location "));
const SICHERHEIT = (kopfVon(ANWENDUNG).match(/^\s*add_header .+ always;$/gm) || []).map((z) => z.trim());
const ROBOTS = 'add_header X-Robots-Tag "noindex, nofollow" always;';
const APPS = [APP_ADMIN, APP_PARTNER];
const PROD_HOST = Object.freeze({ admin: "admin.confidaraexpress.de", partner: "partner.confidaraexpress.de" });

function blockFuer(host) {
  const treffer = BLOECKE.filter((b) => new RegExp(`^\\s*server_name ${host.replace(/\./g, "\\.")};$`, "m").test(b));
  assert.equal(treffer.length, 1, `genau ein server-Block für ${host}`);
  return treffer[0];
}

/** Alle locations eines Blocks: einzeilig (`location = / { return 302 /admin; }`) oder mehrzeilig bis `\n    }`. */
function locationsVon(block) {
  const liste = [];
  let i = 0;
  while ((i = block.indexOf("\n    location ", i)) !== -1) {
    const start = i + 1;
    const zeilenende = block.indexOf("\n", start);
    const zeile = block.slice(start, zeilenende);
    const kopf = zeile.slice(0, zeile.indexOf("{")).trim();
    if (/\}\s*$/.test(zeile)) {
      liste.push({ kopf, inhalt: zeile });
      i = zeilenende;
    } else {
      const ende = block.indexOf("\n    }", start);
      liste.push({ kopf, inhalt: block.slice(start, ende) });
      i = ende + 1;
    }
  }
  return liste;
}

test("1 — feste Hosttabelle ↔ nginx: je Produktionshost genau ein eigener Block, nie default_server", () => {
  assert.equal(SICHERHEIT.length, 6, "Sicherheitsheaderblock der Anwendung nicht gefunden");
  assert.deepEqual(Object.entries(APP_HOSTS).filter(([h]) => h.endsWith(".confidaraexpress.de")).sort(),
    [[PROD_HOST.admin, APP_ADMIN], [PROD_HOST.partner, APP_PARTNER]]);
  for (const app of APPS) {
    const b = blockFuer(PROD_HOST[app]);
    assert.match(b, /^\s*listen 80;$/m);
    assert.doesNotMatch(b, /default_server/);
    assert.match(b, /^\s*root \/usr\/share\/nginx\/html;$/m, "derselbe Build wie der Kundenbereich");
    assert.match(b, /^\s*server_tokens off;$/m);
    assert.match(b, /^\s*absolute_redirect off;$/m, "Weiterleitungen relativ (intern HTTP hinter dem TLS-Proxy)");
    const kopf = (kopfVon(b).match(/^\s*add_header .+ always;$/gm) || []).map((z) => z.trim());
    assert.deepEqual(kopf, [...SICHERHEIT, ROBOTS], `${app}: Serverkopf = Sicherheitsblock der Anwendung + noindex`);
  }
  // Lokale Hosts nur für Entwicklung und Browsertests — nie in nginx.
  assert.doesNotMatch(NGINX, /server_name [^;]*localhost/);
});

test("2 — jede location mit eigenem add_header wiederholt den vollständigen Block (keine Vererbung)", () => {
  for (const app of APPS) {
    for (const { kopf, inhalt } of locationsVon(blockFuer(PROD_HOST[app]))) {
      if (!inhalt.includes("add_header")) {
        assert.match(inhalt, /\{ return (302 \/[a-z]+|404); \}$/, `${app} ${kopf}: ohne add_header nur Weiterleitung oder 404`);
        continue;
      }
      for (const zeile of [...SICHERHEIT, ROBOTS]) assert.ok(inhalt.includes(zeile), `${app} ${kopf}: ${zeile.slice(0, 50)}… fehlt`);
    }
  }
});

test("3 — App-Hosts: feste Liste von Dateien, sonst das Startdokument der App (nie $uri)", () => {
  const erwartet = {
    admin: ["location = /", "location /", "location = /admin/login", "location = /app-sw.js", "location = /admin.webmanifest",
      "location = /admin-offline.html", "location ^~ /app-icon-admin-", "location = /apple-touch-icon-admin-v1.png",
      "location = /favicon-v2.svg", "location ^~ /assets/", "location = /sw.js", "location = /manifest.webmanifest",
      "location = /offline.html", "location = /robots.txt"],
    partner: ["location = /", "location /", "location = /app-sw.js", "location = /partner.webmanifest",
      "location = /partner-offline.html", "location ^~ /app-icon-partner-", "location = /apple-touch-icon-partner-v1.png",
      "location = /favicon-v2.svg", "location ^~ /assets/", "location = /sw.js", "location = /manifest.webmanifest",
      "location = /offline.html", "location = /robots.txt"],
  };
  for (const app of APPS) {
    const b = blockFuer(PROD_HOST[app]);
    const locs = locationsVon(b);
    assert.deepEqual(locs.map((l) => l.kopf), erwartet[app], `${app}: Allowlist der locations`);
    const loc = (k) => locs.find((l) => l.kopf === k).inhalt;
    assert.match(loc("location = /"), new RegExp(`\\{ return 302 ${APP_INFO[app].start}; \\}$`));
    assert.match(loc("location /"), new RegExp(`try_files /${APP_INFO[app].dokument.replace(".", "\\.")} =404;`));
    assert.match(loc("location /"), /add_header Cache-Control "no-cache, must-revalidate" always;/);
    if (APP_INFO[app].loginDokument) {
      assert.match(loc(`location = ${APP_INFO[app].login}`), new RegExp(`try_files /${APP_INFO[app].loginDokument.replace(".", "\\.")} =404;`));
      assert.match(loc(`location = ${APP_INFO[app].login}`), /add_header Cache-Control "no-cache, must-revalidate" always;/);
    }
    // $uri ausschließlich für gehashte Bündel; Langzeit-Cache ausschließlich dort.
    for (const { kopf, inhalt } of locs) {
      if (kopf === "location ^~ /assets/") {
        assert.match(inhalt, /try_files \$uri =404;/);
        assert.match(inhalt, /expires 1y;/);
        assert.match(inhalt, /add_header Cache-Control "public, immutable";/);
      } else {
        assert.doesNotMatch(inhalt, /\$uri|expires|immutable/, `${app} ${kopf}`);
      }
    }
    for (const datei of ["/app-sw.js", `/${app}.webmanifest`, `/${app}-offline.html`]) {
      assert.match(loc(`location = ${datei}`), /add_header Cache-Control "no-cache" always;/, `${app} ${datei}: sofort neu`);
    }
    assert.match(loc(`location = /${app}.webmanifest`), /types \{ \}\s+default_type application\/manifest\+json;/);
    for (const k of [`location ^~ /app-icon-${app}-`, `location = /apple-touch-icon-${app}-v1.png`, "location = /favicon-v2.svg"]) {
      assert.match(loc(k), /add_header Cache-Control "public, max-age=3600, must-revalidate" always;/, `${app} ${k}`);
    }
    for (const k of ["location = /sw.js", "location = /manifest.webmanifest", "location = /offline.html"]) {
      assert.match(loc(k), /\{ return 404; \}$/, `${app}: ${k} des Kundenbereichs gibt es hier nicht`);
    }
  }
});

test("4 — Hauptdomain: App-Dateien antworten mit 404, der Kundenbereich bleibt unverändert", () => {
  const locs = locationsVon(ANWENDUNG);
  for (const datei of ["/admin.html", "/partner.html", "/admin-app-login.html", "/admin.webmanifest", "/partner.webmanifest",
    "/app-sw.js", "/admin-offline.html", "/partner-offline.html"]) {
    const l = locs.find((x) => x.kopf === `location = ${datei}`);
    assert.ok(l, `Hauptdomain: location = ${datei} fehlt`);
    assert.match(l.inhalt, /\{ return 404; \}$/, `Hauptdomain: ${datei}`);
  }
  assert.match(ANWENDUNG, /location = \/admin\/login \{\s+try_files \/admin-login\.html =404;/, "die Admin-Anmeldung der Hauptdomain bleibt");
  assert.match(ANWENDUNG, /location = \/sw\.js \{/);
  assert.match(ANWENDUNG, /location = \/manifest\.webmanifest \{/);
});

test("5 — Manifeste: eigene App je Host, Start in der App, Symbole vorhanden und maskierbar", () => {
  for (const app of APPS) {
    const m = JSON.parse(lies(`public/${app}.webmanifest`));
    assert.equal(APP_INFO[app].manifest, `/${app}.webmanifest`);
    assert.equal(m.id, "/");
    assert.equal(m.name, APP_INFO[app].name);
    assert.equal(m.short_name, app === APP_ADMIN ? "CE Admin" : "CE Partner");
    assert.equal(m.start_url, APP_INFO[app].start);
    assert.equal(m.scope, "/");
    assert.equal(m.display, "standalone");
    assert.equal(m.lang, "de");
    assert.equal(m.theme_color, "#060B1C");
    assert.equal(m.background_color, "#060B1C");
    const zwecke = new Set();
    for (const icon of m.icons) {
      assert.match(icon.src, new RegExp(`^/app-icon-${app}-(maskable-)?(192|512)-v1\\.png$`), icon.src);
      assert.ok(gibt(`public${icon.src}`), `${icon.src} fehlt`);
      assert.equal(icon.type, "image/png");
      assert.equal(icon.sizes, icon.src.includes("512") ? "512x512" : "192x192");
      zwecke.add(`${icon.purpose}-${icon.sizes}`);
    }
    assert.deepEqual([...zwecke].sort(), ["any-192x192", "any-512x512", "maskable-192x192", "maskable-512x512"]);
    assert.doesNotMatch(JSON.stringify(m), /jumingo|transglobal|\bTG\b/i);
    assert.ok(gibt(`public/apple-touch-icon-${app}-v1.png`));
  }
  assert.notEqual(JSON.parse(lies("public/admin.webmanifest")).start_url, JSON.parse(lies("public/manifest.webmanifest")).start_url,
    "die Admin-App startet nicht im Kundenbereich");
});

test("6 — Startdokumente: Kopf der App, Nachtgrund ab dem ersten Bild, kein eigener Einstieg", () => {
  for (const app of APPS) {
    const html = lies(APP_INFO[app].dokument);
    assert.match(html, new RegExp(`<html lang="de" data-ce-bereich="${app}">`));
    assert.match(html, new RegExp(`<title>${APP_INFO[app].name}</title>`));
    assert.equal((html.match(/rel="manifest"/g) || []).length, 1);
    assert.ok(html.includes(`<link rel="manifest" href="${APP_INFO[app].manifest}" />`));
    assert.ok(html.includes(`<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-${app}-v1.png" />`));
    assert.ok(html.includes('<meta name="robots" content="noindex, nofollow" />'));
    assert.ok(html.includes('<meta name="theme-color" content="#060B1C" />'));
    assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/favicon-v2.svg" />'));
    assert.match(html, /<div id="root"><\/div>/);
    assert.match(html, /<script type="module" src="\/src\/main\.jsx"><\/script>/, "das Modulskript (fällt im Build weg)");
    assert.doesNotMatch(ohneHtmlKommentare(html), /<script(?! type="module" src="\/src\/main\.jsx")/, "kein weiteres Skript");
  }
  // Das Gerüst der Admin-Anmeldung mit dem Kopf der Admin-App entsteht aus admin-login.html — jede Ankerstelle genau einmal.
  const geruest = lies("admin-login.html");
  for (const [alt] of ADMIN_APP_KOPF) assert.equal(geruest.split(alt).length, 2, `admin-login.html: ${alt}`);
  const app = adminAppLoginHtml(geruest);
  assert.ok(app.includes('<link rel="manifest" href="/admin.webmanifest" />'));
  assert.ok(app.includes('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-admin-v1.png" />'));
  assert.ok(app.includes('<meta name="apple-mobile-web-app-title" content="CE Admin" />'));
  assert.doesNotMatch(app, /manifest\.webmanifest|apple-touch-icon-v1\.png/, "kein Kopf des Kundenbereichs");
  assert.equal(app.replace(/\s+/g, " ").length > geruest.replace(/\s+/g, " ").length - 40, true);
  assert.throws(() => adminAppLoginHtml("<html><head></head></html>"), /nicht genau einmal/);
  assert.throws(() => adminAppLoginHtml(geruest + geruest), /nicht genau einmal/, "doppelte Anker brechen ab");
});

test("7 — Build: Startdokumente ohne eigenen Einstieg, Admin-Anmeldung der App aus dem fertigen Gerüst", () => {
  const vite = lies("vite.config.js");
  assert.match(vite, /const APP_DOKUMENTE = \["admin\.html", "partner\.html"\];/);
  assert.match(vite, /adminApp: path\.join\(REPO, "admin\.html"\),/);
  assert.match(vite, /partnerApp: path\.join\(REPO, "partner\.html"\),/);
  assert.match(vite, /for \(const name of \[\.\.\.GERUESTE, \.\.\.APP_DOKUMENTE\]\) \{/);
  assert.match(vite, /this\.emitFile\(\{ type: "asset", fileName: "admin-app-login\.html", source: adminAppLogin \}\);/);
  assert.match(vite, /appDokumentFuer\(app, pfad, \{ build: weicheMitBuildDokumenten \}\)/, "Entwicklungs-/Vorschauweiche nach Host");
  assert.match(vite, /config\(_config, env\) \{ weicheMitBuildDokumenten = env\.command === "build" \|\| env\.isPreview === true; \},/);
});

test("8 — Service Worker je Host: Kundenbereich /sw.js unverändert, Apps /app-sw.js", () => {
  assert.equal(serviceWorkerFuer(APP_KUNDE), "/sw.js");
  assert.equal(serviceWorkerFuer(APP_ADMIN), "/app-sw.js");
  assert.equal(serviceWorkerFuer(APP_PARTNER), "/app-sw.js");
  assert.equal(serviceWorkerFuer("x"), null);
  const reg = lies("src/utils/serviceWorkerRegistration.js");
  assert.match(reg, /\.register\(skript, \{ scope: "\/", updateViaCache: "none" \}\)/);
  assert.match(reg, /const skript = serviceWorkerFuer\(aktuelleApp\(\)\);/);
  assert.doesNotMatch(lies("public/sw.js"), /admin\.confidaraexpress|partner\.confidaraexpress|showNotification|addEventListener\("push"/,
    "der Worker des Kundenbereichs bleibt ohne Push");
});

const SW = lies("public/app-sw.js");
const SW_CODE = SW.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("9 — app-sw.js (Quelltext): dieselbe Hosttabelle, ein Cache mit einer Datei, nur Navigationen, keine Anmeldedaten", () => {
  const tabelle = SW_CODE.match(/const APP_HOSTS = (\{[\s\S]*?\});/);
  assert.ok(tabelle, "Hosttabelle im Worker fehlt");
  assert.deepEqual({ ...vm.runInNewContext(`(${tabelle[1]})`) }, { ...APP_HOSTS }, "Objekt aus dem VM-Realm in diesen kopiert");
  assert.match(SW_CODE, /const OFFLINE_CACHE = "ce-app-offline-v1";/);
  assert.match(SW_CODE, /const OFFLINE_URL = APP \? `\/\$\{APP\}-offline\.html` : null;/);
  assert.equal((SW_CODE.match(/cache\.add\(/g) || []).length, 1);
  assert.doesNotMatch(SW_CODE, /cache\.put\(|cache\.addAll\(|caches\.open\((?!OFFLINE_CACHE)/);
  assert.equal((SW_CODE.match(/respondWith\(/g) || []).length, 1, "genau eine Antwortstelle");
  assert.match(SW_CODE, /request\.mode !== "navigate" \|\| request\.method !== "GET"/);
  assert.match(SW_CODE, /if \(new URL\(request\.url\)\.origin !== self\.location\.origin\) return;/);
  for (const verboten of [/Authorization/i, /localStorage|sessionStorage|indexedDB/, /ce_token|token/i, /cookie/i, /credentials/,
    /importScripts/, /eval\(|new Function/, /fetch\((?!request\))/]) {
    assert.doesNotMatch(SW_CODE, verboten, `app-sw.js: ${verboten}`);
  }
  // Zielpfade wörtlich wie im Backend (lib/pushEvents.js ZIELPFAD, BE-2).
  assert.ok(SW_CODE.includes(String.raw`const ZIELPFAD = { admin: /^\/admin(\/[a-z-]+(\/\d+)?)?$/, partner: /^\/partner(\?page=[a-z-]+)?$/ };`));
  assert.ok(SW_CODE.includes("const KENNUNG = /^[0-9a-f]{32}$/;"));
});

/* ── app-sw.js im Verhalten: der Worker läuft in einer Sandbox mit nachgebildetem `self` ─────────────────────────── */
function worker(hostname, { netz = "ok" } = {}) {
  const handler = {};
  const meldungen = [];
  const geoeffnet = [];
  const navigiert = [];
  const gecacht = [];
  const fenster = [];
  const origin = `https://${hostname}`;
  const self = {
    location: { hostname, origin },
    addEventListener: (typ, fn) => { handler[typ] = fn; },
    skipWaiting: async () => {},
    registration: {
      navigationPreload: null,
      showNotification: async (titel, optionen) => { meldungen.push({ titel, ...optionen }); },
    },
    clients: {
      claim: async () => {},
      matchAll: async () => fenster,
      openWindow: async (url) => { geoeffnet.push(url); return null; },
    },
  };
  const offline = { offline: true };
  const caches = {
    open: async (name) => ({ add: async (req) => { gecacht.push([name, typeof req === "string" ? req : req.url]); } }),
    keys: async () => [],
    delete: async () => true,
    match: async (url, { cacheName } = {}) => (cacheName === "ce-app-offline-v1" && /-offline\.html$/.test(url) ? offline : undefined),
  };
  const fetch = async () => { if (netz === "aus") throw new TypeError("offline"); return { netz: true }; };
  class Request { constructor(url, init) { this.url = url; this.init = init; } }
  const Response = { error: () => ({ fehler: true }) };
  vm.runInNewContext(SW, { self, caches, fetch, Request, Response, URL, Promise, Object, Error, TypeError });
  return { handler, meldungen, geoeffnet, navigiert, gecacht, fenster, offline };
}

async function pushe(w, daten) {
  let warte = null;
  w.handler.push({ data: daten === undefined ? null : { json: () => (typeof daten === "string" ? JSON.parse(daten) : daten) },
    waitUntil: (p) => { warte = p; } });
  if (warte) await warte;
  return w.meldungen.at(-1);
}

async function klicke(w, data) {
  let warte = null;
  const n = { data, close: () => {} };
  w.handler.notificationclick({ notification: n, waitUntil: (p) => { warte = p; } });
  if (warte) await warte;
}

const TAG = "0123456789abcdef0123456789abcdef";

test("10 — Push: Text aus der festen Tabelle, nie aus der Nutzlast; Unpassendes wird zum neutralen Hinweis", async () => {
  const w = worker("admin.confidaraexpress.de");
  const m = await pushe(w, { v: 1, art: "support_new", pfad: "/admin/support-requests/12", tag: TAG });
  assert.equal(m.titel, "ConfidaraExpress Admin");
  assert.equal(m.body, "Eine neue Supportanfrage wartet auf Antwort.");
  assert.equal(m.tag, TAG);
  assert.deepEqual({ ...m.data }, { pfad: "/admin/support-requests/12" });
  assert.equal(m.icon, "/app-icon-admin-192-v1.png");
  for (const boese of [
    { v: 2, art: "support_new", pfad: "/admin", tag: TAG },
    { v: 1, art: "partner_commission", pfad: "/admin", tag: TAG },
    { v: 1, art: "toString", pfad: "/admin", tag: TAG },
    { v: 1, art: "support_new", pfad: "https://evil.example/admin", tag: TAG },
    { v: 1, art: "support_new", pfad: "//evil.example/admin", tag: TAG },
    { v: 1, art: "support_new", pfad: "/admin/../dashboard", tag: TAG },
    { v: 1, art: "support_new", pfad: "/admin", tag: "x".repeat(32) },
    { v: 1, art: "support_new", pfad: "/admin", tag: TAG, text: "Kunde Max Mustermann" },
    "kein json",
    undefined,
  ]) {
    let m2;
    try { m2 = await pushe(w, boese); } catch { m2 = w.meldungen.at(-1); }
    if (typeof boese === "object" && boese && boese.text) {
      assert.equal(m2.body, "Eine neue Supportanfrage wartet auf Antwort.", "Zusatzfelder erscheinen nie");
      continue;
    }
    assert.equal(m2.body, "Es gibt Neuigkeiten in der App.", JSON.stringify(boese));
    assert.equal(m2.data.pfad, "/admin", JSON.stringify(boese));
    assert.equal(m2.tag, undefined);
  }
  const p = worker("partner.confidaraexpress.de");
  const mp = await pushe(p, { v: 1, art: "partner_credit_note", pfad: "/partner?page=gutschriften", tag: TAG });
  assert.equal(mp.titel, "ConfidaraExpress Partner");
  assert.equal(mp.body, "Eine neue Gutschrift liegt für Sie bereit.");
  assert.equal((await pushe(p, { v: 1, art: "support_new", pfad: "/partner", tag: TAG })).body, "Es gibt Neuigkeiten in der App.");
});

test("11 — Klick: nur Pfade der eigenen App auf der eigenen Origin", async () => {
  const w = worker("admin.confidaraexpress.de");
  await klicke(w, { pfad: "/admin/support-requests/12" });
  await klicke(w, { pfad: "https://evil.example/admin" });
  await klicke(w, { pfad: "//evil.example" });
  await klicke(w, { pfad: "/dashboard" });
  await klicke(w, undefined);
  assert.deepEqual(w.geoeffnet, [
    "https://admin.confidaraexpress.de/admin/support-requests/12",
    "https://admin.confidaraexpress.de/admin",
    "https://admin.confidaraexpress.de/admin",
    "https://admin.confidaraexpress.de/admin",
    "https://admin.confidaraexpress.de/admin",
  ]);
  // Ein offenes Fenster der eigenen Origin wird genutzt, eines fremder Origin nie.
  const w2 = worker("admin.confidaraexpress.de");
  const ziele = [];
  w2.fenster.push({ url: "https://confidaraexpress.de/dashboard", navigate: async (u) => { ziele.push(["fremd", u]); return null; }, focus: async () => {} });
  w2.fenster.push({ url: "https://admin.confidaraexpress.de/admin", navigate: async (u) => { ziele.push(["eigen", u]); return { focus: async () => {} }; }, focus: async () => {} });
  await klicke(w2, { pfad: "/admin/reconciliation" });
  assert.deepEqual(ziele, [["eigen", "https://admin.confidaraexpress.de/admin/reconciliation"]]);
  assert.deepEqual(w2.geoeffnet, []);
});

test("12 — Offline: nur Navigationen derselben Origin, Netz zuerst, sonst die Offline-Seite der App", async () => {
  const w = worker("admin.confidaraexpress.de", { netz: "aus" });
  let installiert = null;
  w.handler.install({ waitUntil: (p) => { installiert = p; } });
  await installiert;
  assert.deepEqual(w.gecacht, [["ce-app-offline-v1", "/admin-offline.html"]]);
  const anfrage = (url, mode = "navigate", method = "GET") => {
    let antwort = null;
    w.handler.fetch({ request: { url, mode, method }, preloadResponse: Promise.resolve(undefined), respondWith: (p) => { antwort = p; } });
    return antwort;
  };
  assert.equal(anfrage("https://admin.confidaraexpress.de/assets/x.js", "cors"), null, "keine Dateien");
  assert.equal(anfrage("https://admin.confidaraexpress.de/admin", "navigate", "POST"), null, "nur GET");
  assert.equal(anfrage("https://api.confidaraexpress.de/admin", "navigate"), null, "keine fremde Origin");
  assert.equal(await anfrage("https://admin.confidaraexpress.de/admin/users"), w.offline);
  const online = worker("partner.confidaraexpress.de");
  let p = null;
  online.handler.fetch({ request: { url: "https://partner.confidaraexpress.de/partner", mode: "navigate", method: "GET" },
    preloadResponse: Promise.resolve(undefined), respondWith: (x) => { p = x; } });
  assert.deepEqual(await p, { netz: true }, "mit Netz die echte Antwort");
});

test("13 — auf jedem anderen Host tut der Worker nichts", async () => {
  for (const host of ["confidaraexpress.de", "www.confidaraexpress.de", "evil-admin.confidaraexpress.de"]) {
    const w = worker(host);
    let installiert = null;
    w.handler.install({ waitUntil: (p) => { installiert = p; } });
    await installiert;
    assert.deepEqual(w.gecacht, [], host);
    let antwort = null;
    w.handler.fetch({ request: { url: `https://${host}/`, mode: "navigate", method: "GET" }, respondWith: (p) => { antwort = p; } });
    assert.equal(antwort, null, host);
    w.handler.push({ data: { json: () => ({ v: 1, art: "support_new", pfad: "/admin", tag: TAG }) }, waitUntil: () => {} });
    assert.equal(w.meldungen.length, 0, host);
  }
});

test("14 — Offline-Seiten: ohne Netz vollständig, ohne Daten, Nachtgrund der App", () => {
  for (const app of APPS) {
    const html = lies(`public/${app}-offline.html`);
    const ohne = ohneHtmlKommentare(html);
    assert.match(html, /<html lang="de">/);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.match(html, /<meta name="theme-color" content="#060B1C">/);
    assert.match(html, /<h1>Keine Internetverbindung<\/h1>/);
    assert.match(html, /<a class="retry" href="">Erneut versuchen<\/a>/);
    assert.ok(html.includes(APP_INFO[app].name));
    assert.doesNotMatch(ohne, /<script/i, "kein JavaScript");
    assert.doesNotMatch(ohne, /<link\b/i, "kein externes Stylesheet/Icon");
    assert.doesNotMatch(ohne, /<img\b|<iframe\b|<object\b/i);
    assert.doesNotMatch(ohne, /@import|@font-face|url\(/i);
    assert.doesNotMatch(ohne, /(src|href)="https?:/i);
    assert.doesNotMatch(ohne, /jumingo|transglobal/i);
  }
});
