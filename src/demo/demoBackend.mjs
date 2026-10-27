// Die Datenquelle der Kundenbereich-Demo: beantwortet jede Anfrage der echten Kundenseiten im Browser — mit
// Beispieldaten eines erfundenen Kontos und simulierten Aktionen. Kein Netz, kein Server, keine Provideraktion.
//
// Die Antworten folgen den Verträgen der echten API (dieselben Felder wie die Browser-E2E-Attrappen), damit die
// Seiten unverändert arbeiten. Änderungen (Adresse anlegen, Supportanfrage, Buchung) wirken in dieser Seitenladung
// weiter und sind beim nächsten Öffnen der Demo wieder auf dem Ausgangsstand. Alle Nummern tragen „SIM" bzw.
// „DEMO", jedes Dokument den Aufdruck „SIMULATION".
import { DEMO_TEXTE } from "./demoModus.mjs";
import { demoPdf } from "./demoPdf.mjs";

const EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"];

// ── Zeit ─────────────────────────────────────────────────────────────────────────────────────────────────────
const zwei = (n) => String(n).padStart(2, "0");
const isoDatum = (d) => `${d.getFullYear()}-${zwei(d.getMonth() + 1)}-${zwei(d.getDate())}`;
function tagVerschoben(tage, stunde = 10) {
  const d = new Date();
  d.setHours(stunde, 0, 0, 0);
  d.setDate(d.getDate() + tage);
  return d;
}
function werktag(ab = 0) {
  const d = tagVerschoben(ab);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return d;
}
const zeitstempel = (tage, stunde = 10) => tagVerschoben(tage, stunde).toISOString();
const runde = (n) => Math.round(n * 100) / 100;

// ── Das erfundene Konto ──────────────────────────────────────────────────────────────────────────────────────
function konto() {
  return {
    id: 9001,
    email: "max.mustermann@muster-logistik.example",
    company_name: "Muster Logistik GmbH",
    name: "Max Mustermann",
    contact_name: "Max Mustermann",
    contact_email: "versand@muster-logistik.example",
    contact_phone: "+49 711 0000000",
    phone: "+49 711 0000000",
    role: "customer",
    status: "approved",
    country: "DE",
    zip: "70173",
    city: "Stuttgart",
    street: "Königstraße 10",
    customer_number: "CE-K-DEMO",
    vat_id: "DE000000000",
    eori_number: null,
    delivery_note_mode: "none",
    billing_mode: "single",
    payment_term: 7,
    created_at: zeitstempel(-120),
  };
}

// Adressbucheinträge in der Form der echten API (GET /api/kunde/addresses → { items, nextCursor }).
const adresse = (id, felder) => ({
  id, label: "", company: "", contactName: "", firstName: "", lastName: "", email: "", phone: "", streetAndNumber: "",
  addressAdd: "", postalCode: "", city: "", state: "", country: "DE", notes: "", role: "recipient", favorite: false,
  isDefaultSender: false, isDefaultRecipient: false, ...felder,
});
const ADRESSEN = () => [
  adresse(1, { label: "Versand Stuttgart", role: "sender", company: "Muster Logistik GmbH", firstName: "Max", lastName: "Mustermann",
    streetAndNumber: "Königstraße 10", postalCode: "70173", city: "Stuttgart", email: "versand@muster-logistik.example",
    phone: "+49 711 0000000", favorite: true, isDefaultSender: true }),
  adresse(2, { label: "Alpen Handels GmbH", company: "Alpen Handels GmbH", firstName: "Lukas", lastName: "Huber",
    streetAndNumber: "Mariahilfer Straße 88", postalCode: "1070", city: "Wien", country: "AT", email: "wareneingang@alpen-handel.example",
    phone: "+43 1 0000000", favorite: true, isDefaultRecipient: true }),
  adresse(3, { label: "Atelier Lumière", company: "Atelier Lumière SARL", firstName: "Camille", lastName: "Martin",
    streetAndNumber: "12 Rue de Rivoli", postalCode: "75004", city: "Paris", country: "FR", email: "logistique@atelier-lumiere.example",
    phone: "+33 1 00000000" }),
  adresse(4, { label: "Nordhafen Technik", company: "Nordhafen Technik GmbH", firstName: "Jana", lastName: "Petersen",
    streetAndNumber: "Am Sandtorkai 4", addressAdd: "Halle 2", postalCode: "20457", city: "Hamburg", email: "lager@nordhafen-technik.example",
    phone: "+49 40 0000000", favorite: true }),
  adresse(5, { label: "Studio Verde", role: "both", company: "Studio Verde S.r.l.", firstName: "Giulia", lastName: "Rossi",
    streetAndNumber: "Via Torino 21", postalCode: "20123", city: "Mailand", country: "IT", email: "ordini@studio-verde.example",
    phone: "+39 02 0000000" }),
];

// Formularentwürfe in der Form der echten API: Liste mit summary, „Fortsetzen“ mit formData (Fassung 1).
function formEntwurf(id, tage, absenderId, empfaengerId, paket) {
  const partei = (a) => ({ company: a.company, fullName: `${a.firstName} ${a.lastName}`, streetAndNumber: a.streetAndNumber,
    postalCode: a.postalCode, city: a.city, country: a.country, email: a.email, phone: a.phone });
  const abs = ADRESSEN().find((a) => a.id === absenderId);
  const empf = ADRESSEN().find((a) => a.id === empfaengerId);
  const versand = isoDatum(werktag(3));
  return {
    id, revision: 1, schemaVersion: 1, updatedAt: zeitstempel(tage, 16), createdAt: zeitstempel(tage, 15),
    summary: {
      sender: { company: abs.company, city: abs.city, country: abs.country },
      recipient: { company: empf.company, city: empf.city, country: empf.country },
      packages: { packageCount: paket.packageCount, weight: paket.weight }, shippingDate: versand,
    },
    formData: { sender: partei(abs), recipient: partei(empf), packages: paket, shippingDate: versand },
  };
}

