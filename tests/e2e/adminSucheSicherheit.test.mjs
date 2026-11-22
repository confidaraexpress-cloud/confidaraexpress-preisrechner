// tests/e2e/adminSucheSicherheit.test.mjs — Admin-App (Betreiberauftrag 2026-11-22, D4/D7): die Suche über alle
// Kunden, Sendungen und Rechnungen, die Sicherheitsseite mit angemeldeten Geräten, die Passkey-Bestätigung kritischer
// Aktionen (428 STEP_UP_REQUIRED / PASSKEY_SETUP_REQUIRED) und die untere Leiste am Telefon.
//
// Alle Antworten kommen aus der Attrappe — kein Backend, kein Providercall, keine echte Sitzung. Die Felder folgen
// dem Vertrag von BE-1 (routes/admin/search.js, routes/auth.js /auth/security und /auth/sessions).
// Run: node --test tests/e2e/adminSucheSicherheit.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5498, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = { id: 1, email: "anna.admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE" };

const SUCHE = {
  types: ["customers", "shipments", "invoices"],
  customers: [
    { id: 311, customerNumber: "CE-K-10030", status: "approved", company: "Muster Logistik GmbH", name: "Max Mustermann",
      email: "einkauf@muster-logistik.de" },
    { id: 318, customerNumber: "CE-K-10031", status: "pending", company: "Musterhaus Möbel KG", name: "Erika Muster",
      email: "versand@musterhaus-moebel.de" },
  ],
  shipments: [
    { id: 90412, status: "booked", carrier: "DHL", fromCountry: "DE", toCountry: "AT", createdAt: "2026-11-20T09:12:00.000Z",
      orderConfirmationNumber: "CE-AB26-00042", businessOrderNumber: null, maskedTrackingNumber: "••••4471",
      isTestBooking: false, customerCompany: "Muster Logistik GmbH", customerNumber: "CE-K-10030", matchedBy: "tracking" },
    { id: 90377, status: "delivered", carrier: "UPS", fromCountry: "DE", toCountry: "DE", createdAt: "2026-11-18T14:40:00.000Z",
      orderConfirmationNumber: "CE-AB26-00077", businessOrderNumber: "PO-7781", maskedTrackingNumber: "••••0193",
      isTestBooking: true, customerCompany: "Muster Logistik GmbH", customerNumber: "CE-K-10030", matchedBy: "business_order" },
  ],
  invoices: [
    { id: 5521, invoiceNumber: "RE-2026-0001", documentType: "invoice", status: "unpaid", grossAmount: "1249.90",
      currency: "EUR", createdAt: "2026-11-01T06:00:00.000Z", isProductive: true, customerCompany: "Muster Logistik GmbH",
      customerNumber: "CE-K-10030" },
  ],
};
const NUR_SENDUNGEN = { types: ["shipments"], customers: [], shipments: SUCHE.shipments, invoices: [] };

const PASSKEY = { id: "pk-1", name: "Laptop Büro", synced: false, createdAt: "2026-11-22T07:00:00.000Z", lastUsedAt: null };
const OHNE_PASSKEY = { passkeys: [], recoveryCodesRemaining: 0, passkeyRequired: false,
  session: { secondFactor: false, method: "password", stepUpUntil: null } };
const MIT_PASSKEY = { passkeys: [PASSKEY], recoveryCodesRemaining: 8, passkeyRequired: false,
  session: { secondFactor: true, method: "passkey", stepUpUntil: null } };
// Nur, was der Server technisch erfasst (Browser/System aus dem User-Agent, Kanal, Anmeldeweg, Zeiten) — der dritte
// Eintrag hat keinen erkannten Browser und darf keinen erfundenen Gerätenamen bekommen.
const SITZUNGEN = { sessions: [
  { id: "s-2", current: false, device: "Safari auf iPhone", channel: "admin", method: "password",
    originHost: "admin.confidaraexpress.de", issuedAt: "2026-11-21T16:05:00.000Z", expiresAt: "2026-11-22T04:05:00.000Z" },
  { id: "s-1", current: true, device: "Chrome unter Windows", channel: "admin", method: "passkey",
    originHost: "admin.confidaraexpress.de", issuedAt: "2026-11-22T07:41:00.000Z", expiresAt: "2026-11-22T19:41:00.000Z" },
  { id: "s-3", current: false, device: null, channel: "admin", method: "password",
    originHost: null, issuedAt: "2026-11-20T08:00:00.000Z", expiresAt: "2026-11-20T20:00:00.000Z" },
] };
const OPTIONEN = { options: { challenge: "ZTJlLWNoYWxsZW5nZQ", rpId: "confidaraexpress.de", timeout: 60000,
  userVerification: "required", allowCredentials: [{ id: "cGstMQ", type: "public-key" }] } };

