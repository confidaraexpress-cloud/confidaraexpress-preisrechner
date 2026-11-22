// E2E: Registrierung in drei Schritten — Premium UX 4.0 (Betreiberentscheidung A3, 2026-11-22).
//
// Echter Dev-Server, echtes Chromium, GEMOCKTES Backend (page.route) — es entsteht zu keinem Zeitpunkt eine echte
// Registrierung. Vom Request-Body wird nichts festgehalten außer der Tatsache der Anfrage; das Passwort wird weder
// protokolliert noch verglichen. Die Schritte sind reine Frontend-Führung über dasselbe Formular: dieselben Felder,
// dieselben Prüfungen, am Ende dieselbe eine Anfrage POST /register.
//
//   R1  Schrittleiste: drei benannte Schritte, aria-current am aktuellen; im ersten Schritt kein „Zurück“ und genau ein
//       Absendeknopf („Weiter“); nach „Weiter“ steht der Fokus auf der Überschrift des neuen Schritts, der erledigte
//       Schritt ist ein Knopf zurück
//   R2  Kein Request durch Schrittwechsel: vom Laden bis „Prüfen“, zurück und wieder vor geht keine Anfrage an die API;
//       erst „Konto beantragen“ sendet — genau eine
//   R3  Werte bleiben: „Ändern“, Schrittleiste und „Zurück“ führen zurück, alle Eingaben stehen noch da; die
//       Zusammenfassung nennt die Angaben, das Passwort nie im Klartext; nichts davon im Browserspeicher
//   R4  Doppelklick: nach einem Rücksprung mit gesetzten Erklärungen sendet ein Doppelklick auf „Weiter“ nichts, und der
//       zweite Klick eines Doppelklicks (detail 2) auf „Konto beantragen“ sendet nie
//   R5  Der Server lehnt die E-Mail ab: zurück in den ersten Schritt, Fokus und Meldung am Feld, kein Banner; nach der
//       Korrektur geht es mit den gesetzten Erklärungen weiter
//   R6  Tastatur: Fokus im ersten Feld, Enter im letzten Feld eines Schritts führt weiter, Tab vom Schrittkopf erreicht
//       das erste Feld, Umschalt+Tab die Schrittleiste
//   R7  360 px: jeder Schritt ohne waagrechten Überlauf; die Leiste zeigt sichtbar nur den aktuellen Namen; Knöpfe ≥ 44 px
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { DEV_SERVER_SPAWN, stopDevServer } from "./helpers/devServer.mjs";
import {
  SCHRITT, STANDARD, absendeKnopf, aktuellerSchritt, bisPruefen, erklaerungenAnhaken, fuelleUnternehmen, fuelleZugang,
  registrierungAbsenden, warteAufSchritt, weiter, weiterKnopf, zurueckKnopf, zurueckZu,
} from "./helpers/registrierung.mjs";
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const PORT = 5494, BASE = `http://127.0.0.1:${PORT}`;

function chromiumExecutablePath() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  return root && existsSync(path.join(root, "chromium")) ? path.join(root, "chromium") : undefined;
}

let server, browser;

// Jede Anfrage an die API wird mit Pfad und Methode gezählt (ohne Inhalt). `antwort` steuert POST /register.
async function setup(page, { antwort = "ok" } = {}) {
  const zustand = { anfragen: [], registrierungen: 0, antwort };
  await page.route("**/api.confidaraexpress.de/**", async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    zustand.anfragen.push(`${req.method()} ${p}`);
    const json = (b, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(b) });
    if (p.endsWith("/api/legal/current")) {
      return json({ setId: 3, setKey: "SET-2026-08", documents: [
        { type: "terms", version: "2026-08", label: "Allgemeine Geschäftsbedingungen", url: "/api/legal/terms/2026-08" },
        { type: "privacy", version: "2026-07", label: "Datenschutzerklärung", url: "/api/legal/privacy/2026-07" }] });
    }
    if (p.endsWith("/register")) {
      zustand.registrierungen += 1;
      if (zustand.antwort === "email") {
        return json({ error: "Für diese E-Mail-Adresse besteht bereits ein Konto.", code: "EMAIL_TAKEN", field: "email" }, 409);
      }
      return json({ message: "Registrierung erfolgreich" });
    }
    if (p.includes("/api/shipping/launch-scope")) return json({ countries: [{ code: "DE", name: "Deutschland" }] });
    return json({});
  });
  return zustand;
}

