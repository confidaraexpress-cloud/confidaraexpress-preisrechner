// E2E: frühe Zustellzeit auf der Karte + optionale Uhrzeit im Lieferzeitfilter.
//
// Gemockt, gegen einen echten Dev-Server. Niemals eine echte Berechnung, niemals
// eine Bestellung, niemals ein echter Providerkontakt.
//
// Die beiden tragenden Messungen sind Szenario 5 und 6: dass eine Uhrzeitauswahl
// die Liste reduziert, OHNE dass ein weiterer /calculate-price-Request rausgeht,
// und dass Zurücksetzen die volle Liste zurückbringt — ebenfalls ohne Request.
// Ein Zähler misst das; es wird nicht behauptet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_ABSENDER } from "./helpers/newShipmentForm.mjs";
import { TARIFE_41 } from "../../src/utils/offersFilterFixture.mjs";

const PORT = 5345, BASE = `http://127.0.0.1:${PORT}`;

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

const ABSENDER = { zip: "97421", city: "Schweinfurt", street: "Musterweg 1" };
let server, browser;

function setupRoutes(page, zaehler) {
  return (async () => {
    await page.route("**/api.confidaraexpress.de/**", async (route) => {
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
      if (p.includes("/api/jumingo/calculate-price")) {
        zaehler.n += 1;
        return json({
          shipmentId: "s_e2e", ceShipmentId: 4711, tariffs: TARIFE,
          availableShippingModes: ["express", "standard"],
          publicCarriers: [{ id: "ups", name: "UPS" }],
          customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
        });
      }
      return json({});
    });
    await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  })();
}

async function zeigeAngebote(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { absender: { ...STANDARD_ABSENDER, ...ABSENDER } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

// Öffnet die Uhrzeitliste und liefert Geometrie von Auslöser und Liste.
async function oeffneZeitliste(page) {
  // Die Wirtsfläche animiert beim Aufklappen 160 ms (`translateY(-6px) → none`).
  // Erst danach steht der Auslöser still — sonst klickt der Test in eine noch
  // wandernde Liste. Reine Testsynchronisation; das Bauteil misst im nächsten
  // Frame ohnehin nach.
  await page.evaluate(() => Promise.all(
    (document.querySelector(".offers-delivery-dropdown")?.getAnimations() || [])
      .map((a) => a.finished.catch(() => {}))));
  await page.locator(".offers-time-trigger").click();
  await page.waitForSelector(".offers-time-list", { timeout: 10000 });
  return page.evaluate(() => {
    const t = document.querySelector(".offers-time-trigger").getBoundingClientRect();
    const l = document.querySelector(".offers-time-list").getBoundingClientRect();
    const stil = getComputedStyle(document.querySelector(".offers-time-list"));
    return {
      triggerUnten: t.bottom, triggerLinks: t.left, triggerBreite: t.width,
      listeOben: l.top, listeLinks: l.left, listeBreite: l.width,
      listeUnten: l.bottom, ebene: Number(stil.zIndex), overflowY: stil.overflowY,
      position: stil.position,
      imBody: document.querySelector(".offers-time-list").parentElement === document.body,
      scrollbar: document.querySelector(".offers-time-list").scrollHeight
               > document.querySelector(".offers-time-list").clientHeight + 1,
      fensterHoehe: window.innerHeight,
    };
  });
}

const waehleZeit = async (page, text) => {
  await page.locator(".offers-time-option", { hasText: text }).first().click();
  await page.waitForSelector(".offers-time-list", { state: "detached", timeout: 10000 });
};

// Der Uhrzeit-Auslöser lebt IM Lieferzeit-Dropdown — nach einer Auswahl schließt
// dieses, und der Auslöser ist aus dem DOM. Wer ihn danach lesen will, muss die
// Fläche erst wieder öffnen; ein zweiter Klick auf den Chip würde eine bereits
// offene Fläche dagegen zuklappen.
async function sicherOffen(page) {
  if (await page.locator(".offers-delivery-dropdown").count() === 0) {
    await oeffneLieferzeit(page);
  }
}
const auslöserText = async (page) => {
  await sicherOffen(page);
  return (await page.locator(".offers-time-trigger").textContent()).trim();
};

const oeffneLieferzeit = (page) =>
  page.locator(".offers-filter-chip", { hasText: "Lieferung" }).click()
    .then(() => page.waitForSelector(".offers-delivery-dropdown", { timeout: 10000 }));

const anzahlKarten = (page) => page.locator(".offer-card").count();

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
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

/* ── Szenario C/D: Darstellung der Karte ─────────────────────────────────── */

test("1 — 41 Tarife: jede Karte nennt ihre Uhrzeit GENAU EINMAL", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);
  assert.equal(await anzahlKarten(page), 41);

  // 22 frühe Tarife tragen das grüne Feld, 19 die neutrale graue Zeile —
  // zusammen 41, und keine Karte beides.
  const feld = await page.locator(".offer-early-note").count();
  const grau = await page.locator(".offer-tl-node--end .offer-tl-sub").count();
  assert.equal(feld, 22, "grüne Hinweisfelder");
  assert.equal(grau, 19, "neutrale graue Zeilen");
  assert.equal(feld + grau, 41, "eine Karte verliert oder verdoppelt ihre Uhrzeit");

  const doppelt = await page.evaluate(() => [...document.querySelectorAll(".offer-card")]
    .filter((k) => k.querySelector(".offer-early-note")
                && k.querySelector(".offer-tl-node--end .offer-tl-sub")).length);
  assert.equal(doppelt, 0, "Karte zeigt die Uhrzeit doppelt");
  assert.equal(await page.locator(".offer-tl-time-early").count(), 0);
  await page.close();
});

