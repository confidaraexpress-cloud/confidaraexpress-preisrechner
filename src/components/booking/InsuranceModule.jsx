import React, { useRef, useState } from "react";
import { money } from "../../utils/formatters";
import { InsuranceDetailsDialog } from "./InsuranceDetailsDialog";
import { AuswahlMenue } from "../ui/AuswahlMenue";
import {
  INSURANCE_CARD_COPY,
  INSURANCE_TEXT,
  COVER_INSURANCE_TEXT,
  carrierTermsHref,
  coverInsuranceCardCopy,
  tierInsuredValueHint,
} from "../../utils/insuranceTerms.mjs";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../../utils/externalLink.mjs";

// Transportversicherung — REINE DARSTELLUNG. Auswahl, Reprice, Validierung,
// Preis-View-Model und /book-Übergabe bleiben im Orchestrator (BookingPage) und
// kommen über Props herein.
//
// Progressive Disclosure: bei „Keine zusätzliche Transportversicherung" werden
// keine Wertfelder gezeigt. Bei Standard/Premium ist der Warenwert das primäre Feld; der
// Versicherungswert wird automatisch aus dem Warenwert vorbelegt und nur bei
// Bedarf über „Versicherungswert anpassen" eingeblendet. Das frühere
// Inhaltsbeschreibungs-Feld ist bewusst entfernt (der technische
// contentDescription-Default bleibt im Orchestrator unverändert erhalten).
//
// Auswahl: kompaktes Menü (AuswahlMenue) statt dreier Karten; die gewählte Option ist hell hinterlegt mit blauer
// Kante. Preise stammen aus dem zentralen Price-View-Model (nur „ab"-Preselect ODER exakter
// Aufpreis der ausgewählten, bestätigten Stufe) — keine lokale Prämienberechnung,
// keine zweite Reprice-Anfrage für die nicht gewählte Stufe.
//
// ZWEITES MODELL — zusätzliche Transportabsicherung (`coverModel`): zwei Karten statt
// drei, eigene neutrale Texte (keine Stufen-, Premium- oder 50-€-Aussagen, kein
// Stufendialog), zwei Pflichtfragen zur Ware OHNE Vorbelegung und die Selbstbeteiligung
// aus dem Tarif. TG22 Paket B: der Versicherungswert IST der Warenwert — es gibt dafür kein
// eigenes Eingabefeld mehr; der gesperrte Warenwert sagt, bis wohin abgesichert wird.

// Karteninhalte kommen aus dem zentralen Datenmodul (utils/insuranceTerms.mjs) —
// dieselbe Quelle speist den Detaildialog, damit Karte und Dialog nicht
// auseinanderlaufen können. `info` → dezentes neutrales Icon, sonst dezenter
// grüner Haken.
//
// Der frühere statische Link auf /agb#paragraf-10 ist ERSATZLOS entfallen: dort
// steht die Vertragshaftung von ConfidaraExpress, nicht die Beförderungs-
// bedingung des Versanddienstleisters. Diese kommt jetzt tarifgenau aus
// tariff.carrierLinks.agb — und wenn der Tarif keine liefert, steht dort nur
// der neutrale Hinweistext und KEIN Link.
const CARD_COPY = INSURANCE_CARD_COPY;

// Barrierefreier Name des nativen Radios: Kartenname + Preis in Worten, damit der
// Preis NICHT nur farblich/visuell transportiert wird (Screenreader lesen ihn mit).
// `unknownText` reist an der Karte mit: im Stufenmodell „Preis nach Warenwert", im
// Deckungsbetragsmodell „Preis nach Ihren Angaben".
function cardAriaLabel(c) {
  const p = (c && c.price) || { kind: "zero", value: 0 };
  const priceTxt =
    p.kind === "exact"     ? `Aufpreis ${money(p.value)}` :
    p.kind === "preselect" ? `ab ${money(p.value)}, steuerfrei` :
    p.kind === "unknown"   ? (c.unknownText || "Preis nach Warenwert") :
                             money(0);
  return `${c.name}: ${priceTxt}`;
}

