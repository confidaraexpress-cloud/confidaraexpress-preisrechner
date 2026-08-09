// ── Externe Links: EINE Prüfung für das ganze Frontend ───────────────────────
// Vorher stand dieselbe Zeile wortgleich in mehreren Komponenten. Eine zweite
// Kopie ist bei Sicherheitslogik teurer als bei Darstellungslogik: sie kann
// leise auseinanderlaufen, und dann gilt die schwächere Fassung genau dort, wo
// niemand hinsieht. Deshalb existiert die Regel ab hier genau einmal.
//
// Zugelassen ist ausschließlich ein absoluter http(s)-Link. Alles andere —
// `javascript:`, `data:`, protokollrelative `//host`, relative Pfade, leere
// Werte, Nicht-Strings — ergibt „kein Link". Es wird NICHT repariert: kein
// http→https, kein Ergänzen eines fehlenden Schemas, kein Raten.
const HTTP_URL_RE = /^https?:\/\/\S/i;

export const isHttpUrl = (v) => typeof v === "string" && HTTP_URL_RE.test(v);

// Getrimmter Link ODER null — die Form, die eine Komponente direkt in `href`
// stecken kann, ohne selbst nochmal zu prüfen.
export function httpUrlOrNull(v) {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return isHttpUrl(trimmed) ? trimmed : null;
}

// Pflicht-Attribute jedes externen Links (neues Tab ohne Zugriff auf das
// öffnende Fenster, kein Referrer). Als Konstante, damit ein neuer Link sie
// nicht versehentlich unvollständig mitbringt.
export const EXTERNAL_LINK_REL = "noopener noreferrer";
export const EXTERNAL_LINK_TARGET = "_blank";
