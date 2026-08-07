/* ── Paketshop-/Access-Point-Anzeige — reine Logik ───────────────────────────
   JUMiNGO liefert zu jedem Access Point zwei Felder, die das Frontend bisher
   nicht auswerten konnte:

     workState        — der Öffnungsstatus, den JUMiNGO SELBST bestimmt
                        (produktiv deutsch: „Geöffnet“, „schließt bald“,
                        „Geschlossen“; in den Backend-Tests zusätzlich als
                        englische Tokens „opened“/„open“/„closed“ belegt)
     hoursOfOperation — ein Array aus Objekten
                        { dayName, workingHours, lunchBreak, workingDay }

   Verbindliche Grenze dieser Datei:

     • Der Öffnungsstatus wird NIEMALS selbst berechnet. Es gibt hier keine
       Uhrzeitlogik, die „geöffnet“/„geschlossen“/„schließt bald“ herleitet,
       und insbesondere KEINE eigene 30-/60-Minuten-Regel. Einzige Quelle ist
       workState. Widersprechen sich workState und hoursOfOperation, gewinnt
       workState — die Öffnungszeiten stehen daneben, nicht darüber.
     • Die einzige Zeitverwendung überhaupt ist die Auswahl des HEUTIGEN
       Wochentags aus hoursOfOperation (Europe/Berlin, Intl.DateTimeFormat).
     • Entfernungen werden nie gerechnet. distance/distanceCode kommen von
       JUMiNGO und werden nur formatiert.
     • Normalisierung und Sortierung entfernen NIE einen Shop. Die einzige
       Stufe, die eine Liste auf eine Teilmenge kürzt, ist der explizite
       Öffnungszeitenfilter (2b) — und der wirkt nur, wenn der Kunde ihn
       selbst wählt.
     • workState ist AUSSCHLIESSLICH Darstellung (Abschnitt 1) — Text und
       Badge. Er entscheidet an KEINER Stelle, ob ein Access Point angezeigt
       wird. Ein per Messung widerlegter früherer Versuch, „Geschlossen“ als
       generelles Sichtbarkeits-Gate zu behandeln, ist bewusst nicht mehr
       Teil dieser Datei (siehe Git-Historie „accessPointEligibility“) — der
       direkte 1:1-Vergleich mit JUMiNGOs eigener Oberfläche zeigte bei „Alle
       Öffnungszeiten“ dieselbe Menge wie die Rohantwort, nicht die um
       „Geschlossen“ gekürzte.
     • Es gibt KEINEN eigenen Uhrzeitfilter. Das frühere „Nur aktuell geöffnete
       Shops“ ist entfallen; JUMiNGO kennt es nicht. Die vier Merkmale in 2b
       beschreiben eine Eigenschaft des Shops, nicht seinen Zustand gerade
       jetzt, und onlyOpen geht unverändert als false an JUMiNGO.
     • Ein Objekt landet nie roh in der Oberfläche, ein unbekannter Rohwert
       ebenso wenig. */

// ═══════════ 1 — ÖFFNUNGSSTATUS (workState) ═════════════════════════════════

export const WORK_STATE_UNKNOWN_LABEL = "Öffnungsstatus nicht verfügbar";

/** Vier Zustände — mehr kennt die Oberfläche nicht. */
export const WORK_STATE_OPEN = "open";
export const WORK_STATE_CLOSING = "closing";
export const WORK_STATE_CLOSED = "closed";
export const WORK_STATE_UNKNOWN = "unknown";

// Die belegten Schreibweisen, klein geschrieben und auf einfache Leerzeichen
// normalisiert. Links steht ausschließlich, was aus JUMiNGO-Antworten oder aus
// den Backend-Tests nachweisbar ist — nichts Geratenes.
const WORK_STATE_ALIASES = new Map([
  // deutsch (Produktivwerte)
  ["geöffnet", WORK_STATE_OPEN],
  ["geoeffnet", WORK_STATE_OPEN],
  ["offen", WORK_STATE_OPEN],
  ["schließt bald", WORK_STATE_CLOSING],
  ["schliesst bald", WORK_STATE_CLOSING],
  ["geschlossen", WORK_STATE_CLOSED],
  // englisch (in den Backend-Tests dokumentierte Tokens)
  ["opened", WORK_STATE_OPEN],
  ["open", WORK_STATE_OPEN],
  ["closing soon", WORK_STATE_CLOSING],
  ["closes soon", WORK_STATE_CLOSING],
  ["closing", WORK_STATE_CLOSING],
  ["closed", WORK_STATE_CLOSED],
]);

