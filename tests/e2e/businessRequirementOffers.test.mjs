// E2E: Firmenpflicht auf der Angebotskarte (Gesamtauftrag B, Betreiberentscheidung 2026-10-24, Canonical v2.73).
// Echter Dev-Server, echter Browser, gemocktes Backend — keine Bestellung, kein Anbieter.
//
// Tarife mit Firmenpflicht (TNT 41/44/49, JUMiNGO mit from_/to_company_only) bleiben auswählbar: die Karte zeigt
// „Angebot auswählen", die Anforderung je Partei und ein Bestätigungsfeld. Fehlt der Firmenname, führt der Klick zum
// Feld (Meldung, im Bild, Fokus); nach der Ergänzung setzt GENAU EIN neuer Vergleich fort, das Angebot wird über den
// productKey wiedergefunden und sein Bestätigungsfeld fokussiert. Ohne Bestätigung keine Buchungsseite.
//
//   B1  Karte: „Angebot auswählen", Anforderung je Partei, Bestätigungsfeld; das Feld wählt die Karte nicht aus
//   B2  Firmenname fehlt: Meldung am Empfängerfeld, im Bild, Fokus; ergänzen → genau ein Vergleich → wiedergefunden
//   B3  Ohne Bestätigung: Meldung und Fokus am Feld, keine Buchungsseite; mit Bestätigung → Buchungsseite
//   B4  Nicht wiedergefunden: ehrlicher Hinweis, nichts ausgewählt
//   B5  Absender (reduzierte Bewegung): Firmenpflicht des Absenders führt zum Absenderfeld
//   B6  Versandkostenrechner im Portal: Hinweis ohne Bestätigungsfeld, „Angebot auswählen" bleibt bedienbar
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_ABSENDER, STANDARD_EMPFAENGER, STANDARD_PAKET } from "./helpers/newShipmentForm.mjs";

const PORT = 5576, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "70173", customer_number: "CE-K-10998",
};
const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT",
              "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];
const kennung = (kopf, fuss) => `${kopf}${fuss.padStart(32 - kopf.length, "0")}`;
const produkt = (s) => `pk1_${s.padEnd(22, "x").slice(0, 22)}`;
const preis = (netto) => ({ netPrice: netto, vatAmount: Number((netto * 0.19).toFixed(2)),
                            finalPrice: Number((netto * 1.19).toFixed(2)), currency: "EUR" });
const basis = { serviceType: "pickup", transitDaysMin: 2, transitDaysMax: 3, deliveryTime: "2-3 Tage",
                trackingAvailable: true, printerRequired: false, deliveryOnSaturday: false, requiredPriceInputs: [] };

// `runde` unterscheidet die offerIds je Vergleich — wiedergefunden wird ausschließlich über den productKey.
const jEmpfaenger = (runde, buchbar) => ({
  ...basis, id: 3401, shipper_tariff_id: 3401, offerId: kennung(`bej${runde}`, "3401"), productKey: produkt("jumempfaenger3401"),
  publicCarrierId: "tnt", publicCarrierName: "TNT", publicServiceName: "Economy Express", shippingMode: "economy",
  bookable: buchbar, unavailableReason: buchbar ? null : "business_recipient_required",
  recipientRequirement: "business", senderRequirement: null, ...preis(31),
});
const tEmpfaenger = (runde, buchbar) => ({
  ...basis, offerId: kennung(`bet${runde}`, "41"), productKey: produkt("tgtnt41economy"),
  publicCarrierId: "tnt", publicCarrierName: "TNT", publicServiceName: "Economy Express",
  deliveryDate: null, deliveryDateMin: null, deliveryDateMax: null,
  bookable: buchbar, unavailableReason: buchbar ? null : "business_recipient_required",
  recipientRequirement: "business", senderRequirement: null, ...preis(28),
});
const jAbsender = (runde, buchbar) => ({
  ...basis, id: 3402, shipper_tariff_id: 3402, offerId: kennung(`bes${runde}`, "3402"), productKey: produkt("jumabsender3402"),
  publicCarrierId: "dhl", publicCarrierName: "DHL Express", publicServiceName: "Express", shippingMode: "express",
  bookable: buchbar, unavailableReason: buchbar ? null : "business_sender_required",
  recipientRequirement: null, senderRequirement: "business", ...preis(19),
});
const normal = (runde) => ({
  ...basis, id: 3309, shipper_tariff_id: 3309, offerId: kennung(`ben${runde}`, "3309"), productKey: produkt("upsstandard3309"),
  publicCarrierId: "ups", publicCarrierName: "UPS", publicServiceName: "Standard", shippingMode: "standard",
  bookable: true, unavailableReason: null, recipientRequirement: null, senderRequirement: null, ...preis(14),
});
const CARRIER = [{ id: "dhl", name: "DHL Express" }, { id: "tnt", name: "TNT" }, { id: "ups", name: "UPS" }];

