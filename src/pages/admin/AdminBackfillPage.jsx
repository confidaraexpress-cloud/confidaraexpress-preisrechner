import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, ErrorState, ListSkeleton, LoadingState } from "../../components/ui/StateView";
import { PageHeader } from "../../components/ui/PageHeader";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { selectListTotal } from "../../utils/adminOverview.mjs";
import {
  getInvoiceProductionReadiness,
  listInvoiceBackfillPreview,
  backfillInvoiceDocument,
} from "../../api/adminApi";
import {
  readinessMeta, fieldLabel, candidateStatusMeta, canBackfillCandidate, backfillOutcomeMessage,
} from "../../utils/invoiceBackfillView.mjs";

const PAGE_SIZE = 25;
const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");
const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");

const GENERIC_ERROR = "Die Backfill-Vorschau konnte nicht geladen werden. Bitte versuchen Sie es erneut.";
const LIST_ERRORS = {
  400: "Ungültige Filter. Bitte prüfen Sie Ihre Eingaben.",
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: GENERIC_ERROR,
};

// Kandidat defensiv lesen (Backend liefert camelCase; snake_case-Fallbacks schaden nicht).
const idOf = (c) => firstDefined(c.invoiceId, c.invoice_id, c.id);
const numberOf = (c) => firstDefined(c.invoiceNumber, c.invoice_number);
const shipmentOf = (c) => firstDefined(c.shipmentId, c.shipment_id);

function selectCandidates(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["candidates", "data", "items", "rows"]) if (Array.isArray(d[k])) return d[k];
  }
  return [];
}

function ChipList({ items }) {
  if (!Array.isArray(items) || items.length === 0) return <span className="adm-muted">—</span>;
  return (
    <span className="adm-chip-wrap">
      {items.map((it) => <span className="adm-chip" key={it}>{fieldLabel(it)}</span>)}
    </span>
  );
}

