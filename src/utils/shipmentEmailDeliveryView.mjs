/* Zusätzliche Sendungsbenachrichtigungen — reine Darstellungslogik (Adminsicht).
   =============================================================================
   Die Sendungsdetailseite des Adminportals zeigt, ob die beiden vom Kunden
   bestellten Zusatzmails (Tracking beziehungsweise Label + Tracking) tatsächlich
   hinausgegangen sind. Diese Datei beantwortet ausschließlich „wie heißt das für
   einen Menschen" — sie ruft nichts ab, entscheidet nichts und rechnet nichts.

   Die AUTORITÄT über Zustand, Wiederholbarkeit und Inhalt liegt vollständig im
   Backend (`lib/shipmentEmailDelivery.js` / `services/shipmentEmailDeliveries.js`).
   Insbesondere entscheidet die Oberfläche NIE, ob ein erneuter Versuch zulässig
   ist: sie zeigt den Knopf nur dort an, wo der Server ihn ohnehin annimmt, und
   der Server prüft die Bedingung erneut. */

/* Die vier Zustände des Backendvertrags. Ein unbekannter Wert wird NICHT geraten
   — er bekommt dieselbe Behandlung wie ein unbekannter Sendungsstatus: sichtbar
   „Unbekannt", Rohwert höchstens im title-Attribut. */
const STATUS_LABELS = {
  pending: ["badge--progress", "Wartet auf Versand"],
  sending: ["badge--progress", "Wird gesendet"],
  sent:    ["badge--success",  "Gesendet"],
  failed:  ["badge--error",    "Fehlgeschlagen"],
};

const TYPE_LABELS = {
  tracking:       "Tracking",
  label_tracking: "Label & Tracking",
  // Package C: der neutrale Hinweis nach einer Klärung „nicht gebucht".
  not_booked_notice: "Hinweis: Buchung nicht abgeschlossen",
};

/* JOB-2: Fehlercode eines Versuchs mit UNKLAREM Ausgang (Backend: ERROR_SEND_OUTCOME_UNKNOWN in
   lib/shipmentEmailDelivery.js). Der Versand hat begonnen, ob die Mail angekommen ist, steht nicht
   fest. Der Server nimmt einen solchen Versuch, solange es geht, mit demselben Idempotency-Key
   wieder auf; danach wäre ein erneuter Versuch eine neue Mail — deshalb steht der Prüfhinweis an
   der Zeile, und der Zustand heißt nicht „Fehlgeschlagen". */
export const DELIVERY_ERROR_OUTCOME_UNKNOWN = "send_outcome_unknown";
export const DELIVERY_UNCLEAR_HINT =
  "Ausgang unbekannt – vor einem erneuten Versuch prüfen, ob die Mail angekommen ist.";
export const RETRY_STARTED_TEXT = "Der Versand wurde erneut angestoßen.";
export const RETRY_UNCLEAR_TEXT =
  "Der Versand wurde angestoßen, sein Ausgang ist aber unklar. Bitte prüfen Sie, ob die Mail angekommen ist, bevor Sie es erneut versuchen.";

export function deliveryOutcomeUnclear(row) {
  return !!row && row.status === "failed" && row.error_code === DELIVERY_ERROR_OUTCOME_UNKNOWN;
}

/* [Badgeklasse, Anzeigetext, Rohwert] — dieselbe Form wie statusFallback(). */
export function deliveryStatusMeta(value, errorCode) {
  const key = typeof value === "string" ? value : "";
  if (deliveryOutcomeUnclear({ status: key, error_code: errorCode })) return ["badge--warning", "Ergebnis unklar", key];
  const hit = STATUS_LABELS[key];
  if (hit) return [hit[0], hit[1], key];
  return ["badge--neutral", "Unbekannter Status", key];
}

/* Rückmeldung nach „Erneut versuchen" aus dem `outcome` der Serverantwort. Nur der unklare
   Ausgang hat einen eigenen Text; jede andere Antwort behält die bisherige Meldung, und der
   maßgebliche Zustand steht nach dem Neuladen an der Zeile. */
export function retryOutcomeMessage(outcome) {
  if (outcome === "unclear") return { type: "error", text: RETRY_UNCLEAR_TEXT };
  return { type: "success", text: RETRY_STARTED_TEXT };
}

/* Kundenfähige Bezeichnung der Zustellart. Der technische Bezeichner erscheint
   nie im sichtbaren Text. */
export function deliveryTypeLabel(value) {
  const key = typeof value === "string" ? value : "";
  return TYPE_LABELS[key] || "Unbekannte Zustellart";
}

/* Ein erneuter Versuch ist AUSSCHLIESSLICH nach einem echten, gescheiterten
   Versandversuch sinnvoll. „pending" bedeutet, dass Trackingnummer oder Label noch
   fehlen — dort läuft der Zustellworker ohnehin von selbst weiter, und ein Knopf
   würde eine Handlung anbieten, die nichts beschleunigt. „sending" läuft gerade,
   „sent" ist fertig. Der Server setzt dieselbe Bedingung noch einmal durch. */
export function canRetryDelivery(row) {
  return !!row && row.status === "failed";
}

/* Sortiert die Zustellungen stabil: zuerst die Label-Mail (der größere Umfang),
   dann die reine Tracking-Mail; innerhalb derselben Art nach id. Ohne feste
   Reihenfolge wechselte die Kartenreihenfolge bei jedem Abruf. */
export function sortDeliveries(rows) {
  const rang = (t) => (t === "label_tracking" ? 0 : t === "tracking" ? 1 : 2);
  return (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
    const r = rang(a?.notification_type) - rang(b?.notification_type);
    return r !== 0 ? r : Number(a?.id || 0) - Number(b?.id || 0);
  });
}
