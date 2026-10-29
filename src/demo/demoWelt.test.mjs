// Die öffentliche Kundenbereich-Demo (Premium-Redesign, Betreiberentscheidung 2026-10-27): ihre Schutzwände und ihr
// Vertrag. Die Demo darf echte Authentifizierung nie umgehen, nie echte Daten lesen, nie den Server erreichen und
// jede Buchung und jedes Dokument eindeutig als Simulation zeigen.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEMO_BASIS, DEMO_TEXTE, istDemoPfad } from "./demoModus.mjs";
import { arbeitsspeicher, speicherAbschirmen } from "./demoSpeicher.mjs";
import { demoNetzErlaubt, netzSperren } from "./demoNetz.mjs";
import { demoAngebote, demoAntwort, demoZuruecksetzen } from "./demoBackend.mjs";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HIER, "..");
const lies = (...teile) => fs.readFileSync(path.join(SRC, ...teile), "utf8");
// Anker auf kommentarfreiem Code: sonst prüfte der Test die Begründung statt des Programms. Blockkommentare nur am
// Zeilenanfang oder als JSX-Kommentar — ein Pfad wie "/demo/*" in einem String ist kein Kommentarbeginn.
const ohneKommentare = (text) => text
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  .replace(/^\s*\/\*[\s\S]*?\*\//gm, "")
  .replace(/^\s*\/\/.*$/gm, "");

test("1 — nur /demo und /demo/… sind die Demo, nie ein Pfad, der nur so anfängt", () => {
  assert.equal(DEMO_BASIS, "/demo");
  for (const p of ["/demo", "/demo/", "/demo/dashboard", "/demo/booking"]) assert.equal(istDemoPfad(p), true, p);
  for (const p of ["/", "/dashboard", "/demonstration", "/demos", "/login", "", undefined, null, 42]) assert.equal(istDemoPfad(p), false, String(p));
});

test("2 — der Arbeitsspeicher verhält sich wie Storage und lebt nur im Speicher", () => {
  const s = arbeitsspeicher();
  assert.equal(s.length, 0);
  assert.equal(s.getItem("x"), null);
  s.setItem("a", 1);
  s.setItem("b", { toString: () => "zwei" });
  assert.equal(s.getItem("a"), "1");
  assert.equal(s.getItem("b"), "zwei");
  assert.equal(s.length, 2);
  assert.equal(s.key(0), "a");
  assert.equal(s.key(5), null);
  s.removeItem("a");
  assert.equal(s.getItem("a"), null);
  s.clear();
  assert.equal(s.length, 0);
});

/** Ein Fenster mit echtem Speicher, wie der Browser ihn als Eigenschaft des Fensters führt. */
function fensterMitSpeicher(konfigurierbar = true) {
  const echtLokal = arbeitsspeicher();
  const echtSitzung = arbeitsspeicher();
  echtLokal.setItem("ce_token", "ECHTES-TOKEN");
  echtSitzung.setItem("ce_shipping_flow", "{\"echt\":true}");
  const fenster = {};
  Object.defineProperty(fenster, "localStorage", { configurable: konfigurierbar, enumerable: true, get: () => echtLokal });
  Object.defineProperty(fenster, "sessionStorage", { configurable: konfigurierbar, enumerable: true, get: () => echtSitzung });
  return { fenster, echtLokal, echtSitzung };
}

test("3 — die Speicherwand: die Demo sieht weder das echte Token noch einen echten Versandvorgang und schreibt nie hinein", () => {
  const { fenster, echtLokal, echtSitzung } = fensterMitSpeicher();
  assert.equal(speicherAbschirmen(fenster), true);
  assert.equal(fenster.localStorage.getItem("ce_token"), null, "das echte Token ist in der Demo unsichtbar");
  assert.equal(fenster.sessionStorage.getItem("ce_shipping_flow"), null);
  fenster.localStorage.setItem("ce_token", "demo");
  fenster.localStorage.removeItem("ce_token");
  fenster.localStorage.clear();
  fenster.sessionStorage.clear();
  assert.equal(echtLokal.getItem("ce_token"), "ECHTES-TOKEN", "der echte Speicher bleibt unberührt");
  assert.equal(echtSitzung.getItem("ce_shipping_flow"), "{\"echt\":true}");
});

test("4 — lässt der Browser den Speicher nicht ersetzen, meldet die Wand das (die Demo startet dann nicht)", () => {
  const { fenster, echtLokal } = fensterMitSpeicher(false);
  assert.equal(speicherAbschirmen(fenster), false);
  assert.equal(fenster.localStorage, echtLokal);
  // demoStart startet nur bei true: Transport und Netzwand hängen am Ergebnis der Speicherwand.
  const start = ohneKommentare(lies("demo", "demoStart.mjs"));
  const wand = start.indexOf("DEMO_ZUSTAND.abgeschirmt = speicherAbschirmen(window);");
  const bedingung = start.indexOf("if (DEMO_ZUSTAND.abgeschirmt) {");
  assert.ok(wand > 0 && bedingung > wand, "erst die Speicherwand, dann die Bedingung");
  for (const schritt of ["demoEinschalten();", "netzSperren(window);", "setzeDemoTransport("]) {
    assert.ok(start.indexOf(schritt) > bedingung, `${schritt} nur nach gelungener Abschirmung`);
  }
  const main = ohneKommentare(lies("main.jsx"));
  assert.match(main, /DEMO_ZUSTAND\.abgeschirmt \? <DemoApp \/> : <DemoNichtVerfuegbar \/>/);
});

test("5 — die Netzwand: nur Dateien der eigenen Seite; API, Anmeldung und fremde Hosts nie", () => {
  const seite = "https://confidaraexpress.de/demo/dashboard?page=shipments";
  for (const a of ["/index.html", "/assets/index-abc.js", "/favicon-v2.svg", "https://confidaraexpress.de/assets/x.css"]) {
    assert.equal(demoNetzErlaubt(a, seite), true, a);
  }
  for (const a of [
    "/api/jumingo/book", "/api/shipments/1/label", "/kunde/shipments", "/kundenbereich", "/login", "/register", "/auth/forgot-password",
    "/API/x", "https://api.confidaraexpress.de/kundenbereich", "//api.confidaraexpress.de/kunde/invoices",
    "https://preisrechner.confidaraexpress.de/", "https://beispiel.example/", "http://[",
  ]) {
    assert.equal(demoNetzErlaubt(a, seite), false, a);
  }
});

test("6 — gesperrte Anfragen beantwortet die Wand selbst; sie verlassen den Browser nie", async () => {
  const aufrufe = [];
  const fenster = { location: { href: "https://confidaraexpress.de/demo/dashboard" }, fetch: (eingabe) => { aufrufe.push(String(eingabe)); return Promise.resolve(new Response("ok")); } };
  netzSperren(fenster);
  const gesperrt = await fenster.fetch("https://api.confidaraexpress.de/kundenbereich", { headers: { Authorization: "Bearer x" } });
  assert.equal(gesperrt.status, 503);
  assert.equal((await gesperrt.json()).error, DEMO_TEXTE.keinServer);
  await fenster.fetch(new Request("https://api.confidaraexpress.de/api/jumingo/book", { method: "POST" }));
  assert.deepEqual(aufrufe, [], "keine gesperrte Anfrage erreicht das echte fetch");
  await fenster.fetch("/index.html");
  assert.deepEqual(aufrufe, ["/index.html"]);
});

test("7 — apiFetch fragt in der Demo die Demo-Datenquelle, bevor es irgendetwas anderes tut", () => {
  const client = ohneKommentare(lies("api", "client.js"));
  const kopf = client.indexOf("export async function apiFetch(pathOrUrl, options = {}) {");
  assert.ok(kopf > 0);
  const rumpf = client.slice(kopf, kopf + 400).split("\n").map((z) => z.trim()).filter(Boolean);
  assert.equal(rumpf[1], "if (demoTransport) return demoTransport(pathOrUrl, options);", "erste Anweisung von apiFetch");
  // Den Transport setzt allein der Demo-Start — kein anderes Modul.
  const setzer = [];
  for (const datei of alleQuellen()) {
    if (/setzeDemoTransport\(/.test(ohneKommentare(fs.readFileSync(datei, "utf8"))) && !datei.endsWith(path.join("api", "client.js"))) setzer.push(path.relative(SRC, datei));
  }
  assert.deepEqual(setzer, [path.join("demo", "demoStart.mjs")]);
  // main.jsx: der Demo-Start ist der erste Import.
  const main = lies("main.jsx").split("\n").filter((z) => /^import\s/.test(z));
  assert.equal(main[0].trim(), 'import { DEMO_ZUSTAND } from "./demo/demoStart.mjs";');
});

function alleQuellen(ordner = SRC, liste = []) {
  for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) alleQuellen(p, liste);
    else if (/\.(jsx?|mjs)$/.test(e.name) && !/\.test\.mjs$/.test(e.name)) liste.push(p);
  }
  return liste;
}

