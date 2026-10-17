// Browser-Funktionstest des Adressbuchs (Auftrag 1, P7, 2026-10-17).
//
// Echte Komponenten im echten Browser gegen einen kontrollierten Mock des Adressbuch-Vertrags
// (routes/addresses.js): Liste mit Rolle, Suche, Favoritenfilter und Keyset-Cursor; Anlegen;
// Ändern als Teil-Update; genau ein Standard je Rolle; Löschen mit Nachrücken; 404 für eine
// fremde oder bereits gelöschte Adresse. KEINE produktiven Kundenadressen, kein echter Server.
//
// Abgesichert wird das Verhalten aus dem Audit: Favoriten- und Standardklicks senden NUR die
// Änderung (vorher das ganze Objekt, das einen alten Standard zurückholen konnte), Duplizieren
// hält die 80-Zeichen-Grenze, Fehler nennen den Vorgang statt „Failed to fetch", Serverfehler
// stehen am Feld, und die Übernahme in „Neue Sendung" füllt die richtige Seite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5281, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "kunde@example.com", company_name: "Testfirma", name: "Test Kunde",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};

const adresse = (id, over = {}) => ({
  id, label: null, company: null, contactName: null, firstName: "Vor" + id, lastName: "Name" + id,
  email: `kontakt${id}@example.org`, phone: "+49 30 100" + id, streetAndNumber: `Teststraße ${id}`, addressAdd: null,
  postalCode: "10115", city: "Berlin", state: null, country: "DE", notes: null, role: "both",
  favorite: false, isDefaultSender: false, isDefaultRecipient: false,
  createdAt: new Date(Date.UTC(2026, 8, 1) + id * 60000).toISOString(), updatedAt: "2026-09-01T10:00:00Z", ...over,
});

/** Ein kleiner Server im Speicher — derselbe Vertrag wie routes/addresses.js. */
function mockServer(start) {
  const s = { items: start.map((a) => ({ ...a })), puts: [], posts: [], deletes: [], gets: 0, failGet: false, unbekannt: new Set() };
  s.passt = (a, role, q, fav) => {
    if (role === "sender" && !["sender", "both"].includes(a.role)) return false;
    if (role === "recipient" && !["recipient", "both"].includes(a.role)) return false;
    if (fav && !a.favorite) return false;
    if (q) {
      const t = [a.label, a.company, a.firstName, a.lastName, a.city, a.streetAndNumber].filter(Boolean).join(" ").toLowerCase();
      if (!t.includes(q.toLowerCase())) return false;
    }
    return true;
  };
  s.standard = (id, key) => { for (const a of s.items) if (a.id !== id && a[key]) a[key] = false; };
  return s;
}

let server, browser;

