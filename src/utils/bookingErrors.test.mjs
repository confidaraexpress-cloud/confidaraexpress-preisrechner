// Buchungs-Restpfad (POST /api/jumingo/book) + Quelltext-Invarianten.
//
// Deckt die Audit-FAILs #1/#2 ab: ungeschütztes r.json(), rohe
// „Failed to fetch"-Banner, 404/429/5xx im Sammelzweig ununterschieden.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  mapBookRestError, mapBookThrownError, mapBookUnreadableSuccess, BOOK_FEHLER,
} from "./bookingErrors.mjs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

test("1 — 429/5xx/404 sind unterscheidbar und tragen die vorgegebenen Texte", () => {
  assert.equal(mapBookRestError(429, {}), BOOK_FEHLER.RATE_LIMITED);
  assert.match(BOOK_FEHLER.RATE_LIMITED.message, /zu viele Buchungsanfragen/);
  assert.equal(mapBookRestError(500, { error: "Buchung fehlgeschlagen" }), BOOK_FEHLER.SERVER);
  assert.match(BOOK_FEHLER.SERVER.message, /Ihre Angaben bleiben erhalten/);
  assert.equal(mapBookRestError(502, null), BOOK_FEHLER.SERVER);
  assert.equal(mapBookRestError(404, { error: "Sendung nicht gefunden" }), BOOK_FEHLER.ANGEBOT_WEG);
  assert.match(BOOK_FEHLER.ANGEBOT_WEG.message, /erneut berechnen/);
});

test("2 — Retry-Semantik: wiederholbar nur, wo Wiederholen wirklich hilft", () => {
  assert.equal(BOOK_FEHLER.RATE_LIMITED.retryable, true);
  assert.equal(BOOK_FEHLER.SERVER.retryable, true);
  assert.equal(BOOK_FEHLER.NETZ.retryable, true);
  assert.equal(BOOK_FEHLER.ANGEBOT_WEG.retryable, false, "ein verschwundenes Angebot wird durch Wiederholen nicht besser");
  assert.ok(!/versuchen Sie es erneut/i.test(BOOK_FEHLER.ANGEBOT_WEG.message), "kein pauschaler Retry-Hinweis bei nicht wiederholbarem Fehler");
});

test("3 — leerer/unlesbarer Body (HTML-Fehlerseite): eigener technischer Text", () => {
  const u = mapBookRestError(400, null);
  assert.equal(u, BOOK_FEHLER.UNLESBAR);
  assert.match(u.message, /Antwort des Servers konnte nicht verarbeitet werden/);
  assert.equal(mapBookUnreadableSuccess(), BOOK_FEHLER.UNLESBAR, "2xx ohne Buchungsobjekt ist KEIN Erfolg");
});

test("4 — unerwarteter Reststatus mit lesbarem Body läuft über den zentralen Normalizer", () => {
  const konflikt = mapBookRestError(409, { error: "Diese Sendung wurde bereits verarbeitet." });
  assert.ok(konflikt.title && konflikt.message, "Titel+Text müssen gesetzt sein");
  assert.match(konflikt.message, /bereits verarbeitet/);
});

test("5 — Netzabbruch/Abort: Verbindungstext, nie Failed to fetch; Timeout eigener Text", () => {
  const netz = mapBookThrownError(new TypeError("Failed to fetch"));
  assert.equal(netz, BOOK_FEHLER.NETZ);
  assert.ok(!/Failed to fetch/.test(netz.message));
  assert.match(netz.message, /versuchen Sie die Buchung erneut/);
  const abort = mapBookThrownError(Object.assign(new Error("x"), { name: "AbortError" }));
  assert.equal(abort, BOOK_FEHLER.NETZ, "Abbruch während der Buchung wird wie ein Verbindungsproblem erklärt");
  const timeout = mapBookThrownError(Object.assign(new Error("x"), { name: "TimeoutError" }));
  assert.match(timeout.title, /Zeitüberschreitung/);
});

test("6 — BookingPage: Restpfad nutzt den Mapper, Body defensiv, kein Sammelwurf mehr", () => {
  const page = strip(src("../pages/BookingPage.jsx"));
  assert.ok(!/throw new Error\(d\.error \|\| "Buchung fehlgeschlagen"\)/.test(page), "der alte Sammelwurf muss ersetzt sein");
  assert.ok(!/setError\(e\.message\)/.test(page), "rohes e.message darf nicht mehr angezeigt werden");
  assert.match(page, /mapBookRestError\(r\.status, d\)/);
  assert.match(page, /mapBookThrownError\(e\)/);
  assert.match(page, /try \{ d = await r\.json\(\); \} catch \{ d = null; \}/, "der Body muss defensiv gelesen werden");
  // 2xx ohne lesbares Objekt → kein Erfolg, keine Navigation.
  assert.match(page, /mapBookUnreadableSuccess\(\)/);
  // Spezialzweige unangetastet: Zoll-Codes, Fenster-/Preisdialog, Adress-/Zoll-4xx.
  for (const marker of ["PICKUP_WINDOW_CHANGED", "PRICE_CHANGED", "COMMERCIAL_INVOICE_BOOK_ERRORS", "setAddressError("]) {
    assert.ok(page.includes(marker), `Spezialzweig ${marker} fehlt`);
  }
  // Barrierefreiheit des Banners (beide Darstellungsformen).
  assert.match(page, /FormAlert tone="error" title=\{error\.title\}/);
  assert.match(page, /className="alert alert-error mb-16" role="alert"/);
});

test("7 — keine Navigation/Erfolgsanzeige im Fehlerfall (setStep(3) nur im Erfolgszweig)", () => {
  const page = strip(src("../pages/BookingPage.jsx"));
  const doBook = page.slice(page.indexOf("const r = await apiFetch(`/api/jumingo/book`"), page.indexOf("const handlePriceChangeRecalculate"));
  const erfolgIdx = doBook.indexOf("setBooking(d); setStep(3);");
  assert.ok(erfolgIdx > -1, "Erfolgszweig fehlt");
  // Alle Fehlerzweige davor enden mit return/loading-Ende — kein setStep(3) vor den Guards.
  const vorErfolg = doBook.slice(0, erfolgIdx);
  assert.match(vorErfolg, /mapBookRestError/, "Restpfad muss VOR dem Erfolgszweig behandelt sein");
  assert.match(vorErfolg, /mapBookUnreadableSuccess/, "Unlesbar-Guard muss VOR dem Erfolgszweig stehen");
});
