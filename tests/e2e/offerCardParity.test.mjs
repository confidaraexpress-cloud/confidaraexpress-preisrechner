// E2E: sieht eine nicht bestellbare Tarifkarte aus wie eine minderwertige?
//
// Gemessen wird am echten Dev-Server mit gemocktem Backend — KEINE Bestellung, KEIN
// Providercall. Der Vergleich ist der Kern dieser Datei: dieselbe Seite trägt ein
// vollständiges JUMiNGO-Angebot und zwei Transglobal-Angebote nebeneinander, und die
// Karten werden GEGENEINANDER gemessen, nicht gegen einen festen Wunschwert.
//
// Screenshots landen unter tests/e2e/screenshots/ — sie sind Beleg, nicht Prüfmittel:
// jede Zusicherung unten ist eine gemessene Zahl, kein Bildvergleich.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import { chromium } from "playwright";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular } from "./helpers/newShipmentForm.mjs";

const PORT = 5272, BASE = `http://127.0.0.1:${PORT}`;
const SHOTS = path.join(process.cwd(), "tests", "e2e", "screenshots");

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

// Ein vollständiges JUMiNGO-Angebot: Kalenderdaten, Abholfenster, Tracking, Drucker.
const JUMINGO = {
  id: 1, shipper_tariff_id: 1, offerId: "d".repeat(32),
  publicCarrierId: "dhl", publicCarrierName: "DHL", publicServiceName: "DHL Paket",
  serviceType: "pickup", currency: "EUR",
  netPrice: 12.0, vatAmount: 2.28, finalPrice: 14.28,
  transitDaysMin: 1, transitDaysMax: 2, trackingAvailable: true, printerRequired: false,
  availableForDate: true, bookable: true, requiredPriceInputs: [],
  pickupDate: "2026-09-10T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-09-11T00:00:00Z",
};

// Zwei Transglobal-Angebote, wie sie heute wirklich ankommen: KEINE Kalenderdaten,
// kein Trackingflag, keine Druckerangabe, nicht bestellbar (Gate aus).
const TG_PICKUP = {
  offerId: "b".repeat(32), publicCarrierId: "ups", publicServiceName: "UPS Express Saver",
  serviceType: "pickup", currency: "EUR",
  netPrice: 18.5, vatAmount: 3.52, finalPrice: 22.02,
  transitDaysMin: 1, transitDaysMax: 1,
  bookable: false, unavailableReason: "quote_only",
  requiredPriceInputs: ["deliveryIsResidential", "collectionIsResidential"],
};
const TG_DROPOFF = {
  offerId: "a".repeat(32), publicCarrierId: "dpd", publicServiceName: "DPD PaketShop",
  serviceType: "dropoff", currency: "EUR",
  netPrice: 9.4, vatAmount: 1.79, finalPrice: 11.19,
  transitDaysMin: 1, transitDaysMax: 2,
  bookable: false, unavailableReason: "quote_only",
  requiredPriceInputs: ["deliveryIsResidential"],
};
// Nach oben offene Laufzeit — die Aussage steht im Providertext, keine Obergrenze.
const TG_OFFEN = {
  ...TG_DROPOFF, offerId: "c".repeat(32), publicCarrierId: "gls",
  publicServiceName: "GLS Pick&Ship", transitDaysMax: null, deliveryTime: "ab 1 Tag",
};

let server, browser;

