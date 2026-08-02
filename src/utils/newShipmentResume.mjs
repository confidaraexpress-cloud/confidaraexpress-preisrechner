// Reine Hilfslogik für das Fortsetzen eines Formularentwurfs in „Neue Sendung".
//
// Hintergrund: Ein fortgesetzter Entwurf bringt zwei Zustände mit, die das Formular
// beim ersten Render sonst NICHT darstellen kann — und die dadurch unsichtbar
// wirksam werden:
//
//  1. Der gespeicherte Versanddienst-Filter (publicCarrierIds). Die Auswahlliste
//     wird sonst ausschließlich aus der publicCarriers-Antwort einer vorherigen
//     Preisberechnung gespeist und ist vor der ersten Berechnung leer. Der
//     wiederhergestellte Filter wäre also aktiv, aber weder sichtbar noch gezielt
//     abwählbar — und würde die erste Berechnung stillschweigend einschränken.
//  2. Fehlende Pflichtangaben eines abgebrochenen Entwurfs. Der CTA ist dann
//     deaktiviert, ohne dass irgendetwas erklärt, WELCHE Angabe fehlt.
//
// Beides ist hier als reine Funktion abgebildet (keine React-Abhängigkeit,
// kein DOM, kein Netz) und dadurch direkt testbar.

// ── 1. Sichtbare Versanddienst-Optionen für einen fortgesetzten Entwurf ──────
// Erzeugt aus den gespeicherten IDs die Chip-Liste, die die Auswahlliste vor der
// ersten Preisberechnung anzeigt. Format identisch zur publicCarriers-Antwort
// des Backends ({ id, name }), damit die erste echte Antwort sie nahtlos ersetzt.
// `resolveName(id)` liefert den kanonischen Anzeigenamen (im Aufrufer aus
// carrierMap); fehlt er, bleibt die ID als Notbehelf stehen — nie leer.
// Duplikate und Nicht-Strings werden verworfen; Reihenfolge bleibt erhalten.
export function resumePublicCarrierOptions(selectedIds, resolveName) {
  if (!Array.isArray(selectedIds)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of selectedIds) {
    if (typeof raw !== "string") continue;
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    let name = "";
    if (typeof resolveName === "function") {
      const n = resolveName(id);
      if (typeof n === "string") name = n.trim();
    }
    out.push({ id, name: name || id });
  }
  return out;
}

// ── 2. Verständlicher Hinweis auf fehlende/ungültige Pflichtangaben ─────────
// Feldschlüssel → menschenlesbare Bezeichnung. Bewusst dieselbe Sprache wie die
// Formularbeschriftungen, damit der Hinweis direkt zum markierten Feld führt.
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
