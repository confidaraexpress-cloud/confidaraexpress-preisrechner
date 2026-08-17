import React, { useEffect, useState, useCallback, useRef } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, NoResultsState, ListSkeleton } from "../../components/ui/StateView";
import { InlineError, InlineSuccess, InventoryDialog, ProductPicker, QuantityField } from "../../components/inventory/InventoryShared";
import { getBalances, getProducts, getWarehouses, postReceipt, postAdjustment } from "../../api/inventoryApi";
import { formatUnits, inventoryErrorText, isLowStock } from "../../utils/inventoryView.mjs";

const PAGE_LIMIT = 25;

/* ── Bestand ─────────────────────────────────────────────────────────────────
   Eine Seite für beide Bestandsvorgänge — eine eigene Seite „Wareneingang"
   braucht es nicht.

   Beide Vorgänge sind Deltas MIT Bewegung im Ledger. Es gibt bewusst keinen
   Weg, einen Bestand direkt auf einen Wert zu setzen: bei der Korrektur meldet
   der Kunde den GEZÄHLTEN Ist-Bestand, das Delta bildet der Server gegen den
   gespeicherten Stand. Der Client rechnet nichts aus und schickt keinen
   Bestandswert. */
export default function StockPage({ utility, onNavigate, initialFilter = null, onFilterApplied }) {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  // Startfilter aus der Lagerübersicht („Alle betroffenen Artikel anzeigen").
  // Er wird beim Mount ABGELEITET, nicht per Effekt nachgereicht: ein Effekt
  // würde erst nach dem ersten Laden feuern und damit zweimal laden — einmal
  // ungefiltert, einmal gefiltert.
  const [lowOnly, setLowOnly] = useState(initialFilter === "low");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [dialog, setDialog] = useState(null); // "receipt" | "adjust" | null
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [picked, setPicked] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [damage, setDamage] = useState(false);

  const [pickerItems, setPickerItems] = useState([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [warehouseId, setWarehouseId] = useState(null);
  const [warehouses, setWarehouses] = useState([]);

  const seq = useRef(0);

  // Der Startfilter wirkt GENAU EINMAL: danach meldet die Seite ihn ab, damit
  // ein späterer Wechsel hierher wieder ungefiltert beginnt und der Nutzer den
  // Haken selbst kontrolliert.
  useEffect(() => { if (initialFilter && onFilterApplied) onFilterApplied(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    getWarehouses({ limit: 50 }).then(async (r) => {
      if (!r.ok) return;
      const data = await r.json();
      const list = data.warehouses || [];
      setWarehouses(list);
      const def = list.find(w => w.isDefault) || list[0];
      if (def) setWarehouseId(def.id);
    }).catch(() => {});
  }, []);

  const load = useCallback(async (cursor = null) => {
    const meins = ++seq.current;
    if (cursor) setLoadingMore(true); else { setLoading(true); setError(""); }
    try {
      const res = await getBalances({
        limit: PAGE_LIMIT, cursor: cursor || undefined,
        q: debouncedQ || undefined, lowStock: lowOnly ? "true" : undefined,
      });
      if (seq.current !== meins) return;
      if (!res.ok) { setError(inventoryErrorText(await res.json().catch(() => null), "Der Bestand konnte nicht geladen werden.")); return; }
      const data = await res.json();
      setItems((cur) => (cursor ? [...cur, ...(data.balances || [])] : (data.balances || [])));
      setNextCursor(data.nextCursor || null);
    } catch {
      if (seq.current === meins) setError("Der Bestand konnte nicht geladen werden.");
    } finally {
      if (seq.current === meins) { setLoading(false); setLoadingMore(false); }
    }
  }, [debouncedQ, lowOnly]);

  useEffect(() => { load(null); }, [load]);

  const sucheArtikel = useCallback(async (term) => {
    setPickerLoading(true);
    try {
      const res = await getProducts({ limit: 20, q: term || undefined, status: "active" });
      if (res.ok) setPickerItems((await res.json()).products || []);
    } catch { /* Fehler zeigt der Dialog beim Absenden */ }
    finally { setPickerLoading(false); }
  }, []);

  const oeffne = (art, vorbelegt = null) => {
    setDialog(art);
    setDialogError("");
    setPicked(vorbelegt);
    setAmount("");
    setNote("");
    setDamage(false);
    if (vorbelegt?.warehouseId) setWarehouseId(vorbelegt.warehouseId);
    sucheArtikel("");
  };

  const zeigeErfolg = (text) => {
    setSuccess(text);
    setTimeout(() => setSuccess((cur) => (cur === text ? "" : cur)), 4000);
  };

  const absenden = async () => {
    if (!picked) { setDialogError("Bitte einen Artikel auswählen."); return; }
    const n = Number(amount);
    if (!Number.isInteger(n) || n < 0) { setDialogError("Bitte eine ganze Zahl angeben."); return; }
    if (dialog === "receipt" && n < 1) { setDialogError("Die Eingangsmenge muss größer als null sein."); return; }

    setBusy(true);
    setDialogError("");
    try {
      const payload = { productId: picked.productId || picked.id, warehouseId: warehouseId || undefined, note: note.trim() || undefined };
      const res = dialog === "receipt"
        ? await postReceipt({ ...payload, quantity: n })
        // countedQuantity, NICHT delta: der Kunde meldet, was er gezählt hat.
        : await postAdjustment({ ...payload, countedQuantity: n, damage });
      if (!res.ok) { setDialogError(inventoryErrorText(await res.json().catch(() => null), "Der Vorgang konnte nicht gespeichert werden.")); return; }
      const data = await res.json();
      setDialog(null);
      zeigeErfolg(
        dialog === "receipt"
          ? `Wareneingang gebucht. Neuer Bestand: ${formatUnits(data.balance?.onHand)}.`
          : data.unchanged
            ? "Der gezählte Bestand stimmt mit dem gespeicherten überein — es wurde nichts gebucht."
            : `Bestand korrigiert. Neuer Bestand: ${formatUnits(data.balance?.onHand)}.`
      );
      await load(null);
    } catch { setDialogError("Der Vorgang konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  };

  const hatFilter = Boolean(debouncedQ || lowOnly);

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="Lager & Aufträge"
        title="Bestand"
        subtitle="Physischer Bestand, Reservierungen und verfügbare Menge je Artikel und Lager."
        utility={utility}
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => oeffne("adjust")}>
              <Icon n="refresh" s={16} />Bestand korrigieren
            </button>
            <button type="button" className="btn btn-primary" onClick={() => oeffne("receipt")}>
              <Icon n="plus" s={16} />Bestand einbuchen
            </button>
          </>
        }
      />

      <InlineSuccess text={success} />
      <InlineError text={error} onRetry={() => load(null)} />

      <div className="ce-toolbar inv-toolbar">
        <div className="inv-toolbar-search">
          <label className="field-label" htmlFor="inv-stock-q">Bestand durchsuchen</label>
          <input id="inv-stock-q" className="field-input" type="search" placeholder="SKU oder Bezeichnung"
                 value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <label className="inv-toolbar-check">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          <span>Nur niedriger Bestand</span>
        </label>
      </div>

      {loading && <ListSkeleton rows={5} label="Bestand wird geladen" />}

      {!loading && items.length === 0 && !hatFilter && (
        <EmptyState
          icon="layers"
          title="Noch kein Bestand gebucht"
          text="Sobald Sie Ware einbuchen, sehen Sie hier den physischen Bestand, offene Reservierungen und die verfügbare Menge."
          action={<button type="button" className="btn btn-primary" onClick={() => oeffne("receipt")}>Bestand einbuchen</button>}
          secondaryAction={<button type="button" className="btn btn-outline" onClick={() => onNavigate("products")}>Zu den Artikeln</button>}
        />
      )}

      {!loading && items.length === 0 && hatFilter && (
        <NoResultsState
          title="Kein Bestand gefunden"
          text="Für diese Suche oder Filterung gibt es keine Treffer."
          action={<button type="button" className="btn btn-outline" onClick={() => { setQ(""); setLowOnly(false); }}>Filter zurücksetzen</button>}
        />
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="ce-table-container inv-list-table">
            <table className="ce-list-table">
              <caption className="sr-only">Bestand je Artikel und Lager</caption>
              <thead>
                <tr>
                  <th scope="col">Artikel</th>
                  <th scope="col">Lager</th>
                  <th scope="col" className="ce-num">Bestand</th>
                  <th scope="col" className="ce-num">Reserviert</th>
                  <th scope="col" className="ce-num">Gesperrt</th>
                  <th scope="col" className="ce-num">Verfügbar</th>
                  <th scope="col" className="ce-num">Mindestbestand</th>
                  <th scope="col" className="ce-col-actions">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => (
                  <tr key={`${b.productId}-${b.warehouseId}`}>
                    <td>
                      <span className="inv-cell-sku">{b.sku}</span>
                      <div className="inv-cell-meta">{b.productName}</div>
                    </td>
                    <td>{b.warehouseName}</td>
                    <td className="ce-num">{formatUnits(b.onHand)}</td>
                    <td className="ce-num">{formatUnits(b.reserved)}</td>
                    <td className="ce-num">{formatUnits(b.blocked)}</td>
                    <td className={`ce-num${isLowStock(b) ? " inv-num-low" : ""}`}>{formatUnits(b.available)}</td>
                    <td className="ce-num">{b.minStock === null || b.minStock === undefined ? "—" : formatUnits(b.minStock)}</td>
                    <td className="ce-col-actions">
                      <div className="inv-row-actions">
                        <button type="button" className="btn btn-sm btn-outline"
                                onClick={() => oeffne("receipt", { id: b.productId, productId: b.productId, sku: b.sku, name: b.productName, warehouseId: b.warehouseId })}>
                          Einbuchen
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost"
                                onClick={() => oeffne("adjust", { id: b.productId, productId: b.productId, sku: b.sku, name: b.productName, warehouseId: b.warehouseId })}>
                          Korrigieren
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="ce-list-cards inv-list-cards">
            {items.map((b) => (
              <li key={`${b.productId}-${b.warehouseId}`} className="ce-card inv-card">
                <div className="inv-card-head">
                  <span className="inv-cell-sku">{b.sku}</span>
                  {isLowStock(b) && <span className="badge badge--warning"><span className="badge-dot" aria-hidden="true" />Niedriger Bestand</span>}
                </div>
                <div className="inv-card-title-static">{b.productName}</div>
                <div className="inv-cell-meta">{b.warehouseName}</div>
                <dl className="inv-card-facts">
                  <div><dt>Bestand</dt><dd className="ce-num">{formatUnits(b.onHand)}</dd></div>
                  <div><dt>Reserviert</dt><dd className="ce-num">{formatUnits(b.reserved)}</dd></div>
                  <div><dt>Gesperrt</dt><dd className="ce-num">{formatUnits(b.blocked)}</dd></div>
                  <div><dt>Verfügbar</dt><dd className="ce-num">{formatUnits(b.available)}</dd></div>
                </dl>
                <div className="inv-card-actions">
                  <button type="button" className="btn btn-sm btn-outline"
                          onClick={() => oeffne("receipt", { id: b.productId, productId: b.productId, sku: b.sku, name: b.productName, warehouseId: b.warehouseId })}>Einbuchen</button>
                  <button type="button" className="btn btn-sm btn-ghost"
                          onClick={() => oeffne("adjust", { id: b.productId, productId: b.productId, sku: b.sku, name: b.productName, warehouseId: b.warehouseId })}>Korrigieren</button>
                </div>
              </li>
            ))}
          </ul>

          {nextCursor && (
            <div className="inv-more">
              <button type="button" className="btn btn-outline" onClick={() => load(nextCursor)} disabled={loadingMore}>
                {loadingMore ? "Wird geladen …" : "Weiteren Bestand laden"}
              </button>
            </div>
          )}
        </>
      )}

      <InventoryDialog
        open={dialog !== null}
        onClose={() => { if (!busy) setDialog(null); }}
        title={dialog === "receipt" ? "Bestand einbuchen" : "Bestand korrigieren"}
        size="lg"
        busy={busy}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDialog(null)} disabled={busy}>Abbrechen</button>
            <button type="button" className="btn btn-primary" onClick={absenden} disabled={busy}>
              {busy ? "Wird gebucht …" : (dialog === "receipt" ? "Einbuchen" : "Korrektur buchen")}
            </button>
          </>
        }
      >
        <InlineError text={dialogError} />

        {picked
          ? (
            <div className="inv-dialog-picked">
              <div>
                <span className="inv-cell-sku">{picked.sku}</span>
                <div className="inv-cell-meta">{picked.name}</div>
              </div>
              <button type="button" className="btn btn-sm btn-link" onClick={() => setPicked(null)} disabled={busy}>Anderen Artikel wählen</button>
            </div>
          )
          : <ProductPicker products={pickerItems} loading={pickerLoading} value={null} onChange={setPicked} onSearch={sucheArtikel} disabled={busy} />}

        {warehouses.length > 1 && (
          <div className="inv-field">
            <label className="field-label" htmlFor="inv-stock-wh">Lager</label>
            <select id="inv-stock-wh" className="field-select" value={warehouseId || ""} onChange={(e) => setWarehouseId(e.target.value)} disabled={busy}>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
        )}

        <QuantityField
          id="inv-stock-qty"
          label={dialog === "receipt" ? "Eingangsmenge" : "Gezählter Bestand"}
          value={amount}
          onChange={setAmount}
          disabled={busy}
          hint={dialog === "receipt"
            ? "Wird zum vorhandenen Bestand addiert."
            : "Tragen Sie ein, was Sie tatsächlich gezählt haben — die Differenz zum gespeicherten Bestand errechnet das System und dokumentiert sie als Bewegung."}
        />

        {dialog === "adjust" && (
          <label className="inv-toolbar-check">
            <input type="checkbox" checked={damage} onChange={(e) => setDamage(e.target.checked)} disabled={busy} />
            <span>Fehlmenge ist Bruch oder Schwund</span>
          </label>
        )}

        <div className="inv-field">
          <label className="field-label" htmlFor="inv-stock-note">Notiz</label>
          <input id="inv-stock-note" className="field-input" value={note} onChange={(e) => setNote(e.target.value)}
                 maxLength={500} disabled={busy} placeholder="z. B. Lieferschein-Nr. oder Inventurgrund" />
        </div>
      </InventoryDialog>
    </div>
  );
}
