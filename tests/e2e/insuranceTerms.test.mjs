// E2E: Versicherungsbereich der BookingPage — echter Dev-Server, echter Browser.
//
// Geprüft wird, was eine Quelltextprüfung nicht erreichen kann: was tatsächlich
// auf dem Bildschirm steht, welche Attribute im DOM landen, ob ein Klick auf
// „Versicherungsdetails“ die Versicherungsauswahl umschaltet (das darf er NICHT),
// wann der Warenwert-Fehler erscheint, und ob der Bedingungslink des Tarifs eine
// Rückkehr auf die Buchungsseite übersteht.
//
// Zwei Tarife mit UNTERSCHIEDLICHEM carrierLinks.agb belegen, dass der Link aus
// dem konkreten Tarif kommt und nicht aus einer Carriername-Tabelle.
//
// Außerdem White Label: der interne Upstream-/Fulfillment-Anbieter darf im
// gerenderten DOM weder im Text noch in einem href auftauchen. Ein externer Link
// auf den VERSANDDIENSTLEISTER ist ausdrücklich erlaubt — verboten ist nur die
// Zwischenplattform.
//
// Es wird KEINE externe Seite geladen: geprüft werden ausschließlich href/target/
// rel. Alle API-Aufrufe sind gemockt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5251, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

// Synthetische Bedingungs-URLs: .example ist reserviert und wird nie aufgerufen.
const AGB_A = "https://bedingungen-a.example/de/agb.pdf?v=2";
const AGB_B = "https://bedingungen-b.example/terms";

const INSURANCE_DETAILS = {
  isInsurable: true,
  extraInsurancePriceBruttoPreselect: 3.99,
  extraInsurancePremiumPriceBruttoPreselect: 7.49,
};

const basisTarif = (over) => ({
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
  publicServiceName: "Standardversand", serviceType: "pickup", currency: "EUR",
  netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
  insuranceAvailable: true, insuranceDetails: INSURANCE_DETAILS,
  ...over,
});

// Tarif 1: eigener Bedingungslink. Tarif 2: anderer Carrier, ANDERER Link.
// Tarif 3: gar kein Link (der fail-closed-Fall).
const TARIFF_MIT_LINK = basisTarif({ id: 1, shipper_tariff_id: 1, carrierLinks: { agb: AGB_A, tracking: null, transitTime: null } });
const TARIFF_ANDERER  = basisTarif({
  id: 2, shipper_tariff_id: 2, publicCarrierId: "ups", publicCarrierName: "UPS",
  publicServiceName: "Express", netPrice: 24.0, vatAmount: 4.56, finalPrice: 28.56,
  carrierLinks: { agb: AGB_B, tracking: null, transitTime: null },
});
const TARIFF_OHNE_LINK = basisTarif({ id: 3, shipper_tariff_id: 3, carrierLinks: { agb: null, tracking: null, transitTime: null } });

const SEL = {
  cards:     ".ins-cards",
  card:      ".ins-card",
  details:   ".ins-card-details-btn",
  terms:     ".ins-card-terms-link",
  dialog:    ".insdlg",
  dlgClose:  ".insdlg-close",
  dlgMore:   ".insdlg-more-link",
  goods:     "#ins-goods",
};

let server, browser;

async function setupRoutes(page, tariffs) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) return json({
      shipmentId: "s1", tariffs, availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }, { id: "ups", name: "UPS" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
    });
    if (p.includes("/api/jumingo/reprice-insurance")) return json({
      selectedInsurance: "standard",
      totals: { netPrice: 22.64, vatAmount: 3.54, finalPrice: 26.18, insuranceGross: 3.99 },
    });
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

// Bis zum Versicherungsbereich. Er liegt auf SCHRITT 2 der Buchung
// („Verbindliche Bestellung"), nicht auf der Übersicht — deshalb wird nach der
// Angebotsauswahl noch einmal „Weiter" gedrückt. `angebot` wählt die n-te
// Angebotskarte.
async function zurBuchung(page, angebot = 0) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  const fill = async (ph, v) => page.getByPlaceholder(ph, { exact: true }).first().fill(String(v));
  for (const [ph, v] of [
    ["Max Mustermann", "Max Mustermann"], ["Musterstraße 1", "Hauptstrasse 1"], ["Stuttgart", "Berlin"],
    ["Firma AG", "Empfang AG"], ["Erika Muster", "Erika Empfaenger"], ["Beispielweg 5", "Bahnhofstrasse 9"],
  ]) await fill(ph, v);
  const emp = page.locator(".booking-addr-grid > div").nth(1).locator("input.field-input");
  await emp.nth(4).fill("80331");
  await emp.nth(5).fill("Muenchen");
  for (const [ph, v] of [["1", "2"], ["5", "5.5"], ["30", "40"], ["20", "30"], ["15", "20"]]) await fill(ph, v);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").nth(angebot).locator("button.offer-cta-btn").click();
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await zuSchritt2(page);
}