/** Ruft die Demo-Datenquelle mit gesperrtem globalem fetch auf: jeder Netzversuch ließe den Test scheitern. */
async function ohneNetz(arbeit) {
  const echt = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("Netzzugriff aus der Demo-Datenquelle"); };
  try { return await arbeit(); } finally { globalThis.fetch = echt; }
}
const anfrage = async (pfad, optionen) => {
  const r = await demoAntwort(pfad, optionen);
  const typ = r.headers.get("Content-Type") || "";
  return { status: r.status, typ, daten: typ.includes("json") ? await r.json() : new Uint8Array(await r.arrayBuffer()) };
};

test("8 — die Demo-Datenquelle: ein erfundenes Kundenkonto, alle Nummern als Simulation erkennbar, kein Netz", async () => {
  demoZuruecksetzen();
  await ohneNetz(async () => {
    const konto = await anfrage("https://api.confidaraexpress.de/kundenbereich");
    assert.equal(konto.status, 200);
    assert.equal(konto.daten.user.role, "customer");
    assert.match(konto.daten.user.email, /\.example$/);
    const sendungen = await anfrage("/kunde/shipments");
    assert.ok(sendungen.daten.shipments.length >= 3);
    for (const s of sendungen.daten.shipments) {
      if (s.order_confirmation_number) assert.match(s.order_confirmation_number, /^SIM-/);
      if (s.tracking_number) assert.match(s.tracking_number, /DEMO/);
    }
    const rechnungen = await anfrage("/kunde/invoices");
    for (const r of rechnungen.daten.invoices) assert.match(r.invoice_number, /^SIM-/);
    const pdf = await anfrage(`/kunde/invoices/${rechnungen.daten.invoices[0].id}/pdf`);
    assert.equal(pdf.typ, "application/pdf");
    assert.ok(Buffer.from(pdf.daten).toString("latin1").includes("SIMULATION"), "jedes Dokument trägt den Aufdruck SIMULATION");
  });
});

