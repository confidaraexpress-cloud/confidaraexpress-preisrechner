// E2E: Admin → Sendungen — responsives Tabelle/Karten-Layout und Pagination-Darstellung
// (echter Dev-Server). Prüft, was eine Quelltextprüfung nicht erreicht: dass die
// Aktionsspalte auf Desktop nie abgeschnitten wird, dass rechtzeitig auf Karten
// gewechselt wird, dass Details/Löschen in beiden Darstellungen bedienbar bleiben,
// und dass die neue Pagination-Anzeige (Gesamtanzahl vs. Seitenanzahl) bei echter
// Blätterei korrekt funktioniert. Die Entwurfs-Löschfunktion selbst ist fachlich
// unverändert — das deckt bereits tests/e2e/adminDraftDeletion.test.mjs ab.
//
// Alle Backendantworten sind gemockt; es wird KEIN echter Server verändert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5237, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = {
  id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE",
};

// Worst-case Zeilen: langer Kundenname, "Ohne Bestellnummer", beide Marker, Entwurf
// mit Löschbutton — dieselben Fixtures wie die Breakpoint-Messung.
const ROW_BOOKED = {
  id: 701, user_id: 10, status: "booked", selected_carrier: "dhl-express", service_type: "pickup",
  from_country: "DE", to_country: "AT", price_final: 12345.67, package_count: 3,
  created_at: "2026-08-09T10:00:00Z", customer_company: "ConfidaraExpress UG", customer_number: "CE-K-10001",
  business_order_number: null, has_tracking: true, label_available: true,
};
const ROW_LABEL_READY = {
  id: 702, user_id: 11, status: "label_ready", selected_carrier: "ups", service_type: "dropoff",
  from_country: "DE", to_country: "DE", price_final: 8.9, package_count: 1,
  created_at: "2026-08-08T10:00:00Z", customer_company: "Muster Logistik und Spedition GmbH", customer_number: "CE-K-10002",
  business_order_number: "CE-BS26-00042", has_tracking: true, label_available: true,
};
const ROW_DRAFT = {
  id: 703, user_id: 12, status: "draft", selected_carrier: "dhl", service_type: "pickup",
  from_country: "DE", to_country: "DE", price_final: null, package_count: 1,
  created_at: "2026-08-07T10:00:00Z", customer_company: "ACME GmbH", customer_number: "CE-K-10003",
  business_order_number: null, has_tracking: false, label_available: false,
};

let server, browser;

