// E2E: laufender Versandvorgang übersteht Navigation und Reload.
//
// Echter Dev-Server, echte Kaskade, echte History. Genau die Wege, die eine
// Quelltextprüfung nicht erreicht:
//
//   • sichtbares „Zurück" und Browser-Zurück müssen zum SELBEN fachlichen
//     Zustand führen (vorher: der eine landete auf „Neue Sendung" ohne Daten,
//     der andere auf der Übersicht),
//   • wiederhergestellte Angebote dürfen KEINEN neuen calculate-price auslösen,
//   • ein Reload in derselben Tab-Sitzung stellt den Vorgang wieder her,
//   • Abmeldung und Buchungserfolg löschen ihn vollständig,
//   • zwei Tabs beeinflussen sich nicht (sessionStorage ist tab-lokal).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
// Erwartete Vorbelegung aus der PRODUKTIVEN Konstante, nicht als "1" wiederholt.
import { PACKAGE_COUNT_DEFAULT } from "../../src/utils/newShipmentForm.mjs";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5232, BASE = `http://127.0.0.1:${PORT}`;
const SPEICHER = "ce_shipping_flow_v1";

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", city: "Berlin",
  street: "Musterstr. 1", customer_number: "CE-K-10030",
};

const TARIFFS = [
  { id: "t-dhl-1", tariffId: "t-dhl-1", carrier: "dhl", publicCarrierId: "dhl", carrierName: "DHL",
    serviceName: "DHL Paket", netPrice: 12.9, grossPrice: 15.35, finalPrice: 15.35, currency: "EUR",
    serviceType: "pickup", deliveryDateMin: "2027-08-10", deliveryDateMax: "2027-08-11",
    transitDaysMin: 2, transitDaysMax: 3, insuranceAvailable: true, availableForDate: true },
  { id: "t-ups-1", tariffId: "t-ups-1", carrier: "ups", publicCarrierId: "ups", carrierName: "UPS",
    serviceName: "UPS Standard", netPrice: 18.4, grossPrice: 21.9, finalPrice: 21.9, currency: "EUR",
    serviceType: "dropoff", deliveryDateMin: "2027-08-09", deliveryDateMax: "2027-08-09",
    transitDaysMin: 1, transitDaysMax: 1, insuranceAvailable: true, availableForDate: true },
];

let server, browser;
let calcCount = 0;

// ── Zusätzlicher Zustand für die Entwurfsspeicherung (Teil 9) ───────────────
// Formularentwurf: POST/PATCH /api/kunde/form-drafts. Sendungsentwurf (zweiter,
// unabhängiger Pfad auf der Buchungsseite): POST /api/kunde/drafts/:id/save.
let scriptedFormDraftStatus = 0;     // 0 = Erfolg; sonst erzwungener HTTP-Fehlerstatus
let scriptedFormDraftAbort = false;  // true = Anfrage schlägt bereits auf Netzwerkebene fehl
let scriptedShipmentDraftStatus = 0; // dito für den Sendungsentwurf der Buchungsseite
let formDraftListOverride = null;    // { drafts:[...] } | null — von einzelnen Tests gesetzt
let resumeDetailOverride = null;     // { id, revision, schemaVersion, formData } | null
let ceShipmentIdOverride;            // undefined = Standard; null simuliert ein Backend ohne das Feld
let zuletztGespeicherteDraftId = null; // ID, mit der POST /api/kunde/drafts/:id/save tatsächlich kam

async function setupRoutes(ziel) {
  await ziel.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Legal-Buchungsschranke (Go-Live Paket 4-B): `enabled:false` ist die
    // Antwort eines Servers mit ABGESCHALTETER Schranke — der heutige
    // Produktivzustand. Ohne diese Antwort liefe der Mock in den Sammelfall
    // `200 {}`; `parseBookingContext` wertet das fail-closed als `error` und
    // sperrt die Bestellung. Das ist richtiges Produktverhalten und darf nicht
    // aufgeweicht werden — die Suite muss den Endpunkt schlicht beantworten.
    // Beide Zustände der Schranke prüft `legalBookingGate.test.mjs`.
    if (p.endsWith("/api/legal/booking-context")) return json({ enabled: false });
    if (p.endsWith("/calculate-price")) {
      calcCount++;
      // WICHTIG — die beiden IDs exakt wie im Produktivbackend, mit ihren ECHTEN Formen:
      //   shipmentId    JUMiNGO-Referenz "s_"+32 Hex (Eingabe für /book)
      //   ceShipmentId  interne shipments.id (positive Ganzzahl) — für Entwürfe
      // Vorher lieferte dieser Mock als `shipmentId` eine Ganzzahl. Genau dadurch war
      // „Als Entwurf speichern" hier grün, während es produktiv dauerhaft unsichtbar
      // blieb: hasSavableShipmentId() lehnt die JUMiNGO-Form korrekt ab. Diese Form
      // NIE wieder auf eine Ganzzahl vereinfachen — sie ist der Regressionsschutz.
      return json({
        tariffs: TARIFFS,
        // "s_" + genau 32 Hexzeichen (JUMiNGO OpenAPI 1.0.4, CreateShipmentResult).
        shipmentId: `s_${String(calcCount).padStart(2, "0")}a1b2c3d4e5f60718293a4b5c6d7e8f90`.slice(0, 34),
        ceShipmentId: ceShipmentIdOverride === undefined ? 4240 + calcCount : ceShipmentIdOverride,
        publicCarriers: [{ id: "dhl", name: "DHL" }, { id: "ups", name: "UPS" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE",
      });
    }
    if (p.endsWith("/book")) {
      // Die Buchungsantwort trägt seit der Nummernumstellung die Auftragsbestätigungs-
      // nummer (CE-AB…) — das ist der Wert, den der Erfolgsbildschirm anzeigt.
      // `businessOrderNumber` und `orderNumber` bleiben bewusst im Mock stehen: sie
      // tragen hier denselben String "CE-1001", und ein Rückfall auf die interne
      // Bestellnummer ODER die JUMiNGO-Ordernummer wäre damit unten in EINER
      // Gegenprobe sichtbar.
      return json({
        shipmentId: 4711, orderConfirmationNumber: "CE-AB26-00001",
        businessOrderNumber: "CE-1001", invoiceNumber: "CE-RE26-00001",
        orderNumber: "CE-1001", trackingNumber: "TRK-1", status: "booked",
      });
    }

    // Formularentwurf speichern — POST (neu) oder PATCH (fortgesetzter Entwurf).
    if (p.endsWith("/api/kunde/form-drafts") && method === "POST") {
      if (scriptedFormDraftAbort) return route.abort();
      if (scriptedFormDraftStatus) return json({ error: "server_error" }, scriptedFormDraftStatus);
      return json({ draft: { id: 900, revision: 0, schemaVersion: 1 } });
    }
    if (/\/api\/kunde\/form-drafts\/\d+$/.test(p) && method === "PATCH") {
      if (scriptedFormDraftAbort) return route.abort();
      if (scriptedFormDraftStatus) return json({ error: "server_error" }, scriptedFormDraftStatus);
      return json({ draft: { id: Number(p.split("/").pop()), revision: 1, schemaVersion: 1 } });
    }
    // Formularentwurf laden — Liste (Entwürfe-Seite) und Detail (Fortsetzen).
    if (/\/api\/kunde\/form-drafts\/(\d+)$/.test(p) && method === "GET") {
      const id = Number(p.match(/\/api\/kunde\/form-drafts\/(\d+)$/)[1]);
      if (resumeDetailOverride && resumeDetailOverride.id === id) return json({ draft: resumeDetailOverride });
      return json({}, 404);
    }
    if (p.endsWith("/api/kunde/form-drafts") && method === "GET") {
      return json(formDraftListOverride || { drafts: [], nextCursor: null });
    }
    // Sendungsentwurf speichern (Buchungsseite, SaveDraftAction) — unabhängiger Pfad.
    // NUR Ziffern, exakt wie parseId() im Backend (`^[0-9]{1,15}$`): eine versehentlich
    // gesendete JUMiNGO-Referenz läuft hier — wie produktiv — ins Leere statt still zu
    // gelingen. Die zuletzt gespeicherte ID wird für die Vertragsprüfung festgehalten.
    if (/\/api\/kunde\/drafts\/\d+\/save$/.test(p)) {
      zuletztGespeicherteDraftId = p.match(/\/drafts\/(\d+)\/save$/)[1];
      if (scriptedShipmentDraftStatus) return json({ error: "server_error" }, scriptedShipmentDraftStatus);
      return json({ ok: true });
    }

    if (p.includes("/pickup-window")) return json({ pickupTimeFrom: null, pickupTimeUntil: null });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], summary: null, pagination: { total: 0 } });
  });
}

function fehlerSammler(page) {
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  return fehler;
}

/* Restliche Felder ueber ihren Platzhalter. Der frueher hier stehende Hinweis, die
   Felder truegen keine id, stimmte nicht: `addrField` vergibt jedem eine (`ns-…`).
   Kontaktperson, E-Mail und Telefon laufen deshalb unten ueber ihre ids. */
