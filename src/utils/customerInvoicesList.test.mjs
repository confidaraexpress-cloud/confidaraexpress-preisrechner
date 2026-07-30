// Struktur-/Barrierefreiheitsvertrag der Kunden-Rechnungsliste (Phase 5). Prüft den
// tatsächlichen Quelltext von InvoicesList.jsx und die zugehörigen CSS-Regeln in
// dashboard.css — analog zum bereits etablierten Muster der Admin-Listen
// (adminCancellations.test.mjs). Läuft über `node --test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

const listSrc = read("components/dashboard/InvoicesList.jsx");
const cssSrc = read("styles/dashboard.css");
const modalSrc = read("components/dashboard/InvoicePdfPreviewModal.jsx");

test("1 — sechs fachliche Spalten mit scope, echte <caption>", () => {
  for (const col of ["Rechnung", "Zeitraum", "Betrag", "Zahlungsstatus", "Dokument", "Aktion"]) {
    assert.match(listSrc, new RegExp(`<th scope="col">${col}</th>`), `Spalte fehlt: ${col}`);
  }
  assert.equal((listSrc.match(/<th scope="col">/g) || []).length, 6, "genau sechs Spalten erwartet");
  assert.match(listSrc, /<caption className="sr-only">/);
});

test("2 — kein Scroll-Wrapper mehr, table-layout: fixed hebt die globale Mindestbreite auf", () => {
  assert.equal(/inv-table[\s\S]{0,60}table-scroll/.test(listSrc), false, "kein table-scroll-Wrapper mehr um die Rechnungstabelle");
  assert.match(cssSrc, /\.inv-table table \{ min-width: 0; table-layout: fixed; \}/);
});

test("3 — genau vier starre Spalten haben feste Breiten (Betrag/Zahlungsstatus/Dokument/Aktion)", () => {
  const fixed = [...cssSrc.matchAll(/\.inv-table th:nth-child\((\d)\), \.inv-table td:nth-child\(\d\) \{ width: (\d+)px; \}/g)]
    .map((m) => Number(m[1]));
  assert.deepEqual(fixed.sort(), [3, 4, 5, 6], "Rechnung/Zeitraum (1,2) müssen ohne feste Breite bleiben, den Rest teilen");
});

test("3b — überfällige Fälligkeit bleibt auch in der Mobilkarte rot (CSS-Spezifität)", () => {
  // .inv-card-kv-row dd (Klasse+Typ, Spezifität 0,1,1) würde .inv-period-due--overdue
  // (nur Klasse, 0,1,0) sonst überschreiben — die überfällige Fälligkeit wäre in der
  // Mobilkarte fälschlich grau statt rot. Regressionsschutz für genau diesen Bug.
  assert.match(cssSrc, /\.inv-card-kv-row dd\.inv-period-due--overdue \{ color: var\(--inv-critical-fg\); \}/);
});

