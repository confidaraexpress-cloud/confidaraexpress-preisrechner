// Kennzahlkarten als Filter und Kundenstand der Sendungslisten (Betreiberentscheidungen E1–E4, 2026-11-06).
//
// Verhalten, wo das Modul ohne Vite importierbar ist (customerShipmentStatus.mjs), sonst quelltextnah wie die
// übrigen Dashboard-Tests (kein jsdom). Das Zusammenspiel im Browser prüft tests/e2e/kpiKartenFilter.test.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CUSTOMER_STATUS_VIEW, CUSTOMER_STATUS_TEXT, customerShipmentStatus, isActiveShipment,
} from "../../utils/customerShipmentStatus.mjs";
import { BOOKING_IN_REVIEW_TEXT } from "../../utils/customerBookingStatus.mjs";

const src = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const liste = ohneKommentare(src("./ShipmentsList.jsx"));
const module = ohneKommentare(src("./OverviewModules.jsx"));
const seite = ohneKommentare(src("../../pages/DashboardPage.jsx"));
const anzeige = ohneKommentare(src("../ui/ShipmentStatus.jsx"));

// ── Kundenstand: nur Serverwerte, in fester Zuordnung ───────────────────────
test("1 — jeder Kundenstand des Servers hat genau eine Anzeige", () => {
  assert.deepEqual(Object.keys(CUSTOMER_STATUS_VIEW).sort(),
    ["booked", "booking", "cancelled", "delivered", "exception", "in_transit", "label_ready"]);
  const texte = Object.fromEntries(Object.entries(CUSTOMER_STATUS_VIEW).map(([k, v]) => [k, v.label]));
  assert.deepEqual(texte, {
    booking: BOOKING_IN_REVIEW_TEXT.badge, cancelled: "Storniert", delivered: "Zugestellt", exception: "Zustellproblem",
    in_transit: "Unterwegs", label_ready: "Label bereit", booked: "Gebucht",
  });
  assert.equal(CUSTOMER_STATUS_TEXT.stale, "Trackingstand nicht mehr aktuell");
  assert.equal(CUSTOMER_STATUS_TEXT.test, "TEST");
});

test("2 — Kennzeichen stehen neben dem Stand und verdecken ihn nie", () => {
  const st = customerShipmentStatus({ status: "label_ready", customer_status: "in_transit", is_delayed: true, tracking_stale: false, is_test_booking: true });
  assert.deepEqual([st.key, st.view.label, st.delayed, st.stale, st.test, st.legacyStatus], ["in_transit", "Unterwegs", true, false, true, null]);
  const zugestelltTest = customerShipmentStatus({ status: "label_ready", customer_status: "delivered", is_test_booking: true });
  assert.deepEqual([zugestelltTest.view.label, zugestelltTest.test], ["Zugestellt", true], "TEST · Zugestellt — die Zustellung bleibt eine Testzustellung");
  const alt = customerShipmentStatus({ status: "booked", customer_status: "in_transit", tracking_stale: true });
  assert.deepEqual([alt.view.label, alt.stale, alt.delayed], ["Unterwegs", true, false], "letzter bekannter Stand mit Hinweis");
});

test("3 — ohne Kundenstand (älteres Backend) oder bei „other“: der Buchungsstatus wie bisher, keine eigene Ableitung", () => {
  for (const s of [{ status: "booked" }, { status: "booked", customer_status: "other" }, { status: "label_ready", customer_status: "Unterwegs" },
    { status: "booked", customer_status: "__proto__" }, { status: "booked", customer_status: 5 }]) {
    const st = customerShipmentStatus(s);
    assert.equal(st.key, null, JSON.stringify(s));
    assert.equal(st.legacyStatus, s.status);
  }
  // Ohne Serverkennzeichen keine erfundene Aussage — auch nicht aus tracking_status oder ETA.
  const ohne = customerShipmentStatus({ status: "booked", tracking_status: "delivered", delivery_date_max: "2020-01-01" });
  assert.deepEqual([ohne.key, ohne.delayed, ohne.stale, ohne.test], [null, false, false, false]);
  for (const leer of [null, undefined, "x", 5]) assert.equal(customerShipmentStatus(leer).key, null);
});

