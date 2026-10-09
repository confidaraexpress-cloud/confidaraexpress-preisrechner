// ──────────────────────────────────────────────────────────────────────────────
// R9 — vorbestehende Bedienungs- und Barrierefreiheitsbefunde (Gesamt-QA der UX-Pakete 1–6,
// docs/ux-gesamt-qa-2026-10-08.md, Register R9). Jeder Fall hält genau eine Korrektur fest.
// Kontraste werden aus den ECHTEN Tokenwerten in variables.css berechnet, nicht aus Kommentaren.
// Bewusst NICHT Teil von R9: die Kennzahl „Kunden“ der Admin-Übersicht (Betreiberentscheidung).
// Run: node --test src/styles/r9Accessibility.test.mjs
// ──────────────────────────────────────────────────────────────────────────────
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAmountText, runPercentText } from "../utils/adminSalesPartnerSettlementView.mjs";

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => fs.readFileSync(path.join(SRC, p), "utf8");
const variablen = lies("styles/variables.css");
const token = (name) => {
  const m = variablen.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  assert.ok(m, `Token --${name} fehlt`);
  return m[1];
};
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const kontrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const AA = 4.5;
// Eine CSS-Regel als Text (erster Treffer des exakten Selektors bis zur schließenden Klammer).
const regel = (datei, selektor) => {
  const css = lies(datei);
  const i = css.indexOf(`${selektor} {`);
  assert.ok(i >= 0, `${datei}: Regel ${selektor} fehlt`);
  return css.slice(i, css.indexOf("}", i) + 1);
};

test("Registrierung: Straße, PLZ, Stadt und Land sind mit ihren Labels verknüpft", () => {
  const form = lies("components/auth/RegisterForm.jsx");
  const labels = [...form.matchAll(/<label className="auth-field-label"([^>]*)>/g)].map((m) => m[1]);
  assert.ok(labels.length >= 8, `zu wenige Labels gefunden: ${labels.length}`);
  for (const attr of labels) {
    const ziel = attr.match(/htmlFor="([^"]+)"/);
    assert.ok(ziel, `Label ohne htmlFor: <label${attr}>`);
    assert.ok(form.includes(`id="${ziel[1]}"`), `kein Feld mit id="${ziel[1]}"`);
  }
  for (const id of ["reg-street", "reg-zip", "reg-city", "reg-country"]) assert.ok(form.includes(`htmlFor="${id}"`), id);
  assert.match(form, /<select\s+id="reg-country"/, "die Länderauswahl hat keinen zugänglichen Namen");
});

test("Kontrast: gedämpfter Admin-Chip auf weißem Grund erreicht AA", () => {
  const r = regel("styles/admin.css", ".adm-chip-muted");
  assert.match(r, /color: var\(--ce-color-text-muted\)/);
  assert.match(r, /background: var\(--ce-color-surface\)/, "der Chip steht wieder auf dem gedämpften Grund");
  assert.ok(kontrast(token("ce-color-text-muted"), token("ce-color-surface")) >= AA);
  // Gegenprobe: auf dem Standardgrund des Chips lag er unter AA — deshalb der eigene Grund.
  assert.ok(kontrast(token("ce-color-text-muted"), token("ce-color-surface-muted")) < AA);
});

test("Kontrast: Hinweistexte in Lieferschein- und Abrechnungsart erreichen AA, auch in der gewählten Option", () => {
  const r = regel("styles/dashboard-premium.css", ".dn-mode-option .field-hint");
  assert.match(r, /color: var\(--ce-color-text-secondary\)/);
  for (const grund of ["ce-color-surface", "ce-color-brand-soft"]) {
    const k = kontrast(token("ce-color-text-secondary"), token(grund));
    assert.ok(k >= AA, `Hinweis auf --${grund}: ${k.toFixed(2)}:1`);
  }
});

test("Token-Kommentar nennt den gemessenen Kontrast von --ce-color-text-muted", () => {
  const k = kontrast(token("ce-color-text-muted"), "#ffffff").toFixed(2).replace(".", ",");
  assert.match(variablen, new RegExp(`--ce-color-text-muted: #667284;\\s*/\\* weiß ${k}:1`), `erwartet „weiß ${k}:1“`);
});

