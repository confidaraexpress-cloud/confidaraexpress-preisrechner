// E2E: temporaerer Multi-Provider-Vergleichsmodus — echter Dev-Server, echter Browser.
//
// Was eine Quelltextpruefung NICHT erreicht und diese Suite deshalb misst:
//   • ob die Karte im Produktionszustand wirklich unveraendert bleibt (gerechnete
//     Hintergrundfarbe, nicht behauptete Klasse),
//   • ob die drei Toene tatsaechlich VERSCHIEDEN gerendert werden,
//   • ob Gruen ueber der Providerfarbe steht,
//   • ob Auswahl- und Gesperrt-Zustand unter der Toenung sichtbar bleiben,
//   • ob die Sortierung nach Preis den ANGEZEIGTEN Betrag nimmt,
//   • und ob die Toenung auf vier Breiten nichts abschneidet oder ueberlaufen laesst.
//
// Bewusst gegen ein gemocktes Backend — niemals eine echte Berechnung, niemals eine
// Bestellung, niemals ein Providercall.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_ABSENDER } from "./helpers/newShipmentForm.mjs";

const PORT = 5265, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "97421", customer_number: "CE-K-10030",
};

const grund = (over) => ({
  currency: "EUR", serviceType: "pickup", transitDaysMin: 1, transitDaysMax: 2,
  deliveryDate: "2026-09-07", deliveryDateMin: "2026-09-07", deliveryDateMax: "2026-09-08",
  trackingAvailable: true, printerRequired: false, availableForDate: true, bookable: true,
  ...over,
});
const preis = (netto) => ({ netPrice: netto, vatAmount: Number((netto * 0.19).toFixed(2)),
                            finalPrice: Number((netto * 1.19).toFixed(2)) });

// Vier Karten, die alle vier Faelle abdecken: gematchtes Paar (J+TG), JUMiNGO allein,
// Transglobal allein UND gesperrt. Die Betraege sind bewusst so gewaehlt, dass die
// GUENSTIGSTE Karte die Transglobal-Karte mit dem Einkaufspreis ist — nur dann laesst
// sich messen, ob die Sortierung den angezeigten Wert nimmt.
const karten = (mitDebug) => {
  const d = (block) => (mitDebug ? { debug: block } : {});
  return [
    grund({ id: 501, shipper_tariff_id: 3309, offerId: "o-j-match",
            publicCarrierId: "ups", publicCarrierName: "UPS", publicServiceName: "Expressversand",
            ...preis(26),
            ...d({ provider: "jumingo", priceBasis: "customer_price",
                   matchedAcrossProviders: true, matchGroup: "m1" }) }),
    grund({ offerId: "o-t-match", bookable: false, unavailableReason: "quote_only",
            publicCarrierId: "ups", publicCarrierName: "UPS", publicServiceName: "Expressversand",
            ...preis(10),
            ...d({ provider: "transglobal", priceBasis: "provider_net",
                   matchedAcrossProviders: true, matchGroup: "m1" }) }),
    grund({ id: 502, shipper_tariff_id: 4001, offerId: "o-j-solo",
            publicCarrierId: "dpd", publicCarrierName: "DPD", publicServiceName: "Standardversand",
            ...preis(19),
            ...d({ provider: "jumingo", priceBasis: "customer_price",
                   matchedAcrossProviders: false, matchGroup: null }) }),
    grund({ offerId: "o-t-solo", bookable: false, unavailableReason: "quote_only",
            publicCarrierId: "gls", publicCarrierName: "GLS", publicServiceName: "Standardversand",
            ...preis(30),
            ...d({ provider: "transglobal", priceBasis: "provider_net",
                   matchedAcrossProviders: false, matchGroup: null }) }),
  ];
};

const ABSENDER = { zip: "97421", city: "Schweinfurt", street: "Musterweg 1" };
let server, browser;

