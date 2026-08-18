import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, NoResultsState, ListSkeleton } from "../../components/ui/StateView";
import { InlineError, InlineSuccess, InventoryDialog, QuantityField, StockCells, StockBadge } from "../../components/inventory/InventoryShared";
import { ProductForm } from "../../components/inventory/ProductForm";
import { getProducts, createProduct, updateProduct, getWarehouses } from "../../api/inventoryApi";
import { formatKg, formatUnits, inventoryErrorText, mapProductToShipment } from "../../utils/inventoryView.mjs";

const PAGE_LIMIT = 25;

/* ── Artikel ─────────────────────────────────────────────────────────────────
   Liste, Anlegen, Bearbeiten und der Einstieg „Versenden".

   „Versenden" erzeugt hier KEINE Sendung: es setzt den Versand-Prefill und
   wechselt in den bestehenden Prozess „Neue Sendung" — exakt derselbe Weg, den
   das Adressbuch seit jeher nimmt. Es gibt keinen zweiten Versandprozess.

   Kein Löschen: ein Artikel trägt Historie (Bewegungen, Auftragspositionen,
   Versandpositionen). Nicht mehr geführte Artikel werden inaktiv gesetzt. */
export default function ProductsPage({ utility, onShipProduct }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [shipTarget, setShipTarget] = useState(null);
  const [shipQty, setShipQty] = useState("1");
  const [defaultWarehouseId, setDefaultWarehouseId] = useState(null);

  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Standardlager einmalig laden — es wird beim Direktversand als Herkunft
  // mitgegeben. Fehlt es, entscheidet der Server (er nimmt dann selbst das
  // Standardlager); der Client rät nichts.
  useEffect(() => {
    let aktiv = true;
    getWarehouses({ limit: 50 }).then(async (r) => {
      if (!r.ok || !aktiv) return;
      const data = await r.json();
      const def = (data.warehouses || []).find(w => w.isDefault) || (data.warehouses || [])[0];
      if (def) setDefaultWarehouseId(def.id);
    }).catch(() => {});
    return () => { aktiv = false; };
  }, []);

  const load = useCallback(async (cursor = null) => {
    const meins = ++seq.current;
    if (cursor) setLoadingMore(true); else { setLoading(true); setError(""); }
    try {
      const res = await getProducts({
        limit: PAGE_LIMIT, cursor: cursor || undefined,
        q: debouncedQ || undefined, status: statusFilter || undefined,
        lowStock: lowOnly ? "true" : undefined,
      });
      if (seq.current !== meins) return;
      if (!res.ok) { setError(inventoryErrorText(await res.json().catch(() => null), "Die Artikel konnten nicht geladen werden.")); return; }
      const data = await res.json();
      setItems((cur) => (cursor ? [...cur, ...(data.products || [])] : (data.products || [])));
      setNextCursor(data.nextCursor || null);
    } catch {
      if (seq.current === meins) setError("Die Artikel konnten nicht geladen werden.");
    } finally {
      if (seq.current === meins) { setLoading(false); setLoadingMore(false); }
    }
  }, [debouncedQ, statusFilter, lowOnly]);

  useEffect(() => { load(null); }, [load]);

  const zeigeErfolg = (text) => {
    setSuccess(text);
    setTimeout(() => setSuccess((cur) => (cur === text ? "" : cur)), 4000);
  };

  const speichern = async (values) => {
    setSaving(true);
    setFormError("");
    try {
      const res = editing ? await updateProduct(editing.id, values) : await createProduct(values);
      if (!res.ok) { setFormError(inventoryErrorText(await res.json().catch(() => null), "Der Artikel konnte nicht gespeichert werden.")); return; }
      setFormOpen(false);
      setEditing(null);
      zeigeErfolg(editing ? "Artikel gespeichert." : "Artikel angelegt.");
      await load(null);
    } catch { setFormError("Der Artikel konnte nicht gespeichert werden."); }
    finally { setSaving(false); }
  };

  // Der Prefill wird HIER gebaut (reine Abbildung in inventoryView.mjs) und an
  // den bestehenden Mechanismus übergeben. Diese Seite kennt weder Tarife noch
  // Buchung.
  const versendeBestaetigen = () => {
    const qty = Number(shipQty);
    const payload = mapProductToShipment(shipTarget, qty, defaultWarehouseId);
    if (!payload) { setError("Bitte eine ganze Menge größer null angeben."); return; }
    setShipTarget(null);
    onShipProduct?.(payload);
  };

  const hatFilter = Boolean(debouncedQ || statusFilter || lowOnly);

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="Lager & Aufträge"
        title="Artikel"
        subtitle="Ihre Artikelstammdaten mit Bestand, Versand- und Zollangaben."
        utility={utility}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => { setEditing(null); setFormError(""); setFormOpen(true); }}>
            <Icon n="plus" s={16} />Artikel anlegen
          </button>
        }
      />

      <InlineSuccess text={success} />
      <InlineError text={error} onRetry={() => load(null)} />

      <div className="ce-toolbar inv-toolbar">
        <div className="inv-toolbar-search">
          <label className="field-label" htmlFor="inv-products-q">Artikel durchsuchen</label>
          <input id="inv-products-q" className="field-input" type="search" placeholder="SKU, Bezeichnung oder EAN"
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="inv-toolbar-filter">
          <label className="field-label" htmlFor="inv-products-status">Status</label>
          <select id="inv-products-status" className="field-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Alle</option>
            <option value="active">Aktiv</option>
            <option value="inactive">Inaktiv</option>
          </select>
        </div>
        <label className="inv-toolbar-check">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          <span>Nur niedriger Bestand</span>
        </label>
      </div>

      {loading && <ListSkeleton rows={5} label="Artikel werden geladen" />}

      {!loading && items.length === 0 && !hatFilter && (
        <EmptyState
          icon="cube"
          title="Noch keine Artikel"
          text="Legen Sie Ihre Artikel einmal an — Gewicht, Warenwert und Zollangaben stehen danach bei jedem Versand bereit."
          action={<button type="button" className="btn btn-primary" onClick={() => { setEditing(null); setFormOpen(true); }}>Artikel anlegen</button>}
        />
      )}

      {!loading && items.length === 0 && hatFilter && (
        <NoResultsState
          title="Keine Artikel gefunden"
          text="Für diese Suche oder Filterung gibt es keine Treffer."
          action={<button type="button" className="btn btn-outline" onClick={() => { setQ(""); setStatusFilter(""); setLowOnly(false); }}>Filter zurücksetzen</button>}
        />
      )}

      {!loading && items.length > 0 && (
        <>
          {/* Tabelle ab 1100 px Viewport, darunter Karten — reale Contentbreite,
              nicht Viewportbreite (Sidebar + Rahmen zählen mit). */}
          <div className="ce-table-container inv-list-table">
            <table className="ce-list-table">
              <caption className="sr-only">Artikelliste mit Bestand</caption>
              <thead>
                <tr>
                  <th scope="col">SKU</th>
                  <th scope="col">Artikel</th>
                  <th scope="col" className="ce-num">Bestand</th>
                  <th scope="col" className="ce-num">Reserviert</th>
                  <th scope="col" className="ce-num">Verfügbar</th>
                  <th scope="col" className="ce-num">Mindestbestand</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="ce-col-actions">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <tr key={p.id}>
                    <td className="inv-cell-sku">{p.sku}</td>
                    <td>
                      <button type="button" className="btn btn-link inv-cell-link" onClick={() => navigate(`/inventory/products/${p.id}`)}>{p.name}</button>
                      <div className="inv-cell-meta">{formatKg(p.weightKg)}</div>
                    </td>
                    <StockCells stock={p.stock} minStock={p.minStock} />
                    <td className="ce-num">{p.minStock === null || p.minStock === undefined ? "—" : formatUnits(p.minStock)}</td>
                    <td>
                      {p.status === "inactive"
                        ? <span className="badge badge--neutral"><span className="badge-dot" aria-hidden="true" />Inaktiv</span>
                        : <StockBadge row={{ available: p.stock?.available, minStock: p.minStock }} /> || null}
                    </td>
                    <td className="ce-col-actions">
                      <div className="inv-row-actions">
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate(`/inventory/products/${p.id}`)}>Öffnen</button>
                        <button type="button" className="btn btn-sm btn-outline" onClick={() => { setEditing(p); setFormError(""); setFormOpen(true); }}>Bearbeiten</button>
                        <button type="button" className="btn btn-sm btn-primary" disabled={p.status === "inactive"}
                                onClick={() => { setShipTarget(p); setShipQty("1"); }}>Versenden</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="ce-list-cards inv-list-cards">
            {items.map((p) => (
              <li key={p.id} className="ce-card inv-card">
                <div className="inv-card-head">
                  <span className="inv-cell-sku">{p.sku}</span>
                  {p.status === "inactive"
                    ? <span className="badge badge--neutral"><span className="badge-dot" aria-hidden="true" />Inaktiv</span>
                    : <StockBadge row={{ available: p.stock?.available, minStock: p.minStock }} />}
                </div>
                <button type="button" className="btn btn-link inv-card-title" onClick={() => navigate(`/inventory/products/${p.id}`)}>{p.name}</button>
                <dl className="inv-card-facts">
                  <div><dt>Bestand</dt><dd>{formatUnits(p.stock?.onHand)}</dd></div>
                  <div><dt>Reserviert</dt><dd>{formatUnits(p.stock?.reserved)}</dd></div>
                  <div><dt>Verfügbar</dt><dd>{formatUnits(p.stock?.available)}</dd></div>
                  <div><dt>Gewicht</dt><dd>{formatKg(p.weightKg)}</dd></div>
                </dl>
                <div className="inv-card-actions">
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate(`/inventory/products/${p.id}`)}>Öffnen</button>
                  <button type="button" className="btn btn-sm btn-outline" onClick={() => { setEditing(p); setFormOpen(true); }}>Bearbeiten</button>
                  <button type="button" className="btn btn-sm btn-primary" disabled={p.status === "inactive"}
                          onClick={() => { setShipTarget(p); setShipQty("1"); }}>Versenden</button>
                </div>
              </li>
            ))}
          </ul>

          {nextCursor && (
            <div className="inv-more">
              <button type="button" className="btn btn-outline" onClick={() => load(nextCursor)} disabled={loadingMore}>
                {loadingMore ? "Wird geladen …" : "Weitere Artikel laden"}
              </button>
            </div>
          )}
        </>
      )}

      <InventoryDialog
        open={formOpen}
        onClose={() => { if (!saving) { setFormOpen(false); setEditing(null); } }}
        title={editing ? "Artikel bearbeiten" : "Artikel anlegen"}
        size="lg"
        busy={saving}
        scrollBody
      >
        <ProductForm
          initial={editing}
          busy={saving}
          error={formError}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
          onSubmit={speichern}
        />
      </InventoryDialog>

      <InventoryDialog
        open={Boolean(shipTarget)}
        onClose={() => setShipTarget(null)}
        title="Artikel versenden"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setShipTarget(null)}>Abbrechen</button>
            <button type="button" className="btn btn-primary" onClick={versendeBestaetigen}>Versand vorbereiten</button>
          </>
        }
      >
        {shipTarget && (
          <>
            <p className="inv-dialog-lead">
              <strong>{shipTarget.name}</strong> · {shipTarget.sku}<br />
              Verfügbar: <span className="ce-num">{formatUnits(shipTarget.stock?.available)}</span>
            </p>
            <QuantityField
              id="inv-ship-qty"
              label="Menge"
              value={shipQty}
              onChange={setShipQty}
              autoFocus
              hint="Der Bestand wird erst mit der Buchung ausgebucht — nicht schon jetzt."
            />
            {/* Ausdrücklich KEIN Vorschlag für Paketmaße: Artikelmaße sind keine
                Paketmaße. Das Warengewicht wird als Ausgangspunkt übernommen und
                im Formular bestätigt. */}
            <p className="inv-dialog-note">
              Empfänger, Paketmaße und Versandservice ergänzen Sie im gewohnten Ablauf „Neue Sendung".
            </p>
          </>
        )}
      </InventoryDialog>
    </div>
  );
}
