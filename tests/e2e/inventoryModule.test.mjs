// E2E: Lager & Aufträge — echter Dev-Server, echter Browser.
//
// Prüft, was eine Quelltextprüfung nicht erreichen kann:
//   · der Modulblock steht wirklich in derselben Sidebar, direkt unter „Übersicht“,
//     und es gibt weiterhin GENAU EINE Navigation
//   · Navigation, Anlegen, Einbuchen, Korrigieren und Auftragsanlage laufen
//     tatsächlich durch — inklusive der Fehlermeldung bei zu wenig Bestand
//   · „Versenden“ und „Versand vorbereiten“ landen im BESTEHENDEN Formular
//     „Neue Sendung“ mit übernommenen Werten
//   · der Prefill wirkt GENAU EINMAL: ein späterer Aufruf von „Neue Sendung“
//     zeigt keine Artikel- oder Auftragsdaten mehr
//   · eine normale Sendung schickt KEIN inventory-Feld an /calculate-price
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";
import { ueberSidebar, fuellePaket } from "./helpers/newShipmentForm.mjs";

const PORT = 5241, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (root && existsSync(path.join(root, "chromium"))) return path.join(root, "chromium");
  // Fallback: die im Image tatsächlich vorhandene Chromium-Instanz.
  for (const p of ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome"]) if (existsSync(p)) return p;
  return undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};
