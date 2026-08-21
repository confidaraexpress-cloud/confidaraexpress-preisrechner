// Browser-Smokes: innenliegende Beschriftung („Floating Label") auf „Neue Sendung".
//
// Echter Dev-Server, echtes Rendering, echte Kaskade. Gemessen wird mit
// getBoundingClientRect und getComputedStyle — NICHT anhand von Screenshots und
// nicht anhand des Quelltexts. Der Prototyp steht und fällt mit Geometrie:
//
//   • liegt die Beschriftung im Ruhezustand tatsächlich IM Feld,
//   • überlappt sie im Schwebezustand den Feldtext NICHT,
//   • springt beim Fokussieren nichts (Bounding Box des Feldes unverändert),
//   • bleibt die Vorschlagsliste der Adressprüfung direkt unter dem Feld,
//   • kollidiert die Einheit (kg/cm) mit nichts,
//   • bleibt „Neue Sendung" weiterhin vollständig leer.
//
// NIEMALS eine echte Bestellung: alle Backendrufe sind abgefangen, /book
// antwortet mit 500.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5253, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

const USER = {
  id: 1, email: "max@example.com", company_name: "Muster GmbH", name: "Max Mustermann",
  role: "customer", status: "approved", country: "DE", zip: "70173", city: "Stuttgart",
  street: "Musterstr. 1", phone: "0711 123456", customer_number: "CE-K-10030",
};

let server, browser;
// Antwort von /calculate-price — Test 8 stellt sie auf eine Feldablehnung um.
let calcAntwort = null;

async function setupRoutes(ziel) {
  await ziel.route("**/api.confidaraexpress.de/**", async (route) => {
    const p = new URL(route.request().url()).pathname;
    const json = (b, status = 200) =>
      route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });

    if (p.endsWith("/kundenbereich")) return json({ user: USER });
    // Es darf in diesem Lauf NIE eine Bestellung entstehen.
    if (p.endsWith("/book")) return json({ error: "im Smoke nicht erlaubt" }, 500);
    if (p.endsWith("/calculate-price")) {
      if (calcAntwort) return json(calcAntwort.body, calcAntwort.status);
      return json({ tariffs: [], shipmentId: "s_" + "a".repeat(32), ceShipmentId: 4242,
                    publicCarriers: [], customsRequired: false,
                    fromCountryCode: "DE", toCountryCode: "DE" });
    }
    if (p.endsWith("/api/address/localities")) return json({ cities: ["Stuttgart", "Stuttgart-Mitte"] });
    if (p.endsWith("/api/address/streets"))
      return json({ streets: [
        { street: "Musterstraße", postalCode: "70173", city: "Stuttgart" },
        { street: "Musterweg", postalCode: "70173", city: "Stuttgart" },
      ] });
    if (p.endsWith("/api/address/validate")) return json({ status: "unverified" });
    if (p.includes("/notifications/unread-count")) return json({ unreadCount: 0, snapshotAt: "" });
    if (p.includes("/notifications")) return json({ notifications: [], unreadCount: 0, pagination: {} });
    return json({ items: [], drafts: [], addresses: [], shipments: [], invoices: [],
                  summary: null, pagination: { total: 0 } });
  });
}

async function neueSeite(viewport = { width: 1366, height: 900 }, opts = {}) {
  // `hasTouch` ist für den Mobil-Smoke tragend: erst damit greift
  // `@media (pointer: coarse)` — und genau daran hängen im ganzen Projekt die
  // 44-px-Trefferflächen und hier zusätzlich der 16-px-Feldtext.
  const ctx = await browser.newContext({ viewport, ...opts });
  await setupRoutes(ctx);
  const page = await ctx.newPage();
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await page.addInitScript(() => { localStorage.setItem("ce_token", "test-token"); });
  await page.goto(`${BASE}/dashboard?page=new`, { waitUntil: "networkidle" });
  await page.waitForSelector("#ns-weight", { timeout: 20000 });
  return { ctx, page, fehler };
}