async function neueSeite(start, { breite = 1440, hoehe = 900 } = {}) {
  const s = mockServer(start);
  const ctx = await browser.newContext({ viewport: { width: breite, height: hoehe } });
  await ctx.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.endsWith("/api/kunde/addresses") && req.method() === "GET") {
      s.gets++;
      if (s.failGet) return route.abort("failed");
      const role = url.searchParams.get("role"), q = url.searchParams.get("q"), fav = url.searchParams.get("favorite") === "true";
      const limit = Number(url.searchParams.get("limit") || 20), ab = Number(url.searchParams.get("cursor") || 0);
      const treffer = s.items.filter((a) => s.passt(a, role, q, fav)).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
      const seite = treffer.slice(ab, ab + limit);
      return json({ items: seite, nextCursor: ab + limit < treffer.length ? String(ab + limit) : null });
    }
    if (p.endsWith("/api/kunde/addresses") && req.method() === "POST") {
      const body = req.postDataJSON();
      s.posts.push(body);
      if (body.label && body.label.length > 80) return json({ error: "Ungültige Eingabe", code: "ADDRESS_INVALID", field: "label" }, 400);
      if (body.city === "SERVERFEHLER") return json({ error: "Ungültige Eingabe", code: "ADDRESS_INVALID", field: "city" }, 400);
      const neu = adresse(1000 + s.posts.length, { ...body, createdAt: new Date().toISOString() });
      if (neu.isDefaultSender) s.standard(neu.id, "isDefaultSender");
      if (neu.isDefaultRecipient) s.standard(neu.id, "isDefaultRecipient");
      s.items.push(neu);
      return json(neu, 201);
    }
    const m = p.match(/\/api\/kunde\/addresses\/(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      const a = s.unbekannt.has(id) ? null : s.items.find((x) => x.id === id);
      if (!a) return json({ error: "Adresse nicht gefunden", code: "ADDRESS_NOT_FOUND" }, 404);
      if (req.method() === "PUT") {
        const body = req.postDataJSON();
        s.puts.push({ id, body });
        Object.assign(a, body);
        if (body.isDefaultSender === true) s.standard(id, "isDefaultSender");
        if (body.isDefaultRecipient === true) s.standard(id, "isDefaultRecipient");
        return json({ ...a });
      }
      if (req.method() === "DELETE") {
        s.deletes.push(id);
        const warStandard = a.isDefaultSender;
        s.items = s.items.filter((x) => x.id !== id);
        let newDefaultSenderId = null;
        if (warStandard) {
          const nachfolger = s.items.filter((x) => ["sender", "both"].includes(x.role)).sort((x, y) => y.createdAt.localeCompare(x.createdAt))[0];
          if (nachfolger) { nachfolger.isDefaultSender = true; newDefaultSenderId = nachfolger.id; }
        }
        return json({ ok: true, newDefaultSenderId });
      }
    }
    if (p.includes("/api/kunde/")) return json({ items: [], drafts: [], nextCursor: null, pagination: { total: 0 } });
    return json({});
  });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await page.goto(`${BASE}/dashboard?page=addressbook`, { waitUntil: "networkidle" });
  return { ctx, page, s, fehler };
}

const zeilen = (page) => page.locator(".abk-row").filter({ visible: true });
const zeile = (page, text) => zeilen(page).filter({ hasText: text }).first();
async function aktion(page, text, eintrag) {
  await zeile(page, text).getByRole("button", { name: /^Weitere Aktionen für/ }).click();
  await page.getByRole("menuitem", { name: eintrag }).click();
}
const badges = (page, text) => zeilen(page).filter({ hasText: text });

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > deadline) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) stopDevServer(server, "SIGKILL");
});

