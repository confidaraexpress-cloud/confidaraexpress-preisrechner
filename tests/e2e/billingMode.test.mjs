// Browser-Smokes: Abrechnungsart & Sammelrechnung (Paket 4, P5 Antrag und Freigabe).
//
// Echter Dev-Server, echte Kaskade, echte Requests — Backend vollständig gemockt.
// Genau die Wege, die eine Quelltextprüfung nicht erreicht:
//
//   • die Profilkarte zeigt den gespeicherten Modus,
//   • ein Einzelrechnungskonto fragt den Sammelzeitraum GAR NICHT ab,
//   • ein Sammelkonto zeigt Zeitraum, Anzahl, Betrag und den Vorschau-Vorbehalt,
//   • ein Ausfall der Vorschau bricht die Karte nicht,
//   • 390 px ohne horizontalen Überlauf,
//   • P5: die Sammelrechnung ist nie direkt wählbar — sie wird BEANTRAGT (POST nur mit der Begründung),
//     der Status steht wahrheitsgemäß da (beantragt, abgelehnt mit Grund, zurückgezogen, aktiv), ein offener
//     Antrag lässt sich zurückziehen, nach Ablehnung oder Rücknahme neu stellen, und der Rückweg auf die
//     Einzelrechnung bleibt frei,
//   • wer mit der Tastatur umstellt, behält beim Speichern den Fokus (Rechnungsstellung und Lieferschein).
//
// Der Mock bildet den Backendvertrag nach: /kundenbereich liefert `billingCapabilities` TOP-LEVEL, der
// Profil-PATCH lehnt einen NEUEN Wechsel auf die Sammelrechnung mit 409 BILLING_MODE_APPROVAL_REQUIRED ab
// (routes/kunde/profile.js), und /kunde/billing-mode-requests folgt routes/kunde/billingModeRequests.js.
//
// NIEMALS eine echte Bestellung und NIE ein echter Sammelrechnungslauf: alle Backendrufe sind abgefangen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  AUSLOESER, OPTION, gewaehlterWert, oeffneMenue, optionen, schliesseMenue, waehleOption,
} from "./helpers/auswahlMenue.mjs";

const PORT = 5247, BASE = `http://127.0.0.1:${PORT}`;

// Abrechnungsart und Lieferscheine sind kompakte Auswahlmenüs (Premium Control System 2.0, 2026-11-14). Die Optionen
// behalten ihre Kennungen (bm-mode-…, dn-mode-…), stehen aber nur in der OFFENEN Liste; der gewählte Wert steht am
// Feld (data-wert), gesperrte Optionen tragen aria-disabled.
const BM = "billingMode", DN = "deliveryNoteMode";
const modus = (page) => gewaehlterWert(page, BM);
const bmOption = async (page, wert) => (await optionen(page, BM)).find((o) => o.wert === wert);
/** Echter Mausklick auf eine Option der offenen Liste — auch auf eine gesperrte, die Playwright nicht annimmt (kein
 *  force): ein Kunde kann sie treffen, das Bauteil muss sie ignorieren. */
async function klickeOption(page, name, wert) {
  await oeffneMenue(page, name);
  const box = await page.locator(OPTION(name, wert)).boundingBox();
  assert.ok(box, `${name}/${wert}: die Option steht nicht in der Liste`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}
const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

const BASE_USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", city: "Berlin",
  street: "Musterstr. 1", customer_number: "CE-K-10030", payment_term: 7,
  delivery_note_mode: "none",
};

const PERIOD_OK = {
  billingMode: "consolidated_7d",
  period: { start: "2026-09-03", end: "2026-09-09", invoiceDate: "2026-09-10" },
  periodComplete: false,
  shipmentCount: 3,
  grossAmount: 46.65,
  shipmentsInEarlierPeriods: 0,
  shipments: [],
};

const ANTRAG = (status, extra = {}) => ({
  id: 5, status, requestedMode: "consolidated_7d", customerNote: null,
  requestedAt: "2026-11-04T09:15:00.000Z", decidedAt: null, withdrawnAt: null, rejectionReason: null, ...extra,
});

let server, browser;

