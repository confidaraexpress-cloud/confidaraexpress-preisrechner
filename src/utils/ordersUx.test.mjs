// Auftragsbereich — Liste und Detailseite.
//
// Der Kern: die drei Zahlen einer Auftragszeile zählen NICHT dasselbe.
// `itemCount` ist ein COUNT über die Auftragspositionen, `openQuantity` und
// `shippedQuantity` sind SUMMEN über Mengen (routes/orders.js,
// ORDER_AGGREGATE_JOIN). Nebeneinander gestellt liest man „1 / 1 / 0" leicht
// als dreimal Positionen — deshalb sagen die Spaltenköpfe und die
// Zusammenfassung ausdrücklich „Einheiten".
//
// Zweiter Kern: genau EIN Weg je Ziel. Die Auftragsnummer ist bereits der Link
// auf die Detailseite; ein zusätzlicher „Öffnen"-Knopf in derselben Zeile ist
// keine Wahlfreiheit, sondern Rauschen.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dateShort, orderSummary, positionLabel, unitLabel } from "./inventoryView.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const listPage = lies("../pages/inventory/OrdersPage.jsx");
const detailPage = lies("../pages/inventory/OrderDetailPage.jsx");
const dashboard = lies("../pages/DashboardPage.jsx");
const css = lies("../styles/inventory.css");

/* „Darf NICHT vorkommen" läuft am kommentarfreien Quelltext — sonst schlägt die
   Prüfung an, sobald ein Kommentar die abgelöste Fassung erklärt. */
const ohneKommentare = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");

const listCode = ohneKommentare(listPage);
const detailCode = ohneKommentare(detailPage);

/* ══════════ A — Zusammenfassung: Semantik und Grammatik ═══════════════════ */

test("A1 der Satz nennt Positionen, reservierte und versendete Einheiten", () => {
  assert.equal(
    orderSummary({ itemCount: 3, openQuantity: 7, shippedQuantity: 2 }),
    "3 Positionen · 7 Einheiten reserviert · 2 versendet"
  );
});

test("A2 Singular: „1 Position“ und „1 Einheit“ — nie mit Plural-n", () => {
  assert.equal(
    orderSummary({ itemCount: 1, openQuantity: 1, shippedQuantity: 0 }),
    "1 Position · 1 Einheit reserviert · 0 versendet"
  );
});

test("A3 die Einheit steht bewusst nur einmal", () => {
  // „7 Einheiten reserviert · 2 versendet" — die zweite Zahl erbt die Einheit.
  const satz = orderSummary({ itemCount: 2, openQuantity: 7, shippedQuantity: 2 });
  assert.equal((satz.match(/Einheit/g) || []).length, 1);
});

test("A4 null erscheint nie als Zahl", () => {
  // Fehlt ein Wert, fehlt sein Satzteil — es wird keine 0 erfunden.
  assert.equal(orderSummary({ itemCount: 2 }), "2 Positionen");
  assert.equal(orderSummary({}), null);
  assert.equal(orderSummary(null), null);
});

test("A5 null Positionen und null Einheiten sind gültige Aussagen", () => {
  assert.equal(orderSummary({ itemCount: 0, openQuantity: 0, shippedQuantity: 0 }),
    "0 Positionen · 0 Einheiten reserviert · 0 versendet");
});

test("A6 die beiden Bausteine sind eigenständig grammatikalisch korrekt", () => {
  assert.equal(positionLabel(1), "1 Position");
  assert.equal(positionLabel(2), "2 Positionen");
  assert.equal(unitLabel(1), "1 Einheit");
  assert.equal(unitLabel(5), "5 Einheiten");
  assert.equal(unitLabel(null), "—");
});

test("A7 große Zahlen bleiben deutsch formatiert", () => {
  assert.match(orderSummary({ itemCount: 1200, openQuantity: 3400, shippedQuantity: 0 }), /1\.200 Positionen/);
  assert.match(orderSummary({ itemCount: 1, openQuantity: 3400, shippedQuantity: 0 }), /3\.400 Einheiten/);
});

