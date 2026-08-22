// E2E: Maße und Wirkung der Bedienelemente in „Zusätzliche Optionen".
//
// Rein visuelle Verfeinerung — deshalb wird hier GEMESSEN, nicht nach CSS-Strings
// gesucht: ein Token kann richtig heißen und trotzdem die falsche Größe ergeben.
//
// Zwei Leitsätze halten diese Datei zusammen:
//   1. Der Schalter ist ein Steuerelement, keine Überschrift — er muss kleiner
//      wirken als der Text, den er bedient.
//   2. Klein sichtbar heißt NICHT klein bedienbar: die Trefferfläche bleibt die
//      ganze Zeile, auf Touchgeräten mindestens 44 px.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5248, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

const TARIFF = {
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
  publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
  netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
};

const TOGGLES = [
  "#booking-reference-toggle",
  "#booking-tracking-email-toggle",
  "#booking-label-email-toggle",
  "#booking-labelformat-toggle",
];
const FMT_TOGGLE = "#booking-labelformat-toggle";

let server, browser;

async function setupRoutes(page) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Legal-Buchungsschranke (Go-Live Paket 4-B): `enabled:false` ist die
    // Antwort eines Servers mit ABGESCHALTETER Schranke — der heutige
    // Produktivzustand. Ohne diese Antwort liefe der Mock in den Sammelfall
    // `200 {}`; `parseBookingContext` wertet das fail-closed als `error` und
    // sperrt die Bestellung. Das ist richtiges Produktverhalten und darf nicht
    // aufgeweicht werden — die Suite muss den Endpunkt schlicht beantworten.
    // Beide Zustände der Schranke prüft `legalBookingGate.test.mjs`.
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", tariffs: [TARIFF], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function schalte(page, sel, an) {
  const input = page.locator(sel);
  if ((await input.isChecked()) === an) return;
  await input.locator("xpath=ancestor::label[1]").click();
  assert.equal(await input.isChecked(), an, `Schalter ${sel} ließ sich nicht setzen`);
}

async function zurBuchung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(TOGGLES[0], { timeout: 20000 });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { stdio: "ignore" });
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
  if (server) server.kill("SIGKILL");
});

/* ══════════ Schaltergeometrie ══════════ */

test("1 — alle vier Schalter sind klein: höchstens 34×20, Knopf höchstens 15", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zurBuchung(page);

  for (const sel of TOGGLES) {
    const spur = await page.locator(`${sel} ~ .ce-switch-track`).boundingBox();
    assert.ok(spur.width <= 34, `${sel}: Spur ${spur.width}px breit (max 34)`);
    assert.ok(spur.height <= 20, `${sel}: Spur ${spur.height}px hoch (max 20)`);
    assert.ok(spur.width >= 28 && spur.height >= 16, `${sel}: zu klein geraten (${spur.width}×${spur.height})`);
    const knopf = await page.locator(`${sel} ~ .ce-switch-track .ce-switch-knob`).boundingBox();
    assert.ok(knopf.width <= 15 && knopf.height <= 15, `${sel}: Knopf ${knopf.width}×${knopf.height} (max 15)`);
  }
  await page.close();
});

test("2 — der Knopf wandert vollständig innerhalb der Spur", async () => {
  // Rein rechnerisch könnte ein zu großer Weg den Knopf über die Kante schieben.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zurBuchung(page);
  const sel = TOGGLES[0];

  for (const an of [false, true]) {
    await schalte(page, sel, an);
    await page.waitForTimeout(200);
    // Beide Rechtecke in EINEM evaluate: zwei getrennte boundingBox()-Aufrufe
    // sind zwei Zeitpunkte, und eine Layoutverschiebung dazwischen (Schriftladen,
    // Last) verglich sonst zwei verschiedene Zustände miteinander.
    const { spur, knopf } = await page.locator(`${sel} ~ .ce-switch-track`).evaluate((track) => {
      const b = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
      return { spur: b(track), knopf: b(track.querySelector(".ce-switch-knob")) };
    });
    const lage = `an=${an} Spur y=${spur.y}..${spur.y + spur.h} x=${spur.x}..${spur.x + spur.w}` +
                 ` | Knopf y=${knopf.y}..${knopf.y + knopf.h} x=${knopf.x}..${knopf.x + knopf.w}`;
    assert.ok(knopf.x >= spur.x - 0.5, `Knopf links heraus — ${lage}`);
    assert.ok(knopf.x + knopf.w <= spur.x + spur.w + 0.5, `Knopf rechts heraus — ${lage}`);
    assert.ok(knopf.y >= spur.y - 0.5 && knopf.y + knopf.h <= spur.y + spur.h + 0.5,
      `Knopf vertikal heraus — ${lage}`);
  }
  await page.close();
});