async function setupRoutes(ziel, opts) {
  const state = opts.state;
  await ziel.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    const faehig = () => (state.capabilities !== undefined ? { billingCapabilities: state.capabilities } : {});

    if (p.endsWith("/kundenbereich")) {
      return json({ user: { ...BASE_USER, billing_mode: state.mode, delivery_note_mode: state.dnMode }, ...faehig() });
    }

    if (p.endsWith("/kunde/profil") && method === "PATCH") {
      const body = JSON.parse(req.postData() || "{}");
      state.patches.push(body);
      // Ein langsamer Server macht das Speicherfenster messbar (B12).
      if (state.patchDelayMs) await new Promise((r) => setTimeout(r, state.patchDelayMs));
      if (body.billing_mode === "consolidated_7d" && state.mode !== "consolidated_7d") {
        return json({
          error: "Die Sammelrechnung können Sie beantragen. Bis zur Genehmigung werden Ihre Sendungen weiter einzeln abgerechnet.",
          code: "BILLING_MODE_APPROVAL_REQUIRED", field: "billing_mode",
        }, 409);
      }
      if (typeof body.billing_mode === "string") state.mode = body.billing_mode;
      if (typeof body.delivery_note_mode === "string") state.dnMode = body.delivery_note_mode;
      return json({ user: { ...BASE_USER, billing_mode: state.mode, delivery_note_mode: state.dnMode } });
    }

    // P5: Antrag — lesen, stellen, zurückziehen.
    if (p.endsWith("/kunde/billing-mode-requests/current") && method === "GET") {
      state.requestReads += 1;
      if (state.requestReadFails) return json({ error: "Fehler" }, 500);
      return json({
        request: state.request,
        billingMode: state.readMode || state.mode,
        billingCapabilities: state.capabilities || { consolidated7dAvailable: false },
      });
    }
    if (p.endsWith("/kunde/billing-mode-requests") && method === "POST") {
      const body = JSON.parse(req.postData() || "{}");
      state.posts.push(body);
      if (state.mode === "consolidated_7d") return json({ error: "Ihr Konto nutzt die Sammelrechnung bereits.", code: "BILLING_MODE_ALREADY_CONSOLIDATED" }, 409);
      if (state.request && state.request.status === "pending") {
        return json({ error: "Sie haben bereits einen offenen Antrag. Er wird geprüft.", code: "BILLING_MODE_REQUEST_PENDING", request: state.request }, 409);
      }
      state.request = ANTRAG("pending", { id: (state.request?.id || 4) + 1, customerNote: body.note || null });
      return json({ request: state.request }, 201);
    }
    if (p.endsWith("/kunde/billing-mode-requests/current") && method === "DELETE") {
      state.deletes += 1;
      if (!state.request) return json({ error: "Es gibt keinen offenen Antrag.", code: "BILLING_MODE_REQUEST_NOT_FOUND" }, 404);
      if (state.request.status !== "pending") {
        return json({ error: "Über Ihren Antrag wurde bereits entschieden.", code: "BILLING_MODE_REQUEST_NOT_PENDING", request: state.request }, 409);
      }
      state.request = { ...state.request, status: "withdrawn", withdrawnAt: "2026-11-05T08:00:00.000Z" };
      return json({ request: state.request });
    }

    if (p.endsWith("/kunde/consolidated-invoice/current")) {
      state.periodCalls += 1;
      if (state.periodFails) return json({ error: "Fehler" }, 500);
      return json(state.periodBody || PERIOD_OK);
    }

    // Es darf in diesem Lauf NIE eine Bestellung, NIE ein Sammellauf und NIE ein Adminweg entstehen.
    if (p.endsWith("/book")) return json({ error: "im Smoke nicht erlaubt" }, 500);
    if (p.includes("/consolidated-invoices/run")) return json({ error: "im Smoke nicht erlaubt" }, 500);
    if (p.includes("/admin/")) { state.adminCalls += 1; return json({ error: "im Smoke nicht erlaubt" }, 500); }

    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    if (p.includes("/company-logo")) return json({ error: "kein Logo" }, 404);
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], summary: null, pagination: { total: 0 } });
  });
}

async function neueSeite(mode, extra = {}, viewport = { width: 1280, height: 1000 }, kontext = {}) {
  // `capabilities` undefined = älteres Backend ohne das Feld in /kundenbereich.
  const state = {
    mode, dnMode: BASE_USER.delivery_note_mode, patchDelayMs: 0,
    patches: [], periodCalls: 0, periodFails: false, periodBody: null, capabilities: undefined,
    request: null, readMode: null, requestReads: 0, requestReadFails: false, posts: [], deletes: 0, adminCalls: 0, ...extra,
  };
  // `kontext`: weitere Browsereinstellungen, etwa Touch (hasTouch, isMobile) für B20.
  const ctx = await browser.newContext({ viewport, ...kontext });
  await setupRoutes(ctx, { state });
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem("ce_token", "test-token"); });
  return { ctx, page, fehler, state };
}