test("4 — Mobilkarten unterhalb 1150px statt der Tabelle", () => {
  // 1150px statt 900px: gemessen gegen die echte gebaute App — darunter blieben
  // Rechnung/Zeitraum zu schmal für ihre eigenen Spaltenköpfe (siehe dashboard.css).
  assert.match(listSrc, /<ul className="inv-cards">/);
  assert.match(cssSrc, /@media \(max-width: 1150px\) \{[\s\S]*?\.inv-table \{ display: none; \}[\s\S]*?\.inv-cards \{ display: flex; \}/);
});

test("5 — Premium-Statussystem: vier Farbfamilien, KEINE generische StatusBadge für Zahlungsstatus", () => {
  for (const tone of ["neutral", "positive", "attention", "critical"]) {
    assert.match(cssSrc, new RegExp(`\\.inv-status--${tone}\\s+\\{`), `Statusfamilie fehlt: ${tone}`);
  }
  assert.equal(listSrc.includes("StatusBadge"), false, "die generische, domänenfremde StatusBadge darf für Rechnungszahlungsstatus nicht mehr verwendet werden");
  assert.match(listSrc, /paymentStatus\(inv\)/, "Zahlungsstatus muss aus dem zentralen View-Model kommen");
});

test("6 — kein langer Fließtext mehr in der Aktionsspalte", () => {
  assert.equal(listSrc.includes("Diese Rechnung dient derzeit ausschließlich der internen Prüfung"), false,
    "der alte lange Hinweistext darf nicht mehr in der Aktionsspalte stehen");
  assert.match(listSrc, /unavailableActionReason\(inv\)/, "kompakte Begründung statt Fließtext");
});

test("7 — Filter: fünf Optionen, aktiver Zustand sichtbar (aria-pressed), lokal ohne neue Backendparameter", () => {
  assert.match(listSrc, /INVOICE_FILTERS\.map/);
  assert.match(listSrc, /aria-pressed=\{filter === f\.value\}/);
  assert.equal(listSrc.includes("URLSearchParams") || /[?&]status=/.test(listSrc), false, "Filter dürfen keinen neuen Query-Parameter an den Server senden");
});

test("8 — Ladezustand als Live-Region mit sichtbarem Text", () => {
  assert.match(listSrc, /role="status" aria-live="polite"[^>]*>[\s\S]{0,60}\{LOADING_TEXT\}/);
});

test("9 — eigener Fehlerzustand mit Retry, getrennt von Sendungen", () => {
  assert.match(listSrc, /role="alert"[^>]*>[\s\S]{0,20}<Icon n="x" s=\{16\} \/>\{error \|\| LOAD_ERROR_TEXT\}/);
  assert.match(listSrc, /onClick=\{onRetry\}/);
  assert.match(listSrc, /Erneut versuchen/);
});

test("10 — Leerzustände: global vs. Filter-Treffer unterschieden", () => {
  assert.match(listSrc, /\{LIST_EMPTY_TITLE\}/);
  assert.match(listSrc, /\{LIST_EMPTY_TEXT\}/);
  assert.match(listSrc, /\{FILTER_EMPTY_TEXT\}/);
});

test("11 — Zusammenfassung nutzt customerInvoiceSummary(), keine lokale Neuberechnung als primäre Wahrheit", () => {
  assert.match(listSrc, /customerInvoiceSummary\(invoices, summary\)/);
  // Der offene Betrag wird aus der Server-Summary gelesen (view.openAmount), nicht neu summiert.
  assert.match(listSrc, /view\.openAmount/);
  assert.equal(/invoices\.filter\([^)]*status === ["']unpaid["']\)/.test(listSrc), false,
    "keine lokale Summierung mehr über status === 'unpaid' allein — genau das war der ursprüngliche Fehler");
});

test("12 — Rechnungsnummer vollständig zugänglich: kein künstliches Kürzen", () => {
  assert.equal(/invoice_number\.slice|invoice_number\.substring/.test(listSrc), false, "Rechnungsnummer darf nicht künstlich gekürzt werden");
});

test("13 — PDF-Vorschau-Modal: Fokusfalle, Fokusrückgabe, Live-Region beim Laden", () => {
  assert.match(modalSrc, /const openerRef = useRef\(typeof document/);
  assert.match(modalSrc, /openerRef\.current\?\.focus\?\.\(\)/);
  assert.match(modalSrc, /e\.key !== "Tab"/, "Tab-Fokusfalle fehlt");
  assert.match(modalSrc, /role="status" aria-live="polite"/);
  assert.match(modalSrc, /role="alert"/);
});

test("14 — Selbsttest: die Prüflogik greift tatsächlich", () => {
  assert.ok(listSrc.length > 3000, "InvoicesList.jsx wirkt leer");
  assert.ok(cssSrc.includes(".inv-status"), "Premium-Statussystem fehlt in dashboard.css");
  // Eine bewusst falsche Erwartung MUSS scheitern — sonst prüft Test 1 nichts.
  assert.equal((listSrc.match(/<th scope="col">Nichtvorhandene<\/th>/g) || []).length, 0);
});