test("9 — Buchen ist eine Simulation: Testbeleg, SIM-Nummern, wirkt nur in dieser Seitenladung", async () => {
  demoZuruecksetzen();
  await ohneNetz(async () => {
    const preis = await anfrage("/api/jumingo/calculate-price", { method: "POST", body: JSON.stringify({ recipient: { country: "AT" }, packages: { packageLines: [{ quantity: 1, weight: 4 }] } }) });
    const angebot = preis.daten.tariffs[0];
    assert.match(angebot.offerId, /^DEMO/);
    const buchung = await anfrage("/api/jumingo/book", { method: "POST", body: JSON.stringify({ offerId: angebot.offerId }) });
    assert.equal(buchung.status, 201);
    assert.equal(buchung.daten.testBooking, true);
    assert.equal(buchung.daten.invoicingPhase, "test_phase");
    assert.match(buchung.daten.orderConfirmation.number, /^SIM-AB/);
    assert.match(buchung.daten.invoiceNumber, /^SIM-TB/);
    assert.equal(buchung.daten.amount, angebot.finalPrice);
    const sendungen = await anfrage("/kunde/shipments");
    assert.equal(sendungen.daten.shipments[0].order_confirmation_number, buchung.daten.orderConfirmation.number);
    const rechnungen = await anfrage("/kunde/invoices");
    assert.equal(rechnungen.daten.invoices[0].is_test_document, true);
  });
  demoZuruecksetzen();
  const neu = await anfrage("/kunde/shipments");
  assert.ok(neu.daten.shipments.every((s) => !/^SIM-AB26-0004[89]/.test(s.order_confirmation_number || "")), "Zurücksetzen verwirft die Simulation");
});