// `rows` (voller Bestand) + `total` steuern die Antwort; echte Pagination über
// offset/limit, damit Weiter/Zurück tatsächlich unterschiedliche Ausschnitte liefern.
async function setupRoutes(page, opts = {}) {
  const state = {
    rows: opts.rows ? opts.rows.slice() : [ROW_BOOKED, ROW_LABEL_READY, ROW_DRAFT],
    total: opts.total === undefined ? (opts.rows ? opts.rows.length : 3) : opts.total,
    calls: [],
  };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    state.calls.push(`${req.method()} ${p}${url.search}`);
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/shipments")) {
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Number(url.searchParams.get("limit") || 25);
      const page_ = state.rows.slice(offset, offset + limit);
      return json({
        shipments: page_,
        pagination: { limit, offset, count: page_.length, total: state.total },
        deletableDraftTotal: state.rows.filter((r) => r.status === "draft").length,
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return state;
}

async function openList(page) {
  await page.goto(`${BASE}/admin/shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".adm-ships-table tbody tr:visible, .adm-ships-cards .adm-scard:visible", { timeout: 20000 });
  await page.waitForTimeout(200);
}

const zeileMitDetail = (page, id) =>
  page.locator(".adm-ships-table tbody tr", { has: page.locator(`a[href$="/admin/shipments/${id}"]`) });

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

console.log("\nTabelle ↔ Karten — Umschaltpunkt\n");

test("bei 1440px zeigt die Desktop-Tabelle, nicht die Kartenansicht", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await openList(page);
  const m = await page.evaluate(() => ({
    tableVisible: getComputedStyle(document.querySelector(".adm-ships-table")).display !== "none",
    cardsVisible: getComputedStyle(document.querySelector(".adm-ships-cards")).display !== "none",
  }));
  assert.equal(m.tableVisible, true, "die Tabelle ist bei 1440px nicht sichtbar");
  assert.equal(m.cardsVisible, false, "die Karten sind bei 1440px zusätzlich sichtbar");
  await page.close();
});

test("bei 1150px (unterhalb 1200px) zeigen Karten, die Tabelle ist weg", async () => {
  const page = await browser.newPage({ viewport: { width: 1150, height: 1000 } });
  await setupRoutes(page);
  await openList(page);
  const m = await page.evaluate(() => ({
    tableVisible: getComputedStyle(document.querySelector(".adm-ships-table")).display !== "none",
    cardsVisible: getComputedStyle(document.querySelector(".adm-ships-cards")).display !== "none",
  }));
  assert.equal(m.tableVisible, false, "die Tabelle bleibt bei 1150px sichtbar");
  assert.equal(m.cardsVisible, true, "die Karten sind bei 1150px nicht sichtbar");
  await page.close();
});

console.log("\nAktionsspalte Desktop — nie abgeschnitten\n");

test("bei 1280px sind Details UND Löschen vollständig sichtbar, keine Überlagerung", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  await setupRoutes(page);
  await openList(page);
  const m = await page.evaluate(() => {
    const draftRow = [...document.querySelectorAll(".adm-ships-table tbody tr")]
      .find((tr) => tr.querySelector("button[title='Entwurf löschen']"));
    const group = draftRow.querySelector(".adm-row-actions");
    const detailsBtn = group.querySelector("a.btn");
    const trashBtn = group.querySelector("button.btn");
    const tableCard = document.querySelector(".adm-ships-table").getBoundingClientRect();
    const detailsBox = detailsBtn.getBoundingClientRect();
    const trashBox = trashBtn.getBoundingClientRect();
    return {
      detailsFullyInside: detailsBox.left >= tableCard.left - 0.5 && detailsBox.right <= tableCard.right + 0.5,
      trashFullyInside: trashBox.left >= tableCard.left - 0.5 && trashBox.right <= tableCard.right + 0.5,
      // Beide auf derselben Zeile (keine Überlagerung/kein Umbruch übereinander).
      sameLine: Math.abs(detailsBox.top - trashBox.top) < 2,
      overlap: detailsBox.right > trashBox.left && trashBox.right > detailsBox.left,
    };
  });
  assert.equal(m.detailsFullyInside, true, "Details wird bei 1280px angeschnitten");
  assert.equal(m.trashFullyInside, true, "der Löschbutton wird bei 1280px angeschnitten");
  assert.equal(m.sameLine, true, "Details und Löschen stehen nicht auf einer Zeile");
  assert.equal(m.overlap, false, "Details und Löschen überlagern sich");
  await page.close();
});

console.log("\nKartenansicht — alle Felder und Aktionen vollständig\n");

test("Details ist in der Kartenansicht sichtbar und als Link bedienbar", async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  await setupRoutes(page);
  await openList(page);
  const card = page.locator(".adm-scard").first();
  const details = card.getByRole("link", { name: "Details" });
  await details.waitFor({ state: "visible" });
  assert.match(await details.getAttribute("href"), /\/admin\/shipments\/\d+$/);
  await page.close();
});

test("Löschen ist bei einem Entwurf in der Kartenansicht sichtbar und beschriftet", async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  await setupRoutes(page);
  await openList(page);
  const draftCard = page.locator(".adm-scard", { hasText: "Entwurf" }).last();
  const del = draftCard.getByRole("button", { name: "Löschen" });
  await del.waitFor({ state: "visible" });
  await page.close();
});

test("eine gebuchte (Nicht-Entwurfs-)Karte zeigt kein Löschen", async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  await setupRoutes(page, { rows: [ROW_BOOKED] });
  await openList(page);
  const card = page.locator(".adm-scard").first();
  assert.equal(await card.getByRole("button", { name: "Löschen" }).count(), 0,
    "eine gebuchte Sendung trägt in der Kartenansicht eine Löschaktion");
  await page.close();
});

test("die Kartenansicht zeigt Sendung, Kunde, Versand, Status, Preis vollständig", async () => {
  const page = await browser.newPage({ viewport: { width: 900, height: 1000 } });
  await setupRoutes(page, { rows: [ROW_LABEL_READY] });
  await openList(page);
  const text = await page.locator(".adm-scard").first().innerText();
  for (const erwartet of ["CE-BS26-00042", "Muster Logistik und Spedition GmbH", "CE-K-10002", "UPS", "Paketshop", "Label bereit", "8,90"]) {
    assert.ok(text.includes(erwartet), `Kartenansicht ohne „${erwartet}"`);
  }
  await page.close();
});

console.log("\nPagination — Gesamtanzahl vs. Seitenanzahl\n");

test("genau eine Seite (5 Sendungen) zeigt nur die Gesamtanzahl, keine Buttons", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const fuenf = Array.from({ length: 5 }, (_, i) => ({ ...ROW_BOOKED, id: 800 + i }));
  await setupRoutes(page, { rows: fuenf, total: 5 });
  await openList(page);
  const m = await page.evaluate(() => ({
    text: document.querySelector(".adm-page-ind")?.textContent,
    buttons: document.querySelectorAll(".adm-pagination button").length,
  }));
  assert.equal(m.text, "5 Sendungen");
  assert.equal(m.buttons, 0, "bei einer einzigen Seite dürfen keine Buttons stehen");
  await page.close();
});

