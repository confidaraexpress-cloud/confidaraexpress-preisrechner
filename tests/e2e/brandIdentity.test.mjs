// E2E: Markenintegration Web — echter Dev-Server, echte Kaskade.
//
// Quelltextnah nicht prüfbar und deshalb hier:
//
//   1. Ob die Marke ihre ORIGINALPROPORTIONEN behält. Ein <img> mit falsch
//      gesetzter Höhe verzerrt lautlos; nur das gerenderte Kastenverhältnis
//      gegen die viewBox des Assets zeigt das.
//   2. Ob sie auf ihrer TATSÄCHLICHEN Fläche lesbar ist. Die Tonlage wird im
//      JSX gewählt, die Hintergrundfarbe entsteht erst aus der aufgelösten
//      Kaskade — gemessen wird gegen die echten Verlaufsstopps.
//   3. Ob sie irgendwo abgeschnitten wird, aus ihrer Leiste ragt oder eine
//      schmale horizontale Fläche (öffentliche Leiste, 360–1440px) sprengt.
//      Ein position:fixed-Element dehnt document.scrollWidth nicht
//      zuverlässig aus — geprüft wird deshalb die Zeile selbst.
//   4. Ob nirgends mehr eine getippte Wortmarke sichtbar ist.
//   5. Ob das Formular der Anmeldung unverändert bedienbar geblieben ist.
//   6. Ob das Favicon ausgeliefert wird und die Markengeometrie zeigt.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5237, BASE = `http://127.0.0.1:${PORT}`;

// Seitenverhältnisse der Assets (viewBox des Masters, unverändert).
const SEITE = { signet: 506 / 424, wordmark: 1176 / 135, lockup: 1176 / 613 };

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

const KONTRAST_FN = `(vorne, hinten) => {
  const zahl = (s) => s.match(/[\\d.]+/g).slice(0, 3).map(Number);
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const L = (s) => { const [r, g, b] = zahl(s); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const a = L(vorne), b = L(hinten);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}`;

/* Die tragenden Flächen sind VERLÄUFE (background-image) — getComputedStyle()
   .backgroundColor meldet dort transparent. Wer nur diesen Wert liest, läuft bis
   zum weißen <body> durch und misst Weiß auf Weiß. Deshalb werden beide Quellen
   gelesen und alle Farbstopps eingesammelt; gewertet wird der ungünstigste. */
const GRUND_FN = `(el) => {
  for (let n = el; n; n = n.parentElement) {
    const s = getComputedStyle(n);
    const k = [];
    const bg = s.backgroundColor;
    if (bg && !/rgba\\([^)]*,\\s*0\\)/.test(bg) && bg !== "transparent") k.push(bg);
    if (s.backgroundImage && s.backgroundImage !== "none") {
      for (const m of s.backgroundImage.matchAll(/rgba?\\([^)]+\\)/g)) {
        if (!/rgba\\([^)]*,\\s*0\\)/.test(m[0])) k.push(m[0]);
      }
    }
    if (k.length) return k;
  }
  return ["rgb(255, 255, 255)"];
}`;

/* Liest die Marke einer Fläche aus: Variante und Tonlage werden am ausgelieferten
   Asset erkannt — die Wortmarken kommen als eigene Datei (über der Inline-Grenze
   von Vite), die Signets als Data-URI. Beide tragen ihre Farben im Inhalt. */
