// api/addressValidationApi.js — Zugriff auf die CE-Adressvalidierung.
//
// Das Frontend spricht AUSSCHLIESSLICH mit ConfidaraExpress; der externe Datendienst wird
// nie direkt aufgerufen. Damit bleiben Fehlerbehandlung, Caching, Ratenbegrenzung und ein
// späterer Anbieterwechsel serverseitig — und der Browser sendet keine Kundendaten an Dritte.
//
// Übertragen werden nur Adressbestandteile: Land, Postleitzahl, Ort, Straße. Kein Name,
// keine Firma, keine Telefonnummer, keine E-Mail, keine Konto- oder Sendungsdaten.
import { apiFetch } from "./client";

// Orte zu einer Postleitzahl.
export function fetchLocalities({ country, postalCode, city }, { signal } = {}) {
  const q = new URLSearchParams();
  q.set("country", String(country || ""));
  if (postalCode) q.set("postalCode", String(postalCode));
  if (city) q.set("city", String(city));
  return apiFetch(`/api/address/localities?${q.toString()}`, { auth: true, signal });
}

// Straßenvorschläge innerhalb einer PLZ/Ort-Kombination.
export function fetchStreets({ country, postalCode, city, street }, { signal } = {}) {
  const q = new URLSearchParams();
  q.set("country", String(country || ""));
  if (postalCode) q.set("postalCode", String(postalCode));
  if (city) q.set("city", String(city));
  q.set("street", String(street || ""));
  return apiFetch(`/api/address/streets?${q.toString()}`, { auth: true, signal });
}

// Gesamtprüfung. Maßgeblich für Preisberechnung und Buchung — der Client entscheidet nie
// selbst, ob eine Adresse gültig ist.
export function validateAddress({ country, postalCode, city, street }, { signal } = {}) {
  return apiFetch(`/api/address/validate`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ country, postalCode, city, street }),
    signal,
  });
}