test("4 — „laufend“ heißt nur das Serverkennzeichen is_active (dieselbe Regel wie die Karte)", () => {
  assert.equal(isActiveShipment({ is_active: true }), true);
  for (const s of [{ is_active: "true" }, { is_active: 1 }, { status: "booked" }, { customer_status: "booked" }, null, undefined]) {
    assert.equal(isActiveShipment(s), false, JSON.stringify(s));
  }
  const modul = ohneKommentare(src("../../utils/customerShipmentStatus.mjs"));
  for (const verboten of ["tracking_status", "delivery_date_max", "Date(", "cancellation_status"]) {
    assert.ok(!modul.includes(verboten), `customerShipmentStatus.mjs leitet selbst ab: ${verboten}`);
  }
});

// ── Eine Anzeige für alle Listen ───────────────────────────────────────────
test("5 — Meine Sendungen (Tabelle und Karte) und Letzte Sendungen zeigen denselben Kundenstand", () => {
  assert.equal((liste.match(/<ShipmentStatus shipment=\{s\} \/>/g) || []).length, 2, "Tabelle und Karte");
  assert.match(module, /<ShipmentStatus shipment=\{s\} \/>/, "Letzte Sendungen");
  for (const datei of [liste, module]) assert.ok(!/<StatusBadge status=\{s\.status\} \/>/.test(datei), "Buchungsstatus statt Kundenstand");
});

test("6 — Statusanzeige: TEST zuerst (gestrichelt, Screenreader „Testsendung“), dann Stand, dann „Verzögert“, darunter der Hinweis", () => {
  const t = anzeige.indexOf('className="ce-test-marke"');
  const s = anzeige.indexOf("st.view");
  const v = anzeige.indexOf("ce-stand-verzoegert");
  const h = anzeige.indexOf("ce-stand-hinweis");
  assert.ok(t > -1 && t < s && s < v && v < h, "Reihenfolge TEST → Stand → Verzögert → Hinweis");
  assert.match(anzeige, /<span aria-hidden="true">\{CUSTOMER_STATUS_TEXT\.test\}<\/span>/);
  assert.match(anzeige, /<span className="sr-only">\{CUSTOMER_STATUS_TEXT\.testSr\}:<\/span>/);
  assert.match(anzeige, /<StatusBadge status=\{st\.legacyStatus\} \/>/, "Rückfall auf den Buchungsstatus");
});

// ── Filterleiste der Sendungsliste ─────────────────────────────────────────
test("7 — Filterleiste: Name, Trefferzahl des Servers, Erklärung, „Filter entfernen“ — als Statusmeldung", () => {
  const leiste = liste.slice(liste.indexOf("function KennzahlFilterLeiste"), liste.indexOf("export function ShipmentsList"));
  assert.match(leiste, /role="status" aria-live="polite"/);
  assert.match(leiste, /Filter: \{kpi\.filter\}/);
  assert.match(leiste, /<span className="ce-filterleiste-erklaerung">\{kpi\.explain\}<\/span>/, "eigene Erklärung je Filter");
  assert.match(leiste, /filter\.status === "ready" && Number\.isFinite\(filter\.total\) \? sendungenAnzahl\(filter\.total\) : null/,
    "die Trefferzahl stammt vom Server und steht erst nach dem Laden");
  assert.match(leiste, /<button type="button" className="btn-link ce-filterleiste-entfernen" onClick=\{onClear\}>/);
  assert.ok(!/<Icon/.test(leiste), "die Sendungsliste trägt keine Symbole");
});

