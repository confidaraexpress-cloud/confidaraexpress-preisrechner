/* ── Empfänger einer Sendung in Listen (Audit B.4, 2026-10-27) ─────────────────────────────────────────────
   Die Kundenliste GET /kunde/shipments trägt `recipient_address` (Firma, Name, PLZ, Ort, Land) und `to_country` —
   die Kopfsuche liest dieselben Felder (utils/kundenSuche.mjs). Sendungsliste und „Letzte Sendungen“ zeigen den
   Empfänger deshalb als eigene Angabe: wer (Firma, sonst Name) und wohin (PLZ Ort, Land). Das Kennzahl-Detailfenster
   (2026-11-07) liest Absender- und Empfängerort über dieselbe Form (`shipmentSender`).

   Nur vorhandene Felder, nichts wird ergänzt: fehlt die Angabe (ältere Sendung), liefert die Funktion `null`, und
   die Liste zeigt „—“ statt eines geratenen Werts. Reine Abbildung, kein React. */

const text = (v) => (typeof v === "string" && v.trim() !== "" ? v.trim().replace(/\s+/g, " ") : "");

function adresseVon(s, feld, feldCamel) {
  const r = s && (s[feld] || s[feldCamel]);
  return r && typeof r === "object" ? r : null;
}

// Eine Partei der Sendung aus ihrer gespeicherten Adresse — dieselbe Form für Empfänger und Absender.
function partei(r, landErsatz) {
  const name = r ? (text(r.company) || text(r.fullName) || text(r.contactName) || text(r.name)) : "";
  const plz = r ? text(r.postalCode) || text(r.zip) : "";
  const stadt = r ? text(r.city) : "";
  const land = (r && text(r.country)) || text(landErsatz);
  const ort = [plz, stadt].filter(Boolean).join(" ");
  if (!name && !ort) return null;
  const kuerzel = land.toUpperCase();
  return { name, ort, land: kuerzel, wohin: [ort, kuerzel].filter(Boolean).join(", ") };
}

/**
 * @returns {{ name: string, ort: string, land: string, wohin: string } | null}
 *   name — Firma, sonst Ansprechpartner; ort — „PLZ Ort“; land — ISO-Kürzel (Großbuchstaben) oder "";
 *   wohin — die zweite Zeile der Listen: „PLZ Ort, LAND“ (nur vorhandene Teile)
 */
export function shipmentRecipient(s) {
  return partei(adresseVon(s, "recipient_address", "recipientAddress"), s && (s.to_country || s.toCountry));
}

/** Der Absender in derselben Form — aus `sender_address` und `from_country` (Kennzahl-Detailfenster, 2026-11-07). */
export function shipmentSender(s) {
  return partei(adresseVon(s, "sender_address", "senderAddress"), s && (s.from_country || s.fromCountry));
}

/** Eine Zeile für schmale Flächen: „Nordhafen Technik GmbH, 1070 Wien, AT“. */
export function shipmentRecipientLine(s) {
  const e = shipmentRecipient(s);
  if (!e) return "";
  return [e.name, e.ort, e.land].filter(Boolean).join(", ");
}