test("3 — der Schalter tritt zurück, der Text führt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zurBuchung(page);

  // Atomar gemessen — siehe Begründung in Test 2.
  const { spur, text } = await page.locator(`${TOGGLES[0]} ~ .ce-switch-track`).evaluate((track) => {
    const w = (el) => el.getBoundingClientRect().width;
    const zeile = track.closest(".ce-switch");
    return { spur: w(track), text: w(zeile.querySelector(".ce-switch-label")) };
  });
  assert.ok(text > spur * 3, `der Text muss die Zeile tragen (${text} vs ${spur})`);
  // Und die Hauptaktion bleibt das stärkste Bedienelement der Seite.
  // Höhen sind gegen Layoutverschiebungen unempfindlich (anders als Positionen).
  const spurHoehe = await page.locator(`${TOGGLES[0]} ~ .ce-switch-track`).evaluate(
    (el) => el.getBoundingClientRect().height);
  const cta = await page.getByRole("button", { name: /^Weiter/ }).first().boundingBox();
  assert.ok(cta.height > spurHoehe * 1.8, `„Weiter" (${cta.height}px) muss den Schalter (${spurHoehe}px) klar überragen`);
  await page.close();
});

/* ══════════ Zustände ══════════ */

test("4 — AUS ist eine sehr helle Fläche mit dünner Kante, AN ein ruhiges Indigo", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zurBuchung(page);
  const spur = page.locator(`${TOGGLES[0]} ~ .ce-switch-track`);
  const lies = () => spur.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, border: s.borderTopWidth, borderColor: s.borderTopColor, schatten: s.boxShadow };
  });

  const aus = await lies();
  const rgbAus = aus.bg.match(/\d+/g).map(Number);
  assert.ok(rgbAus.every(k => k > 220), `AUS muss sehr hell sein, ist ${aus.bg}`);
  assert.equal(aus.border, "1px", "AUS braucht eine dünne Kante, um sichtbar zu bleiben");
  assert.equal(aus.schatten, "none", "kein Schatten am Schalter");

  await schalte(page, TOGGLES[0], true);
  await page.waitForTimeout(200);
  const an = await lies();
  const rgbAn = an.bg.match(/\d+/g).map(Number);
  assert.ok(rgbAn[2] > rgbAn[0] && rgbAn[2] > rgbAn[1], `AN muss indigo sein, ist ${an.bg}`);
  // Deutlich ruhiger als der leuchtende Markengrundton #5367e8 = rgb(83,103,232).
  assert.ok(rgbAn[0] < 83 && rgbAn[1] < 103, `AN soll zurückhaltender sein als der Basiston, ist ${an.bg}`);
  assert.equal(an.schatten, "none", "kein Glow im eingeschalteten Zustand");
  await page.close();
});

test("5 — der Zustand steht nicht allein in der Farbe", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zurBuchung(page);
  const knopf = () => page.locator(`${TOGGLES[0]} ~ .ce-switch-track .ce-switch-knob`).boundingBox();

  const aus = await knopf();
  await schalte(page, TOGGLES[0], true);
  await page.waitForTimeout(250);
  const an = await knopf();
  assert.ok(an.x - aus.x >= 10, `der Knopf muss sichtbar wandern (${an.x - aus.x}px)`);
  await page.close();
});

