// E2E: Markenintegration Web (Paket 1) — echter Dev-Server, echte Kaskade.
//
// Quelltextnah nicht prüfbar und deshalb hier:
//
//   1. Ob die Marke auf ihrer TATSÄCHLICHEN Fläche lesbar ist. Die Tonlage
//      (standard/reverse) wird im JSX gewählt, die Hintergrundfarbe entsteht
//      aber erst aus der aufgelösten Kaskade. Geprüft wird der gemessene
//      Kontrast zwischen gerenderter Schriftfarbe und gerenderter Fläche.
//   2. Ob die Wortmarke irgendwo umbricht oder abgeschnitten wird. Das hängt an
//      der realen Breite neben Menü- und Glockenschaltfläche, nicht am CSS.
//   3. Ob die Anmeldung ihren Markenanker trägt — und weiterhin genau einen.
//   4. Ob das Formular der Anmeldung unverändert bedienbar geblieben ist.
//   5. Ob das Favicon tatsächlich ausgeliefert wird und die Marke zeigt.
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

const KUNDE = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "10115", customer_number: "CE-K-10030",
};
const ADMIN = { ...KUNDE, id: 2, email: "anna@example.com", name: "Anna Admin", role: "admin" };

let server, browser;

async function setupRoutes(page, user = KUNDE) {
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/kundenbereich")) return json({ user });
    if (p.endsWith("/kunde/shipments")) return json({ shipments: [] });
    if (p.endsWith("/kunde/invoices")) return json({ invoices: [], summary: null });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, snapshotAt: "", pagination: {} });
    return json({ items: [], users: [], shipments: [], invoices: [], pagination: { total: 0 } });
  });
  await page.addInitScript(() => localStorage.setItem("ce_token", "e2e-token"));
}

/* Kontrast zweier gerenderter Farben nach WCAG. Beide kommen als rgb()-String
   aus getComputedStyle; Alpha spielt hier keine Rolle, weil ausschließlich
   deckende Werte gemessen werden. */
const KONTRAST_FN = `(vorne, hinten) => {
  const zahl = (s) => s.match(/[\\d.]+/g).slice(0, 3).map(Number);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = (s) => { const [r, g, b] = zahl(s); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const a = L(vorne), b = L(hinten);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}`;

/* Die tragenden Flächen des Produkts sind VERLÄUFE (background-image), nicht
   Flächenfarben — getComputedStyle().backgroundColor meldet dort transparent.
   Wer nur diesen Wert liest, läuft bis zum weißen <body> durch und misst
   Weiß auf Weiß. Deshalb werden auf dem Weg nach oben beide Quellen gelesen
   und ALLE Farbstopps eines Verlaufs eingesammelt; gewertet wird später der
   ungünstigste. */
const GRUND_FN = `(el) => {
  for (let n = el; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    const kandidaten = [];
    const bg = s.backgroundColor;
    if (bg && !/rgba\\([^)]*,\\s*0\\)/.test(bg) && bg !== "transparent") kandidaten.push(bg);
    if (s.backgroundImage && s.backgroundImage !== "none") {
      for (const m of s.backgroundImage.matchAll(/rgba?\\([^)]+\\)/g)) {
        // Vollständig transparente Stopps tragen keine Fläche.
        if (!/rgba\\([^)]*,\\s*0\\)/.test(m[0])) kandidaten.push(m[0]);
      }
    }
    if (kandidaten.length) return kandidaten;
  }
  return ["rgb(255, 255, 255)"];
}`;

