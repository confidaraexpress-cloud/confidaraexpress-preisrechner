import { ADRESSFRAGE_TEXT, istBeantwortet, ADRESSART_FEST_HINWEIS, ADRESSART_AENDERN }
  from "../../utils/addressTypeQuestions.mjs";

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
   Klasse. Alle Texte kommen aus `addressTypeQuestions.mjs`.

   ─── DIE FLÄCHE: `calc-panel` + `calc-panel-body` ────────────────────────────
   `.calc-panel` ist nur das Material (Rand, Radius, `overflow: hidden`) und trägt
   KEIN Innenmaß — das tragen `.calc-panel-header`/`.calc-panel-body`. Stand der Inhalt
   direkt im Panel, klebte „Angaben zur Adresse" am oberen Rand und wurde am Radius
   abgeschnitten. Beide Zustände (Bedienelemente und feste Darstellung) benutzen
   deshalb dasselbe bestehende Muster wie die übrigen Buchungsflächen: Innenmaß aus
   `.calc-panel-body`, Abstand zur nächsten Fläche aus `.mb-16`. Kein Sonder-CSS. */
/* `gruppeKlasse` benennt die Fieldset-Gruppe. Sie ist ein Parameter, weil dieselbe
   Bedienoberfläche seit Paket 9A an ZWEI Stellen steht: im Sendungsformular (dort werden
   die Fragen erhoben) und weiterhin auf der Buchungsseite (dort werden sie angezeigt
   bzw. nachgefordert). Beide Vorkommen brauchen eine unterscheidbare Kennzeichnung —
   sonst trifft ein Selektor, der die eine Stelle meint, die andere mit. Genau das ist
   beim Umzug beinahe passiert: `.adr-typ-group` war in vier Browserprüfungen der Marker
   der BUCHUNGSSEITE, und das neue Formularfeld hätte ihn vorzeitig erfüllt. */
export function AddressTypeModule({ fragen, werte, onChange, showErrors = false,
                                    gruppeKlasse = "adr-typ-group" }) {
  // Die Liste kommt fertig herein — dieses Bauteil entscheidet NICHT, was gefragt wird.
  // Es kennt weder Provider noch Uebergabeart und soll beides auch nicht kennen.
  return (
    <div className="calc-panel mb-16">
      <div className="calc-panel-body">
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
            <fieldset key={feld} className={`dn-mode-fieldset ${gruppeKlasse}`} aria-describedby="adr-typ-help">
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
    </div>
  );
}

/* Angaben zur Art der Adresse, NACHDEM sie den Preis mitbestimmt haben.

   ─── WARUM HIER KEIN BEDIENELEMENT MEHR STEHT ────────────────────────────────
   Die Angabe ist zu diesem Zeitpunkt keine offene Frage mehr, sondern ein Teil des
   Angebots, das der Kunde ausgewählt hat. Ein Radio daneben würde etwas anderes
   behaupten: dass die Antwort hier noch etwas bewirkt. Sie bewirkt nichts — der
   Preis daneben ist bereits gerechnet, und die Sendung trägt die Angabe fest.

   ─── WARUM KEIN `disabled` RADIO ─────────────────────────────────────────────
   Ein deaktiviertes Radio ist nicht fokussierbar und wird von Vorlesesoftware in
   der Regel übersprungen. Der Wert wäre dann für sehende Nutzer blass und für
   andere gar nicht vorhanden — die Angabe ginge genau dort verloren, wo sie zur
   Kontrolle steht. Deshalb: normaler Text, in derselben Zeilenform, in der die
   Sendungsdetails darüber ihre Werte zeigen.

   ─── DIE ÄNDERUNG FÜHRT ZURÜCK, NICHT WEITER ─────────────────────────────────
   „Ändern" ist ein echter Knopf und damit erreichbar. Er ändert hier NICHTS,
   sondern führt auf den Weg zurück, auf dem die Angabe erhoben wurde. Alles andere
   wäre ein zweiter Preis zu einer Angabe, die der erste nicht kannte. */
export function AddressTypeSummary({ eintraege, onEdit, gruppeKlasse = "adr-typ-summary" }) {
  if (!Array.isArray(eintraege) || eintraege.length === 0) return null;
  return (
    <div className={`calc-panel mb-16 ${gruppeKlasse}`}>
      <div className="calc-panel-body">
        <div className="calc-section-head">
          <h3 className="calc-section-title">Angaben zur Adresse</h3>
        </div>
        <p className="field-hint" id="adr-typ-fest-help">{ADRESSART_FEST_HINWEIS}</p>

        {eintraege.map((e, i) => (
          <div
            key={e.feld}
            className={`summary-detail-row${i < eintraege.length - 1 ? " summary-detail-row-border" : ""}`}
            data-feld={e.feld}
          >
            <span className="text-sm text-muted summary-detail-key">{e.adresse}</span>
            <span className="text-sm font-bold summary-detail-val">{e.wertText}</span>
          </div>
        ))}

        <button
          type="button"
          className="btn btn-link adr-typ-edit"
          onClick={onEdit}
          aria-describedby="adr-typ-fest-help"
        >
          {ADRESSART_AENDERN}
        </button>
      </div>
    </div>
  );
}
