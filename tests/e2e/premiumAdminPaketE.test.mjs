// E2E: Premium-Adminportal (Paket E) — echter Dev-Server, echte Kaskade.
//
// Prüft das, was eine reine Quelltextprüfung nicht erreicht:
//   • dass die Adminnavigation den aktiven Eintrag mehrfach codiert
//     (Fläche + Kante + Akzentkante), nicht allein über Farbe,
//   • dass der Bestätigungsdialog eine echte Fokusfalle mit Fokusrückgabe hat
//     und der Fokus beim Öffnen NICHT auf der bestätigenden Aktion liegt,
//   • dass ein leeres Datumsfeld „TT.MM.JJJJ" zeigt und nicht „mm/dd/yyyy",
//   • dass die Adminlisten bei 390 px nicht horizontal überlaufen und dort
//     Karten statt Tabellen zeigen,
//   • dass die Kennzahlen der Übersicht aus dem Serverzähler stammen und ohne
//     Zähler ehrlich „nicht verfügbar" melden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5230, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = {
  id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE",
};
const USERS = [
  { id: 10, company_name: "ACME Logistik GmbH", name: "Dora Beispiel", email: "dora@acme.example",
    status: "approved", customer_number: "CE-K-10001", created_at: "2026-01-05T09:00:00Z", role: "customer" },
];
const SHIPMENTS = [
  { id: 501, order_number: "CE-1001", user_id: 10, company_name: "ACME Logistik GmbH",
    customer_number: "CE-K-10001", status: "booked", selected_carrier: "dhl", service_type: "pickup",
    from_country: "DE", to_country: "FR", packages: 2, price_final: 42.19, currency: "EUR",
    created_at: "2026-08-01T10:00:00Z", has_tracking: true, has_label: true },
];
const INVOICES = [
  { id: 900, invoice_number: "CE-RE26-00001", user_id: 10, company_name: "ACME Logistik GmbH",
    customer_number: "CE-K-10001", status: "open", gross_amount: 142.5, currency: "EUR",
    issued_at: "2026-07-01T00:00:00Z", due_date: "2026-07-15", is_overdue: true,
    document_status: "ready", email_status: "sent", shipment_id: 501 },
];

let server, browser;

// `zaehler: false` lässt die Pagination weg — dann darf die Übersicht keine
// Zahl erfinden.
async function setupRoutes(page, { zaehler = true } = {}) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    const seite = (schluessel, zeilen, total) =>
      json(zaehler ? { [schluessel]: zeilen, pagination: { total } } : { [schluessel]: zeilen });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (p.endsWith("/admin/users")) return seite("users", USERS, 3);
    if (/\/admin\/users\/\d+\/price-markup$/.test(p)) return json({ userId: 10, priceMarkupPercent: 12.5, confirmed: true });
    if (/\/admin\/users\/\d+$/.test(p)) return json({ user: USERS[0], summary: {} });
    if (p.endsWith("/admin/shipments")) return seite("shipments", SHIPMENTS, 1);
    if (/\/admin\/shipments\/\d+\/tracking$/.test(p)) return json({ tracking: {} });
    if (/\/admin\/shipments\/\d+$/.test(p)) return json({ shipment: SHIPMENTS[0] });
    if (p.endsWith("/admin/invoices/production-readiness")) return json({ ready: false, testMode: true });
    if (p.endsWith("/admin/invoices/backfill-preview")) return json({ candidates: [], summary: {}, pagination: { total: 0 } });
    if (p.endsWith("/admin/invoices")) return seite("invoices", INVOICES, 2);
    if (/\/admin\/invoices\/\d+$/.test(p)) return json({ invoice: INVOICES[0] });
    if (p.endsWith("/admin/cancellation-requests")) return seite("cancellationRequests", [], 4);
    if (p.endsWith("/admin/support-requests")) return seite("supportRequests", [], 5);
    if (p.endsWith("/admin/audit-logs")) return seite("logs", [], 0);
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
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

