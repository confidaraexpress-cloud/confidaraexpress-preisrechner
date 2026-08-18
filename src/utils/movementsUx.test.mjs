// Bewegungen — die Bestands-Historie verständlich machen.
//
// Der Kern: die Seite erzeugt keine Funktionen, sie erklärt vorhandene Daten.
// Jede Zeile soll acht Fragen beantworten — was, wann, warum, wie viel, was
// blieb, wo, wodurch, wer.
//
// Zweiter Kern: **nichts vortäuschen.** Kein Filtertyp, den kein Codepfad
// erzeugt. Kein Link auf eine Seite, die es nicht gibt. Keine interne ID und
// keine Providerreferenz im sichtbaren Text. Kein Grund, der aus Typ oder Menge
// abgeleitet wäre.
//
// Dritter Kern: **Grund und Notiz sind zwei Dinge.** `reason` ist die
// strukturierte Ursache einer Korrektur, `note` freier Text des Erfassers. Bis
// zu dieser Fassung landete die Notiz in der Referenzspalte — eine echte
// semantische Vermischung.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MOVEMENT_TYPES, PRODUCIBLE_MOVEMENT_TYPES, movementTypeOptions, movementTypeView,
  movementReferenceView, movementNote, adjustmentReasonLabel, signedQuantity,
} from "./inventoryView.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const seite = lies("../pages/inventory/MovementsPage.jsx");
const shared = lies("../components/inventory/InventoryShared.jsx");
const css = lies("../styles/inventory.css");

/* „Darf NICHT vorkommen" läuft am kommentarfreien Quelltext — sonst schlägt die
   Prüfung an, sobald ein Kommentar die abgelöste Fassung erklärt. */
const ohneKommentare = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");

const code = ohneKommentare(seite);
const sharedCode = ohneKommentare(shared);

/* ══════════ A — Nur tatsächlich erzeugbare Typen im Filter ═══════════════ */

test("A1 erzeugbar sind genau die fünf Typen, die ein Codepfad schreibt", () => {
  assert.deepEqual([...PRODUCIBLE_MOVEMENT_TYPES],
    ["RECEIPT", "SHIPMENT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE"]);
});

test("A2 Rücknahme und Umlagerung stehen NICHT im Grundfilter", () => {
  const optionen = movementTypeOptions([]);
  for (const t of ["RETURN", "TRANSFER_IN", "TRANSFER_OUT"]) {
    assert.equal(optionen.includes(t), false, `${t} hat keinen Workflow und gehört nicht in den Filter`);
  }
  assert.equal(optionen.length, 5);
});

test("A3 ihre Beschriftung bleibt erhalten — eine Altzeile heißt nie „Unbekannt“", () => {
  assert.equal(movementTypeView("RETURN")[1], "Rücknahme");
  assert.equal(movementTypeView("TRANSFER_IN")[1], "Umlagerung Zugang");
  assert.equal(movementTypeView("TRANSFER_OUT")[1], "Umlagerung Abgang");
  assert.equal(MOVEMENT_TYPES.length, 8);
});

test("A4 kommt ein vorbereiteter Typ in den Daten vor, wird er filterbar", () => {
  const optionen = movementTypeOptions([{ type: "RETURN" }, { type: "RECEIPT" }]);
  assert.equal(optionen.includes("RETURN"), true, "historische Daten dürfen nicht unzugänglich werden");
  assert.equal(optionen.length, 6);
});

test("A5 die Reihenfolge folgt immer MOVEMENT_TYPES — der Filter springt nicht", () => {
  const optionen = movementTypeOptions([{ type: "TRANSFER_OUT" }, { type: "RETURN" }]);
  assert.deepEqual(optionen, ["RECEIPT", "SHIPMENT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE", "RETURN", "TRANSFER_OUT"]);
});

test("A6 ein unbekannter Serverwert wird nicht als Filteroption aufgenommen", () => {
  assert.deepEqual(movementTypeOptions([{ type: "IRGENDWAS" }]), [...PRODUCIBLE_MOVEMENT_TYPES]);
});

