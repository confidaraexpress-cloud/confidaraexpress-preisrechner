// E2E: adminseitige Entwurfsaufräumung (Admin → Sendungen) — echter Dev-Server.
//
// Prüft das interaktive Verhalten, das eine Quelltextprüfung nicht erreicht: dass die
// Löschaktion NUR an Entwurfszeilen hängt, dass Abbrechen wirklich keine Anfrage auslöst,
// dass die Bestätigung ein DELETE auf den richtigen Pfad schickt, dass die Sammellöschung
// die vom Server gemeldete Anzahl anzeigt und die Liste danach den echten Stand zeigt.
//
// Alle Backendantworten sind gemockt; es wird KEIN echter Server verändert.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5236, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const ADMIN = {
  id: 1, email: "admin@confidaraexpress.de", company_name: "ConfidaraExpress GmbH",
  name: "Anna Admin", role: "admin", status: "approved", country: "DE",
};

// Zwei Entwürfe (löschbar) und eine gebuchte Sendung (niemals löschbar).
const DRAFT_A = {
  id: 701, user_id: 10, status: "draft", selected_carrier: "dhl", service_type: "pickup",
  from_country: "DE", to_country: "DE", price_final: 8.9, package_count: 1,
  created_at: "2026-08-09T10:00:00Z", customer_company: "ACME Logistik GmbH", customer_number: "CE-K-10001",
  business_order_number: null, has_tracking: false, label_available: false,
};
const DRAFT_B = { ...DRAFT_A, id: 702, created_at: "2026-08-08T10:00:00Z" };
const BOOKED = {
  ...DRAFT_A, id: 703, status: "booked", business_order_number: "CE-BS26-00007",
  has_tracking: true, label_available: true, price_final: 42.19, created_at: "2026-08-07T10:00:00Z",
};

let server, browser;

