// Individuelle Versandtarife (Adminbereich, Betreiberentscheidung 2026-11-10) — Tests.
//
// Zwei Ebenen (wie customerMarkup.test.mjs, das Repo hat keine React-Render-Testinfrastruktur):
//   A) Verhalten: die reine Logik aus utils/adminTariffMarkupView.mjs (Prozentvertrag je Zeile, Änderungs-
//      erkennung, Wirksam-Zeile, Formatierung der Serverbeträge, Veraltet-Erkennung, Fehlertexte).
//   B) Contract: Quelltext von API-Wrapper, Komponente und Seite — nur die vier Pfade, keine Preisformel im
//      Browser, Providerkontakt nur hinter den beiden Buttons, Kundenwechsel über den Komponentenschlüssel.
//
// Run: node --test src/utils/adminTariffMarkupView.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  TARIFF_TEXTS, TARIFF_PRODUCT_KEYS, selectTariffMarkups, parseTariffInput, tariffInputValue, draftsFromProducts,
  tariffDraftChanges, buildTariffMarkupsBody, effectiveForRow, effectiveLine, formatCents, differenceLabel,
  transglobalCellText, referenceCellText, differenceCellText, packageLabel, comparisonBaseStatus, selectComparison,
  destinationOptions, parseCustomPackageInput, tariffSaveError, comparisonError, formatDay, COMPARISON_ERRORS,
} from "./adminTariffMarkupView.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(join(here, "..", rel), "utf8");

const PRODUKTE = [
  { productKey: 22, label: "UPS Standard", carrier: "UPS", pricingClass: "STANDARD", inheritedPercent: 20, inheritedSource: "standard", overridePercent: 35, effectivePercent: 35, source: "product", setAt: "2026-11-10T10:00:00.000Z", setBy: 1 },
  { productKey: 23, label: "UPS Express Saver", carrier: "UPS", pricingClass: "EXPRESS", inheritedPercent: 30, inheritedSource: "express", overridePercent: null, effectivePercent: 30, source: "express", setAt: null, setBy: null },
  { productKey: 29, label: "UPS Express", carrier: "UPS", pricingClass: "EXPRESS", inheritedPercent: 30, inheritedSource: "express", overridePercent: 0, effectivePercent: 0, source: "product", setAt: "2026-11-10T10:00:00.000Z", setBy: 1 },
  { productKey: 84, label: "DHL Express Domestic", carrier: "DHL", pricingClass: "EXPRESS", inheritedPercent: 30, inheritedSource: "express", overridePercent: null, effectivePercent: 30, source: "express", setAt: null, setBy: null },
  { productKey: 85, label: "DHL Express 9:00", carrier: "DHL", pricingClass: "EXPRESS", inheritedPercent: 30, inheritedSource: "express", overridePercent: null, effectivePercent: 30, source: "express", setAt: null, setBy: null },
  { productKey: 86, label: "DHL Express 10:30", carrier: "DHL", pricingClass: "EXPRESS", inheritedPercent: 30, inheritedSource: "express", overridePercent: null, effectivePercent: 30, source: "express", setAt: null, setBy: null },
  { productKey: 87, label: "DHL Express 12:00", carrier: "DHL", pricingClass: "EXPRESS", inheritedPercent: 30, inheritedSource: "express", overridePercent: null, effectivePercent: 30, source: "express", setAt: null, setBy: null },
];
const ANTWORT = {
  userId: 7, provider: "transglobal", account: { standardPercent: 20, expressPercent: 30, standardSource: "customer_confirmed" }, products: PRODUKTE,
  comparison: { destinations: [{ country: "AT", hasExampleAddress: true }, { country: "DE", hasExampleAddress: true }, { country: "BG", hasExampleAddress: false }], sender: { country: "DE", postalCode: "10115", city: "Berlin", street: "Invalidenstraße 43" }, standardPackages: [{ id: "p1", weightKg: 1, lengthCm: 20, widthCm: 15, heightCm: 10 }], refreshLimit: { max: 10, windowMinutes: 15 }, maxAgeHours: 24 },
};

