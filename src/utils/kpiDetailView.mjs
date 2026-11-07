// ─────────────────────────────────────────────────────────────────────────────
// Kennzahl-Detailfenster der Kundenübersicht (Betreiberentscheidung 2026-11-07)
// ─────────────────────────────────────────────────────────────────────────────
// Ein Klick auf eine der vier Kennzahlkarten öffnet an der Karte ein schwebendes Fenster (auf dem Telefon ein
// Bottom-Sheet), statt nach „Sendungen“ zu wechseln. Es zeigt die Trefferzahl und die fünf neuesten Sendungen genau
// dieses Kennzahlfilters; jede Zeile klappt ihre Angaben im selben Fenster auf. Die vollständige gefilterte Liste
// bleibt über „Alle anzeigen“ erreichbar — derselbe Deep-Link und derselbe Filter wie seit E1–E4.
//
// Quelle ist dieselbe Serverantwort wie die gefilterte Liste: GET /kunde/shipments?kpi=…&limit=5 (Backend
// lib/shipmentKpis.js — Filter, Trefferzahl `filter.total`, Zeilenkennzeichen, Kundenstand). Dieses Modul rechnet
// nichts nach: Es baut die Anfrage, prüft die Antwort fail-closed und übersetzt vorhandene Zeilenfelder in Text.
// Keine zweite Kennzahl-, Status-, Verzögerungs- oder Zeitregel; eine fehlende Angabe ergibt keine Zeile, nie einen
// geratenen Wert, und kein Wert entsteht aus der Browseruhr.
//
// Bewusst .mjs und ohne carrierMap.js (bindet SVG-Dateien ein): direkt von Node prüfbar. Den Carriernamen reicht die
// Komponente herein.
import { KPI_TEXT, BUSINESS_TIME_ZONE, isShipmentKpiKey, kpisFromServerStats } from "./kpis.mjs";
import { customerShipmentNumbers, NUMBER_LABELS } from "./businessNumbers.mjs";
import { shipmentRecipient, shipmentSender } from "./shipmentRecipientView.mjs";
import { shipmentServiceNameOf } from "./shipmentServiceNameView.mjs";
import { multiTrackingReferencesOf, TRACKING_REFERENCES_TEXT } from "./trackingReferencesView.mjs";
import { trackingStatusLabel } from "./trackingLegsView.mjs";
import { boundDropoffLocationLine, DROPOFF_LOCATION_LABEL } from "./dropoffParcelShop.mjs";
import { BOOKING_IN_REVIEW_TEXT } from "./customerBookingStatus.mjs";

/** So viele Sendungen zeigt das Fenster — die neuesten des Filters (Sortierung des Servers, created_at DESC). */
export const KPI_FENSTER_LIMIT = 5;

/** Ein in derselben geöffneten Übersicht geladener Stand gilt so lange, bevor dieselbe Karte erneut anfragt
    (Wechsel zwischen Karten, erneutes Öffnen). „Erneut versuchen“ und das Verlassen der Übersicht verwerfen ihn. */
export const KPI_FENSTER_FRISCH_MS = 30_000;

/** Bottom-Sheet statt schwebendem Fenster: schmal (Telefon) oder flach (Telefon quer, starker Zoom). In em, damit eine
    große Browserschrift wie wenig Platz zählt — dasselbe Prinzip wie bei der Ansprechpartnerkarte. */
export const KPI_FENSTER_SHEET = "(max-width: 40em), (max-height: 30em)";

/** Kopf des Fensters je Kennzahl: ein Linienicon aus dem eigenen System und der Titel. Die Erklärung darunter ist
    dieselbe Kontextzeile wie auf der Karte (SHIPMENT_KPIS.context) — eine Zeile, damit die Liste Platz behält. */
