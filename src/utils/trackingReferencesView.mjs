// ─────────────────────────────────────────────────────────────────────────────
// Trackingreferenzen einer Sendung — reine Auswertung (TG-F6).
//
// Kein React, kein fetch, kein Zustand. Beantwortet ausschließlich: trägt diese Sendung
// MEHR ALS EINE Carrier-Sendungsnummer, und welche?
//
// ─── Der Server ist die Wahrheit ─────────────────────────────────────────────
// Die Liste kommt vom Server — als `tracking_references` in der Sendungsliste und als
// `trackingReferences` in Tracking- und Auftragsantworten, beide in Anbieterreihenfolge.
// Hier wird nichts abgeleitet: nicht aus Etiketten, nicht aus einer Nummer, nicht aus dem
// Buchungszustand. Nach Reload, Abmeldung oder auf einem anderen Gerät kommt dieselbe
// Liste wieder vom Server.
//
// ─── Eine Nummer bleibt eine Nummer ──────────────────────────────────────────
// Trägt eine Sendung genau EINE Nummer (Bestandssendungen, heutige Einzelpaketsendungen),
// gibt diese Auswertung `null` zurück — die Oberfläche zeigt dann exakt, was sie bisher
// gezeigt hat. Nur eine echte Mehrfachliste ändert die Darstellung.
//
// ─── Keine Paketnummer ───────────────────────────────────────────────────────
// Die Reihenfolge ist die des Anbieters, keine Paketzuordnung. Die Oberfläche nummeriert
// höchstens als Aufzählung, nie als „Paket 2".
// ─────────────────────────────────────────────────────────────────────────────

export const TRACKING_REFERENCES_TEXT = Object.freeze({
  single: "Trackingnummer",
  plural: "Trackingnummern",
});

// Dieselbe Formregel wie serverseitig (lib/booking/trackingReferences.js): beginnt
// alphanumerisch, höchstens 40 Zeichen, sonst nur Buchstaben, Ziffern und `. _ / -`. Was sie
// nicht erfüllt, wird nicht angezeigt — und ergibt keine leere Zeile.
const TRACKING_REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/;

function referenz(wert) {
  const roh = wert && typeof wert === "object" ? wert.reference : wert;
  const t = typeof roh === "string" ? roh.trim() : "";
  return TRACKING_REFERENCE_RE.test(t) ? t : null;
}

/**
 * Alle gültigen Trackingreferenzen aus einer Server-Antwort — dedupliziert, in
 * Serverreihenfolge. Leer, wenn der Server keine Liste liefert.
 */
export function trackingReferencesOf(source) {
  const s = source && typeof source === "object" ? source : {};
  const roh = Array.isArray(s.trackingReferences) ? s.trackingReferences
    : Array.isArray(s.tracking_references) ? s.tracking_references
    : [];
  const gesehen = new Set();
  const liste = [];
  for (const w of roh) {
    const r = referenz(w);
    if (r === null || gesehen.has(r)) continue;
    gesehen.add(r);
    liste.push(r);
  }
  return liste;
}

/**
 * Die Liste NUR dann, wenn es wirklich mehrere sind — sonst `null`. Bei `null` bleibt die
 * bestehende Einzelanzeige unverändert.
 */
export function multiTrackingReferencesOf(source) {
  const liste = trackingReferencesOf(source);
  return liste.length > 1 ? liste : null;
}

/** Kompakte Zusammenfassung für enge Stellen: „3 Trackingnummern". */
export function trackingReferencesSummary(liste) {
  const n = Array.isArray(liste) ? liste.length : 0;
  return n > 1 ? `${n} ${TRACKING_REFERENCES_TEXT.plural}` : null;
}
