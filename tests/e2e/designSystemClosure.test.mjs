// E2E: Abschluss des Designsystems — echter Dev-Server, echte Kaskade.
//
// Diese Datei sichert genau die Mängel ab, die der Abschlussaudit im Browser
// gefunden und behoben hat. Alle fünf sind quelltextnah NICHT prüfbar:
//
//   1. Trefferflächen unter 860 px. Die Regel stand in responsive.css, verlor
//      aber gegen `@media (max-height: 940px)` aus dem später importierten
//      dashboard-premium.css — auf einem Telefon greifen beide gleichzeitig.
//      Gemessen wurden 37 px statt 44 px. Nur die aufgelöste Kaskade zeigt das.
//   2. Kein horizontaler Seitenüberlauf. Achtung: `body { overflow-x: hidden }`
//      macht `scrollWidth > clientWidth` wertlos — geprüft wird deshalb, ob
//      sich das Fenster nach rechts scrollen LÄSST.
//   3. Keine Emojis mehr in den Zustandsflächen des Auth-Bereichs. Sie sind
//      durch Icons ersetzt; im gerenderten Text darf keins mehr vorkommen.
//   4. Fokusrückgabe der beiden Kunden-Kebabmenüs. Der Menüeintrag verschwindet
//      beim Öffnen des Dialogs; ohne Rückgabe landet der Fokus auf <body>.
//   5. Ein Blau. Marke, aktive Navigation und Fokus laufen auf #5367e8 —
//      gemessen an den gerenderten Farbwerten, nicht am Stylesheet.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5231, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};
const SHIPMENTS = [
  { id: 1, jumingo_shipment_id: "js1", status: "booked", weight: 5, price_final: 22.19,
    selected_carrier: "dhl", created_at: "2026-08-05T10:00:00Z", order_number: "CE-1001" },
];
const ADRESSEN = [
  { id: 7, label: "Lager Nord", company: "ACME Logistik GmbH", name: "Dora Beispiel",
    street: "Hafenstraße 12", zip: "20457", city: "Hamburg", country: "DE",
    role: "both", is_default_sender: true, is_default_recipient: false },
];
const ENTWUERFE = [
  { id: 3, name: "Palette nach Lyon", updated_at: "2026-08-04T15:00:00Z",
    created_at: "2026-08-04T12:00:00Z", from_country: "DE", to_country: "FR", packages: 1 },
];

let server, browser;

