// E2E: Ladeoverlay des Angebotsvergleichs — echter Dev-Server, gemocktes Backend.
//
// Der Vergleich liefert ALLE Angebote in einer einzigen Antwort; bei einer
// kalten Tarifquelle dauert das gemessen bis zu 46 s. Bis zu diesem Paket
// zeigte die Seite dabei nur einen Knopf-Spinner, das Formular blieb bedienbar.
// Diese Suite prüft im Browser, was ein Quelltextscan nicht erreicht:
//
//   · das Overlay erscheint sofort bei einer ECHTEN Anfrage — und nur dann,
//   · der Hintergrund ist für Maus UND Tastatur gesperrt (inert, aria-busy),
//   · genau eine Anfrage, alle Angebote erscheinen gemeinsam,
//   · danach: Overlay weg, Angebote im Bild, Fokus auf der Ergebniszeile,
//   · jeder Fehlerpfad räumt das Overlay ab, zeigt die bestehende Meldung und
//     wiederholt nichts von selbst,
//   · die vier Textstufen (Playwright-Uhr, keine echte Wartezeit),
//   · Geometrie von 320 bis 1920 px ohne waagerechten Überlauf,
//   · reduzierte Bewegung, White-Label, keine echten Anbieteranfragen.
//
// Gemocktes Backend — niemals eine echte Preisberechnung, niemals eine Buchung.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_ABSENDER, angebotsCta } from "./helpers/newShipmentForm.mjs";
import { TARIFE_41 } from "../../src/utils/offersFilterFixture.mjs";
import { COMPARISON_LOADING_PHASES } from "../../src/utils/comparisonLoadingView.mjs";

const PORT = 5443, BASE = `http://127.0.0.1:${PORT}`;
const API_HOST = "api.confidaraexpress.de";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "97421", customer_number: "CE-K-10030",
};

const TARIFE = TARIFE_41.map((t, i) => ({
  ...t,
  shipper_tariff_id: t.id,
  publicCarrierId: "ups",
  publicCarrierName: "Carrier " + (i + 1),
  publicServiceName: t.shippingMode === "express" ? "Expressversand" : "Standardversand",
  currency: "EUR",
  vatAmount: Number((t.netPrice * 0.19).toFixed(2)),
  finalPrice: Number((t.netPrice * 1.19).toFixed(2)),
  transitDaysMin: 1, transitDaysMax: 1,
  trackingAvailable: true, printerRequired: true, availableForDate: true,
}));
const ANZAHL = TARIFE.length;

const ABSENDER = { zip: "97421", city: "Schweinfurt", street: "Musterweg 1" };

// Kein Kundentext darf eines dieser Wörter tragen.
const VERBOTEN = ["jumingo", "transglobal", "service id", "serviceid", "provider", "upstream", "timeout", "einkaufspreis"];

let server, browser;

/* ── Steuerbarer /calculate-price ──────────────────────────────────────────
   `antwort` bestimmt, was zurückkommt. Mit `halten: true` bleibt die Antwort
   stehen, bis der Test `freigeben()` ruft — so lässt sich der Ladezustand in
   Ruhe vermessen. Jede Anfrage wird gezählt und ihr Body mitgeschnitten. */
function vergleich({ antwort = "erfolg", halten = false } = {}) {
  const v = { n: 0, bodies: [], antwort, halten, wartend: [] };
  v.freigeben = async () => {
    const offen = v.wartend.splice(0);
    for (const f of offen) await f();
  };
  return v;
}