async function oeffnen(page) {
  await page.goto(`${BASE}/register`, { waitUntil: "networkidle" });
  await page.waitForSelector("#reg-name");
}
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();
const imFokus = (page) => page.evaluate(() => document.activeElement?.id || "");
const gruppeAendern = (page, i) => page.locator(".auth-reg-gruppe").nth(i).locator("button.auth-reg-aendern");

test.before(async () => {
  server = spawn("npx", ["vite", "--host", "127.0.0.1", "--port", String(PORT), "--strictPort"], { ...DEV_SERVER_SPAWN, stdio: "ignore" });
  const frist = Date.now() + 90000;
  for (;;) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break; } catch { /* noch nicht bereit */ }
    if (Date.now() > frist) throw new Error("Vite-Dev-Server nicht gestartet");
    await new Promise((r) => setTimeout(r, 250));
  }
  browser = await chromium.launch({ executablePath: chromiumExecutablePath() });
});

test.after(async () => {
  if (browser) await browser.close();
  if (server) stopDevServer(server, "SIGKILL");
});

test("R1 — Schrittleiste, ein Absendeknopf, Fokus auf der Überschrift des neuen Schritts", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const fehler = [];
  page.on("pageerror", (e) => fehler.push(String(e)));
  await setup(page);
  await oeffnen(page);
  const leiste = page.locator('ol.auth-reg-leiste[aria-label="Fortschritt der Registrierung"]');
  assert.equal(await leiste.count(), 1, "die Schrittleiste fehlt oder ist unbenannt");
  assert.deepEqual((await leiste.locator(".auth-reg-name").allInnerTexts()).map(norm), ["Zugang", "Unternehmen", "Prüfen"]);
  assert.equal(await aktuellerSchritt(page), SCHRITT.zugang);
  assert.equal(norm(await page.locator(".auth-reg-schritt:not([hidden]) h3").innerText()), "Schritt 1 von 3: Ansprechpartner und Zugang");
  // Genau ein Absendeknopf, im ersten Schritt ohne „Zurück“; nach vorn führt die Leiste nicht.
  assert.equal(await page.locator('form.auth-reg button[type="submit"]').count(), 1);
  assert.equal(norm(await weiterKnopf(page).innerText()), "Weiter");
  assert.equal(await zurueckKnopf(page).count(), 0);
  assert.equal(await leiste.locator("button").count(), 0, "ein offener Schritt ist anwählbar");

  await fuelleZugang(page);
  await weiter(page);
  assert.equal(await imFokus(page), "reg-schritt-unternehmen", "der Fokus steht nicht auf der Überschrift des Schritts");
  assert.equal(norm(await page.locator(".auth-reg-schritt:not([hidden]) h3").innerText()), "Schritt 2 von 3: Ihr Unternehmen");
  // Der erledigte Schritt ist ein Knopf zurück (mit „erledigt“ für Screenreader), der offene bleibt Text.
  assert.equal(await leiste.locator("button").count(), 1);
  assert.match(norm(await leiste.locator("button").innerText()), /^Zugang\s*,\s*erledigt$/);
  assert.equal(await zurueckKnopf(page).count(), 1);
  // Im letzten Schritt heißt der eine Absendeknopf „Konto beantragen“.
  await fuelleUnternehmen(page);
  await weiter(page);
  assert.equal(await imFokus(page), "reg-schritt-pruefen");
  assert.equal(await page.locator('form.auth-reg button[type="submit"]').count(), 1);
  assert.equal(norm(await absendeKnopf(page).innerText()), "Konto beantragen");
  assert.equal(await weiterKnopf(page).count(), 0);
  assert.deepEqual(fehler, []);
  await page.close();
});

