// utils/adminShipmentDetailView.mjs — reine Ansichtsbibliothek des Admin-Sendungsdetails.
//
// Seit der Modularisierung wörtlich aus pages/admin/AdminShipmentDetailPage.jsx
// herausgelöst (Response-Selektoren, Feld-Getter, Formatierung, Adressaufbereitung) —
// Kommentare und Logik unverändert. Bewusst NICHT hier: labelFormatDisplay (liefert
// JSX und bleibt mit LABEL_FORMAT_NAMES in der Seite) sowie die präsentationalen
// Bausteine KV/AddressBlock. Kein React, kein JSX, kein API-Zugriff — dieselbe Rolle
// wie utils/adminShipmentView.mjs daneben, nur für die Detailseite.
import { trackingLinkOrNull } from "./adminShipmentView.mjs";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

// [badge-Klasse, Anzeigetext]. Farbe heuristisch nach Status-Schlüsselwort,
// unbekannt → neutral. Angezeigt wird der minimierte Backend-Status als Text.
// Ohne Status wird KEIN Status behauptet — der Badge benennt das Fehlen.
function trackStatusMeta(status) {
  if (status === undefined || status === null || status === "") return ["badge-gray", "Kein Trackingstatus"];
  const s = String(status).toLowerCase();
  if (/deliver|zugestellt/.test(s)) return ["badge-green", String(status)];
  if (/transit|unterwegs|zustellung|out.?for/.test(s)) return ["badge-blue", String(status)];
  if (/delay|verzöger|verzoeger|exception|problem|hold/.test(s)) return ["badge-yellow", String(status)];
  if (/fail|fehl|return|retoure|cancel|storn/.test(s)) return ["badge-red", String(status)];
  return ["badge-gray", String(status)];
}

// Selektiert AUSSCHLIESSLICH die minimierten Felder — nie Events/Steps oder ein
// ganzes JUMiNGO-Objekt. Liest top-level und (defensiv) unter `tracking`, aber
// immer nur die erlaubten Skalar-Schlüssel.
function selectTracking(d) {
  const o = d && typeof d === "object" ? d : {};
  const nested = o.tracking && typeof o.tracking === "object" ? o.tracking : null;
  const pick = (...keys) => {
    for (const k of keys) {
      const v = o[k] !== undefined ? o[k] : nested ? nested[k] : undefined;
      if (v !== undefined && v !== null && v !== "") return v;
    }
    return undefined;
  };
  // Carrier-Link: NUR was das Backend liefert. Es wird keine Tracking-URL aus
  // Carrier + Nummer zusammengesetzt. Die Prüfung auf http(s) greift schon hier,
  // damit gar kein javascript:-Wert in den State gelangt — dieselbe Funktion
  // prüft beim Rendern erneut.
  const link = pick("carrierTrackingPage", "carrier_tracking_url", "carrier_tracking_page", "carrierTrackingUrl", "tracking_url");
  return {
    available: pick("trackingAvailable", "tracking_available", "available"),
    status: pick("trackingStatus", "tracking_status", "status"),
    number: pick("trackingNumber", "tracking_number"),
    link: trackingLinkOrNull(typeof link === "string" ? link : null),
    carrier: pick("carrier", "carrier_name", "carrierName"),
    source: pick("source", "quelle"),
  };
}

// Sendungsobjekt defensiv aus der Response ziehen (evtl. unter { shipment }).
function selectShipment(d) {
  if (d && typeof d === "object" && !Array.isArray(d)) {
    if (d.shipment && typeof d.shipment === "object") return d.shipment;
    if (d.data && typeof d.data === "object" && !Array.isArray(d.data)) return d.data;
    return d;
  }
  return null;
}

// ── Feld-Getter (nur erlaubte Felder; nie ganze Objekte rendern) ─────────────
const idOf = (s) => firstDefined(s.id, s.shipment_id, s.shipmentId);
const userIdOf = (s) => firstDefined(s.user_id, s.userId);
const statusOf = (s) => firstDefined(s.status, s.state);
const carrierOf = (s) => firstDefined(s.carrier, s.selected_carrier, s.carrier_name, s.carrierName);
const serviceOf = (s) => firstDefined(s.service_type, s.serviceType, s.service, s.shipment_type);
const dateOf = (s) => firstDefined(s.created_at, s.createdAt, s.created, s.date);
const labelAvailOf = (s) => firstDefined(s.label_available, s.labelAvailable);
const fromCountryOf = (s) => firstDefined(s.from_country, s.fromCountry, s.origin_country);
const toCountryOf = (s) => firstDefined(s.to_country, s.toCountry, s.destination_country);
const fromZipOf = (s) => firstDefined(s.from_zip, s.fromZip, s.origin_zip);
const toZipOf = (s) => firstDefined(s.to_zip, s.toZip, s.destination_zip);
const weightOf = (s) => firstDefined(s.weight, s.weight_kg, s.total_weight);
const lengthOf = (s) => firstDefined(s.length, s.length_cm, s.l);
const widthOf = (s) => firstDefined(s.width, s.width_cm, s.b, s.w);
const heightOf = (s) => firstDefined(s.height, s.height_cm, s.h);
const pkgOf = (s) => firstDefined(s.package_count, s.packageCount, s.packages, s.parcel_count);
const refOf = (s) => firstDefined(s.reference_number, s.reference, s.customer_reference);

