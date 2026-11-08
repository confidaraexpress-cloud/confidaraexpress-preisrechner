// E2E: Profilmenü am Benutzerchip (Betreiberentscheidung 2026-11-08).
//
// Kernzusicherungen:
//   • Ein Klick auf den Chip öffnet das Menü direkt darunter (rechtsbündig, im Fenster) — keine Navigation; erneuter
//     Klick, Klick daneben und Escape schließen; immer höchstens ein Menü.
//   • Tastatur und Screenreader: Menu-Button-Muster (aria-haspopup/expanded/controls, menuitem), Pfeile im Kreis,
//     Pos1/Ende, Escape und Tab geben den Fokus an den Chip.
//   • „Mein Konto“ → Kontoeinstellungen, „Sicherheit & Passwort“ → Abschnitt „Sicherheit“ der Kontoeinstellungen (im Bild,
//     fokussiert — auch bei schon offenen Kontoeinstellungen), „Meine Supportanfragen“ → Supportbereich, „Abmelden“ →
//     bestehender Abmeldeweg. Der Verlassen-Schutz von „Neue Sendung“ greift für jede Aktion.
//   • Kopf mit Name, Firma, „Geschäftskundenkonto“ und Firmenlogo; Glocke und Kennzahlfenster bleiben unberührt; die
//     zweite Shell (Versandkostenrechner) nutzt dasselbe Menü; flache Touch-Fenster: im Bild, Ziele ≥ 44 px; 390 px:
//     Topbar unverändert.
//
// Backend vollständig gemockt. Keine echte Buchung, keine echte Mail, kein Provider.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5771, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "nico.weber@weber-logistik.example.de", company_name: "Weber Logistik GmbH", name: "Nico Weber",
  role: "customer", status: "approved", country: "DE", zip: "10115", city: "Berlin", street: "Musterstraße 1",
  customer_number: "CE-K-10001", payment_term: 14,
};
const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" fill="#ffffff"/><text x="10" y="27" font-size="16">WEBER</text></svg>';
const SENDUNG = {
  id: 501, status: "label_ready", weight: 2.4, price_final: 14.28, selected_carrier: "dhl", applied_tariff_display_name: "Standard",
  created_at: "2026-11-06T09:00:00.000Z", order_confirmation_number: "CE-AB26-00501", tracking_number: null, tracking_references: [],
  sender_address: { company: "Weber Logistik GmbH", postalCode: "10115", city: "Berlin", country: "DE" },
  recipient_address: { company: "Nordhafen Technik GmbH", postalCode: "20457", city: "Hamburg", country: "DE" },
  customer_status: "in_transit", tracking_status: "in_transit", is_active: true, is_delayed: true, delivered_this_month: false,
  is_test_booking: false, delivery_date_max: "2026-11-05",
};
const STATS = { total: 1, active: 1, in_transit: 1, delivered_this_month: 0, delayed: 1, new_24h: 0, test_bookings: 0 };

let server, browser;