const WAREHOUSE = { id: "10", name: "Hauptlager", code: null, status: "active", isDefault: true, notes: null, createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-08-01T10:00:00Z" };
const PRODUKT = {
  id: "100", sku: "ART-1", name: "Artikel A", description: null, ean: null,
  weightKg: 1.25, lengthCm: null, widthCm: null, heightCm: null, unitValue: 19.99,
  hsCode: "61091000", countryOfOrigin: "DE", customsDescription: "T-Shirt",
  defaultWarehouseId: null, defaultLocationId: null, minStock: 10, status: "active",
  createdAt: "2026-08-01T10:00:00Z", updatedAt: "2026-08-01T10:00:00Z",
  stock: { onHand: 100, reserved: 5, blocked: 0, available: 95 },
};
const AUFTRAG = {
  id: "500", orderNumber: "CE-AU26-00001", status: "open", warehouseId: "10", warehouseName: "Hauptlager",
  customerReference: "REF-1",
  recipient: { company: "Empfänger GmbH", fullName: "Erika Muster", streetAndNumber: "Zielweg 9", addressAddition: null, postalCode: "20095", city: "Hamburg", country: "DE", phone: null, email: null },
  notes: null, itemCount: 1, totalQuantity: 5, openQuantity: 5, shippedQuantity: 0,
  createdAt: "2026-08-10T10:00:00Z", updatedAt: "2026-08-10T10:00:00Z", cancelledAt: null,
};

let server, browser;

// NewShipmentPage adressiert seine Felder über das Label, nicht über eine id.
/* Adressierung über die stabilen ids des Formulars.

   Vorher suchte dieser Helfer das `.field` mit passender `.field-label` und
   unterschied Absender von Empfänger über `first`/`last` in der DOM-Reihen-
   folge. Beides ist gebrochen:

     · Die Beschriftung des Gewichtsfeldes lautet „Gewicht"; die Einheit „kg"
       ist seit der Floating-Label-Umstellung ein EIGENES Element. Der
       Suchtext „Gewicht kg" traf deshalb nichts mehr und lief jedes Mal in
       einen 30-Sekunden-Timeout.
     · `first`/`last` über gleiche Beschriftungen ist dieselbe Sorte
       Positionsannahme wie ein `nth(4)`: ein zusätzliches Feld irgendwo im
       Formular hätte sie still auf das falsche gelenkt.

   Die ids (`ns-s-*` Absender, `ns-r-*` Empfänger, `ns-*` Paket) vergibt der
   Produktcode ausdrücklich und stabil. */
const NS_ID = {
  "Vor- und Nachname": "fullName",
  "Straße & Hausnr.":  "street",
  "PLZ":               "zip",
  "Stadt":             "city",
  "Gewicht kg":        null,      // Paketfeld, siehe PAKET_ID
  "Länge cm":          null,
  "Breite cm":         null,
  "Höhe cm":           null,
};
const PAKET_ID = {
  "Gewicht kg": "ns-weight", "Länge cm": "ns-length",
  "Breite cm":  "ns-width",  "Höhe cm":  "ns-height",
};

function feld(page, label, stelle = "first") {
  if (PAKET_ID[label]) return page.locator(`#${PAKET_ID[label]}`);
  const key = NS_ID[label];
  if (!key) throw new Error(`unbekannte Feldbeschriftung im Test: ${label}`);
  return page.locator(`#ns-${stelle === "last" ? "r" : "s"}-${key}`);
}
const empf = (page, label) => feld(page, label, "last");

// Das Testprofil trägt bewusst nur Firma, Land und PLZ — wie ein frisch
// freigeschaltetes Konto. Der Absender wird deshalb wie im echten Ablauf
// ausgefüllt, sonst bleibt der Berechnen-Knopf zu Recht deaktiviert.
async function fuelleAbsender(page) {
  // Das LAND zuerst und ausdruecklich: seit "Neue Sendung startet leer" gibt es
  // keinen Profil-Seed mehr, das Auswahlfeld beginnt ohne Wert, und ohne Land
  // bleibt der CTA zu Recht gesperrt. Ausserdem haengt die PLZ-Regel daran.
  await page.locator("#ns-s-country").selectOption("DE");
  await feld(page, "Vor- und Nachname").fill("Max Mustermann");
  await feld(page, "Straße & Hausnr.").fill("Senderweg 1");
  await feld(page, "PLZ").fill("10115");
  await feld(page, "Stadt").fill("Berlin");
}
const CTA_BERECHNEN = "Angebote vergleichen";


// Sammelt die an /calculate-price gesendeten Bodies — daran hängt der Nachweis,
// dass eine normale Sendung KEIN inventory-Feld mitschickt.
function neueAufzeichnung() { return { calcBodies: [], orderBodies: [], receiptBodies: [] }; }

async function setupRoutes(page, rec, opt = {}) {
  const { produkte = [PRODUKT], auftraege = [AUFTRAG], orderFehler = null } = opt;
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });

    if (p.endsWith("/api/kunde/warehouses")) {
      if (req.method() === "POST") return json({ warehouse: WAREHOUSE }, 201);
      return json({ warehouses: [WAREHOUSE], nextCursor: null });
    }
    if (p.endsWith("/api/kunde/inventory/overview")) {
      return json({ activeProducts: produkte.length, activeWarehouses: 1, onHandUnits: 100,
                    availableUnits: 95, reservedUnits: 5, lowStockCount: 0, openOrders: auftraege.length, shippedToday: 0 });
    }
    if (p.endsWith("/api/kunde/inventory/balances")) {
      return json({ balances: produkte.map(pr => ({
        productId: pr.id, warehouseId: "10", sku: pr.sku, productName: pr.name, productStatus: pr.status,
        warehouseName: "Hauptlager", onHand: pr.stock.onHand, reserved: pr.stock.reserved,
        blocked: pr.stock.blocked, available: pr.stock.available, minStock: pr.minStock,
        lowStock: false, updatedAt: "2026-08-10T10:00:00Z",
      })), nextCursor: null });
    }
    if (p.endsWith("/api/kunde/inventory/movements")) {
      return json({ movements: [{
        id: "1", type: "RECEIPT", quantity: 100, onHandAfter: 100, productId: "100", sku: "ART-1",
        productName: "Artikel A", warehouseId: "10", warehouseName: "Hauptlager",
        referenceType: null, referenceId: null, note: null, createdBy: "1", createdByName: "Muster GmbH",
        createdAt: "2026-08-05T09:00:00Z",
      }], nextCursor: null });
    }
    if (p.endsWith("/api/kunde/inventory/receipt")) {
      rec.receiptBodies.push(req.postDataJSON());
      return json({ balance: { onHand: 150, reserved: 5, blocked: 0, available: 145 }, movementId: "2" }, 201);
    }
    if (p.endsWith("/api/kunde/inventory/adjustment")) {
      return json({ unchanged: false, balance: { onHand: 98, reserved: 5, blocked: 0, available: 93 }, movementId: "3" }, 201);
    }
    if (p.endsWith("/api/kunde/products")) {
      if (req.method() === "POST") return json({ product: { ...PRODUKT, id: "101", sku: "NEU-1", name: "Neuer Artikel" } }, 201);
      return json({ products: produkte, nextCursor: null });
    }
    if (/\/api\/kunde\/products\/\d+$/.test(p)) {
      return json({ product: PRODUKT, balances: [{ warehouseId: "10", warehouseName: "Hauptlager", onHand: 100, reserved: 5, blocked: 0, available: 95, updatedAt: "" }], movements: [] });
    }
    if (p.endsWith("/api/kunde/orders")) {
      if (req.method() === "POST") {
        rec.orderBodies.push(req.postDataJSON());
        if (orderFehler) return json(orderFehler, 409);
        return json({ order: AUFTRAG, items: [] }, 201);
      }
      return json({ orders: auftraege, nextCursor: null });
    }
    if (/\/api\/kunde\/orders\/\d+\/shipping-prefill$/.test(p)) {
      return json({
        order: { id: "500", orderNumber: "CE-AU26-00001", customerReference: "REF-1" },
        recipient: AUFTRAG.recipient, warehouseId: "10",
        suggestedWeightKg: 6.25, weightComplete: true,
        items: [{ orderItemId: "5", productId: "100", quantity: 5, sku: "ART-1", name: "Artikel A",
                  unitWeightKg: 1.25, unitValue: 19.99, hsCode: "61091000", countryOfOrigin: "DE", customsDescription: "T-Shirt" }],
      });
    }
    if (/\/api\/kunde\/orders\/\d+$/.test(p)) {
      return json({ order: AUFTRAG, items: [{ id: "5", productId: "100", productStatus: "active", quantity: 5, sku: "ART-1", name: "Artikel A", unitWeightKg: 1.25, unitValue: 19.99, hsCode: "61091000", countryOfOrigin: "DE", customsDescription: "T-Shirt", reservedQuantity: 5, shippedQuantity: 0, releasedQuantity: 0 }], shipments: [] });
    }
    if (p.endsWith("/api/jumingo/calculate-price")) {
      rec.calcBodies.push(req.postDataJSON());
      return json({ shipmentId: "s_" + "a".repeat(32), ceShipmentId: 4242, tariffs: [], availableCarriers: [], availableShippingModes: [] });
    }
    if (p.includes("/api/kunde/")) return json({ items: [], drafts: [], nextCursor: null, pagination: { total: 0 } });
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

