import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { EmptyState, NoResultsState, ListSkeleton } from "../../components/ui/StateView";
import { Icon } from "../../components/ui/Icon";
import { InlineError, ProductFilterField } from "../../components/inventory/InventoryShared";
import { getMovements, getProduct } from "../../api/inventoryApi";
import {
  adjustmentReasonLabel, movementTypeView, movementTypeOptions, movementReferenceView,
  movementNote, signedQuantity, formatUnits, inventoryErrorText,
} from "../../utils/inventoryView.mjs";

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
   hier bewusst nicht — sie ist über den Auftrag nachvollziehbar. Ebenso bleibt
   der Sperrbestand (`inventory_blocks`) außen vor: er ist ein eigenes Ledger,
   und beides zu mischen machte die Frage „warum hat dieser Artikel jetzt 15
   Stück?" schwerer statt leichter.

   Einträge werden nie geändert oder gelöscht; eine Korrektur ist immer eine
   neue Gegenbewegung. Deshalb gibt es hier keine Zeilenaktion.

   Die Zeile beantwortet acht Fragen: was (Artikel) · wann (Zeitpunkt) · warum
   (Typ + Grund + Notiz) · wie viel (Menge mit Vorzeichen) · was blieb (Bestand
   danach) · wo (Lager) · wodurch (Referenz) · wer (erfassendes Konto). */
