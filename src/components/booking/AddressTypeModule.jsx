import {
  benoetigteAdressfragen, ADRESSFRAGE_TEXT, istBeantwortet,
} from "../../utils/addressTypeQuestions.mjs";

/* Angaben zur Art der Adresse — preisrelevant, deshalb Pflicht.

   ─── WARUM RADIOS UND KEIN SCHALTER ──────────────────────────────────────────
   Das Designsystem hat einen Schalter (`<Switch>`), und er wäre hier falsch. Ein
   Schalter kennt zwei Zustände: an und aus. Diese Angabe hat DREI — ja, nein und
   „noch nicht beantwortet". Ein Schalter stünde beim Öffnen der Seite auf „aus"
   und behauptete damit eine Antwort, die der Kunde nie gegeben hat. Genau daraus
   entsteht ein Preis für eine Adressart, die niemand erklärt hat.

   Zwei Radios ohne Vorauswahl sagen die Wahrheit: hier fehlt noch etwas.

   ─── KEIN PROVIDERNAME ───────────────────────────────────────────────────────
   Für den Kunden ist das eine Frage zu seiner Adresse. Über wen ConfidaraExpress
   einkauft, steht hier nicht — nicht im Text, nicht im Feldnamen, nicht in einer
   Klasse. Alle Texte kommen aus `addressTypeQuestions.mjs`. */
export function AddressTypeModule({ fulfillmentMode, werte, onChange, showErrors = false }) {
  const fragen = benoetigteAdressfragen(fulfillmentMode);

  return (
    <div className="calc-panel">
      <div className="calc-section-head">
        <h3 className="calc-section-title">Angaben zur Adresse</h3>
      </div>
      <p className="field-hint" id="adr-typ-help">
        Diese Angaben beeinflussen den Preis. Bitte beantworten Sie beide Fragen wahrheitsgemäß —
        weicht die Angabe von der Realität ab, kann der Versanddienstleister nachträglich einen
        Zuschlag berechnen.
      </p>

      {fragen.map((feld) => {
        const text = ADRESSFRAGE_TEXT[feld];
        const wert = werte ? werte[feld] : null;
        const offen = showErrors && !istBeantwortet(wert);
        return (
          <fieldset key={feld} className="dn-mode-fieldset adr-typ-group" aria-describedby="adr-typ-help">
            <legend className="field-label">{text.label}</legend>
            <p className="field-hint">{text.hint}</p>

            {/* `value` und `checked` vergleichen strikt gegen true/false. Ein
                `null` markiert deshalb KEINE der beiden Optionen — die Frage sieht
                unbeantwortet aus, weil sie es ist. */}
            <label className="ci-mode-option" htmlFor={`${feld}-ja`}>
              <input
                type="radio" id={`${feld}-ja`} name={feld} className="ci-mode-radio"
                checked={wert === true}
                onChange={() => onChange(feld, true)}
              />
              <span className="ci-mode-option-text">
                <span className="ci-mode-option-title">Ja, Privatadresse</span>
              </span>
            </label>

            <label className="ci-mode-option" htmlFor={`${feld}-nein`}>
              <input
                type="radio" id={`${feld}-nein`} name={feld} className="ci-mode-radio"
                checked={wert === false}
                onChange={() => onChange(feld, false)}
              />
              <span className="ci-mode-option-text">
                <span className="ci-mode-option-title">Nein, Geschäftsadresse</span>
              </span>
            </label>

            {offen && (
              <p className="field-error" role="alert">Bitte wählen Sie eine der beiden Angaben.</p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
