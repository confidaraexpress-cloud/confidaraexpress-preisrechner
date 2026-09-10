// ─────────────────────────────────────────────────────────────────────────────
// Sendungsverfolgung mit Transportabschnitten — reine Auswertung.
//
// Kein React, kein fetch, kein Zustand. Beantwortet ausschließlich: welche Abschnitte
// („Legs") und welche Ereignisse liefert die providerneutrale Trackingantwort
// (`trackingLegs`), und wie werden sie angezeigt?
//
// ─── Der Server ist die Wahrheit ─────────────────────────────────────────────
// `trackingLegs` kommt fertig vom Server: je Abschnitt Carrier, Trackingnummer, ein bereits
// geprüfter Carrierlink und die Ereignisse mit Code, Beschreibung, Ort und Zeitangabe. Hier
// wird nichts nachgeladen und kein Sendungsstand abgeleitet — der steht in `trackingStatus`.
//
// ─── Keine erfundene Zeitzone ─────────────────────────────────────────────────
// Die Zeitangabe eines Ereignisses kommt als Datum und Uhrzeit OHNE Zone. Sie wird deshalb
// NIE in ein Datumsobjekt verwandelt — das würde die Zone des Browsers behaupten. Umgestellt
// wird nur der Text: "2026-05-12" → "12.05.2026"; die Uhrzeit bleibt, wie sie geliefert wurde.
// Ohne zerlegbares Datum wird der Rohwert unverändert gezeigt.
//
// ─── Keine erfundenen Paketnummern ───────────────────────────────────────────
// Mehrere Abschnitte erscheinen als Abschnitte — mit Carrier und, falls vorhanden, ihrer
// Trackingnummer. Es gibt keine Nummerierung wie „Paket 2".
// ─────────────────────────────────────────────────────────────────────────────

import { httpUrlOrNull } from "./externalLink.mjs";

export const TRACKING_LEGS_TEXT = Object.freeze({
  eventFallback: "Ereignis",
  noDate: "Ohne Datum",
  timeSuffix: "Uhr",
  liveUnavailable: "Die aktuellen Sendungsereignisse sind gerade nicht abrufbar.",
});

// Anzeige des normalisierten Sendungsstands. Nur Werte des internen Modells — alles andere,
// ausdrücklich auch "unknown", ergibt KEIN Label: ein unbekannter Stand wird nicht benannt.
const STATUS_LABELS = Object.freeze({
  pending: "In Vorbereitung",
  in_transit: "Unterwegs",
  delivered: "Zugestellt",
  exception: "Ausnahme",
});

// Dieselbe Formregel wie für Trackingreferenzen (utils/trackingReferencesView.mjs).
const TRACKING_REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,39}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})$/;

const text = (w) => (typeof w === "string" && w.trim() !== "" ? w.trim() : null);

/** Label des normalisierten Sendungsstands — oder `null`. */
export function trackingStatusLabel(status) {
  const s = text(status);
  return s && Object.prototype.hasOwnProperty.call(STATUS_LABELS, s) ? STATUS_LABELS[s] : null;
}

/** Trägt die Antwort überhaupt Transportabschnitte? */
export function hasTrackingLegs(result) {
  return Boolean(result) && typeof result === "object" && Array.isArray(result.trackingLegs);
}

function anzeigeEreignis(roh) {
  const e = roh && typeof roh === "object" ? roh : {};
  const zeit = e.dateTime && typeof e.dateTime === "object" ? e.dateTime : {};
  const d = typeof zeit.date === "string" ? DATE_RE.exec(zeit.date) : null;
  const t = typeof zeit.time === "string" ? TIME_RE.exec(zeit.time) : null;
  const day = d ? `${d[3]}.${d[2]}.${d[1]}` : null;
  return {
    description: text(e.description) || TRACKING_LEGS_TEXT.eventFallback,
    code: text(e.code),
    status: text(e.status),
    location: text(e.location),
    day,
    time: t ? zeit.time : null,
    // Ohne zerlegbares Datum: der Rohwert, unverändert — nie geraten.
    rawWhen: day ? null : text(zeit.raw),
    sortKey: d && t ? `${d[1]}${d[2]}${d[3]}${t[1]}${t[2]}${t[3]}` : null,
  };
}

// Älteste zuerst. Hat der Server die Reihenfolge bereits bestätigt, bleibt sie; sonst wird nur
// sortiert, wenn JEDES Ereignis ein vollständiges Datum mit Uhrzeit trägt.
function aufsteigend(events, chronological) {
  if (chronological === true) return events;
  if (events.length < 2 || events.some((e) => e.sortKey === null)) return events;
  return events
    .map((e, i) => [e, i])
    .sort((a, b) => (a[0].sortKey < b[0].sortKey ? -1 : a[0].sortKey > b[0].sortKey ? 1 : a[1] - b[1]))
    .map(([e]) => e);
}

/** Die Abschnitte zur Anzeige — leer, wenn der Server keine liefert. */
export function trackingLegsOf(result) {
  if (!hasTrackingLegs(result)) return [];
  return result.trackingLegs
    .filter((l) => l && typeof l === "object")
    .map((l, i) => {
      const referenz = text(l.trackingReference);
      return {
        key: `leg-${i}`,
        carrier: text(l.carrier),
        trackingReference: referenz && TRACKING_REFERENCE_RE.test(referenz) ? referenz : null,
        carrierTrackingPage: httpUrlOrNull(l.carrierTrackingPage),
        events: aufsteigend((Array.isArray(l.events) ? l.events : []).map(anzeigeEreignis), l.eventsChronological),
      };
    });
}

/** Anzahl aller Ereignisse über alle Abschnitte. */
export function trackingLegEventCount(legs) {
  return (Array.isArray(legs) ? legs : []).reduce((n, l) => n + (Array.isArray(l.events) ? l.events.length : 0), 0);
}

/**
 * Das jüngste Ereignis über alle Abschnitte — nur, wenn jedes Ereignis Datum und Uhrzeit trägt.
 * Sonst `null`: welches das jüngste ist, wäre geraten.
 */
export function latestTrackingLegEvent(legs) {
  const alle = (Array.isArray(legs) ? legs : []).flatMap((l) => (Array.isArray(l.events) ? l.events : []));
  if (alle.length === 0 || alle.some((e) => e.sortKey === null)) return null;
  return alle.reduce((neu, e) => (e.sortKey > neu.sortKey ? e : neu));
}

/**
 * Die Zeitangabe eines Ereignisses als Text: "12.05.2026 · 14:46:53 Uhr" — ohne Zone. Ohne
 * zerlegbares Datum der Rohwert.
 */
export function eventWhenText(ev, { withSuffix = true } = {}) {
  if (!ev || typeof ev !== "object") return null;
  if (ev.day) {
    const uhrzeit = ev.time ? (withSuffix ? `${ev.time} ${TRACKING_LEGS_TEXT.timeSuffix}` : ev.time) : null;
    return [ev.day, uhrzeit].filter(Boolean).join(" · ");
  }
  return ev.rawWhen || null;
}

/** Überschrift eines Abschnitts: Carrier und Trackingnummer, soweit vorhanden. */
export function trackingLegHeading(leg) {
  if (!leg || typeof leg !== "object") return null;
  return [leg.carrier, leg.trackingReference].filter(Boolean).join(" · ") || null;
}
