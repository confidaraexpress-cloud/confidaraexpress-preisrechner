// E2E: Admin- und Partner-App als eigene Hosts (Betreiberauftrag 2026-11-22, FE-2) — gemessen am ECHTEN
// Produktionsbuild mit `vite preview` (der Service Worker gibt es nur im Produktionsbuild).
//
// Die Apps laufen lokal unter admin.localhost und partner.localhost (Chromium behandelt *.localhost als sicheren
// Kontext; die Vorschau-Weiche in vite.config.js liefert je Host das Startdokument wie nginx). Der Kundenbereich
// läuft unter 127.0.0.1 und bleibt unverändert.
//
// Kernzusicherungen:
//   • Jeder Host liefert sein Startdokument mit eigenem Manifest; fremde Pfade führen in der App auf ihren Start.
//   • Die Apps registrieren /app-sw.js; ihr Cache enthält genau EINE Datei (die Offline-Seite der App).
//   • Ohne Netz zeigt die App ihre eigene Offline-Seite — keine Oberfläche mit alten Daten.
//   • Ein Konto ohne Zugang sieht in der App einen Hinweis statt einer Weiterleitung in den Kundenbereich.
//   • Mitteilungen: nicht freigeschaltet → kein Einschalten, keine Erlaubnisfrage; eingeschaltet, Auswahl, aus mit
//     einem nachgebildeten Push-Dienst (KEIN echter Push-Dienst, kein echtes Gerät); inaktive Partner rufen die
//     Push-Routen mit Partnerprüfung nie auf; auf der Hauptdomain nur ein Hinweis auf die App.
//   • Der Worker zeigt eine zugestellte Mitteilung mit festem Text (Zustellung über das DevTools-Protokoll).
//
// Backend vollständig gemockt. Keine echte Buchung, keine echte Mail, kein Provider, keine echte Push-Mitteilung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const PORT = 5797;
const ADMIN_BASE = `http://admin.localhost:${PORT}`;
const PARTNER_BASE = `http://partner.localhost:${PORT}`;
const KUNDE_BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 1, email: "anna.admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE" };
const PARTNER = { id: 42, name: "Petra Partner", email: "petra@partner-vertrieb.de", status: "approved",
  role: "sales_partner", company_name: "Vertrieb Süd GmbH" };
const KUNDE = { id: 7, name: "Max Mustermann", email: "einkauf@muster-logistik.de", status: "approved",
  role: "customer", company_name: "Muster Logistik GmbH", country: "DE" };

const OHNE_PASSKEY = { passkeys: [], recoveryCodesRemaining: 0, passkeyRequired: false,
  session: { secondFactor: false, method: "password", stepUpUntil: null } };

const ADMIN_ARTEN = [
  { id: "support", label: "Neue Supportanfragen" },
  { id: "storno", label: "Neue Stornierungsanfragen" },
  { id: "klaerung", label: "Buchungen, die geklärt werden müssen" },
  { id: "rechnung", label: "Fehlende Rechnungsdokumente" },
  { id: "kunden", label: "Neue Kundenkonten und Anträge auf Sammelrechnung" },
];
// Ein öffentlicher P-256-Punkt im richtigen Format (65 Byte, 0x04) — ein Testwert, kein Schlüssel einer Umgebung.
const TEST_SCHLUESSEL = Buffer.from(new Uint8Array(65).map((_, i) => (i === 0 ? 4 : (i * 37) % 256))).toString("base64url");
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/e2e-geraet";

let OUT, server, browser;

async function warteAufServer() {
  const deadline = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(KUNDE_BASE); if (r.ok || r.status < 500) return; } catch { /* noch nicht da */ }
    if (Date.now() > deadline) throw new Error("Preview-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function warteBisWeg() {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { await fetch(KUNDE_BASE); } catch { return; }
    if (Date.now() > deadline) throw new Error("Preview-Server läuft noch");
    await new Promise((r) => setTimeout(r, 300));
  }
}

