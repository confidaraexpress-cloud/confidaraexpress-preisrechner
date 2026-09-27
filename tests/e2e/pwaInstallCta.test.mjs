// E2E: „ConfidaraExpress als App" — Installationszugang nach Plattform, erst
// nach dem Login, ohne automatischen Dialog; sicherer Rücksprung nach dem Login.
//
// Kernzusicherungen:
//   • Vor dem Login zeigt ConfidaraExpress keinen eigenen Installationszugang —
//     auch dann nicht, wenn der Browser ein Installationsereignis liefert.
//   • Nach dem Login sitzt die Karte in den Kontoeinstellungen direkt nach
//     „Sicherheit"; der Browserdialog öffnet sich ausschließlich auf Klick.
//   • Der Navigationseintrag erscheint nur mit echtem Installationsweg und
//     verschwindet nach der ersten Benutzung (auch nach einem Neuladen).
//   • Als App geöffnet: Status statt Aktion. iPhone/iPad und Safari am Mac:
//     Anleitung statt nachgebautem Dialog. Firefox: ruhiger Satz ohne Knopf.
//   • Kein horizontaler Überlauf bei 390/834/1440 px.
//   • Geschützte Adresse → Login → dieselbe Adresse; fremde Ziele → Übersicht.
//
// Das Browserereignis `beforeinstallprompt` liefert Chromium nicht zuverlässig
// in einer Testumgebung; es wird deshalb synthetisch mit einem Zähler für
// prompt() ausgelöst — geprüft wird genau die Reaktion der Anwendung darauf.
//
// Backend vollständig gemockt. Keine echte Buchung, keine echte Mail, kein Provider.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5442, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const UA = {
  iphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1",
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Safari/605.1.15",
  firefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0",
};

const USER = {
  id: 1, email: "nico.weber@weber-logistik.example.de", company_name: "Weber Logistik GmbH", name: "Nico Weber",
  role: "customer", status: "approved", country: "DE", zip: "10115", city: "Berlin", street: "Musterstraße 1",
  customer_number: "CE-K-10001", payment_term: 14,
};

const KARTENTITEL = "ConfidaraExpress als App";
const INSTALL_TEXTE = ["App installieren", "Als App nutzen", KARTENTITEL, "Anleitung anzeigen", "Zum Home-Bildschirm", "Zum Dock hinzufügen"];

let server, browser;

async function neueSeite({ angemeldet = true, userAgent, viewport = { width: 1440, height: 900 }, standalone = false } = {}) {
  const ctx = await browser.newContext({ viewport, ...(userAgent ? { userAgent } : {}) });
  const state = { loginCalls: 0 };
  await ctx.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/login" && req.method() === "POST") { state.loginCalls++; return json({ message: "ok", token: "e2e-cta-token" }); }
    if (p === "/kundenbereich") {
      const auth = req.headers()["authorization"] || "";
      return auth.includes("e2e-cta-token") ? json({ user: USER }) : json({ error: "Token fehlt", code: "SESSION_EXPIRED" }, 401);
    }
    if (p === "/kunde/notifications/unread-count") return json({ unreadCount: 0, snapshotAt: "2026-09-27T08:00:00.000Z" });
    if (p === "/kunde/notifications") return json({ notifications: [], unreadCount: 0, snapshotAt: "2026-09-27T08:00:00.000Z" });
    if (p === "/kunde/shipments") return json({ shipments: [], nextCursor: null });
    if (p === "/kunde/invoices") return json({ invoices: [], summary: { open_amount: 0, open_count: 0, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: false }, nextCursor: null });
    if (p === "/kunde/support-requests") return json({ supportRequests: [], nextCursor: null });
    return json({ error: "nicht modelliert" }, 404);
  });
  await ctx.addInitScript(({ angemeldet: an, standalone: sa }) => {
    try { if (an) localStorage.setItem("ce_token", "e2e-cta-token"); } catch { /* egal */ }
    if (sa) {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (q) => (q === "(display-mode: standalone)"
        ? { matches: true, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } }
        : original(q));
    }
  }, { angemeldet, standalone });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { ctx, page, fehler, state };
}

// Synthetisches beforeinstallprompt mit Zähler für prompt().
async function installEreignis(page) {
  return page.evaluate(() => {
    window.__promptAufrufe = window.__promptAufrufe || 0;
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = () => { window.__promptAufrufe += 1; return Promise.resolve(); };
    e.userChoice = Promise.resolve({ outcome: "dismissed", platform: "web" });
    window.dispatchEvent(e);
    return e.defaultPrevented;
  });
}

const promptAufrufe = (page) => page.evaluate(() => window.__promptAufrufe || 0);
const karte = (page) => page.locator("#pwa-install-card");
const navEintrag = (page, name) => page.locator(".pp-nav .nitem--utility", { hasText: name });

