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

/** Beschriftung des Downloadknopfs — der Servername plus die Aktion. */
export const shippingDocumentButtonLabel = (doc) => `${doc.label} ${BOOKING_SHIPPING_DOCUMENTS_TEXT.download}`;

/** Beschriftung, solange genau dieser Beleg lädt. */
export const shippingDocumentLoadingLabel = (doc) => `${doc.label} ${BOOKING_SHIPPING_DOCUMENTS_TEXT.loading}`;

/** Der neutrale Rückfalldateiname — derselbe wie in der Dokumentübersicht. */
export const shippingDocumentFallbackFilename = (doc) => documentFallbackFilename(doc.type, doc.ordinal, doc.labelSize);
