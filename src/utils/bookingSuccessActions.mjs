// ─────────────────────────────────────────────────────────────────────────────
// Erfolgsseite der Buchung — reine Entscheidung, kein React, kein fetch, kein Zustand. Phase 1 (Betreiberentscheidung
// 2026-11-06, Canonical v2.117) führte die Hauptaktion und die Dokumentliste ein; die Premium-UX-Nachbesserung
// (Betreiberentscheidung 2026-11-06, Canonical v2.118) ordnet die Seite nach drei Fragen: War die Buchung erfolgreich?
// Was ist jetzt zu tun? Wo liegen Dokumente und Buchungsdaten?
//
// Eine Funktion beantwortet aus der Buchungsantwort und dem Verlauf des Labelabrufs auf dieser Seite:
//   · welche Zeilen das Versandlabel in der Dokumentliste bekommt (Name, Stand, Aktion),
//   · welche EINE Hauptaktion oben steht (gefüllter Knopf) und ob darunter ein ruhiger Verweis steht,
//   · welche Rückmeldung nach einem Klick unter der Hauptaktion steht (Wartezustand oder Fehler),
//   · was in „So geht es weiter" steht (Label, Übergabe, Sendungsverfolgung).
//
// Der Labelstand kommt ausschließlich vom Server (bookingShippingDocuments/bookingLabelView in
// bookingShippingDocuments.mjs) — hier entsteht keine zweite Labelregel. Liegt das Label in ConfidaraExpress oder ist
// es beim Versanddienstleister abrufbar, lädt derselbe Klick sofort das PDF: beide heißen „Versandlabel
// herunterladen“ (v2.118). Ein nicht vorhandenes Label hat nie einen Download.
// ─────────────────────────────────────────────────────────────────────────────

import {
  bookingShippingDocuments, bookingLabelView, BOOKING_LABEL_MODE, BOOKING_LABEL_TEXT,
  shippingDocumentButtonLabel,
} from "./bookingShippingDocuments.mjs";

export const BOOKING_SUCCESS_TEXT = Object.freeze({
  status: "Gebucht",
  title: "Sendung erfolgreich gebucht!",
  documentsTitle: "Dokumente",
  summaryTitle: "Ihre Buchung",
  stepsTitle: "So geht es weiter",
  labelName: "Versandlabel",
  ready: "Bereit",
  download: "Herunterladen",
  retry: "Erneut versuchen",
  shipments: "Zu meinen Sendungen",
  newShipment: "Neue Sendung",
  allDocuments: "Alle Dokumente anzeigen",
  carrierReference: "Sendungsnummer",
  pickup: "Abholung",
  dropoff: "Abgabe im Paketshop",
  detailsShow: "Buchungsdetails anzeigen",
  detailsHide: "Buchungsdetails ausblenden",
});

// Hauptaktion und Verweis: welche Handlung ein Knopf auslöst. Die Seite ordnet jeder Art genau einen Handler zu; die
// Art selbst trägt keinen Pfad und keine Nummer (die kommen aus `doc` bzw. der Buchung).
export const SUCCESS_ACTION = Object.freeze({
  DOCUMENT: "document",          // ein Versandbeleg der Buchungsantwort (servergelieferter Pfad)
  LABEL: "label",                // das Label über den Sendungshandle herunterladen (abgelegt oder beim Anbieter abrufbar)
  SHIPMENTS: "shipments",        // „Zu meinen Sendungen"
  DOCUMENTS: "documents",        // zur Dokumentliste dieser Seite springen
});

// Ton eines Zeilenstands: bereit, Hinweis (ruhig), Warten (ruhig), Fehler (rot, nur echte Fehler).
export const ROW_TONE = Object.freeze({ READY: "ready", INFO: "info", WAIT: "wait", ERROR: "error" });

const zeile = (felder) => Object.freeze({ reference: null, action: null, ...felder });

/**
 * Labelzeilen, Hauptaktion, Verweis und Rückmeldung.
 *
 * @param booking     die Buchungsantwort
 * @param labelRun    Verlauf des Labelabrufs auf dieser Seite:
 *                    { fetched: true nach erfolgreichem Download, notReady: true nach LABEL_NOT_READY,
 *                      error: Fehlertext eines echten Fehlers (Netz, Server, Berechtigung) oder null }
 * @returns {{ mode: string|null, rows: object[], primary: object, secondary: object|null,
 *             feedback: {tone: string, text: string}|null }}
 */
