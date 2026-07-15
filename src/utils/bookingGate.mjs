// Reines Buchungs-Gate — framework-frei und testbar (.mjs, wie kpis.mjs). Bündelt
// die Freigabe-Bedingung des verbindlichen Buchen-Buttons an EINER Stelle, damit
// UI-Deaktivierung und Logik dieselbe Wahrheit nutzen.
//
// WICHTIG: reine Frontend-Freigabe. KEINE Payload-/Preis-/Versicherungs-/Zoll-
// Logik. Die Werte kommen unverändert aus dem Orchestrator (BookingPage):
//   - agbAccepted              : AGB-Bestätigung (unverändert, bestehend)
//   - prohibitedGoodsAccepted  : Bestätigung „keine ausgeschlossenen Güter" (neu)
//   - loading                  : Buchung läuft bereits
//   - insuranceBlocksBooking   : Versicherungspfad ohne frischen/gültigen Reprice
//   - pickupBlocksBooking      : Abholfenster wird noch geladen ODER Ladefehler (nur Pickup)
//
// Buchung nur, wenn BEIDE Bestätigungen gesetzt sind und kein bestehendes Gate
// blockiert. Die AGB-Bedingung bleibt eigenständig erhalten (nicht ersetzt).
export function canSubmitBooking({
  agbAccepted,
  prohibitedGoodsAccepted,
  loading,
  insuranceBlocksBooking,
  pickupBlocksBooking,
} = {}) {
  return (
    agbAccepted === true &&
    prohibitedGoodsAccepted === true &&
    !loading &&
    !insuranceBlocksBooking &&
    !pickupBlocksBooking
  );
}
