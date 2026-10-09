// E2E: Premium-Adminportal (Paket E) — echter Dev-Server, echte Kaskade.
//
// Prüft das, was eine reine Quelltextprüfung nicht erreicht:
//   • dass die Adminnavigation den aktiven Eintrag mehrfach codiert
//     (Fläche + Textfarbe + Schriftschnitt + aria-current), nicht allein über
//     Farbe (Redesign 2026-10: ohne Akzentkante, wie die Kunden-Sidebar),
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
    // Kennzahl „Kunden“: eigener Serverzähler (nur echte Kundenkonten); ohne Zähler kein total.
    if (p.endsWith("/admin/metrics/customer-accounts")) return json(zaehler ? { total: 3 } : {});
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
    return { bg: s.backgroundColor, color: s.color, weight: s.fontWeight, current: el.getAttribute("aria-current") };
  });
  const inaktiv = await page.locator(".adm-nitem:not(.adm-nitem-on)").first().evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, color: s.color, weight: s.fontWeight };
  });
  assert.notEqual(stil.bg, inaktiv.bg, "der aktive Eintrag hat keine eigene Fläche");
  assert.notEqual(stil.color, inaktiv.color, "der aktive Eintrag hat keine eigene Textfarbe");
  assert.notEqual(stil.weight, inaktiv.weight, "der aktive Eintrag hat keinen eigenen Schriftschnitt");
  assert.equal(stil.current, "page", "der aktive Eintrag ist nicht semantisch als aktuelle Seite markiert");
  // Reine Textnavigation: kein Symbol in der Sidebar. Die Marke ist die
  // Originalkomposition als <img>, kein Inline-SVG.
  assert.equal(await page.locator(".adm-side svg").count(), 0,
    "die Adminnavigation trägt wieder Symbole");
  await page.close();
});

test("1b — die Navigation ist nach Aufgaben gruppiert; jedes bisherige Ziel bleibt genau einmal erreichbar (UX-Paket 2)", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/admin/invoices/backfill`, { waitUntil: "networkidle" });
  const nav = page.locator(".adm-nav");
  await nav.waitFor({ state: "visible" });

  // Vier benannte Gruppen (für Screenreader über aria-labelledby), Übersicht davor.
  const gruppen = await nav.locator('[role="group"]').evaluateAll((els) => els.map((g) => ({
    name: document.getElementById(g.getAttribute("aria-labelledby"))?.textContent.trim(),
    links: [...g.querySelectorAll("a")].map((a) => [a.textContent.trim(), a.getAttribute("href")]),
  })));
  assert.deepEqual(gruppen, [
    { name: "Kunden und Partner", links: [["Kunden", "/admin/users"], ["Vertriebspartner", "/admin/partners"]] },
    { name: "Versand und Rechnungen", links: [["Sendungen", "/admin/shipments"], ["Rechnungen", "/admin/invoices"]] },
    { name: "Support und Bearbeitung", links: [["Supportanfragen", "/admin/support-requests"],
      ["Stornierungsanfragen", "/admin/cancellation-requests"], ["Buchungsklärung", "/admin/reconciliation"]] },
    { name: "Verwaltung und Protokoll", links: [["Interne Vorschau-PDFs", "/admin/invoices/backfill"], ["Protokoll", "/admin/audit-logs"]] },
  ]);
  const alle = await nav.locator("a").evaluateAll((els) => els.map((a) => a.getAttribute("href")));
  assert.deepEqual([...alle].sort(), ["/admin", "/admin/audit-logs", "/admin/cancellation-requests", "/admin/invoices",
    "/admin/invoices/backfill", "/admin/partners", "/admin/reconciliation", "/admin/shipments",
    "/admin/support-requests", "/admin/users"], "ein Ziel fehlt oder ist doppelt");
  // Auf der Vorschau-PDF-Seite ist genau ihr Eintrag aktiv — nicht zusätzlich „Rechnungen".
  assert.deepEqual(await page.locator(".adm-nitem-on").allInnerTexts(), ["Interne Vorschau-PDFs"]);
  await page.close();
});

test("1c — keine versteckte Navigation: alle Einträge ohne inneres Scrollen sichtbar (1440 × 900, 1366 × 768)", async () => {
  for (const [breite, hoehe] of [[1440, 900], [1366, 768]]) {
    const page = await browser.newPage({ viewport: { width: breite, height: hoehe } });
    await setupRoutes(page);
    await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    await page.locator(".adm-nav").waitFor({ state: "visible" });
    const m = await page.locator(".adm-nav").evaluate((nav) => {
      const letzter = [...nav.querySelectorAll("a")].pop();
      return { scroll: nav.scrollHeight, client: nav.clientHeight, text: letzter.textContent.trim(),
        unten: letzter.getBoundingClientRect().bottom, navUnten: nav.getBoundingClientRect().bottom };
    });
    assert.ok(m.scroll <= m.client, `${breite}×${hoehe}: die Navigation scrollt (${m.scroll} > ${m.client})`);
    assert.equal(m.text, "Protokoll");
    assert.ok(m.unten <= m.navUnten, `${breite}×${hoehe}: „Protokoll“ ist abgeschnitten`);
    await page.close();
  }
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

test("5 — Kennzahlen und Aufgaben der Übersicht kommen aus dem Serverzähler", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.locator('#adm-todo [data-task="support"] .adm-ops-count').filter({ hasText: "5" }).waitFor({ state: "visible" });

  // UX-Paket 2: Kunden 3 und offene Rechnungen 2 sind Bestand (Kennzahlen) …
  const werte = await page.locator(".adm-metric-value").allTextContents();
  assert.deepEqual(werte.map((w) => w.trim()), ["3", "2"]);
  // … überfällige Rechnungen 2, Stornierungen 4 und Support 5 sind Aufgaben —
  // exakt die Zähler aus der Pagination, nichts Hochgerechnetes.
  const aufgabe = async (key) => (await page.locator(`#adm-todo [data-task="${key}"] .adm-ops-count`).textContent()).trim();
  assert.deepEqual([await aufgabe("invoicesOverdue"), await aufgabe("cancellations"), await aufgabe("support")], ["2", "4", "5"]);

  // Handlungsbedarf wird nicht allein über die Farbe vermittelt: die Aufgaben
  // stehen unter der Überschrift „Zu erledigen" (Wort statt Farbe), die
  // Kennzahlen tragen keinen Handlungsbedarf.
  assert.equal((await page.locator("#adm-ov-todo").textContent()).trim(), "Zu erledigen");
  assert.equal(await page.locator(".adm-metric-flag").count(), 0);
  await page.close();
});