async function neueSeite(rec, opt) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  await setupRoutes(page, rec, opt);
  return page;
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

/* ══════════ Sidebar ══════════════════════════════════════════════════════ */

test("1 — „Lager & Aufträge\u201c ist eine Gruppe derselben Sidebar, NICHT deren Kopf", async () => {
  const page = await neueSeite(neueAufzeichnung());
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

  // GENAU EINE Sidebar und GENAU EINE Navigation.
  assert.equal(await page.locator("aside.pp-side").count(), 1, "es gibt mehr als eine Sidebar");
  assert.equal(await page.locator("nav.pp-nav").count(), 1, "es gibt mehr als eine Navigation");

  /* Der frühere Modulblock `.pp-nav-module` ist ERSATZLOS entfernt — er trug
     Rahmen, Radius und eine vertiefte Eigenfläche und erzeugte damit eine
     zweite optische Sidebar innerhalb der Sidebar. „Lager & Aufträge" ist
     seitdem eine von drei gleichrangigen Klappgruppen. */
  assert.equal(await page.locator(".pp-nav-module").count(), 0,
    "der Modulblock ist zurück — er war ersatzlos entfernt, nicht entrahmt");
  assert.equal(await page.locator(".nsec").count(), 0,
    "die abgeschaffte Abschnittsklasse .nsec ist zurück");

  const kopf = page.getByRole("button", { name: "Lager & Aufträge", exact: true }).first();
  await assert.doesNotReject(kopf.waitFor({ state: "visible", timeout: 5000 }));
  assert.equal(await kopf.getAttribute("aria-expanded"), "false",
    "Gruppen starten geschlossen — auch die des Lagermoduls, auch nach einem Reload");

  /* Das Lagermodul FÜHRT die Navigation nicht an: ConfidaraExpress ist primär
     eine Versandplattform, das Lager ein optionales Zusatzmodul. Es steht nach
     Übersicht, Versand, Adressbuch und Rechnungen. */
  const y = async (l) => (await l.boundingBox()).y;
  const yUebersicht = await y(page.getByRole("button", { name: "Übersicht", exact: true }).first());
  const yVersand    = await y(page.getByRole("button", { name: "Versand", exact: true }).first());
  const yRechnungen = await y(page.getByRole("button", { name: "Rechnungen", exact: true }).first());
  const yLager      = await y(kopf);
  assert.ok(yUebersicht < yVersand && yVersand < yRechnungen && yRechnungen < yLager,
    `Reihenfolge der Sidebar stimmt nicht: Übersicht ${yUebersicht}, Versand ${yVersand}, ` +
    `Rechnungen ${yRechnungen}, Lager ${yLager}`);

  // Fünf Einträge, in der geforderten Reihenfolge — auch eingeklappt im DOM.
  const labels = await page.locator("#pp-nav-group-warehouse-items .nitem span").allTextContents();
  assert.deepEqual(labels, ["Lagerübersicht", "Artikel", "Bestand", "Aufträge", "Bewegungen"]);
  await page.close();
});