export const KPI_FENSTER = Object.freeze({
  active: Object.freeze({ icon: "package", titel: "Aktive Sendungen" }),
  in_transit: Object.freeze({ icon: "packageMove", titel: "Sendungen unterwegs" }),
  delivered_this_month: Object.freeze({ icon: "check", titel: "Zugestellt im aktuellen Monat" }),
  delayed: Object.freeze({ icon: "clockDelay", titel: "Verzögerte Sendungen" }),
});

export const KPI_FENSTER_TEXT = Object.freeze({
  schliessen: "Schließen",
  alleAnzeigen: "Alle anzeigen",
  laden: "Sendungen werden geladen …",
  fehler: "Die Sendungen konnten nicht geladen werden.",
  fehlerHinweis: "Bitte versuchen Sie es erneut.",
  erneut: "Erneut versuchen",
  nichtVerfuegbar: KPI_TEXT.unavailable,
  ohneTracking: "Für diese Sendung liegt noch keine Trackingnummer vor.",
  ohneTrackingstand: "Vom Versanddienstleister liegt noch kein Trackingstand vor.",
  ueberschritten: "überschritten",
  // Beschriftungen der aufgeklappten Angaben
  naechsterSchritt: "Nächster Schritt",
  versanddatum: "Geplantes Versanddatum",
  buchungsdatum: "Buchungsdatum",
  von: "Von",
  nach: "Nach",
  trackingstand: "Letzter Trackingstand",
  trackingstandVom: "Trackingstand vom",
  liefertermin: "Voraussichtlicher Liefertermin",
  zustellung: "Zustellung gemeldet",
});

/** „Sendung“ / „Sendungen“ — die Einheit neben der Trefferzahl. */
export const sendungWort = (n) => (n === 1 ? "Sendung" : "Sendungen");

/** Die Anfrage einer Kennzahl — nur für die vier Schlüssel der Allowlist, sonst keine. */
export function kpiFensterUrl(kpi) {
  return isShipmentKpiKey(kpi) ? `/kunde/shipments?kpi=${encodeURIComponent(kpi)}&limit=${KPI_FENSTER_LIMIT}` : null;
}

// Eine Trefferzahl des Servers: Ganzzahl ≥ 0, auch als Ziffernfolge (COUNT kann als Text ankommen). Number(null) wäre 0 —
// deshalb kein pauschales Number().
function trefferzahl(v) {
  if (typeof v === "number") return Number.isInteger(v) && v >= 0 ? v : null;
  if (typeof v === "string" && /^\d{1,9}$/.test(v.trim())) return Number(v.trim());
  return null;
}

/**
 * Die Serverantwort, fail-closed geprüft: Bestätigt sie den Filter nicht (älteres Backend ohne ?kpi=), fehlt die
 * Trefferzahl oder passen Zahl und Zeilen nicht zusammen, gibt es keine Liste und keine Zahl („nicht verfügbar“) —
 * nie eine ungefilterte Liste unter dem Titel der Kennzahl und nie eine erfundene 0.
 * @returns {{ status: "ready", total: number, shipments: object[], stats: object|null } | { status: "unavailable" }}
 */
export function kpiFensterAntwort(kpi, body) {
  const nicht = { status: "unavailable" };
  if (!isShipmentKpiKey(kpi) || !body || typeof body !== "object" || Array.isArray(body)) return nicht;
  const f = body.filter;
  if (!f || typeof f !== "object" || f.kpi !== kpi) return nicht;
  const total = trefferzahl(f.total);
  if (total === null || !Array.isArray(body.shipments)) return nicht;
  const zeilen = body.shipments.filter((s) => s && typeof s === "object" && !Array.isArray(s));
  if (zeilen.length !== body.shipments.length || zeilen.length > total || (total > 0) !== (zeilen.length > 0)) return nicht;
  const stats = body.stats && typeof body.stats === "object" && !Array.isArray(body.stats) ? body.stats : null;
  return { status: "ready", total, shipments: zeilen.slice(0, KPI_FENSTER_LIMIT), stats };
}