test("genau ein Datensatz zeigt „1 Sendung“ (Singular)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page, { rows: [ROW_BOOKED], total: 1 });
  await openList(page);
  const text = await page.locator(".adm-page-ind").textContent();
  assert.equal(text, "1 Sendung");
  await page.close();
});

test("mehrere Seiten: „Seite 1 von 3 · 57 Sendungen“, Buttons korrekt aktiviert/deaktiviert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const alle = Array.from({ length: 57 }, (_, i) => ({ ...ROW_BOOKED, id: 900 + i }));
  await setupRoutes(page, { rows: alle, total: 57 });
  await openList(page);

  const s1 = await page.evaluate(() => ({
    text: document.querySelector(".adm-page-ind")?.textContent,
    zurueck: document.querySelectorAll(".adm-pagination button")[0]?.disabled,
    weiter: document.querySelectorAll(".adm-pagination button")[1]?.disabled,
  }));
  assert.equal(s1.text, "Seite 1 von 3 · 57 Sendungen");
  assert.equal(s1.zurueck, true, "Zurück ist auf Seite 1 nicht deaktiviert");
  assert.equal(s1.weiter, false, "Weiter ist auf Seite 1 fälschlich deaktiviert");

  await page.locator(".adm-pagination").getByRole("button", { name: /Weiter/ }).click();
  await page.waitForTimeout(400);
  const s2 = await page.evaluate(() => ({
    text: document.querySelector(".adm-page-ind")?.textContent,
    zurueck: document.querySelectorAll(".adm-pagination button")[0]?.disabled,
    weiter: document.querySelectorAll(".adm-pagination button")[1]?.disabled,
  }));
  assert.equal(s2.text, "Seite 2 von 3 · 57 Sendungen", "Klick auf Weiter lud nicht die zweite Seite");
  assert.equal(s2.zurueck, false, "Zurück bleibt auf der mittleren Seite deaktiviert");
  assert.equal(s2.weiter, false, "Weiter ist auf der mittleren Seite fälschlich deaktiviert");

  await page.locator(".adm-pagination").getByRole("button", { name: /Weiter/ }).click();
  await page.waitForTimeout(400);
  const s3 = await page.evaluate(() => ({
    text: document.querySelector(".adm-page-ind")?.textContent,
    zurueck: document.querySelectorAll(".adm-pagination button")[0]?.disabled,
    weiter: document.querySelectorAll(".adm-pagination button")[1]?.disabled,
    rows: document.querySelectorAll(".adm-ships-table tbody tr").length,
  }));
  assert.equal(s3.text, "Seite 3 von 3 · 57 Sendungen", "Klick auf Weiter lud nicht die letzte Seite");
  assert.equal(s3.zurueck, false, "Zurück bleibt auf der letzten Seite deaktiviert");
  assert.equal(s3.weiter, true, "Weiter ist auf der letzten Seite nicht deaktiviert");
  assert.equal(s3.rows, 7, "die letzte Seite zeigt nicht den Rest (57 − 2×25)");

  await page.locator(".adm-pagination").getByRole("button", { name: /Zurück/ }).click();
  await page.waitForTimeout(400);
  const back = await page.locator(".adm-page-ind").textContent();
  assert.equal(back, "Seite 2 von 3 · 57 Sendungen", "Klick auf Zurück lud nicht die vorherige Seite");

  await page.close();
});

