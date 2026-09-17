// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 Betriebsreife — Governance für die zwei Frontend-Bausteine des Pakets:
//
//   F5  zentrales apiFetch-Zeitlimit (api/client.js): 30-s-Vorgabe, eigene
//       Timeout-Fehlerklasse, Aufrufer-Abbruch bleibt das Original, KEIN
//       automatischer Retry — für /book ausdrücklich niemals.
//   F1  paginierte Kundenlisten (DashboardPage): Erstladung als Seite (limit=50),
//       Nachladen hängt an statt zu ersetzen, Cursor bleibt opak, serverseitige
//       KPI-Statistik mit fail-safe-Rückfall auf computeKpis.
//
// Verhaltenstests, wo das Modul ohne Vite importierbar ist (kpis.mjs,
// apiError.mjs); Source-Asserts für die Vite-gebundenen Dateien (client.js liest
// import.meta.env beim Modulstart und ist unter node --test nicht ladbar).
// Run: node --test src/utils/phase1RuntimeUx.test.mjs
// ─────────────────────────────────────────────────────────────────────────────
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { kpisFromServerStats, computeKpis } from "./kpis.mjs";
import { normalizeThrownError } from "./apiError.mjs";
import { buchungsFlaeche } from "../testing/quelltext.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => fs.readFileSync(path.join(here, p), "utf8");
const clientSrc = src("../api/client.js");
const dashSrc = src("../pages/DashboardPage.jsx");
const bookingSrc = buchungsFlaeche();

/* ══════════ A · kpisFromServerStats (Verhalten) ══════════ */

const STATS_OK = { total: 120, active: 80, in_transit: 12, delivered_this_month: 30, delayed: 3, new_24h: 5 };

test("A1 — vollständiges Aggregat wird 1:1 in die computeKpis-Form übersetzt", () => {
  assert.deepEqual(kpisFromServerStats(STATS_OK), {
    active: 80, inTransit: 12, delivered: 30, delayed: 3, new24: 5, hasCreatedAt: true,
  });
});

test("A2 — 0 ist überall ein gültiger Wert (nie eine Falsy-Prüfung)", () => {
  const leer = { total: 0, active: 0, in_transit: 0, delivered_this_month: 0, delayed: 0, new_24h: 0 };
  assert.deepEqual(kpisFromServerStats(leer), {
    active: 0, inTransit: 0, delivered: 0, delayed: 0, new24: 0, hasCreatedAt: false,
  });
});

test("A3 — fail-safe: unvollständige/kaputte Aggregate ergeben null, nie geratene Zahlen", () => {
  assert.equal(kpisFromServerStats(null), null);
  assert.equal(kpisFromServerStats(undefined), null);
  assert.equal(kpisFromServerStats("stats"), null);
  assert.equal(kpisFromServerStats([1, 2, 3]), null);
  const { total, ...ohneTotal } = STATS_OK;
  assert.equal(kpisFromServerStats(ohneTotal), null, "fehlendes Feld → null");
  assert.equal(kpisFromServerStats({ ...STATS_OK, active: "viele" }), null, "keine Zahl → null");
  assert.equal(kpisFromServerStats({ ...STATS_OK, delayed: -1 }), null, "negativ → null");
  assert.equal(kpisFromServerStats({ ...STATS_OK, in_transit: Infinity }), null, "unendlich → null");
});

test("A4 — die Ergebnisform ist deckungsgleich mit computeKpis (gleiche Schlüssel)", () => {
  const vomServer = kpisFromServerStats(STATS_OK);
  const lokal = computeKpis([]);
  assert.deepEqual(Object.keys(vomServer).sort(), Object.keys(lokal).sort(),
    "Übersicht muss beide Quellen ohne Fallunterscheidung rendern können");
});

/* ══════════ B · Timeout-Klassifizierung (Verhalten, apiError.mjs) ══════════ */

test("B1 — ApiTimeoutError wird zentral als TIMEOUT klassifiziert, Aufrufer-Abbruch als ABORTED", () => {
  const t = normalizeThrownError(Object.assign(new Error("x"), { name: "ApiTimeoutError" }));
  assert.equal(t.code, "TIMEOUT");
  const a = normalizeThrownError(Object.assign(new Error("x"), { name: "AbortError" }));
  assert.equal(a.code, "ABORTED", "ein Abbruch des Aufrufers ist KEIN Timeout");
});

/* ══════════ C · apiFetch-Zeitlimit (Source-Assert, api/client.js) ══════════ */

test("C1 — 30-s-Vorgabe und eigene Fehlerklasse mit stabilem Namen/Code", () => {
  assert.match(clientSrc, /export const DEFAULT_TIMEOUT_MS = 30000/);
  assert.match(clientSrc, /timeoutMs = DEFAULT_TIMEOUT_MS/, "jeder apiFetch-Aufruf trägt die Vorgabe");
  assert.match(clientSrc, /this\.name = "ApiTimeoutError"/);
  assert.match(clientSrc, /this\.code = "API_TIMEOUT"/);
});

test("C2 — Aufrufer-Abbruch bleibt das ORIGINAL; erst danach wird ein Abbruch zum Timeout", () => {
  // Reihenfolge im catch ist die Sicherheitseigenschaft: die bestehende
  // Stille-Abbruch-Behandlung (Sequenz-/Debounce-Muster) erkennt AbortError am
  // Namen — ein umbenannter Abbruch würde überall Fehlermeldungen erzeugen.
  const callerFirst = clientSrc.indexOf("if (signal && signal.aborted) throw e");
  const wrapAfter = clientSrc.indexOf('if (e && e.name === "AbortError") throw new ApiTimeoutError');
  assert.ok(callerFirst > -1 && wrapAfter > -1 && callerFirst < wrapAfter,
    "der Aufrufer-Abbruch muss VOR der Timeout-Umdeutung behandelt werden");
  assert.match(clientSrc, /clearTimeout\(timer\)/, "der Timer muss nach der Antwort gelöscht werden");
});