test("A7 die Seite speist den Filter aus den geladenen Zeilen", () => {
  assert.match(code, /const typOptionen = movementTypeOptions\(items\)/);
  assert.match(code, /typOptionen\.map\(\(t\) => <option/);
});

/* ══════════ B — Artikelfilter sichtbar und bedienbar ═════════════════════ */

test("B1 die Filterzeile trägt Artikel, Typ, Von und Bis", () => {
  const leiste = code.slice(code.indexOf('className="ce-toolbar inv-toolbar"'), code.indexOf("{loading &&"));
  assert.match(leiste, /<ProductFilterField/);
  assert.match(leiste, /htmlFor="inv-mv-type"/);
  assert.match(leiste, /htmlFor="inv-mv-from"/);
  assert.match(leiste, /htmlFor="inv-mv-to"/);
  assert.ok(leiste.indexOf("ProductFilterField") < leiste.indexOf("inv-mv-type"), "der Artikelfilter steht zuerst");
});

test("B2 die Suche nutzt die BESTEHENDE Artikelsuche, keine neue API", () => {
  assert.match(sharedCode, /getProducts\(\{ limit: 8, q: suchbegriff \}\)/);
  assert.doesNotMatch(sharedCode, /\/api\/kunde\/products/);
  assert.doesNotMatch(code, /getProducts/, "die Seite baut keine zweite Suche");
});

test("B3 die Auswahl setzt genau den vorhandenen productId-Filter", () => {
  assert.match(code, /const artikelWaehlen = \(p\) => \{ setProductId\(String\(p\.id\)\); setProductName\(p\.name \|\| ""\); \}/);
  assert.match(code, /productId: productId \|\| undefined/);
});

test("B4 der aktive Artikelfilter erscheint als abwählbarer Chip", () => {
  const chip = code.slice(code.indexOf("inv-toolbar-chip"));
  assert.match(chip.slice(0, 300), /setProductId\(""\)/);
  assert.match(chip.slice(0, 300), /Artikel: \{productName \|\| `#\$\{productId\}`\}/);
});

test("B5 der Startfilter aus anderen Seiten bleibt erhalten", () => {
  assert.match(code, /initialFilter && typeof initialFilter === "object" && initialFilter\.productId/);
  assert.match(code, /useState\(startArtikel\)/);
  // Der Startfilter wirkt genau einmal — danach gehört die Auswahl dem Nutzer.
  assert.match(code, /if \(initialFilter && onFilterApplied\) onFilterApplied\(\)/);
});

test("B6 ohne Treffer wird der Artikelname gezielt nachgeladen", () => {
  // Sonst stünde im Chip eine nackte „#100" — genau im unangenehmsten Fall:
  // eine leere Liste, deren Grund man nicht lesen kann.
  assert.match(code, /getProduct\(productId\)/);
  assert.match(code, /const ausZeilen = items\.find\(\(m\) => String\(m\.productId\) === String\(productId\)\)\?\.productName/);
});

test("B7 alle vier Filter wirken gemeinsam und lösen gemeinsam neu", () => {
  assert.match(code, /\}, \[type, productId, from, to\]\)/);
  const anfrage = code.slice(code.indexOf("const res = await getMovements"), code.indexOf("if (seq.current !== meins) return;"));
  for (const feld of ["type:", "productId:", "from:", "to:"]) {
    assert.ok(anfrage.includes(feld), `${feld} fehlt in der Anfrage`);
  }
});

