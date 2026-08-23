// E2E: Fehlerdarstellung im Preisrechner (echter Dev-Server, echte Kaskade).
//
// Prüft das, was ein reiner Logiktest nicht erreicht: dass der Fehler tatsächlich
// am richtigen Feld erscheint, das Feld markiert, fokussiert und in den sichtbaren
// Bereich gescrollt wird, die Attribute für Screenreader gesetzt sind — und dass
// die bereits eingegebenen Werte dabei erhalten bleiben.
//
// Der gemeldete Ausgangsfall: Ziel DE + PLZ „4444" → früher nur
// „Fehler bei Preisberechnung".
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5224, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "kunde@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "70173", customer_number: "CE-K-10030",
};

let server, browser;

async function setup(page, { onCalc } = {}) {
  const konsole = [];
  page.on("console", (m) => { if (m.type() === "error") konsole.push(m.text()); });
  page.on("pageerror", (e) => konsole.push(String(e)));
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/calculate-price")) {
      if (onCalc) return onCalc(route, json);
      return json({ shipmentId: 1, tariffs: [], publicCarriers: [] });
    }
    return json({});
  });
  await page.addInitScript(() => { localStorage.setItem("ce_token", "e2e-token"); });
  return konsole;
}

// Formular mit gültigen Basisdaten füllen; `to_zip` bleibt Sache des Tests.
//
// Die MASSE gehören seit dem Paket „Paketmaße sind Pflicht" dazu. Vorher waren
// sie optional und wurden serverseitig still durch 30/20/15 ersetzt; heute
// sperrt der CTA ohne sie — und zwar richtigerweise. Wer sie hier wegließe,
// prüfte nicht mehr die Fehlerdarstellung des Preisrechners, sondern nur noch
// die Maßsperre davor. Zwei Tests dieser Datei setzen sie deshalb ausdrücklich
// NICHT und belegen genau diese Sperre.
async function fill(page, { toZip, masse = true }) {
  await page.fill("#calc-from-zip", "70173");
  await page.fill("#calc-to-zip", toZip);
  await page.fill("#calc-weight", "2");
  await page.fill("#calc-packageCount", "1");
  if (masse) {
    await page.fill("#calc-length", "30");
    await page.fill("#calc-width", "20");
    await page.fill("#calc-height", "15");
  }
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
    // Die Prozessgruppe, nicht nur das Kind: npx startet `sh -c vite`,
    // das seinerseits node startet. Ein Signal an den npx-Prozess laesst
    // den Enkel — den eigentlichen Dev-Server — auf seinem Port stehen.
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

test("die ungültige deutsche Ziel-PLZ 4444 wird konkret erklärt und markiert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const konsole = await setup(page);
  let gesendet = 0;
  page.on("request", (r) => { if (r.url().includes("calculate-price")) gesendet++; });

  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await fill(page, { toZip: "4444" });
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForTimeout(400);

  const banner = (await page.locator(".alert-error").first().innerText()).replace(/\s+/g, " ");
  // Der alte Sammeltext darf nicht mehr erscheinen.
  assert.ok(!/Fehler bei Preisberechnung/.test(banner), `alter Sammeltext noch sichtbar: ${banner}`);
  assert.match(banner, /Postleitzahl prüfen/);
  assert.match(banner, /4444/, "der eingegebene Wert muss zitiert werden");
  assert.match(banner, /Deutschland/);
  assert.match(banner, /fünfstellige/);

  // Feldbezogene Meldung direkt unter dem Eingabefeld.
  const feldText = await page.locator("#calc-to-zip ~ .field-error").innerText();
  assert.match(feldText, /fünfstellige deutsche Postleitzahl/);

  // Ungültige Eingabe geht gar nicht erst ans Backend.
  assert.equal(gesendet, 0, "eine clientseitig erkannte Falscheingabe darf nicht gesendet werden");
  assert.deepEqual(konsole, [], "keine Konsolenfehler");
  await page.close();
});

