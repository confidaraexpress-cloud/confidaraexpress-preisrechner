import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, NoResultsState, ListSkeleton } from "../../components/ui/StateView";
import { InlineError, InlineSuccess, InventoryDialog, ProductPicker, QuantityField, RowActionsMenu } from "../../components/inventory/InventoryShared";
import { getBalances, getProducts, getWarehouses, postReceipt, postAdjustment, postBlock, postUnblock } from "../../api/inventoryApi";
import {
  ADJUSTMENT_REASONS, BLOCK_REASONS, adjustmentPreview, formatUnits,
  inventoryErrorText, isLowStock, lowStockInfo, receiptPreview,
} from "../../utils/inventoryView.mjs";

const PAGE_LIMIT = 25;

/* ── Bestand ─────────────────────────────────────────────────────────────────
   Eine Seite für alle Bestandsvorgänge — eine eigene Seite „Wareneingang"
   braucht es nicht.

   Vier Vorgänge, zwei Wirkungsweisen:
     • Einbuchen und Korrigieren sind PHYSISCHE Deltas MIT Bewegung im Ledger.
     • Sperren und Freigeben verschieben nur zwischen verfügbar und gesperrt;
       `on_hand` bleibt unverändert und es entsteht KEINE Bewegung.

   Es gibt bewusst keinen Weg, einen Bestand direkt auf einen Wert zu setzen:
   bei der Korrektur meldet der Kunde den GEZÄHLTEN Ist-Bestand, das Delta
   bildet der Server gegen den gespeicherten Stand. Der Client rechnet nichts
   aus und schickt keinen Bestandswert.

   Die Vorschauen im Dialog sind reine Darstellung (utils/inventoryView.mjs) —
   sie sagen, was der eingetippte Wert bedeutet, und entscheiden nichts. */