async function setupRoutes(page) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    // Es gibt in dieser Suite keinen Buchungspfad — sie schaut nur auf Karten.
    if (p.endsWith("/api/jumingo/book")) return route.fulfill({ status: 500, body: "{}" });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      // EINE Liste fuer beide Einkaufsquellen — genau so liefert der Server sie
      // (routes/jumingo.js: `tariffs: [...publicTariffs, ...publicTransglobalOffers]`).
      // Das ist die gemeinsame Kartenarchitektur bereits im Vertrag: das Frontend
      // bekommt gar keine Gelegenheit, nach Provider zu trennen.
      ceShipmentId: 4711, tariffs: [JUMINGO, TG_PICKUP, TG_DROPOFF, TG_OFFEN],
      availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL" }, { id: "ups", name: "UPS" },
                       { id: "dpd", name: "DPD" }, { id: "gls", name: "GLS" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function zuDenAngeboten(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
}

/** Die gemessenen Eigenschaften EINER Karte — alles, woran „Wertigkeit" hängt. */
const karteMessen = (page, sel) => page.locator(sel).evaluate((el) => {
  const g = (n) => (n ? getComputedStyle(n) : null);
  const karte = g(el);
  const preis = g(el.querySelector(".offer-price"));
  const logo = g(el.querySelector(".offer-logo-tile img"));
  const r = el.getBoundingClientRect();
  return {
    opacity: karte.opacity,
    background: karte.backgroundColor,
    breite: Math.round(r.width), hoehe: Math.round(r.height),
    rechts: Math.round(r.right),
    preisGroesse: preis ? preis.fontSize : null,
    preisFarbe: preis ? preis.color : null,
    logoFilter: logo ? logo.filter : null,
    hatTimeline: !!el.querySelector(".offer-timeline"),
    hatHandover: !!el.querySelector(".offer-handover"),
    hatPreis: !!el.querySelector(".offer-price"),
    hatLogoKachel: !!el.querySelector(".offer-logo-tile"),
    hatLogoBild: !!el.querySelector(".offer-logo-tile img"),
    ctaGesperrt: el.querySelector(".offer-cta-btn")?.disabled === true,
    text: el.innerText,
  };
});

test.before(async () => {
  mkdirSync(SHOTS, { recursive: true });
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { ...DEV_SERVER_SPAWN, stdio: "ignore" });
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
    stopDevServer(server, "SIGKILL");
  }
});

/* ══════════ 1 — GLEICHE WERTIGKEIT, GEMESSEN ══════════ */

test("1 — die TG-Karte ist nicht blasser, nicht grauer und nicht kleiner als die JUMiNGO-Karte", async () => {
  for (const breite of [1440, 834, 390]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 1400 } });
    await setupRoutes(page);
    await zuDenAngeboten(page);

    const j = await karteMessen(page, ".offer-card >> nth=0");
    const anzahl = await page.locator(".offer-card").count();
    assert.equal(anzahl, 4, `${breite}px: erwartet 4 Karten, gefunden ${anzahl}`);

    for (let i = 1; i < anzahl; i++) {
      const t = await karteMessen(page, `.offer-card >> nth=${i}`);
      assert.equal(t.opacity, j.opacity, `${breite}px Karte ${i}: Deckkraft ${t.opacity} statt ${j.opacity}`);
      assert.equal(t.background, j.background, `${breite}px Karte ${i}: andere Flaechenfarbe`);
      assert.equal(t.preisGroesse, j.preisGroesse, `${breite}px Karte ${i}: Preis ${t.preisGroesse} statt ${j.preisGroesse}`);
      assert.equal(t.preisFarbe, j.preisFarbe, `${breite}px Karte ${i}: Preis anders gefaerbt`);
      assert.ok(!t.logoFilter || t.logoFilter === "none",
        `${breite}px Karte ${i}: Carrierlogo gefiltert (${t.logoFilter})`);
      assert.equal(t.breite, j.breite, `${breite}px Karte ${i}: andere Breite`);
      // Gleiche Kartenhoehe. Ein sichtbar hoeherer Block neben gleichartigen Karten
      // liest sich als „hier stimmt etwas nicht" — auch wenn jede einzelne Zeile
      // korrekt ist. Toleranz 2px fuer Rundung.
      assert.ok(Math.abs(t.hoehe - j.hoehe) <= 2,
        `${breite}px Karte ${i}: ${t.hoehe}px hoch gegenueber ${j.hoehe}px (JUMiNGO)`);
    }
    await page.close();
  }
});

test("2 — jede Karte traegt Uebergabeart, Timeline und Preis", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  const n = await page.locator(".offer-card").count();
  for (let i = 0; i < n; i++) {
    const k = await karteMessen(page, `.offer-card >> nth=${i}`);
    assert.ok(k.hatHandover, `Karte ${i}: keine Uebergabeart`);
    assert.ok(k.hatTimeline, `Karte ${i}: keine Timeline`);
    assert.ok(k.hatPreis, `Karte ${i}: kein Preis`);
    // Der echte Kundenbereich behält seine Carrier-Logos (P2, 2026-11-04: nur die Demo zeigt keine).
    assert.ok(k.hatLogoKachel && k.hatLogoBild, `Karte ${i}: Logokachel mit Carrier-Logo fehlt im Kundenbereich`);
  }
  await page.close();
});

/* ══════════ 2 — EHRLICHER INHALT ══════════ */