async function startePreview() {
  server = spawn("npx", ["vite", "preview", "--outDir", OUT, "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore", ...DEV_SERVER_SPAWN,
  });
  await warteAufServer();
}

function stoppePreview() {
  if (!server) return;
  stopDevServer(server, "SIGKILL");
  server = null;
}

/** GET an die Vorschau mit gesetztem Host — Node löst *.localhost nicht überall auf. */
function hole(host, pfad, accept = "text/html") {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, path: pfad, method: "GET",
      headers: { Host: `${host}:${PORT}`, Accept: accept } }, (res) => {
      let text = "";
      res.setEncoding("utf8");
      res.on("data", (c) => { text += c; });
      res.on("end", () => resolve({ status: res.statusCode, type: String(res.headers["content-type"] || ""), text }));
    });
    req.on("error", reject);
    req.end();
  });
}

/* Jeder Backendaufruf wird beantwortet — nie durchgereicht. `push`: Antworten der Push-Routen je Test. */
async function mockApi(ctx, { user, salesPartner = null, push = {} } = {}) {
  const aufrufe = [];
  await ctx.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    let body = null;
    try { body = req.postDataJSON(); } catch { body = null; }
    aufrufe.push({ m: req.method(), p, body });
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/kundenbereich") return json({ user, ...(salesPartner ? { salesPartner } : {}) });
    if (p === "/auth/security") return json(OHNE_PASSKEY);
    if (p === "/auth/sessions") return json({ sessions: [] });
    if (p === "/push/config") return json(push.config || { available: false, publicKey: null, app: "admin", categories: ADMIN_ARTEN });
    if (p === "/push/devices") return json({ devices: push.geraete ? push.geraete() : [] });
    if (p === "/push/subscription/status") return json(push.stand ? push.stand(body) : { subscribed: false });
    if (p === "/push/subscription" && req.method() === "PUT") {
      const [status, antwort] = push.einschalten ? push.einschalten(body) : [503, { error: "x", code: "PUSH_UNAVAILABLE" }];
      return json(antwort, status);
    }
    if (p === "/push/subscription/remove" && req.method() === "POST") return json({ removed: true });
    if (p.startsWith("/api/sales-partner/")) return json({ error: "nicht modelliert" }, 500);
    return json({});
  });
  return aufrufe;
}

async function mitToken(ctx, token) {
  await ctx.addInitScript((t) => { try { localStorage.setItem("ce_token", t); } catch { /* egal */ } }, token);
}

/* Nachgebildeter Push-Dienst im Browser: subscribe/getSubscription liefern ein Abonnement ohne echten Push-Dienst;
   gezählt werden Abonnieren, Abmelden und jede Erlaubnisfrage. */
async function pushAttrappe(ctx) {
  await ctx.addInitScript((endpoint) => {
    window.__push = { abonniert: 0, abgemeldet: 0, fragen: 0, userVisibleOnly: null, schluesselBytes: null };
    let aktiv = null;
    const abo = () => ({
      endpoint,
      options: { applicationServerKey: null },
      toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } }),
      unsubscribe: async () => { window.__push.abgemeldet += 1; aktiv = null; return true; },
    });
    PushManager.prototype.getSubscription = async function getSubscription() { return aktiv; };
    PushManager.prototype.subscribe = async function subscribe(optionen) {
      window.__push.abonniert += 1;
      window.__push.userVisibleOnly = optionen && optionen.userVisibleOnly;
      window.__push.schluesselBytes = optionen && optionen.applicationServerKey ? optionen.applicationServerKey.byteLength : null;
      aktiv = abo();
      return aktiv;
    };
    const frage = Notification.requestPermission.bind(Notification);
    Notification.requestPermission = (...a) => { window.__push.fragen += 1; return frage(...a); };
  }, ENDPOINT);
}

