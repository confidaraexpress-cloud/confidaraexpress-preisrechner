// Browser-Smokes: „Neue Sendung" startet leer, Paketmaße sind Pflicht.
//
// Echter Dev-Server, echte Kaskade, echte History, echte Requests (Backend
// gemockt). Genau die Wege, die eine Quelltextprüfung nicht erreicht:
//
//   • F5 auf einem ausgefüllten Formular → alles leer,
//   • Sidebar „Neue Sendung" nach einem Bereichswechsel → frischer Vorgang,
//   • ein ausdrücklich geöffneter Entwurf lädt weiterhin seine Daten,
//   • Absender-Komfortfunktion und Adressbuch füllen NUR auf Klick,
//   • ohne vollständige Maße geht KEIN /calculate-price hinaus,
//   • mit Maßen geht exakt das hinaus, was eingegeben wurde,
//   • die Buchungsübersicht zeigt Gewicht UND L × B × H,
//   • 390 px ohne Überlauf.
//
// NIEMALS eine echte Bestellung: alle Backendrufe sind abgefangen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
// Erwartete Vorbelegung aus der PRODUKTIVEN Konstante, nicht als "1" wiederholt:
// ändert sich die Produktentscheidung, zieht der Test mit.
import { PACKAGE_COUNT_DEFAULT } from "../../src/utils/newShipmentForm.mjs";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5257, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", city: "Berlin",
  street: "Musterstr. 1", phone: "030 123456", customer_number: "CE-K-10030",
};

const TARIFFS = [
  { id: "t-dhl-1", tariffId: "t-dhl-1", carrier: "dhl", publicCarrierId: "dhl", carrierName: "DHL",
    serviceName: "DHL Paket", netPrice: 12.9, grossPrice: 15.35, finalPrice: 15.35, currency: "EUR",
    serviceType: "pickup", deliveryDateMin: "2027-08-10", deliveryDateMax: "2027-08-11",
    transitDaysMin: 2, transitDaysMax: 3, insuranceAvailable: true, availableForDate: true },
];

const ADRESSBUCH = [{
  id: 7, label: "Kunde Nord", tab: "recipient", company: "Nordwerk GmbH",
  fullName: "Dora Beispiel", streetAndNumber: "Hafenstr. 12", postalCode: "20457",
  city: "Hamburg", country: "DE", phone: "040 999", email: "d@nordwerk.de",
}];

// Ein Entwurf MIT vollständigen Daten — für den Draft-Smoke.
const ENTWURF = {
  id: 900, revision: 3, schemaVersion: 1,
  formData: {
    sender: { company: "Alt GmbH", fullName: "Alt Person", streetAndNumber: "Altweg 9",
              postalCode: "50667", city: "Köln", country: "DE" },
    recipient: { company: "Ziel AG", fullName: "Ziel Person", streetAndNumber: "Zielstr. 3",
                 postalCode: "80331", city: "München", country: "DE" },
    packages: { packageCount: 3, weight: 7, length: 44, width: 33, height: 22 },
    shippingDate: "2027-08-05",
  },
};

let server, browser;
// Jeder an /calculate-price gesendete Body — der Beweis für „kein Request" und
// für „exakt diese Werte".
let calcBodies = [];

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
      calcBodies.push(JSON.parse(req.postData() || "{}"));
      return json({
        tariffs: TARIFFS,
        shipmentId: "s_a1b2c3d4e5f60718293a4b5c6d7e8f90",
        ceShipmentId: 4242,
        publicCarriers: [{ id: "dhl", name: "DHL" }],
        customsRequired: false, fromCountryCode: "DE", toCountryCode: "DE",
      });
    }
    // Es darf in diesem Lauf NIE eine Bestellung entstehen.
    if (p.endsWith("/book")) return json({ error: "im Smoke nicht erlaubt" }, 500);

    if (/\/api\/kunde\/form-drafts\/(\d+)$/.test(p) && method === "GET") return json({ draft: ENTWURF });
    if (p.endsWith("/api/kunde/form-drafts") && method === "GET")
      return json({ drafts: [{ id: 900, revision: 3, schemaVersion: 1, updatedAt: "2027-08-01T10:00:00Z",
                               summary: { recipientCity: "München" } }], nextCursor: null });
    if (p.endsWith("/api/kunde/form-drafts")) return json({ draft: { id: 900, revision: 0, schemaVersion: 1 } });

    if (p.includes("/addresses")) return json({ addresses: ADRESSBUCH, pagination: { total: 1 } });
    if (p.includes("/address/")) return json({ status: "unsupported" });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [], summary: null, pagination: { total: 0 } });
  });
}