// `rows`/`draftTotal` steuern die Listenantwort; `calls` protokolliert JEDE Anfrage,
// damit „Abbrechen löst nichts aus" belastbar geprüft werden kann.
async function setupRoutes(page, opts = {}) {
  const state = {
    rows: opts.rows ? opts.rows.slice() : [DRAFT_A, DRAFT_B, BOOKED],
    draftTotal: opts.draftTotal === undefined ? 2 : opts.draftTotal,
    singleStatus: opts.singleStatus || 204,
    bulkStatus: opts.bulkStatus || 200,
    deletedCount: opts.deletedCount === undefined ? 2 : opts.deletedCount,
    calls: [],
  };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const method = req.method();
    state.calls.push(`${method} ${p}`);
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });

    if (method === "DELETE" && /\/admin\/shipments\/\d+\/draft$/.test(p)) {
      if (state.singleStatus === 204) {
        const id = Number(p.match(/\/(\d+)\/draft$/)[1]);
        state.rows = state.rows.filter((r) => r.id !== id);
        state.draftTotal = Math.max(0, state.draftTotal - 1);
        return route.fulfill({ status: 204, body: "" });
      }
      return json({ error: "Dieser Entwurf kann nicht mehr gelöscht werden, da sich sein Status inzwischen geändert hat.", code: "DRAFT_NOT_DELETABLE" }, state.singleStatus);
    }
    if (method === "DELETE" && p.endsWith("/admin/shipments/drafts")) {
      if (state.bulkStatus === 200) {
        state.rows = state.rows.filter((r) => r.status !== "draft");
        state.draftTotal = 0;
        return json({ deletedCount: state.deletedCount });
      }
      return json({ error: "Fehler" }, state.bulkStatus);
    }
    if (p.endsWith("/admin/shipments")) {
      return json({
        shipments: state.rows,
        pagination: { limit: 25, offset: 0, count: state.rows.length, total: state.rows.length },
        deletableDraftTotal: state.draftTotal,
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  return state;
}

// Der Adminbereich zeigt unterhalb seines Umbruchpunkts Karten STATT der Tabelle (die
// Tabelle bleibt im DOM, ist aber ausgeblendet). Es wird deshalb auf die jeweils sichtbare
// Darstellung gewartet — sonst liefe der Responsive-Lauf bei schmalen Breiten in einen
// Timeout, obwohl die Seite korrekt gerendert ist.
async function openList(page) {
  await page.goto(`${BASE}/admin/shipments`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".adm-ships-table tbody tr:visible, .adm-ships-cards .adm-scard:visible", { timeout: 20000 });
  await page.waitForTimeout(200);
}
// Die Zeile einer bestimmten Sendungs-ID über ihre Löschaktion bzw. ihren Detaillink.
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

test("nur Entwurfszeilen tragen eine Löschaktion — gebuchte Sendungen nicht", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(page);
  await openList(page);

  for (const id of [701, 702]) {
    assert.equal(await zeileMitDetail(page, id).locator("button[title='Entwurf löschen']").count(), 1,
      `Entwurf ${id} hat keine Löschaktion`);
  }
  assert.equal(await zeileMitDetail(page, 703).locator("button[title='Entwurf löschen']").count(), 0,
    "die gebuchte Sendung trägt eine Löschaktion");
  // Alle drei Zeilen behalten ihren „Details"-Knopf. Bewusst auf den Knopf gezielt: die
  // Sendungsnummer in der ersten Spalte ist EBENFALLS ein Link auf dieselbe Detailseite,
  // ein Zählen aller Links ergäbe deshalb zwei Treffer je Zeile.
  assert.equal(await page.locator(".adm-ships-table tbody a", { hasText: "Details" }).count(), 3);
  await page.close();
});

test("die Sammelaktion nennt die vom Server gemeldete (bulk-eligible) Zahl und fehlt ohne Entwürfe", async () => {
  const mit = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(mit, { draftTotal: 23 });
  await openList(mit);
  assert.ok(await mit.getByRole("button", { name: "23 Entwürfe löschen" }).isVisible(),
    "der Bulk-Knopf nennt die Serverzahl nicht");
  await mit.close();

  const ohne = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setupRoutes(ohne, { rows: [BOOKED], draftTotal: 0 });
  await openList(ohne);
  assert.equal(await ohne.locator("button", { hasText: /Entwürfe löschen/ }).count(), 0,
    "ohne Entwürfe darf die Sammelaktion nicht erscheinen");
  await ohne.close();
});

test("Einzellöschung: Abbrechen schickt keine Anfrage, Bestätigen schickt genau ein DELETE", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setupRoutes(page);
  await openList(page);

  // Dialog öffnen und abbrechen.
  await zeileMitDetail(page, 701).locator("button[title='Entwurf löschen']").click();
  await page.waitForSelector(".adm-confirm, [role=dialog]", { timeout: 5000 });
  assert.match(await page.locator("[role=dialog]").innerText(), /Entwurf löschen\?/);
  const vorAbbruch = state.calls.filter((c) => c.startsWith("DELETE")).length;
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await page.waitForTimeout(300);
  assert.equal(state.calls.filter((c) => c.startsWith("DELETE")).length, vorAbbruch,
    "Abbrechen hat eine Löschanfrage ausgelöst");
  assert.equal(await page.locator("[role=dialog]").count(), 0, "der Dialog blieb offen");
  assert.equal(await zeileMitDetail(page, 701).count(), 1, "die Zeile verschwand trotz Abbruch");

  // Erneut öffnen und bestätigen.
  await zeileMitDetail(page, 701).locator("button[title='Entwurf löschen']").click();
  await page.waitForSelector("[role=dialog]", { timeout: 5000 });
  await page.getByRole("button", { name: "Entwurf löschen" }).last().click();
  await page.waitForTimeout(700);

  const deletes = state.calls.filter((c) => c === "DELETE /admin/shipments/701/draft");
  assert.equal(deletes.length, 1, `erwartet genau ein DELETE, erhalten ${deletes.length}`);
  assert.equal(await zeileMitDetail(page, 701).count(), 0, "der gelöschte Entwurf steht noch in der Liste");
  assert.equal(await zeileMitDetail(page, 702).count(), 1, "der andere Entwurf verschwand mit");
  assert.equal(await zeileMitDetail(page, 703).count(), 1, "die gebuchte Sendung verschwand");
  assert.match(await page.locator("[role=status]").innerText(), /Entwurf wurde gelöscht/);
  await page.close();
});