async function markenKontrast(page, wurzel) {
  return page.evaluate(([sel, kontrastQuelle, grundQuelle]) => {
    const kontrast = eval(kontrastQuelle), grund = eval(grundQuelle);
    const brand = document.querySelector(sel);
    if (!brand) return null;
    const wort = brand.querySelector(".ce-brand-word");
    const express = brand.querySelector(".ce-brand-word b");
    const bild = brand.querySelector(".ce-brandmark-img");
    const r = bild ? bild.getBoundingClientRect() : null;
    // Ungünstigster Stopp der tragenden Fläche — nicht der freundlichste.
    const schlechtester = (el) => {
      const farbe = getComputedStyle(el).color;
      return Math.min(...grund(el).map((g) => kontrast(farbe, g)));
    };
    return {
      wortFarbe: getComputedStyle(wort).color,
      wortKontrast: schlechtester(wort),
      expressKontrast: schlechtester(express),
      bildBreite: r ? Math.round(r.width) : 0,
      bildHoehe: r ? Math.round(r.height) : 0,
      // Vite bettet SVGs unter ~4 KB als Data-URI ein (siehe CLAUDE.md) — im
      // src steht deshalb kein Dateiname. Die Variante wird an ihrer Farbe
      // erkannt: Standard trägt Primary Navy, Reverse trägt Off-White.
      variante: (() => {
        if (!bild) return null;
        const quelle = decodeURIComponent(bild.getAttribute("src") || "");
        if (/#111A33/i.test(quelle)) return "standard";
        if (/#F7F8FC/i.test(quelle)) return "reverse";
        return "unbekannt";
      })(),
      sichtbar: !!(r && r.width > 0 && r.height > 0),
    };
  }, [wurzel, KONTRAST_FN, GRUND_FN]);
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

/* ══════════ 1 — Kunden-Sidebar ═════════════════════════════════════════ */

test("1 — die Kunden-Sidebar trägt die Wortmarke lesbar auf dunklem Grund", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

  const m = await markenKontrast(page, ".pp-logo .ce-brand");
  assert.ok(m, "kein Markenbauteil in der Sidebar");
  assert.ok(m.sichtbar, "die Bildmarke wird nicht gerendert");
  assert.equal(m.variante, "reverse", "die Sidebar zeigt nicht die Reverse-Variante");
  assert.deepEqual([m.bildBreite, m.bildHoehe], [24, 24], "die Bildmarke hat nicht 24×24");
  // Reverse: die Wortmarke steht durchgehend hell, „Express" also gleich hell.
  assert.ok(m.wortKontrast >= 4.5, `Wortmarke nur ${m.wortKontrast.toFixed(2)}:1`);
  assert.ok(m.expressKontrast >= 4.5, `„Express" nur ${m.expressKontrast.toFixed(2)}:1`);

  // Chipfläche und Wortmarke stehen nebeneinander, nicht übereinander.
  const nebeneinander = await page.evaluate(() => {
    const chip = document.querySelector(".pp-logo .ce-brandmark").getBoundingClientRect();
    const wort = document.querySelector(".pp-logo .ce-brand-word").getBoundingClientRect();
    return wort.left >= chip.right - 1;
  });
  assert.ok(nebeneinander, "Bildmarke und Wortmarke überlagern sich");
  await page.close();
});

/* ══════════ 2 — Admin-Sidebar ══════════════════════════════════════════ */

test("2 — die Admin-Sidebar trägt dieselbe Marke, lesbar auf heller Fläche", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page, ADMIN);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });

  const m = await markenKontrast(page, ".adm-brand .ce-brand");
  assert.ok(m, "kein Markenbauteil in der Adminnavigation");
  assert.ok(m.sichtbar, "die Bildmarke wird nicht gerendert");
  // Helle Fläche → Standardvariante. Eine Reverse-Marke wäre hier unsichtbar.
  assert.equal(m.variante, "standard", "die Adminnavigation zeigt nicht die Standardvariante");
  assert.deepEqual([m.bildBreite, m.bildHoehe], [22, 22], "die Bildmarke hat nicht 22×22");
  assert.ok(m.wortKontrast >= 4.5, `Wortmarke nur ${m.wortKontrast.toFixed(2)}:1`);
  // Hier trägt „Express" die Markenfarbe und muss trotzdem AA erfüllen.
  assert.ok(m.expressKontrast >= 4.5, `„Express" nur ${m.expressKontrast.toFixed(2)}:1`);
  // Die Bereichskennzeichnung bleibt eigener Text neben der Marke — nicht Teil
  // des Logos. Gelesen wird textContent: die Klasse rendert versal (unverändert).
  assert.equal(await page.locator(".adm-brand-tag").textContent(), "Adminbereich");
  assert.equal(await page.locator(".adm-brand .ce-brand-word").textContent(), "ConfidaraExpress");
  await page.close();
});