/** Feld + zugehörige Beschriftung als gemessene Kästen. */
async function messung(page, id) {
  return page.evaluate((feldId) => {
    const input = document.getElementById(feldId);
    if (!input) return null;
    const label = document.querySelector(`label[for="${feldId}"]`);
    const cs = getComputedStyle(input);
    const ls = label ? getComputedStyle(label) : null;
    const ir = input.getBoundingClientRect();
    const lr = label ? label.getBoundingClientRect() : null;
    return {
      input: { x: Math.round(ir.x), y: Math.round(ir.y), w: Math.round(ir.width), h: Math.round(ir.height) },
      label: lr ? { x: Math.round(lr.x), y: +lr.y.toFixed(2), w: Math.round(lr.width),
                    bottom: +lr.bottom.toFixed(2) } : null,
      // Oberkante des Feldtextes = Rahmen + Innenabstand oben.
      textTop: +(ir.y + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop)).toFixed(2),
      inputFontSize: cs.fontSize,
      labelFontSize: ls ? ls.fontSize : null,
      labelColor: ls ? ls.color : null,
      floating: input.closest(".ce-field--floating")?.classList.contains("is-floating") ?? null,
      hatFloatingKlasse: !!input.closest(".ce-field--floating"),
    };
  }, id);
}

test.before(async () => {
  // `detached: true` ist hier tragend: `npm run dev` startet Vite als KIND, und
  // ein SIGTERM an npm lässt Vite am Port zurück. Der nächste Lauf scheitert
  // dann an `--strictPort` — und meldet „Dev-Server startet nicht" statt eines
  // echten Befunds. Deshalb eine eigene Prozessgruppe, die am Ende komplett fällt.
  server = spawn("npm", ["run", "dev", "--", "--port", String(PORT), "--strictPort"],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"], detached: true });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error("Dev-Server startet nicht")), 60000);
    server.stdout.on("data", (d) => { if (String(d).includes("ready in") || String(d).includes("Local:")) { clearTimeout(t); setTimeout(res, 900); } });
  });
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.beforeEach(() => { calcAntwort = null; });

test.after(async () => {
  if (browser) await browser.close();
  if (server) { try { process.kill(-server.pid, "SIGTERM"); } catch { server.kill("SIGTERM"); } }
});

/* ══════════ 1 — Nullzustand: die Beschriftung ist KEIN Wert ═══════════════ */

test("1 — die frische Seite ist vollständig leer, Labels sind keine Werte", async () => {
  const { ctx, page, fehler } = await neueSeite();
  try {
    const werte = await page.evaluate(() => {
      const ids = ["ns-s-company", "ns-s-fullName", "ns-s-street", "ns-s-addition", "ns-s-zip",
                   "ns-s-city", "ns-s-country", "ns-r-fullName", "ns-r-zip", "ns-r-city",
                   "ns-packageCount", "ns-weight", "ns-length", "ns-width", "ns-height"];
      return Object.fromEntries(ids.map((i) => [i, document.getElementById(i)?.value ?? "FEHLT"]));
    });
    for (const [id, wert] of Object.entries(werte)) {
      assert.equal(wert, "", `${id} ist nicht leer: ${JSON.stringify(wert)}`);
    }
    assert.deepEqual(fehler, []);
  } finally { await ctx.close(); }
});

/* ══════════ 2 — Ruhezustand: Beschriftung liegt IM Feld ══════════════════ */

test("2 — im Ruhezustand liegt die Beschriftung innerhalb der Feldfläche", async () => {
  const { ctx, page } = await neueSeite();
  try {
    for (const id of ["ns-s-fullName", "ns-weight", "ns-s-zip"]) {
      const m = await messung(page, id);
      assert.ok(m, `${id} fehlt`);
      assert.equal(m.hatFloatingKlasse, true, `${id} nutzt die Floating-Variante nicht`);
      assert.equal(m.floating, false, `${id} steht beim Start bereits im Schwebezustand`);
      // Beschriftung vollständig innerhalb des Feldkastens.
      assert.ok(m.label.y > m.input.y, `${id}: Label oberhalb des Feldes (${m.label.y} ≤ ${m.input.y})`);
      assert.ok(m.label.bottom < m.input.y + m.input.h,
        `${id}: Label ragt unten aus dem Feld (${m.label.bottom} ≥ ${m.input.y + m.input.h})`);
      assert.equal(m.labelFontSize, m.inputFontSize,
        `${id}: im Ruhezustand soll die Beschriftung so groß sein wie der Feldtext`);
    }
  } finally { await ctx.close(); }
});

/* ══════════ 3 — Fokus hebt an, ohne Layoutsprung ═════════════════════════ */

test("3 — Fokus hebt die Beschriftung an und verschiebt das Feld nicht", async () => {
  const { ctx, page } = await neueSeite();
  try {
    const vorher = await messung(page, "ns-s-fullName");
    await page.focus("#ns-s-fullName");
    await page.waitForTimeout(250);
    const nachher = await messung(page, "ns-s-fullName");

    assert.equal(nachher.floating, true, "das Label ist nicht angehoben");
    assert.ok(nachher.label.y < vorher.label.y, "das Label ist nicht nach oben gewandert");
    assert.equal(nachher.labelFontSize, "12px", "das angehobene Label soll 12 px messen");
    // Kein Layout Shift: dieselbe Position, dieselbe Größe.
    assert.deepEqual(nachher.input, vorher.input, "die Bounding Box des Feldes hat sich verändert");
  } finally { await ctx.close(); }
});

/* ══════════ 4 — Wert eingeben, Blur, leeren ══════════════════════════════ */

test("4 — gefüllt bleibt oben, geleert kehrt in die Ruheposition zurück", async () => {
  const { ctx, page } = await neueSeite();
  try {
    await page.fill("#ns-s-fullName", "Max Mustermann");
    await page.waitForTimeout(200);
    assert.equal((await messung(page, "ns-s-fullName")).floating, true, "gefüllt + fokussiert");

    await page.click("body", { position: { x: 5, y: 5 } });
    await page.waitForTimeout(250);
    const geblurrt = await messung(page, "ns-s-fullName");
    assert.equal(geblurrt.floating, true, "gefüllt + unfokussiert muss oben bleiben");
    assert.equal(geblurrt.labelFontSize, "12px");

    await page.fill("#ns-s-fullName", "");
    await page.click("body", { position: { x: 5, y: 5 } });
    await page.waitForTimeout(250);
    const leer = await messung(page, "ns-s-fullName");
    assert.equal(leer.floating, false, "leer + unfokussiert muss zurückkehren");
    assert.equal(leer.labelFontSize, leer.inputFontSize);
  } finally { await ctx.close(); }
});

/* ══════════ 5 — Bounding-Box-Prüfung: kein Textkontakt ═══════════════════ */

test("5 — angehobenes Label und Feldtext überschneiden sich nirgends", async () => {
  const { ctx, page } = await neueSeite();
  try {
    const felder = [
      ["ns-s-fullName", "Max Mustermann"],
      ["ns-s-zip", "70173"],
      ["ns-weight", "5"],
      ["ns-s-addition", "Etage 4, c/o Empfang"],
    ];
    for (const [id, wert] of felder) await page.fill(`#${id}`, wert);
    await page.click("body", { position: { x: 5, y: 5 } });
    await page.waitForTimeout(300);

    for (const [id] of felder) {
      const m = await messung(page, id);
      const abstand = +(m.textTop - m.label.bottom).toFixed(2);
      assert.ok(abstand >= 2,
        `${id}: nur ${abstand} px zwischen Labelunterkante und Textoberkante`);
    }
    // Auch der Select — sein Label steht dauerhaft oben.
    const land = await messung(page, "ns-s-country");
    assert.equal(land.floating, true, "das Label des Selects muss dauerhaft oben stehen");
    assert.ok(+(land.textTop - land.label.bottom).toFixed(2) >= 2, "Select: zu wenig Abstand");
  } finally { await ctx.close(); }
});

/* ══════════ 6 — Platzhalter erscheint erst im Schwebezustand ═════════════ */

test("6 — der Beispiel-Platzhalter wird erst nach dem Fokussieren sichtbar", async () => {
  const { ctx, page } = await neueSeite();
  try {
    const sichtbarkeit = async () => page.evaluate(() => {
      const el = document.getElementById("ns-weight");
      return { text: el.placeholder, opacity: getComputedStyle(el, "::placeholder").opacity };
    });
    const ruhe = await sichtbarkeit();
    assert.equal(ruhe.text, "z. B. 5", "der Platzhalter muss das Beispiel tragen");
    assert.equal(ruhe.opacity, "0", "im Ruhezustand darf der Platzhalter nicht sichtbar sein");

    await page.focus("#ns-weight");
    await page.waitForTimeout(250);
    assert.equal((await sichtbarkeit()).opacity, "1", "nach Fokus muss das Beispiel erscheinen");
  } finally { await ctx.close(); }
});

/* ══════════ 7 — Einheiten kg / cm ════════════════════════════════════════ */

test("7 — kg und cm stehen rechts im Feld und überdecken den Wert nicht", async () => {
  const { ctx, page } = await neueSeite();
  try {
    await page.fill("#ns-weight", "5");
    await page.fill("#ns-length", "30");
    await page.click("body", { position: { x: 5, y: 5 } });
    await page.waitForTimeout(300);

    const einheiten = await page.evaluate(() => {
      const lies = (id) => {
        const input = document.getElementById(id);
        const feld = input.closest(".ce-field--floating");
        const unit = feld.querySelector(".ce-field-unit");
        const ir = input.getBoundingClientRect(), ur = unit.getBoundingClientRect();
        const cs = getComputedStyle(input);
        return {
          text: unit.textContent,
          ariaHidden: unit.getAttribute("aria-hidden"),
          opacity: getComputedStyle(unit).opacity,
          // Die Einheit muss innerhalb des Feldes liegen …
          imFeld: ur.left >= ir.left && ur.right <= ir.right + 0.5,
          // … und rechts von der reservierten Textbreite (padding-right).
          freierText: +(ir.right - parseFloat(cs.paddingRight) - ur.left).toFixed(2),
        };
      };
      return { kg: lies("ns-weight"), cm: lies("ns-length") };
    });

    assert.equal(einheiten.kg.text, "kg");
    assert.equal(einheiten.cm.text, "cm");
    for (const [name, e] of Object.entries(einheiten)) {
      assert.equal(e.ariaHidden, "true", `${name}: die Einheit muss dekorativ sein`);
      assert.equal(e.opacity, "1", `${name}: die Einheit ist nicht sichtbar`);
      assert.equal(e.imFeld, true, `${name}: die Einheit liegt außerhalb des Feldes`);
      assert.ok(e.freierText <= 0.5,
        `${name}: die Einheit ragt ${e.freierText} px in den Textbereich`);
    }
    // Die zugängliche Bezeichnung trägt die Einheit trotzdem — genau einmal.
    const name = await page.evaluate(() =>
      document.querySelector('label[for="ns-weight"]').textContent.replace(/\s+/g, " ").trim());
    assert.equal(name, "Gewicht * in Kilogramm");
  } finally { await ctx.close(); }
});

/* ══════════ 8 — Fehlerzustand ════════════════════════════════════════════ */

test("8 — der Fehlerzustand färbt Label und Rahmen und meldet ihn zugänglich", async () => {
  // Auf dieser Seite ist der CTA deaktiviert, solange `getErrors(form)` etwas
  // findet — ein leeres Formular kann also gar nicht abgeschickt werden, und
  // rote Markierungen entstehen NICHT von selbst (bewusstes Produktverhalten,
  // siehe „Keine Fehlerwand auf leerem Formular"). Der Fehlerzustand wird
  // deshalb so erreicht, wie er real entsteht: vollständig gültige Eingaben,
  // und der Server lehnt ein Feld ab.
  calcAntwort = { status: 400, body: { error: "Ungültige Postleitzahl.", field: "sender.postalCode" } };
  const { ctx, page } = await neueSeite();
  try {
    await page.selectOption("#ns-s-country", "DE");
    await page.selectOption("#ns-r-country", "DE");
    for (const [id, wert] of [
      ["ns-s-fullName", "Max Mustermann"], ["ns-s-street", "Musterstraße 1"],
      ["ns-s-zip", "70173"], ["ns-s-city", "Stuttgart"],
      ["ns-r-fullName", "Erika Muster"], ["ns-r-street", "Beispielweg 5"],
      ["ns-r-zip", "80331"], ["ns-r-city", "München"],
      ["ns-packageCount", "1"], ["ns-weight", "5"],
      ["ns-length", "30"], ["ns-width", "20"], ["ns-height", "15"],
    ]) await page.fill(`#${id}`, wert);

    const cta = page.locator("button.btn-primary.btn-lg").first();
    await cta.waitFor({ state: "visible" });
    await page.waitForFunction(() => {
      const b = document.querySelector("button.btn-primary.btn-lg");
      return b && !b.disabled;
    }, { timeout: 15000 });
    await cta.click();
    await page.waitForSelector(".ce-field--floating.is-error", { timeout: 15000 });
    await page.waitForTimeout(400);   // der 120-ms-Farbübergang darf nicht mitgemessen werden

    const z = await page.evaluate(() => {
      const el = document.getElementById("ns-s-zip");
      const feld = el.closest(".ce-field--floating");
      const label = document.querySelector('label[for="ns-s-zip"]');
      const fehler = feld.querySelector(".field-error");
      return {
        istFehler: feld.classList.contains("is-error"),
        ariaInvalid: el.getAttribute("aria-invalid"),
        describedby: el.getAttribute("aria-describedby"),
        fehlerId: fehler ? fehler.id : null,
        fehlerText: fehler ? fehler.textContent : null,
        labelFarbe: getComputedStyle(label).color,
        rahmen: getComputedStyle(el).borderTopColor,
        angehoben: feld.classList.contains("is-floating"),
      };
    });
    assert.equal(z.istFehler, true, "die Fehlerklasse fehlt");
    assert.equal(z.ariaInvalid, "true");
    assert.ok(z.fehlerText && z.fehlerText.length > 0, "kein Fehlertext");
    assert.equal(z.describedby, z.fehlerId, "aria-describedby zeigt nicht auf die Meldung");
    // #9b3535 = --ce-color-status-error-fg
    assert.equal(z.labelFarbe, "rgb(155, 53, 53)", "das Label trägt nicht die Fehlerfarbe");
    assert.equal(z.rahmen, "rgb(155, 53, 53)", "der Rahmen trägt nicht die Fehlerfarbe");
    assert.equal(z.angehoben, true, "im Fehlerzustand muss das Label oben stehen");
  } finally { await ctx.close(); }
});

/* ══════════ 9 — Adressvorschläge sitzen unter dem höheren Feld ═══════════ */

test("9 — die Vorschlagsliste bleibt direkt unter dem Feld und verdeckt es nicht", async () => {
  const { ctx, page } = await neueSeite();
  try {
    await page.selectOption("#ns-s-country", "DE");
    await page.fill("#ns-s-zip", "70173");
    await page.fill("#ns-s-city", "Stuttgart");
    await page.fill("#ns-s-street", "Muster");
    await page.waitForSelector("#ns-s-street-list li", { timeout: 10000 });

    const g = await page.evaluate(() => {
      const input = document.getElementById("ns-s-street");
      const liste = document.getElementById("ns-s-street-list");
      const ir = input.getBoundingClientRect(), lr = liste.getBoundingClientRect();
      const label = document.querySelector('label[for="ns-s-street"]');
      return {
        abstand: +(lr.top - ir.bottom).toFixed(2),
        breiteGleich: Math.abs(lr.width - ir.width) < 1.5,
        eintraege: liste.querySelectorAll("li").length,
        expanded: input.getAttribute("aria-expanded"),
        controls: input.getAttribute("aria-controls"),
        labelUeberListe: label.getBoundingClientRect().bottom <= lr.top,
      };
    });
    // 4 px laut address-validation.css — die höhere Feldfläche verschiebt das nicht.
    assert.ok(g.abstand >= 3 && g.abstand <= 6, `Liste steht ${g.abstand} px unter dem Feld`);
    assert.equal(g.breiteGleich, true, "die Liste ist nicht so breit wie das Feld");
    assert.ok(g.eintraege > 0, "keine Vorschläge");
    assert.equal(g.expanded, "true");
    assert.equal(g.controls, "ns-s-street-list");
    assert.equal(g.labelUeberListe, true, "das Label liegt über der Liste");

    // Auswahl übernimmt den Vorschlag und behält die Hausnummer.
    await page.fill("#ns-s-street", "Musterstr. 7");
    await page.waitForSelector("#ns-s-street-list li", { timeout: 10000 });
    await page.click("#ns-s-street-list li");
    await page.waitForTimeout(200);
    assert.equal(await page.inputValue("#ns-s-street"), "Musterstraße 7");
  } finally { await ctx.close(); }
});

/* ══════════ 10 — Fokusring bleibt der Standard ═══════════════════════════ */

test("10 — der Fokusring ist unverändert der Foundation-Ring", async () => {
  const { ctx, page } = await neueSeite();
  try {
    await page.focus("#ns-s-fullName");
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const cs = getComputedStyle(document.getElementById("ns-s-fullName"));
      return { outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor,
               offset: cs.outlineOffset, shadow: cs.boxShadow, border: cs.borderTopWidth };
    });
    assert.equal(r.outlineWidth, "2px");
    assert.equal(r.outlineColor, "rgb(83, 103, 232)");   // --ce-color-border-focus
    assert.equal(r.offset, "2px");
    assert.equal(r.shadow, "none", "im Fokus darf kein Schatten entstehen");
    assert.equal(r.border, "1px", "die Rahmenbreite darf sich nie ändern");
  } finally { await ctx.close(); }
});