const WORK_STATE_LABELS = {
  [WORK_STATE_OPEN]: "Geöffnet",
  [WORK_STATE_CLOSING]: "Schließt bald",
  [WORK_STATE_CLOSED]: "Geschlossen",
  [WORK_STATE_UNKNOWN]: WORK_STATE_UNKNOWN_LABEL,
};

// Statusfarben aus dem bestehenden Designsystem (primitives.css). „Geschlossen“
// ist kein Fehler, sondern eine sachliche Information → neutral, nicht rot.
const WORK_STATE_BADGES = {
  [WORK_STATE_OPEN]: "badge badge--success",
  [WORK_STATE_CLOSING]: "badge badge--warning",
  [WORK_STATE_CLOSED]: "badge badge--neutral",
  [WORK_STATE_UNKNOWN]: "badge badge--neutral",
};

/**
 * Öffnungsstatus eines Access Points aus JUMiNGOs workState.
 *
 * Rückgabe: { key, label, badgeClass, known, raw }
 *   key        — "open" | "closing" | "closed" | "unknown"
 *   label      — der sichtbare deutsche Text (nie ein Rohwert)
 *   badgeClass — Klassen aus dem Designsystem, inkl. Punkt vor dem Text
 *   known      — false, wenn der Wert nicht zugeordnet werden konnte
 *   raw        — der getrimmte Serverwert, ausschließlich für title/Support;
 *                "" wenn nichts Brauchbares geliefert wurde
 */
export function normalizeAccessPointWorkState(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  const key = raw ? WORK_STATE_ALIASES.get(raw.toLowerCase().replace(/\s+/g, " ")) : undefined;
  const resolved = key || WORK_STATE_UNKNOWN;
  return {
    key: resolved,
    label: WORK_STATE_LABELS[resolved],
    badgeClass: WORK_STATE_BADGES[resolved],
    known: Boolean(key),
    raw,
  };
}

// ═══════════ 2 — ÖFFNUNGSZEITEN (hoursOfOperation) ══════════════════════════

const WEEKDAY_INDEX = new Map([
  ["sonntag", 0], ["so", 0], ["sunday", 0], ["sun", 0],
  ["montag", 1], ["mo", 1], ["monday", 1], ["mon", 1],
  ["dienstag", 2], ["di", 2], ["tuesday", 2], ["tue", 2], ["tues", 2],
  ["mittwoch", 3], ["mi", 3], ["wednesday", 3], ["wed", 3],
  ["donnerstag", 4], ["do", 4], ["thursday", 4], ["thu", 4], ["thur", 4], ["thurs", 4],
  ["freitag", 5], ["fr", 5], ["friday", 5], ["fri", 5],
  ["samstag", 6], ["sonnabend", 6], ["sa", 6], ["saturday", 6], ["sat", 6],
]);

// „Heute geschlossen“ darf nur stehen, wenn JUMiNGO das auch sagt — entweder
// über workingDay: false oder über einen dieser Werte in workingHours.
const CLOSED_WORDS = /^(geschlossen|geschl\.?|ruhetag|closed)$/i;

// Ein Wert ohne jede Information (leer, nur Striche/Punkte) ist keine Zeitangabe.
const EMPTY_HOURS = /^[\s\-–—.:/]*$/;

const EN_SHORT_TO_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
// en-US + weekday:"short" ist die stabilste Abfrage: das Ergebnis ist über
// alle ICU-Stände hinweg genau eines der sieben Kürzel oben.
const BERLIN_WEEKDAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Berlin",
  weekday: "short",
});