async function antworte(route, art, n) {
  const json = (status, body) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  switch (art) {
    case "erfolg":
      return json(200, {
        ceShipmentId: 5200 + n, tariffs: TARIFE,
        availableShippingModes: ["express", "standard"],
        publicCarriers: [{ id: "ups", name: "UPS" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    case "422":      return json(422, { error: "Die Angaben konnten nicht verarbeitet werden." });
    case "422-feld": return json(422, { field: "recipient.postalCode", message: "Die Postleitzahl passt nicht zum Ort." });
    case "429":      return json(429, { error: "Too Many Requests" });
    case "500":      return json(500, { error: "Internal Server Error" });
    case "netz":     return route.abort("failed");
    case "unlesbar": return route.fulfill({ status: 200, contentType: "text/html", body: "<html>kein JSON</html>" });
    default: throw new Error(`unbekannte Antwort ${art}`);
  }
}

/* Alle Anfragen der Seite laufen gegen den Dev-Server oder die gemockte API —
   eine Anfrage an einen dritten Host wäre ein Leck in Richtung Anbieter. */
async function setup(page, v, { uhr = false } = {}) {
  const hosts = new Set();
  page.on("request", (r) => hosts.add(new URL(r.url()).host));
  if (uhr) await page.clock.install();
  await page.route(`**/${API_HOST}/**`, async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/legal/booking-context")) return json({ enabled: false });
    if (p.includes("/pickup-window")) return json({ pickupTimeFrom: null, pickupTimeUntil: null });
    if (p.includes("/api/jumingo/calculate-price")) {
      v.n += 1;
      const n = v.n;
      try { v.bodies.push(route.request().postDataJSON()); } catch { v.bodies.push(null); }
      const liefern = () => antworte(route, v.antwort, n).catch(() => { /* Anfrage schon abgebrochen */ });
      if (!v.halten) return liefern();
      await new Promise((fertig) => v.wartend.push(async () => { await liefern(); fertig(); }));
      return undefined;
    }
    // Sammelantwort wie in shippingFlowRestore — die Buchungsseite liest Listen daraus.
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], summary: null, pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return () => [...hosts].filter((h) => h !== `127.0.0.1:${PORT}` && h !== API_HOST);
}

async function oeffneNeueSendung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { absender: { ...STANDARD_ABSENDER, ...ABSENDER } });
}

async function fuelleRechner(page, { toZip = "63743" } = {}) {
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await page.fill("#calc-from-zip", "97421");
  await page.fill("#calc-to-zip", toZip);
  await page.fill("#calc-from-city", "Schweinfurt");
  await page.fill("#calc-to-city", "Aschaffenburg");
  await page.fill("#calc-weight", "3");
  await page.fill("#calc-packageCount", "1");
  await page.fill("#calc-length", "10");
  await page.fill("#calc-width", "10");
  await page.fill("#calc-height", "10");
}

async function oeffneRechner(page, opts) {
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await fuelleRechner(page, opts);
}

const rechnerCta = (page) => page.getByRole("button", { name: /Angebote vergleichen/i }).first();

/* Beobachter, die vor dem Klick laufen: Zeitpunkt des Klicks, erstes
   Erscheinen des Overlays und jede Änderung der Kartenzahl. */
const beobachte = (page) => page.evaluate(() => {
  const b = window.__ce = { klick: null, overlay: null, overlayJe: false, karten: [] };
  document.addEventListener("click", () => { if (b.klick === null) b.klick = performance.now(); }, true);
  new MutationObserver(() => {
    if (document.querySelector(".cmp-loading-overlay")) {
      b.overlayJe = true;
      if (b.overlay === null) b.overlay = performance.now();
    }
    const n = document.querySelectorAll(".offer-card").length;
    if (b.karten[b.karten.length - 1] !== n) b.karten.push(n);
  }).observe(document.body, { childList: true, subtree: true });
});
const beobachtet = (page) => page.evaluate(() => window.__ce);

async function overlayDa(page) {
  try {
    await page.waitForSelector(".cmp-loading-overlay", { timeout: 5000 });
  } catch (e) {
    // Sprechend statt nur „Timeout": in welchem Zustand stand die Seite?
    const lage = await page.evaluate(() => ({
      knopf: [...document.querySelectorAll(".offers-calc-cta button")].map((b) => `${b.textContent.trim()}${b.disabled ? " (gesperrt)" : ""}`)[0],
      meldung: document.querySelector(".alert-error")?.textContent?.trim() || null,
      karten: document.querySelectorAll(".offer-card").length,
    })).catch(() => null);
    throw new Error(`kein Ladeoverlay: ${JSON.stringify(lage)} — ${e.message}`);
  }
}
const overlayWeg = (page) => page.waitForSelector(".cmp-loading-overlay", { state: "detached", timeout: 15000 });

const sperre = (page) => page.evaluate(() => {
  const w = document.querySelector(".calc-page-wrap");
  return { inert: w.hasAttribute("inert"), busy: w.getAttribute("aria-busy") };
});

const statusText = (page) => page.evaluate(() =>
  document.querySelector(".cmp-loading-live").innerText.replace(/\s+/g, " ").trim());

const aktiv = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return {
    tag: a ? a.tagName.toLowerCase() : null,
    id: a?.id || "",
    ergebnis: !!a?.matches?.("[data-offers-result]"),
    cta: !!a?.closest?.(".offers-calc-cta") && a.tagName === "BUTTON" && /Angebote vergleichen|Berechne/.test(a.textContent),
    imInhalt: !!a?.closest?.(".calc-page-wrap"),
    imOverlay: !!a?.closest?.(".cmp-loading-live"),
  };
});

