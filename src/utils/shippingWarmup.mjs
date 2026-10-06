// src/utils/shippingWarmup.mjs — „VERSANDBEREICH AKTIV" (TG-Cold-Start, 2026-10-06).
//
// Öffnet ein angemeldeter Kunde „Neue Sendung" oder den Versandkostenrechner, meldet die Oberfläche dem Server
// still „Versandbereich aktiv" (POST /api/offers/prepare). Der SERVER entscheidet, ob ein Anbieter vorgewärmt werden
// muss — die Oberfläche kennt weder Anbieter noch Schwelle und zeigt keinen Ladezustand.
//
// Gemeldet wird:
//   • beim Betreten einer der beiden Seiten (Mount)                 → "page"
//   • wenn der Tab wieder sichtbar wird                              → "visible"
//   • bei der ersten Eingabe nach mindestens 5 Minuten Ruhe          → "activity"
// „visible" und „activity" sind gemeinsam auf höchstens eine Meldung je 2 Minuten gedrosselt. Es gibt KEINEN Timer
// und keinen Dauer-Ping: ohne Kundenhandlung entsteht keine Meldung. Fehler werden still verschluckt.

export const SHIPPING_WARMUP_MIN_INTERVAL_MS = 2 * 60 * 1000;
export const SHIPPING_WARMUP_IDLE_ACTIVITY_MS = 5 * 60 * 1000;

/**
 * Die Meldelogik — rein, mit eingesetzter Uhr und eingesetztem Sender (testbar ohne Browser).
 *
 * @param {object} arg  `send(trigger)` liefert ein Promise oder nichts; `now()` liefert Millisekunden
 */
export function createShippingWarmupSignal({ send, now = () => Date.now(),
  minIntervalMs = SHIPPING_WARMUP_MIN_INTERVAL_MS, idleActivityMs = SHIPPING_WARMUP_IDLE_ACTIVITY_MS } = {}) {
  let zuletztGemeldet = null;
  let zuletztAktiv = null;

  const melde = (trigger) => {
    zuletztGemeldet = now();
    try {
      const p = typeof send === "function" ? send(trigger) : null;
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch { /* nie stören */ }
    return true;
  };
  const gedrosselt = () => zuletztGemeldet !== null && now() - zuletztGemeldet < minIntervalMs;

  return {
    /** Echter Eintritt in die Seite: immer melden — der Server entscheidet über den Anbieterruf. */
    onPageEnter() { zuletztAktiv = now(); return melde("page"); },
    /** Der Tab wurde wieder sichtbar. */
    onVisible() { if (gedrosselt()) return false; zuletztAktiv = now(); return melde("visible"); },
    /** Eine Eingabe/ein Klick. Gemeldet nur nach längerer Ruhe — sonst nur vermerkt. */
    onActivity() {
      const t = now();
      const nachRuhe = zuletztAktiv === null || t - zuletztAktiv >= idleActivityMs;
      zuletztAktiv = t;
      if (!nachRuhe || gedrosselt()) return false;
      return melde("activity");
    },
  };
}