const EINGABEN = [
  ["Firma AG", "ACME Logistik GmbH"],
  ["Beispielweg 5", "Hafenstr. 12"], ["Zürich", "Hamburg"],
];

/* Kontaktperson und Pflichtkontakt ueber die STABILEN ids. Der Platzhalter des frueheren
   kombinierten Namensfeldes existiert nicht mehr, und der Profil-Seed traegt weder eine
   getrennte Kontaktperson noch eine Telefonnummer — das Konto fuehrt einen einzelnen
   Ansprechpartnernamen (der nicht zerlegt wird) und gar keine Telefonspalte. */
const KONTAKT = [
  ["ns-s-firstName", "Max"], ["ns-s-lastName", "Mustermann"],
  ["ns-s-email", "max@example.com"], ["ns-s-phone", "+49301234567"],
  ["ns-r-firstName", "Dora"], ["ns-r-lastName", "Beispiel"],
  ["ns-r-email", "dora@example.com"], ["ns-r-phone", "+49401234567"],
];

async function formularFuellen(page) {
  // Der ABSENDER kommt seit dem Paket „leerer Nullzustand" nicht mehr
  // automatisch aus dem Profil — er wird hier über dieselbe Komfortaktion
  // gefüllt, die auch der Kunde benutzt.
  const eigene = page.locator("button", { hasText: "Eigene Adresse" }).first();
  if (await eigene.count()) { await eigene.click(); await page.waitForTimeout(150); }
  // Auch das Empfängerland startet leer und muss gewählt werden.
  const land = page.locator("#ns-r-country");
  if (await land.count()) await land.selectOption("DE");

  for (const [ph, wert] of EINGABEN) {
    const el = page.locator(`input[placeholder="${ph}"]`).first();
    if (await el.count()) await el.fill(wert);
  }
  for (const [id, wert] of KONTAKT) {
    const el = page.locator(`#${id}`);
    if (await el.count()) await el.fill(wert);
  }
  const plz = page.locator('input[placeholder="26133"]');
  if (await plz.count() > 1) await plz.nth(1).fill("20457");
  // Paketfelder über ihre ids — die Platzhalter tragen jetzt „z. B." davor und
  // taugen nicht mehr als Selektor. Alle fünf sind Pflicht.
  for (const [id, wert] of [["ns-packageCount", "2"], ["ns-weight", "5.5"],
                            ["ns-length", "40"], ["ns-width", "30"], ["ns-height", "20"]]) {
    const el = page.locator(`#${id}`);
    if (await el.count()) await el.fill(wert);
  }
  await page.waitForTimeout(250);
}

/* Einen Sidebar-Eintrag anklicken — auch einen der zweiten Ebene.
   Die Gruppen sind nach jedem Reload zugeklappt, und eingeklappte Einträge
   tragen `visibility: hidden` (bewusst: weder fokussierbar noch klickbar). Ein
   direkter Klick auf `.nitem` läuft dort in einen 30-Sekunden-Timeout. Der
   Gruppenkopf ist ein echtes `<button.pp-nav-group-head>` und wird deshalb
   zuerst geöffnet — genau das tut auch ein echter Nutzer. */
async function sidebarEintrag(page, label) {
  const eintrag = page.locator(".nitem", { hasText: label }).first();
  if (!(await eintrag.isVisible().catch(() => false))) {
    for (const kopf of await page.locator("button.pp-nav-group-head").all()) {
      if ((await kopf.getAttribute("aria-expanded")) === "true") continue;
      await kopf.click();
      await page.waitForTimeout(300);
      if (await eintrag.isVisible().catch(() => false)) break;
    }
  }
  await eintrag.click();
}

/* Liest den fachlichen Zustand aus dem DOM. */
async function zustand(page) {
  return page.evaluate(() => {
    const w = {};
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (el.value && el.placeholder) w[el.placeholder] = el.value;
    }
    return {
      url: location.pathname + location.search,
      titel: document.querySelector(".ce-page-header-title, h1")?.textContent?.trim() ?? null,
      // Der Empfaengername steht seit dem Versandkontaktvertrag in ZWEI Feldern; der
      // frueher hier gelesene Platzhalter des kombinierten Feldes existiert nicht mehr
      // und lieferte deshalb null, obwohl das Formular korrekt gefuellt war.
      //
      // Zusammengesetzt wird AUSSCHLIESSLICH hier, zur Anzeige in der bestehenden
      // Zusicherung. Es entsteht dabei kein Produktionswert, kein Payloadfeld und
      // keine Rueckrichtung: gelesen werden zwei bereits strukturierte DOM-Werte.
      empfaenger: (() => {
        const v = (id) => document.getElementById(id)?.value?.trim() || "";
        return [v("ns-r-firstName"), v("ns-r-lastName")].filter(Boolean).join(" ") || null;
      })(),
      ort: w["Zürich"] || null,
      plz: w["26133"] || null,
      // Paketfelder über ihre ids: die Platzhalter heißen „z. B. 5" usw. — ein
      // Platzhalter-Selektor träfe nichts. Die Anzahl trägt als einziges Feld
      // eine Vorbelegung (PACKAGE_COUNT_DEFAULT), die übrigen starten leer.
      pakete: document.getElementById("ns-packageCount")?.value || null,
      gewicht: document.getElementById("ns-weight")?.value || null,
      laenge: document.getElementById("ns-length")?.value || null,
      breite: document.getElementById("ns-width")?.value || null,
      hoehe: document.getElementById("ns-height")?.value || null,
      angebote: document.querySelectorAll(".offer-card").length,
      ausgewaehlt: document.querySelectorAll(".offer-card--selected").length,
      keinAngebot: document.body.innerText.includes("Kein Angebot ausgewählt"),
      scrollY: Math.round(window.scrollY),
      speicher: (() => { try { return !!sessionStorage.getItem("ce_shipping_flow_v1"); } catch { return false; } })(),
    };
  });
}

/* Führt den Vorgang bis zur Buchungsseite: Formular, Berechnung, Filter,
   Sortierung, Auswahl. */
async function bisZurBuchung(page, { sortieren = true } = {}) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  if (sortieren) {
    const sort = page.locator("button").filter({ hasText: /^Günstigste$/ }).first();
    if (await sort.count()) { await sort.click(); await page.waitForTimeout(300); }
  }
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(200);
  // „Auswählen" auf der Angebotskarte führt direkt zur Buchung.
  const wahl = page.locator(".offer-card button").filter({ hasText: /Auswählen|Weiter|Buchen|wählen/i }).first();
  if (await wahl.count()) { await wahl.click(); await page.waitForTimeout(1300); }
}

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"],
    { stdio: "ignore", detached: true });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(BASE); if (r.ok) break; } catch { /* noch nicht da */ }
    if (Date.now() > frist) throw new Error("Dev-Server nicht erreichbar");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  try { await browser?.close(); } catch { /* egal */ }
  if (server) {
    try { process.kill(-server.pid, "SIGKILL"); } catch { /* schon beendet */ }
    try { server.kill("SIGKILL"); } catch { /* schon beendet */ }
  }
});

async function neueSeite() {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(ctx);
  await ctx.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return { ctx, page: await ctx.newPage() };
}

/* ══════════ 1 — sichtbares „Zurück" ═════════════════════════════════════ */

test("1 — sichtbares „Zurück\" erhält Formular, Angebote, Filter, Sortierung und Auswahl", async () => {
  const { ctx, page } = await neueSeite();
  const vorher = calcCount;
  await bisZurBuchung(page);

  const buchung = await zustand(page);
  assert.equal(buchung.url, "/booking");
  assert.equal(buchung.keinAngebot, false, "die Buchungsseite wurde nicht erreicht");
  assert.equal(calcCount - vorher, 1, "genau eine Preisberechnung");

  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1400);

  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung", "falsche Seite nach dem Zurückgehen");
  assert.equal(z.empfaenger, "Dora Beispiel", "Empfänger verloren");
  assert.equal(z.ort, "Hamburg", "Empfängerort verloren");
  assert.equal(z.plz, "20457", "Empfänger-PLZ verloren");
  assert.equal(z.pakete, "2", "Paketanzahl verloren");
  assert.equal(z.gewicht, "5.5", "Gewicht verloren");
  assert.equal(z.laenge, "40", "Länge verloren");
  assert.equal(z.breite, "30", "Breite verloren");
  assert.equal(z.hoehe, "20", "Höhe verloren");
  assert.equal(z.angebote, 2, "Angebote verloren");
  assert.equal(z.ausgewaehlt, 1, "das ausgewählte Angebot ist nicht mehr markiert");
  assert.equal(calcCount - vorher, 1, "der Restore hat eine neue Preisberechnung ausgelöst");
  await ctx.close();
});