/* ══════════ 3 — Anmeldung ══════════════════════════════════════════════ */

test("3 — die Anmeldung trägt genau einen Markenanker und ein intaktes Formular", async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

    assert.equal(await page.locator(".auth-brand").count(), 1,
      `${viewport.width}px: es muss genau ein Markenanker sein`);
    const m = await markenKontrast(page, ".auth-brand");
    assert.ok(m.sichtbar, `${viewport.width}px: Bildmarke nicht gerendert`);
    assert.equal(m.variante, "reverse", "die Anmeldung zeigt nicht die Reverse-Variante");
    assert.ok(m.wortKontrast >= 4.5,
      `${viewport.width}px: Wortmarke nur ${m.wortKontrast.toFixed(2)}:1`);

    // Der Claim erscheint nirgends.
    const text = await page.locator(".auth-shell").innerText();
    assert.ok(!/versandvermittlung/i.test(text), "der Claim steht produktiv auf der Seite");

    // Das Formular ist unverändert bedienbar.
    await page.fill('input[type="email"]', "max@example.com");
    assert.equal(await page.inputValue('input[type="email"]'), "max@example.com");
    assert.ok(await page.locator('input[type="password"]').count() >= 1, "Passwortfeld fehlt");
    assert.ok(await page.locator(".auth-tab").count() === 2, "die beiden Reiter fehlen");

    // Kein waagerechter Überlauf — body{overflow-x:hidden} macht scrollWidth
    // wertlos, deshalb wird echtes Scrollen geprüft.
    const ueberlauf = await page.evaluate(() => {
      window.scrollTo(9999, 0);
      const x = window.scrollX; window.scrollTo(0, 0); return x;
    });
    assert.equal(ueberlauf, 0, `${viewport.width}px: die Seite lässt sich nach rechts scrollen`);
    await page.close();
  }
});

/* ══════════ 4 — mobile Kopfzeile ═══════════════════════════════════════ */

test("4 — die mobile Kopfzeile zeigt die Wortmarke ungekürzt und einzeilig", async () => {
  for (const breite of [360, 390, 430, 768]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 844 } });
    await setupRoutes(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

    const m = await page.evaluate(() => {
      const brand = document.querySelector(".mobile-topbar .topbar-brand");
      if (!brand) return null;
      const wort = brand.querySelector(".ce-brand-word");
      const bild = brand.querySelector(".ce-brandmark-img");
      const wr = wort.getBoundingClientRect(), br = bild.getBoundingClientRect();
      const bar = document.querySelector(".mobile-topbar").getBoundingClientRect();
      return {
        sichtbar: getComputedStyle(brand).display !== "none" && wr.width > 0,
        // Abgeschnitten? Der sichtbare Kasten wäre schmaler als der Textinhalt.
        gekuerzt: wort.scrollWidth > Math.ceil(wr.width) + 1,
        // Umgebrochen? Dann wäre die Zeile höher als eine Zeilenhöhe.
        zeilen: Math.round(wr.height / parseFloat(getComputedStyle(wort).lineHeight)),
        text: wort.textContent,
        bildGross: Math.round(br.width),
        passtInLeiste: wr.right <= bar.right && br.left >= bar.left,
      };
    });
    assert.ok(m, `${breite}px: keine Marke in der Kopfzeile`);
    assert.ok(m.sichtbar, `${breite}px: die Marke ist nicht sichtbar`);
    assert.equal(m.text, "ConfidaraExpress", `${breite}px: Wortmarke verändert`);
    assert.ok(!m.gekuerzt, `${breite}px: die Wortmarke wird abgeschnitten`);
    assert.equal(m.zeilen, 1, `${breite}px: die Wortmarke bricht um`);
    assert.equal(m.bildGross, 20, `${breite}px: das Signet hat nicht 20 px`);
    assert.ok(m.passtInLeiste, `${breite}px: die Marke ragt aus der Kopfzeile`);

    const ueberlauf = await page.evaluate(() => {
      window.scrollTo(9999, 0);
      const x = window.scrollX; window.scrollTo(0, 0); return x;
    });
    assert.equal(ueberlauf, 0, `${breite}px: waagerechter Überlauf`);
    await page.close();
  }
});