test("10 — Unbekanntes und Nichtsimuliertes: nie ein stiller Erfolg", async () => {
  demoZuruecksetzen();
  await ohneNetz(async () => {
    const schreiben = await anfrage("/api/kunde/zahlungen", { method: "POST", body: "{}" });
    assert.equal(schreiben.status, 409);
    assert.equal(schreiben.daten.code, "DEMO_NOT_AVAILABLE");
    assert.equal((await anfrage("/admin/users")).status, 404);
    assert.equal((await anfrage("/kunde/password", { method: "PATCH", body: "{}" })).status, 409, "Passwortwechsel gibt es in der Demo nicht");
    assert.equal((await anfrage("/api/kunde/email-change", { method: "POST", body: "{}" })).status, 409);
  });
  const abbruch = new AbortController();
  abbruch.abort();
  await assert.rejects(demoAntwort("/kunde/shipments", { signal: abbruch.signal }), { name: "AbortError" });
});

test("11 — Beispielangebote folgen Gewicht und Strecke, ohne Einkaufsquelle im sichtbaren Text", () => {
  const inland = demoAngebote({ recipient: { country: "DE" }, packages: { packageLines: [{ quantity: 1, weight: 2 }] } });
  const ausland = demoAngebote({ recipient: { country: "FR" }, packages: { packageLines: [{ quantity: 1, weight: 2 }] } });
  const schwer = demoAngebote({ recipient: { country: "DE" }, packages: { packageLines: [{ quantity: 2, weight: 10 }] } });
  assert.ok(ausland.tariffs[0].netPrice > inland.tariffs[0].netPrice);
  assert.ok(schwer.tariffs[0].netPrice > inland.tariffs[0].netPrice);
  for (const t of inland.tariffs) assert.equal(t.finalPrice, Math.round((t.netPrice + t.vatAmount) * 100) / 100);
  // Kein Einkaufs- oder Providername im Text der Demo (Pfadnamen der echten API ausgenommen).
  const quelle = ohneKommentare(lies("demo", "demoBackend.mjs")).replace(/"\/api\/jumingo\/[a-z/-]+"/g, '""');
  assert.doesNotMatch(quelle, /jumingo|transglobal/i);
  // Erfundene Kontaktdaten: jede E-Mail-Adresse auf .example.
  for (const m of quelle.matchAll(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g)) assert.match(m[0], /\.example$/, m[0]);
});