async function zumProfil(page) {
  await page.goto(`${BASE}/dashboard?page=profile`, { waitUntil: "networkidle" });
  await page.waitForSelector(AUSLOESER(BM), { timeout: 15000 });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], {
    stdio: "ignore", ...DEV_SERVER_SPAWN,
  });
  const deadline = Date.now() + 60000;
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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`,
    // das seinerseits node startet. Ein Signal an den npx-Prozess laesst
    // den Enkel — den eigentlichen Dev-Server — auf seinem Port stehen.
    stopDevServer(server, "SIGKILL");
  }
});

// ─────────────────────────────────────────────────────────────────

test("B1 — die Karte zeigt den GESPEICHERTEN Modus, nicht einen Standard", async () => {
  const { ctx, page, fehler } = await neueSeite("consolidated_7d");
  await zumProfil(page);
  assert.equal(await modus(page), "consolidated_7d");
  const liste = await optionen(page, BM);
  assert.deepEqual(liste.map((o) => [o.id, o.gewaehlt]), [["bm-mode-single", false], ["bm-mode-consolidated_7d", true]]);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B2 — ein Einzelrechnungskonto fragt den Sammelzeitraum GAR NICHT ab", async () => {
  // Ein Request, den ein Konto nie braucht, ist kein harmloser Zusatzaufruf: er
  // stünde in jedem Profilaufruf jedes Bestandskunden.
  const { ctx, page, state, fehler } = await neueSeite("single");
  await zumProfil(page);
  await page.waitForTimeout(600);
  assert.equal(state.periodCalls, 0, "kein Abruf des Sammelzeitraums erwartet");
  assert.equal(await page.locator(".bm-period").count(), 0, "kein Zeitraumblock bei Einzelabrechnung");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B3 — ein Sammelkonto zeigt Zeitraum, Anzahl, Betrag und den Vorbehalt", async () => {
  const { ctx, page, state, fehler } = await neueSeite("consolidated_7d");
  await zumProfil(page);
  await page.waitForSelector(".bm-period", { timeout: 15000 });
  const text = await page.locator(".bm-period").innerText();
  assert.ok(state.periodCalls >= 1, "der Zeitraum muss geholt werden");
  assert.match(text, /03\.09\.2026 – 09\.09\.2026/);
  assert.match(text, /10\.09\.2026/, "das voraussichtliche Rechnungsdatum fehlt");
  assert.match(text, /46,65/, "der voraussichtliche Betrag fehlt");
  assert.match(text, /Vorschau auf den laufenden Zeitraum/,
    "ohne Vorbehalt sähe der Betrag wie eine feststehende Rechnungssumme aus");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B4 — 0 Sendungen ergeben den leeren Zustand, keine leere Fläche", async () => {
  const { ctx, page, fehler } = await neueSeite("consolidated_7d", {
    periodBody: { billingMode: "consolidated_7d", period: null, shipmentCount: 0, grossAmount: 0, shipments: [] },
  });
  await zumProfil(page);
  await page.waitForSelector(".bm-period", { timeout: 15000 });
  assert.match(await page.locator(".bm-period").innerText(), /noch keine Sendung gebucht/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B5 — ein Ausfall der Vorschau bricht die Karte nicht", async () => {
  const { ctx, page, fehler } = await neueSeite("consolidated_7d", { periodFails: true });
  await zumProfil(page);
  await page.waitForSelector(".bm-period", { timeout: 15000 });
  // Die Auswahl bleibt bedienbar, es steht nur eine ruhige Hinweiszeile darüber.
  assert.equal(await modus(page), "consolidated_7d");
  assert.equal(await page.locator(AUSLOESER(BM)).isEnabled(), true);
  assert.match(await page.locator(".bm-period").innerText(), /konnte nicht geladen werden/);
  assert.deepEqual(fehler, [], "ein Ladefehler darf keinen Renderfehler erzeugen");
  await ctx.close();
});

test("B6 — P5: ein Einzelrechnungskonto BEANTRAGT die Sammelrechnung — POST nur mit der Begründung, kein PATCH, Status „beantragt“", async () => {
  const { ctx, page, state, fehler } = await neueSeite("single", { capabilities: { consolidated7dAvailable: true } });
  await zumProfil(page);
  await page.waitForSelector("#bm-request-submit", { timeout: 15000 });
  assert.match(norm(await page.locator(".bm-request-form").innerText()), /Ein Antrag ist noch keine Umstellung/);
  await page.locator("#bm-request-note").fill("Etwa 40 Pakete pro Woche");
  assert.match(norm(await page.locator("#bm-request-note-count").innerText()), /^24 \/ 500$/);
  await page.locator("#bm-request-submit").click();
  await page.waitForSelector("#bm-request-done", { timeout: 15000 });
  assert.deepEqual(state.posts, [{ note: "Etwa 40 Pakete pro Woche" }], "der Antrag darf ausschließlich die Begründung tragen");
  assert.equal(state.patches.length, 0, "ein Antrag ist keine Umstellung über den Profil-PATCH");
  const status = norm(await page.locator("#bm-request-status").innerText());
  assert.match(status, /Beantragt am 04\.11\.2026 – wird geprüft/);
  assert.match(status, /weiterhin eine Einzelrechnung/);
  assert.match(status, /Ihre Begründung: Etwa 40 Pakete pro Woche/);
  assert.equal(await modus(page), "single", "die Abrechnungsart bleibt die Einzelrechnung");
  assert.equal(await page.locator("#bm-request-submit").count(), 0, "ein offener Antrag erlaubt keinen zweiten");
  assert.equal(await page.locator("#bm-request-withdraw").count(), 1);
  assert.equal(state.periodCalls, 0, "kein Sammelzeitraum ohne Sammelrechnung");
  assert.equal(state.adminCalls, 0, "das Kundenportal ruft keinen Adminweg");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B7 — ein erneuter Klick auf denselben Modus sendet nichts", async () => {
  const { ctx, page, state, fehler } = await neueSeite("consolidated_7d");
  await zumProfil(page);
  // Die gewählte Option noch einmal anklicken: die Liste schließt, nichts wird gemeldet.
  await waehleOption(page, BM, "consolidated_7d");
  await page.waitForTimeout(500);
  assert.equal(state.patches.length, 0, "ein No-Op darf keinen Request erzeugen");
  assert.equal(await modus(page), "consolidated_7d");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B8 — 390 px: kein horizontaler Überlauf (Sammelkonto und Antragsformular)", async () => {
  for (const [mode, sel] of [["consolidated_7d", ".bm-period"], ["single", "#bm-request-submit"]]) {
    const { ctx, page, fehler } = await neueSeite(mode, {}, { width: 390, height: 900 });
    await zumProfil(page);
    await page.waitForSelector(sel, { timeout: 15000 });
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${mode}: horizontaler Überlauf: ${overflow}px`);
    assert.deepEqual(fehler, []);
    await ctx.close();
  }
});