/* ══════════ 5 — öffentliche Navigation ═════════════════════════════════ */

test("5 — öffentliche Leiste und Drawer zeigen die Marke in der richtigen Tonlage", async () => {
  // Helle Leiste auf einer öffentlichen Seite.
  const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await desktop.goto(`${BASE}/impressum`, { waitUntil: "networkidle" });
  const leiste = await markenKontrast(desktop, ".navbar-logo .ce-brand");
  assert.ok(leiste?.sichtbar, "keine Marke in der öffentlichen Leiste");
  assert.equal(leiste.variante, "standard", "die helle Leiste zeigt nicht die Standardvariante");
  assert.ok(leiste.wortKontrast >= 4.5, `Leiste: Wortmarke nur ${leiste.wortKontrast.toFixed(2)}:1`);
  assert.ok(leiste.expressKontrast >= 4.5, `Leiste: „Express" nur ${leiste.expressKontrast.toFixed(2)}:1`);
  // Die Marke ist ein echtes Bedienelement und per Tastatur erreichbar.
  assert.equal(await desktop.locator("button.navbar-logo").count(), 1,
    "die Marke der Leiste ist kein echter Button");
  await desktop.close();

  // Dunkler Drawer auf schmaler Breite.
  const mobil = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobil.goto(`${BASE}/impressum`, { waitUntil: "networkidle" });
  await mobil.locator(".navbar .hamburger-btn").click();
  await mobil.waitForTimeout(400);
  // Hinweis: der Drawerkopf liegt bei origin/main wie hier unter der fixierten
  // Navigationsleiste (z-index 999 gegen 1000) und ist dadurch verdeckt. Das ist
  // ein bestehender Stapelfehler der öffentlichen Navigation und NICHT Teil
  // dieses Pakets — geprüft wird deshalb die korrekte Tonlage und der Kontrast
  // der Fläche, auf der die Marke steht, nicht ihre optische Sichtbarkeit.
  const drawer = await markenKontrast(mobil, ".mobile-drawer-header .ce-brand");
  assert.ok(drawer?.sichtbar, "keine Marke im Drawer");
  assert.equal(drawer.variante, "reverse", "der dunkle Drawer zeigt nicht die Reverse-Variante");
  assert.ok(drawer.wortKontrast >= 4.5, `Drawer: Wortmarke nur ${drawer.wortKontrast.toFixed(2)}:1`);
  await mobil.close();
});

/* ══════════ 6 — Browser-Assets ═════════════════════════════════════════ */

test("6 — das Favicon wird ausgeliefert und zeigt die Marke", async () => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

  const href = await page.getAttribute('link[rel="icon"]', "href");
  assert.equal(href, "/favicon.svg", "die Favicon-Verknüpfung stimmt nicht");

  const antwort = await page.request.get(`${BASE}${href}`);
  assert.equal(antwort.status(), 200, "das Favicon wird nicht ausgeliefert");
  const svg = await antwort.text();
  assert.ok(!/<text/.test(svg), "das Favicon enthält noch eine Textmarke");
  assert.ok(svg.includes("M210 48C213 50"), "das Favicon zeigt nicht die Markengeometrie");

  // Die Marke rendert tatsächlich (kein kaputtes SVG) und füllt ihre Fläche.
  const gerendert = await page.evaluate(async (url) => {
    const bild = new Image();
    bild.src = url;
    await bild.decode();
    return { w: bild.naturalWidth, h: bild.naturalHeight };
  }, `${BASE}${href}`);
  assert.deepEqual(gerendert, { w: 64, h: 64 }, "das Favicon hat nicht 64×64");
  await page.close();
});