// Schritt 1 → 2. Idempotent: steht der Versicherungsbereich schon, passiert nichts.
async function zuSchritt2(page) {
  if (await page.locator(SEL.cards).count() > 0) return;
  await page.getByRole("button", { name: /^Weiter/ }).first().click();
  await page.waitForSelector(SEL.cards, { timeout: 20000 });
}

// Die Radios der Karten sind visuell versteckt (Projektmuster) — bedient wird
// über das umgebende Label, genau wie ein Mensch es tut.
async function waehle(page, name) {
  await karte(page, name).locator(".ins-card-name").click();
  await page.waitForTimeout(150);
}

// White Label am gerenderten DOM: weder im sichtbaren Text noch in irgendeinem
// href der Buchungsseite darf der interne Upstream-Anbieter auftauchen. Externe
// Links auf den VERSANDDIENSTLEISTER sind ausdrücklich erlaubt — verboten ist
// nur die Zwischenplattform.
async function pruefeWhiteLabel(page, wo) {
  const befund = await page.evaluate(() => ({
    text: document.body.innerText,
    hrefs: [...document.querySelectorAll("a[href]")].map(a => a.getAttribute("href")),
  }));
  for (const begriff of ["JUMiNGO", "JUMINGO", "Jumingo", "jumingo", "KRAVAG", "Kravag"]) {
    assert.ok(!befund.text.includes(begriff), `${wo}: „${begriff}" ist für den Kunden sichtbar`);
  }
  for (const href of befund.hrefs) {
    assert.ok(!/jumingo/i.test(href || ""), `${wo}: Link auf den Upstream-Anbieter (${href})`);
  }
}

const karte = (page, name) => page.locator(`${SEL.card}:has-text("${name}")`).first();
const gewaehlt = (page) => page.locator(".ins-card--selected .ins-card-name").innerText();

test.before(async () => {
  server = spawn("npm", ["run", "dev", "--", "--port", String(PORT), "--strictPort"], {
    cwd: process.cwd(), stdio: "ignore", detached: true,
  });
  const start = Date.now();
  while (Date.now() - start < 60000) {
    try { const r = await fetch(BASE); if (r.ok) break; } catch { /* noch nicht da */ }
    await new Promise(r => setTimeout(r, 400));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server?.pid) { try { process.kill(-server.pid, "SIGTERM"); } catch { /* schon beendet */ } }
});

/* ── 1. Standard ─────────────────────────────────────────────────────────── */

test("1 — Standard: Preis, neue Texte, keine 100-%-Aussage, neutraler Dialog", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);

  const modul = await page.locator(".booking-insurance-box").innerText();
  assert.ok(!/100\s*%/.test(modul), `„100 %“-Aussage noch sichtbar:\n${modul}`);
  assert.ok(!/gewichtsabhängig/.test(modul), "die statische Gewichtsaussage ist noch sichtbar");
  assert.match(modul, /Wählen Sie optional eine zusätzliche Transportversicherung/);

  const std = karte(page, "Standardversicherung");
  const stdText = await std.innerText();
  assert.match(stdText, /nach Maßgabe der Versicherungsbedingungen/);
  assert.match(stdText, /50,00 €\s*Selbstbeteiligung je Schadenfall/);
  assert.match(stdText, /ab\s*3,99\s*€/, `Preselect-Preis fehlt:\n${stdText}`);

  await waehle(page, "Standardversicherung");
  assert.match(await gewaehlt(page), /Standardversicherung/);

  // Detaildialog öffnen und Inhalt prüfen.
  await std.locator(SEL.details).click();
  await page.waitForSelector(SEL.dialog, { timeout: 5000 });
  const dlg = await page.locator(SEL.dialog).innerText();
  assert.match(dlg, /Transportversicherung/);
  assert.match(dlg, /optional eine zusätzliche Transportversicherung gewählt werden/);
  assert.match(dlg, /richtet sich nach den jeweils geltenden Versicherungsbedingungen/);
  assert.match(dlg, /50,00 €/);
  assert.match(dlg, /ausgeschlossen|Freigabe/);
  assert.ok(!/100\s*%/.test(dlg), "der Dialog behauptet eine 100-%-Deckung");

  await pruefeWhiteLabel(page, "Dialog (Standard)");
  await page.close();
});

