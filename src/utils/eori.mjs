// ─────────────────────────────────────────────────────────────────────────────
// EORI-Nummer des eigenen Unternehmens — reine Anzeige- und Vorprüflogik.
//
// Was das ist: eine FORMATprüfung, damit der Kunde einen Tippfehler sofort sieht
// statt nach einer Rundreise. Es ist ausdrücklich KEINE Gültigkeitsprüfung — es
// gibt keine Abfrage gegen das EU-EOS-Register, keine Prüfziffer, keine
// Länderdatenbank. Deshalb heißt der Fehlertext „Format der EORI-Nummer ist
// ungültig" und nicht „EORI ist ungültig": das Zweite wäre eine Behauptung über
// eine Prüfung, die nirgends stattfindet.
//
// Autoritativ ist allein das Backend (`lib/eori.js`, PATCH /kunde/profil). Diese
// Datei bildet dieselbe Regel ab, damit Oberfläche und Server nicht auseinander
// laufen — sie ersetzt die serverseitige Prüfung nicht und darf es nicht.
//
// Kein hartes DE-Präfix: eine EORI beginnt mit dem Ländercode des VERGEBENDEN
// Staates, und ConfidaraExpress lässt Konten mit beliebigem Land zu. Eine
// österreichische oder niederländische Nummer muss speicherbar sein.
// ─────────────────────────────────────────────────────────────────────────────

// Spaltenbreite `users.eori_number` (VARCHAR(20)). Die Prüfung ist enger als die
// Spalte — nie umgekehrt: ein Validator, der mehr zulässt als die Spalte trägt,
// erzeugt einen 500er statt einer Feldmeldung.
export const EORI_MAX_LENGTH = 20;

// Zwei Buchstaben Länderpräfix + 1–15 alphanumerische Zeichen.
const EORI_PATTERN = /^[A-Z]{2}[A-Z0-9]{1,15}$/;

export const EORI_FORMAT_ERROR = "Format der EORI-Nummer ist ungültig.";

// Sichtbarer Hilfetext des Profilfelds. Sachlich, ohne Versprechen: er sagt, WOFÜR
// die Nummer gebraucht wird, und behauptet nicht, die Eingabe sei damit geprüft.
export const EORI_HINT = "Für zollpflichtige Sendungen erforderlich.";

/**
 * Kanonische Speicherform: getrimmt, Großbuchstaben, ohne Leerzeichen und
 * Bindestriche.
 *
 * Zollbescheide und Briefköpfe gruppieren die Nummer häufig („DE 1234 5678"), der
 * Provider erwartet aber die zusammenhängende Form. Die Bereinigung ist deshalb
 * kein Übergriff, sondern dieselbe Normalisierung, die das Backend ohnehin
 * vornimmt — der Kunde sieht damit im Feld genau das, was gespeichert wird.
 */
export function normalizeEori(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/[\s-]/g, "").trim().toUpperCase();
}

/**
 * Formatfehler oder leerer String.
 *
 * Ein LEERER Wert ist gültig: die EORI ist ein optionales Stammdatum, und das
 * Profil muss sie löschen können. Ob eine konkrete Sendung sie braucht,
 * entscheidet allein das serverseitige Buchungs-Gate — nie dieses Feld.
 */
export function eoriFieldError(raw) {
  const wert = normalizeEori(raw);
  if (wert === "") return "";
  if (wert.length > EORI_MAX_LENGTH) return EORI_FORMAT_ERROR;
  if (!EORI_PATTERN.test(wert)) return EORI_FORMAT_ERROR;
  return "";
}

/** Trägt dieses Konto eine benutzbare EORI? Für die Zollanzeige der Buchung. */
export function hasUsableEori(raw) {
  const wert = normalizeEori(raw);
  return wert !== "" && eoriFieldError(wert) === "";
}
