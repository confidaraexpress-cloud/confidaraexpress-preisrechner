/* Zusätzliche Versand-E-Mails (Tracking / Label+Tracking) — reine Logik.
   =============================================================================
   Der Kunde kann bei der Buchung bis zu zwei weitere Adressen angeben, die nach
   erfolgreicher Buchung Versandinformationen erhalten:

     • trackingEmail       → nur Trackinginformationen
     • labelTrackingEmail  → Trackinginformationen UND das Versandlabel als PDF

   Dieselbe Regel und dieselbe Obergrenze wie im Backend (lib/shipmentEmailOptions.js)
   und wie überall sonst im Frontend (registrationValidation, emailChangeView) —
   eine abweichende Regel würde eine Adresse hier annehmen und dort ablehnen.

   Das Frontend ersetzt die serverseitige Prüfung NICHT: es verhindert nur, dass
   ein offensichtlicher Tippfehler erst nach einer kostenpflichtigen Buchung
   auffällt. Autoritativ bleibt das Backend. */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX_LENGTH = 255;

/* Prüft eine Zusatzadresse — aber NUR, wenn ihre Option aktiv ist.
   Ist die Option aus, gibt es nichts zu prüfen: ein noch im Formular liegender
   Wert darf die Buchung nicht blockieren, weil er auch nicht gesendet wird.
   Rückgabe: null (in Ordnung) oder ein fertiger Fehlertext. */
export function shipmentEmailError(enabled, value) {
  if (!enabled) return null;
  const v = String(value == null ? "" : value).trim();
  if (v === "") return "Bitte geben Sie eine E-Mail-Adresse ein.";
  if (v.length > EMAIL_MAX_LENGTH) return `Die E-Mail-Adresse darf höchstens ${EMAIL_MAX_LENGTH} Zeichen lang sein.`;
  if (!EMAIL_RE.test(v)) return "Bitte geben Sie eine gültige E-Mail-Adresse ein.";
  return null;
}

/* Baut die optionalen Payload-Felder für /book.
   Der Schalterzustand selbst wird NICHT gesendet — eine vorhandene Adresse IST
   die Aktivierung (so steht es im Backendvertrag). Ist eine Option aus oder das
   Feld leer, fehlt der Schlüssel vollständig; ältere Backends und der bisherige
   Ablauf bleiben dadurch unverändert. */
export function buildShipmentEmailPayload({
  trackingEmailEnabled, trackingEmail,
  labelTrackingEmailEnabled, labelTrackingEmail,
} = {}) {
  const payload = {};
  const t = String(trackingEmail == null ? "" : trackingEmail).trim();
  const l = String(labelTrackingEmail == null ? "" : labelTrackingEmail).trim();
  if (trackingEmailEnabled && t) payload.trackingEmail = t;
  if (labelTrackingEmailEnabled && l) payload.labelTrackingEmail = l;
  return payload;
}
