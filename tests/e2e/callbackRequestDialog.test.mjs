// E2E: „Rückruf anfragen“ an der Ansprechpartnerkarte (Startklar, Betreiberentscheidung 2026-11-23, Teil C).
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend — kein echter Request, kein Vorgang, keine E-Mail. Geprüft
// wird, was der Browser sendet und wie der Dialog antwortet; die Speicherung, die Adminliste und die interne Meldung
// prüft das Backend (support-callback-pg).
//
//   R1  Öffnen und Schließen: Dialog mit Titel, Fokus im ersten Feld, Name und Kontakt-Telefonnummer vorausgefüllt;
//       Escape schließt ohne Anfrage, der Fokus kehrt zu „Rückruf anfragen“ zurück, die Karte bleibt offen
//   R2  Ungültig: Fehler am Feld (aria-invalid, Beschreibung), Fokus auf das erste fehlerhafte Feld, KEINE Anfrage;
//       eine Korrektur nimmt nur den Fehler ihres Feldes zurück
//   R3  Erfolg: genau EINE Anfrage auch bei Mehrfachklick, Body genau nach Vertrag, Idempotenzschlüssel und Anmeldung
//       im Kopf; Bestätigung mit der Vorgangsnummer der Serverantwort, Fokus darauf; Schließen gibt den Fokus zurück,
//       der gemerkte Kartenzustand bleibt unberührt
//   R4  Feldfehler vom Server: Text am Feld (nie roh), Fokus dorthin; die Wiederholung trägt DENSELBEN Schlüssel
//   R5  429 und Netzwerkfehler: allgemeiner Hinweis ohne Rohtext, Fokus auf das Absenden; die Wiederholung nach dem
//       Netzwerkfehler trägt denselben Schlüssel (der Server legt höchstens einen Vorgang an)
//   R6  Während des Sendens: Felder und Knöpfe gesperrt, „Wird gesendet …“, Escape und Klick daneben schließen nicht
//   R7  Smartphone 390 und 360 px (Touch): Dialog vollständig im Fenster, kein Querüberlauf, Ziele 44 px; ein Tippen in
//       den Dialog schließt die kompakte Karte nicht, nach dem Schließen ist sie weiter offen
//   R8  Kundenservice ohne Zuordnung: derselbe Dialog
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5802, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const KUNDE = {
  id: 7, email: "einkauf@musterkunde.example", name: "Anna Berger", company_name: "Musterkunde GmbH", role: "customer",
  status: "approved", country: "DE", zip: "70173", city: "Stuttgart", street: "Königstraße 1", vat_id: "DE123456789",
  contact_phone: "+49 711 2345678",
};
const PATRICK = {
  key: "patrick", name: "Patrick Werner", phone: { display: "0175 4167701", href: "tel:+491754167701" },
  email: "p.werner@confidaraexpress.de", photo: null,
};
const ERFOLG = {
  supportRequest: { id: 77, ticketNumber: "CE-SUP26-00077", category: "callback", subject: "Bitte um Rückruf", status: "open" },
  message: "Ihr Rückrufwunsch ist bei uns eingegangen. Ihre Vorgangsnummer: CE-SUP26-00077",
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let server, browser;

// antworten: Liste der Antworten in Reihenfolge („ok“, „feld“, „limit“, „fehler“, „netz“, „langsam“); danach „ok“.
async function seite({ am = PATRICK, viewport = { width: 1440, height: 900 }, kontext = {}, antworten = [] } = {}) {
  const context = await browser.newContext({ viewport, locale: "de-DE", ...kontext });
  const page = await context.newPage();
  const zustand = { anfragen: [], fehler: [], fremd: [] };
  page.on("pageerror", (e) => zustand.fehler.push(String(e)));
  await context.route("**/*", (route) => {
    const u = route.request().url();
    if (u.startsWith(BASE) || u.startsWith("data:") || u.startsWith("blob:") || u.includes("api.confidaraexpress.de")) return route.fallback();
    zustand.fremd.push(u);
    return route.abort();
  });
  await context.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: KUNDE, pendingEmailChange: null, companyLogo: null, accountManager: am });
    if (p.endsWith("/api/kunde/account-manager/photo")) return json({ error: "Kein Foto vorhanden." }, 404);
    if (p.endsWith("/kunde/support-requests") && req.method() === "POST") {
      const h = req.headers();
      zustand.anfragen.push({ body: req.postDataJSON(), schluessel: h["idempotency-key"] || null, anmeldung: h.authorization || null });
      const art = antworten[zustand.anfragen.length - 1] || "ok";
      if (art === "netz") return route.abort("failed");
      if (art === "langsam") await new Promise((r) => setTimeout(r, 1500));
      if (art === "feld") return json({ error: "Telefonnummer roh vom Server", code: "SUPPORT_CALLBACK_PHONE_INVALID", field: "callbackPhone" }, 400);
      if (art === "limit") return json({ error: "Too many requests (raw)", code: "SUPPORT_RATE_LIMITED" }, 429);
      if (art === "fehler") return json({ error: "Interner Fehler XY-123" }, 500);
      return json(ERFOLG, 201);
    }
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    return json({ items: [], users: [], shipments: [], invoices: [], drafts: [], addresses: [], warehouses: [], summary: null, nextCursor: null, pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await page.goto(`${BASE}/dashboard`, { waitUntil: "domcontentloaded" });
  await page.locator(".pp-ansprech-dock").waitFor({ state: "attached", timeout: 30000 });
  return { context, page, zustand };
}

// Der Dialog heißt nach dem Erfolg „Rückruf angefragt“ (aria-labelledby folgt dem Titel) — deshalb ohne Namen.
const dialog = (page) => page.getByRole("dialog");
const nameFeld = (page) => dialog(page).getByLabel("Name", { exact: true });
const telFeld = (page) => dialog(page).getByLabel("Telefonnummer", { exact: true });
const grundFeld = (page) => dialog(page).getByLabel(/^Grund/);
const absenden = (page) => dialog(page).getByRole("button", { name: /Rückruf anfragen|Wird gesendet/ });
const fokus = (page) => page.evaluate(() => {
  const e = document.activeElement;
  return { tag: e.tagName.toLowerCase(), auto: e.getAttribute("autocomplete"), klasse: e.className, text: (e.textContent || "").trim().slice(0, 80) };
});

async function oeffnen(page, { tippen = false } = {}) {
  const knopf = page.locator(".pp-ansprech-aktion--rueckruf");
  if (!(await knopf.isVisible())) {
    if (tippen) await page.locator(".pp-ansprech-foto-knopf").tap(); else await page.locator(".pp-ansprech-foto-knopf").click();
  }
  if (tippen) await knopf.tap(); else await knopf.click();
  await dialog(page).waitFor({ timeout: 10000 });
  // Öffnungsbewegung des Dialogs (Skalierung 0,985 → 1) abwarten — sonst misst jedes Rechteck 1,5 % zu klein.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest(".sup-dialog-overlay"))
    .map((a) => a.finished.catch(() => {}))));
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("R1 — Öffnen und Schließen: Titel, Fokus im ersten Feld, Vorschlag aus dem Konto; Escape ohne Anfrage", async () => {
  const { context, page, zustand } = await seite();
  await oeffnen(page);
  assert.equal(await page.getByRole("dialog", { name: "Rückruf anfragen" }).count(), 1, "Titel als Name des Dialogs");
  assert.equal(await dialog(page).getAttribute("aria-modal"), "true");
  assert.match(await dialog(page).innerText(), /Sagen Sie uns, unter welcher Nummer wir Sie erreichen/);
  assert.equal((await fokus(page)).auto, "name", "der Fokus steht im Namensfeld");
  assert.deepEqual([await nameFeld(page).inputValue(), await telFeld(page).inputValue(), await grundFeld(page).inputValue()],
    ["Anna Berger", "+49 711 2345678", ""]);
  // Eine Primärschaltfläche; der Dialog liegt über der Karte.
  assert.equal(await dialog(page).locator(".btn-primary").count(), 1);
  const ebenen = await page.evaluate(() => {
    const z = (s) => Number(getComputedStyle(document.querySelector(s)).zIndex) || 0;
    return { dialog: z(".sup-dialog-overlay"), dock: z(".pp-ansprech-dock") };
  });
  assert.ok(ebenen.dialog > ebenen.dock, JSON.stringify(ebenen));
  await page.keyboard.press("Escape");
  await dialog(page).waitFor({ state: "detached" });
  assert.match((await fokus(page)).klasse, /pp-ansprech-aktion--rueckruf/, "der Fokus kehrt zum Auslöser zurück");
  assert.equal(await page.locator(".pp-ansprech-dock").getAttribute("data-offen"), "ja", "die Karte bleibt offen");
  assert.equal(zustand.anfragen.length, 0);
  assert.deepEqual([zustand.fehler, zustand.fremd], [[], []]);
  await context.close();
});

