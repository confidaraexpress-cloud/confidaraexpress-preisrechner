// ─────────────────────────────────────────────────────────────────────────────
// Admin-Sendungsverwaltung — reine, framework-freie Anzeige- und Ablauflogik.
//
// Bündelt alles, was an Sendungsliste und Sendungsdetail testbar ist: Feldlesung,
// Nummern- und Serviceart-Darstellung, Filtermodell inkl. Validierung, Lade-/
// Fehler-/Leerzustände und die Sichtbarkeit der Detailabschnitte. Kein React,
// kein Netzwerk, kein State.
//
// VERBINDLICHE ABGRENZUNGEN (aus dem Backend-Vertrag, nicht geraten):
//   • shipments.status kennt AUSSCHLIESSLICH draft | booking | booked | label_ready
//     (ADMIN_SHIPMENT_STATUS in routes/admin.js). Storno lebt in einer eigenen
//     Ressource (cancellation_requests) und ist KEIN Sendungsstatus.
//   • shipments.service_type ist die VERSANDART und kennt ausschließlich
//     pickup | dropoff | NULL (routes/jumingo.js: safeServiceType). Es ist NICHT
//     der Carrier-Produktname — ein solcher wird nirgends gespeichert und darf
//     deshalb auch nicht angezeigt oder erfunden werden.
//   • Vier eigenständige Nummern, keine Umdeutung ineinander:
//       business_order_number = INTERNE Bestellnummer (CE-BS…)
//       order_number          = EXTERNE JUMiNGO-Ordernummer
//       tracking_number       = Carrier-Trackingnummer
//       reference_number      = Kundenreferenz
//     Die interne shipments.id ist ein technischer Schlüssel und NIE eine Nummer.
//   • Preise werden ausschließlich angezeigt, NIE berechnet oder umgerechnet.
//
// AUTORITÄT: Das Backend bleibt in allem verbindlich.
// ─────────────────────────────────────────────────────────────────────────────

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const numOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// ── Feldlesung ──────────────────────────────────────────────────────────────
// NUR erlaubte Felder. Kein Spread des ganzen Objekts, kein Object.keys — auch
// wenn das Backend versehentlich mehr liefert, landet nichts davon im DOM.
export function shipmentFields(row) {
  const r = row && typeof row === "object" ? row : {};
  return {
    id: firstDefined(r.id, r.shipment_id, r.shipmentId) ?? null,
    userId: firstDefined(r.user_id, r.userId) ?? null,
    status: str(firstDefined(r.status, r.state)),
    serviceType: str(firstDefined(r.service_type, r.serviceType)),
    carrier: str(firstDefined(r.selected_carrier, r.carrier)),
    fromCountry: str(firstDefined(r.from_country, r.fromCountry)),
    toCountry: str(firstDefined(r.to_country, r.toCountry)),
    priceFinal: numOrNull(firstDefined(r.price_final, r.priceFinal)),
    packageCount: numOrNull(firstDefined(r.package_count, r.packageCount)),
    createdAt: firstDefined(r.created_at, r.createdAt) ?? null,
    trackingStatus: str(firstDefined(r.tracking_status, r.trackingStatus)),
    hasTracking: firstDefined(r.has_tracking, r.hasTracking) === true,
    labelAvailable: firstDefined(r.label_available, r.labelAvailable) === true,
    // Geschäftsnummer — ausschließlich aus dem fachlichen Feld, nie aus der ID.
    businessOrderNumber: str(firstDefined(r.business_order_number, r.businessOrderNumber)),
    maskedTracking: str(firstDefined(r.masked_tracking_number, r.maskedTrackingNumber)),
    maskedJumingoId: str(firstDefined(r.masked_jumingo_shipment_id, r.maskedJumingoShipmentId)),
    // Kundenidentität (additiv vom Backend über LEFT JOIN users).
    customerCompany: str(firstDefined(r.customer_company, r.customerCompany)),
    customerNumber: str(firstDefined(r.customer_number, r.customerNumber)),
    customerName: str(firstDefined(r.customer_name, r.customerName)),
  };
}

