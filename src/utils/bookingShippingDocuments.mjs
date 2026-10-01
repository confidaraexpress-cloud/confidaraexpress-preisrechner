// ─────────────────────────────────────────────────────────────────────────────
// Versandbelege auf dem Buchungs-Erfolgsbildschirm — reine Auswertung (TG-F5).
//
// Kein React, kein fetch, kein Zustand. Beantwortet ausschließlich: welche Versandbelege
// meldet die Buchungsantwort, und was darf der Erfolgsbildschirm dazu anbieten?
//
// ─── Der Server ist die Wahrheit ─────────────────────────────────────────────
// `booking.shippingDocuments` entsteht serverseitig aus der Belegablage der Buchung, mit
// demselben Aufbau wie die Dokumentübersicht (GET /api/shipments/:id/documents). Hier wird
// nichts ergänzt: kein Pfad gebaut, keine Paketnummer vergeben, kein Name erfunden. Ein
// Eintrag, der nicht vollständig und sicher ist, fällt weg — er wird nicht repariert.
//
// ─── Und dauerhaft? ──────────────────────────────────────────────────────────
// Der Erfolgsbildschirm ist ein Augenblick. Nach einem Reload, einer Abmeldung oder auf
// einem anderen Gerät kommen dieselben Belege aus der Dokumentübersicht der Sendung — nie
// aus diesem Zustand.
// ─────────────────────────────────────────────────────────────────────────────

import {
  isSafeApiPath, documentFallbackFilename, documentCarrierReference, documentLabelSize,
} from "./shipmentDocumentsView.mjs";

// Die zwei Versandbelegarten, die ein Kunde bekommt — in dieser Reihenfolge. Alles andere
// erscheint hier nicht.
export const SHIPPING_DOCUMENT_TYPES = Object.freeze(["LABEL", "COLLECTION_LABEL"]);

// Alles, was der Kunde liest. Kein Anbietername, keine Belegart, keine interne Angabe.
export const BOOKING_SHIPPING_DOCUMENTS_TEXT = Object.freeze({
  download: "herunterladen",
  loading: "wird geladen …",
  whereToFind: "Alle Versanddokumente dieser Sendung finden Sie jederzeit unter „Meine Sendungen“ → „Dokumente“.",
});

/**
 * Der Druckhinweis zu mehrseitigen Versandbelegen — wörtlich vom Server.
 *
 * Ein Beleg kann neben den Paketetiketten ein Dokument enthalten, das der Carrier
 * ausdrücklich NICHT auf dem Paket haben will. Welcher Satz das ist und WANN er gilt,
 * entscheidet ausschließlich der Server: er allein kennt die Seitenzahl der gespeicherten
 * Belege. Hier wird nichts formuliert, nichts abgeleitet und nichts aus der Paketzahl
 * geschlossen — ein fehlender oder leerer Wert ergibt `null`, und dann steht keine Zeile da.
 *
 * @returns {string|null}
 */
export function bookingShippingPrintNotice(booking) {
  const roh = booking && typeof booking.shippingPrintNotice === "string" ? booking.shippingPrintNotice.trim() : "";
  return roh === "" ? null : roh;
}

const rang = (typ) => SHIPPING_DOCUMENT_TYPES.indexOf(typ);

/**
 * Die ladbaren Versandbelege einer Buchungsantwort — geprüft und stabil sortiert.
 *
 * Ein Eintrag zählt nur, wenn ALLES stimmt: bekannte Versandbelegart, Zustand `ready`, ein
 * relativer Pfad auf diese API, ein nicht leerer Name vom Server und eine gültige
 * Ordnungszahl. Derselbe Pfad zweimal ergibt einen Knopf. Ohne verwertbare Angabe entsteht
 * eine leere Liste — der Erfolgsbildschirm bleibt dann beim bisherigen Labelknopf.
 *
 * `labelSize` ist das vom Server genannte Format eines Versandlabels (`"A4"`/`"THERMAL"`) oder
 * `null`. Zwei Formate desselben Etiketts bleiben zwei Knöpfe — ihr Name kommt vom Server.
 *
 * @returns {Array<{type:string, ordinal:number, label:string, downloadPath:string, carrierReference:string|null, labelSize:string|null}>}
 */
export function bookingShippingDocuments(booking) {
  const roh = booking && Array.isArray(booking.shippingDocuments) ? booking.shippingDocuments : [];
  const gesehen = new Set();
  return roh
    .filter((d) => d && typeof d === "object"
      && SHIPPING_DOCUMENT_TYPES.includes(d.type)
      && d.status === "ready"
      && isSafeApiPath(d.downloadPath)
      && typeof d.label === "string" && d.label.trim() !== ""
      && typeof d.ordinal === "number" && Number.isInteger(d.ordinal) && d.ordinal >= 0)
    .map((d) => ({
      type: d.type,
      ordinal: d.ordinal,
      label: d.label.trim(),
      downloadPath: d.downloadPath.trim(),
      carrierReference: documentCarrierReference(d),
      labelSize: documentLabelSize(d),
    }))
    .filter((d) => (gesehen.has(d.downloadPath) ? false : (gesehen.add(d.downloadPath), true)))
    .sort((a, b) => (rang(a.type) - rang(b.type)) || (a.ordinal - b.ordinal));
}