test("R2 — ungültig: Fehler am Feld, Fokus auf das erste, keine Anfrage; eine Korrektur nimmt nur ihren Fehler zurück", async () => {
  const { context, page, zustand } = await seite();
  await oeffnen(page);
  await nameFeld(page).fill(" ");
  await telFeld(page).fill("abc");
  await grundFeld(page).fill("x".repeat(20));
  await absenden(page).click();
  await page.waitForTimeout(200);
  assert.equal(zustand.anfragen.length, 0, "bei Feldfehlern wird nichts gesendet");
  assert.deepEqual([await nameFeld(page).getAttribute("aria-invalid"), await telFeld(page).getAttribute("aria-invalid"), await grundFeld(page).getAttribute("aria-invalid")],
    ["true", "true", null]);
  assert.equal((await fokus(page)).auto, "name", "der Fokus springt auf das erste fehlerhafte Feld");
  const beschreibung = async (feld) => {
    const ids = ((await feld.getAttribute("aria-describedby")) || "").split(" ").filter(Boolean);
    return Promise.all(ids.map((id) => page.locator(`[id="${id}"]`).innerText()));
  };
  assert.deepEqual(await beschreibung(nameFeld(page)), ["Bitte geben Sie Ihren Namen an (2 bis 100 Zeichen)."]);
  assert.deepEqual(await beschreibung(telFeld(page)), ["Bitte geben Sie eine gültige Telefonnummer ein (Beispiel: +49 711 123456-78)."]);
  await nameFeld(page).fill("Anna Berger");
  assert.equal(await nameFeld(page).getAttribute("aria-invalid"), null, "der korrigierte Fehler ist weg");
  assert.equal(await telFeld(page).getAttribute("aria-invalid"), "true", "der andere bleibt stehen");
  assert.deepEqual(zustand.fehler, []);
  await context.close();
});

