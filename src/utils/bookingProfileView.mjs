// ─────────────────────────────────────────────────────────────────────────────
// F1 — Buchungsbereitschaft des Kontos: reine, framework-freie Anzeigelogik (.mjs).
//
// Die Rechnungsanschrift ist im Konto bewusst optional (Registrierung, Profil), für jede
// Buchung aber Pflicht — ohne sie entsteht keine Rechnung. Die REGEL steht ausschließlich im
// Backend: /kundenbereich und die Antwort von PATCH /kunde/profil liefern `bookingProfile`
// ({ complete, missingFields }) aus denselben Regeln wie die Kontogates der Buchung
// (lib/booking/businessPreconditions.js). Hier steht nur, wie das Ergebnis dem Kunden gesagt
// wird — keine zweite Fassung der Regel.
//
// Fehlt der Status (älteres Backend), gibt es keinen Hinweis. Das ist bewusst so: der Hinweis
// informiert nur, entschieden wird serverseitig beim Buchen.
// ─────────────────────────────────────────────────────────────────────────────

// Die Feldnamen des Backends → die Beschriftungen der Profilfelder (Profile.jsx).
export const BOOKING_PROFILE_FIELD_LABELS = Object.freeze({
  company_name: "Firmenname",
  street: "Straße & Hausnummer",
  zip: "PLZ",
  city: "Stadt",
  country: "Land",
});

export const BOOKING_PROFILE_GENERIC_TEXT =
  "Für Buchungen fehlen noch Angaben in Ihrem Unternehmensprofil. Bitte ergänzen Sie sie vor der Buchung.";

// Nur bekannte Felder, in der Reihenfolge des Backends, ohne Doppelte.
function gapLabels(fields) {
  if (!Array.isArray(fields)) return [];
  const labels = [];
  for (const f of fields) {
    const label = Object.prototype.hasOwnProperty.call(BOOKING_PROFILE_FIELD_LABELS, f)
      ? BOOKING_PROFILE_FIELD_LABELS[f] : null;
    if (label && !labels.includes(label)) labels.push(label);
  }
  return labels;
}

const gapText = (labels) =>
  `Für Buchungen fehlen in Ihrem Unternehmensprofil noch folgende Angaben: ${labels.join(", ")}. `
  + "Bitte ergänzen Sie sie vor der Buchung – sie werden für Ihre Rechnung benötigt.";

// Hinweis aus dem Kontostatus — nur wenn das Backend AUSDRÜCKLICH „nicht vollständig" meldet.
// Unbekannte oder fehlende Felder: der allgemeine Text, nie ein stiller Verzicht.
export function bookingProfileNotice(status) {
  if (!status || typeof status !== "object" || status.complete !== false) return null;
  const labels = gapLabels(status.missingFields);
  return labels.length > 0 ? gapText(labels) : BOOKING_PROFILE_GENERIC_TEXT;
}

// Die 422-Antwort der Buchung (BUSINESS_PROFILE_INCOMPLETE) nennt die fehlenden Felder in
// `missingFields`. Ohne sie bleibt der übergebene Text des Fehlerkatalogs.
export function bookingProfileGateText(body, fallback) {
  const labels = gapLabels(body && typeof body === "object" ? body.missingFields : null);
  return labels.length > 0 ? gapText(labels) : fallback;
}