async function neueSeite({ viewport = { width: 1440, height: 900 }, logo = false, touch = false } = {}) {
  const ctx = await browser.newContext({ viewport, ...(touch ? { hasTouch: true } : {}) });
  const anfragen = [];
  await ctx.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    anfragen.push(`${req.method()} ${p}${url.search}`);
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p === "/kundenbereich") {
      return json({ user: USER, ...(logo ? { companyLogo: { version: "e2e-logo-1", mimeType: "image/svg+xml", width: 120, height: 40, size: 200 } } : {}) });
    }
    if (p.endsWith("/kunde/company-logo")) return route.fulfill({ status: 200, contentType: "image/svg+xml", body: LOGO_SVG });
    if (p === "/kunde/notifications/unread-count") return json({ unreadCount: 2, snapshotAt: "2026-11-08T08:00:00.000Z" });
    if (p === "/kunde/notifications") return json({ notifications: [], unreadCount: 2, snapshotAt: "2026-11-08T08:00:00.000Z" });
    if (p === "/kunde/shipments") {
      const kpi = url.searchParams.get("kpi");
      return json({ shipments: [SENDUNG], nextCursor: null, stats: STATS, ...(kpi ? { filter: { kpi, total: 1 } } : {}) });
    }
    if (p === "/kunde/invoices") return json({ invoices: [], summary: { open_amount: 0, open_count: 0, overdue_count: 0, next_due_date: null, currency: "EUR", mixed_currency: false }, nextCursor: null });
    if (p === "/kunde/support-requests") return json({ supportRequests: [], nextCursor: null });
    // „Neue Sendung" (nur für den Verlassen-Schutz): leeres Adressbuch, keine Entwürfe, abgeschaltete Legal-Schranke.
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/api/kunde/form-drafts") && req.method() === "GET") return json({ drafts: [], nextCursor: null });
    if (p.includes("/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/address/")) return json({ status: "unsupported" });
    return json({ error: "nicht modelliert" }, 404);
  });
  await ctx.addInitScript(() => { try { localStorage.setItem("ce_token", "e2e-profilmenue-token"); } catch { /* egal */ } });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) fehler.push(m.text()); });
  return { ctx, page, fehler, anfragen };
}

const chip = (page) => page.locator(".pp-uchip:visible");
const menue = (page) => page.locator(".ce-pm");
const eintrag = (page, key) => page.locator(`.ce-pm-eintrag[data-eintrag="${key}"]`);
const fokus = (page) => page.evaluate(() => {
  const el = document.activeElement;
  if (!el) return null;
  return el.dataset?.eintrag ? `eintrag:${el.dataset.eintrag}` : el.classList.contains("pp-uchip") ? "chip" : el.textContent.trim().slice(0, 40);
});

async function uebersicht(page) {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await chip(page).waitFor({ timeout: 20000 });
}
async function oeffnen(page) {
  await chip(page).click();
  await page.waitForSelector(".ce-pm[data-bereit]", { timeout: 5000 });
  // Erst nach der Öffnungsbewegung (160 ms) weiter: Playwrights Klickprüfung scrollt ein sich noch bewegendes Ziel „ins Bild“,
  // und wegen `scroll-behavior: smooth` läuft diese Fahrt nach dem Klick weiter (gemessen in CI und bei 4× gedrosselter CPU).
  await page.waitForFunction(() => document.querySelector(".ce-pm")?.getAnimations().every((a) => a.playState === "finished") ?? false,
    null, { timeout: 5000 });
}
async function geschlossen(page) {
  await menue(page).waitFor({ state: "detached", timeout: 5000 });
  assert.equal(await chip(page).getAttribute("aria-expanded"), "false");
  assert.equal(await chip(page).getAttribute("aria-controls"), null, "aria-controls ohne offenes Menü");
}
async function abschnittSicherheitAktiv(page) {
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Sicherheit"
    && document.activeElement.closest("#profil-sicherheit") !== null, null, { timeout: 10000 });
  return page.evaluate(() => {
    const r = document.querySelector("#profil-sicherheit").getBoundingClientRect();
    return { top: Math.round(r.top), imBild: r.top >= 0 && r.top < innerHeight, passwort: Boolean(document.querySelector("#profil-sicherheit .profile-password-section")) };
  });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore", ...DEV_SERVER_SPAWN,
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
  if (server) stopDevServer(server, "SIGKILL");
});

// ─────────────────────────────────────────────────────────────────────────────

