import React from "react";
import { Icon } from "../ui/Icon";
import { canSubmitBooking } from "../../utils/bookingGate";

// Buchungsaktion — Fehlermeldung, Konflikt-/Adressfehler-Zweige und der
// verbindliche Buchen-Button. REINE DARSTELLUNG; alle Zustände/Handler kommen
// aus dem Orchestrator (BookingPage). Der Button ist über canSubmitBooking
// deaktiviert — dieselbe Freigabe-Bedingung, die auch der Guard in doBook nutzt
// (AGB + Ausschlussgüter-Bestätigung + bestehende Gates).
export function BookingActionModule({
  error, conflict, addressError, loading, agbAccepted, prohibitedGoodsAccepted, insuranceBlocksBooking,
  onBook, onNavigateShipments, onNavigateNew, userEmail,
}) {
  const bookingAllowed = canSubmitBooking({ agbAccepted, prohibitedGoodsAccepted, loading, insuranceBlocksBooking });
  return (
    <>
      {error && <div className="alert alert-error">{error}</div>}
      {conflict ? (
        <div className="booking-conflict-box">
          <p className="booking-conflict-text"><Icon n="shield" s={16} c="#1D4ED8" /> {conflict}</p>
          <button className="btn btn-primary btn-full" onClick={onNavigateShipments}>
            Zu meinen Sendungen
          </button>
        </div>
      ) : addressError ? (
        <div className="booking-conflict-box">
          <p className="booking-conflict-text"><Icon n="info" s={16} c="#1D4ED8" /> {addressError}</p>
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