export function bookingSuccessLabelPlan(booking, labelRun = {}) {
  const T = BOOKING_SUCCESS_TEXT;
  const A = SUCCESS_ACTION;
  const lauf = labelRun && typeof labelRun === "object" ? labelRun : {};
  const sendungen = { kind: A.SHIPMENTS, text: T.shipments };

  // 1) Die Buchungsantwort meldet ladbare Versandbelege: jede Datei eine Zeile, die erste ist die Hauptaktion. Bei
  //    mehreren Belegen verweist ein ruhiger Link auf die Liste — kein zweiter gleichwertiger Knopf.
  const belege = bookingShippingDocuments(booking);
  if (belege.length > 0) {
    const rows = belege.map((doc) => zeile({
      key: `${doc.type}-${doc.ordinal}`,
      name: doc.label,
      reference: doc.carrierReference,
      status: T.ready,
      tone: ROW_TONE.READY,
      action: { kind: A.DOCUMENT, doc, text: T.download, ariaLabel: shippingDocumentButtonLabel(doc) },
    }));
    const erstes = belege.find((d) => d.type === "LABEL") || belege[0];
    return {
      mode: BOOKING_LABEL_MODE.DOWNLOAD,
      rows,
      primary: { kind: A.DOCUMENT, doc: erstes, text: shippingDocumentButtonLabel(erstes) },
      secondary: belege.length > 1 ? { kind: A.DOCUMENTS, text: T.allDocuments } : null,
      feedback: null,
    };
  }

  // 2) Ohne Sendungshandle gibt es nichts herunterzuladen.
  if (!booking || booking.ceShipmentId == null || String(booking.ceShipmentId).trim() === "") {
    return { mode: null, rows: [], primary: sendungen, secondary: null, feedback: null };
  }

  // 3) Der Labelstand des Servers (P2-01/EXTRA).
  const ansicht = bookingLabelView(booking);
  const M = BOOKING_LABEL_MODE;
  const labelZeile = (felder) => zeile({ key: "label", name: T.labelName, ...felder });

  if (ansicht.mode === M.DOWNLOAD || (ansicht.mode === M.PENDING && ansicht.retrievable)) {
    // Abgelegt oder beim Versanddienstleister abrufbar: derselbe Klick lädt das PDF. Die Hauptaktion behält ihren
    // Namen in jedem Zustand; Warten und Fehler stehen darunter und an der Zeile.
    const laden = { kind: A.LABEL, text: T.download, ariaLabel: BOOKING_LABEL_TEXT.download };
    const primary = { kind: A.LABEL, text: BOOKING_LABEL_TEXT.download };
    if (lauf.notReady === true) {
      // Normaler Wartezustand: ruhig, nicht rot; die Buchung ist davon unberührt.
      return {
        mode: ansicht.mode,
        rows: [labelZeile({ status: BOOKING_LABEL_TEXT.notReady, tone: ROW_TONE.WAIT, action: { ...laden, text: T.retry } })],
        primary, secondary: null,
        feedback: { tone: ROW_TONE.WAIT, text: BOOKING_LABEL_TEXT.notReady },
      };
    }
    if (lauf.error) {
      return {
        mode: ansicht.mode,
        rows: [labelZeile({ status: lauf.error, tone: ROW_TONE.ERROR, action: { ...laden, text: T.retry } })],
        primary, secondary: null,
        feedback: { tone: ROW_TONE.ERROR, text: lauf.error },
      };
    }
    // „Bereit“ nur, wenn die Datei in ConfidaraExpress liegt oder auf dieser Seite schon geladen wurde. Davor sagt die
    // Zeile nur, was der Klick liefert — ein abrufbares Label kann noch einen Moment brauchen.
    const liegtVor = ansicht.mode === M.DOWNLOAD || lauf.fetched === true;
    return {
      mode: liegtVor ? M.DOWNLOAD : ansicht.mode,
      rows: [labelZeile(liegtVor
        ? { status: T.ready, tone: ROW_TONE.READY, action: laden }
        : { status: ansicht.text, tone: ROW_TONE.INFO, action: laden })],
      primary, secondary: null, feedback: null,
    };
  }

  // Portal (DPD 124/137) ohne Abruf, GLS 110 beim Fahrer, gesondert bereitgestellt, unbekannt: der Stand an der
  // Zeile, kein Download; die Hauptaktion führt zu den Sendungen.
  const ton = ansicht.mode === M.PENDING ? ROW_TONE.WAIT : ROW_TONE.INFO;
  return { mode: ansicht.mode, rows: [labelZeile({ status: ansicht.text, tone: ton })], primary: sendungen, secondary: null, feedback: null };
}