async function marke(page, wurzel) {
  return page.evaluate(([sel, kFn, gFn]) => {
    const kontrast = eval(kFn), grund = eval(gFn);
    const brand = document.querySelector(sel);
    if (!brand) return null;
    const bild = brand.querySelector(".ce-brandmark-img");
    if (!bild) return { fehlt: "kein Bild" };
    const r = bild.getBoundingClientRect();
    const src = decodeURIComponent(bild.getAttribute("src") || "");
    const inhalt = src.startsWith("data:") ? src : "";
    return {
      // Variante an der viewBox statt am Dateinamen: das Signet liegt unter
      // der Inline-Grenze von Vite und kommt als Data-URI ohne Namen. Die
      // viewBox belegt zugleich, dass der Ausschnitt unverändert ist.
      variante: /viewBox=['"]39 247 1176 613['"]/.test(inhalt) || /lockup/.test(src) ? "lockup"
              : /viewBox=['"]39 725 1176 135['"]/.test(inhalt) || /wordmark/.test(src) ? "wordmark"
              : /viewBox=['"]350 247 506 424['"]/.test(inhalt) || /signet/.test(src) ? "signet"
              : "unbekannt",
      ton: /#F7F8FC/i.test(inhalt) || /reverse/.test(src) ? "reverse"
         : /#111A33/i.test(inhalt) || /standard/.test(src) ? "standard" : "unbekannt",
      breite: r.width, hoehe: r.height,
      verhaeltnis: r.height > 0 ? r.width / r.height : 0,
      alt: bild.getAttribute("alt"),
      sichtbar: r.width > 0 && r.height > 0 && getComputedStyle(bild).display !== "none",
      // Kontrast der Markenfarbe gegen den ungünstigsten Stopp der Trägerfläche.
      kontrastHell: Math.min(...grund(bild).map((g) => kontrast("rgb(247, 248, 252)", g))),
      kontrastNavy: Math.min(...grund(bild).map((g) => kontrast("rgb(17, 26, 51)", g))),
      kontrastBlau: Math.min(...grund(bild).map((g) => kontrast("rgb(83, 103, 232)", g))),
    };
  }, [wurzel, KONTRAST_FN, GRUND_FN]);
}

// Proportionen: das gerenderte Verhältnis muss der viewBox entsprechen.
function pruefeProportion(m, variante, wo) {
  assert.equal(m.variante, variante, `${wo}: falsche Variante (${m.variante})`);
  const soll = SEITE[variante];
  assert.ok(Math.abs(m.verhaeltnis - soll) < 0.02,
    `${wo}: verzerrt — Verhältnis ${m.verhaeltnis.toFixed(3)} statt ${soll.toFixed(3)}`);
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

test("1 — die Kunden-Sidebar trägt die Originalkomposition, hell auf dunkel", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

  const m = await marke(page, ".pp-logo .ce-brand");
  assert.ok(m && m.sichtbar, "keine sichtbare Marke in der Sidebar");
  pruefeProportion(m, "lockup", "Sidebar");
  assert.equal(m.ton, "reverse", "die Sidebar zeigt nicht die Reverse-Fassung");
  assert.equal(m.alt, "ConfidaraExpress", "die Marke trägt ihren Namen nicht");
  assert.ok(m.kontrastHell >= 4.5, `Sidebar: Marke nur ${m.kontrastHell.toFixed(2)}:1`);

  // Sie passt in die Spalte und wird nicht abgeschnitten.
  const passt = await page.evaluate(() => {
    const b = document.querySelector(".pp-logo .ce-brandmark-img").getBoundingClientRect();
    const s = document.querySelector(".pp-side-in").getBoundingClientRect();
    return b.left >= s.left - 0.5 && b.right <= s.right + 0.5;
  });
  assert.ok(passt, "die Marke ragt aus der Sidebarspalte");
  // Und die Unterzeile steht darunter, nicht darin.
  assert.equal(await page.locator(".pp-brand-sub").textContent(), "B2B Versandplattform.");
  await page.close();
});

/* ══════════ 2 — Admin-Sidebar ══════════════════════════════════════════ */

test("2 — die Admin-Sidebar trägt dieselbe Marke, lesbar auf heller Fläche", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await setupRoutes(page, ADMIN);
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });

  const m = await marke(page, ".adm-brand .ce-brand");
  assert.ok(m && m.sichtbar, "keine sichtbare Marke in der Adminnavigation");
  pruefeProportion(m, "lockup", "Admin-Sidebar");
  assert.equal(m.ton, "standard", "helle Fläche braucht die Standardfassung");
  // Beide Markenfarben müssen auf dieser Fläche tragen.
  assert.ok(m.kontrastNavy >= 4.5, `Admin: Navy nur ${m.kontrastNavy.toFixed(2)}:1`);
  assert.ok(m.kontrastBlau >= 4.5, `Admin: Blau nur ${m.kontrastBlau.toFixed(2)}:1`);
  // Die Bereichskennzeichnung bleibt eigener Text neben der Marke.
  assert.equal(await page.locator(".adm-brand-tag").textContent(), "Adminbereich");
  await page.close();
});

/* ══════════ 3 — Anmeldung ══════════════════════════════════════════════ */

