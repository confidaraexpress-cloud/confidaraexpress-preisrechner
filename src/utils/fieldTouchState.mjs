// utils/fieldTouchState.mjs — welche Feldfehler ein Versandformular ZEIGT.
//
// Betreiberentscheidung (Auftrag 1, 2026-10-16) für den Preisrechner und „Neue Sendung“:
//   • „Angebote vergleichen“ ist auch bei fehlenden Angaben anklickbar. Ein Klick zeigt ALLE
//     fehlenden oder ungültigen Pflichtfelder (submitted).
//   • Verlässt der Kunde ein Feld ungültig, wird nur dieses Feld markiert (touched). Unberührte
//     leere Felder bleiben neutral.
//   • Sobald der Wert gültig ist, verschwindet die Markierung — sofort, ohne erneuten Klick.
//   • Ein Fehler des Servers (z. B. 422 mit Feld) bleibt stehen, bis das Feld geändert wird.
//
// Dieses Modul prüft NICHTS selbst. `live` ist das Ergebnis der vorhandenen Validierung der Seite
// (getErrors bzw. getCalculatorErrors) — keine zweite Fassung einer Regel. Hier wird nur
// entschieden, was davon sichtbar ist.

/** Sichtbare Fehler: live-Fehler berührter Felder (oder aller nach einem Klick) plus Serverfehler. */
export function visibleFieldErrors({ live = {}, touched = {}, submitted = false, server = {} } = {}) {
  const out = {};
  for (const [feld, meldung] of Object.entries(live || {})) {
    if (!meldung) continue;
    if (submitted || (touched && touched[feld] === true)) out[feld] = meldung;
  }
  for (const [feld, meldung] of Object.entries(server || {})) {
    if (meldung && !out[feld]) out[feld] = meldung;
  }
  return out;
}

/** Markiert ein Feld als verlassen — ein neues Objekt, nie eine Mutation. */
export function markFieldTouched(touched, feld) {
  if (!feld) return touched || {};
  const t = touched || {};
  if (t[feld] === true) return t;
  return { ...t, [feld]: true };
}

/** Entfernt den Serverfehler eines Feldes, sobald der Kunde es ändert. */
export function withoutFieldError(errors, feld) {
  if (!errors || !feld || !errors[feld]) return errors || {};
  const n = { ...errors };
  delete n[feld];
  return n;
}

/** Das erste fehlerhafte Feld in Formularreihenfolge (für Scroll und Fokus). */
export function firstFieldInOrder(errors, order) {
  if (!errors) return null;
  const liste = Array.isArray(order) ? order : [];
  return liste.find((k) => errors[k]) || Object.keys(errors).find((k) => errors[k]) || null;
}

/**
 * onMouseDown für den Absendeknopf: der Klick behält den Fokus im Feld, bis der Knopf
 * ausgelöst hat. Ohne das löst ein Blur VOR dem Klick eine Meldung unter dem Feld aus, der Knopf
 * rutscht zwischen Drücken und Loslassen nach unten, und der erste Klick geht verloren (in der
 * Partnerregistrierung gemessen, PartnerRegisterPage.jsx). Nur die primäre Maustaste — Tastatur
 * und Touch lösen kein mousedown vor dem Blur aus.
 */
export function keepFocusOnMouseDown(e) {
  if (e && e.button === 0 && typeof e.preventDefault === "function") e.preventDefault();
}