/* ══════════ 11 — Feldhöhe und Typografie ═════════════════════════════════ */

test("11 — die Floating-Felder messen 54 px, die Standardfelder bleiben 40 px", async () => {
  const { ctx, page } = await neueSeite();
  try {
    const hoehen = await page.evaluate(() =>
      ["ns-s-fullName", "ns-s-zip", "ns-s-country", "ns-weight", "ns-packageCount"]
        .map((id) => ({ id, h: Math.round(document.getElementById(id).getBoundingClientRect().height) })));
    for (const { id, h } of hoehen) assert.equal(h, 54, `${id} misst ${h} px statt 54`);

    // Gegenprobe auf dem PREISRECHNER — der aussagekräftigsten Nachbarseite: sie
    // besitzt den Scope `.offers-form-section`, mit dem die Floating-Variante
    // kollidieren könnte, und teilt sich .field-input mit „Neue Sendung".
    await page.goto(`${BASE}/calculator`, { waitUntil: "networkidle" });
    await page.waitForSelector(".field-input", { timeout: 25000 });
    const fremd = await page.evaluate(() => {
      const el = document.querySelector(".field-input");
      return {
        floatingFelder: document.querySelectorAll(".ce-field--floating").length,
        floating: !!el.closest(".ce-field--floating"),
        h: Math.round(el.getBoundingClientRect().height),
        padding: getComputedStyle(el).padding,
        anzahl: document.querySelectorAll(".field-input").length,
      };
    });
    assert.equal(fremd.floatingFelder, 0, "der Preisrechner hat Floating-Felder bekommen");
    assert.equal(fremd.floating, false);
    assert.ok(fremd.anzahl > 0, "auf dem Preisrechner wurden gar keine Felder gefunden");
    // 44 px und `11px 14px` sind der BESTAND des Preisrechners
    // (.offers-form-section .field-input, calculator.css) — unverändert.
    assert.equal(fremd.padding, "11px 14px", `Preisrechner-Padding verändert: ${fremd.padding}`);
    assert.equal(fremd.h, 44, `Preisrechner-Feldhöhe verändert: ${fremd.h} px`);
  } finally { await ctx.close(); }
});

