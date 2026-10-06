// ── Rollenabhängiges Ziel nach Login, Index und unbekannter Adresse ──────────
//
// Ein Vertriebspartner (Rolle `sales_partner`) hat genau EINEN Bereich: das
// Partnerportal unter /partner. Jede Kundenroute (/dashboard, /calculator,
// /booking, /inventory/…) würde Kundenendpunkte (/kunde/*) aufrufen — und der
// Server antwortet einem Partner dort mit 403. Das zentrale apiFetch wertet
// JEDE 401/403 eines angemeldeten Requests als ungültige Sitzung und meldet ab.
// Ein Partner darf deshalb nie eine Kundenroute rendern; die Weiche sitzt in
// den Schutzrouten und in der Navigation, und sie liest ihre Entscheidung
// ausschließlich hier.
//
// Strikter Vergleich auf den Rollenwert — nie truthy, nie ein Teilstring. Eine
// unbekannte oder fehlende Rolle bleibt beim bisherigen Ziel /dashboard: das
// ist das unveränderte Verhalten für Kunden und Admins.
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

export const SALES_PARTNER_ROLE = "sales_partner";
export const PARTNER_HOME = "/partner";
export const CUSTOMER_HOME = "/dashboard";

/** Ist dieses (aus /kundenbereich geformte) Benutzerobjekt ein Vertriebspartner? */
export function isSalesPartner(user) {
  return !!user && typeof user === "object" && user.role === SALES_PARTNER_ROLE;
}

/** Startziel eines angemeldeten Kontos: Partnerportal oder Kundenbereich. */
export function landingPathFor(user) {
  return isSalesPartner(user) ? PARTNER_HOME : CUSTOMER_HOME;
}
