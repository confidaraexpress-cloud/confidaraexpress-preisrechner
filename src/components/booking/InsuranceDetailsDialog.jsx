import React from "react";
import { useDialog } from "../../hooks/useDialog";
import { Icon } from "../ui/Icon";
import {
  INSURANCE_DIALOG,
  INSURANCE_TEXT,
  JUMINGO_INSURANCE_TERMS_URL,
} from "../../utils/insuranceTerms.mjs";
import { EXTERNAL_LINK_REL, EXTERNAL_LINK_TARGET } from "../../utils/externalLink.mjs";

// Versicherungsdetails — CE-eigene Zusammenfassung VOR dem externen Volltext.
// Vorher war „Versicherungsbedingungen" ein <span>, das wie ein Link aussah und
// nichts tat; ein Klick führte ins Leere. Jetzt öffnet der Eintrag zuerst diese
// Zusammenfassung, und der Weg zu den vollständigen Bedingungen ist eine
// bewusste zweite Handlung — kein sofortiger Absprung aus der Buchung.
//
// Fokusfalle, Escape und Fokusrückgabe kommen aus dem gemeinsamen Hook. Das
// Rückgabeziel wird EXPLIZIT übergeben: ausgelöst wird aus einer Karte heraus,
// und wer den Auslöser kennt, muss ihn nicht aus dem activeElement raten.
export function InsuranceDetailsDialog({ open, onClose, returnFocusTo }) {
  const dialogRef = useDialog({ open, onClose, returnFocusTo });

  if (!open) return null;

  return (
    <div
      className="ce-dialog-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={dialogRef}
        className="ce-dialog ce-dialog--md insdlg"
        role="dialog"
        aria-modal="true"
        aria-labelledby="insdlg-title"
        aria-describedby="insdlg-intro"
      >
        <div className="ce-dialog-head">
          <span className="ce-dialog-icon insdlg-icon" aria-hidden="true">
            <Icon n="shieldCheck" s={20} c="currentColor" />
          </span>
          <h2 id="insdlg-title" className="ce-dialog-title">{INSURANCE_DIALOG.title}</h2>
          <button
            type="button"
            className="insdlg-close"
            onClick={onClose}
            aria-label="Versicherungsdetails schließen"
          >
            <Icon n="x" s={18} c="currentColor" />
          </button>
        </div>

        <div className="ce-dialog-body">
          <p id="insdlg-intro" className="ce-dialog-desc">{INSURANCE_DIALOG.intro}</p>

          {INSURANCE_DIALOG.sections.map(section => (
            <section key={section.id} className={`insdlg-sec insdlg-sec--${section.id}`}>
              <h3 className="insdlg-sec-title">{section.title}</h3>
              <ul className="insdlg-list">
                {section.items.map((item, i) => (
                  <li key={i} className="insdlg-item">
                    <span className="insdlg-item-ico" aria-hidden="true">
                      <Icon n="check" s={14} c="currentColor" />
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <p className="insdlg-notice">
            <Icon n="info" s={14} c="currentColor" />
            <span>{INSURANCE_DIALOG.notice}</span>
          </p>

          {/* Der Volltext bleibt an seiner autoritativen Quelle — er wird nicht
              ins Frontend kopiert, wo er still veralten würde. */}
          <a
            className="insdlg-terms-link"
            href={JUMINGO_INSURANCE_TERMS_URL}
            target={EXTERNAL_LINK_TARGET}
            rel={EXTERNAL_LINK_REL}
          >
            <span>{INSURANCE_TEXT.fullTerms}</span>
            <Icon n="external" s={14} c="currentColor" />
          </a>
        </div>

        <div className="ce-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}