test("das fehlerhafte Feld ist markiert, fokussiert, sichtbar und barrierefrei verbunden", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 700 } });
  await setup(page);
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await fill(page, { toZip: "4444" });
  // Ans Seitenende scrollen, damit ein echter Sprung nach oben nötig ist.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForTimeout(700);   // weiches Scrollen abwarten

  const zustand = await page.evaluate(() => {
    const el = document.querySelector("#calc-to-zip");
    const r = el.getBoundingClientRect();
    const beschrieben = el.getAttribute("aria-describedby");
    return {
      fokussiert: document.activeElement === el,
      markiert: el.className.includes("field-input-error"),
      ariaInvalid: el.getAttribute("aria-invalid"),
      beschriebenVon: beschrieben,
      beschreibungVorhanden: beschrieben ? !!document.getElementById(beschrieben) : false,
      imBild: r.top >= 0 && r.bottom <= window.innerHeight,
      wert: el.value,
    };
  });

  assert.equal(zustand.markiert, true, "das Feld muss visuell als fehlerhaft markiert sein");
  assert.equal(zustand.ariaInvalid, "true", "aria-invalid fehlt");
  assert.ok(zustand.beschriebenVon, "aria-describedby fehlt");
  assert.equal(zustand.beschreibungVorhanden, true, "aria-describedby zeigt ins Leere");
  assert.equal(zustand.fokussiert, true, "das erste fehlerhafte Feld muss den Fokus bekommen");
  assert.equal(zustand.imBild, true, "das Feld muss in den sichtbaren Bereich gescrollt werden");
  assert.equal(zustand.wert, "4444", "die Eingabe darf nicht verloren gehen");
  await page.close();
});

test("Eingaben bleiben nach einem Serverfehler vollständig erhalten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setup(page, {
    // Gültige Clienteingabe, aber der Server lehnt ab (z. B. Regeländerung).
    onCalc: (route, json) => json({
      code: "INVALID_POSTAL_CODE_FORMAT", field: "recipient.postalCode", countryCode: "DE",
      message: "Die Postleitzahl entspricht nicht dem Format des ausgewählten Landes.", example: "26133",
    }, 422),
  });
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  // `fill` setzt die Maße mit — ohne sie greift (korrekt) schon die Vorprüfung
  // und der Request erreicht den Server gar nicht.
  await fill(page, { toZip: "10115" });
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForTimeout(500);

  const s = await page.evaluate(() => ({
    from: document.querySelector("#calc-from-zip").value,
    to: document.querySelector("#calc-to-zip").value,
    weight: document.querySelector("#calc-weight").value,
    length: document.querySelector("#calc-length").value,
    width: document.querySelector("#calc-width").value,
    height: document.querySelector("#calc-height").value,
    markiert: document.querySelector("#calc-to-zip").className.includes("field-input-error"),
    banner: (document.querySelector(".alert-error")?.innerText || "").replace(/\s+/g, " "),
  }));
  assert.equal(s.from, "70173"); assert.equal(s.to, "10115");
  assert.equal(s.weight, "2");   assert.equal(s.length, "30");
  assert.equal(s.width, "20");   assert.equal(s.height, "15");
  assert.equal(s.markiert, true, "das vom Server benannte Feld muss markiert werden");
  assert.ok(!/Fehler bei Preisberechnung/.test(s.banner), "der alte Sammeltext darf nicht erscheinen");
  await page.close();
});

test("keine Angebote ist ein Geschäftsfall, HTTP 500 ein technischer Fehler", async () => {
  // (a) fachlich: 422 NO_RATES_FOUND
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await setup(page, { onCalc: (route, json) => json({ error: "Keine Preise gefunden", code: "NO_RATES_FOUND" }, 422) });
    await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
    await fill(page, { toZip: "10115" });
    await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
    await page.waitForTimeout(400);
    const t = (await page.locator(".alert-error").first().innerText()).replace(/\s+/g, " ");
    assert.match(t, /Keine Angebote gefunden/);
    assert.match(t, /Versandroute, Versanddatum und Paketdaten/, "der Kunde muss erfahren, was er ändern kann");
    await page.close();
  }
  // (b) technisch: 500 — anderer Text, klar als Systemproblem erkennbar
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await setup(page, { onCalc: (route, json) => json({ error: "Preisberechnung fehlgeschlagen" }, 500) });
    await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
    await fill(page, { toZip: "10115" });
    await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
    await page.waitForTimeout(400);
    const t = (await page.locator(".alert-error").first().innerText()).replace(/\s+/g, " ");
    assert.match(t, /technischen Problems|Technisches Problem/);
    assert.match(t, /Support/, "bei technischen Fehlern soll der Supporthinweis stehen");
    await page.close();
  }
});

test("Verbindungsabbruch nennt die Verbindung, nicht „Failed to fetch“", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setup(page, { onCalc: (route) => route.abort("failed") });
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await fill(page, { toZip: "10115" });
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForTimeout(600);
  const t = (await page.locator(".alert-error").first().innerText()).replace(/\s+/g, " ");
  assert.match(t, /Verbindung/);
  assert.ok(!/Failed to fetch|TypeError/.test(t), `roher Technikertext sichtbar: ${t}`);
  await page.close();
});