test.before(async () => {
  OUT = mkdtempSync(path.join(os.tmpdir(), "ce-app-hosts-"));
  await new Promise((resolve, reject) => {
    const b = spawn("npx", ["vite", "build", "--outDir", OUT, "--emptyOutDir", "--logLevel", "error"], { stdio: "ignore", windowsHide: true });
    b.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`vite build beendet mit ${code}`))));
    b.on("error", reject);
  });
  await startePreview();
  // Kanal „chromium“: das volle Playwright-Chromium im neuen Headless-Modus (ohne Fenster). Die Headless-Shell
  // verweigert die Erlaubnis für Mitteilungen grundsätzlich (Notification.permission bleibt „denied“, showNotification
  // scheitert) — A6 und A8 brauchen sie. Die CI installiert dieses Chromium mit (`playwright install chromium`).
  const eigener = chromiumExecutablePath();
  browser = await chromium.launch({
    executablePath: eigener,
    channel: eigener ? undefined : "chromium",
    args: ["--host-resolver-rules=MAP admin.localhost 127.0.0.1, MAP partner.localhost 127.0.0.1"],
  });
});

test.after(async () => {
  if (browser) await browser.close();
  stoppePreview();
  if (OUT) rmSync(OUT, { recursive: true, force: true });
});

// ─────────────────────────────────────────────────────────────────────────────

test("A1 — jeder Host liefert sein Startdokument mit eigenem Manifest; der Kundenbereich bleibt unverändert", async () => {
  for (const pfad of ["/admin", "/admin/users", "/admin/support-requests/12", "/dashboard"]) {
    const r = await hole("admin.localhost", pfad);
    assert.equal(r.status, 200, `admin ${pfad}`);
    assert.match(r.text, /<html lang="de" data-ce-bereich="admin">/, `admin ${pfad}`);
    assert.match(r.text, /<link rel="manifest" href="\/admin\.webmanifest" \/>/);
    assert.match(r.text, /<title>ConfidaraExpress Admin<\/title>/);
    assert.match(r.text, /<script type="module"[^>]*src="\/assets\/[^"]+\.js"/, "das Bündel ist eingehängt");
    assert.doesNotMatch(r.text, /src="\/src\/main\.jsx"/, "kein Entwicklungseinstieg im Build");
  }
  const login = await hole("admin.localhost", "/admin/login");
  assert.match(login.text, /<link rel="manifest" href="\/admin\.webmanifest" \/>/, "Admin-Anmeldung mit dem Kopf der Admin-App");
  assert.match(login.text, /apple-touch-icon-admin-v1\.png/);
  assert.doesNotMatch(login.text, /manifest\.webmanifest/);
  for (const pfad of ["/partner", "/partner/login"]) {
    const r = await hole("partner.localhost", pfad);
    assert.match(r.text, /<html lang="de" data-ce-bereich="partner">/, `partner ${pfad}`);
    assert.match(r.text, /<link rel="manifest" href="\/partner\.webmanifest" \/>/);
  }
  const kundeLogin = await hole("127.0.0.1", "/admin/login");
  assert.match(kundeLogin.text, /<link rel="manifest" href="\/manifest\.webmanifest"/, "Hauptdomain: Admin-Anmeldung wie bisher");
  const kunde = await hole("127.0.0.1", "/dashboard");
  assert.match(kunde.text, /<link rel="manifest" href="\/manifest\.webmanifest"/);
  assert.doesNotMatch(kunde.text, /data-ce-bereich="(admin|partner)"/);
  for (const [host, datei, name] of [["admin.localhost", "/admin.webmanifest", "ConfidaraExpress Admin"],
    ["partner.localhost", "/partner.webmanifest", "ConfidaraExpress Partner"]]) {
    const m = await hole(host, datei, "*/*");
    assert.equal(m.status, 200);
    assert.equal(JSON.parse(m.text).name, name);
  }
  assert.equal((await hole("admin.localhost", "/app-sw.js", "*/*")).status, 200);
  assert.equal((await hole("admin.localhost", "/admin-offline.html", "*/*")).status, 200);
});