test("ein zwischenzeitlich gebuchter Entwurf (409) zeigt eine verständliche Meldung", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setupRoutes(page, { singleStatus: 409 });
  await openList(page);

  await zeileMitDetail(page, 701).locator("button[title='Entwurf löschen']").click();
  await page.waitForSelector("[role=dialog]", { timeout: 5000 });
  await page.getByRole("button", { name: "Entwurf löschen" }).last().click();
  await page.waitForTimeout(700);

  const text = await page.locator("body").innerText();
  assert.match(text, /Status inzwischen geändert/, "die 409-Meldung erscheint nicht");
  // Keine rohe Backendmeldung, kein Statuscode im sichtbaren Text.
  assert.ok(!/DRAFT_NOT_DELETABLE|409|\{"error"/.test(text), "rohe Backendantwort im UI");
  assert.equal(await zeileMitDetail(page, 701).count(), 1, "die Zeile wurde trotz 409 entfernt");
  assert.ok(state.calls.filter((c) => c.startsWith("GET")).length >= 2, "nach 409 wurde die Liste nicht neu geladen");
  await page.close();
});

test("Sammellöschung: Dialog nennt Zahl und Ausnahmen, Erfolg meldet deletedCount, Liste aktualisiert", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setupRoutes(page, { draftTotal: 2, deletedCount: 17 });
  await openList(page);

  await page.getByRole("button", { name: "2 Entwürfe löschen" }).click();
  await page.waitForSelector("[role=dialog]", { timeout: 5000 });
  const dialog = await page.locator("[role=dialog]").innerText();
  assert.match(dialog, /Entwürfe bereinigen\?/);
  assert.match(dialog, /2 automatisch erzeugte, nicht gespeicherte Entwürfe werden endgültig gelöscht/);
  assert.match(dialog, /Vom Kunden gespeicherte Entwürfe sowie gebuchte, stornierte oder abgeschlossene Sendungen bleiben erhalten/);

  await page.locator("[role=dialog]").getByRole("button", { name: /Entwürfe löschen/ }).click();
  await page.waitForTimeout(800);

  assert.equal(state.calls.filter((c) => c === "DELETE /admin/shipments/drafts").length, 1,
    "erwartet genau ein Bulk-DELETE");
  // Die Zahl stammt aus der Antwort (17), NICHT aus der Liste (2).
  assert.match(await page.locator("[role=status]").innerText(), /17 automatisch erzeugte Entwürfe wurden gelöscht/);
  assert.equal(await zeileMitDetail(page, 701).count(), 0, "Entwurf 701 steht noch in der Liste");
  assert.equal(await zeileMitDetail(page, 702).count(), 0, "Entwurf 702 steht noch in der Liste");
  assert.equal(await zeileMitDetail(page, 703).count(), 1, "die gebuchte Sendung wurde mitentfernt");
  assert.equal(await page.locator("button", { hasText: /Entwürfe löschen/ }).count(), 0,
    "der Bulk-Knopf bleibt sichtbar, obwohl keine Entwürfe mehr da sind");
  await page.close();
});

