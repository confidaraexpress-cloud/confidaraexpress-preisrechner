import React from "react";
import { Icon } from "../ui/Icon";
import { canSubmitBooking } from "../../utils/bookingGate";

// Buchungsaktion — Fehlermeldung, Konflikt-/Adressfehler-Zweige und der
// verbindliche Buchen-Button. REINE DARSTELLUNG; alle Zustände/Handler kommen
// aus dem Orchestrator (BookingPage). Der Button ist über canSubmitBooking
// deaktiviert — dieselbe Freigabe-Bedingung, die auch der Guard in doBook nutzt
// (AGB + Ausschlussgüter-Bestätigung + bestehende Gates).
export function BookingActionModule({
  error, conflict, addressError, recalcNotice, loading, agbAccepted, prohibitedGoodsAccepted, insuranceBlocksBooking, pickupBlocksBooking, voucherChecking,
  legalBlocksBooking,
  onBook, onNavigateShipments, onNavigateNew, onRecalculate, userEmail,
}) {
  // Während einer laufenden Gutscheinprüfung ist der anzuzeigende Endbetrag nicht bestimmt —
  // solange darf nicht bestellt werden. Die bestehende Gate-Funktion bleibt unverändert;
  // diese Bedingung kommt additiv dazu.
  // Legal-Buchungsschranke (Paket 4-B): solange der Kontext lädt oder nicht auslieferbar ist,
  // steht nicht fest, welche Fassungen gelten — dann darf nicht bestellt werden. Bei
  // ausgeschalteter Schranke ist der Wert false und dieser Ausdruck unverändert.
  const bookingAllowed = canSubmitBooking({ agbAccepted, prohibitedGoodsAccepted, loading, insuranceBlocksBooking, pickupBlocksBooking })
    && voucherChecking !== true
    && legalBlocksBooking !== true;
  return (
    <>
      {/* ─── CE-19: der Fehlerzustand trägt ZWEI Formen ────────────────────────────────
          Die fachlichen Zweige der Buchungsseite setzen eine Zeichenkette; der Restpfad
          setzt seit der Fehlerklassifizierung ein Objekt `{ title, message, retryable }`
          aus `utils/bookingErrors.mjs`. Diese Stelle rendert bis hierher ausschliesslich
          `{error}` — ein Objekt als React-Kind ist aber kein Text, sondern ein
          Renderfehler („Objects are not valid as a React child"), und er trifft genau die
          Antworten, die dem Kunden etwas Wichtiges zu sagen haetten (404/429/5xx).
          Beide Formen werden deshalb ausdruecklich behandelt. */}
      {error && (typeof error === "string"
        ? <div className="alert alert-error">{error}</div>
        : <div className="alert alert-error" role="alert">
            {error.title ? <strong>{error.title}</strong> : null}
            {error.title && error.message ? " " : null}
            {error.message ? <span>{error.message}</span> : null}
          </div>)}
      {conflict ? (
        <div className="booking-conflict-box">
          <p className="booking-conflict-text"><Icon n="shield" s={16} c="var(--ce-color-brand-ink)" /> {conflict}</p>
          <button className="btn btn-primary btn-full" onClick={onNavigateShipments}>
            Zu meinen Sendungen
          </button>
        </div>
      ) : recalcNotice ? (
        /* ─── TG-7: nichts beauftragt, aber das Angebot trägt nicht mehr ──────────────
           Bis hierher liefen diese Fälle durch den Konfliktzweig darüber und boten „Zu
           meinen Sendungen" an. Das ist die falsche Handlung UND eine falsche Auskunft:
           es wurde nichts bestellt, in der Sendungsliste steht also nichts, das man dort
           nachsehen könnte. Der Text sagte bereits „bitte neu berechnen" — nur der Knopf
           führte woandershin.

           Wie der Konfliktzweig ERSETZT auch dieser den Bestellknopf: mit derselben
           Angebotskennung entstünde ohnehin dieselbe Ablehnung. */
        <div className="booking-conflict-box">
          <p className="booking-conflict-text"><Icon n="info" s={16} c="var(--ce-color-brand-ink)" /> {recalcNotice}</p>
          <button className="btn btn-primary btn-full" onClick={onRecalculate}>
            Angebote neu berechnen
          </button>
        </div>
      ) : addressError ? (
        <div className="booking-conflict-box">
          <p className="booking-conflict-text"><Icon n="info" s={16} c="var(--ce-color-brand-ink)" /> {addressError}</p>
          <button className="btn btn-primary btn-full" onClick={onNavigateNew}>
            Adressen vervollständigen &amp; neu berechnen
          </button>
        </div>
      ) : (
        <button className="btn btn-primary btn-full booking-book-btn" onClick={onBook} disabled={!bookingAllowed}>
          {loading ? <><span className="spinner" /> Sendung wird gebucht…</> : "Kostenpflichtig buchen"}
        </button>
      )}
      <p className="booking-email-note">
        Nach der Buchung erhalten Sie eine Bestätigung per E-Mail an {userEmail}
      </p>
    </>
  );
}