test("2 — die Scrollposition des Angebotsvergleichs kehrt zurück", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1600);
  const y = await page.evaluate(() => Math.round(window.scrollY));
  assert.ok(y > 200, `Scrollposition nicht wiederhergestellt (scrollY = ${y})`);
  await ctx.close();
});

/* ══════════ 2 — Browser-Zurück und -Vorwärts ════════════════════════════ */

test("3 — Browser-Zurück landet auf „Neue Sendung\" und erhält dieselben Daten", async () => {
  const { ctx, page } = await neueSeite();
  const vorher = calcCount;
  await bisZurBuchung(page);

  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung", "Browser-Zurück landet auf der falschen Seite");
  assert.equal(z.empfaenger, "Dora Beispiel");
  assert.equal(z.pakete, "2");
  assert.equal(z.gewicht, "5.5");
  assert.equal(z.angebote, 2);
  assert.equal(z.ausgewaehlt, 1);
  assert.equal(calcCount - vorher, 1, "Browser-Zurück hat neu berechnet");
  await ctx.close();
});

test("4 — sichtbares „Zurück\" und Browser-Zurück führen zum selben Zustand", async () => {
  const { ctx: c1, page: p1 } = await neueSeite();
  await bisZurBuchung(p1);
  await p1.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await p1.waitForTimeout(1400);
  const a = await zustand(p1);
  await c1.close();

  const { ctx: c2, page: p2 } = await neueSeite();
  await bisZurBuchung(p2);
  await p2.goBack({ waitUntil: "networkidle" });
  await p2.waitForTimeout(1400);
  const b = await zustand(p2);
  await c2.close();

  for (const feld of ["titel", "empfaenger", "ort", "plz", "pakete", "gewicht", "laenge", "angebote", "ausgewaehlt"]) {
    assert.equal(a[feld], b[feld], `„${feld}" unterscheidet sich zwischen sichtbarem und Browser-Zurück`);
  }
});

test("5 — Browser-Vorwärts rekonstruiert die Buchungsseite", async () => {
  const { ctx, page } = await neueSeite();
  const vorher = calcCount;
  await bisZurBuchung(page);
  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await page.goForward({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const z = await zustand(page);
  assert.equal(z.url, "/booking");
  assert.equal(z.keinAngebot, false, "die Buchung wurde nicht rekonstruiert");
  assert.equal(calcCount - vorher, 1, "Vorwärts hat neu berechnet");
  await ctx.close();
});

/* Frühere Fassung dieses Tests hieß „…verlängert die History nicht" und
   sicherte damit indirekt ein `navigate(-1)` ab. Das war die falsche
   Zusicherung: der vorherige History-Eintrag sagt nichts darüber aus, welcher
   Dashboard-Bereich dahinter steckt. Die Zusicherung lautet jetzt schärfer und
   fachlich richtig — der Button ersetzt den Buchungseintrag und führt
   deterministisch zur Angebotsauswahl, unabhängig von der Browser-History. */
test("6 — der sichtbare Zurück-Button ersetzt den Buchungseintrag (kein Kreislauf)", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  const laengeVorher = await page.evaluate(() => history.length);

  // Zweimal Angebote → Buchung → Zurück. Die History darf dabei nicht wachsen.
  for (let i = 0; i < 2; i++) {
    await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
    await page.waitForTimeout(1300);
    assert.equal((await zustand(page)).titel, "Neue Sendung", `Durchgang ${i + 1}: falsche Seite`);
    const wahl = page.locator(".offer-card button").filter({ hasText: /Auswählen|Weiter|Buchen|wählen/i }).first();
    await wahl.click();
    await page.waitForTimeout(1300);
  }
  assert.equal(await page.evaluate(() => history.length), laengeVorher,
    "die History wächst bei jedem Zurück-Klick");

  // Und nach dem sichtbaren Zurück darf ein Browser-Zurück NICHT wieder
  // unmittelbar in der Buchung landen — der Eintrag wurde ersetzt, nicht gestapelt.
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1300);
  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  assert.notEqual((await zustand(page)).url, "/booking",
    "Browser-Zurück nach dem sichtbaren Zurück führt wieder in die Buchung");
  await ctx.close();
});

/* ══════════ 3 — Reload ══════════════════════════════════════════════════ */

test("7 — Reload auf „Neue Sendung\" startet einen LEEREN Vorgang", async () => {
  // UMGEKEHRT gegenüber dem Vorzustand: bis zum Paket „leerer Nullzustand"
  // stellte ein Reload Formular und Angebote aus dem sessionStorage wieder her.
  // Das war fachlich falsch — „Neue Sendung" ist ein NEUER Vorgang, und ein F5
  // holte Adressen und Paketdaten zurück, die der Kunde nie gespeichert hatte.
  // Der Vorgang lebt seitdem nur im Arbeitsspeicher: er übersteht jeden Wechsel
  // INNERHALB der Sitzung (Tests 1–6, 10 ff.) und endet mit dem Reload.
  const { ctx, page } = await neueSeite();
  const vorher = calcCount;
  await bisZurBuchung(page);
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1300);

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);

  const z = await zustand(page);
  assert.equal(z.empfaenger, null, "der Reload hat das Formular wiederhergestellt");
  assert.equal(z.gewicht, null, "der Reload hat die Paketdaten wiederhergestellt");
  assert.equal(z.angebote, 0, "der Reload hat die Angebote wiederhergestellt");
  assert.equal(calcCount - vorher, 1, "der Reload hat neu berechnet");
  // Und im Speicher liegt tatsächlich nichts mehr.
  const rest = await page.evaluate((k) => sessionStorage.getItem(k), SPEICHER);
  assert.equal(rest, null, "der Vorgang liegt weiterhin im sessionStorage");
  await ctx.close();
});

test("8 — Reload auf der Buchungsseite funktioniert weiterhin", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1300);
  const z = await zustand(page);
  assert.equal(z.url, "/booking");
  assert.equal(z.keinAngebot, false, "der Reload hat den Buchungsvorgang verloren");
  await ctx.close();
});