// ── A) Verhalten ────────────────────────────────────────────────────────────

test("Servermodell: sieben Produkte in Auftragsreihenfolge, Kontosätze, Zielländer; Unbrauchbares → null", () => {
  const m = selectTariffMarkups(ANTWORT);
  assert.deepEqual(m.products.map((p) => p.productKey), [...TARIFF_PRODUCT_KEYS]);
  assert.deepEqual(m.account, { standardPercent: 20, expressPercent: 30 });
  assert.equal(m.products[2].overridePercent, 0, "0 % ist ein echter Produktsatz, nicht leer");
  assert.equal(m.comparison.destinations.length, 3);
  assert.equal(selectTariffMarkups(null), null);
  assert.equal(selectTariffMarkups({ products: [] }), null);
  assert.equal(selectTariffMarkups({ products: [{ productKey: "x", label: "" }] }), null);
});

test("Eingabe je Zeile: leer = Standard verwenden (null), sonst der Prozentvertrag; 0,20 bleibt 0,20 %", () => {
  assert.deepEqual(parseTariffInput(""), { ok: true, value: null, code: null, error: null });
  assert.deepEqual(parseTariffInput("   "), { ok: true, value: null, code: null, error: null });
  assert.equal(parseTariffInput("35").value, 35);
  assert.equal(parseTariffInput("17,5").value, 17.5);
  assert.equal(parseTariffInput("17.55").value, 17.55);
  assert.equal(parseTariffInput("0").value, 0);
  assert.equal(parseTariffInput("100").value, 100);
  assert.equal(parseTariffInput("0,20").value, 0.2);
  for (const schlecht of ["-1", "100,01", "20abc", "17,555", "1e1"]) assert.equal(parseTariffInput(schlecht).ok, false, schlecht);
  assert.equal(tariffInputValue(35), "35,00");
  assert.equal(tariffInputValue(0), "0,00");
  assert.equal(tariffInputValue(null), "");
});

test("Änderungserkennung: nur abweichende Zeilen, null fürs Zurücksetzen, Ungültiges getrennt gemeldet", () => {
  const drafts = draftsFromProducts(PRODUKTE);
  assert.deepEqual(drafts, { 22: "35,00", 23: "", 29: "0,00", 84: "", 85: "", 86: "", 87: "" });
  assert.deepEqual(tariffDraftChanges(PRODUKTE, drafts), { changes: {}, count: 0, invalid: {} });
  const a = tariffDraftChanges(PRODUKTE, { ...drafts, 22: "", 23: "50", 29: "0" });
  assert.deepEqual(a.changes, { 22: null, 23: 50 });
  assert.equal(a.count, 2);
  const b = tariffDraftChanges(PRODUKTE, { ...drafts, 22: "35.00", 84: "abc" });
  assert.deepEqual(b.changes, {});
  assert.deepEqual(Object.keys(b.invalid), ["84"]);
  assert.deepEqual(buildTariffMarkupsBody(a.changes), { markups: { 22: null, 23: 50 } });
});

test("Wirksam-Zeile: gespeichert / Entwurf / Zurücksetzen zeigt sofort den geerbten Satz", () => {
  const p22 = PRODUKTE[0], p23 = PRODUKTE[1];
  assert.deepEqual(effectiveForRow(p22, "35,00"), { percent: 35, source: "product", draft: false });
  assert.deepEqual(effectiveForRow(p22, "50"), { percent: 50, source: "draft", draft: true });
  assert.deepEqual(effectiveForRow(p22, ""), { percent: 20, source: "standard", draft: true });
  assert.deepEqual(effectiveForRow(p23, ""), { percent: 30, source: "express", draft: false });
  assert.deepEqual(effectiveForRow(p23, "abc"), { percent: 30, source: "express", draft: false }, "ungültiger Entwurf ändert die Anzeige nicht");
  assert.equal(effectiveLine(effectiveForRow(p22, "35,00")), "35,00 % individuell");
  assert.equal(effectiveLine(effectiveForRow(p23, "")), "30,00 % Expressaufschlag des Kontos");
  assert.equal(effectiveLine(effectiveForRow(p22, "")), "20,00 % Standardaufschlag des Kontos (Entwurf)");
  assert.equal(effectiveLine(effectiveForRow(p22, "50")), "50,00 % individuell (Entwurf)");
});

