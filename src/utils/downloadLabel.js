import { apiFetch } from "../api/client";
import { mapLabelError, LABEL_TEXT_500, LABEL_TEXT_NETZ } from "./labelErrors.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Kundenlabel-Download.
//
// Der frühere Ablauf übernahm `d.error` BLIND als Anzeigetext — beim
// Backend-Sammel-Catch (500 {error:"Fehler"}) stand dadurch wortwörtlich
// „Fehler" im Kundenbanner (Auditbefund #3). Jetzt gilt:
//   · Codes steuern die Auswahl kuratierter Texte (LABEL_NOT_READY, …),
//   · ein Server-Freitext wird NUR noch bei 4xx als Fallback angezeigt und nur,
//     wenn er wie eine echte Meldung aussieht (mehr als ein Wort),
//   · JEDER 5xx läuft über den technischen Text — nie über den Rohtext,
//   · leerer/unlesbarer Body und HTML-Antworten sind abgedeckt,
//   · eine JSON-„Erfolgs"-Antwort wird nie als PDF-Datei gespeichert.
// ─────────────────────────────────────────────────────────────────────────────

// `id` ist der ConfidaraExpress-Sendungshandle (shipments.id) — dieselbe ID wie
// bei Tracking und Stornoanfrage. Die Providerreferenz löst das Backend intern
// auf; sie steht dadurch weder im Pfad noch im Dateinamen der PDF.
// `filenameHint` ist optional die kundensichtbare Bestellnummer: bei einem
// Blob-Download entscheidet das `download`-Attribut, NICHT das serverseitige
// Content-Disposition. Ohne Hinweis bleibt der Handle als Dateiname.
export async function downloadLabel(id, filenameHint) {
  let r;
  try {
    r = await apiFetch(`/api/shipments/${encodeURIComponent(String(id ?? "").trim())}/label`, { auth: true });
  } catch {
    throw new Error(LABEL_TEXT_NETZ);
  }

  if (!r.ok) {
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    const err = new Error(mapLabelError(r.status, body));
    err.status = r.status;
    err.code = body && typeof body.code === "string" ? body.code : null;
    throw err;
  }

  // Erfolgsstatus, aber KEIN PDF (z. B. eine JSON-/HTML-Antwort eines Proxys):
  // niemals als Datei speichern — der Kunde bekäme sonst eine kaputte PDF.
  const contentType = String(r.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/pdf")) {
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    const err = new Error(mapLabelError(500, body));
    err.status = r.status;
    throw err;
  }

  const blob = await r.blob();
  if (!blob || blob.size === 0) {
    throw new Error(LABEL_TEXT_500);
  }

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    // Gleiche Bereinigung wie serverseitig — nie ein roher Wert im Dateinamen.
    const base = String(filenameHint ?? "").trim() || String(id ?? "").trim();
    a.download = `label-${base.replace(/[^a-zA-Z0-9\-_]/g, "_")}.pdf`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