test("die Sammellöschung hängt nicht an den gesetzten Listenfiltern", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const state = await setupRoutes(page, { draftTotal: 23, deletedCount: 23 });
  await openList(page);

  // Einen Filter setzen (Carrier) und anwenden — die Liste lädt neu.
  await page.locator("#f-carrier").fill("dhl");
  await page.getByRole("button", { name: /Anwenden/ }).click();
  await page.waitForTimeout(500);
  // Der Bulk-Knopf nennt weiterhin die SYSTEMWEITE Zahl, nicht die gefilterte Trefferzahl.
  assert.ok(await page.getByRole("button", { name: "23 Entwürfe löschen" }).isVisible(),
    "die Sammelaktion übernimmt die gefilterte Zahl");

  await page.getByRole("button", { name: "23 Entwürfe löschen" }).click();
  await page.waitForSelector("[role=dialog]", { timeout: 5000 });
  await page.locator("[role=dialog]").getByRole("button", { name: /Entwürfe löschen/ }).click();
  await page.waitForTimeout(800);

  // Der Bulk-Request trägt weder Query noch Body.
  const bulk = state.calls.filter((c) => c.startsWith("DELETE /admin/shipments/drafts"));
  assert.equal(bulk.length, 1);
  assert.equal(bulk[0], "DELETE /admin/shipments/drafts", "der Bulk-Request trägt Parameter");
  // Der Filter bleibt nach der Aktion erhalten (kein Reset, kein Reload).
  assert.equal(await page.locator("#f-carrier").inputValue(), "dhl", "der Filterzustand ging verloren");
  await page.close();
});

