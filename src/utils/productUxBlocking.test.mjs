/* Artikelbereich und Sperrbestand — gezielte Prüfungen.
 *
 * Zwei Zusagen tragen diese Datei:
 *
 *   1. **Eine Sperre ist keine physische Warenbewegung.** Sie verschiebt
 *      verfügbaren in gesperrten Bestand; `on_hand` bleibt. Deshalb darf im
 *      Frontend nirgends so getan werden, als wäre sie eine Ausbuchung, und die
 *      Sperrhistorie darf nicht in die Bewegungsliste rutschen.
 *
 *   2. **Alle Felder bleiben, aber nicht alle sind immer sichtbar.** Optionale
 *      Gruppen sind einklappbar — ein Abschnitt mit Daten startet jedoch
 *      geöffnet, sonst wären vorhandene Angaben versteckt.
 *
 * Reiner Logik-/Quelltexttest: kein Browser, keine API, keine Datenbank.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BLOCK_REASONS, blockReasonLabel, blockEntryView, lowStockInfo,
  SECTION_FIELDS, sectionHasData,
} from "./inventoryView.mjs";

const hier = path.dirname(fileURLToPath(import.meta.url));
const lies = (p) => readFileSync(path.join(hier, p), "utf8");
const liste = lies("../pages/inventory/ProductsPage.jsx");
const detail = lies("../pages/inventory/ProductDetailPage.jsx");
const form = lies("../components/inventory/ProductForm.jsx");
const shared = lies("../components/inventory/InventoryShared.jsx");
const api = lies("../api/inventoryApi.js");
const css = lies("../styles/inventory.css");
const bewegungen = lies("../pages/inventory/MovementsPage.jsx");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/* ══════════ 1 — Aktionen der Artikelliste ═════════════════════════════════ */