/* ══════════ 12 — Mobil 390 px ════════════════════════════════════════════ */

test("12 — 390 px: kein Überlauf, 44-px-Ziele, keine Überlappung", async () => {
  const { ctx, page } = await neueSeite({ width: 390, height: 780 }, { hasTouch: true });
  try {
    const ueberlauf = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(ueberlauf <= 0, `horizontaler Überlauf: ${ueberlauf} px`);

    const felder = ["ns-s-fullName", "ns-s-zip", "ns-s-country", "ns-weight", "ns-length"];
    for (const id of felder) {
      const m = await messung(page, id);
      assert.ok(m.input.h >= 44, `${id}: nur ${m.input.h} px hoch (WCAG 2.5.5)`);
      assert.ok(m.label.bottom < m.input.y + m.input.h, `${id}: Label ragt aus dem Feld`);
      assert.ok(m.label.x >= m.input.x, `${id}: Label links außerhalb`);
    }
    // Der Feldtext ist auf Touch 16 px — sonst zoomt iOS beim Fokussieren.
    const schrift = await page.evaluate(() =>
      getComputedStyle(document.getElementById("ns-weight")).fontSize);
    assert.equal(schrift, "16px", "Touch-Felder brauchen 16 px gegen den iOS-Zoom");

    await page.fill("#ns-weight", "5");
    await page.click("body", { position: { x: 5, y: 5 } });
    await page.waitForTimeout(300);
    const m = await messung(page, "ns-weight");
    assert.ok(+(m.textTop - m.label.bottom).toFixed(2) >= 2, "Mobil: Label berührt den Text");
  } finally { await ctx.close(); }
});