test("9 — direkter Einstieg auf /booking ohne Vorgang bleibt sicher", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/booking`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const z = await zustand(page);
  assert.equal(z.keinAngebot, true, "ohne Vorgang muss „Kein Angebot ausgewählt\" stehen");
  await ctx.close();
});

/* ══════════ 4 — Sidebar ═════════════════════════════════════════════════ */

test("10 — „Neue Sendung“ über die Sidebar startet einen FRISCHEN Vorgang", async () => {
  // UMGEKEHRT gegenüber dem Vorzustand: bis zum Paket „leerer Nullzustand"
  // erhielt dieser Weg den laufenden Vorgang. Das war fachlich falsch — wer in
  // der Navigation „Neue Sendung" wählt, will eine NEUE Sendung, nicht die
  // halb fertige von vorhin. Der laufende Vorgang bleibt weiterhin erhalten,
  // wenn der Kunde aus der Buchung heraus „Zurück" drückt (Tests 1–6): dieser
  // Weg läuft nicht über die Navigation, sondern über `state.page`.
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  assert.equal((await zustand(page)).angebote, 2, "Vorbedingung: es gibt Angebote");

  await page.locator(".nitem", { hasText: "Rechnungen" }).first().click();
  await page.waitForTimeout(700);
  // Der Verlassen-Dialog bleibt unverändert erhalten — er warnt weiter vor
  // ungespeicherten Angaben. „Verwerfen" heißt hier: ohne Entwurf weitergehen.
  const dialog = page.locator("[role=dialog]");
  if (await dialog.count()) {
    const weiter = dialog.locator("button").filter({ hasText: /Verwerfen|Ohne Speichern|Trotzdem/i }).first();
    if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(700); }
  }

  // Zurück über die Navigation.
  await sidebarEintrag(page, "Neue Sendung");
  await page.waitForTimeout(1300);

  const z = await zustand(page);
  assert.equal(z.empfaenger, null, "der alte Empfänger steht noch im Formular");
  assert.equal(z.gewicht, null, "die alten Paketdaten stehen noch im Formular");
  assert.equal(z.angebote, 0, "die alten Angebote sind noch da");
  await ctx.close();
});

/* ══════════ 5 — Löschen ═════════════════════════════════════════════════ */

test("11 — Abmelden löscht Vorgang und Speicher", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.waitForTimeout(600);
  // Der Vorgang wird seit dem Paket „leerer Nullzustand" NICHT mehr in den
  // sessionStorage gespiegelt — er lebt nur im Arbeitsspeicher. Die frühere
  // Vorbedingung „der Vorgang wurde gespiegelt" ist damit gegenstandslos; der
  // Speicher muss im Gegenteil schon vor der Abmeldung leer sein.
  assert.equal((await zustand(page)).speicher, false, "der Vorgang wurde doch gespiegelt");
  assert.equal((await zustand(page)).empfaenger, "Dora Beispiel", "Vorbedingung: das Formular ist gefüllt");

  await page.locator(".nitem", { hasText: "Abmelden" }).first().click();
  await page.waitForTimeout(1200);
  const dialog = page.locator("[role=dialog]");
  if (await dialog.count()) {
    const weiter = dialog.locator("button").filter({ hasText: /Verwerfen|Ohne Speichern|Trotzdem|Abmelden/i }).first();
    if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(1200); }
  }

  const nachher = await page.evaluate((k) => ({
    url: location.pathname,
    speicher: (() => { try { return sessionStorage.getItem(k); } catch { return null; } })(),
  }), SPEICHER);
  assert.equal(nachher.url, "/login");
  assert.equal(nachher.speicher, null, "der Vorgang liegt nach der Abmeldung noch im Speicher");
  await ctx.close();
});

test("12 — erfolgreiche Buchung löscht den Vorgang, der Erfolgsbildschirm bleibt", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);

  // Schritt 1 → 2
  const weiter = page.locator("button").filter({ hasText: /Weiter: Buchung/ }).first();
  if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(900); }
  // Pflichtbestätigungen
  for (const box of await page.locator('input[type="checkbox"]').all()) {
    if (await box.isVisible()) await box.check().catch(() => {});
  }
  await page.waitForTimeout(300);
  const buchen = page.locator("button").filter({ hasText: /Jetzt kostenpflichtig buchen|Jetzt buchen|Kostenpflichtig buchen/i }).first();
  if (!(await buchen.count())) { await ctx.close(); return; }   // Buchungs-CTA nicht erreichbar → Test überspringen
  await buchen.click();
  await page.waitForTimeout(1800);

  const nachher = await page.evaluate((k) => ({
    text: document.body.innerText,
    speicher: (() => { try { return sessionStorage.getItem(k); } catch { return null; } })(),
  }), SPEICHER);
  if (!/CE-AB26-00001|gebucht|erfolgreich/i.test(nachher.text)) { await ctx.close(); return; }
  assert.equal(nachher.speicher, null, "nach der Buchung liegt der Vorgang noch im Speicher");
  // Der Erfolgsbildschirm lebt aus `booking`, nicht aus dem gelöschten Vorgang:
  // Vorgangsnummer und Rechnungsnummer müssen weiterhin dastehen. Sichtbare
  // Vorgangsnummer ist die Auftragsbestätigung (CE-AB…).
  assert.ok(nachher.text.includes("CE-AB26-00001"), "die Vorgangsnummer wurde zu früh entfernt");
  assert.ok(nachher.text.includes("CE-RE26-00001"), "die Rechnungsnummer wurde zu früh entfernt");
  // Gegenprobe: "CE-1001" steht im Mock sowohl als interne Bestellnummer als auch als
  // JUMiNGO-Ordernummer. Erscheint der String, ist der Erfolgsbildschirm auf eine der
  // beiden zurückgefallen — beides ist ausgeschlossen.
  assert.ok(!nachher.text.includes("CE-1001"),
    "der Erfolgsbildschirm fällt auf die interne Bestellnummer oder die Providerreferenz zurück");

  // Und „Neue Sendung" vom Erfolgsbildschirm startet leer.
  // NICHT `.nitem`: der gleichnamige Sidebar-Eintrag liegt in einer
  // zugeklappten Gruppe und ist `visibility: hidden`. Gemeint ist der Knopf
  // AUF dem Erfolgsbildschirm.
  const neu = page.locator("button:not(.nitem)").filter({ hasText: /^Neue Sendung$/ }).first();
  if (await neu.count()) {
    await neu.click();
    await page.waitForTimeout(1200);
    const leer = await page.evaluate((k) => ({
      empfaenger: [...document.querySelectorAll("input")].find((i) => i.placeholder === "Erika Muster")?.value || null,
      speicher: (() => { try { return sessionStorage.getItem(k); } catch { return null; } })(),
    }), SPEICHER);
    assert.equal(leer.speicher, null, "der Neustart hat einen Vorgang zurückgelassen");
    assert.equal(leer.empfaenger, null, "der Neustart ist nicht leer");
  }
  await ctx.close();
});

test("13 — „Eingaben zurücksetzen\" startet bewusst leer", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  assert.equal((await zustand(page)).angebote, 2);

  await page.locator("button", { hasText: "Eingaben zurücksetzen" }).first().click();
  await page.waitForTimeout(500);
  const bestaetigen = page.locator("[role=dialog] button").filter({ hasText: /^Zurücksetzen$/ }).first();
  assert.ok(await bestaetigen.count(), "es fehlt die Rückfrage vor dem Verwerfen");
  await bestaetigen.click();
  await page.waitForTimeout(900);

  const z = await zustand(page);
  assert.equal(z.empfaenger, null, "der Empfänger wurde nicht geleert");
  assert.equal(z.angebote, 0, "die Angebote wurden nicht verworfen");
  // Die Paketanzahl ist die EINZIGE dokumentierte Ausnahme vom leeren
  // Ausgangszustand (PACKAGE_COUNT_DEFAULT, utils/newShipmentForm.mjs): sie
  // startet mit „1". Alles ANDERE am Formular ist nach dem Zurücksetzen leer —
  // genau das prüfen die Zeilen darüber und darunter weiterhin.
  assert.equal(z.pakete, PACKAGE_COUNT_DEFAULT, "die Paketanzahl trägt nicht ihre dokumentierte Vorbelegung");
  assert.equal(z.gewicht, null, "das Gewicht wurde nicht geleert");
  assert.equal(z.laenge, null, "die Maße wurden nicht geleert");
  await ctx.close();
});

/* ══════════ 6 — mehrere Tabs ════════════════════════════════════════════ */

test("14 — zwei Tabs beeinflussen sich nicht", async () => {
  const { ctx: c1, page: tabA } = await neueSeite();
  await tabA.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await tabA.waitForTimeout(600);
  await formularFuellen(tabA);
  await tabA.waitForTimeout(500);

  // Zweiter Tab: EIGENER Kontext = eigene Tab-Sitzung.
  const { ctx: c2, page: tabB } = await neueSeite();
  await tabB.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await tabB.waitForTimeout(900);
  const zB = await zustand(tabB);
  assert.equal(zB.empfaenger, null, "der Vorgang aus Tab A ist nach Tab B gewandert");

  // Direkter Einstieg auf /booking in Tab B bleibt sicher.
  await tabB.goto(`${BASE}/booking`, { waitUntil: "networkidle" });
  await tabB.waitForTimeout(800);
  assert.equal((await zustand(tabB)).keinAngebot, true);

  // Tab A ist von Tab B unberührt — solange er nicht neu geladen wird.
  assert.equal((await zustand(tabA)).empfaenger, "Dora Beispiel", "Tab B hat Tab A überschrieben");
  // Nach einem Reload startet auch Tab A leer: der Vorgang lebt nur im
  // Arbeitsspeicher, es gibt keine tab-lokale Wiederherstellung mehr. Die
  // Unabhängigkeit der Tabs ist damit strukturell — es wird schlicht nichts
  // geteilt, weder zwischen Tabs noch über einen Reload hinweg.
  await tabA.reload({ waitUntil: "networkidle" });
  await tabA.waitForTimeout(1200);
  assert.equal((await zustand(tabA)).empfaenger, null, "der Reload hat Tab A wiederhergestellt");
  await c1.close();
  await c2.close();
});

/* ══════════ 7 — Ablauf und Robustheit ═══════════════════════════════════ */

test("15 — es wird NICHTS gespiegelt, also kann auch nichts ablaufen", async () => {
  // ERSETZT den früheren Ablauftest. Die 60-Minuten-Frist gab es ausschließlich,
  // damit ein aus dem sessionStorage WIEDERHERGESTELLTER Vorgang keine veralteten
  // Angebote zeigt. Mit dem Paket „leerer Nullzustand" gibt es keine
  // Wiederherstellung mehr — der Vorgang endet mit dem Reload, und damit ist die
  // Frist gegenstandslos. Geprüft wird deshalb die Zusage, die an ihre Stelle
  // getreten ist: es entsteht überhaupt kein Speichereintrag.
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  assert.equal((await zustand(page)).angebote, 2, "Vorbedingung: es gibt Angebote");

  // Weder Formular noch Angebote landen in irgendeinem Speicher.
  const gespeichert = await page.evaluate((k) => ({
    sitzung: (() => { try { return sessionStorage.getItem(k); } catch { return null; } })(),
    sitzungSchluessel: (() => { try { return Object.keys(sessionStorage); } catch { return []; } })(),
    lokal: (() => { try { return Object.keys(localStorage); } catch { return []; } })(),
  }), SPEICHER);
  assert.equal(gespeichert.sitzung, null, "der Vorgang wird wieder gespiegelt");
  assert.deepEqual(gespeichert.sitzungSchluessel, [], "es liegt etwas im sessionStorage");
  assert.deepEqual(gespeichert.lokal, ["ce_token"], "es liegt etwas Zusätzliches im localStorage");
  await ctx.close();
});

test("16 — beschädigter Speicherinhalt bricht die Seite nicht", async () => {
  const { ctx, page } = await neueSeite();
  await page.addInitScript((k) => {
    try { sessionStorage.setItem(k, "{kaputt::"); } catch { /* egal */ }
  }, SPEICHER);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung", "die Seite ist an beschädigten Daten gescheitert");
  assert.equal(z.empfaenger, null);
  await ctx.close();
});

test("17 — eine fremde Schemaversion wird verworfen statt migriert", async () => {
  const { ctx, page } = await neueSeite();
  await page.addInitScript((k) => {
    try {
      sessionStorage.setItem(k, JSON.stringify({
        v: 99, createdAt: Date.now(), updatedAt: Date.now(),
        shipment: { form: { r_fullName: "Fremd" }, tariffs: [{ id: "x" }] },
      }));
    } catch { /* egal */ }
  }, SPEICHER);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const z = await zustand(page);
  assert.equal(z.empfaenger, null, "ein Vorgang fremder Version wurde übernommen");
  assert.equal(z.angebote, 0);
  await ctx.close();
});

test("18 — ohne verfügbaren sessionStorage funktioniert die Seite weiter", async () => {
  const { ctx, page } = await neueSeite();
  await page.addInitScript(() => {
    // Speicher blockieren, wie im strengen Privatmodus.
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() { throw new DOMException("blockiert", "SecurityError"); },
    });
  });
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  const z = await zustand(page);
  assert.equal(z.angebote, 2, "die Berechnung ist am gesperrten Speicher gescheitert");
  assert.equal(z.empfaenger, "Dora Beispiel");
  await ctx.close();
});

/* ══════════ 8 — unveränderte Verträge ═══════════════════════════════════ */

test("19 — kein Vorgangsinhalt verlässt den Arbeitsspeicher", async () => {
  // Die frühere Fassung durchsuchte den gespiegelten Vorgang nach Tokens,
  // Passwörtern und Dokumenten. Diese Zusage ist seit dem Paket „leerer
  // Nullzustand" strikt STÄRKER erfüllt: es wird gar nichts mehr gespiegelt,
  // also kann auch nichts durchsickern. Geprüft wird deshalb, dass nach einem
  // vollständigen Vorgang bis zur Buchungsseite wirklich kein Eintrag
  // zurückbleibt — und dass der einzige localStorage-Schlüssel weiterhin das
  // Sitzungstoken ist.
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  const speicher = await page.evaluate(() => ({
    sitzung: (() => { try { return Object.keys(sessionStorage); } catch { return []; } })(),
    lokal: (() => { try { return Object.keys(localStorage); } catch { return []; } })(),
  }));
  assert.deepEqual(speicher.sitzung, [], "der Vorgang hat etwas im sessionStorage hinterlassen");
  assert.deepEqual(speicher.lokal, ["ce_token"], "der Vorgang wurde im localStorage abgelegt");
  await ctx.close();
});

test("20 — der /book-Payload bleibt feldgleich", async () => {
  const { ctx, page } = await neueSeite();
  let payload = null;
  await page.route("**/api.confidaraexpress.de/api/jumingo/book", async (route) => {
    payload = JSON.parse(route.request().postData() || "{}");
    await route.fulfill({ status: 200, contentType: "application/json",
      body: JSON.stringify({ shipmentId: 4711, orderNumber: "CE-1001", trackingNumber: "TRK-1", status: "booked" }) });
  });
  await bisZurBuchung(page);
  const weiter = page.locator("button").filter({ hasText: /Weiter: Buchung/ }).first();
  if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(900); }
  for (const box of await page.locator('input[type="checkbox"]').all()) {
    if (await box.isVisible()) await box.check().catch(() => {});
  }
  const buchen = page.locator("button").filter({ hasText: /Jetzt kostenpflichtig buchen|Jetzt buchen|Kostenpflichtig buchen/i }).first();
  if (!(await buchen.count())) { await ctx.close(); return; }
  await buchen.click();
  await page.waitForTimeout(1500);

  if (!payload) { await ctx.close(); return; }
  for (const feld of ["shipmentId", "tariffId", "price_final", "sender", "recipient",
                      "weight", "content", "labelFormat", "insuranceSelection"]) {
    assert.ok(feld in payload, `/book-Payload: „${feld}" fehlt`);
  }
  // Der Navigationsmarker darf NIE im Payload landen.
  assert.ok(!("fromFlow" in payload), "der Navigationsmarker ist in den Buchungspayload geraten");
  // Der Payload traegt die Kontaktperson strukturiert.
  assert.equal(payload.sender.firstName, "Max");
  assert.equal(payload.sender.lastName, "Mustermann");
  assert.equal(payload.recipient.firstName, "Dora");
  assert.equal(payload.recipient.lastName, "Beispiel");
  await ctx.close();
});