// ─── Wählbarkeit und Antrag (P5) ─────────────────────────────────────────────────

test("B9 — die Sammelrechnung ist nie direkt wählbar (mit und ohne Fähigkeit): gesperrt, „Nur auf Antrag.“, KEIN PATCH", async () => {
  for (const capabilities of [undefined, { consolidated7dAvailable: false }, { consolidated7dAvailable: true }]) {
    const fall = JSON.stringify(capabilities) ?? "ohne Feld";
    const { ctx, page, state, fehler } = await neueSeite("single", { capabilities });
    await zumProfil(page);
    assert.equal((await bmOption(page, "consolidated_7d"))?.gesperrt, true, `${fall}: Option nicht gesperrt`);
    assert.equal(await modus(page), "single");
    // Der Grund steht an der gesperrten Option in der Liste.
    await oeffneMenue(page, BM);
    assert.equal(await page.locator(OPTION(BM, "consolidated_7d")).getByText("Nur auf Antrag.", { exact: true }).count(), 1,
      `${fall}: der Hinweis fehlt`);
    await klickeOption(page, BM, "consolidated_7d");
    await page.waitForTimeout(500);
    await schliesseMenue(page, BM);
    assert.equal(state.patches.length, 0, `${fall}: eine gesperrte Option darf keinen Request erzeugen`);
    assert.equal(await modus(page), "single", `${fall}: die Auswahl ist gewandert`);
    assert.equal(state.periodCalls, 0, `${fall}: kein Sammelzeitraum für ein Einzelrechnungskonto`);
    assert.deepEqual(fehler, []);
    await ctx.close();
  }
});