test("12 — die Demo rendert nur Kundenseiten der echten Anwendung, nie Anmeldung, Admin oder Partner", () => {
  const demo = ohneKommentare(lies("demo", "DemoApp.jsx"));
  const app = ohneKommentare(lies("App.jsx"));
  const pfade = [...demo.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "*");
  assert.deepEqual(pfade.sort(), ["/booking", "/calculator", "/dashboard", "/inventory/orders/:id", "/inventory/products/:id", "/login"].sort());
  for (const p of pfade) assert.ok(app.includes(`path="${p}"`), `${p} ist eine Route der echten Anwendung`);
  // /login führt in der Demo nur zum Ende der Demo — nie zur echten Anmeldung.
  assert.match(demo, /<Route path="\/login" element=\{<ContentErrorBoundary bereich="demo"><DemoEnde \/><\/ContentErrorBoundary>\} \/>/);
  const importe = [...demo.matchAll(/import\(?\s*[^"']*["']([^"']+)["']/g)].map((m) => m[1]);
  for (const i of importe) assert.doesNotMatch(i, /AuthPage|admin|Admin|partner|Partner/, i);
  // Alles außerhalb des Kundenbereichs verlässt die Demo mit einer neuen Seitenladung.
  assert.match(demo, /window\.location\.replace\(/);
  assert.match(demo, /robots\.content = "noindex";/);
  // Die echte Anwendung lädt /demo neu, statt es im angemeldeten Router zu zeigen.
  assert.match(app, /<Route path="\/demo\/\*" element=\{<DemoNeuLaden \/>\} \/>/);
});

test("13 — die Buchungsbestätigung sagt in der Demo, dass nichts beauftragt und keine E-Mail versendet wurde", () => {
  const schritt = ohneKommentare(lies("components", "booking", "BookingSuccessStep.jsx"));
  assert.match(schritt, /const demo = istDemo\(\);/);
  assert.match(schritt, /\{DEMO_TEXTE\.buchungSimuliert\}/);
  assert.match(schritt, /demo \? DEMO_TEXTE\.keineEmail :/);
  // Außerhalb der Demo unverändert.
  assert.match(schritt, /<span className="badge badge--success bsx-status">Gebucht<\/span>/);
  assert.match(schritt, /<h2 className="booking-success-title">Sendung erfolgreich gebucht!<\/h2>/);
  assert.match(DEMO_TEXTE.buchungSimuliert, /^Simulation: /);
  assert.match(DEMO_TEXTE.buchungSimuliert, /keine Kosten/);
  assert.match(DEMO_TEXTE.buchungSimuliert, /keine E-Mail/);
});

test("14 — Router-Pfade stammen aus dem Router, nie aus window.location (sonst doppelte Basis unter /demo)", () => {
  const verstoesse = [];
  for (const datei of alleQuellen()) {
    const text = ohneKommentare(fs.readFileSync(datei, "utf8"));
    if (/navigate\(\s*window\.location\.pathname/.test(text) || /<Navigate[^>]*to=\{window\.location/.test(text)) verstoesse.push(path.relative(SRC, datei));
  }
  assert.deepEqual(verstoesse, []);
});

test("15 — Wege aus der Demo bleiben auf der eigenen Domain (kein offener Weiterleiter über „//“ oder „\“)", async () => {
  const { demoAusgangsziel } = await import("./demoModus.mjs");
  const herkunft = "https://confidaraexpress.de";
  const RS = String.fromCharCode(92); // Rückstrich
  assert.equal(demoAusgangsziel("/impressum", "?a=1", "#b", herkunft), "/impressum?a=1#b");
  assert.equal(demoAusgangsziel("//evil.example/login", "", "", herkunft), "/evil.example/login");
  assert.equal(demoAusgangsziel(`/${RS}evil.example`, "", "", herkunft), "/evil.example");
  assert.equal(demoAusgangsziel(`${RS}${RS}evil.example/x`, "?q=1", "", herkunft), "/evil.example/x?q=1");
  assert.equal(demoAusgangsziel("", "", "", herkunft), "/");
  assert.equal(demoAusgangsziel(undefined, undefined, undefined, herkunft), "/");
  // Beide Ausstiege nutzen den Helfer: der Fangweg der Demo und das Neuladen der Anwendung.
  assert.match(ohneKommentare(lies("demo", "DemoApp.jsx")), /window\.location\.replace\(demoAusgangsziel\(pathname, search, hash, window\.location\.origin\)\)/);
  assert.match(ohneKommentare(lies("App.jsx")), /window\.location\.replace\(demoAusgangsziel\(pathname, search, hash, window\.location\.origin\)\)/);
});

test("16 — „/DEMO“ ist die Demo wie „/demo“ (die Route der Anwendung unterscheidet nicht, sonst endloses Neuladen)", () => {
  for (const p of ["/DEMO", "/Demo/dashboard", "/demo/BOOKING"]) assert.equal(istDemoPfad(p), true, p);
  assert.equal(istDemoPfad("/DEMONSTRATION"), false);
});

test("17 — Lieferscheine in der Demo: jede Art sichtbar, Dokumente als SIMULATION, Ändern nie ein stiller Erfolg", async () => {
  demoZuruecksetzen();
  await ohneNetz(async () => {
    const liste = await anfrage("/api/kunde/delivery-notes?limit=25");
    assert.equal(liste.status, 200);
    const arten = new Set(liste.daten.items.map((r) => (r.effective ? `${r.effective.source}/${r.effective.origin}` : "keiner")));
    for (const art of ["confidara/confidara", "own/upload", "own/template", "keiner"]) assert.ok(arten.has(art), `Art fehlt: ${art}`);
    for (const r of liste.daten.items) {
      assert.match(r.orderConfirmationNumber, /^SIM-/);
      if (r.confidaraNumber) assert.match(r.confidaraNumber, /^SIM-/);
    }
    const eigene = await anfrage("/api/kunde/delivery-notes?source=own");
    assert.ok(eigene.daten.items.length > 0 && eigene.daten.items.every((r) => r.effective && r.effective.source === "own"));
    const suche = await anfrage("/api/kunde/delivery-notes?q=LS-58421");
    assert.equal(suche.daten.items.length, 1);

    const mitVerlauf = liste.daten.items.find((r) => r.versionCount > 1);
    const verlauf = await anfrage(`/api/shipments/${mitVerlauf.shipmentId}/delivery-notes`);
    assert.equal(verlauf.status, 200);
    assert.ok(verlauf.daten.versions.some((v) => v.withdrawnAt), "ein zurückgezogener Stand zeigt den Verlauf");
    assert.equal(verlauf.daten.versions.filter((v) => v.effective).length, 1);

    const mitLs = liste.daten.items.find((r) => r.effective);
    const dok = await anfrage(`/api/shipments/${mitLs.shipmentId}/delivery-note`);
    assert.equal(dok.typ, "application/pdf");
    assert.ok(Buffer.from(dok.daten).toString("latin1").includes("SIMULATION"), "der Lieferschein trägt den Aufdruck SIMULATION");
    const ohne = liste.daten.items.find((r) => !r.effective);
    assert.equal((await anfrage(`/api/shipments/${ohne.shipmentId}/delivery-note`)).status, 404);

    for (const [pfad, methode] of [
      [`/api/shipments/${ohne.shipmentId}/delivery-notes/uploads`, "POST"],
      [`/api/shipments/${mitLs.shipmentId}/delivery-notes/from-template`, "POST"],
      [`/api/shipments/${mitVerlauf.shipmentId}/delivery-notes/versions/1/withdraw`, "POST"],
      ["/api/kunde/delivery-note-template", "POST"],
      ["/api/kunde/delivery-note-template/draft", "PATCH"],
    ]) {
      const r = await anfrage(pfad, { method: methode, body: "{}" });
      assert.equal(r.status, 409, `${methode} ${pfad}`);
      assert.equal(r.daten.code, "DEMO_NOT_AVAILABLE");
    }
    const vorlage = await anfrage("/api/kunde/delivery-note-template");
    assert.equal(vorlage.daten.active.pageCount, 2);
    const muster = await anfrage("/api/kunde/delivery-note-template/active/preview");
    assert.ok(Buffer.from(muster.daten).toString("latin1").includes("SIMULATION"));
  });
});