/* ══════════ 9 — Determinismus des sichtbaren Zurück-Buttons ══════════════
   Der eigentliche Fehler war NICHT der Zustandsverlust, sondern das Ziel: der
   Button entschied per navigate(-1) anhand des vorherigen History-Eintrags.
   Die Sidebar-Navigation setzt aber nur den lokalen page-State und fasst die
   History gar nicht an — wer über „Übersicht", „Rechnungen", „Entwürfe" oder
   „Profil" nach „Neue Sendung" gewechselt war, landete deshalb wieder dort.

   Diese Tests fahren jeden dieser Wege über die echte Sidebar ab. */

/* Wechselt über die Sidebar durch die genannten Bereiche. Genau der Weg eines
   echten Nutzers — und der, der die History unberührt lässt. */
async function ueberSidebar(page, ziele) {
  for (const ziel of ziele) {
    const eintrag = page.locator(".nitem", { hasText: ziel }).first();
    // Einträge einer zugeklappten Gruppe tragen `visibility: hidden` und sind
    // damit weder fokussierbar noch klickbar (bewusst so). Ist das Ziel nicht
    // sichtbar, wird die passende Gruppe zuerst geöffnet — genau das tut auch
    // ein echter Nutzer.
    if (await eintrag.count() && !(await eintrag.isVisible())) {
      for (const kopf of await page.locator("button.pp-nav-group-head").all()) {
        if ((await kopf.getAttribute("aria-expanded")) === "true") continue;
        await kopf.click();
        await page.waitForTimeout(300);
        if (await eintrag.isVisible()) break;
      }
    }
    if (await eintrag.count()) { await eintrag.click(); await page.waitForTimeout(700); }
    const dialog = page.locator("[role=dialog]");
    if (await dialog.count()) {
      const weiter = dialog.locator("button").filter({ hasText: /Verwerfen|Ohne Speichern|Trotzdem/i }).first();
      if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(600); }
    }
  }
}

const STARTWEGE = [
  ["Übersicht", ["Übersicht", "Neue Sendung"]],
  ["Rechnungen", ["Rechnungen", "Neue Sendung"]],
  ["Profil", ["Unternehmen & Konto", "Neue Sendung"]],
  ["mehrere Reiter", ["Übersicht", "Sendungen", "Rechnungen", "Unternehmen & Konto", "Neue Sendung"]],
];

for (const [name, weg] of STARTWEGE) {
  test(`21 — sichtbares Zurück landet bei den Angeboten (Start über ${name})`, async () => {
    const { ctx, page } = await neueSeite();
    const vorher = calcCount;
    // Einstieg wie nach dem Login: /dashboard OHNE ?page=.
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await ueberSidebar(page, weg);
    await page.waitForTimeout(400);
    assert.equal((await zustand(page)).titel, "Neue Sendung", "Sidebar-Weg nicht angekommen");

    await formularFuellen(page);
    await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
    await page.waitForTimeout(1400);
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(200);
    const wahl = page.locator(".offer-card button").filter({ hasText: /Auswählen|Weiter|Buchen|wählen/i }).first();
    await wahl.click();
    await page.waitForTimeout(1300);
    assert.equal((await zustand(page)).url, "/booking");

    await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
    await page.waitForTimeout(1500);

    const z = await zustand(page);
    assert.equal(z.titel, "Neue Sendung", `Start über ${name}: gelandet auf „${z.titel}"`);
    assert.equal(z.angebote, 2, "Angebote fehlen");
    assert.equal(z.ausgewaehlt, 1, "das gewählte Angebot ist nicht markiert");
    assert.equal(z.empfaenger, "Dora Beispiel");
    assert.equal(z.pakete, "2");
    assert.equal(z.gewicht, "5.5");
    assert.equal(z.laenge, "40");
    assert.ok(z.scrollY > 200, `Scrollposition nicht wiederhergestellt (${z.scrollY})`);
    assert.equal(calcCount - vorher, 1, "der Restore hat neu berechnet");
    await ctx.close();
  });
}