// Wartet, bis die (ggf. weiche) Bewegung zum Angebotsbereich steht.
async function angeboteImBild(page, anker) {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const t = Math.round(el.getBoundingClientRect().top);
    const ruhig = window.__ceTop === t;
    window.__ceTop = t;
    return ruhig && t >= -4 && t < window.innerHeight / 2;
  }, anker, { timeout: 10000, polling: 150 });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { detached: true, stdio: "ignore" });
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
  if (server) {
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das
    // seinerseits node startet.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

/* ══════════ Neue Sendung ══════════════════════════════════════════════════ */

test("N1 — gültige Anfrage: Overlay sofort, Hintergrund gesperrt, danach alle Angebote gemeinsam", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich({ halten: true });
  const fremdeHosts = await setup(page, v);
  await oeffneNeueSendung(page);
  await beobachte(page);

  await angebotsCta(page).click();
  await overlayDa(page);
  const b = await beobachtet(page);
  assert.ok(b.overlay - b.klick < 300, `Overlay erst nach ${Math.round(b.overlay - b.klick)} ms`);

  // Statusmeldung, kein Dialog; der Fokus wird nicht in die Karte gezogen.
  const live = await page.evaluate(() => {
    const r = document.querySelector(".cmp-loading-live");
    return {
      role: r.getAttribute("role"), live: r.getAttribute("aria-live"), atomic: r.getAttribute("aria-atomic"),
      unterBody: r.parentElement === document.body,
      dialog: document.querySelectorAll(".cmp-loading-live [role=dialog], .cmp-loading-live [aria-modal]").length,
      bedienbar: document.querySelectorAll(".cmp-loading-live button, .cmp-loading-live a, .cmp-loading-live [tabindex]").length,
      phase: document.querySelector(".cmp-loading-overlay").dataset.phase,
    };
  });
  assert.deepEqual(live, { role: "status", live: "polite", atomic: "true", unterBody: true, dialog: 0, bedienbar: 0, phase: "start" });
  const p1 = COMPARISON_LOADING_PHASES[0];
  assert.equal(await statusText(page), `${p1.title} ${p1.text}`);
  assert.equal((await aktiv(page)).imOverlay, false, "der Fokus wurde in die Ladekarte gezogen");

  // Hintergrund: inert + aria-busy, die Maus trifft das Overlay statt des Formulars.
  assert.deepEqual(await sperre(page), { inert: true, busy: "true" });
  const feld = await page.locator("#ns-weight").boundingBox();
  const getroffen = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest(".cmp-loading-overlay"),
    [feld.x + feld.width / 2, feld.y + feld.height / 2]);
  assert.ok(getroffen, "die Maus erreicht das Formular unter dem Overlay");
  await page.mouse.click(feld.x + feld.width / 2, feld.y + feld.height / 2);
  await page.keyboard.type("9");
  assert.notEqual((await aktiv(page)).id, "ns-weight", "das Gewichtsfeld ließ sich fokussieren");
  assert.equal(await page.inputValue("#ns-weight"), "5.5", "das Gewicht ließ sich ändern");
  assert.equal(v.n, 1);
  assert.equal(await page.locator(".offer-card").count(), 0, "Angebote vor der vollständigen Antwort");

  await v.freigeben();
  await overlayWeg(page);
  await page.waitForSelector(".offer-card", { timeout: 10000 });
  await angeboteImBild(page, "#angebotsbereich");

  assert.equal(await page.locator(".offer-card").count(), ANZAHL);
  const staende = (await beobachtet(page)).karten.filter((n) => n > 0);
  assert.deepEqual(staende, [ANZAHL], `Angebote erschienen gestaffelt: ${staende.join(" → ")}`);
  assert.deepEqual(await sperre(page), { inert: false, busy: null });
  assert.equal(await statusText(page), "", "die Live-Region bleibt nach dem Laden leer");
  assert.ok((await aktiv(page)).ergebnis, "der Fokus steht nicht auf der Ergebniszeile");
  assert.match((await page.locator(".offers-result-count").innerText()).trim(), new RegExp(`^${ANZAHL} Angebote$`));
  assert.equal(v.n, 1, "genau eine Anfrage");

  // Der Anfragevertrag ist unverändert.
  assert.deepEqual(Object.keys(v.bodies[0]).sort(), [
    "declarations", "height", "length", "packageCount", "publicCarrierIds", "recipient",
    "sender", "serviceFilter", "shippingDate", "shippingModeFilter", "weight", "width",
  ]);
  assert.deepEqual(fremdeHosts(), [], "Anfrage an einen fremden Host");
  await page.close();
});