test("1 — Anlegen: Pflichtfelder, Serverfehler am Feld, danach gespeichert und in der Liste", async () => {
  const { ctx, page, s, fehler } = await neueSeite([adresse(1, { label: "Lager Nord", role: "sender" })]);
  await zeilen(page).first().waitFor({ state: "visible", timeout: 20000 });
  await page.getByRole("button", { name: "Neue Adresse" }).first().click();
  await page.waitForSelector("#abk-label", { timeout: 5000 });
  await page.fill("#abk-label", "Filiale Süd");
  await page.fill("#abk-firstName", "Clara");
  await page.fill("#abk-lastName", "Test");
  await page.fill("#abk-email", "clara@example.org");
  await page.fill("#abk-phone", "+49 89 1234");
  await page.fill("#abk-streetAndNumber", "Marienplatz 1");
  await page.fill("#abk-postalCode", "80331");
  await page.fill("#abk-city", "SERVERFEHLER");
  await page.getByRole("button", { name: "Speichern" }).click();
  // Der Serverfehler steht AM Feld, der Fokus springt nach dem Rendern dorthin.
  await page.waitForFunction(() => document.activeElement?.id === "abk-city", null, { timeout: 5000 });
  assert.equal(await page.getAttribute("#abk-city", "aria-invalid"), "true");
  assert.match(await page.locator(".abk-drawer, [role=dialog]").first().innerText(), /Ort wurde nicht angenommen/);
  await page.fill("#abk-city", "München");
  await page.getByRole("button", { name: "Speichern" }).click();
  await zeile(page, "Filiale Süd").waitFor({ state: "visible", timeout: 5000 });
  assert.equal(s.posts.length, 2);
  assert.equal(s.posts[1].label, "Filiale Süd");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("2 — Bearbeiten, Duplizieren mit 80-Zeichen-Label, Suche und Favoritenfilter", async () => {
  const lang = "L".repeat(80);
  const { ctx, page, s } = await neueSeite([
    adresse(1, { label: lang, role: "sender" }),
    // Der Standardreiter zeigt Absender — „both“ erscheint dort und im Empfängerreiter.
    adresse(2, { label: "Kunde Hamburg", city: "Hamburg", role: "both", favorite: true }),
  ]);
  await zeilen(page).first().waitFor({ state: "visible", timeout: 20000 });
  // Bearbeiten: das Formular kommt vorbelegt, die Änderung erscheint ohne Neuladen.
  await aktion(page, "Kunde Hamburg", "Bearbeiten");
  await page.waitForSelector("#abk-city", { timeout: 5000 });
  assert.equal(await page.inputValue("#abk-city"), "Hamburg");
  await page.fill("#abk-city", "Lübeck");
  await page.getByRole("button", { name: "Speichern" }).click();
  await zeile(page, "Lübeck").waitFor({ state: "visible", timeout: 5000 });
  // Duplizieren: „Kopie von …" bleibt innerhalb von 80 Zeichen und lässt sich speichern.
  await aktion(page, lang.slice(0, 20), "Duplizieren");
  await page.waitForSelector("#abk-label", { timeout: 5000 });
  const kopie = await page.inputValue("#abk-label");
  assert.ok(kopie.startsWith("Kopie von ") && kopie.length <= 80, `Label „${kopie}“ (${kopie.length})`);
  await page.getByRole("button", { name: "Speichern" }).click();
  await page.waitForFunction(() => !document.querySelector("#abk-label"), null, { timeout: 5000 });
  assert.ok(s.posts.at(-1).label.length <= 80, "die Kopie hat die Servergrenze gesprengt");
  // Suche und Favoritenfilter.
  await page.fill("#abk-search-input", "Lübeck");
  await page.waitForFunction(() => document.querySelectorAll(".abk-row").length === 1, null, { timeout: 5000 });
  await page.fill("#abk-search-input", "");
  await page.getByRole("button", { name: "Nur Favoriten" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".abk-row")].every((r) => r.textContent.includes("Favorit")), null, { timeout: 5000 });
  await ctx.close();
});

test("3 — Favorit und Standard: nur die Änderung geht hinaus, es bleibt genau EIN Standard-Absender", async () => {
  const { ctx, page, s } = await neueSeite([
    adresse(1, { label: "Alt-Standard", role: "both", isDefaultSender: true }),
    adresse(2, { label: "Neu-Standard", role: "both" }),
  ]);
  await zeilen(page).first().waitFor({ state: "visible", timeout: 20000 });
  await aktion(page, "Neu-Standard", "Als Standard-Absender setzen");
  await zeile(page, "Neu-Standard").filter({ hasText: "Standard-Absender" }).waitFor({ timeout: 5000 });
  assert.deepEqual(s.puts.at(-1), { id: 2, body: { isDefaultSender: true } }, "der Standardwechsel sendet mehr als die Änderung");
  assert.equal(await badges(page, "Standard-Absender").count(), 1, "zwei Zeilen tragen „Standard-Absender“");
  // Der Favoriten-Klick auf der alten Standardzeile holt den alten Standard NICHT zurück.
  await aktion(page, "Alt-Standard", "Als Favorit markieren");
  await zeile(page, "Alt-Standard").filter({ hasText: "Favorit" }).waitFor({ timeout: 5000 });
  assert.deepEqual(s.puts.at(-1), { id: 1, body: { favorite: true } }, "der Favoriten-Klick sendet das ganze Objekt");
  assert.equal(s.items.find((a) => a.id === 1).isDefaultSender, false, "der alte Standard ist zurück");
  assert.equal(await badges(page, "Standard-Absender").count(), 1);
  assert.equal(await zeile(page, "Neu-Standard").filter({ hasText: "Standard-Absender" }).count(), 1);
  await ctx.close();
});

test("4 — Löschen: Nachrücken ohne Neuladen; eine fremde Adresse ergibt einen klaren Hinweis", async () => {
  const { ctx, page, s } = await neueSeite([
    adresse(1, { label: "Standard-Lager", role: "sender", isDefaultSender: true }),
    adresse(2, { label: "Zweitlager", role: "sender" }),
    adresse(3, { label: "Fremdkonto", role: "sender" }),
  ]);
  await zeilen(page).first().waitFor({ state: "visible", timeout: 20000 });
  const getsVorher = s.gets;
  await aktion(page, "Standard-Lager", "Löschen");
  await page.locator('[role="dialog"] .btn-danger').click();
  await page.waitForFunction(() => ![...document.querySelectorAll(".abk-row")].some((r) => r.textContent.includes("Standard-Lager")), null, { timeout: 5000 });
  const nachfolger = s.items.find((a) => a.isDefaultSender);
  await zeile(page, nachfolger.label).filter({ hasText: "Standard-Absender" }).waitFor({ timeout: 5000 });
  assert.equal(s.gets, getsVorher, "nach dem Löschen wurde die Liste neu geladen");
  // Mandantentrennung: der Server kennt die Adresse für dieses Konto nicht (404).
  s.unbekannt.add(3);
  await aktion(page, "Fremdkonto", "Löschen");
  await page.locator('[role="dialog"] .btn-danger').click();
  await page.locator('[role="dialog"]').getByText("Die Adresse wurde nicht gefunden oder ist nicht mehr verfügbar.").waitFor({ timeout: 5000 });
  await ctx.close();
});

test("5 — Pagination: „Mehr laden“ hängt die zweite Seite an, ohne Lücke und ohne Dublette", async () => {
  const start = Array.from({ length: 25 }, (_, i) => adresse(i + 1, { label: `Adresse ${String(i + 1).padStart(2, "0")}`, role: "sender" }));
  const { ctx, page } = await neueSeite(start);
  await zeilen(page).first().waitFor({ state: "visible", timeout: 20000 });
  assert.equal(await zeilen(page).count(), 20);
  await page.getByRole("button", { name: "Mehr laden" }).click();
  await page.waitForFunction(() => document.querySelectorAll(".abk-row").length === 25, null, { timeout: 5000 });
  const namen = await page.locator(".abk-row .abk-row-name").allTextContents();
  assert.equal(new Set(namen).size, 25, "Dubletten in der Liste");
  await ctx.close();
});

test("6 — Übernahme in „Neue Sendung“: der Absender wird gefüllt, nichts wird gebucht", async () => {
  const { ctx, page } = await neueSeite([adresse(1, { label: "Versandlager", role: "sender", city: "Potsdam", postalCode: "14467" })]);
  await zeilen(page).first().waitFor({ state: "visible", timeout: 20000 });
  await zeile(page, "Versandlager").getByRole("button", { name: /^Sendung erstellen für Versandlager$/ }).click();
  await page.waitForSelector("#ns-s-city", { timeout: 10000 });
  assert.equal(await page.inputValue("#ns-s-city"), "Potsdam");
  assert.equal(await page.inputValue("#ns-s-zip"), "14467");
  assert.equal(await page.inputValue("#ns-r-city"), "", "die Empfängerseite wurde gefüllt");
  await ctx.close();
});

test("7 — Netzfehler beim Laden: verständlicher Satz als Live-Meldung, nie „Failed to fetch“", async () => {
  const { ctx, page, s } = await neueSeite([adresse(1, { label: "Egal", role: "sender" })]);
  await zeilen(page).first().waitFor({ state: "visible", timeout: 20000 });
  s.failGet = true;
  await page.getByRole("tab", { name: /Empfänger/ }).click();
  const meldung = page.locator('[role="alert"]').filter({ hasText: "Adressen" }).first();
  await meldung.waitFor({ timeout: 5000 });
  const text = await meldung.innerText();
  assert.match(text, /keine Verbindung zum Server/);
  assert.doesNotMatch(text, /Failed to fetch|TypeError|NetworkError/);
  await ctx.close();
});

test("8 — 390 px: Karten statt Zeilen, Menü bedienbar, kein Überlauf", async () => {
  const { ctx, page } = await neueSeite([adresse(1, { label: "Mobillager", role: "sender" })], { breite: 390, hoehe: 844 });
  const karte = page.locator(".abk-card").filter({ visible: true }).first();
  await karte.waitFor({ state: "visible", timeout: 20000 });
  const ueberlauf = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(ueberlauf <= 1, `${ueberlauf} px waagrechter Überlauf`);
  await karte.getByRole("button", { name: /^Weitere Aktionen für Mobillager$/ }).click();
  assert.ok(await page.getByRole("menuitem", { name: "Bearbeiten" }).isVisible());
  await page.keyboard.press("Escape");
  await ctx.close();
});