test("22 — auch Browser-Zurück landet nach einem Sidebar-Weg bei „Neue Sendung\"", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await ueberSidebar(page, ["Übersicht", "Rechnungen", "Neue Sendung"]);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  const wahl = page.locator(".offer-card button").filter({ hasText: /Auswählen|Weiter|Buchen|wählen/i }).first();
  await wahl.click();
  await page.waitForTimeout(1300);

  await page.goBack({ waitUntil: "networkidle" });
  await page.waitForTimeout(1400);
  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung", `Browser-Zurück landete auf „${z.titel}"`);
  assert.equal(z.angebote, 2);
  assert.equal(z.empfaenger, "Dora Beispiel");
  await ctx.close();
});

test("23 — ohne gemerkte Scrollposition wird der Angebotsbereich angesteuert", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  // Ganz nach oben — die gemerkte Position ist damit 0.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const wahl = page.locator(".offer-card button").filter({ hasText: /Auswählen|Weiter|Buchen|wählen/i }).first();
  await wahl.click();
  await page.waitForTimeout(1300);
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1800);

  // Der Angebotsbereich muss im sichtbaren Fenster liegen — geprüft am echten
  // Element, nicht an einem Pixelwert.
  const sichtbar = await page.evaluate(() => {
    const el = document.getElementById("angebotsbereich");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  });
  assert.equal(sichtbar, true, "der Angebotsbereich wurde nicht angesteuert");
  await ctx.close();
});

test("24 — direkter Einstieg auf /booking: der Zurück-Button bleibt gefahrlos", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/booking`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  // Ohne Vorgang steht dort „Kein Angebot ausgewählt" — es gibt keinen
  // Zurück-Button, sondern den Weg zum Preisrechner. Kein Absturz, keine
  // Navigation ins Leere.
  const z = await zustand(page);
  assert.equal(z.keinAngebot, true);
  const zurueck = page.locator("button").filter({ hasText: /^← Zurück$/ });
  assert.equal(await zurueck.count(), 0, "der Zurück-Button erscheint ohne Vorgang");
  await ctx.close();
});

/* ══════════ 10 — Entwurf speichern beendet den aktiven Vorgang ═══════════
   Fehlerbild: nach erfolgreichem „Als Entwurf speichern" blieb der bisherige
   ShippingFlow bestehen — die nächste „Neue Sendung" zeigte die gerade
   gespeicherte Sendung erneut (Formular, Angebote, Filter, Auswahl). Zwei
   unabhängige Speicherpfade sind betroffen: der Formularentwurf auf „Neue
   Sendung" und der Sendungsentwurf auf der Buchungsseite. Beide müssen den
   Vorgang NUR nach bestätigtem Erfolg beenden — bei jedem Fehler bleibt alles
   unangetastet, der Kunde kann erneut speichern. */

test("25 — erfolgreiches Speichern eines Formularentwurfs setzt Formular, Angebote und Speicher sofort zurück", async () => {
  const { ctx, page } = await neueSeite();
  const fehler = fehlerSammler(page);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  // Nur auswählen (nicht buchen) — der Speicherpfad läuft auf „Neue Sendung".
  await page.locator(".offer-card").first().click();
  await page.waitForTimeout(400);

  const vor = await zustand(page);
  // Seit dem Paket „leerer Nullzustand" wird nichts mehr gespiegelt. Die
  // Vorbedingung ist deshalb der SICHTBARE Vorgang, nicht ein Speicherinhalt.
  assert.equal(vor.speicher, false, "der Vorgang wurde doch gespiegelt");
  assert.equal(vor.empfaenger, "Dora Beispiel", "Vorbedingung: das Formular ist gefüllt");
  assert.equal(vor.angebote, 2);

  await page.locator("button.dft-savedraft-cta").click();
  await page.waitForTimeout(1000);

  // Gezielt die Erfolgsquittung, nicht „irgendeine Hinweiszeile": `.dft-save-status`
  // ist die gemeinsame Klasse aller ruhigen Hinweiszeilen (Vorgangshinweis,
  // Rechenhinweis, Paketpflicht, Speicherquittung). Nach dem Speichern steht das
  // Formular wieder leer da, also erscheint zusätzlich der Paketpflicht-Hinweis —
  // ein unspezifischer Locator träfe zwei Knoten, Playwright bräche im Strict-Mode
  // ab, und das `.catch(() => "")` machte daraus stillschweigend "".
  const meldung = await page.locator(".dft-save-status", { hasText: "Entwurf gespeichert" })
    .first().innerText().catch(() => "");
  assert.ok(/Entwurf gespeichert/.test(meldung), `keine Erfolgsmeldung („${meldung}")`);

  const nach = await zustand(page);
  assert.equal(nach.speicher, false, "der Vorgang liegt nach dem Speichern noch im sessionStorage");
  assert.equal(nach.empfaenger, null, "der Empfänger wurde nicht zurückgesetzt");
  assert.equal(nach.pakete, PACKAGE_COUNT_DEFAULT, "die Paketanzahl trägt nicht ihre dokumentierte Vorbelegung");
  assert.equal(nach.gewicht, null, "das Gewicht wurde nicht geleert");
  assert.equal(nach.angebote, 0, "die Angebote wurden nicht entfernt");
  assert.equal(nach.ausgewaehlt, 0, "die Auswahl wurde nicht entfernt");
  assert.deepEqual(fehler, [], "unerwartete Seitenfehler: " + fehler.join(" | "));
  await ctx.close();
});

test("26 — nach dem Speichern öffnet ein Reiterwechsel zu „Neue Sendung\" ein vollständig leeres Formular", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  await page.locator(".offer-card").first().click();
  await page.waitForTimeout(400);
  await page.locator("button.dft-savedraft-cta").click();
  await page.waitForTimeout(1000);
  // Kein gemerktes Scrollziel darf den Reset überleben — sonst würde ein
  // künftiger Restore (fälschlich) wieder zu einer alten Position springen.
  assert.equal((await zustand(page)).speicher, false, "nach dem Speichern liegt noch ein Vorgang (inkl. Scrollziel) im Speicher");

  await page.locator(".nitem", { hasText: "Übersicht" }).first().click();
  await page.waitForTimeout(600);
  await sidebarEintrag(page, "Neue Sendung");
  await page.waitForTimeout(900);

  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung");
  assert.equal(z.empfaenger, null, "der Empfänger erscheint nach dem Reiterwechsel erneut");
  assert.equal(z.ort, null, "der Zielort erscheint nach dem Reiterwechsel erneut");
  assert.equal(z.pakete, PACKAGE_COUNT_DEFAULT, "die Paketanzahl trägt nicht ihre dokumentierte Vorbelegung");
  assert.equal(z.gewicht, null);
  assert.equal(z.laenge, null);
  assert.equal(z.angebote, 0, "alte Angebote erscheinen nach dem Reiterwechsel erneut");
  assert.equal(z.ausgewaehlt, 0);
  assert.equal(z.speicher, false);
  await ctx.close();
});

test("27 — ein Tastenanschlag direkt nach dem Speichern schreibt die alten Angebote nicht in den Speicher zurück", async () => {
  const { ctx, page } = await neueSeite();
  const fehler = fehlerSammler(page);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  await page.locator(".offer-card").first().click();
  await page.waitForTimeout(400);
  await page.locator("button.dft-savedraft-cta").click();
  await page.waitForTimeout(1000);

  // Genau der Moment aus der Persistenz-Falle: die Seite bleibt gemountet,
  // der an lokale Werte gebundene Spiegel-Effekt würde bei veraltetem
  // Zustand sofort wieder feuern und die alten Tarife zurückschreiben.
  await page.locator("#ns-r-firstName").fill("X");
  await page.waitForTimeout(400);

  // Mit dem Wegfall des Spiegels ist die Falle strukturell erledigt: es gibt
  // keinen Effekt mehr, der überhaupt etwas zurückschreiben könnte. Der
  // Speicher muss deshalb LEER bleiben. Der Tastenanschlag muss trotzdem
  // angekommen sein — sonst prüfte der Test einen toten Ablauf.
  const roh = await page.evaluate((k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, SPEICHER);
  assert.equal(roh, null, "nach dem Tastenanschlag liegt wieder ein Vorgang im sessionStorage");
  const nach = await zustand(page);
  assert.equal(nach.empfaenger, "X", "der Tastenanschlag kam nicht an — der Test prüfte einen toten Ablauf");
  assert.equal(nach.angebote, 0, "die alten Angebote kamen nach dem Tastenanschlag zurück");
  assert.deepEqual(fehler, [], "unerwartete Seitenfehler: " + fehler.join(" | "));
  await ctx.close();
});

test("28 — ein Serverfehler beim Speichern lässt Formular, Angebote und Vorgang unangetastet", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  await page.locator(".offer-card").first().click();
  await page.waitForTimeout(400);

  scriptedFormDraftStatus = 500;
  await page.locator("button.dft-savedraft-cta").click();
  await page.waitForTimeout(1000);
  scriptedFormDraftStatus = 0;

  const meldung = await page.locator(".dft-save-alert").innerText().catch(() => "");
  assert.ok(/nicht gespeichert werden/.test(meldung), `keine Fehlermeldung („${meldung}")`);

  const z = await zustand(page);
  assert.equal(z.empfaenger, "Dora Beispiel", "der Empfänger ging trotz Fehler verloren");
  assert.equal(z.angebote, 2, "die Angebote gingen trotz Fehler verloren");
  assert.equal(z.ausgewaehlt, 1, "die Auswahl ging trotz Fehler verloren");
  // Dass der Vorgang lebt, belegen die drei Zeilen darüber — er steht sichtbar
  // auf der Seite. Der Speicher bleibt dabei unverändert leer: auch im
  // Fehlerfall wird nichts gespiegelt.
  assert.equal(z.speicher, false, "der Vorgang wurde doch gespiegelt");
  await ctx.close();
});

