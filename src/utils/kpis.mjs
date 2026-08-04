// ─────────────────────────────────────────────────────────────────────────────
// Dashboard-KPI-Berechnung — reine, testbare Logik (keine React-/UI-Abhängigkeit)
// ─────────────────────────────────────────────────────────────────────────────
// Basiert auf dem Tracking-Modell, das das Backend (Phase 1/2) zusätzlich über
// den bestehenden /kunde/shipments-Endpunkt liefert:
//   tracking_status · tracking_status_text · last_tracked_at · delivered_at ·
//   delivery_date_max
// Der Tracking-Scheduler befüllt diese Felder serverseitig. Hier passiert
// AUSSCHLIESSLICH Frontend-Aggregation — keine Backend-/API-/Businesslogik.
//
// Bewusst als .mjs: dieses Modul muss ohne die Vite-Pipeline direkt von Node
// (node --test) importierbar sein. `.mjs` erzwingt ESM-Semantik unabhängig vom
// (hier fehlenden) package.json "type"; Vite löst `.mjs` extensionslos zuerst auf.

// ── Business-Status: „offener"/operativer Bestand (Backend-Vertrag) ──
// Kennzeichnet eine Sendung, die gebucht bzw. in Bearbeitung ist. Endzustände
// wie „delivered"/„cancelled"/„blocked"/„draft" sind bewusst NICHT enthalten.
export const ACTIVE_BUSINESS_STATUSES = [
  "approved", "active", "pending", "booked", "label_ready", "in_transit",
];

// ── Stornierung: eine akzeptierte Anfrage beendet den operativen Bestand ──
// `cancellation_status` stammt aus shipment_cancellation_requests und wird vom
// Backend zusammen mit der Sendung ausgeliefert. Nur der Endzustand `accepted`
// zählt: `pending`/`in_review` sind laufende Anfragen (die Sendung ist weiterhin
// unterwegs), `rejected` bedeutet ausdrücklich „bleibt bestehen".
//
// Warum das hier zusätzlich zum Business-Status geprüft wird: der Betreiber
// storniert bei JUMiNGO direkt, `shipments.status` wird dabei nicht zurück-
// geschrieben. Ohne diese Prüfung bliebe eine akzeptiert stornierte Sendung
// dauerhaft unter „Aktive Sendungen" stehen.
const CANCELLED_BUSINESS_STATUSES = ["cancelled", "canceled"];

// NULL-sicher normalisieren (getrimmt + klein) — dasselbe Muster wie beim
// Trackingstatus, damit " Accepted " nicht durchrutscht.
function normalizedLower(value) {
  return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : null;
}

export function isCancelled(s) {
  if (normalizedLower(s?.cancellation_status) === "accepted") return true;
  return CANCELLED_BUSINESS_STATUSES.includes(normalizedLower(s?.status));
}

// ── Tracking-Status (Backend-Vertrag, Phase 1/2) ──
// Einzige Quelle der Wahrheit für „unterwegs"/„zugestellt". Der Business-Status
// zieht ggf. verzögert nach; der Trackingstatus ist maßgeblich.
export const TRACKING_IN_TRANSIT = "in_transit";
export const TRACKING_DELIVERED  = "delivered";

// NULL-sicher: normalisierter (getrimmt + klein) Trackingstatus oder null, falls
// das Feld fehlt/kein String/leer ist. Verhindert Abstürze bei tracking_status = NULL.
export function trackingStatusOf(s) {
  const v = s?.tracking_status;
  return typeof v === "string" && v.trim() ? v.trim().toLowerCase() : null;
}

// Zustellzustand laut Tracking. Wird für „Aktive Sendungen" und „Verzögert"
// gebraucht (eine zugestellte Sendung ist weder aktiv noch verspätet) — NICHT
// mehr für die Karte „Zugestellt": die zählt ausschließlich den aktuellen Monat
// und stützt sich dafür auf das serverseitige Kennzeichen (siehe unten).
export function isDelivered(s) {
  return trackingStatusOf(s) === TRACKING_DELIVERED;
}

// KPI 3 – Zugestellt: ausschließlich das SERVERSEITIGE Monatskennzeichen.
//
// Die Monatsgrenze gehört an genau eine Stelle — den Server (Backend:
// lib/calendarDate.js · businessMonthFlagSql). Er kennt die Geschäftszeitzone
// Europe/Berlin und bestimmt Monatsanfang/-ende als echte UTC-Momente. Der
// Browser kennt nur die Zeitzone des Nutzers; jede clientseitige Ableitung wäre
// je nach Standort und Sommerzeit um Stunden bis einen Tag daneben.
//
// Deshalb bewusst KEIN Fallback: weder auf tracking_status noch auf
// delivered_at, created_at, updated_at oder Browser-Monatsgrenzen. Fehlt das
// Feld (älteres Backend), zählt die Sendung NICHT — ein sichtbar zu niedriger
// Wert ist ehrlicher als eine falsch geratene Zahl. Genau `true` zählt; alles
// andere (false/null/undefined) nicht.
export function isDeliveredThisMonth(s) {
  return s?.delivered_this_month === true;
}

// KPI 2 – In Zustellung: ausschließlich tracking_status === "in_transit".
export function isInTransit(s) {
  return trackingStatusOf(s) === TRACKING_IN_TRANSIT;
}

