// E2E: die Angaben zur Art der Adresse im Buchungsschritt.
//
// Gemessen wird am echten Dev-Server mit gemocktem Backend — NIEMALS eine echte
// Bestellung. Der `/book`-Aufruf wird abgefangen und sein Körper geprüft, statt ihn
// durchzulassen.
//
// Die drei Fragen dieser Datei:
//   1. Wird bei einer Paketshopabgabe wirklich NICHT nach der Abholadresse gefragt?
//   2. Überlebt ein bewusstes „Nein" die Navigation — oder wird daraus „unbeantwortet"?
//   3. Steht irgendwo ein Providername?
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { fuelleVersandformular, STANDARD_SENDUNGSANGABEN, angebotsCta }
  from "./helpers/newShipmentForm.mjs";

const PORT = 5271, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "73207", customer_number: "CE-K-10030",
};

// Die vom SERVER deklarierten Zusatzangaben — providerneutral, in der Reihenfolge des
// Vertrags (Zustellung zuerst). Der Test setzt sie wie /calculate-price sie liefert.
const NOETIG = {
  pickup:  ["deliveryIsResidential", "collectionIsResidential"],
  dropoff: ["deliveryIsResidential"],
};

const basisTarif = (uebergabe, requiredPriceInputs = NOETIG[uebergabe]) => ({
  requiredPriceInputs,
  id: 1, shipper_tariff_id: 1, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
  publicServiceName: "Standardversand", serviceType: uebergabe, currency: "EUR",
  netPrice: 18.65, vatAmount: 3.54, finalPrice: 22.19, transitDaysMin: 1, transitDaysMax: 2,
  trackingAvailable: true, printerRequired: false, availableForDate: true,
  // Die providerneutrale Angebotskennung, wie sie /calculate-price liefert.
  offerId: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
  pickupDate: "2026-08-07T00:00:00Z", pickupTimeFrom: "09:00", pickupTimeUntil: "17:00",
  deliveryDate: "2026-08-08T00:00:00Z",
});

const FELD_LIEFER = "deliveryIsResidential";
const FELD_ABHOL  = "collectionIsResidential";

let server, browser;

async function setupRoutes(page, { uebergabe = "pickup", onBook, onCalc, noetig } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });

    // Der Buchungsaufruf wird ABGEFANGEN — es entsteht nie eine Bestellung.
    if (p.endsWith("/api/jumingo/book")) {
      if (onBook) onBook(JSON.parse(req.postData() || "{}"));
      await page.evaluate(() => { window.__ceBookCalls = (window.__ceBookCalls || 0) + 1; }).catch(() => {});
      return json({ success: true, shipmentId: "s1", ceShipmentId: 1, trackingNumber: "X" });
    }
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/api/kunde/form-drafts")) return json({ drafts: [], nextCursor: null });
    if (p.includes("/api/kunde/drafts")) return json({ items: [], nextCursor: null });
    if (p.includes("/api/kunde/addresses")) return json({ addresses: [], pagination: { total: 0 } });
    if (p.includes("/api/jumingo/calculate-price")) {
      if (onCalc) onCalc(JSON.parse(req.postData() || "{}"));
      return json({
      shipmentId: "s1", tariffs: [basisTarif(uebergabe, noetig)], availableShippingModes: ["standard"],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE", exportDeclaration: null,
      });
    }
    if (p.includes("/api/jumingo/draft/pickup-window")) return json({
      pickupWindow: null, availableFrom: "2026-08-07T09:00:00Z", availableUntil: "2026-08-07T17:00:00Z",
      minimumMinutes: 120, adjustable: true,
    });
    return json({});
  });
  await page.addInitScript(() => { localStorage.setItem("ce_token", "e2e-token"); window.__ceBookCalls = 0; });
}

/* `angaben` reicht die vier Sendungsangaben durch. Ein Feld auf `null` laesst die Frage
   ausdruecklich UNBEANTWORTET — damit prueft eine Suite den gesperrten Zustand, ohne
   irgendetwas zu erzwingen. */
async function bisZumFormular(page, angaben = STANDARD_SENDUNGSANGABEN) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page, { sendungsangaben: angaben });
}

async function zurBuchung(page, angaben = STANDARD_SENDUNGSANGABEN) {
  await bisZumFormular(page, angaben);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".adr-typ-group", { timeout: 20000 });
}

const waehle = (page, feld, ja) => page.locator(`#${feld}-${ja ? "ja" : "nein"}`).click();

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { detached: true, stdio: "ignore" });
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
    // node startet. Ein Signal an npx liesse den Enkel auf seinem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