/**
 * Wochentagsindex (0 = Sonntag … 6 = Samstag) in Europe/Berlin.
 * Diese Funktion ist die EINZIGE Zeitverwendung des Moduls und dient allein
 * dazu, den richtigen Eintrag aus hoursOfOperation auszuwählen. Sie entscheidet
 * NICHT über den Öffnungsstatus.
 */
export function berlinWeekdayIndex(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) return null;
  const idx = EN_SHORT_TO_INDEX[BERLIN_WEEKDAY_FORMAT.format(d)];
  return typeof idx === "number" ? idx : null;
}

function weekdayIndexFromName(name) {
  if (typeof name !== "string") return null;
  const key = name.trim().toLowerCase().replace(/\.$/, "");
  const idx = WEEKDAY_INDEX.get(key);
  return typeof idx === "number" ? idx : null;
}

function firstNonEmptyString(obj, keys) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

// Bindestrich zwischen zwei Uhrzeiten als Halbgeviertstrich setzen (deutsche
// Typografie). Reine Darstellung — die Zeiten selbst bleiben unverändert.
const prettyRange = (s) => s.replace(/(\d)\s*-\s*(\d)/g, "$1–$2");

/**
 * Eine Zeitangabe sicher in Text verwandeln. Objekte werden NIE roh
 * durchgereicht: entweder es lässt sich eine Von-/Bis-Angabe lesen, oder es
 * gibt keinen Text.
 */
function hoursToText(value) {
  if (typeof value === "string") {
    const t = value.trim();
    return t ? prettyRange(t) : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(hoursToText).filter(Boolean);
    return parts.length ? parts.join(" · ") : null;
  }
  if (value && typeof value === "object") {
    const from = firstNonEmptyString(value, ["from", "start", "openFrom", "opensAt", "begin"]);
    const to = firstNonEmptyString(value, ["to", "end", "openTo", "closesAt", "finish"]);
    return from && to ? `${from}–${to}` : null;
  }
  return null;
}

/**
 * Ein Eintrag aus hoursOfOperation → { dayIndex, dayName, hours, lunchBreak, closed }
 * oder null, wenn der Eintrag nichts Verwertbares enthält.
 */
function normalizeHoursEntry(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const dayNameRaw = firstNonEmptyString(raw, ["dayName", "day", "weekday", "dayOfWeek"]);
  const dayIndex = weekdayIndexFromName(dayNameRaw);

  let hours = hoursToText(raw.workingHours ?? raw.hours ?? raw.openingHours ?? null);
  if (hours && EMPTY_HOURS.test(hours)) hours = null;

  const closedByFlag = raw.workingDay === false;
  const closedByWord = Boolean(hours && CLOSED_WORDS.test(hours));
  const closed = closedByFlag || closedByWord;
  if (closed) hours = null;

  let lunchBreak = hoursToText(raw.lunchBreak ?? raw.lunchbreak ?? null);
  if (lunchBreak && (EMPTY_HOURS.test(lunchBreak) || CLOSED_WORDS.test(lunchBreak))) lunchBreak = null;
  if (closed) lunchBreak = null;

  if (dayIndex == null && !closed && !hours) return null;
  return { dayIndex, dayName: dayNameRaw, hours, lunchBreak, closed };
}

/**
 * hoursOfOperation in eine sicher darstellbare Form bringen.
 *
 * Rückgabe: { entries, text }
 *   entries — normalisierte Tagesobjekte (nur aus der JUMiNGO-Objektform)
 *   text    — zusammengefasster Text der Alt-Formate (String bzw. String-Array);
 *             null, wenn es keine gibt
 */
export function normalizeOpeningHours(value) {
  const leer = { entries: [], text: null };
  if (value == null) return leer;

  if (typeof value === "string") {
    const t = value.trim();
    return { entries: [], text: t ? prettyRange(t) : null };
  }

  if (!Array.isArray(value)) {
    if (typeof value === "object") {
      const single = normalizeHoursEntry(value);
      return single ? { entries: [single], text: null } : leer;
    }
    return leer;
  }

  const entries = [];
  const texte = [];
  for (const item of value) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) texte.push(prettyRange(t));
      continue;
    }
    const entry = normalizeHoursEntry(item);
    if (entry) entries.push(entry);
  }
  return { entries, text: texte.length ? texte.join(" · ") : null };
}