/* ══════════ 13 — 460 px: das Paketraster ═════════════════════════════════ */

test("13 — 460 px: die Paketfelder bleiben zweispaltig und lesbar", async () => {
  const { ctx, page } = await neueSeite({ width: 460, height: 900 });
  try {
    const ueberlauf = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(ueberlauf <= 0, `horizontaler Überlauf: ${ueberlauf} px`);

    const raster = await page.evaluate(() => {
      const ids = ["ns-packageCount", "ns-weight", "ns-length", "ns-width", "ns-height"];
      return ids.map((id) => {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        const label = document.querySelector(`label[for="${id}"]`);
        const lr = label.getBoundingClientRect();
        return { id, x: Math.round(r.x), w: Math.round(r.width),
                 labelPasst: lr.width <= r.width - 20 };
      });
    });
    const spalten = new Set(raster.map((r) => r.x));
    assert.equal(spalten.size, 2, `erwartet 2 Spalten, gemessen ${spalten.size}`);
    for (const r of raster) {
      assert.ok(r.labelPasst,
        `${r.id}: die Beschriftung passt nicht in ${r.w} px Feldbreite`);
    }
  } finally { await ctx.close(); }
});

/* ══════════ 14 — Autofill hebt das Label ebenfalls an ════════════════════ */