/* ══════════ 1 — WELCHE FRAGE ERSCHEINT ══════════ */

test("1 — Abholung fragt nach BEIDEN Adressen", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup" });
  await zurBuchung(page);
  assert.equal(await page.locator(`#${FELD_ABHOL}-ja`).count(), 1, "die Abholfrage fehlt");
  assert.equal(await page.locator(`#${FELD_LIEFER}-ja`).count(), 1, "die Lieferfrage fehlt");
  await page.close();
});

test("2 — Paketshopabgabe fragt NICHT nach der Abholadresse", async () => {
  // Dorthin faehrt niemand. Eine Pflichtfrage ohne Preiswirkung ist genau die Art
  // Formularfeld, die Leute zum Abbrechen bringt.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "dropoff" });
  await zurBuchung(page);
  assert.equal(await page.locator(`#${FELD_ABHOL}-ja`).count(), 0,
    "bei Paketshopabgabe wurde nach der Abholadresse gefragt");
  assert.equal(await page.locator(`#${FELD_LIEFER}-ja`).count(), 1);
  await page.close();
});

test("2b — ein Angebot OHNE Zusatzbedarf zeigt gar keine Adressfrage", async () => {
  // Der Regressionsschutz fuer den bestehenden Buchungsweg: `requiredPriceInputs: []`
  // heisst KEINE Karte, KEINE Pflichtfrage, KEIN Gate. Genau hier ist die frühere Fassung
  // gescheitert — sie verlangte die Zustellfrage immer und blockierte damit zehn Suiten.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup", noetig: [] });
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".offers-form-section", { timeout: 20000 });
  await fuelleVersandformular(page);
  await page.locator(".offers-calc-cta button").first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector("button.btn-primary", { timeout: 20000 });

  assert.equal(await page.locator(".adr-typ-group").count(), 0,
    "ein Angebot ohne Zusatzbedarf zeigt trotzdem eine Adressfrage");
  // Und der Weg nach Schritt 2 ist frei.
  await page.locator("button.btn-primary", { hasText: "Weiter" }).first().click();
  await page.waitForSelector("button.booking-book-btn", { timeout: 20000 });
  await page.close();
});

/* ══════════ 2 — DAS NEIN BLEIBT EIN NEIN ══════════ */

test("3 — ein bewusstes „Nein\" ueberlebt Zurueck und Vor", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup" });
  /* Das „Nein" wird seit Paket 9A dort gegeben, wo es hingehoert: im Sendungsformular.
     Es ist die EINGEFRORENE Angabe der Sendung — der Server vergleicht einen
     mitgeschickten Wert nur noch gegen sie und lehnt eine Abweichung ab. Genau deshalb
     stammt es hier aus dem Formular und nicht mehr aus einem Klick auf der
     Buchungsseite: sonst pruefte der Test einen Vorrang, den es nicht gibt.

     Die Aussage bleibt woertlich dieselbe — ein bewusstes „Nein" darf auf dem Weg
     Buchung -> Zurueck -> Buchung weder verschwinden noch still zu „unbeantwortet"
     werden. */
  await zurBuchung(page, { ...STANDARD_SENDUNGSANGABEN,
                           [FELD_ABHOL]: false, [FELD_LIEFER]: false });

  assert.equal(await page.locator(`#${FELD_ABHOL}-nein`).isChecked(), true);
  assert.equal(await page.locator(`#${FELD_LIEFER}-nein`).isChecked(), true);

  // Zurueck zu den Angeboten und wieder hinein.
  await page.locator("button.btn-outline", { hasText: "Zurück" }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 20000 });
  await page.locator(".offer-card:not(.offer-card--unavailable)").first().locator("button.offer-cta-btn").click();
  await page.waitForSelector(".adr-typ-group", { timeout: 20000 });

  assert.equal(await page.locator(`#${FELD_ABHOL}-nein`).isChecked(), true,
    "das Nein zur Abholadresse ist verlorengegangen");
  assert.equal(await page.locator(`#${FELD_LIEFER}-nein`).isChecked(), true,
    "das Nein zur Lieferadresse ist verlorengegangen");
  // Und es wurde NICHT still zu „unbeantwortet": die Ja-Option ist weiterhin leer.
  assert.equal(await page.locator(`#${FELD_ABHOL}-ja`).isChecked(), false);
  await page.close();
});