test("2 — frühe Karte (10:30): Datum + grünes Feld, KEINE graue Doppelzeile", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);

  const note = page.locator(".offer-early-note", { hasText: "Lieferung bis 10:30 Uhr" }).first();
  assert.ok(await note.count() > 0, "kein Hinweisfeld für 10:30 gefunden");
  assert.ok(await note.isVisible());

  const karte = note.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' offer-card ')]");
  // Die Hauptzeile trägt NUR das Datum …
  const primary = (await karte.locator(".offer-tl-node--end .offer-tl-primary").textContent()).trim();
  assert.ok(!/bis |:\d\d/.test(primary), `die Datumszeile enthält eine Uhrzeit: „${primary}“`);
  // … und die graue Unterzeile entfällt vollständig.
  assert.equal(await karte.locator(".offer-tl-node--end .offer-tl-sub").count(), 0,
    "die graue Uhrzeit erscheint zusätzlich zum grünen Feld");

  // Der Zeitwert steht auf der Karte (ohne Detailpanel) genau einmal.
  const treffer = await karte.evaluate((k) => {
    const zone = k.querySelector(".offer-card-inner");
    return (zone.textContent.match(/10:30/g) || []).length;
  });
  assert.equal(treffer, 1, "„10:30“ steht mehrfach in der Hauptansicht");

  const stil = await note.evaluate((el) => {
    const s = getComputedStyle(el);
    return { farbe: s.color, flaeche: s.backgroundColor, radius: s.borderTopLeftRadius,
             groesse: s.fontSize, schatten: s.boxShadow };
  });
  assert.equal(stil.farbe, "rgb(47, 107, 82)");
  assert.equal(stil.flaeche, "rgb(238, 244, 241)");
  assert.equal(stil.radius, "8px");
  assert.equal(stil.groesse, "12px");
  assert.equal(stil.schatten, "none");
  await page.close();
});

test("3 — Tagesendkarte (17:00): Uhrzeit sichtbar, KEIN grünes Feld", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);

  const sub = page.locator(".offer-tl-node--end .offer-tl-sub", { hasText: "bis 17:00 Uhr" }).first();
  assert.ok(await sub.count() > 0, "der Tagesendwert wurde entfernt statt nur zurückgenommen");
  assert.ok(await sub.isVisible());
  const karte = sub.locator("xpath=ancestor::div[contains(concat(' ', normalize-space(@class), ' '), ' offer-card ')]");
  assert.equal(await karte.locator(".offer-early-note").count(), 0);
  await page.close();
});

