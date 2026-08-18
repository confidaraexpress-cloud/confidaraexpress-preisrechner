import React from "react";
import { Icon } from "../ui/Icon";
import { Switch } from "../ui/Switch";

// Zusätzliche Optionen — REINE DARSTELLUNG. Bündelt die optionale Referenznummer
// (Wert/Sanitizing bleiben im Orchestrator: BookingPage.form.reference +
// updReference), zwei optionale Zusatzempfänger für Versandinformationen und die
// Wahl des Labeldruckformats (A4/A6). Keine eigene Businesslogik: labelFormat ist
// reiner /book-Payload-Wert ohne Preis-/Reprice-Einfluss; Default A4 wird im
// Orchestrator gesetzt und hier sichtbar vorausgewählt.
//
// Progressive Disclosure: Jede Option zeigt im Grundzustand nur eine Schalterzeile;
// die Detailfelder erscheinen erst nach dem Einschalten. Auch die Schalterzustände
// und die Validierung liegen im Orchestrator — dieses Modul bleibt zustandslos.
// Die Zusatzzeile nennt jetzt nur noch das ENTSCHEIDUNGSKRITERIUM — welchen
// Drucker man hat. „auf normalem Papier" und „Kompaktes Etikettenformat" waren
// Umschreibungen derselben Tatsache und sprengten die kompakte Auswahl auf drei
// Zeilen. Es geht keine Information verloren, die zur Wahl nötig ist: DIN A4 =
// normaler Drucker, DIN A6 = Labeldrucker. Die Werte selbst sind unverändert.
const LABEL_FORMATS = [
  { id: "A4", name: "DIN A4", desc: "Standarddruck" },
  { id: "A6", name: "DIN A6", desc: "Labeldrucker" },
];

const formatName = (id) => (LABEL_FORMATS.find(f => f.id === id) || LABEL_FORMATS[0]).name;