// „50,00 €"-artige Beträge typografisch zusammenhalten (kein Umbruch zwischen Zahl
// und Eurozeichen) — rein darstellend, OHNE die Kartentexte fachlich zu verändern.
const AMOUNT_RE = /(\d[\d.]*,\d{2}\s?€)/;
function withAmountNoWrap(text) {
  return text.split(AMOUNT_RE).map((part, i) =>
    AMOUNT_RE.test(part)
      ? <span key={i} className="ins-nowrap">{part}</span>
      : <React.Fragment key={i}>{part}</React.Fragment>
  );
}

// Preis einer Option als Text: exakter Aufpreis der gewählten, bestätigten Stufe („+ x“), sonst der „ab“-Preis,
// sonst der Hinweis, dass der Preis erst nach den Angaben feststeht. „steuerfrei“ steht bei jedem Betrag.
function cardPrice(price, unknownText) {
  const p = price || { kind: "zero", value: 0 };
  if (p.kind === "unknown") return { text: unknownText, sub: undefined };
  const prefix = p.kind === "exact" ? "+ " : p.kind === "preselect" ? "ab " : "";
  const withSub = p.kind === "exact" || p.kind === "preselect";
  return { text: `${prefix}${money(p.value)}`, sub: withSub ? "steuerfrei" : undefined };
}

// Pflichtfrage zur Ware — zwei Radios OHNE Vorauswahl (dasselbe Muster wie die Angaben
// zur Adresse): `checked` vergleicht strikt gegen true/false, ein `null` markiert keine
// der beiden Optionen. Ein Schalter wäre hier falsch — er stünde auf „aus" und behauptete
// eine Antwort, die niemand gegeben hat.
// Die Spur `ce-segment` hält nur beide Antworten zusammen (Segmentsteuerung im Kundenbereich,
// premium-editorial.css Abschnitt 22) — ohne Antwort ist kein Segment gewählt.
function GoodsQuestion({ feld, frage, wert, onChange, error }) {
  const errorId = `ins-${feld}-error`;
  return (
    <fieldset className="dn-mode-fieldset ins-goods-question" aria-describedby={error ? errorId : undefined}>
      <legend className="field-label">{frage}</legend>
      <div className="ce-segment">
        <label className="ci-mode-option ce-segment-option" htmlFor={`ins-${feld}-ja`}>
          <input
            type="radio" id={`ins-${feld}-ja`} name={`ins-${feld}`} className="ci-mode-radio"
            checked={wert === true}
            onChange={() => onChange(feld, true)}
          />
          <span className="ci-mode-option-text">
            <span className="ci-mode-option-title">{COVER_INSURANCE_TEXT.answerYes}</span>
          </span>
        </label>
        <label className="ci-mode-option ce-segment-option" htmlFor={`ins-${feld}-nein`}>
          <input
            type="radio" id={`ins-${feld}-nein`} name={`ins-${feld}`} className="ci-mode-radio"
            checked={wert === false}
            onChange={() => onChange(feld, false)}
          />
          <span className="ci-mode-option-text">
            <span className="ci-mode-option-title">{COVER_INSURANCE_TEXT.answerNo}</span>
          </span>
        </label>
      </div>
      {error && <p className="field-error" id={errorId} role="alert">{error}</p>}
    </fieldset>
  );
}

// TG22 Paket B — der Tarif trägt KEINEN kaufbaren Zusatz, sagt aber etwas über die Absicherung:
// die enthaltene Grundabsicherung oder die Höchstdeckung. Eine Information in der gewohnten Fläche
// der Absicherung — kein Fehlerzustand, keine Karten, kein Preis, kein Bedienelement.
// Seit E1 (2026-11-10) auch für die gestufte Zusatzversicherung über ihrer Grenze — dann mit deren Titel.
export function InsuranceCoverNotice({ text, title = COVER_INSURANCE_TEXT.sectionTitle }) {
  return (
    <div className="booking-insurance-box" role="note">
      <div className="ins-head">
        <span className="ins-head-title">{title}</span>
      </div>
      <p className="ins-head-sub" id="ins-cover-notice">{text}</p>
    </div>
  );
}