test("4 — die Buchungsseite zeigt GENAU die Antworten aus dem Sendungsformular", async () => {
  /* Die Aussage dieses Tests ist unveraendert: hier wird NICHTS erfunden. Nur der Ort,
     an dem geantwortet wird, hat sich verschoben.

     Bis Paket 9A wurden beide Fragen erst auf der Buchungsseite gestellt, und dieser
     Test verlangte, dass KEINE Option vorausgewaehlt ist — ein Schalter haette dort auf
     „aus" gestanden und damit eine Antwort behauptet, die niemand gegeben hat.

     Seit 9A werden sie im SENDUNGSFORMULAR beantwortet und bestimmen bereits den
     Vergleichspreis mit; die Buchungsseite zeigt sie nur noch an. Eine Vorauswahl ist
     hier deshalb kein stiller Vorgabewert mehr, sondern die Antwort des Kunden — und
     genau das wird gemessen: ein bewusstes „Nein" (`false`) muss als „Nein" ankommen,
     nicht als „unbeantwortet" und nicht als „Ja".

     Der Test ist damit auch die Probe auf den Dreiwertigkeitsvertrag: wer den
     `??`-Ausgangswert in `BookingPage` auf `||` zurueckdreht, macht aus dem
     gespeicherten `false` ein `null` — dann ist bei der Abholung KEINE Option markiert
     und diese Pruefung faellt. */
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup" });
  // geschaeftlich / privat — zwei verschiedene Antworten, damit ein vertauschtes oder
  // pauschal gesetztes Feld auffaellt.
  await zurBuchung(page, { ...STANDARD_SENDUNGSANGABEN,
                           [FELD_ABHOL]: false, [FELD_LIEFER]: true });

  assert.equal(await page.locator(`#${FELD_ABHOL}-nein`).isChecked(), true,
    "das Nein der Abholadresse kam auf der Buchungsseite nicht an");
  assert.equal(await page.locator(`#${FELD_ABHOL}-ja`).isChecked(), false,
    "aus dem Nein der Abholadresse wurde ein Ja");
  assert.equal(await page.locator(`#${FELD_LIEFER}-ja`).isChecked(), true,
    "das Ja der Lieferadresse kam auf der Buchungsseite nicht an");
  assert.equal(await page.locator(`#${FELD_LIEFER}-nein`).isChecked(), false,
    "aus dem Ja der Lieferadresse wurde ein Nein");
  await page.close();
});

test("4b — eine unbeantwortete Angabe erreicht die Buchungsseite gar nicht erst", async () => {
  /* Die zweite Haelfte der alten Aussage, an ihrem heutigen Ort: `null` darf niemals
     still zu `false` werden. Seit 9A ist das keine Frage der Buchungsseite mehr — die
     Angabe ist Voraussetzung des Vergleichs, und ohne sie entsteht kein Angebot, das man
     buchen koennte. Die Sperre liegt damit FRUEHER und ist strenger als zuvor.

     Es wird ausdruecklich nichts erzwungen: geprueft wird, dass der CTA deaktiviert
     BLEIBT. */
  const anfragen = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup", onCalc: (b) => anfragen.push(b) });
  // Alles vollstaendig — bis auf die Adressart der Abholung.
  await bisZumFormular(page, { ...STANDARD_SENDUNGSANGABEN, [FELD_ABHOL]: null });

  assert.equal(await angebotsCta(page).isDisabled(), true,
    "eine fehlende Adressart wurde still als Geschaeftsadresse durchgewinkt");
  assert.equal(anfragen.length, 0, "es wurde ohne vollstaendige Angaben bepreist");
  assert.equal(await page.locator(".offer-card").count(), 0, "es entstanden Angebote ohne Angabe");
  await page.close();
});

/* ══════════ 3 — DER ECHTE PAYLOAD ══════════ */