// Der Startfilter „heutige Versandbewegungen" aus der Lagerübersicht. Das Datum
// entsteht LOKAL (nicht per toISOString): der Nutzer meint seinen Tag, nicht den
// UTC-Tag — vor 01:00 MEZ läge der UTC-Tag sonst einen Tag zurück.
function heuteIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function MovementsPage({ utility, initialFilter = null, onFilterApplied }) {
  const navigate = useNavigate();
  const heute = initialFilter === "shipmentsToday";
  // Artikelfilter aus „Alle Bewegungen anzeigen" der Artikeldetailseite und aus
  // dem Zeilenmenü der Bestandsseite. Der Endpunkt kennt `productId` bereits —
  // hier kommt der Startwert dazu, und seit dieser Fassung auch die sichtbare
  // Bedienung desselben Filters.
  const startArtikel = initialFilter && typeof initialFilter === "object" && initialFilter.productId
    ? String(initialFilter.productId) : "";
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  // Beim Mount abgeleitet statt per Effekt nachgereicht — sonst lüde die Seite
  // zweimal, einmal ungefiltert und einmal gefiltert.
  const [type, setType] = useState(heute ? "SHIPMENT" : "");
  const [productId, setProductId] = useState(startArtikel);
  // Der Name des gefilterten Artikels. Er kommt aus der Auswahl, aus den
  // geladenen Zeilen oder — bei einem Deep-Link ohne Treffer — aus einem
  // gezielten Nachladen (siehe Effekt unten).
  const [productName, setProductName] = useState("");
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

  /* Den Namen des gefilterten Artikels auflösen — sonst stünde im Filterchip
     eine nackte „#100".

     Zuerst aus den geladenen Zeilen: die tragen den Namen ohnehin, das kostet
     keine Anfrage. Nur wenn der Filter NICHTS findet (ein Artikel ohne
     Bewegungen, oder zusätzlich eingeschränkt auf Typ und Zeitraum), wird der
     Artikel gezielt einmal nachgeladen. Genau dieser Fall ist der
     unangenehmste: eine leere Liste, deren Grund man nicht lesen kann. */
  useEffect(() => {
    if (!productId) { setProductName(""); return; }
    const ausZeilen = items.find((m) => String(m.productId) === String(productId))?.productName;
    if (ausZeilen) { setProductName(ausZeilen); return; }
    if (loading || productName) return;
    let abgebrochen = false;
    getProduct(productId).then(async (r) => {
      if (abgebrochen || !r.ok) return;
      const p = (await r.json()).product;
      if (p?.name) setProductName(p.name);
    }).catch(() => { /* ohne Namen bleibt der Chip bei der ID — kein Fehlerfall */ });
    return () => { abgebrochen = true; };
  }, [productId, items, loading, productName]);

  const artikelWaehlen = (p) => { setProductId(String(p.id)); setProductName(p.name || ""); };
  const alleFilterWeg = () => { setType(""); setProductId(""); setProductName(""); setFrom(""); setTo(""); };

  const aktiveFilter = [type, productId, from, to].filter(Boolean).length;
  const hatFilter = aktiveFilter > 0;
  // Sichtbar sind die heute erzeugbaren Typen — plus jeder Typ, der in den
  // geladenen Zeilen tatsächlich vorkommt (Altdaten bleiben filterbar).
  const typOptionen = movementTypeOptions(items);

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="Lager & Aufträge"
        title="Bewegungen"
        subtitle="Alle physischen Bestandsänderungen mit Zeitpunkt, Menge, Grund und Referenz nachvollziehen."
        utility={utility}
      />

      <InlineError text={error} onRetry={() => load(null)} />

      <div className="ce-toolbar inv-toolbar">
        <ProductFilterField
          id="inv-mv-product"
          label="Artikel oder SKU"
          onSelect={artikelWaehlen}
        />
        <div className="inv-toolbar-filter">
          <label className="field-label" htmlFor="inv-mv-type">Typ</label>
          <select id="inv-mv-type" className="field-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Alle</option>
            {typOptionen.map((t) => <option key={t} value={t}>{movementTypeView(t)[1]}</option>)}
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
        {/* Kommt der Nutzer über „Bewegungen anzeigen" oder „Alle Bewegungen
            anzeigen" eines Artikels, ist die Liste gefiltert. Ohne sichtbaren
            Hinweis sähe er eine verkürzte Liste ohne erkennbaren Grund —
            deshalb ein abwählbarer Filterchip. */}
        {productId && (
          <button type="button" className="btn btn-sm btn-outline inv-toolbar-chip"
                  onClick={() => { setProductId(""); setProductName(""); }}>
            Artikel: {productName || `#${productId}`}
            <Icon n="close" s={14} />
          </button>
        )}
        {/* Erst ab zwei gesetzten Filtern: einen einzelnen Filter räumt man an
            seinem eigenen Bedienelement weg, dafür braucht es keinen Knopf. */}
        {aktiveFilter > 1 && (
          <button type="button" className="btn btn-sm btn-link inv-toolbar-reset" onClick={alleFilterWeg}>
            Filter zurücksetzen
          </button>
        )}
      </div>

      {loading && <ListSkeleton rows={6} label="Bewegungen werden geladen" />}

      {!loading && items.length === 0 && !hatFilter && (
        <EmptyState
          icon="packageMove"
          title="Noch keine Bestandsbewegungen vorhanden"
          text="Wareneingänge, Versand und Bestandskorrekturen erscheinen hier automatisch."
        />
      )}

      {!loading && items.length === 0 && hatFilter && (
        <NoResultsState
          title="Keine Bewegungen gefunden"
          text="Für die gewählten Filter gibt es keine Einträge."
          action={<button type="button" className="btn btn-outline" onClick={alleFilterWeg}>Filter zurücksetzen</button>}
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
                  {/* NICHT „Benutzer": das Backend liefert
                      COALESCE(company_name, name, email) des erfassenden Kontos,
                      und ConfidaraExpress kennt je Firma genau einen Zugang —
                      kein Mitarbeitermodell. Dort steht also das Konto, nicht
                      eine handelnde Person. */}
                  <th scope="col">Erfasst durch</th>
                </tr>
              </thead>
              <tbody>
                {items.map((m) => {
                  const [cls, text, roh] = movementTypeView(m.type);
                  const grund = adjustmentReasonLabel(m.reason);
                  const notiz = movementNote(m);
                  const ref = movementReferenceView(m);
                  return (
                    <tr key={m.id}>
                      <td className="inv-cell-meta">{dtDE(m.createdAt)}</td>
                      <td>
                        {/* Der Name führt, die SKU steht darunter: gesucht wird
                            nach dem Artikel, nicht nach seiner Nummer. */}
                        <button type="button" className="btn btn-link inv-cell-link"
                                onClick={() => navigate(`/inventory/products/${m.productId}`)}>{m.productName}</button>
                        <div className="inv-cell-meta"><span className="inv-cell-sku">{m.sku}</span></div>
                      </td>
                      <td>
                        <span className={`badge ${cls}`} title={roh ? `Serverwert: ${roh}` : undefined}>
                          <span className="badge-dot" aria-hidden="true" />{text}
                        </span>
                        {/* Grund und Notiz sind zwei verschiedene Dinge und
                            stehen deshalb getrennt: der Grund ist die
                            strukturierte Ursache der Korrektur, die Notiz freier
                            Text des Erfassers. Fehlt eines, entsteht keine
                            leere Zeile. */}
                        {grund && <div className="inv-cell-meta inv-mv-reason">{grund}</div>}
                        {notiz && <div className="inv-cell-meta inv-mv-note">Notiz: {notiz}</div>}
                      </td>
                      <td className={`ce-num${Number(m.quantity) < 0 ? " inv-num-out" : " inv-num-in"}`}>{signedQuantity(m.quantity)}</td>
                      <td className="ce-num">{formatUnits(m.onHandAfter)}</td>
                      <td>{m.warehouseName}</td>
                      <td className="inv-cell-meta"><MovementReference reference={ref} navigate={navigate} /></td>
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
              const grund = adjustmentReasonLabel(m.reason);
              const notiz = movementNote(m);
              const ref = movementReferenceView(m);
              return (
                <li key={m.id} className="ce-card inv-card">
                  <div className="inv-card-head">
                    <span className={`badge ${cls}`} title={roh ? `Serverwert: ${roh}` : undefined}>
                      <span className="badge-dot" aria-hidden="true" />{text}
                    </span>
                    <span className={`inv-card-qty${Number(m.quantity) < 0 ? " inv-num-out" : " inv-num-in"}`}>{signedQuantity(m.quantity)}</span>
                  </div>
                  <button type="button" className="btn btn-link inv-card-title"
                          onClick={() => navigate(`/inventory/products/${m.productId}`)}>{m.productName}</button>
                  <div className="inv-cell-meta">{m.sku} · {m.warehouseName}</div>
                  {grund && <div className="inv-cell-meta inv-mv-reason">{grund}</div>}
                  {notiz && <div className="inv-cell-meta inv-mv-note">Notiz: {notiz}</div>}
                  <dl className="inv-card-facts">
                    <div><dt>Zeitpunkt</dt><dd>{dtDE(m.createdAt)}</dd></div>
                    <div><dt>Bestand danach</dt><dd>{formatUnits(m.onHandAfter)}</dd></div>
                    {ref && <div><dt>Referenz</dt><dd><MovementReference reference={ref} navigate={navigate} /></dd></div>}
                    <div><dt>Erfasst durch</dt><dd>{m.createdByName || "—"}</dd></div>
                  </dl>
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

/* ── Referenz einer Bewegung ──
   Verlinkt wird NUR, wo es eine echte Zielseite gibt: ein Auftrag hat mit
   `/inventory/orders/:id` eine Kundendetailseite. Für Sendungen gibt es keine
   kundenseitige Detailroute, und die Sendungsliste kennt keinen Filter — die
   Sendungsnummer bleibt deshalb Text. Ein Link, der auf einer ungefilterten
   Liste landete, wäre ein Versprechen, das die Seite nicht hält.

   Fehlt die kundenseitige Nummer (eine Sendung ohne Bestellnummer), steht dort
   nur die Art der Referenz. Die interne ID wird nie angezeigt: sie sagt einem
   Kunden nichts. */
function MovementReference({ reference, navigate }) {
  if (!reference) return "—";
  if (reference.kind === "order" && reference.number && reference.orderId) {
    return (
      <button type="button" className="btn btn-link inv-cell-link"
              onClick={() => navigate(`/inventory/orders/${reference.orderId}`)}>
        {reference.label} {reference.number}
      </button>
    );
  }
  return <span className="inv-mv-ref">{reference.number ? `${reference.label} ${reference.number}` : reference.label}</span>;
}