test("B10 — Bestandskonto: behält die Sammelrechnung, erfährt die Folge des Rückwegs, kann zurück — danach nur per Antrag", async () => {
  const { ctx, page, state, fehler } = await neueSeite("consolidated_7d", { capabilities: { consolidated7dAvailable: false } });
  await zumProfil(page);
  assert.equal(await modus(page), "consolidated_7d", "das Bestandskonto wird nie umgedeutet");
  assert.equal((await bmOption(page, "consolidated_7d"))?.gesperrt, false, "die gespeicherte Wahl bleibt wählbar");
  const vermerk = page.getByText("Ihr Konto nutzt weiterhin die Sammelrechnung.", { exact: false });
  assert.equal(await vermerk.count(), 1, "der Hinweis auf die gesperrte Buchung fehlt");
  assert.match(norm(await page.locator("#bm-switch-back-note").innerText()), /neuer Antrag nötig/);
  assert.match(norm(await page.locator("#bm-request-status").innerText()), /Sammelrechnung aktiv/);
  await waehleOption(page, BM, "single");
  await page.waitForSelector(".profile-saved", { timeout: 15000 });
  assert.deepEqual(state.patches, [{ billing_mode: "single" }], "der Rückweg sendet genau diesen einen Schlüssel");
  // Danach ist die Sammelrechnung ein NEUER Wechsel — gesperrt, und der Antrag steht offen.
  await page.waitForSelector("#bm-request-submit", { timeout: 15000 });
  await oeffneMenue(page, BM);
  await page.waitForFunction(() => document.querySelector("#bm-mode-consolidated_7d")?.getAttribute("aria-disabled") === "true",
    null, { timeout: 15000 });
  await schliesseMenue(page, BM);
  assert.equal(await modus(page), "single");
  assert.equal(await vermerk.count(), 0, "der Bestandsvermerk gilt nur, solange das Konto die Sammelrechnung führt");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B11 — Doppelantrag (zweiter Tab): kein falscher Erfolg — der offene Antrag erscheint mit dem Servertext", async () => {
  // Die Karte kennt den offenen Antrag noch nicht (gelesen vor dem zweiten Tab) — der Server hat das letzte Wort.
  const { ctx, page, state, fehler } = await neueSeite("single", { capabilities: { consolidated7dAvailable: true } });
  await zumProfil(page);
  await page.waitForSelector("#bm-request-submit", { timeout: 15000 });
  state.request = ANTRAG("pending", { customerNote: "aus dem anderen Tab" });
  await page.locator("#bm-request-submit").click();
  await page.locator("#bm-request-error", { hasText: "Sie haben bereits einen offenen Antrag." }).waitFor({ timeout: 15000 });
  assert.equal(state.posts.length, 1, "genau ein Versuch");
  assert.equal(await page.locator("#bm-request-done").count(), 0, "keine Erfolgsmeldung bei einer Ablehnung");
  assert.match(norm(await page.locator("#bm-request-status").innerText()), /Ihre Begründung: aus dem anderen Tab/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

// ─── Tastatur: Fokus beim Speichern (Editorial Premium, 2026-10-28) ──────────────

test("B12 — Tastatur: beim Speichern bleibt der Fokus auf der Auswahl (Rückweg und Lieferschein)", async () => {
  // Vorher sperrte `fieldset disabled` die ganze Gruppe während des Speicherns. Das fokussierte
  // Optionsfeld wurde mitgesperrt, der Browser nahm ihm den Fokus (document.body), und wer mit der
  // Tastatur umstellte, begann nach jedem Speichern wieder am Seitenanfang.
  const { ctx, page, state, fehler } = await neueSeite("consolidated_7d", {
    capabilities: { consolidated7dAvailable: true }, patchDelayMs: 600,
  });
  await zumProfil(page);
  const fokus = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
  // Sperren der übrigen Optionen: mit der Tastatur öffnen (der Fokus bleibt am Feld), lesen, mit Escape schließen.
  const gesperrt = async (name, ids) => {
    await page.keyboard.press("ArrowDown");
    await page.locator(`[role="listbox"][data-auswahl="${name}"]`).waitFor({ state: "visible", timeout: 5000 });
    const werte = await Promise.all(ids.map((id) => page.locator(`#${id}`).getAttribute("aria-disabled")));
    await page.keyboard.press("Escape");
    await page.locator(`[role="listbox"][data-auswahl="${name}"]`).waitFor({ state: "detached", timeout: 5000 });
    return werte.map((w) => w === "true");
  };

  // Tastatur wie ein Kunde: Feld fokussieren, Enter öffnet (Markierung auf der gewählten Option), ArrowUp markiert die
  // Option darüber, Enter wählt — die Liste schließt, gespeichert wird.
  const faelle = [
    // P5: der Rückweg auf die Einzelrechnung; danach ist die Sammelrechnung gesperrt (nur auf Antrag).
    { name: BM, feld: "bm-mode", ziel: "single", andere: ["bm-mode-consolidated_7d"],
      danachGesperrt: [true], body: { billing_mode: "single" } },
    { name: DN, feld: "dn-mode", ziel: "external", andere: ["dn-mode-confidara", "dn-mode-none"],
      danachGesperrt: [false, false], body: { delivery_note_mode: "external" } },
  ];
  for (const f of faelle) {
    await page.locator(AUSLOESER(f.name)).focus();
    const vorher = state.patches.length;
    await page.keyboard.press("Enter");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("Enter");

    // Während des Speicherns: Fokus am Feld, der neue Wert steht schon da, die übrigen Optionen bleiben gesperrt.
    assert.equal(await fokus(), f.feld, `${f.ziel}: Fokus während des Speicherns verloren`);
    assert.equal(await gewaehlterWert(page, f.name), f.ziel);
    assert.equal(await page.locator(AUSLOESER(f.name)).getAttribute("aria-busy"), "true", `${f.ziel}: kein Speicherzustand am Feld`);
    assert.deepEqual(await gesperrt(f.name, f.andere), f.andere.map(() => true),
      `${f.ziel}: während des Speicherns darf keine zweite Umstellung möglich sein`);

    await page.locator(".profile-section-body", { has: page.locator(AUSLOESER(f.name)) })
      .locator(".profile-saved").waitFor({ timeout: 15000 });
    assert.equal(await fokus(), f.feld, `${f.ziel}: Fokus nach dem Speichern verloren`);
    assert.equal(await gewaehlterWert(page, f.name), f.ziel);
    assert.deepEqual(await gesperrt(f.name, f.andere), f.danachGesperrt, `${f.ziel}: Sperre nach dem Speichern`);
    assert.equal(await fokus(), f.feld, `${f.ziel}: Fokus nach dem Schließen der Liste verloren`);
    assert.equal(state.patches.length, vorher + 1, `${f.ziel}: genau ein PATCH je Umstellung`);
    assert.deepEqual(state.patches.at(-1), f.body);
  }
  assert.equal(state.mode, "single");
  assert.equal(state.dnMode, "external");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

// ─── Antragsstatus (P5) ──────────────────────────────────────────────────────────

test("B13 — Rücknahme: „Antrag zurückziehen“ sendet DELETE, der Status lautet „zurückgezogen“, ein neuer Antrag ist möglich", async () => {
  const { ctx, page, state, fehler } = await neueSeite("single", {
    capabilities: { consolidated7dAvailable: true }, request: ANTRAG("pending"),
  });
  await zumProfil(page);
  await page.waitForSelector("#bm-request-withdraw", { timeout: 15000 });
  assert.equal(await page.locator("#bm-request-submit").count(), 0);
  await page.locator("#bm-request-withdraw").click();
  await page.locator("#bm-request-done", { hasText: "Antrag zurückgezogen" }).waitFor({ timeout: 15000 });
  assert.equal(state.deletes, 1);
  assert.match(norm(await page.locator("#bm-request-status").innerText()), /Zurückgezogen am 05\.11\.2026/);
  assert.equal(await page.locator("#bm-request-submit").count(), 1, "nach der Rücknahme ist ein neuer Antrag möglich");
  assert.equal(state.patches.length, 0);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B14 — Ablehnung: Grund und Datum stehen da, der Kunde kann erneut beantragen", async () => {
  const { ctx, page, state, fehler } = await neueSeite("single", {
    capabilities: { consolidated7dAvailable: true },
    request: ANTRAG("rejected", { decidedAt: "2026-11-06T10:00:00.000Z", rejectionReason: "Bitte melden Sie sich in drei Monaten erneut." }),
  });
  await zumProfil(page);
  await page.waitForSelector("#bm-request-status", { timeout: 15000 });
  const text = norm(await page.locator("#bm-request-status").innerText());
  assert.match(text, /Abgelehnt am 06\.11\.2026/);
  assert.match(text, /Begründung: Bitte melden Sie sich in drei Monaten erneut\./);
  await page.locator("#bm-request-submit").click();
  await page.waitForSelector("#bm-request-done", { timeout: 15000 });
  assert.deepEqual(state.posts, [{ note: "" }]);
  assert.match(norm(await page.locator("#bm-request-status").innerText()), /Beantragt am/);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B15 — Genehmigung seit dem Anmelden: die Karte übernimmt die Serverwahrheit und zeigt die aktive Sammelrechnung", async () => {
  // /kundenbereich kennt noch die Einzelrechnung; der Antragsstand meldet die genehmigte Sammelrechnung.
  const { ctx, page, fehler } = await neueSeite("single", {
    capabilities: { consolidated7dAvailable: true }, readMode: "consolidated_7d",
    request: ANTRAG("approved", { decidedAt: "2026-11-05T08:00:00.000Z" }),
  });
  await zumProfil(page);
  await page.locator("#bm-request-status", { hasText: "Sammelrechnung aktiv" }).waitFor({ timeout: 15000 });
  assert.match(norm(await page.locator("#bm-request-status").innerText()), /Genehmigt am 05\.11\.2026/);
  assert.equal(await modus(page), "consolidated_7d");
  assert.equal(await page.locator("#bm-request-submit").count(), 0, "kein Antragsformular bei aktiver Sammelrechnung");
  await page.waitForSelector(".bm-period", { timeout: 15000 });
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B16 — vor der Verfügbarkeit: der Antrag ist möglich, die Karte sagt wahrheitsgemäß, dass er bis dahin in Prüfung bleibt", async () => {
  const { ctx, page, state, fehler } = await neueSeite("single", { capabilities: { consolidated7dAvailable: false } });
  await zumProfil(page);
  await page.waitForSelector("#bm-request-not-available", { timeout: 15000 });
  assert.match(norm(await page.locator("#bm-request-not-available").innerText()), /noch nicht freigeschaltet/);
  await page.locator("#bm-request-submit").click();
  await page.waitForSelector("#bm-request-done", { timeout: 15000 });
  assert.match(norm(await page.locator("#bm-request").innerText()), /Ihr Antrag bleibt bis dahin in Prüfung/);
  assert.equal(await modus(page), "single");
  assert.equal(state.patches.length, 0);
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B17 — Stand nicht lesbar: kein Antragsformular (kein Doppelantrag aus Unwissen), ruhiger Hinweis", async () => {
  const { ctx, page, state, fehler } = await neueSeite("single", { requestReadFails: true });
  await zumProfil(page);
  await page.waitForSelector("#bm-request-load-error", { timeout: 15000 });
  assert.equal(await page.locator("#bm-request-submit").count(), 0);
  assert.equal(state.posts.length, 0);
  assert.equal(await modus(page), "single");
  assert.equal(await page.locator(AUSLOESER(BM)).isEnabled(), true, "die Auswahl bleibt bedienbar");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

// ─── Lesereihenfolge (Freigabeprüfung 2026-11-15) ─────────────────────────────────────────────────────────────────

test("B18 — Lesereihenfolge: die offene Liste folgt im DOM und im Barrierefreiheitsbaum direkt auf das Feld, obenauf und unverändert platziert", async () => {
  // Als Portal am Ende von <body> lagen zwischen Feld und erster Option 27 sichtbare Elemente (gemessen 1440 px): wer
  // mit VoiceOver (iOS) oder TalkBack wischt, kam nach dem Öffnen nicht zu den Optionen, und die Liste schloss, sobald
  // das Feld aus dem Bild scrollte. Jetzt steht die Liste gleich hinter dem Feld und wird über die Popover-API in der
  // obersten Ebene gezeichnet — Lage, Fokus und Bedienung bleiben, wie sie waren.
  // 720 × 450 entspricht 200 % Zoom eines 1440 × 900-Fensters (WCAG 1.4.4/1.4.10).
  for (const viewport of [{ width: 1280, height: 1000 }, { width: 390, height: 844 }, { width: 720, height: 450 }]) {
    const { ctx, page, state, fehler } = await neueSeite("single", {}, viewport);
    await zumProfil(page);
    for (const name of [BM, DN]) {
      // Ein Vorfahr mit transform und overflow: hidden — die Lage, gegen die früher nur das Portal half.
      await page.locator(`.profile-section-body:has(.ce-auswahl[data-auswahl="${name}"])`).evaluate((el) => {
        el.style.transform = "translateX(0)"; el.style.overflow = "hidden";
      });
      await oeffneMenue(page, name);
      const lage = await page.evaluate((n) => {
        const k = document.querySelector(`.ce-auswahl[data-auswahl="${n}"] [role="combobox"]`);
        const l = document.querySelector(`[role="listbox"][data-auswahl="${n}"]`);
        const rk = k.getBoundingClientRect(), rl = l.getBoundingClientRect();
        const erste = l.querySelector('[role="option"]').getBoundingClientRect();
        const treffer = document.elementFromPoint(erste.left + erste.width / 2, erste.top + erste.height / 2);
        return {
          direktHinterDemFeld: k.nextElementSibling === l,
          obenauf: l.matches(":popover-open"),
          unterDemFeld: rl.top >= rk.bottom && rl.top - rk.bottom <= 8,
          buendig: Math.abs(rl.left - rk.left) < 1 && Math.abs(rl.width - rk.width) < 1,
          ersteOptionSichtbar: !!treffer && l.contains(treffer),
          imBild: rl.left >= 0 && rl.right <= window.innerWidth && rl.bottom <= window.innerHeight,
          fokusAmFeld: document.activeElement === k,
        };
      }, name);
      assert.deepEqual(lage, {
        direktHinterDemFeld: true, obenauf: true, unterDemFeld: true, buendig: true,
        ersteOptionSichtbar: true, imBild: true, fokusAmFeld: true,
      }, `${name} @ ${viewport.width} px`);
      // Barrierefreiheitsbaum: auf das Feld folgt unmittelbar die Liste mit ihren Optionen.
      const baum = await page.locator(`.ce-auswahl[data-auswahl="${name}"]`).ariaSnapshot();
      assert.match(baum, /^- combobox "[^\n]*\[expanded\][^\n]*\n- listbox "[^"\n]+":\n\s+- option "/,
        `${name}: die Liste folgt im Barrierefreiheitsbaum nicht direkt auf das Feld\n${baum}`);
      await schliesseMenue(page, name);
    }
    // Bedienung unverändert: Tastatur wählt (Enter öffnet, Pos1 markiert die erste Option, Enter wählt), gespeichert
    // wird genau einmal — Ausgangswert ist „none“, die letzte Option.
    await page.locator(AUSLOESER(DN)).focus();
    const vorher = state.patches.length;
    await page.keyboard.press("Enter");
    await page.keyboard.press("Home");
    await page.keyboard.press("Enter");
    await page.locator(".profile-section-body", { has: page.locator(AUSLOESER(DN)) }).locator(".profile-saved").waitFor({ timeout: 15000 });
    assert.equal(state.patches.length, vorher + 1);
    assert.deepEqual(state.patches.at(-1), { delivery_note_mode: "confidara" });
    assert.equal(await gewaehlterWert(page, DN), "confidara");
    assert.deepEqual(fehler, []);
    await ctx.close();
  }
});

test("B19 — Tastatur und Screenreader-Semantik: Leertaste, Pfeile, Pos1/Ende, gesperrte Option, Escape und Tab wählen nie beiläufig", async () => {
  // Einzelrechnungskonto: „Sammelrechnung alle 7 Tage“ ist gesperrt („Nur auf Antrag.“) — die Fälle, in denen eine
  // beiläufige Wahl Geschäftswirkung hätte (Speichern), dürfen nie eine auslösen.
  const { ctx, page, state, fehler } = await neueSeite("single");
  await zumProfil(page);
  const knopf = page.locator(AUSLOESER(BM));
  const liste = page.locator(`[role="listbox"][data-auswahl="${BM}"]`);
  const stand = () => page.evaluate(() => {
    const k = document.querySelector('.ce-auswahl[data-auswahl="billingMode"] [role="combobox"]');
    return { offen: k.getAttribute("aria-expanded"), marke: k.getAttribute("aria-activedescendant"), fokusAmFeld: document.activeElement === k };
  });

  // Tastaturfokus (wie per Tab erreicht) — sichtbarer Fokusring.
  await knopf.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  assert.equal(await knopf.evaluate((k) => document.activeElement === k && k.matches(":focus-visible")), true, "kein sichtbarer Tastaturfokus am Feld");

  // Leertaste öffnet, die Markierung steht auf der gewählten Option, der Fokus bleibt am Feld.
  await page.keyboard.press(" ");
  await liste.waitFor({ state: "visible", timeout: 5000 });
  assert.deepEqual(await stand(), { offen: "true", marke: "bm-mode-single", fokusAmFeld: true });
  // Pfeile ohne Umlauf, Pos1 und Ende.
  await page.keyboard.press("ArrowDown");
  assert.equal((await stand()).marke, "bm-mode-consolidated_7d");
  await page.keyboard.press("ArrowDown");
  assert.equal((await stand()).marke, "bm-mode-consolidated_7d", "kein Umlauf am Ende");
  await page.keyboard.press("Home");
  assert.equal((await stand()).marke, "bm-mode-single");
  await page.keyboard.press("ArrowUp");
  assert.equal((await stand()).marke, "bm-mode-single", "kein Umlauf am Anfang");
  await page.keyboard.press("End");
  assert.equal((await stand()).marke, "bm-mode-consolidated_7d");

  // Semantik, wie ein Screenreader sie liest: benanntes Feld, aufgeklappt, benannte Liste, Zustände je Option, der
  // Sperrgrund als Teil der Option.
  const baum = await page.locator(`.ce-auswahl[data-auswahl="${BM}"]`).ariaSnapshot();
  assert.match(baum, /- combobox "Rechnungsstellung Einzelrechnung je Sendung" \[expanded\]/, baum);
  assert.match(baum, /- listbox "Rechnungsstellung":/, baum);
  assert.match(baum, /- option "Einzelrechnung je Sendung[^"]*" \[selected\]/, baum);
  assert.match(baum, /- option "Sammelrechnung alle 7 Tage[^"]*Nur auf Antrag\.[^"]*" \[disabled\]/, baum);

  // Enter auf der gesperrten Option: keine Wahl, kein Speichern, die Liste bleibt offen.
  await page.keyboard.press("Enter");
  assert.equal((await stand()).offen, "true", "die Liste muss bei einer gesperrten Option offen bleiben");
  assert.equal(await gewaehlterWert(page, BM), "single");
  // Escape schließt ohne Wahl, der Fokus bleibt am Feld.
  await page.keyboard.press("Escape");
  await liste.waitFor({ state: "detached", timeout: 5000 });
  assert.deepEqual(await stand(), { offen: "false", marke: null, fokusAmFeld: true });

  // Tab bei offener Liste schließt ohne Wahl und geht zum nächsten Bedienelement NACH dem Feld (nicht ans Seitenende).
  await page.locator(AUSLOESER(DN)).focus();
  await page.keyboard.press("Enter");
  await page.locator(`[role="listbox"][data-auswahl="${DN}"]`).waitFor({ state: "visible", timeout: 5000 });
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Tab");
  await page.locator(`[role="listbox"][data-auswahl="${DN}"]`).waitFor({ state: "detached", timeout: 5000 });
  const nachTab = await page.evaluate(() => {
    const k = document.querySelector('.ce-auswahl[data-auswahl="deliveryNoteMode"] [role="combobox"]');
    const a = document.activeElement;
    return { weiter: a !== k && a !== document.body && !!(k.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_FOLLOWING) };
  });
  assert.deepEqual(nachTab, { weiter: true });
  assert.equal(await gewaehlterWert(page, DN), "none", "Tab darf nie wählen");

  // Klick daneben schließt ohne Wahl.
  await oeffneMenue(page, BM);
  await page.mouse.click(5, 5);
  await liste.waitFor({ state: "detached", timeout: 5000 });
  assert.equal(await gewaehlterWert(page, BM), "single");

  assert.equal(state.patches.length, 0, "keine dieser Bedienungen darf speichern");
  assert.deepEqual(fehler, []);
  await ctx.close();
});

test("B20 — Touch (Smartphone, 390 px): Tippen öffnet und wählt, eine gesperrte Option bleibt wirkungslos", async () => {
  const { ctx, page, state, fehler } = await neueSeite("single", {}, { width: 390, height: 844 }, { hasTouch: true, isMobile: true });
  await zumProfil(page);
  // Gesperrte Sammelrechnung antippen: nichts geschieht, kein PATCH.
  await page.locator(AUSLOESER(BM)).tap();
  await page.locator(`[role="listbox"][data-auswahl="${BM}"]`).waitFor({ state: "visible", timeout: 5000 });
  const gesperrt = await page.locator(OPTION(BM, "consolidated_7d")).boundingBox();
  await page.touchscreen.tap(gesperrt.x + gesperrt.width / 2, gesperrt.y + gesperrt.height / 2);
  assert.equal(await gewaehlterWert(page, BM), "single");
  assert.equal(state.patches.length, 0);
  // Lieferschein: Feld antippen, Option antippen — genau eine Speicherung, Liste zu.
  await page.locator(AUSLOESER(DN)).tap();
  await page.locator(`[role="listbox"][data-auswahl="${DN}"]`).waitFor({ state: "visible", timeout: 5000 });
  await page.locator(OPTION(DN, "external")).tap();
  await page.locator(`[role="listbox"][data-auswahl="${DN}"]`).waitFor({ state: "detached", timeout: 5000 });
  await page.locator(".profile-section-body", { has: page.locator(AUSLOESER(DN)) }).locator(".profile-saved").waitFor({ timeout: 15000 });
  assert.deepEqual(state.patches, [{ delivery_note_mode: "external" }]);
  // Touch-Ziele: jede Option mindestens 44 px hoch (WCAG 2.5.8 verlangt 24, die Plattform 44/48).
  await page.locator(AUSLOESER(DN)).tap();
  const hoehen = await page.locator(`[role="listbox"][data-auswahl="${DN}"] [role="option"]`).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  assert.ok(hoehen.every((h) => h >= 44), `Optionen zu niedrig für Touch: ${hoehen.join(", ")}`);
  assert.deepEqual(fehler, []);
  await ctx.close();
});