test("8 — Leer, Fehler, nicht verfügbar: je ein sachlicher Zustand mit „Alle Sendungen anzeigen“, nie eine falsche 0", () => {
  assert.match(liste, /kpiFilter && kpiFilter\.status === "unavailable" \? \(/, "fail-closed bei altem Backend");
  assert.match(liste, /title=\{KPI_TEXT\.unavailable\}/);
  assert.match(liste, /title=\{KPI_TEXT\.loadError\}/);
  assert.match(liste, /title=\{shipmentKpi\(kpiFilter\.key\)\.empty\}/);
  assert.equal((liste.match(/\{KPI_TEXT\.showAll\}/g) || []).length, 3, "jeder Zustand führt zurück zu allen Sendungen");
});

// ── Seitensteuerung: History-State, Anfragefolge, Deep-Link ────────────────
test("9 — Startfilter nur aus ?page=shipments&kpi=… oder dem History-State, nur die vier Schlüssel", () => {
  const fn = seite.slice(seite.indexOf("function waehleStartKpi"), seite.indexOf("const NewShipmentPage"));
  assert.match(fn, /ausQuery === "shipments" && isShipmentKpiKey\(params\.get\("kpi"\)\)/);
  assert.match(fn, /st\.page === "shipments" && isShipmentKpiKey\(st\.kpi\)/);
  assert.match(seite, /const \[shipmentsKpi, setShipmentsKpi\] = useState\(\(\) => waehleStartKpi\(location\)\);/);
});

test("10 — Klick auf eine Karte: eigener History-Eintrag (Zurück führt zur Übersicht); Zurück/Vor stellt Bereich und Filter her", () => {
  const oeffne = seite.slice(seite.indexOf("const oeffneKennzahl"), seite.indexOf("const requestLogout"));
  assert.match(oeffne, /if \(!isShipmentKpiKey\(kpi\)\) return;/);
  assert.match(oeffne, /navigate\(location\.pathname, \{ state: \{ \.\.\.aktuell, page: "shipments", kpi \} \}\);/, "Push, kein Replace");
  assert.match(seite, /if \(navigationType !== "POP"\) return;/);
  assert.match(seite, /setShipmentsKpi\(st\.page === "shipments" && isShipmentKpiKey\(st\.kpi\) \? st\.kpi : null\);/);
  assert.match(seite, /onOpenKpi=\{oeffneKennzahl\}/);
});

test("11 — der Filter lebt nur im History-Eintrag von „Sendungen“; jede andere Navigation und „Filter entfernen“ löschen ihn", () => {
  assert.match(seite, /const soll = page === "shipments" \? shipmentsKpi : null;/);
  assert.match(seite, /state: soll \? \{ \.\.\.rest, kpi: soll \} : rest/);
  const nav = seite.slice(seite.indexOf("const performNav"), seite.indexOf("const navigateFromNotification"));
  assert.match(nav, /setShipmentsKpi\(null\);/, "Seitenleiste & Co. zeigen alle Sendungen");
  const weg = seite.slice(seite.indexOf("const entferneKennzahl"), seite.indexOf("const loadMoreInvoices"));
  assert.match(weg, /kpiReq\.current\+\+;/, "eine laufende Antwort gilt nicht mehr");
  assert.match(weg, /setShipmentsKpi\(null\);/);
  assert.match(weg, /reloadShipments\(\);/, "frische ungefilterte erste Seite");
  assert.match(weg, /\.ce-page-header-title/, "der Fokus geht auf die Seitenüberschrift");
});

test("12 — Laden: serverseitig je Filter, eine Anfragefolge gegen überholte Antworten, fail-closed ohne bestätigten Filter", () => {
  const laden = seite.slice(seite.indexOf("const ladeKpiListe"), seite.indexOf("const ladeMehrKpi"));
  assert.match(laden, /apiFetch\(`\/kunde\/shipments\?kpi=\$\{encodeURIComponent\(kpi\)\}&limit=50`, \{ auth: true \}\)/);
  assert.equal((laden.match(/seq !== kpiReq\.current/g) || []).length, 2, "vor und nach dem JSON");
  assert.match(laden, /d\.filter\?\.kpi !== kpi \|\| !Number\.isFinite\(total\)/);
  assert.match(laden, /status: "unavailable"/);
  const mehr = seite.slice(seite.indexOf("const ladeMehrKpi"), seite.indexOf("// Genau EIN Weg lädt die gefilterte Liste"));
  assert.match(mehr, /kpi=\$\{encodeURIComponent\(key\)\}&limit=50&cursor=\$\{encodeURIComponent\(cursor\)\}/, "Nachladen bleibt im Filter");
  assert.match(mehr, /\[\.\.\.l\.shipments, \.\.\.\(d\.shipments \|\| \[\]\)\]/, "anfügen, nie ersetzen");
  // Genau ein Effekt lädt die gefilterte Liste.
  assert.equal((seite.match(/ladeKpiListe\(shipmentsKpi\);/g) || []).length, 2, "Effekt und Stornierungsabgleich");
  assert.ok(!/setInterval\([^)]*kpi/i.test(seite), "kein Polling für Filter");
});

test("13 — ?page=shipments&kpi=… landet im History-State und verlässt die Adresse wie bisher", () => {
  assert.match(seite, /const kpi = p === "shipments" && isShipmentKpiKey\(params\.get\("kpi"\)\) \? params\.get\("kpi"\) : null;/);
  assert.match(seite, /navigate\("\/dashboard", \{ replace: true, state: kpi \? \{ \.\.\.altState, page: p, kpi \} : \{ \.\.\.altState, page: p \} \}\);/);
});