test("R2 — Schrittwechsel senden nichts; erst „Konto beantragen“ sendet genau eine Anfrage", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const zustand = await setup(page);
  await oeffnen(page);
  await page.waitForTimeout(400);
  const vorher = zustand.anfragen.length;
  await bisPruefen(page);
  await zurueckZu(page, SCHRITT.zugang);
  await weiter(page);
  await zurueckKnopf(page).click();
  await warteAufSchritt(page, SCHRITT.zugang);
  await weiter(page);
  await weiter(page);
  await erklaerungenAnhaken(page);
  await page.waitForTimeout(400);
  assert.deepEqual(zustand.anfragen.slice(vorher), [], "ein Schrittwechsel hat eine Anfrage ausgelöst");
  await absendeKnopf(page).click();
  await page.locator(".auth-alert-success").first().waitFor({ timeout: 10000 });
  assert.equal(zustand.registrierungen, 1);
  assert.deepEqual(zustand.anfragen.slice(vorher).filter((a) => a.startsWith("POST ")).map((a) => a.replace(/^POST .*\/register$/, "POST /register")),
    ["POST /register"]);
  await page.close();
});

test("R3 — Werte bleiben über alle Wege zurück; Zusammenfassung ohne Passwort; nichts im Browserspeicher", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setup(page);
  await oeffnen(page);
  await bisPruefen(page);
  const text = norm(await page.locator(".auth-reg-uebersicht").innerText());
  for (const wert of [STANDARD.name, STANDARD.email, STANDARD.firma, STANDARD.ustId, "11–50 Sendungen", "Festgelegt", "Keine Angabe"]) {
    assert.ok(text.includes(wert), `die Zusammenfassung nennt „${wert}“ nicht`);
  }
  assert.ok(!text.includes(STANDARD.passwort), "das Passwort steht im Klartext in der Zusammenfassung");
  assert.match(norm(await page.locator(".auth-reg-hinweis").innerText()), /erst mit „Konto beantragen“ gesendet/);

  // „Ändern“ beim Zugang: erster Schritt, Fokus auf der Überschrift, alle Werte da.
  await gruppeAendern(page, 0).click();
  await warteAufSchritt(page, SCHRITT.zugang);
  assert.equal(await imFokus(page), "reg-schritt-zugang");
  assert.equal(await page.inputValue("#reg-name"), STANDARD.name);
  assert.equal(await page.inputValue("#reg-email"), STANDARD.email);
  assert.equal((await page.inputValue("#reg-password")).length, STANDARD.passwort.length, "das Passwort ging verloren");
  assert.equal((await page.inputValue("#reg-password-repeat")).length, STANDARD.passwort.length, "die Wiederholung ging verloren");
  // Vor in „Ihr Unternehmen“: die Angaben stehen; „Zurück“ und wieder vor ändert nichts.
  await weiter(page);
  assert.equal(await page.inputValue("#reg-company"), STANDARD.firma);
  assert.equal(await page.inputValue("#reg-vat"), STANDARD.ustId);
  assert.equal(await page.inputValue("#reg-volume"), STANDARD.volumen);
  await zurueckKnopf(page).click();
  await warteAufSchritt(page, SCHRITT.zugang);
  await weiter(page);
  await weiter(page);
  // „Ändern“ beim Unternehmen führt in den zweiten Schritt.
  await gruppeAendern(page, 1).click();
  await warteAufSchritt(page, SCHRITT.unternehmen);
  assert.equal(await imFokus(page), "reg-schritt-unternehmen");
  assert.equal(await page.inputValue("#reg-company"), STANDARD.firma);
  // Nichts davon liegt im Browserspeicher.
  const speicher = await page.evaluate(() => JSON.stringify({ l: { ...localStorage }, s: { ...sessionStorage } }));
  assert.ok(!speicher.includes(STANDARD.passwort), "das Passwort liegt im Browserspeicher");
  for (const wert of [STANDARD.email, STANDARD.firma, STANDARD.ustId, STANDARD.name]) {
    assert.ok(!speicher.includes(wert), `„${wert}“ liegt im Browserspeicher`);
  }
  await page.close();
});