function adresseAlsApi(a) {
  return { ...a, updatedAt: zeitstempel(-3) };
}

// ── Sendungen ────────────────────────────────────────────────────────────────────────────────────────────────
function sendungen() {
  const s = (id, tage, status, carrier, preis, gewicht, ab, tracking, extra = {}) => ({
    id, status, selected_carrier: carrier, price_final: preis, weight: gewicht, created_at: zeitstempel(tage, 9 + (id % 6)),
    order_number: null, order_confirmation_number: ab, tracking_number: tracking, tracking_references: tracking ? [tracking] : [],
    tracking_status: status === "delivered" ? "delivered" : status === "in_transit" || status === "delayed" ? "in_transit" : "pending",
    requested_shipping_date: isoDatum(tagVerschoben(tage + 1)), cancellation_status: null, reference_number: null, package_lines: null,
    // Zustellung: wie der Server mit Zeitpunkt und dem Kennzeichen „im laufenden Monat".
    delivered_at: status === "delivered" ? zeitstempel(tage + 2, 14) : null,
    delivered_this_month: status === "delivered" && tagVerschoben(tage + 2).getMonth() === new Date().getMonth(),
    ...extra,
  });
  // Empfänger wie in der echten Liste (recipient_address) — aus dem Adressbuch der Demo.
  const an = (id) => {
    const a = ADRESSEN().find((x) => x.id === id);
    return { recipient_address: { company: a.company, fullName: `${a.firstName} ${a.lastName}`, streetAndNumber: a.streetAndNumber,
      postalCode: a.postalCode, city: a.city, country: a.country } };
  };
  return [
    s(7007, 0, "label_ready", "ups", 22.02, 4.2, "SIM-AB26-00047", "1ZDEMO000000004711", { reference_number: "PO-2026-118", ...an(2) }),
    s(7006, -1, "in_transit", "dhl", 14.28, 2.5, "SIM-AB26-00046", "DEMO00340434161094041", an(4)),
    s(7005, -1, "booked", "dpd", 11.19, 1.6, "SIM-AB26-00045", "DEMO01505512340", an(5)),
    s(7004, -3, "delayed", "gls", 16.07, 6.0, "SIM-AB26-00044", "DEMO7120034567", { reference_number: "Lieferschein 2231", ...an(3) }),
    s(7003, -6, "delivered", "dhl", 13.09, 1.2, "SIM-AB26-00043", "DEMO00340434161090001", an(2)),
    s(7002, -9, "delivered", "ups", 38.66, 12.0, "SIM-AB26-00042", "1ZDEMO000000004702", an(4)),
    s(7001, -14, "delivered", "dhlexpress", 49.03, 3.0, "SIM-AB26-00041", "DEMO4501234567", an(5)),
  ];
}

function rechnungen() {
  const r = (id, nummer, status, betrag, ausgestellt, faellig, extra = {}) => ({
    id, invoice_number: nummer, status, is_overdue: false, gross_amount: betrag, currency: "EUR",
    issued_at: zeitstempel(ausgestellt), due_date: isoDatum(tagVerschoben(faellig)), document_status: "ready", download_available: true,
    ...extra,
  });
  return [
    r(4, "SIM-RE26-00047", "open", 26.20, 0, 7),
    r(3, "SIM-RE26-00046", "open", 25.47, -1, 6),
    r(2, "SIM-RE26-00044", "open", 19.12, -10, -3, { is_overdue: true }),
    r(1, "SIM-RE26-00041", "paid", 58.35, -14, -7, { paid_at: zeitstempel(-9) }),
  ];
}

function mitteilungen() {
  return [
    { id: 31, type: "invoice_ready", readAt: null, invoiceId: 4, invoiceNumber: "SIM-RE26-00047", createdAt: zeitstempel(0, 9), updatedAt: zeitstempel(0, 9) },
    { id: 30, type: "invoice_overdue", readAt: null, invoiceId: 2, invoiceNumber: "SIM-RE26-00044", createdAt: zeitstempel(-1, 8), updatedAt: zeitstempel(-1, 8) },
    { id: 29, type: "support_reply", readAt: zeitstempel(-2, 15), ticketId: 12, ticketNumber: "SIM-SUP26-00012", newReplies: 1, createdAt: zeitstempel(-2, 14), updatedAt: zeitstempel(-2, 14) },
  ];
}

function tickets() {
  return [
    { id: 12, ticketNumber: "SIM-SUP26-00012", subject: "Abholung am Freitag möglich?", category: "pickup", status: "in_progress",
      createdAt: zeitstempel(-3, 11), updatedAt: zeitstempel(-2, 14), shipmentId: 7004,
      messages: [
        { id: 121, authorRole: "customer", body: "Guten Tag, kann die Sendung SIM-AB26-00044 auch am Freitag abgeholt werden?", createdAt: zeitstempel(-3, 11) },
        { id: 122, authorRole: "admin", body: "Guten Tag Herr Mustermann, ja — die Abholung ist für Freitag zwischen 9 und 17 Uhr eingeplant. Viele Grüße", createdAt: zeitstempel(-2, 14) },
      ] },
    { id: 9, ticketNumber: "SIM-SUP26-00009", subject: "Rechnungskopie für die Buchhaltung", category: "invoice", status: "resolved",
      createdAt: zeitstempel(-12, 10), updatedAt: zeitstempel(-11, 9), shipmentId: null,
      messages: [
        { id: 91, authorRole: "customer", body: "Bitte senden Sie uns eine Kopie der Rechnung SIM-RE26-00041.", createdAt: zeitstempel(-12, 10) },
        { id: 92, authorRole: "admin", body: "Die Rechnung steht im Bereich Rechnungen zum Herunterladen bereit.", createdAt: zeitstempel(-11, 9) },
      ] },
  ];
}