/* ── 2. Premium ──────────────────────────────────────────────────────────── */

test("2 — Premium: Servicevorteile, kein besserer Schutz behauptet, Dialogabschnitt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);

  const prem = karte(page, "Premiumversicherung");
  const text = await prem.innerText();
  assert.match(text, /ERWEITERTER SERVICE/i, `Badge fehlt:\n${text}`);
  assert.ok(!/Erweiterter Schutz/i.test(text), "das Badge behauptet wieder besseren Schutz");
  assert.match(text, /[Gg]leiche zugrunde liegende Versicherungsbedingungen/);
  assert.match(text, /Keine Selbstbeteiligung für Sie/);
  assert.match(text, /Priorisierter Support/i);
  assert.match(text, /Wöchentliche Status-Updates/);
  assert.match(text, /ab\s*7,49\s*€/, `Premium-Preselect fehlt:\n${text}`);

  await waehle(page, "Premiumversicherung");
  assert.match(await gewaehlt(page), /Premiumversicherung/);

  await prem.locator(SEL.details).click();
  await page.waitForSelector(SEL.dialog, { timeout: 5000 });
  const abschnitt = await page.locator(".insdlg-sec--premium").innerText();
  assert.match(abschnitt, /Premiumversicherung/);
  assert.match(abschnitt, /[Gg]leiche zugrunde liegende Versicherungsbedingungen/);
  assert.match(abschnitt, /Selbstbeteiligung entfällt für Sie/);
  await pruefeWhiteLabel(page, "Dialog (Premium)");

  await page.close();
});

/* ── 3. Keine zusätzliche Transportversicherung ──────────────────────────── */

test("3 — dritte Option: korrekter Name, neutraler Haftungstext, kein CE-AGB-Link", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);

  const modul = page.locator(".booking-insurance-box");
  const text = await modul.innerText();
  assert.match(text, /Keine zusätzliche Transportversicherung/);
  assert.ok(!/Kein Versicherungsschutz/.test(text), "der alte Name ist noch sichtbar");
  assert.match(text, /Es gelten die Haftungs- und Beförderungsbedingungen des gewählten Versanddienstleisters\./);

  // Kein Link auf die CE-eigenen AGB. Sie laufen als RELATIVE Route (/agb,
  // /agb#paragraf-10) — die Carrier-URL des Tarifs ist absolut und darf hier
  // nicht mitgezählt werden, auch wenn sie zufällig „/agb" im Pfad trägt.
  const ceLinks = await modul.locator('a[href^="/agb"], a[href*="confidaraexpress.de/agb"], a[href*="paragraf-10"]').count();
  assert.equal(ceLinks, 0, "der Versicherungsbereich verlinkt noch die CE-AGB");

  // „none“ ist der Startzustand: keine Wertfelder, kein Fehler.
  assert.equal(await page.locator(SEL.goods).count(), 0, "ohne Zusatzversicherung darf kein Wertfeld erscheinen");
  assert.equal(await modul.locator(".field-error").count(), 0, "ohne Zusatzversicherung darf kein Wertfehler erscheinen");

  await pruefeWhiteLabel(page, "Buchungsseite (keine Zusatzversicherung)");
  await page.close();
});

/* ── 4./5. Carrierlink: vorhanden bzw. fehlend ───────────────────────────── */