test("N2 — Doppelklick: genau eine Anfrage, ein Overlay", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich({ halten: true });
  await setup(page, v);
  await oeffneNeueSendung(page);
  await angebotsCta(page).click({ clickCount: 2, delay: 10 });
  await overlayDa(page);
  await page.waitForTimeout(600);
  assert.equal(v.n, 1, "ein Doppelklick hat zwei Anfragen erzeugt");
  assert.equal(await page.locator(".cmp-loading-overlay").count(), 1);
  await v.freigeben();
  await overlayWeg(page);
  await page.waitForSelector(".offer-card", { timeout: 10000 });
  await page.waitForTimeout(600);
  assert.equal(v.n, 1);
  await page.close();
});

test("N2b — Tastatur: Tab erreicht den gesperrten Inhalt nie; ein selbst gesetzter Fokus bleibt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich({ halten: true });
  await setup(page, v);
  await oeffneNeueSendung(page);
  await angebotsCta(page).focus();
  await page.keyboard.press("Enter");
  await overlayDa(page);
  assert.equal((await aktiv(page)).imOverlay, false, "der Fokus wurde in die Ladekarte gezogen");
  for (let i = 0; i < 8; i += 1) {
    await page.keyboard.press("Tab");
    assert.equal((await aktiv(page)).imInhalt, false, "Tab erreichte den gesperrten Seiteninhalt");
  }
  // Der Nutzer steht jetzt bewusst in der App-Leiste. Nach dem Laden wird ihm
  // der Fokus NICHT weggenommen — nur ein verlorener Fokus wird zurückgegeben.
  const vorher = await page.evaluate(() => { window.__ceFokus = document.activeElement; return document.activeElement !== document.body; });
  assert.ok(vorher, "Tab hat nichts erreicht — der Test prüft so nichts");
  await v.freigeben();
  await overlayWeg(page);
  await page.waitForSelector(".offer-card", { timeout: 10000 });
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => document.activeElement === window.__ceFokus), "der selbst gesetzte Fokus wurde überschrieben");
  assert.equal(v.n, 1);
  await page.close();
});

test("N3 — ungültige Eingaben: kein Overlay, keine Anfrage", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich();
  await setup(page, v);
  await oeffneNeueSendung(page);
  await beobachte(page);
  await page.fill("#ns-weight", "");
  // Der gesperrte Knopf wird trotzdem geklickt — kommt je ein Klick durch, darf
  // er weder rechnen noch sperren.
  await angebotsCta(page).click({ force: true });
  await page.waitForTimeout(800);
  assert.equal((await beobachtet(page)).overlayJe, false, "Overlay ohne Anfrage");
  assert.equal(v.n, 0);
  assert.deepEqual(await sperre(page), { inert: false, busy: null });
  await page.close();
});

test("N4 — unveränderte Eingaben: kein Overlay, keine Anfrage, die Angebote rücken ins Bild", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich();
  await setup(page, v);
  await oeffneNeueSendung(page);
  await angebotsCta(page).click();
  await page.waitForSelector(".offer-card", { timeout: 10000 });
  await angeboteImBild(page, "#angebotsbereich");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await beobachte(page);

  await angebotsCta(page).click();
  await angeboteImBild(page, "#angebotsbereich");
  await page.waitForTimeout(400);
  assert.equal((await beobachtet(page)).overlayJe, false, "Overlay ohne Anfrage");
  assert.equal(v.n, 1, "der wiederholte Klick hat erneut gerechnet");
  assert.equal(await page.locator(".offer-card").count(), ANZAHL);
  await page.close();
});

/* ══════════ Preisrechner ══════════════════════════════════════════════════ */

test("R1 — Preisrechner: gültige Anfrage sperrt, alle Angebote gemeinsam, Fokus auf dem Ergebnis", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich({ halten: true });
  const fremdeHosts = await setup(page, v);
  await oeffneRechner(page);
  await beobachte(page);

  await rechnerCta(page).click({ clickCount: 2, delay: 10 });
  await overlayDa(page);
  assert.deepEqual(await sperre(page), { inert: true, busy: "true" });
  assert.equal((await aktiv(page)).imOverlay, false);
  const zip = await page.locator("#calc-to-zip").boundingBox();
  await page.mouse.click(zip.x + 10, zip.y + zip.height / 2);
  await page.keyboard.type("1");
  assert.equal(await page.inputValue("#calc-to-zip"), "63743", "die PLZ ließ sich während des Vergleichs ändern");
  await page.waitForTimeout(400);
  assert.equal(v.n, 1, "Doppelklick im Rechner hat zwei Anfragen erzeugt");

  await v.freigeben();
  await overlayWeg(page);
  await page.waitForSelector(".offer-card", { timeout: 10000 });
  await angeboteImBild(page, ".offers-section");
  assert.deepEqual((await beobachtet(page)).karten.filter((n) => n > 0), [ANZAHL]);
  assert.deepEqual(await sperre(page), { inert: false, busy: null });
  assert.ok((await aktiv(page)).ergebnis, "der Fokus steht nicht auf der Ergebniszeile");
  assert.equal(v.n, 1);
  // Der Rechner stellt weiterhin den Minimal-Quote: keine Sendungsangaben.
  assert.ok(!("declarations" in v.bodies[0]), "der Rechner sendet plötzlich Sendungsangaben");
  assert.deepEqual(fremdeHosts(), []);
  await page.close();
});

