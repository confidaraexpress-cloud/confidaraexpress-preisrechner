// ─────────────────────────────────────────────────────────────────────────────
// Kennzahlkarten der Kundenübersicht — Anzeige der SERVERkennzahlen
// ─────────────────────────────────────────────────────────────────────────────
// Betreiberentscheidungen E1–E4 vom 2026-11-06 (Canonical 1A „Kennzahlkarten: fachlich korrekt
// und anklickbar"): Die vier Kennzahlen, ihre Filter und der Kundenstand jeder Zeile entstehen
// ausschließlich im Backend (lib/shipmentKpis.js) — EINE Regelfassung für Zähler, Liste und
// Zeilenkennzeichen. Dieses Modul rechnet nichts nach: Es liest das Aggregat `stats` aus
// GET /kunde/shipments und hält die Texte der vier Karten und ihrer Filter an einer Stelle.
//
// Bis zum 2026-11-06 stand hier zusätzlich eine Ersatzrechnung über die geladenen Zeilen
// (computeKpis). Sie konnte nur die erste Seite (50 Sendungen) sehen und zählte mit dem
// Browsertag; seit es Filter je Kennzahl gibt, wäre sie eine zweite, abweichende Wahrheit.
// Ohne gültiges Aggregat zeigen die Karten deshalb „—" und „Noch nicht verfügbar".
//
// Bewusst als .mjs: dieses Modul muss ohne die Vite-Pipeline direkt von Node
// (node --test) importierbar sein. `.mjs` erzwingt ESM-Semantik unabhängig vom
// (hier fehlenden) package.json "type"; Vite löst `.mjs` extensionslos zuerst auf.

// ── Die vier Kennzahlen und ihre Filter (Reihenfolge der Karten) ──
// key      Filter- und stats-Schlüssel des Servers (GET /kunde/shipments?kpi=…)
// cls      Modifikator der Kartenklasse (ov-kpi--…), unverändert seit 2026-10 — stabile Anker für Stil und Tests
// label    Titel der Karte (E3: „Unterwegs" statt „In Zustellung" — der Trackingstand reicht von
//          der Abholung bis zur Zustellfahrt, eine Zustellfahrt ist nicht belegbar)
// context  Kontextzeile der Karte
// explain  Erklärung in der Filterleiste der Sendungsliste (genauer als die Kontextzeile, ohne Wiederholung des Namens)
// filter   Name des Filters in der Sendungsliste („Filter: …")
// empty    Leersatz der gefilterten Liste (auch eine 0 ist anklickbar)
// /*#__PURE__*/: der öffentliche Preisrechner bindet dieses Modul über utils/businessDate.mjs (BUSINESS_TIME_ZONE) ein —
// ohne die Markierung blieben die eingefrorenen Kundenbereichstexte in seinem Bündel stehen.
export const SHIPMENT_KPIS = /*#__PURE__*/ Object.freeze([
  /*#__PURE__*/ Object.freeze({ key: "active", cls: "active", label: "Aktive Sendungen", context: "Gebucht, noch nicht zugestellt",
    filter: "Aktive Sendungen", explain: "Gebucht, noch nicht zugestellt", empty: "Aktuell keine aktiven Sendungen." }),
  /*#__PURE__*/ Object.freeze({ key: "in_transit", cls: "transit", label: "Unterwegs", context: "Beim Versanddienstleister unterwegs",
    filter: "Unterwegs", explain: "Beim Versanddienstleister unterwegs, noch nicht zugestellt", empty: "Aktuell keine Sendungen unterwegs." }),
  /*#__PURE__*/ Object.freeze({ key: "delivered_this_month", cls: "delivered", label: "Zugestellt", context: "Im aktuellen Monat",
    filter: "Zugestellt im aktuellen Monat", explain: "Zustellung in diesem Kalendermonat gemeldet", empty: "In diesem Monat wurde noch keine Sendung zugestellt." }),
  /*#__PURE__*/ Object.freeze({ key: "delayed", cls: "delayed", label: "Verzögert", context: "Voraussichtlicher Liefertermin überschritten",
    filter: "Verzögert", explain: "Voraussichtlicher Liefertermin überschritten, noch keine Zustellmeldung", empty: "Aktuell keine verzögerten Sendungen." }),
]);

export const SHIPMENT_KPI_KEYS = /*#__PURE__*/ Object.freeze(/*#__PURE__*/ SHIPMENT_KPIS.map((k) => k.key));

