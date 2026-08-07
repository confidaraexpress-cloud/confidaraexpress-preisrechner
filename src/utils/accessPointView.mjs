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
     • Normalisierung und Sortierung entfernen NIE einen Shop. Wer aus der
       Auswahl fällt, fällt ausschließlich über die eigene, explizite
       Eligibility-Stufe (Abschnitt 3) — und nur dort.
     • Die Auswahl „nur geöffnete Shops“ trifft JUMiNGO über onlyOpen; ein
       eigener Uhrzeitfilter existiert nicht.
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

// ═══════════ 1b — NUTZBARKEIT (Eligibility) ════════════════════════════════
//
// Das ist NICHT der Öffnungsstatus, auch wenn beides aus demselben Feld liest.
//
//   Öffnungsstatus  → wie ein Shop BESCHRIFTET wird (Abschnitt 1)
//   Nutzbarkeit     → ob ein Shop überhaupt zur Auswahl ANGEBOTEN wird
//
// Belegt durch einen Mitschnitt der JUMiNGO-Oberfläche (DPD, Weiherstraße 25,
// 73207 Plochingen, 10 km, „Alle Öffnungszeiten“): Die API liefert 20 Access
// Points — 10 × „Geschlossen“, 5 × „Geöffnet“, 5 × „schließt bald“. JUMiNGOs
// eigene Liste beginnt mit DPD-Paketstation (2,571) → AYDESIGNZ (2,958) →
// K naro Supermarket (3,462) und lässt die NÄHEREN Treffer Kopier und
// Werbestudio (0,579) und Intermarkt (0,893) aus. Genau die zehn
// „Geschlossen“-Einträge fehlen; die Restliste stimmt danach exakt überein.
//
// Warum das KEINE Uhrzeitfrage ist — gemessen um ca. 16:06 Uhr:
//   Kopier und Werbestudio  10:00–17:00  → „Geschlossen“
//   Intermarkt              09:00–18:00  → „Geschlossen“
//   NKD Deutschland GmbH    09:00–18:30  → „Geschlossen“
// Alle drei lagen INNERHALB ihrer eigenen Öffnungszeiten. Eine Uhrzeitregel
// hätte sie als offen ausgewiesen. „Geschlossen“ beschreibt hier also die
// betriebliche Nutzbarkeit des Access Points, nicht den Ladenzustand — und
// deshalb darf keine eigene Zeitlogik diesen Wert überschreiben.
//
// Diese Stufe führt bewusst eine EIGENE, abgeschlossene Werteliste und ruft
// normalizeAccessPointWorkState() NICHT auf: Ein neuer Anzeige-Alias soll
// niemals als Nebenwirkung Paketshops verstecken können.
//
// CARRIER-SCOPE (bewusste, vorläufige Einschränkung): Der Mitschnitt belegt
// diese Regel ausschließlich für DPD. Für UPS, GLS und DHL Express liegt
// KEIN eigener Nachweis vor, dass „Geschlossen“/„closed“ dort dasselbe
// bedeutet — ein Access Point könnte dort echte Ladenöffnungszeiten führen,
// bei denen „Geschlossen“ zu bestimmten Tageszeiten normal und erwartbar
// ist. Die Filterung greift deshalb NUR für carrierCode === "dpd"; jeder
// andere (auch ein unbekannter) Carrier bleibt vollständig fail-open. Diese
// Grenze fällt, sobald ein eigener Mitschnitt für den jeweiligen Carrier
// vorliegt — nicht vorher.

/** Genau die belegten Werte, die einen Access Point aus der Auswahl nehmen. */
const NOT_USABLE_WORK_STATES = new Set(["geschlossen", "closed"]);

/** Carrier, für die die Regel durch einen echten Mitschnitt belegt ist. */
const ELIGIBILITY_VERIFIED_CARRIERS = new Set(["dpd"]);

export const ELIGIBILITY_USABLE = "usable";
export const ELIGIBILITY_UNKNOWN_STATE = "unknown_state";
export const ELIGIBILITY_WORK_STATE_CLOSED = "work_state_closed";
export const ELIGIBILITY_CARRIER_UNVERIFIED = "carrier_unverified";