/** Das Aggregat derselben Antwort für die Karten — nur vollständig belegt und mit derselben Zahl wie das Fenster. */
export function kpiFensterStats(kpi, antwort) {
  if (!antwort || antwort.status !== "ready" || !antwort.stats) return null;
  const k = kpisFromServerStats(antwort.stats);
  return k && k.byKey[kpi] === antwort.total ? antwort.stats : null;
}

/** Wiederverwendbar? Nur ein bestätigter Stand und nur innerhalb von KPI_FENSTER_FRISCH_MS. */
export function kpiFensterFrisch(eintrag, jetzt = Date.now()) {
  return Boolean(eintrag) && Boolean(eintrag.antwort) && eintrag.antwort.status === "ready"
    && Number.isFinite(eintrag.zeit) && jetzt >= eintrag.zeit && jetzt - eintrag.zeit < KPI_FENSTER_FRISCH_MS;
}

/** „Die 5 neuesten von 12“ — nur, wenn es mehr Treffer gibt, als das Fenster zeigt. */
export function kpiFensterUmfang(total, gezeigt) {
  if (!Number.isInteger(total) || !Number.isInteger(gezeigt) || gezeigt <= 0 || total <= gezeigt) return null;
  return gezeigt === 1 ? `Die neueste von ${total}` : `Die ${gezeigt} neuesten von ${total}`;
}

