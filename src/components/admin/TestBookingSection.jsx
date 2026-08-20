import React from "react";
import { Icon } from "../ui/Icon";
import { Switch } from "../ui/Switch";
import { TEST_BOOKING_TEXTS as T } from "../../utils/adminTestBooking.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Sektion „Testbuchungen" in der Admin-Kundendetailansicht.
//
// Zeigt, ob das Konto den offiziellen JUMiNGO-Testgutschein verwenden darf, und
// erlaubt das Freischalten bzw. Entziehen. Rein darstellend: der Request liegt
// in der Seite (ein Request-Pfad, ein Zustand) — dieselbe Aufteilung wie bei
// `CustomerMarkupSection`.
//
// Die Karte entscheidet nichts. Die Berechtigung wird ausschließlich
// serverseitig geprüft und bei JEDEM Request frisch aus der Datenbank geladen;
// hier steht nur, was der Server bereits gesagt hat.
//
// Bewusst KEIN direktes Umschalten: beide Richtungen laufen über einen
// Bestätigungsdialog in der Seite. Freischalten öffnet einen Providerablauf im
// Sondermodus, Entziehen nimmt einem arbeitenden Testkunden sofort die
// Grundlage — beides ist keine beiläufige Klickentscheidung.
// ─────────────────────────────────────────────────────────────────────────────

export const TEST_BOOKING_SWITCH_ID = "adm-test-booking-switch";
export const TEST_BOOKING_SECTION_ID = "adm-test-booking-section";

export function TestBookingSection({
  enabled,               // boolescher Ist-Zustand aus der Kundenantwort
  busy = false,
  error = "",
  successText = "",
  onRequestChange,       // (nextEnabled: boolean) => void — öffnet den Dialog
}) {
  const on = enabled === true;

  return (
    <div className="adm-card" id={TEST_BOOKING_SECTION_ID}>
      {/* Der Zustand steht doppelt codiert da: als Badge MIT TEXT im Kartenkopf
          und als Schalterstellung — nie allein farblich. */}
      <div className="adm-card-head">
        <Icon n="settings" s={17} /> {T.cardTitle}
        <span className={`badge ${on ? "badge--success" : "badge--neutral"} adm-card-head-action`}>
          {on ? T.statusOn : T.statusOff}
        </span>
      </div>
      <div className="adm-card-body adm-testbooking-body">
        <Switch
          id={TEST_BOOKING_SWITCH_ID}
          checked={on}
          onChange={(next) => { if (!busy) onRequestChange(next); }}
          label={T.switchLabel}
          hint={on ? T.hintOn : T.hintOff}
        />

        <p className="adm-note adm-note--info">
          <Icon n="info" s={15} />
          <span>{T.explanation}</span>
        </p>
        {/* Die eigentliche Aussage dieses Pakets — sichtbar, nicht nur im Code:
            eine Adminrolle ist keine Testberechtigung. */}
        <p className="adm-note">
          <Icon n="shield" s={15} />
          <span>{T.roleNote}</span>
        </p>

        {error ? (
          <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error}</div>
        ) : null}
        {successText ? (
          <div className="alert alert-success" role="status"><Icon n="check" s={16} />{successText}</div>
        ) : null}
      </div>
    </div>
  );
}
