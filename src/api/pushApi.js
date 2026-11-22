import { apiFetch } from "./client";

/* ── Mitteilungen (Web Push) der Admin- und der Partner-App (Betreiberauftrag 2026-11-22, D6; BE-2 routes/push.js) ──
   Alle Aufrufe mit `auth: true`. Achtung: apiFetch wertet 401/403 als Sitzungsende und meldet ab. Der Server antwortet
   einem NICHT aktiven Vertriebspartner auf Konfiguration, Stand und Einschalten mit 403 PUSH_PARTNER_INACTIVE — die
   Karte ruft diese drei deshalb nur für aktive Partner auf (PushMitteilungenKarte, `gesperrt`). Geräteliste, Entfernen
   und Ausschalten prüfen nur die Rolle. Kein Aufruf protokolliert Endpunkt oder Schlüssel. */

const json = (method, body, extra = {}) => ({ method, auth: true, ...extra, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });

/** GET /push/config → { available, publicKey|null, app, categories: [{ id, label }] } */
export const pushKonfiguration = ({ signal } = {}) => apiFetch("/push/config", { auth: true, signal });

/** POST /push/subscription/status { endpoint } → { subscribed:false } | { subscribed:true, currentSession, subscription } */
export const pushStand = (endpoint, { signal } = {}) => apiFetch("/push/subscription/status", json("POST", { endpoint }, { signal }));

/** PUT /push/subscription { subscription: { endpoint, keys }, categories? } — ohne categories: alle Arten. */
export const pushEinschalten = (subscription, categories) =>
  apiFetch("/push/subscription", json("PUT", categories === undefined ? { subscription } : { subscription, categories }));

/** POST /push/subscription/remove { endpoint } → { removed } */
export const pushAusschalten = (endpoint) => apiFetch("/push/subscription/remove", json("POST", { endpoint }));

/** GET /push/devices → { devices: [{ id, app, deviceLabel, categories, createdAt, lastSuccessAt }] } */
export const pushGeraete = ({ signal } = {}) => apiFetch("/push/devices", { auth: true, signal });

/** DELETE /push/devices/:id → { removed: true } | 404 PUSH_NOT_FOUND */
export const pushGeraetEntfernen = (id) => apiFetch(`/push/devices/${encodeURIComponent(id)}`, json("DELETE"));