// ── Sendungskennung („Sendung"-Spalte) ──────────────────────────────────────
// Primär die INTERNE Bestellnummer (CE-BS…). Fehlt sie, wird KEINE Nummer
// erfunden und auch keine aus der ID abgeleitet — stattdessen ein ehrlicher,
// nicht irreführender Zustand.
//
// → { primary, kind }
//   kind: "order_number" | "draft" | "missing"
export function shipmentIdentity(row) {
  const f = shipmentFields(row);
  if (f.businessOrderNumber) return { primary: f.businessOrderNumber, kind: "order_number" };
  if (f.status === "draft") return { primary: "Entwurf", kind: "draft" };
  // Gebuchte Alt-Sendungen aus der Zeit vor der Bestellnummern-Einführung.
  return { primary: "Ohne Bestellnummer", kind: "missing" };
}

// ── Kunde ───────────────────────────────────────────────────────────────────
// Firma primär, Kundennummer sekundär. Die technische user_id ist NIE die
// Hauptdarstellung — sie gehört in die technischen Informationen.
//
// → { primary, secondary, known }
export function customerIdentity(row) {
  const f = shipmentFields(row);
  if (f.customerCompany) {
    return { primary: f.customerCompany, secondary: f.customerNumber || "", known: true };
  }
  if (f.customerNumber) return { primary: f.customerNumber, secondary: "", known: true };
  // Kunde nicht auflösbar (z. B. gelöschtes Konto) — ehrlich benennen.
  return { primary: "Kunde nicht auflösbar", secondary: "", known: false };
}

// ── Versandart (service_type) ───────────────────────────────────────────────
// pickup/dropoff sind die einzigen belegten Werte. Ein fehlender Wert wird
// fachlich genau beschrieben statt pauschal „Unbekannt":
//   • Entwurf            → noch nicht gewählt
//   • gebucht ohne Wert  → nicht gespeichert (Alt-Sendung)
const SERVICE_LABELS = Object.freeze({ pickup: "Abholung", dropoff: "Paketshop" });

export function shippingModeLabel(row) {
  const f = shipmentFields(row);
  const known = SERVICE_LABELS[f.serviceType.toLowerCase()];
  if (known) return known;
  if (f.status === "draft") return "Noch nicht gewählt";
  return "Versandart nicht gespeichert";
}

// Ist die Versandart ein echter, gespeicherter Wert (für dezente Darstellung)?
export const hasShippingMode = (row) => !!SERVICE_LABELS[shipmentFields(row).serviceType.toLowerCase()];

// ── Route und Versandzeile ──────────────────────────────────────────────────
export function routeLabel(row) {
  const f = shipmentFields(row);
  if (!f.fromCountry && !f.toCountry) return "";
  const from = f.fromCountry ? f.fromCountry.toUpperCase() : "?";
  const to = f.toCountry ? f.toCountry.toUpperCase() : "?";
  return `${from} → ${to}`;
}

export function packageLabel(row) {
  const n = shipmentFields(row).packageCount;
  if (n === null) return "";
  return n === 1 ? "1 Paket" : `${n} Pakete`;
}

// Kompakte zweite Zeile der Versandspalte: „DE → GB · 1 Paket".
export function shipmentRouteLine(row) {
  return [routeLabel(row), packageLabel(row)].filter(Boolean).join(" · ");
}

// ── Preis ───────────────────────────────────────────────────────────────────
// NUR Anzeige. Fehlender Preis wird fachlich benannt, nie berechnet.
// → { value, text, known }   value === null ⇒ die Komponente zeigt `text`.
export function priceDisplay(row) {
  const f = shipmentFields(row);
  if (f.priceFinal !== null) return { value: f.priceFinal, text: "", known: true };
  if (f.status === "draft") return { value: null, text: "Noch nicht berechnet", known: false };
  return { value: null, text: "Kein Preis gespeichert", known: false };
}