test("R2 — Preisrechner: Feldfehler vor dem Senden: kein Overlay, keine Anfrage", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich();
  await setup(page, v);
  await oeffneRechner(page, { toZip: "4444" });
  await beobachte(page);
  await rechnerCta(page).click();
  await page.waitForSelector(".alert-error", { timeout: 5000 });
  await page.waitForTimeout(500);
  assert.equal((await beobachtet(page)).overlayJe, false, "Overlay trotz Feldfehler");
  assert.equal(v.n, 0);
  assert.deepEqual(await sperre(page), { inert: false, busy: null });
  await page.close();
});

test("R3 — Preisrechner: unveränderte Eingaben: kein Overlay, keine Anfrage", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich();
  await setup(page, v);
  await oeffneRechner(page);
  await rechnerCta(page).click();
  await page.waitForSelector(".offer-card", { timeout: 10000 });
  await beobachte(page);
  await rechnerCta(page).click();
  await page.waitForTimeout(1000);
  assert.equal((await beobachtet(page)).overlayJe, false, "Overlay ohne Anfrage");
  assert.equal(v.n, 1);
  await page.close();
});

/* ══════════ Textstufen ════════════════════════════════════════════════════ */

test("P1 — vier Textstufen nach 8/20/45 s; ein neuer Vergleich beginnt wieder bei Stufe 1", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich({ halten: true });
  await setup(page, v, { uhr: true });
  await oeffneNeueSendung(page);
  await angebotsCta(page).click();
  await overlayDa(page);

  // Ab hier steht die Seitenuhr und läuft nur noch per runFor: sonst holte die
  // natürlich weiterlaufende Uhr eine zu spät gesetzte Schwelle beim Warten nach.
  // Zwischen Montage des Overlays und Anhalten vergehen δ < 500 ms echte Zeit —
  // deshalb wird 500 ms vor und nach jeder Schwelle geprüft.
  await page.clock.pauseAt(await page.evaluate(() => Date.now()));
  const stufe = () => page.evaluate(() => document.querySelector(".cmp-loading-overlay")?.dataset.phase ?? null);
  const erwarte = async (id) => {
    for (let i = 0; i < 40 && (await stufe()) !== id; i += 1) await new Promise((r) => setTimeout(r, 50));
    assert.equal(await stufe(), id);
  };
  const bleibt = async (id) => {
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(await stufe(), id, `Stufe „${id}" endete zu früh`);
  };
  const texte = [];
  await erwarte("start");
  texte.push(await statusText(page));
  let uhr = 0;
  for (const [schwelle, vorher, id] of [[8000, "start", "weiter"], [20000, "weiter", "laenger"], [45000, "laenger", "lang"]]) {
    await page.clock.runFor(schwelle - 500 - uhr);
    await bleibt(vorher);
    await page.clock.runFor(1000);
    uhr = schwelle + 500;
    await erwarte(id);
    texte.push(await statusText(page));
  }
  await page.clock.resume();
  assert.deepEqual(texte, COMPARISON_LOADING_PHASES.map((p) => `${p.title} ${p.text}`));
  for (const t of texte) {
    for (const wort of VERBOTEN) assert.ok(!t.toLowerCase().includes(wort), `„${wort}“ im Kundentext`);
    assert.doesNotMatch(t, /[0-9%]/, "erfundener Fortschritt");
  }
  assert.equal(v.n, 1, "die Wartezeit löste eine weitere Anfrage aus");

  await v.freigeben();
  await overlayWeg(page);
  await page.waitForSelector(".offer-card", { timeout: 10000 });

  // Neuer echter Vergleich (geänderte Sendung) → die Zeit beginnt bei 0.
  await page.fill("#ns-weight", "7");
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 0, null, { timeout: 10000 });
  await angebotsCta(page).click();
  await overlayDa(page);
  await erwarte("start");
  assert.equal(await statusText(page), texte[0], "der neue Vergleich begann nicht bei Stufe 1");
  assert.equal(v.n, 2);
  await v.freigeben();
  await overlayWeg(page);
  await page.close();
});

/* ══════════ Fehlerpfade ═══════════════════════════════════════════════════ */