test("4 — vorhandener carrierLinks.agb wird als sicherer externer Link gezeigt", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);

  const link = karte(page, "Keine zusätzliche Transportversicherung").locator(SEL.terms);
  assert.equal(await link.count(), 1, "der Bedingungslink des Tarifs fehlt");
  assert.match(await link.innerText(), /Haftungs- & Beförderungsbedingungen öffnen/);
  assert.equal(await link.getAttribute("href"), AGB_A, "der href stammt nicht aus dem Tarif");
  assert.equal(await link.getAttribute("target"), "_blank");
  assert.equal(await link.getAttribute("rel"), "noopener noreferrer");
  // Ein externer Link auf den Versanddienstleister ist erwünscht — die
  // White-Label-Regel trifft nur die Zwischenplattform.
  await pruefeWhiteLabel(page, "Buchungsseite (Carrierlink vorhanden)");

  await page.close();
});

test("5 — fehlender carrierLinks.agb erzeugt weder Link noch Pseudo-Link", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_OHNE_LINK]);
  await zurBuchung(page);

  const none = karte(page, "Keine zusätzliche Transportversicherung");
  assert.equal(await none.locator(SEL.terms).count(), 0, "es wird ein Link gezeigt, obwohl der Tarif keinen liefert");
  // Der neutrale Satz steht trotzdem da.
  assert.match(await none.innerText(), /Haftungs- und Beförderungsbedingungen des gewählten Versanddienstleisters/);
  // Kein Element, das wie ein Link aussieht, aber keiner ist.
  assert.equal(await page.locator(".ins-card-cond-link--static").count(), 0, "der inerte Pseudo-Link lebt noch");
  assert.equal(await page.locator(".booking-insurance-box a").count(), 0,
    "ohne Tariflink darf der Versicherungsbereich gar keinen Anker enthalten");

  await page.close();
});

test("6 — zwei Tarife, zwei verschiedene Links (kein Carriername-Mapping)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK, TARIFF_ANDERER]);

  await zurBuchung(page, 0);
  const ersterLink = await karte(page, "Keine zusätzliche Transportversicherung").locator(SEL.terms).getAttribute("href");
  assert.equal(ersterLink, AGB_A);

  // Zurück zu den Angeboten und den ZWEITEN Tarif wählen.
  await zurBuchung(page, 1);
  const zweiterLink = await karte(page, "Keine zusätzliche Transportversicherung").locator(SEL.terms).getAttribute("href");
  assert.equal(zweiterLink, AGB_B);
  assert.notEqual(ersterLink, zweiterLink, "beide Tarife zeigen denselben Link — das riecht nach fester Zuordnung");

  await page.close();
});

/* ── 7. Restore ──────────────────────────────────────────────────────────── */

test("7 — der Bedingungslink übersteht Reload und Wiederherstellung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);
  await waehle(page, "Standardversicherung");
  await page.locator(SEL.goods).fill("500");
  await page.waitForTimeout(700);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(".steps-bar", { timeout: 20000 });
  await zuSchritt2(page);

  // Auswahl und Werte sind wieder da …
  assert.match(await gewaehlt(page), /Standardversicherung/);
  assert.equal(await page.locator(SEL.goods).inputValue(), "500");
  // … und der Bedingungslink des Tarifs ebenso (er steckt im Tarifobjekt).
  const link = karte(page, "Keine zusätzliche Transportversicherung").locator(SEL.terms);
  assert.equal(await link.getAttribute("href"), AGB_A, "der Tariflink hat die Wiederherstellung nicht überlebt");

  await page.close();
});

/* ── 8. Warenwert-Fehlertiming ───────────────────────────────────────────── */

test("8 — der Warenwert-Fehler erscheint erst nach echter Interaktion", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);

  const modul = page.locator(".booking-insurance-box");
  // Standard wählen → das Feld erscheint, aber KEIN roter Fehler.
  await waehle(page, "Standardversicherung");
  assert.equal(await page.locator(SEL.goods).count(), 1, "das Warenwertfeld fehlt");
  assert.equal(await modul.locator(".field-error").count(), 0,
    "der Fehler erscheint schon beim Einblenden des Feldes");
  assert.equal(await page.locator(`${SEL.goods}.field-input-error`).count(), 0, "das Feld ist schon rot umrandet");

  // Feld betreten und leer wieder verlassen → jetzt IST es ein Befund.
  await page.locator(SEL.goods).click();
  await page.locator(".booking-insurance-box").click({ position: { x: 5, y: 5 } });
  await page.waitForTimeout(150);
  assert.match(await modul.locator(".field-error").first().innerText(), /Bitte geben Sie den Warenwert an\./);
  assert.equal(await page.locator(`${SEL.goods}.field-input-error`).count(), 1, "das Feld ist nicht als fehlerhaft markiert");

  // Gültiger Wert → der Fehler verschwindet wieder.
  await page.locator(SEL.goods).fill("500");
  await page.waitForTimeout(150);
  assert.equal(await modul.locator(".field-error").count(), 0, "der Fehler bleibt trotz gültigem Wert stehen");

  // Zurück auf „keine Zusatzversicherung“: keine Wertfehler mehr.
  await waehle(page, "Keine zusätzliche Transportversicherung");
  assert.equal(await modul.locator(".field-error").count(), 0, "ohne Zusatzversicherung erscheint ein Wertfehler");

  await page.close();
});