/* ══════════ B — Auftragsliste ═════════════════════════════════════════════ */

test("B1 die Auftragsnummer ist der Link auf die Detailseite", () => {
  const treffer = listPage.match(/navigate\(`\/inventory\/orders\/\$\{o\.id\}`\)/g) || [];
  assert.equal(treffer.length, 2, "Tabelle UND Karte brauchen den Link — und sonst nichts");
});

test("B2 der redundante „Öffnen“-Knopf ist weg", () => {
  assert.doesNotMatch(listCode, />Öffnen</, "zweiter Weg zum selben Ziel in derselben Zeile");
});

test("B3 „Versand vorbereiten“ bleibt die primäre Zeilenaktion", () => {
  assert.match(listPage, /className="btn btn-sm btn-primary"[\s\S]{0,200}?Versand vorbereiten/);
  // Genau eine primäre Aktion je Zeile — in Tabelle und Karte.
  assert.equal((listPage.match(/btn-sm btn-primary/g) || []).length, 2);
});

test("B4 kein künstliches Zeilenmenü", () => {
  // Nach dem Entfernen von „Öffnen" bleibt genau eine Zeilenaktion. Ein Menü
  // nur für einen einzigen weiteren Eintrag wäre Selbstzweck; „Stornieren"
  // bleibt bewusst auf der Detailseite.
  assert.doesNotMatch(listCode, /RowActionsMenu/);
  assert.doesNotMatch(listCode, /stornieren|cancelOrder/i);
});

test("B5 die Mengenspalten sagen, dass sie Einheiten zählen", () => {
  for (const kopf of ["Positionen", "Reservierte Einheiten", "Versendete Einheiten"]) {
    assert.ok(listPage.includes(`<th scope="col" className="ce-num">${kopf}</th>`), `Spaltenkopf ${kopf} fehlt`);
  }
  // Auch in der Mobilkarte, wo dieselbe Verwechslung möglich ist.
  assert.match(listPage, /<dt>Reservierte Einheiten<\/dt>/);
  assert.match(listPage, /<dt>Versendete Einheiten<\/dt>/);
});

test("B6 die Spalten hängen an den richtigen Feldern", () => {
  // itemCount = COUNT der Positionen · openQuantity/shippedQuantity = Mengen.
  assert.match(listPage, /Positionen<\/th>/);
  assert.match(listPage, /\{formatUnits\(o\.itemCount\)\}/);
  assert.match(listPage, /\{formatUnits\(o\.openQuantity\)\}/);
  assert.match(listPage, /\{formatUnits\(o\.shippedQuantity\)\}/);
});

test("B7 der Seitentext kommt ohne Lagerfachsprache aus", () => {
  for (const wort of ["Kommissionier", "Fulfillment", "Picking", "Allocation"]) {
    assert.ok(!listCode.includes(wort), `${wort} steht noch im sichtbaren Text`);
  }
  assert.match(listPage, /subtitle="Verwalten Sie Aufträge mit Artikeln und bereiten Sie daraus direkt Sendungen vor\."/);
});

test("B8 Suche und Statusfilter bleiben unverändert", () => {
  assert.match(listPage, /placeholder="Auftragsnummer, Referenz oder Empfänger"/);
  const optionen = [...listPage.matchAll(/<option value="([^"]*)">([^<]+)<\/option>/g)].map((m) => [m[1], m[2]]);
  assert.deepEqual(optionen, [
    ["", "Alle"], ["open", "Offen"], ["partially_shipped", "Teilweise versendet"],
    ["shipped", "Versendet"], ["cancelled", "Storniert"],
  ]);
});

