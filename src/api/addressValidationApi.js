// api/addressValidationApi.js — Zugriff auf die CE-Adressvorschläge und -prüfung.
//
// Das Frontend spricht AUSSCHLIESSLICH mit ConfidaraExpress; der externe Adressdienst wird
// nie direkt aufgerufen und sein Schlüssel liegt nie im Browser. Damit bleiben Fehlerbehandlung,
// Zwischenspeicher, Ratenbegrenzung, Kostendeckel und ein späterer Anbieterwechsel serverseitig.
//
// Übertragen werden nur Adressbestandteile: Land, Postleitzahl, Ort, Straße und Hausnummer. Kein
// Name, keine Firma, keine Telefonnummer, keine E-Mail, keine Konto- oder Sendungsdaten.
//
// `publicAccess` gilt allein für die Registrierung (nicht angemeldet): eigene Routen ohne
// Anmeldung — ohne `auth`, damit ein 401 dort nie die globale Abmeldung auslöst — und ohne
// Gesamtprüfung.
import { apiFetch } from "./client";

const base = (publicAccess) => (publicAccess ? "/api/address/public" : "/api/address");

// Orte zu einer Postleitzahl.
export function fetchLocalities({ country, postalCode }, { signal, publicAccess = false } = {}) {
  const q = new URLSearchParams();
  q.set("country", String(country || ""));
  if (postalCode) q.set("postalCode", String(postalCode));
  return apiFetch(`${base(publicAccess)}/localities?${q.toString()}`, { auth: !publicAccess, signal });
}

// Adressvorschläge während der Eingabe. PLZ und Ort grenzen ein, sind aber optional.
export function fetchStreets({ country, postalCode, city, street }, { signal, publicAccess = false } = {}) {
  const q = new URLSearchParams();
  q.set("country", String(country || ""));
  if (postalCode) q.set("postalCode", String(postalCode));
  if (city) q.set("city", String(city));
  q.set("street", String(street || ""));
  return apiFetch(`${base(publicAccess)}/streets?${q.toString()}`, { auth: !publicAccess, signal });
}

// Gesamtprüfung (nur angemeldet). Eine Eingabehilfe — Preisberechnung und Buchung hängen nicht
// an ihrem Ergebnis; der Client entscheidet nie selbst, ob eine Adresse gültig ist.
export function validateAddress({ country, postalCode, city, street }, { signal } = {}) {
  return apiFetch(`/api/address/validate`, {
    method: "POST",
    auth: true,
    body: JSON.stringify({ country, postalCode, city, street }),
    signal,
  });
}