// ── Lager ────────────────────────────────────────────────────────────────────────────────────────────────────
function lager() {
  const warehouse = { id: "10", name: "Hauptlager Stuttgart", code: "STR", status: "active", isDefault: true, notes: null,
    createdAt: zeitstempel(-90), updatedAt: zeitstempel(-90) };
  const produkt = (id, sku, name, gewicht, wert, bestand, reserviert, mindest, extra = {}) => ({
    id, sku, name, description: null, ean: null, weightKg: gewicht, lengthCm: 30, widthCm: 20, heightCm: 10, unitValue: wert,
    hsCode: "84719000", countryOfOrigin: "DE", customsDescription: name, defaultWarehouseId: "10", defaultLocationId: null,
    minStock: mindest, status: "active", createdAt: zeitstempel(-80), updatedAt: zeitstempel(-2),
    stock: { onHand: bestand, reserved: reserviert, blocked: 0, available: bestand - reserviert }, ...extra,
  });
  const produkte = [
    produkt("101", "ML-1001", "Barcode-Scanner Pro", 0.4, 129, 64, 4, 20),
    produkt("102", "ML-1002", "Etikettendrucker 4 Zoll", 2.1, 289, 12, 2, 15),
    produkt("103", "ML-1003", "Thermoetiketten 100 × 150 mm", 1.2, 18.5, 340, 40, 100),
    produkt("104", "ML-1004", "Versandkarton M (Bündel)", 3.5, 24, 48, 0, 30),
  ];
  const empfaenger = { company: "Alpen Handels GmbH", fullName: "Lukas Huber", streetAndNumber: "Mariahilfer Straße 88", addressAddition: null,
    postalCode: "1070", city: "Wien", country: "AT", phone: null, email: null };
  const auftraege = [
    { id: "501", orderNumber: "SIM-AU26-00007", status: "open", warehouseId: "10", warehouseName: warehouse.name, customerReference: "WEB-4471",
      recipient: empfaenger, notes: null, itemCount: 2, totalQuantity: 6, openQuantity: 6, shippedQuantity: 0,
      createdAt: zeitstempel(-1), updatedAt: zeitstempel(-1), cancelledAt: null },
    { id: "500", orderNumber: "SIM-AU26-00006", status: "shipped", warehouseId: "10", warehouseName: warehouse.name, customerReference: "WEB-4459",
      recipient: { ...empfaenger, company: "Nordhafen Technik GmbH", fullName: "Jana Petersen", streetAndNumber: "Am Sandtorkai 4", postalCode: "20457", city: "Hamburg", country: "DE" },
      notes: null, itemCount: 1, totalQuantity: 2, openQuantity: 0, shippedQuantity: 2, createdAt: zeitstempel(-6), updatedAt: zeitstempel(-5), cancelledAt: null },
  ];
  const bewegungen = [
    { id: "9004", type: "RECEIPT", quantity: 200, onHandAfter: 340, productId: "103", sku: "ML-1003", productName: "Thermoetiketten 100 × 150 mm",
      warehouseId: "10", warehouseName: warehouse.name, referenceType: null, referenceId: null, note: "Lieferung Etikettenpartner", createdBy: "9001",
      createdByName: "Max Mustermann", createdAt: zeitstempel(-2, 9) },
    { id: "9003", type: "SHIPMENT", quantity: -2, onHandAfter: 12, productId: "102", sku: "ML-1002", productName: "Etikettendrucker 4 Zoll",
      warehouseId: "10", warehouseName: warehouse.name, referenceType: "order", referenceId: "500", note: null, createdBy: "9001",
      createdByName: "Max Mustermann", createdAt: zeitstempel(-5, 14) },
    { id: "9002", type: "ADJUSTMENT", quantity: -1, onHandAfter: 64, productId: "101", sku: "ML-1001", productName: "Barcode-Scanner Pro",
      warehouseId: "10", warehouseName: warehouse.name, referenceType: null, referenceId: null, note: "Inventur", createdBy: "9001",
      createdByName: "Max Mustermann", createdAt: zeitstempel(-8, 16) },
  ];
  return { warehouses: [warehouse], produkte, auftraege, bewegungen };
}