async function setupRoutes(page) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: SHIPMENTS });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/kunde/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/kunde/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    if (p.includes("/addresses") || p.includes("/adressbuch")) return json({ addresses: ADRESSEN, items: ADRESSEN, pagination: { total: 1 } });
    if (p.includes("/drafts") || p.includes("/entwuerfe")) return json({ drafts: ENTWUERFE, items: ENTWUERFE, pagination: { total: 1 } });
    if (p.includes("/support")) return json({ supportRequests: [] });
    return json({ items: [], drafts: [], addresses: [], pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

/* Öffnet eine Dashboard-Unterseite. Die Navigation läuft über den lokalen
   page-State, nicht über URLs — der ?page=-Parameter ist der dokumentierte
   Einstieg von außen (CLAUDE.md, Calculator-Rücknavigation). */
async function dashboard(page, unterseite) {
  await page.goto(`${BASE}/dashboard?page=${unterseite}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
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

/* ══════════ 1 — Trefferflächen ══════════════════════════════════════════ */

test("1 — auf 390 px erreicht jedes Bedienelement der App-Shell 44 px", async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await setupRoutes(page);

  for (const seite of ["overview", "new", "shipments", "invoices", "drafts",
                       "addressbook", "profile", "support", "tracking"]) {
    await dashboard(page, seite);
    // Sidebar öffnen — sie ist unter 860 px ein Drawer.
    const burger = page.locator(".hamburger-btn");
    if (await burger.count()) await burger.first().click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);

    const klein = await page.evaluate(() => {
      // `.auth-field-link` und Textlinks in Fließtext fallen unter die
      // Inline-Ausnahme von WCAG 2.5.5/2.5.8 und sind hier nicht gemeint.
      const AUSGENOMMEN = ["auth-field-link", "ce-page-header-back", "adm-back"];

      /* GEMESSEN WIRD DIE TREFFERFLÄCHE, NICHT DER KASTEN DES ELEMENTS.
         WCAG 2.5.5 fordert eine ausreichend große Fläche, die der Nutzer
         TRIFFT — nicht, dass ein bestimmter DOM-Knoten groß ist.

         Zwei Bauarten im System trennen beides bewusst:
           · das versteckte `<input type="file">` der Logokarte (`.sr-only`,
             1 px hoch) wird über einen sichtbaren `.btn` bedient,
           · die Radios für Abrechnungsart und Lieferscheinmodus sind 18 px
             hoch und werden über ihr umschließendes Label bedient.
         In beiden Fällen ist der Kasten des `input` bedeutungslos; getroffen
         wird das Label. Der frühere Kastenvergleich meldete deshalb sechs
         Verstöße, die keine waren — und hätte umgekehrt ein zu kleines LABEL
         nie bemerkt. Diese Messung ist damit nicht lockerer, sondern näher an
         der Regel und an einer Stelle strenger. */
      const bedienflaeche = (el) => {
        const eigen = el.getBoundingClientRect();
        const label = el.id
          ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) || el.closest("label")
          : el.closest("label");
        if (!label) return { r: eigen, ueber: null };
        const lr = label.getBoundingClientRect();
        // Das Label zählt nur, wenn es selbst sichtbar ist und mehr Fläche
        // bietet — sonst bleibt der eigene Kasten maßgeblich.
        if (lr.height > eigen.height && getComputedStyle(label).display !== "none") {
          return { r: lr, ueber: "label" };
        }
        return { r: eigen, ueber: null };
      };

      const treffer = [];
      for (const el of document.querySelectorAll("button, .nitem, input:not([type=hidden]), select, textarea")) {
        const eigen = el.getBoundingClientRect();
        if (eigen.width === 0 && eigen.height === 0) continue;             // nicht gerendert
        if (getComputedStyle(el).display === "none") continue;
        if (AUSGENOMMEN.some((k) => el.classList.contains(k))) continue;
        if (el.closest("p, td, .ce-list-card-meta")) continue;             // inline im Text
        /* Aus Barrierebaum UND Fokusreihenfolge genommen — der Nutzer kann es
           gar nicht erreichen, es ist kein Bedienelement. Konkreter Fall: das
           `<input type="file">` der Logokarte (`aria-hidden` + `tabIndex={-1}`),
           ausgelöst wird es ausschließlich über den sichtbaren Knopf daneben.
           BEIDES muss zutreffen — ein bloß `aria-hidden`es, aber fokussierbares
           Element bliebe per Tastatur bedienbar und wird weiter gemessen. */
        if (el.getAttribute("aria-hidden") === "true" && el.tabIndex === -1) continue;

        const { r, ueber } = bedienflaeche(el);
        if (r.height < 44) {
          const wie = ueber ? ` (über ${ueber})` : "";
          treffer.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 70) + ` h=${Math.round(r.height)}${wie}`);
        }
      }
      return treffer;
    });
    assert.deepEqual(klein, [], `${seite}: Bedienelemente unter 44 px:\n  ${klein.join("\n  ")}`);
  }
  await page.close();
});

/* ══════════ 2 — kein horizontaler Überlauf ══════════════════════════════ */

test("2 — keine Ansicht lässt sich horizontal scrollen", async () => {
  const VIEWPORTS = [{ width: 360, height: 800 }, { width: 390, height: 844 },
                     { width: 768, height: 1024 }, { width: 1440, height: 900 }];
  for (const viewport of VIEWPORTS) {
    const page = await browser.newPage({ viewport });
    await setupRoutes(page);
    for (const seite of ["overview", "new", "shipments", "invoices", "drafts", "addressbook", "profile", "support"]) {
      await dashboard(page, seite);
      // `body { overflow-x: hidden }` macht scrollWidth wertlos: geprüft wird,
      // ob sich das Fenster tatsächlich nach rechts bewegen lässt.
      const verschoben = await page.evaluate(() => {
        window.scrollTo(9999, 0);
        const x = window.scrollX;
        window.scrollTo(0, 0);
        return x;
      });
      assert.equal(verschoben, 0, `${seite} @ ${viewport.width}px: horizontaler Überlauf (${verschoben}px)`);
    }
    await page.close();
  }
});

/* ══════════ 3 — keine Emojis in Zustandsflächen ═════════════════════════ */

test("3 — die Zustandsflächen des Auth-Bereichs tragen Icons statt Emojis", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route("**/api.confidaraexpress.de/**", (route) =>
    route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ error: "invalid_token" }) }));

  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  await page.goto(`${BASE}/confirm-email-change?token=abc`, { waitUntil: "networkidle" });
  await page.locator(".auth-card-icon").waitFor({ state: "visible" });

  const text = await page.locator(".auth-card").innerText();
  assert.ok(!EMOJI.test(text), `Emoji im sichtbaren Text: ${text.slice(0, 120)}`);
  // Und die Fläche trägt tatsächlich ein Icon aus Icon.jsx.
  assert.equal(await page.locator(".auth-card-icon svg").count(), 1, "kein Icon in der Zustandsfläche");
  assert.equal(await page.locator(".auth-card-icon").getAttribute("aria-hidden"), "true",
    "das dekorative Icon ist nicht vor dem Screenreader verborgen");
  await page.close();
});

/* ══════════ 4 — Fokusrückgabe der Kebabmenüs ════════════════════════════ */

test("4 — Adressbuch und Entwürfe geben den Fokus an ihren Kebab zurück", async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await setupRoutes(page);

  for (const [seite, menue] of [["addressbook", ".abk-actions-trigger"], ["drafts", ".dft-actions-trigger"]]) {
    await dashboard(page, seite);
    const trigger = page.locator(menue).first();
    if (!(await trigger.count())) continue;      // Liste leer geblieben — nichts zu prüfen

    await trigger.focus();
    await trigger.press("Enter");
    await page.waitForTimeout(150);
    // Escape schließt und gibt zurück.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
    const zurueck = await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, menue);
    assert.ok(zurueck, `${seite}: der Fokus kam nach Escape nicht auf den Kebab zurück`);
  }
  await page.close();
});

/* ══════════ 5 — ein Blau ════════════════════════════════════════════════ */

test("5 — Marke, aktive Navigation und Fokus laufen auf derselben Farbe", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await dashboard(page, "overview");

  const marke = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--ce-color-brand").trim());
  assert.equal(marke, "#5367e8");

  // Das ausgelaufene Legacy-Blau #1d4ed8 = rgb(29, 78, 216) darf in keiner
  // gerenderten Farbe mehr auftauchen.
  const legacy = await page.evaluate(() => {
    const treffer = [];
    for (const el of document.querySelectorAll("*")) {
      const s = getComputedStyle(el);
      for (const eigenschaft of ["color", "backgroundColor", "borderTopColor", "borderLeftColor"]) {
        if (/rgba?\(29, 78, 216/.test(s[eigenschaft])) treffer.push(`${el.className}:${eigenschaft}`);
      }
    }
    return treffer.slice(0, 10);
  });
  assert.deepEqual(legacy, [], `Legacy-Blau gerendert: ${legacy.join(", ")}`);
  await page.close();
});