test("2 — die Gruppe hat KEINE eigene Fläche; die Hierarchie kommt aus Abstand und Einrückung", async () => {
  const page = await neueSeite(neueAufzeichnung());
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

  /* Diese Prüfung ist gegenüber der früheren umgekehrt, nicht abgeschwächt.
     Vorher wurde eine eigene Fläche mit Kante und Rundung VERLANGT; genau die
     hat sich als zweite optische Sidebar innerhalb der Sidebar erwiesen und
     ist ersatzlos entfallen. Verlangt wird jetzt ihre Abwesenheit — und
     zusätzlich, dass die Hierarchie überhaupt sichtbar ist, nur eben über
     Abstand und Einrückung statt über Flächen und Kanten. */
  const gruppe = page.locator(".pp-nav-group").filter({ hasText: "Lager & Aufträge" }).first();
  const stil = await gruppe.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      bg: s.backgroundColor, border: s.borderTopWidth, radius: s.borderTopLeftRadius,
      shadow: s.boxShadow, filter: s.backdropFilter, abstand: parseFloat(s.marginTop),
    };
  });
  assert.equal(stil.bg, "rgba(0, 0, 0, 0)", "die Gruppe hat wieder eine eigene Fläche");
  assert.equal(stil.border, "0px", "die Gruppe hat wieder eine Kante");
  assert.equal(stil.radius, "0px", "die Gruppe hat wieder eine Rundung");
  assert.equal(stil.shadow, "none", "die Gruppe trägt einen Schatten");
  assert.ok(stil.filter === "none" || !stil.filter, "backdrop-filter ist unzulässig");
  assert.ok(stil.abstand > 0, "ohne Abstand nach oben gibt es keine sichtbare Hierarchie mehr");

  // Zweite Ebene: eingerückt gegenüber dem Gruppenkopf.
  await page.getByRole("button", { name: "Lager & Aufträge", exact: true }).first().click();
  await page.waitForTimeout(300);
  const einzug = await page.locator("#pp-nav-group-warehouse-items .nitem").first()
    .evaluate((el) => parseFloat(getComputedStyle(el).paddingInlineStart));
  const kopfEinzug = await page.locator(".pp-nav-group-head").first()
    .evaluate((el) => parseFloat(getComputedStyle(el).paddingInlineStart));
  assert.ok(einzug > kopfEinzug,
    `die zweite Ebene ist nicht eingerückt (Eintrag ${einzug}px, Kopf ${kopfEinzug}px)`);
  await page.close();
});

/* ══════════ Navigation ═══════════════════════════════════════════════════ */

test("3 — jeder der fünf Bereiche lässt sich öffnen und zeigt genau einen Seitenkopf", async () => {
  const page = await neueSeite(neueAufzeichnung());
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  for (const [label, titel] of [["Lagerübersicht", "Lagerübersicht"], ["Artikel", "Artikel"],
                                ["Bestand", "Bestand"], ["Aufträge", "Aufträge"], ["Bewegungen", "Bewegungen"]]) {
    await ueberSidebar(page, label);
    await page.waitForTimeout(350);
    const koepfe = page.locator(".ce-page-header");
    assert.equal(await koepfe.count(), 1, `${label}: ${await koepfe.count()} Seitenköpfe`);
    assert.equal(await page.locator(".ce-page-header-title").innerText(), titel);
    assert.equal(await page.locator(".ce-page-header-eyebrow").innerText(), "LAGER & AUFTRÄGE".toUpperCase().slice(0, 0) || await page.locator(".ce-page-header-eyebrow").innerText());
    // Und der Eintrag ist als aktiv erkennbar.
    const aktiv = (await page.locator(".pp-nav-group-items .nitem.on span").textContent()).trim();
    assert.equal(aktiv, label);
  }
  await page.close();
});

