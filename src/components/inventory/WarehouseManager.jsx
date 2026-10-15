import React, { useCallback, useEffect, useRef, useState } from "react";
import { getWarehouses, createWarehouse, updateWarehouse } from "../../api/inventoryApi";
import { InventoryDialog, InlineError, InlineSuccess, RowActionsMenu } from "./InventoryShared";
import { ListSkeleton } from "../ui/StateView";
import { inventoryErrorText } from "../../utils/inventoryErrors.mjs";
import {
  readWarehousePage, WAREHOUSE_PAGE_LIMIT, WAREHOUSE_LIMITS, warehouseActions, warehouseActionBody,
  WAREHOUSE_ACTION_DIALOG, emptyWarehouseForm, warehouseToForm, buildWarehouseBody, warehouseErrorView,
} from "../../utils/warehouseView.mjs";

/* ── Lagerverwaltung (Paritätsaudit 2026-10-15, BI9 und Umfang C) ────────────
   Bis hierher zeigte die Lagerübersicht die ersten fünf Lager als reine Liste —
   anlegen ließ sich nur das erste („Hauptlager"), bearbeiten, umstellen oder
   deaktivieren gar nichts, obwohl das Backend alles anbietet.

   Ausschließlich bestehende Endpunkte (GET/POST/PATCH /api/kunde/warehouses):
     · Liste Seite für Seite über den Cursor des Servers („Weitere Lager laden")
     · Anlegen mit Name, Kürzel, Notiz und optional als Standard
     · Bearbeiten von Name, Kürzel und Notiz
     · Standard festlegen, Deaktivieren, Aktivieren — je mit Bestätigung
   Die Mehrlagerregeln (Standardlager immer aktiv, nur leere Lager deaktivierbar)
   setzt der Server durch; seine Gründe stehen im Dialog, die Mengen eines nicht
   leeren Lagers eingeschlossen. Bewusst NICHT: Löschen (gibt es im Backend nicht),
   Umbuchen zwischen Lagern, Lagerplätze.

   Jede Änderung lädt die Liste neu (Serverstand statt lokaler Fortschreibung) und
   meldet sie der Seite (`onChanged`), damit Kennzahlen und Auswahlfelder folgen. */