// Texte der Übersicht und der gefilterten Liste, die keiner einzelnen Karte gehören.
export const KPI_TEXT = /*#__PURE__*/ Object.freeze({
  // E1: Testbuchungen zählen mit — der Hinweis steht nur, solange das Aggregat welche enthält.
  testHint: "Kennzahlen enthalten Testsendungen.",
  showAll: "Alle Sendungen anzeigen",
  removeFilter: "Filter entfernen",
  // Altes Backend ohne Filter: lieber keine Liste als eine ungefilterte unter einem Filtertitel.
  unavailable: "Dieser Filter ist derzeit nicht verfügbar.",
  loadError: "Die gefilterten Sendungen konnten nicht geladen werden.",
  openSuffix: "Sendungen anzeigen",
});

/** Ist `key` einer der vier Filter? Nur genau diese Werte gelangen in eine Anfrage. */
export function isShipmentKpiKey(key) {
  return typeof key === "string" && SHIPMENT_KPI_KEYS.includes(key);
}

/** Die Beschreibung eines Filters oder null. */
export function shipmentKpi(key) {
  return SHIPMENT_KPIS.find((k) => k.key === key) || null;
}

/** „1 Sendung" / „n Sendungen" — für Trefferzahlen. */
export function sendungenAnzahl(n) {
  return `${n} ${n === 1 ? "Sendung" : "Sendungen"}`;
}

// ── Fachlicher Monat als Vergleichsschlüssel („YYYY-MM" in Europe/Berlin) ──
//
// WICHTIG, damit hier keine zweite Wahrheit entsteht: dieser Schlüssel entscheidet
// AUSSCHLIESSLICH, WANN erneut beim Server angefragt wird — niemals, WAS als
// zugestellt zählt. Die Zählgrenze liegt allein im Backend
// (lib/calendarDate.js, lib/shipmentKpis.js). Läge der Schlüssel um eine Stunde
// daneben, wäre die Folge lediglich ein etwas zu früher oder später Refetch, nie
// eine falsche Zahl.
//
// Die Geschäftszeitzone ist dieselbe wie im Backend. Intl ist im Browser und in
// Node vorhanden — keine neue Abhängigkeit.
export const BUSINESS_TIME_ZONE = "Europe/Berlin";

export function businessMonthKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  const y = get("year"), m = get("month");
  return y && m ? `${y}-${m}` : null;
}

// ── Serverseitige Sendungsstatistik → Kartenwerte ──
// Der Server liefert im paginierten Abruf `stats` über ALLE Sendungen des Kontos.
// Fail-safe, nicht fail-open: nur ein vollständig belegtes Aggregat (die sechs Zähler endliche
// Zahlen ≥ 0, und „neu" nie größer als „aktiv") wird übernommen; alles andere ergibt null, und die
// Karten zeigen „—" — eine geratene Zahl wäre schlimmer als keine. 0 ist überall ein gültiger
// Wert; geprüft wird mit Number.isFinite, nie über Falsy. `test_bookings` (E1) ist optional:
// fehlt es (älteres Backend), entfällt nur der Hinweis.
export function kpisFromServerStats(stats) {
  if (!stats || typeof stats !== "object" || Array.isArray(stats)) return null;
  const lesen = (key) => {
    const v = stats[key];
    if (v === null || v === undefined || v === "" || typeof v === "boolean") return null;   // Number(null) wäre 0
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const total = lesen("total"), active = lesen("active"), inTransit = lesen("in_transit");
  const delivered = lesen("delivered_this_month"), delayed = lesen("delayed"), new24 = lesen("new_24h");
  if ([total, active, inTransit, delivered, delayed, new24].some((v) => v === null)) return null;
  // „davon n neu (24 h)" ist eine Teilmenge der aktiven Sendungen (E3). Ein Aggregat, das mehr neue
  // als aktive meldet, stammt von einem Backend vor dieser Regel — dann entfällt nur der Zusatz.
  const tests = lesen("test_bookings");
  return {
    active, inTransit, delivered, delayed,
    new24: new24 <= active ? new24 : null,
    testBookings: tests,
    byKey: { active, in_transit: inTransit, delivered_this_month: delivered, delayed },
  };
}

/** Zusatz der Karte „Aktive Sendungen": „davon n neu (24 h)" — bei 0 oder ohne belastbare Zahl keiner. */
export function activeNewNote(k) {
  return k && Number.isFinite(k.new24) && k.new24 > 0 ? `davon ${k.new24} neu (24 h)` : null;
}
