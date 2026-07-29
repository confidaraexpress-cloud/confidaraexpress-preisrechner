// Admin-Sendungsverwaltung (Liste + Detail) — Tests.
//
// Zwei Ebenen (wie im Repo etabliert — es gibt bewusst keine React-Render-
// Testinfrastruktur):
//   A) Verhalten: die reine Logik aus utils/adminShipmentView.mjs wird direkt
//      ausgeführt (Feldlesung, Nummern, Serviceart, Filter, Leerzustände,
//      Abschnitts-Sichtbarkeit, Fehlerzustände).
//   B) Contract: der Quelltext der beteiligten Seiten wird geprüft — überall
//      dort, wo die Aussage am Rendering oder am Request hängt.
// Ein Selbsttest am Ende stellt sicher, dass die Prüflogik greift.
//
// Run: node --test src/utils/adminShipmentView.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  EMPTY_SHIPMENT_FILTERS,
  HAS_TRACKING_OPTIONS,
  SHIPMENT_STATUS_FILTER_OPTIONS,
  activeShipmentFilterChips,
  customerIdentity,
  detailSections,
  hasActiveShipmentFilters,
  hasShippingMode,
  isCustomsRelevant,
  packageLabel,
  priceDisplay,
  routeLabel,
  shipmentDetailError,
  shipmentEmptyState,
  shipmentFields,
  shipmentIdentity,
  shipmentMarkers,
  shipmentRouteLine,
  shippingModeLabel,
  toShipmentApiFilters,
  validateShipmentFilters,
} from "./adminShipmentView.mjs";
import { shipmentStatusMeta, SHIPMENT_STATUS_OPTIONS } from "./adminShipments.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..");
const read = (rel) => readFileSync(join(SRC, rel), "utf8");
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const listSrc   = stripComments(read("pages/admin/AdminShipmentsPage.jsx"));
const detailSrc = stripComments(read("pages/admin/AdminShipmentDetailPage.jsx"));
const cssSrc    = read("styles/admin.css");
const viewSrc   = stripComments(read("utils/adminShipmentView.mjs"));

// Beispielsendungen — exakt nach Backend-Vertrag (routes/admin.js).
const BOOKED = {
  id: 683, user_id: 42, status: "label_ready", service_type: "pickup", selected_carrier: "ups",
  from_country: "DE", to_country: "GB", price_final: "49.25", package_count: 1,
  created_at: "2026-07-20T10:00:00.000Z", tracking_status: "in_transit",
  has_tracking: true, label_available: true, business_order_number: "CE-BS26-00042",
  masked_tracking_number: "••••6784", masked_jumingo_shipment_id: "••••8877",
  customer_company: "Borner Spedition GmbH", customer_number: "CE-K-10031",
};
const DRAFT  = { id: 684, user_id: 42, status: "draft", from_country: "DE", to_country: "DE",
  created_at: "2026-07-21T09:00:00.000Z", has_tracking: false, label_available: false,
  customer_company: "Borner Spedition GmbH", customer_number: "CE-K-10031" };
const LEGACY = { id: 686, user_id: 42, status: "booked", created_at: "2024-01-01T09:00:00.000Z",
  has_tracking: false, label_available: false };
const INLAND = { id: 685, user_id: 42, status: "booked", service_type: "dropoff", selected_carrier: "dpd",
  from_country: "DE", to_country: "DE", price_final: "12.90", package_count: 2,
  created_at: "2026-07-22T09:00:00.000Z", has_tracking: false, label_available: false,
  customer_company: "Borner Spedition GmbH", customer_number: "CE-K-10031" };
const CUSTOMS = { ...BOOKED, id: 687, to_country: "CH", goods_value: "250.00", label_available: false };

// ═══ A) Feldlesung, Nummern, Kunde ═══════════════════════════════════════════

test("1 — Felder werden nur aus erlaubten Schlüsseln gelesen", () => {
  const f = shipmentFields(BOOKED);
  assert.equal(f.id, 683);
  assert.equal(f.status, "label_ready");
  assert.equal(f.carrier, "ups");
  assert.equal(f.priceFinal, 49.25);
  assert.equal(f.businessOrderNumber, "CE-BS26-00042");
  assert.equal(f.customerCompany, "Borner Spedition GmbH");
  assert.equal(f.hasTracking, true);
  assert.equal(f.labelAvailable, true);
  // Leere/fehlende Eingaben kippen nie in undefined-Zugriffe.
  const empty = shipmentFields(undefined);
  assert.equal(empty.id, null);
  assert.equal(empty.status, "");
  assert.equal(empty.priceFinal, null);
  assert.equal(empty.hasTracking, false);
});