test("R3 — Erfolg: genau eine Anfrage nach Vertrag, Vorgangsnummer aus der Antwort, Fokus zurück, Kartenzustand unberührt", async () => {
  const { context, page, zustand } = await seite({ antworten: ["langsam"] });
  await oeffnen(page);
  await grundFeld(page).fill("  Frage zur Rechnung vom 20. November  ");
  // Drei Absendeversuche im selben Takt — schneller, als React den Knopf sperren kann. Gesendet wird einmal: die Sperre
  // hängt an einem Ref, nicht am State.
  await dialog(page).locator("form").evaluate((f) => { f.requestSubmit(); f.requestSubmit(); f.requestSubmit(); });
  const erfolg = dialog(page).locator(".sup-dialog-success");
  await erfolg.waitFor({ timeout: 10000 });
  assert.equal(zustand.anfragen.length, 1, "genau eine Anfrage");
  const [a] = zustand.anfragen;
  assert.deepEqual(a.body, { category: "callback", callbackName: "Anna Berger", callbackPhone: "+49 711 2345678", message: "Frage zur Rechnung vom 20. November" });
  assert.match(a.schluessel || "", UUID, "Idempotenzschlüssel im Kopf");
  assert.equal(a.anmeldung, "Bearer e2e-token");
  assert.equal(await erfolg.innerText(), "Ihr Rückrufwunsch ist bei uns eingegangen. Ihre Vorgangsnummer: CE-SUP26-00077");
  assert.equal(await erfolg.getAttribute("role"), "status");
  assert.equal(await page.getByRole("dialog", { name: "Rückruf angefragt" }).count(), 1, "die Handlung trägt ihren Namen weiter");
  assert.match((await fokus(page)).klasse, /sup-dialog-success/, "der Fokus steht auf der Bestätigung");
  assert.match(await dialog(page).innerText(), /unter „Supportanfragen“/);
  assert.doesNotMatch(await dialog(page).innerText(), /Minute|Stunde|heute|sofort|umgehend|innerhalb/i, "keine Zusage einer Rückrufzeit");
  await dialog(page).getByRole("button", { name: "Schließen" }).click();
  await dialog(page).waitFor({ state: "detached" });
  assert.match((await fokus(page)).klasse, /pp-ansprech-aktion--rueckruf/);
  assert.equal(await page.locator(".pp-ansprech-dock").getAttribute("data-offen"), "ja");
  assert.equal(await page.evaluate(() => localStorage.getItem("ce_ansprechpartner_karte")), null, "der gemerkte Kartenzustand bleibt unberührt");
  // Ein neuer Dialog ist ein neuer Vorgang: neuer Schlüssel.
  await oeffnen(page);
  await absenden(page).click();
  await dialog(page).locator(".sup-dialog-success").waitFor({ timeout: 10000 });
  assert.equal(zustand.anfragen.length, 2);
  assert.notEqual(zustand.anfragen[1].schluessel, a.schluessel);
  assert.deepEqual([zustand.fehler, zustand.fremd], [[], []]);
  await context.close();
});