for (const art of ["422", "422-feld", "429", "500", "netz", "unlesbar"]) {
  test(`F-${art} — Neue Sendung: Overlay weg, bestehende Meldung sichtbar, keine Wiederholung`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const v = vergleich({ antwort: art });
    await setup(page, v);
    await oeffneNeueSendung(page);
    await beobachte(page);
    await angebotsCta(page).click();
    await page.waitForSelector('.alert-error[role="alert"]', { timeout: 10000 });
    await overlayWeg(page);
    assert.ok((await beobachtet(page)).overlayJe, "das Overlay erschien gar nicht");
    const meldung = (await page.locator('.alert-error[role="alert"]').first().innerText()).trim();
    assert.ok(meldung.length > 0, "leere Fehlermeldung");
    assert.doesNotMatch(meldung, /Failed to fetch|Unexpected token|SyntaxError/, `Technikertext: ${meldung}`);
    assert.deepEqual(await sperre(page), { inert: false, busy: null });
    const fokus = await aktiv(page);
    if (art === "422-feld") assert.equal(fokus.id, "ns-r-zip", "das beanstandete Feld hat keinen Fokus");
    else assert.ok(fokus.cta, `der Fokus ging nicht an „Angebote vergleichen" zurück (${fokus.tag}#${fokus.id})`);
    await page.waitForTimeout(1500);
    assert.equal(v.n, 1, "nach dem Fehler wurde automatisch wiederholt");
    assert.equal(await page.locator(".offer-card").count(), 0);
    await page.close();
  });
}

for (const art of ["422-feld", "500", "netz"]) {
  test(`F-Rechner-${art} — Preisrechner: Overlay weg, bestehende Meldung, keine Wiederholung`, async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const v = vergleich({ antwort: art });
    await setup(page, v);
    await oeffneRechner(page);
    await beobachte(page);
    await rechnerCta(page).click();
    await page.waitForSelector('.alert-error[role="alert"]', { timeout: 10000 });
    await overlayWeg(page);
    assert.ok((await beobachtet(page)).overlayJe, "das Overlay erschien gar nicht");
    assert.deepEqual(await sperre(page), { inert: false, busy: null });
    const fokus = await aktiv(page);
    if (art === "422-feld") assert.equal(fokus.id, "calc-to-zip", "das beanstandete Feld hat keinen Fokus");
    else assert.ok(fokus.cta, "der Fokus ging nicht an „Angebote vergleichen\" zurück");
    await page.waitForTimeout(1500);
    assert.equal(v.n, 1, "nach dem Fehler wurde automatisch wiederholt");
    await page.close();
  });
}

test("F-mobil — 390 px: nach einem Fehler stehen Knopf und Meldung im Bild", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const v = vergleich({ antwort: "500" });
  await setup(page, v);
  await oeffneNeueSendung(page);
  // Der CTA steht am unteren Rand — genau dort lag die Meldung sonst darunter.
  await page.evaluate(() => {
    const b = document.querySelector(".offers-calc-cta button");
    window.scrollTo({ top: b.getBoundingClientRect().bottom + window.scrollY - window.innerHeight + 4, behavior: "instant" });
  });
  await angebotsCta(page).focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector('.alert-error[role="alert"]', { timeout: 10000 });
  await overlayWeg(page);
  await page.waitForFunction(() => {
    const y = Math.round(window.scrollY); const ruhig = window.__ceYf === y; window.__ceYf = y; return ruhig;
  }, null, { timeout: 5000, polling: 150 });
  const lage = await page.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return b.top >= 0 && b.bottom <= window.innerHeight; };
    return { meldung: r(document.querySelector('.alert-error[role="alert"]')), knopf: r(document.querySelector(".offers-calc-cta button")) };
  });
  assert.deepEqual(lage, { meldung: true, knopf: true });
  assert.ok((await aktiv(page)).cta);
  await page.close();
});

test("F-75s — die 75-s-Frist des Browsers beendet das Overlay mit der bestehenden Meldung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich({ halten: true });
  await setup(page, v, { uhr: true });
  await oeffneNeueSendung(page);
  await angebotsCta(page).click();
  await overlayDa(page);
  await page.clock.fastForward(75000);
  await page.waitForSelector('.alert-error[role="alert"]', { timeout: 10000 });
  await overlayWeg(page);
  assert.deepEqual(await sperre(page), { inert: false, busy: null });
  assert.ok((await aktiv(page)).cta);
  await page.clock.fastForward(5000);
  await page.waitForTimeout(800);
  assert.equal(v.n, 1, "nach der Frist wurde automatisch wiederholt");
  await v.freigeben();   // die gehaltene Antwort trifft eine abgebrochene Anfrage
  await page.close();
});