/* ── Szenario A/B: Filter ────────────────────────────────────────────────── */

test("4 — Lieferdatum 31.08. filtert wie bisher auf 21 Karten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);
  assert.equal(zaehler.n, 1);

  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 21, null, { timeout: 10000 });

  assert.equal(await anzahlKarten(page), 21);
  assert.match(await page.locator(".offers-result-count").textContent(), /^21 Angebote$/);
  assert.equal(zaehler.n, 1, "der Datumsfilter darf keine Neuberechnung auslösen");

  // Das Uhrzeitfeld ist jetzt bedienbar — ein Feld, keine Pillenreihe.
  const feld = page.locator(".offers-time-trigger");
  assert.equal(await feld.count(), 1);
  assert.equal(await feld.isDisabled(), false);
  assert.equal(await page.locator(".offers-time-hint").count(), 0);
  assert.equal((await feld.textContent()).trim(), "Beliebig");
  await page.close();
});

test("5 — Uhrzeit 10:30 reduziert die Liste weiter, ohne neuen Preisrequest", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);

  await oeffneLieferzeit(page);
  // Ohne Datum ist der Auslöser deaktiviert und erklärt sich.
  assert.equal(await page.locator(".offers-time-trigger").isDisabled(), true);
  assert.match(await page.locator(".offers-time-hint").textContent(), /Erst ein Datum wählen/);

  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(
    () => document.querySelector(".offers-time-trigger") && !document.querySelector(".offers-time-trigger").disabled,
    null, { timeout: 10000 });

  const geo = await oeffneZeitliste(page);
  // Die Optionen kommen aus den geladenen Tarifen, nicht aus einer festen Liste.
  const optionen = await page.locator(".offers-time-option").allTextContents();
  assert.deepEqual(optionen.map((s) => s.trim()),
    ["Beliebig", "08:00 Uhr", "09:00 Uhr", "10:00 Uhr", "10:30 Uhr",
     "12:00 Uhr", "13:00 Uhr", "17:00 Uhr", "18:00 Uhr"]);

  // D3: die Liste öffnet UNTERHALB des Auslösers.
  assert.ok(geo.listeOben >= geo.triggerUnten - 1,
    `Liste öffnet nach oben: listeOben=${geo.listeOben} triggerUnten=${geo.triggerUnten}`);
  // D4: eigenes DOM im Portal, über den Wirtsflächen, nicht geclippt.
  assert.equal(geo.imBody, true, "die Liste muss im Portal an document.body hängen");
  assert.equal(geo.position, "fixed");
  assert.ok(geo.ebene > 50, `Ebene zu niedrig: ${geo.ebene}`);
  assert.ok(Math.abs(geo.listeLinks - geo.triggerLinks) <= 1, "die Liste ist nicht am Auslöser ausgerichtet");
  assert.ok(Math.abs(geo.listeBreite - geo.triggerBreite) <= 1, "die Liste hat nicht die Auslöserbreite");

  const vorher = await anzahlKarten(page);
  await waehleZeit(page, "10:30 Uhr");
  await page.waitForSelector(".offers-delivery-dropdown", { state: "detached", timeout: 10000 });

  const nachher = await anzahlKarten(page);
  assert.ok(nachher < vorher, `Uhrzeit hat nicht gefiltert (${vorher} → ${nachher})`);
  assert.equal(zaehler.n, 1, "die Uhrzeitauswahl darf KEINEN /calculate-price-Request auslösen");

  const chip = page.locator(".offers-filter-chip", { hasText: "Lieferung" });
  assert.match((await chip.textContent()).trim(), /^Lieferung bis 31\.08\.2026, 10:30$/);
  const feldwert = await page.locator(".service-filter-trigger-val").last().textContent();
  assert.match(feldwert.trim(), /·\s*10:30$/, `Formularfeld zeigt „${feldwert}“`);
  await page.close();
});