test("3 — TG zeigt Laufzeit statt eines erfundenen Zustelldatums", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);

  const j = await karteMessen(page, ".offer-card >> nth=0");
  // TG22 Golden Offer Contract: ein Angebot mit Anbieterdaten heißt „Zustellung" — mit Datum, wie
  // im ausgewählten Angebot und in beiden Buchungsleisten (utils/deliveryContractView.mjs).
  assert.match(j.text, /Zustellung\s+(Mo|Di|Mi|Do|Fr|Sa|So)\.,\s*\d{2}\.\d{2}\./, "die JUMiNGO-Karte nennt kein Zustelldatum mehr");
  assert.doesNotMatch(j.text, /\bLieferung\b/, "die Karte benennt die Zustellung wieder anders als die Buchung");

  // Die drei TG-Karten: Laufzeit benannt als Laufzeit, in den drei Formen.
  const tgTexte = [];
  for (let i = 1; i < 4; i++) tgTexte.push((await karteMessen(page, `.offer-card >> nth=${i}`)).text);
  const alle = tgTexte.join("\n");
  assert.match(alle, /Voraussichtliche Laufzeit/, "die Laufzeit wird nicht als solche benannt");
  assert.match(alle, /1 Tag/);
  assert.match(alle, /1–2 Tage/);
  assert.match(alle, /ab 1 Tag/, "die nach oben offene Laufzeit fehlt");

  // Und KEIN Kalenderdatum auf einer Karte ohne Kalenderdaten.
  for (const t of tgTexte) {
    assert.ok(!/\d{2}\.\d{2}\.\d{4}/.test(t), `erfundenes Datum auf einer TG-Karte: ${t.slice(0, 120)}`);
    assert.ok(!/\b(Mo|Di|Mi|Do|Fr|Sa|So)\.,/.test(t), `erfundener Wochentag: ${t.slice(0, 120)}`);
    assert.ok(!/\bZustellung\b/.test(t), `eine Laufzeit ist als Zustellung benannt: ${t.slice(0, 120)}`);
  }
  await page.close();
});

test("4 — Abholung und Paketshopabgabe stehen prominent und unterscheidbar", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  const texte = [];
  for (let i = 0; i < 4; i++) texte.push((await karteMessen(page, `.offer-card >> nth=${i}`)).text);
  assert.match(texte.join("\n"), /Abholung an Ihrer Adresse/);
  assert.match(texte.join("\n"), /Paketshop/);
  await page.close();
});

test("5 — der gesperrte Knopf ist die EINZIGE Einschraenkung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  const j = await karteMessen(page, ".offer-card >> nth=0");
  assert.equal(j.ctaGesperrt, false, "das buchbare Angebot hat einen gesperrten Knopf");
  for (let i = 1; i < 4; i++) {
    const t = await karteMessen(page, `.offer-card >> nth=${i}`);
    assert.equal(t.ctaGesperrt, true, `Karte ${i}: der Knopf ist nicht gesperrt`);
    assert.match(t.text, /nicht direkt buchbar/i, `Karte ${i}: der Grund fehlt`);
  }
  await page.close();
});

/* ══════════ 3 — WHITE LABEL UND RESPONSIVE ══════════ */

test("6 — kein Providername und keine interne Referenz sichtbar", async () => {
  for (const breite of [1440, 834, 390]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 1400 } });
    await setupRoutes(page);
    await zuDenAngeboten(page);
    // Details ALLER Karten aufklappen — auch dort darf kein Providerbezug stehen.
    //
    // Aufgeklappt wird per DOM-Klick, nicht ueber Playwrights Actionability: das
    // Ausklappen der ersten Karte verschiebt die darunterliegenden, und der Test
    // wartet sonst auf eine Stabilitaet, die waehrend der Animation nicht eintritt.
    // Geprueft wird hier der TEXT — ob die Auslöser bedienbar sind, misst Test 5.
    await page.evaluate(() =>
      document.querySelectorAll(".offer-details-link").forEach((b) => b.click()));
    await page.waitForTimeout(600);
    const sichtbar = (await page.locator("body").innerText()).toLowerCase();
    for (const w of ["transglobal", "jumingo", "quoteid", "providerserviceid"]) {
      assert.ok(!sichtbar.includes(w), `${breite}px: "${w}" ist sichtbar`);
    }
    await page.close();
  }
});