/* ── 9. Auswahl darf sich durch die Details nicht ändern ─────────────────── */

test("9 — „Versicherungsdetails“ öffnet nur den Dialog und ändert die Auswahl nicht", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);

  // Ausgangslage: „keine Zusatzversicherung“ (Standardzustand).
  assert.match(await gewaehlt(page), /Keine zusätzliche Transportversicherung/);

  // Klick auf „Versicherungsdetails“ IN der Premiumkarte.
  await karte(page, "Premiumversicherung").locator(SEL.details).click();
  await page.waitForSelector(SEL.dialog, { timeout: 5000 });
  assert.match(await gewaehlt(page), /Keine zusätzliche Transportversicherung/,
    "der Detailklick hat die Versicherungsoption umgeschaltet");

  await page.locator(SEL.dlgClose).click();
  await page.waitForTimeout(150);
  assert.match(await gewaehlt(page), /Keine zusätzliche Transportversicherung/, "das Schließen hat die Auswahl geändert");

  // Und der Klick auf den Bedingungslink darf sie ebenfalls nicht ändern
  // (nur der href zählt — die Seite selbst wird nie geladen).
  const link = karte(page, "Keine zusätzliche Transportversicherung").locator(SEL.terms);
  assert.equal(await link.getAttribute("target"), "_blank", "ohne _blank würde der Klick die Buchung verlassen");

  await page.close();
});

/* ── 10. Dialog-Barrierefreiheit ─────────────────────────────────────────── */

test("10 — Dialog: Tastaturbedienung, Fokusfalle, Escape, Fokusrückgabe", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);

  // Per Tastatur öffnen: den Auslöser fokussieren und mit Enter auslösen.
  const trigger = karte(page, "Standardversicherung").locator(SEL.details);
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector(SEL.dialog, { timeout: 5000 });

  // Der Fokus steht im Dialog.
  const imDialog = () => page.evaluate(sel => !!document.activeElement?.closest(sel), SEL.dialog);
  assert.equal(await imDialog(), true, "der Fokus liegt nach dem Öffnen nicht im Dialog");

  // Rollen und Beschriftung.
  const dlg = page.locator(SEL.dialog);
  assert.equal(await dlg.getAttribute("role"), "dialog");
  assert.equal(await dlg.getAttribute("aria-modal"), "true");
  const labelledby = await dlg.getAttribute("aria-labelledby");
  assert.equal(await page.locator(`#${labelledby}`).innerText(), "Transportversicherung");
  assert.equal(await page.locator(SEL.dlgClose).getAttribute("aria-label"), "Versicherungsdetails schließen");

  // Fokusfalle: mehrfach Tab bleibt im Dialog.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    assert.equal(await imDialog(), true, `Tab ${i + 1} hat den Dialog verlassen`);
  }
  await page.keyboard.press("Shift+Tab");
  assert.equal(await imDialog(), true, "Shift+Tab hat den Dialog verlassen");

  // Escape schließt und gibt den Fokus an den Auslöser zurück.
  await page.keyboard.press("Escape");
  await page.waitForSelector(SEL.dialog, { state: "detached", timeout: 5000 });
  const zurueck = await page.evaluate(sel => document.activeElement?.className || "", SEL.details);
  assert.ok(zurueck.includes("ins-card-details-btn"),
    `der Fokus kehrte nicht zum Auslöser zurück (aktiv: „${zurueck}“)`);

  await page.close();
});

/* ── 10b. White Label im Dialog ──────────────────────────────────────────── */

