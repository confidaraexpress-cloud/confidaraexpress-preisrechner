/* Lange, aber realistische Inhalte für Layoutprüfungen im Kundenbereich.
 *
 * Grundlage sind die Antworten der Kundenbereich-Demo (src/demo/demoBackend.mjs — dieselben Verträge wie die
 * echte API). `verlaengere` ersetzt darin Namen, Anschriften, Nummern, Referenzen und Beträge durch lange Werte,
 * wie sie im Betrieb vorkommen: Firmierungen mit Rechtsformzusatz, Doppelnamen, lange Orts- und Straßennamen,
 * Vorgangsnummern im alten langen Format, fehlende Vorgangsnummern („Ohne Vorgangsnummer“), fünf- und
 * sechsstellige Beträge, der längste Status („Buchungsstatus wird geprüft“) und ein unbekannter Status.
 *
 * Rein und deterministisch: gleiche Antwort ergibt dieselben Werte (Zähler je Aufruf).
 */

export const LANG = Object.freeze({
  firma: "Spedition Müller-Lüdenscheidt Internationale Logistik GmbH & Co. KG",
  vorname: "Maximilian-Alexander",
  nachname: "Schmidt-Hohenzollern",
  person: "Maximilian-Alexander Schmidt-Hohenzollern",
  strasse: "Kurfürstin-Sophie-Charlotte-Straße 123a",
  ort: "Garmisch-Partenkirchen",
  email: "maximilian-alexander.schmidt@spedition-mueller-luedenscheidt.example",
  referenz: "Bestellung 2026-10-28 · Kostenstelle 4711 · Einkauf",
  tracking: "00340434161094041234567",
  rechnung: "CE-RE-2026-000123",
  produkt: "Industrie-Barcode-Scanner Pro mit Ladestation und Ersatzakku (Set)",
  sku: "ML-ELEKTRONIK-2026-000101",
  lager: "Hauptlager Stuttgart-Feuerbach, Halle 7",
  auftrag: "CE-AU-2026-000007",
  betreff: "Rückfrage zur Abholung der Sendung CE-AB-2026-000050 am Freitagnachmittag",
  ticket: "CE-SUP-2026-000012",
});

// Vorgangsnummern reihum: fehlend, altes langes Format, heutiges Format.
const VORGANG = [null, "CE-AB-2026-000050", "CE-AB26-00001"];
const STATUS = ["booking", "label_ready", "delayed", "zollpruefung_ausstehend", "in_transit", "delivered", "booked"];
const PREISE = [12345.67, 1234.56, 999.9, 23456.78, 87.5, 4321.09, 15.4];
const BETRAEGE = [123456.78, 12345.67, 1999.99, 98765.43];

export function verlaengere(pfad, daten) {
  const zaehler = { sendung: 0, rechnung: 0 };
  const lauf = (wert, schluessel) => {
    if (Array.isArray(wert)) return wert.map((w) => lauf(w, schluessel));
    if (!wert || typeof wert !== "object") return wert;
    const o = {};
    for (const [k, v] of Object.entries(wert)) o[k] = lauf(v, k);

    // Sendung (Liste, Detail, Kopfsuche)
    if ("order_confirmation_number" in o && "price_final" in o) {
      const i = zaehler.sendung++;
      o.order_confirmation_number = VORGANG[i % VORGANG.length];
      o.status = STATUS[i % STATUS.length];
      o.price_final = PREISE[i % PREISE.length];
      if (i < 2) o.selected_carrier = "dhlexpress";
      if (o.tracking_number) o.tracking_number = LANG.tracking;
      if (Array.isArray(o.tracking_references) && o.tracking_references.length) o.tracking_references = [LANG.tracking];
      o.reference_number = LANG.referenz;
    }
    // Rechnung
    if ("invoice_number" in o && "gross_amount" in o) {
      const i = zaehler.rechnung++;
      o.invoice_number = LANG.rechnung.replace(/\d{3}$/, String(123 + i));
      o.gross_amount = BETRAEGE[i % BETRAEGE.length];
    }
    if ("open_amount" in o) o.open_amount = 135802.45;
    // Konto
    if ("customer_number" in o) {
      o.company_name = LANG.firma;
      o.name = LANG.person;
      o.contact_name = LANG.person;
      o.email = LANG.email;
      o.contact_email = LANG.email;
      o.city = LANG.ort;
      o.street = LANG.strasse;
      o.customer_number = "CE-K-1000030";
    }
    // Anschriften (Adressbuch, Empfänger, Entwürfe, Aufträge)
    if ("company" in o && typeof o.company === "string") o.company = LANG.firma;
    if ("fullName" in o) o.fullName = LANG.person;
    if ("contactName" in o) o.contactName = LANG.person;
    if ("firstName" in o) o.firstName = LANG.vorname;
    if ("lastName" in o) o.lastName = LANG.nachname;
    if ("streetAndNumber" in o) o.streetAndNumber = LANG.strasse;
    if ("city" in o && schluessel !== "user" && !("customer_number" in o)) o.city = LANG.ort;
    if ("email" in o && typeof o.email === "string" && o.email) o.email = LANG.email;
    if ("label" in o && "streetAndNumber" in o) o.label = LANG.firma;
    // Lager und Aufträge
    if ("sku" in o) o.sku = LANG.sku;
    if ("sku" in o && "name" in o) o.name = LANG.produkt;
    if ("productName" in o) o.productName = LANG.produkt;
    if ("customsDescription" in o) o.customsDescription = LANG.produkt;
    if ("warehouseName" in o) o.warehouseName = LANG.lager;
    if ("code" in o && "isDefault" in o && "name" in o) o.name = LANG.lager;
    if ("orderNumber" in o) o.orderNumber = LANG.auftrag;
    if ("customerReference" in o && o.customerReference) o.customerReference = LANG.referenz;
    // Support und Mitteilungen
    if ("subject" in o) o.subject = LANG.betreff;
    if ("ticketNumber" in o) o.ticketNumber = LANG.ticket;
    if ("invoiceNumber" in o && o.invoiceNumber) o.invoiceNumber = LANG.rechnung;
    return o;
  };
  void pfad;
  return lauf(daten, "");
}