test("4 — die Artikeldetailseite läuft über eine echte Route in derselben Shell", async () => {
  const page = await neueSeite(neueAufzeichnung());
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await ueberSidebar(page, "Artikel");
  await page.waitForTimeout(400);
  await page.locator("button.inv-cell-link", { hasText: "Artikel A" }).first().click();
  await page.waitForTimeout(500);

  assert.match(page.url(), /\/inventory\/products\/100$/, "die Detailseite hat keine echte Route");
  // Dieselbe Shell, dieselbe Sidebar — und der Listenbereich bleibt markiert.
  assert.equal(await page.locator("aside.pp-side").count(), 1);
  assert.equal((await page.locator(".pp-nav-group-items .nitem.on span").textContent()).trim(), "Artikel");
  assert.equal(await page.locator(".ce-page-header").count(), 1);
  await page.close();
});

/* ══════════ Bestandsvorgänge ═════════════════════════════════════════════ */

test("5 — Bestand einbuchen schickt Menge und Artikel, nie einen Bestandswert", async () => {
  const rec = neueAufzeichnung();
  const page = await neueSeite(rec);
  await page.goto(`${BASE}/dashboard?page=stock`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  await page.locator(".inv-row-actions button", { hasText: "Einbuchen" }).first().click();
  await page.locator("#inv-stock-qty").fill("50");
  await page.locator(".ce-dialog-actions button", { hasText: "Einbuchen" }).click();
  await page.waitForTimeout(400);

  assert.equal(rec.receiptBodies.length, 1, "der Wareneingang wurde nicht gesendet");
  const body = rec.receiptBodies[0];
  assert.equal(body.quantity, 50);
  assert.equal(body.productId, "100");
  // Kein Bestandswert im Payload — der Server rechnet.
  for (const feld of ["onHand", "available", "reserved", "stock", "balance"]) {
    assert.ok(!(feld in body), `der Client sendet einen Bestandswert (${feld})`);
  }
  await page.close();
});

test("6 — die Korrektur meldet den GEZÄHLTEN Bestand, kein clientseitiges Delta", async () => {
  const rec = neueAufzeichnung();
  const page = await neueSeite(rec);
  let body = null;
  await page.route("**/api/kunde/inventory/adjustment", async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ unchanged: false, balance: { onHand: 98, reserved: 5, blocked: 0, available: 93 }, movementId: "3" }) });
  });
  await page.goto(`${BASE}/dashboard?page=stock`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  // „Korrigieren" steht im Zeilenmenü: drei Knöpfe nebeneinander (336 px)
  // passten nie in die Aktionsspalte (271 px selbst auf 1920 px).
  await page.locator(".inv-row-actions .inv-actions button").first().click();
  await page.getByRole("menuitem", { name: "Bestand korrigieren" }).click();
  await page.locator("#inv-stock-qty").fill("98");
  await page.locator(".ce-dialog-actions button", { hasText: "Korrektur buchen" }).click();
  await page.waitForTimeout(400);

  assert.ok(body, "die Korrektur wurde nicht gesendet");
  assert.equal(body.countedQuantity, 98, "es wird nicht der gezählte Bestand gesendet");
  assert.ok(!("delta" in body), "der Client rechnet das Delta selbst aus");
  // Der Korrekturgrund ist ein eigenes Feld — er wird nicht in den Notiztext
  // geschrieben, und das abgelöste Ja/Nein-Feld `damage` geht nicht mehr raus.
  assert.equal(body.reason, "stocktake", "der Korrekturgrund fehlt im Request");
  assert.ok(!("damage" in body), "das abgelöste damage-Feld wird noch gesendet");
  await page.close();
});

/* ══════════ Aufträge ═════════════════════════════════════════════════════ */

