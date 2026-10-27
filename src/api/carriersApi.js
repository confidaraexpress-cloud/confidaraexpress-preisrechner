// api/carriersApi.js — die aktuell angebotenen Versanddienstleister (GET /kunde/carriers, G2 2026-10-28).
//
// Rein lesend, nur für den Kundenbereich (die Übersicht). Liefert die geprüfte Liste oder `null`, wenn sie nicht
// bekannt ist (Fehler, Netz, ältere Serverfassung) — wirft nie: die Übersicht zeigt dann schlicht keine Carrierzeile.
import { apiFetch } from "./client";
import { parseCarrierPortfolio } from "../utils/carrierPortfolioView.mjs";

export async function fetchCarrierPortfolio({ signal } = {}) {
  try {
    const r = await apiFetch(`/kunde/carriers`, { auth: true, signal });
    if (!r.ok) return null;
    return parseCarrierPortfolio(await r.json().catch(() => null));
  } catch {
    return null;
  }
}
