/* utils/deliveryProjectionView.mjs — die voraussichtliche Lieferung eines Angebots, zur Anzeige gelesen
   (TG22 Package B).

   Reine Funktionen: kein Netz, kein Zustand, kein React und KEINE Uhr.

   ─── DER SERVER RECHNET, DIESE DATEI FORMATIERT ───────────────────────────────
   `deliveryProjection { kind: "estimated", dateMin, dateMax }` ist eine Prognose von ConfidaraExpress aus
   Abholtag und Laufzeit — keine Zustellzusage und kein Datum des Anbieters. Hier wird nichts gezählt, kein
   Wochenende übersprungen und kein Tag addiert: das hat der Server getan. Die Datei prüft die Form,
   schreibt die Tage und nennt den Hinweis. Fehlt die Prognose oder ist sie unbrauchbar, entsteht nichts —
   dann bleibt die Laufzeit die einzige Aussage.

   ─── KEINE ZEITZONE, KEINE BROWSERSPRACHE ────────────────────────────────────
   Der Wochentag eines Kalendertags ist eine Eigenschaft des Datums: gelesen über Date.UTC, geschrieben mit
   einer festen deutschen Kurzform. So entsteht in jedem Browser und jeder Zeitzone „Di., 15.09.".

   ─── KEINE UHRZEIT ───────────────────────────────────────────────────────────
   Eine Prognose nennt nie „bis HH:MM" — der Anbieter liefert für sie keine Uhrzeit, und hier wird keine
   ergänzt. */

export const DELIVERY_PROJECTION_TEXT = Object.freeze({
  label: "Voraussichtliche Lieferung",
  note: "Aus Abholtag und Laufzeit berechnet; Wochenenden sind nicht mitgezählt. Feiertage können die Zustellung verschieben.",
});

const KIND_ESTIMATED = "estimated";
const WOCHENTAG = Object.freeze(["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."]);
const KALENDERTAG = /^(\d{4})-(\d{2})-(\d{2})$/;

/* Ein echter Kalendertag `YYYY-MM-DD` mit Wochentag — oder `null`. „2026-02-30" rollt nicht still weiter. */
function kalendertag(wert) {
  if (typeof wert !== "string") return null;
  const m = KALENDERTAG.exec(wert);
  if (!m) return null;
  const jahr = Number(m[1]), monat = Number(m[2]), tag = Number(m[3]);
  const utc = new Date(Date.UTC(jahr, monat - 1, tag));
  if (utc.getUTCFullYear() !== jahr || utc.getUTCMonth() !== monat - 1 || utc.getUTCDate() !== tag) return null;
  return Object.freeze({ wochentag: WOCHENTAG[utc.getUTCDay()], tag: m[3], monat: m[2], jahr: m[1] });
}

/**
 * Die Prognose eines Angebots in genau der Form des Vertrags — oder `null`.
 *
 * @returns {{dateMin: string, dateMax: string|null}|null}  `dateMax: null` heißt „nach oben offen" („ab …").
 */
export function readDeliveryProjection(tariff) {
  const p = tariff && typeof tariff === "object" ? tariff.deliveryProjection : null;
  if (!p || typeof p !== "object" || Array.isArray(p) || p.kind !== KIND_ESTIMATED) return null;
  if (!kalendertag(p.dateMin)) return null;
  if (p.dateMax === null) return Object.freeze({ dateMin: p.dateMin, dateMax: null });
  // `YYYY-MM-DD` ist lexikographisch geordnet — derselbe Vergleich wie auf Kalendertagen.
  if (!kalendertag(p.dateMax) || p.dateMax < p.dateMin) return null;
  return Object.freeze({ dateMin: p.dateMin, dateMax: p.dateMax });
}

const kurz = (d) => `${d.wochentag}, ${d.tag}.${d.monat}.`;
const lang = (d) => `${d.tag}.${d.monat}.${d.jahr}`;

function bereich(projection, schreibe) {
  const p = projection && typeof projection === "object" ? projection : null;
  const min = p ? kalendertag(p.dateMin) : null;
  if (!min) return null;
  if (p.dateMax === null) return `ab ${schreibe(min)}`;
  const max = kalendertag(p.dateMax);
  if (!max) return null;
  return p.dateMax === p.dateMin ? schreibe(min) : `${schreibe(min)} – ${schreibe(max)}`;
}

/** Karte und Detailbereich: „Di., 15.09. – Mi., 16.09." · „Di., 15.09." · „ab Di., 15.09." — oder `null`. */
export function projectedDeliveryText(projection) {
  return bereich(projection, kurz);
}

/** Buchungsflächen (TT.MM.JJJJ wie dort üblich): „15.09.2026 – 16.09.2026" · „ab 15.09.2026" — oder `null`. */
export function projectedDeliveryDateText(projection) {
  return bereich(projection, lang);
}