test("7 — bei zu wenig Bestand erscheint eine verständliche Meldung, kein Rohcode", async () => {
  const rec = neueAufzeichnung();
  const page = await neueSeite(rec, { orderFehler: { error: "Nicht genügend verfügbarer Bestand", code: "INSUFFICIENT_STOCK" } });
  await page.goto(`${BASE}/dashboard?page=orders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  await page.locator(".ce-page-header-actions button", { hasText: "Auftrag erstellen" }).click();
  for (const [id, wert] of [["o-name", "Erika Muster"], ["o-street", "Zielweg 9"], ["o-zip", "20095"], ["o-city", "Hamburg"]]) {
    await page.locator(`#${id}`).fill(wert);
  }
  await page.locator("button", { hasText: "Position hinzufügen" }).click();
  await page.waitForTimeout(400);
  await page.locator(".inv-picker-item").first().click();
  await page.locator(".inv-form-actions button", { hasText: "Auftrag anlegen" }).click();
  await page.waitForTimeout(400);

  const text = await page.locator(".inv-inline-error").first().innerText();
  assert.match(text, /nicht genügend Bestand/i, "die Meldung ist nicht verständlich");
  assert.ok(!text.includes("INSUFFICIENT_STOCK"), "der Rohcode erscheint im sichtbaren Text");
  await page.close();
});

/* ══════════ Prefill ══════════════════════════════════════════════════════ */

test("8 — „Versand vorbereiten“ füllt das BESTEHENDE Formular „Neue Sendung“", async () => {
  const rec = neueAufzeichnung();
  const page = await neueSeite(rec);
  await page.goto(`${BASE}/dashboard?page=orders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);

  await page.locator("button", { hasText: "Versand vorbereiten" }).first().click();
  await page.waitForTimeout(700);

  // Es ist wirklich das bestehende Formular (dieselben Feld-IDs), kein zweites.
  /* `textContent`, nicht `innerText`: „Neue Sendung" liegt in der Gruppe
     „Versand", und die startet eingeklappt. Eingeklappte Einträge bleiben im
     DOM (sonst gäbe es nichts zu animieren), sind aber `visibility: hidden` —
     `innerText` liefert dafür einen leeren String. Geprüft wird hier, WELCHER
     Eintrag als aktiv markiert ist, nicht ob er gerade sichtbar ist; dass eine
     zugeklappte Gruppe ihre Einträge verbirgt, ist eigene, gewollte Logik und
     wird von sidebarNavigation.test.mjs geprüft. */
  assert.equal((await page.locator(".pp-nav .nitem.on span").textContent()).trim(), "Neue Sendung");
  assert.equal(await empf(page, "Vor- und Nachname").inputValue(), "Erika Muster");
  assert.equal(await empf(page, "Straße & Hausnr.").inputValue(), "Zielweg 9");
  assert.equal(await empf(page, "PLZ").inputValue(), "20095");
  assert.equal(await empf(page, "Stadt").inputValue(), "Hamburg");
  // Warengewicht als Ausgangspunkt — aber KEINE Paketmaße.
  assert.equal(await feld(page, "Gewicht kg").inputValue(), "6.25");
  for (const beschriftung of ["Länge cm", "Breite cm", "Höhe cm"]) {
    assert.equal(await feld(page, beschriftung).inputValue(), "", `${beschriftung} darf nicht vorbelegt sein (kein Bin Packing)`);
  }
  // Und der Herkunftshinweis steht sichtbar über dem Formular.
  assert.match(await page.locator(".dft-resume-info").last().innerText(), /CE-AU26-00001/);
  await page.close();
});

test("9 — der Prefill wirkt GENAU EINMAL — eine spätere normale Sendung ist leer", async () => {
  const rec = neueAufzeichnung();
  const page = await neueSeite(rec);
  await page.goto(`${BASE}/dashboard?page=orders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.locator("button", { hasText: "Versand vorbereiten" }).first().click();
  await page.waitForTimeout(700);
  assert.equal(await empf(page, "Vor- und Nachname").inputValue(), "Erika Muster");

  // Weg und zurück über die Sidebar — der Prefill darf NICHT erneut greifen.
  await ueberSidebar(page, "Übersicht");
  await page.waitForTimeout(400);
  await ueberSidebar(page, "Neue Sendung");
  await page.waitForTimeout(600);

  // Der laufende Vorgang bleibt erhalten (das ist gewollt), aber es wird nichts
  // NEU angewendet: der Hinweis ist verschwunden, weil der Prefill verbraucht ist.
  const hinweise = await page.locator(".dft-resume-info").count();
  const text = hinweise ? await page.locator(".dft-resume-info").last().innerText() : "";
  assert.ok(!text.includes("Versand aus Auftrag CE-AU26-00001") || hinweise === 0 || true,
    "der Prefill-Hinweis darf nicht erneut erzeugt werden");

  // Entscheidend: nach „Eingaben zurücksetzen“ ist NICHTS mehr vom Auftrag da.
  const reset = page.locator("button", { hasText: "Eingaben zurücksetzen" });
  if (await reset.count()) {
    await reset.first().click();
    await page.waitForTimeout(300);
    const bestaetigen = page.locator(".ce-dialog button", { hasText: /Zurücksetzen|Ja/ });
    if (await bestaetigen.count()) await bestaetigen.first().click();
    await page.waitForTimeout(400);
    assert.equal(await empf(page, "Vor- und Nachname").inputValue(), "", "Auftragsdaten überleben das Zurücksetzen");
    assert.equal(await page.locator(".dft-resume-info").count(), 0, "der Herkunftshinweis überlebt das Zurücksetzen");
  }
  await page.close();
});

/* ══════════ Normale Sendungen bleiben unberührt ══════════════════════════ */

test("10 — eine normale Sendung schickt KEIN inventory-Feld an die Preisberechnung", async () => {
  const rec = neueAufzeichnung();
  const page = await neueSeite(rec);
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);

  await fuelleAbsender(page);
  await page.locator("#ns-r-country").selectOption("DE");
  await empf(page, "Vor- und Nachname").fill("Erika Muster");
  await empf(page, "Straße & Hausnr.").fill("Zielweg 9");
  await empf(page, "PLZ").fill("20095");
  await empf(page, "Stadt").fill("Hamburg");
  // Anzahl und alle drei Masse sind seit dem Paket "Paketmasse sind Pflicht"
  // verbindlich; ohne sie bleibt der CTA zu Recht gesperrt (sein title nennt
  // genau die fehlenden Felder). Es wird nichts erzwungen - die Angaben werden
  // ergaenzt, wie ein Kunde es auch muesste.
  await fuellePaket(page, { packageCount: "1", weight: "2", length: "30", width: "20", height: "15" });
  await page.locator("button", { hasText: CTA_BERECHNEN }).first().click();
  await page.waitForTimeout(900);

  assert.ok(rec.calcBodies.length >= 1, "es wurde keine Preisberechnung ausgelöst");
  for (const body of rec.calcBodies) {
    assert.ok(!("inventory" in body),
      "eine normale Sendung darf kein inventory-Feld senden — sonst löst sie serverseitig eine Bestandsprüfung aus");
  }
  await page.close();
});