async function neueSeite(viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  await setupRoutes(ctx);
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem("ce_token", "test-token"); });
  return { ctx, page, fehler };
}

/** Direkter Einstieg — für alle Tests, bei denen der WEG nicht die Aussage ist. */
async function zuNeueSendung(page) {
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForSelector("#ns-weight", { timeout: 15000 });
}

/**
 * Über die SIDEBAR — das ist der Weg, den Test S3 tatsächlich prüft.
 *
 * Die Gruppen sind nach jedem Reload zu, und eingeklappte Einträge tragen
 * `visibility: hidden` (bewusst: sie sollen weder fokussierbar noch klickbar
 * sein). Der Gruppenkopf ist ein echtes `<button.pp-nav-group-head>` — er muss
 * also zuerst geöffnet werden.
 */
async function ueberSidebarZuNeueSendung(page) {
  await verlassenBestaetigen(page);
  const kopf = page.locator("button.pp-nav-group-head", { hasText: "Versand" }).first();
  if ((await kopf.getAttribute("aria-expanded")) !== "true") await kopf.click();
  const eintrag = page.locator(".pp-nav-group-items .nitem", { hasText: "Neue Sendung" }).first();
  await eintrag.click();
  await page.waitForSelector("#ns-weight", { timeout: 15000 });
}

/**
 * Der interne Verlassen-Guard fängt jede Navigation ab, solange ungespeicherte
 * Angaben vorliegen — bewusstes Produktverhalten. Für die Smokes heißt das:
 * ausdrücklich verwerfen („Ohne Speichern verlassen"), sonst blockiert der
 * Dialogoverlay jeden weiteren Klick.
 */
async function verlassenBestaetigen(page) {
  const verwerfen = page.locator(".dft-leave-discard");
  if (await verwerfen.count()) { await verwerfen.first().click(); await page.waitForTimeout(400); }
}

/** Alle fünf Paketfelder + zwei Adressfelder als Momentaufnahme. */
async function felder(page) {
  return page.evaluate(() => {
    const v = (id) => document.getElementById(id)?.value ?? null;
    const ph = (id) => document.getElementById(id)?.placeholder ?? null;
    return {
      packageCount: v("ns-packageCount"), weight: v("ns-weight"),
      length: v("ns-length"), width: v("ns-width"), height: v("ns-height"),
      phWeight: ph("ns-weight"), phLength: ph("ns-length"),
      sCountry: v("ns-s-country"), rCountry: v("ns-r-country"),
      sStreet: v("ns-s-street"), rStreet: v("ns-r-street"),
      // Absenderfirma/-name tragen keine id — über den Platzhalter lesen.
      sCompany: document.querySelector('input[placeholder="Firma GmbH"]')?.value ?? null,
      sName: document.querySelector('input[placeholder="Max Mustermann"]')?.value ?? null,
      rCity: document.querySelector('input[placeholder="Zürich"]')?.value ?? null,
      angebote: document.querySelectorAll(".offer-card").length,
    };
  });
}

async function paketFuellen(page, { packageCount = "1", weight = "5", length = "30", width = "20", height = "15" } = {}) {
  for (const [id, wert] of [["ns-packageCount", packageCount], ["ns-weight", weight],
                            ["ns-length", length], ["ns-width", width], ["ns-height", height]]) {
    if (wert === null) continue;
    await page.fill(`#${id}`, wert);
  }
}

async function adressenFuellen(page) {
  await page.locator('button', { hasText: "Eigene Adresse" }).first().click();
  await page.selectOption("#ns-r-country", "DE");
  await page.fill("#ns-r-street", "Hafenstr. 12");
  await page.fill('input[placeholder="Erika Muster"]', "Dora Beispiel");
  await page.fill('input[placeholder="Zürich"]', "Hamburg");
  const plz = page.locator('#ns-r-zip, input[placeholder="26133"]').last();
  if (await plz.count()) await plz.fill("20457");
  await page.waitForTimeout(200);
}