test("6 — der Fokus bleibt trotz kleinerem Schalter gut sichtbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zurBuchung(page);

  // Per ECHTER Tastatur anfahren: :focus-visible greift in Chromium nicht bei
  // rein programmatischem focus(), und geprüft werden soll genau das, was ein
  // Tastaturnutzer sieht.
  await page.locator(TOGGLES[0]).focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  assert.ok(await page.locator(TOGGLES[0]).evaluate((el) => el === document.activeElement),
    "der Schalter muss per Tab erreichbar sein");
  const fokus = await page.locator(`${TOGGLES[0]} ~ .ce-switch-track`).evaluate((el) => {
    const s = getComputedStyle(el);
    return { stil: s.outlineStyle, breite: s.outlineWidth, farbe: s.outlineColor };
  });
  assert.equal(fokus.stil, "solid", "der Fokusring muss sichtbar sein");
  assert.ok(parseFloat(fokus.breite) >= 2, `Fokusring nur ${fokus.breite}`);
  await page.close();
});

/* ══════════ Trefferfläche ══════════ */

test("7 — klein sichtbar, groß bedienbar: 44px Zeile auf Touchbreiten", async () => {
  for (const w of [1440, 1280, 1024, 768, 430, 390, 360]) {
    const page = await browser.newPage({ viewport: { width: w, height: 1300 } });
    await setupRoutes(page);
    await zurBuchung(page);

    for (const sel of TOGGLES) {
      const spur = await page.locator(`${sel} ~ .ce-switch-track`).boundingBox();
      assert.ok(spur.width <= 34, `${sel} bei ${w}px: Spur ${spur.width}px — auch mobil klein bleiben`);
      const zeile = await page.locator(sel).locator("xpath=ancestor::label[1]").boundingBox();
      if (w <= 860) {
        assert.ok(zeile.height >= 44, `${sel} bei ${w}px: Zeile nur ${zeile.height}px (WCAG 2.5.5)`);
      }
      // Die Zeile ist immer deutlich größer als das Steuerelement selbst.
      assert.ok(zeile.width > spur.width * 4, `${sel} bei ${w}px: Trefferfläche zu schmal`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      `horizontaler Überlauf bei ${w}px`);
    await page.close();
  }
});

/* ══════════ Labelformat-Auswahl ══════════ */

test("8 — die A4/A6-Felder sind kompakt statt kartenhaft", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zurBuchung(page);
  await schalte(page, FMT_TOGGLE, true);

  const karten = page.locator(".labelfmt-card");
  assert.equal(await karten.count(), 2, "beide Formate bleiben sichtbar und vergleichbar");
  for (let i = 0; i < 2; i++) {
    const box = await karten.nth(i).boundingBox();
    assert.ok(box.height <= 50, `Auswahlfeld ${i} ist ${box.height}px hoch (max 50)`);
    assert.ok(box.height >= 36, `Auswahlfeld ${i} ist mit ${box.height}px gequetscht`);
  }
  // Kein Select — die Wahl bleibt direkt sichtbar.
  assert.equal(await page.locator(".labelfmt-group select").count(), 0);
  assert.equal(await page.locator('.labelfmt-card input[type="radio"]').count(), 2);
  await page.close();
});

test("9 — die aktive Wahl ist erkennbar, aber nicht dominant", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zurBuchung(page);
  await schalte(page, FMT_TOGGLE, true);

  const stil = (sel) => page.locator(sel).first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, borderBreite: s.borderTopWidth, borderFarbe: s.borderTopColor, schatten: s.boxShadow };
  });

  const gewaehlt = await stil(".labelfmt-card--selected");
  assert.equal(gewaehlt.schatten, "none", "eine Nebeneinstellung braucht keine Erhöhung");
  assert.ok(parseFloat(gewaehlt.borderBreite) <= 1, `Kante ${gewaehlt.borderBreite} — zu kräftig`);
  const bgSel = gewaehlt.bg.match(/\d+/g).map(Number);
  assert.ok(bgSel.every(k => k > 225), `die aktive Fläche muss sehr hell bleiben, ist ${gewaehlt.bg}`);

  const offen = await stil(".labelfmt-card:not(.labelfmt-card--selected)");
  assert.equal(offen.schatten, "none");
  const bgOff = offen.bg.match(/\d+/g).map(Number);
  assert.ok(bgOff.every(k => k >= 250), `die inaktive Fläche muss ruhig bleiben, ist ${offen.bg}`);
  // Die aktive Kante ist farbig, die inaktive nicht — die Wahl bleibt eindeutig.
  assert.notEqual(gewaehlt.borderFarbe, offen.borderFarbe);
  await page.close();
});

