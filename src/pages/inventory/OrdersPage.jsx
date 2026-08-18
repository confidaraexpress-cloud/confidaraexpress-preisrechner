import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, NoResultsState, ListSkeleton } from "../../components/ui/StateView";
import { InlineError, InlineSuccess, InventoryDialog } from "../../components/inventory/InventoryShared";
import { OrderCreateForm } from "../../components/inventory/OrderCreateForm";
import { getOrders, createOrder, getOrderShippingPrefill } from "../../api/inventoryApi";
import { orderStatusView, formatUnits, inventoryErrorText, isOrderShippable, mapOrderPrefillToShipment } from "../../utils/inventoryView.mjs";

const PAGE_LIMIT = 25;

/* ── Aufträge ────────────────────────────────────────────────────────────────
   Ein Auftrag ist eine Kommissionierliste mit Empfänger — kein
   Verkaufsauftrag: keine Preise, keine Rechnung, keine Steuer.

   Beim Anlegen wird Bestand reserviert. Das passiert vollständig serverseitig
   und in EINER Transaktion: ist eine Position nicht deckbar, entsteht gar kein
   Auftrag. Die Anzeige „Verfügbar: X" im Formular ist Orientierung — ob
   reserviert werden darf, entscheidet ausschließlich das Backend. */