test("29 — ein Netzwerkfehler beim Speichern (catch-Zweig) lässt Formular, Angebote und Vorgang unangetastet", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
  await page.waitForTimeout(1400);
  await page.locator(".offer-card").first().click();
  await page.waitForTimeout(400);

  scriptedFormDraftAbort = true;
  await page.locator("button.dft-savedraft-cta").click();
  await page.waitForTimeout(1000);
  scriptedFormDraftAbort = false;

  const meldung = await page.locator(".dft-save-alert").innerText().catch(() => "");
  assert.ok(/nicht gespeichert werden/.test(meldung), `keine Fehlermeldung („${meldung}")`);

  const z = await zustand(page);
  assert.equal(z.empfaenger, "Dora Beispiel", "der Empfänger ging trotz Netzwerkfehler verloren");
  assert.equal(z.angebote, 2, "die Angebote gingen trotz Netzwerkfehler verloren");
  // Wie in Test 28: der lebende Vorgang steht sichtbar auf der Seite, der
  // Speicher bleibt leer.
  assert.equal(z.speicher, false, "der Vorgang wurde doch gespiegelt");
  await ctx.close();
});

test("30 — der gespeicherte Formularentwurf erscheint in der Entwürfe-Liste", async () => {
  const { ctx, page } = await neueSeite();
  formDraftListOverride = {
    drafts: [{
      id: 950, kind: "form", schemaVersion: 1, revision: 0,
      summary: {
        sender: { company: "ACME Logistik GmbH", city: "Zürich", country: "CH" },
        recipient: { company: null, city: "Hamburg", country: "DE" },
        packages: { packageCount: 2, weight: 5.5 },
        shippingDate: null,
      },
      createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z",
    }],
    nextCursor: null,
  };
  await page.goto(`${BASE}/dashboard?page=drafts`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  const text = await page.locator("body").innerText();
  assert.ok(text.includes("Hamburg"), "der gespeicherte Entwurf erscheint nicht in der Entwürfe-Liste");
  const fortsetzen = page.locator(".dft-resume-btn");
  assert.ok(await fortsetzen.count() > 0, "der Entwurf bietet keine „Fortsetzen\"-Aktion an");
  formDraftListOverride = null;
  await ctx.close();
});

test("31 — „Entwurf fortsetzen\" überschreibt einen vorhandenen Sitzungsvorgang vollständig, statt zu mischen", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page); // hinterlässt einen UNGESICHERTEN Sitzungsvorgang mit „Dora Beispiel"
  await page.waitForTimeout(600);
  // Der Sitzungsvorgang lebt im Arbeitsspeicher, nicht im sessionStorage.
  const vorher = await zustand(page);
  assert.equal(vorher.speicher, false, "der Vorgang wurde doch gespiegelt");
  assert.equal(vorher.empfaenger, "Dora Beispiel", "Vorbedingung: ein ungesicherter Sitzungsvorgang liegt vor");

  formDraftListOverride = {
    drafts: [{
      id: 951, kind: "form", schemaVersion: 1, revision: 2,
      summary: {
        sender: { company: "Andere Firma GmbH", city: "München", country: "DE" },
        recipient: { company: "Fortsetzen Empfänger AG", city: "Köln", country: "DE" },
        packages: { packageCount: 3, weight: 9.5 }, shippingDate: null,
      },
      createdAt: "2026-08-01T10:00:00.000Z", updatedAt: "2026-08-01T10:00:00.000Z",
    }],
    nextCursor: null,
  };
  resumeDetailOverride = {
    id: 951, revision: 2, schemaVersion: 1,
    formData: {
      // Ein HEUTE gespeicherter Formularentwurf. Er traegt die Kontaktperson deshalb
      // strukturiert — `fullName` waere hier ein Altbestandswert, den es bei einem
      // frisch gespeicherten Entwurf nicht gibt, und `mapParty` zerlegt ihn bewusst
      // nicht. Die Legacyform wird an ihrer eigenen Stelle geprueft (formDraftsView).
      sender: { company: "Andere Firma GmbH", firstName: "Otto", lastName: "Absender",
                email: "otto@example.com", phone: "+49301234567",
                streetAndNumber: "Kurfürstendamm 1", postalCode: "10707", city: "Berlin", country: "DE" },
      recipient: { company: "Fortsetzen Empfänger AG", firstName: "Frieda", lastName: "Fortsetzen",
                   email: "frieda@example.com", phone: "+492211234567",
                   streetAndNumber: "Domplatz 1", postalCode: "50667", city: "Köln", country: "DE" },
      packages: { packageCount: 3, weight: 9.5, length: 50, width: 40, height: 30 },
      shippingOptions: { shippingDate: null, serviceFilter: "all", shippingModeFilter: "all", publicCarrierIds: [] },
    },
  };

  await sidebarEintrag(page, "Entwürfe");
  await page.waitForTimeout(700);
  // Der Verlassen-Dialog bleibt erhalten (ungesicherte Angaben) — „Verwerfen"
  // heißt: ohne Formularentwurf weitergehen. Der Sitzungsvorgang selbst bleibt
  // davon unberührt (siehe Test 10) — genau DAS soll hier geprüft werden.
  const dialog = page.locator("[role=dialog]");
  if (await dialog.count()) {
    const weiter = dialog.locator("button").filter({ hasText: /Verwerfen|Ohne Speichern|Trotzdem/i }).first();
    if (await weiter.count()) { await weiter.click(); await page.waitForTimeout(700); }
  }

  await page.locator(".dft-resume-btn").first().click();
  await page.waitForTimeout(1200);

  const z = await zustand(page);
  assert.equal(z.titel, "Neue Sendung");
  assert.equal(z.empfaenger, "Frieda Fortsetzen", "der Entwurf wurde nicht korrekt geladen");
  assert.notEqual(z.empfaenger, "Dora Beispiel", "der alte Sitzungsvorgang wurde mit dem Entwurf vermischt");

  formDraftListOverride = null;
  resumeDetailOverride = null;
  await ctx.close();
});

/* ══════════ 11 — der zweite Entwurfspfad (Buchungsseite) ══════════════════ */

test("32 — der zweite Entwurfspfad (Buchungsseite) beendet den Vorgang nach erfolgreichem Speichern ebenfalls", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  const vorSpeichern = await zustand(page);
  assert.equal(vorSpeichern.url, "/booking");
  assert.equal(vorSpeichern.speicher, false, "der Vorgang wurde doch gespiegelt");
  assert.equal(vorSpeichern.keinAngebot, false, "Vorbedingung: die Buchungsseite trägt das gewählte Angebot");

  const saveBtn = page.locator(".bk-savedraft button").first();
  assert.ok(await saveBtn.count() > 0, "die Sendungsentwurf-Aktion fehlt auf der Buchungsseite");
  await saveBtn.click();
  await page.waitForTimeout(1000);
  const done = await page.locator(".bk-savedraft-done").innerText().catch(() => "");
  assert.ok(/Entwurf gespeichert/.test(done), `keine Erfolgsanzeige („${done}")`);

  const nach = await zustand(page);
  assert.equal(nach.speicher, false, "der Vorgang liegt nach dem Sendungsentwurf noch im Speicher");
  // Die Buchungsseite selbst bleibt unverändert funktionsfähig — ihre Daten
  // kommen primär aus location.state, unabhängig vom gelöschten Context.
  assert.equal(nach.url, "/booking");
  assert.equal(nach.keinAngebot, false, "die Buchungsseite verlor ihre Daten nach dem Löschen des Context");

  // Der Rückweg läuft bewusst INNERHALB der SPA („← Zurück"), nicht über einen
  // Reload: ein Reload baut den React-Baum neu auf und leert den Vorgang
  // ohnehin — er könnte den Unterschied zwischen „beendet" und „lebt" gar
  // nicht mehr zeigen. Test 33 ist die Gegenprobe auf demselben Weg.
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1200);
  const frisch = await zustand(page);
  assert.equal(frisch.empfaenger, null, "„Neue Sendung\" zeigt nach dem Sendungsentwurf noch die alte Sendung");
  assert.equal(frisch.angebote, 0);
  await ctx.close();
});