test("A2 — Admin-App: fremde Pfade auf den Start, eigener Worker, ein Cache mit einer Datei, offline die Offline-Seite", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const aufrufe = await mockApi(ctx, { user: ADMIN });
  await mitToken(ctx, "e2e-admin-token");
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));

  await page.goto(`${ADMIN_BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((u) => u.pathname === "/admin", { timeout: 20000 });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.ceBereich), "admin");
  assert.equal(await page.evaluate(() => document.querySelector('link[rel="manifest"]').href), `${ADMIN_BASE}/admin.webmanifest`);
  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    return { scope: r.scope, script: r.active && r.active.scriptURL };
  });
  assert.deepEqual(reg, { scope: `${ADMIN_BASE}/`, script: `${ADMIN_BASE}/app-sw.js` });
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true, "Seite nicht kontrolliert");
  for (const pfad of ["/admin/users", "/admin/sicherheit", "/partner"]) {
    await page.goto(`${ADMIN_BASE}${pfad}`, { waitUntil: "networkidle" });
  }
  assert.equal(new URL(page.url()).pathname, "/admin", "/partner gehört nicht zur Admin-App");
  assert.ok(aufrufe.length > 0, "keine Backendnutzung — die Prüfung wäre wertlos");

  const caches = await page.evaluate(async () => {
    const out = {};
    for (const name of await caches.keys()) out[name] = (await (await caches.open(name)).keys()).map((r) => r.url);
    return out;
  });
  assert.deepEqual(caches, { "ce-app-offline-v1": [`${ADMIN_BASE}/admin-offline.html`] });

  // Netz weg: der Server ist nicht mehr erreichbar. Der Server startet in jedem Fall wieder (auch bei Fehlschlag) —
  // sonst scheiterten alle folgenden Prüfungen an der Verbindung statt an ihrer eigenen Aussage.
  stoppePreview();
  try {
    await warteBisWeg();
    await page.goto(`${ADMIN_BASE}/admin/invoices`, { waitUntil: "domcontentloaded" });
    assert.equal((await page.textContent("h1"))?.trim(), "Keine Internetverbindung");
    assert.equal(await page.title(), "Keine Internetverbindung · ConfidaraExpress Admin");
    assert.ok((await page.textContent("body")).includes("Die Admin-App lädt Kunden, Sendungen, Rechnungen und Klärungen immer frisch vom Server."));
    assert.equal(await page.locator(".adm-shell, .app-shell, #root > *").count(), 0, "keine App-Oberfläche mit alten Daten");
    assert.equal(await page.locator("a.retry").getAttribute("href"), "");
  } finally {
    if (!server) await startePreview();
  }
  await page.goto(`${ADMIN_BASE}/admin`, { waitUntil: "networkidle" });
  assert.equal(new URL(page.url()).pathname, "/admin");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("A3 — Partner-App: eigener Worker, fremde Pfade auf den Start; ein Kundenkonto sieht den Hinweis der App", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await mockApi(ctx, { user: KUNDE });
  await mitToken(ctx, "e2e-kunden-token");
  const page = await ctx.newPage();
  await page.goto(`${PARTNER_BASE}/dashboard?page=invoices`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((u) => u.pathname === "/partner", { timeout: 20000 });
  await page.getByRole("heading", { name: "Dieses Konto hat keinen Zugang zur Partner-App" }).waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).pathname, "/partner", "keine Weiterleitung in den Kundenbereich");
  const link = page.getByRole("link", { name: "Zum Kundenbereich" });
  assert.equal(await link.getAttribute("href"), `http://localhost:${PORT}/dashboard`);
  const reg = await page.evaluate(async () => (await navigator.serviceWorker.ready).active.scriptURL);
  assert.equal(reg, `${PARTNER_BASE}/app-sw.js`);
  await ctx.close();

  // Dasselbe in der Admin-App.
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await mockApi(ctx2, { user: KUNDE });
  await mitToken(ctx2, "e2e-kunden-token");
  const page2 = await ctx2.newPage();
  await page2.goto(`${ADMIN_BASE}/admin/users`, { waitUntil: "domcontentloaded" });
  await page2.getByRole("heading", { name: "Dieses Konto hat keinen Zugang zur Admin-App" }).waitFor({ state: "visible" });
  assert.equal(new URL(page2.url()).pathname, "/admin/users");
  await ctx2.close();
});

