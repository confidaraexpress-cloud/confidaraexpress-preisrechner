// Source-Structure-Tests für die Versicherungskarten-Typografie/Responsiveness.
// Rein statische Prüfungen der Quell-Invarianten (kein Logik-/Preisverhalten) —
// schützen die Umbruch- und Container-Query-Regeln gegen versehentliche Regressionen.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../styles/calculator.css", import.meta.url), "utf8");
const jsx = readFileSync(new URL("./InsuranceModule.jsx", import.meta.url), "utf8");

// Deklarationsblock eines Selektors extrahieren (erste Übereinstimmung).
function block(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = css.match(new RegExp(esc + "\\s*\\{([^}]*)\\}"));
  return m ? m[1] : null;
}

test("1 — Kartenkopf hat getrennten Titel- und Preisbereich", () => {
  assert.match(jsx, /ins-card-title-area/, "Titelbereich fehlt");
  assert.match(jsx, /<CardPrice\s+price=/, "separater Preisbereich (CardPrice) fehlt");
  // Preis liegt NICHT im Titelbereich (Name + Badge), sondern als eigenes Element daneben.
  assert.match(jsx, /ins-card-title-area[\s\S]*?<\/span>\s*<CardPrice/, "CardPrice muss neben dem Titelbereich stehen");
});

test("2 — Preisbetrag ist nicht umbrechbar (white-space: nowrap)", () => {
  const b = block(".ins-card-price-val");
  assert.ok(b, ".ins-card-price-val fehlt");
  assert.match(b, /white-space:\s*nowrap/, "Preiswert muss nowrap sein");
  assert.match(b, /tabular-nums/, "tabellarische Ziffern erwartet");
});

test("3 — Versicherungsnamen verwenden KEIN word-break: break-all", () => {
  const b = block(".ins-card-name");
  assert.ok(b);
  assert.doesNotMatch(b, /break-all/, "break-all verboten");
  assert.match(b, /word-break:\s*normal/);
});

test("4 — Versicherungsnamen verwenden KEIN overflow-wrap: anywhere/break-word", () => {
  const b = block(".ins-card-name");
  assert.doesNotMatch(b, /anywhere/, "overflow-wrap: anywhere verboten");
  assert.doesNotMatch(b, /break-word/, "overflow-wrap: break-word verboten");
  assert.match(b, /overflow-wrap:\s*normal/);
});

test("5 — Versicherungsnamen ohne automatische Silbentrennung", () => {
  const b = block(".ins-card-name");
  assert.doesNotMatch(b, /hyphens:\s*auto/, "hyphens: auto verboten");
  assert.match(b, /hyphens:\s*none/);
});

test("6 — Beträge im Fließtext werden zusammengehalten (nowrap-Helper)", () => {
  assert.match(jsx, /withAmountNoWrap/, "Betrags-nowrap-Helper fehlt");
  assert.match(jsx, /ins-bullet-txt">\{withAmountNoWrap\(b\.text\)\}/, "Bullet-Text muss durch withAmountNoWrap laufen");
  assert.ok(block(".ins-nowrap"), ".ins-nowrap-Utility fehlt");
  assert.match(block(".ins-nowrap"), /white-space:\s*nowrap/);
});

test("7 — Premium-Badge liegt NICHT in der Preis-Spalte", () => {
  const b = block(".ins-card-badge");
  assert.ok(b);
  assert.doesNotMatch(b, /grid-column:\s*2/, "Badge darf nicht in Spalte 2 (Preis) liegen");
  // Badge steht im Titelbereich, also im Quelltext VOR dem CardPrice.
  assert.ok(jsx.indexOf("ins-card-badge") < jsx.indexOf("<CardPrice"), "Badge muss vor dem Preis (im Titelbereich) stehen");
  // Badge lesbar (>= 10px).
  assert.match(b, /font-size:\s*1[0-9](?:\.\d+)?px/, "Badge muss >= 10px sein");
});

test("8 — Layout reagiert auf Containerbreite (Container-Query)", () => {
  assert.match(css, /\.booking-insurance-box\s*\{[^}]*container-type:\s*inline-size/, "container-type auf dem Modul fehlt");
  assert.match(css, /@container\s+insurance/, "@container-Regeln fehlen");
});

test("9 — mittlere Breite erzwingt keine drei Karten (max. zwei Spalten)", () => {
  assert.match(css, /@container\s+insurance\s*\(min-width:[^)]*\)\s*\{[^}]*grid-template-columns:\s*repeat\(2/, "2-Spalten-Regel fehlt");
  // KEIN dreispaltiges .ins-cards-Grid (dreispaltig würde die Namen brechen).
  assert.doesNotMatch(css, /\.ins-cards\s*\{[^}]*repeat\(3/, "Kein repeat(3) im .ins-cards-Grid");
});

test("10 — kleine Breite stapelt Karten (mobile-first 1 Spalte als Basis)", () => {
  const b = block(".ins-cards");
  assert.ok(b);
  assert.match(b, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/, "Basis muss einspaltig sein (mobile-first)");
});

test("11 — Bedingungen-Link am Kartenende ausrichtbar", () => {
  const b = block(".ins-card-cond");
  assert.ok(b);
  assert.match(b, /margin-top:\s*auto/, "Link muss per margin-top:auto nach unten rutschen");
});

test("12 — Radio-Semantik erhalten (native radios + radiogroup)", () => {
  assert.match(jsx, /role="radiogroup"/, "radiogroup fehlt");
  assert.match(jsx, /type="radio"/, "native radios fehlen");
});

test("13 — Preis ist Teil der zugänglichen Option (aria-label enthält Preis)", () => {
  assert.match(jsx, /aria-label=\{cardAriaLabel\(c\)\}/, "aria-label am radio fehlt");
  assert.match(jsx, /function cardAriaLabel[\s\S]*?money\(/, "aria-label muss den Preis (money) enthalten");
});

test("14 — keine Preis-/Versicherungslogik verändert (reine Darstellung)", () => {
  // Preise kommen weiterhin als c.price aus dem Orchestrator; keine lokale Berechnung.
  assert.match(jsx, /price=\{c\.price\}/, "Karte muss den vom Orchestrator gelieferten Preis rendern");
  // money() wird nur zum Formatieren genutzt — keine Arithmetik auf Preiswerten.
  assert.doesNotMatch(jsx, /money\([^)]*[*+/%-][^)]*\)/, "keine Preisberechnung innerhalb money()");
  assert.doesNotMatch(jsx, /extraInsurancePrice|goodsValue\s*[*+/-]/, "keine lokale Prämien-/Wertberechnung");
});