// ── Datum und Zeit ────────────────────────────────────────────────────────────────────────────────────────────
// Zeitpunkte (created_at, delivered_at, last_tracked_at) in der Geschäftszeitzone — dieselbe wie die Monatsgrenze der
// Kennzahl „Zugestellt“, damit eine Zustellung am Monatsrand im Fenster nicht in einem anderen Monat steht als in der
// Zählung. Kalendertage (delivery_date_max, requested_shipping_date) sind Datumsspalten: nur „JJJJ-MM-TT“ wird gelesen,
// ohne Zeitzone — wie in der Sendungsliste.
const TAG = new Intl.DateTimeFormat("de-DE", { timeZone: BUSINESS_TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" });
const UHR = new Intl.DateTimeFormat("de-DE", { timeZone: BUSINESS_TIME_ZONE, hour: "2-digit", minute: "2-digit" });

// Nur ISO-Zeitpunkte des Servers: ein deutsch geschriebenes „03.11.2026“ läse der Browser sonst als 11. März.
const ISO_ZEITPUNKT = /^\d{4}-\d{2}-\d{2}T/;
function zeitpunkt(v) {
  if (!(v instanceof Date) && !(typeof v === "string" && ISO_ZEITPUNKT.test(v.trim()))) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
/** „05.11.2026“ — Tag eines Zeitpunkts in Europe/Berlin, sonst null. */
export function tagVon(v) {
  const d = zeitpunkt(v);
  return d ? TAG.format(d) : null;
}
/** „05.11.2026, 09:12 Uhr“ — Zeitpunkt in Europe/Berlin, sonst null. */
export function zeitVon(v) {
  const d = zeitpunkt(v);
  return d ? `${TAG.format(d)}, ${UHR.format(d)} Uhr` : null;
}
/** „05.11.2026“ aus einer Datumsspalte („2026-11-05“ oder „2026-11-05T00:00:00.000Z“), sonst null. */
export function kalendertag(v) {
  const m = typeof v === "string" ? v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/) : null;
  return m ? `${m[3]}.${m[2]}.${m[1]}` : null;
}

// ── Nächster Schritt einer aktiven Sendung ─────────────────────────────────────────────────────────────────────
// Allein aus dem Kundenstand des Servers (customer_status). Kein Schritt wird aus Datum, Uhr oder Carrier abgeleitet.
const NAECHSTER_SCHRITT = Object.freeze({
  booking: BOOKING_IN_REVIEW_TEXT.note,
  booked: "Übergabe an den Versanddienstleister",
  label_ready: "Paket mit dem Versandlabel übergeben",
  in_transit: "Zustellung durch den Versanddienstleister",
  exception: "Sendungsverfolgung prüfen",
});
const NAECHSTER_SCHRITT_ABGABE = Object.freeze({
  booked: "Abgabe im gewählten Paketshop",
  label_ready: "Paket mit dem Versandlabel im gewählten Paketshop abgeben",
});

/** Der nächste Schritt einer Sendung — oder null (zugestellt, storniert, unbekannter Stand). */
export function naechsterSchritt(s) {
  const stand = s && typeof s.customer_status === "string" ? s.customer_status : null;
  if (!stand || !Object.prototype.hasOwnProperty.call(NAECHSTER_SCHRITT, stand)) return null;
  if (boundDropoffLocationLine(s) && Object.prototype.hasOwnProperty.call(NAECHSTER_SCHRITT_ABGABE, stand)) {
    return NAECHSTER_SCHRITT_ABGABE[stand];
  }
  return NAECHSTER_SCHRITT[stand];
}

// ── Zeile im Fenster (zugeklappt) ──────────────────────────────────────────────────────────────────────────────
/**
 * Was eine Zeile zugeklappt zeigt: Vorgangsnummer (Auftragsbestätigung, nie eine interne oder Anbieternummer),
 * Carrier und Service (je ein Teil), dazu die Zeitangabe, die zur Kennzahl gehört.
 * @returns {{ nummer: string|null, versand: string[], zeit: { text: string, ton: string|null } | null }}
 */
export function kpiZeile(kpi, s, { carrierName = null } = {}) {
  const sendung = s && typeof s === "object" ? s : {};
  const carrier = typeof carrierName === "string" && carrierName.trim() !== "" ? carrierName.trim() : null;
  const versand = [carrier, shipmentServiceNameOf(sendung)].filter(Boolean);
  const zeit = zeitAngabe(kpi, sendung);
  return { nummer: customerShipmentNumbers(sendung).orderConfirmationNumber, versand, zeit: zeit ? { text: zeit.text, ton: zeit.ton } : null };
}

// Die Zeitangabe der Zeile und die Angabe, die sie vertritt (`key`) — aufgeklappt steht sie nicht noch einmal.
function zeitAngabe(kpi, s) {
  const termin = kalendertag(s.delivery_date_max);
  const gebucht = tagVon(s.created_at);
  if (kpi === "delivered_this_month") {
    const zugestellt = tagVon(s.delivered_at);
    return zugestellt ? { text: `Zustellung gemeldet am ${zugestellt}`, ton: null, key: "zustellung" } : null;
  }
  if (kpi === "delayed") {
    if (!termin) return null;
    return s.is_delayed === true
      ? { text: `Liefertermin ${termin} ${KPI_FENSTER_TEXT.ueberschritten}`, ton: "warnung", key: "liefertermin" }
      : { text: `Liefertermin ${termin}`, ton: null, key: "liefertermin" };
  }
  if (kpi === "in_transit" && termin) return { text: `Voraussichtlich bis ${termin}`, ton: null, key: "liefertermin" };
  return gebucht ? { text: `Gebucht am ${gebucht}`, ton: null, key: "buchungsdatum" } : null;
}

// ── Aufgeklappte Angaben ───────────────────────────────────────────────────────────────────────────────────────
/**
 * Die Angaben einer aufgeklappten Zeile — nur vorhandene, je Kennzahl in der Reihenfolge ihrer Bedeutung:
 *   Aktive Sendungen  nächster Schritt, geplantes Versanddatum, Paketshop, Buchungsdatum, Weg, Trackingnummer
 *   Unterwegs         letzter Trackingstand und sein Zeitpunkt, voraussichtlicher Liefertermin, Weg, Trackingnummer
 *   Zugestellt        gemeldete Zustellung, Weg, Trackingnummer, Buchungsdatum
 *   Verzögert         Liefertermin, letzter Trackingstand und sein Zeitpunkt, Weg, Trackingnummer, Buchungsdatum
 * Zuletzt jeweils die Referenz des Kunden. Vorgangsnummer, Carrier, Service, Kundenstand und die Zeitangabe der Kennzahl
 * stehen bereits in der Zeile und werden nicht wiederholt.
 * @returns {{ key: string, label: string, wert: string|string[], art: "text"|"nummer"|"liste"|"referenz"|"hinweis" }[]}
 */
export function kpiDetailAngaben(kpi, s) {
  const sendung = s && typeof s === "object" ? s : {};
  const angaben = [];
  const imKopf = zeitAngabe(kpi, sendung)?.key || null;
  const dazu = (key, label, wert, { art = "text" } = {}) => {
    if (key === imKopf) return;
    if (wert && (!Array.isArray(wert) || wert.length > 0)) angaben.push({ key, label, wert, art });
  };
  const T = KPI_FENSTER_TEXT;
  const nummern = customerShipmentNumbers(sendung);
  const mehrere = multiTrackingReferencesOf(sendung);
  const trackingstand = trackingStatusLabel(sendung.tracking_status);
  const standVom = zeitVon(sendung.last_tracked_at);
  const termin = kalendertag(sendung.delivery_date_max);

  const weg = () => {
    dazu("von", T.von, shipmentSender(sendung)?.wohin || null);
    dazu("nach", T.nach, shipmentRecipient(sendung)?.wohin || null);
  };
  const tracking = () => {
    if (mehrere) dazu("tracking", TRACKING_REFERENCES_TEXT.plural, mehrere, { art: "liste" });
    else if (nummern.trackingNumber) dazu("tracking", NUMBER_LABELS.tracking, nummern.trackingNumber, { art: "nummer" });
    else dazu("tracking", NUMBER_LABELS.tracking, T.ohneTracking, { art: "hinweis" });
  };
  const trackingStand = () => {
    if (!trackingstand && !standVom) { dazu("trackingstand", T.trackingstand, T.ohneTrackingstand, { art: "hinweis" }); return; }
    dazu("trackingstand", T.trackingstand, trackingstand);
    dazu("trackingstandVom", T.trackingstandVom, standVom);
  };
  const buchung = () => dazu("buchungsdatum", T.buchungsdatum, tagVon(sendung.created_at));

  if (kpi === "active") {
    dazu("schritt", T.naechsterSchritt, naechsterSchritt(sendung));
    dazu("versanddatum", T.versanddatum, kalendertag(sendung.requested_shipping_date));
    dazu("abgabe", DROPOFF_LOCATION_LABEL, boundDropoffLocationLine(sendung));
    buchung();
    weg();
    tracking();
  } else if (kpi === "in_transit") {
    trackingStand();
    dazu("liefertermin", T.liefertermin, termin);
    weg();
    tracking();
    buchung();
  } else if (kpi === "delivered_this_month") {
    dazu("zustellung", T.zustellung, tagVon(sendung.delivered_at));
    weg();
    tracking();
    buchung();
  } else if (kpi === "delayed") {
    dazu("liefertermin", T.liefertermin, termin);
    trackingStand();
    weg();
    tracking();
    buchung();
  } else {
    return [];
  }
  dazu("referenz", NUMBER_LABELS.customerReference, nummern.customerReference, { art: "referenz" });
  return angaben;
}

// ── Lage des schwebenden Fensters ──────────────────────────────────────────────────────────────────────────────
// Desktop und Tablet: ein Fenster an der Karte — bevorzugt darunter, linksbündig mit ihr; reicht der Platz rechts
// nicht, rechtsbündig; immer im sichtbaren Fenster (Abstand `rand`). Reicht der Platz darunter nicht, steht es darüber,
// wenn dort mehr Platz ist; sonst wird es niedriger und scrollt innen. Ein kleiner Pfeil zeigt auf die Mitte der Karte.
export const KPI_FENSTER_MASSE = Object.freeze({
  breite: 440,     // Wunschbreite (Betreibervorgabe 400–450 px)
  rand: 16,        // Mindestabstand zum Fensterrand
  abstand: 12,     // Luft zwischen Karte und Fenster (der Pfeil sitzt darin)
  genug: 356,      // so viel Höhe genügt auf einer Seite der Karte (Kopf, Zahl, zwei Zeilen, Fuß) — dann rückt nichts
  ideal: 420,      // reicht keine Seite, rückt die Seite einmalig, bis unter der Karte so viel frei ist (keine Mini-Sprünge)
  minHoehe: 240,   // darunter wäre die Liste nicht mehr sinnvoll lesbar
  pfeilRand: 28,   // der Pfeil bleibt so weit von den Ecken entfernt (Radius des Fensters)
});

/**
 * @param anker    Rechteck der Karte im Fenster ({ top, bottom, left, right, width })
 * @param hoehe    natürliche Höhe des Fensters (ohne Höhenbegrenzung)
 * @param viewport { breite, hoehe, oben, unten } — sichtbare Fläche; `oben`/`unten` belegen feste Leisten
 * @returns {{ top: number, left: number, breite: number, maxHoehe: number, pfeil: number, seite: "unten"|"oben" }}
 */
export function kpiFensterLage({ anker, hoehe, viewport, masse = KPI_FENSTER_MASSE }) {
  const { breite: wunsch, rand, abstand, minHoehe, pfeilRand } = masse;
  const oben0 = Math.max(0, viewport.oben || 0);
  const unten0 = Math.max(0, viewport.unten || 0);
  const breite = Math.max(0, Math.min(wunsch, viewport.breite - 2 * rand));
  let left = anker.left;
  if (left + breite > viewport.breite - rand) left = anker.right - breite;
  left = Math.min(Math.max(left, rand), Math.max(rand, viewport.breite - rand - breite));
  const mitte = anker.left + anker.width / 2;
  const pfeil = Math.min(Math.max(mitte - left, pfeilRand), Math.max(pfeilRand, breite - pfeilRand));

  const platzUnten = viewport.hoehe - unten0 - anker.bottom - abstand - rand;
  const platzOben = anker.top - oben0 - abstand - rand;
  let seite;
  if (hoehe <= platzUnten) seite = "unten";
  else if (hoehe <= platzOben) seite = "oben";
  else seite = platzUnten >= platzOben ? "unten" : "oben";
  const platz = seite === "unten" ? platzUnten : platzOben;
  const maxHoehe = Math.max(minHoehe, Math.floor(platz));
  const sichtbar = Math.min(hoehe, maxHoehe);
  // Darüber nie über den oberen Rand (bzw. unter die feste Kopfleiste) hinaus.
  const top = seite === "unten" ? anker.bottom + abstand : Math.max(oben0 + rand, anker.top - abstand - sichtbar);
  return { top: Math.round(top), left: Math.round(left), breite: Math.round(breite), maxHoehe, pfeil: Math.round(pfeil), seite };
}

/**
 * Wie weit die Seite beim Öffnen nach oben rücken muss: 0, solange darunter oder darüber `genug` Platz ist; sonst so weit,
 * dass unter der Karte `ideal` Höhe frei wird (flache oder kleine Fenster, etwa 1366 × 768 oder 1280 × 640). Die Karte
 * selbst bleibt immer sichtbar (höchstens bis an den oberen Rand bzw. unter eine feste Kopfleiste). Gemessen wird gegen
 * feste Werte, nicht gegen die aktuelle Höhe: ob die Liste schon geladen ist, ändert die Entscheidung nicht.
 */
export function kpiFensterScrollBedarf({ anker, viewport, masse = KPI_FENSTER_MASSE }) {
  const { rand, abstand, genug, ideal } = masse;
  const oben0 = Math.max(0, viewport.oben || 0);
  const unten0 = Math.max(0, viewport.unten || 0);
  const platzUnten = viewport.hoehe - unten0 - anker.bottom - abstand - rand;
  const platzOben = anker.top - oben0 - abstand - rand;
  if (platzUnten >= genug || platzOben >= genug) return 0;
  return Math.max(0, Math.round(Math.min(ideal - platzUnten, anker.top - oben0 - rand)));
}