test("14 — ein programmatisch gefülltes Feld hebt die Beschriftung an", async () => {
  const { ctx, page } = await neueSeite();
  try {
    // So füllt ein Passwortmanager (und im Regelfall auch Chrome-Autofill): der
    // Wert wird über den nativen Setter gesetzt und ein input-Event ausgelöst.
    // React nimmt das auf, der Schwebezustand folgt dem Wert.
    //
    // Der zweite Weg — Chromes Vorschauphase, in der der Wert NICHT an
    // JavaScript geht — lässt sich hier nicht auslösen; ihn deckt die
    // CSS-Ergänzung (:-webkit-autofill/:autofill) ab, deren Existenz
    // src/utils/floatingFieldUx.test.mjs prüft. Das CSSOM taugt dafür nicht:
    // im Vite-Dev-Modus liefert document.styleSheets 0 Regeln (gemessen).
    await page.evaluate(() => {
      const el = document.getElementById("ns-s-company");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(el, "Muster GmbH");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.waitForTimeout(300);
    const m = await messung(page, "ns-s-company");
    assert.equal(m.floating, true, "ein programmatisch gefülltes Feld muss das Label anheben");
    assert.equal(m.labelFontSize, "12px");
    assert.ok(+(m.textTop - m.label.bottom).toFixed(2) >= 2, "Label berührt den Text");
  } finally { await ctx.close(); }
});
