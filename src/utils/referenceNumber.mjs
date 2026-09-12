// TG22 Paket B — Eingabebereinigung der optionalen Referenznummer.
//
// Die Referenznummer landet beim Anbieter auf dem Label und in Belegen. Unsichtbare
// Steuerzeichen haben dort nichts verloren: Zeilenumbrüche (C0, U+2028/U+2029) zerreißen
// Beleg- und Labelzeilen, C1-Zeichen sind in keinem Zielsystem druckbar, und
// Richtungssteuerzeichen (Bidi) können die ANGEZEIGTE Reihenfolge einer Nummer verändern,
// ohne dass man es sieht. Sie werden deshalb bereits bei der Eingabe entfernt — und beim
// Wiederherstellen eines Entwurfs, der aus einer älteren Fassung stammen kann.
//
// Das Backend prüft unabhängig davon selbst (400 INVALID_REFERENCE_NUMBER); dieser Helfer
// verhindert nur, dass eine offensichtlich unbrauchbare Eingabe überhaupt entsteht.

export const REFERENCE_MAX_LENGTH = 35;

// Codepunktbereiche, die entfernt werden:
//   C0 inkl. Tab/Zeilenumbruch (U+0000–U+001F), DEL und C1 (U+007F–U+009F),
//   LRM/RLM (U+200E–U+200F), Zeilen-/Absatztrenner (U+2028–U+2029),
//   LRE…RLO (U+202A–U+202E), LRI…PDI (U+2066–U+2069), ALM (U+061C).
// Die Klasse wird aus Zahlen gebaut: ein unsichtbares Zeichen im Quelltext wäre genau die
// Sorte Fehler, die dieser Helfer verhindern soll.
export const REFERENCE_CONTROL_RANGES = Object.freeze([
  [0x0000, 0x001f], [0x007f, 0x009f], [0x200e, 0x200f], [0x2028, 0x2029],
  [0x202a, 0x202e], [0x2066, 0x2069], [0x061c, 0x061c],
]);

const zeichen = (n) => String.fromCharCode(n);
const UNZULAESSIG = new RegExp(
  "[" + REFERENCE_CONTROL_RANGES.map(([von, bis]) => `${zeichen(von)}-${zeichen(bis)}`).join("") + "<>]",
  "g",
);

/** Bereinigt eine Referenzeingabe (Steuerzeichen, spitze Klammern) und kappt sie auf 35 Zeichen. */
export function sanitizeReferenceInput(value) {
  const text = typeof value === "string" ? value : "";
  return text.replace(UNZULAESSIG, "").slice(0, REFERENCE_MAX_LENGTH);
}