export function WarehouseManager({ onChanged }) {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  // Formulardialog: { mode: "create" | "edit", warehouse, values, errors, error } oder null.
  const [form, setForm] = useState(null);
  // Statusaktion: { kind: "setDefault" | "deactivate" | "activate", warehouse, error } oder null.
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const seq = useRef(0);

  const load = useCallback(async (cursor = null) => {
    const meins = ++seq.current;
    if (cursor) setLoadingMore(true); else setLoading(true);
    setError("");
    try {
      const res = await getWarehouses({ limit: WAREHOUSE_PAGE_LIMIT, cursor: cursor || undefined });
      if (seq.current !== meins) return;
      if (!res.ok) {
        setError(inventoryErrorText(await res.json().catch(() => null), "Die Lager konnten nicht geladen werden."));
        return;
      }
      const page = readWarehousePage(await res.json().catch(() => null));
      setItems((cur) => (cursor ? [...cur, ...page.warehouses.filter((w) => !cur.some((x) => x.id === w.id))] : page.warehouses));
      setNextCursor(page.nextCursor);
    } catch {
      if (seq.current === meins) setError("Die Lager konnten nicht geladen werden.");
    } finally {
      if (seq.current === meins) { setLoading(false); setLoadingMore(false); }
    }
  }, []);

  useEffect(() => { load(null); }, [load]);

  const oeffneAnlegen = () => {
    setSuccess("");
    setForm({ mode: "create", warehouse: null, values: emptyWarehouseForm(), errors: {}, error: "" });
  };
  const oeffneBearbeiten = (w) => {
    setSuccess("");
    setForm({ mode: "edit", warehouse: w, values: warehouseToForm(w), errors: {}, error: "" });
  };
  const setFeld = (k, v) => setForm((f) => (f ? { ...f, values: { ...f.values, [k]: v }, errors: { ...f.errors, [k]: undefined } } : f));

  const nachAenderung = async (text) => {
    setSuccess(text);
    await load(null);
    onChanged?.();
  };

  const speichern = async () => {
    if (!form || inFlight.current) return;
    const gebaut = buildWarehouseBody(form.values, form.mode, form.warehouse);
    if (!gebaut.ok) { setForm((f) => (f ? { ...f, errors: gebaut.errors } : f)); return; }
    if (gebaut.unchanged) { setForm(null); setSuccess("Keine Änderung — das Lager ist unverändert."); return; }
    inFlight.current = true;
    setBusy(true);
    const modus = form.mode;
    try {
      const res = modus === "create"
        ? await createWarehouse(gebaut.body)
        : await updateWarehouse(form.warehouse.id, gebaut.body);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return; // zentraler Logout
        const v = warehouseErrorView(await res.json().catch(() => null), "Das Lager konnte nicht gespeichert werden.");
        setForm((f) => {
          if (!f) return f;
          return v.field ? { ...f, error: "", errors: { ...f.errors, [v.field]: v.text } } : { ...f, error: v.text };
        });
        return;
      }
      setForm(null);
      await nachAenderung(modus === "create" ? "Das Lager wurde angelegt." : "Das Lager wurde gespeichert.");
    } catch {
      setForm((f) => (f ? { ...f, error: "Das Lager konnte nicht gespeichert werden. Bitte versuchen Sie es erneut." } : f));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const oeffneAktion = (kind, w) => { setSuccess(""); setAction({ kind, warehouse: w, error: "" }); };

  const ausfuehren = async () => {
    if (!action || inFlight.current) return;
    const body = warehouseActionBody(action.kind);
    if (!body) return;
    inFlight.current = true;
    setBusy(true);
    const kind = action.kind;
    try {
      const res = await updateWarehouse(action.warehouse.id, body);
      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return;
        const v = warehouseErrorView(await res.json().catch(() => null), "Die Änderung wurde nicht ausgeführt.");
        // Der Dialog bleibt offen: der Grund (bei einem nicht leeren Lager mit den Mengen)
        // steht dort, wo die Entscheidung fiel.
        setAction((a) => (a ? { ...a, error: v.text } : a));
        return;
      }
      setAction(null);
      await nachAenderung(WAREHOUSE_ACTION_DIALOG[kind].success);
    } catch {
      setAction((a) => (a ? { ...a, error: "Die Änderung wurde nicht ausgeführt. Bitte versuchen Sie es erneut." } : a));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const def = action ? WAREHOUSE_ACTION_DIALOG[action.kind] : null;

  return (
    <section className="ce-card inv-warehouses" id="inv-warehouses" aria-labelledby="inv-warehouses-title">
      <div className="inv-warehouses-head">
        <h2 className="inv-section-title" id="inv-warehouses-title">Lager</h2>
        <button type="button" className="btn btn-outline btn-sm" id="inv-warehouse-create" onClick={oeffneAnlegen}>
          Lager anlegen
        </button>
      </div>

      <InlineSuccess text={success} />
      <InlineError text={error} onRetry={() => load(null)} />

      {loading && <ListSkeleton rows={2} label="Lager werden geladen" />}

      {!loading && !error && items.length === 0 && (
        <p className="inv-warehouses-empty">Noch kein Lager angelegt.</p>
      )}

      {!loading && items.length > 0 && (
        <ul className="inv-warehouse-list" id="inv-warehouse-list">
          {items.map((w) => (
            <li key={w.id} className="inv-warehouse-item" data-warehouse-id={w.id}>
              <div className="inv-warehouse-main">
                <div className="inv-warehouse-title">
                  <span className="inv-warehouse-name">{w.name || "Lager ohne Namen"}</span>
                  {w.code && <span className="inv-warehouse-code">{w.code}</span>}
                  {w.isDefault && <span className="badge badge--info">Standard</span>}
                  {w.status === "inactive" && <span className="badge badge--neutral">Inaktiv</span>}
                </div>
                {w.notes && <p className="inv-warehouse-notes">{w.notes}</p>}
              </div>
              <div className="inv-warehouse-actions">
                <button type="button" className="btn btn-sm btn-outline" onClick={() => oeffneBearbeiten(w)}
                        aria-label={`${w.name || "Lager"} bearbeiten`}>
                  Bearbeiten
                </button>
                <RowActionsMenu
                  label={`Weitere Aktionen für ${w.name || "Lager"}`}
                  items={warehouseActions(w).map((a) => ({ ...a, onClick: () => oeffneAktion(a.key, w) }))}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && nextCursor && (
        <button type="button" className="btn btn-outline btn-sm inv-warehouses-more" id="inv-warehouse-more"
                onClick={() => load(nextCursor)} disabled={loadingMore}>
          {loadingMore ? "Wird geladen …" : "Weitere Lager laden"}
        </button>
      )}

      <InventoryDialog
        open={!!form}
        onClose={() => { if (!busy) setForm(null); }}
        title={form?.mode === "edit" ? "Lager bearbeiten" : "Lager anlegen"}
        busy={busy}
        footer={(
          <>
            <button type="button" className="btn btn-outline" onClick={() => setForm(null)} disabled={busy}>Abbrechen</button>
            <button type="button" className="btn btn-primary" id="inv-warehouse-save" onClick={speichern} disabled={busy}>
              {busy ? "Wird gespeichert …" : form?.mode === "edit" ? "Speichern" : "Lager anlegen"}
            </button>
          </>
        )}
      >
        {form && (
          <form className="inv-warehouse-form" onSubmit={(e) => { e.preventDefault(); speichern(); }} noValidate>
            <InlineError text={form.error} />
            <div className="inv-field">
              <label className="field-label" htmlFor="inv-wh-name">Name *</label>
              <input id="inv-wh-name" className="field-input" value={form.values.name} maxLength={WAREHOUSE_LIMITS.name}
                     onChange={(e) => setFeld("name", e.target.value)} disabled={busy} autoFocus
                     aria-invalid={form.errors.name ? "true" : undefined}
                     aria-describedby={form.errors.name ? "inv-wh-name-error" : undefined} />
              {form.errors.name && <p className="inv-field-error" id="inv-wh-name-error">{form.errors.name}</p>}
            </div>
            <div className="inv-field">
              <label className="field-label" htmlFor="inv-wh-code">Kürzel (optional)</label>
              <input id="inv-wh-code" className="field-input" value={form.values.code} maxLength={WAREHOUSE_LIMITS.code}
                     onChange={(e) => setFeld("code", e.target.value)} disabled={busy}
                     aria-invalid={form.errors.code ? "true" : undefined}
                     aria-describedby={form.errors.code ? "inv-wh-code-error" : undefined} />
              {form.errors.code
                ? <p className="inv-field-error" id="inv-wh-code-error">{form.errors.code}</p>
                : <p className="inv-field-hint">Höchstens {WAREHOUSE_LIMITS.code} Zeichen.</p>}
            </div>
            <div className="inv-field">
              <label className="field-label" htmlFor="inv-wh-notes">Notiz (optional)</label>
              <textarea id="inv-wh-notes" className="field-textarea" rows={3} maxLength={WAREHOUSE_LIMITS.notes}
                        value={form.values.notes} onChange={(e) => setFeld("notes", e.target.value)} disabled={busy}
                        aria-invalid={form.errors.notes ? "true" : undefined}
                        aria-describedby={form.errors.notes ? "inv-wh-notes-error" : undefined} />
              {form.errors.notes && <p className="inv-field-error" id="inv-wh-notes-error">{form.errors.notes}</p>}
            </div>
            {form.mode === "create" && (
              <label className="inv-toolbar-check inv-warehouse-default-check">
                <input type="checkbox" id="inv-wh-default" checked={form.values.isDefault === true}
                       onChange={(e) => setFeld("isDefault", e.target.checked)} disabled={busy} />
                <span>Als Standardlager festlegen</span>
              </label>
            )}
            {form.mode === "edit" && (
              <p className="inv-field-hint">Standard und Status ändern Sie über „Weitere Aktionen“ in der Lagerliste.</p>
            )}
          </form>
        )}
      </InventoryDialog>

      <InventoryDialog
        open={!!action}
        onClose={() => { if (!busy) setAction(null); }}
        title={def ? def.title : ""}
        busy={busy}
        footer={(
          <>
            <button type="button" className="btn btn-outline" onClick={() => setAction(null)} disabled={busy}>Abbrechen</button>
            <button type="button" className="btn btn-primary" id="inv-warehouse-action-confirm" onClick={ausfuehren} disabled={busy}>
              {busy ? "Wird ausgeführt …" : def?.confirm}
            </button>
          </>
        )}
      >
        {action && def && (
          <>
            <InlineError text={action.error} />
            <dl className="inv-dialog-facts">
              <div><dt>Lager</dt><dd>{action.warehouse.name || "Lager ohne Namen"}</dd></div>
            </dl>
            <p className="inv-warehouse-dialog-text">{def.text}</p>
          </>
        )}
      </InventoryDialog>
    </section>
  );
}

export default WarehouseManager;
