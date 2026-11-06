// ─────────────────────────────────────────────────────────────────────────────
// Neuladen nach einer abgeschlossenen Buchung (Phase 1, Thema 6, Canonical v2.117).
//
// Die Buchungsseite bekommt ihr Angebot über den Navigationszustand (location.state). Den bewahrt der Browser auch
// über ein Neuladen (F5) — nach einer abgeschlossenen Buchung stand dann wieder das bereits gebuchte Angebot als
// Buchungsformular da (oder, ohne Zustand, „Kein Angebot ausgewählt"). Beides ist für eine bezahlte Bestellung
// irreführend.
//
// Deshalb ersetzt die Seite nach dem Buchungserfolg ihren Navigationszustand: das Angebot fällt heraus, an seine
// Stelle tritt ein kleiner Vermerk. Er erlaubt nach einem Neuladen die ruhige Aussage „Buchung abgeschlossen".
//
// Datensparsam und ohne Speichertechnik: kein localStorage, kein sessionStorage, kein Cookie — der Vermerk lebt nur
// im Verlaufseintrag dieses Tabs. Er trägt das Konto, für das gebucht wurde, die Auftragsbestätigungsnummer und den
// Zeitpunkt — keine Anschrift, keinen Namen, keinen Betrag, keine Provider- oder Tarifangabe. Es wird nichts erneut
// abgerufen und nichts erneut gebucht. Ein anderes Konto sieht ihn nie; nach 30 Minuten gilt er nicht mehr.
// ─────────────────────────────────────────────────────────────────────────────

export const BOOKING_COMPLETION_STATE_KEY = "buchungAbgeschlossen";
export const BOOKING_COMPLETION_TTL_MS = 30 * 60 * 1000;

export const BOOKING_COMPLETION_TEXT = Object.freeze({
  title: "Buchung abgeschlossen",
  lead: "Ihre Sendung wurde erfolgreich gebucht. Label, Dokumente und Sendungsverfolgung finden Sie unter „Meine Sendungen“.",
  numberLabel: "Auftragsbestätigung",
  shipments: "Zu meinen Sendungen",
  newShipment: "Neue Sendung",
});

const kennung = (v) => ((typeof v === "number" && Number.isFinite(v)) || (typeof v === "string" && v.trim() !== "")
  ? String(v).trim() : null);

/**
 * Der Navigationszustand nach dem Buchungserfolg — ersetzt den bisherigen vollständig (das Angebot fällt heraus).
 * Ohne Konto entsteht ein leerer Zustand: dann zeigt ein Neuladen „Kein Angebot ausgewählt" wie bisher.
 */
export function completedBookingNavState({ userId, orderConfirmationNumber, now = Date.now() } = {}) {
  const konto = kennung(userId);
  if (!konto) return {};
  const ab = typeof orderConfirmationNumber === "string" && orderConfirmationNumber.trim() !== "" ? orderConfirmationNumber.trim() : null;
  return { [BOOKING_COMPLETION_STATE_KEY]: { u: konto, ab, t: now } };
}

/** Trägt der Navigationszustand einen Vermerk? (Dann ist er kein Angebotszustand.) */
export const hasCompletedBookingState = (navState) => Boolean(
  navState && typeof navState === "object" && navState[BOOKING_COMPLETION_STATE_KEY]);

/** Den gültigen Vermerk für dieses Konto lesen — sonst null (abgelaufen, fremdes Konto, unlesbar). */
export function readCompletedBookingState(navState, { userId, now = Date.now() } = {}) {
  const konto = kennung(userId);
  if (!konto || !hasCompletedBookingState(navState)) return null;
  const e = navState[BOOKING_COMPLETION_STATE_KEY];
  if (!e || typeof e !== "object" || e.u !== konto || typeof e.t !== "number") return null;
  const alter = now - e.t;
  if (!(alter >= 0 && alter <= BOOKING_COMPLETION_TTL_MS)) return null;
  return { orderConfirmationNumber: typeof e.ab === "string" ? e.ab : null, at: e.t };
}
