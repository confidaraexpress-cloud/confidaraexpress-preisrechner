// ─────────────────────────────────────────────────────────────────────────────
// Proforma-Rechnung auf dem Buchungs-Erfolgsscreen — reine Auswertung.
//
// Kein React, kein fetch, kein Zustand: dieses Modul beantwortet ausschließlich
// „was sagt die Dokument-Metadaten-Antwort über die Proforma dieser Sendung, und
// was darf die Oberfläche daraufhin zeigen".
//
// ─── Die tragende Regel: es wird NICHTS geraten ──────────────────────────────
// Ob es zu einer Sendung eine Proforma-Rechnung gibt, entscheidet AUSSCHLIESSLICH
// die Dokument-Metadaten-API (GET /api/shipments/:id/documents). Das Frontend
// leitet die Antwort NIE ab aus Zielland, Zollpflicht, `customsInvoiceMode`,
// `exportReason`, Tarif oder Provider. Fachlich liegt die Entscheidung
// PROFORMA ↔ COMMERCIAL serverseitig im persistierten Zollsnapshot; ein zweiter,
// clientseitiger Ableitungsweg wäre eine zweite Wahrheit, die zwangsläufig
// irgendwann von der ersten abweicht — und der Kunde bekäme einen Downloadknopf
// für ein Dokument, das es nicht gibt (oder keinen für eines, das es gibt).
//
// ─── Und: ein Fehler hier ist NIE ein Buchungsfehler ─────────────────────────
// Eine erfolgreiche Buchung ist bereits erfolgreich. Deshalb gibt es hier keinen
// Zustand „Fehler", der den Erfolgsscreen umfärben könnte: eine unlesbare,
// leere oder ausgefallene Antwort ergibt `absent` — also exakt die Oberfläche,
// die es vor diesem Paket gab.
// ─────────────────────────────────────────────────────────────────────────────

// Fachlicher Dokumenttyp aus dem Serververtrag (P5A). Bewusst als Konstante:
// ein Tippfehler in einem String-Vergleich wäre sonst ein stiller Totalausfall.
import {
  isSafeApiPath, DOCUMENT_POLL_INTERVAL_MS, DOCUMENT_POLL_BUDGET_MS, nextDocumentPollDelay,
} from "./shipmentDocumentsView.mjs";

export const PROFORMA_TYPE = "PROFORMA";

// Was die Oberfläche anzeigt. Absichtlich NICHT die Serverzustände selbst —
// `absent` ist ein reiner Anzeigefall (es gibt keine Proformazeile) und hat im
// Serververtrag kein Gegenstück.
export const PROFORMA_VIEW = {
  ABSENT: "absent",
  READY: "ready",
  PROCESSING: "processing",
  FAILED: "failed",
};

// Die drei Kundenzustände des Servers (P5A). Interne Werte aus
// `proforma_invoices.document_status` erreichen den Client nie.
const SERVER_READY = "ready";
const SERVER_FAILED = "failed";

// Pfad-Guard: EINE Regel für alle Sendungsdokumente, definiert in
// shipmentDocumentsView.mjs und hier unverändert weitergereicht (der
// Erfolgsbildschirm importiert sie seit P5B unter diesem Namen). Sie ist keine
// Formsache: `apiFetch` reicht eine absolute URL unverändert durch UND hängt den
// Bearer-Token an — ein Pfad auf einen fremden Host würde das Kundentoken
// dorthin senden.
export { isSafeApiPath };

/**
 * Die Proforma-Zeile aus der Dokumentliste — oder `null`.
 *
 * Defensiv gegen jede Antwortform: fehlender Body, fehlendes Array, fremde
 * Einträge. Es wird nichts ergänzt und nichts umgedeutet.
 */
export function findProformaEntry(body) {
  if (!body || !Array.isArray(body.documents)) return null;
  const treffer = body.documents.find((d) => d && d.type === PROFORMA_TYPE);
  return treffer || null;
}

/**
 * Anzeigezustand einer Proforma-Zeile.
 *
 * `ready` verlangt ZWEI Dinge: der Server meldet `ready` UND er liefert einen
 * benutzbaren Pfad. Ein „ready" ohne Pfad ist kein Fehler des Kunden und nichts,
 * was gescheitert wäre — es ist schlicht nichts, worauf man klicken kann.
 * Deshalb `processing` und nicht `failed`: die Oberfläche behauptet damit weder
 * einen Download, den es nicht gibt, noch einen Fehler, den es nicht gab.
 * Alles Unbekannte gilt ebenfalls als `processing` — nie als ladbar.
 */
export function proformaViewState(entry) {
  if (!entry) return PROFORMA_VIEW.ABSENT;
  if (entry.status === SERVER_FAILED) return PROFORMA_VIEW.FAILED;
  if (entry.status === SERVER_READY && isSafeApiPath(entry.downloadPath)) return PROFORMA_VIEW.READY;
  return PROFORMA_VIEW.PROCESSING;
}

/** Der servergelieferte Downloadpfad — nur im Zustand `ready`, sonst `null`. */
export function proformaDownloadPath(entry) {
  return proformaViewState(entry) === PROFORMA_VIEW.READY ? entry.downloadPath.trim() : null;
}