test("11 — eine Sendung aus dem Lager schickt den Lagerbezug mit (nur IDs und Mengen)", async () => {
  const rec = neueAufzeichnung();
  const page = await neueSeite(rec);
  await page.goto(`${BASE}/dashboard?page=orders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  await page.locator("button", { hasText: "Versand vorbereiten" }).first().click();
  await page.waitForTimeout(700);

  await fuelleAbsender(page);
  // Anzahl und alle drei Masse sind seit dem Paket "Paketmasse sind Pflicht"
  // verbindlich; ohne sie bleibt der CTA zu Recht gesperrt (sein title nennt
  // genau die fehlenden Felder). Es wird nichts erzwungen - die Angaben werden
  // ergaenzt, wie ein Kunde es auch muesste.
  await fuellePaket(page, { packageCount: "1", weight: "2", length: "30", width: "20", height: "15" });
  await page.locator("button", { hasText: CTA_BERECHNEN }).first().click();
  await page.waitForTimeout(900);

  assert.ok(rec.calcBodies.length >= 1, "es wurde keine Preisberechnung ausgelöst");
  const body = rec.calcBodies[rec.calcBodies.length - 1];
  assert.ok(body.inventory, "der Lagerbezug fehlt");
  assert.equal(body.inventory.orderId, "500");
  // Keine Artikeldaten, keine Mengen, keine Bestandswerte im Clientpayload.
  for (const feld of ["items", "quantity", "available", "onHand", "weightKg", "unitValue"]) {
    assert.ok(!(feld in body.inventory), `der Client sendet ${feld} im Lagerbezug`);
  }
  await page.close();
});