console.log("\nFilter + Pagination\n");

test("ein gesetzter Carrier-Filter bleibt beim Blättern über Weiter/Zurück erhalten", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const alle = Array.from({ length: 40 }, (_, i) => ({ ...ROW_BOOKED, id: 1000 + i }));
  const state = await setupRoutes(page, { rows: alle, total: 40 });
  await openList(page);

  await page.locator("#f-carrier").fill("dhl-express");
  await page.getByRole("button", { name: /Anwenden/ }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator("#f-carrier").inputValue(), "dhl-express");

  await page.locator(".adm-pagination").getByRole("button", { name: /Weiter/ }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator("#f-carrier").inputValue(), "dhl-express", "der Filter ging beim Blättern verloren");
  const lastCall = state.calls.filter((c) => c.startsWith("GET /admin/shipments?")).pop();
  assert.ok(lastCall.includes("carrier=dhl-express"), `der Filter wurde nicht mitgesendet: ${lastCall}`);

  await page.locator(".adm-pagination").getByRole("button", { name: /Zurück/ }).click();
  await page.waitForTimeout(400);
  assert.equal(await page.locator("#f-carrier").inputValue(), "dhl-express", "der Filter ging beim Zurückblättern verloren");
  await page.close();
});

test("Anwenden eines Filters springt zurück auf Seite 1", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const alle = Array.from({ length: 40 }, (_, i) => ({ ...ROW_BOOKED, id: 1100 + i }));
  const state = await setupRoutes(page, { rows: alle, total: 40 });
  await openList(page);

  await page.locator(".adm-pagination").getByRole("button", { name: /Weiter/ }).click();
  await page.waitForTimeout(400);
  assert.match(await page.locator(".adm-page-ind").textContent(), /Seite 2/);

  await page.locator("#f-carrier").fill("ups");
  await page.getByRole("button", { name: /Anwenden/ }).click();
  await page.waitForTimeout(400);
  assert.match(await page.locator(".adm-page-ind").textContent(), /Seite 1/, "Anwenden eines Filters sprang nicht auf Seite 1 zurück");
  const lastCall = state.calls.filter((c) => c.startsWith("GET /admin/shipments?")).pop();
  assert.ok(/offset=0(&|$)/.test(lastCall), `nach dem Filtern wurde nicht bei offset 0 geladen: ${lastCall}`);
  await page.close();
});

console.log("\nKein horizontaler Überlauf\n");

test("keine horizontale Scroll-/Overflow-Regression über die geforderte Breitenmatrix", async () => {
  for (const width of [1600, 1440, 1280, 1200, 1150, 1100, 1024, 950, 900, 850, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await setupRoutes(page);
    await openList(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `${width}px: horizontaler Überlauf`);
    await page.close();
  }
});