test("Nutzer-Chip: der Name entsteht aus dem sichtbaren Text, die Aktion wird ergänzt (WCAG 2.5.3)", () => {
  const chip = lies("components/ui/UserChip.jsx");
  const knopf = chip.slice(chip.indexOf('<button type="button" className="pp-uchip"'), chip.indexOf("</button>"));
  assert.doesNotMatch(knopf, /aria-label=/, "ein aria-label ersetzt wieder Name und Firma");
  assert.match(knopf, /<span className="pp-uname">\{name\}<\/span>/);
  assert.match(knopf, /<span className="sr-only">: \{label\}<\/span>/, "die Aktion fehlt im Namen");
});

test("Admin-Übersicht: Kennzahlkarten ohne aria-label — der Name enthält den sichtbaren Wert", () => {
  const seite = lies("pages/admin/AdminOverviewPage.jsx");
  const karte = seite.slice(seite.indexOf("function MetricCard"), seite.indexOf("function fmtDateTime"));
  assert.doesNotMatch(karte, /aria-label=/, "ein aria-label ersetzt wieder den sichtbaren Wert");
  assert.match(karte, /<span className="sr-only"> — \{view\.linkLabel\}<\/span>/, "das Linkziel fehlt im Namen");
});

test("Admin-Einstellungen: scrollbare Tabellenbereiche sind per Tastatur erreichbar und benannt", () => {
  const bereiche = [
    ...lies("components/admin/SalesPartnerLevelRules.jsx").matchAll(/<div className="table-scroll[^"]*"[^>]*>/g),
    ...lies("pages/admin/AdminSalesPartnerSettingsPage.jsx").matchAll(/<div className="table-scroll[^"]*"[^>]*>/g),
  ].map((m) => m[0]);
  assert.equal(bereiche.length, 3, bereiche.join("\n"));
  for (const b of bereiche) {
    assert.match(b, /tabIndex=\{0\}/, b);
    assert.match(b, /role="region"/, b);
    assert.match(b, /aria-label=/, b);
  }
  assert.match(lies("styles/admin.css"), /\.adm-sp-levels:focus-visible, \.adm-sp-mini-table:focus-visible \{ outline: var\(--ce-focus-ring\)/);
  assert.match(regel("styles/admin.css", ".adm-sp-history-item > summary"), /min-height: 44px/);
});

test("Touch-Ziele: Rechtslinks, „angemeldet bleiben“ und Fußzeilenlinks mindestens 44 px bei grober Zeigerführung", () => {
  const auth = lies("styles/auth.css");
  const authCoarse = auth.slice(auth.indexOf("@media (pointer: coarse)"));
  assert.match(authCoarse, /\.auth-legal a \{[^}]*min-height: 44px/);
  assert.match(authCoarse, /\.auth-check \{[^}]*min-height: 44px/);
  const dash = lies("styles/dashboard-premium.css");
  const dashCoarse = dash.slice(dash.lastIndexOf("@media (pointer: coarse)"));
  assert.match(dashCoarse, /\.app-footer-legal a \{[^}]*min-height: 44px/);
});

test("Gutschriftslauf: Steuersatz ohne Umbruch zwischen Zahl und Prozentzeichen", () => {
  assert.equal(runPercentText("19.00"), "19,00\u00a0%");
  assert.equal(runPercentText("7"), "7,00\u00a0%");
  assert.equal(runPercentText(null), "—");
  assert.doesNotMatch(lies("pages/admin/AdminSalesPartnerCreditNotesPage.jsx"), /formatPercent\(/);
});

test("Gutschriftslauf: bereits ausgestellt ohne offenen Rest zeigt „—“ statt „0,00 €“", () => {
  const ausgestellt = { status: "already_issued" };
  assert.equal(runAmountText(ausgestellt, 0), "—");
  assert.equal(runAmountText(ausgestellt, null), "—");
  // Ein echter offener Rest bleibt sichtbar; andere Status unverändert.
  assert.match(runAmountText(ausgestellt, 1250), /^12,50\s€$/);
  assert.match(runAmountText({ status: "issuable" }, 0), /^0,00\s€$/);
  assert.match(runAmountText({ status: "carried_forward" }, -1200), /^-12,00\s€$|^−12,00\s€$/);
  const seite = lies("pages/admin/AdminSalesPartnerCreditNotesPage.jsx");
  assert.doesNotMatch(seite, /formatCents\(row\./, "eine Betragszelle umgeht runAmountText");
  assert.equal((seite.match(/runAmountText\(row, row\.(net|tax|gross)Cents\)/g) || []).length, 6);
});
