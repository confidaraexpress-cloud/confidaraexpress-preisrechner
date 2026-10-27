/* ── Ihre Versanddienstleister (Betreiberentscheidung G2, 2026-10-27) ─────────────────────────────────────
   Die Übersicht nennt die Carrier, die ConfidaraExpress aktuell anbietet — ausschließlich aus der Antwort von
   GET /kunde/carriers (Backend: lib/carrierPortfolio.js). Keine feste Liste im Frontend, keine Laufzeiten,
   keine Dienstnamen, keine Zahl im Titel: was der Server nicht nennt, steht nicht da.

   Reine Abbildung — kein React, keine API. `null` heißt „nicht bekannt“ (Fehler, alte Antwort): dann erscheint das
   Modul nicht, statt eine Liste zu behaupten. Eine leere Liste heißt „derzeit keiner“ und zeigt ebenfalls nichts. */

export const CARRIER_PORTFOLIO_TEXT = Object.freeze({
  title: "Ihre Versanddienstleister",
  action: "Preise vergleichen",
  hint: "Welche Versanddienstleister eine Sendung übernehmen, zeigt der Preisvergleich je Strecke und Paket.",
});

// Der neutrale Rückfall des Servers („Versanddienstleister“) ist kein Carrier.
const KEIN_CARRIER = "other";

/**
 * @param {unknown} body  Antwort von GET /kunde/carriers
 * @returns {Array<{ id: string, name: string }> | null}
 */
export function parseCarrierPortfolio(body) {
  const liste = body && typeof body === "object" && Array.isArray(body.carriers) ? body.carriers : null;
  if (!liste) return null;
  const gesehen = new Set();
  const out = [];
  for (const c of liste) {
    const id = c && typeof c.id === "string" ? c.id.trim() : "";
    const name = c && typeof c.name === "string" ? c.name.trim() : "";
    if (!id || !name || id === KEIN_CARRIER || gesehen.has(id)) continue;
    gesehen.add(id);
    out.push({ id, name });
  }
  return out;
}
