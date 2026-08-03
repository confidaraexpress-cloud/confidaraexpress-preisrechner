import { apiFetch } from "./client";
import { buildSupportRequestBody } from "../utils/supportRequest.mjs";

// ── Supportanfrage (Kunde) ───────────────────────────────────────────────────
// POST /kunde/support-requests — legt eine allgemeine Supportanfrage an. KEINE
// Sendungs-, Rechnungs- oder Zahlungswirkung: die Anfrage ist rein kommunikativ und
// wird per E-Mail beantwortet (kein Nachrichtenverlauf in der App).
//
// Pfadbasis wie die übrigen Kundenendpunkte des Bereichs (/kunde/..., ohne /api) —
// dieselbe Konvention wie /kunde/shipments und die Stornierungsanfrage. Der Body
// enthält ausschließlich category/subject/message (zentral über
// buildSupportRequestBody, einzige Quelle der Wahrheit) — keine user_id, kein Status,
// keine Ticketnummer. Auth und das 401/403-Handling laufen zentral über apiFetch.
//
// Gibt die rohe Response zurück; der Aufrufer wertet Status/JSON selbst aus
// (konsistent mit den übrigen Callern) — u. a. 400 Validierung, 429 Rate-Limit.
// Kein Cache, kein Logging von Eingaben oder Antwortdaten.
export function createSupportRequest({ category, subject, message }) {
  return apiFetch(`/kunde/support-requests`, {
    method: "POST",
    auth: true,
    body: JSON.stringify(buildSupportRequestBody({ category, subject, message })),
  });
}
