/* ── Buchungsklärung in der Kundensicht (Package C) ────────────────────────────
   Eine Sendung steht auf `booking`, solange ihr Buchungsausgang geklärt wird: die
   Bestellung ist abgeschickt, ihr Ergebnis aber noch nicht bestätigt. Seit Package C
   liefert der Server sie in „Sendungen" mit aus — der Kunde soll nicht glauben, sein
   Auftrag sei verschwunden.

   Was die Oberfläche dabei zusagt, steht ausschließlich hier:
     • ein neutraler Status („Buchungsstatus wird geprüft"),
     • ein beruhigender Satz („Sie müssen aktuell nichts tun."),
     • KEINE Aktion: keine Sendungsverfolgung (es gibt noch keine Nummer), keine
       Dokumente (es gibt noch keine), keine Stornierung (es gibt noch nichts zu
       stornieren) und kein „erneut buchen" — der Ausgang ist offen, eine zweite
       Buchung könnte doppelt bestellen.
   Kein Anbieter, keine Referenz, kein Klärungsgrund: die Zeile trägt diese Felder auch
   gar nicht.

   Nach der Klärung entscheidet wieder allein der Server: „gebucht" macht daraus eine
   normale Sendung, „nicht gebucht" einen Entwurf, der diese Liste verlässt. */

export const BOOKING_IN_REVIEW_STATUS = "booking";

export const BOOKING_IN_REVIEW_TEXT = Object.freeze({
  badge: "Buchungsstatus wird geprüft",
  note: "Sie müssen aktuell nichts tun.",
});

/** Wird der Buchungsausgang dieser Sendung gerade geklärt? Es zählt nur der exakte Serverwert. */
export function isBookingInReview(shipment) {
  return Boolean(shipment) && shipment.status === BOOKING_IN_REVIEW_STATUS;
}