test("6 — Zurücksetzen bringt alle 41 Karten zurück, ohne neuen Preisrequest", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);

  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(
    () => document.querySelector(".offers-time-trigger") && !document.querySelector(".offers-time-trigger").disabled,
    null, { timeout: 10000 });
  await oeffneZeitliste(page);
  await waehleZeit(page, "10:30 Uhr");
  await page.waitForSelector(".offers-delivery-dropdown", { state: "detached", timeout: 10000 });
  assert.ok(await anzahlKarten(page) < 41);

  await page.locator(".offers-filter-reset-btn").click();
  await page.waitForFunction(() => document.querySelectorAll(".offer-card").length === 41, null, { timeout: 10000 });

  assert.equal(await anzahlKarten(page), 41);
  assert.equal((await page.locator(".offers-filter-chip", { hasText: "Lieferung" }).textContent()).trim(), "Lieferung");
  // Auch die Uhrzeit ist weg — das Formularfeld steht wieder auf „Beliebig“.
  const feldwert = await page.locator(".service-filter-trigger-val").last().textContent();
  assert.equal(feldwert.trim(), "Beliebig");
  assert.equal(zaehler.n, 1, "Zurücksetzen darf KEINEN /calculate-price-Request auslösen");
  await page.close();
});

/* ── Szenario 7–8: Layout ────────────────────────────────────────────────── */

test("7 — auf breitem Desktop ist die Angebotssektion schmaler und zentriert", async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);

  const mass = await page.evaluate(() => {
    const sek = document.querySelector(".offers-section");
    const karte = document.querySelector(".offer-card");
    const haupt = document.querySelector(".main-content") || document.body;
    const s = sek.getBoundingClientRect(), h = haupt.getBoundingClientRect();
    return {
      sektion: Math.round(s.width), karte: Math.round(karte.getBoundingClientRect().width),
      linksAussen: Math.round(s.left - h.left), rechtsAussen: Math.round(h.right - s.right),
      radius: getComputedStyle(karte).borderTopLeftRadius,
      schatten: getComputedStyle(karte).boxShadow,
    };
  });
  assert.equal(mass.sektion, 1080, "die Sektionsbreite hat sich verschoben");
  assert.equal(mass.karte, 1022, "gemessene Kartenbreite (vorher 1126)");
  // Zentriert: gleich viel Luft links wie rechts (Rundung erlaubt 1px).
  assert.ok(Math.abs(mass.linksAussen - mass.rechtsAussen) <= 1,
    `nicht zentriert: ${mass.linksAussen} vs ${mass.rechtsAussen}`);
  assert.ok(mass.linksAussen > 40, "es entsteht sichtbarer Weißraum");
  assert.equal(mass.radius, "12px", "etwas rechteckiger");
  assert.notEqual(mass.schatten, "none", "die Karte trägt einen Ruheschatten");

  // Das neue Hinweisfeld darf das Layout NICHT verziehen: eine Karte mit Feld
  // und eine ohne müssen dieselbe Timeline-Geometrie und dieselbe Preisspalte
  // haben. Gemessen, nicht angenommen.
  const versatz = await page.evaluate(() => {
    const karten = [...document.querySelectorAll(".offer-card")];
    const mit  = karten.find((k) => k.querySelector(".offer-early-note"));
    const ohne = karten.find((k) => !k.querySelector(".offer-early-note"));
    const geo = (k) => {
      const tl = k.querySelector(".offer-tl-labels").getBoundingClientRect();
      const zone3 = k.querySelector(".offer-zone-3").getBoundingClientRect();
      const ende = k.querySelector(".offer-tl-node--end").getBoundingClientRect();
      return { tlLinks: Math.round(tl.left), tlBreite: Math.round(tl.width),
               endeLinks: Math.round(ende.left), preisLinks: Math.round(zone3.left) };
    };
    return { mit: geo(mit), ohne: geo(ohne) };
  });
  assert.deepEqual(versatz.mit, versatz.ohne,
    "das Hinweisfeld verschiebt Timeline oder Preisspalte");
  await page.close();
});