test("Beträge und Unterschiede: Cent vom Server, de-DE, drei Wortlaute, Zustände ohne Preis", () => {
  assert.equal(formatCents(1266), "12,66 €");
  assert.equal(formatCents(0), "0,00 €");
  assert.equal(formatCents(null), "—");
  assert.equal(differenceLabel({ cents: 460, percent: 26.65, verdict: "cheaper" }), "4,60 € (26,65 %) günstiger");
  assert.equal(differenceLabel({ cents: -320, percent: -32, verdict: "more_expensive" }), "3,20 € (32,00 %) teurer");
  assert.equal(differenceLabel({ cents: 0, percent: 0, verdict: "equal" }), "Gleich teuer");
  assert.equal(differenceLabel({ cents: -500, percent: null, verdict: "more_expensive" }), "5,00 € teurer");
  assert.equal(differenceLabel(null), null);
  assert.equal(transglobalCellText({ status: "unavailable" }), TARIFF_TEXTS.unavailable);
  assert.equal(transglobalCellText({ status: "fetch_failed" }), TARIFF_TEXTS.fetchFailed);
  assert.equal(transglobalCellText({ status: "ok", customerNetCents: 1126 }), "11,26 €");
  assert.equal(referenceCellText({ status: "no_reference" }), TARIFF_TEXTS.noReference);
  assert.equal(referenceCellText({ status: "not_comparable" }), TARIFF_TEXTS.notComparable);
  assert.equal(differenceCellText({ transglobal: { status: "ok" }, reference: { status: "no_reference" }, difference: null }), TARIFF_TEXTS.noReference);
  assert.equal(differenceCellText({ transglobal: { status: "unavailable" }, reference: { status: "ok" }, difference: null }), "—");
  assert.equal(packageLabel({ weightKg: 1, lengthCm: 20, widthCm: 15, heightCm: 10 }), "1 kg · 20 × 15 × 10 cm");
  assert.equal(packageLabel({ weightKg: 2.5, lengthCm: 25, widthCm: 20, heightCm: 15 }), "2,5 kg · 25 × 20 × 15 cm");
  assert.equal(formatDay("2026-11-11"), "11.11.2026");
});

test("Vergleichsbasis: nur für denselben Kunden, dasselbe Zielland, dieselben Kontosätze und innerhalb von 24 h", () => {
  const base = selectComparison({ runId: "7", kind: "standard", createdAt: "2026-11-10T20:00:00.000Z", expiresAt: "2026-11-11T20:00:00.000Z", destinationCountry: "DE", accountMarkup: { standardPercent: 20, expressPercent: 30 }, products: [], scenarios: [] }, 7);
  const konto = { standardPercent: 20, expressPercent: 30 };
  const jetzt = Date.parse("2026-11-10T21:00:00.000Z");
  assert.equal(comparisonBaseStatus({ base: null, userId: 7, destination: "DE", account: konto, now: jetzt }), "missing");
  assert.equal(comparisonBaseStatus({ base, userId: 7, destination: "DE", account: konto, now: jetzt }), "ok");
  assert.equal(comparisonBaseStatus({ base, userId: 8, destination: "DE", account: konto, now: jetzt }), "stale", "Kundenwechsel");
  assert.equal(comparisonBaseStatus({ base, userId: 7, destination: "AT", account: konto, now: jetzt }), "stale", "Ziellandwechsel");
  assert.equal(comparisonBaseStatus({ base, userId: 7, destination: "DE", account: { standardPercent: 25, expressPercent: 30 }, now: jetzt }), "stale", "Standardsatz geändert");
  assert.equal(comparisonBaseStatus({ base, userId: 7, destination: "DE", account: { standardPercent: 20, expressPercent: null }, now: jetzt }), "stale", "Expresssatz geändert");
  assert.equal(comparisonBaseStatus({ base, userId: 7, destination: "DE", account: konto, now: Date.parse("2026-11-12T00:00:00.000Z") }), "expired");
  assert.equal(selectComparison({ runId: 7 }, 7), null);
});