const jumingoOf = (s) => firstDefined(s.jumingo_shipment_id, s.jumingoShipmentId, s.jumingo_id, s.jumingo_shipment_id_masked);
const orderOf = (s) => firstDefined(s.order_number, s.orderNumber, s.order_id);
const invoiceOf = (s) => (s.invoice && typeof s.invoice === "object" ? s.invoice : null);
// Zusätzliche Sendungsbenachrichtigungen. Ein Backend ohne dieses Feld liefert es
// schlicht nicht — dann bleibt die Liste leer und die Karte erscheint gar nicht.
const emailDeliveriesOf = (s) =>
  Array.isArray(s.email_deliveries) ? s.email_deliveries
  : Array.isArray(s.emailDeliveries) ? s.emailDeliveries
  : [];

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  // Ohne Sekunden — dieselbe Regel wie dtDE() im Kundenportal (Paket C). Der
  // Zeitpunkt bleibt identisch, nur die Darstellung ist ruhiger. Der
  // Rohwert-Fallback für unparsbare Werte bleibt unverändert.
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString("de-DE", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

const asStr = (v) => (v != null && v !== "" ? String(v) : null);
const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");

// Referenz: nur wenn unkritisch/kurz — sonst gekürzt (kein Masking, aber kein
// überlanger Freitext im DOM).
function refDisplay(v) {
  const s = asStr(v);
  if (!s) return "—";
  return s.length > 40 ? `${s.slice(0, 40)}…` : s;
}

function dimensions(s) {
  const l = lengthOf(s), w = widthOf(s), h = heightOf(s);
  if (l == null && w == null && h == null) return "—";
  const part = (x) => (x == null || x === "" ? "?" : String(x));
  return `${part(l)} × ${part(w)} × ${part(h)} cm`;
}

function routeStr(s) {
  const from = fromCountryOf(s), to = toCountryOf(s);
  if (!from && !to) return "—";
  return `${asStr(from)?.toUpperCase() || "?"} → ${asStr(to)?.toUpperCase() || "?"}`;
}

// ── Adresse strukturiert aufbereiten (KEIN Object.keys, feste Feldliste) ─────
function buildAddress(addr) {
  if (addr === null || addr === undefined) return { state: "none" };
  if (typeof addr === "string") return addr.trim() ? { state: "string", text: addr.trim() } : { state: "none" };
  if (typeof addr !== "object" || Array.isArray(addr)) return { state: "none" };
  if (addr.anonymized === true || addr.is_anonymized === true || addr.tombstoned === true || addr.deleted === true || addr.anonymized_at) {
    return { state: "anon" };
  }
  const fields = [
    ["Firma", firstDefined(addr.company, addr.company_name, addr.firma)],
    ["Name", firstDefined(addr.name, addr.contact_name, addr.full_name, addr.contact)],
    ["Straße", firstDefined(addr.street, addr.street1, addr.address1, addr.strasse, addr.address_line1)],
    ["Zusatz", firstDefined(addr.address_addition, addr.addition, addr.street2, addr.address2, addr.zusatz, addr.address_line2)],
    ["PLZ", firstDefined(addr.zip, addr.postal_code, addr.plz, addr.postcode, addr.zip_code)],
    ["Stadt", firstDefined(addr.city, addr.stadt, addr.town, addr.ort)],
    ["Land", firstDefined(addr.country, addr.country_code, addr.land)],
    ["Telefon", firstDefined(addr.phone, addr.tel, addr.telefon, addr.phone_number)],
    ["E-Mail", firstDefined(addr.email, addr.e_mail, addr.mail)],
  ];
  if (!fields.some(([, v]) => v != null && v !== "")) return { state: "anon" };
  return { state: "object", fields };
}

export {
  firstDefined,
  trackStatusMeta, selectTracking, selectShipment,
  idOf, userIdOf, statusOf, carrierOf, serviceOf, dateOf, labelAvailOf,
  fromCountryOf, toCountryOf, fromZipOf, toZipOf, weightOf, lengthOf, widthOf, heightOf,
  pkgOf, refOf, jumingoOf, orderOf, invoiceOf, emailDeliveriesOf,
  fmtDateTime, fmtDate, asStr, dash, refDisplay, dimensions, routeStr, buildAddress,
};