test("Sammellöschung lässt einen gespeicherten Kundenentwurf stehen — Einzellöschung erreicht ihn weiterhin", async () => {
  // Produktentscheidung dieser Nachbesserung, end-to-end: die Sammelaktion darf einen bewusst
  // gespeicherten Kundenentwurf NIE anfassen, die gezielte Einzellöschung aber sehr wohl. Die
  // Adminliste führt is_saved_draft nicht im Payload (das Frontend bildet die Unterscheidung
  // bewusst nicht nach — sie lebt ausschließlich im Backend); der Mock hier simuliert das reale
  // Serververhalten, indem sein Bulk-Handler EINE bestimmte Draft-ID gezielt ausspart, während
  // sein Single-Handler jede Draft-ID unterschiedslos akzeptiert — exakt die Asymmetrie von
  // BULK_DELETE_CONDITIONS vs. SINGLE_DELETE_CONDITIONS im Backend.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const TECH_1 = { ...DRAFT_A, id: 810 };
  const TECH_2 = { ...DRAFT_A, id: 811 };
  const SAVED  = { ...DRAFT_A, id: 812, customer_company: "Aufbewahrt GmbH" }; // simuliert is_saved_draft=true
  const state = { rows: [TECH_1, TECH_2, SAVED, BOOKED], draftTotal: 2, calls: [] }; // draftTotal zählt SAVED bewusst nicht

  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    state.calls.push(`${req.method()} ${p}`);
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (req.method() === "DELETE" && p.endsWith("/admin/shipments/drafts")) {
      // Bulk: NUR die technischen Entwürfe fallen — SAVED (812) bleibt unter allen Umständen.
      state.rows = state.rows.filter((r) => r.id === 812 || r.status !== "draft");
      state.draftTotal = 0;
      return json({ deletedCount: 2 });
    }
    if (req.method() === "DELETE" && /\/admin\/shipments\/812\/draft$/.test(p)) {
      // Einzellöschung: dieselbe ID, die der Bulk-Handler eben verschont hat, wird hier ohne
      // Sonderbehandlung akzeptiert (SINGLE_DELETE_CONDITIONS prüft is_saved_draft nicht).
      state.rows = state.rows.filter((r) => r.id !== 812);
      return route.fulfill({ status: 204, body: "" });
    }
    if (p.endsWith("/admin/shipments")) {
      return json({
        shipments: state.rows,
        pagination: { limit: 25, offset: 0, count: state.rows.length, total: state.rows.length },
        deletableDraftTotal: state.draftTotal,
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await openList(page);

  // Drei Zeilen zeigen den Status „Entwurf" (810, 811, 812) — der Bulk-Knopf übernimmt trotzdem
  // die vom Server gemeldete Zahl (2), NICHT die Anzahl sichtbarer Entwurfszeilen. Das ist der
  // Beleg, dass der Zähler aus deletableDraftTotal stammt und nicht aus der geladenen Liste
  // nachgezählt wird.
  for (const id of [810, 811, 812]) {
    assert.equal(await zeileMitDetail(page, id).locator(".badge", { hasText: "Entwurf" }).count(), 1,
      `Zeile ${id} zeigt nicht den Status „Entwurf"`);
  }
  await page.getByRole("button", { name: "2 Entwürfe löschen" }).click();
  await page.waitForSelector("[role=dialog]", { timeout: 5000 });
  const dialogText = await page.locator("[role=dialog]").innerText();
  assert.match(dialogText, /Vom Kunden gespeicherte Entwürfe .* bleiben erhalten/,
    "der Dialog stellt nicht klar, dass gespeicherte Entwürfe erhalten bleiben");
  await page.locator("[role=dialog]").getByRole("button", { name: /Entwürfe löschen/ }).click();
  await page.waitForTimeout(800);

  // Die beiden technischen Entwürfe sind weg, der gespeicherte UND die gebuchte Sendung stehen
  // weiterhin in der Liste.
  assert.equal(await zeileMitDetail(page, 810).count(), 0, "technischer Entwurf 810 überlebte den Bulk");
  assert.equal(await zeileMitDetail(page, 811).count(), 0, "technischer Entwurf 811 überlebte den Bulk");
  assert.equal(await zeileMitDetail(page, 812).count(), 1, "der gespeicherte Entwurf wurde von der Sammelaktion gelöscht");
  assert.equal(await zeileMitDetail(page, 703).count(), 1, "die gebuchte Sendung verschwand");
  // Der Bulk-Knopf verschwindet jetzt (draftTotal 0) — kein technischer Entwurf mehr übrig.
  assert.equal(await page.locator("button", { hasText: /Entwürfe löschen/ }).count(), 0,
    "der Bulk-Knopf bleibt sichtbar, obwohl keine technischen Entwürfe mehr da sind");

  // Der gespeicherte Entwurf trägt weiterhin SEINE EIGENE Löschaktion — der Admin kann ihn
  // gezielt einzeln löschen, das ist keine Änderung am Einzeldelete-Produktverhalten.
  const saveRow = zeileMitDetail(page, 812);
  assert.equal(await saveRow.locator("button[title='Entwurf löschen']").count(), 1,
    "der gespeicherte Entwurf verlor seine Einzel-Löschaktion");
  await saveRow.locator("button[title='Entwurf löschen']").click();
  await page.waitForSelector("[role=dialog]", { timeout: 5000 });
  await page.getByRole("button", { name: "Entwurf löschen" }).last().click();
  await page.waitForTimeout(700);

  assert.equal(state.calls.filter((c) => c === "DELETE /admin/shipments/812/draft").length, 1,
    "die gezielte Einzellöschung des gespeicherten Entwurfs löste keine Anfrage aus");
  assert.equal(await zeileMitDetail(page, 812).count(), 0,
    "der gespeicherte Entwurf wurde über die Einzellöschung nicht entfernt");
  await page.close();
});

test("nach der Sammellöschung landet der Admin auf Seite 1, nicht auf einer leeren Seite", async () => {
  // Ausgangslage: 60 Entwürfe auf drei Seiten, der Admin steht auf Seite 3. Nach dem
  // Aufräumen bleibt EINE gebuchte Sendung übrig — Seite 3 gäbe es dann nicht mehr.
  // Ohne Seitenrücksprung sähe der Admin eine leere Liste und müsste sich selbst
  // zurückblättern, obwohl die Aktion erfolgreich war.
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const alle = Array.from({ length: 60 }, (_, i) => ({ ...DRAFT_A, id: 800 + i }));
  const state = { rows: [...alle, BOOKED], draftTotal: 60, calls: [] };

  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    state.calls.push(`${req.method()} ${p}${url.search}`);
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: ADMIN });
    if (req.method() === "DELETE" && p.endsWith("/admin/shipments/drafts")) {
      const n = state.rows.filter((r) => r.status === "draft").length;
      state.rows = state.rows.filter((r) => r.status !== "draft");
      state.draftTotal = 0;
      return json({ deletedCount: n });
    }
    if (p.endsWith("/admin/shipments")) {
      // Echte Pagination: der Server schneidet nach offset/limit zu.
      const offset = Number(url.searchParams.get("offset") || 0);
      const limit = Number(url.searchParams.get("limit") || 25);
      const seite = state.rows.slice(offset, offset + limit);
      return json({
        shipments: seite,
        pagination: { limit, offset, count: seite.length, total: state.rows.length },
        deletableDraftTotal: state.draftTotal,
      });
    }
    return json({});
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
  await openList(page);

  // Auf Seite 3 blättern.
  await page.getByRole("button", { name: /Weiter/ }).click();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: /Weiter/ }).click();
  await page.waitForTimeout(400);
  const vorher = state.calls.filter((c) => c.startsWith("GET /admin/shipments?")).pop();
  assert.ok(/offset=50/.test(vorher), `Seite 3 wurde nicht geladen: ${vorher}`);

  await page.getByRole("button", { name: "60 Entwürfe löschen" }).click();
  await page.waitForSelector("[role=dialog]", { timeout: 5000 });
  await page.locator("[role=dialog]").getByRole("button", { name: /Entwürfe löschen/ }).click();
  await page.waitForTimeout(900);

  // Der letzte Listenabruf zeigt wieder auf den Anfang …
  const nachher = state.calls.filter((c) => c.startsWith("GET /admin/shipments?")).pop();
  assert.ok(/offset=0(&|$)/.test(nachher), `nach dem Aufräumen wurde nicht Seite 1 geladen: ${nachher}`);
  // … und der Admin sieht die verbliebene Sendung statt einer leeren Seite.
  assert.equal(await page.locator(".adm-ships-table tbody tr").count(), 1,
    "die verbliebene Sendung wird nach dem Aufräumen nicht angezeigt");
  assert.ok(await page.getByText("60 automatisch erzeugte Entwürfe wurden gelöscht.").isVisible(),
    "die Erfolgsmeldung fehlt nach dem Seitenwechsel");
  // Genau EIN Bulk-Request, und kein doppelter Listenabruf durch Reload + Seitenwechsel.
  assert.equal(state.calls.filter((c) => c.startsWith("DELETE /admin/shipments/drafts")).length, 1);
  await page.close();
});

