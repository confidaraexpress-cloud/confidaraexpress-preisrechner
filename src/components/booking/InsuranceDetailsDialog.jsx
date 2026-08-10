import React from "react";
import { Link } from "react-router-dom";
import { useDialog } from "../../hooks/useDialog";
import { Icon } from "../ui/Icon";
import { INSURANCE_DIALOG, INSURANCE_TEXT } from "../../utils/insuranceTerms.mjs";
import { INSURANCE_INFO_ROUTE } from "../../utils/insuranceInfo.mjs";

// Versicherungsdetails — die verständliche Zusammenfassung von ConfidaraExpress.
// Vorher war „Versicherungsbedingungen" ein <span>, das wie ein Link aussah und
// nichts tat; ein Klick führte ins Leere. Jetzt öffnet der Eintrag diese
// Zusammenfassung — ohne Absprung aus der Buchung.
//
// Bewusst OHNE Link auf externe Vollbedingungen: der einzige verfügbare Volltext
// gehört dem internen Upstream-Anbieter, der gegenüber dem Kunden nicht
// erscheint. Wer mehr wissen will, geht stattdessen INTERN auf die
// ConfidaraExpress-Informationsseite — die dritte Ebene des
// Informationssystems (Karte → Dialog → Seite).
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

          <div className="insdlg-notice">
            <Icon n="info" s={14} c="currentColor" />
            <div>
              <p className="insdlg-notice-title">{INSURANCE_DIALOG.noticeTitle}</p>
              <ul className="insdlg-notice-list">
                {INSURANCE_DIALOG.notices.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            </div>
          </div>

          {/* Interner Weg in die Tiefe — kein externer Absprung. */}
          <Link className="insdlg-more-link" to={INSURANCE_INFO_ROUTE} onClick={onClose}>
            <span>{INSURANCE_TEXT.moreInfo}</span>
            <Icon n="arrowRight" s={14} c="currentColor" />
          </Link>
        </div>

        <div className="ce-dialog-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Schließen</button>
        </div>
      </div>
    </div>
  );
}