// ── Tracking & Label kompakt ────────────────────────────────────────────────
// Statt zweier breiter Ja/Nein-Spalten: nur die tatsächlich vorhandenen Marker.
// → [{ key, label }]
export function shipmentMarkers(row) {
  const f = shipmentFields(row);
  const out = [];
  if (f.hasTracking) out.push({ key: "tracking", label: "Tracking" });
  if (f.labelAvailable) out.push({ key: "label", label: "Label" });
  return out;
}

// ── Filter ──────────────────────────────────────────────────────────────────
// AUSSCHLIESSLICH die vom Backend belegten Query-Parameter (routes/admin.js):
// user_id, status, carrier, created_from, created_to, has_tracking, limit/offset.
// Es werden KEINE Parameter erfunden — insbesondere gibt es serverseitig KEINE
// Freitextsuche über Kunde/Bestellnummer/Trackingnummer.
export const EMPTY_SHIPMENT_FILTERS = Object.freeze({
  user_id: "", status: "", carrier: "", created_from: "", created_to: "", has_tracking: "all",
});

export const SHIPMENT_STATUS_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ value: "", label: "Alle" }),
  Object.freeze({ value: "draft", label: "Entwurf" }),
  Object.freeze({ value: "booking", label: "In Buchung" }),
  Object.freeze({ value: "booked", label: "Gebucht" }),
  Object.freeze({ value: "label_ready", label: "Label bereit" }),
]);

export const HAS_TRACKING_OPTIONS = Object.freeze([
  Object.freeze({ value: "all", label: "Alle" }),
  Object.freeze({ value: "yes", label: "Mit Tracking" }),
  Object.freeze({ value: "no", label: "Ohne Tracking" }),
]);

// Filter-State → allowlisted API-Parameter. „all"/leer wird NICHT gesendet.
export function toShipmentApiFilters(f) {
  const s = f && typeof f === "object" ? f : {};
  const p = {};
  if (str(s.user_id)) p.user_id = str(s.user_id);
  if (str(s.status)) p.status = str(s.status);
  if (str(s.carrier)) p.carrier = str(s.carrier);
  if (str(s.created_from)) p.created_from = str(s.created_from);
  if (str(s.created_to)) p.created_to = str(s.created_to);
  if (s.has_tracking === "yes") p.has_tracking = "true";
  else if (s.has_tracking === "no") p.has_tracking = "false";
  return p;
}

// Datumsbereich validieren: „Von" darf nicht nach „Bis" liegen.
// → { valid, error }
export function validateShipmentFilters(f) {
  const s = f && typeof f === "object" ? f : {};
  const from = str(s.created_from);
  const to = str(s.created_to);
  if (from && to && from > to) {
    return { valid: false, error: "„Von“ darf nicht nach „Bis“ liegen. Bitte Zeitraum korrigieren." };
  }
  if (str(s.user_id) && !/^\d+$/.test(str(s.user_id))) {
    return { valid: false, error: "Die Kunden-ID muss eine Zahl sein." };
  }
  return { valid: true, error: "" };
}

export function hasActiveShipmentFilters(f) {
  const s = f && typeof f === "object" ? f : {};
  return Object.keys(EMPTY_SHIPMENT_FILTERS).some((k) =>
    k === "has_tracking" ? s[k] !== undefined && s[k] !== "all" : str(s[k]) !== "");
}

// Aktive Filter als sichtbare Chips.
export function activeShipmentFilterChips(f) {
  const s = f && typeof f === "object" ? f : {};
  const chips = [];
  if (str(s.user_id)) chips.push({ key: "user_id", label: `Kunden-ID: ${str(s.user_id)}` });
  if (str(s.status)) {
    const o = SHIPMENT_STATUS_FILTER_OPTIONS.find((x) => x.value === s.status);
    chips.push({ key: "status", label: `Status: ${o ? o.label : s.status}` });
  }
  if (str(s.carrier)) chips.push({ key: "carrier", label: `Carrier: ${str(s.carrier)}` });
  if (str(s.created_from)) chips.push({ key: "created_from", label: `Ab ${str(s.created_from)}` });
  if (str(s.created_to)) chips.push({ key: "created_to", label: `Bis ${str(s.created_to)}` });
  if (s.has_tracking === "yes") chips.push({ key: "has_tracking", label: "Mit Tracking" });
  else if (s.has_tracking === "no") chips.push({ key: "has_tracking", label: "Ohne Tracking" });
  return chips;
}