test("R4 — Feldfehler vom Server: eigener Text am Feld, Fokus dorthin; die Wiederholung trägt denselben Schlüssel", async () => {
  const { context, page, zustand } = await seite({ antworten: ["feld", "ok"] });
  await oeffnen(page);
  await absenden(page).click();
  await page.waitForFunction(() => document.querySelector('[role="dialog"] input[type="tel"]')?.getAttribute("aria-invalid") === "true");
  assert.equal((await fokus(page)).auto, "tel", "der Fokus steht im Telefonfeld");
  const text = await dialog(page).innerText();
  assert.match(text, /Bitte geben Sie eine gültige Telefonnummer ein/);
  assert.doesNotMatch(text, /roh vom Server/, "kein Rohtext des Servers");
  await telFeld(page).fill("0711 2345678");
  await absenden(page).click();
  await dialog(page).locator(".sup-dialog-success").waitFor({ timeout: 10000 });
  assert.equal(zustand.anfragen.length, 2);
  assert.equal(zustand.anfragen[1].body.callbackPhone, "0711 2345678");
  assert.equal(zustand.anfragen[0].schluessel, zustand.anfragen[1].schluessel, "dieselbe Dialogsitzung, derselbe Schlüssel");
  await context.close();
});

test("R5 — 429 und Netzwerkfehler: allgemeiner Hinweis ohne Rohtext, Fokus auf das Absenden, Wiederholung mit demselben Schlüssel", async () => {
  const { context, page, zustand } = await seite({ antworten: ["limit", "netz", "fehler", "ok"] });
  await oeffnen(page);
  const hinweis = dialog(page).locator(".sup-dialog-error");
  await absenden(page).click();
  await hinweis.waitFor({ timeout: 10000 });
  assert.match(await hinweis.innerText(), /mehrere Anfragen gesendet/);
  assert.doesNotMatch(await dialog(page).innerText(), /raw|Too many/);
  assert.match((await fokus(page)).klasse, /btn-primary/, "der Fokus steht auf dem Absenden");
  await absenden(page).click();
  await page.waitForFunction(() => /Verbindung zum Server ist fehlgeschlagen/.test(document.querySelector(".sup-dialog-error")?.innerText || ""));
  await absenden(page).click();
  await page.waitForFunction(() => /konnte nicht übermittelt werden/.test(document.querySelector(".sup-dialog-error")?.innerText || ""));
  assert.doesNotMatch(await dialog(page).innerText(), /XY-123/);
  await absenden(page).click();
  await dialog(page).locator(".sup-dialog-success").waitFor({ timeout: 10000 });
  assert.equal(zustand.anfragen.length, 4);
  assert.equal(new Set(zustand.anfragen.map((x) => x.schluessel)).size, 1, "alle Wiederholungen mit demselben Schlüssel");
  assert.deepEqual(zustand.fehler, []);
  await context.close();
});