test("R4 — ein Doppelklick sendet nie: weder über „Weiter“ nach einem Rücksprung noch auf „Konto beantragen“", async () => {
  // Hohes Fenster: das ganze Blatt ist sichtbar, der Schrittwechsel scrollt nicht — „Konto beantragen“ erscheint genau
  // unter dem Zeiger. (Bei 1000 px Höhe rückte die Leiste ins Bild und der zweite Klick ging zufällig daneben.)
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });
  const zustand = await setup(page);
  await oeffnen(page);
  await bisPruefen(page);
  await erklaerungenAnhaken(page);
  // Zurück in „Ihr Unternehmen“ — die Erklärungen bleiben gesetzt, „Konto beantragen“ wäre sofort bedienbar.
  await gruppeAendern(page, 1).click();
  await warteAufSchritt(page, SCHRITT.unternehmen);
  // Der erste Klick führt nach „Prüfen“; der zweite sendet nicht.
  await weiterKnopf(page).dblclick();
  await warteAufSchritt(page, SCHRITT.pruefen);
  await page.waitForTimeout(600);
  assert.equal(zustand.registrierungen, 0, "der zweite Klick des Doppelklicks hat den Antrag gesendet");
  assert.equal(await absendeKnopf(page).isDisabled(), false);
  // Ob der zweite Klick „Konto beantragen“ trifft, hängt von der Höhe der Schritte ab (das Blatt ändert beim Wechsel
  // seine Höhe). Deshalb zusätzlich gezielt: der zweite Klick eines Doppelklicks (detail 2) auf „Konto beantragen“
  // sendet nie.
  await absendeKnopf(page).dispatchEvent("click", { detail: 2 });
  await page.waitForTimeout(400);
  assert.equal(zustand.registrierungen, 0, "der zweite Klick eines Doppelklicks auf „Konto beantragen“ hat gesendet");
  await absendeKnopf(page).click();
  await page.locator(".auth-alert-success").first().waitFor({ timeout: 10000 });
  assert.equal(zustand.registrierungen, 1);
  await page.close();
});

test("R5 — der Server lehnt die E-Mail ab: zurück in den ersten Schritt, Meldung und Fokus am Feld", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const zustand = await setup(page, { antwort: "email" });
  await oeffnen(page);
  await registrierungAbsenden(page);
  await page.locator("#reg-email-error").waitFor({ timeout: 10000 });
  assert.match(norm(await page.locator("#reg-email-error").innerText()), /bereits ein Konto/);
  assert.equal(await aktuellerSchritt(page), SCHRITT.zugang, "die Meldung steht nicht im Schritt des Felds");
  assert.equal(await imFokus(page), "reg-email", "der Fokus steht nicht am abgelehnten Feld");
  assert.equal(await page.locator("#reg-email").getAttribute("aria-invalid"), "true");
  assert.match(await page.locator("#reg-email").getAttribute("aria-describedby"), /reg-email-error/);
  assert.equal(await page.locator(".auth-alert-error").count(), 0, "die Feldmeldung steht als Banner");
  // Korrektur: die Meldung verschwindet, die Erklärungen bleiben gesetzt, der Antrag geht erneut — einmal.
  await page.fill("#reg-email", "zentrale@muster-logistik.de");
  assert.equal(await page.locator("#reg-email-error").count(), 0);
  await weiter(page);
  await weiter(page);
  assert.equal(await absendeKnopf(page).isDisabled(), false, "die Erklärungen wurden verworfen");
  zustand.antwort = "ok";
  await absendeKnopf(page).click();
  await page.locator(".auth-alert-success").first().waitFor({ timeout: 10000 });
  assert.equal(zustand.registrierungen, 2);
  await page.close();
});

