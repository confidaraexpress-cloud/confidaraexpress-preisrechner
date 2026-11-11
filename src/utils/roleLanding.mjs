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
// unbekannte oder fehlende Rolle bleibt beim bisherigen Ziel /dashboard.
//
// Admin-Anmeldung (Canonical v2.130, bewusste Änderung): ein Administrator
// landet im Adminpanel (/admin) — nach der Anmeldung, auf der Startadresse und
// auf jeder unbekannten Adresse. Den Kundenbereich erreicht er weiter über
// „Zum Kundenbereich“ in der Admin-Seitenleiste. Seine Anmeldeseite ist
// /admin/login (ADMIN_LOGIN_PATH).
//
// Framework-frei (.mjs), damit `node --test` es ohne DOM prüfen kann.

export const SALES_PARTNER_ROLE = "sales_partner";
export const ADMIN_ROLE = "admin";
export const PARTNER_HOME = "/partner";
export const CUSTOMER_HOME = "/dashboard";
export const ADMIN_HOME = "/admin";
export const ADMIN_LOGIN_PATH = "/admin/login";

/** Ist dieses (aus /kundenbereich geformte) Benutzerobjekt ein Vertriebspartner? */
export function isSalesPartner(user) {
  return !!user && typeof user === "object" && user.role === SALES_PARTNER_ROLE;
}

/** Ist dieses (aus /kundenbereich geformte) Benutzerobjekt ein Administrator? */
export function isAdmin(user) {
  return !!user && typeof user === "object" && user.role === ADMIN_ROLE;
}

/** Startziel eines angemeldeten Kontos: Partnerportal, Adminpanel oder Kundenbereich. */
export function landingPathFor(user) {
  if (isSalesPartner(user)) return PARTNER_HOME;
  if (isAdmin(user)) return ADMIN_HOME;
  return CUSTOMER_HOME;
}
