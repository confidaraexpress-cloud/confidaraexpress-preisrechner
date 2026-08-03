// Reine Hilfslogik für das Fortsetzen eines Formularentwurfs in „Neue Sendung".
//
// ── Zwei Arten von Werten im Entwurfs-Snapshot ──────────────────────────────
// Der Snapshot (shipmentFormSnapshot.mjs) trägt zwei fachlich verschiedene Dinge:
//
//  A) ECHTE SENDUNGS- UND BERECHNUNGSDATEN — Eingaben des Nutzers, jederzeit
//     eigenständig gültig und darstellbar:
//       sender.*, recipient.* (inkl. Land, PLZ, Ort, Kontaktdaten),
//       packages.* (Anzahl, Gewicht, Länge, Breite, Höhe),
//       shippingOptions.shippingDate,
//       shippingOptions.serviceFilter      (Abholung/Abgabe — feste Auswahlliste),
//       shippingOptions.shippingModeFilter (Standard/Express/Economy — feste Liste).
//     Diese werden beim Fortsetzen VOLLSTÄNDIG und unverändert wiederhergestellt.
//
//  B) ERGEBNISABHÄNGIGER UI-FILTER — nur relativ zu einer konkreten
//     Angebotsantwort sinnvoll:
//       shippingOptions.publicCarrierIds.
//     Die Auswahlliste dafür (publicCarriers) entsteht AUSSCHLIESSLICH aus der
//     publicCarriers-Antwort einer Preisberechnung; vor der ersten Berechnung
//     gibt es nichts auszuwählen. Nach dem Fortsetzen existiert die frühere
//     Antwort nicht mehr: die gespeicherten IDs sind nicht überprüfbar und
//     können für die aktuelle Route/das aktuelle Datum längst entfallen sein.
//     Ein solcher Filter darf die ERSTE Preisberechnung nicht einschränken —
//     sonst liefert sie fälschlich null Angebote.
//
// Die reinen Client-Anzeigefilter (max_price, latestDeliveryDate) sind aus
// demselben Grund von jeher NICHT Teil des Snapshots. publicCarrierIds war die
// verbliebene Ausnahme; hier wird sie beim Fortsetzen konsistent behandelt.

// Snapshot-/Resume-Felder, die ergebnisabhängig sind und deshalb beim
// Fortsetzen neutralisiert werden. Bewusst als Liste geführt, damit ein
// künftiges weiteres Feld hier sichtbar ergänzt wird statt still mitzulaufen.
export const RESULT_DERIVED_RESUME_FIELDS = Object.freeze(["selectedPublicCarrierIds"]);

// Initialzustand eines fortgesetzten Entwurfs.
//
// Übernimmt jede echte Sendungs-/Berechnungsangabe unverändert (Gruppe A) und
// neutralisiert ausschließlich den ergebnisabhängigen Carrier-Filter (Gruppe B).
// Der gespeicherte Snapshot bleibt davon unberührt — hier wird nur entschieden,
// womit das Formular startet und was folglich in die erste Preisberechnung geht.
//
// `null`/ungültige Eingabe → `null` (Aufrufer behandelt das als „kein Entwurf").
export function resumeInitialState(resumeInit) {
  if (!resumeInit || typeof resumeInit !== "object") return null;
  return { ...resumeInit, selectedPublicCarrierIds: [] };
}

// ── Verständlicher Hinweis auf fehlende/ungültige Pflichtangaben ────────────
// Ein abgebrochener Entwurf sieht ausgefüllt aus, deaktiviert den CTA aber über
// die Formularvalidierung. Ohne benannten Grund wirkt der Button schlicht tot.
// Feldschlüssel → menschenlesbare Bezeichnung, in der Sprache der Formular-
// beschriftungen, damit der Hinweis direkt zum markierten Feld führt.
const FIELD_LABELS = Object.assign(Object.create(null), {
  s_company:  "Absender – Unternehmen",
  s_fullName: "Absender – Vor- und Nachname",
  s_street:   "Absender – Straße & Hausnr.",
  s_addition: "Absender – Adresszusatz",
  s_zip:      "Absender – PLZ",
  s_city:     "Absender – Stadt",
  s_email:    "Absender – E-Mail",
  r_company:  "Empfänger – Unternehmen",
  r_fullName: "Empfänger – Vor- und Nachname",
  r_street:   "Empfänger – Straße & Hausnr.",
  r_addition: "Empfänger – Adresszusatz",
  r_zip:      "Empfänger – PLZ",
  r_city:     "Empfänger – Stadt",
  r_email:    "Empfänger – E-Mail",
  packageCount: "Anzahl Pakete",
  weight:       "Gewicht",
  length:       "Länge",
  width:        "Breite",
  height:       "Höhe",
});

// Stabile Anzeigereihenfolge (Absender → Empfänger → Paket), unabhängig von der
// Schlüsselreihenfolge des Fehlerobjekts.
const FIELD_ORDER = Object.keys(FIELD_LABELS);

const MAX_NAMED_FIELDS = 3;

// Baut aus dem Fehlerobjekt der Formularvalidierung einen kurzen Satz. null,
// wenn nichts zu beanstanden ist (dann wird kein Hinweis gerendert).
// Mehr als MAX_NAMED_FIELDS Felder werden zusammengefasst, damit der Hinweis
// eine Zeile bleibt — die Felder selbst sind ohnehin einzeln markiert.
export function missingFieldsHint(errors) {
  if (!errors || typeof errors !== "object") return null;
  const keys = FIELD_ORDER.filter((k) => Object.prototype.hasOwnProperty.call(errors, k) && errors[k]);
  // Unbekannte Schlüssel dürfen den Hinweis nicht verschlucken: sie zählen mit,
  // werden aber nicht namentlich genannt (keine erfundene Bezeichnung).
  const extra = Object.keys(errors).filter((k) => errors[k] && !FIELD_LABELS[k]).length;
  const total = keys.length + extra;
  if (total === 0) return null;
  if (keys.length === 0 || total > MAX_NAMED_FIELDS) {
    return `Bitte vervollständigen Sie ${total} markierte Angabe${total === 1 ? "" : "n"}, um Angebote zu vergleichen.`;
  }
  const named = keys.map((k) => FIELD_LABELS[k]);
  const list = named.length === 1
    ? named[0]
    : `${named.slice(0, -1).join(", ")} und ${named[named.length - 1]}`;
  return `Bitte prüfen Sie ${list}, um Angebote zu vergleichen.`;
}

export const RESUME_FIELD_LABELS = FIELD_LABELS;