test.before(async () => {
  server = spawn("npx", ["vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], {
    cwd: process.cwd(), stdio: "ignore", detached: true,
    env: { ...process.env, BROWSER: "none" },
  });
  const bis = Date.now() + 60000;
  for (;;) {
    try { const r = await fetch(BASE); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > bis) throw new Error("Dev-Server startet nicht");
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

/* ══════════ 1 — frisches Formular ist leer ═══════════════════════════════ */

test("S1 — „Neue Sendung“ startet vollständig leer (kein Profil, keine Maße)", async () => {
  const { ctx, page, fehler } = await neueSeite();
  try {
    await zuNeueSendung(page);
    const f = await felder(page);
    // Paket: alle fünf leer, Beispiele nur als Placeholder.
    for (const k of ["weight", "length", "width", "height"])
      assert.equal(f[k], "", `${k} ist vorbelegt: ${JSON.stringify(f[k])}`);
    // Die Paketanzahl ist die EINZIGE dokumentierte Ausnahme vom leeren
    // Ausgangszustand (PACKAGE_COUNT_DEFAULT). Sie wird gegen ihren Wert
    // geprüft, nicht auf leer — und auch nicht gar nicht.
    assert.equal(f.packageCount, PACKAGE_COUNT_DEFAULT,
      `Paketanzahl ohne dokumentierte Vorbelegung: ${JSON.stringify(f.packageCount)}`);
    assert.equal(f.phWeight, "z. B. 5");
    assert.equal(f.phLength, "z. B. 30");
    // Absender: NICHT aus dem Profil.
    assert.equal(f.sCompany, "", "Firma kam automatisch aus dem Profil");
    assert.equal(f.sName, "", "Name kam automatisch aus dem Profil");
    assert.equal(f.sStreet, "", "Straße kam automatisch aus dem Profil");
    // Land: beide leer, „Land auswählen".
    assert.equal(f.sCountry, "", "Absenderland ist vorausgewählt");
    assert.equal(f.rCountry, "", "Empfängerland ist vorausgewählt");
    assert.equal(f.angebote, 0);
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

/* ══════════ 2 — Reload ═══════════════════════════════════════════════════ */

test("S2 — F5 auf einem ausgefüllten Formular: alles wieder leer", async () => {
  const { ctx, page, fehler } = await neueSeite();
  try {
    await zuNeueSendung(page);
    await adressenFuellen(page);
    await paketFuellen(page);
    const vorher = await felder(page);
    assert.equal(vorher.weight, "5", "die Eingabe kam gar nicht an");
    assert.equal(vorher.sCompany, "Muster GmbH", "die Komfortfunktion hat nicht gefüllt");

    // Ausdrücklich NICHT als Entwurf gespeichert.
    await page.reload({ waitUntil: "networkidle" });
    // Nach dem Reload steht der Bereich wieder auf der Übersicht — der
    // Formularzustand darf auch beim erneuten Öffnen nicht zurückkommen.
    await zuNeueSendung(page);
    const nachher = await felder(page);
    for (const k of ["weight", "length", "width", "height"])
      assert.equal(nachher[k], "", `${k} kam nach dem Reload zurück: ${JSON.stringify(nachher[k])}`);
    assert.equal(nachher.packageCount, PACKAGE_COUNT_DEFAULT,
      `Paketanzahl ohne dokumentierte Vorbelegung: ${JSON.stringify(nachher.packageCount)}`);
    assert.equal(nachher.sCompany, "", "Absenderfirma kam nach dem Reload zurück");
    assert.equal(nachher.rStreet, "", "Empfängerstraße kam nach dem Reload zurück");
    assert.equal(nachher.rCity, "", "Empfängerort kam nach dem Reload zurück");
    assert.equal(nachher.angebote, 0, "alte Angebote kamen zurück");
    // Und der Speicher ist tatsächlich leer.
    const rest = await page.evaluate(() => sessionStorage.getItem("ce_shipping_flow_v1"));
    assert.equal(rest, null, "der Vorgang liegt weiterhin im sessionStorage");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

/* ══════════ 3 — Sidebar-Neustart ════════════════════════════════════════ */

test("S3 — Sidebar „Neue Sendung“ nach Bereichswechsel startet frisch", async () => {
  const { ctx, page, fehler } = await neueSeite();
  try {
    await zuNeueSendung(page);
    await paketFuellen(page, { weight: "9", length: "50", width: "40", height: "30" });
    assert.equal((await felder(page)).weight, "9");

    // Anderen Bereich öffnen …
    await page.locator(".nitem", { hasText: "Übersicht" }).first().click();
    await page.waitForTimeout(400);
    // Der Verlassen-Guard meldet sich zu Recht — wir verwerfen ausdrücklich.
    await verlassenBestaetigen(page);
    await page.waitForTimeout(400);
    // … und über die SIDEBAR zurück. Genau dieser Weg muss frisch starten.
    await ueberSidebarZuNeueSendung(page);
    const f = await felder(page);
    for (const k of ["weight", "length", "width", "height"])
      assert.equal(f[k], "", `${k} überlebte den Sidebar-Neustart: ${JSON.stringify(f[k])}`);
    assert.equal(f.packageCount, PACKAGE_COUNT_DEFAULT,
      `Paketanzahl ohne dokumentierte Vorbelegung: ${JSON.stringify(f.packageCount)}`);
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

/* ══════════ 4 — Entwurf ═════════════════════════════════════════════════ */

test("S4 — ein ausdrücklich geöffneter Entwurf lädt seine Daten", async () => {
  const { ctx, page, fehler } = await neueSeite();
  try {
    await page.goto(`${BASE}/dashboard?page=drafts`, { waitUntil: "networkidle" });
    const fortsetzen = page.locator("button", { hasText: "Fortsetzen" }).first();
    await fortsetzen.waitFor({ timeout: 8000 });
    await fortsetzen.click();
    await page.waitForSelector("#ns-weight", { timeout: 8000 });
    const f = await felder(page);
    // Genau die gespeicherten Werte — der Entwurf ist der EINE Weg zurück.
    assert.equal(f.packageCount, "3", "Paketanzahl des Entwurfs fehlt");
    assert.equal(f.weight, "7", "Gewicht des Entwurfs fehlt");
    assert.equal(f.length, "44");
    assert.equal(f.width, "33");
    assert.equal(f.height, "22");
    assert.equal(f.sCompany, "Alt GmbH", "Absender des Entwurfs fehlt");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

/* ══════════ 5 — Komfortfunktionen ═══════════════════════════════════════ */

test("S5 — Absender und Empfänger füllen sich NUR auf Klick", async () => {
  const { ctx, page, fehler } = await neueSeite();
  try {
    await zuNeueSendung(page);
    assert.equal((await felder(page)).sCompany, "", "der Absender war schon gefüllt");

    await page.locator("button", { hasText: "Eigene Adresse" }).first().click();
    await page.waitForTimeout(150);
    const nachProfil = await felder(page);
    assert.equal(nachProfil.sCompany, "Muster GmbH", "die Komfortfunktion füllt den Absender nicht");
    assert.equal(nachProfil.sStreet, "Musterstr. 1");
    assert.equal(nachProfil.sCountry, "DE", "das Land wurde nicht normalisiert übernommen");
    // Der Empfänger bleibt dabei unangetastet.
    assert.equal(nachProfil.rStreet, "", "die Absenderübernahme hat den Empfänger berührt");

    // Adressbuch für den Empfänger.
    const picker = page.locator(".abk-pick-trigger, button[title*='Adressbuch']").last();
    if (await picker.count()) {
      await picker.click();
      const treffer = page.locator(".abk-pick-item, [role='option']").first();
      if (await treffer.count()) {
        await treffer.click();
        await page.waitForTimeout(200);
        const nachBuch = await felder(page);
        assert.equal(nachBuch.rStreet, "Hafenstr. 12", "das Adressbuch füllt den Empfänger nicht");
      }
    }
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

/* ══════════ 6 — Rate-Gate: kein Request ohne Maße ══════════════════════ */

test("S6 — ohne vollständige Maße geht KEIN calculate-price hinaus", async () => {
  const { ctx, page, fehler } = await neueSeite();
  calcBodies = [];
  try {
    await zuNeueSendung(page);
    await adressenFuellen(page);

    // Gewicht + Breite + Höhe da, LÄNGE leer.
    await paketFuellen(page, { length: null });
    await page.fill("#ns-length", "");
    await page.waitForTimeout(200);

    const cta = page.locator("button", { hasText: "Angebote vergleichen" }).first();
    assert.equal(await cta.isDisabled(), true, "der Knopf ist trotz fehlender Länge bedienbar");
    // Auch ein erzwungener Klick darf nichts senden.
    await cta.click({ force: true }).catch(() => {});
    await page.waitForTimeout(400);
    assert.equal(calcBodies.length, 0, `es ging ein Request hinaus: ${JSON.stringify(calcBodies)}`);

    // Länge ergänzen → jetzt erlaubt.
    await page.fill("#ns-length", "30");
    await page.waitForTimeout(200);
    assert.equal(await cta.isDisabled(), false, "der Knopf bleibt trotz vollständiger Angaben gesperrt");

    // Gegenprobe mit einem zweiten Feld: Höhe leeren.
    await page.fill("#ns-height", "");
    await page.waitForTimeout(200);
    assert.equal(await cta.isDisabled(), true, "fehlende Höhe sperrt nicht");
    assert.equal(calcBodies.length, 0, "es ging doch ein Request hinaus");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

/* ══════════ 7 — Payload trägt genau die eingegebenen Werte ═════════════ */

test("S7 — der Request enthält exakt die eingegebenen Maße, auch nach Änderung", async () => {
  const { ctx, page, fehler } = await neueSeite();
  calcBodies = [];
  try {
    await zuNeueSendung(page);
    await adressenFuellen(page);
    await paketFuellen(page, { packageCount: "1", weight: "5", length: "30", width: "20", height: "15" });
    await page.waitForTimeout(200);
    await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
    await page.waitForSelector(".offer-card", { timeout: 10000 });

    assert.equal(calcBodies.length, 1, "nicht genau ein Request");
    const b1 = calcBodies[0];
    assert.deepEqual(
      { packageCount: b1.packageCount, weight: b1.weight, length: b1.length, width: b1.width, height: b1.height },
      { packageCount: 1, weight: 5, length: 30, width: 20, height: 15 },
      "der Payload weicht von der Eingabe ab",
    );

    // Länge auf 40 ändern → neu berechnen → exakt 40, kein alter Wert.
    await page.fill("#ns-length", "40");
    await page.waitForTimeout(250);
    assert.equal((await felder(page)).angebote, 0, "die alten Angebote blieben trotz Maßänderung stehen");
    await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
    await page.waitForSelector(".offer-card", { timeout: 10000 });
    assert.equal(calcBodies.length, 2);
    assert.equal(calcBodies[1].length, 40, "die zweite Berechnung nutzte nicht den neuen Wert");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

/* ══════════ 8 — Buchungsübersicht zeigt die Maße ══════════════════════ */

test("S8 — die Buchungsübersicht zeigt Gewicht UND L × B × H", async () => {
  const { ctx, page, fehler } = await neueSeite();
  calcBodies = [];
  try {
    await zuNeueSendung(page);
    await adressenFuellen(page);
    await paketFuellen(page, { packageCount: "1", weight: "5", length: "30", width: "20", height: "15" });
    await page.waitForTimeout(200);
    await page.locator("button", { hasText: "Angebote vergleichen" }).first().click();
    await page.waitForSelector(".offer-card", { timeout: 10000 });
    // „Auswählen" sitzt IN der Angebotskarte und führt direkt zur Buchung.
    const wahl = page.locator(".offer-card button").filter({ hasText: /Auswählen|Weiter|Buchen|wählen/i }).first();
    await wahl.click();
    await page.waitForURL(/\/booking/, { timeout: 15000 });
    await page.waitForTimeout(600);

    const text = await page.evaluate(() => document.body.innerText);
    assert.match(text, /5 kg/, "das Gewicht fehlt in der Übersicht");
    assert.match(text, /30 × 20 × 15 cm/, "die Abmessungen fehlen in der Übersicht");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

/* ══════════ 9 — Breiten ══════════════════════════════════════════════════ */

// Drei Breiten, eine Aussage: die neuen Placeholder, die Pflichtsterne, das
// Länderfeld und die Hinweiszeile dürfen auf keiner davon Layoutprobleme
// erzeugen.
//
// Bewusst über den DIREKTEN Einstieg, nicht über die Sidebar: der Weg dorthin
// ist die Aussage von S3, hier geht es allein um das Layout der Seite. Unter
// 860 px liegt die Navigation im Drawer — ihn je Breite zu öffnen brächte
// einen zweiten, für dieses Ziel bedeutungslosen Fehlerpfad in den Test.
for (const [name, viewport] of [
  ["390 px", { width: 390, height: 780 }],
  ["768 px", { width: 768, height: 900 }],
  ["Desktop", { width: 1440, height: 900 }],
]) {
test(`S9 — ${name}: kein horizontaler Überlauf, Felder und Hinweis lesbar`, async () => {
  const { ctx, page, fehler } = await neueSeite(viewport);
  try {
    await zuNeueSendung(page);

    const ueberlauf = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(ueberlauf <= 1, `horizontaler Überlauf: ${ueberlauf} px`);

    // Der Hinweis am gesperrten Knopf ist sichtbar und erklärt, was fehlt.
    const text = await page.evaluate(() => document.body.innerText);
    assert.match(text, /Gewicht sowie Länge, Breite und Höhe/,
      "der Hinweis zum unvollständigen Paket fehlt");
    // Kein Feld ragt aus dem Bild.
    const zuBreit = await page.evaluate(() => {
      const w = document.documentElement.clientWidth;
      return [...document.querySelectorAll(".calc-panel input, .calc-panel select")]
        .filter((el) => el.getBoundingClientRect().right > w + 1).length;
    });
    assert.equal(zuBreit, 0, "Eingabefelder ragen aus dem Bild");
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});
}
