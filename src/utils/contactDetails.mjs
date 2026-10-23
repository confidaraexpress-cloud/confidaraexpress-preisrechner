/* utils/contactDetails.mjs — Kontakt-E-Mail und Telefon des Ansprechpartners (Auftrag 2 / P8, 2026-10-17).
   Reine Funktionen, gespiegelt aus Backend `lib/contactDetails.js`; beide prüfen gegen dieselbe Falltabelle
   (src/testing/contactDetailsCases.json ↔ Backend tests/fixtures/contactDetailsCases.json). Das Backend bleibt
   autoritativ — hier wird nur vorgeprüft, damit der Fehler direkt am Feld steht.

   Beide Angaben sind OPTIONAL. Leer heißt „keine Angabe“ und leert das Feld. Die Kontakt-E-Mail ist NICHT die
   Login-E-Mail: sie ändert weder Anmeldung noch Passwort, Rechnungsempfang oder Systemmails. */

// Paket A (2026-10-23): die Telefonregel ist der zentrale Telefonvertrag — keine zweite Fassung hier.
import { parsePhoneNumber } from "./phoneNumber.mjs";

export const CONTACT_EMAIL_MAXLEN = 254;
export const CONTACT_PHONE_MAXLEN = 30;

export const CONTACT_DETAILS_TEXT = Object.freeze({
  emailInvalid: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
  phoneInvalid: "Bitte geben Sie eine gültige Telefonnummer ein (Beispiel: +49 711 123456-78).",
});

// Eine Adresse, kein Verteiler: keine Leerzeichen, kein zweites @, keine Trenn- oder Klammerzeichen.
const EMAIL_RE = /^[^\s@,;<>()[\]"]+@[^\s@,;<>()[\]"]+\.[^\s@,;<>()[\]".]{2,}$/;

/** → { ok: true, value: string|null } | { ok: false, error } */
export function validateContactEmail(raw) {
  const v = typeof raw === "string" ? raw.trim() : raw == null ? "" : null;
  if (v === null) return { ok: false, error: CONTACT_DETAILS_TEXT.emailInvalid };
  if (v === "") return { ok: true, value: null };
  if (v.length > CONTACT_EMAIL_MAXLEN || !EMAIL_RE.test(v)) return { ok: false, error: CONTACT_DETAILS_TEXT.emailInvalid };
  return { ok: true, value: v };
}

/** → { ok: true, value: string|null } | { ok: false, error } */
export function validateContactPhone(raw) {
  const v = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : raw == null ? "" : null;
  if (v === null) return { ok: false, error: CONTACT_DETAILS_TEXT.phoneInvalid };
  if (v === "") return { ok: true, value: null };
  // Erkannt nach dem Telefonvertrag (Schreibweisen, Durchwahl, 6 bis 15 Ziffern); gespeichert wird die Angabe,
  // wie der Kunde sie geschrieben hat — nur der Leerraum ist zusammengezogen.
  if (v.length > CONTACT_PHONE_MAXLEN || !parsePhoneNumber(v).ok) {
    return { ok: false, error: CONTACT_DETAILS_TEXT.phoneInvalid };
  }
  return { ok: true, value: v };
}