export default function StockPage({ utility, onNavigate, initialFilter = null, onFilterApplied }) {
  const navigate = useNavigate();
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

  const [dialog, setDialog] = useState(null); // "receipt" | "adjust" | "block" | "unblock" | null
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");
  const [picked, setPicked] = useState(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [adjustReason, setAdjustReason] = useState(ADJUSTMENT_REASONS[0].value);
  const [blockReason, setBlockReason] = useState(BLOCK_REASONS[0].value);

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

  // Eine Bestandszeile als Dialogvorbelegung. Sie bringt den Bestand DES LAGERS
  // mit — die Grundlage jeder Vorschau.
  const ausZeile = (b) => ({
    id: b.productId, productId: b.productId, sku: b.sku, name: b.productName,
    warehouseId: b.warehouseId, warehouseName: b.warehouseName,
    onHand: b.onHand, available: b.available, blocked: b.blocked,
  });

  const oeffne = (art, vorbelegt = null) => {
    setDialog(art);
    setDialogError("");
    setPicked(vorbelegt);
    setAmount("");
    setNote("");
    setAdjustReason(ADJUSTMENT_REASONS[0].value);
    setBlockReason(BLOCK_REASONS[0].value);
    if (vorbelegt?.warehouseId) setWarehouseId(vorbelegt.warehouseId);
    sucheArtikel("");
  };

  const zeigeErfolg = (text) => {
    setSuccess(text);
    setTimeout(() => setSuccess((cur) => (cur === text ? "" : cur)), 4000);
  };

  /* Der Ausgangsbestand für die Vorschau — oder null.
     Er muss zum GEWÄHLTEN Lager gehören, sonst wäre die Vorschau eine
     Falschaussage: eine aus der Bestandsliste geöffnete Zeile ist genau ein
     Paar (Artikel, Lager), die Artikelsuche liefert dagegen die SUMME über alle
     Lager. Bei mehr als einem Lager gibt es dort deshalb keine Vorschau —
     lieber keine Zahl als eine falsche. */
  const basis = (() => {
    if (!picked || picked.onHand === undefined || picked.onHand === null) return null;
    if (picked.warehouseId != null) {
      return String(picked.warehouseId) === String(warehouseId) ? picked : null;
    }
    return warehouses.length <= 1 ? picked : null;
  })();

  const einbuchenVorschau = dialog === "receipt" ? receiptPreview(basis, amount) : null;
  const korrekturVorschau = dialog === "adjust" ? adjustmentPreview(basis, amount) : null;

  const absenden = async () => {
    if (!picked) { setDialogError("Bitte einen Artikel auswählen."); return; }
    const n = Number(String(amount).trim());
    if (!Number.isInteger(n) || n < 0) { setDialogError("Bitte eine ganze Zahl angeben."); return; }
    if (dialog !== "adjust" && n < 1) { setDialogError("Bitte eine Menge größer null angeben."); return; }
    const notiz = note.trim();
    if (dialog === "block" && blockReason === "other" && !notiz) {
      setDialogError("Bitte beschreiben Sie den Grund kurz in der Notiz.");
      return;
    }

    setBusy(true);
    setDialogError("");
    try {
      const payload = { productId: picked.productId || picked.id, warehouseId: warehouseId || undefined, note: notiz || undefined };
      const res = dialog === "receipt" ? await postReceipt({ ...payload, quantity: n })
        // countedQuantity, NICHT delta: der Kunde meldet, was er gezählt hat.
        : dialog === "adjust" ? await postAdjustment({ ...payload, countedQuantity: n, reason: adjustReason })
        : dialog === "block" ? await postBlock({ ...payload, quantity: n, reason: blockReason })
        : await postUnblock({ ...payload, quantity: n });
      if (!res.ok) { setDialogError(inventoryErrorText(await res.json().catch(() => null), "Der Vorgang konnte nicht gespeichert werden.")); return; }
      const data = await res.json();
      setDialog(null);
      zeigeErfolg(
        dialog === "receipt" ? `Wareneingang gebucht. Physischer Bestand: ${formatUnits(data.balance?.onHand)}.`
          : dialog === "adjust"
            ? (data.unchanged
              ? "Der gezählte Bestand stimmt mit dem gespeicherten überein — es wurde nichts gebucht."
              : `Bestand korrigiert. Physischer Bestand: ${formatUnits(data.balance?.onHand)}.`)
            : dialog === "block" ? `${formatUnits(n)} Einheiten gesperrt. Verfügbar: ${formatUnits(data.balance?.available)}.`
              : `${formatUnits(n)} Einheiten freigegeben. Verfügbar: ${formatUnits(data.balance?.available)}.`
      );
      await load(null);
    } catch { setDialogError("Der Vorgang konnte nicht gespeichert werden."); }
    finally { setBusy(false); }
  };

  const hatFilter = Boolean(debouncedQ || lowOnly);

  const dialogTitel = dialog === "receipt" ? "Bestand einbuchen"
    : dialog === "adjust" ? "Bestand korrigieren"
    : dialog === "block" ? "Bestand sperren" : "Sperre verwalten";

  /* Die Zeilenaktionen einer Bestandszeile — in Tabelle und Karte identisch.

     Sichtbar bleibt die häufigste Aktion; Korrigieren und Sperren stehen mit
     vollem Namen im Menü daneben. Alle drei nebeneinander messen 336 px, die
     Aktionsspalte bekommt selbst auf 1920 px nur 271 px — sie brachen deshalb
     immer um, mit der dritten Aktion allein auf einer zweiten Zeile.

     „Sperre verwalten" statt „Freigeben": ist bereits etwas gesperrt, führt
     derselbe Weg zum Freigeben. Ohne gesperrten Bestand gibt es nichts zu
     verwalten — dann heißt die Aktion schlicht „Sperren". */
  const zeilenAktionen = (b) => (
    <>
      <button type="button" className="btn btn-sm btn-outline" onClick={() => oeffne("receipt", ausZeile(b))}>Einbuchen</button>
      {/* Der Name allein reicht als Ansage nicht: derselbe Artikel kann in zwei
          Lagern zweimal in der Liste stehen. Die SKU steht in der Zeile daneben. */}
      <RowActionsMenu
        label={`Weitere Aktionen für ${b.productName}, ${b.warehouseName}`}
        items={[
          { key: "adjust", icon: "refresh", label: "Bestand korrigieren", onClick: () => oeffne("adjust", ausZeile(b)) },
          Number(b.blocked ?? 0) > 0
            ? { key: "unblock", icon: "shield", label: "Sperre verwalten", onClick: () => oeffne("unblock", ausZeile(b)) }
            : { key: "block", icon: "shield", label: "Bestand sperren", disabled: Number(b.available ?? 0) < 1,
                disabledReason: "Keine verfügbaren Einheiten", onClick: () => oeffne("block", ausZeile(b)) },
          // Beantwortet die Frage, die eine Bestandszahl offen lässt: warum ist
          // er jetzt so hoch? Der Bewegungsendpunkt filtert nach ARTIKEL, nicht
          // nach Lager — deshalb heißt die Aktion bewusst nur „Bewegungen
          // anzeigen" und behauptet keinen Lagerfilter. Das Lager steht in der
          // Bewegungstabelle als eigene Spalte.
          { key: "movements", icon: "layers", label: "Bewegungen anzeigen",
            onClick: () => onNavigate("movements", { productId: b.productId }) },
        ]}
      />
    </>
  );

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="Lager & Aufträge"
        title="Bestand"
        subtitle="Physischer Bestand, Reservierungen, gesperrte Ware und verfügbare Menge je Artikel und Lager. Verfügbar = physisch − reserviert − gesperrt."
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
        {/* Der Haken zeigt genau das, was der Server unter „niedrig" versteht:
            verfügbar UNTER dem gepflegten Mindestbestand. Artikel ohne
            Mindestbestand erscheinen nie — ohne Sollwert gibt es keine Aussage. */}
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
                  {/* „Physisch" statt „Bestand": in einer Zeile, die daneben
                      reservierte, gesperrte und verfügbare Mengen führt, ist
                      „Bestand" mehrdeutig — jede dieser Spalten ist ein Bestand.
                      Gleiche Benennung wie auf der Artikeldetailseite. */}
                  <th scope="col" className="ce-num">Physisch</th>
                  <th scope="col" className="ce-num">Reserviert</th>
                  <th scope="col" className="ce-num">Gesperrt</th>
                  <th scope="col" className="ce-num">Verfügbar</th>
                  <th scope="col" className="ce-num">Mindestbestand</th>
                  <th scope="col" className="ce-col-actions">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b) => {
                  const fehlt = lowStockInfo(b);
                  return (
                    <tr key={`${b.productId}-${b.warehouseId}`}>
                      <td>
                        {/* Beide sind Inline-Elemente — ohne den Stapel stünden
                            SKU und Bezeichnung in EINER Zeile hintereinander. */}
                        <div className="inv-cell-stack">
                          <span className="inv-cell-sku">{b.sku}</span>
                          {/* Der Artikelname führt zum Artikel — von der Zahl zum
                              Stammsatz, ohne Umweg über die Artikelliste. */}
                          <button type="button" className="btn btn-link inv-cell-link"
                                  onClick={() => navigate(`/inventory/products/${b.productId}`)}>{b.productName}</button>
                        </div>
                      </td>
                      <td>{b.warehouseName}</td>
                      <td className="ce-num">{formatUnits(b.onHand)}</td>
                      <td className="ce-num">{formatUnits(b.reserved)}</td>
                      <td className="ce-num">{formatUnits(b.blocked)}</td>
                      <td className={`ce-num${fehlt ? " inv-num-low" : ""}`}>
                        {formatUnits(b.available)}
                        {/* Die Fehlmenge sagt, WIE WEIT es fehlt — „niedrig"
                            allein lässt offen, ob eine oder hundert Einheiten
                            fehlen. Sie wird nur angezeigt (Differenz zweier
                            bereits vorhandener Werte), nie gesendet. */}
                        {fehlt && <span className="inv-cell-shortfall">{formatUnits(fehlt.missing)} fehlen</span>}
                      </td>
                      <td className="ce-num">{b.minStock === null || b.minStock === undefined ? "—" : formatUnits(b.minStock)}</td>
                      <td className="ce-col-actions">
                        <div className="inv-row-actions inv-row-actions--tight">{zeilenAktionen(b)}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="ce-list-cards inv-list-cards">
            {items.map((b) => {
              const fehlt = lowStockInfo(b);
              return (
                <li key={`${b.productId}-${b.warehouseId}`} className="ce-card inv-card">
                  <div className="inv-card-head">
                    <span className="inv-cell-sku">{b.sku}</span>
                    {isLowStock(b) && <span className="badge badge--warning"><span className="badge-dot" aria-hidden="true" />Niedriger Bestand</span>}
                  </div>
                  <button type="button" className="btn btn-link inv-card-title"
                          onClick={() => navigate(`/inventory/products/${b.productId}`)}>{b.productName}</button>
                  <div className="inv-cell-meta">{b.warehouseName}</div>
                  <dl className="inv-card-facts">
                    <div><dt>Physisch</dt><dd>{formatUnits(b.onHand)}</dd></div>
                    <div><dt>Reserviert</dt><dd>{formatUnits(b.reserved)}</dd></div>
                    <div><dt>Gesperrt</dt><dd>{formatUnits(b.blocked)}</dd></div>
                    <div><dt>Verfügbar</dt><dd>{formatUnits(b.available)}</dd></div>
                  </dl>
                  {fehlt && (
                    <p className="inv-card-shortfall">
                      {formatUnits(fehlt.available)} verfügbar bei Mindestbestand {formatUnits(fehlt.minStock)} —{" "}
                      {formatUnits(fehlt.missing)} {fehlt.missing === 1 ? "Einheit" : "Einheiten"} fehlen.
                    </p>
                  )}
                  <div className="inv-card-actions">{zeilenAktionen(b)}</div>
                </li>
              );
            })}
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
        title={dialogTitel}
        size="lg"
        busy={busy}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDialog(null)} disabled={busy}>Abbrechen</button>
            <button type="button" className="btn btn-primary" onClick={absenden} disabled={busy}>
              {busy ? "Wird gebucht …"
                : dialog === "receipt" ? "Einbuchen"
                : dialog === "adjust" ? "Korrektur buchen"
                : dialog === "block" ? "Bestand sperren" : "Sperre aufheben"}
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

        {/* Der Ausgangsbestand — die Zahlen, gegen die der eingetippte Wert
            wirkt. Er erscheint nur, wenn er zum gewählten Lager gehört. */}
        {basis && (
          <dl className="inv-dialog-facts">
            <div><dt>Physisch</dt><dd>{formatUnits(basis.onHand)}</dd></div>
            <div><dt>Verfügbar</dt><dd>{formatUnits(basis.available)}</dd></div>
            {Number(basis.blocked ?? 0) > 0 && <div><dt>Gesperrt</dt><dd>{formatUnits(basis.blocked)}</dd></div>}
          </dl>
        )}

        {/* Korrigieren und Sperren werden leicht verwechselt — der eine Vorgang
            ändert die Menge im Regal, der andere nur ihre Verwendbarkeit. */}
        {dialog === "adjust" && (
          <p className="inv-dialog-note">
            Eine Korrektur ändert den <strong>physischen</strong> Bestand und wird als Bewegung festgehalten.
            Soll Ware im Lager bleiben, aber vorübergehend nicht für Aufträge und Sendungen verwendet werden,
            ist <strong>Sperren</strong> der richtige Weg.
          </p>
        )}
        {dialog === "block" && (
          <p className="inv-dialog-note">
            Gesperrte Einheiten bleiben physisch im Lager — sie stehen nur nicht mehr für Aufträge und
            Sendungen zur Verfügung. Der physische Bestand ändert sich dabei nicht.
          </p>
        )}

        <QuantityField
          id="inv-stock-qty"
          label={dialog === "receipt" ? "Eingangsmenge"
            : dialog === "adjust" ? "Gezählter Bestand"
            : dialog === "block" ? "Menge sperren" : "Menge freigeben"}
          value={amount}
          onChange={setAmount}
          disabled={busy}
          max={dialog === "block" ? (basis?.available ?? undefined)
            : dialog === "unblock" ? (basis?.blocked ?? undefined) : undefined}
          hint={dialog === "receipt"
            ? "Wird zum vorhandenen Bestand addiert."
            : dialog === "adjust"
              ? "Tragen Sie ein, was Sie tatsächlich gezählt haben — die Differenz zum gespeicherten Bestand errechnet das System und dokumentiert sie als Bewegung."
              : dialog === "block"
                ? "Die Einheiten bleiben physisch im Lager, stehen aber nicht mehr für Aufträge und Sendungen zur Verfügung."
                : "Die Einheiten stehen danach wieder für Aufträge und Sendungen zur Verfügung."}
        />

        {/* Vorschauen: reine Darstellung. Gebucht wird, was der Server aus dem
            tatsächlich gespeicherten Bestand ableitet. */}
        {einbuchenVorschau && (
          <p className="inv-outcome" role="status">
            Nach der Buchung: physischer Bestand <strong>{formatUnits(einbuchenVorschau.next)}</strong>.
          </p>
        )}

        {korrekturVorschau && (
          <dl className="inv-dialog-facts inv-dialog-facts--outcome" role="status">
            <div><dt>Gespeichert</dt><dd>{formatUnits(korrekturVorschau.stored)}</dd></div>
            <div><dt>Gezählt</dt><dd>{formatUnits(korrekturVorschau.counted)}</dd></div>
            <div>
              <dt>Differenz</dt>
              <dd className={korrekturVorschau.difference < 0 ? "inv-num-low" : undefined}>
                {korrekturVorschau.unchanged
                  ? "keine"
                  : `${korrekturVorschau.difference > 0 ? "+" : ""}${formatUnits(korrekturVorschau.difference)}`}
              </dd>
            </div>
            <div><dt>Neuer Bestand</dt><dd>{formatUnits(korrekturVorschau.next)}</dd></div>
          </dl>
        )}
        {korrekturVorschau?.unchanged && (
          <p className="inv-outcome" role="status">
            Gezählter und gespeicherter Bestand stimmen überein — es wird nichts gebucht.
          </p>
        )}

        {/* Korrekturgrund statt der früheren Ja/Nein-Frage „Fehlmenge ist Bruch
            oder Schwund": die trennte Bruch nicht von Schwund und kannte für
            eine reine Inventurdifferenz gar keinen Wert. Der Grund wird
            serverseitig als eigenes Feld der Bewegung gespeichert, nicht im
            Notiztext. */}
        {dialog === "adjust" && (
          <div className="inv-field">
            <label className="field-label" htmlFor="inv-adjust-reason">Korrekturgrund</label>
            <select id="inv-adjust-reason" className="field-select" value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)} disabled={busy}>
              {ADJUSTMENT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        )}

        {dialog === "block" && (
          <div className="inv-field">
            <label className="field-label" htmlFor="inv-block-reason">Sperrgrund</label>
            <select id="inv-block-reason" className="field-select" value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)} disabled={busy}>
              {BLOCK_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
        )}

        <div className="inv-field">
          <label className="field-label" htmlFor="inv-stock-note">
            Notiz{dialog === "block" && blockReason === "other" ? " *" : " (optional)"}
          </label>
          <input id="inv-stock-note" className="field-input" value={note} onChange={(e) => setNote(e.target.value)}
                 maxLength={500} disabled={busy} placeholder="z. B. Lieferschein-Nr. oder interne Notiz" />
          {dialog === "block" && (
            <p className="inv-field-hint">Grund und Notiz bleiben dauerhaft nachvollziehbar — auch nach der Freigabe.</p>
          )}
        </div>
      </InventoryDialog>
    </div>
  );
}
