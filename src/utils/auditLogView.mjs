/* ── Protokoll (Audit-Logs): Ausführende und Betroffene ──────────────────────
   Reine Zuordnung der Antwortfelder — keine Logik, kein DOM.

   Backendvertrag (routes/admin/auditLogs.js) je Eintrag:
     actor        { id, name } oder null,  actor_user_id
     target_user  { id, name } oder null,  target_user_id
     target_shipment_id, target_invoice_id
   Früher las die Seite für Betroffene nur `target`/`target_name` — der Name aus
   `target_user` kam nie an, Sendungs- und Rechnungsbezug fehlten ganz
   (UX-Paket 1). Ältere bzw. alternative Feldformen bleiben als Rückfall. */

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");
const obj = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/** Ausführender („actor") bzw. betroffenes Konto („target") → { id, name, type }. */
export function auditParty(row, kind) {
  const r = obj(row) || {};
  const o = obj(r[kind]) || obj(r[`${kind}_user`]);
  const id = firstDefined(o?.id, o?.user_id, r[`${kind}_user_id`], r[`${kind}_id`]);
  const name = firstDefined(o?.name, o?.company_name, r[`${kind}_name`]);
  const type = firstDefined(r[`${kind}_type`], o?.type);
  return { id: id ?? null, name: name ?? null, type: type ?? null };
}

/** Alle Betroffenen eines Eintrags in fester Reihenfolge: Konto, Sendung, Rechnung. */
export function auditTargets(row) {
  const r = obj(row) || {};
  const liste = [];
  const konto = auditParty(r, "target");
  if (konto.id !== null || konto.name !== null) liste.push(konto);
  const sendung = firstDefined(r.target_shipment_id);
  if (sendung !== undefined) liste.push({ id: sendung, name: "Sendung", type: null });
  const rechnung = firstDefined(r.target_invoice_id);
  if (rechnung !== undefined) liste.push({ id: rechnung, name: "Rechnung", type: null });
  return liste;
}