/**
 * „So geht es weiter": drei kurze, zustandsabhängige Schritte — Label, Übergabe, Sendungsverfolgung.
 *
 * @param plan    das Ergebnis von bookingSuccessLabelPlan
 * @param tariff  der gebuchte Tarif (serviceType, trackingAvailable)
 * @param extra   { pickupText: gebuchte Abholung am selben Tag oder null, dropoffText: gebundener Paketshop oder
 *                  null, carrierName: Carrier für den Shophinweis oder "" }
 * @returns {string[]}
 */
export function bookingSuccessNextSteps(plan, tariff, { pickupText = null, dropoffText = null, carrierName = "" } = {}) {
  const M = BOOKING_LABEL_MODE;
  const p = plan && typeof plan === "object" ? plan : { mode: null, rows: [] };
  const mehrere = p.rows.filter((r) => r.action && r.action.kind === SUCCESS_ACTION.DOCUMENT).length > 1;
  const ersteAktion = p.rows.length > 0 && p.rows[0].action ? p.rows[0].action.kind : null;

  let label;
  if (p.rows.length === 0) label = "Ihre Versanddokumente finden Sie unter „Meine Sendungen“ → „Dokumente“.";
  else if (ersteAktion === SUCCESS_ACTION.LABEL && p.rows[0].tone === ROW_TONE.WAIT) {
    label = "Das Versandlabel ist in wenigen Minuten bereit – hier oder unter „Meine Sendungen“ → „Dokumente“.";
  } else if (ersteAktion === SUCCESS_ACTION.LABEL || ersteAktion === SUCCESS_ACTION.DOCUMENT) {
    label = mehrere
      ? "Jedes Versandlabel herunterladen, ausdrucken und auf das zugehörige Paket kleben."
      : "Versandlabel herunterladen, ausdrucken und gut sichtbar auf das Paket kleben.";
  } else if (p.mode === M.CARRIER_AT_PICKUP) label = "Kein Ausdruck nötig – der Fahrer bringt das Versandlabel bei der Abholung am Paket an.";
  else if (p.mode === M.PENDING) label = "Das Versandlabel erstellt der Versanddienstleister. Sie finden es danach unter „Meine Sendungen“ → „Dokumente“.";
  else if (p.mode === M.SEPARATE) label = "Verwenden Sie das Versandlabel, das Ihnen gesondert bereitgestellt wurde.";
  else label = "Den Stand Ihres Versandlabels finden Sie unter „Meine Sendungen“ → „Dokumente“.";

  const art = tariff && typeof tariff === "object" ? tariff.serviceType : null;
  let uebergabe;
  if (art === "pickup") {
    uebergabe = pickupText ? `Paket zur Abholung bereithalten: ${pickupText}.` : "Paket zur vereinbarten Abholung bereithalten.";
  } else if (art === "dropoff") {
    uebergabe = dropoffText
      ? `Paket im gewählten Paketshop abgeben: ${dropoffText}.`
      : (carrierName ? `Paket in einem Paketshop von ${carrierName} abgeben.` : "Paket in einem Paketshop abgeben.");
  } else {
    uebergabe = "Paket an den Versanddienstleister übergeben.";
  }

  const verfolgung = tariff && tariff.trackingAvailable === false
    ? "Für diesen Tarif ist keine Sendungsverfolgung verfügbar."
    : "Tracking wird vorbereitet. Die Sendungsverfolgung erscheint unter „Meine Sendungen“, sobald der Versanddienstleister die Sendung übernommen hat.";

  return [label, uebergabe, verfolgung];
}

/**
 * Die Anschrift einer Partei („s" = Absender, „r" = Empfänger) aus den beim Buchen gesendeten Formulardaten —
 * Zeilen für „Buchungsdetails anzeigen". Nur gesetzte Werte, nichts wird ergänzt; das Land über die übergebene
 * Namenssuche (Ländercode → Name), sonst der Code.
 *
 * @returns {string[]}
 */
export function bookingSuccessAddressLines(form, prefix, countryName = (c) => c) {
  const f = form && typeof form === "object" ? form : {};
  const wert = (k) => (typeof f[`${prefix}_${k}`] === "string" ? f[`${prefix}_${k}`].trim() : "");
  const zeilen = [];
  const person = [wert("firstName"), wert("lastName")].filter(Boolean).join(" ") || wert("fullName");
  for (const z of [wert("company"), person, wert("street"), wert("addition"), [wert("zip"), wert("city")].filter(Boolean).join(" ")]) {
    if (z) zeilen.push(z);
  }
  const code = wert("country");
  if (code) zeilen.push(countryName(code) || code);
  return zeilen;
}