test("eine gültige Anfrage funktioniert unverändert (keine Regression)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const konsole = await setup(page, {
    onCalc: (route, json) => json({
      shipmentId: 42,
      tariffs: [{
        id: 1, shipper_tariff_id: 100230, publicCarrierId: "dhl", publicCarrierName: "DHL Express",
        publicServiceName: "Expressversand", serviceType: "pickup", netPrice: 10.9, vatAmount: 2.07,
        finalPrice: 10.9, currency: "EUR", transitDaysMin: 1, transitDaysMax: 2,
        trackingAvailable: true, printerRequired: false,
      }],
      publicCarriers: [{ id: "dhl", name: "DHL Express" }],
      availableShippingModes: ["express"], customsRequired: false,
    }),
  });
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await fill(page, { toZip: "10115" });
  await page.getByRole("button", { name: /Angebote vergleichen/i }).first().click();
  await page.waitForSelector(".offer-card", { timeout: 15000 });

  const anzahl = await page.locator(".offer-card").count();
  assert.ok(anzahl > 0, "gültige Anfragen müssen weiterhin Angebote liefern");
  assert.equal(await page.locator(".alert-error").count(), 0, "kein Fehlerbanner bei Erfolg");
  assert.deepEqual(konsole, [], "keine Konsolenfehler");
  await page.close();
});

/* ── Gegenprobe: die Maßpflicht selbst ────────────────────────────────────────
   Die Tests darüber setzen die Maße, damit sie das prüfen können, wofür sie da
   sind — die Fehlerdarstellung. Damit dieses Ausfüllen nicht unbemerkt zur
   Umgehung einer echten Produktprüfung wird, belegen die beiden folgenden
   Läufe die Sperre ausdrücklich.

   Der Ausgangsfall: bis zum Paket „Paketmaße sind Pflicht" ersetzte der Server
   ein leeres Maßfeld still durch 30/20/15. Der Kunde bekam einen Preis für ein
   Paket, das er nie beschrieben hat, während der Carrier nach dem echten Paket
   abrechnet. */

test("ohne Maße bleibt der CTA gesperrt und es geht KEIN Request hinaus", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const konsole = await setup(page);
  let gesendet = 0;
  page.on("request", (r) => { if (r.url().includes("calculate-price")) gesendet++; });

  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await fill(page, { toZip: "10115", masse: false });

  const cta = page.getByRole("button", { name: /Angebote vergleichen/i }).first();
  assert.equal(await cta.isDisabled(), true,
    "ohne Länge, Breite und Höhe darf die Berechnung nicht auslösbar sein");

  // Ein deaktivierter Knopf wird NICHT erzwungen — ein `force`-Klick würde
  // genau die Prüfung umgehen, um die es hier geht. Stattdessen wird belegt,
  // dass auch kein Request entsteht.
  await page.waitForTimeout(300);
  assert.equal(gesendet, 0, "ein unvollständiges Paket darf den Server nie erreichen");
  assert.deepEqual(konsole, [], "keine Konsolenfehler");
  await page.close();
});

test("die Sperre nennt, was fehlt — und löst sich, sobald es da ist", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setup(page);
  await page.goto(`${BASE}/calculator`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#calc-to-zip", { timeout: 20000 });
  await fill(page, { toZip: "10115", masse: false });

  const cta = page.getByRole("button", { name: /Angebote vergleichen/i }).first();
  // Keine Fehlerwand auf einem noch nicht abgeschickten Formular: rote
  // Markierungen entstehen erst beim Weiterklicken.
  assert.equal(await page.locator(".field-input-error").count(), 0,
    "ein noch nicht abgesendetes Formular darf keine Fehlerwand zeigen");

  /* BEWUSST NICHT GEPRÜFT: eine Hinweiszeile am gesperrten CTA.
     „Neue Sendung" hat sie (`packageHint`, NewShipmentPage.jsx:518), der
     PREISRECHNER hat sie NICHT — hier steht nur der deaktivierte Knopf ohne
     Begründung. Gemessen, nicht vermutet: `.offers-calc-cta` enthält auf
     /calculator ausschließlich den Text „Angebote vergleichen".

     Das ist eine offene Lücke gegenüber der eigenen Regel (CLAUDE.md,
     „Paketmaße sind Pflicht": der deaktivierte CTA soll sagen, was fehlt — und
     der Preisrechner steht dort ausdrücklich im Geltungsbereich). Sie wird hier
     NICHT durch eine Testerwartung vorweggenommen: ein Test, der eine noch
     nicht gebaute Oberfläche verlangt, ist kein Regressionsschutz. Sobald die
     Zeile da ist, gehört die Prüfung hierher. */

  // Genau ein fehlendes Maß reicht für die Sperre.
  await page.fill("#calc-length", "30");
  await page.fill("#calc-width", "20");
  assert.equal(await cta.isDisabled(), true, "zwei von drei Maßen dürfen nicht genügen");

  await page.fill("#calc-height", "15");
  await page.waitForTimeout(200);
  assert.equal(await cta.isDisabled(), false, "vollständige Maße müssen die Sperre lösen");
  await page.close();
});