test("Zielländer: Deutschland zuerst, danach deutsche Namen; fehlende Beispieladresse bleibt sichtbar markiert", () => {
  const o = destinationOptions(ANTWORT.comparison.destinations, { AT: "Österreich", DE: "Deutschland", BG: "Bulgarien" });
  assert.deepEqual(o.map((x) => x.code), ["DE", "BG", "AT"]);
  assert.equal(o.find((x) => x.code === "BG").hasExampleAddress, false);
});

test("Eigenes Paket: Komma oder Punkt, alle vier Felder, positive Zahlen; sonst ein verständlicher Fehler", () => {
  assert.deepEqual(parseCustomPackageInput({ weight: "2,5", length: "25", width: "20", height: "15" }), { ok: true, value: { weightKg: 2.5, lengthCm: 25, widthCm: 20, heightCm: 15 } });
  assert.equal(parseCustomPackageInput({ weight: "", length: "25", width: "20", height: "15" }).ok, false);
  assert.equal(parseCustomPackageInput({ weight: "0", length: "25", width: "20", height: "15" }).ok, false);
  assert.equal(parseCustomPackageInput({ weight: "abc", length: "25", width: "20", height: "15" }).error, COMPARISON_ERRORS.INVALID_CUSTOM_PACKAGE);
});

test("Fehlertexte: Feldbezug beim Speichern, „Aktualisierung erforderlich“ bei veralteter Basis, 401/403 zentral", () => {
  assert.deepEqual(tariffSaveError(400, { code: "INVALID_TARIFF_MARKUP_PERCENT", productKey: 23 }), { text: "Ein Aufschlag ist ungültig: erlaubt sind 0 bis 100 Prozent mit höchstens zwei Nachkommastellen.", productKey: "23", code: "INVALID_TARIFF_MARKUP_PERCENT" });
  assert.equal(tariffSaveError(403, {}), null);
  assert.equal(tariffSaveError(500, null).productKey, null);
  assert.equal(comparisonError(409, { code: "COMPARISON_STALE" }).stale, true);
  assert.equal(comparisonError(410, { code: "COMPARISON_EXPIRED" }).stale, true);
  assert.equal(comparisonError(429, {}).text, "Zu viele Aktualisierungen in kurzer Zeit. Bitte in einigen Minuten erneut versuchen.");
  assert.equal(comparisonError(400, { code: "INVALID_CUSTOM_PACKAGE" }).stale, false);
  assert.equal(comparisonError(401, {}), null);
});

// ── B) Contract (Quelltext) ─────────────────────────────────────────────────

test("API-Wrapper: genau die vier Pfade, ohne /api-Präfix, mit auth:true; der Body kennt nur markups bzw. destinationCountry/custom", () => {
  const api = src("api/adminApi.js");
  for (const fn of ["getAdminCustomerTariffMarkups", "updateAdminCustomerTariffMarkups", "refreshAdminTariffComparison", "previewAdminTariffComparison"]) assert.match(api, new RegExp(`export function ${fn}\\(`));
  assert.match(api, /`\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/tariff-markups`, \{ auth: true, signal \}/);
  assert.match(api, /`\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/tariff-comparison`/);
  assert.match(api, /`\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/tariff-comparison\/\$\{encodeURIComponent\(runId\)\}\/preview`/);
  assert.doesNotMatch(api, /\/api\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/tariff/);
  assert.match(api, /JSON\.stringify\(\{ markups: body\.markups \}\)/, "PUT sendet ausschließlich markups");
  assert.match(api, /JSON\.stringify\(\{ markups: \{ \.\.\.\(markups \|\| \{\}\) \} \}\)/, "Vorschau sendet ausschließlich markups");
});