// ─── P2-01 / EXTRA: DER LABELSTAND DER BUCHUNGSANTWORT ──────────────────────────────
// Ohne gemeldete Versandbelege bot der Erfolgsbildschirm bis hierher JEDER Buchung „Label
// herunterladen" an — auch einer Portalbuchung, deren Etikett der Anbieter erst Stunden später
// erzeugt, und einer Buchung, deren Etikett noch gar nicht in ConfidaraExpress liegt. Der Knopf
// war eine Zusage ohne Beleg. Der Server nennt den Stand jetzt selbst (`labelStatus`, dieselbe
// Definition wie Auftragsbestätigung und Betriebssicht):
//   available  das Label liegt in ConfidaraExpress         → der Downloadknopf
//   pending    es entsteht noch bzw. liegt beim Anbieter   → der Satz „wird erstellt"; nur mit
//              `labelRetrievable` dazu der ausdrückliche Abruf (zweitrangig, nie „herunterladen")
//   separate   außerhalb von ConfidaraExpress bereitgestellt → der Satz, kein Knopf
//   unknown    kein Beleg (auch jeder unbekannte Wert)     → ein neutraler Verweis, kein Knopf
// Fehlt das Feld ganz, antwortet ein Server vor diesem Stand: dann bleibt es beim bisherigen Knopf.
export const BOOKING_LABEL_TEXT = Object.freeze({
  pending: "Ihr Versandlabel wird erstellt. Sobald es verfügbar ist, können Sie es in Ihrem ConfidaraExpress-Konto abrufen.",
  separate: "Das Versandlabel wurde Ihnen gesondert bereitgestellt.",
  carrierApplied: "Das Versandlabel wird bei der Abholung vom Fahrer an Ihrem Paket angebracht. Sie müssen kein Versandlabel ausdrucken.",
  unknown: "Den aktuellen Stand Ihres Versandlabels finden Sie jederzeit unter „Meine Sendungen“ → „Dokumente“.",
  retrieve: "Versandlabel jetzt abrufen",
  retrieving: "Versandlabel wird abgerufen …",
});

export const BOOKING_LABEL_MODE = Object.freeze({
  DOWNLOAD: "download", PENDING: "pending", SEPARATE: "separate", CARRIER_APPLIED: "carrier_applied", UNKNOWN: "unknown",
});

/**
 * Was der Erfolgsbildschirm zum Versandlabel anbieten darf, wenn die Antwort KEINE ladbaren
 * Versandbelege meldet.
 *
 * @returns {{mode: string, retrievable: boolean, text: string|null}}
 */
export function bookingLabelView(booking) {
  const b = booking && typeof booking === "object" ? booking : {};
  const M = BOOKING_LABEL_MODE;
  if (!Object.prototype.hasOwnProperty.call(b, "labelStatus")) return { mode: M.DOWNLOAD, retrievable: false, text: null };
  switch (b.labelStatus) {
    case "available":       return { mode: M.DOWNLOAD, retrievable: false, text: null };
    case "pending":         return { mode: M.PENDING, retrievable: b.labelRetrievable === true, text: BOOKING_LABEL_TEXT.pending };
    case "separate":        return { mode: M.SEPARATE, retrievable: false, text: BOOKING_LABEL_TEXT.separate };
    case "carrier_applied": return { mode: M.CARRIER_APPLIED, retrievable: false, text: BOOKING_LABEL_TEXT.carrierApplied };
    default:                return { mode: M.UNKNOWN, retrievable: false, text: BOOKING_LABEL_TEXT.unknown };
  }
}

/** Beschriftung des Downloadknopfs — der Servername plus die Aktion. */
export const shippingDocumentButtonLabel = (doc) => `${doc.label} ${BOOKING_SHIPPING_DOCUMENTS_TEXT.download}`;

/** Beschriftung, solange genau dieser Beleg lädt. */
export const shippingDocumentLoadingLabel = (doc) => `${doc.label} ${BOOKING_SHIPPING_DOCUMENTS_TEXT.loading}`;

/** Der neutrale Rückfalldateiname — derselbe wie in der Dokumentübersicht. */
export const shippingDocumentFallbackFilename = (doc) => documentFallbackFilename(doc.type, doc.ordinal, doc.labelSize);