async function kontoeinstellungen(page) {
  await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "networkidle" });
  await karte(page).waitFor({ timeout: 20000 });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore", detached: true,
  });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(BASE); if (r.ok || r.status < 500) break; } catch { /* noch nicht da */ }
    if (Date.now() > deadline) throw new Error("Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 300));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

// ─────────────────────────────────────────────────────────────────────────────

test("C1 — vor dem Login kein eigener Installationszugang, auch nicht bei Browserereignis", async () => {
  const { ctx, page, fehler } = await neueSeite({ angemeldet: false });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.locator("#auth-email").waitFor();
  const abgefangen = await installEreignis(page);
  assert.equal(abgefangen, true, "das Browserereignis wird nicht zurückgehalten (preventDefault)");
  await page.waitForTimeout(300);
  const text = await page.textContent("body");
  for (const t of INSTALL_TEXTE) assert.ok(!text.includes(t), `vor dem Login sichtbar: ${t}`);
  assert.equal(await promptAufrufe(page), 0, "Installationsdialog ohne Nutzeraktion");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("C2 — nach dem Login: Karte direkt nach „Sicherheit“; ohne Browserereignis ruhiger Satz, kein Knopf", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await kontoeinstellungen(page);
  const titel = await page.evaluate(() => {
    const spalten = document.querySelectorAll(".profile-grid .profile-col");
    return [...spalten[1].querySelectorAll(".table-card-title")].map((t) => t.textContent.trim());
  });
  assert.deepEqual(titel.slice(-2), ["Sicherheit", KARTENTITEL], `rechte Spalte: ${JSON.stringify(titel)}`);
  assert.ok((await karte(page).textContent()).includes("Andernfalls finden Sie die Installation im Menü Ihres Browsers."));
  assert.equal(await karte(page).locator("button").count(), 0);
  assert.equal(await navEintrag(page, "App installieren").count(), 0);
  assert.equal(await navEintrag(page, "Als App nutzen").count(), 0);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("C3 — Browserdialog nur auf Klick; danach verschwindet der Navigationseintrag, auch nach Neuladen", async () => {
  const { ctx, page } = await neueSeite();
  await kontoeinstellungen(page);
  assert.equal(await installEreignis(page), true);
  const knopf = karte(page).getByRole("button", { name: "App installieren" });
  await knopf.waitFor();
  await navEintrag(page, "App installieren").waitFor();
  assert.equal(await promptAufrufe(page), 0, "Dialog ohne Klick geöffnet");

  await knopf.click();
  await page.waitForFunction(() => window.__promptAufrufe === 1);
  // Ein Ereignis ist nur einmal nutzbar: danach kein Knopf, und der Hinweis ist erledigt.
  await knopf.waitFor({ state: "detached" });
  assert.equal(await navEintrag(page, "App installieren").count(), 0);

  await page.reload({ waitUntil: "networkidle" });
  await karte(page).waitFor();
  await installEreignis(page);
  await karte(page).getByRole("button", { name: "App installieren" }).waitFor();
  assert.equal(await navEintrag(page, "App installieren").count(), 0, "Hinweis nach Benutzung erneut sichtbar");
  await ctx.close();
});

test("C4 — der Navigationseintrag öffnet den Browserdialog ebenfalls nur auf Klick", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator(".app-shell").waitFor();
  await installEreignis(page);
  const eintrag = navEintrag(page, "App installieren");
  await eintrag.waitFor();
  // Er steht direkt vor „Abmelden".
  const reihenfolge = await page.evaluate(() =>
    [...document.querySelectorAll(".pp-nav .nitem--utility")].map((b) => b.textContent.trim()));
  assert.deepEqual(reihenfolge, ["App installieren", "Abmelden"]);
  assert.equal(await promptAufrufe(page), 0);
  await eintrag.click();
  await page.waitForFunction(() => window.__promptAufrufe === 1);
  await ctx.close();
});

test("C5 — als App geöffnet: Status statt Aktion, kein Navigationseintrag", async () => {
  const { ctx, page } = await neueSeite({ standalone: true });
  await kontoeinstellungen(page);
  await installEreignis(page);
  await page.waitForTimeout(300);
  assert.ok((await karte(page).textContent()).includes("Sie nutzen ConfidaraExpress als App."));
  assert.equal(await karte(page).locator("button").count(), 0);
  assert.equal(await navEintrag(page, "App installieren").count(), 0);
  await ctx.close();
});

test("C6 — iPhone: Anleitung statt Dialog, Drawer-Eintrag führt zur geöffneten Anleitung", async () => {
  const { ctx, page } = await neueSeite({ userAgent: UA.iphone, viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.locator(".mobile-topbar .hamburger-btn").click();
  const eintrag = navEintrag(page, "Als App nutzen");
  await eintrag.waitFor();
  await eintrag.click();

  await karte(page).waitFor();
  const knopf = karte(page).getByRole("button", { name: "Anleitung anzeigen" });
  assert.equal(await knopf.getAttribute("aria-expanded"), "true", "die Anleitung ist nicht geöffnet");
  assert.equal(await karte(page).locator(".pwa-card-steps li").count(), 3);
  assert.ok((await karte(page).textContent()).includes("Vom Home-Bildschirm öffnet ConfidaraExpress wie eine App"));
  assert.ok((await karte(page).textContent()).includes("Wählen Sie „Zum Home-Bildschirm“."));
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.textContent.trim()), KARTENTITEL,
    "der Fokus liegt nicht auf der Karte");
  assert.ok((await karte(page).textContent()).includes("In der App melden Sie sich einmalig neu an."));

  // Zuklappen und wieder öffnen — ein normaler Umschalter.
  await knopf.click();
  assert.equal(await knopf.getAttribute("aria-expanded"), "false");
  assert.equal(await karte(page).locator(".pwa-card-guide").isVisible(), false);

  // Der Drawer-Eintrag ist nach der Benutzung verschwunden.
  await page.locator(".mobile-topbar .hamburger-btn").click();
  await page.waitForTimeout(300);
  assert.equal(await navEintrag(page, "Als App nutzen").count(), 0);
  await ctx.close();
});

test("C7 — Safari am Mac: Anleitung zum Dock; Firefox: kein Knopf, kein Eintrag", async () => {
  {
    const { ctx, page } = await neueSeite({ userAgent: UA.safariMac });
    await kontoeinstellungen(page);
    const knopf = karte(page).getByRole("button", { name: "Anleitung anzeigen" });
    assert.equal(await knopf.getAttribute("aria-expanded"), "false");
    await knopf.click();
    assert.equal(await knopf.getAttribute("aria-expanded"), "true");
    assert.ok((await karte(page).textContent()).includes("Aus dem Dock öffnet ConfidaraExpress wie eine App"));
    assert.ok((await karte(page).textContent()).includes("Zum Dock hinzufügen …"));
    await ctx.close();
  }
  {
    const { ctx, page } = await neueSeite({ userAgent: UA.firefox });
    await kontoeinstellungen(page);
    assert.ok((await karte(page).textContent()).includes("Ihr Browser bietet keine App-Installation an."));
    assert.equal(await karte(page).locator("button").count(), 0);
    assert.equal(await page.locator(".pp-nav .nitem--utility").count(), 1, "nur „Abmelden“");
    await ctx.close();
  }
});

test("C8 — kein horizontaler Überlauf; auf dem Smartphone füllt die Aktion die Kartenbreite", async () => {
  for (const viewport of [{ width: 320, height: 640 }, { width: 390, height: 844 }, { width: 834, height: 1112 }, { width: 1440, height: 900 }]) {
    const { ctx, page } = await neueSeite({ userAgent: UA.iphone, viewport });
    await kontoeinstellungen(page);
    const m = await page.evaluate(() => {
      const knopf = document.querySelector("#pwa-install-card .pwa-card-row .btn");
      const zeile = document.querySelector("#pwa-install-card .pwa-card-row");
      return {
        ueberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        knopf: knopf.getBoundingClientRect().width,
        zeile: zeile.getBoundingClientRect().width,
        kartenRechts: document.querySelector("#pwa-install-card").getBoundingClientRect().right,
      };
    });
    assert.ok(m.ueberlauf <= 0, `${viewport.width}px: Überlauf ${m.ueberlauf}px`);
    assert.ok(m.kartenRechts <= viewport.width, `${viewport.width}px: Karte ragt aus dem Bild`);
    if (viewport.width <= 480) assert.ok(Math.abs(m.knopf - m.zeile) <= 1, `${viewport.width}px: Knopf ${m.knopf} statt ${m.zeile}`);
    await ctx.close();
  }
});

test("C9 — geschützte Adresse → Login → dieselbe Adresse; fremdes Ziel → Übersicht", async () => {
  {
    const { ctx, page, state } = await neueSeite({ angemeldet: false });
    await page.goto(`${BASE}/dashboard?page=support&ticket=77`, { waitUntil: "networkidle" });
    assert.equal(new URL(page.url()).pathname, "/login");
    await page.fill("#auth-email", "nico.weber@weber-logistik.example.de");
    await page.fill("#auth-password", "ein-sicheres-Passwort-1");
    await page.locator("button.auth-cta").click();
    await page.waitForURL((u) => new URL(u).pathname === "/dashboard", { timeout: 20000 });
    await page.getByRole("heading", { name: "Supportanfragen" }).waitFor({ timeout: 20000 });
    assert.equal(state.loginCalls, 1);
    await ctx.close();
  }
  {
    const { ctx, page } = await neueSeite({ angemeldet: false });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    // Ein manipulierter Rücksprungwunsch im Router-State.
    await page.evaluate(() => {
      window.history.replaceState({ usr: { from: "//evil.example/dashboard" }, key: "manipuliert", idx: 0 }, "", "/login");
    });
    await page.reload({ waitUntil: "networkidle" });
    await page.fill("#auth-email", "nico.weber@weber-logistik.example.de");
    await page.fill("#auth-password", "ein-sicheres-Passwort-1");
    await page.locator("button.auth-cta").click();
    await page.waitForURL((u) => new URL(u).pathname === "/dashboard", { timeout: 20000 });
    assert.equal(new URL(page.url()).host, `127.0.0.1:${PORT}`, "fremdes Ziel angesteuert");
    await ctx.close();
  }
});