test("10b — der Dialog nennt den Upstream-Anbieter nicht und lässt keine Attrappe zurück", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);
  await karte(page, "Standardversicherung").locator(SEL.details).click();
  await page.waitForSelector(SEL.dialog, { timeout: 5000 });

  await pruefeWhiteLabel(page, "Dialog");

  // An der Stelle des entfernten Volltext-Links steht nichts Klickbares:
  // kein Anker, kein deaktivierter Knopf, kein Element mit Linkoptik.
  const dlg = page.locator(SEL.dialog);
  // Genau EIN Anker: der interne Weg auf die Informationsseite. Kein externer
  // Link, kein toter Knopf, kein inertes Element mit Linkoptik.
  const anker = dlg.locator("a");
  assert.equal(await anker.count(), 1, "erwartet wird genau ein (interner) Link");
  assert.equal(await anker.getAttribute("href"), "/versicherungsinformationen");
  assert.equal(await dlg.locator('a[href^="http"]').count(), 0, "der Dialog enthält einen externen Link");
  assert.equal(await dlg.locator("button:disabled").count(), 0, "der Dialog enthält einen toten Knopf");
  assert.equal(await dlg.locator("[role=\"note\"]").count(), 0, "der Dialog enthält ein inertes Pseudo-Element");
  // Die beiden echten Knöpfe bleiben: Schließkreuz und Schließen.
  assert.equal(await dlg.locator("button").count(), 2, "erwartet werden genau zwei Knöpfe (X und Schließen)");
  assert.ok(!/Vollständige Versicherungsbedingungen/.test(await dlg.innerText()),
    "der entfernte CTA steht noch als Text da");

  await page.close();
});

/* ── 10c. Dreistufiges Informationssystem ────────────────────────────────── */

test("10c — Karte → Dialog → interne Informationsseite, ohne Verlust der Buchung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);

  // Ebene 1 → 2: Karte öffnet den Dialog.
  await waehle(page, "Standardversicherung");
  await page.locator(SEL.goods).fill("500");
  await page.waitForTimeout(700);
  await karte(page, "Standardversicherung").locator(SEL.details).click();
  await page.waitForSelector(SEL.dialog, { timeout: 5000 });

  // Der Dialog trägt die drei wichtigen Hinweise.
  const dlg = await page.locator(SEL.dialog).innerText();
  assert.match(dlg, /Wichtige Hinweise/);
  assert.match(dlg, /ausgeschlossen sein/);
  assert.match(dlg, /vorherige Freigabe/);
  assert.match(dlg, /weiteren Voraussetzungen und Ausschlüssen/);

  // Ebene 2 → 3: interner Link, kein neues Fenster, kein externes Ziel.
  const mehr = page.locator(SEL.dlgMore);
  assert.equal(await mehr.getAttribute("href"), "/versicherungsinformationen");
  assert.equal(await mehr.getAttribute("target"), null, "der Link öffnet ein neues Fenster");
  await mehr.click();
  await page.waitForSelector(".insinfo-sec", { timeout: 10000 });
  assert.match(page.url(), /\/versicherungsinformationen$/);

  const seite = await page.locator(".insinfo-wrap").innerText();
  assert.match(seite, /Informationen zur Transportversicherung/);
  for (const kapitel of [
    "Überblick", "Umfang und Grenzen des Versicherungsschutzes",
    "Güter mit besonderen Voraussetzungen oder Ausschluss",
    "Vom Versand ausgeschlossene Güter", "Ausgeschlossene Ursachen und Schäden",
    "Versicherungssumme und Höchstgrenzen", "Selbstbeteiligung",
    "Standardversicherung", "Premiumversicherung",
    "Verpackungs- und Mitwirkungspflichten", "Was tun im Schadenfall?",
    "Schadenmeldung: Fristen", "Verlust und Verschollenheit", "Wichtige Hinweise",
  ]) {
    assert.ok(seite.includes(kapitel), `Kapitel fehlt: „${kapitel}“`);
  }
  assert.equal(await page.locator(".insinfo-sec").count(), 15, "erwartet 14 Kapitel + Supportblock");
  // Am gerenderten DOM: keine konkrete Frist und keine Hoechstsumme.
  for (const zahl of ["24 Stunden", "48 Stunden", "7 Werktagen", "7 Kalendertagen", "21 Tagen", "50.000", "1.000 EUR"]) {
    assert.ok(!seite.includes(zahl), `unbelegte Zahl sichtbar: „${zahl}“`);
  }
  assert.match(seite, /Maßgeblich sind die im jeweiligen Versicherungsfall geltenden Versicherungsbedingungen/);
  await pruefeWhiteLabel(page, "Informationsseite");

  // Zurück: die Buchung steht unverändert da (Auswahl UND Warenwert).
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForSelector(SEL.cards, { timeout: 20000 });
  await zuSchritt2(page);
  assert.match(await gewaehlt(page), /Standardversicherung/, "die Versicherungsauswahl ging verloren");
  assert.equal(await page.locator(SEL.goods).inputValue(), "500", "der Warenwert ging verloren");

  await page.close();
});

