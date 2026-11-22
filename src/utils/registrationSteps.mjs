/* ── Registrierung in drei Schritten (Premium UX 4.0, Betreiberentscheidung A3, 2026-11-22) ─────────────────────────
   Reine Frontend-Führung über DASSELBE Formular: dieselben Felder und Kennungen, dieselben Prüfungen (getRegErrors,
   getRegDeclarationErrors), dieselben Erklärungen und am Ende dieselbe eine Anfrage POST /register. Ein Schrittwechsel
   prüft nur die Felder seines Schritts im Browser und sendet nichts; die Werte bleiben im Zustand der Seite (nichts im
   Browserspeicher). Dieses Modul kennt nur die Zuordnung Feld → Schritt → Kennung, die Zusammenfassung des letzten
   Schritts und die Wortlaute der Führung — keine eigene Regel. */
import { VAT_ID_TEXT, VAT_ID_ABSENT_TEXT, legalFormLabel } from "./vatId.mjs";
import { SHIPMENT_VOLUME_QUESTION, shipmentVolumeLabel } from "./shipmentVolume.mjs";

export const REG_STEPS = Object.freeze([
  Object.freeze({
    id: "zugang", kurz: "Zugang", titel: "Ansprechpartner und Zugang",
    felder: Object.freeze(["name", "email", "password", "passwordRepeat"]),
  }),
  Object.freeze({
    id: "unternehmen", kurz: "Unternehmen", titel: "Ihr Unternehmen",
    felder: Object.freeze(["company_name", "vat_id", "vat_id_absent", "legal_form", "monthly_shipment_volume",
      "country", "street", "zip", "city"]),
  }),
  Object.freeze({
    id: "pruefen", kurz: "Prüfen", titel: "Prüfen und beantragen",
    felder: Object.freeze(["businessCustomerConfirmed", "termsAcknowledged"]),
  }),
]);
export const REG_LAST_STEP = REG_STEPS.length - 1;

// Kennung des Bedienelements je Feld — Ziel des Fokus, wenn ein Fehler auf das Feld zeigt. Die Erklärungen tragen ihr
// natives Kästchen unter `${id}-input` (AUD-012).
export const REG_FIELD_IDS = Object.freeze({
  name: "reg-name", email: "reg-email", password: "reg-password", passwordRepeat: "reg-password-repeat",
  company_name: "reg-company", vat_id: "reg-vat", vat_id_absent: "reg-vat-absent", legal_form: "reg-legal-form",
  monthly_shipment_volume: "reg-volume", country: "reg-country", street: "reg-street", zip: "reg-zip", city: "reg-city",
  businessCustomerConfirmed: "reg-business-input", termsAcknowledged: "reg-terms-input",
});

/** Schritt eines Felds (0-basiert), unbekannt → -1. */
export function regStepOfField(feld) {
  return REG_STEPS.findIndex((s) => s.felder.includes(feld));
}

const fehlerListe = (fehler) => (fehler && typeof fehler === "object" ? fehler : {});

/** Nur die Fehler eines Schritts, in der Reihenfolge seiner Felder. */
export function regStepErrors(schritt, fehler) {
  const s = REG_STEPS[schritt];
  const f = fehlerListe(fehler);
  const out = {};
  if (!s) return out;
  for (const k of s.felder) if (f[k]) out[k] = f[k];
  return out;
}

/** Erster Schritt mit einem Fehler (ohne Fehler -1). Ein Feld ohne Schritt führt in den letzten Schritt, über dem der
 *  allgemeine Hinweis steht. */
export function regFirstStepWithError(fehler) {
  const f = fehlerListe(fehler);
  const keys = Object.keys(f).filter((k) => f[k]);
  if (keys.length === 0) return -1;
  return keys.reduce((min, k) => {
    const i = regStepOfField(k);
    return i >= 0 && i < min ? i : min;
  }, REG_LAST_STEP);
}

/** Kennung des ersten fehlerhaften Felds eines Schritts (Fokusziel), sonst null. */
export function regFirstErrorFieldId(schritt, fehler) {
  const s = REG_STEPS[schritt];
  const f = fehlerListe(fehler);
  const k = s ? s.felder.find((x) => f[x]) : undefined;
  return k ? REG_FIELD_IDS[k] : null;
}

export const REG_STEP_TEXT = Object.freeze({
  fortschritt: "Fortschritt der Registrierung",
  schrittVon: (nr, gesamt) => `Schritt ${nr} von ${gesamt}`,
  erledigt: "erledigt",
  weiter: "Weiter",
  zurueck: "Zurück",
  aendern: "Ändern",
  absenden: "Konto beantragen",
  absendenLaeuft: "Wird erstellt…",
  pruefenText: "Bitte prüfen Sie Ihre Angaben. Der Antrag wird erst mit „Konto beantragen“ gesendet.",
  passwortGesetzt: "Festgelegt",
  keineAngabe: "Keine Angabe",
  adresse: "Adresse",
});

const text = (v) => (typeof v === "string" ? v.trim() : "");

/** Zusammenfassung für den letzten Schritt: je früherem Schritt Titel und Zeilen (Bezeichnung, Wert). Das Passwort
 *  erscheint nie im Klartext. `landName` übersetzt den Ländercode (Liste vom Server). */
export function regSummary(form = {}, { landName = (code) => code } = {}) {
  const ohneUst = form.vat_id_absent === true;
  const adresse = [text(form.street), [text(form.zip), text(form.city)].filter(Boolean).join(" ")].filter(Boolean);
  const mitAdresse = adresse.length > 0;
  const unternehmen = [
    { feld: "company_name", label: "Firmenname", wert: text(form.company_name) },
    ohneUst
      ? { feld: "vat_id_absent", label: VAT_ID_TEXT.label, wert: VAT_ID_ABSENT_TEXT.toggle }
      : { feld: "vat_id", label: VAT_ID_TEXT.label, wert: text(form.vat_id) },
  ];
  if (ohneUst) {
    unternehmen.push({ feld: "legal_form", label: VAT_ID_ABSENT_TEXT.legalFormLabel, wert: legalFormLabel(form.legal_form) || "" });
  }
  unternehmen.push(
    { feld: "monthly_shipment_volume", label: SHIPMENT_VOLUME_QUESTION, wert: shipmentVolumeLabel(form.monthly_shipment_volume) || "" },
    { feld: "street", label: REG_STEP_TEXT.adresse,
      wert: mitAdresse ? [...adresse, landName(form.country) || text(form.country)].filter(Boolean).join(", ") : REG_STEP_TEXT.keineAngabe },
  );
  return [
    {
      schritt: 0, titel: REG_STEPS[0].titel,
      zeilen: [
        { feld: "name", label: "Ansprechpartner", wert: text(form.name) },
        { feld: "email", label: "Geschäftliche E-Mail", wert: text(form.email) },
        { feld: "password", label: "Passwort", wert: REG_STEP_TEXT.passwortGesetzt },
      ],
    },
    { schritt: 1, titel: REG_STEPS[1].titel, zeilen: unternehmen },
  ];
}
