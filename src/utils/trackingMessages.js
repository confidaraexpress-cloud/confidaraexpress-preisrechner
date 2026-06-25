// Zentrale, kundenfreundliche Tracking-Meldung für den Not-found-Fall (HTTP 404).
// Bewusst an einer Stelle definiert, damit öffentliches Tracking (TrackingPage)
// und Dashboard-internes Tracking (ShipmentsList) exakt dieselbe Formulierung
// nutzen und der Text nicht doppelt hartcodiert wird. Nur der 404-Fall verwendet
// diese Meldung — technische Fehler (429/500/Netzwerk) bleiben neutral.
export const TRACKING_NOT_FOUND =
  "Zu dieser Sendungsnummer liegt aktuell keine Sendung in ConfidaraExpress vor. Bitte prüfen Sie die Nummer auf Tippfehler oder stellen Sie sicher, dass die Sendung über ConfidaraExpress gebucht wurde.";