test("5 — der /book-Koerper traegt false als false und nur die noetigen Felder", async () => {
  const koerper = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "dropoff", onBook: (b) => koerper.push(b) });
  await zurBuchung(page);

  await waehle(page, FELD_LIEFER, false);
  await page.locator("button.btn-primary", { hasText: "Weiter" }).first().click();
  // Der Bestellknopf traegt eine eigene Klasse — `.btn-primary` allein trifft auch
  // andere Knoepfe der Seite und waere je nach Reihenfolge der falsche.
  // Die beiden Pflichtbestaetigungen (AGB, ausgeschlossene Gegenstaende) — ohne sie
  // bleibt der Bestellknopf zu Recht gesperrt. Sie sind NICHT Gegenstand dieser Suite,
  // aber ohne sie kaeme kein Request zustande, den man pruefen koennte.
  const bestellen = page.locator("button.booking-book-btn");
  await bestellen.waitFor({ state: "visible", timeout: 20000 });
  for (const cb of await page.locator(".booking-terms input[type=checkbox], .booking-agb-checkbox").all()) {
    if (!(await cb.isChecked())) await cb.check();
  }
  await page.waitForFunction(
    () => { const b = document.querySelector("button.booking-book-btn"); return b && !b.disabled; },
    null, { timeout: 20000 });
  await bestellen.click();
  await page.waitForFunction(() => window.__ceBookCalls > 0, null, { timeout: 20000 })
    .catch(() => { /* die Zusicherung unten meldet es praeziser */ });

  assert.equal(koerper.length, 1, `es wurde ${koerper.length}-mal gebucht`);
  const b = koerper[0];
  assert.equal(b.priceInputs[FELD_LIEFER], false, "aus dem Nein wurde etwas anderes");
  assert.ok(!(FELD_ABHOL in b.priceInputs),
    "bei Paketshopabgabe wurde eine Abholangabe mitgesendet, die niemand braucht");
  assert.equal(b.offerId, "a1b2c3d4e5f60718293a4b5c6d7e8f90", "die Angebotskennung fehlt");
  await page.close();
});

test("6 — ohne Antwort entsteht weder eine Preisanfrage noch eine Buchung", async () => {
  /* Die urspruengliche Zusicherung lautete: ohne beantwortete Adressart kommt kein
     Buchungsrequest zustande. Sie gilt unveraendert — sie wird seit Paket 9A nur eine
     Stufe frueher eingeloest, und dadurch STRENGER: es entsteht nicht einmal ein
     Angebot, das sich buchen liesse.

     Frueher konnte der Test die Luecke auf der Buchungsseite herstellen, weil dort
     geantwortet wurde. Heute ist die Angabe Voraussetzung des Vergleichs; wer sie
     weglaesst, kommt ueber das Formular nicht hinaus. Der Test misst deshalb beide
     Enden der Kette in einem Durchlauf. */
  const koerper = [], anfragen = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup",
                            onBook: (b) => koerper.push(b), onCalc: (b) => anfragen.push(b) });
  await bisZumFormular(page, { ...STANDARD_SENDUNGSANGABEN, [FELD_LIEFER]: null });

  // Der CTA bleibt gesperrt — er wird NICHT erzwungen.
  assert.equal(await angebotsCta(page).isDisabled(), true,
    "der Vergleich war trotz fehlender Adressart bedienbar");
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(anfragen.length, 0, "es wurde ohne Adressangabe bepreist");
  assert.equal(koerper.length, 0, "es wurde ohne Adressangabe gebucht");
  await page.close();
});

/* ══════════ 4 — BREITEN UND WHITE LABEL ══════════ */

test("7 — auf 1440, 834 und 390 ist alles bedienbar und nichts laeuft ueber", async () => {
  for (const breite of [1440, 834, 390]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 900 } });
    await setupRoutes(page, { uebergabe: "pickup" });
    await zurBuchung(page);

    for (const feld of [FELD_ABHOL, FELD_LIEFER]) {
      const box = await page.locator(`#${feld}-ja`).locator("xpath=ancestor::label[1]").boundingBox();
      assert.ok(box, `${breite}px: ${feld} nicht sichtbar`);
      assert.ok(box.x >= 0 && box.x + box.width <= breite + 1,
        `${breite}px: ${feld} laeuft aus dem Bild (${box.x}..${box.x + box.width})`);
      // Auf Touchbreiten muss die Trefferflaeche 44 px erreichen (WCAG 2.5.5).
      if (breite <= 860) {
        assert.ok(box.height >= 44, `${breite}px: ${feld} nur ${box.height}px hoch`);
      }
    }
    // Und die Auswahl funktioniert auch schmal.
    await waehle(page, FELD_LIEFER, true);
    assert.equal(await page.locator(`#${FELD_LIEFER}-ja`).isChecked(), true,
      `${breite}px: die Auswahl liess sich nicht setzen`);
    await page.close();
  }
});

test("8 — kein Providername irgendwo auf der Buchungsseite", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
  await setupRoutes(page, { uebergabe: "pickup" });
  await zurBuchung(page);
  const sichtbar = (await page.locator("body").innerText()).toLowerCase();
  for (const w of ["transglobal", "jumingo"]) {
    assert.ok(!sichtbar.includes(w), `"${w}" steht sichtbar auf der Buchungsseite`);
  }
  await page.close();
});
