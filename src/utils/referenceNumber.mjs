// TG22 Paket B / Referenzauftrag 2026-11-05 — die optionale Referenznummer einer Buchung.
//
// Die Referenz steht in Auftragsbestätigung, Rechnung und Versand-E-Mails — und, wo der Bestellweg ein
// Referenzfeld hat, beim Versanddienstleister. Ob sie auf dem Versandlabel erscheint, sagt das Angebot
// (`referenceOnLabel`, serverseitig bestimmt); dieses Modul leitet daraus nur den Satz am Feld ab.
//
// ─── Was bei der Eingabe geschieht ─────────────────────────────────────────────────────────────
// Entfernt werden NUR unsichtbare Steuerzeichen: Zeilenumbrüche (C0, U+2028/U+2029) zerreißen Beleg-
// und Labelzeilen, C1-Zeichen sind in keinem Zielsystem druckbar, und Richtungssteuerzeichen (Bidi)
// können die ANGEZEIGTE Reihenfolge einer Nummer verändern, ohne dass man es sieht.
//
// Referenzauftrag (B5): Sichtbares bleibt, wie es eingegeben wurde. Bis dahin kappte die Eingabe still
// auf 35 Zeichen und entfernte `<` `>` — eine eingefügte 40-stellige Bestellnummer wurde ohne Hinweis
// zu einer anderen Referenz. Jetzt zeigt das Feld Länge und unzulässige Zeichen an
// (`referenceInputProblem`), und gebucht wird erst, wenn die Referenz passt. Das Backend prüft
// unabhängig davon selbst und bleibt maßgeblich (400 INVALID_REFERENCE_NUMBER).

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
const UNSICHTBAR = new RegExp(
  "[" + REFERENCE_CONTROL_RANGES.map(([von, bis]) => `${zeichen(von)}-${zeichen(bis)}`).join("") + "]",
  "g",
);
// Dieselbe Regel wie die Buchungsschranke des Backends: `<` und `>` werden abgelehnt, nicht entfernt.
const SPITZE_KLAMMERN = /[<>]/;

/** Entfernt unsichtbare Steuerzeichen — und nur sie. Kein Kürzen, kein Entfernen sichtbarer Zeichen. */
export function sanitizeReferenceInput(value) {
  const text = typeof value === "string" ? value : "";
  return text.replace(UNSICHTBAR, "");
}

/** Die Länge, die das Backend prüft: getrimmt, in UTF-16-Einheiten (wie `String.length` dort). */
export function referenceLength(value) {
  return (typeof value === "string" ? value : "").trim().length;
}

/**
 * Passt die Referenz an die Buchungsschranke? `null` heißt ja (auch leer — die Referenz ist optional).
 * Sonst `{ code, message }` für die Feldmeldung; dieselben Gründe, die das Backend ablehnt.
 */
export function referenceInputProblem(value) {
  const text = (typeof value === "string" ? value : "").trim();
  if (text === "") return null;
  if (SPITZE_KLAMMERN.test(text)) {
    return { code: "forbidden_chars", message: "Die Zeichen < und > sind in der Referenz nicht zulässig." };
  }
  if (text.length > REFERENCE_MAX_LENGTH) {
    return {
      code: "too_long",
      message: `Die Referenz hat ${text.length} Zeichen – erlaubt sind höchstens ${REFERENCE_MAX_LENGTH}. Bitte kürzen Sie sie vor der Buchung.`,
    };
  }
  return null;
}

// ─── Die Aussage am Feld: was mit der Referenz beim Versanddienstleister geschieht ───────────────
// Quelle ist allein das Angebot (`referenceOnLabel`, `referenceLabelVerifiedLength`); kein Anbietername,
// keine Ableitung aus Carrier oder Tarifname. Ein Angebot ohne Aussage (älterer Stand) zeigt keinen Satz.
export const REFERENCE_LABEL_TEXT = Object.freeze({
  printed: "Ihre Referenz wird auf dem Versandlabel angegeben.",
  transmitted: "Ihre Referenz wird an den Versanddienstleister übermittelt. Ob sie auf dem Versandlabel erscheint, ist für diesen Tarif nicht bestätigt. In Ihren ConfidaraExpress-Dokumenten steht sie in jedem Fall.",
  not_supported: "Bei diesem Tarif erscheint Ihre Referenz nicht auf dem Versandlabel. Sie bleibt in Ihren ConfidaraExpress-Dokumenten erhalten.",
});
// Belegt ist der Druck bei `printed` für Buchstaben, Ziffern, Bindestrich, Leerzeichen und Schrägstrich bis zur
// belegten Länge. Alles darüber hinaus ist nicht gemessen — gesagt wird genau das, ohne Garantie und ohne Sperre.
const BELEGTE_ZEICHEN = /^[A-Za-z0-9 /-]*$/;

/**
 * Der Satz am Referenzfeld für das gewählte Angebot — oder `null` (keine Aussage).
 * @returns {{ status: string, text: string, caveat: string|null }|null}
 */
export function referenceLabelHint({ referenceOnLabel, referenceLabelVerifiedLength, value } = {}) {
  const text = REFERENCE_LABEL_TEXT[referenceOnLabel];
  if (!text) return null;
  if (referenceOnLabel !== "printed") return { status: referenceOnLabel, text, caveat: null };
  const belegt = Number.isInteger(referenceLabelVerifiedLength) && referenceLabelVerifiedLength > 0
    ? referenceLabelVerifiedLength : null;
  const wert = (typeof value === "string" ? value : "").trim();
  const ueberLaenge = belegt !== null && wert.length > belegt;
  const sonderzeichen = wert !== "" && !BELEGTE_ZEICHEN.test(wert);
  if (!ueberLaenge && !sonderzeichen) return { status: referenceOnLabel, text, caveat: null };
  const grenze = belegt !== null ? `bis ${belegt} Zeichen` : "für kurze Referenzen";
  return {
    status: referenceOnLabel,
    text,
    caveat: `Vollständig belegt ist der Druck ${grenze} ohne Sonderzeichen. Längere Referenzen oder Zeichen wie Umlaute kann der Versanddienstleister gekürzt oder abweichend drucken.`,
  };
}