test("1 — „Öffnen“ und „Bearbeiten“ stehen auf derselben visuellen Stufe", () => {
  const code = ohneKommentare(liste);
  // Vorher war „Bearbeiten" ein btn-ghost und damit deutlich schwächer als
  // „Öffnen" — obwohl beide gleich wichtig sind.
  // Das Fenster ist bewusst großzügig statt `[^>]*`: die onClick-Pfeilfunktion
  // enthält selbst ein „>“ und würde eine engere Klasse vorzeitig beenden.
  const oeffnen = (code.match(/btn-sm btn-outline"[\s\S]{0,160}?>Öffnen</g) || []).length;
  const bearbeiten = (code.match(/btn-sm btn-outline"[\s\S]{0,160}?>Bearbeiten</g) || []).length;
  assert.equal(oeffnen, 2, "„Öffnen“ fehlt in Tabelle oder Kartenansicht");
  assert.equal(bearbeiten, 2, "„Bearbeiten“ steht nicht auf derselben Stufe wie „Öffnen“");
  assert.ok(!/btn-ghost[\s\S]{0,160}?>Bearbeiten</.test(code), "„Bearbeiten“ ist noch der schwächere Ghost-Button");
});

test("2 — „Versenden“ bleibt die klar hervorgehobene Hauptaktion", () => {
  const code = ohneKommentare(liste);
  const versenden = (code.match(/className="btn btn-sm btn-primary"[\s\S]{0,160}?>Versenden/g) || []).length;
  assert.equal(versenden, 2, "„Versenden“ ist nicht in beiden Ansichten Primary");
  // Genau EIN Primary je Zeile — sonst gäbe es keine Hierarchie mehr.
  assert.equal((code.match(/btn-sm btn-primary/g) || []).length, 2);
});

test("3 — der Versanddialog führt in den BESTEHENDEN Prozess, nicht in einen neuen", () => {
  for (const [name, code] of [["Liste", liste], ["Detail", detail]]) {
    assert.ok(code.includes("Versand vorbereiten"), `${name}: der Bestätigungsknopf heißt nicht „Versand vorbereiten“`);
    assert.ok(code.includes("mapProductToShipment"), `${name}: der bestehende Prefill wird nicht genutzt`);
    // Kein zweiter Versandprozess: keine eigene Buchung, kein eigener Tarifabruf.
    assert.ok(!/calculate-price|\/book\b|shipperTariffId/.test(code), `${name}: es entsteht ein zweiter Versandweg`);
  }
});

/* ══════════ 2 — Sperrbestand ══════════════════════════════════════════════ */

test("4 — es gibt vier Gründe, und ein Rohwert erscheint nie im sichtbaren Text", () => {
  assert.deepEqual(BLOCK_REASONS.map((r) => r.value), ["damaged", "inspection", "on_hold", "other"]);
  for (const r of BLOCK_REASONS) {
    assert.ok(r.label && !/[a-z]+_[a-z]+/.test(r.label), `Beschriftung sieht nach Rohwert aus: ${r.label}`);
  }
  // Ein unbekannter Code darf niemals roh durchschlagen.
  assert.equal(blockReasonLabel("gibtEsNicht"), "Grund nicht angegeben");
  assert.equal(blockReasonLabel(undefined), "Grund nicht angegeben");
  assert.equal(blockReasonLabel("damaged"), "Beschädigt");
});

test("5 — ein Historieneintrag nennt Grund, Menge und Zeitpunkt", () => {
  const v = blockEntryView({
    id: "7", action: "block", quantity: 2, blockedAfter: 2,
    reason: "damaged", note: "Transportschaden", warehouseName: "Hauptlager",
    createdAt: "2026-08-18T10:00:00Z",
  });
  assert.equal(v.title, "Beschädigt");
  assert.equal(v.quantityText, "2 Einheiten");
  assert.equal(v.note, "Transportschaden");
  assert.equal(v.blockedAfter, 2);
  assert.equal(v.rawReason, null, "ein bekannter Grund braucht keinen Rohwert");
});

test("6 — Einzahl/Mehrzahl stimmt, und eine Freigabe trägt keinen Sperrgrund", () => {
  assert.equal(blockEntryView({ id: "1", action: "block", quantity: 1, reason: "on_hold" }).quantityText, "1 Einheit");
  const frei = blockEntryView({ id: "2", action: "unblock", quantity: 3 });
  assert.equal(frei.title, "Sperre aufgehoben");
  assert.equal(frei.quantityText, "3 Einheiten");
});

test("7 — ein unbekannter Grundcode landet im title-Attribut, nicht im Fließtext", () => {
  const v = blockEntryView({ id: "9", action: "block", quantity: 1, reason: "quarantine_2026" });
  assert.equal(v.title, "Grund nicht angegeben");
  assert.equal(v.rawReason, "quarantine_2026", "der Rohwert muss für das title-Attribut erhalten bleiben");
  // Und im Markup steht er genau dort — nicht im sichtbaren Text.
  assert.match(ohneKommentare(detail), /title=\{b\.rawReason \? `Serverwert: \$\{b\.rawReason\}` : undefined\}/);
});

test("8 — kaputte Einträge stürzen nicht ab", () => {
  for (const kaputt of [null, undefined, "text", 5]) {
    assert.equal(blockEntryView(kaputt), null, `${JSON.stringify(kaputt)} hätte null ergeben müssen`);
  }
  const ohneMenge = blockEntryView({ id: "1", action: "block" });
  assert.equal(ohneMenge.quantityText, "—", "eine fehlende Menge darf nicht als 0 erscheinen");
});

test("9 — die Seite behauptet nie, eine Sperre sei eine Ausbuchung", () => {
  const code = ohneKommentare(detail);
  // Der erklärende Satz ist der Kern: physisch bleibt die Ware da.
  assert.ok(/Physisch liegen sie weiterhin im Lager/.test(code),
    "der Satz „physisch weiterhin im Lager“ fehlt");
  // Die Sperrhistorie ist ein EIGENER Abschnitt, nicht Teil der Bewegungen.
  const idxSperre = code.indexOf("Gesperrter Bestand");
  const idxBewegung = code.indexOf("Letzte Bestandsbewegungen");
  assert.ok(idxSperre > 0 && idxBewegung > idxSperre, "die Sperrhistorie liegt nicht als eigener Abschnitt vor den Bewegungen");
  // Und sie wird aus `blocks` gespeist, nicht aus `movements`.
  assert.match(code, /data\?\.blocks \|\| \[\]/);
});

test("10 — die Aktionen senden eine MENGE, nie einen Zielwert", () => {
  const code = ohneKommentare(api);
  assert.match(code, /postBlock/);
  assert.match(code, /postUnblock/);
  assert.match(code, /\/api\/kunde\/inventory\/block/);
  assert.match(code, /\/api\/kunde\/inventory\/unblock/);
  // Es darf keine Funktion geben, die `blocked` setzt.
  assert.ok(!/setBlocked|blocked:\s*\w/.test(code), "es gibt einen Weg, blocked direkt zu setzen");
  // Auch die Seite rechnet nichts aus: sie schickt die eingegebene Menge.
  const seite = ohneKommentare(detail);
  assert.match(seite, /quantity: menge/);
  assert.ok(!/blocked:\s*/.test(seite.replace(/stock\?\.blocked/g, "")), "die Seite sendet einen Sperrstand statt einer Menge");
});

test("11 — „Sperre aufheben“ erscheint nur, wenn es etwas aufzuheben gibt", () => {
  const code = ohneKommentare(detail);
  assert.match(code, /\{gesperrt > 0 && \([\s\S]{0,200}Sperre aufheben/);
  // „Bestand sperren" ist ohne verfügbaren Bestand abgeschaltet statt versteckt:
  // die Möglichkeit bleibt erkennbar.
  assert.match(code, /Bestand sperren[\s\S]{0,80}|disabled=\{Number\(p\.stock\?\.available \?\? 0\) < 1\}/);
});

test("12 — „Sonstiger Grund“ verlangt eine Notiz, schon im Client", () => {
  const code = ohneKommentare(detail);
  // Serverseitig gilt dieselbe Regel — hier ist es Bedienkomfort, damit der
  // Nutzer nicht erst absenden muss, um es zu erfahren.
  assert.match(code, /stockDialog === "block" && stockReason === "other" && !notiz/);
});

/* ══════════ 3 — Bestandsanzeige ══════════════════════════════════════════ */

test("13 — die Detailseite zeigt alle fünf Werte und die Formel dazu", () => {
  const code = ohneKommentare(detail);
  for (const k of ["Physisch", "Reserviert", "Gesperrt", "Verfügbar", "Mindestbestand"]) {
    assert.ok(code.includes(`>${k}<`), `Bestandswert fehlt: ${k}`);
  }
  assert.match(code, /Verfügbar = physisch − reserviert − gesperrt/);
});

test("14 — niedriger Bestand nennt Fehlmenge statt nur ein Etikett", () => {
  assert.deepEqual(lowStockInfo({ available: 17, minStock: 20 }), { available: 17, minStock: 20, missing: 3 });
  // Kein Mindestbestand gepflegt → es gibt nichts zu sagen.
  assert.equal(lowStockInfo({ available: 0, minStock: null }), null);
  assert.equal(lowStockInfo({ available: 0, minStock: undefined }), null);
  // Bestand reicht → ebenfalls nichts zu sagen.
  assert.equal(lowStockInfo({ available: 20, minStock: 20 }), null);
  assert.equal(lowStockInfo({ available: 25, minStock: 20 }), null);
  assert.equal(lowStockInfo(null), null);
});

test("15 — der Hinweis trägt eine Handlung und öffnet den BESTEHENDEN Wareneingang", () => {
  const code = ohneKommentare(detail);
  assert.match(code, /inv-lowstock/);
  assert.match(code, /oeffneStock\("receipt"\)/);
  // Kein zweiter Wareneingangspfad: es wird der vorhandene Endpunkt genutzt.
  assert.match(code, /postReceipt/);
  assert.ok(!/inventory\/receipt/.test(code), "die Seite baut den Endpunktpfad selbst statt die API-Schicht zu nutzen");
});

/* ══════════ 4 — Formularstruktur ═════════════════════════════════════════ */

test("16 — kein Feld ist verschwunden", () => {
  // Die Felder sind langfristig wertvoll (Zoll, wiederkehrende Sendungen) —
  // das Problem war die Informationsmenge, nicht der Umfang.
  for (const id of ["p-sku", "p-ean", "p-name", "p-desc", "p-weight", "p-length", "p-width", "p-height",
                    "p-value", "p-hs", "p-origin", "p-customs", "p-min", "p-status"]) {
    assert.ok(form.includes(`id="${id}"`), `Feld fehlt: ${id}`);
  }
});

test("17 — genau drei Pflichtfelder, exakt die des Backends", () => {
  const code = ohneKommentare(form);
  const sterne = code.match(/label="[^"]*\*"/g) || [];
  assert.deepEqual(sterne.sort(), ['label="Bezeichnung *"', 'label="Gewicht kg *"', 'label="SKU *"']);
  // Keine erfundene UI-Pflicht: alles andere ist optional und bleibt es.
  assert.ok(!/label="Warenwert[^"]*\*"/.test(code));
  assert.ok(!/label="HS-Code[^"]*\*"/.test(code));
  assert.ok(!/label="Mindestbestand[^"]*\*"/.test(code));
});

test("18 — Pflichtfelder stehen NIE hinter einer Klappe", () => {
  const code = ohneKommentare(form);
  const idxKlappe = code.indexOf("<CollapsibleSection");
  assert.ok(idxKlappe > 0, "es gibt keinen einklappbaren Abschnitt");
  const vorDerKlappe = code.slice(0, idxKlappe);
  for (const feld of ['label="SKU *"', 'label="Bezeichnung *"', 'label="Gewicht kg *"']) {
    assert.ok(vorDerKlappe.includes(feld), `Pflichtfeld liegt hinter einer Klappe: ${feld}`);
  }
});

test("19 — die optionalen Abschnitte sind genau die beiden vorgesehenen", () => {
  assert.deepEqual(Object.keys(SECTION_FIELDS).sort(), ["customs", "dimensions"]);
  assert.deepEqual(SECTION_FIELDS.dimensions, ["lengthCm", "widthCm", "heightCm"]);
  assert.deepEqual(SECTION_FIELDS.customs, ["unitValue", "hsCode", "countryOfOrigin", "customsDescription"]);
  const code = ohneKommentare(form);
  assert.match(code, /title="Weitere Versanddaten"/);
  assert.match(code, /title="Zoll & internationale Sendungen"/);
});

test("20 — ein Abschnitt MIT Daten startet geöffnet, ein leerer bleibt zu", () => {
  // Die Regel, die verhindert, dass vorhandene Angaben versteckt werden.
  assert.equal(sectionHasData({ lengthCm: "20" }, "dimensions"), true);
  assert.equal(sectionHasData({ lengthCm: "", widthCm: "", heightCm: "" }, "dimensions"), false);
  assert.equal(sectionHasData({ hsCode: "61091000" }, "customs"), true);
  assert.equal(sectionHasData({ countryOfOrigin: "DE" }, "customs"), true);
  assert.equal(sectionHasData({ unitValue: "0" }, "customs"), true, "eine gesetzte 0 ist ein Wert");
  assert.equal(sectionHasData({}, "customs"), false);
  assert.equal(sectionHasData(null, "customs"), false);
  assert.equal(sectionHasData({ hsCode: "   " }, "customs"), false, "Leerraum ist kein Wert");
  // Und die Ableitung passiert beim Mount, nicht in einem Effekt: ein Effekt
  // risse den Abschnitt beim Tippen wieder auf.
  const code = ohneKommentare(form);
  assert.match(code, /useState\(\(\) => \(\{\s*dimensions: sectionHasData/);
  assert.ok(!/useEffect\([\s\S]{0,120}setOffen/.test(code), "der Startzustand kommt aus einem Effekt");
});

test("21 — ein Fehler in einem eingeklappten Abschnitt bleibt nicht unsichtbar", () => {
  const code = ohneKommentare(form);
  // Sonst sähe der Nutzer eine abgelehnte Eingabe ohne erkennbare Ursache.
  assert.match(code, /setOffen\(\(cur\) => \(\{[\s\S]{0,240}SECTION_FIELDS\.dimensions\.some\(\(k\) => gefunden\[k\]\)/);
  assert.match(code, /SECTION_FIELDS\.customs\.some\(\(k\) => gefunden\[k\]\)/);
});

test("22 — der Klappkopf ist ein echtes Bedienelement mit Zustandsansage", () => {
  const code = ohneKommentare(shared);
  const block = code.slice(code.indexOf("export function CollapsibleSection"), code.indexOf("export function ProductPicker"));
  assert.match(block, /<button\s+type="button"/);
  assert.match(block, /aria-expanded=\{open\}/);
  assert.match(block, /aria-controls=\{id\}/);
  assert.ok(!/<div[^>]*onClick/.test(block), "Klickfunktion auf einem <div>");
  // Eingeklappt verschwindet der Inhalt AUS DEM DOM: nur optisch verborgene
  // Felder blieben für Tastatur und Screenreader erreichbar.
  assert.match(block, /\{open && \(/);
});

/* ══════════ 5 — Dialog und Bewegungen ═══════════════════════════════════ */

test("23 — nur das lange Artikelformular bekommt den geteilten Dialog", () => {
  // Opt-in statt global: jeder andere Dialog ist kurz genug.
  assert.match(ohneKommentare(shared), /scrollBody = false/);
  assert.match(ohneKommentare(liste), /scrollBody/);
  assert.match(ohneKommentare(detail), /size="lg" busy=\{saving\} scrollBody/);
  const regeln = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // min-height:0 ist tragend — ohne das wächst das Flex-Kind über den Dialog
  // hinaus, statt zu scrollen.
  assert.match(regeln, /\.inv-dialog-split \.inv-form-scroll \{[^}]*min-height: 0/);
  assert.match(regeln, /\.inv-dialog-split \.inv-form-scroll \{[^}]*overflow-y: auto/);
});

test("24 — die Detailseite zeigt höchstens fünf Bewegungen und verlinkt den Rest", () => {
  const code = ohneKommentare(detail);
  assert.match(code, /data\.movements\.slice\(0, 5\)/);
  assert.match(code, /Alle Bewegungen anzeigen/);
  // Der Link filtert den Artikel bereits vor — der Endpunkt kennt productId.
  assert.match(code, /page=movements&product=\$\{encodeURIComponent\(id\)\}/);
});

test("25 — der Artikelfilter wirkt und ist sichtbar abwählbar", () => {
  const code = ohneKommentare(bewegungen);
  assert.match(code, /productId: productId \|\| undefined/, "der Filter wird nicht mitgesendet");
  assert.match(code, /\}, \[type, productId, from, to\]\)/, "der Filter löst kein Neuladen aus");
  // Ohne sichtbaren Hinweis sähe der Nutzer eine verkürzte Liste ohne Grund.
  assert.match(code, /inv-toolbar-chip/);
  // Der Chip räumt den Filter weg. Geprüft wird die WIRKUNG, nicht der exakte
  // Handlerrumpf: seit der Bewegungsseite den Artikelnamen selbst hält, setzt
  // derselbe Klick zusätzlich den Namen zurück.
  const chip = code.slice(code.indexOf("inv-toolbar-chip"));
  assert.match(chip.slice(0, 200), /setProductId\(""\)/);
  assert.match(code, /const hatFilter = aktiveFilter > 0/);
});

/* ══════════ 6 — Designsystem ═════════════════════════════════════════════ */

test("26 — die neuen Flächen nutzen ausschließlich Foundation-Tokens", () => {
  const regeln = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const neu = regeln.slice(regeln.indexOf(".inv-section {"));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(neu), "Farbliteral in den neuen Regeln");
  assert.ok(!/rgba?\(/.test(neu), "freier Farbwert in den neuen Regeln");
  // Der Vorgriff steht INNERHALB der Klammer: `box-shadow:\s*(?!var\()` wäre
  // eine Falle — `\s*` fällt auf null Zeichen zurück, der Vorgriff sieht dann
  // das Leerzeichen statt „var(" und meldet jeden korrekten Tokenschatten.
  assert.ok(!/box-shadow:(?!\s*var\()/.test(neu), "freier Schatten in den neuen Regeln");
  for (const m of neu.matchAll(/border-radius:\s*([^;]+);/g)) {
    assert.ok(/var\(--ce-radius-/.test(m[1]), `freier Radius „${m[1].trim()}“`);
  }
});

test("27 — auch die neuen Bedienelemente erreichen unter 860 px 44 px", () => {
  const regeln = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const mobil = regeln.slice(regeln.lastIndexOf("@media (max-width: 860px)"));
  for (const k of ["inv-section-head", "inv-detail-actions .btn", "inv-lowstock .btn", "inv-toolbar-chip"]) {
    assert.ok(mobil.includes(`.${k}`), `${k} fehlt in der Trefferflächenregel`);
  }
});
