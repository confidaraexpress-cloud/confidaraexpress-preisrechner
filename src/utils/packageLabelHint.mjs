// Der Klebehinweis bei unterschiedlichen Paketen (Canonical v2.79, §15) — rein, ohne React.
//
// Der Server nennt nur das Etikettenprofil der Buchung (`packageLabelHint`: „weight_and_dimensions“ |
// „weight“) — in der Erfolgsantwort der Buchung und in der Dokumentliste der Sendung. Die Sätze stehen
// wortgleich wie im Backend (lib/packageLabelHint.js) und in der Labelmail. Ohne Hinweis entsteht kein
// Satz, und es gibt nie eine Aussage über die Reihenfolge der Etiketten.
export const PACKAGE_LABEL_HINT_TEXT = Object.freeze({
  weight_and_dimensions: "Jedes Versandlabel nennt Gewicht und Maße seines Pakets sowie „1 OF 2“. "
    + "Bitte jedes Label auf das Paket mit diesen Angaben kleben.",
  weight: "Jedes Versandlabel nennt das Gewicht seines Pakets (z. B. „2.0/10.0 kg“) sowie „Piece 1/2“. "
    + "Bitte jedes Label auf das Paket mit diesem Gewicht kleben. Die Seite „WAYBILL DOC“ erhält der Fahrer.",
});

/** Der Kundentext zum Etikettenprofil — oder null (kein Hinweis, unbekannter Wert). */
export function packageLabelHintText(hint) {
  return typeof hint === "string" && Object.prototype.hasOwnProperty.call(PACKAGE_LABEL_HINT_TEXT, hint)
    ? PACKAGE_LABEL_HINT_TEXT[hint] : null;
}