test("A4 — Hauptdomain unverändert: /sw.js, eigenes Manifest; Sicherheit ohne App-Karten und ohne Push-Aufruf", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const aufrufe = await mockApi(ctx, { user: ADMIN });
  await mitToken(ctx, "e2e-admin-token");
  const page = await ctx.newPage();
  await page.goto(`${KUNDE_BASE}/admin/sicherheit`, { waitUntil: "networkidle" });
  await page.locator("#ce-geraete").waitFor({ state: "visible", timeout: 20000 });
  assert.equal(await page.locator("#ce-push, #ce-app-install, #ce-app-hinweis").count(), 0,
    "Mitteilungen und Installation nur in der App; vor der Live-Prüfung auch kein Verweis auf sie");
  assert.deepEqual(aufrufe.filter((a) => a.p.startsWith("/push/")), [], "auf der Hauptdomain kein Push-Aufruf");
  const reg = await page.evaluate(async () => (await navigator.serviceWorker.ready).active.scriptURL);
  assert.equal(reg, `${KUNDE_BASE}/sw.js`);
  assert.equal(await page.evaluate(() => document.querySelector('link[rel="manifest"]').getAttribute("href")), "/manifest.webmanifest");
  await ctx.close();
});

test("A5 — Mitteilungen nicht freigeschaltet: „derzeit nicht verfügbar“, kein Einschalten, keine Erlaubnisfrage", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const aufrufe = await mockApi(ctx, { user: ADMIN });
  await mitToken(ctx, "e2e-admin-token");
  await pushAttrappe(ctx);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_BASE}/admin/sicherheit`, { waitUntil: "networkidle" });
  await page.locator("#ce-push-nicht-verfuegbar").waitFor({ state: "visible", timeout: 20000 });
  assert.equal((await page.textContent("#ce-push-nicht-verfuegbar")).trim(), "Mitteilungen sind derzeit nicht verfügbar.");
  assert.equal(await page.locator("#ce-push-einschalten").count(), 0);
  assert.equal(await page.locator("#ce-app-install").count(), 1, "Installation steht daneben");
  assert.deepEqual(await page.evaluate(() => ({ ...window.__push })), {
    abonniert: 0, abgemeldet: 0, fragen: 0, userVisibleOnly: null, schluesselBytes: null,
  });
  assert.equal(aufrufe.filter((a) => a.m === "PUT").length, 0);
  await ctx.close();
});

test("A6 — Mitteilungen ein, Auswahl, aus (nachgebildeter Push-Dienst); ein abgelehnter Eintrag nimmt das Abonnement zurück", async () => {
  const geraete = [];
  const abo = (categories) => ({ id: 7, app: "admin", deviceLabel: "Chrome unter Windows", categories,
    createdAt: "2026-11-22T09:15:00.000Z", lastSuccessAt: null });
  const push = {
    config: { available: true, publicKey: TEST_SCHLUESSEL, app: "admin", categories: ADMIN_ARTEN },
    geraete: () => geraete,
    stand: (b) => (geraete.length && b && b.endpoint === ENDPOINT ? { subscribed: true, currentSession: true, subscription: geraete[0] } : { subscribed: false }),
    einschalten: (b) => {
      const arten = b.categories || ADMIN_ARTEN.map((k) => k.id);
      geraete.splice(0, geraete.length, abo(arten));
      return [200, { subscribed: true, currentSession: true, subscription: geraete[0] }];
    },
  };
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(["notifications"], { origin: ADMIN_BASE });
  const aufrufe = await mockApi(ctx, { user: ADMIN, push });
  await mitToken(ctx, "e2e-admin-token");
  await pushAttrappe(ctx);
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_BASE}/admin/sicherheit`, { waitUntil: "networkidle" });
  const ein = page.locator("#ce-push-einschalten");
  await ein.waitFor({ state: "visible", timeout: 20000 });
  for (const k of ADMIN_ARTEN) assert.ok((await page.textContent("#ce-push")).includes(k.label), k.label);

  await ein.click();
  await page.getByText("Mitteilungen sind auf diesem Gerät eingeschaltet.").waitFor({ state: "visible" });
  const put = aufrufe.filter((a) => a.m === "PUT" && a.p === "/push/subscription");
  assert.equal(put.length, 1);
  assert.deepEqual(Object.keys(put[0].body), ["subscription"], "ohne Auswahl: alle Arten (Serverstandard)");
  assert.deepEqual(Object.keys(put[0].body.subscription).sort(), ["endpoint", "keys"]);
  assert.deepEqual(Object.keys(put[0].body.subscription.keys).sort(), ["auth", "p256dh"]);
  assert.equal(put[0].body.subscription.endpoint, ENDPOINT);
  const zaehler = await page.evaluate(() => ({ ...window.__push }));
  assert.equal(zaehler.abonniert, 1);
  assert.equal(zaehler.userVisibleOnly, true);
  assert.equal(zaehler.schluesselBytes, 65);
  assert.equal(await page.locator("#ce-push input[type=checkbox]:checked").count(), 5);
  await page.locator('[data-push-geraet="7"]').getByText("Dieses Gerät").waitFor({ state: "visible" });

  // Eine Art abwählen: derselbe Endpunkt, die übrigen vier in fester Reihenfolge.
  await page.locator('input[data-art="storno"]').uncheck();
  await page.getByText("Auswahl gespeichert.").waitFor({ state: "visible" });
  const put2 = aufrufe.filter((a) => a.m === "PUT" && a.p === "/push/subscription");
  assert.equal(put2.length, 2);
  assert.deepEqual(put2[1].body.categories, ["support", "klaerung", "rechnung", "kunden"]);

  // Ausschalten: erst der Server, dann das Abonnement im Browser.
  geraete.length = 0;
  await page.locator("#ce-push-ausschalten").click();
  await page.getByText("Mitteilungen sind ausgeschaltet.").waitFor({ state: "visible" });
  const weg = aufrufe.filter((a) => a.p === "/push/subscription/remove");
  assert.equal(weg.length, 1);
  assert.deepEqual(weg[0].body, { endpoint: ENDPOINT });
  assert.equal((await page.evaluate(() => window.__push.abgemeldet)), 1);
  await ein.waitFor({ state: "visible" });
  await ctx.close();

  // Der Server lehnt ab (Gerätegrenze): Hinweis, und das gerade entstandene Abonnement wird zurückgenommen.
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.grantPermissions(["notifications"], { origin: ADMIN_BASE });
  await mockApi(ctx2, { user: ADMIN, push: { ...push, einschalten: () => [409, { error: "Roh", code: "PUSH_DEVICE_LIMIT" }] } });
  await mitToken(ctx2, "e2e-admin-token");
  await pushAttrappe(ctx2);
  const page2 = await ctx2.newPage();
  await page2.goto(`${ADMIN_BASE}/admin/sicherheit`, { waitUntil: "networkidle" });
  await page2.locator("#ce-push-einschalten").click();
  await page2.locator("#ce-push-fehler").waitFor({ state: "visible" });
  assert.match(await page2.textContent("#ce-push-fehler"), /Entfernen Sie unten zuerst ein Gerät/);
  assert.doesNotMatch(await page2.textContent("#ce-push-fehler"), /Roh|PUSH_/);
  assert.deepEqual(await page2.evaluate(() => [window.__push.abonniert, window.__push.abgemeldet]), [1, 1]);
  await page2.locator("#ce-push-einschalten").waitFor({ state: "visible" });
  await ctx2.close();
});