let server, browser;

async function setup(page, { security = OHNE_PASSKEY, search = SUCHE, searchStatus = 200, regenerate = null } = {}) {
  const state = { search: [], regenerate: 0, stepUpOptions: 0, stepUpVerify: 0, other: [] };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/auth/security")) return json(security);
    if (p.endsWith("/auth/sessions")) return json(SITZUNGEN);
    if (p.endsWith("/admin/search")) {
      state.search.push(url.search);
      if (searchStatus !== 200) return json({ error: "Interner Fehler" }, searchStatus);
      return json(typeof search === "function" ? search(url) : search);
    }
    if (p.endsWith("/auth/recovery-codes/regenerate") && req.method() === "POST") {
      state.regenerate += 1;
      return regenerate ? json(regenerate[1], regenerate[0]) : json({ recoveryCodes: ["AAAA-BBBB-CCCC"] });
    }
    if (p.endsWith("/auth/step-up/options")) { state.stepUpOptions += 1; return json(OPTIONEN); }
    if (p.endsWith("/auth/step-up/verify")) { state.stepUpVerify += 1; return json({ ok: true }); }
    state.other.push(p);
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return state;
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
  const deadline = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > deadline) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("1 — Suche: Begriff und Bereich stehen in der Adresse, der Bereich filtert serverseitig, Treffer führen zur Detailseite", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setup(page, { search: (url) => (url.searchParams.get("types") === "shipments" ? NUR_SENDUNGEN : SUCHE) });
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  // Der Einstieg steht im Kopf der Übersicht.
  await page.locator("#adm-suche-start").click();
  await page.waitForURL(`${BASE}/admin/suche`);
  const feld = page.locator('form[role="search"] input[type="search"]');
  await feld.waitFor({ state: "visible" });

  // Ein Zeichen: Hinweis, keine Anfrage.
  await feld.fill("m");
  await feld.press("Enter");
  await page.getByText("Bitte geben Sie mindestens 2 Zeichen ein.").waitFor({ state: "visible" });
  assert.equal(state.search.length, 0, "ein zu kurzer Begriff darf keine Suchanfrage auslösen");

  await feld.fill("muster");
  await feld.press("Enter");
  await page.waitForURL(`${BASE}/admin/suche?q=muster`);
  await page.locator(".adm-suche-treffer").first().waitFor({ state: "visible" });
  assert.deepEqual(state.search, ["?q=muster"], "ohne Bereich sucht die Seite über alle Bereiche");
  const gruppen = await page.locator(".adm-suche-gruppe").evaluateAll((els) => els.map((e) => e.querySelectorAll(".adm-suche-treffer").length));
  assert.deepEqual(gruppen, [2, 2, 1], "Kunden, Sendungen, Rechnungen");
  const text = await page.locator(".adm-suche-gruppe").allInnerTexts();
  assert.ok(text.join(" ").includes("CE-AB26-00042"));
  assert.ok(text.join(" ").includes("••••4471"), "die Trackingnummer bleibt maskiert");
  assert.ok(text[1].includes("Testbuchung"), "die Testbuchung ist gekennzeichnet");
  assert.ok(text[2].includes("RE-2026-0001") && /1\.249,90\s€/.test(text[2]), `Rechnung ohne Nummer oder Betrag: ${text[2]}`);

  // Bereich „Sendungen“: Adresse, Zustand und Anfrage tragen ihn.
  await page.locator(".adm-suche-bereich", { hasText: "Sendungen" }).click();
  await page.waitForURL(`${BASE}/admin/suche?q=muster&bereich=sendungen`);
  await page.locator('.adm-suche-bereich[aria-pressed="true"]', { hasText: "Sendungen" }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll(".adm-suche-gruppe").length === 1);
  assert.equal(state.search.at(-1), "?q=muster&types=shipments");

  // Neuladen: dieselbe Suche aus der Adresse.
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('.adm-suche-bereich[aria-pressed="true"]', { hasText: "Sendungen" }).waitFor();
  assert.equal(await feld.inputValue(), "muster");

  // Ein Treffer führt zur bestehenden Detailseite.
  await page.locator('a.adm-suche-treffer[href="/admin/shipments/90412"]').click();
  await page.waitForURL(`${BASE}/admin/shipments/90412`);
  await page.close();
});