// ── Angebote (Preisberechnung) ────────────────────────────────────────────────────────────────────────────────
function zahl(v) {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Beispielangebote zu einer Anfrage: Preise aus Gewicht und Strecke, nachvollziehbar und klar als Beispiel. */
export function demoAngebote(body) {
  const b = body && typeof body === "object" ? body : {};
  const paket = b.packages || b.package || {};
  const zeilen = Array.isArray(paket.packageLines) ? paket.packageLines : null;
  const gewicht = zeilen
    ? zeilen.reduce((s, z) => s + zahl(z.weight) * (Number(z.quantity) || 1), 0)
    : zahl(paket.weight ?? b.weight) * (Number(paket.count ?? b.packageCount ?? 1) || 1);
  const g = Math.max(1, gewicht || 2);
  const ziel = String((b.recipient && b.recipient.country) || b.to_country || b.toCountry || "DE").toUpperCase();
  const ausland = ziel !== "DE";
  const abhol = werktag(1);
  const zustellung = (tage) => werktag(1 + tage);
  const preis = (basis, jeKg) => runde((basis + jeKg * g) * (ausland ? 1.55 : 1));
  const angebot = (offerId, carrier, carrierName, service, netto, tage, extra = {}) => {
    const vat = runde(netto * 0.19);
    return {
      offerId, productKey: `demo_${offerId}`, publicCarrierId: carrier, publicCarrierName: carrierName, publicServiceName: service,
      serviceType: "pickup", currency: "EUR", netPrice: netto, vatAmount: vat, finalPrice: runde(netto + vat),
      transitDaysMin: tage[0], transitDaysMax: tage[1], bookable: true, availableForDate: true, requiredPriceInputs: [],
      surchargeFreePriceInputs: [], trackingAvailable: true, printerRequired: true, insuranceAvailable: false,
      pickupDate: `${isoDatum(abhol)}T00:00:00Z`, pickupTimeFrom: "09:00", pickupTimeUntil: "17:00", pickupWindowAdjustable: false,
      deliveryProjection: { kind: "estimated", dateMin: isoDatum(zustellung(tage[0])), dateMax: isoDatum(zustellung(tage[1])), timeUntil: null },
      ...extra,
    };
  };
  const tarife = [
    angebot("DEMO0000000000000000000000000001", "dhl", "DHL", "Paket", preis(6.9, 0.38), ausland ? [2, 4] : [1, 2],
      { pickupWindowAdjustable: true }),
    angebot("DEMO0000000000000000000000000002", "ups", "UPS", "Standardversand", preis(8.4, 0.42), ausland ? [2, 3] : [1, 2]),
    angebot("DEMO0000000000000000000000000003", "gls", "GLS", "BusinessParcel", preis(6.4, 0.33), ausland ? [2, 4] : [1, 3]),
    angebot("DEMO0000000000000000000000000004", "dpd", "DPD", "Classic", preis(7.1, 0.35), ausland ? [2, 3] : [1, 2]),
    angebot("DEMO0000000000000000000000000005", "dhlexpress", "DHL Express", "Domestic Express 12:00", preis(24.5, 0.9), [1, 1],
      { deliveryProjection: { kind: "estimated", dateMin: isoDatum(zustellung(1)), dateMax: isoDatum(zustellung(1)), timeUntil: ausland ? null : "12:00" } }),
  ];
  return {
    ceShipmentId: 7100 + Math.floor(g * 10) % 50,
    tariffs: tarife,
    availableShippingModes: ["standard", "express"],
    sourceCoverage: "complete",
    publicCarriers: [{ id: "dhl", name: "DHL" }, { id: "ups", name: "UPS" }, { id: "gls", name: "GLS" }, { id: "dpd", name: "DPD" }, { id: "dhlexpress", name: "DHL Express" }],
    customsRequired: false,
    fromCountryCode: "DE",
    toCountryCode: ziel,
    exportDeclaration: null,
  };
}

// ── Zustand dieser Seitenladung ─────────────────────────────────────────────────────────────────────────────
let zustand = null;
function z() {
  if (!zustand) {
    zustand = {
      konto: konto(),
      adressen: ADRESSEN(),
      sendungen: sendungen(),
      rechnungen: rechnungen(),
      mitteilungen: mitteilungen(),
      tickets: tickets(),
      lager: lager(),
      formEntwuerfe: [
        formEntwurf(501, -1, 1, 3, { packageCount: 2, weight: 6.5, length: 40, width: 30, height: 25 }),
        formEntwurf(502, -4, 1, 4, { packageCount: 1, weight: 12, length: 60, width: 40, height: 40 }),
      ],
      angebote: new Map(),
      naechsteNummer: 48,
    };
  }
  return zustand;
}

/** Nur für Tests: frischer Ausgangsstand. */
export function demoZuruecksetzen() {
  zustand = null;
}

// ── Antworten ────────────────────────────────────────────────────────────────────────────────────────────────
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function pdf(titel, nummer, zeilen) {
  return new Response(demoPdf({ titel, nummer, zeilen }), {
    status: 200,
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${(nummer || "Demo").replace(/[^A-Za-z0-9-]/g, "_")}-SIMULATION.pdf"` },
  });
}
const nichtVerfuegbar = () => json({ error: DEMO_TEXTE.nichtVerfuegbar, code: "DEMO_NOT_AVAILABLE" }, 409);

function koerper(optionen) {
  const b = optionen && optionen.body;
  if (typeof b !== "string") return {};
  try { return JSON.parse(b) || {}; } catch { return {}; }
}

// Dasselbe Aggregat wie der Server (stats von GET /kunde/shipments, alle sechs Zähler).
function statistik(liste) {
  const jetzt = Date.now();
  return {
    total: liste.length,
    active: liste.filter((s) => ["booked", "label_ready", "in_transit", "delayed"].includes(s.status)).length,
    in_transit: liste.filter((s) => s.status === "in_transit").length,
    delivered_this_month: liste.filter((s) => s.delivered_this_month === true).length,
    delayed: liste.filter((s) => s.status === "delayed").length,
    new_24h: liste.filter((s) => jetzt - new Date(s.created_at).getTime() < 86400000).length,
  };
}

function rechnungsSumme(liste) {
  const offen = liste.filter((r) => r.status !== "paid");
  const faellig = offen.map((r) => r.due_date).sort();
  return { open_count: offen.length, open_amount: runde(offen.reduce((s, r) => s + r.gross_amount, 0)),
    overdue_count: offen.filter((r) => r.is_overdue).length, next_due_date: faellig[0] || null, currency: "EUR" };
}

const CARRIER_NAME = { dhl: "DHL", ups: "UPS", dpd: "DPD", gls: "GLS", dhlexpress: "DHL Express" };

function trackingAntwort(sendung) {
  const ev = (status, beschreibung, ort, tage, zeit) => ({ status, description: beschreibung, location: ort, dateTime: { date: isoDatum(tagVerschoben(tage)), time: zeit } });
  const basis = Math.min(0, Math.round((new Date(sendung.created_at) - new Date()) / 86400000));
  const ereignisse = [ev("pending", "Die Sendung wurde elektronisch angekündigt.", "Stuttgart", basis, "16:42:00")];
  if (sendung.status !== "booked" && sendung.status !== "label_ready") {
    ereignisse.push(ev("in_transit", "Die Sendung wurde vom Absender abgeholt.", "Stuttgart", basis + 1, "11:05:00"));
    ereignisse.push(ev("in_transit", "Die Sendung wurde im Start-Paketzentrum bearbeitet.", "Kornwestheim", basis + 1, "19:48:00"));
  }
  if (sendung.status === "delivered") {
    ereignisse.push(ev("in_transit", "Die Sendung wurde in das Zustellfahrzeug geladen.", "Zielregion", basis + 2, "07:12:00"));
    ereignisse.push(ev("delivered", "Die Sendung wurde erfolgreich zugestellt.", "Zielort", basis + 2, "13:26:00"));
  }
  const stand = sendung.status === "delivered" ? "delivered" : ereignisse.length > 1 ? "in_transit" : "pending";
  const carrier = CARRIER_NAME[sendung.selected_carrier] || "DHL";
  return {
    shipmentId: sendung.id, tracking: null, trackingAvailable: true, trackingNumber: sendung.tracking_number,
    trackingReferences: [sendung.tracking_number], trackingStatus: stand, trackingStatusText: ereignisse[ereignisse.length - 1].description,
    carrier, carrierTrackingPage: null, liveTracking: true, source: "live",
    trackingLegs: [{ carrier, trackingReference: sendung.tracking_number, status: stand, carrierTrackingPage: null, events: ereignisse }],
  };
}

function dokumente(sendung) {
  const pfad = (n) => `/api/shipments/${sendung.id}/documents/${n}/download`;
  return {
    shipmentId: sendung.id,
    documents: [
      { type: "LABEL", category: "SHIPPING", status: "ready", label: "Versandlabel (A4)", downloadPath: pfad(1), carrierReference: sendung.tracking_number, labelSize: "a4" },
      { type: "ORDER_CONFIRMATION", category: "BUSINESS", status: "ready", label: "Auftragsbestätigung", number: sendung.order_confirmation_number, downloadPath: pfad(2) },
    ],
  };
}

function sendungZu(id) {
  return z().sendungen.find((s) => String(s.id) === String(id)) || null;
}

function buchen(body) {
  const st = z();
  const angebot = st.angebote.get(body.offerId) || null;
  const nr = st.naechsteNummer++;
  const id = 7000 + nr;
  const ab = `SIM-AB26-000${nr}`;
  const tracking = `DEMO${String(Date.now()).slice(-12)}`;
  const brutto = angebot ? angebot.finalPrice : 14.28;
  st.sendungen.unshift({
    id, status: "label_ready", selected_carrier: angebot ? angebot.publicCarrierId : "dhl", price_final: brutto, weight: 2,
    created_at: new Date().toISOString(), order_number: null, order_confirmation_number: ab, tracking_number: tracking,
    tracking_references: [tracking], tracking_status: "pending", requested_shipping_date: isoDatum(werktag(1)),
    cancellation_status: null, reference_number: typeof body.referenceNumber === "string" && body.referenceNumber ? body.referenceNumber : null,
    package_lines: null,
    recipient_address: body.recipient && typeof body.recipient === "object" ? { ...body.recipient } : null,
  });
  st.rechnungen.unshift({ id: 100 + nr, invoice_number: `SIM-TB26-000${nr}`, status: "open", is_overdue: false, gross_amount: brutto, currency: "EUR",
    issued_at: new Date().toISOString(), due_date: isoDatum(tagVerschoben(7)), document_status: "ready", download_available: true,
    is_test_document: true, invoice_test_phase: true });
  return {
    message: "Sendung gebucht (Simulation)", ceShipmentId: id, trackingNumber: tracking, labelUrl: null,
    invoiceNumber: `SIM-TB26-000${nr}`, invoicingPhase: "test_phase", amount: brutto, billingMode: "single", testBooking: true,
    labelStatus: "available", labelRetrievable: true, orderConfirmation: { number: ab },
    shippingDocuments: [
      { type: "LABEL", ordinal: 1, label: "Versandlabel (A4)", downloadPath: `/api/shipments/${id}/documents/1/download`, carrierReference: tracking, labelSize: "a4" },
    ],
  };
}

// ── Der Router ───────────────────────────────────────────────────────────────────────────────────────────────
function route(methode, pfad, query, optionen) {
  const st = z();
  const body = methode === "GET" ? {} : koerper(optionen);
  let m;

  // Konto und Anmeldung
  if (pfad === "/kundenbereich") return json({ user: st.konto, bookingProfile: { complete: true, missingFields: [] }, companyLogo: null, pendingEmailChange: null });
  if (pfad === "/kunde/profil") {
    if (methode === "GET") return json({ user: st.konto });
    Object.assign(st.konto, Object.fromEntries(Object.entries(body).filter(([k]) => typeof k === "string")));
    return json({ user: st.konto, message: "Gespeichert (Demo)" });
  }
  if (pfad === "/kunde/password" || pfad.startsWith("/api/kunde/email-change") || pfad === "/api/kunde/company-logo") {
    if (methode === "GET") return json({ error: "Kein Logo" }, 404);
    return nichtVerfuegbar();
  }
  if (pfad === "/kunde/credit") {
    const offen = rechnungsSumme(st.rechnungen).open_amount;
    return json({ credit: { limit: 2000, open: offen, reserved: 0, available: runde(2000 - offen), exhausted: false, currency: "EUR" } });
  }
  // „Ihre Versanddienstleister“ (G2): Beispieldaten in der Form der Serverantwort — die Carrier der Beispielsendungen.
  if (pfad === "/kunde/carriers") {
    return json({ carriers: [
      { id: "ups", name: "UPS" }, { id: "dhl", name: "DHL Express" }, { id: "dpd", name: "DPD" },
      { id: "gls", name: "GLS" }, { id: "tnt", name: "TNT" },
    ] });
  }
  if (pfad === "/kunde/consolidated-invoice/current") return json({ active: false });

  // Sendungen
  if (pfad === "/kunde/shipments") return json({ shipments: st.sendungen, stats: statistik(st.sendungen), nextCursor: null });
  if ((m = pfad.match(/^\/api\/shipments\/(\d+)\/tracking$/))) {
    const s = sendungZu(m[1]);
    return s ? json(trackingAntwort(s)) : json({ error: "Sendung nicht gefunden" }, 404);
  }
  if ((m = pfad.match(/^\/api\/tracking\/public\/(.+)$/))) {
    const s = st.sendungen.find((x) => x.tracking_number === decodeURIComponent(m[1]));
    if (!s) return json({ error: "Sendung nicht gefunden" }, 404);
    const { shipmentId, trackingReferences, ...offen } = trackingAntwort(s);
    return json(offen);
  }
  if ((m = pfad.match(/^\/api\/shipments\/(\d+)\/documents$/))) {
    const s = sendungZu(m[1]);
    return s ? json(dokumente(s)) : json({ error: "Sendung nicht gefunden" }, 404);
  }
  if ((m = pfad.match(/^\/api\/shipments\/(\d+)\/(documents\/\d+\/download|label|order-confirmation|delivery-note)$/))) {
    const s = sendungZu(m[1]);
    const art = m[2].includes("order-confirmation") || m[2].endsWith("/2/download") ? "Auftragsbestätigung"
      : m[2].includes("delivery-note") ? "Lieferschein" : "Versandlabel";
    return pdf(`${art} (Beispiel)`, s ? s.order_confirmation_number : "", [
      s ? `Sendung ${s.order_confirmation_number} · ${CARRIER_NAME[s.selected_carrier] || ""}` : "Beispielsendung",
      s ? `Trackingnummer ${s.tracking_number}` : "",
      "Dieses Dokument ist ein Beispiel. Es ist kein gültiges Versanddokument.",
    ]);
  }
  if ((m = pfad.match(/^\/api\/shipments\/(\d+)\/cancellation-request$/))) {
    const s = sendungZu(m[1]);
    if (s) s.cancellation_status = "requested";
    return json({ cancellationRequest: { id: 1, status: "requested" } }, 201);
  }
  if ((m = pfad.match(/^\/api\/shipments\/(\d+)\/commercial-invoice$/))) return json({ present: false, document: null });

  // Rechnungen
  if (pfad === "/kunde/invoices") return json({ invoices: st.rechnungen, summary: rechnungsSumme(st.rechnungen), nextCursor: null });
  if ((m = pfad.match(/^\/kunde\/invoices\/(\d+)\/pdf$/))) {
    const r = st.rechnungen.find((x) => String(x.id) === m[1]);
    return pdf("Rechnung (Beispiel)", r ? r.invoice_number : "", [
      r ? `Betrag ${String(r.gross_amount.toFixed(2)).replace(".", ",")} EUR (Beispiel)` : "",
      "Diese Rechnung ist ein Beispiel. Sie begründet keine Forderung.",
    ]);
  }

  // Mitteilungen
  if (pfad === "/kunde/notifications/unread-count") return json({ unreadCount: st.mitteilungen.filter((n) => !n.readAt).length, snapshotAt: new Date().toISOString() });
  if (pfad === "/kunde/notifications/mark-read") {
    for (const n of st.mitteilungen) n.readAt = n.readAt || new Date().toISOString();
    return json({ updated: st.mitteilungen.length, unreadCount: 0 });
  }
  if (pfad === "/kunde/notifications") return json({ notifications: st.mitteilungen, unreadCount: st.mitteilungen.filter((n) => !n.readAt).length, snapshotAt: new Date().toISOString(), pagination: {} });

  // Support
  if (pfad === "/kunde/support-requests") {
    if (methode === "POST") {
      const nr = st.tickets.length + 13;
      const ticket = { id: nr, ticketNumber: `SIM-SUP26-000${nr}`, subject: body.subject || "Anfrage", category: body.category || "other", status: "open",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), shipmentId: body.shipmentId || null,
        messages: [{ id: nr * 10, authorRole: "customer", body: body.message || "", createdAt: new Date().toISOString() }] };
      st.tickets.unshift(ticket);
      return json({ supportRequest: { id: ticket.id, ticketNumber: ticket.ticketNumber, category: ticket.category, status: "open" } }, 201);
    }
    const liste = st.tickets.map(({ messages, ...t }) => ({ ...t, messageCount: messages.length }));
    return json({ supportRequests: liste, tickets: liste, items: liste });
  }
  if ((m = pfad.match(/^\/kunde\/support-requests\/(\d+)(\/messages|\/viewed)?$/))) {
    const t = st.tickets.find((x) => String(x.id) === m[1]);
    if (!t) return json({ error: "Nicht gefunden" }, 404);
    if (m[2] === "/viewed") return json({ ok: true });
    if (m[2] === "/messages") {
      const n = { id: Date.now(), authorRole: "customer", body: body.message || "", createdAt: new Date().toISOString() };
      t.messages.push(n);
      t.updatedAt = n.createdAt;
      return json({ message: n }, 201);
    }
    const { messages, ...kopf } = t;
    return json({ supportRequest: kopf, messages });
  }

  // Adressbuch
  if (pfad === "/api/kunde/addresses") {
    if (methode === "POST") {
      const neu = adresse(Math.max(0, ...st.adressen.map((a) => a.id)) + 1, { ...body, isDefaultSender: false, isDefaultRecipient: false });
      st.adressen.push(neu);
      return json({ address: adresseAlsApi(neu) }, 201);
    }
    const q = String(query.get("q") || "").trim().toLowerCase();
    const rolle = query.get("role");
    const felder = (a) => [a.label, a.company, a.firstName, a.lastName, a.contactName, a.city, a.postalCode, a.streetAndNumber].join(" ").toLowerCase();
    let liste = st.adressen.filter((a) => !q || felder(a).includes(q));
    if (rolle === "sender") liste = liste.filter((a) => a.role === "sender" || a.role === "both");
    if (rolle === "recipient") liste = liste.filter((a) => a.role === "recipient" || a.role === "both");
    if (query.get("favorite") === "true") liste = liste.filter((a) => a.favorite);
    if (query.get("default") === "sender") liste = liste.filter((a) => a.isDefaultSender);
    if (query.get("default") === "recipient") liste = liste.filter((a) => a.isDefaultRecipient);
    const grenze = Number(query.get("limit")) || liste.length;
    return json({ items: liste.slice(0, grenze).map(adresseAlsApi), nextCursor: null });
  }
  if ((m = pfad.match(/^\/api\/kunde\/addresses\/(\d+)$/))) {
    const i = st.adressen.findIndex((a) => String(a.id) === m[1]);
    if (i < 0) return json({ error: "Nicht gefunden" }, 404);
    if (methode === "DELETE") { st.adressen.splice(i, 1); return new Response(null, { status: 204 }); }
    if (methode === "PUT" || methode === "PATCH") st.adressen[i] = { ...st.adressen[i], ...body };
    return json({ address: adresseAlsApi(st.adressen[i]) });
  }

  // Entwürfe
  if (pfad === "/api/kunde/drafts") return json({ items: [], nextCursor: null });
  if ((m = pfad.match(/^\/api\/kunde\/drafts\/(\d+)(\/save)?$/))) {
    if (methode === "DELETE") return new Response(null, { status: 204 });
    if (m[2]) return json({ saved: true, id: Number(m[1]) });
    return json({ error: "Nicht gefunden" }, 404);
  }
  if (pfad === "/api/kunde/form-drafts") {
    if (methode === "POST") {
      const neu = { id: Date.now(), ...body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), version: 1 };
      st.formEntwuerfe.unshift(neu);
      return json({ draft: neu }, 201);
    }
    return json({ drafts: st.formEntwuerfe, nextCursor: null });
  }
  if ((m = pfad.match(/^\/api\/kunde\/form-drafts\/(\d+)$/))) {
    const i = st.formEntwuerfe.findIndex((d) => String(d.id) === m[1]);
    if (i < 0) return json({ error: "Nicht gefunden" }, 404);
    if (methode === "DELETE") { st.formEntwuerfe.splice(i, 1); return new Response(null, { status: 204 }); }
    if (methode === "PATCH") st.formEntwuerfe[i] = { ...st.formEntwuerfe[i], ...body, updatedAt: new Date().toISOString(), version: (st.formEntwuerfe[i].version || 1) + 1 };
    return json({ draft: st.formEntwuerfe[i] });
  }

  // Lager und Aufträge
  const lg = st.lager;
  if (pfad === "/api/kunde/inventory/overview") {
    const bestand = lg.produkte.reduce((s, p) => s + p.stock.onHand, 0);
    const reserviert = lg.produkte.reduce((s, p) => s + p.stock.reserved, 0);
    const offene = lg.auftraege.filter((a) => a.status === "open");
    const knapp = lg.produkte.filter((p) => p.stock.available < p.minStock);
    // Dieselbe Form wie der Server (Vorschauzeilen je Kennzahl, backend inventory-overview-previews) — sonst nennt die
    // Übersicht eine Zahl ohne die Einträge dahinter.
    return json({ activeProducts: lg.produkte.length, activeWarehouses: lg.warehouses.length, onHandUnits: bestand, availableUnits: bestand - reserviert,
      reservedUnits: reserviert, lowStockCount: knapp.length, openOrders: offene.length, shippedToday: 0,
      previews: {
        openOrders: offene.map((a) => ({ orderId: a.id, orderNumber: a.orderNumber, recipientCompany: a.recipient.company,
          recipientName: a.recipient.fullName, createdAt: a.createdAt, itemCount: a.itemCount })),
        lowStockProducts: knapp.map((p) => ({ productId: p.id, name: p.name, sku: p.sku, warehouseName: lg.warehouses[0].name,
          available: p.stock.available, minStock: p.minStock, missing: p.minStock - p.stock.available })),
      } });
  }
  if (pfad === "/api/kunde/warehouses") return methode === "GET" ? json({ warehouses: lg.warehouses, nextCursor: null }) : nichtVerfuegbar();
  if ((m = pfad.match(/^\/api\/kunde\/warehouses\/(\d+)(\/locations)?$/))) {
    if (m[2]) return methode === "GET" ? json({ locations: [], nextCursor: null }) : nichtVerfuegbar();
    return methode === "GET" ? json({ warehouse: lg.warehouses[0] }) : nichtVerfuegbar();
  }
  if (pfad === "/api/kunde/products") return methode === "GET" ? json({ products: lg.produkte, nextCursor: null }) : nichtVerfuegbar();
  if ((m = pfad.match(/^\/api\/kunde\/products\/(\d+)$/))) {
    const p = lg.produkte.find((x) => x.id === m[1]);
    if (!p) return json({ error: "Nicht gefunden" }, 404);
    if (methode !== "GET") return nichtVerfuegbar();
    return json({ product: p, balances: [{ warehouseId: "10", warehouseName: lg.warehouses[0].name, ...p.stock, updatedAt: zeitstempel(-2) }],
      movements: lg.bewegungen.filter((b) => b.productId === p.id) });
  }
  if (pfad === "/api/kunde/inventory/balances") {
    return json({ balances: lg.produkte.map((p) => ({ productId: p.id, warehouseId: "10", sku: p.sku, productName: p.name, productStatus: p.status,
      warehouseName: lg.warehouses[0].name, onHand: p.stock.onHand, reserved: p.stock.reserved, blocked: p.stock.blocked, available: p.stock.available,
      minStock: p.minStock, lowStock: p.stock.available < p.minStock, updatedAt: zeitstempel(-2) })), nextCursor: null });
  }
  if (pfad === "/api/kunde/inventory/movements") return json({ movements: lg.bewegungen, nextCursor: null });
  if (/^\/api\/kunde\/inventory\/(receipt|adjustment|block|unblock)$/.test(pfad)) return nichtVerfuegbar();
  if (pfad === "/api/kunde/orders") return methode === "GET" ? json({ orders: lg.auftraege, nextCursor: null }) : nichtVerfuegbar();
  if ((m = pfad.match(/^\/api\/kunde\/orders\/(\d+)(\/cancel|\/shipping-prefill)?$/))) {
    const a = lg.auftraege.find((x) => x.id === m[1]);
    if (!a) return json({ error: "Nicht gefunden" }, 404);
    if (m[2] === "/cancel") return nichtVerfuegbar();
    const positionen = [
      { id: `${a.id}1`, productId: "101", productStatus: "active", quantity: a.status === "open" ? 4 : 2, sku: "ML-1001", name: "Barcode-Scanner Pro", unitWeightKg: 0.4,
        unitValue: 129, hsCode: "84719000", countryOfOrigin: "DE", customsDescription: "Barcode-Scanner", reservedQuantity: a.status === "open" ? 4 : 0,
        shippedQuantity: a.status === "open" ? 0 : 2, releasedQuantity: 0 },
    ];
    if (m[2] === "/shipping-prefill") {
      return json({ order: { id: a.id, orderNumber: a.orderNumber, customerReference: a.customerReference }, recipient: a.recipient, warehouseId: "10",
        suggestedWeightKg: 1.6, weightComplete: true, items: positionen.map((p) => ({ orderItemId: p.id, productId: p.productId, quantity: p.quantity, sku: p.sku,
          name: p.name, unitWeightKg: p.unitWeightKg, unitValue: p.unitValue, hsCode: p.hsCode, countryOfOrigin: p.countryOfOrigin, customsDescription: p.customsDescription })) });
    }
    return json({ order: a, items: positionen, shipments: [] });
  }

  // Versand: Länder, Angebote, Buchung
  // Länderumfang (angemeldet und öffentlich): die Demo beantwortet den Endpunkt, sie ruft ihn nicht auf — aufgerufen
  // wird er weiterhin an genau einer Stelle (api/launchScopeApi.js, launchScopeUx.test.mjs B2).
  if (/^\/api\/(shipping|public)\/launch-scope$/.test(pfad)) {
    return json({ countries: EU27, destinationCountries: EU27, originCountries: ["DE"], countriesWithTerritoryExclusions: [] });
  }
  if (pfad === "/api/offers/prepare") return new Response(null, { status: 204 });
  if (pfad === "/api/jumingo/calculate-price") {
    const antwort = demoAngebote(body);
    for (const t of antwort.tariffs) st.angebote.set(t.offerId, t);
    return json(antwort);
  }
  if (pfad === "/api/jumingo/draft/pickup-window") {
    if (methode === "POST") return json({ pickupWindow: { from: body.pickupTimeFrom, until: body.pickupTimeUntil } });
    const tag = isoDatum(werktag(1));
    return json({ pickupWindow: null, availableFrom: `${tag}T09:00:00`, availableUntil: `${tag}T17:00:00`, minimumMinutes: 120, adjustable: true });
  }
  if (pfad === "/api/jumingo/cart-total") return json({ voucher: { applied: false }, totals: null });
  if (pfad === "/api/jumingo/book") return json(buchen(body), 201);
  if (pfad === "/api/legal/booking-context") return json({ enabled: false });
  if (pfad.startsWith("/api/legal/")) return json({ error: DEMO_TEXTE.nichtVerfuegbar }, 404);
  // Adresshilfe: die Demo prüft keine Anschriften — Antwort wie ein nicht eingerichteter Dienst (kein Hinweis am Feld).
  if (pfad === "/api/address/validate" || pfad === "/api/address/public/validate") return json({ status: "unsupported", reason: "not_configured" });
  if (pfad.startsWith("/api/address/")) return json({ items: [], suggestions: [], covered: false });
  if (pfad === "/api/dropoff/parcelshops" || pfad === "/api/jumingo/access-points-search") return json({ parcelShops: [], accessPoints: [] });
  if (pfad === "/api/sales-partner/public-config") return json({ referralsEnabled: false, registrationMode: "closed" });

  // Alles Übrige gibt es in der Demo nicht — nie ein stiller Erfolg für einen unbekannten Schreibvorgang.
  return methode === "GET" ? json({ error: DEMO_TEXTE.nichtVerfuegbar }, 404) : nichtVerfuegbar();
}

