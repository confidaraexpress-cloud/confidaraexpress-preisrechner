import React, { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import {
  listAdminShipments,
  deleteAdminShipmentDraft,
  deleteAllAdminShipmentDrafts,
} from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { shipmentStatusMeta } from "../../utils/adminShipments";
import { selectListTotal, selectListHasMore } from "../../utils/adminOverview.mjs";
import { DateField } from "../../components/admin/DateField";
import {
  EMPTY_SHIPMENT_FILTERS,
  HAS_TRACKING_OPTIONS,
  SHIPMENT_STATUS_FILTER_OPTIONS,
  activeShipmentFilterChips,
  customerIdentity,
  hasActiveShipmentFilters,
  priceDisplay,
  shipmentEmptyState,
  shipmentFields,
  shipmentIdentity,
  shipmentMarkers,
  shipmentRouteLine,
  shippingModeLabel,
  toShipmentApiFilters,
  validateShipmentFilters,
  canDeleteShipmentDraft,
  selectDeletableDraftTotal,
  draftDeleteError,
  draftBulkDeleteError,
  draftBulkDeleteMessage,
  draftBulkConfirmLabel,
  draftBulkConfirmText,
  shipmentPaginationView,
} from "../../utils/adminShipmentView.mjs";

const PAGE_SIZE = 25;

const ERROR_MESSAGES = {
  400: "Ungültige Filter. Bitte prüfen Sie Ihre Eingaben.",
  404: "Sendungen sind derzeit nicht verfügbar.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Die Sendungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Die Sendungen konnten nicht geladen werden. Bitte versuchen Sie es erneut.";

// selectTotal/selectHasMore lagen bis Paket E in jeder Adminliste als eigene,
// fast wortgleiche Kopie. Sie stehen jetzt einmal in utils/adminOverview.mjs —
// gleiches Verhalten, eine Quelle.
// ── Response defensiv lesen — keine Annahme über die exakte Backend-Struktur ──
function selectRows(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["shipments", "data", "items", "results", "rows"]) {
      if (Array.isArray(d[k])) return d[k];
    }
  }
  return [];
}

const rowKeyOf = (r, i) => shipmentFields(r).id ?? `row-${i}`;
const detailPath = (id) => `/admin/shipments/${encodeURIComponent(id)}`;

function fmtDate(v) {
  if (!v) return "";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("de-DE");
}