test("F-Zurück — Browser-Zurück während des Vergleichs: nicht blockiert, Overlay und Anfrage enden", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich({ halten: true });
  await setup(page, v);
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  // Clientseitiger Wechsel in „Neue Sendung" — ein echter Verlaufseintrag der App.
  await page.evaluate(() => {
    window.history.pushState({}, "", "/dashboard?page=new");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { absender: { ...STANDARD_ABSENDER, ...ABSENDER } });
  const abgebrochen = page.waitForEvent("requestfailed", { predicate: (r) => r.url().includes("calculate-price"), timeout: 10000 });
  await angebotsCta(page).click();
  await overlayDa(page);

  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 10000 });
  await overlayWeg(page);
  await abgebrochen;
  assert.equal(await page.locator('.alert-error[role="alert"]').count(), 0, "ein Abbruch ist kein Fehler");
  assert.deepEqual(await sperre(page), { inert: false, busy: null });
  assert.equal(await page.locator(".cmp-loading-live").count(), 1, "genau eine Live-Region");
  await v.freigeben();
  await page.waitForTimeout(500);
  assert.equal(v.n, 1);
  await page.close();
});

/* ══════════ Darstellung ═══════════════════════════════════════════════════ */

test("D1 — Geometrie von 320 bis 1920 px, auch quer: zentriert, kein waagerechter Überlauf", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const v = vergleich({ halten: true });
  await setup(page, v);
  await oeffneNeueSendung(page);
  await angebotsCta(page).click();
  await overlayDa(page);

  const befunde = [];
  for (const [w, h] of [
    [320, 640], [390, 844], [430, 932], [768, 1024], [1024, 768],
    [1366, 768], [1440, 900], [1920, 1080], [844, 390], [640, 320],
  ]) {
    await page.setViewportSize({ width: w, height: h });
    await page.waitForTimeout(120);
    const g = await page.evaluate(() => {
      const o = document.querySelector(".cmp-loading-overlay");
      const k = document.querySelector(".cmp-loading-card").getBoundingClientRect();
      const t = document.querySelector(".cmp-loading-title");
      return {
        vw: o.clientWidth, vh: o.clientHeight,
        l: k.left, r: k.right, t: k.top, b: k.bottom, w: k.width, h: k.height,
        seiteUeber: document.documentElement.scrollWidth - window.innerWidth,
        overlayUeber: o.scrollWidth - o.clientWidth,
        overlayScrollt: o.scrollHeight > o.clientHeight,
        titel: parseFloat(getComputedStyle(t).fontSize),
        mitte: (k.left + k.right) / 2 - o.clientWidth / 2,
      };
    });
    const soll = Math.min(420, g.vw - 32);
    const fehler = [];
    if (Math.abs(g.w - soll) > 1.5) fehler.push(`Breite ${g.w} statt ${soll}`);
    if (g.l < 15 || g.r > g.vw - 15) fehler.push(`Karte ragt an den Rand (${g.l}–${g.r})`);
    if (Math.abs(g.mitte) > 1.5) fehler.push(`nicht mittig (${g.mitte})`);
    if (g.seiteUeber > 0 || g.overlayUeber > 0) fehler.push(`waagerechter Überlauf ${g.seiteUeber}/${g.overlayUeber}`);
    if (g.h + 32 <= g.vh) {
      if (Math.abs((g.t + g.b) / 2 - g.vh / 2) > 1.5) fehler.push(`nicht senkrecht mittig (${g.t}–${g.b})`);
    } else if (!(g.t >= 0 && g.overlayScrollt)) {
      fehler.push(`zu hoch und nicht erreichbar (${g.t}–${g.b} bei ${g.vh})`);
    }
    if (g.titel !== (g.vw <= 480 ? 18 : 20)) fehler.push(`Titel ${g.titel}px`);
    if (fehler.length) befunde.push(`${w}×${h}: ${fehler.join("; ")}`);
  }
  assert.deepEqual(befunde, []);
  await v.freigeben();
  await page.close();
});