test("A7 — inaktiver Partner: Hinweis, kein Aufruf von Konfiguration, Stand oder Einschalten (403 hieße Abmeldung)", async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const aufrufe = await mockApi(ctx, { user: PARTNER, salesPartner: { status: "inactive" } });
  await mitToken(ctx, "e2e-partner-token");
  const page = await ctx.newPage();
  await page.goto(`${PARTNER_BASE}/partner?page=account`, { waitUntil: "networkidle" });
  await page.locator("#ce-push").waitFor({ state: "visible", timeout: 20000 });
  assert.ok((await page.textContent("#ce-push")).includes("Mitteilungen gibt es nur für aktive Vertriebspartner."));
  const push = aufrufe.filter((a) => a.p.startsWith("/push/")).map((a) => `${a.m} ${a.p}`);
  assert.deepEqual(push.filter((x) => x !== "GET /push/devices"), [], `unerwartete Push-Aufrufe: ${push.join(", ")}`);
  assert.equal(await page.locator("#ce-app-install").count(), 1);
  await ctx.close();
});

test("A8 — der Worker zeigt eine zugestellte Mitteilung mit festem Text und ignoriert fremde Zielpfade", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(["notifications"], { origin: ADMIN_BASE });
  await mockApi(ctx, { user: ADMIN });
  await mitToken(ctx, "e2e-admin-token");
  const page = await ctx.newPage();
  await page.goto(`${ADMIN_BASE}/admin`, { waitUntil: "networkidle" });
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });

  const cdp = await ctx.newCDPSession(page);
  const registrierungen = new Map();
  cdp.on("ServiceWorker.workerRegistrationUpdated", (e) => {
    for (const r of e.registrations) registrierungen.set(r.registrationId, r);
  });
  await cdp.send("ServiceWorker.enable");
  const deadline = Date.now() + 10000;
  let reg = null;
  while (!reg && Date.now() < deadline) {
    reg = [...registrierungen.values()].find((r) => r.scopeURL === `${ADMIN_BASE}/` && !r.isDeleted) || null;
    if (!reg) await new Promise((r) => setTimeout(r, 100));
  }
  assert.ok(reg, "Registrierung des App-Workers nicht gefunden");

  const zustellen = (daten) => cdp.send("ServiceWorker.deliverPushMessage",
    { origin: ADMIN_BASE, registrationId: reg.registrationId, data: JSON.stringify(daten) });
  const lies = () => page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready;
    for (let i = 0; i < 50; i += 1) {
      const liste = await r.getNotifications();
      if (liste.length) return liste.map((n) => ({ title: n.title, body: n.body, tag: n.tag, pfad: n.data && n.data.pfad }));
      await new Promise((ok) => setTimeout(ok, 100));
    }
    return [];
  });
  const schliesse = () => page.evaluate(async () => {
    for (const n of await (await navigator.serviceWorker.ready).getNotifications()) n.close();
  });

  await zustellen({ v: 1, art: "support_new", pfad: "/admin/support-requests/12", tag: "0123456789abcdef0123456789abcdef",
    text: "Kunde Max Mustermann" });
  assert.deepEqual(await lies(), [{ title: "ConfidaraExpress Admin", body: "Eine neue Supportanfrage wartet auf Antwort.",
    tag: "0123456789abcdef0123456789abcdef", pfad: "/admin/support-requests/12" }]);
  await schliesse();

  await zustellen({ v: 1, art: "support_new", pfad: "https://evil.example/admin", tag: "0123456789abcdef0123456789abcdef" });
  assert.deepEqual(await lies(), [{ title: "ConfidaraExpress Admin", body: "Es gibt Neuigkeiten in der App.", tag: "", pfad: "/admin" }]);
  await schliesse();
  await cdp.detach();
  await ctx.close();
});