// KPI 1 – Aktive Sendungen (operativer Bestand): offener Business-Status, laut
// Tracking noch NICHT zugestellt UND nicht storniert. Die Kombination sorgt
// dafür, dass eine Sendung aus „aktiv" verschwindet, sobald der Scheduler sie
// als zugestellt meldet — auch wenn der Business-Status (z. B. „booked") noch
// nicht nachgezogen ist — und ebenso, sobald eine Stornierung akzeptiert wurde.
// Kein Monatsfilter: eine Sendung aus dem Vormonat bleibt sichtbar, solange sie
// operativ läuft.
export function isActive(s) {
  return ACTIVE_BUSINESS_STATUSES.includes(s?.status) && !isDelivered(s) && !isCancelled(s);
}

// Kalenderdatum als vergleichbare Ganzzahl YYYYMMDD aus der führenden
// Datumskomponente von "YYYY-MM-DD" bzw. ISO-Datetime "YYYY-MM-DDTHH:…".
// Bewusst kein Date-Parsing / keine Zeitzonen-Umrechnung (Datum-genau, konsistent
// mit isoDayDE in formatters). null → unparsbar/leer.
function dateInt(v) {
  if (typeof v !== "string") return null;
  const m = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? Number(m[1] + m[2] + m[3]) : null;
}

// Heutiges Kalenderdatum (lokal) als YYYYMMDD.
function todayInt(now) {
  const y  = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const d  = String(now.getDate()).padStart(2, "0");
  return Number(`${y}${mo}${d}`);
}

// KPI 4 – Verzögert (Phase 3, erstmals produktiv). Eine Sendung ist verzögert,
// wenn ALLE drei Bedingungen gelten:
//   1. tracking_status !== "delivered"  (noch nicht zugestellt)
//   2. delivery_date_max existiert       (eine ETA ist bekannt)
//   3. heutiges Datum > delivery_date_max (ETA-Tag liegt in der Vergangenheit)
// Reiner ETA-gegen-heute-Vergleich auf Tagesbasis: keine Carrier-Freitexte, keine
// Exception-Status. Fehlt die ETA oder ist die Sendung zugestellt → nie verzögert.
// ETA = heute oder in der Zukunft → nicht verzögert (erst der Folgetag zählt).
export function isDelayed(s, now) {
  if (isDelivered(s)) return false;
  const eta = dateInt(s?.delivery_date_max);
  if (eta == null) return false;
  return todayInt(now) > eta;
}

// ── Fachlicher Monat als Vergleichsschlüssel („YYYY-MM" in Europe/Berlin) ──
//
// WICHTIG, damit hier keine zweite Wahrheit entsteht: dieser Schlüssel entscheidet
// AUSSCHLIESSLICH, WANN erneut beim Server angefragt wird — niemals, WAS als
// zugestellt zählt. Die Zählgrenze liegt allein im Backend
// (lib/calendarDate.js · businessMonthFlagSql). Läge der Schlüssel um eine Stunde
// daneben, wäre die Folge lediglich ein etwas zu früher oder später Refetch, nie
// eine falsche Zahl.
//
// Die Geschäftszeitzone ist dieselbe wie im Backend. Intl ist im Browser und in
// Node vorhanden — keine neue Abhängigkeit.
export const BUSINESS_TIME_ZONE = "Europe/Berlin";

export function businessMonthKey(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE, year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const get = (t) => (parts.find((p) => p.type === t) || {}).value;
  const y = get("year"), m = get("month");
  return y && m ? `${y}-${m}` : null;
}

// ── Aggregat für die vier KPI-Karten der Übersicht ──
// `now` ist injizierbar (Default: aktueller Zeitpunkt) — nötig für deterministische
// Tests der Verzögerungslogik.
//
// Nur „Zugestellt" ist monatsbezogen, und diese Grenze zieht ausschließlich der
// Server. Die übrigen drei KPI sind reine Momentaufnahmen ohne Zeitraum: eine
// Sendung aus dem Vormonat bleibt gezählt, solange sie aktiv, unterwegs oder
// verspätet ist. Am Monatswechsel wird deshalb nichts künstlich genullt.
export function computeKpis(shipments, now = new Date()) {
  const list = Array.isArray(shipments) ? shipments : [];
  const DAY = 86_400_000;

  let active = 0, inTransit = 0, delivered = 0, delayed = 0, new24 = 0;
  let hasCreatedAt = false;

  for (const s of list) {
    if (isActive(s))            active++;
    if (isInTransit(s))         inTransit++;
    if (isDeliveredThisMonth(s)) delivered++;
    if (isDelayed(s, now))      delayed++;

    // `new24` speist die Fußzeile der Karte „Aktive Sendungen" („+n neu · 24 h").
    // Bewusst erhalten geblieben — es hat mit der entfernten Ausgabenkarte nichts
    // zu tun und ist keine Geldgröße.
    if (s?.created_at) {
      const t = new Date(s.created_at).getTime();
      if (!Number.isNaN(t)) {
        hasCreatedAt = true;
        const diff = now.getTime() - t;
        if (diff >= 0 && diff <= DAY) new24++;
      }
    }
  }

  return { active, inTransit, delivered, delayed, new24, hasCreatedAt };
}
