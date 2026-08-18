import React, { useEffect, useState, useCallback, useRef } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState, NoResultsState, ListSkeleton } from "../../components/ui/StateView";
import { Icon } from "../../components/ui/Icon";
import { InlineError } from "../../components/inventory/InventoryShared";
import { getMovements } from "../../api/inventoryApi";
import { MOVEMENT_TYPES, adjustmentReasonLabel, movementTypeView, signedQuantity, formatUnits, inventoryErrorText } from "../../utils/inventoryView.mjs";

const PAGE_LIMIT = 25;

// dtDE ohne Sekunden — dieselbe ruhige Formatierung wie in den Entwürfen.
function dtDE(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ── Bewegungen ──────────────────────────────────────────────────────────────
   Das Bestandsledger. Es dokumentiert ausschließlich PHYSISCHE Änderungen:
   eine Reservierung oder deren Freigabe bewegt keine Ware und erscheint deshalb
   hier bewusst nicht — sie ist über den Auftrag nachvollziehbar.

   Einträge werden nie geändert oder gelöscht; eine Korrektur ist immer eine
   neue Gegenbewegung. Deshalb gibt es hier keine Zeilenaktion. */
// Der Startfilter „heutige Versandbewegungen" aus der Lagerübersicht. Das Datum
// entsteht LOKAL (nicht per toISOString): der Nutzer meint seinen Tag, nicht den
// UTC-Tag — vor 01:00 MEZ läge der UTC-Tag sonst einen Tag zurück.
function heuteIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function MovementsPage({ utility, initialFilter = null, onFilterApplied }) {
  const heute = initialFilter === "shipmentsToday";
  // Artikelfilter aus „Alle Bewegungen anzeigen" der Artikeldetailseite. Der
  // Endpunkt kennt `productId` bereits — hier kommt nur der Startwert dazu.
  const startArtikel = initialFilter && typeof initialFilter === "object" && initialFilter.productId
    ? String(initialFilter.productId) : "";
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  // Beim Mount abgeleitet statt per Effekt nachgereicht — sonst lüde die Seite
  // zweimal, einmal ungefiltert und einmal gefiltert.
  const [type, setType] = useState(heute ? "SHIPMENT" : "");
  const [productId, setProductId] = useState(startArtikel);
  const [from, setFrom] = useState(heute ? heuteIso() : "");
  const [to, setTo] = useState(heute ? heuteIso() : "");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);

  // Der Startfilter wirkt GENAU EINMAL — danach gehört die Auswahl dem Nutzer.
  useEffect(() => { if (initialFilter && onFilterApplied) onFilterApplied(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async (cursor = null) => {
    const meins = ++seq.current;
    if (cursor) setLoadingMore(true); else { setLoading(true); setError(""); }
    try {
      const res = await getMovements({
        limit: PAGE_LIMIT, cursor: cursor || undefined,
        type: type || undefined, productId: productId || undefined,
        from: from || undefined, to: to || undefined,
      });
      if (seq.current !== meins) return;
      if (!res.ok) { setError(inventoryErrorText(await res.json().catch(() => null), "Die Bewegungen konnten nicht geladen werden.")); return; }
      const data = await res.json();
      setItems((cur) => (cursor ? [...cur, ...(data.movements || [])] : (data.movements || [])));
      setNextCursor(data.nextCursor || null);
    } catch {
      if (seq.current === meins) setError("Die Bewegungen konnten nicht geladen werden.");
    } finally {
      if (seq.current === meins) { setLoading(false); setLoadingMore(false); }
    }
  }, [type, productId, from, to]);

  useEffect(() => { load(null); }, [load]);

  const hatFilter = Boolean(type || productId || from || to);
  // Der Artikelname steht nicht im Filter, aber in jeder Zeile — er kommt aus
  // den geladenen Daten statt aus einem zweiten Aufruf.
  const artikelName = productId ? (items[0]?.productName || null) : null;

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="Lager & Aufträge"
        title="Bewegungen"
        subtitle="Jede physische Bestandsänderung mit Zeitpunkt, Menge, Grund und Referenz."
        utility={utility}
      />

      <InlineError text={error} onRetry={() => load(null)} />

      <div className="ce-toolbar inv-toolbar">
        <div className="inv-toolbar-filter">
          <label className="field-label" htmlFor="inv-mv-type">Typ</label>
          <select id="inv-mv-type" className="field-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Alle</option>
            {MOVEMENT_TYPES.map((t) => <option key={t} value={t}>{movementTypeView(t)[1]}</option>)}
          </select>
        </div>
        <div className="inv-toolbar-filter">
          <label className="field-label" htmlFor="inv-mv-from">Von</label>
          <input id="inv-mv-from" className="field-input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="inv-toolbar-filter">
          <label className="field-label" htmlFor="inv-mv-to">Bis</label>
          <input id="inv-mv-to" className="field-input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        {/* Kommt der Nutzer über „Alle Bewegungen anzeigen" eines Artikels, ist
            die Liste gefiltert. Ohne sichtbaren Hinweis sähe er eine verkürzte
            Liste ohne erkennbaren Grund — deshalb ein abwählbarer Filterchip. */}
        {productId && (
          <button type="button" className="btn btn-sm btn-outline inv-toolbar-chip" onClick={() => setProductId("")}>
            Artikel: {artikelName || `#${productId}`}
            <Icon n="close" s={14} />
          </button>
        )}
      </div>

      {loading && <ListSkeleton rows={6} label="Bewegungen werden geladen" />}

      {!loading && items.length === 0 && !hatFilter && (
        <EmptyState
          icon="packageMove"
          title="Noch keine Bewegungen"
          text="Sobald Sie Bestand einbuchen, korrigieren oder versenden, entsteht hier ein nachvollziehbarer Eintrag."
        />
      )}

      {!loading && items.length === 0 && hatFilter && (
        <NoResultsState
          title="Keine Bewegungen gefunden"
          text="Für diesen Zeitraum oder Typ gibt es keine Einträge."
          action={<button type="button" className="btn btn-outline" onClick={() => { setType(""); setProductId(""); setFrom(""); setTo(""); }}>Filter zurücksetzen</button>}
        />
      )}

      {!loading && items.length > 0 && (
        <>
          <div className="ce-table-container inv-list-table">
            <table className="ce-list-table">
              <caption className="sr-only">Bestandsbewegungen</caption>
              <thead>
                <tr>
                  <th scope="col">Zeitpunkt</th>
                  <th scope="col">Artikel</th>
                  <th scope="col">Typ</th>
                  <th scope="col" className="ce-num">Menge</th>
                  <th scope="col" className="ce-num">Bestand danach</th>
                  <th scope="col">Lager</th>
                  <th scope="col">Referenz</th>
                  <th scope="col">Benutzer</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => {
                  const [cls, text, roh] = movementTypeView(m.type);
                  return (
                    <tr key={m.id}>
                      <td className="inv-cell-meta">{dtDE(m.createdAt)}</td>
                      <td>
                        <span className="inv-cell-sku">{m.sku}</span>
                        <div className="inv-cell-meta">{m.productName}</div>
                      </td>
                      <td>
                        <span className={`badge ${cls}`} title={roh ? `Serverwert: ${roh}` : undefined}>
                          <span className="badge-dot" aria-hidden="true" />{text}
                        </span>
                        {/* Der Korrekturgrund steht als eigenes Feld an der
                            Bewegung — nur manuelle Korrekturen tragen einen. */}
                        {adjustmentReasonLabel(m.reason) && <div className="inv-cell-meta">{adjustmentReasonLabel(m.reason)}</div>}
                      </td>
                      <td className={`ce-num${Number(m.quantity) < 0 ? " inv-num-out" : " inv-num-in"}`}>{signedQuantity(m.quantity)}</td>
                      <td className="ce-num">{formatUnits(m.onHandAfter)}</td>
                      <td>{m.warehouseName}</td>
                      <td className="inv-cell-meta">
                        {m.referenceType === "shipment" ? `Sendung ${m.referenceId}`
                          : m.referenceType === "order" ? `Auftrag ${m.referenceId}`
                          : (m.note || "—")}
                      </td>
                      <td className="inv-cell-meta">{m.createdByName || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="ce-list-cards inv-list-cards">
            {items.map((m) => {
              const [cls, text, roh] = movementTypeView(m.type);
              return (
                <li key={m.id} className="ce-card inv-card">
                  <div className="inv-card-head">
                    <span className={`badge ${cls}`} title={roh ? `Serverwert: ${roh}` : undefined}>
                      <span className="badge-dot" aria-hidden="true" />{text}
                    </span>
                    <span className={`ce-num inv-card-qty${Number(m.quantity) < 0 ? " inv-num-out" : " inv-num-in"}`}>{signedQuantity(m.quantity)}</span>
                  </div>
                  <div className="inv-card-title-static">{m.productName}</div>
                  <div className="inv-cell-meta">
                    {m.sku} · {m.warehouseName}
                    {adjustmentReasonLabel(m.reason) ? ` · ${adjustmentReasonLabel(m.reason)}` : ""}
                  </div>
                  <dl className="inv-card-facts">
                    <div><dt>Zeitpunkt</dt><dd>{dtDE(m.createdAt)}</dd></div>
                    <div><dt>Bestand danach</dt><dd>{formatUnits(m.onHandAfter)}</dd></div>
                  </dl>
                  {m.note && <p className="inv-cell-meta">{m.note}</p>}
                </li>
              );
            })}
          </ul>

          {nextCursor && (
            <div className="inv-more">
              <button type="button" className="btn btn-outline" onClick={() => load(nextCursor)} disabled={loadingMore}>
                {loadingMore ? "Wird geladen …" : "Weitere Bewegungen laden"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