test("33 — ein Speicherfehler auf der Buchungsseite lässt den Vorgang unangetastet", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);

  scriptedShipmentDraftStatus = 500;
  const saveBtn = page.locator(".bk-savedraft button").first();
  await saveBtn.click();
  await page.waitForTimeout(1000);
  scriptedShipmentDraftStatus = 0;

  const fehlerText = await page.locator(".bk-savedraft-error").innerText().catch(() => "");
  assert.ok(fehlerText.length > 0, "keine Fehlermeldung nach fehlgeschlagenem Sendungsentwurf");

  const z = await zustand(page);
  assert.equal(z.url, "/booking");
  assert.equal(z.keinAngebot, false, "die Buchungsseite verlor ihre Daten trotz Speicherfehler");
  assert.equal(z.speicher, false, "der Vorgang wurde doch gespiegelt");

  // Die beiden Zeilen darüber belegen nur, dass die Buchungsseite steht — ihre
  // Daten kommen primär aus `location.state` und überleben auch einen
  // gelöschten Context. Der belastbare Beleg ist der Rückweg innerhalb der
  // SPA: er zeigt den Vorgang selbst. Genau die Gegenprobe zu Test 32.
  await page.locator("button").filter({ hasText: /^← Zurück$/ }).first().click();
  await page.waitForTimeout(1200);
  const zurueck = await zustand(page);
  assert.equal(zurueck.empfaenger, "Dora Beispiel", "der Vorgang ging trotz Speicherfehler verloren");
  assert.equal(zurueck.angebote, 2, "die Angebote gingen trotz Speicherfehler verloren");
  await ctx.close();
});

/* ══════════ 12 — „Speichern und verlassen" aus dem Verlassen-Dialog ═══════
   Ein dritter Aufrufer teilt sich denselben Erfolgspfad: der Verlassen-Dialog
   (ShipmentDraftLeaveDialog), der erscheint, wenn eine interne Navigation bei
   ungespeicherten Angaben pausiert wird. Sein Primärbutton „Als Entwurf
   speichern" ruft saveDraftAndLeave → saveCurrentFormDraft → bei Erfolg
   resetToFreshShipment() UND die pausierte Navigation. Anders als der
   sichtbare dft-savedraft-cta-Button (Tests 25–29) verlässt dieser Pfad die
   Seite sofort im Erfolgsfall — zu prüfen: die Navigation kommt an UND der
   Vorgang ist beendet, nicht nur eines von beidem. */

test("34 — „Speichern und verlassen\" aus dem Verlassen-Dialog beendet den Vorgang und navigiert ans Ziel", async () => {
  const { ctx, page } = await neueSeite();
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await formularFuellen(page);
  await page.waitForTimeout(500);
  const vorVerlassen = await zustand(page);
  assert.equal(vorVerlassen.speicher, false, "der Vorgang wurde doch gespiegelt");
  assert.equal(vorVerlassen.empfaenger, "Dora Beispiel", "Vorbedingung: ungespeicherte Angaben liegen vor");

  // Interne Navigation bei ungespeicherten Angaben → der Verlassen-Dialog
  // pausiert sie und bietet „Als Entwurf speichern" als Primäraktion an.
  await page.locator(".nitem", { hasText: "Übersicht" }).first().click();
  await page.waitForTimeout(500);
  const dialog = page.locator("[role=dialog]");
  assert.ok(await dialog.count() > 0, "der Verlassen-Dialog erscheint nicht bei ungespeicherten Angaben");
  await dialog.locator("button.btn-primary").filter({ hasText: "Als Entwurf speichern" }).first().click();
  await page.waitForTimeout(1200);

  // Die pausierte Navigation muss ankommen — nicht nur der Reset. Die
  // Übersicht trägt keinen Titel „Übersicht", sondern die personalisierte
  // Begrüßung (Paket D) — deshalb über das Muster prüfen, nicht den Text.
  const z1 = await zustand(page);
  assert.ok(/^Guten (Morgen|Tag|Abend)/.test(z1.titel || ""),
    `die pausierte Navigation kam nicht auf der Übersicht an (Titel: „${z1.titel}")`);

  // Und der Vorgang muss beendet sein — nicht nur die Navigation.
  const speicherRoh = await page.evaluate((k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, SPEICHER);
  assert.equal(speicherRoh, null, "der Vorgang liegt nach „Speichern und verlassen\" noch im sessionStorage");

  await sidebarEintrag(page, "Neue Sendung");
  await page.waitForTimeout(900);
  const z2 = await zustand(page);
  assert.equal(z2.empfaenger, null, "„Neue Sendung\" zeigt nach „Speichern und verlassen\" noch die alte Sendung");
  assert.equal(z2.pakete, PACKAGE_COUNT_DEFAULT, "die Paketanzahl trägt nicht ihre dokumentierte Vorbelegung");
  await ctx.close();
});

/* ══════════ 14 — Save-Draft nutzt den CE-Sendungshandle ═══════════════════
   Regression. `/calculate-price` liefert ZWEI IDs mit verschiedener Bedeutung:
   `shipmentId` ist die JUMiNGO-Referenz ("s_"+32 Hex), `ceShipmentId` die
   interne shipments.id. „Als Entwurf speichern" bekam die erste — der Guard
   hasSavableShipmentId() lehnte sie korrekt ab, und die Aktion war produktiv
   dauerhaft unsichtbar. Der Mock oben liefert seit dieser Phase beide IDs in
   ihrer ECHTEN Form; damit prüfen die Tests 32/33 denselben Pfad ebenfalls
   scharf. */

test("38 — „Als Entwurf speichern“ ist sichtbar, obwohl shipmentId eine JUMiNGO-Referenz ist", async () => {
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);

  // Gegenprobe zuerst: die Buchungsseite trägt tatsächlich die Providerform.
  const jumingoForm = await page.evaluate(() => {
    try { return (window.history.state?.usr?.shipmentId ?? null); } catch { return null; }
  });
  assert.ok(/^s_[a-f0-9]{32}$/.test(String(jumingoForm)),
    `der Vorgang trägt keine JUMiNGO-Referenz (war „${jumingoForm}") — der Test prüft sonst nichts`);

  const saveBtn = page.locator(".bk-savedraft button").first();
  assert.ok(await saveBtn.count() > 0,
    "die Sendungsentwurf-Aktion fehlt — sie hängt wieder an der Providerreferenz");
  await ctx.close();
});

test("39 — der Speicherrequest geht mit der internen shipments.id, nie mit der Providerreferenz", async () => {
  const { ctx, page } = await neueSeite();
  zuletztGespeicherteDraftId = null;
  await bisZurBuchung(page);

  await page.locator(".bk-savedraft button").first().click();
  await page.waitForTimeout(1000);

  const done = await page.locator(".bk-savedraft-done").innerText().catch(() => "");
  assert.ok(/Entwurf gespeichert/.test(done), `keine Erfolgsanzeige („${done}")`);
  assert.ok(zuletztGespeicherteDraftId !== null,
    "es kam kein Speicherrequest an — die gesendete ID passte nicht auf den Backendpfad (nur Ziffern)");
  assert.ok(/^[0-9]+$/.test(zuletztGespeicherteDraftId),
    `der Speicherrequest trug keine interne ID: „${zuletztGespeicherteDraftId}"`);
  await ctx.close();
});

test("40 — ohne ceShipmentId bleibt die Aktion verborgen, statt die Providerreferenz zu senden", async () => {
  // Fail-safe: ein Backend ohne das additive Feld (oder ein fehlgeschlagener
  // Draft-INSERT → null) darf NICHT dazu führen, dass ersatzweise die
  // JUMiNGO-Referenz gesendet wird. Dann lieber keine Aktion.
  ceShipmentIdOverride = null;
  const { ctx, page } = await neueSeite();
  zuletztGespeicherteDraftId = null;
  await bisZurBuchung(page);

  const saveBtn = page.locator(".bk-savedraft button").first();
  assert.equal(await saveBtn.count(), 0,
    "die Aktion erscheint ohne CE-Handle — sie würde die Providerreferenz senden");
  assert.equal(zuletztGespeicherteDraftId, null, "es ging ein Speicherrequest raus, obwohl kein Handle vorlag");

  ceShipmentIdOverride = undefined;
  await ctx.close();
});

test("41 — der CE-Handle überlebt einen Reload des Vorgangs (Aktion bleibt sichtbar)", async () => {
  // Der Handle reist im `location.state` mit, den React Router in
  // `history.state.usr` ablegt — deshalb übersteht er einen Reload, obwohl
  // der Vorgang selbst seit dem Paket „leerer Nullzustand" nicht mehr
  // gespiegelt wird. Ohne ihn wäre „Als Entwurf speichern" nach jedem
  // Reload/Browser-Vorwärts wieder weg.
  const { ctx, page } = await neueSeite();
  await bisZurBuchung(page);
  assert.ok(await page.locator(".bk-savedraft button").first().count() > 0, "Aktion fehlt schon vor dem Reload");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1200);

  const nachReload = page.locator(".bk-savedraft button").first();
  assert.ok(await nachReload.count() > 0,
    "nach dem Reload fehlt die Aktion — der CE-Handle wird im Vorgang nicht mitgeführt");
  await ctx.close();
});