test("B9 der leere Zustand erklärt den Auftrag und nennt den Weg ohne ihn", () => {
  assert.match(listPage, /title="Noch keine Aufträge vorhanden"/);
  assert.match(listPage, /Erstellen Sie einen Auftrag, wenn Sie Artikel für einen Empfänger reservieren/);
  assert.match(listPage, /Auftrag erstellen<\/button>/);
  assert.match(listPage, /Neue Sendung ohne Auftrag/);
  // Der zweite Weg ist bewusst dezent (Textlink), nicht die zweite Hauptaktion.
  assert.match(listPage, /secondaryAction=\{onNavigate && \(\s*<button type="button" className="btn btn-link"/);
});

test("B10 der Navigationsprop wird tatsächlich hereingereicht", () => {
  // Ohne ihn bliebe der zweite Weg im leeren Zustand unsichtbar.
  const block = dashboard.slice(dashboard.indexOf("<OrdersPage"), dashboard.indexOf("/>", dashboard.indexOf("<OrdersPage")));
  assert.match(block, /onNavigate=\{navigateTo\}/);
});

/* ══════════ C — Auftragsdetail ════════════════════════════════════════════ */

test("C1 die Zusammenfassung steht im Seitenkopf, nicht als Kennzahlkarten", () => {
  assert.match(detailPage, /const zusammenfassung = orderSummary\(o\)/);
  assert.match(detailPage, /<span className="inv-order-summary">\{zusammenfassung\}<\/span>/);
  assert.match(css, /\.inv-order-summary \{/);
  // Keine zweite Kennzahlfläche auf der Seite.
  assert.doesNotMatch(detailCode, /inv-stat-grid|inv-detail-stock/);
});

test("C2 der Empfänger zeigt den Ländernamen, nicht den ISO-Code", () => {
  assert.match(detailPage, /countryName\(o\.recipient\.country\)/);
  // Auch in der Liste — ein Rohcode ist an beiden Stellen derselbe Fehler.
  assert.equal((listPage.match(/countryName\(o\.recipient\.country\)/g) || []).length, 2,
    "Tabelle UND Karte brauchen den Ländernamen");
  // Vorhandener Auflöser — keine zweite Länderdatenquelle.
  assert.match(detailPage, /from "\.\.\/\.\.\/utils\/calculatorValidation\.mjs"/);
});

test("C2b beide Seiten formatieren das Datum gleich", () => {
  // `toLocaleDateString("de-DE")` allein liefert „18.8.2026" — im selben Modul
  // steht dateTimeShort() mit zweistelligen Feldern. Ein gemeinsamer Helfer
  // statt zweier lokaler Ad-hoc-Formatierer.
  assert.equal(dateShort("2026-08-18T09:00:00Z"), "18.08.2026");
  assert.equal(dateShort(null), "—");
  assert.equal(dateShort("kein Datum"), "—");
  assert.match(listPage, /\{dateShort\(o\.createdAt\)\}/);
  assert.match(detailPage, /dateShort as dDE/);
  assert.doesNotMatch(detailCode, /toLocaleDateString\("de-DE"\)/);
  assert.doesNotMatch(listCode, /toLocaleDateString\("de-DE"\)/);
});

test("C3 Grundstruktur und Positionstabelle bleiben erhalten", () => {
  for (const titel of ["Empfänger", "Positionen", "Verbundene Sendungen"]) {
    assert.ok(detailPage.includes(`<h2 className="inv-section-title">${titel}</h2>`), `Abschnitt ${titel} fehlt`);
  }
  for (const spalte of ["SKU", "Artikel", "Bestellt", "Reserviert", "Versendet", "Stückgewicht"]) {
    assert.ok(detailPage.includes(`>${spalte}</th>`), `Positionsspalte ${spalte} fehlt`);
  }
  assert.match(detailPage, /<dt>Lager<\/dt>/);
  assert.match(detailPage, /<dt>Erstellt<\/dt>/);
});

test("C4 der Artikelname bleibt klickbar", () => {
  assert.match(detailPage, /navigate\(`\/inventory\/products\/\$\{it\.productId\}`\)/);
});

test("C5 der Hinweis unter den Positionen erklärt „reserviert“ ohne Jargon", () => {
  assert.match(detailPage, /Reservierte Ware liegt weiterhin im Lager/);
  assert.match(detailPage, /Aus dem Lager entfernt wird sie erst mit der Buchung der Sendung/);
  assert.doesNotMatch(detailCode, /Ausgebucht/);
});

test("C6 Storno bleibt auf der Detailseite und bleibt bestätigungspflichtig", () => {
  assert.match(detailPage, />Auftrag stornieren<\/button>/);
  assert.match(detailPage, /className="btn btn-danger"/);
  assert.match(detailPage, /stornierbar = o && o\.status !== "cancelled" && o\.status !== "shipped"/);
});

test("C7 „Versand vorbereiten“ bleibt die Hauptaktion des Kopfes", () => {
  // Vom LETZTEN PageHeader vor dem Inhalt aus schneiden: der erste gehört zum
  // „Auftrag nicht gefunden"-Zweig, und dessen ErrorState trägt einen eigenen
  // Primary-Knopf („Zur Auftragsliste"). Ein globales indexOf zählte ihn mit.
  const ende = detailPage.indexOf("<InlineError");
  const kopf = detailPage.slice(detailPage.lastIndexOf("<PageHeader", ende), ende);
  assert.match(kopf, /className="btn btn-primary"[\s\S]{0,160}?Versand vorbereiten/);
  assert.equal((kopf.match(/btn btn-primary/g) || []).length, 1, "genau eine Hauptaktion im Kopf");
});

/* ══════════ D — Verbundene Sendungen ══════════════════════════════════════ */

test("D1 mehrere Sendungen je Auftrag sind darstellbar", () => {
  // Teilversand: der Auftrag hält keine Sendungsreferenz, die Liste wird
  // gemappt. Nirgends darf „1 Auftrag = 1 Sendung" unterstellt werden.
  assert.match(detailPage, /data\.shipments\.map\(\(s\) =>/);
  assert.doesNotMatch(detailCode, /shipments\[0\]/);
});

test("D2 leerer Zustand ohne zweite Hauptaktion", () => {
  assert.match(detailPage, /Für diesen Auftrag wurde noch keine Sendung gebucht\./);
  // Der Primary-CTA steht bereits im Seitenkopf — kein zweiter daneben.
  const abschnitt = detailPage.slice(detailPage.indexOf("Verbundene Sendungen"));
  assert.doesNotMatch(abschnitt, /btn-primary/);
});

test("D3 Auftragsstatus und Sendungsstatus bleiben getrennt", () => {
  // Der Auftrag nutzt orderStatusView, die Sendung das BESTEHENDE StatusBadge.
  assert.match(detailPage, /import \{ StatusBadge \}/);
  assert.match(detailPage, /<StatusBadge status=\{s\.status\} \/>/);
  assert.match(detailPage, /orderStatusView\(o\.status\)/);
  // Kein Trackingstatus als Auftragsstatus und keine dritte Statusabbildung.
  assert.doesNotMatch(detailCode, /trackingStatus/);
});

test("D4 der Weg zu Label und Sendungsverfolgung ist ein echter Link", () => {
  // Eine eigene Route je Sendung gibt es kundenseitig nicht — der Link führt
  // deshalb auf die bestehende Sendungsliste, nicht auf eine erfundene Seite.
  assert.match(detailPage, /navigate\("\/dashboard\?page=shipments"\)/);
  assert.doesNotMatch(detailCode, /\/shipments\/\$\{/);
});

test("D5 keine Providerinformationen zusätzlich offengelegt", () => {
  for (const feld of ["jumingo", "Jumingo", "providerReference", "shipperTariffId"]) {
    assert.ok(!detailPage.includes(feld), `${feld} taucht in der Auftragsdetailseite auf`);
  }
});