test("C3 — kein automatischer Retry im zentralen Client", () => {
  // Kommentare dürfen den Verzicht ERKLÄREN — der CODE darf keinen Mechanismus tragen.
  const nurCode = clientSrc.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/retry|wiederhol/i.test(nurCode),
    "api/client.js darf keinen Wiederholungsmechanismus enthalten");
  assert.ok(!/for\s*\(|while\s*\(/.test(nurCode.slice(nurCode.indexOf("export async function apiFetch"))),
    "apiFetch darf keine Wiederholungsschleife enthalten");
});

test("C4 — lange Vorgänge tragen ihr eigenes, begründetes Limit", () => {
  assert.match(clientSrc, /timeoutMs: 90000/, "Zoll-PDF-Upload braucht 90 s");
  assert.match(bookingSrc, /timeoutMs: 150000/, "/book braucht 150 s (Providerkette > 100 s)");
  assert.match(src("../pages/NewShipmentPage.jsx"), /timeoutMs: 60000/, "calculate-price braucht 60 s");
  assert.match(src("../pages/CalculatorPage.jsx"), /timeoutMs: 60000/, "calculate-price braucht 60 s");
});

test("C5 — /book wird genau EINMAL gesendet: kein Retry-Konstrukt am Buchungsaufruf", () => {
  const um = bookingSrc.slice(bookingSrc.indexOf("`/api/jumingo/book`") - 2500, bookingSrc.indexOf("`/api/jumingo/book`") + 2500);
  assert.ok(!/for\s*\(|while\s*\(|attempt|retry/i.test(um.replace(/\/\/[^\n]*/g, "")),
    "um den /book-Aufruf darf kein Wiederholungskonstrukt stehen");
  assert.equal((bookingSrc.match(/\/api\/jumingo\/book`/g) || []).length, 1, "genau eine /book-Aufrufstelle");
});

/* ══════════ D · Paginierte Kundenlisten (Source-Assert, DashboardPage) ══════════ */

test("D1 — Erstladung und Refetch laden eine SEITE (limit=50), nicht mehr die Vollliste", () => {
  assert.match(dashSrc, /apiFetch\(`\/kunde\/shipments\?limit=50`, \{ auth: true \}\)/);
  assert.match(dashSrc, /apiFetch\(`\/kunde\/invoices\?limit=50`,  \{ auth: true \}\)/);
  assert.ok(!/apiFetch\(`\/kunde\/shipments`, \{ auth: true \}\)/.test(dashSrc),
    "kein Abrufweg darf mehr die ungebremste Vollliste laden");
});

test("D2 — Deployment-Skew: fehlendes nextCursor/stats wird zu null, nie zu einem Fehler", () => {
  assert.ok((dashSrc.match(/nextCursor \?\? null/g) || []).length >= 3,
    "jeder Abrufweg muss ein fehlendes nextCursor (altes Backend) als Listenende lesen");
  assert.match(dashSrc, /stats \?\? null/, "fehlende stats (altes Backend) → Rückfall auf computeKpis");
});

test("D3 — Nachladen hängt AN und ersetzt nie; der Cursor bleibt opak", () => {
  assert.match(dashSrc, /setShipments\(prev => \[\.\.\.prev, \.\.\.\(d\.shipments \|\| \[\]\)\]\)/);
  assert.match(dashSrc, /setInvoices\(prev => \[\.\.\.prev, \.\.\.\(d\.invoices \|\| \[\]\)\]\)/);
  assert.match(dashSrc, /cursor=\$\{encodeURIComponent\(shipmentsCursor\)\}/);
  assert.match(dashSrc, /cursor=\$\{encodeURIComponent\(invoicesCursor\)\}/);
  // Opak heißt: nie dekodieren, nie zusammenbauen — nur zurückreichen.
  assert.ok(!/atob\(|JSON\.parse\([^)]*[Cc]ursor|base64/.test(dashSrc),
    "der Cursor darf clientseitig weder dekodiert noch interpretiert werden");
});

test("D4 — beide Listen bieten das Nachladen als bewusste Aktion an (kein Scroll-Trigger)", () => {
  const ship = src("../components/dashboard/ShipmentsList.jsx");
  const inv = src("../components/dashboard/InvoicesList.jsx");
  for (const [name, code, label] of [["ShipmentsList", ship, "Weitere Sendungen laden"], ["InvoicesList", inv, "Weitere Rechnungen laden"]]) {
    assert.ok(code.includes('className="ce-load-more"'), `${name}: gemeinsames Nachlade-Muster fehlt`);
    assert.ok(code.includes(label), `${name}: Beschriftung fehlt`);
    assert.ok(code.includes('"Wird geladen …"'), `${name}: Ladezustand fehlt`);
    assert.ok(!/IntersectionObserver|onScroll/.test(code), `${name}: kein automatisches Nachladen beim Scrollen`);
  }
});

test("D5 — der Erfolgsbildschirm-Poll der Buchung lädt eine kleine Seite (limit=20)", () => {
  // Der Poll lebt seit der Modularisierung in hooks/useInvoiceDeliveryMode.js.
  const pollSrc = src("../hooks/useInvoiceDeliveryMode.js");
  assert.match(pollSrc, /apiFetch\(`\/kunde\/invoices\?limit=20`, \{ auth: true \}\)/);
});