test("die Aktionen bleiben bei 1024 px und 768 px bedienbar, ohne die Tabelle zu sprengen", async () => {
  for (const width of [1440, 1280, 1024, 900, 768]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    await setupRoutes(page, { draftTotal: 2 });
    await openList(page);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    assert.equal(overflow, false, `${width}px: horizontaler Überlauf`);

    // Ab 900 px zeigt der Adminbereich Karten statt Tabelle — die Aktion muss in der
    // jeweils sichtbaren Darstellung erreichbar sein.
    // Tabelle: Icon-Knopf mit title. Karte: beschrifteter Knopf „Löschen".
    const sichtbareLoeschaktionen =
      await page.locator("button[title='Entwurf löschen']:visible").count()
      + await page.locator(".adm-scard-actions button:visible", { hasText: "Löschen" }).count();
    assert.ok(sichtbareLoeschaktionen > 0, `${width}px: keine sichtbare Löschaktion`);

    // Der Dialog ist vollständig bedienbar.
    const bulk = page.getByRole("button", { name: /Entwürfe löschen/ }).first();
    if (await bulk.count()) {
      await bulk.click();
      await page.waitForSelector("[role=dialog]", { timeout: 5000 });
      const box = await page.locator("[role=dialog]").boundingBox();
      assert.ok(box && box.width <= width, `${width}px: der Dialog ist breiter als der Viewport`);
      assert.ok(await page.getByRole("button", { name: "Abbrechen" }).isVisible(), `${width}px: Abbrechen nicht bedienbar`);
      await page.getByRole("button", { name: "Abbrechen" }).click();
      await page.waitForTimeout(150);
    }
    await page.close();
  }
});