// Kurze, glaubwürdige Wartezeiten: der Angebotsvergleich zeigt seinen Ladezustand, Listen erscheinen sofort.
function wartezeit(pfad) {
  if (pfad === "/api/jumingo/calculate-price") return 1400;
  if (pfad === "/api/jumingo/book") return 1800;
  return 120;
}

function abbruchFehler() {
  const e = new Error("Der Vorgang wurde abgebrochen.");
  e.name = "AbortError";
  return e;
}

/**
 * Beantwortet eine Anfrage der Kundenseiten in der Demo — Signatur wie apiFetch, Ergebnis eine Response.
 * @param {string} pfadOderUrl
 * @param {{ method?: string, body?: string, signal?: AbortSignal }} [optionen]
 */
export function demoAntwort(pfadOderUrl, optionen = {}) {
  const url = new URL(pfadOderUrl, "https://demo.invalid");
  const methode = String((optionen && optionen.method) || "GET").toUpperCase();
  const signal = optionen && optionen.signal;
  return new Promise((aufloesen, ablehnen) => {
    if (signal && signal.aborted) { ablehnen(abbruchFehler()); return; }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener("abort", beiAbbruch);
      try { aufloesen(route(methode, url.pathname, url.searchParams, optionen)); } catch (e) { ablehnen(e); }
    }, wartezeit(url.pathname));
    function beiAbbruch() { clearTimeout(timer); ablehnen(abbruchFehler()); }
    if (signal) signal.addEventListener("abort", beiAbbruch, { once: true });
  });
}