test("7 — kein horizontaler Ueberlauf auf 1440, 834 und 390", async () => {
  for (const breite of [1440, 834, 390]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 1400 } });
    await setupRoutes(page);
    await zuDenAngeboten(page);
    const scrollt = await page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(scrollt, false, `${breite}px: die Seite scrollt horizontal`);
    for (let i = 0; i < 4; i++) {
      const k = await karteMessen(page, `.offer-card >> nth=${i}`);
      assert.ok(k.rechts <= breite + 1, `${breite}px Karte ${i}: ragt bis ${k.rechts} heraus`);
    }
    await page.close();
  }
});

/* ══════════ 3b — ZEITLEISTE ALS RASTER (Betreiberentscheidung 2026-11-04, P1) ══════════
   Titel, Datum und Zusatz beider Knoten stehen auf gemeinsamen Zeilen: Start- und Zieldatum auf einer Höhe, auch wenn
   ein Titel umbricht; Textkante = Punktkante links und rechts; jede Karte der Liste mit derselben Zeitleistenhöhe —
   JUMiNGO mit Kalenderdaten neben Transglobal mit Laufzeit, Abholung neben Shopabgabe. */
test("8b — Zeitleiste: Daten auf einer Höhe, Textkanten an den Punkten, gleiche Höhe in jeder Breite", async () => {
  for (const breite of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 1400 } });
    await setupRoutes(page);
    await zuDenAngeboten(page);
    const m = await page.evaluate(() => [...document.querySelectorAll(".offer-card")].map((k) => {
      k.style.contentVisibility = "visible";
      const r = (e) => e.getBoundingClientRect();
      const start = k.querySelector(".offer-tl-node--start"), ende = k.querySelector(".offer-tl-node--end");
      const ds = start.querySelector(".offer-tl-primary"), dz = ende.querySelector(".offer-tl-primary");
      const zeilen = (e) => Math.round(r(e).height / parseFloat(getComputedStyle(e).lineHeight));
      const zs = start.querySelector(".offer-tl-sub"), zz = ende.querySelector(".offer-tl-sub, .offer-early-note");
      return {
        datum: ds && dz ? Math.abs(r(ds).top - r(dz).top) : 0,
        zusatz: zs && zz ? Math.abs(r(zs).top - r(zz).top) : 0,
        links: Math.abs(Math.min(...[...start.children].map((c) => r(c).left)) - r(k.querySelector(".offer-tl-dot--start")).left),
        rechts: Math.abs(Math.max(...[...ende.children].map((c) => r(c).right)) - r(k.querySelector(".offer-tl-dot--end")).right),
        hoehe: r(k.querySelector(".offer-tl-labels")).height,
        titel: [zeilen(start.querySelector(".offer-tl-title")), zeilen(ende.querySelector(".offer-tl-title"))],
        breite: r(k).width,
      };
    }));
    assert.ok(m.length >= 4, `${breite}px: ${m.length} Karten`);
    m.forEach((k, i) => {
      assert.ok(k.datum <= 1, `${breite}px Karte ${i}: Start- und Zieldatum ${k.datum.toFixed(1)} px versetzt`);
      assert.ok(k.zusatz <= 1, `${breite}px Karte ${i}: die Zusatzzeilen stehen ${k.zusatz.toFixed(1)} px versetzt`);
      assert.ok(k.links <= 1, `${breite}px Karte ${i}: Textkante ${k.links.toFixed(1)} px neben dem Startpunkt`);
      assert.ok(k.rechts <= 1, `${breite}px Karte ${i}: Textkante ${k.rechts.toFixed(1)} px neben dem Zielpunkt`);
      if (k.breite >= 950) assert.deepEqual(k.titel, [1, 1], `${breite}px Karte ${i}: ein Titel bricht in der breiten Karte um`);
    });
    const hoehen = m.map((k) => k.hoehe);
    assert.ok(Math.max(...hoehen) - Math.min(...hoehen) <= 1,
      `${breite}px: ungleiche Zeitleisten (${hoehen.map((h) => h.toFixed(1)).join(" / ")} px)`);
    await page.close();
  }
});

/* ══════════ 3c — ZEITLEISTE IN DER KARTENMITTE (Betreiberentscheidung 2026-11-04) ══════════
   Übergabeart, Punkte, Linie und Beschriftung stehen als eine Einheit in der horizontalen Kartenmitte — breit
   (Identität · Ablauf · Preis), zweizeilig und gestapelt. Bis dahin bekam in der breiten Karte allein die Identität
   den Überschuss, und der Ablauf stand bis 131 px rechts der Mitte (1222 px Kartenbreite); gestapelt stand die
   Übergabeart linksbündig. Preis und Aktion bleiben 235 px breit am rechten Rand, der Ablauf 400 px breit. */