test("R6 — während des Sendens: gesperrt, „Wird gesendet …“, Escape und Klick daneben schließen nicht", async () => {
  const { context, page, zustand } = await seite({ antworten: ["langsam"] });
  await oeffnen(page);
  await absenden(page).click();
  await dialog(page).getByRole("button", { name: /Wird gesendet/ }).waitFor({ timeout: 5000 });
  const gesperrt = await dialog(page).evaluate((d) => [...d.querySelectorAll("input, textarea, button")].map((e) => e.disabled));
  assert.ok(gesperrt.length >= 5 && gesperrt.every(Boolean), `alles gesperrt: ${gesperrt}`);
  assert.equal(await dialog(page).getByRole("button", { name: /Wird gesendet/ }).getAttribute("aria-busy"), "true");
  // Gesperrte Bedienelemente nehmen keinen Fokus — Escape geht deshalb direkt an den Dialog (dort hört useDialog).
  await dialog(page).evaluate((d) => d.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await page.mouse.click(20, 20);
  assert.equal(await dialog(page).count(), 1, "der Dialog bleibt offen, solange gesendet wird");
  await dialog(page).locator(".sup-dialog-success").waitFor({ timeout: 10000 });
  assert.equal(zustand.anfragen.length, 1);
  await context.close();
});

test("R7 — Smartphone 390 und 360 px: vollständig im Fenster, 44 px, die kompakte Karte bleibt offen", async () => {
  for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
    const { context, page, zustand } = await seite({ viewport, kontext: { hasTouch: true, isMobile: true, deviceScaleFactor: 3 } });
    assert.equal(await page.locator(".pp-ansprech-dock").getAttribute("data-form"), "kompakt");
    await oeffnen(page, { tippen: true });
    const m = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"]');
      const r = d.getBoundingClientRect();
      const ziele = [...d.querySelectorAll("input, textarea, button")].map((e) => Math.round(e.getBoundingClientRect().height));
      return { l: r.left, r: r.right, t: r.top, w: window.innerWidth, ueberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth, ziele };
    });
    assert.ok(m.l >= 0 && m.r <= m.w, `${viewport.width}: im Fenster ${JSON.stringify(m)}`);
    assert.ok(m.ueberlauf <= 0, `${viewport.width}: Querüberlauf ${m.ueberlauf}`);
    assert.ok(m.ziele.every((h) => h >= 44), `${viewport.width}: Ziele ${m.ziele}`);
    // Ein Tippen in den Dialog ist kein Tippen neben die Karte.
    await grundFeld(page).tap();
    await page.keyboard.type("Sendung 4711");
    await dialog(page).getByRole("button", { name: "Abbrechen" }).tap();
    await dialog(page).waitFor({ state: "detached" });
    assert.equal(await page.locator(".pp-ansprech-dock").getAttribute("data-offen"), "ja", `${viewport.width}: die kompakte Karte bleibt offen`);
    assert.match((await fokus(page)).klasse, /pp-ansprech-aktion--rueckruf/);
    assert.equal(zustand.anfragen.length, 0);
    assert.deepEqual(zustand.fehler, []);
    await context.close();
  }
});

test("R8 — Kundenservice ohne Zuordnung: derselbe Dialog, dieselbe Route", async () => {
  const { context, page, zustand } = await seite({ am: null });
  await oeffnen(page);
  assert.deepEqual([await nameFeld(page).inputValue(), await telFeld(page).inputValue()], ["Anna Berger", "+49 711 2345678"]);
  await absenden(page).click();
  await dialog(page).locator(".sup-dialog-success").waitFor({ timeout: 10000 });
  assert.equal(zustand.anfragen.length, 1);
  assert.equal(zustand.anfragen[0].body.category, "callback");
  await context.close();
});
