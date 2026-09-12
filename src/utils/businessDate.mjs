// TG22 Paket B — der Geschäftstag in Europe/Berlin als "YYYY-MM-DD".
//
// „Heute" des Browsers ist die lokale Zeitzone des Geräts. Ob ein gespeichertes Versanddatum
// in der Vergangenheit liegt, ist aber eine Frage des GESCHÄFTSTAGS, an dem Abholung und
// Buchung stattfinden — und der liegt in Europe/Berlin. Dieselbe Zone und dieselbe
// Intl-Technik wie die Monatskennzahl (utils/kpis.mjs).
import { BUSINESS_TIME_ZONE } from "./kpis.mjs";

/** Der Berliner Geschäftstag zum Zeitpunkt `now`. `null` bei ungültigem Zeitpunkt. */
export function businessTodayISO(now = new Date()) {
  const zeitpunkt = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(zeitpunkt.getTime())) return null;
  const teile = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(zeitpunkt);
  const hole = (typ) => (teile.find((t) => t.type === typ) || {}).value;
  const y = hole("year"), m = hole("month"), d = hole("day");
  return y && m && d ? `${y}-${m}-${d}` : null;
}