test("10 — der Radio-Indikator bleibt sichtbar und gefüllt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zurBuchung(page);
  await schalte(page, FMT_TOGGLE, true);

  const punkt = await page.locator(".labelfmt-card--selected .labelfmt-radio").boundingBox();
  assert.ok(punkt.width >= 12 && punkt.width <= 16, `Indikator ${punkt.width}px — lesbar zwischen 12 und 16`);
  const gefuellt = await page.locator(".labelfmt-card--selected .labelfmt-radio").evaluate(
    (el) => getComputedStyle(el, "::after").content !== "none");
  assert.ok(gefuellt, "die aktive Auswahl braucht einen sichtbaren Punkt, nicht nur eine Kante");
  await page.close();
});

test("11 — auf allen Breiten kompakt, lesbar und ohne Überlauf", async () => {
  for (const w of [1440, 1280, 1024, 768, 430, 390, 360]) {
    const page = await browser.newPage({ viewport: { width: w, height: 1300 } });
    await setupRoutes(page);
    await zurBuchung(page);
    await schalte(page, FMT_TOGGLE, true);

    const karten = page.locator(".labelfmt-card");
    for (let i = 0; i < 2; i++) {
      const box = await karten.nth(i).boundingBox();
      assert.ok(box.height <= 50, `bei ${w}px: Auswahlfeld ${box.height}px hoch`);
      const abgeschnitten = await karten.nth(i).evaluate(
        (el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1);
      assert.ok(!abgeschnitten, `bei ${w}px: Auswahlfeld ${i} schneidet Text ab`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1),
      `horizontaler Überlauf bei ${w}px`);
    await page.close();
  }
});

/* ══════════ Fachlichkeit unverändert ══════════ */

test("12 — Verhalten und Werte des Labelformats sind unberührt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zurBuchung(page);

  // Default A4, Schalter aus, Auswahl verborgen, Aktuell-Zeile vorhanden.
  assert.equal(await page.locator(FMT_TOGGLE).isChecked(), false);
  assert.equal(await page.locator(".labelfmt-card").count(), 0);
  assert.match(await page.locator(".addopt-panel").innerText(), /Aktuell: DIN A4/);

  await schalte(page, FMT_TOGGLE, true);
  assert.match(await page.locator(".labelfmt-card--selected").innerText(), /DIN A4/);
  await page.locator('.labelfmt-card:has-text("DIN A6")').click();
  assert.match(await page.locator(".addopt-panel").innerText(), /Aktuell: DIN A6/);

  // Ausschalten setzt weiterhin auf A4 zurück.
  await schalte(page, FMT_TOGGLE, false);
  assert.match(await page.locator(".addopt-panel").innerText(), /Aktuell: DIN A4/);
  await schalte(page, FMT_TOGGLE, true);
  assert.match(await page.locator(".labelfmt-card--selected").innerText(), /DIN A4/);

  // Genau zwei Formate — die Verkürzung der Beschreibung hat keine Option entfernt.
  const texte = await page.locator(".labelfmt-name").allInnerTexts();
  assert.deepEqual(texte, ["DIN A4", "DIN A6"]);
  await page.close();
});

test("13 — die Schalter behalten ihre Semantik und Bedienung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page);
  await zurBuchung(page);

  for (const sel of TOGGLES) {
    const s = page.locator(sel);
    assert.equal(await s.getAttribute("role"), "switch", `${sel}: role fehlt`);
    assert.equal(await s.evaluate((el) => el.tagName + ":" + el.type), "INPUT:checkbox",
      `${sel}: muss ein echtes Kontrollkästchen bleiben`);
    // Tastatur und aria-checked folgen daraus.
    await s.focus();
    await page.keyboard.press(" ");
    assert.equal(await s.isChecked(), true, `${sel}: Leertaste schaltet nicht`);
    assert.equal(await s.evaluate((el) => el.getAttribute("aria-checked") ?? String(el.checked)), "true");
    await page.keyboard.press(" ");
    assert.equal(await s.isChecked(), false);
  }
  // Und der Klick auf den Text schaltet weiterhin mit.
  await page.getByText("Eigene Referenznummer hinzufügen", { exact: true }).click();
  assert.equal(await page.locator(TOGGLES[0]).isChecked(), true);
  await page.close();
});
