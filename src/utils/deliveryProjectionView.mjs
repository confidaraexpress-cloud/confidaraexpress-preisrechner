/* utils/deliveryProjectionView.mjs — die voraussichtliche Zustellung eines Angebots, zur Anzeige gelesen
   (TG22 Package B, TG-L2).

   Reine Funktionen: kein Netz, kein Zustand, kein React und KEINE Uhr.

   ─── DER SERVER RECHNET, DIESE DATEI FORMATIERT ───────────────────────────────
   `deliveryProjection { kind: "estimated", dateMin, dateMax, timeUntil }` ist eine Prognose von
   ConfidaraExpress aus Abhol- bzw. Abgabetag und Laufzeit — keine Zustellzusage und kein Datum des Anbieters.
   Hier wird nichts gezählt, kein Wochenende übersprungen und kein Tag addiert: das hat der Server getan. Die
   Datei prüft die Form, schreibt die Tage und nennt den Hinweis. Fehlt die Prognose oder ist sie unbrauchbar,
   entsteht nichts — dann bleibt die Laufzeit die einzige Aussage.

   ─── KEINE ZEITZONE, KEINE BROWSERSPRACHE ────────────────────────────────────
   Der Wochentag eines Kalendertags ist eine Eigenschaft des Datums: gelesen über Date.UTC, geschrieben mit
   einer festen deutschen Kurzform. So entsteht in jedem Browser und jeder Zeitzone „Di., 15.09.".

   ─── DIE UHRZEIT: NUR, WAS DER SERVER BELEGT (TG-L1/TG-L2, 2026-10-23) ───────
   `timeUntil` ist die belegte Zustellzeit des gebuchten Produkts („bis 12:00 Uhr am nächsten Werktag"),
   kuratiert je Service und Strecke auf dem Server — nie aus dem Produktnamen und nie aus einem Anbieterfeld.
   Sie steht nur an einem einzelnen Tag. Hier wird keine Uhrzeit ergänzt, gerundet oder umgerechnet; eine
   Form, die der Vertrag nicht kennt, ergibt keine. Eine Garantie behauptet die Oberfläche nie. */

export const DELIVERY_PROJECTION_TEXT = Object.freeze({
  label: "Voraussichtliche Zustellung",
  note: "Aus Abholtag und Laufzeit berechnet; Wochenenden und bundesweite Feiertage sind nicht mitgezählt. Regionale oder ausländische Feiertage können die Zustellung verschieben.",
  noteDropoff: "Aus Abgabetag und Laufzeit berechnet; Wochenenden und bundesweite Feiertage sind nicht mitgezählt. Regionale oder ausländische Feiertage können die Zustellung verschieben.",
  noteTime: "Die Uhrzeit ist die Zustellzeit, die der Versanddienstleister für dieses Produkt nennt.",
});

const KIND_ESTIMATED = "estimated";
const WOCHENTAG = Object.freeze(["So.", "Mo.", "Di.", "Mi.", "Do.", "Fr.", "Sa."]);
const KALENDERTAG = /^(\d{4})-(\d{2})-(\d{2})$/;
// „HH:MM", nullgepolstert, 00:00–23:59 — genau die Form des Serververtrags.
const UHRZEIT = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

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
 * @returns {{dateMin: string, dateMax: string|null, timeUntil: string|null}|null}  `dateMax: null` heißt „nach
 *          oben offen" („ab …"); `timeUntil` nur an einem einzelnen Tag, sonst `null`.
 */
export function readDeliveryProjection(tariff) {
  const p = tariff && typeof tariff === "object" ? tariff.deliveryProjection : null;
  if (!p || typeof p !== "object" || Array.isArray(p) || p.kind !== KIND_ESTIMATED) return null;
  if (!kalendertag(p.dateMin)) return null;
  if (p.dateMax === null) return Object.freeze({ dateMin: p.dateMin, dateMax: null, timeUntil: null });
  // `YYYY-MM-DD` ist lexikographisch geordnet — derselbe Vergleich wie auf Kalendertagen.
  if (!kalendertag(p.dateMax) || p.dateMax < p.dateMin) return null;
  // Eine Uhrzeit gilt nur an einem einzelnen Tag und nur in Vertragsform — sonst keine (die Tage bleiben).
  const timeUntil = p.dateMax === p.dateMin && typeof p.timeUntil === "string" && UHRZEIT.test(p.timeUntil)
    ? p.timeUntil : null;
  return Object.freeze({ dateMin: p.dateMin, dateMax: p.dateMax, timeUntil });
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

/** Die belegte Uhrzeit der Prognose als Satzteil — „bis 12:00 Uhr" — oder `null`. */
export function projectedDeliveryTimeText(projection) {
  const p = projection && typeof projection === "object" ? projection : null;
  return p && typeof p.timeUntil === "string" && UHRZEIT.test(p.timeUntil) ? `bis ${p.timeUntil} Uhr` : null;
}

/**
 * Der Hinweis zur Prognose: worauf sie beruht (Abhol- oder Abgabetag) und — nur mit Uhrzeit — woher die Uhrzeit
 * stammt. `null` ohne Prognose.
 *
 * @param {{dateMin: string, dateMax: string|null, timeUntil: string|null}|null} projection  `readDeliveryProjection`
 * @param {{dropoff?: boolean}} [opts]  `dropoff: true` bei einer Abgabe im Paketshop
 */
export function projectedDeliveryNote(projection, { dropoff = false } = {}) {
  if (!projection || typeof projection !== "object") return null;
  const basis = dropoff ? DELIVERY_PROJECTION_TEXT.noteDropoff : DELIVERY_PROJECTION_TEXT.note;
  return projectedDeliveryTimeText(projection) ? `${basis} ${DELIVERY_PROJECTION_TEXT.noteTime}` : basis;
}