function StatusBadge({ status }) {
  const [cls, label] = shipmentStatusMeta(status);
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ── Zellinhalte (geteilt zwischen Tabelle und Mobilkarte) ────────────────────

// Spalte „Sendung": Bestellnummer primär (Link), Datum sekundär. Die interne
// Sendungs-ID ist bewusst NICHT mehr die Navigation.
function ShipmentCell({ row }) {
  const f = shipmentFields(row);
  const ident = shipmentIdentity(row);
  const muted = ident.kind !== "order_number";
  return (
    <div className="adm-ship">
      {f.id != null ? (
        <Link className={`adm-ship-no${muted ? " adm-ship-no-muted" : ""}`} to={detailPath(f.id)}>
          {ident.primary}
        </Link>
      ) : (
        <span className="adm-ship-no">{ident.primary}</span>
      )}
      {f.createdAt && <span className="adm-ship-date">{fmtDate(f.createdAt)}</span>}
    </div>
  );
}

// Spalte „Kunde": Firma primär, Kundennummer sekundär — nie die user_id.
function CustomerCell({ row }) {
  const f = shipmentFields(row);
  const c = customerIdentity(row);
  return (
    <div className="adm-ship-cust">
      {c.known && f.userId != null ? (
        <Link className="adm-ship-cust-name" to={`/admin/users/${encodeURIComponent(f.userId)}`}>
          {c.primary}
        </Link>
      ) : (
        <span className={`adm-ship-cust-name${c.known ? "" : " adm-muted"}`}>{c.primary}</span>
      )}
      {c.secondary && <span className="adm-ship-cust-no">{c.secondary}</span>}
    </div>
  );
}

// Spalte „Versand": Carrier + Versandart, darunter Route + Paketanzahl.
function ShippingCell({ row }) {
  const f = shipmentFields(row);
  const line = shipmentRouteLine(row);
  return (
    <div className="adm-ship-way">
      <span className="adm-ship-carrier">
        {f.carrier ? resolveCarrierName(f.carrier) : "Carrier noch nicht gewählt"}
        <span className="adm-ship-mode"> · {shippingModeLabel(row)}</span>
      </span>
      {line && <span className="adm-ship-route">{line}</span>}
    </div>
  );
}

// Status + kompakte Tracking-/Label-Marker (statt zweier breiter Ja/Nein-Spalten).
function StatusCell({ row }) {
  const markers = shipmentMarkers(row);
  return (
    <div className="adm-ship-status">
      <StatusBadge status={shipmentFields(row).status} />
      {markers.length > 0 && (
        <span className="adm-ship-markers">
          {markers.map((m) => (
            <span key={m.key} className="adm-ship-marker">
              <Icon n={m.key === "tracking" ? "mapPin" : "invoice"} s={12} /> {m.label}
            </span>
          ))}
        </span>
      )}
    </div>
  );
}

function PriceCell({ row }) {
  const p = priceDisplay(row);
  if (p.known) return <span className="adm-num">{money(p.value)}</span>;
  return <span className="adm-muted adm-ship-noprice">{p.text}</span>;
}

export default function AdminShipmentsPage() {
  const [draft, setDraft] = useState(EMPTY_SHIPMENT_FILTERS);
  const [applied, setApplied] = useState(EMPTY_SHIPMENT_FILTERS);
  const [filterError, setFilterError] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  // ── Entwurfsaufräumung ────────────────────────────────────────────────────
  // draftTotal: systemweite Anzahl löschbarer Entwürfe (additiv aus der Listenantwort,
  // UNABHÄNGIG von den gesetzten Filtern) — speist Sichtbarkeit und Wortlaut der
  // Sammelaktion. null = unbekannt; dann nennt der Dialog bewusst keine Zahl.
  const [draftTotal, setDraftTotal] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null); // { id, label } oder null
  const [bulkOpen, setBulkOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);      // sperrt beide Dialoge
  const [deleteError, setDeleteError] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await listAdminShipments({ page, pageSize: PAGE_SIZE, ...toShipmentApiFilters(applied) });
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) setError(ERROR_MESSAGES[r.status] || GENERIC_ERROR);
        setRows([]); setTotal(null); setHasMore(false); setDraftTotal(null);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const list = selectRows(d);
      const t = selectListTotal(d);
      setRows(list);
      setTotal(t);
      setDraftTotal(selectDeletableDraftTotal(d));
      setHasMore(selectListHasMore(d, list.length, page, PAGE_SIZE, t));
    } catch {
      setError(GENERIC_ERROR);
      setRows([]); setTotal(null); setHasMore(false); setDraftTotal(null);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  const setField = (k, v) => setDraft((p) => ({ ...p, [k]: v }));

  // Filter anwenden: erst validieren, dann Pagination zurücksetzen. Während ein
  // Request läuft, ist der Button gesperrt — kein Doppel-Request durch Doppelklick.
  const applyFilters = () => {
    const v = validateShipmentFilters(draft);
    if (!v.valid) { setFilterError(v.error); return; }
    setFilterError("");
    setPage(1);
    setApplied(draft);
  };
  const resetFilters = () => {
    setFilterError("");
    setPage(1);
    setDraft(EMPTY_SHIPMENT_FILTERS);
    setApplied(EMPTY_SHIPMENT_FILTERS);
  };

  const goPrev = () => { if (page > 1) setPage((p) => p - 1); };
  const goNext = () => { if (hasMore) setPage((p) => p + 1); };

  // ── Löschaktionen ─────────────────────────────────────────────────────────
  // Beide laufen ausschließlich über einen Bestätigungsdialog (kein natives confirm()).
  // `deleteBusy` sperrt währenddessen Auslöser UND Dialogbutton — ein zweiter Klick kann
  // keine zweite Anfrage auslösen. Nach Erfolg wird die Liste über load() neu geladen:
  // damit bleiben Filter, Seite und Sortierung erhalten (kein Browser-Reload), und der
  // Entwurfszähler kommt frisch vom Server statt lokal fortgeschrieben zu werden.
  const closeDialogs = () => {
    if (deleteBusy) return;          // während eines laufenden Requests nicht schließbar
    setPendingDelete(null);
    setBulkOpen(false);
    setDeleteError("");
  };

  const confirmSingleDelete = async () => {
    if (!pendingDelete || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const r = await deleteAdminShipmentDraft(pendingDelete.id);
      if (!r.ok) {
        const msg = draftDeleteError(r.status);
        if (msg) setDeleteError(msg);   // 401/403 → null, zentrales Auth-Verhalten greift
        // 404/409 bedeuten: der Serverzustand weicht ab. Die Liste wird trotzdem neu
        // geladen, damit der Admin sofort den tatsächlichen Stand sieht.
        if (r.status === 404 || r.status === 409) await load();
        return;
      }
      setPendingDelete(null);
      setDeleteNotice("Entwurf wurde gelöscht.");
      await load();
    } catch {
      setDeleteError(draftDeleteError(0));
    } finally {
      setDeleteBusy(false);
    }
  };

  const confirmBulkDelete = async () => {
    if (deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError("");
    try {
      const r = await deleteAllAdminShipmentDrafts();
      if (!r.ok) {
        const msg = draftBulkDeleteError(r.status);
        if (msg) setDeleteError(msg);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      // Die Zahl stammt IMMER aus der Backendantwort — nie aus der lokalen Liste.
      setBulkOpen(false);
      setDeleteNotice(draftBulkDeleteMessage(Number(d?.deletedCount)));
      // Die Ergebnismenge ist gerade systemweit kleiner geworden — dieselbe Lage wie beim
      // Anwenden oder Zurücksetzen eines Filters, und deshalb dieselbe Antwort: zurück auf
      // Seite 1. Ohne das landet ein Admin, der auf Seite 3 aufgeräumt hat, auf einer nun
      // leeren Seite 3 und müsste sich selbst zurückblättern. Der Seitenwechsel löst den
      // Ladeeffekt aus; nur wenn wir bereits auf Seite 1 stehen, laden wir direkt neu.
      if (page !== 1) setPage(1);
      else await load();
    } catch {
      setDeleteError(draftBulkDeleteError(0));
    } finally {
      setDeleteBusy(false);
    }
  };

  const chips = useMemo(() => activeShipmentFilterChips(applied), [applied]);
  const emptyState = shipmentEmptyState({ count: rows.length, filters: applied });
  const showPagination = !error && !loading && (rows.length > 0 || page > 1);
  // Trennt Gesamtanzahl (Sendungen) von Seitenanzahl — die frühere "Seite 1 · 5
  // gesamt" vermischte beides und ließ bei genau einer Seite zwei sinnlos
  // deaktivierte Buttons stehen. showNav ist nur dann false, wenn total bekannt
  // ist UND es ohnehin nie eine zweite Seite gäbe.
  const pagination = useMemo(
    () => shipmentPaginationView({ page, pageSize: PAGE_SIZE, total }),
    [page, total],
  );

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title={<>Sendungen</>}
        subtitle={<>Sendungsübersicht — nur Einsicht. Keine Adressen, keine Labeldaten, Kennungen maskiert.</>}
        actions={(
          <>
            {/* Aufräumaktion — bewusst NICHT die primäre Aktion und nicht in den
                Filterbereich gemischt: sie steht als sekundäre, destruktiv
                gekennzeichnete Verwaltungsaktion neben „Aktualisieren". Sichtbar nur,
                wenn es tatsächlich etwas zu bereinigen gibt (draftTotal > 0) — draftTotal
                zählt dabei NUR technische, nicht gespeicherte Entwürfe: gespeicherte
                Kundenentwürfe lässt diese Aktion unangetastet (siehe ConfirmDialog unten). */}
            {Number.isFinite(draftTotal) && draftTotal > 0 && (
              <button
                type="button"
                className="btn btn-outline btn-sm adm-btn-danger"
                onClick={() => { setDeleteError(""); setDeleteNotice(""); setBulkOpen(true); }}
                disabled={loading || deleteBusy}
              >
                <Icon n="trash" s={14} /> {draftBulkConfirmLabel(draftTotal)}
              </button>
            )}
            <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading || deleteBusy}>
              <Icon n="refresh" s={14} /> Aktualisieren
            </button>
          </>
        )}
      />

      {/* Ergebnis der letzten Löschaktion. Erfolg und Fehler stehen an derselben
          Stelle über der Liste — der Admin muss nicht suchen, wohin die Rückmeldung
          gewandert ist. role="status"/"alert" macht sie auch für Screenreader hörbar. */}
      {deleteNotice && !deleteError && (
        <div className="adm-note adm-note--info adm-head-note" role="status">
          <Icon n="check" s={14} /> {deleteNotice}
        </div>
      )}
      {deleteError && !pendingDelete && !bulkOpen && (
        <div className="adm-note adm-note--warning adm-head-note" role="alert">
          <Icon n="info" s={14} /> {deleteError}
        </div>
      )}

      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); applyFilters(); }}>
        <div className="adm-filter-field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={draft.status} onChange={(e) => setField("status", e.target.value)}>
            {SHIPMENT_STATUS_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-carrier">Carrier</label>
          <input
            id="f-carrier" type="text" placeholder="z. B. ups"
            value={draft.carrier} onChange={(e) => setField("carrier", e.target.value)}
          />
        </div>
        <DateField id="f-from" label="Zeitraum von" value={draft.created_from} onChange={(v) => setField("created_from", v)} />
        <DateField id="f-to" label="Zeitraum bis" value={draft.created_to} onChange={(v) => setField("created_to", v)} />
        <div className="adm-filter-field">
          <label htmlFor="f-track">Tracking</label>
          <select id="f-track" value={draft.has_tracking} onChange={(e) => setField("has_tracking", e.target.value)}>
            {HAS_TRACKING_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-user">Kunden-ID</label>
          <input
            id="f-user" type="text" inputMode="numeric" placeholder="optional"
            value={draft.user_id} onChange={(e) => setField("user_id", e.target.value)}
            aria-describedby={filterError ? "f-error" : undefined}
            aria-invalid={filterError ? "true" : undefined}
          />
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary btn-sm" disabled={loading}>
            <Icon n="filter" s={14} /> Anwenden
          </button>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters} disabled={loading}>
            Zurücksetzen
          </button>
        </div>
        {/* Das Backend bietet für Sendungen keine Freitextsuche — das wird hier
            ehrlich benannt statt eine globale Suche vorzutäuschen. */}
        <p className="adm-support-hint adm-filter-hint">
          Es gibt keine Freitextsuche über Kunde oder Bestellnummer — filtern Sie über Status,
          Carrier, Zeitraum, Tracking oder die Kunden-ID.
        </p>
        {filterError && <p id="f-error" className="field-error adm-filter-error" role="alert">{filterError}</p>}
      </form>

      {chips.length > 0 && (
        <div className="adm-filter-chips">
          <span className="adm-filter-chips-label">Aktive Filter:</span>
          {chips.map((c) => <span key={c.key} className="adm-chip">{c.label}</span>)}
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters} disabled={loading}>
            <Icon n="x" s={13} /> Filter zurücksetzen
          </button>
        </div>
      )}

      {loading ? (
        <div className="table-card">
          <ListSkeleton rows={6} label="Sendungen werden geladen …" />
        </div>
      ) : error ? (
        <div className="ce-card">
          <ErrorState
            title={error}
            action={(
              <button type="button" className="btn btn-outline btn-sm" onClick={load}>
                <Icon n="refresh" s={14} /> Erneut versuchen
              </button>
            )}
          />
        </div>
      ) : emptyState.show ? (
        <div className="table-card">
          <div className="empty">
            <div className="empty-icon" aria-hidden="true"><Icon n={hasActiveShipmentFilters(applied) ? "search" : "package"} s={24} /></div>
            <div className="empty-title">{emptyState.title}</div>
            <p className="empty-text">{emptyState.text}</p>
            {hasActiveShipmentFilters(applied) && (
              <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters}>
                <Icon n="x" s={13} /> Filter zurücksetzen
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Desktop: sechs Spalten — kein horizontales Scrollen mehr. */}
          <div className="table-card adm-ships-table">
            <table>
              <caption className="sr-only">
                Sendungsliste, Seite {page}. Spalten: Sendung, Kunde, Versand, Status, Preis, Aktion.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Sendung</th>
                  <th scope="col">Kunde</th>
                  <th scope="col">Versand</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="adm-num">Preis</th>
                  <th scope="col" className="adm-col-action">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const f = shipmentFields(row);
                  return (
                    <tr key={rowKeyOf(row, i)}>
                      <td><ShipmentCell row={row} /></td>
                      <td><CustomerCell row={row} /></td>
                      <td><ShippingCell row={row} /></td>
                      <td><StatusCell row={row} /></td>
                      <td className="adm-num"><PriceCell row={row} /></td>
                      <td className="adm-col-action">
                        <div className="adm-row-actions">
                          {f.id != null && (
                            <Link className="btn btn-outline btn-sm" to={detailPath(f.id)}>Details</Link>
                          )}
                          {/* Ausschließlich bei Entwürfen. Bei jeder anderen Zeile
                              existiert der Knopf gar nicht — nicht nur deaktiviert. */}
                          {canDeleteShipmentDraft(row) && (
                            <button
                              type="button"
                              className="btn btn-icon btn-sm adm-btn-danger"
                              onClick={() => { setDeleteError(""); setDeleteNotice(""); setPendingDelete({ id: f.id, label: shipmentIdentity(row).primary }); }}
                              disabled={deleteBusy}
                              aria-label={`Entwurf ${shipmentIdentity(row).primary} löschen`}
                              title="Entwurf löschen"
                            >
                              <Icon n="trash" s={14} />
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

          {/* Mobil: Karten statt Tabelle — kein horizontaler Seitenüberlauf. */}
          <ul className="adm-ships-cards">
            {rows.map((row, i) => {
              const f = shipmentFields(row);
              return (
                <li className="adm-scard" key={`c-${rowKeyOf(row, i)}`}>
                  <div className="adm-scard-head">
                    <ShipmentCell row={row} />
                    <StatusCell row={row} />
                  </div>
                  <dl className="adm-scard-kv">
                    <div><dt>Kunde</dt><dd><CustomerCell row={row} /></dd></div>
                    <div><dt>Versand</dt><dd><ShippingCell row={row} /></dd></div>
                    <div><dt>Preis</dt><dd><PriceCell row={row} /></dd></div>
                  </dl>
                  <div className="adm-scard-actions">
                    {f.id != null && (
                      <Link className="btn btn-outline btn-sm" to={detailPath(f.id)}>Details</Link>
                    )}
                    {/* Auf der Karte trägt die Aktion ihre Beschriftung sichtbar — dort
                        ist Platz, und ein alleinstehendes Icon wäre schwerer zu treffen. */}
                    {canDeleteShipmentDraft(row) && (
                      <button
                        type="button"
                        className="btn btn-outline btn-sm adm-btn-danger"
                        onClick={() => { setDeleteError(""); setDeleteNotice(""); setPendingDelete({ id: f.id, label: shipmentIdentity(row).primary }); }}
                        disabled={deleteBusy}
                      >
                        <Icon n="trash" s={14} /> Löschen
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {showPagination && (
        <div className="adm-pagination">
          {/* Bei genau einer Seite gibt es keine sinnvolle Navigation — die
              Buttons entfallen GANZ (nicht nur deaktiviert), es bleibt bei der
              reinen Gesamtanzahl ("5 Sendungen"/"1 Sendung"). Ist total
              ausnahmsweise unbekannt, bleibt die Navigation aus Vorsicht
              nutzbar (showNav dann true) — ohne Gesamtzahl lässt sich eine
              weitere Seite nicht ausschließen. */}
          {pagination.showNav && (
            <button type="button" className="btn btn-outline btn-sm" onClick={goPrev} disabled={loading || page <= 1}>
              <Icon n="chevronLeft" s={14} /> Zurück
            </button>
          )}
          {/* aria-live: ein Seitenwechsel wird Screenreadern angesagt, ohne den
              Fokus zu verschieben — derselbe Mechanismus wie deleteNotice. */}
          <span className="adm-page-ind" aria-live="polite">{pagination.label}</span>
          {pagination.showNav && (
            <button type="button" className="btn btn-outline btn-sm" onClick={goNext} disabled={loading || !hasMore}>
              Weiter <Icon n="chevronRight" s={14} />
            </button>
          )}
        </div>
      )}

      {/* Einzellöschung — destruktiv (roter Bestätigungsbutton), mit Fokusfalle,
          Fokusrückgabe und Escape aus der gemeinsamen Dialogkomponente. */}
      {pendingDelete && (
        <ConfirmDialog
          title="Entwurf löschen?"
          text="Dieser Entwurf wird endgültig gelöscht. Gebuchte oder abgeschlossene Sendungen sind davon nicht betroffen."
          subline={pendingDelete.label ? `Sendung ${pendingDelete.label}` : undefined}
          note={deleteError || "Die Aktion wird im Admin-Audit protokolliert und serverseitig erneut geprüft."}
          icon="trash"
          confirmIcon="trash"
          confirmLabel="Entwurf löschen"
          danger
          busy={deleteBusy}
          busyLabel="Wird gelöscht …"
          onCancel={closeDialogs}
          onConfirm={confirmSingleDelete}
        />
      )}

      {/* Sammellöschung („Entwürfe bereinigen") — nennt die systemweite Zahl, sofern das
          Backend sie geliefert hat, und stellt ausdrücklich klar, was NICHT betroffen ist:
          vom Kunden gespeicherte Entwürfe (Produktentscheidung) sowie gebuchte/stornierte/
          abgeschlossene Sendungen. Sie hängt bewusst nicht an den gesetzten Listenfiltern. */}
      {bulkOpen && (
        <ConfirmDialog
          title="Entwürfe bereinigen?"
          text={draftBulkConfirmText(draftTotal)}
          note={deleteError || "Gilt systemweit — unabhängig von den gesetzten Filtern. Die Aktion wird im Admin-Audit protokolliert."}
          icon="trash"
          confirmIcon="trash"
          confirmLabel={draftBulkConfirmLabel(draftTotal)}
          danger
          busy={deleteBusy}
          busyLabel="Wird gelöscht …"
          onCancel={closeDialogs}
          onConfirm={confirmBulkDelete}
        />
      )}
    </div>
  );
}