export function InsuranceModule({
  insCards, insuranceType, onSelectType,
  isInsured, tariff,
  goodsValue, onGoodsValueChange, onGoodsValueBlur, goodsValueError, goodsValueLocked = false,
  insuranceValue, onInsuranceValueChange, onInsuranceValueBlur, insValueError,
  insValueFieldVisible, onRevealInsValue, insuranceValueMax = null, underinsuranceHint = "",
  repriceError, repriceNotice = "", isRepricing, isStale, repriceConfirmed,
  coverModel = false, excessValue = null,
  goodsAreNew = null, goodsAreFragile = null, onGoodsAnswerChange, goodsAnswerErrors = {},
}) {
  const pending = isRepricing || isStale;
  // Bedingungslink des GEWÄHLTEN TARIFS — null, wenn der Tarif keinen (gültigen)
  // liefert. Dann erscheint kein Link, nicht etwa ein Ersatzlink.
  const carrierTerms = carrierTermsHref(tariff);
  const unknownText = coverModel ? COVER_INSURANCE_TEXT.pricePending : "Preis nach Warenwert";

  // Reiner UI-Zustand des Detaildialogs (nichts davon wird gespeichert oder
  // gebucht). Das Rückgabeziel merkt sich den auslösenden Knopf, damit der
  // Fokus nach dem Schließen genau dorthin zurückkehrt.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsTrigger = useRef(null);
  const openDetails = (e) => { detailsTrigger.current = e.currentTarget; setDetailsOpen(true); };

  // Optionen des Menüs: dieselben Karteninhalte wie bisher (zentrales Datenmodul), dieselben Preise aus dem
  // Price-View-Model — hier wird nichts gerechnet. Der barrierefreie Name bleibt Name plus Preis in Worten.
  const optionen = insCards.map((karte) => {
    const c = { ...karte, unknownText };
    const copy = coverModel ? coverInsuranceCardCopy(c.id, excessValue) : (CARD_COPY[c.id] || { bullets: [] });
    const preis = cardPrice(c.price, unknownText);
    return {
      value: c.id,
      label: c.name,
      badge: copy.badge,
      description: copy.description,
      hint: copy.bullets[0]?.text,
      aside: preis.text,
      asideSub: preis.sub,
      ariaLabel: cardAriaLabel(c),
      copy,
    };
  });
  const gewaehlt = optionen.find((o) => o.value === insuranceType) || null;
  // Details und Bedingungen stehen UNABHÄNGIG von der Wahl: Lesen darf nie eine Wahl erfordern — jede Wahl löst eine
  // Neubepreisung aus (Server, gegebenenfalls Anbieter). Wie früher auf den Karten, die beide Wege ohne Wahl zeigten.
  const mitDetails = !coverModel && optionen.some((o) => o.copy.hasDetails);
  const mitBedingungen = optionen.some((o) => o.copy.hasCarrierTerms);
  const mitVerweisen = mitDetails || (mitBedingungen && Boolean(carrierTerms));

  return (
    <div className="booking-insurance-box">
      <div className="ins-head">
        <span className="ins-head-title">{coverModel ? COVER_INSURANCE_TEXT.sectionTitle : INSURANCE_TEXT.sectionTitle}</span>
        <span className="ins-badge-taxfree">steuerfrei</span>
      </div>
      <p className="ins-head-sub">{coverModel ? COVER_INSURANCE_TEXT.sectionIntro : INSURANCE_TEXT.sectionIntro}</p>

      {/* Auswahl als kompaktes Menü (Premium Control System 2.0, 2026-11-14): je Option Name, Preis und die zwei
          Aussagen, in denen sie sich unterscheidet. Darunter steht für die GEWÄHLTE Option, was vorher ihre Karte trug —
          Beschreibung, Selbstbeteiligung, Ladezustand —, und für ALLE die Wege zu Details und Bedingungen. Die Wahl
          selbst bleibt beim Orchestrator (onSelectType): Neubepreisung, Sperren und Buchungsschranken sind unverändert. */}
      <span className="field-label ins-auswahl-label" id="ins-auswahl-label">
        {coverModel ? `${COVER_INSURANCE_TEXT.sectionTitle} wählen` : "Transportversicherung wählen"}
      </span>
      <AuswahlMenue
        name="insuranceType"
        id="ins-auswahl"
        labelId="ins-auswahl-label"
        value={insuranceType}
        options={optionen}
        onChange={onSelectType}
        busy={isInsured && pending}
      />

      {(gewaehlt || mitVerweisen) && (
        <div className="ins-auswahl-info" id="ins-auswahl-info">
          {gewaehlt && (gewaehlt.copy.badge || (isInsured && pending)) && (
            <div className="ins-auswahl-info-kopf">
              {gewaehlt.copy.badge && <span className="ins-card-badge">{gewaehlt.copy.badge}</span>}
              {isInsured && pending && (
                <span className="ins-card-calc" aria-live="polite">
                  <span className="spinner spinner-dark" /> Preis wird berechnet …
                </span>
              )}
            </div>
          )}

          {/* Ein Satz: worin sich diese Option unterscheidet. */}
          {gewaehlt?.copy.description && <p className="ins-card-desc">{gewaehlt.copy.description}</p>}

          {gewaehlt && gewaehlt.copy.bullets.length > 0 && (
            <ul className="ins-card-bullets">
              {gewaehlt.copy.bullets.map((b, i) => (
                <li key={i} className={`ins-card-bullet${b.info ? " ins-card-bullet--info" : ""}`}>
                  <span className="ins-bullet-txt">{withAmountNoWrap(b.text)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Je EIN Weg, unabhängig von der Wahl: Standard/Premium → CE-Zusammenfassung im Dialog; Bedingungen DIESES
              Tarifs, sofern er welche liefert — sonst kein Link (der neutrale Satz steht bei „keine Zusatzversicherung“).
              Ein <button>/<a> wählt nichts: die Auswahl und damit der Preis bleiben unberührt. */}
          {mitDetails && (
            <p className="ins-card-cond">
              <button type="button" className="ins-card-details-btn" onClick={openDetails}>
                {INSURANCE_TEXT.detailsAction}
              </button>
            </p>
          )}
          {mitBedingungen && carrierTerms && (
            <p className="ins-card-cond">
              <a
                className="ins-card-terms-link"
                href={carrierTerms}
                target={EXTERNAL_LINK_TARGET}
                rel={EXTERNAL_LINK_REL}
              >
                <span>{INSURANCE_TEXT.carrierTerms}</span>
              </a>
            </p>
          )}
        </div>
      )}

      {/* Der Stufendialog beschreibt Standard/Premium — im Deckungsbetragsmodell gibt es
          keinen Auslöser, also auch keinen Dialog. */}
      {!coverModel && (
        <InsuranceDetailsDialog
          open={detailsOpen}
          onClose={() => setDetailsOpen(false)}
          returnFocusTo={detailsTrigger}
        />
      )}

      {/* Wertfelder NUR bei gewählter Absicherung (Progressive Disclosure). */}
      {isInsured && (
        <div className="ins-inputs">
          <div className="field">
            <label className="field-label" htmlFor="ins-goods">Warenwert der Sendung (EUR)</label>
            {/* Gesperrt, wenn der Warenwert bereits im Sendungsformular erklärt wurde:
                er hat den Vergleichspreis mitbestimmt und ist serverseitig eingefroren.
                Ein zweites editierbares Feld wäre eine zweite Wahrheit über denselben
                Sachverhalt. `readOnly` statt `disabled` — der Wert bleibt lesbar,
                fokussierbar und für Screenreader vorhanden. Im Deckungsbetragsmodell ist
                genau dieser Wert zugleich der Versicherungswert. */}
            <input
              id="ins-goods"
              className={`field-input${goodsValueError ? " field-input-error" : ""}`}
              type="number" inputMode="decimal" min="0" max="9999999" step="0.01"
              value={goodsValue}
              onChange={e => { if (!goodsValueLocked) onGoodsValueChange(e.target.value); }}
              onBlur={onGoodsValueBlur}
              readOnly={goodsValueLocked}
              aria-readonly={goodsValueLocked || undefined}
              placeholder="z. B. 500"
            />
            {goodsValueError
              ? <span className="field-error">{goodsValueError}</span>
              : <span className="field-hint">
                  {goodsValueLocked
                    ? (coverModel ? COVER_INSURANCE_TEXT.goodsValueCoverHint : "Aus Ihren Angaben zur Sendung übernommen.")
                    : "Tatsächlicher Warenwert der Sendung."}
                </span>}
            {coverModel && insValueError && <span className="field-error">{insValueError}</span>}
          </div>

          {/* Der frei wählbare Versicherungswert gehört ausschließlich zum Stufenmodell. Ganze Euro
              von 1 bis zum Warenwert (E2, 2026-11-10) — der Höchstwert kommt vom Server. Über der
              Grenze gibt es keine Stufe und damit dieses Feld gar nicht (E1). */}
          {!coverModel && (insValueFieldVisible ? (
            <div className="field">
              <label className="field-label" htmlFor="ins-value">Versicherungswert (EUR)</label>
              <input
                id="ins-value"
                className={`field-input${insValueError ? " field-input-error" : ""}`}
                type="number" inputMode="numeric" min="1" max={insuranceValueMax ?? undefined} step="1"
                value={insuranceValue}
                onChange={e => onInsuranceValueChange(e.target.value)}
                onBlur={onInsuranceValueBlur}
                placeholder="z. B. 500"
              />
              {insValueError
                ? <span className="field-error">{insValueError}</span>
                : <span className="field-hint">{tierInsuredValueHint(insuranceValueMax)}</span>}
            </div>
          ) : (
            <button type="button" className="ins-adjust-btn" onClick={onRevealInsValue}>
              Versicherungswert anpassen
            </button>
          ))}

          {/* E2: liegt der Versicherungswert unter dem Warenwert, sagt die Fläche das — eine
              Teilversicherung sieht nie wie eine volle aus. */}
          {!coverModel && underinsuranceHint && (
            <p className="ins-overmax" role="note" id="ins-underinsurance">
              <span>{underinsuranceHint}</span>
            </p>
          )}

          {coverModel && (
            <>
              <GoodsQuestion
                feld="goodsAreNew" frage={COVER_INSURANCE_TEXT.goodsNewQuestion}
                wert={goodsAreNew} onChange={onGoodsAnswerChange} error={goodsAnswerErrors.goodsAreNew}
              />
              <GoodsQuestion
                feld="goodsAreFragile" frage={COVER_INSURANCE_TEXT.goodsFragileQuestion}
                wert={goodsAreFragile} onChange={onGoodsAnswerChange} error={goodsAnswerErrors.goodsAreFragile}
              />
            </>
          )}
        </div>
      )}

      {/* Reprice-Status + steuerfrei-Hinweis (nur bei versicherter Auswahl). */}
      {isInsured && (
        <div className="ins-after">
          <div className="ins-status" aria-live="polite">
            {repriceError ? (
              <span className="ins-status-error">{repriceError}</span>
            ) : repriceNotice ? (
              <span className="field-hint" id="ins-reprice-notice">{repriceNotice}</span>
            ) : pending ? (
              <span className="ins-status-loading"><span className="spinner spinner-dark" /> Preis wird aktualisiert…</span>
            ) : repriceConfirmed ? (
              <span className="ins-status-ok">
                {coverModel ? COVER_INSURANCE_TEXT.confirmed : "Versicherungspreis bestätigt"}
              </span>
            ) : null}
          </div>
          <p className="ins-note">
            {coverModel
              ? COVER_INSURANCE_TEXT.note
              : "Die Zusatzversicherung ist steuerfrei und wird ohne 19 % MwSt. separat ausgewiesen."}
          </p>
        </div>
      )}
    </div>
  );
}