test("B8 „Filter zurücksetzen“ erscheint erst ab zwei gesetzten Filtern", () => {
  assert.match(code, /const aktiveFilter = \[type, productId, from, to\]\.filter\(Boolean\)\.length/);
  assert.match(code, /\{aktiveFilter > 1 && \(/);
  assert.match(code, /const alleFilterWeg = \(\) => \{ setType\(""\); setProductId\(""\); setProductName\(""\); setFrom\(""\); setTo\(""\); \}/);
});

test("B9 kein eigener Datepicker und keine Kalenderbibliothek", () => {
  assert.match(code, /type="date"/);
  assert.doesNotMatch(code, /react-datepicker|flatpickr|dayjs|date-fns|moment/);
});

/* ══════════ C — Grund und Notiz getrennt ════════════════════════════════ */

test("C1 der Korrekturgrund erscheint als eigene Zeile am Typ", () => {
  assert.match(code, /const grund = adjustmentReasonLabel\(m\.reason\)/);
  assert.match(code, /\{grund && <div className="inv-cell-meta inv-mv-reason">\{grund\}<\/div>\}/);
});

test("C2 die Notiz ist als Notiz gekennzeichnet und steht getrennt", () => {
  assert.match(code, /\{notiz && <div className="inv-cell-meta inv-mv-note">Notiz: \{notiz\}<\/div>\}/);
});

test("C3 die Notiz steht NICHT mehr in der Referenzspalte", () => {
  // Bis zu dieser Fassung fiel `note` in die Referenzzelle — eine freie Notiz
  // wurde damit als Referenz ausgegeben.
  assert.doesNotMatch(code, /\(m\.note \|\| "—"\)/);
});

test("C4 ohne Grund und ohne Notiz entsteht keine leere Zeile", () => {
  assert.equal(adjustmentReasonLabel(null), null);
  assert.equal(adjustmentReasonLabel(undefined), null);
  assert.equal(movementNote({ note: null }), null);
  assert.equal(movementNote({ note: "   " }), null);
  assert.equal(movementNote({ note: " Lieferschein 4711 " }), "Lieferschein 4711");
});

test("C5 kein Grund wird aus Typ oder Menge abgeleitet", () => {
  assert.equal(adjustmentReasonLabel("stocktake"), "Inventurdifferenz");
  // Eine Altzeile ohne Grund bleibt ohne Grund — nichts wird erfunden.
  assert.equal(adjustmentReasonLabel(""), null);
  assert.doesNotMatch(code, /reason \|\| "|reason \?\? "/);
});

/* ══════════ D — Referenzen ══════════════════════════════════════════════ */

test("D1 ohne Referenz gibt es kein Anzeigemodell", () => {
  assert.equal(movementReferenceView({ referenceType: null }), null);
  assert.equal(movementReferenceView({}), null);
  assert.equal(movementReferenceView(null), null);
});

test("D2 eine Sendung zeigt die CE-Bestellnummer, nie die interne ID", () => {
  const r = movementReferenceView({ referenceType: "shipment", referenceId: "42", referenceNumber: "CE-2026-0007" });
  assert.deepEqual(r, { kind: "shipment", label: "Sendung", number: "CE-2026-0007", orderId: null });
  // orderId bleibt null: es gibt keine kundenseitige Sendungsdetailroute.
  assert.equal(r.orderId, null);
});

test("D3 ohne kundenseitige Nummer bleibt nur die Art der Referenz", () => {
  const r = movementReferenceView({ referenceType: "shipment", referenceId: "42", referenceNumber: null });
  assert.equal(r.number, null);
  assert.match(code, /reference\.number \? `\$\{reference\.label\} \$\{reference\.number\}` : reference\.label/);
});

test("D4 ein Auftrag wird verlinkt — dafür gibt es eine echte Detailseite", () => {
  const r = movementReferenceView({ referenceType: "order", referenceId: "500", referenceNumber: "CE-AU26-00001" });
  assert.deepEqual(r, { kind: "order", label: "Auftrag", number: "CE-AU26-00001", orderId: "500" });
  assert.match(code, /navigate\(`\/inventory\/orders\/\$\{reference\.orderId\}`\)/);
});

test("D5 die Sendungsreferenz wird NICHT verlinkt", () => {
  // Es gibt keine Route /shipments/:id und die Sendungsliste kennt keinen
  // Filter — ein Link landete auf einer ungefilterten Liste.
  const ref = code.slice(code.indexOf("function MovementReference"));
  assert.match(ref, /reference\.kind === "order" && reference\.number && reference\.orderId/);
  assert.doesNotMatch(ref, /page=shipments|\/shipments\//);
});

test("D6 keine internen Provider- oder Rohreferenzen im sichtbaren Text", () => {
  assert.doesNotMatch(code, /jumingo/i);
  // Die interne ID darf LINKZIEL sein, aber nie gerenderter Text: geprüft wird
  // deshalb nur, was zwischen zwei Tags steht.
  const sichtbar = [...code.matchAll(/>\s*\{([^}]+)\}\s*</g)].map((m) => m[1]);
  for (const ausdruck of sichtbar) {
    assert.doesNotMatch(ausdruck, /referenceId|reference\.orderId/, `interne ID im Text: ${ausdruck}`);
  }
});

/* ══════════ E — Zeile beantwortet die acht Fragen ═══════════════════════ */

test("E1 die Tabelle trägt genau die acht Spalten", () => {
  const kopf = code.slice(code.indexOf("<thead>"), code.indexOf("</thead>"));
  const spalten = [...kopf.matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map((m) => m[1].trim());
  assert.deepEqual(spalten, [
    "Zeitpunkt", "Artikel", "Typ", "Menge", "Bestand danach", "Lager", "Referenz", "Erfasst durch",
  ]);
});

test("E2 der Artikel ist verlinkt — Name führend, SKU darunter", () => {
  assert.match(code, /navigate\(`\/inventory\/products\/\$\{m\.productId\}`\)\}>\{m\.productName\}/);
  assert.match(code, /<span className="inv-cell-sku">\{m\.sku\}<\/span>/);
});

test("E3 „Bestand danach“ bleibt erhalten, „Bestand vorher“ kommt nicht dazu", () => {
  assert.match(code, /Bestand danach/);
  assert.doesNotMatch(code, /Bestand vorher|onHandBefore/);
});

test("E4 das Vorzeichen bleibt sichtbar — Farbe ist nur Unterstützung", () => {
  assert.equal(signedQuantity(16), "+16");
  assert.equal(signedQuantity(-5), "-5");
  assert.match(code, /signedQuantity\(m\.quantity\)/);
  assert.match(code, /Number\(m\.quantity\) < 0 \? " inv-num-out" : " inv-num-in"/);
});

/* ══════════ F — Actor korrekt benannt ══════════════════════════════════ */

test("F1 die Spalte heißt „Erfasst durch“, nicht „Benutzer“", () => {
  // Das Backend liefert COALESCE(company_name, name, email) des erfassenden
  // Kontos; ConfidaraExpress kennt je Firma genau einen Zugang. Dort steht
  // also das Konto, nicht eine handelnde Person.
  assert.match(code, /<th scope="col">Erfasst durch<\/th>/);
  assert.doesNotMatch(code, /<th scope="col">Benutzer<\/th>/);
  assert.doesNotMatch(code, /<dt>Benutzer<\/dt>/);
});

test("F2 es wird keine neue Benutzer-/Rollenarchitektur gebaut", () => {
  assert.doesNotMatch(code, /actor|employee|Mitarbeiter|rolle|role:/i);
});

/* ══════════ G — Zustände ═══════════════════════════════════════════════ */

test("G1 der leere Zustand nennt nur vorhandene Funktionen", () => {
  assert.match(code, /title="Noch keine Bestandsbewegungen vorhanden"/);
  assert.match(code, /Wareneingänge, Versand und Bestandskorrekturen erscheinen hier automatisch/);
  // Retouren und Umlagerungen gibt es nicht — sie dürfen hier nicht auftauchen.
  const leer = code.slice(code.indexOf("<EmptyState"), code.indexOf("</EmptyState>") + 1 || undefined);
  assert.doesNotMatch(leer.slice(0, 400), /Retoure|Umlagerung|Rücknahme/);
});

test("G2 der gefilterte Zustand behauptet nicht, es gäbe gar nichts", () => {
  assert.match(code, /title="Keine Bewegungen gefunden"/);
  assert.match(code, /Für die gewählten Filter gibt es keine Einträge/);
  assert.match(code, /onClick=\{alleFilterWeg\}>Filter zurücksetzen/);
});

test("G3 beide Zustände nutzen das bestehende StateView", () => {
  assert.match(code, /import \{ EmptyState, NoResultsState, ListSkeleton \} from "\.\.\/\.\.\/components\/ui\/StateView"/);
});

/* ══════════ H — Historie bleibt Historie ═══════════════════════════════ */

test("H1 keine Zeilenaktion zum Bearbeiten oder Löschen", () => {
  assert.doesNotMatch(code, /RowActionsMenu|Bearbeiten|Löschen|deleteMovement|updateMovement/);
});

test("H2 kein Export, kein Diagramm, keine Auswertung", () => {
  // `export default` ist das JS-Schlüsselwort, keine Exportfunktion — deshalb
  // wird die Modulzeile ausgenommen.
  const ohneModulsyntax = code.replace(/^export (default|const|function)\b/gm, "");
  assert.doesNotMatch(ohneModulsyntax, /CSV|Export|Chart|Diagramm|Report|Analytics/i);
});

test("H3 der Sperrbestand bleibt außen vor", () => {
  assert.doesNotMatch(code, /inventory_blocks|blockReason|getBlocks|Sperr/);
});

test("H4 die vorhandene Pagination wird weiterverwendet", () => {
  assert.match(code, /const PAGE_LIMIT = 25/);
  assert.match(code, /nextCursor/);
  assert.match(code, /Weitere Bewegungen laden/);
});

/* ══════════ I — Oberfläche ═════════════════════════════════════════════ */

test("I1 der Seitentext ist eine natürliche Aufforderung", () => {
  assert.match(code, /subtitle="Alle physischen Bestandsänderungen mit Zeitpunkt, Menge, Grund und Referenz nachvollziehen\."/);
});

test("I2 die Badgefarben tragen Bedeutung und bleiben gedeckt", () => {
  assert.equal(movementTypeView("RECEIPT")[0], "badge--success");
  assert.equal(movementTypeView("SHIPMENT")[0], "badge--info");
  assert.equal(movementTypeView("ADJUSTMENT_IN")[0], "badge--neutral");
  assert.equal(movementTypeView("ADJUSTMENT_OUT")[0], "badge--neutral");
  assert.equal(movementTypeView("DAMAGE")[0], "badge--warning");
  // Kein Fehlerrot: eine Beschädigung ist eine Bestandslage, kein Systemfehler.
  assert.equal(movementTypeView("DAMAGE")[0] === "badge--error", false);
});

test("I3 die neuen Regeln tragen keine eigenen Farb-, Radius- oder Schattenwerte", () => {
  const regeln = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const neu = regeln.slice(regeln.indexOf(".inv-toolbar-reset"));
  assert.doesNotMatch(neu, /#[0-9a-fA-F]{3,8}\b/);
  assert.doesNotMatch(neu, /rgba?\(/);
  assert.doesNotMatch(neu, /box-shadow:(?!\s*var\()/);
  for (const m of neu.matchAll(/border-radius:\s*([^;]+);/g)) {
    assert.match(m[1], /var\(--ce-radius-/);
  }
});

test("I4 die Trefferliste ist beschriftet und tastaturbedienbar", () => {
  assert.match(sharedCode, /<label className="field-label" htmlFor=\{id\}>\{label\}<\/label>/);
  assert.match(sharedCode, /role="combobox"/);
  assert.match(sharedCode, /aria-expanded=\{open\}/);
  assert.match(sharedCode, /role="listbox"/);
  assert.match(sharedCode, /role="option"/);
  assert.match(sharedCode, /e\.key === "Escape"/);
  // Echte Buttons, kein klickbares div.
  const liste = sharedCode.slice(sharedCode.indexOf("inv-productfilter-list"));
  assert.doesNotMatch(liste.slice(0, 900), /<div[^>]*onClick/);
});

test("I5 die Trefferliste schwebt und wird nicht abgeschnitten", () => {
  const block = css.slice(css.indexOf(".inv-productfilter {"));
  assert.match(block.slice(0, 600), /position: relative/);
  assert.match(block.slice(0, 600), /position: absolute/);
  assert.match(block.slice(0, 600), /z-index: \d+/);
});

test("I6 die neuen Bedienelemente erreichen unter 860 px 44 px", () => {
  const mobil = css.slice(css.lastIndexOf("@media (max-width: 860px)"));
  assert.match(mobil, /\.inv-productfilter-list \.inv-picker-item/);
  assert.match(mobil, /\.inv-toolbar-reset/);
});

test("I7 die lange Notiz wird gedeckelt, statt die Tabelle zu verbreitern", () => {
  const block = css.slice(css.indexOf(".inv-mv-note"));
  assert.match(block.slice(0, 300), /line-clamp/);
  assert.match(block.slice(0, 300), /max-width/);
});