test("1 — der aktive Navigationseintrag ist mehrfach codiert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });

  const aktiv = page.locator(".adm-nitem-on");
  await aktiv.waitFor({ state: "visible" });
  const stil = await aktiv.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, border: s.borderTopColor, shadow: s.boxShadow, weight: s.fontWeight };
  });
  const inaktiv = await page.locator(".adm-nitem:not(.adm-nitem-on)").first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, weight: s.fontWeight };
  });
  assert.notEqual(stil.bg, inaktiv.bg, "der aktive Eintrag hat keine eigene Fläche");
  assert.notEqual(stil.weight, inaktiv.weight, "der aktive Eintrag hat keinen eigenen Schriftschnitt");
  assert.match(stil.shadow, /inset/, "die Akzentkante des aktiven Eintrags fehlt");
  await page.close();
});

test("2 — der Bestätigungsdialog hat Fokusfalle, Fokusrückgabe und Escape", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });

  const trigger = page.locator(".adm-rowactions button").first();
  await trigger.waitFor({ state: "visible" });
  await trigger.click();
  await page.locator(".adm-rowactions-menu [role=menuitem]").first().click();

  const dialog = page.locator("[role=dialog]");
  await dialog.waitFor({ state: "visible" });

  // Der Fokus liegt im Dialog und NICHT auf der bestätigenden Aktion.
  const imDialog = await page.evaluate(() => {
    const d = document.querySelector("[role=dialog]");
    return d && d.contains(document.activeElement);
  });
  assert.equal(imDialog, true, "der Fokus steht nicht im Dialog");
  const aktivText = await page.evaluate(() => (document.activeElement?.textContent || "").trim());
  assert.doesNotMatch(aktivText, /blockieren|freischalten|reaktivieren/i,
    "der Fokus liegt auf der bestätigenden Aktion");

  // Die Fokusfalle hält: Tab läuft nie aus dem Dialog heraus.
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press("Tab");
    const drin = await page.evaluate(() => {
      const d = document.querySelector("[role=dialog]");
      return d && d.contains(document.activeElement);
    });
    assert.equal(drin, true, `Tab ${i + 1} verlässt den Dialog`);
  }

  // Escape schließt und gibt den Fokus zurück.
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  const zurueck = await page.evaluate(() =>
    document.activeElement?.closest(".adm-rowactions") !== null);
  assert.equal(zurueck, true, "der Fokus kehrt nicht zum auslösenden Element zurück");
  await page.close();
});

