// ─────────────────────────────────────────────────────────────────────────────
// Kundentexte für den Label-Download (Kunde). Reines Modul ohne Abhängigkeiten,
// damit die Zuordnung ohne DOM mit `node --test` prüfbar ist.
//
// Hintergrund (Auditbefund #3): downloadLabel übernahm `d.error` blind als
// Anzeigetext — beim Backend-Sammel-Catch (500 {error:"Fehler"}) stand dadurch
// wortwörtlich „Fehler" im Banner. Regeln jetzt:
//   · bekannte Codes → kuratierte Texte,
//   · JEDER 5xx → technischer Text, NIE der Server-Freitext,
//   · 4xx-Freitext nur als Fallback und nur, wenn er wie eine echte Meldung
//     aussieht (mindestens drei Wörter — „Fehler" fällt durchs Raster),
//   · leerer/unlesbarer Body abgedeckt.
// ─────────────────────────────────────────────────────────────────────────────

export const LABEL_TEXT_NICHT_BEREIT = "Das Versandlabel wird noch erstellt. Bitte versuchen Sie es in wenigen Augenblicken erneut.";
export const LABEL_TEXT_500 = "Das Versandlabel konnte momentan nicht geladen werden. Bitte versuchen Sie es später erneut.";
export const LABEL_TEXT_ALLGEMEIN = "Label konnte nicht heruntergeladen werden. Bitte versuchen Sie es erneut.";
export const LABEL_TEXT_NETZ = "Die Verbindung zum Server wurde unterbrochen. Bitte prüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.";

const CODE_TEXTE = {
  LABEL_NOT_READY: LABEL_TEXT_NICHT_BEREIT,
  LABEL_NOT_FOUND: "Label für diese Sendung ist noch nicht verfügbar.",
  SHIPMENT_NOT_FOUND: "Die Sendung wurde nicht gefunden. Bitte laden Sie die Seite neu.",
  LABEL_RATE_LIMITED: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  LABEL_DOWNLOAD_FAILED: LABEL_TEXT_500,
};

const STATUS_TEXTE = {
  409: LABEL_TEXT_NICHT_BEREIT,
  404: "Label für diese Sendung ist noch nicht verfügbar.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
};

const brauchbarerText = (v) =>
  typeof v === "string" && v.trim().split(/\s+/).length >= 3 ? v.trim() : null;

export function mapLabelError(status, body) {
  const code = body && typeof body.code === "string" ? body.code : null;
  if (code && CODE_TEXTE[code]) return CODE_TEXTE[code];
  if (status >= 500) return LABEL_TEXT_500;
  return brauchbarerText(body && body.error) || STATUS_TEXTE[status] || LABEL_TEXT_ALLGEMEIN;
}