test("6 — ohne Serverzähler wird keine Zahl erfunden", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page, { zaehler: false });
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.locator(".adm-metric").first().waitFor({ state: "visible" });
  await page.locator("#adm-todo-unavailable").waitFor({ state: "visible" });

  const werte = await page.locator(".adm-metric-value").allTextContents();
  for (const w of werte) {
    assert.equal(w.trim(), "—", `es wurde eine Zahl erfunden: ${w}`);
  }
  const hinweise = await page.locator(".adm-metric-hint").allTextContents();
  assert.ok(hinweise.every((h) => h.includes("Anzahl nicht verfügbar")),
    "der fehlende Zähler wird nicht ehrlich benannt");
  // Unter „Zu erledigen" weder eine Zahl noch eine 0 noch „Nichts zu erledigen".
  assert.equal(await page.locator("#adm-todo .adm-ops-count").count(), 0, "es wurde eine Aufgabenzahl erfunden");
  assert.equal(await page.locator("#adm-todo-done").count(), 0, "eine unbekannte Zahl wird als 0 ausgegeben");
  assert.equal(await page.locator("#adm-todo-empty").count(), 0, "ohne Zahlen wird „nichts zu erledigen“ behauptet");
  assert.match(await page.locator("#adm-todo-unavailable").textContent(), /Anzahl nicht verfügbar:[\s\S]*Supportanfragen/);
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

test("7b — mobil versteckt die gruppierte Navigation nichts hinter dem Fuß: die ganze Spalte scrollt (UX-Paket 2)", async () => {
  for (const [breite, hoehe] of [[390, 844], [375, 667]]) {
    const page = await browser.newPage({ viewport: { width: breite, height: hoehe } });
    await setupRoutes(page);
    await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle" });
    await page.locator(".adm-topbar-burger").click();
    await page.waitForTimeout(350);
    const drawer = page.locator(".adm-side");
    // Kein innerer Scrollbereich in der Navigation, der Einträge unsichtbar abschneidet.
    const nav = await page.locator(".adm-nav").evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    assert.ok(nav.scroll <= nav.client + 1, `${breite}×${hoehe}: die Navigation scrollt innen (${nav.scroll} > ${nav.client})`);
    // Ans Ende der Spalte gescrollt, sind der letzte Eintrag und „Abmelden" sichtbar.
    await drawer.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(100);
    for (const name of ["Protokoll", "Abmelden"]) {
      const sichtbar = await page.locator(".adm-side a, .adm-side button", { hasText: name }).first().evaluate((el) => {
        const r = el.getBoundingClientRect();
        const s = el.closest(".adm-side").getBoundingClientRect();
        return r.top >= s.top - 1 && r.bottom <= s.bottom + 1 && r.height > 0;
      });
      assert.ok(sichtbar, `${breite}×${hoehe}: „${name}“ bleibt auch nach dem Scrollen unsichtbar`);
    }
    await page.close();
  }
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
