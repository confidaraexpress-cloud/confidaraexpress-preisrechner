/* ── Empfänger einer Sendung in Listen (Audit B.4, 2026-10-28) ─────────────────────────────────────────────
   Die Kundenliste GET /kunde/shipments trägt `recipient_address` (Firma, Name, PLZ, Ort, Land) und `to_country` —
   die Kopfsuche liest dieselben Felder (utils/kundenSuche.mjs). Sendungsliste und „Letzte Sendungen“ zeigen den
   Empfänger deshalb als eigene Angabe: wer (Firma, sonst Name) und wohin (PLZ Ort, Land).

   Nur vorhandene Felder, nichts wird ergänzt: fehlt die Angabe (ältere Sendung), liefert die Funktion `null`, und
   die Liste zeigt „—“ statt eines geratenen Werts. Reine Abbildung, kein React. */

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().replace(/\s+/g, " ") : "");

function adresseVon(s) {
  const r = s && (s.recipient_address || s.recipientAddress);
  return r && typeof r === "object" ? r : null;
}

/**
 * @returns {{ name: string, ort: string, land: string, wohin: string } | null}
 *   name — Firma, sonst Ansprechpartner; ort — „PLZ Ort“; land — ISO-Kürzel (Großbuchstaben) oder "";
 *   wohin — die zweite Zeile der Listen: „PLZ Ort, LAND“ (nur vorhandene Teile)
 */
export function shipmentRecipient(s) {
  const r = adresseVon(s);
  const name = r ? (text(r.company) || text(r.fullName) || text(r.contactName) || text(r.name)) : "";
  const plz = r ? text(r.postalCode) || text(r.zip) : "";
  const stadt = r ? text(r.city) : "";
  const land = (r && text(r.country)) || text(s && (s.to_country || s.toCountry));
  const ort = [plz, stadt].filter(Boolean).join(" ");
  if (!name && !ort) return null;
  const kuerzel = land.toUpperCase();
  return { name, ort, land: kuerzel, wohin: [ort, kuerzel].filter(Boolean).join(", ") };
}

/** Eine Zeile für schmale Flächen: „Nordhafen Technik GmbH, 1070 Wien, AT“. */
export function shipmentRecipientLine(s) {
  const e = shipmentRecipient(s);
  if (!e) return "";
  return [e.name, e.ort, e.land].filter(Boolean).join(", ");
}