// Leerzustand: „noch gar keine Sendungen" vs. „für diese Filter nichts gefunden".
export function shipmentEmptyState({ count = 0, filters = EMPTY_SHIPMENT_FILTERS } = {}) {
  if (count > 0) return { show: false, title: "", text: "" };
  if (hasActiveShipmentFilters(filters)) {
    return {
      show: true,
      title: "Für diese Filter wurden keine Sendungen gefunden.",
      text: "Passen Sie den Zeitraum oder die Filter an — oder setzen Sie sie zurück.",
    };
  }
  return { show: true, title: "Noch keine Sendungen vorhanden.", text: "Sobald Kunden buchen, erscheinen die Sendungen hier." };
}

// ── Detailseite: Abschnitts-Sichtbarkeit ────────────────────────────────────
// Zollabschnitt NUR bei tatsächlicher Zollrelevanz — nicht als leere Karte bei
// Inlandssendungen. Zollrelevant ist eine Sendung, wenn Ursprungs- und Zielland
// abweichen UND das Zielland ausserhalb der EU liegt, oder wenn ein Warenwert
// gespeichert ist. Die Liste der EU-Länder ist ein reiner Anzeige-Helfer; die
// fachliche Zollprüfung bleibt vollständig im Backend/Buchungspfad.
const EU_COUNTRIES = Object.freeze(new Set([
  "AT","BE","BG","CY","CZ","DE","DK","EE","ES","FI","FR","GR","HR","HU","IE",
  "IT","LT","LU","LV","MT","NL","PL","PT","RO","SE","SI","SK",
]));

export function isCustomsRelevant(row) {
  const f = shipmentFields(row);
  const goodsValue = numOrNull(firstDefined(row?.goods_value, row?.goodsValue));
  if (goodsValue !== null && goodsValue > 0) return true;
  if (!f.fromCountry || !f.toCountry) return false;
  const from = f.fromCountry.toUpperCase();
  const to = f.toCountry.toUpperCase();
  if (from === to) return false;
  return !EU_COUNTRIES.has(to);
}

// Welche Detailabschnitte werden gerendert? Verhindert leere Karten.
// → { customs, tracking, label, invoice, customer }
export function detailSections(row) {
  const f = shipmentFields(row);
  const inv = row && typeof row.invoice === "object" && row.invoice ? row.invoice : null;
  return {
    customer: !!(f.customerCompany || f.customerNumber || f.customerName || f.userId !== null),
    tracking: f.hasTracking || !!f.trackingStatus || !!str(row?.tracking_number),
    label: f.labelAvailable,
    invoice: !!inv,
    customs: isCustomsRelevant(row),
  };
}

// ── Lade-/Fehlerzustände des Details ────────────────────────────────────────
export const SHIPMENT_DETAIL_ERRORS = Object.freeze({
  404: "Die Sendung wurde nicht gefunden.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Die Sendung konnte nicht geladen werden.",
  default: "Die Sendung konnte nicht geladen werden.",
});

// → { text, notFound, retryable }
// 401/403 → null (zentrales Auth-Verhalten übernimmt Logout/Redirect).
export function shipmentDetailError(status) {
  if (status === 401 || status === 403) return null;
  if (status === 404) return { text: SHIPMENT_DETAIL_ERRORS[404], notFound: true, retryable: false };
  return {
    text: SHIPMENT_DETAIL_ERRORS[status] || SHIPMENT_DETAIL_ERRORS.default,
    notFound: false,
    retryable: true,
  };
}