function StatusCell({ c }) {
  const [cls, label] = candidateStatusMeta(c);
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ── Produktionsbereitschaft-Karte — rein informativ, blockiert NICHTS mehr ──
function ReadinessCard({ readiness, loading, error, onReload }) {
  const [cls, label] = readinessMeta(readiness);
  const yesNo = (b) => (b === true ? "ja" : b === false ? "nein" : "—");
  const num = (n) => (Number.isFinite(Number(n)) ? String(Number(n)) : "—");
  return (
    <div className="adm-card">
      <div className="adm-card-head">
        <Icon n="shieldCheck" s={17} /> Produktionsbereitschaft Rechnungen
        <button type="button" className="btn btn-outline btn-sm adm-card-head-action" onClick={onReload} disabled={loading}>
          <Icon n="refresh" s={13} /> Aktualisieren
        </button>
      </div>
      <div className="adm-card-body">
        {loading ? (
          <LoadingState text="Produktionsbereitschaft wird geprüft …" />
        ) : error ? (
          <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error}</div>
        ) : !readiness ? (
          <p className="adm-muted">Keine Bereitschaftsdaten verfügbar.</p>
        ) : (
          <>
            <div className="adm-readiness-head">
              <span className={`badge ${cls}`}>{label}</span>
              {readiness.registerRequired && (
                <span className="adm-chip"><Icon n="info" s={13} /> Registerpflicht (eingetragene Rechtsform)</span>
              )}
            </div>
            <dl className="adm-kv">
              <div className="adm-kv-item"><dt>Testmodus</dt><dd>{readiness.testMode ? "aktiv – keine automatischen echten Rechnungen" : "aus"}</dd></div>
              <div className="adm-kv-item"><dt>E-Mail-Versand bereit</dt><dd>{yesNo(readiness.emailProviderReady)}</dd></div>
              <div className="adm-kv-item"><dt>RESEND konfiguriert</dt><dd>{yesNo(readiness.resendConfigured)}</dd></div>
              <div className="adm-kv-item"><dt>Datenbank/Schema bereit</dt><dd>{yesNo(readiness.databaseReady)}</dd></div>
              <div className="adm-kv-item"><dt>PDF-Backfill: erzeugbar</dt><dd>{num(readiness.backfillCandidateCount)}</dd></div>
              <div className="adm-kv-item"><dt>PDF-Backfill: unvollständig</dt><dd>{num(readiness.blockedCount)}</dd></div>
              <div className="adm-kv-item"><dt>Rechnungen ohne PDF gesamt</dt><dd>{num(readiness.legacyInvoiceCount)}</dd></div>
            </dl>
            {Array.isArray(readiness.missingFields) && readiness.missingFields.length > 0 && (
              <div className="adm-readiness-block">
                <span className="adm-readiness-label">Fehlende Pflichtangaben</span>
                <ChipList items={readiness.missingFields} />
              </div>
            )}
            {Array.isArray(readiness.placeholderFields) && readiness.placeholderFields.length > 0 && (
              <div className="adm-readiness-block">
                <span className="adm-readiness-label adm-readiness-label-warn">Platzhalter-/Testwerte (vor dem ersten echten Kunden ersetzen)</span>
                <ChipList items={readiness.placeholderFields} />
              </div>
            )}
            <p className="adm-support-hint">
              Diese Anzeige ist rein informativ — sie zeigt, welche Stammdaten vor dem ersten echten
              Kunden noch ersetzt werden müssen, blockiert aber weder den PDF-Backfill unten noch
              künftige Buchungen. Aus Sicherheitsgründen werden ausschließlich Feldnamen, Status und
              Zähler angezeigt — niemals Aussteller-, Bank- oder Steuerwerte.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function AdminBackfillPage() {
  const [readiness, setReadiness] = useState(null);
  const [readinessLoading, setReadinessLoading] = useState(true);
  const [readinessError, setReadinessError] = useState("");

  const [draft, setDraft] = useState({ status: "", generatable: "all" });
  const [applied, setApplied] = useState({ status: "", generatable: "all" });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageMsg, setPageMsg] = useState(null); // { type, text }

  // Bestätigungsmodal für die einzige mutierende Aktion: PDF erzeugen.
  const [modalCandidate, setModalCandidate] = useState(null);
  const [modalBusy, setModalBusy] = useState(false);

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true);
    setReadinessError("");
    try {
      const r = await getInvoiceProductionReadiness();
      if (!r.ok) {
        if (r.status !== 401 && r.status !== 403) setReadinessError("Die Produktionsbereitschaft konnte nicht geladen werden.");
        setReadiness(null);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      setReadiness(d && typeof d === "object" ? d : null);
    } catch {
      setReadinessError("Die Produktionsbereitschaft konnte nicht geladen werden.");
      setReadiness(null);
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  const toApiFilters = (f) => {
    const p = {};
    if (f.status === "missing" || f.status === "ready") p.status = f.status;
    if (f.generatable === "yes") p.generatable = "true";
    if (f.generatable === "no") p.generatable = "false";
    return p;
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await listInvoiceBackfillPreview({ page, pageSize: PAGE_SIZE, ...toApiFilters(applied) });
      if (!r.ok) {
        if (r.status !== 401 && r.status !== 403) setError(LIST_ERRORS[r.status] || GENERIC_ERROR);
        setRows([]); setTotal(null);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      setRows(selectCandidates(d));
      setTotal(selectListTotal(d));
    } catch {
      setError(GENERIC_ERROR);
      setRows([]); setTotal(null);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { loadReadiness(); }, [loadReadiness]);
  useEffect(() => { loadList(); }, [loadList]);

  const setField = (k, v) => setDraft((p) => ({ ...p, [k]: v }));
  const applyFilters = () => { setPage(1); setApplied(draft); };
  const resetFilters = () => { setPage(1); setDraft({ status: "", generatable: "all" }); setApplied({ status: "", generatable: "all" }); };

  const hasMore = Number.isFinite(total) ? page * PAGE_SIZE < total : rows.length >= PAGE_SIZE;
  const showPagination = !error && (rows.length > 0 || page > 1);

  const openModal = (candidate) => { setPageMsg(null); setModalCandidate(candidate); };
  const closeModal = () => { if (!modalBusy) setModalCandidate(null); };

  const confirmBackfill = async () => {
    if (!modalCandidate) return;
    const id = idOf(modalCandidate);
    setModalBusy(true);
    setPageMsg(null);
    try {
      const r = await backfillInvoiceDocument(id);
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        const serverMsg = d && typeof d.message === "string" && d.message ? d.message : null;
        setPageMsg({ type: "error", text: serverMsg
          || (r.status === 404 ? "Rechnung wurde nicht gefunden."
          : r.status === 429 ? "Zu viele Admin-Aktionen. Bitte kurz warten."
          : "Die PDF-Erzeugung ist fehlgeschlagen.") });
        return;
      }
      setPageMsg(backfillOutcomeMessage(d.outcome));
      // Serverwahrheit neu laden — kein optimistisches UI.
      loadList();
      loadReadiness();
    } catch {
      setPageMsg({ type: "error", text: "Die PDF-Erzeugung ist fehlgeschlagen." });
    } finally {
      setModalBusy(false);
      setModalCandidate(null);
    }
  };

  const back = (
    <Link to="/admin/invoices" className="adm-back">
      <Icon n="chevronLeft" s={16} /> Zurück zur Rechnungsliste
    </Link>
  );

  return (
    <div className="adm-page">
      {/* Kopfbereich — derselbe Seitenkopf wie in den Adminlisten. Der frühere
          fünfzeilige Untertitel trug die gesamte Erklärung; er sagt jetzt in
          einem Satz, was die Seite tut, und die Zusicherungen stehen als
          eigener Hinweis darunter — lesbar statt überfliegbar. Fachlich ist
          kein Wort entfallen. */}
      <PageHeader
        variant="admin"
        eyebrow="Abrechnung"
        backLink={back}
        title="Interne Vorschau-PDFs erzeugen"
        subtitle={'Erzeugt für bestehende, tatsächlich gebuchte Sendungen ein fehlendes Rechnungs-PDF als interne Vorschau — mit Wasserzeichen „INTERNE VORSCHAU – NICHT ZAHLEN".'}
      />

      <p className="adm-note adm-head-note" role="note">
        <Icon n="shieldCheck" s={16} />
        <span>
          Das Dokument bleibt dauerhaft ein Testdokument: Es wird <strong>nicht</strong> produktiv,
          verbraucht <strong>keine</strong> neue Rechnungsnummer, ändert <strong>keine</strong>
          {" "}Beträge oder Datumsangaben und löst <strong>keinen</strong> E-Mail-Versand aus.
          Jede Aktion wird serverseitig geprüft und im Admin-Audit protokolliert.
        </span>
      </p>

      <ReadinessCard readiness={readiness} loading={readinessLoading} error={readinessError} onReload={loadReadiness} />

      {pageMsg && (
        <div className={`alert ${pageMsg.type === "success" ? "alert-success" : pageMsg.type === "info" ? "alert-info" : "alert-error"}`} role={pageMsg.type === "error" ? "alert" : "status"}>
          <Icon n={pageMsg.type === "success" ? "check" : pageMsg.type === "info" ? "info" : "x"} s={16} />{pageMsg.text}
        </div>
      )}

      <div className="adm-section-head">
        <div>
          <h2 className="adm-section-title">Backfill-Vorschau</h2>
          <p className="adm-section-sub">Alle Rechnungen zu tatsächlich gebuchten Sendungen. Die Aktion ist nur aktiv, wenn das PDF objektiv erzeugbar ist.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={loadList} disabled={loading}>
          <Icon n="refresh" s={14} /> Aktualisieren
        </button>
      </div>

      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); applyFilters(); }}>
        <div className="adm-filter-field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={draft.status} onChange={(e) => setField("status", e.target.value)}>
            <option value="">Alle</option>
            <option value="missing">Ohne PDF</option>
            <option value="ready">PDF vorhanden</option>
          </select>
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-generatable">Erzeugbar</label>
          <select id="f-generatable" value={draft.generatable} onChange={(e) => setField("generatable", e.target.value)}>
            <option value="all">Alle</option>
            <option value="yes">Nur erzeugbare</option>
            <option value="no">Nur unvollständige</option>
          </select>
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary btn-sm"><Icon n="filter" s={14} /> Anwenden</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters}>Zurücksetzen</button>
        </div>
      </form>

      {loading ? (
        <div className="table-card"><ListSkeleton rows={5} label="Backfill-Vorschau wird geladen …" /></div>
      ) : error ? (
        <div className="ce-card">
          <ErrorState
            title={error}
            action={(
              <button type="button" className="btn btn-outline btn-sm" onClick={loadList}>
                <Icon n="refresh" s={14} /> Erneut versuchen
              </button>
            )}
          />
        </div>
      ) : rows.length === 0 ? (
        <div className="ce-card">
          <EmptyState
            icon="invoice"
            title="Keine Rechnungen gefunden"
            text="Für die gewählten Filter gibt es keine Kandidaten für einen PDF-Backfill."
          />
        </div>
      ) : (
        <>
        <div className="table-card adm-bf-table">
          <div className="table-scroll">
            <table>
              <caption className="sr-only">Rechnungen ohne Dokument</caption>
              <thead>
                <tr>
                  <th scope="col">Rechnung-Nr.</th>
                  <th scope="col">Status</th>
                  <th scope="col">Fehlende Felder</th>
                  <th scope="col">Shipment-ID</th>
                  <th scope="col" className="adm-actions-col">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => {
                  const id = idOf(c);
                  return (
                    <tr key={id != null ? `inv-${id}` : `row-${i}`}>
                      <td className="adm-mono">
                        {id != null
                          ? <Link className="adm-idlink" to={`/admin/invoices/${encodeURIComponent(id)}`}>{dash(numberOf(c))}</Link>
                          : dash(numberOf(c))}
                      </td>
                      <td><StatusCell c={c} /></td>
                      <td><ChipList items={c.missingFields} /></td>
                      <td className="adm-mono">{dash(shipmentOf(c))}</td>
                      <td>
                        <div className="adm-row-actions">
                          <button type="button" className="btn btn-primary btn-xs" disabled={!canBackfillCandidate(c)} onClick={() => openModal(c)}>
                            <Icon n="form" s={13} /> Vorschau-PDF erzeugen
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobil: dieselben Angaben als Karten. Fünf Spalten waren unterhalb
            von ~430 px nur noch horizontal scrollend lesbar. */}
        <ul className="adm-bf-cards">
          {rows.map((c, i) => {
            const id = idOf(c);
            return (
              <li className="adm-scard" key={id != null ? `card-inv-${id}` : `card-row-${i}`}>
                <div className="adm-scard-head">
                  <span className="adm-mono">
                    {id != null
                      ? <Link className="adm-idlink" to={`/admin/invoices/${encodeURIComponent(id)}`}>{dash(numberOf(c))}</Link>
                      : dash(numberOf(c))}
                  </span>
                  <StatusCell c={c} />
                </div>
                <dl className="adm-scard-kv">
                  <div><dt>Fehlende Felder</dt><dd><ChipList items={c.missingFields} /></dd></div>
                  <div><dt>Shipment-ID</dt><dd className="adm-mono">{dash(shipmentOf(c))}</dd></div>
                </dl>
                <div className="adm-scard-actions">
                  <button type="button" className="btn btn-primary btn-sm" disabled={!canBackfillCandidate(c)} onClick={() => openModal(c)}>
                    <Icon n="form" s={13} /> Vorschau-PDF erzeugen
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        </>
      )}

      {showPagination && (
        <div className="adm-pagination">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => page > 1 && setPage((p) => p - 1)} disabled={loading || page <= 1}>
            <Icon n="chevronLeft" s={14} /> Zurück
          </button>
          <span className="adm-page-ind">Seite {page}{Number.isFinite(total) ? ` · ${total} gesamt` : ""}</span>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => hasMore && setPage((p) => p + 1)} disabled={loading || !hasMore}>
            Weiter <Icon n="chevronRight" s={14} />
          </button>
        </div>
      )}

      {/* Bestätigungsdialog — die einzige mutierende Aktion erst nach bewusster
          Bestätigung. Bis Paket E war dieser Dialog handgebaut und hatte als
          einziger im Adminbereich WEDER Fokusfalle NOCH Fokusrückgabe NOCH
          Escape; er läuft jetzt über die gemeinsame ConfirmDialog-Komponente.
          Der Wortlaut ist unverändert. */}
      {modalCandidate && (
        <ConfirmDialog
          title="Interne Vorschau erzeugen?"
          text={'Erzeugt aus den gespeicherten historischen Daten dieser Rechnung eine INTERNE VORSCHAU (PDF mit Wasserzeichen „INTERNE VORSCHAU – NICHT ZAHLEN"). Das Dokument bleibt ein Testdokument und wird NICHT produktiv. Es entsteht KEINE neue Rechnungsnummer; Beträge und Rechnungs-/Leistungsdatum bleiben unverändert. Es wird KEINE E-Mail versendet.'}
          subline={`Rechnung ${dash(numberOf(modalCandidate))} · #${dash(idOf(modalCandidate))}`}
          note="Die Aktion wird im Admin-Audit protokolliert und serverseitig erneut geprüft."
          icon="form"
          confirmLabel="Vorschau erzeugen"
          busy={modalBusy}
          busyLabel="Wird erzeugt …"
          onCancel={closeModal}
          onConfirm={confirmBackfill}
        />
      )}
    </div>
  );
}