test("R6 — Tastatur: Enter führt weiter, Tab erreicht das erste Feld, Umschalt+Tab die Schrittleiste", async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await setup(page);
  await oeffnen(page);
  assert.equal(await imFokus(page), "reg-name", "der Fokus steht beim Laden nicht im ersten Feld");
  await page.keyboard.type(STANDARD.name);
  await page.focus("#reg-email");
  await page.keyboard.type(STANDARD.email);
  await page.focus("#reg-password");
  await page.keyboard.type(STANDARD.passwort);
  await page.focus("#reg-password-repeat");
  await page.keyboard.type(STANDARD.passwort);
  await page.keyboard.press("Enter");
  await warteAufSchritt(page, SCHRITT.unternehmen);
  assert.equal(await imFokus(page), "reg-schritt-unternehmen");
  await page.keyboard.press("Tab");
  assert.equal(await imFokus(page), "reg-company", "Tab vom Schrittkopf erreicht nicht das erste Feld");
  // Die Überschrift (tabIndex -1) liegt nicht im Tabulatorweg: ein Schritt zurück erreicht den erledigten Schritt.
  await page.keyboard.press("Shift+Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("auth-reg-punkt-ziel")), true,
    "Umschalt+Tab erreicht den erledigten Schritt in der Leiste nicht");
  await page.focus("#reg-company");
  await page.keyboard.type(STANDARD.firma);
  await page.focus("#reg-volume");
  await page.keyboard.press("ArrowDown");
  assert.notEqual(await page.inputValue("#reg-volume"), "", "die Pfeiltaste wählt keine Angabe");
  await page.focus("#reg-vat");
  await page.keyboard.type(STANDARD.ustId);
  await page.keyboard.press("Enter");
  await warteAufSchritt(page, SCHRITT.pruefen);
  assert.equal(await imFokus(page), "reg-schritt-pruefen");
  await page.keyboard.press("Tab");
  assert.equal(await page.evaluate(() => document.activeElement?.classList.contains("auth-reg-aendern")), true,
    "Tab vom Schrittkopf erreicht die Zusammenfassung nicht");
  await page.close();
});

test("R7 — 360 px: kein waagrechter Überlauf in keinem Schritt, Leiste kompakt, Knöpfe mindestens 44 px", async () => {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 } });
  const page = await ctx.newPage();
  await setup(page);
  await oeffnen(page);
  const pruefe = async (schritt) => {
    const m = await page.evaluate(() => {
      const box = (el) => { const r = el.getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height, w: r.width }; };
      return {
        quer: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        knoepfe: [...document.querySelectorAll(".auth-reg-aktionen button, button.auth-reg-punkt-ziel")].map(box),
        namen: [...document.querySelectorAll(".auth-reg-punkt")].map((li) => ({
          aktiv: li.classList.contains("auth-reg-punkt--aktiv"), w: li.querySelector(".auth-reg-name").getBoundingClientRect().width,
        })),
        fenster: window.innerWidth,
      };
    });
    assert.ok(m.quer <= 0, `Schritt ${schritt + 1}: waagrechter Überlauf ${m.quer}px`);
    for (const k of m.knoepfe) {
      assert.ok(k.h >= 44, `Schritt ${schritt + 1}: Knopf niedriger als 44 px (${k.h})`);
      assert.ok(k.l >= 0 && k.r <= m.fenster, `Schritt ${schritt + 1}: Knopf ragt aus dem Bild`);
    }
    for (const n of m.namen) {
      if (n.aktiv) assert.ok(n.w > 20, `Schritt ${schritt + 1}: der aktuelle Name ist nicht sichtbar`);
      else assert.ok(n.w <= 1, `Schritt ${schritt + 1}: ein anderer Name steht sichtbar in der schmalen Leiste`);
    }
  };
  await pruefe(SCHRITT.zugang);
  await fuelleZugang(page);
  await weiter(page);
  await pruefe(SCHRITT.unternehmen);
  await fuelleUnternehmen(page);
  await weiter(page);
  await pruefe(SCHRITT.pruefen);
  await ctx.close();
});