test("2 — Suche: Serverfehler und Drosselung mit neutralem Text, „Erneut suchen“ fragt erneut", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setup(page, { searchStatus: 500 });
  await page.goto(`${BASE}/admin/suche?q=muster`, { waitUntil: "networkidle" });
  await page.getByText("Die Suche ist momentan nicht möglich. Bitte versuchen Sie es erneut.").waitFor({ state: "visible" });
  assert.doesNotMatch(await page.locator("main").innerText(), /Interner Fehler/, "kein Rohfehler des Servers");
  const vorher = state.search.length;
  const erneut = page.waitForResponse((r) => new URL(r.url()).pathname.endsWith("/admin/search"));
  await page.getByRole("button", { name: "Erneut suchen" }).click();
  await erneut;
  assert.equal(state.search.length, vorher + 1, "„Erneut suchen“ hat nicht erneut gefragt");
  await page.close();

  const gedrosselt = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setup(gedrosselt, { searchStatus: 429 });
  await gedrosselt.goto(`${BASE}/admin/suche?q=muster`, { waitUntil: "networkidle" });
  await gedrosselt.getByText("Zu viele Suchanfragen. Bitte warten Sie einen Moment.").waitFor({ state: "visible" });
  await gedrosselt.close();
});

test("3 — 390 px: untere Leiste mit vier Bereichen und „Mehr“, Suche oben, aktiver Bereich mit aria-current, kein seitliches Scrollen", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await setup(page);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const leiste = page.locator("nav.adm-tabs");
  await leiste.waitFor({ state: "visible" });
  const eintraege = await leiste.locator(".adm-tab").evaluateAll((els) => els.map((e) => {
    const r = e.getBoundingClientRect();
    return { text: e.innerText.trim(), links: r.left, rechts: r.right, hoehe: r.height, breite: r.width, unten: r.bottom,
      aktuell: e.getAttribute("aria-current") };
  }));
  assert.deepEqual(eintraege.map((e) => e.text), ["Übersicht", "Sendungen", "Kunden", "Rechnungen", "Mehr"]);
  for (const e of eintraege) {
    assert.ok(e.links >= 0 && e.rechts <= 390, `„${e.text}“ liegt außerhalb des Bildschirms`);
    assert.ok(e.hoehe >= 44 && e.breite >= 44, `„${e.text}“ ist kleiner als 44 px`);
    assert.ok(Math.abs(e.unten - 844) <= 1, `„${e.text}“ steht nicht am unteren Rand (${e.unten})`);
  }
  assert.equal(eintraege[0].aktuell, "page");

  await leiste.locator(".adm-tab", { hasText: "Kunden" }).click();
  await page.waitForURL(`${BASE}/admin/users`);
  await leiste.locator('.adm-tab[aria-current="page"]', { hasText: "Kunden" }).waitFor();
  assert.equal((await page.locator(".adm-topbar-title").innerText()).trim(), "Kunden");

  await page.locator(".adm-topbar a.adm-topbar-suche").click();
  await page.waitForURL(`${BASE}/admin/suche`);
  // React Router 7 wechselt in einer Transition: die Adresse steht vor dem Inhalt — erst die Suchseite abwarten.
  await page.locator(".adm-suche .adm-suche-form").waitFor({ state: "visible" });
  assert.equal(await leiste.locator('.adm-tab[aria-current="page"]').count(), 0, "die Suche ist kein Bereich der Leiste");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390, "die Seite scrollt seitlich");
  // Das Suchfeld ist am Telefon mindestens 16 px groß (kein Zoom beim Fokus).
  const schrift = await page.locator(".adm-suche-input").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  assert.ok(schrift >= 16, `Suchfeld mit ${schrift} px`);
  // Nichts verschwindet hinter der Leiste: der Hauptbereich hält unten mindestens ihre Höhe frei.
  const frei = await page.locator("main.adm-main").evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  assert.ok(frei >= 56, `Hauptbereich hält unten nur ${frei} px frei`);
  await page.close();
});