export default function OrdersPage({ utility, onPrepareShipment, initialFilter = null, onFilterApplied }) {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  // Startfilter aus der Lagerübersicht („Alle offenen Aufträge anzeigen").
  // Beim Mount abgeleitet statt per Effekt nachgereicht — sonst lüde die Seite
  // zweimal, einmal ungefiltert und einmal gefiltert.
  const [statusFilter, setStatusFilter] = useState(initialFilter === "open" ? "open" : "");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [preparingId, setPreparingId] = useState(null);

  const seq = useRef(0);

  // Der Startfilter wirkt GENAU EINMAL — danach gehört die Auswahl dem Nutzer.
  useEffect(() => { if (initialFilter && onFilterApplied) onFilterApplied(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (cursor = null) => {
    const meins = ++seq.current;
    if (cursor) setLoadingMore(true); else { setLoading(true); setError(""); }
    try {
      const res = await getOrders({
        limit: PAGE_LIMIT, cursor: cursor || undefined,
        q: debouncedQ || undefined, status: statusFilter || undefined,
      });
      if (seq.current !== meins) return;
      if (!res.ok) { setError(inventoryErrorText(await res.json().catch(() => null), "Die Aufträge konnten nicht geladen werden.")); return; }
      const data = await res.json();
      setItems((cur) => (cursor ? [...cur, ...(data.orders || [])] : (data.orders || [])));
      setNextCursor(data.nextCursor || null);
    } catch {
      if (seq.current === meins) setError("Die Aufträge konnten nicht geladen werden.");
    } finally {
      if (seq.current === meins) { setLoading(false); setLoadingMore(false); }
    }
  }, [debouncedQ, statusFilter]);

  useEffect(() => { load(null); }, [load]);

  const zeigeErfolg = (text) => {
    setSuccess(text);
    setTimeout(() => setSuccess((cur) => (cur === text ? "" : cur)), 5000);
  };

  const anlegen = async (payload) => {
    setSaving(true);
    setFormError("");
    try {
      const res = await createOrder(payload);
      if (!res.ok) { setFormError(inventoryErrorText(await res.json().catch(() => null), "Der Auftrag konnte nicht angelegt werden.")); return; }
      const data = await res.json();
      setFormOpen(false);
      zeigeErfolg(`Auftrag ${data.order?.orderNumber} angelegt. Der Bestand ist reserviert.`);
      await load(null);
    } catch { setFormError("Der Auftrag konnte nicht angelegt werden."); }
    finally { setSaving(false); }
  };

  // „Versand vorbereiten": Empfänger und offene Positionen holt der SERVER; der
  // Client baut daraus nur den Prefill und übergibt ihn dem bestehenden
  // Prozess „Neue Sendung". Kein zweiter Versandprozess.
  const versandVorbereiten = async (order) => {
    setPreparingId(order.id);
    setError("");
    try {
      const res = await getOrderShippingPrefill(order.id);
      if (!res.ok) { setError(inventoryErrorText(await res.json().catch(() => null), "Die Versandvorbereitung ist fehlgeschlagen.")); return; }
      const payload = mapOrderPrefillToShipment(await res.json());
      if (!payload) { setError("Die Versandvorbereitung ist fehlgeschlagen."); return; }
      onPrepareShipment?.(payload);
    } catch { setError("Die Versandvorbereitung ist fehlgeschlagen."); }
    finally { setPreparingId(null); }
  };

  const hatFilter = Boolean(debouncedQ || statusFilter);

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="Lager & Aufträge"
        title="Aufträge"
        subtitle="Kommissionierlisten mit reserviertem Bestand — Ausgangspunkt für den Versand."
        utility={utility}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => { setFormError(""); setFormOpen(true); }}>
            <Icon n="plus" s={16} />Auftrag erstellen
          </button>
        }
      />

      <InlineSuccess text={success} />
      <InlineError text={error} onRetry={() => load(null)} />

      <div className="ce-toolbar inv-toolbar">
        <div className="inv-toolbar-search">
          <label className="field-label" htmlFor="inv-orders-q">Aufträge durchsuchen</label>
          <input id="inv-orders-q" className="field-input" type="search" placeholder="Auftragsnummer, Referenz oder Empfänger"
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="inv-toolbar-filter">
          <label className="field-label" htmlFor="inv-orders-status">Status</label>
          <select id="inv-orders-status" className="field-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Alle</option>
            <option value="open">Offen</option>
            <option value="partially_shipped">Teilweise versendet</option>
            <option value="shipped">Versendet</option>
            <option value="cancelled">Storniert</option>
          </select>
        </div>
      </div>

      {loading && <ListSkeleton rows={5} label="Aufträge werden geladen" />}

      {!loading && items.length === 0 && !hatFilter && (
        <EmptyState
          icon="cart"
          title="Noch keine Aufträge"
          text="Ein Auftrag bündelt Empfänger und Artikel und reserviert den Bestand, bis Sie versenden."
          action={<button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>Auftrag erstellen</button>}
        />
      )}

      {!loading && items.length === 0 && hatFilter && (
        <NoResultsState
          title="Keine Aufträge gefunden"
          text="Für diese Suche oder Filterung gibt es keine Treffer."
          action={<button type="button" className="btn btn-outline" onClick={() => { setQ(""); setStatusFilter(""); }}>Filter zurücksetzen</button>}
        />
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="ce-table-container inv-list-table">
            <table className="ce-list-table">
              <caption className="sr-only">Auftragsliste</caption>
              <thead>
                <tr>
                  <th scope="col">Auftragsnummer</th>
                  <th scope="col">Empfänger</th>
                  <th scope="col" className="ce-num">Positionen</th>
                  <th scope="col" className="ce-num">Reserviert</th>
                  <th scope="col" className="ce-num">Versendet</th>
                  <th scope="col">Status</th>
                  <th scope="col">Erstellt</th>
                  <th scope="col" className="ce-col-actions">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((o) => {
                  const [cls, text, roh] = orderStatusView(o.status);
                  return (
                    <tr key={o.id}>
                      <td>
                        <button type="button" className="btn btn-link inv-cell-link" onClick={() => navigate(`/inventory/orders/${o.id}`)}>{o.orderNumber}</button>
                        {o.customerReference && <div className="inv-cell-meta">{o.customerReference}</div>}
                      </td>
                      <td>
                        {o.recipient?.company || o.recipient?.fullName || "—"}
                        <div className="inv-cell-meta">{o.recipient?.city} {o.recipient?.country}</div>
                      </td>
                      <td className="ce-num">{formatUnits(o.itemCount)}</td>
                      <td className="ce-num">{formatUnits(o.openQuantity)}</td>
                      <td className="ce-num">{formatUnits(o.shippedQuantity)}</td>
                      <td>
                        <span className={`badge ${cls}`} title={roh ? `Serverwert: ${roh}` : undefined}>
                          <span className="badge-dot" aria-hidden="true" />{text}
                        </span>
                      </td>
                      <td className="inv-cell-meta">{new Date(o.createdAt).toLocaleDateString("de-DE")}</td>
                      <td className="ce-col-actions">
                        <div className="inv-row-actions">
                          <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate(`/inventory/orders/${o.id}`)}>Öffnen</button>
                          {isOrderShippable(o) && (
                            <button type="button" className="btn btn-sm btn-primary" disabled={preparingId === o.id}
                                    onClick={() => versandVorbereiten(o)}>
                              {preparingId === o.id ? "Wird vorbereitet …" : "Versand vorbereiten"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="ce-list-cards inv-list-cards">
            {items.map((o) => {
              const [cls, text, roh] = orderStatusView(o.status);
              return (
                <li key={o.id} className="ce-card inv-card">
                  <div className="inv-card-head">
                    <button type="button" className="btn btn-link inv-card-title" onClick={() => navigate(`/inventory/orders/${o.id}`)}>{o.orderNumber}</button>
                    <span className={`badge ${cls}`} title={roh ? `Serverwert: ${roh}` : undefined}>
                      <span className="badge-dot" aria-hidden="true" />{text}
                    </span>
                  </div>
                  <div className="inv-cell-meta">
                    {o.recipient?.company || o.recipient?.fullName || "—"} · {o.recipient?.city} {o.recipient?.country}
                  </div>
                  <dl className="inv-card-facts">
                    <div><dt>Positionen</dt><dd>{formatUnits(o.itemCount)}</dd></div>
                    <div><dt>Reserviert</dt><dd>{formatUnits(o.openQuantity)}</dd></div>
                    <div><dt>Versendet</dt><dd>{formatUnits(o.shippedQuantity)}</dd></div>
                  </dl>
                  <div className="inv-card-actions">
                    <button type="button" className="btn btn-sm btn-outline" onClick={() => navigate(`/inventory/orders/${o.id}`)}>Öffnen</button>
                    {isOrderShippable(o) && (
                      <button type="button" className="btn btn-sm btn-primary" disabled={preparingId === o.id} onClick={() => versandVorbereiten(o)}>
                        Versand vorbereiten
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {nextCursor && (
            <div className="inv-more">
              <button type="button" className="btn btn-outline" onClick={() => load(nextCursor)} disabled={loadingMore}>
                {loadingMore ? "Wird geladen …" : "Weitere Aufträge laden"}
              </button>
            </div>
          )}
        </>
      )}

      <InventoryDialog
        open={formOpen}
        onClose={() => { if (!saving) setFormOpen(false); }}
        title="Auftrag erstellen"
        size="xl"
        busy={saving}
      >
        <OrderCreateForm busy={saving} error={formError} onCancel={() => setFormOpen(false)} onSubmit={anlegen} />
      </InventoryDialog>
    </div>
  );
}