// ─── Gedeckeltes Nachladen ───────────────────────────────────────────────────
// Das PDF entsteht serverseitig NACH dem Commit der Buchung (P4), also in aller
// Regel wenige Sekunden nach dem Erscheinen dieses Bildschirms. Deshalb: erster
// Abruf sofort, danach ein kurzer fester Takt und eine harte Obergrenze.
//
// Kein Endlospolling, kein Hintergrundworker, kein Backoff über Minuten (das
// Muster der Rechnungszustellung nebenan wartet auf einen Mailversand und darf
// deshalb länger laufen). Läuft das Budget ab, während der Beleg noch entsteht,
// bleibt der ruhige „wird erstellt"-Hinweis stehen — die Oberfläche behauptet
// nichts Falsches, sie hört nur auf zu fragen.
// Werte und Namen des P5B-Vertrags bleiben; die Kadenz selbst steht einmal in
// shipmentDocumentsView.mjs und gilt dort für jedes Sendungsdokument. Zwei
// getrennte Fassungen desselben Taktes wären zwei Regeln mit demselben Inhalt.
export const PROFORMA_POLL_INTERVAL_MS = DOCUMENT_POLL_INTERVAL_MS;
export const PROFORMA_POLL_BUDGET_MS = DOCUMENT_POLL_BUDGET_MS;

/**
 * Wartezeit vor dem nächsten Abruf — oder `null`, wenn das Budget erschöpft ist.
 * `attempt` ist die Zahl der bereits ERFOLGTEN Nachladeversuche (der sofortige
 * erste Abruf zählt nicht mit).
 */
export const nextProformaPollDelay = nextDocumentPollDelay;

/** Weiter nachladen? Nur, solange der Beleg tatsächlich noch entsteht. */
export function proformaKeepPolling(state) {
  return state === PROFORMA_VIEW.PROCESSING;
}

// ─── Sichtbare Texte ─────────────────────────────────────────────────────────
// Alles, was der Kunde liest, steht hier — nicht im JSX. Kein Fehlercode, kein
// Codepunkt, kein Stacktrace, kein Providername, kein Tarif, keine interne ID.
//
// `failed` sagt ausdrücklich, dass die Buchung davon nicht betroffen ist: ohne
// diesen Satz liest sich eine Meldung neben „Sendung erfolgreich gebucht!" wie
// ein Zweifel an der Buchung selbst. Es gibt bewusst KEINEN Wiederholen-Knopf —
// ein erneuter Versuch des Kunden ändert am serverseitigen Zustand nichts.
export const PROFORMA_TEXT = {
  download: "Proforma-Rechnung herunterladen",
  loading: "Proforma-Rechnung wird geladen…",
  processing: "Proforma-Rechnung wird erstellt …",
  failed: "Die Proforma-Rechnung ist derzeit nicht verfügbar. Ihre Buchung ist davon nicht betroffen.",
};

// ─── Texte des Downloadversuchs ──────────────────────────────────────────────
// Reines Modul, damit die Zuordnung ohne DOM mit `node --test` prüfbar ist —
// dieselbe Aufteilung wie labelErrors.mjs neben downloadLabel.js.
//
// Kuratierte Texte NACH FEHLERCODE, der Serverfreitext wird bewusst NICHT
// angezeigt. Das weicht von den drei Nachbarhelfern ab, und zwar absichtlich:
// auf diesem Bildschirm soll nichts stehen, was nach technischem Innenleben
// klingt. Der Rendererfehler des Belegs trägt serverseitig sogar Codepunkte im
// Fehlercode — der bleibt intern. (Auditbefund #3 des Labeldownloads zeigt,
// wohin ein blind übernommenes `d.error` führt: dort stand wortwörtlich
// „Fehler" im Kundenbanner.)
export const PROFORMA_DOWNLOAD_TEXT = {
  netz: "Die Proforma-Rechnung konnte nicht geladen werden. Bitte prüfen Sie Ihre Verbindung.",
  fehlt: "Für diese Sendung liegt keine Proforma-Rechnung vor.",
  nochNicht: "Die Proforma-Rechnung wird noch erstellt. Bitte versuchen Sie es in Kürze erneut.",
  zuViele: "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.",
  allgemein: "Die Proforma-Rechnung konnte nicht geladen werden. Bitte versuchen Sie es später erneut.",
};

export function proformaDownloadMessage(status, code) {
  if (code === "PROFORMA_NOT_FOUND") return PROFORMA_DOWNLOAD_TEXT.fehlt;
  if (code === "PROFORMA_NOT_READY") return PROFORMA_DOWNLOAD_TEXT.nochNicht;
  // Ein gescheiterter Beleg sagt hier dasselbe wie auf dem Bildschirm — samt der
  // Zusicherung, dass die Buchung davon nicht betroffen ist.
  if (code === "PROFORMA_FAILED") return PROFORMA_TEXT.failed;
  if (status === 404) return PROFORMA_DOWNLOAD_TEXT.fehlt;
  if (status === 409) return PROFORMA_DOWNLOAD_TEXT.nochNicht;
  if (status === 429) return PROFORMA_DOWNLOAD_TEXT.zuViele;
  return PROFORMA_DOWNLOAD_TEXT.allgemein;
}

/** Beschriftung des Downloadknopfes — mit der servergelieferten Nummer, wenn es eine gibt. */
export function proformaDownloadLabel(entry) {
  const nummer = entry && typeof entry.number === "string" ? entry.number.trim() : "";
  return nummer ? `Proforma-Rechnung ${nummer} herunterladen` : PROFORMA_TEXT.download;
}
