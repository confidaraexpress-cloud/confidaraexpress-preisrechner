/* utils/companyProfileView.mjs — die Anbieterangaben des Impressums aus der Serverantwort (Schritt 3, 2026-10-19).
   Reine Funktionen: kein Netz, kein Zustand, kein React.
   ─── DER SERVER ENTSCHEIDET, OB ES EINEN ANBIETER GIBT ────────────────────────
   GET /api/legal/company-profile liefert die zentralen Ausstellerangaben (Backend INVOICE_ISSUER_*) NUR, wenn dieser
   Aussteller einen gültigen Beleg ausstellen dürfte — sonst `{ status: "pre_formation" }`. Bei der Gründung werden
   die echten Angaben deshalb einmal in der Umgebung eingetragen; das Impressum folgt ohne neue Programmierung.
   ─── FAIL CLOSED ──────────────────────────────────────────────────────────────
   Jede andere Antwort (Fehler, fremde Form, fehlende Pflichtangabe) ergibt `null`: die Seite zeigt dann die
   Vorbereitungsdarstellung aus src/config/companyProfile.js — nie eine halbe oder erfundene Firmenangabe. */

const PFLICHT = Object.freeze(["name", "street", "postalCode", "city", "email"]);
const OPTIONAL = Object.freeze(["legalForm", "country", "phone", "managingDirectors", "registerCourt", "registerNumber", "vatId"]);
const LAENDER = Object.freeze({ DE: "Deutschland" });

const text = (w) => (typeof w === "string" && w.trim() !== "" ? w.trim() : null);

/** Die Anbieterangaben in genau der Form des Vertrags — oder `null`. */
export function readCompanyProfile(antwort) {
  if (!antwort || typeof antwort !== "object" || antwort.status !== "issuer") return null;
  const p = antwort.profile;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const out = {};
  for (const k of PFLICHT) { const v = text(p[k]); if (v === null) return null; out[k] = v; }
  for (const k of OPTIONAL) out[k] = text(p[k]);
  // Ein eingetragener Anbieter nennt beide Registerangaben — oder keine.
  if ((out.registerCourt === null) !== (out.registerNumber === null)) return null;
  return Object.freeze(out);
}

/** Firmenzeile: der Name; die Rechtsform nur, wenn der Name sie nicht schon trägt. */
export function companyNameLine(profil) {
  if (!profil.legalForm || profil.name.toLowerCase().includes(profil.legalForm.toLowerCase())) return profil.name;
  return `${profil.name} (${profil.legalForm})`;
}

/** Ländername für die Anschrift — ein ISO-Code wird ausgeschrieben, sonst der Wert selbst. */
export function countryName(country) {
  if (!country) return "Deutschland";
  return Object.prototype.hasOwnProperty.call(LAENDER, country.toUpperCase()) ? LAENDER[country.toUpperCase()] : country;
}