test("2 — die Sendungskennung nutzt die Bestellnummer, erfindet aber nie eine", () => {
  assert.deepEqual(shipmentIdentity(BOOKED), { primary: "CE-BS26-00042", kind: "order_number" });
  // Entwurf ohne Nummer → ehrlicher Zustand statt „—" oder erfundener Nummer.
  assert.deepEqual(shipmentIdentity(DRAFT), { primary: "Entwurf", kind: "draft" });
  // Gebuchte Alt-Sendung ohne Nummer → ebenfalls ehrlich benannt.
  assert.deepEqual(shipmentIdentity(LEGACY), { primary: "Ohne Bestellnummer", kind: "missing" });
  // Nie aus der internen ID abgeleitet.
  for (const row of [DRAFT, LEGACY]) {
    assert.equal(shipmentIdentity(row).primary.includes(String(row.id)), false,
      "die interne ID darf nie als Nummer erscheinen");
  }
  assert.equal(/CE-BS\$\{|`CE-BS/.test(viewSrc), false, "keine Nummer im Code konstruiert");
});

test("3 — der Kunde wird fachlich dargestellt, nie als user_id", () => {
  assert.deepEqual(customerIdentity(BOOKED), { primary: "Borner Spedition GmbH", secondary: "CE-K-10031", known: true });
  // Nur Kundennummer vorhanden → diese wird primär.
  assert.deepEqual(customerIdentity({ customer_number: "CE-K-9" }), { primary: "CE-K-9", secondary: "", known: true });
  // Nicht auflösbar → ehrlich benennen, NICHT die user_id zeigen.
  const unknown = customerIdentity(LEGACY);
  assert.equal(unknown.known, false);
  assert.equal(unknown.primary, "Kunde nicht auflösbar");
  assert.equal(unknown.primary.includes("42"), false, "die user_id darf nicht als Identität dienen");
});

// ═══ B) Serviceart, Route, Preis, Marker ═════════════════════════════════════

test("4 — die Versandart wird fachlich genau benannt statt pauschal „Unbekannt“", () => {
  // service_type kennt laut Backend NUR pickup | dropoff | NULL.
  assert.equal(shippingModeLabel(BOOKED), "Abholung");
  assert.equal(shippingModeLabel(INLAND), "Paketshop");
  // Entwurf: noch nicht gewählt — nicht „Unbekannt".
  assert.equal(shippingModeLabel(DRAFT), "Noch nicht gewählt");
  // Gebuchte Alt-Sendung ohne Wert: ehrlich als nicht gespeichert.
  assert.equal(shippingModeLabel(LEGACY), "Versandart nicht gespeichert");
  for (const row of [DRAFT, LEGACY]) {
    assert.equal(shippingModeLabel(row), shippingModeLabel(row));
    assert.equal(/Unbekannt/.test(shippingModeLabel(row)), false, "Unbekannt ist kein zulaessiger Text mehr");
  }
  assert.equal(hasShippingMode(BOOKED), true);
  assert.equal(hasShippingMode(LEGACY), false);
  // Der Carriername wird NIE als Serviceart missbraucht.
  assert.equal(shippingModeLabel(LEGACY).toLowerCase().includes("ups"), false);
});

test("5 — Route, Paketanzahl und Versandzeile", () => {
  assert.equal(routeLabel(BOOKED), "DE → GB");
  assert.equal(routeLabel(LEGACY), "", "ohne Länder keine Route");
  assert.equal(packageLabel(BOOKED), "1 Paket");
  assert.equal(packageLabel(INLAND), "2 Pakete");
  assert.equal(packageLabel(LEGACY), "");
  assert.equal(shipmentRouteLine(BOOKED), "DE → GB · 1 Paket");
  assert.equal(shipmentRouteLine(LEGACY), "");
});

test("6 — der Preis wird nur angezeigt, nie berechnet", () => {
  const p = priceDisplay(BOOKED);
  assert.equal(p.known, true);
  assert.equal(p.value, 49.25);
  // Entwurf: noch nicht berechnet — kein 0,00 €, keine Ersatzzahl.
  assert.deepEqual(priceDisplay(DRAFT), { value: null, text: "Noch nicht berechnet", known: false });
  assert.deepEqual(priceDisplay(LEGACY), { value: null, text: "Kein Preis gespeichert", known: false });
  // Im Modul wird nirgends gerechnet.
  assert.equal(/price[^\n]*[*+/]\s*\d|\*\s*1\.19|vat|mwst/i.test(viewSrc), false,
    "keine Preisberechnung im Frontend");
});

test("7 — Tracking und Label erscheinen kompakt als Marker, nicht als Ja/Nein-Spalten", () => {
  assert.deepEqual(shipmentMarkers(BOOKED).map((m) => m.key), ["tracking", "label"]);
  assert.deepEqual(shipmentMarkers(INLAND), [], "ohne Tracking/Label keine Marker");
  assert.deepEqual(shipmentMarkers(CUSTOMS).map((m) => m.key), ["tracking"]);
  // Die Liste hat keine eigenen Tracking-/Label-Spalten mehr.
  const headers = (listSrc.match(/<th scope="col"[^>]*>([^<]+)<\/th>/g) || [])
    .map((h) => h.replace(/<[^>]+>/g, "").trim());
  for (const gone of ["Tracking", "Label", "Tracking-Nr.", "JUMiNGO-ID"]) {
    assert.equal(headers.includes(gone), false, `Spalte „${gone}" muss entfallen sein`);
  }
});

// ═══ C) Liste: Spalten, Navigation, Responsive ═══════════════════════════════

test("8 — die Haupttabelle zeigt genau die sechs Übersichtsspalten", () => {
  const headers = (listSrc.match(/<th scope="col"[^>]*>([^<]+)<\/th>/g) || [])
    .map((h) => h.replace(/<[^>]+>/g, "").trim());
  assert.deepEqual(headers, ["Sendung", "Kunde", "Versand", "Status", "Preis", "Aktion"]);
  const body = listSrc.slice(listSrc.indexOf("<tbody>"), listSrc.indexOf("</tbody>"));
  assert.equal((body.match(/<td[\s>]/g) || []).length, 6, "Zellen müssen zu den Spaltenköpfen passen");
});

test("9 — die interne Sendungs-ID ist nicht mehr die Navigation", () => {
  assert.equal(/adm-idlink/.test(listSrc), false, "der kleine ID-Link ist entfallen");
  // Navigation über Bestellnummer UND einen sichtbaren Details-Button.
  assert.match(listSrc, /<Link className=\{`adm-ship-no\$\{muted \? " adm-ship-no-muted" : ""\}`\} to=\{detailPath\(f\.id\)\}>/);
  assert.match(listSrc, /<Link className="btn btn-outline btn-sm" to=\{detailPath\(f\.id\)\}>Details<\/Link>/);
  assert.match(listSrc, /const detailPath = \(id\) => `\/admin\/shipments\/\$\{encodeURIComponent\(id\)\}`;/);
  // Der Kunde verlinkt ins Kundendetail.
  assert.match(listSrc, /to=\{`\/admin\/users\/\$\{encodeURIComponent\(f\.userId\)\}`\}/);
});

test("10 — kein horizontales Scrollen: relative Spaltenbreiten, kein min-width", () => {
  assert.match(cssSrc, /\.adm-ships-table table \{ min-width: 0; table-layout: fixed; \}/);
  const widths = cssSrc.match(/\.adm-ships-table th:nth-child\(\d\)[^{]*\{ width: (\d+)%; \}/g) || [];
  assert.equal(widths.length, 6, "alle sechs Spalten haben relative Breiten");
  const sum = widths.map((w) => Number(w.match(/(\d+)%/)[1])).reduce((a, b) => a + b, 0);
  assert.equal(sum, 100, `Spaltenbreiten müssen 100 % ergeben, sind ${sum}`);
  // Kein Scroll-Wrapper mehr um die Sendungstabelle.
  assert.equal(/adm-ships-table[\s\S]{0,120}table-scroll/.test(listSrc), false);
  // Lange Werte brechen kontrolliert.
  assert.match(cssSrc, /\.adm-ship-no \{[^}]*overflow-wrap: anywhere;/);
  assert.match(cssSrc, /\.adm-ship-cust-name \{[^}]*overflow-wrap: anywhere;/);
});

test("11 — mobile Kartenansicht ersetzt die Tabelle", () => {
  assert.match(listSrc, /<ul className="adm-ships-cards">/);
  for (const m of [/<dt>Kunde<\/dt>/, /<dt>Versand<\/dt>/, /<dt>Preis<\/dt>/]) assert.match(listSrc, m);
  assert.match(listSrc, /<div className="adm-scard-head">\s*<ShipmentCell row=\{row\} \/>\s*<StatusCell row=\{row\} \/>/);
  assert.match(cssSrc, /@media \(max-width: 900px\) \{[\s\S]*?\.adm-ships-table \{ display: none; \}/);
  assert.match(cssSrc, /\.adm-ships-cards \{ display: none;/);
  assert.match(cssSrc, /\.adm-scard-actions \.btn \{ min-height: 40px;/);
});

// ═══ D) Filter ═══════════════════════════════════════════════════════════════

test("12 — es werden ausschließlich belegte Backend-Filter gesendet", () => {
  assert.deepEqual(toShipmentApiFilters(EMPTY_SHIPMENT_FILTERS), {}, "leere Filter senden nichts");
  assert.deepEqual(
    toShipmentApiFilters({ user_id: " 42 ", status: "booked", carrier: "ups", created_from: "2026-01-01", created_to: "2026-12-31", has_tracking: "yes" }),
    { user_id: "42", status: "booked", carrier: "ups", created_from: "2026-01-01", created_to: "2026-12-31", has_tracking: "true" },
  );
  assert.deepEqual(toShipmentApiFilters({ ...EMPTY_SHIPMENT_FILTERS, has_tracking: "no" }), { has_tracking: "false" });
  // Keine erfundenen Parameter — nur die im Backend allowlisteten.
  const allowed = new Set(["user_id", "status", "carrier", "created_from", "created_to", "has_tracking"]);
  for (const k of Object.keys(toShipmentApiFilters({ user_id: "1", status: "booked", carrier: "x", created_from: "2026-01-01", created_to: "2026-01-02", has_tracking: "yes" }))) {
    assert.ok(allowed.has(k), `unerwarteter Query-Parameter: ${k}`);
  }
  // Insbesondere keine vorgetäuschte Freitextsuche.
  assert.equal(/\b(q|search|query|term)\s*[:=]/.test(viewSrc), false, "keine erfundene Suchschnittstelle");
  assert.match(listSrc, /Es gibt keine Freitextsuche/, "das Fehlen der Suche wird ehrlich benannt");
});

test("13 — der Statusfilter nutzt exakt die vier belegten Sendungsstatus", () => {
  const values = SHIPMENT_STATUS_FILTER_OPTIONS.map((o) => o.value).filter(Boolean);
  assert.deepEqual(values, ["draft", "booking", "booked", "label_ready"]);
  // Deckungsgleich mit dem bestehenden Statusmapping — keine erfundenen Werte.
  assert.deepEqual([...values].sort(), [...SHIPMENT_STATUS_OPTIONS].sort());
  for (const o of SHIPMENT_STATUS_FILTER_OPTIONS.filter((x) => x.value)) {
    assert.equal(shipmentStatusMeta(o.value)[1], o.label, `Badge und Filter müssen für ${o.value} gleich heißen`);
  }
  // Keine Storno-Status: Storno ist eine eigene Ressource, kein Sendungsstatus.
  assert.equal(/Storniert|Stornierung angefragt|Fehlgeschlagen/.test(JSON.stringify(SHIPMENT_STATUS_FILTER_OPTIONS)), false);
  assert.deepEqual(HAS_TRACKING_OPTIONS.map((o) => o.value), ["all", "yes", "no"]);
});

test("14 — der Datumsbereich wird validiert", () => {
  assert.deepEqual(validateShipmentFilters({ created_from: "2026-01-01", created_to: "2026-12-31" }), { valid: true, error: "" });
  const bad = validateShipmentFilters({ created_from: "2026-12-31", created_to: "2026-01-01" });
  assert.equal(bad.valid, false);
  assert.match(bad.error, /„Von“ darf nicht nach „Bis“ liegen/);
  // Nur „Von" oder nur „Bis" ist zulässig.
  assert.equal(validateShipmentFilters({ created_from: "2026-01-01" }).valid, true);
  assert.equal(validateShipmentFilters({ created_to: "2026-01-01" }).valid, true);
  // Kunden-ID muss numerisch sein.
  assert.equal(validateShipmentFilters({ user_id: "abc" }).valid, false);
  assert.equal(validateShipmentFilters({ user_id: "42" }).valid, true);
  // Die Seite prüft VOR dem Anwenden und setzt die Pagination zurück.
  assert.match(listSrc, /const v = validateShipmentFilters\(draft\);\s*if \(!v\.valid\) \{ setFilterError\(v\.error\); return; \}/);
  assert.match(listSrc, /setPage\(1\);\s*setApplied\(draft\);/);
  // Kein Doppel-Request: Buttons sind während des Ladens gesperrt.
  assert.match(listSrc, /className="btn btn-primary btn-sm" disabled=\{loading\}/);
});

test("15 — aktive Filter sind sichtbar und zurücksetzbar", () => {
  assert.equal(hasActiveShipmentFilters(EMPTY_SHIPMENT_FILTERS), false);
  assert.equal(hasActiveShipmentFilters({ ...EMPTY_SHIPMENT_FILTERS, status: "booked" }), true);
  assert.equal(hasActiveShipmentFilters({ ...EMPTY_SHIPMENT_FILTERS, has_tracking: "yes" }), true);
  const chips = activeShipmentFilterChips({ ...EMPTY_SHIPMENT_FILTERS, status: "booked", carrier: "ups", has_tracking: "no" });
  assert.deepEqual(chips.map((c) => c.key), ["status", "carrier", "has_tracking"]);
  assert.equal(chips[0].label, "Status: Gebucht");
  assert.equal(chips[2].label, "Ohne Tracking");
  assert.match(listSrc, /Filter zurücksetzen/);
  assert.match(listSrc, /const resetFilters = \(\) => \{/);
});

// ═══ E) Lade-, Fehler- und Leerzustände ══════════════════════════════════════

test("16 — Leerzustände unterscheiden „keine Sendungen“ von „keine Treffer“", () => {
  const none = shipmentEmptyState({ count: 0, filters: EMPTY_SHIPMENT_FILTERS });
  assert.equal(none.title, "Noch keine Sendungen vorhanden.");
  const noHit = shipmentEmptyState({ count: 0, filters: { ...EMPTY_SHIPMENT_FILTERS, status: "booked" } });
  assert.equal(noHit.title, "Für diese Filter wurden keine Sendungen gefunden.");
  assert.equal(shipmentEmptyState({ count: 3 }).show, false);
  assert.match(listSrc, /\{emptyState\.title\}/);
  assert.match(listSrc, /\{emptyState\.text\}/);
});

test("17 — Lade- und Fehlerzustand der Liste sind eindeutig und wiederholbar", () => {
  assert.match(listSrc, /Sendungen werden geladen…/);
  assert.match(listSrc, /<div className="loading-center" role="status" aria-live="polite">/);
  assert.match(listSrc, /Die Sendungen konnten nicht geladen werden\. Bitte versuchen Sie es erneut\./);
  assert.match(listSrc, /Erneut versuchen/);
  // Während des Ladens werden weder Daten noch ein falscher Leerzustand gezeigt.
  assert.match(listSrc, /\{loading \? \([\s\S]{0,400}\) : error \? \(/);
  assert.equal(/JSON\.stringify\(\s*(err|error|d)\b/.test(listSrc), false, "kein rohes Backendobjekt");
});

test("18 — das Detail unterscheidet 404, Ladefehler und Auth sauber", () => {
  const nf = shipmentDetailError(404);
  assert.equal(nf.notFound, true);
  assert.equal(nf.retryable, false);
  assert.equal(nf.text, "Die Sendung wurde nicht gefunden.");
  const err500 = shipmentDetailError(500);
  assert.equal(err500.notFound, false);
  assert.equal(err500.retryable, true);
  assert.equal(shipmentDetailError(429).text, "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.");
  // 401/403 bleiben dem zentralen Auth-Verhalten überlassen.
  assert.equal(shipmentDetailError(401), null);
  assert.equal(shipmentDetailError(403), null);
  // Die Seite bietet Retry UND den Rückweg an — keine Sackgasse.
  assert.match(detailSrc, /Erneut versuchen/);
  assert.match(detailSrc, /<Link className="btn btn-outline btn-sm" to="\/admin\/shipments">Zurück zur Sendungsliste<\/Link>/);
  assert.match(detailSrc, /Die Sendung wurde nicht gefunden\./);
  // Keine technischen Details an den Nutzer.
  assert.equal(/\.stack|JSON\.stringify\(\s*(err|error)\b/.test(detailSrc), false);
});

// ═══ F) Detailseite: Abschnitte ══════════════════════════════════════════════

test("19 — der Zollabschnitt erscheint nur bei echter Zollrelevanz", () => {
  assert.equal(isCustomsRelevant(CUSTOMS), true, "DE → CH ist zollrelevant");
  assert.equal(isCustomsRelevant(BOOKED), true, "DE → GB ist nach dem Brexit zollrelevant");
  assert.equal(isCustomsRelevant(INLAND), false, "DE → DE ist nicht zollrelevant");
  assert.equal(isCustomsRelevant({ from_country: "DE", to_country: "FR" }), false, "innerhalb der EU nicht");
  assert.equal(isCustomsRelevant(LEGACY), false, "ohne Länder keine Annahme");
  // Ein gespeicherter Warenwert macht die Sendung ebenfalls zollrelevant.
  assert.equal(isCustomsRelevant({ from_country: "DE", to_country: "DE", goods_value: "120" }), true);
  // Und die Seite rendert die Karte genau daran.
  assert.match(detailSrc, /\{sections\.customs && \(/);
});

test("20 — Abschnitts-Sichtbarkeit verhindert leere Karten", () => {
  const full = detailSections(BOOKED);
  assert.equal(full.customer, true);
  assert.equal(full.tracking, true);
  assert.equal(full.label, true);
  assert.equal(full.customs, true);
  assert.equal(full.invoice, false, "ohne invoice-Objekt keine Rechnungskarte");
  const inland = detailSections(INLAND);
  assert.equal(inland.customs, false);
  assert.equal(inland.tracking, false);
  assert.equal(inland.label, false);
  assert.equal(detailSections({ ...BOOKED, invoice: { id: 5 } }).invoice, true);
  assert.match(detailSrc, /\{sections\.customer && \(/);
});

test("21 — der Kopfbereich trägt die fachliche Kennung, nicht die technische ID", () => {
  assert.match(detailSrc, /<h1 className="adm-detail-id">\{ident\.primary\}<\/h1>/);
  assert.equal(/adm-detail-id">Sendung #\{dash\(idOf\(s\)\)\}/.test(detailSrc), false,
    "die technische ID ist nicht mehr der Seitentitel");
  // Kunde und Route stehen im Kopf; die primäre Aktion führt zum Kundenkonto.
  assert.match(detailSrc, /const ident = shipmentIdentity\(s\);/);
  assert.match(detailSrc, /const cust = customerIdentity\(s\);/);
  assert.match(detailSrc, /Kunde öffnen/);
  // Die interne ID lebt in den technischen Informationen.
  assert.match(detailSrc, /<details className="adm-card adm-tech">/);
  assert.match(detailSrc, /\["Interne Sendungs-ID", dash\(idOf\(s\)\)\]/);
  assert.match(detailSrc, /\["Interne Kunden-ID", dash\(userIdOf\(s\)\)\]/);
});

test("22 — Kennungen bleiben maskiert, Adressdaten unverändert geschützt", () => {
  // JUMiNGO-Kennungen erscheinen nur maskiert (maskTail).
  assert.match(detailSrc, /\["JUMiNGO-Sendungs-ID", jumingoOf\(s\) \? <span className="adm-mask">\{maskTail\(jumingoOf\(s\)\)\}<\/span>/);
  assert.match(detailSrc, /\["JUMiNGO-Ordernummer", orderOf\(s\) \? <span className="adm-mask">\{maskTail\(orderOf\(s\)\)\}<\/span>/);
  // Die Liste zeigt keine rohen Kennungen mehr.
  assert.equal(/masked_jumingo|maskTail/.test(listSrc), false, "die Liste braucht keine Kennungen mehr");
  // Die bestehende Adress-/Labelkarte bleibt unangetastet.
  assert.match(detailSrc, /Adressdaten/);
  assert.match(detailSrc, /Support-Aktionen/);
});

// ═══ G) Regression und Selbsttest ════════════════════════════════════════════

test("23 — andere Adminmodule und Verträge bleiben unberührt", () => {
  for (const rel of [
    "pages/admin/AdminUsersPage.jsx", "pages/admin/AdminUserDetailPage.jsx",
    "pages/admin/AdminInvoicesPage.jsx", "pages/admin/AdminInvoiceDetailPage.jsx",
    "pages/admin/AdminCancellationRequestsPage.jsx", "pages/admin/AdminBackfillPage.jsx",
  ]) {
    assert.equal(/adminShipmentView/.test(read(rel)), false, `${rel} darf davon nichts wissen`);
  }
  // Der Sendungs-API-Vertrag im Service ist unverändert.
  const api = stripComments(read("api/adminApi.js"));
  assert.match(api, /export function listAdminShipments/);
  assert.match(api, /export function getAdminShipment\(id\)/);
  assert.match(api, /apiFetch\(`\/admin\/shipments\/\$\{encodeURIComponent\(id\)\}`, \{ auth: true \}\)/);
  assert.equal(/["'`]\/api\/admin\//.test(api), false, "kein /api-Präfix");
});

test("24 — kein Logging, kein Tokenzugriff in den neuen Dateien", () => {
  // Auch nachgestellte Kommentare entfernen: ein erklärender Hinweis wie
  // „kein Merken (localStorage)" ist gerade der Beleg, dass NICHT gespeichert
  // wird — geprüft wird ausschließlich ausgeführter Code. `://` bleibt erhalten,
  // damit URLs nicht versehentlich zerschnitten werden.
  const stripAllComments = (src) => stripComments(src).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const rel of ["utils/adminShipmentView.mjs", "pages/admin/AdminShipmentsPage.jsx", "pages/admin/AdminShipmentDetailPage.jsx"]) {
    const code = stripAllComments(read(rel));
    assert.equal(/console\.(log|info|warn|error|debug|table|dir)\s*\(/.test(code), false, `${rel}: kein Logging`);
    for (const bad of ["ce_token", "localStorage", "sessionStorage", "document.cookie"]) {
      assert.equal(code.includes(bad), false, `${rel}: ${bad} darf nicht vorkommen`);
    }
  }
});

test("25 — Selbsttest: die Prüflogik greift tatsächlich", () => {
  for (const [label, src] of [["liste", listSrc], ["detail", detailSrc], ["modul", viewSrc]]) {
    assert.ok(src.length > 800, `${label}: Quelle wirkt leer (${src.length} Zeichen)`);
  }
  assert.ok(cssSrc.length > 5000, "Stylesheet wirkt leer");
  assert.match(stripComments('const a = 1; // Unbekannt\nconst b = "Unbekannt";'), /const b = "Unbekannt"/);
  // Der Kommentar-Stripper aus Test 24 entfernt nachgestellte Kommentare, lässt
  // URLs aber intakt.
  const stripAll = (src) => stripComments(src).replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  assert.equal(/localStorage/.test(stripAll('setX(false); // kein Merken (localStorage)')), false);
  assert.match(stripAll('const u = "https://example.com/x";'), /https:\/\/example\.com/);
  assert.equal(/\/\/ Unbekannt/.test(stripComments("// Unbekannt\nconst x = 1;")), false);
  // Kernaussagen sind keine Tautologien.
  assert.notEqual(shipmentIdentity(BOOKED).primary, shipmentIdentity(DRAFT).primary);
  assert.notEqual(shippingModeLabel(DRAFT), shippingModeLabel(LEGACY));
  assert.notEqual(isCustomsRelevant(CUSTOMS), isCustomsRelevant(INLAND));
  assert.equal(('<th scope="col">A</th><th scope="col">B</th>'.match(/<th scope="col"/g) || []).length, 2);
});
