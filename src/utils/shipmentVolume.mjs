// Voraussichtliches monatliches Versandvolumen (Betreiberentscheidung 2026-11-06, Phase 1, Canonical v2.117).
//
// Spiegel von Backend lib/shipmentVolume.js — dieselben acht Schlüssel und Texte; beide Seiten prüfen gegen dieselbe
// Falltabelle (src/testing/shipmentVolumeCases.json, bytegleich mit dem Backend). Verbindlich prüft der Server:
// POST /register verlangt genau eine Angabe, PATCH /kunde/profil ändert sie (leeren geht nicht).
//
// Pflicht nur bei der Neuregistrierung. Ein Bestandskonto ohne Angabe sieht „Keine Angabe" und kann alles andere
// unverändert speichern — die Angabe ist keine Freischalt- oder Buchungsbedingung und wirkt auf keinen Preis.

export const SHIPMENT_VOLUME_FIELD = "monthly_shipment_volume";
export const SHIPMENT_VOLUME_QUESTION = "Voraussichtliches monatliches Versandvolumen";

// Reihenfolge = Reihenfolge der Auswahl. Texte exakt nach Betreibervorgabe.
export const SHIPMENT_VOLUME_OPTIONS = Object.freeze([
  Object.freeze({ key: "1_10", label: "1–10 Sendungen" }),
  Object.freeze({ key: "11_50", label: "11–50 Sendungen" }),
  Object.freeze({ key: "51_100", label: "51–100 Sendungen" }),
  Object.freeze({ key: "101_250", label: "101–250 Sendungen" }),
  Object.freeze({ key: "251_500", label: "251–500 Sendungen" }),
  Object.freeze({ key: "501_1000", label: "501–1.000 Sendungen" }),
  Object.freeze({ key: "over_1000", label: "Mehr als 1.000 Sendungen" }),
  Object.freeze({ key: "none_yet", label: "Noch kein Versand / Neugründung" }),
]);

export const SHIPMENT_VOLUME_KEYS = Object.freeze(SHIPMENT_VOLUME_OPTIONS.map((o) => o.key));

export const SHIPMENT_VOLUME_TEXT = Object.freeze({
  required: "Bitte wählen Sie Ihr voraussichtliches monatliches Versandvolumen.",
  invalid: "Bitte wählen Sie eine der angebotenen Angaben zum Versandvolumen.",
  // Registrierung: eine Einschätzung genügt, die Angabe bleibt änderbar.
  hint: "Eine Einschätzung genügt – Sie können die Angabe später im Profil ändern.",
  // Bestandskonto ohne Angabe (Profil, Admin-Kundendetail).
  none: "Keine Angabe",
  // Profil: der Server hat die Angabe nicht übernommen (etwa ein noch nicht aktualisierter Server).
  notConfirmed: "Das Versandvolumen wurde nicht übernommen. Bitte versuchen Sie es in einigen Minuten erneut.",
  // Admin-Kundendetail.
  adminLabel: "Versandvolumen (Angabe des Kunden)",
});

export const isShipmentVolumeKey = (v) => typeof v === "string" && SHIPMENT_VOLUME_KEYS.includes(v);

// Registrierung — dieselbe Regel und dieselben Codes wie validateRegistrationShipmentVolume im Backend.
// → { ok: true, value } | { ok: false, code, error }
export function validateRegistrationShipmentVolume(raw) {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: false, code: "SHIPMENT_VOLUME_REQUIRED", error: SHIPMENT_VOLUME_TEXT.required };
  }
  if (!isShipmentVolumeKey(raw)) {
    return { ok: false, code: "SHIPMENT_VOLUME_INVALID", error: SHIPMENT_VOLUME_TEXT.invalid };
  }
  return { ok: true, value: raw };
}

// Anzeigetext eines gespeicherten Werts; unbekannt oder leer → null (der Aufrufer zeigt „Keine Angabe").
export function shipmentVolumeLabel(key) {
  const o = SHIPMENT_VOLUME_OPTIONS.find((x) => x.key === key);
  return o ? o.label : null;
}