test("3 — die Anmeldung trägt genau einen Markenanker, das Formular bleibt", async () => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const page = await browser.newPage({ viewport });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    const wo = `${viewport.width}px`;

    assert.equal(await page.locator(".auth-brand").count(), 1, `${wo}: genau ein Markenanker`);
    const m = await marke(page, ".auth-brand");
    assert.ok(m && m.sichtbar, `${wo}: Marke nicht gerendert`);
    pruefeProportion(m, "lockup", `Anmeldung ${wo}`);
    assert.equal(m.ton, "reverse", `${wo}: dunkler Grund braucht die Reverse-Fassung`);
    assert.ok(m.kontrastHell >= 4.5, `${wo}: Marke nur ${m.kontrastHell.toFixed(2)}:1`);

    // Der Claim erscheint nirgends — weder als Text noch als Geometrie.
    const text = await page.locator(".auth-shell").innerText();
    assert.ok(!/versandvermittlung/i.test(text), `${wo}: der Claim steht auf der Seite`);

    // Das Formular ist unverändert bedienbar.
    await page.fill('input[type="email"]', "max@example.com");
    assert.equal(await page.inputValue('input[type="email"]'), "max@example.com");
    assert.ok(await page.locator('input[type="password"]').count() >= 1, `${wo}: Passwortfeld fehlt`);
    assert.equal(await page.locator(".auth-tab").count(), 2, `${wo}: die beiden Reiter fehlen`);

    const ueberlauf = await page.evaluate(() => {
      window.scrollTo(9999, 0);
      const x = window.scrollX; window.scrollTo(0, 0); return x;
    });
    assert.equal(ueberlauf, 0, `${wo}: die Seite lässt sich nach rechts scrollen`);
    await page.close();
  }
});

/* ══════════ 4 — mobile Kopfzeile ═══════════════════════════════════════ */

test("4 — die flache mobile Kopfzeile trägt das Signet, unverzerrt und im Rahmen", async () => {
  for (const breite of [360, 390, 430, 768]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 844 } });
    await setupRoutes(page);
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    const wo = `${breite}px`;

    const m = await marke(page, ".mobile-topbar .topbar-brand");
    assert.ok(m && m.sichtbar, `${wo}: keine Marke in der Kopfzeile`);
    // Die volle Komposition liefe hier auf 7px Schrifthöhe hinaus — deshalb das Signet.
    pruefeProportion(m, "signet", `Kopfzeile ${wo}`);
    assert.equal(m.alt, "ConfidaraExpress", `${wo}: die Marke trägt ihren Namen nicht`);

    const inLeiste = await page.evaluate(() => {
      const b = document.querySelector(".mobile-topbar .ce-brandmark-img").getBoundingClientRect();
      const l = document.querySelector(".mobile-topbar").getBoundingClientRect();
      return b.left >= l.left && b.right <= l.right && b.top >= l.top - 0.5 && b.bottom <= l.bottom + 0.5;
    });
    assert.ok(inLeiste, `${wo}: die Marke ragt aus der Kopfzeile`);

    // Keine getippte Wortmarke mehr in der Leiste.
    const text = await page.locator(".mobile-topbar").innerText();
    assert.ok(!/ConfidaraExpress/.test(text), `${wo}: getippte Wortmarke in der Kopfzeile`);

    const ueberlauf = await page.evaluate(() => {
      window.scrollTo(9999, 0);
      const x = window.scrollX; window.scrollTo(0, 0); return x;
    });
    assert.equal(ueberlauf, 0, `${wo}: waagerechter Überlauf`);
    await page.close();
  }
});

/* ══════════ 5 — öffentliche Navigation ═════════════════════════════════ */

// Zuverlässiger als document.documentElement.scrollWidth: die Leiste ist
// position:fixed und trägt ihren Inhalt in .navbar-inner — EIN fixiertes
// Element muss den Viewport nicht zuverlässig ausdehnen, selbst wenn sein
// eigener Inhalt überläuft. Geprüft wird deshalb, ob die Zeile SELBST breiter
// ist als ihre sichtbare Fläche, UND ob der letzte Button noch vollständig im
// Fenster steht.
async function keinLeistenUeberlauf(page) {
  return page.evaluate(() => {
    const inner = document.querySelector(".navbar-inner");
    const btn = document.querySelector(".navbar-actions button");
    return {
      innerOverflow: inner.scrollWidth > inner.clientWidth + 1,
      actionAbgeschnitten: btn ? btn.getBoundingClientRect().right > window.innerWidth + 0.5 : false,
    };
  });
}