test("4 — Sicherheit: Hinweis ohne Passkey, Geräte nur mit erfassten Angaben, kurzer Weg im niedrigen Fenster", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setup(page, { security: OHNE_PASSKEY });
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const hinweis = page.locator("#adm-passkey-hinweis");
  await hinweis.waitFor({ state: "visible" });
  assert.match(await hinweis.innerText(), /Die biometrische Prüfung bleibt auf Ihrem Gerät\./);
  // 1440 × 900: die Identitätszeile führt zur Sicherheit, der kurze Weg bleibt ausgeblendet.
  assert.equal(await page.locator("a.adm-identity-link").isVisible(), true);
  assert.equal(await page.locator("a.adm-foot-sicherheit").isVisible(), false);
  await hinweis.getByRole("link", { name: "Passkey einrichten" }).click();
  await page.waitForURL(`${BASE}/admin/sicherheit`);

  const geraete = page.locator(".ce-geraet");
  await geraete.first().waitFor({ state: "visible" });
  const zeilen = await geraete.allInnerTexts();
  assert.equal(zeilen.length, 3);
  assert.match(zeilen[0], /Chrome unter Windows[\s\S]*Dieses Gerät/, "die aktuelle Sitzung steht zuerst und ist markiert");
  assert.match(zeilen[1], /Safari auf iPhone/);
  assert.match(zeilen[2], /Browser nicht erkannt/, "ein nicht erkannter Browser bekommt keinen erfundenen Namen");
  assert.equal(await page.getByRole("button", { name: "Auf allen Geräten abmelden" }).count(), 1);
  await page.close();

  // 1366 × 768: ohne Identitätszeile steht „Sicherheit“ neben „Abmelden“ — gleiche Zeile, keine zusätzliche Höhe.
  const niedrig = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await setup(niedrig, { security: MIT_PASSKEY });
  await niedrig.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const kurz = niedrig.locator("a.adm-foot-sicherheit");
  await kurz.waitFor({ state: "visible" });
  assert.equal(await niedrig.locator("a.adm-identity-link").isVisible(), false);
  const [sicherheitOben, abmeldenOben] = await niedrig.evaluate(() => [
    document.querySelector("a.adm-foot-sicherheit").getBoundingClientRect().top,
    [...document.querySelectorAll(".adm-side-foot button")].find((b) => b.innerText.trim() === "Abmelden").getBoundingClientRect().top]);
  assert.ok(Math.abs(sicherheitOben - abmeldenOben) < 1, "„Sicherheit“ und „Abmelden“ stehen nicht in einer Zeile");
  assert.equal(await niedrig.evaluate(() => { const n = document.querySelector(".adm-nav"); return n.scrollHeight > n.clientHeight + 1; }), false,
    "die Navigation scrollt im niedrigen Fenster");
  // Mit Passkey erscheint kein Hinweis.
  await niedrig.waitForTimeout(300);
  assert.equal(await niedrig.locator("#adm-passkey-hinweis").count(), 0);
  await kurz.click();
  await niedrig.waitForURL(`${BASE}/admin/sicherheit`);
  // aria-current folgt dem abgeschlossenen Wechsel (Transition), nicht schon der Adresse.
  await niedrig.locator('a.adm-foot-sicherheit[aria-current="page"]').waitFor();
  await niedrig.close();
});

test("5 — Passkey-Bestätigung: 428 öffnet sie; Abbrechen führt die Aktion nicht aus und wiederholt sie nicht", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setup(page, { security: MIT_PASSKEY,
    regenerate: [428, { error: "Bestätigung erforderlich", code: "STEP_UP_REQUIRED" }] });
  await page.goto(`${BASE}/admin/sicherheit`, { waitUntil: "networkidle" });
  await page.locator("#adm-codes-erneuern").click();
  await page.locator("#adm-codes-bestaetigen").click();
  const dialog = page.locator('[role="dialog"]', { hasText: "Aktion bestätigen" });
  await dialog.waitFor({ state: "visible" });
  assert.equal(await dialog.locator("#adm-stepup-bestaetigen").innerText(), "Mit Passkey bestätigen");
  await dialog.getByRole("button", { name: "Abbrechen" }).click();
  await dialog.waitFor({ state: "detached" });
  await page.getByText("Die Aktion wurde nicht bestätigt und deshalb nicht ausgeführt.").first().waitFor({ state: "visible" });
  assert.equal(state.regenerate, 1, "die Aktion wurde nach dem Abbruch wiederholt");
  assert.equal(state.stepUpVerify, 0, "ohne Bestätigung keine Prüfung");
  assert.equal(await page.locator("#adm-codes-neu").count(), 0, "ohne Bestätigung keine neuen Codes");
  await page.close();
});

