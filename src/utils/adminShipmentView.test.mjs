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
  TRACKING_LABELS,
  activeShipmentFilterChips,
  customerIdentity,
  detailSections,
  hasActiveShipmentFilters,
  hasShippingMode,
  isCustomsRelevant,
  liveTracking,
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
  shipmentPaginationView,
  storedTracking,
  toShipmentApiFilters,
  trackingLinkOrNull,
  trackingLookup,
  trackingView,
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
  // CE-AB… ist die sichtbare Vorgangsnummer; CE-BS… steht bewusst daneben, damit
  // belegbar ist, dass die Kennung NICHT auf sie zurückfällt.
  order_confirmation_number: "CE-AB26-00042",
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
// Alt-Sendung mit gespeicherter Nummer, aber ohne JUMiNGO-Sendungs-ID: die
// Live-Abfrage würde 409 liefern.
const BOOKED_NO_JUMINGO = { ...BOOKED, id: 688, masked_jumingo_shipment_id: "" };

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

test("2 — die Sendungskennung nutzt die Auftragsbestätigung, erfindet aber nie eine", () => {
  assert.deepEqual(shipmentIdentity(BOOKED), { primary: "CE-AB26-00042", kind: "order_confirmation" });
  // Die interne Bestellnummer ist KEIN Ersatz — auch nicht, wenn sie vorliegt.
  assert.deepEqual(shipmentIdentity({ status: "booked", business_order_number: "CE-BS26-00042" }),
    { primary: "Ohne Vorgangsnummer", kind: "missing" });
  // Entwurf ohne Nummer → ehrlicher Zustand statt „—" oder erfundener Nummer.
  assert.deepEqual(shipmentIdentity(DRAFT), { primary: "Entwurf", kind: "draft" });
  // Gebuchte Alt-Sendung ohne Nummer → ebenfalls ehrlich benannt.
  assert.deepEqual(shipmentIdentity(LEGACY), { primary: "Ohne Vorgangsnummer", kind: "missing" });
  // Nie aus der internen ID abgeleitet.
  for (const row of [DRAFT, LEGACY]) {
    assert.equal(shipmentIdentity(row).primary.includes(String(row.id)), false,
      "die interne ID darf nie als Nummer erscheinen");
  }
  assert.equal(/CE-BS\$\{|`CE-BS|CE-AB\$\{|`CE-AB/.test(viewSrc), false, "keine Nummer im Code konstruiert");
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

test("10 — kein horizontales Scrollen: Status/Preis/Aktion fest, Sendung/Kunde/Versand teilen sich den Rest", () => {
  // Reine Prozentbreiten unterschritten den echten Inhaltsbedarf, sobald die
  // Tabelle schmaler wurde (gemessen: die Aktionsgruppe lief schon bei 1440px
  // aus der Tabellenkante). Status/Preis/Aktion sind deshalb feste, an echtem
  // Inhalt gemessene Pixelbreiten (gleiches Muster wie .adm-canc-table);
  // Sendung/Kunde/Versand bleiben absichtlich OHNE eigene width-Regel (auto)
  // und teilen sich den Rest gleichmäßig.
  assert.match(cssSrc, /\.adm-ships-table table \{ min-width: 0; table-layout: fixed; \}/);
  const pxWidths = {};
  for (const n of [4, 5, 6]) {
    const m = cssSrc.match(new RegExp(`\\.adm-ships-table th:nth-child\\(${n}\\)[^{]*\\{ width: (\\d+)px; \\}`));
    assert.ok(m, `Spalte ${n} (Status/Preis/Aktion) hat keine feste Pixelbreite`);
    pxWidths[n] = Number(m[1]);
  }
  // Aktion (6) MUSS die größte der drei sein — sie trägt die einzige harte
  // Sichtbarkeitszusicherung (Details + ggf. Löschen dürfen nie clippen).
  assert.ok(pxWidths[6] > pxWidths[4], "Aktion ist nicht breiter als Status");
  assert.ok(pxWidths[6] > pxWidths[5], "Aktion ist nicht breiter als Preis");
  // Sendung/Kunde/Versand (1-3) tragen KEINE eigene Breitenregel für diese Tabelle.
  for (const n of [1, 2, 3]) {
    assert.equal(
      new RegExp(`\\.adm-ships-table th:nth-child\\(${n}\\)[^{]*\\{ width:`).test(cssSrc), false,
      `Spalte ${n} hat eine Breitenregel — sie soll den Rest frei teilen (auto)`,
    );
  }
  // Keine Prozentbreite mehr auf dieser Tabelle — sonst droht dieselbe
  // Unterschreitung erneut.
  assert.equal(/\.adm-ships-table th:nth-child\(\d\)[^{]*\{ width: \d+%/.test(cssSrc), false,
    "eine Prozentbreite ist zurückgekehrt");
  // Kein Scroll-Wrapper mehr um die Sendungstabelle.
  assert.equal(/adm-ships-table[\s\S]{0,120}table-scroll/.test(listSrc), false);
  // Lange Werte brechen kontrolliert.
  assert.match(cssSrc, /\.adm-ship-no \{[^}]*overflow-wrap: anywhere;/);
  assert.match(cssSrc, /\.adm-ship-cust-name \{[^}]*overflow-wrap: anywhere;/);
  assert.match(cssSrc, /\.adm-ship-carrier \{[^}]*overflow-wrap: anywhere;/);
});

test("10b — der Tabelle-zu-Karten-Umschalter liegt bei 1200px, nicht mehr bei 900px", () => {
  // Bei 900px (Standardbreakpoint einfacherer Adminlisten) reichte den drei
  // freien Textspalten der Platz nicht mehr, sobald Status/Preis/Aktion feste
  // Mindestbreiten bekamen — gemessen (Playwright, echte gebaute App): bei
  // 1150px blieben nur ~114px Inhaltsbreite je Textspalte übrig, weniger als
  // das längste unteilbare Wort ("ConfidaraExpress", 112px) mit Reserve
  // braucht. 1200px hält durchgehend ≥ 127px. Gleiches Muster wie
  // .adm-canc-table (1080px) und .inv-table (1100px).
  const block = cssSrc.slice(
    cssSrc.indexOf(".adm-ships-table table { min-width: 0;"),
    cssSrc.indexOf("/* ── Rechnungsverwaltung"),
  );
  assert.match(block, /@media \(max-width: 1200px\) \{\s*\n\s*\.adm-ships-table \{ display: none; \}\s*\n\s*\.adm-ships-cards \{ display: flex; \}\s*\n\}/);
});

test("11 — mobile Kartenansicht ersetzt die Tabelle", () => {
  assert.match(listSrc, /<ul className="adm-ships-cards">/);
  for (const m of [/<dt>Kunde<\/dt>/, /<dt>Versand<\/dt>/, /<dt>Preis<\/dt>/]) assert.match(listSrc, m);
  assert.match(listSrc, /<div className="adm-scard-head">\s*<ShipmentCell row=\{row\} \/>\s*<StatusCell row=\{row\} \/>/);
  assert.match(cssSrc, /@media \(max-width: 900px\) \{[\s\S]*?\.adm-ships-table \{ display: none; \}/);
  assert.match(cssSrc, /\.adm-ships-cards \{ display: none;/);
  // Touch-Ziel seit Paket E auf 44 px (WCAG 2.5.8) statt 40 px.
  assert.match(cssSrc, /\.adm-scard-actions \.btn \{ min-height: 44px;/);
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
  // Ladezustand über das gemeinsame Listen-Skeleton (Paket E); die Beschriftung
  // wandert in dessen label-Attribut und bleibt vorlesbar.
  assert.match(listSrc, /<ListSkeleton rows=\{6\} label="Sendungen werden geladen …" \/>/);
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
  assert.equal(full.trackingNumber, true);
  assert.equal(full.label, true);
  assert.equal(full.customs, true);
  assert.equal(full.invoice, false, "ohne invoice-Objekt keine Rechnungskarte");
  const inland = detailSections(INLAND);
  assert.equal(inland.customs, false);
  assert.equal(inland.trackingNumber, false);
  assert.equal(inland.label, false);
  assert.equal(detailSections({ ...BOOKED, invoice: { id: 5 } }).invoice, true);
  assert.match(detailSrc, /\{sections\.customer && \(/);
});

test("21 — der Kopfbereich trägt die fachliche Kennung, nicht die technische ID", () => {
  // Seit Paket E rendert der gemeinsame Seitenkopf (PageHeader, variant="admin")
  // das <h1>; der frühere eigene Kartenkopf ist entfallen.
  assert.match(detailSrc, /<PageHeader\b/);
  assert.match(detailSrc, /title=\{ident\.primary\}/);
  assert.equal(/title=\{`Sendung #\$\{dash\(idOf\(s\)\)\}`\}/.test(detailSrc), false,
    "die technische ID ist nicht mehr der Seitentitel");
  // Kunde und Route stehen im Kopf; der Sprung ins Kundenkonto liegt genau
  // EINMAL auf der Seite — in der Karte „Kunde", direkt neben den Kundendaten.
  assert.match(detailSrc, /const ident = shipmentIdentity\(s\);/);
  assert.match(detailSrc, /const cust = customerIdentity\(s\);/);
  assert.match(detailSrc, /Kundendetail öffnen/);
  assert.equal((detailSrc.match(/\/admin\/users\/\$\{encodeURIComponent\(userIdOf\(s\)\)\}/g) || []).length, 1,
    "der Sprung ins Kundenkonto steht mehr als einmal auf der Seite");
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

// ═══ G) Tracking: drei getrennte Zustände ════════════════════════════════════
//
// Ausgangsfehler (Sendung 683): Kopf und Versanddaten meldeten „Tracking
// vorhanden" / „Trackingnummer ••••4666", der Trackingblock gleichzeitig
// „Tracking verfügbar: Nein" / „Trackingnummer: —". Beide Angaben waren für sich
// korrekt, standen aber unter derselben Beschriftung.

// Live-Antwort für 683: Sendung ist gebucht und hat eine gespeicherte Nummer,
// JUMiNGO liefert aber (noch) keine Live-Trackingdaten.
const LIVE_EMPTY = { available: false, status: undefined, number: undefined, link: null, carrier: undefined, source: "jumingo" };
const LIVE_FULL  = { available: true, status: "in_transit", number: "1Z999AA10123454666",
  link: "https://www.ups.com/track?tracknum=1Z999AA10123454666", carrier: "ups", source: "jumingo" };
const S683 = { ...BOOKED, tracking_number: "1Z999AA10123454666", jumingo_shipment_id: "JU-88771234" };

test("26 — die gespeicherte Trackingnummer ist ein eigener Zustand", () => {
  // Vorhanden über die Nummer selbst …
  assert.deepEqual(storedTracking({ tracking_number: "1Z9994666" }), { present: true, number: "1Z9994666" });
  // … oder über das Flag allein (reduzierte/maskierte Antwort).
  assert.equal(storedTracking({ has_tracking: true }).present, true);
  assert.equal(storedTracking({ masked_tracking_number: "••••4666" }).number, "••••4666");
  // Nicht vorhanden → ehrlich false, keine Ersatznummer.
  assert.deepEqual(storedTracking({ has_tracking: false }), { present: false, number: "" });
  assert.deepEqual(storedTracking(undefined), { present: false, number: "" });
  // ENTSCHEIDEND: ein gespeicherter STATUS belegt keine Nummer. Genau diese
  // Vermischung erzeugte vorher das widersprüchliche Kopf-Badge.
  assert.equal(storedTracking({ tracking_status: "in_transit" }).present, false);
  assert.equal(detailSections({ tracking_status: "in_transit" }).trackingNumber, false);
  // Und der Kopf nutzt exakt diese Quelle.
  assert.equal(detailSections(S683).trackingNumber, true);
});

test("27 — Live-Trackingdaten sind ein zweiter, davon unabhängiger Zustand", () => {
  // Ohne Abfrage: nichts geladen, nichts behauptet.
  const none = liveTracking(null);
  assert.equal(none.loaded, false);
  assert.equal(none.hasData, false);
  assert.equal(none.hint, "", "ohne Abfrage kein Hinweis");
  // Abgefragt, aber der Carrier liefert nichts → geladen, aber ohne Daten.
  const empty = liveTracking(LIVE_EMPTY);
  assert.equal(empty.loaded, true);
  assert.equal(empty.hasData, false);
  assert.equal(empty.number, "");
  assert.equal(empty.status, "");
  assert.match(empty.hint, /noch keine Live-Trackingdaten/);
  // Der Hinweis stellt ausdrücklich klar, dass die gespeicherte Nummer davon
  // unberührt bleibt — das ist die Auflösung des Widerspruchs.
  assert.match(empty.hint, /gespeicherte Trackingnummer bleibt davon unberührt/);
  // Mit Daten → Status und Nummer werden durchgereicht, nichts erfunden.
  const full = liveTracking(LIVE_FULL);
  assert.equal(full.hasData, true);
  assert.equal(full.status, "in_transit");
  assert.equal(full.number, "1Z999AA10123454666");
  assert.equal(full.carrier, "ups");
  // Ein Status ohne Nummer ist ebenfalls ein Live-Datum.
  assert.equal(liveTracking({ available: false, status: "in_transit" }).hasData, true);
  assert.equal(liveTracking({ available: false, status: "in_transit" }).number, "");
});

test("28 — der Carrier-Link kommt ausschließlich vom Backend und wird nie gebaut", () => {
  assert.equal(liveTracking(LIVE_FULL).link, "https://www.ups.com/track?tracknum=1Z999AA10123454666");
  assert.equal(liveTracking(LIVE_EMPTY).link, null);
  // Nur http(s) — javascript:/data: werden verworfen, nicht „repariert".
  for (const bad of ["javascript:alert(1)", "data:text/html,x", "  ", "//ups.com/track", 42, null, {}]) {
    assert.equal(trackingLinkOrNull(bad), null, `unzulässiger Link akzeptiert: ${String(bad)}`);
  }
  assert.equal(trackingLinkOrNull("  https://ups.com/t?x=1  "), "https://ups.com/t?x=1");
  // Im Modul wird keine Tracking-URL zusammengesetzt (kein Template, keine
  // Carrier-URL-Tabelle) — weder aus Carrier noch aus Nummer.
  assert.equal(/https?:\/\/[^\s"'`]*\$\{/.test(viewSrc), false, "im Modul wird eine URL konstruiert");
  assert.equal(/ups\.com|dhl\.de|dpd\.|gls-|fedex\.com/i.test(viewSrc), false, "Carrier-URL im Modul hinterlegt");
  assert.equal(/https?:\/\/[^\s"'`]*\$\{/.test(detailSrc), false, "auf der Seite wird eine URL konstruiert");
  assert.equal(/ups\.com|dhl\.de|dpd\.|gls-|fedex\.com/i.test(detailSrc), false, "Carrier-URL auf der Seite hinterlegt");
  // Fehlt der Link, wird das benannt statt ersetzt — aber erst nach der Abfrage.
  assert.equal(trackingView(S683, null).link.hint, "", "ohne Abfrage keine Aussage über den Link");
  assert.match(trackingView(S683, LIVE_EMPTY).link.hint, /keine Tracking-URL selbst zusammengesetzt/);
  assert.equal(trackingView(S683, LIVE_FULL).link.available, true);
});

test("29 — die Live-Abfrage wird nur angeboten, wenn sie fachlich möglich ist", () => {
  // Ohne JUMiNGO-Sendungs-ID antwortet das Backend mit 409 → gar nicht anbieten.
  const blocked = trackingLookup(BOOKED_NO_JUMINGO);
  assert.equal(blocked.possible, false);
  assert.match(blocked.hint, /keine JUMiNGO-Sendungs-ID/);
  assert.equal(trackingLookup(S683).possible, true);
  assert.equal(trackingLookup(S683).hint, "", "möglich ⇒ kein Hinweis");
  // Auch die maskierte Kennung belegt die Existenz der ID.
  assert.equal(trackingLookup({ masked_jumingo_shipment_id: "••••8877" }).possible, true);
  assert.equal(trackingLookup(undefined).possible, false);
  // FAIL-OPEN: fehlt das Feld ganz, wird NICHT gesperrt — sonst würde eine
  // Formatänderung der Antwort eine berechtigte Supportaktion still abschalten.
  // Gesperrt wird nur bei vorhandenem, leerem Feld.
  assert.equal(trackingLookup({ id: 683 }).possible, true, "unbekannt darf nicht sperren");
  assert.equal(trackingLookup({ jumingo_shipment_id: null }).possible, false);
  assert.equal(trackingLookup({ masked_jumingo_shipment_id: "" }).possible, false);
  // Die Seite schaltet den Button genau daran — und begründet die Sperre.
  assert.match(detailSrc, /disabled=\{trackBusy \|\| !track\.lookup\.possible\}/);
  assert.match(detailSrc, /title=\{track\.lookup\.possible \? undefined : track\.lookup\.hint\}/);
  // Die Begründung steht sichtbar auf der Seite und ist mit dem Button verknüpft.
  assert.match(detailSrc, /aria-describedby=\{track\.lookup\.possible \? undefined : "adm-track-lookup-hint"\}/);
  assert.match(detailSrc, /<p className="adm-support-hint" id="adm-track-lookup-hint">\{track\.lookup\.hint\}<\/p>/);
});

test("30 — der Widerspruch von Sendung 683 ist aufgelöst", () => {
  // Genau die reale Konstellation: gespeicherte Nummer JA, Live-Daten NEIN.
  const v = trackingView(S683, LIVE_EMPTY);
  assert.equal(v.stored.present, true, "die gespeicherte Nummer bleibt sichtbar");
  assert.equal(v.live.hasData, false, "der Carrier liefert nichts — das bleibt wahr");
  assert.equal(v.link.available, false);
  // Die drei Zustände sind getrennt benannt und nicht mehr verwechselbar.
  assert.equal(TRACKING_LABELS.storedBadge, "Trackingnummer vorhanden");
  assert.equal(TRACKING_LABELS.storedNumber, "Trackingnummer (gespeichert)");
  assert.equal(TRACKING_LABELS.liveNumber, "Trackingnummer (Carrier)");
  assert.equal(TRACKING_LABELS.liveTitle, "Live-Trackingdaten");
  assert.equal(TRACKING_LABELS.carrierLink, "Carrier-Link");
  const labels = Object.values(TRACKING_LABELS);
  assert.equal(new Set(labels).size, labels.length, "keine zwei Zustände tragen denselben Text");
  // Die alten, mehrdeutigen Texte existieren nicht mehr.
  for (const gone of ["Tracking vorhanden<", "Tracking verfügbar", "Trackinginformationen", "Kein Carrier-Link vorhanden"]) {
    assert.equal(detailSrc.includes(gone), false, `alter mehrdeutiger Text „${gone}" ist noch da`);
  }
  // Und beide Darstellungen stammen aus derselben Quelle.
  assert.match(detailSrc, /const track = trackingView\(s, trackData\);/);
  assert.match(detailSrc, /\{sections\.trackingNumber && \(/);
  assert.match(detailSrc, /\{TRACKING_LABELS\.storedBadge\}/);
  assert.match(detailSrc, /\[TRACKING_LABELS\.storedNumber, track\.stored\.present/);
  // Der Live-Block zeigt die gespeicherte Nummer zum Vergleich mit.
  assert.match(detailSrc, /<dt>\{TRACKING_LABELS\.storedNumber\}<\/dt>/);
});

test("31 — es gibt keine zweite Tracking-Bedingungslogik mehr auf der Seite", () => {
  // Die frühere Doppelung (hasTrackingOf + selectTracking + sections.tracking)
  // ist ersetzt; die Seite liest ausschließlich das View-Model.
  assert.equal(/function hasTrackingOf/.test(detailSrc), false, "hasTrackingOf lebt noch");
  assert.equal(/const yesNoText/.test(detailSrc), false, "yesNoText lebt noch");
  assert.equal(/const isHttpUrl/.test(detailSrc), false, "die URL-Prüfung ist noch dupliziert");
  assert.equal((detailSrc.match(/trackingView\(/g) || []).length, 1, "das View-Model wird genau einmal gebildet");
  // trackData wird nur noch ins View-Model gegeben, nie direkt gerendert.
  const rendered = detailSrc.slice(detailSrc.indexOf("return ("));
  assert.equal(/trackData\.\w/.test(rendered), false, "die Rohdaten werden noch direkt gerendert");
  // Der Live-Block erscheint erst nach einer Abfrage.
  assert.match(detailSrc, /\{track\.live\.loaded && \(/);
  // Kein Status wird erfunden, wenn keiner geliefert wurde.
  assert.match(detailSrc, /"Kein Trackingstatus"/);
  assert.match(detailSrc, /\{track\.live\.status \|\| "Noch kein Status geliefert"\}/);
  // Live- und gespeicherte Nummer bleiben maskiert.
  assert.match(detailSrc, /<dd className="adm-mask">\{maskTail\(track\.live\.number\) \|\| "Nicht geliefert"\}<\/dd>/);
  assert.match(cssSrc, /\.adm-track-note \{/);
});

// ═══ H) Regression und Selbsttest ════════════════════════════════════════════

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

// ═══ I) Pagination: Gesamtanzahl vs. Seitenanzahl ════════════════════════════

test("32 — genau eine Seite zeigt nur die Gesamtanzahl, keine Navigation", () => {
  const v = shipmentPaginationView({ page: 1, pageSize: 25, total: 5 });
  assert.deepEqual(v, { totalPages: 1, showNav: false, label: "5 Sendungen" });
  // Randfall total===pageSize: genau eine volle Seite, immer noch keine Navigation.
  const voll = shipmentPaginationView({ page: 1, pageSize: 25, total: 25 });
  assert.equal(voll.totalPages, 1);
  assert.equal(voll.showNav, false);
});

test("33 — Singular „1 Sendung“, nicht „1 Sendungen“", () => {
  assert.equal(shipmentPaginationView({ page: 1, pageSize: 25, total: 1 }).label, "1 Sendung");
  assert.equal(shipmentPaginationView({ page: 1, pageSize: 25, total: 0 }).label, "0 Sendungen");
  assert.equal(shipmentPaginationView({ page: 1, pageSize: 25, total: 2 }).label, "2 Sendungen");
});

test("34 — mehrere Seiten: „Seite X von Y · Z Sendungen“, Navigation sichtbar", () => {
  // 57 Sendungen / 25 pro Seite = 3 Seiten (Rest 7).
  const v1 = shipmentPaginationView({ page: 1, pageSize: 25, total: 57 });
  assert.deepEqual(v1, { totalPages: 3, showNav: true, label: "Seite 1 von 3 · 57 Sendungen" });
  const v2 = shipmentPaginationView({ page: 2, pageSize: 25, total: 57 });
  assert.equal(v2.label, "Seite 2 von 3 · 57 Sendungen");
  const v3 = shipmentPaginationView({ page: 3, pageSize: 25, total: 57 });
  assert.equal(v3.label, "Seite 3 von 3 · 57 Sendungen");
  // Exakt zwei volle Seiten (50/25=2) — keine überzählige leere dritte Seite.
  assert.equal(shipmentPaginationView({ page: 1, pageSize: 25, total: 50 }).totalPages, 2);
});

test("35 — unbekannter Gesamtzähler wird ehrlich degradiert, nie erfunden", () => {
  for (const bad of [null, undefined, NaN, -1, "57"]) {
    const v = shipmentPaginationView({ page: 3, pageSize: 25, total: bad });
    assert.deepEqual(v, { totalPages: null, showNav: true, label: "Seite 3" },
      `total=${JSON.stringify(bad)} muss ehrlich degradieren`);
  }
});

test("36 — ungültige Seitenzahl fällt sicher auf 1 zurück", () => {
  for (const bad of [0, -1, NaN, undefined, null]) {
    const v = shipmentPaginationView({ page: bad, pageSize: 25, total: null });
    assert.equal(v.label, "Seite 1", `page=${JSON.stringify(bad)} muss auf Seite 1 fallen`);
  }
});

test("37 — die Seite rendert Zurück/Weiter NUR wenn showNav true ist — kein natives confirm, keine dritte Quelle", () => {
  // Zwei Stellen: Zurück-Button und Weiter-Button, beide hinter pagination.showNav.
  const navGuards = (listSrc.match(/\{pagination\.showNav && \(/g) || []).length;
  assert.equal(navGuards, 2, "erwartet je einen showNav-Guard für Zurück und Weiter");
  assert.match(listSrc, /shipmentPaginationView\(\{ page, pageSize: PAGE_SIZE, total \}\)/,
    "die Seite berechnet die Pagination-Ansicht nicht über den zentralen Helfer");
  // Die alte, mehrdeutige Formulierung ist vollständig verschwunden.
  assert.equal(/gesamt/.test(listSrc), false, "„… gesamt“ steht noch im Quelltext");
  // Der Button-Zustand (disabled) hängt weiterhin an page/hasMore — NICHT an
  // einer zweiten, konkurrierenden Berechnung aus pagination.totalPages.
  assert.match(listSrc, /disabled=\{loading \|\| page <= 1\}/);
  assert.match(listSrc, /disabled=\{loading \|\| !hasMore\}/);
});

test("38 — die Seitenanzeige ist für Screenreader live, ohne den Fokus zu stehlen", () => {
  assert.match(listSrc, /<span className="adm-page-ind" aria-live="polite">\{pagination\.label\}<\/span>/);
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
  // Die drei Trackingzustände sind tatsächlich unabhängig — sonst prüften die
  // Tests 26–30 nur eine einzige, umbenannte Bedingung.
  const v683 = trackingView(S683, LIVE_EMPTY);
  assert.notEqual(v683.stored.present, v683.live.hasData, "Zustand 1 und 2 fallen zusammen");
  assert.notEqual(v683.stored.present, v683.link.available, "Zustand 1 und 3 fallen zusammen");
  const vFull = trackingView(BOOKED_NO_JUMINGO, LIVE_FULL);
  assert.notEqual(vFull.lookup.possible, vFull.live.hasData, "Vorbedingung und Live-Daten fallen zusammen");
  assert.equal(trackingLinkOrNull("https://x.example/1") === null, false, "die Linkprüfung verwirft alles");
  assert.notEqual(liveTracking(LIVE_FULL).hasData, liveTracking(LIVE_EMPTY).hasData);
});