export const HOURS_CLOSED_TODAY = "Heute geschlossen";

/**
 * Die Öffnungszeitenzeile für HEUTE.
 *
 * „Heute: 08:30–19:30“   — es gibt einen Eintrag für den heutigen Wochentag
 * „Heute geschlossen“    — JUMiNGO markiert den heutigen Tag als geschlossen
 * Alt-Format             — der gelieferte Text unverändert
 * null                   — kein Eintrag für heute; dann wird nichts behauptet
 *
 * Der Rückgabewert ist reine Zusatzinformation und ersetzt NIEMALS den
 * Öffnungsstatus aus workState.
 */
export function todayOpeningHoursText(value, now = new Date()) {
  const { entries, text } = normalizeOpeningHours(value);
  if (!entries.length) return text;

  const heute = berlinWeekdayIndex(now);
  const treffer = heute == null ? [] : entries.filter((e) => e.dayIndex === heute);
  if (!treffer.length) return text;

  const offen = treffer.filter((e) => !e.closed && e.hours);
  if (offen.length) {
    const teile = offen.map((e) => (e.lunchBreak ? `${e.hours} (Pause ${e.lunchBreak})` : e.hours));
    return `Heute: ${teile.join(" · ")}`;
  }
  // „Heute geschlossen“ nur, wenn JUMiNGO den Tag auch als geschlossen führt.
  // Ein Eintrag mit unlesbarer Zeitangabe ist KEIN Beleg für „geschlossen“ —
  // dann bleibt die Zeile lieber leer, als etwas Falsches zu behaupten.
  if (treffer.some((e) => e.closed)) return HOURS_CLOSED_TODAY;
  return text;
}

// ═══════════ 2b — ÖFFNUNGSZEITENFILTER (Nutzerauswahl) ═════════════════════
//
// JUMiNGOs Paketshopfinder bietet ein Dropdown mit genau vier Optionen:
// „Alle Öffnungszeiten“, „Sonntags geöffnet“, „Offen vor 7:30 Uhr“ und
// „Offen nach 21:00 Uhr“. ConfidaraExpress übernimmt genau diese vier.
//
// WARUM CLIENTSEITIG — belegt, nicht vermutet:
//   • Der offizielle JUMiNGO-Vertrag für POST /v1/carrier/access-points-search
//     (Swagger 1.0.4) kennt im Requestbody AUSSCHLIESSLICH: carrierCodes,
//     countryCode, city, postCode, street, state, radius, onlyOpen. Es gibt
//     dort KEINEN Parameter für Sonntag, für eine Uhrzeitgrenze oder für ein
//     Öffnungszeitenmerkmal.
//   • Der Mitschnitt von JUMiNGOs eigener Weboberfläche zeigt zusätzlich ein
//     Feld `filters`, das in allen aufgezeichneten Anfragen `null` ist. Es
//     gehört zum internen Web-Endpunkt (www.jumingo.com/app/…), nicht zum
//     Partnervertrag, den ConfidaraExpress benutzt — und seine Belegung für
//     die drei Sonderoptionen ist NICHT aufgezeichnet. Ein Feld zu erfinden,
//     dessen Form niemand kennt, kommt nicht in Frage.
//   • Die Antwort liefert alles Nötige bereits mit: hoursOfOperation führt für
//     JEDEN der 20 Access Points alle sieben Wochentage.
//
// Deshalb: Request unverändert (onlyOpen bleibt false), Filterung rein lokal
// über hoursOfOperation. Fällt später ein belegter Serverparameter an, ersetzt
// er diese Stufe — bis dahin wird nichts geraten.
//
// KEINE UHRZEITLOGIK: Gefiltert wird nach einer EIGENSCHAFT des Shops („öffnet
// irgendwann vor 7:30“), nicht nach dem aktuellen Zeitpunkt. Der heutige
// Wochentag spielt hier keine Rolle, und workState wird nicht angefasst.

