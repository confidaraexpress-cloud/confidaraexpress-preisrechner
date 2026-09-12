// TG22 Paket B — Labelformat als Fähigkeit des ANGEBOTS, nicht als feste Auswahl der Seite.
//
// ─── Zwei Felder, zwei Fragen ────────────────────────────────────────────────
//   labelFormatOptions  Welche Druckformate darf der Kunde für DIESES Angebot WÄHLEN?
//                       Etwa ["A4","A6"] oder [] — der Server entscheidet je Angebot.
//   labelSizes          In welchen Formaten wird das Label GELIEFERT? Reine Auskunft,
//                       keine Auswahl (etwa A4 und Thermodruck zugleich).
//
// Fail-closed: fehlt `labelFormatOptions`, ist es null, kein Array oder leer, gibt es KEINE
// Auswahl und es wird KEIN `labelFormat` an /book gesendet. Ein Angebot aus einer älteren
// Antwort bekommt damit nie eine Auswahl, die der Server für es gar nicht anbietet.
//
// Framework-frei und ohne DOM prüfbar.

// Die einzigen Formate, für die es eine kundensichtbare Beschriftung gibt. Ein vom Server
// genanntes unbekanntes Format wird nicht angeboten — es gäbe keinen Namen dafür.
export const SELECTABLE_LABEL_FORMATS = Object.freeze(["A4", "A6"]);

/** Die für dieses Angebot wählbaren Formate, in Serverreihenfolge. Leer = keine Auswahl. */
export function labelFormatOptionsOf(tariff) {
  const roh = tariff && typeof tariff === "object" ? tariff.labelFormatOptions : null;
  if (!Array.isArray(roh) || roh.length === 0) return [];
  const gesehen = new Set();
  const optionen = [];
  for (const wert of roh) {
    const id = typeof wert === "string" ? wert.trim().toUpperCase() : "";
    if (!SELECTABLE_LABEL_FORMATS.includes(id) || gesehen.has(id)) continue;
    gesehen.add(id);
    optionen.push(id);
  }
  return optionen;
}

/** Gibt es für dieses Angebot überhaupt eine Formatauswahl? */
export function labelFormatSelectable(tariff) {
  return labelFormatOptionsOf(tariff).length > 0;
}

/** Standardformat eines Angebots mit Auswahl: A4, wenn angeboten, sonst das erste Format. */
export function defaultLabelFormat(tariff) {
  const optionen = labelFormatOptionsOf(tariff);
  if (optionen.length === 0) return "A4";
  return optionen.includes("A4") ? "A4" : optionen[0];
}

/**
 * Startwert beim Wiederherstellen (laufender Vorgang oder Entwurf): der gespeicherte Wert
 * NUR, wenn dieses Angebot ihn anbietet — sonst der Standard dieses Angebots.
 */
export function restoredLabelFormat(tariff, stored) {
  const wert = typeof stored === "string" ? stored.trim().toUpperCase() : "";
  return labelFormatOptionsOf(tariff).includes(wert) ? wert : defaultLabelFormat(tariff);
}

/**
 * Der /book-Anteil. `{ labelFormat }` ausschließlich, wenn die Auswahl für dieses Angebot gilt
 * UND der Wert eine seiner Optionen ist — sonst ein leeres Objekt (kein Feld, kein null).
 */
export function labelFormatBookPayload(tariff, labelFormat) {
  const wert = typeof labelFormat === "string" ? labelFormat.trim().toUpperCase() : "";
  return labelFormatOptionsOf(tariff).includes(wert) ? { labelFormat: wert } : {};
}

// Liefergrößen → Kundennamen. Die Schreibweise des Servers schwankt (THERMAL / Thermal).
const LIEFERGROESSEN = Object.freeze({ A4: "DIN A4", A6: "DIN A6", THERMAL: "Thermodruck" });

/**
 * Neutraler Hinweis, in welchen Formaten das Label geliefert wird — für Angebote OHNE Auswahl.
 * „Versandlabel verfügbar als DIN A4 und Thermodruck". `null`, wenn nichts Bekanntes vorliegt.
 */
export function labelDeliveryInfo(tariff) {
  const roh = tariff && typeof tariff === "object" ? tariff.labelSizes : null;
  if (!Array.isArray(roh)) return null;
  const namen = [];
  for (const wert of roh) {
    const name = typeof wert === "string" ? LIEFERGROESSEN[wert.trim().toUpperCase()] : undefined;
    if (name && !namen.includes(name)) namen.push(name);
  }
  if (namen.length === 0) return null;
  const liste = namen.length === 1
    ? namen[0]
    : `${namen.slice(0, -1).join(", ")} und ${namen[namen.length - 1]}`;
  return `Versandlabel verfügbar als ${liste}`;
}
