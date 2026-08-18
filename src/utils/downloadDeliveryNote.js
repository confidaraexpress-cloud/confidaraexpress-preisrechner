import { apiFetch } from "../api/client";

// ─────────────────────────────────────────────────────────────────────────────
// Lieferschein-Download.
//
// Dasselbe Muster wie downloadLabel.js: authentifizierter Abruf, strikte
// Content-Type-Prüfung, Blob → Object-URL → programmatischer Klick → revoke.
// Bewusst KEINE gemeinsame Abstraktion mit dem Label: die beiden Dokumente haben
// unterschiedliche Fehlercodes und unterschiedliche Dateinamenregeln, und ein
// gemeinsamer Helfer müsste beides über Flags auseinanderhalten.
//
// `shipmentId` ist der ConfidaraExpress-Sendungshandle (shipments.id) — derselbe
// Wert wie bei Label, Tracking und Stornoanfrage. Es gibt keinen zweiten
// Adressierungsweg für Lieferscheine.
// ─────────────────────────────────────────────────────────────────────────────

const TEXT_NETZ = "Der Lieferschein konnte nicht geladen werden. Bitte prüfen Sie Ihre Verbindung.";
const TEXT_FEHLT = "Für diese Sendung liegt kein Lieferschein vor.";
const TEXT_ALLGEMEIN = "Der Lieferschein konnte nicht geladen werden. Bitte versuchen Sie es später erneut.";

// Serverfreitext wird NUR bei 4xx und nur dann übernommen, wenn er wie eine echte
// Meldung aussieht — ein 5xx-Sammelfehler („Fehler") darf nie im Kundenbanner landen.
function meldung(status, body) {
  if (status === 404) return (body && typeof body.error === "string" && body.error.trim().split(/\s+/).length > 1)
    ? body.error : TEXT_FEHLT;
  if (status === 429) return "Zu viele Anfragen. Bitte versuchen Sie es in einigen Minuten erneut.";
  if (status >= 400 && status < 500 && body && typeof body.error === "string"
      && body.error.trim().split(/\s+/).length > 1) return body.error;
  return TEXT_ALLGEMEIN;
}

export async function downloadDeliveryNote(shipmentId, deliveryNoteNumber) {
  let r;
  try {
    r = await apiFetch(
      `/api/shipments/${encodeURIComponent(String(shipmentId ?? "").trim())}/delivery-note`,
      { auth: true }
    );
  } catch {
    throw new Error(TEXT_NETZ);
  }

  if (!r.ok) {
    let body = null;
    try { body = await r.json(); } catch { body = null; }
    const err = new Error(meldung(r.status, body));
    err.status = r.status;
    err.code = body && typeof body.code === "string" ? body.code : null;
    throw err;
  }

  // Erfolgsstatus, aber kein PDF (z. B. eine JSON-/HTML-Antwort eines Proxys):
  // niemals als Datei speichern — der Kunde bekäme sonst eine kaputte PDF.
  const contentType = String(r.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("application/pdf")) throw new Error(TEXT_ALLGEMEIN);

  const blob = await r.blob();
  if (!blob || blob.size === 0) throw new Error(TEXT_ALLGEMEIN);

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    // Bei einem Blob-Download entscheidet das download-Attribut, NICHT das
    // serverseitige Content-Disposition — der Name muss deshalb vom Aufrufer
    // mitkommen. Gleiche Bereinigung wie serverseitig.
    const base = String(deliveryNoteNumber ?? "").trim() || String(shipmentId ?? "").trim();
    a.download = `Lieferschein_${base.replace(/[^a-zA-Z0-9\-_]/g, "_")}.pdf`;
    a.click();
  } finally {
    URL.revokeObjectURL(url);
  }
}