export const OPENING_FILTER_ALL = "all";
export const OPENING_FILTER_SUNDAY = "sunday";
export const OPENING_FILTER_BEFORE_0730 = "before_0730";
export const OPENING_FILTER_AFTER_2100 = "after_2100";

/** Die vier Optionen des Dropdowns — Reihenfolge wie bei JUMiNGO. */
export const OPENING_FILTER_OPTIONS = [
  { value: OPENING_FILTER_ALL, label: "Alle Öffnungszeiten" },
  { value: OPENING_FILTER_SUNDAY, label: "Sonntags geöffnet" },
  { value: OPENING_FILTER_BEFORE_0730, label: "Offen vor 7:30 Uhr" },
  { value: OPENING_FILTER_AFTER_2100, label: "Offen nach 21:00 Uhr" },
];

const OPENING_FILTER_VALUES = new Set(OPENING_FILTER_OPTIONS.map((o) => o.value));

/** Ist der Wert eine der vier Optionen? Alles andere gilt als „Alle“. */
export function isOpeningFilter(value) {
  return OPENING_FILTER_VALUES.has(value);
}

const SUNDAY_INDEX = 0;
const MIN_0730 = 7 * 60 + 30;
const MIN_2100 = 21 * 60;

// „HH:MM“ → Minuten seit Mitternacht, sonst null. Bewusst streng: nur echte
// Uhrzeiten, keine Zahlenraterei.
function timeToMinutes(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Eine Öffnungszeit-Zeichenkette in Intervalle zerlegen.
 *
 * Real geliefert wird von JUMiNGO genau ein Bereich je Tag („09:00-18:00“) —
 * mehrere Bereiche („09:00-12:00, 14:00-18:00“) werden trotzdem unterstützt,
 * damit ein geteilter Öffnungstag nicht stillschweigend halb verloren geht.
 * Der Trenner darf Komma, Semikolon, Schrägstrich oder „·“ sein; der
 * Bindestrich zwischen zwei Zeiten auch ein Halbgeviertstrich.
 *
 * Rückgabe: [{ start, end, overnight }] in Minuten; unlesbares → [].
 */
export function parseWorkingHourRanges(value) {
  if (typeof value !== "string") return [];
  const text = value.trim();
  if (!text || CLOSED_WORDS.test(text) || EMPTY_HOURS.test(text)) return [];
  const ranges = [];
  for (const part of text.split(/[,;/·]|\s+und\s+/i)) {
    const m = /^\s*(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})\s*$/.exec(part);
    if (!m) continue;
    const start = timeToMinutes(m[1]);
    const end = timeToMinutes(m[2]);
    if (start == null || end == null) continue;
    // Endzeit ≤ Startzeit heißt: der Bereich läuft über Mitternacht.
    ranges.push({ start, end, overnight: end <= start });
  }
  return ranges;
}

// Alle auswertbaren Tageseinträge eines Access Points (offene Tage mit Zeiten).
// lunchBreak wird bewusst NICHT betrachtet: eine Mittagspause verändert weder
// den Öffnungsbeginn noch das Öffnungsende und darf die Eigenschaft eines
// Shops nicht verfälschen.
function openDayEntries(accessPoint) {
  const value = accessPoint && typeof accessPoint === "object"
    ? (accessPoint.hoursOfOperation ?? accessPoint.openingHours ?? accessPoint.hours ?? null)
    : null;
  const { entries } = normalizeOpeningHours(value);
  return entries.filter((e) => !e.closed && e.hours);
}

/** Öffnet der Shop an mindestens einem Tag zu einer Zeit VOR `grenze`? */
function opensBefore(accessPoint, grenze) {
  for (const entry of openDayEntries(accessPoint)) {
    for (const r of parseWorkingHourRanges(entry.hours)) {
      // Über Mitternacht laufende Bereiche decken den frühen Morgen ab und
      // liegen damit immer vor einer Vormittagsgrenze.
      if (r.overnight || r.start < grenze) return true;
    }
  }
  return false;
}

