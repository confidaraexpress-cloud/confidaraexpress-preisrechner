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

// KPI 3 – Zugestellt: ausschließlich tracking_status === "delivered".
export function isDelivered(s) {
  return trackingStatusOf(s) === TRACKING_DELIVERED;
}

// KPI 2 – In Zustellung: ausschließlich tracking_status === "in_transit".
export function isInTransit(s) {
  return trackingStatusOf(s) === TRACKING_IN_TRANSIT;
}

// KPI 1 – Aktive Sendungen (operativer Bestand): offener Business-Status UND laut
// Tracking noch NICHT zugestellt. Die Kombination sorgt dafür, dass eine Sendung
// aus „aktiv" verschwindet, sobald der Scheduler sie als zugestellt meldet — auch
// wenn der Business-Status (z. B. „booked") noch nicht nachgezogen ist.
export function isActive(s) {
  return ACTIVE_BUSINESS_STATUSES.includes(s?.status) && !isDelivered(s);
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

// ── Aggregat für die fünf KPI-Karten der Übersicht ──
// `now` ist injizierbar (Default: aktueller Zeitpunkt) — nötig für deterministische
// Tests der Monats- und Verzögerungslogik. Rückgabeform unverändert gegenüber der
// bisherigen Implementierung, damit die Overview-Darstellung 1:1 gleich bleibt.
export function computeKpis(shipments, now = new Date()) {
  const list = Array.isArray(shipments) ? shipments : [];
  const y = now.getFullYear();
  const m = now.getMonth();
  const startThis = new Date(y, m, 1);
  const startNext = new Date(y, m + 1, 1);
  const startPrev = new Date(y, m - 1, 1);
  const DAY = 86_400_000;

  let active = 0, inTransit = 0, delivered = 0, delayed = 0, new24 = 0;
  let hasCreatedAt = false;
  let spendThis = 0, spendPrev = 0;

  for (const s of list) {
    // ── Status-KPIs (1–4) auf Basis des Tracking-Modells ──
    if (isActive(s))       active++;
    if (isInTransit(s))    inTransit++;
    if (isDelivered(s))    delivered++;
    if (isDelayed(s, now)) delayed++;

    // ── KPI 5 – Ausgaben (Monat): UNVERÄNDERT. Summe price_final der in diesem
    //    Kalendermonat angelegten Sendungen; Vormonat für das Delta. ──
    if (s?.created_at) {
      const t = new Date(s.created_at).getTime();
      if (!Number.isNaN(t)) {
        hasCreatedAt = true;
        const diff = now.getTime() - t;
        if (diff >= 0 && diff <= DAY) new24++;
        const amt = Number(s.price_final);
        if (Number.isFinite(amt) && amt > 0) {
          const d = new Date(t);
          if (d >= startThis && d < startNext) spendThis += amt;
          else if (d >= startPrev && d < startThis) spendPrev += amt;
        }
      }
    }
  }

  const deltaPct = spendPrev > 0 ? Math.round(((spendThis - spendPrev) / spendPrev) * 100) : null;
  return { active, inTransit, delivered, delayed, new24, hasCreatedAt, spendThis, spendPrev, deltaPct, hasSpend: spendThis > 0 };
}