/**
 * Ist dieser Access Point fachlich nutzbar — also überhaupt anzubieten?
 *
 * `carrierCode` MUSS derselbe Wert sein, der bereits den JUMiNGO-Request
 * bestimmt (`carrierCodes: [carrierCode]` in AccessPointFinder.jsx) — keine
 * zweite Carrier-Ermittlung, keine Namensheuristik.
 *
 * Rückgabe: { usable, reason, raw }
 *   usable — false NUR bei einem belegten „nicht nutzbar“-Wert UND einem
 *            durch Messung verifizierten Carrier (aktuell: nur DPD)
 *   reason — "usable" | "unknown_state" | "work_state_closed"
 *            | "carrier_unverified"
 *   raw    — der getrimmte Serverwert (für title/Diagnose), "" wenn keiner kam
 *
 * FAIL-OPEN ist Absicht: unbekannt, fehlend, leer oder kein String → nutzbar.
 * Ein neuer JUMiNGO-workState darf nicht dazu führen, dass ConfidaraExpress
 * still Paketshops verschwinden lässt. Dasselbe gilt jetzt für den Carrier:
 * ein noch nicht durch Daten verifizierter Carrier verliert NIE einen Shop
 * über diese Regel — „carrier_unverified“ ist ebenso ein Fail-open-Grund wie
 * „unknown_state“, nur mit anderer Ursache.
 *
 * Hier wird NICHT gelesen: hoursOfOperation, die aktuelle Uhrzeit, onlyOpen,
 * der Shopname oder die Entfernung.
 *
 * `carrierCode` wird STRIKT verglichen (exakte Zeichenkette, kein Trim, kein
 * Fallcasing): die einzige Quelle dieses Werts ist ein festverdrahtetes
 * switch/case in carrierMap.js, das ausschließlich die Literale "ups"/"dpd"/
 * "dhlexpress"/"gls" oder null liefert — nie mit abweichender Schreibweise.
 * Eine Normalisierung hier würde eine Toleranz vortäuschen, die die Quelle gar
 * nicht kennt, und liefe der Absicht zuwider, den Carrier nicht eigenständig
 * (also laxer als der Request selbst) zu interpretieren.
 */
export function accessPointEligibility(accessPoint, carrierCode) {
  const value = accessPoint && typeof accessPoint === "object" ? accessPoint.workState : accessPoint;
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return { usable: true, reason: ELIGIBILITY_UNKNOWN_STATE, raw: "" };
  if (!ELIGIBILITY_VERIFIED_CARRIERS.has(carrierCode)) {
    return { usable: true, reason: ELIGIBILITY_CARRIER_UNVERIFIED, raw };
  }
  const key = raw.toLowerCase().replace(/\s+/g, " ");
  if (NOT_USABLE_WORK_STATES.has(key)) {
    return { usable: false, reason: ELIGIBILITY_WORK_STATE_CLOSED, raw };
  }
  return { usable: true, reason: ELIGIBILITY_USABLE, raw };
}

/** Kurzform für Stellen, die nur das Ja/Nein brauchen. */
export function isUsableAccessPoint(accessPoint, carrierCode) {
  return accessPointEligibility(accessPoint, carrierCode).usable;
}

/**
 * Die explizite Auswahlstufe: teilt eine BEREITS normalisierte und sortierte
 * Liste in anzubietende und derzeit nicht verfügbare Access Points.
 *
 * `carrierCode` — dieselbe autoritative Quelle wie beim Request (siehe oben).
 *
 * Die Reihenfolge beider Teillisten bleibt exakt erhalten — hier wird weder
 * sortiert noch umgestellt. Nichts geht verloren: `usable.length +
 * unavailable.length === total`.
 */
export function splitAccessPointsByEligibility(items, carrierCode) {
  if (!Array.isArray(items)) return { usable: [], unavailable: [], total: 0 };
  const usable = [];
  const unavailable = [];
  for (const item of items) (isUsableAccessPoint(item, carrierCode) ? usable : unavailable).push(item);
  return { usable, unavailable, total: items.length };
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
 * „5 von 10 verfügbaren Paketshops“ — die Liste sagt, wie viel sie zeigt.
 *
 * Die Zahl bezieht sich auf die NUTZBARE Menge, nicht auf die Rohantwort.
 * Vorher stand hier „5 von 20 Paketshops“, obwohl zehn davon gar nicht
 * angeboten werden — das hätte eine Auswahl versprochen, die es nicht gibt.
 */
export function accessPointCountLabel(shown, total) {
  const g = Number.isFinite(total) ? total : 0;
  const z = Number.isFinite(shown) ? Math.min(shown, g) : 0;
  if (g === 0) return "Keine verfügbaren Paketshops";
  if (z < g) return `${z} von ${g} verfügbaren Paketshops`;
  return g === 1 ? "1 verfügbarer Paketshop" : `${g} verfügbare Paketshops`;
}

/**
 * „10 weitere Paketshops derzeit nicht verfügbar“ — ruhige Randnotiz, kein
 * Fehler. Ein nicht nutzbarer Paketshop ist ein Betriebszustand, kein Defekt;
 * deshalb keine Warnfarbe, keine Aktion, keine Auswahl. Bei 0 gibt es nichts
 * zu sagen → null, und die Zeile entfällt.
 */
export function unavailableAccessPointsLabel(count) {
  const n = Number.isFinite(count) && count > 0 ? count : 0;
  if (n === 0) return null;
  return n === 1
    ? "1 weiterer Paketshop derzeit nicht verfügbar"
    : `${n} weitere Paketshops derzeit nicht verfügbar`;
}

/** „Weitere 15 Paketshops anzeigen“ — die Zahl steht am Ziel, nicht in Klammern. */
export function moreAccessPointsLabel(remaining) {
  const n = Number.isFinite(remaining) && remaining > 0 ? remaining : 0;
  return `Weitere ${n} Paketshop${n === 1 ? "" : "s"} anzeigen`;
}