test("8 — auf Mobile bleibt die Karte voll breit, ohne waagerechte Scrollfläche", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
  await setupRoutes(page, { n: 0 });
  await zeigeAngebote(page);

  const mass = await page.evaluate(() => {
    const sek = document.querySelector(".offers-section");
    const karte = document.querySelector(".offer-card");
    const preis = karte.querySelector(".offer-price");
    const cta = karte.querySelector(".offer-cta-btn");
    const k = karte.getBoundingClientRect();
    return {
      sektion: Math.round(sek.getBoundingClientRect().width),
      karte: Math.round(k.width),
      scrollUeberlauf: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      karteScroll: karte.scrollWidth - karte.clientWidth,
      preisSichtbar: preis && preis.getBoundingClientRect().right <= k.right + 1,
      ctaSichtbar: cta && cta.getBoundingClientRect().right <= k.right + 1,
    };
  });
  assert.ok(mass.sektion < 1080, "unter 1080px darf die Begrenzung nicht greifen");
  assert.ok(mass.sektion > 340, `die Sektion ist zusammengefallen (${mass.sektion}px)`);
  assert.equal(mass.scrollUeberlauf, 0, "waagerechte Scrollfläche auf der Seite");
  assert.equal(mass.karteScroll, 0, "waagerechte Scrollfläche in der Karte");
  assert.equal(mass.preisSichtbar, true, "der Preis ist abgeschnitten");
  assert.equal(mass.ctaSichtbar, true, "die Hauptaktion ist abgeschnitten");

  // Das neue Hinweisfeld passt vollständig in die Karte, ohne Überlauf.
  const note = await page.evaluate(() => {
    const n = document.querySelector(".offer-early-note");
    if (!n) return null;
    const k = n.closest(".offer-card").getBoundingClientRect();
    const r = n.getBoundingClientRect();
    return { drin: r.left >= k.left - 1 && r.right <= k.right + 1,
             text: n.textContent.trim(), abgeschnitten: n.scrollWidth > n.clientWidth + 1 };
  });
  assert.ok(note, "kein Hinweisfeld auf Mobile gerendert");
  assert.equal(note.drin, true, "das Hinweisfeld ragt aus der Karte");
  assert.equal(note.abgeschnitten, false, "der Text ist abgeschnitten");
  assert.match(note.text, /^Lieferung bis \d{2}:\d{2} Uhr$/);

  // Und das Uhrzeitfeld ist auf Mobile bedienbar.
  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(
    () => document.querySelector(".offers-time-trigger") && !document.querySelector(".offers-time-trigger").disabled,
    null, { timeout: 10000 });
  const feld = await page.locator(".offers-time-trigger").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { hoehe: Math.round(r.height), inSicht: r.left >= 0 && r.right <= window.innerWidth };
  });
  assert.equal(feld.inSicht, true, "das Uhrzeitfeld läuft aus dem Bild");
  assert.ok(feld.hoehe >= 40, `Trefferfläche zu klein: ${feld.hoehe}px`);
  await page.close();
});

/* ── Szenario D: Öffnungsrichtung, Platzmangel, Tastatur ─────────────────── */

// Bringt die Angebotsliste auf den Schirm und öffnet den Lieferzeitfilter mit
// gesetztem Datum — der Ausgangspunkt aller Dropdown-Messungen.
async function bereitFuerZeitliste(page, zaehler) {
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);
  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(
    () => document.querySelector(".offers-time-trigger") && !document.querySelector(".offers-time-trigger").disabled,
    null, { timeout: 10000 });
}