test("10d — die Sprungnavigation der Informationsseite führt zu echten Zielen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await page.goto(`${BASE}/versicherungsinformationen`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".insinfo-toc", { timeout: 20000 });

  const befund = await page.evaluate(() => {
    const links = [...document.querySelectorAll(".insinfo-toc-link")];
    return {
      anzahl: links.length,
      tote: links.map(a => a.getAttribute("href").slice(1)).filter(id => !document.getElementById(id)),
      h1: document.querySelectorAll("h1").length,
      h2: document.querySelectorAll("h2").length,
      listen: document.querySelectorAll(".insinfo-list").length,
    };
  });
  assert.equal(befund.anzahl, 14, "das Inhaltsverzeichnis führt nicht 14 Kapitel");
  assert.deepEqual(befund.tote, [], "tote Sprungziele");
  assert.equal(befund.h1, 1, "genau ein h1 erwartet");
  assert.equal(befund.h2, 15, "jedes Kapitel und der Supportblock brauchen ein h2");
  assert.ok(befund.listen >= 13, "die Kapitel nutzen keine echten Listen");

  // Ein Sprung landet wirklich am Kapitel. `html { scroll-behavior: smooth }`
  // gilt global — deshalb wird auf das ENDE der Animation gewartet (stabile
  // Scrollposition) und nicht nach einer festen Zeit gemessen.
  await page.locator('.insinfo-toc-link[href="#meldefrist"]').click();
  await page.waitForFunction(() => {
    const y = document.scrollingElement.scrollTop;
    if (window.__letztesY === y) return true;
    window.__letztesY = y;
    return false;
  }, null, { timeout: 5000, polling: 120 });
  const oben = await page.evaluate(() => Math.round(document.getElementById("meldefrist").getBoundingClientRect().top));
  // .page-with-navbar hat 88 px Kopfabstand; scroll-margin-top hält das Kapitel
  // darunter frei. Eine kleine Toleranz für Subpixel/Restanimation.
  assert.ok(oben >= 0 && oben <= 120,
    `das Sprungziel liegt bei ${oben}px — es sollte direkt unter der Navbar (~88px) stehen`);

  await page.close();
});

/* ── 11. Responsive ──────────────────────────────────────────────────────── */

test("11 — kein Seiten-Overflow und lesbare Karten über alle Breiten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);
  await waehle(page, "Premiumversicherung");

  for (const width of [1440, 1280, 1100, 1024, 900, 768, 600, 430, 390, 360]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(120);

    const mass = await page.evaluate(() => {
      const de = document.documentElement;
      const box = document.querySelector(".booking-insurance-box");
      const badge = document.querySelector(".ins-card-badge");
      const link = document.querySelector(".ins-card-terms-link");
      const rect = (el) => (el ? el.getBoundingClientRect() : null);
      const zeilen = (el) => {
        if (!el) return 0;
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
        return Math.round(el.getBoundingClientRect().height / lh);
      };
      const karten = [...document.querySelectorAll(".ins-card")].map(c => c.getBoundingClientRect().height);
      return {
        seitenUeberlauf: de.scrollWidth - de.clientWidth,
        modulUeberlauf: box ? Math.round(box.scrollWidth - box.clientWidth) : 0,
        badgeZeilen: zeilen(badge),
        badgeBreite: rect(badge)?.width || 0,
        linkVorhanden: !!link,
        maxKartenhoehe: Math.max(...karten, 0),
      };
    });

    assert.ok(mass.seitenUeberlauf <= 0, `@${width}: Seiten-Overflow ${mass.seitenUeberlauf}px`);
    assert.ok(mass.modulUeberlauf <= 1, `@${width}: der Versicherungsblock läuft ${mass.modulUeberlauf}px über`);
    assert.equal(mass.badgeZeilen, 1, `@${width}: das Premium-Badge ist auf ${mass.badgeZeilen} Zeilen zerlegt`);
    assert.ok(mass.badgeBreite > 60, `@${width}: das Badge ist mit ${mass.badgeBreite}px unplausibel schmal`);
    assert.equal(mass.linkVorhanden, true, `@${width}: der Bedingungslink ist verschwunden`);
    assert.ok(mass.maxKartenhoehe < 460, `@${width}: eine Karte ist mit ${mass.maxKartenhoehe}px zu hoch`);
  }

  await page.close();
});