for (const sprung of ["weich", "sofort"]) test(`D3 — Rückkehr aus der Buchung (${sprung}): die gemerkte Position sitzt trotz content-visibility genau`, async () => {
  // Tablet-Breite. Chromium stellt die Position weich wieder her (html hat
  // scroll-behavior: smooth) — dabei läuft jede Karte einmal durchs Bild. Wo
  // ein Browser SOFORT springt (weiches Scrollen abgeschaltet), stünden die
  // Karten über dem Ziel ohne Voll-Layout mit Platzhalterhöhe da. „sofort"
  // stellt genau diese Umgebung her.
  const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
  const v = vergleich();
  await setup(page, v);
  await oeffneNeueSendung(page);
  if (sprung === "sofort") await page.addStyleTag({ content: "html { scroll-behavior: auto !important; }" });
  await angebotsCta(page).click();
  await page.waitForSelector(".offer-card", { timeout: 10000 });
  await angeboteImBild(page, "#angebotsbereich");

  // Wie ein Mensch mit dem Mausrad bis Karte 30: jede Karte läuft dabei einmal
  // durchs Bild, content-visibility rendert sie und merkt sich ihre echte Höhe.
  for (let i = 0; i < 120; i += 1) {
    const top = await page.evaluate(() => document.querySelectorAll(".offer-card")[30].getBoundingClientRect().top);
    if (top < 120) break;
    await page.mouse.move(700, 400);
    await page.mouse.wheel(0, Math.min(300, top - 60));
    await page.waitForTimeout(80);
  }
  await page.waitForFunction(() => {
    const y = Math.round(window.scrollY);
    const ruhig = window.__ceY0 === y;
    window.__ceY0 = y;
    return ruhig;
  }, null, { timeout: 5000, polling: 150 });
  // Beim Klick auf „Auswählen" wird die Lage festgehalten.
  await page.evaluate(() => {
    document.addEventListener("click", () => {
      window.__ceVorKlick = { y: Math.round(window.scrollY), top: Math.round(document.querySelectorAll(".offer-card")[30].getBoundingClientRect().top) };
    }, { capture: true, once: true });
  });
  await page.locator(".offer-card").nth(30).locator("button", { hasText: /Auswählen|Weiter|Buchen|wählen/i }).first().click();
  await page.waitForURL(/\/booking/, { timeout: 10000 });
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForURL(/\/dashboard/, { timeout: 10000 });
  await page.waitForSelector(".offer-card", { timeout: 10000 });
  await page.waitForFunction(() => {
    const a = document.getElementById("angebotsbereich");
    if (!a || a.classList.contains("offers-cv-voll")) return false;
    const y = Math.round(window.scrollY);
    const ruhig = window.__ceY === y;
    window.__ceY = y;
    return ruhig && y > 0;
  }, null, { timeout: 10000, polling: 150 });

  const lage = await page.evaluate(() => ({
    vorher: window.__ceVorKlick,
    y: Math.round(window.scrollY),
    top: Math.round(document.querySelectorAll(".offer-card")[30].getBoundingClientRect().top),
    cv: getComputedStyle(document.querySelectorAll(".offer-card")[6]).contentVisibility,
  }));
  assert.ok(lage.vorher, "die Lage beim Klick wurde nicht erfasst");
  assert.equal(lage.y, lage.vorher.y, "die gemerkte Scrollposition wurde nicht wiederhergestellt");
  assert.ok(Math.abs(lage.top - lage.vorher.top) <= 2,
    `Karte 30 steht ${lage.top - lage.vorher.top} px neben ihrer gemerkten Lage`);
  assert.equal(lage.cv, "auto", "nach dem Sprung gilt wieder content-visibility");
  assert.equal(v.n, 1, "die Rückkehr hat neu gerechnet");
  await page.close();
});

test("D2 — reduzierte Bewegung: der Bogen steht; sonst dreht er ruhig, das Signet nie", async () => {
  for (const reducedMotion of ["reduce", "no-preference"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion });
    const v = vergleich({ halten: true });
    await setup(page, v);
    await oeffneNeueSendung(page);
    await angebotsCta(page).click();
    await overlayDa(page);
    const a = await page.evaluate(() => {
      const s = (sel) => getComputedStyle(document.querySelector(sel));
      const ring = s(".cmp-loading-ring");
      return {
        ring: ring.animationName, dauer: ring.animationDuration, takt: ring.animationTimingFunction,
        wdh: ring.animationIterationCount, overlay: s(".cmp-loading-overlay").animationName,
        signet: s(".cmp-loading-signet").animationName, bild: s(".cmp-loading-signet img").animationName,
        blur: s(".cmp-loading-overlay").backdropFilter,
      };
    });
    if (reducedMotion === "reduce") {
      assert.equal(a.ring, "none", "der Bogen dreht trotz reduzierter Bewegung");
      assert.equal(a.overlay, "none", "Einblendung trotz reduzierter Bewegung");
    } else {
      assert.deepEqual([a.ring, a.dauer, a.takt, a.wdh], ["spin", "2.4s", "linear", "infinite"]);
    }
    assert.equal(a.signet, "none");
    assert.equal(a.bild, "none");
    assert.equal(a.blur, "none");
    await v.freigeben();
    await page.close();
  }
});