function setupRoutes(page, mitDebug) {
  return page.route("**/api.confidaraexpress.de/**", async (route) => {
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
    if (p.includes("/api/shipping/launch-scope")) return json({ countries: ["DE"], partialCountries: [] });
    if (p.includes("/api/jumingo/calculate-price")) {
      return json({
        shipmentId: "s_e2e", ceShipmentId: 4711, tariffs: karten(mitDebug),
        availableShippingModes: ["express", "standard"],
        publicCarriers: [{ id: "ups", name: "UPS" }, { id: "dpd", name: "DPD" }, { id: "gls", name: "GLS" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    }
    return json({});
  });
}

async function angebote(page, mitDebug, viewport = { width: 1440, height: 1200 }) {
  await page.setViewportSize(viewport);
  await setupRoutes(page, mitDebug);
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { absender: { ...STANDARD_ABSENDER, ...ABSENDER } });
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

// Die tatsaechlich GERECHNETE Flaechenfarbe der Tonebene — nicht die Klasse.
const tonFarbe = (page, n) => page.locator(".offer-card").nth(n)
  .evaluate((el) => getComputedStyle(el, "::before").backgroundColor);

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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`, das seinerseits
    // node startet. Ein Signal an den npx-Prozess liesse den Enkel auf seinem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("1 — OHNE Debugblock ist die Liste die heutige: keine Klasse, keine Kennzeichnung, keine Tonflaeche", async () => {
  const page = await browser.newPage();
  await angebote(page, false);
  assert.equal(await page.locator(".offer-card").count(), 4);
  assert.equal(await page.locator(".offer-card--debug").count(), 0, "eine Karte traegt die Debugklasse");
  assert.equal(await page.locator(".offer-debug-tag").count(), 0, "eine Kennzeichnung ist sichtbar");
  // Die Tonebene existiert nicht — `::before` traegt keine Flaeche.
  const farbe = await tonFarbe(page, 0);
  assert.match(farbe, /rgba\(0, 0, 0, 0\)|transparent/, `unerwartete Tonflaeche ohne Debugblock: ${farbe}`);
  // Und die Providernamen stehen nirgends im sichtbaren Text.
  const text = await page.locator(".offers-list, .offer-card").first().innerText();
  for (const wort of ["Transglobal", "JUMiNGO", "Einkauf"]) {
    assert.ok(!text.includes(wort), `"${wort}" steht ohne Debugblock in der Oberflaeche`);
  }
  await page.close();
});

test("2 — MIT Debugblock traegt jede Karte genau EINEN Ton, und die drei Toene sind verschieden", async () => {
  const page = await browser.newPage();
  await angebote(page, true);
  assert.equal(await page.locator(".offer-card--debug").count(), 4, "nicht jede Karte ist eingefaerbt");

  // Genau eine Tonklasse je Karte.
  const klassen = await page.locator(".offer-card").evaluateAll((els) => els.map((el) =>
    [...el.classList].filter((c) => /^offer-card--debug-/.test(c))));
  for (const k of klassen) assert.equal(k.length, 1, `Karte mit ${k.length} Tonklassen: ${k}`);
  assert.deepEqual(klassen.map((k) => k[0]), [
    "offer-card--debug-match",        // JUMiNGO, gematcht  → gruen
    "offer-card--debug-match",        // Transglobal, gematcht → gruen
    "offer-card--debug-jumingo",      // JUMiNGO allein     → blau
    "offer-card--debug-transglobal",  // Transglobal allein → orange
  ]);

  const [gruen, , blau, orange] = await Promise.all([0, 1, 2, 3].map((n) => tonFarbe(page, n)));
  const alle = [gruen, blau, orange];
  for (const f of alle) assert.ok(/^rgba?\(/.test(f) && !/, 0\)$/.test(f), `Ton ohne Flaeche: ${f}`);
  assert.equal(new Set(alle).size, 3, `die drei Toene sind nicht unterscheidbar: ${alle.join(" | ")}`);
  // Beide Karten des Paares tragen exakt dieselbe Flaeche.
  assert.equal(await tonFarbe(page, 0), await tonFarbe(page, 1), "das Paar ist nicht gleich eingefaerbt");
  await page.close();
});

test("3 — Farbe ist nie die einzige Aussage: jede Karte nennt ihre Quelle im Text", async () => {
  const page = await browser.newPage();
  await angebote(page, true);
  const texte = await page.locator(".offer-debug-tag").allInnerTexts();
  assert.equal(texte.length, 4);
  assert.deepEqual(texte.map((t) => t.trim()), [
    "JUMiNGO · gleich m1",
    "Transglobal · Einkauf · gleich m1",
    "JUMiNGO",
    "Transglobal · Einkauf",
  ]);
  // Der Farbpunkt steht zusaetzlich zum Text und ist fuer Screenreader unsichtbar.
  assert.equal(await page.locator(".offer-debug-tag .offer-debug-dot").count(), 4);
  assert.equal(await page.locator(".offer-debug-dot[aria-hidden='true']").count(), 4);
  await page.close();
});

test("4 — BEIDE Karten des Paares bleiben stehen, mit ihrem jeweils eigenen Preis", async () => {
  const page = await browser.newPage();
  await angebote(page, true);
  // Keine Deduplizierung: vier Karten rein, vier Karten raus.
  assert.equal(await page.locator(".offer-card").count(), 4);
  const gruene = page.locator(".offer-card--debug-match");
  assert.equal(await gruene.count(), 2, "das Paar wurde zusammengefasst");
  const preise = await gruene.locator(".offer-price-value, .offer-price-main").allInnerTexts()
    .catch(() => []);
  const text = (await gruene.allInnerTexts()).join(" ");
  assert.ok(/26[,.]00/.test(text), `der JUMiNGO-Preis 26,00 fehlt (${preise.join("|")})`);
  assert.ok(/10[,.]00/.test(text), `der Transglobal-Einkaufspreis 10,00 fehlt (${preise.join("|")})`);
  await page.close();
});

test("5 — Sortierung UND Empfehlung nehmen den ANGEZEIGTEN Betrag", async () => {
  const page = await browser.newPage();
  await angebote(page, true);

  // (a) Sortierung „Guenstigste" ueber den vorhandenen Umschalter. Angezeigt werden
  //     26 · 10 · 19 · 30; der Transglobal-EINKAUFSpreis 10,00 ist der niedrigste.
  //     Steht er nach dem Sortieren vorn, hat die Sortierung genau den Wert genommen,
  //     den die Karte zeigt — und nicht den Kundenpreis, aus dem er entstanden ist.
  await page.locator(".offers-sort-btn", { hasText: "Günstigste" }).first().click();
  await page.waitForFunction(
    () => /10[,.]00/.test(document.querySelector(".offer-card")?.innerText || ""),
    null, { timeout: 10000 });
  const reihenfolge = await page.locator(".offer-card").evaluateAll((els) => els.map((el) => {
    const m = el.innerText.match(/(\d+)[,.](\d{2})\s*€/);
    return m ? Number(`${m[1]}.${m[2]}`) : null;
  }));
  assert.deepEqual(reihenfolge, [...reihenfolge].sort((a, b) => a - b),
    `nicht aufsteigend nach dem angezeigten Betrag sortiert: ${reihenfolge.join(" · ")}`);
  assert.equal(reihenfolge[0], 10, "der niedrigste ANGEZEIGTE Betrag steht nicht vorn");

  // (b) Die Auszeichnung „Guenstigste" folgt derselben Regel wie bisher: sie wird nur
  //     unter BUCHBAREN Angeboten vergeben. Das gesperrte Transglobal-Angebot zeigt zwar
  //     den niedrigsten Betrag, darf ihn aber nicht als Bestpreis behaupten — sonst
  //     traege die guenstigste Karte eine Auszeichnung, die niemand einloesen kann.
  const guenstigste = page.locator(".offer-card", { has: page.locator("text=Günstigste") });
  assert.equal(await guenstigste.count(), 1, "keine oder mehrere Guenstigste-Auszeichnungen");
  assert.equal(await guenstigste.evaluate((el) => el.classList.contains("offer-card--unavailable")), false,
    "ein gesperrtes Angebot traegt die Guenstigste-Auszeichnung");
  //     Unter den buchbaren sind es 26 und 19 — die Auszeichnung gehoert an die 19er-Karte.
  assert.match(await guenstigste.innerText(), /19[,.]00/,
    "die Auszeichnung sitzt nicht auf dem guenstigsten BUCHBAREN Angebot");
  await page.close();
});

test("6 — Auswahl und Sperre bleiben unter der Toenung sichtbar", async () => {
  const page = await browser.newPage();
  await angebote(page, true);
  // Ein Transglobal-Angebot ist unbuchbar und traegt weiterhin seinen Zustand.
  const gesperrt = page.locator(".offer-card--unavailable");
  assert.equal(await gesperrt.count(), 2, "die gesperrten Angebote sind nicht mehr als solche erkennbar");
  assert.ok(await gesperrt.first().evaluate((el) => el.classList.contains("offer-card--debug")),
    "die gesperrte Karte traegt keinen Ton");

  // Eine buchbare JUMiNGO-Karte laesst sich weiterhin auswaehlen — die Tonebene faengt
  // den Klick nicht ab (`pointer-events: none`).
  const buchbar = page.locator(".offer-card:not(.offer-card--unavailable)").first();
  await buchbar.click();
  await page.waitForSelector(".offer-card--selected", { timeout: 10000 });
  const sel = page.locator(".offer-card--selected");
  assert.equal(await sel.count(), 1);
  assert.ok(await sel.evaluate((el) => el.classList.contains("offer-card--debug")),
    "die ausgewaehlte Karte hat ihren Ton verloren");
  // Der Auswahlzustand bleibt an seiner Rahmenfarbe erkennbar — der Ton uebermalt ihn nicht.
  const rahmen = await sel.evaluate((el) => getComputedStyle(el).borderColor);
  const rahmenAndere = await page.locator(".offer-card:not(.offer-card--selected)").first()
    .evaluate((el) => getComputedStyle(el).borderColor);
  assert.notEqual(rahmen, rahmenAndere, "ausgewaehlt und nicht ausgewaehlt sehen gleich aus");
  await page.close();
});

test("7 — vier Breiten: nichts laeuft ueber, nichts wird abgeschnitten", async () => {
  const breiten = [
    { name: "Desktop", width: 1440, height: 1000 },
    { name: "Laptop",  width: 1280, height: 800 },
    { name: "Tablet",  width: 834,  height: 1112 },
    { name: "Mobil",   width: 390,  height: 844 },
  ];
  for (const b of breiten) {
    const page = await browser.newPage();
    await angebote(page, true, { width: b.width, height: b.height });
    assert.equal(await page.locator(".offer-card--debug").count(), 4, `${b.name}: Toenung fehlt`);
    assert.equal(await page.locator(".offer-debug-tag").count(), 4, `${b.name}: Kennzeichnung fehlt`);

    // Kein waagerechter Ueberlauf der Seite.
    const ueberlauf = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(ueberlauf <= 1, `${b.name}: die Seite scrollt waagerecht (${ueberlauf}px)`);

    // Die Kennzeichnung bleibt vollstaendig INNERHALB ihrer Karte.
    const raus = await page.locator(".offer-debug-tag").evaluateAll((tags) => tags.filter((t) => {
      const karte = t.closest(".offer-card");
      const a = t.getBoundingClientRect(), k = karte.getBoundingClientRect();
      return a.right > k.right + 1 || a.left < k.left - 1 || a.width === 0 || a.height === 0;
    }).length);
    assert.equal(raus, 0, `${b.name}: eine Kennzeichnung ragt aus ihrer Karte`);

    // Und die Tonflaeche deckt die Karte vollstaendig ab (inset: 0).
    const luecke = await page.locator(".offer-card").first().evaluate((el) => {
      const k = el.getBoundingClientRect();
      const v = getComputedStyle(el, "::before");
      return { hat: v.backgroundColor, breite: k.width };
    });
    assert.ok(luecke.breite > 0 && /^rgba?\(/.test(luecke.hat), `${b.name}: keine Tonflaeche`);
    await page.close();
  }
});