test("Komponente: keine Preisformel im Browser, Providerkontakt nur hinter „Preise aktualisieren“ und „Vergleichen“, Vorschau entprellt", () => {
  const k = src("components/admin/CustomerTariffMarkupSection.jsx");
  assert.doesNotMatch(k, /customerNetCents\s*[*/+-]\s*|\*\s*\(1\s*\+|\/\s*100\s*\*|Math\.round\([^)]*\*\s*\(/, "keine Preisrechnung mit Serverbeträgen");
  assert.doesNotMatch(k, /\b0\.19\b|VAT|vatRate/, "kein Steuersatz im Browser");
  const refreshAufrufe = k.match(/refreshAdminTariffComparison\(/g) || [];
  assert.equal(refreshAufrufe.length, 2, "genau zwei Aufrufer (Aktualisieren, Vergleichen)");
  assert.match(k, /const aktualisieren = async \(\) =>/);
  assert.match(k, /const vergleichen = async \(e\) =>/);
  // Kein Effekt ruft den Providerabruf: jeder useEffect-Rumpf (bis zu seiner Abhängigkeitsliste) ist frei davon.
  for (const block of k.split("useEffect(").slice(1)) {
    const rumpf = block.slice(0, block.search(/\n\s*\}, \[|\n\s*\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps/));
    assert.doesNotMatch(rumpf, /refreshAdminTariffComparison/, "kein automatischer Providerabruf in einem Effekt");
  }
  assert.match(k, /onClick=\{aktualisieren\}/, "Aktualisieren nur per Klick");
  assert.match(k, /onSubmit=\{vergleichen\}/, "Eigenes Paket nur per Absenden");
  assert.match(k, /PREVIEW_DEBOUNCE_MS = 300/);
  assert.match(k, /previewAdminTariffComparison\(userId, b\.runId, aenderungen\.changes/);
  assert.match(k, /setBase\(null\); setCustomBase\(null\)/, "Ziellandwechsel verwirft die Basis");
  assert.match(k, /id="adm-tarif-save"/);
  assert.match(k, /id="adm-tarif-refresh"/);
  assert.match(k, /id="adm-tarif-destination"/);
  assert.match(k, /onClick=\{\(\) => \{ setDrafts\(\(d\) => \(\{ \.\.\.d, \[z\.key\]: "" \}\)\)/, "Standard verwenden leert den Entwurf");
  for (const t of ["purchase", "providerServiceRef", "shipperTariffId"]) assert.doesNotMatch(k, new RegExp(t));
});

test("Seite: die Karte hängt mit Kundenschlüssel unter dem Kundenaufschlag — ein Kundenwechsel beginnt leer", () => {
  const seite = src("pages/admin/AdminUserDetailPage.jsx");
  assert.match(seite, /import \{ CustomerTariffMarkupSection \} from "\.\.\/\.\.\/components\/admin\/CustomerTariffMarkupSection"/);
  assert.match(seite, /<CustomerTariffMarkupSection key=\{`tarife-\$\{idOf\(u\)\}`\} userId=\{idOf\(u\)\} pricing=\{pricing\} \/>/);
  assert.ok(seite.indexOf("<CustomerMarkupSection") < seite.indexOf("<CustomerTariffMarkupSection"), "unter dem Kundenaufschlag");
  assert.ok(seite.indexOf("<CustomerTariffMarkupSection") < seite.indexOf("<CustomerApprovalCard"), "vor der Freischaltung");
});

test("Texte: Vorabcharakter und Netto sind benannt; die Zustände haben Wortlaute", () => {
  assert.match(TARIFF_TEXTS.comparisonTitle, /Vorläufiger Preisvergleich/);
  assert.match(TARIFF_TEXTS.comparisonIntro, /Vorabpreise/);
  assert.match(TARIFF_TEXTS.comparisonIntro, /netto/);
  for (const k of ["unavailable", "noReference", "notComparable", "fetchFailed", "refreshRequired", "equal", "cheaper", "moreExpensive"]) assert.ok(TARIFF_TEXTS[k], k);
});