test("5 — die öffentliche Leiste trägt die reine Wortmarke, ohne Überlauf auf jeder Breite", async () => {
  // Gemessen (nicht geschätzt): bei 360 px ist bei 174 px Breite Schluss,
  // 192 px sprengt bereits die Zeile; ab 500 px bleibt bis mindestens 279 px
  // Luft. 174 px trägt deshalb einheitlich von 360 bis 1440 px.
  for (const breite of [360, 390, 430, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width: breite, height: 700 } });
    await page.goto(`${BASE}/impressum`, { waitUntil: "networkidle" });
    const wo = `öffentliche Leiste ${breite}px`;

    const leiste = await marke(page, ".navbar-logo .ce-brand");
    assert.ok(leiste?.sichtbar, `${wo}: keine Marke sichtbar`);
    pruefeProportion(leiste, "wordmark", wo);
    assert.equal(leiste.ton, "standard", `${wo}: die helle Leiste braucht die Standardfassung`);
    assert.ok(leiste.kontrastNavy >= 4.5, `${wo}: Navy nur ${leiste.kontrastNavy.toFixed(2)}:1`);
    assert.ok(leiste.kontrastBlau >= 4.5, `${wo}: Blau nur ${leiste.kontrastBlau.toFixed(2)}:1`);

    const { innerOverflow, actionAbgeschnitten } = await keinLeistenUeberlauf(page);
    assert.ok(!innerOverflow, `${wo}: die Zeile sprengt ihre Breite`);
    assert.ok(!actionAbgeschnitten, `${wo}: der Aktionsbutton wird abgeschnitten`);

    await page.close();
  }
});

test("6 — die Leiste bleibt ein echtes, per Tastatur erreichbares Bedienelement", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${BASE}/impressum`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("button.navbar-logo").count(), 1,
    "die Marke der Leiste ist kein echter Button");
  await page.close();
});

test("7 — der Drawer trägt die volle Komposition, Reverse, ohne Abschneiden", async () => {
  // Der Drawer ist dunkel und hat Höhe (anders als die flache Leiste) →
  // volle Komposition, Reverse.
  const mobil = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobil.goto(`${BASE}/impressum`, { waitUntil: "networkidle" });
  await mobil.locator(".navbar .hamburger-btn").click();
  await mobil.waitForTimeout(600);
  const drawer = await marke(mobil, ".mobile-drawer-header .ce-brand");
  assert.ok(drawer?.sichtbar, "keine Marke im Drawer");
  pruefeProportion(drawer, "lockup", "Drawer");
  assert.equal(drawer.ton, "reverse", "der dunkle Drawer braucht die Reverse-Fassung");
  assert.ok(drawer.kontrastHell >= 4.5, `Drawer: Marke nur ${drawer.kontrastHell.toFixed(2)}:1`);
  // Der Drawer liegt über der fixierten Leiste (z-index 1001 gegen 1000) —
  // ohne das wäre sein Kopf mit der gestapelten Komposition sichtbar
  // abgeschnitten. Geprüft wird, dass die Markenfläche tatsächlich die
  // oberste Ebene an dieser Stelle ist.
  const oben = await mobil.evaluate(() => {
    const r = document.querySelector(".mobile-drawer-header .ce-brandmark-img").getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + 4);
    return el ? (el.className || el.tagName) + "" : null;
  });
  assert.match(oben, /ce-brandmark-img/, "der Drawerkopf ist von der Leiste verdeckt");
  await mobil.close();
});

/* ══════════ 6 — Browser-Assets ═════════════════════════════════════════ */

test("8 — das Favicon wird ausgeliefert und zeigt die Markengeometrie", async () => {
  const page = await browser.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

  const href = await page.getAttribute('link[rel="icon"]', "href");
  assert.equal(href, "/favicon.svg", "die Favicon-Verknüpfung stimmt nicht");

  const antwort = await page.request.get(`${BASE}${href}`);
  assert.equal(antwort.status(), 200, "das Favicon wird nicht ausgeliefert");
  const svg = await antwort.text();
  assert.ok(!/<text/.test(svg), "das Favicon enthält eine Textmarke");
  // Dieselbe Geometrie wie das Signet des Masters.
  assert.ok(svg.includes("M 457 504 L 458 513"), "das Favicon zeigt nicht die Markengeometrie");
  assert.ok(!/IHRE|VERSANDVERMITTLUNG/i.test(svg), "der Claim steckt im Favicon");

  const gerendert = await page.evaluate(async (url) => {
    const bild = new Image();
    bild.src = url;
    await bild.decode();
    return { w: bild.naturalWidth, h: bild.naturalHeight };
  }, `${BASE}${href}`);
  assert.deepEqual(gerendert, { w: 64, h: 64 }, "das Favicon hat nicht 64×64");
  await page.close();
});