test("3 — leere Datumsfelder zeigen TT.MM.JJJJ statt mm/dd/yyyy", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/admin/audit-logs`, { waitUntil: "networkidle" });

  const platzhalter = page.locator(".adm-datefield-ph").first();
  await platzhalter.waitFor({ state: "visible" });
  assert.equal((await platzhalter.textContent()).trim(), "TT.MM.JJJJ");

  // Der Platzhalter liegt über dem Feld — er liest sich als dessen Inhalt.
  const feldBox = await page.locator("#f-from").boundingBox();
  const phBox = await platzhalter.boundingBox();
  assert.ok(phBox.x >= feldBox.x && phBox.x < feldBox.x + feldBox.width,
    "der deutsche Platzhalter liegt nicht im Feld");

  // Die Unsichtbarkeit des nativen Formathinweises selbst ist eine reine
  // CSS-Tatsache (::-webkit-datetime-edit liegt in einem geschlossenen
  // Shadow-Root und ist über getComputedStyle nicht erreichbar). Sie wird in
  // src/styles/premiumAdmin.test.mjs am Stylesheet festgehalten; hier wird das
  // beobachtbare Verhalten geprüft.

  // Nach dem Setzen eines Werts verschwindet der Platzhalter, der Wert bleibt ISO.
  await page.locator("#f-from").fill("2026-08-01");
  await page.waitForTimeout(150);
  assert.equal(await page.locator("#f-from").inputValue(), "2026-08-01",
    "der Feldwert ist nicht mehr im ISO-Format des Backendvertrags");
  assert.equal(await page.locator("#f-from ~ .adm-datefield-ph").count(), 0,
    "der Platzhalter bleibt über dem gefüllten Feld stehen");
  await page.close();
});

test("4 — Adminlisten laufen bei 390 px nicht über und zeigen Karten", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page);
  const LISTEN = [
    ["/admin/users", ".adm-users-cards", ".adm-users-table"],
    ["/admin/shipments", ".adm-ships-cards", ".adm-ships-table"],
    ["/admin/invoices", ".adm-inv-cards", ".adm-inv-table"],
  ];
  for (const [route, karten, tabelle] of LISTEN) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    // Echter Überlauf: tatsächlich horizontal scrollen versuchen.
    const scrollX = await page.evaluate(() => {
      window.scrollTo(9999, 0); const x = window.scrollX; window.scrollTo(0, 0); return x;
    });
    assert.equal(scrollX, 0, `${route}: horizontaler Überlauf`);
    // Karten sichtbar, Tabelle ausgeblendet — beide Seiten des Umschalters.
    await page.locator(karten).waitFor({ state: "attached" });
    assert.equal(await page.locator(karten).isVisible(), true, `${route}: keine Kartenansicht`);
    assert.equal(await page.locator(tabelle).isVisible(), false, `${route}: die Tabelle bleibt sichtbar`);
  }
  await page.close();
});

test("5 — die Kennzahlen der Übersicht kommen aus dem Serverzähler", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.locator(".adm-metric").first().waitFor({ state: "visible" });

  const werte = await page.locator(".adm-metric-value").allTextContents();
  // Kunden 3, offene Rechnungen 2, überfällige 2, Stornierungen 4, Support 5 —
  // exakt die Zähler aus der Pagination, nichts Hochgerechnetes.
  assert.deepEqual(werte.map((w) => w.trim()), ["3", "2", "2", "4", "5"]);

  // Handlungsbedarf wird nicht allein über die Farbe vermittelt.
  const iconFlaechen = await page.locator(".adm-metric-ic").evaluateAll((els) =>
    els.map((e) => getComputedStyle(e).backgroundColor));
  assert.ok(new Set(iconFlaechen).size >= 2, "alle Kennzahlen sehen gleich aus");
  await page.close();
});

test("6 — ohne Serverzähler wird keine Zahl erfunden", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page, { zaehler: false });
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.locator(".adm-metric").first().waitFor({ state: "visible" });

  const werte = await page.locator(".adm-metric-value").allTextContents();
  for (const w of werte) {
    assert.equal(w.trim(), "—", `es wurde eine Zahl erfunden: ${w}`);
  }
  const hinweise = await page.locator(".adm-metric-hint").allTextContents();
  assert.ok(hinweise.every((h) => h.includes("Anzahl nicht verfügbar")),
    "der fehlende Zähler wird nicht ehrlich benannt");
  // Die Bereiche bleiben trotzdem erreichbar.
  assert.ok(await page.locator(".adm-tile").count() >= 6);
  await page.close();
});

test("7 — der mobile Drawer öffnet, schließt und hat 44-px-Ziele", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });

  const drawer = page.locator(".adm-side");
  assert.equal(await drawer.evaluate((el) => el.classList.contains("adm-side-open")), false);
  await page.locator(".adm-topbar-burger").click();
  await page.waitForTimeout(350);
  assert.equal(await drawer.evaluate((el) => el.classList.contains("adm-side-open")), true,
    "der Drawer öffnet nicht");

  // Trefferflächen der Navigation.
  const zuKlein = await page.locator(".adm-side button, .adm-side a").evaluateAll((els) =>
    els.filter((e) => e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44)
       .map((e) => `${e.tagName}.${e.className} ${Math.round(e.getBoundingClientRect().height)}`));
  assert.deepEqual(zuKlein, [], `Touch-Ziele unter 44 px: ${zuKlein.join(", ")}`);

  await page.locator(".adm-side-overlay").click({ position: { x: 380, y: 400 } });
  await page.waitForTimeout(350);
  assert.equal(await drawer.evaluate((el) => el.classList.contains("adm-side-open")), false,
    "der Drawer schließt nicht über das Overlay");
  await page.close();
});

test("8 — die Kundensuche filtert nur die geladene Seite und sagt das", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  let anfragen = 0;
  page.on("request", (r) => { if (r.url().includes("/admin/users")) anfragen += 1; });
  await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });
  const vorher = anfragen;

  await page.locator("#u-search").fill("ACME");
  await page.waitForTimeout(600);
  assert.equal(anfragen, vorher, "die Suche löst eine Serveranfrage aus");

  const hinweis = await page.locator("#u-search-hint").textContent();
  assert.match(hinweis, /nur die aktuell angezeigte Seite/);
  const label = await page.locator('label[for="u-search"]').textContent();
  assert.match(label, /Diese Seite durchsuchen/);
  await page.close();
});