test("8c — Zeitleiste in der Kartenmitte, Preis und Aktion am rechten Rand", async () => {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1400 } });
  await setupRoutes(page);
  await zuDenAngeboten(page);
  for (const breite of [1920, 1440, 1366, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width: breite, height: 1400 });
    await page.evaluate(() => new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok))));
    const m = await page.evaluate(() => [...document.querySelectorAll(".offer-card")].map((k) => {
      k.style.contentVisibility = "visible";
      const r = (e) => e.getBoundingClientRect();
      // Die Übergabeart ist ein Block über die ganze Zone — gemessen wird ihr Text.
      const text = (e) => { const g = document.createRange(); g.selectNodeContents(e); return g.getBoundingClientRect(); };
      const kr = r(k), mitte = (kr.left + kr.right) / 2;
      const ps = r(k.querySelector(".offer-tl-dot--start")), pz = r(k.querySelector(".offer-tl-dot--end"));
      const ho = k.querySelector(".offer-handover"), hb = ho ? text(ho) : null;
      const teile = [ps, pz, ...[...k.querySelectorAll(".offer-tl-node > *")].map(r), ...(hb ? [hb] : [])];
      const links = Math.min(...teile.map((b) => b.left)), rechts = Math.max(...teile.map((b) => b.right));
      const cs = getComputedStyle(k);
      const innenRechts = kr.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
      const z1 = r(k.querySelector(".offer-zone-1")), z2 = r(k.querySelector(".offer-zone-2")), z3 = r(k.querySelector(".offer-zone-3"));
      return {
        breite: kr.width,
        einheit: (links + rechts) / 2 - mitte,
        achse: (ps.left + pz.right) / 2 - mitte,
        titel: hb ? (hb.left + hb.right) / 2 - mitte : 0,
        preisRand: innenRechts - z3.right,
        zone3: z3.width,
        ablauf: r(k.querySelector(".offer-timeline")).width,
        luecken: [z2.left - z1.right, z3.left - z2.right],
      };
    }));
    assert.ok(m.length >= 4, `${breite}px: ${m.length} Karten`);
    m.forEach((k, i) => {
      assert.ok(Math.abs(k.einheit) <= 1, `${breite}px Karte ${i}: die Zeitleiste steht ${k.einheit.toFixed(1)} px neben der Kartenmitte`);
      assert.ok(Math.abs(k.achse) <= 1, `${breite}px Karte ${i}: Punkte und Linie ${k.achse.toFixed(1)} px neben der Kartenmitte`);
      assert.ok(Math.abs(k.titel) <= 1, `${breite}px Karte ${i}: die Übergabeart steht ${k.titel.toFixed(1)} px neben der Kartenmitte`);
      assert.ok(Math.abs(k.preisRand) <= 1, `${breite}px Karte ${i}: Preis und Aktion ${k.preisRand.toFixed(1)} px vor dem rechten Rand`);
      if (k.breite >= 950) {
        assert.ok(Math.abs(k.zone3 - 235) <= 0.5, `${breite}px Karte ${i}: Preis und Aktion ${k.zone3.toFixed(1)} px statt 235 px breit`);
        assert.ok(Math.abs(k.ablauf - 400) <= 0.5, `${breite}px Karte ${i}: der Ablauf ist ${k.ablauf.toFixed(1)} px statt 400 px breit`);
        assert.ok(k.luecken.every((l) => l >= 23.5), `${breite}px Karte ${i}: zu wenig Abstand zwischen den Zonen (${k.luecken.map((l) => l.toFixed(1)).join(" / ")} px)`);
      }
    });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), false,
      `${breite}px: die Seite scrollt horizontal`);
  }
  await page.close();
});

/* ══════════ 4 — BELEGBILDER ══════════ */

test("8 — Screenshots aller drei Breiten ablegen", async () => {
  for (const [breite, name] of [[1440, "desktop"], [834, "tablet"], [390, "mobile"]]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 1400 } });
    await setupRoutes(page);
    await zuDenAngeboten(page);
    await page.waitForTimeout(400);
    const ziel = path.join(SHOTS, `offer-cards-${name}-${breite}.png`);
    await page.locator(".offers-list, .offers-results").first()
      .screenshot({ path: ziel }).catch(async () => { await page.screenshot({ path: ziel, fullPage: true }); });
    assert.ok(existsSync(ziel), `Screenshot fehlt: ${ziel}`);
    await page.close();
  }
});
