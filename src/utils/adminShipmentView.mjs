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

import { CUSTOMS_UI_ENABLED } from "../config/launchMode.mjs";

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
    // Sichtbare Vorgangsnummer (CE-AB…) — ausschließlich aus dem fachlichen Feld,
    // nie aus der ID und nie aus einer Providerreferenz.
    orderConfirmationNumber: str(firstDefined(r.order_confirmation_number, r.orderConfirmationNumber)),
    // Interne Legacy-Referenz (CE-BS…). Bleibt für den technischen Adminbereich
    // erhalten, ist aber NICHT mehr der sichtbare Geschäftsidentifier.
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
// Primär die Auftragsbestätigungsnummer (CE-AB…) — die sichtbare CE-Vorgangsnummer.
// Fehlt sie, wird KEINE Nummer erfunden, keine aus der ID abgeleitet und
// ausdrücklich NICHT auf die interne Bestellnummer (CE-BS…) oder eine
// JUMiNGO-Referenz zurückgefallen — stattdessen ein ehrlicher Zustand.
//
// → { primary, kind }
//   kind: "order_confirmation" | "draft" | "missing"
export function shipmentIdentity(row) {
  const f = shipmentFields(row);
  if (f.orderConfirmationNumber) return { primary: f.orderConfirmationNumber, kind: "order_confirmation" };
  if (f.status === "draft") return { primary: "Entwurf", kind: "draft" };
  // Gebuchte Sendungen aus der Zeit vor Einführung der Auftragsbestätigung.
  return { primary: "Ohne Vorgangsnummer", kind: "missing" };
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

// ── Tracking — drei fachlich getrennte Zustände ─────────────────────────────
//
// Auf der Detailseite trugen bisher ZWEI verschiedene Sachverhalte dieselbe
// Beschriftung „Tracking" und widersprachen sich dadurch optisch:
//
//   A) shipments.tracking_number — die bei ConfidaraExpress GESPEICHERTE
//      Carrier-Trackingnummer. Sie kommt mit dem Sendungsdatensatz und ist auch
//      ohne jede Live-Abfrage vorhanden.
//   B) GET /admin/shipments/:id/tracking → trackingAvailable — das Ergebnis der
//      LIVE-Abfrage. Das Backend setzt dieses Flag auf Boolean(tracking_number
//      AUS DER LIVE-ANTWORT) und sagt damit nichts über A aus.
//
// Beide Aussagen sind für sich korrekt. Getrennt benannt werden sie eindeutig:
//
//   1. TRACKINGNUMMER (gespeichert)  — aus dem Sendungsdatensatz          (A)
//   2. LIVE-TRACKINGDATEN            — Status/Nummer aus der Abfrage      (B)
//   3. CARRIER-LINK                  — ausschließlich carrierTrackingPage
//      aus der Backendantwort. Es wird NIE eine Tracking-URL selbst
//      zusammengesetzt und keine Nummer geraten.
//
// Vorbedingung für 2 und 3: eine JUMiNGO-Sendungs-ID muss hinterlegt sein —
// ohne sie antwortet das Backend auf die Live-Abfrage mit 409.

export const TRACKING_LABELS = Object.freeze({
  storedBadge: "Trackingnummer vorhanden",
  storedNumber: "Trackingnummer (gespeichert)",
  liveTitle: "Live-Trackingdaten",
  liveNumber: "Trackingnummer (Carrier)",
  liveStatus: "Trackingstatus",
  carrierLink: "Carrier-Link",
  lookupAction: "Live-Tracking abfragen",
});

export const TRACKING_HINTS = Object.freeze({
  lookupBlocked:
    "Für diese Sendung ist keine JUMiNGO-Sendungs-ID hinterlegt. Ohne sie kann beim Versanddienstleister nichts abgefragt werden.",
  noLiveData:
    "Der Versanddienstleister liefert zu dieser Sendung noch keine Live-Trackingdaten. Eine gespeicherte Trackingnummer bleibt davon unberührt.",
  noLink:
    "Das Backend hat keinen Carrier-Link geliefert. Es wird bewusst keine Tracking-URL selbst zusammengesetzt.",
  // Kurzwert, kein Satz: er steht in einer schmalen .adm-kv-Zelle (min. 210 px),
  // in der ein langer Text mit `word-break: break-word` mitten im Wort bräche.
  noStoredNumber: "Nicht gespeichert",
});

// Tri-State-Deutung eines Backend-Booleans: true | false | null (unbekannt).
const boolish = (v) => {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return null;
};

// Nur valide http(s)-Links zulassen — verhindert javascript:-URLs im DOM.
// Wird an ZWEI Stellen gebraucht (beim Übernehmen in den State und beim
// Rendern), existiert aber bewusst nur einmal.
export const trackingLinkOrNull = (v) =>
  typeof v === "string" && /^https?:\/\/\S/i.test(v.trim()) ? v.trim() : null;

// (1) Gespeicherte Trackingnummer — AUSSCHLIESSLICH aus dem Sendungsdatensatz.
// `number` ist der Rohwert; maskiert wird in der Komponente (maskTail), damit
// die Anzeigelogik nicht doppelt existiert.
// → { present, number }
export function storedTracking(row) {
  const r = row && typeof row === "object" ? row : {};
  const number = str(firstDefined(
    r.tracking_number, r.trackingNumber,
    r.tracking_number_masked, r.masked_tracking_number, r.maskedTrackingNumber));
  // has_tracking allein genügt als Beleg: die Nummer selbst kann in einer
  // reduzierten Antwort fehlen. Der Status zählt hier bewusst NICHT — er ist
  // eine andere Aussage und hat die alte Vermischung mitverursacht.
  return { present: !!number || firstDefined(r.has_tracking, r.hasTracking) === true, number };
}

// (Vorbedingung) Ist eine Live-Abfrage überhaupt möglich?
// Ohne jumingo_shipment_id antwortet GET /admin/shipments/:id/tracking mit 409 —
// der Button wird dann gar nicht erst aktiv angeboten.
//
// Bewusst FAIL-OPEN, wenn das Feld in der Antwort gar nicht vorkommt: gesperrt
// wird nur, wenn es vorhanden UND leer ist (der belegte Alt-Sendungsfall).
// Fehlt es ganz, ist der Zustand unbekannt — dann entscheidet weiterhin das
// Backend, statt einer berechtigten Supportaktion vorsorglich den Weg zu
// verbauen. Das Frontend ersetzt die serverseitige Prüfung nicht.
// → { possible, hint }
const JUMINGO_ID_KEYS = Object.freeze([
  "jumingo_shipment_id", "jumingoShipmentId",
  "masked_jumingo_shipment_id", "maskedJumingoShipmentId",
]);

export function trackingLookup(row) {
  if (!row || typeof row !== "object") return { possible: false, hint: TRACKING_HINTS.lookupBlocked };
  if (!JUMINGO_ID_KEYS.some((k) => k in row)) return { possible: true, hint: "" };
  const id = str(firstDefined(...JUMINGO_ID_KEYS.map((k) => row[k])));
  return { possible: !!id, hint: id ? "" : TRACKING_HINTS.lookupBlocked };
}

// (2)+(3) Live-Trackingdaten und Carrier-Link aus der Antwort der Live-Abfrage.
// `live` ist das bereits minimierte Objekt der Seite
// ({ available, status, number, link, carrier, source }) — hier wird nichts
// nachgeladen und nichts ergänzt.
// → { loaded, hasData, status, number, carrier, source, link, hint }
export function liveTracking(live) {
  const l = live && typeof live === "object" ? live : null;
  if (!l) {
    return { loaded: false, hasData: false, status: "", number: "", carrier: "", source: "", link: null, hint: "" };
  }
  const number = str(l.number);
  const status = str(l.status);
  const flag = boolish(l.available);
  // Das Backend setzt trackingAvailable = Boolean(Live-Trackingnummer). Ein
  // gelieferter Status ist ebenfalls ein Live-Datum; fehlt das Flag, entscheidet
  // allein der tatsächliche Inhalt — nie eine Annahme.
  const hasData = flag === true || !!number || !!status;
  return {
    loaded: true,
    hasData,
    status,
    number,
    carrier: str(l.carrier),
    source: str(l.source),
    link: trackingLinkOrNull(l.link),
    hint: hasData ? "" : TRACKING_HINTS.noLiveData,
  };
}

// Gemeinsames Tracking-View-Model für Kopfbereich, Versanddaten und Live-Block.
// EINE Quelle — in der Komponente existiert keine zweite Bedingungslogik mehr.
// → { stored, lookup, live, link }
export function trackingView(row, live) {
  const liveState = liveTracking(live);
  return {
    stored: storedTracking(row),
    lookup: trackingLookup(row),
    live: liveState,
    link: {
      available: !!liveState.link,
      url: liveState.link,
      // Der Hinweis gilt erst, wenn tatsächlich abgefragt wurde.
      hint: liveState.loaded && !liveState.link ? TRACKING_HINTS.noLink : "",
    },
  };
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
//
// `trackingNumber` hieß vorher `tracking` und vermischte drei Aussagen
// (gespeicherte Nummer ODER gespeicherter Status ODER Rohfeld). Der Schlüssel
// heißt jetzt so, wie das Kopf-Badge beschriftet ist, und stammt aus derselben
// Quelle wie der Wert in den Versanddaten — beide können nicht mehr auseinander
// laufen.
// → { customs, trackingNumber, label, invoice, customer }
export function detailSections(row) {
  const f = shipmentFields(row);
  const inv = row && typeof row.invoice === "object" && row.invoice ? row.invoice : null;
  return {
    customer: !!(f.customerCompany || f.customerNumber || f.customerName || f.userId !== null),
    trackingNumber: storedTracking(row).present,
    label: f.labelAvailable,
    invoice: !!inv,
    // Launch-Modus: die Zollkarte erscheint nicht.
    //
    // Anders als bei den kundenseitigen Flächen ist das hier eine ausdrückliche
    // Betreiberentscheidung und keine Folge fehlender Daten: es gibt aktuell keine
    // produktiven Kunden und damit keine historische Zollsendung, deren Karte einem Admin
    // noch etwas zeigen würde. Sichtbar bliebe eine Rubrik für ein Produkt, das
    // ConfidaraExpress nicht anbietet.
    //
    // `isCustomsRelevant(row)` bleibt in der Bedingung stehen und unverändert erhalten —
    // für Customs V2 fällt hier nur die Konstante weg. Es wird kein Feld der Antwort
    // ausgeblendet und kein gespeicherter Zollsnapshot angetastet.
    customs: CUSTOMS_UI_ENABLED && isCustomsRelevant(row),
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

// ── Entwurfsaufräumung (Admin → Sendungen) ──────────────────────────────────
// Admin → Sendungen füllt sich mit Zeilen im Status „Entwurf": JEDER Preisrechnerlauf
// legt serverseitig eine an. Diese Helfer entscheiden ausschließlich über die ANZEIGE
// der Löschaktionen. Die verbindliche Prüfung liegt im Backend
// (lib/adminDraftDeletion.js) und läuft im Moment des Löschens erneut — das Frontend
// darf eine Löschbarkeit nie behaupten, sondern nur anbieten.
//
// Produktentscheidung: Einzellöschung und Sammelaktion unterscheiden sich bewusst.
// Der Admin darf JEDEN Entwurf gezielt einzeln löschen — auch einen bewusst vom Kunden
// gespeicherten (er entscheidet hier pro Datensatz). Die Sammelaktion „Entwürfe
// bereinigen" fasst dagegen NUR technische, nicht gespeicherte Entwürfe an; ein
// gespeicherter Kundenentwurf wird davon nie erfasst. Diese Unterscheidung trifft
// ausschließlich das Backend (BULK_DELETE_CONDITIONS vs. SINGLE_DELETE_CONDITIONS in
// lib/adminDraftDeletion.js) — das Frontend bildet sie nicht nach, es übernimmt nur die
// vom Server gelieferte Zahl und formuliert den Dialogtext entsprechend.

// Zeigt diese Zeile eine EINZEL-Löschaktion? Ausschließlich beim sichtbaren Status
// „draft" UND wenn eine ID vorliegt (ohne ID gäbe es kein Ziel). Bewusst KEINE
// Nachbildung der serverseitigen Zusatz-Guards (Ordernummer/Label/Tracking/Rechnung)
// UND bewusst UNABHÄNGIG davon, ob es sich um einen gespeicherten Entwurf handelt: die
// Adminliste führt diese Felder gar nicht vollständig, und eine halbe Kopie der
// Sicherheitsregel im Client wäre schlechter als gar keine — sie würde Sicherheit
// vortäuschen. Weicht der Serverzustand ab, antwortet das Backend mit 409 und die UI
// zeigt genau das an.
export function canDeleteShipmentDraft(row) {
  const f = shipmentFields(row);
  return f.id != null && f.status.toLowerCase() === "draft";
}

// Anzahl der systemweit durch die SAMMELAKTION löschbaren Entwürfe aus der Listenantwort
// (additives Feld `deletableDraftTotal`) — das Backend zählt hier ausschließlich
// technische, nicht gespeicherte Entwürfe (is_saved_draft wird ausgeschlossen). Bewusst
// NICHT aus den geladenen Zeilen gezählt: die Liste ist gefiltert und paginiert, die
// Sammelaktion wirkt systemweit. Fehlt das Feld oder ist es unbrauchbar → null, und der
// Dialog nennt dann bewusst KEINE Zahl statt einer geratenen.
export function selectDeletableDraftTotal(d) {
  const raw = d && typeof d === "object" ? d.deletableDraftTotal : null;
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) return null;
  return Math.floor(raw);
}

// Fehlermeldungen der Einzellöschung. 409 ist der fachlich wichtige Fall: die Zeile
// existiert, ist aber inzwischen gebucht/abgerechnet — der Admin soll den Grund erfahren.
// 401/403 → null (zentrales Auth-Verhalten übernimmt).
export const DRAFT_DELETE_ERRORS = Object.freeze({
  404: "Dieser Entwurf existiert nicht mehr. Die Liste wird aktualisiert.",
  409: "Dieser Entwurf kann nicht mehr gelöscht werden, da sich sein Status inzwischen geändert hat.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  default: "Der Entwurf konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.",
});
export function draftDeleteError(status) {
  if (status === 401 || status === 403) return null;
  return DRAFT_DELETE_ERRORS[status] || DRAFT_DELETE_ERRORS.default;
}

export const DRAFT_BULK_DELETE_ERRORS = Object.freeze({
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  default: "Die Entwürfe konnten nicht gelöscht werden. Bitte versuchen Sie es erneut.",
});
export function draftBulkDeleteError(status) {
  if (status === 401 || status === 403) return null;
  return DRAFT_BULK_DELETE_ERRORS[status] || DRAFT_BULK_DELETE_ERRORS.default;
}

// Erfolgsmeldung der Sammellöschung — die Zahl stammt IMMER aus der Backendantwort
// (deletedCount), nie aus einer Schätzung der Liste; sie umfasst ausschließlich
// TECHNISCHE Entwürfe (die Sammelaktion lässt gespeicherte unangetastet). 0 ist kein
// Fehler, sondern die ehrliche Aussage „es gab nichts zu bereinigen" — NICHT „keine
// Entwürfe mehr vorhanden": gespeicherte Kundenentwürfe können weiterhin existieren.
export function draftBulkDeleteMessage(deletedCount) {
  const n = Number.isFinite(deletedCount) ? Math.max(0, Math.floor(deletedCount)) : 0;
  if (n === 0) return "Es waren keine automatisch erzeugten Entwürfe zum Bereinigen vorhanden.";
  if (n === 1) return "1 automatisch erzeugter Entwurf wurde gelöscht.";
  return `${n} automatisch erzeugte Entwürfe wurden gelöscht.`;
}

// Beschriftung von Auslöser- und Bestätigungsbutton. Mit bekannter Zahl wird sie
// genannt (deckt praktisch jeden Fall ab, da der Auslöser nur bei total > 0 sichtbar
// ist), sonst bleibt sie neutral — es wird nie eine Zahl geraten. Bewusst NICHT mehr
// „Alle Entwürfe löschen": das Wort „alle" wäre nach der Produktentscheidung falsch,
// seit gespeicherte Kundenentwürfe von der Sammelaktion ausdrücklich verschont bleiben.
export function draftBulkConfirmLabel(total) {
  if (!Number.isFinite(total) || total <= 0) return "Entwürfe bereinigen";
  return total === 1 ? "1 Entwurf löschen" : `${total} Entwürfe löschen`;
}

// Fließtext des Bulk-Dialogs. Nennt die Zahl nur, wenn sie bekannt ist, benennt die
// Entwürfe ausdrücklich als „automatisch erzeugt, nicht gespeichert" (das ist die
// tatsächliche Reichweite der Aktion) und stellt in beiden Fällen klar, dass gespeicherte
// Kundenentwürfe zusätzlich zu gebuchten/stornierten/abgeschlossenen Sendungen erhalten
// bleiben — die zentrale Zusicherung, die diese Nachbesserung einführt.
export function draftBulkConfirmText(total) {
  const bleibtErhalten =
    "Vom Kunden gespeicherte Entwürfe sowie gebuchte, stornierte oder abgeschlossene Sendungen bleiben erhalten.";
  if (!Number.isFinite(total) || total <= 0) {
    return `Automatisch erzeugte, nicht gespeicherte Entwürfe werden endgültig gelöscht. ${bleibtErhalten}`;
  }
  const satz = total === 1
    ? "1 automatisch erzeugter, nicht gespeicherter Entwurf wird endgültig gelöscht."
    : `${total} automatisch erzeugte, nicht gespeicherte Entwürfe werden endgültig gelöscht.`;
  return `${satz} ${bleibtErhalten}`;
}

// ── Pagination-Darstellung (Admin → Sendungen) ──────────────────────────────
// Die frühere Formulierung „Seite 1 · 5 gesamt" vermischte zwei verschiedene
// Aussagen — GESAMTANZAHL der Sendungen und ANZAHL DER SEITEN — und ließ bei
// genau einer Seite zwei dauerhaft deaktivierte Zurück-/Weiter-Buttons stehen,
// obwohl es technisch korrekt war (5 gesamt = fünf SENDUNGEN, nicht fünf Seiten).
// Diese Funktion trennt beide Aussagen sauber und entscheidet zusätzlich, ob die
// Navigation überhaupt einen Sinn ergibt.
//
// total kommt unverändert aus selectListTotal() — nie geraten, nie hochgerechnet.
// Ist es (ausnahmsweise) unbekannt, weil das Backend keinen Zähler liefert,
// degradiert die Funktion ehrlich auf die alte, seitenzahl-lose Anzeige statt
// eine Gesamt- oder Seitenzahl zu erfinden; die Navigation bleibt dann nutzbar
// (showNav: true), weil ohne Gesamtzahl nicht ausgeschlossen werden kann, dass
// es weitere Seiten gibt.
//
// → { totalPages, showNav, label }
//   totalPages: Anzahl der Seiten, oder null wenn total unbekannt ist.
//   showNav:    soll die Zurück-/Weiter-Navigation überhaupt gerendert werden?
//               false NUR wenn total bekannt ist UND totalPages <= 1 — dann
//               gäbe es ohnehin nie eine zweite Seite, und dauerhaft
//               deaktivierte Buttons sind kein sinnvoller UI-Zustand.
//   label:      Anzeigetext. Bei genau einer Seite NUR die Gesamtanzahl
//               ("5 Sendungen"/"1 Sendung", Singular berücksichtigt) — OHNE
//               "Seite 1 ·"-Präfix, der bei einer einzigen Seite nichts
//               Zusätzliches aussagt. Bei mehreren Seiten "Seite X von Y ·
//               Z Sendungen".
export function shipmentPaginationView({ page, pageSize, total }) {
  const p = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  if (!Number.isFinite(total) || total < 0) {
    return { totalPages: null, showNav: true, label: `Seite ${p}` };
  }
  const n = Math.max(0, Math.floor(total));
  const size = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 1;
  const totalPages = Math.max(1, Math.ceil(n / size));
  const countLabel = n === 1 ? "1 Sendung" : `${n} Sendungen`;
  if (totalPages <= 1) return { totalPages, showNav: false, label: countLabel };
  return { totalPages, showNav: true, label: `Seite ${p} von ${totalPages} · ${countLabel}` };
}
