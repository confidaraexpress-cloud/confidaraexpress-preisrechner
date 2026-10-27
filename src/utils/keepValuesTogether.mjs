// Werte zusammenhalten (Premium-Redesign Etappe 1, Umbruchregeln B9).
//
// Uhrzeiten mit „Uhr“, Maße mit Einheit, Gewichte, Prozente, Laufzeiten, Datumsangaben, Postleitzahlen mit
// Länderkennung und Vorgangsnummern brechen nie mitten im Wert um („bereit ab 09:00 | Uhr“,
// „30 × 20 × | 10 cm“, „CE-AB26-|00041“). Kein pauschales nowrap: nur die Werte selbst werden markiert, der
// Satz bricht weiter frei. Ein Datumsbereich bricht nur nach dem Halbgeviertstrich.
//
// valueSegments zerlegt einen Text in Abschnitte; zusammengesetzt ergeben sie Zeichen für Zeichen den
// Ausgangstext (Prüfungen auf Text und barrierefreie Namen bleiben gültig). Die Darstellung übernimmt
// components/ui/Werte.jsx mit der Klasse .ce-wert. Bewusst ohne Lookbehind: der öffentliche Preisrechner
// läuft auch in älteren Browsern.
const MUSTER = [
  // Vorgangs- und Belegnummern: CE-AB26-00041, WE-2026-0412
  /\b[A-Z]{2,4}(?:-[A-Z0-9]{2,8}){1,3}\b/,
  // Postleitzahl mit Länderkennung: DE 70173
  /\b[A-Z]{2} \d{4,5}\b/,
  // Kalendermonat oder -tag in ISO-Form: 2026-08, 2026-10-27
  /\b\d{4}-\d{2}(?:-\d{2})?\b/,
  // Maße: 30 × 20 × 10 cm, 30,5 × 20 cm
  /\d+(?:[.,]\d+)?(?: ?× ?\d+(?:[.,]\d+)?){1,2} ?(?:cm|mm|m)\b/,
  // Uhrzeit mit Einheit, auch als Spanne: 09:00 Uhr, 09:00–17:00 Uhr, 9 Uhr
  /\d{1,2}(?::\d{2})?(?: ?[–-] ?\d{1,2}(?::\d{2})?)? ?Uhr\b/,
  // Datum, optional mit Wochentag; in einer Spanne gehört der Strich zum ersten Datum: Di., 27.10. –
  /(?:(?:Mo|Di|Mi|Do|Fr|Sa|So)\.,? )?\d{1,2}\.\d{1,2}\.(?:\d{4})?(?: –)?/,
  // Laufzeit: 1–2 Tage, 1 Werktag
  /\d+(?: ?[–-] ?\d+)? (?:Werktage?|Tage?)\b/,
  // Gewicht und Prozent: 5,5 kg, 19 %
  /\d+(?:[.,]\d+)? ?(?:kg|%)/,
  // Zusammengesetztes Wort mit Bindestrich am Wortanfang, auch weiter verbunden: E-Mail, E-Mail-Adresse
  /\bE-Mail(?:-[A-Za-zÄÖÜäöüß]+)?/,
];
const WERT = new RegExp(MUSTER.map((m) => `(?:${m.source})`).join("|"), "g");

export function valueSegments(text) {
  if (typeof text !== "string" || text === "") return [];
  const teile = [];
  let pos = 0;
  for (const m of text.matchAll(WERT)) {
    if (m[0] === "") continue;
    if (m.index > pos) teile.push({ text: text.slice(pos, m.index), wert: false });
    teile.push({ text: m[0], wert: true });
    pos = m.index + m[0].length;
  }
  if (pos < text.length) teile.push({ text: text.slice(pos), wert: false });
  return teile;
}