test("9 — bei wenig Platz öffnet die Liste TROTZDEM nach unten und scrollt intern", async () => {
  // Bewusst sehr flach: unter dem Auslöser bleibt kaum Raum. Ein natives Select
  // hätte hier nach oben geklappt — genau der gemeldete Livebefund.
  const page = await browser.newPage({ viewport: { width: 1280, height: 560 } });
  await bereitFuerZeitliste(page, { n: 0 });

  const geo = await oeffneZeitliste(page);
  assert.ok(geo.listeOben >= geo.triggerUnten - 1,
    `Liste ist nach oben geklappt: listeOben=${geo.listeOben} triggerUnten=${geo.triggerUnten}`);
  assert.equal(geo.overflowY, "auto", "die Liste braucht internen Scroll");
  assert.equal(geo.scrollbar, true, "bei wenig Platz muss die Liste intern scrollen");
  // Sie bleibt im Bild — die Höhenbegrenzung greift statt eines Sprungs.
  assert.ok(geo.listeUnten <= geo.fensterHoehe + 1,
    `Liste läuft unter den Bildrand: ${geo.listeUnten} > ${geo.fensterHoehe}`);
  await page.close();
});

test("10 — kein Upward-Flip über verschiedene Fensterhöhen hinweg", async () => {
  for (const height of [1200, 900, 700, 560]) {
    const page = await browser.newPage({ viewport: { width: 1280, height } });
    await bereitFuerZeitliste(page, { n: 0 });
    const geo = await oeffneZeitliste(page);
    assert.ok(geo.listeOben >= geo.triggerUnten - 1,
      `bei ${height}px öffnet die Liste nach oben`);
    await page.close();
  }
});

test("11 — die Liste liegt ÜBER den Formularfeldern und wird nicht abgeschnitten", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await bereitFuerZeitliste(page, { n: 0 });
  await oeffneZeitliste(page);

  // Der Punkt knapp unter der Auslöserkante gehört der LISTE, nicht dem, was
  // dort im Formular liegt — das beweist die Überdeckung praktisch.
  const treffer = await page.evaluate(() => {
    const l = document.querySelector(".offers-time-list").getBoundingClientRect();
    const el = document.elementFromPoint(l.left + l.width / 2, l.top + 8);
    return {
      istListe: !!el?.closest(".offers-time-list"), tag: el?.className || "",
      imBild: l.top >= 0 && l.top < window.innerHeight,
    };
  });
  // Beim Öffnen wird der Auslöser bei Bedarf in den Blick geholt — die Liste
  // steht danach im Bild und nicht unterhalb des Fensters.
  assert.equal(treffer.imBild, true, "die Liste liegt außerhalb des Fensters");
  assert.equal(treffer.istListe, true, `verdeckt von: ${treffer.tag}`);

  // Und sie ist vollständig sichtbar, nicht von einem overflow-Vorfahren geclippt.
  const sichtbar = await page.locator(".offers-time-list").isVisible();
  assert.equal(sichtbar, true);
  const clip = await page.evaluate(() => {
    const l = document.querySelector(".offers-time-list").getBoundingClientRect();
    return l.width > 0 && l.height > 0;
  });
  assert.equal(clip, true);
  await page.close();
});

test("12 — Escape schließt ohne Auswahl, Außenklick ebenfalls, Fokus kehrt zurück", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await bereitFuerZeitliste(page, { n: 0 });

  // Escape: Liste zu, Wert unverändert, Fokus zurück auf dem Auslöser.
  await oeffneZeitliste(page);
  await page.keyboard.press("Escape");
  await page.waitForSelector(".offers-time-list", { state: "detached", timeout: 5000 });
  assert.equal((await page.locator(".offers-time-trigger").textContent()).trim(), "Beliebig",
    "Escape darf den Wert nicht verändern");
  assert.equal(await page.evaluate(
    () => document.activeElement?.classList.contains("offers-time-trigger")), true);
  // Das umgebende Lieferzeit-Dropdown darf dabei NICHT mitgeschlossen haben.
  assert.equal(await page.locator(".offers-delivery-dropdown").count(), 1,
    "Escape hat auch die Wirtsfläche geschlossen");

  // Außenklick schließt ebenfalls.
  await oeffneZeitliste(page);
  await page.locator(".offers-filter-dd-title").click();
  await page.waitForSelector(".offers-time-list", { state: "detached", timeout: 5000 });
  await page.close();
});