test("A — Klick öffnet das Menü direkt unter dem Chip ohne Navigation; erneuter Klick schließt; höchstens ein Menü", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await uebersicht(page);
  const vorher = { url: page.url(), h1: await page.locator("h1").first().innerText() };
  assert.equal(await chip(page).getAttribute("aria-haspopup"), "menu");
  assert.equal(await chip(page).getAttribute("aria-expanded"), "false");

  await oeffnen(page);
  assert.equal(page.url(), vorher.url, "der Klick hat navigiert");
  assert.equal(await page.locator("h1").first().innerText(), vorher.h1);
  assert.equal(await menue(page).count(), 1);
  assert.equal(await chip(page).getAttribute("aria-expanded"), "true");
  const liste = page.locator('.ce-pm [role="menu"]');
  assert.equal(await chip(page).getAttribute("aria-controls"), await liste.getAttribute("id"), "aria-controls zeigt nicht auf das Menü");
  const lage = await page.evaluate(() => {
    const c = document.querySelector(".pp-uchip[aria-expanded='true']").getBoundingClientRect();
    const m = document.querySelector(".ce-pm").getBoundingClientRect();
    return { rechts: Math.round(c.right - m.right), abstand: Math.round(m.top - c.bottom), breite: Math.round(m.width),
      imBild: m.left >= 0 && m.top >= 0 && m.right <= document.documentElement.clientWidth && m.bottom <= innerHeight,
      ueberlauf: document.scrollingElement.scrollWidth - innerWidth };
  });
  assert.ok(Math.abs(lage.rechts) <= 1, `nicht rechtsbündig am Chip (${lage.rechts} px)`);
  assert.ok(lage.abstand >= 4 && lage.abstand <= 12, `nicht direkt unter dem Chip (${lage.abstand} px)`);
  assert.ok(lage.breite >= 320 && lage.breite <= 350, `Breite ${lage.breite} px`);
  assert.equal(lage.imBild, true, "Menü ragt aus dem Fenster");
  assert.ok(lage.ueberlauf <= 0, "horizontaler Überlauf");
  assert.deepEqual(await page.locator('.ce-pm [role="menuitem"]').evaluateAll((els) => els.map((e) => e.dataset.eintrag)),
    ["konto", "sicherheit", "support", "abmelden"]);

  await chip(page).click();
  await geschlossen(page);
  assert.equal(page.url(), vorher.url);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B — Klick daneben und Escape schließen; Escape gibt den Fokus an den Chip zurück", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await uebersicht(page);
  await oeffnen(page);
  await page.mouse.click(700, 620);
  await geschlossen(page);
  assert.notEqual(await fokus(page), "eintrag:konto", "der Fokus blieb im geschlossenen Menü");

  await oeffnen(page);
  assert.equal(await fokus(page), "eintrag:konto", "beim Öffnen liegt der Fokus nicht auf dem ersten Eintrag");
  await page.keyboard.press("Escape");
  await geschlossen(page);
  assert.equal(await fokus(page), "chip", "Escape gibt den Fokus nicht an den Chip");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("C — Tastatur und Screenreader: Menu-Button-Muster, Pfeile im Kreis, Pos1/Ende, Tab verlässt das Menü", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await uebersicht(page);
  // Zugänglicher Name aus dem sichtbaren Text plus Zusatz; Aktion im Tooltip.
  const name = await page.getByRole("button", { name: /Nico Weber.*Weber Logistik GmbH.*Profilmenü/ }).count();
  assert.equal(name, 1, "der Chip ist nicht über Name und Aktion erreichbar");
  await chip(page).focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector(".ce-pm[data-bereit]");
  assert.equal(await fokus(page), "eintrag:konto");
  const rolle = page.getByRole("menu", { name: /Nico Weber.*Weber Logistik GmbH.*Geschäftskundenkonto/ });
  assert.equal(await rolle.count(), 1, "das Menü trägt den Kopf nicht als Namen");
  for (const [titel, untertitel] of [["Mein Konto", "Profil und Unternehmensdaten"], ["Sicherheit & Passwort", "Zugangsdaten verwalten"],
    ["Meine Supportanfragen", "Anfragen und Antworten ansehen"]]) {
    assert.equal(await rolle.getByRole("menuitem", { name: new RegExp(`^${titel}\\s*${untertitel}$`) }).count(), 1, `${titel} fehlt als Menüeintrag`);
  }
  assert.equal(await rolle.getByRole("menuitem", { name: "Abmelden" }).count(), 1);
  assert.equal(await rolle.getByRole("separator").count(), 1);

  await page.keyboard.press("ArrowDown");
  assert.equal(await fokus(page), "eintrag:sicherheit");
  await page.keyboard.press("End");
  assert.equal(await fokus(page), "eintrag:abmelden");
  await page.keyboard.press("ArrowDown");
  assert.equal(await fokus(page), "eintrag:konto", "kein Kreis vom letzten zum ersten Eintrag");
  await page.keyboard.press("ArrowUp");
  assert.equal(await fokus(page), "eintrag:abmelden", "kein Kreis vom ersten zum letzten Eintrag");
  await page.keyboard.press("Home");
  assert.equal(await fokus(page), "eintrag:konto");
  const ringe = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.equal(ringe, "solid", "kein sichtbarer Tastaturfokus am Eintrag");

  // Tab verlässt das Menü: es schließt, der Fokus wandert vom Chip aus weiter (hier: „Neue Sendung“).
  await page.keyboard.press("Tab");
  await geschlossen(page);
  assert.equal(await fokus(page), "Neue Sendung", "Tab wandert nicht vom Chip aus weiter");

  // Pfeil hoch am Chip öffnet mit dem letzten Eintrag; Enter auf einem Eintrag löst ihn aus.
  await chip(page).focus();
  await page.keyboard.press("ArrowUp");
  await page.waitForSelector(".ce-pm[data-bereit]");
  assert.equal(await fokus(page), "eintrag:abmelden");
  await page.keyboard.press("Escape");
  await geschlossen(page);
  await chip(page).focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForSelector(".ce-pm[data-bereit]");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => /Supportanfragen/.test(document.querySelector("h1")?.textContent || ""), null, { timeout: 10000 });
  assert.equal(await menue(page).count(), 0);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("D — „Mein Konto“ öffnet die Kontoeinstellungen, „Meine Supportanfragen“ den Supportbereich; das Menü schließt", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await uebersicht(page);
  await oeffnen(page);
  await eintrag(page, "konto").click();
  await page.waitForFunction(() => /Kontoeinstellungen/.test(document.querySelector("h1")?.textContent || ""), null, { timeout: 10000 });
  assert.equal(await menue(page).count(), 0, "das Menü blieb beim Navigieren offen");
  assert.equal(await chip(page).getAttribute("aria-expanded"), "false");
  assert.ok(new URL(page.url()).pathname.endsWith("/dashboard"), "eine neue Route statt des bestehenden Bereichs");

  await oeffnen(page);
  await eintrag(page, "support").click();
  await page.waitForFunction(() => /Supportanfragen/.test(document.querySelector("h1")?.textContent || ""), null, { timeout: 10000 });
  assert.equal(await menue(page).count(), 0);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("E — „Sicherheit & Passwort“: Abschnitt „Sicherheit“ der Kontoeinstellungen im Bild und fokussiert, auch ohne Remount", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await uebersicht(page);
  await oeffnen(page);
  await eintrag(page, "sicherheit").click();
  await page.waitForFunction(() => /Kontoeinstellungen/.test(document.querySelector("h1")?.textContent || ""), null, { timeout: 10000 });
  const erst = await abschnittSicherheitAktiv(page);
  assert.equal(erst.imBild, true, "der Abschnitt „Sicherheit“ ist nicht im Bild");
  assert.equal(erst.passwort, true, "die bestehende Passwortänderung fehlt im Abschnitt");

  // Kontoeinstellungen schon offen (kein Remount): eine Nutzeraktion beendet die kurze Nachführung, dann nach oben und
  // erneut — der Wunsch greift sofort.
  await page.keyboard.press("Shift");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  assert.equal(await page.evaluate(() => {
    const r = document.querySelector("#profil-sicherheit").getBoundingClientRect();
    return r.top >= 0 && r.top < innerHeight;
  }), false, "der Abschnitt war schon im Bild — die Prüfung ohne Remount sagte nichts");
  await oeffnen(page);
  await eintrag(page, "sicherheit").click();
  const erneut = await abschnittSicherheitAktiv(page);
  assert.equal(erneut.imBild, true);
  // Ein eingelöster Wunsch springt kein zweites Mal: nach „Mein Konto“ bleibt der Fokus am Chip, der Abschnitt außer Sicht.
  await page.keyboard.press("Shift");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await oeffnen(page);
  await eintrag(page, "konto").click();
  await page.waitForTimeout(700);
  assert.equal(await fokus(page), "chip", "verspäteter Sprung ohne Wunsch (Fokus)");
  assert.equal(await page.evaluate(() => {
    const r = document.querySelector("#profil-sicherheit").getBoundingClientRect();
    return r.top >= 0 && r.top < innerHeight;
  }), false, "verspäteter Sprung ohne Wunsch (Abschnitt im Bild)");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("F — „Abmelden“ nutzt den bestehenden Abmeldeweg: Sitzung beendet, Anmeldeseite", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await uebersicht(page);
  await oeffnen(page);
  await eintrag(page, "abmelden").click();
  await page.waitForURL(/\/login$/, { timeout: 10000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), null, "das Token blieb gespeichert");
  assert.equal(await page.locator(".pp-uchip").count(), 0);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("G — Verlassen-Schutz von „Neue Sendung“: jede Aktion fragt zuerst; Abbruch bleibt ohne Sprungwunsch, Bestätigen führt aus", async () => {
  const { ctx, page } = await neueSeite();
  const dialog = page.locator('.dft-dialog-card[role="dialog"]');
  const ungespeichert = async () => {
    await page.waitForSelector("#ns-weight", { timeout: 20000 });
    await page.fill("#ns-weight", "5");
  };
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await ungespeichert();

  // 1. „Sicherheit & Passwort“ → Dialog; Abbruch: die Sendung bleibt, kein Wunsch bleibt zurück.
  await oeffnen(page);
  await eintrag(page, "sicherheit").click();
  await dialog.waitFor();
  assert.equal(await menue(page).count(), 0, "das Menü steht über dem Dialog");
  await dialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.equal(await page.inputValue("#ns-weight"), "5", "die Sendung wurde verlassen");

  // 2. „Abmelden“ → Dialog; Abbruch: weiter angemeldet.
  await oeffnen(page);
  await eintrag(page, "abmelden").click();
  await dialog.waitFor();
  await dialog.getByRole("button", { name: "Weiter bearbeiten" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.notEqual(await page.evaluate(() => localStorage.getItem("ce_token")), null, "trotz Abbruch abgemeldet");
  assert.equal(await page.inputValue("#ns-weight"), "5");

  // 3. „Mein Konto“ → Dialog; Bestätigen: Kontoeinstellungen OHNE verspäteten Sprung aus Schritt 1.
  await oeffnen(page);
  await eintrag(page, "konto").click();
  await dialog.waitFor();
  await dialog.locator(".dft-leave-discard").click();
  await page.waitForFunction(() => /Kontoeinstellungen/.test(document.querySelector("h1")?.textContent || ""), null, { timeout: 10000 });
  await page.waitForTimeout(800);
  assert.notEqual(await fokus(page), "Sicherheit", "verspäteter Sprung aus einem abgebrochenen Wunsch");

  // 4. Erneut ungespeichert, „Sicherheit & Passwort“ bestätigen: der Wunsch reist durch den Dialog und wird eingelöst.
  await page.locator(".pp-nav .nitem", { hasText: "Neue Sendung" }).first().click();
  await ungespeichert();
  await oeffnen(page);
  await eintrag(page, "sicherheit").click();
  await dialog.waitFor();
  await dialog.locator(".dft-leave-discard").click();
  const s = await abschnittSicherheitAktiv(page);
  assert.equal(s.imBild, true);

  // 5. Abmelden bestätigen: erst jetzt endet die Sitzung.
  await page.locator(".pp-nav .nitem", { hasText: "Neue Sendung" }).first().click();
  await ungespeichert();
  await oeffnen(page);
  await eintrag(page, "abmelden").click();
  await dialog.waitFor();
  await dialog.locator(".dft-leave-discard").click();
  await page.waitForURL(/\/login$/, { timeout: 10000 });
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), null);
  await ctx.close();
});

test("H — Kopf: Name, Firma, „Geschäftskundenkonto“ und das Firmenlogo aus derselben Quelle wie der Chip", async () => {
  {
    const { ctx, page, fehler } = await neueSeite();
    await uebersicht(page);
    await oeffnen(page);
    const kopf = await page.locator(".ce-pm-kopf").innerText();
    assert.match(kopf, /Nico Weber\s+Weber Logistik GmbH\s+Geschäftskundenkonto/);
    assert.equal(await page.locator(".ce-pm-kopf svg.ce-comark text").textContent(), await page.locator(".pp-uchip:visible svg.ce-comark text").textContent(),
      "Kopf und Chip zeigen nicht dieselbe Initiale");
    assert.deepEqual(fehler, []);
    await ctx.close();
  }
  {
    const { ctx, page, fehler, anfragen } = await neueSeite({ logo: true });
    await uebersicht(page);
    await page.locator(".pp-uchip:visible img.ce-comark-img").waitFor({ timeout: 10000 });
    await oeffnen(page);
    const logo = page.locator(".ce-pm-kopf img.ce-comark-img");
    await logo.waitFor();
    assert.equal(await logo.getAttribute("src"), await page.locator(".pp-uchip:visible img.ce-comark-img").getAttribute("src"), "zweite Logoquelle");
    assert.equal(anfragen.filter((a) => a.includes("/kunde/company-logo")).length, 1, "das Logo wurde ein zweites Mal geladen");
    const mass = await logo.evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height, fit: getComputedStyle(el).objectFit }));
    assert.equal(mass.fit, "contain", "das Logo wird verzerrt oder beschnitten");
    assert.ok(mass.h === 40 && mass.w >= 40 && mass.w <= 72, `Logo ${mass.w}×${mass.h}`);
    assert.deepEqual(fehler, []);
    await ctx.close();
  }
});

test("I — Glocke und Kennzahlfenster bleiben unberührt: das Fenster weicht dem Menü, das Menü der Glocke", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await uebersicht(page);
  await page.locator('.ov-kpi[data-kpi="delayed"]').click();
  await page.waitForSelector(".kpf[data-stand]", { timeout: 15000 });
  await oeffnen(page);
  assert.equal(await page.locator(".kpf").count(), 0, "Kennzahlfenster und Profilmenü gleichzeitig offen");

  const glocke = page.locator(".ntf-bell:visible");
  assert.match(await glocke.getAttribute("aria-label"), /Mitteilungen, 2 ungelesen/);
  await glocke.click();
  await page.locator(".ntf-panel").waitFor({ timeout: 5000 });
  assert.equal(await menue(page).count(), 0, "Profilmenü und Mitteilungen gleichzeitig offen");
  await page.keyboard.press("Escape");
  await page.locator(".ntf-panel").waitFor({ state: "detached" });

  // Das Kennzahlfenster öffnet weiterhin an seiner Karte, auch nach dem Menü.
  await oeffnen(page);
  await page.locator('.ov-kpi[data-kpi="active"]').click();
  await page.waitForSelector('.kpf[data-kpi="active"]', { timeout: 15000 });
  assert.equal(await menue(page).count(), 0);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("J — mehrfaches Öffnen und Navigieren: keine Fehler, nie mehr als ein Menü", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await uebersicht(page);
  for (let i = 0; i < 6; i++) {
    await oeffnen(page);
    assert.equal(await menue(page).count(), 1);
    if (i % 2) await page.keyboard.press("Escape"); else await chip(page).click();
    await geschlossen(page);
  }
  for (const key of ["konto", "support", "sicherheit", "konto"]) {
    await oeffnen(page);
    assert.equal(await menue(page).count(), 1);
    await eintrag(page, key).click();
    await page.waitForTimeout(400);
    assert.ok(await menue(page).count() <= 1);
  }
  // Browser-Zurück schließt: über die Seitenleiste auf den Versandkostenrechner (eigene Route), Menü öffnen, zurück.
  const versand = page.locator("button.pp-nav-group-head", { hasText: "Versand" });
  if ((await versand.getAttribute("aria-expanded")) !== "true") await versand.click();
  await page.locator(".pp-nav-group-items .nitem", { hasText: "Versandkostenrechner" }).click();
  await page.waitForURL(/\/calculator$/, { timeout: 10000 });
  // Die Route lädt nach (React.lazy, Übergang): erst auf der fertigen Seite öffnen.
  await page.waitForFunction(() => /Versandkostenrechner/.test(document.querySelector("h1")?.textContent || ""), null, { timeout: 20000 });
  await chip(page).waitFor();
  await oeffnen(page);
  await page.goBack();
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
  // Die Zielseite lädt nach (React.lazy); bis dahin steht die alte Seite. Geprüft wird die neue Seite.
  await page.waitForFunction(() => {
    const h1 = document.querySelector("h1")?.textContent || "";
    return h1 && !/Versandkostenrechner/.test(h1) && [...document.querySelectorAll(".pp-uchip")].some((c) => c.getClientRects().length);
  }, null, { timeout: 15000 });
  assert.equal(await menue(page).count(), 0, "Browser-Zurück ließ das Menü offen");
  assert.equal(await chip(page).getAttribute("aria-expanded"), "false");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("K — zweite Shell (Versandkostenrechner): dasselbe Menü, „Sicherheit & Passwort“ führt in den Abschnitt", async () => {
  const { ctx, page, fehler } = await neueSeite();
  await page.goto(`${BASE}/calculator`, { waitUntil: "networkidle" });
  await chip(page).waitFor({ timeout: 20000 });
  await oeffnen(page);
  assert.equal(await page.locator('.ce-pm [role="menuitem"]').count(), 4);
  await eintrag(page, "sicherheit").click();
  const s = await abschnittSicherheitAktiv(page);
  assert.equal(s.imBild, true);
  assert.ok(new URL(page.url()).pathname.endsWith("/dashboard"));
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("L — Touch und schmal: flaches Touch-Fenster im Bild mit Zielen ≥ 44 px; bei 390 px trägt die Topbar Menü, Marke und Glocke", async () => {
  {
    const { ctx, page, fehler } = await neueSeite({ viewport: { width: 915, height: 412 }, touch: true });
    await uebersicht(page);
    await chip(page).tap();
    await page.waitForSelector(".ce-pm[data-bereit]");
    const m = await page.evaluate(() => {
      const r = document.querySelector(".ce-pm").getBoundingClientRect();
      return { imBild: r.left >= 0 && r.top >= 0 && r.right <= document.documentElement.clientWidth && r.bottom <= innerHeight,
        ziele: [...document.querySelectorAll('.ce-pm [role="menuitem"]')].map((e) => Math.round(e.getBoundingClientRect().height)),
        ueberlauf: document.scrollingElement.scrollWidth - innerWidth };
    });
    assert.equal(m.imBild, true, "Menü ragt aus dem flachen Fenster");
    assert.ok(m.ziele.every((h) => h >= 44), `Ziele unter 44 px: ${m.ziele.join(", ")}`);
    assert.ok(m.ueberlauf <= 0);
    await eintrag(page, "support").tap();
    await page.waitForFunction(() => /Supportanfragen/.test(document.querySelector("h1")?.textContent || ""), null, { timeout: 10000 });
    assert.deepEqual(fehler, []);
    await ctx.close();
  }
  {
    const { ctx, page, fehler } = await neueSeite({ viewport: { width: 390, height: 844 } });
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.locator(".mobile-topbar .hamburger-btn").waitFor({ timeout: 20000 });
    assert.equal(await page.locator(".pp-uchip:visible").count(), 0, "zweite Identität auf dem Telefon");
    assert.equal(await page.locator(".mobile-topbar .ntf-bell").count(), 1);
    assert.ok((await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth)) <= 0);
    assert.deepEqual(fehler, []);
    await ctx.close();
  }
});