test("12 — der Dialog bleibt auf schmalen Viewports vollständig im Bild", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await zurBuchung(page);

  for (const [width, height] of [[1440, 950], [900, 800], [390, 780], [360, 720]]) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(120);
    if (await page.locator(SEL.dialog).count() === 0) {
      await karte(page, "Standardversicherung").locator(SEL.details).click();
      await page.waitForSelector(SEL.dialog, { timeout: 5000 });
    }

    const mass = await page.evaluate(() => {
      const de = document.documentElement;
      const d = document.querySelector(".insdlg");
      const r = d.getBoundingClientRect();
      const schliessen = document.querySelector(".ce-dialog-actions .btn");
      return {
        seitenUeberlauf: de.scrollWidth - de.clientWidth,
        links: Math.round(r.left), rechts: Math.round(r.right),
        breite: Math.round(r.width), viewport: de.clientWidth,
        querUeberlauf: Math.round(d.scrollWidth - d.clientWidth),
        // Der Schließen-Button muss über den Dialog-Scroll erreichbar sein.
        aktionErreichbar: !!schliessen && schliessen.getBoundingClientRect().height > 0,
      };
    });

    assert.ok(mass.seitenUeberlauf <= 0, `@${width}: Seiten-Overflow ${mass.seitenUeberlauf}px`);
    assert.ok(mass.links >= 0, `@${width}: der Dialog ragt links heraus (${mass.links}px)`);
    assert.ok(mass.rechts <= mass.viewport, `@${width}: der Dialog ragt rechts heraus (${mass.rechts} > ${mass.viewport})`);
    assert.ok(mass.querUeberlauf <= 1, `@${width}: der Dialog scrollt horizontal (${mass.querUeberlauf}px)`);
    assert.equal(mass.aktionErreichbar, true, `@${width}: die Schließen-Aktion ist nicht erreichbar`);
    if (width >= 900) {
      assert.ok(mass.breite <= 560, `@${width}: der Dialog ist mit ${mass.breite}px breiter als die md-Stufe`);
    }
  }

  await page.close();
});

/* ── 13. Responsive der Informationsseite ────────────────────────────────── */

test("13 — die Informationsseite läuft auf keiner Zielbreite über", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, [TARIFF_MIT_LINK]);
  await page.goto(`${BASE}/versicherungsinformationen`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".insinfo-sec", { timeout: 20000 });

  for (const width of [1440, 1280, 1024, 900, 768, 430, 390, 360]) {
    await page.setViewportSize({ width, height: 950 });
    await page.waitForTimeout(120);
    const mass = await page.evaluate(() => {
      const de = document.documentElement;
      const zeilen = (el) => {
        const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
        return Math.round(el.getBoundingClientRect().height / lh);
      };
      const titel = document.querySelector(".insinfo-title");
      return {
        seite: de.scrollWidth - de.clientWidth,
        tocSpalten: getComputedStyle(document.querySelector(".insinfo-toc-list")).gridTemplateColumns,
        titelZeilen: zeilen(titel),
        // Trefferfläche des ersten Sprunglinks.
        linkHoehe: Math.round(document.querySelector(".insinfo-toc-link").getBoundingClientRect().height),
      };
    });
    assert.ok(mass.seite <= 0, `@${width}: Seiten-Overflow ${mass.seite}px`);
    assert.ok(mass.titelZeilen <= 3, `@${width}: der Titel bricht auf ${mass.titelZeilen} Zeilen`);
    if (width <= 600) {
      assert.ok(mass.linkHoehe >= 44, `@${width}: Sprunglink nur ${mass.linkHoehe}px hoch`);
    }
  }
  await page.close();
});