/** Hat der Shop an mindestens einem Tag noch NACH `grenze` geöffnet? */
function openAfter(accessPoint, grenze) {
  for (const entry of openDayEntries(accessPoint)) {
    for (const r of parseWorkingHourRanges(entry.hours)) {
      // Ein Bereich über Mitternacht reicht immer bis Mitternacht und damit
      // über jede Abendgrenze hinaus.
      if (r.overnight || r.end > grenze) return true;
    }
  }
  return false;
}

/** Ist für Sonntag ein echter Öffnungstag hinterlegt? */
export function accessPointOpensOnSunday(accessPoint) {
  return openDayEntries(accessPoint).some((e) => e.dayIndex === SUNDAY_INDEX);
}

/** Öffnet der Shop irgendwann vor 7:30 Uhr? (7:30 selbst zählt nicht.) */
export function accessPointOpensBefore0730(accessPoint) {
  return opensBefore(accessPoint, MIN_0730);
}

/** Hat der Shop irgendwann nach 21:00 Uhr offen? (21:00 selbst zählt nicht.) */
export function accessPointOpensAfter2100(accessPoint) {
  return openAfter(accessPoint, MIN_2100);
}

/**
 * Entspricht ein Access Point dem gewählten Öffnungszeitenmerkmal?
 * Unbekannte Filterwerte verhalten sich wie „Alle Öffnungszeiten“ — ein
 * kaputter Zustand darf keine Shops verschlucken.
 */
export function matchesOpeningFilter(accessPoint, filter) {
  switch (filter) {
    case OPENING_FILTER_SUNDAY:      return accessPointOpensOnSunday(accessPoint);
    case OPENING_FILTER_BEFORE_0730: return accessPointOpensBefore0730(accessPoint);
    case OPENING_FILTER_AFTER_2100:  return accessPointOpensAfter2100(accessPoint);
    default:                         return true;
  }
}

/**
 * Die Filterstufe: teilt eine bereits normalisierte und sortierte Liste in
 * passende und nicht passende Access Points.
 *
 * Bei „Alle Öffnungszeiten“ passiert nachweislich nichts (`filtered: false`) —
 * die Liste ist dann Zeichen für Zeichen dieselbe wie vorher, inklusive jedes
 * Shops mit workState „Geschlossen“.
 * Reihenfolge bleibt erhalten, nichts geht verloren:
 * `matching.length + excluded.length === total`.
 */
export function filterAccessPointsByOpening(items, filter) {
  if (!Array.isArray(items)) return { matching: [], excluded: [], total: 0, filtered: false };
  if (!isOpeningFilter(filter) || filter === OPENING_FILTER_ALL) {
    return { matching: items, excluded: [], total: items.length, filtered: false };
  }
  const matching = [];
  const excluded = [];
  for (const item of items) (matchesOpeningFilter(item, filter) ? matching : excluded).push(item);
  return { matching, excluded, total: items.length, filtered: true };
}

// ═══════════ 3 — ENTFERNUNG ═════════════════════════════════════════════════

/**
 * Entfernung robust als Zahl lesen — number direkt, numerische Strings
 * ("1.2"/"1,2") geparst, alles andere null. Es wird NICHTS berechnet.
 */