test("6 — Passkey fehlt für eine kritische Aktion (428 PASSKEY_SETUP_REQUIRED): Hinweis auf der Sicherheitsseite, keine Abmeldung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const state = await setup(page, { security: MIT_PASSKEY,
    regenerate: [428, { error: "Passkey erforderlich", code: "PASSKEY_SETUP_REQUIRED" }] });
  await page.goto(`${BASE}/admin/sicherheit`, { waitUntil: "networkidle" });
  await page.locator("#adm-codes-erneuern").click();
  await page.locator("#adm-codes-bestaetigen").click();
  await page.getByText("Für diese Aktion ist ein Passkey erforderlich. Bitte richten Sie zuerst einen Passkey ein.").waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).pathname, "/admin/sicherheit");
  assert.equal(state.regenerate, 1);
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "e2e-token", "die Sitzung blieb nicht bestehen");
  await page.close();
});

test("7 — Anmeldung mit Wiederherstellungscode: auch mit Deep Link landet sie auf „Sicherheit“ und zeigt den Hinweis zum letzten Code", async () => {
  // Sicherheitsprüfung FE-1, B1: der Hinweis „letzter Code verwendet“ darf nicht auf einer Seite enden, die ihn nicht zeigt.
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const state = { recovery: [] };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/auth/admin-login/recovery")) { state.recovery.push(req.postDataJSON()); return json({ token: "e2e-token-neu", recoveryCodesRemaining: 0 }); }
    if (p.endsWith("/auth/admin-login")) {
      return json({ secondFactorRequired: true, loginTicket: "LT-0123456789abcdefghijklmnop", recoveryAvailable: true,
        passkeyOptions: OPTIONEN.options });
    }
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/auth/security")) return json({ ...MIT_PASSKEY, recoveryCodesRemaining: 0 });
    if (p.endsWith("/auth/sessions")) return json(SITZUNGEN);
    return json({});
  });
  // Ohne Sitzung auf eine Detailseite: der Routenschutz merkt sich das Ziel und schickt zur Anmeldung.
  await page.goto(`${BASE}/admin/invoices/5521`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((u) => u.pathname === "/admin/login");
  await page.getByLabel("E-Mail-Adresse", { exact: true }).fill("anna.admin@confidaraexpress.de");
  await page.getByLabel("Passwort", { exact: true }).fill("Sicheres-Admin-Passwort-2026");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.getByRole("button", { name: "Wiederherstellungscode verwenden" }).click();
  await page.getByLabel("Wiederherstellungscode", { exact: true }).fill("AAAA-BBBB-CCCC");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.waitForURL((u) => u.pathname === "/admin/sicherheit");
  await page.getByText("Sie haben Ihren letzten Wiederherstellungscode verwendet.", { exact: false }).first().waitFor({ state: "visible" });
  assert.equal(state.recovery.length, 1);
  assert.equal(state.recovery[0].loginTicket, "LT-0123456789abcdefghijklmnop");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_token")), "e2e-token-neu");
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "kein seitliches Scrollen");
  await page.close();
});

test("8 — Pflichtschalter ohne Passkey: die Anmeldung führt auch mit Deep Link zur Einrichtung, nicht zum gemerkten Ziel", async () => {
  // Gleiche Ursache wie 7: die Weiterleitung beim Rendern nahm immer das gemerkte Ziel und überschrieb „Sicherheit“.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/auth/admin-login")) return json({ token: "e2e-token-pflicht", passkeySetupRequired: true });
    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/auth/security")) return json(OHNE_PASSKEY);
    if (p.endsWith("/auth/sessions")) return json(SITZUNGEN);
    return json({});
  });
  await page.goto(`${BASE}/admin/invoices/5521`, { waitUntil: "domcontentloaded" });
  await page.waitForURL((u) => u.pathname === "/admin/login");
  await page.getByLabel("E-Mail-Adresse", { exact: true }).fill("anna.admin@confidaraexpress.de");
  await page.getByLabel("Passwort", { exact: true }).fill("Sicheres-Admin-Passwort-2026");
  await page.getByRole("button", { name: "Anmelden", exact: true }).click();
  await page.locator(".adm-sicherheit-pflicht").waitFor({ state: "visible" });
  assert.equal(new URL(page.url()).pathname, "/admin/sicherheit");
  await page.close();
});