let server, browser;

/* Das Backend: `antwort(body, aufruf)` liefert die Angebote — je nach Anfrage (etwa mit oder ohne Firmenname). */
async function setup(page, antwort) {
  const p = { calc: 0, bodies: [] };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const pfad = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (pfad.endsWith("/api/shipping/launch-scope")) return json({ countries: EU27, originCountries: ["DE"] });
    if (pfad.endsWith("/kundenbereich")) return json({ user: USER });
    if (pfad.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (pfad.endsWith("/kunde/shipments")) return json({ shipments: [], nextCursor: null });
    if (pfad.includes("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (pfad.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (pfad.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (pfad.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (pfad.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (pfad.includes("/api/jumingo/calculate-price")) {
      p.calc++;
      let body = {};
      try { body = JSON.parse(route.request().postData() || "{}"); } catch { /* leer */ }
      p.bodies.push(body);
      return json({ ceShipmentId: 5000 + p.calc, customsRequired: false, exportDeclaration: null,
        availableShippingModes: ["economy", "express", "standard"], publicCarriers: CARRIER,
        fromCountryCode: "DE", toCountryCode: "DE", ...antwort(body, p.calc) });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return p;
}

const norm = (s) => String(s ?? "").replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();
const kurz = (ms) => new Promise((r) => setTimeout(r, ms));
const karte = (page, offerId) => page.locator(`.offer-card:has(button[aria-controls="offer-details-${offerId}"])`);
const aktivesElement = (page) => page.evaluate(() => (document.activeElement ? document.activeElement.id : null));
const wartenAufFokus = (page, id) =>
  page.waitForFunction((x) => document.activeElement && document.activeElement.id === x, id, { timeout: 10000 });
async function scrollBeruhigt(page) {
  await page.evaluate(() => new Promise((fertig) => {
    let letzte = window.scrollY, ruhig = 0, frames = 0;
    const tick = () => {
      if (window.scrollY === letzte) ruhig += 1;
      else { ruhig = 0; letzte = window.scrollY; }
      if (ruhig >= 5 || (frames += 1) > 240) return fertig();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
}
const imBild = (page, id) => page.evaluate((x) => {
  const el = document.getElementById(x);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.top >= 0 && r.bottom <= window.innerHeight;
}, id);
const feldMeldung = (page, id) => page.evaluate((x) => {
  const el = document.getElementById(x);
  const ziel = el && el.getAttribute("aria-describedby");
  return ziel ? (document.getElementById(ziel.split(" ")[0])?.textContent || "") : "";
}, id);

async function neueSeite({ viewport = { width: 1440, height: 900 }, reducedMotion = "no-preference" } = {}) {
  const page = await browser.newPage({ viewport, reducedMotion });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return { page, fehler };
}

async function zuDenAngeboten(page, { absender = STANDARD_ABSENDER, empfaenger = STANDARD_EMPFAENGER } = {}) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { absender, empfaenger, paket: { ...STANDARD_PAKET, packageCount: "1" } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", ...DEV_SERVER_SPAWN });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await kurz(250);
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

const OHNE_EMPFAENGERFIRMA = { ...STANDARD_EMPFAENGER, company: "" };

test("B1 — Karte: „Angebot auswählen“, Anforderung je Partei, Bestätigungsfeld; das Feld wählt die Karte nicht aus", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page, () => ({ tariffs: [jEmpfaenger(1, false), tEmpfaenger(1, false), jAbsender(1, true), normal(1)] }));
  await zuDenAngeboten(page, { empfaenger: OHNE_EMPFAENGERFIRMA });
  for (const t of [jEmpfaenger(1, false), tEmpfaenger(1, false)]) {
    const k = karte(page, t.offerId);
    const knopf = k.locator("button.offer-cta-btn");
    assert.equal(norm(await knopf.textContent()), "Angebot auswählen", "der Knopf nennt einen Sperrgrund");
    assert.equal(await knopf.isEnabled(), true, "der Knopf ist gesperrt");
    assert.equal(norm(await k.locator(".offer-business-note").textContent()),
      "Nur für Geschäftsempfänger: Zugestellt wird ausschließlich an Unternehmen.");
    assert.equal(norm(await k.locator(".offer-business-confirm").textContent()), "Der Empfänger ist ein Unternehmen.");
  }
  const absender = karte(page, jAbsender(1, true).offerId);
  assert.equal(norm(await absender.locator(".offer-business-note").textContent()),
    "Nur für Geschäftsabsender: Versendet werden kann nur von einem Unternehmen.");
  assert.equal(norm(await absender.locator(".offer-business-confirm").textContent()), "Der Absender ist ein Unternehmen.");
  // Ohne Firmenpflicht: keine Zeile, kein Feld.
  assert.equal(await karte(page, normal(1).offerId).locator(".offer-business").count(), 0);
  // Das Bestätigungsfeld wählt die Karte nicht aus.
  const feld = karte(page, jEmpfaenger(1, false).offerId).locator(".offer-business-confirm input");
  await feld.check();
  assert.equal(await feld.isChecked(), true);
  assert.equal(await page.locator(".offer-card--selected").count(), 0, "der Klick auf das Feld hat eine Karte ausgewählt");
  // Kein Anbieter, kein Rohcode in den Texten.
  const texte = norm(await page.locator(".offer-business").allTextContents().then((a) => a.join(" ")));
  assert.doesNotMatch(texte, /business_|_required|jumingo|transglobal/i);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B2 — Firmenname fehlt: Meldung am Empfängerfeld, im Bild, Fokus; ergänzen → genau ein Vergleich → wiedergefunden, Fokus auf der Bestätigung", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, (body, aufruf) => {
    const mitFirma = Boolean(body.recipient && String(body.recipient.company || "").trim());
    return { tariffs: [jEmpfaenger(aufruf, mitFirma), normal(aufruf)] };
  });
  await zuDenAngeboten(page, { empfaenger: OHNE_EMPFAENGERFIRMA });
  assert.equal(p.calc, 1);
  await karte(page, jEmpfaenger(1, false).offerId).locator("button.offer-cta-btn").click();
  await wartenAufFokus(page, "ns-r-company");
  await scrollBeruhigt(page);
  assert.equal(await imBild(page, "ns-r-company"), true, "das Empfängerfeld ist nicht im Bild");
  assert.equal(await page.getAttribute("#ns-r-company", "aria-invalid"), "true", "das Feld ist nicht markiert");
  assert.equal(norm(await feldMeldung(page, "ns-r-company")),
    "Für das gewählte Angebot ist beim Empfänger ein Firmenname erforderlich.");
  // Nur dieses Feld ist markiert, die Seite bleibt, kein weiterer Request.
  assert.equal(await page.getAttribute("#ns-s-company", "aria-invalid"), null);
  assert.doesNotMatch(page.url(), /\/booking/, "der Klick führte zur Buchungsseite");
  assert.equal(p.calc, 1);

  // Ergänzen und das Feld verlassen → genau ein neuer Vergleich, mit dem Firmennamen.
  await page.fill("#ns-r-company", "Empfang AG");
  await page.keyboard.press("Tab");
  const neu = jEmpfaenger(2, true);
  await page.waitForSelector(`.offer-card:has(button[aria-controls="offer-details-${neu.offerId}"])`, { timeout: 20000 });
  assert.equal(p.calc, 2, "es lief nicht genau ein neuer Vergleich");
  assert.equal(p.bodies[1].recipient.company, "Empfang AG");
  // Wiedergefunden über den productKey (neue offerId), ausgewählt, Bestätigungsfeld fokussiert und im Bild.
  const feldId = `offer-business-confirm-${neu.offerId}`;
  await wartenAufFokus(page, feldId);
  await scrollBeruhigt(page);
  assert.equal(await imBild(page, feldId), true, "das Bestätigungsfeld ist nicht im Bild");
  assert.equal(await karte(page, neu.offerId).evaluate((el) => el.classList.contains("offer-card--selected")), true,
    "das wiedergefundene Angebot ist nicht ausgewählt");
  assert.equal(await page.locator("#ns-firmen-hinweis").count(), 0);
  // Ein weiteres Verlassen des Felds löst keinen weiteren Vergleich aus.
  await page.focus("#ns-r-company");
  await page.keyboard.press("Tab");
  await kurz(400);
  assert.equal(p.calc, 2, "ein zweites Verlassen hat erneut verglichen");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B3 — Ohne Bestätigung keine Buchungsseite; mit Bestätigung weiter zur Buchungsseite", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, () => ({ tariffs: [jEmpfaenger(1, true), normal(1)] }));
  await zuDenAngeboten(page);
  const t = jEmpfaenger(1, true);
  const k = karte(page, t.offerId);
  await k.locator("button.offer-cta-btn").click();
  const feldId = `offer-business-confirm-${t.offerId}`;
  await wartenAufFokus(page, feldId);
  assert.equal(norm(await k.locator(".offer-business-error").textContent()),
    "Bitte bestätigen Sie diese Angabe, um das Angebot auszuwählen.");
  assert.equal(await page.getAttribute(`#${feldId}`, "aria-invalid"), "true");
  assert.doesNotMatch(page.url(), /\/booking/, "ohne Bestätigung ging es zur Buchungsseite");
  await page.check(`#${feldId}`);
  assert.equal(await k.locator(".offer-business-error").count(), 0, "die Meldung blieb nach der Bestätigung stehen");
  await k.locator("button.offer-cta-btn").click();
  await page.waitForURL(/\/booking/, { timeout: 15000 });
  assert.equal(p.calc, 1, "die Auswahl hat einen Request ausgelöst");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B4 — Nicht wiedergefunden: ehrlicher Hinweis, nichts ausgewählt", async () => {
  const { page, fehler } = await neueSeite();
  const p = await setup(page, (body, aufruf) => ({ tariffs: aufruf === 1 ? [jEmpfaenger(1, false), normal(1)] : [normal(aufruf)] }));
  await zuDenAngeboten(page, { empfaenger: OHNE_EMPFAENGERFIRMA });
  await karte(page, jEmpfaenger(1, false).offerId).locator("button.offer-cta-btn").click();
  await wartenAufFokus(page, "ns-r-company");
  await page.fill("#ns-r-company", "Empfang AG");
  await page.keyboard.press("Tab");
  await page.waitForSelector("#ns-firmen-hinweis", { timeout: 20000 });
  assert.equal(p.calc, 2);
  assert.equal(norm(await page.locator("#ns-firmen-hinweis").textContent()),
    "Das gewählte Angebot ist mit den ergänzten Angaben nicht verfügbar. Bitte wählen Sie ein anderes Angebot.");
  assert.equal(await page.locator(".offer-card--selected").count(), 0, "ein anderes Angebot wurde ausgewählt");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B5 — Absender (reduzierte Bewegung): die Firmenpflicht des Absenders führt zum Absenderfeld", async () => {
  const { page, fehler } = await neueSeite({ reducedMotion: "reduce" });
  const p = await setup(page, (body, aufruf) => {
    const mitFirma = Boolean(body.sender && String(body.sender.company || "").trim());
    return { tariffs: [jAbsender(aufruf, mitFirma), normal(aufruf)] };
  });
  await zuDenAngeboten(page, { absender: { ...STANDARD_ABSENDER, company: "" } });
  await karte(page, jAbsender(1, false).offerId).locator("button.offer-cta-btn").click();
  await wartenAufFokus(page, "ns-s-company");
  // Bei reduzierter Bewegung ohne Animation: das Feld steht sofort im Bild.
  assert.equal(await imBild(page, "ns-s-company"), true);
  assert.equal(norm(await feldMeldung(page, "ns-s-company")),
    "Für das gewählte Angebot ist beim Absender ein Firmenname erforderlich.");
  assert.equal(await page.getAttribute("#ns-r-company", "aria-invalid"), null);
  await page.fill("#ns-s-company", "Muster GmbH");
  await page.keyboard.press("Tab");
  const neu = jAbsender(2, true);
  await wartenAufFokus(page, `offer-business-confirm-${neu.offerId}`);
  assert.equal(p.calc, 2);
  assert.equal(p.bodies[1].sender.company, "Muster GmbH");
  assert.deepEqual(fehler, []);
  await page.close();
});

test("B6 — Versandkostenrechner im Portal: Hinweis ohne Bestätigungsfeld, „Angebot auswählen“ bleibt bedienbar", async () => {
  const { page, fehler } = await neueSeite();
  await setup(page, () => ({ tariffs: [jEmpfaenger(1, false), normal(1)] }));
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  for (const [id, wert] of [["#calc-from-zip", "70173"], ["#calc-from-city", "Stuttgart"], ["#calc-to-zip", "80331"],
    ["#calc-to-city", "Muenchen"], ["#calc-packageCount", "1"], ["#calc-weight", "2"], ["#calc-length", "30"],
    ["#calc-width", "20"], ["#calc-height", "15"]]) await page.fill(id, wert);
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  const k = karte(page, jEmpfaenger(1, false).offerId);
  assert.equal(norm(await k.locator(".offer-business-note").textContent()),
    "Nur für Geschäftsempfänger: Zugestellt wird ausschließlich an Unternehmen.");
  assert.equal(await k.locator(".offer-business-confirm").count(), 0, "der Rechner zeigt ein Bestätigungsfeld");
  assert.equal(await k.locator("button.offer-cta-btn").isEnabled(), true);
  assert.equal(norm(await k.locator("button.offer-cta-btn").textContent()), "Angebot auswählen");
  assert.deepEqual(fehler, []);
  await page.close();
});