export function toDistanceNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return null;
    const n = Number(t.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Entfernung deutsch formatiert, Einheit aus JUMiNGOs distanceCode (verbatim,
 * ohne Umrechnung), sonst „km“. Immer eine Nachkommastelle: 2,570787 und
 * 2,957714 dürfen nicht beide als „3 km“ erscheinen.
 */
export function formatDistance(value, code) {
  const n = toDistanceNumber(value);
  if (n == null) return null;
  const unit = typeof code === "string" && code.trim() ? code.trim() : "km";
  return `${n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${unit}`;
}

/**
 * Stabile Sortierung nach Entfernung, aufsteigend.
 *
 * Einträge ohne verwertbare Entfernung gehen NICHT verloren: sie hängen in
 * unveränderter Reihenfolge hinten an. Gleiche Entfernungen behalten ihre
 * ursprüngliche Reihenfolge (expliziter Indexvergleich, unabhängig von der
 * Stabilitätsgarantie der Laufzeit). Es wird keine Entfernung berechnet.
 */
export function sortAccessPointsByDistance(items) {
  if (!Array.isArray(items)) return [];
  const mit = [];
  const ohne = [];
  items.forEach((item, index) => {
    const d = toDistanceNumber(item?.distance);
    (d == null ? ohne : mit).push({ item, index, d });
  });
  mit.sort((a, b) => (a.d - b.d) || (a.index - b.index));
  return [...mit.map((x) => x.item), ...ohne.map((x) => x.item)];
}

// ═══════════ 4 — ERGEBNISZAHLEN ═════════════════════════════════════════════

/**
 * „5 von 20 Paketshops“ — die Liste sagt, wie viel sie von der tatsächlich
 * gelieferten Ergebnismenge zeigt.
 *
 * Die Zahl beschreibt AUSSCHLIESSLICH die Kürzung durch den 5er-Anzeigeschnitt
 * (bzw. den aktiven Öffnungszeitenfilter, siehe openingFilterCountLabel) —
 * nie eine aus workState abgeleitete „Nutzbarkeit“. Ein direkter 1:1-Vergleich
 * mit JUMiNGOs eigener Oberfläche hat gezeigt, dass „Alle Öffnungszeiten“
 * dort dieselbe Menge zeigt wie die Rohantwort, nicht die um „Geschlossen“
 * gekürzte — ein Shop mit workState „Geschlossen“ ist ein regulärer Treffer.
 */
export function accessPointCountLabel(shown, total) {
  const g = Number.isFinite(total) ? total : 0;
  const z = Number.isFinite(shown) ? Math.min(shown, g) : 0;
  if (g === 0) return "Keine Paketshops gefunden";
  if (z < g) return `${z} von ${g} Paketshops`;
  return g === 1 ? "1 Paketshop" : `${g} Paketshops`;
}

/**
 * „3 von 7 Paketshops mit passenden Öffnungszeiten“ — der Zähler bei aktivem
 * Öffnungszeitenfilter. Bewusst ein anderer Satz als der ungefilterte: dort
 * heißt die Zahl „verfügbar“ (Nutzbarkeit), hier „passend“ (Öffnungszeiten).
 * Beides zu vermischen wäre falsch, denn es sind zwei verschiedene Ursachen.
 */
export function openingFilterCountLabel(shown, total) {
  const g = Number.isFinite(total) ? total : 0;
  const z = Number.isFinite(shown) ? Math.min(shown, g) : 0;
  if (g === 0) return "Keine Paketshops mit passenden Öffnungszeiten";
  const rumpf = g === 1 ? "Paketshop mit passenden Öffnungszeiten" : "Paketshops mit passenden Öffnungszeiten";
  return z < g ? `${z} von ${g} ${rumpf}` : `${g} ${rumpf}`;
}

/**
 * „7 weitere Paketshops haben andere Öffnungszeiten“ — die Randnotiz zum
 * Öffnungszeitenfilter. Getrennt von der Nutzbarkeitsnotiz gehalten, damit die
 * beiden Ursachen nicht in einem Satz verschwimmen.
 */
export function openingFilterExcludedLabel(count) {
  const n = Number.isFinite(count) && count > 0 ? count : 0;
  if (n === 0) return null;
  return n === 1
    ? "1 weiterer Paketshop hat andere Öffnungszeiten"
    : `${n} weitere Paketshops haben andere Öffnungszeiten`;
}

/** Leerzustand, wenn nutzbare Shops da sind, aber keiner zum Filter passt. */
export function openingFilterEmptyText(filter) {
  const option = OPENING_FILTER_OPTIONS.find((o) => o.value === filter);
  const name = option && option.value !== OPENING_FILTER_ALL ? `„${option.label}“` : "diesem Öffnungszeitenfilter";
  return `Im gewählten Umkreis entspricht kein Paketshop dem Öffnungszeitenfilter ${name}.`;
}

/** „Weitere 15 Paketshops anzeigen“ — die Zahl steht am Ziel, nicht in Klammern. */
export function moreAccessPointsLabel(remaining) {
  const n = Number.isFinite(remaining) && remaining > 0 ? remaining : 0;
  return `Weitere ${n} Paketshop${n === 1 ? "" : "s"} anzeigen`;
}