// Eine Zusatzadresse: Schalterzeile + (eingeschaltet) ein E-Mail-Feld. Beide
// Optionen sehen identisch aus und unterscheiden sich nur im Text und im Umfang
// dessen, was der Empfänger später bekommt.
function EmailOption({ id, label, enabled, onEnabledChange, value, onChange, error }) {
  const fieldId = `${id}-input`;
  const errorId = `${id}-error`;
  return (
    <div className="addopt-option">
      <Switch id={id} checked={enabled} onChange={onEnabledChange} label={label} />
      {enabled && (
        <div className="addopt-reveal">
          <div className="field">
            <label className="field-label" htmlFor={fieldId}>E-Mail-Adresse</label>
            <input
              id={fieldId}
              type="email"
              className={`field-input${error ? " field-input-error" : ""}`}
              value={value}
              onChange={e => onChange(e.target.value)}
              placeholder="name@unternehmen.de"
              maxLength={255}
              aria-invalid={error ? "true" : undefined}
              aria-describedby={error ? errorId : undefined}
            />
            {error && <span className="field-error" id={errorId}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function AdditionalOptionsModule({
  reference, onReferenceChange, referenceEnabled, onReferenceEnabledChange,
  labelFormat, onLabelFormatChange, labelFormatEnabled, onLabelFormatEnabledChange,
  trackingEmail, onTrackingEmailChange, trackingEmailEnabled, onTrackingEmailEnabledChange,
  trackingEmailError,
  labelTrackingEmail, onLabelTrackingEmailChange, labelTrackingEmailEnabled,
  onLabelTrackingEmailEnabledChange, labelTrackingEmailError,
  // Eigene Lieferscheinnummer. Bewusst OHNE Schalter: das Feld erscheint nur, wenn es
  // fachlich überhaupt anwendbar ist (Kontomodus „Eigenes Lieferscheinsystem" UND eine
  // Sendung mit Lagerbezug) — ein Schalter davor wäre eine zweite Entscheidung über
  // dieselbe Sache. `deliveryNoteText` kommt vom Aufrufer, damit dieses Modul keine
  // eigene Textquelle bekommt.
  showExternalDeliveryNote, externalDeliveryNoteNumber, onExternalDeliveryNoteNumberChange,
  deliveryNoteText,
}) {
  return (
    <div className="calc-panel addopt-panel mb-16">
      <div className="calc-panel-header"><Icon n="settings" s={18} c="var(--ce-color-brand-ink)" /><h3>Zusätzliche Optionen</h3></div>
      <div className="calc-panel-body">
        {/* 1) Optionale Referenznummer — Funktion unverändert (max. 35, < > entfernt). */}
        <div className="addopt-option">
          <Switch
            id="booking-reference-toggle"
            checked={referenceEnabled}
            onChange={onReferenceEnabledChange}
            label="Eigene Referenznummer hinzufügen"
          />
          {referenceEnabled && (
            <div className="addopt-reveal">
              <div className="field">
                <label className="field-label" htmlFor="booking-reference">Referenznummer / Bestellnummer</label>
                <input
                  id="booking-reference"
                  className="field-input"
                  value={reference}
                  onChange={e => onReferenceChange(e.target.value)}
                  placeholder="z. B. Bestellnummer, Kostenstelle …"
                  maxLength={35}
                />
                <span className="field-hint">
                  Optional – z. B. Bestellnummer, Kostenstelle oder interne Referenz. Max. 35 Zeichen.
                </span>
              </div>
            </div>
          )}
        </div>

        {/* 2) Zusatzempfänger: nur Trackinginformationen, KEIN Label. */}
        <EmailOption
          id="booking-tracking-email-toggle"
          label="Tracking-Link an weitere E-Mail-Adresse senden"
          enabled={trackingEmailEnabled}
          onEnabledChange={onTrackingEmailEnabledChange}
          value={trackingEmail}
          onChange={onTrackingEmailChange}
          error={trackingEmailError}
        />

        {/* 3) Zusatzempfänger: Trackinginformationen UND Versandlabel als PDF. */}
        <EmailOption
          id="booking-label-email-toggle"
          label="Versandlabel & Tracking-Link an weitere E-Mail-Adresse senden"
          enabled={labelTrackingEmailEnabled}
          onEnabledChange={onLabelTrackingEmailEnabledChange}
          value={labelTrackingEmail}
          onChange={onLabelTrackingEmailChange}
          error={labelTrackingEmailError}
        />

        {/* 4) Labeldruckformat — nur A4/A6, Default A4. Der Schalter heißt „ändern":
            ausgeschaltet gilt weiterhin das Standardformat, es fehlt nicht. */}
        <div className="addopt-option">
          <Switch
            id="booking-labelformat-toggle"
            checked={labelFormatEnabled}
            onChange={onLabelFormatEnabledChange}
            label="Versandlabel-Format ändern"
            hint={`Aktuell: ${formatName(labelFormat)}`}
          />
          {labelFormatEnabled && (
            <div className="addopt-reveal">
              <div className="labelfmt-group" role="radiogroup" aria-label="Labelformat wählen">
                {LABEL_FORMATS.map(f => {
                  const selected = labelFormat === f.id;
                  return (
                    <label key={f.id} className={`labelfmt-card${selected ? " labelfmt-card--selected" : ""}`}>
                      <input
                        type="radio"
                        name="labelFormat"
                        value={f.id}
                        checked={selected}
                        onChange={() => onLabelFormatChange(f.id)}
                      />
                      <span className="labelfmt-radio" aria-hidden="true" />
                      <span className="labelfmt-main">
                        <span className="labelfmt-name">{f.name}</span>
                        <span className="labelfmt-desc">{f.desc}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              <span className="field-hint">Bestimmt das Druckformat Ihres Versandlabels.</span>
            </div>
          )}
        </div>

        {/* 5) Eigene Lieferscheinnummer — nur bei Kontomodus „Eigenes Lieferschein-
            system" und einer Sendung mit Lagerbezug. Optional: ein Unternehmen kann
            seinen Lieferschein weiterhin vollständig außerhalb von Confidara führen. */}
        {showExternalDeliveryNote && deliveryNoteText && (
          <div className="addopt-option">
            <div className="field">
              <label className="field-label" htmlFor="booking-external-delivery-note">
                {deliveryNoteText.externalFieldLabel}
              </label>
              <input
                id="booking-external-delivery-note"
                className="field-input"
                value={externalDeliveryNoteNumber}
                onChange={e => onExternalDeliveryNoteNumberChange(e.target.value)}
                placeholder={deliveryNoteText.externalFieldPlaceholder}
                maxLength={deliveryNoteText.externalFieldMaxLen}
              />
              <span className="field-hint">{deliveryNoteText.externalFieldHint}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