test("13 — Tastaturbedienung wählt eine Zeit ohne Maus", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const zaehler = { n: 0 };
  await bereitFuerZeitliste(page, zaehler);

  await page.locator(".offers-time-trigger").focus();
  await page.keyboard.press("Enter");                    // öffnen
  await page.waitForSelector(".offers-time-list", { timeout: 5000 });
  await page.keyboard.press("End");                      // letzte Option
  await page.keyboard.press("Home");                     // zurück auf „Beliebig“
  await page.keyboard.press("ArrowDown");                // 08:00 Uhr
  await page.keyboard.press("ArrowDown");                // 09:00 Uhr
  await page.keyboard.press("Enter");                    // wählen
  await page.waitForSelector(".offers-time-list", { state: "detached", timeout: 5000 });

  assert.equal(await auslöserText(page), "09:00 Uhr");
  assert.equal(zaehler.n, 1, "Tastaturauswahl darf keinen Preisrequest auslösen");
  await page.close();
});

test("14 — mehrfaches Umstellen der Uhrzeit erzeugt KEINEN weiteren Preisrequest", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const zaehler = { n: 0 };
  await setupRoutes(page, zaehler);
  await zeigeAngebote(page);
  assert.equal(zaehler.n, 1, "das Laden der Tarife ist der EINE erlaubte Request");

  await oeffneLieferzeit(page);
  await page.locator(".offers-delivery-dropdown .dc-day", { hasText: /^31$/ }).first().click();
  await page.waitForFunction(
    () => document.querySelector(".offers-time-trigger") && !document.querySelector(".offers-time-trigger").disabled,
    null, { timeout: 10000 });
  assert.equal(zaehler.n, 1, "das Datum darf nicht neu rechnen");

  for (const zeit of ["10:30 Uhr", "12:00 Uhr", "17:00 Uhr", "Beliebig"]) {
    await sicherOffen(page);
    await oeffneZeitliste(page);
    await waehleZeit(page, zeit);
    assert.equal(zaehler.n, 1, `„${zeit}“ hat einen /calculate-price-Request ausgelöst`);
  }
  // Nach „Beliebig“ ist die Uhrzeit leer, das Datum steht noch.
  const feldwert = (await page.locator(".service-filter-trigger-val").last().textContent()).trim();
  assert.ok(!/·/.test(feldwert), `Uhrzeit nicht geleert: „${feldwert}“`);
  assert.match(feldwert, /Aug|Sep|\d{2}\./, "das Datum darf nicht mit verschwinden");
  await page.close();
});

test("15 — Mobile: Liste öffnet nach unten, scrollt intern, kein Seitenüberlauf", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 } });
  await bereitFuerZeitliste(page, { n: 0 });

  const geo = await oeffneZeitliste(page);
  assert.ok(geo.listeOben >= geo.triggerUnten - 1, "Liste öffnet auf Mobile nach oben");
  assert.ok(geo.listeLinks >= -1, "Liste läuft links aus dem Bild");
  assert.ok(geo.listeLinks + geo.listeBreite <= 390 + 1, "Liste läuft rechts aus dem Bild");
  const ueberlauf = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.equal(ueberlauf, 0, "waagerechte Scrollfläche auf der Seite");

  // Auswahl per Antippen funktioniert und die Trefferfläche ist groß genug.
  const hoehe = await page.locator(".offers-time-option").first().evaluate(
    (el) => Math.round(el.getBoundingClientRect().height));
  assert.ok(hoehe >= 36, `Optionshöhe zu klein: ${hoehe}px`);
  await waehleZeit(page, "12:00 Uhr");
  assert.equal(await auslöserText(page), "12:00 Uhr");
  await page.close();
});
