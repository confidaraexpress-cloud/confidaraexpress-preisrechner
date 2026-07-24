import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import {
  getInvoiceProductionReadiness,
  listInvoiceBackfillPreview,
  backfillInvoiceProductionDocument,
  sendBackfilledInvoiceEmail,
} from "../../api/adminApi";
import {
  classificationMeta, readinessMeta, fieldLabel, warningLabel,
  isProductionCandidate, isBackfilled, backfillRowActions,
  backfillOutcomeMessage, backfillEmailOutcomeMessage,
} from "../../utils/invoiceBackfillView.mjs";
import { documentStatusMeta } from "../../utils/invoiceView.mjs";
import { fetchAdminInvoicePdf, downloadAdminInvoicePdf } from "../../utils/downloadInvoicePdf";
import { InvoicePdfPreviewModal } from "../../components/dashboard/InvoicePdfPreviewModal";

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
function selectTotal(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const pag = d.pagination && typeof d.pagination === "object" ? d.pagination : {};
  const n = Number(firstDefined(pag.total, pag.count, d.total));
  return Number.isFinite(n) ? n : null;
}

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

// Status-Zelle: Produktiv (ggf. rückwirkend) · Testdokument · sonst Dokumentstatus.
function DocStatusCell({ c }) {
  if (isProductionCandidate(c)) {
    return (
      <span className="adm-doc-badges">
        <span className="badge badge-green">Produktiv</span>
        {isBackfilled(c) && <span className="badge badge-blue">rückwirkend</span>}
      </span>
    );
  }
  const status = c.documentStatus;
  if (status === "ready") {
    // ready + is_test_document !== false → Testdokument (konservativ, Server-Policy).
    return <span className="badge badge-yellow">Testdokument</span>;
  }
  const [cls, label] = documentStatusMeta(status);
  return <span className={`badge ${cls}`}>{status ? label : "—"}</span>;
}

function ClassBadge({ c }) {
  const [cls, label, desc] = classificationMeta(c.classification);
  return (
    <span className="adm-doc-badges" title={desc}>
      <span className={`badge ${cls}`}>{label}</span>
    </span>
  );
}

function ChipList({ items, kind }) {
  if (!Array.isArray(items) || items.length === 0) return <span className="adm-muted">—</span>;
  const label = kind === "warning" ? warningLabel : fieldLabel;
  return (
    <span className="adm-chip-wrap">
      {items.map((it) => <span className="adm-chip" key={it}>{label(it)}</span>)}
    </span>
  );
}

// ── Produktionsbereitschaft-Karte (§10) — nur Feldnamen/Booleans/Zähler, keine Werte ──
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
          <div className="loading-center"><span className="spinner spinner-dark" /> Wird geprüft…</div>
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
              <div className="adm-kv-item"><dt>Testmodus</dt><dd>{readiness.testMode ? "aktiv – keine echten Rechnungen" : "aus"}</dd></div>
              <div className="adm-kv-item"><dt>E-Mail-Versand bereit</dt><dd>{yesNo(readiness.emailProviderReady)}</dd></div>
              <div className="adm-kv-item"><dt>RESEND konfiguriert</dt><dd>{yesNo(readiness.resendConfigured)}</dd></div>
              <div className="adm-kv-item"><dt>Datenbank/Schema bereit</dt><dd>{yesNo(readiness.databaseReady)}</dd></div>
              <div className="adm-kv-item"><dt>Backfill-Kandidaten</dt><dd>{num(readiness.backfillCandidateCount)}</dd></div>
              <div className="adm-kv-item"><dt>Offene Testdokumente</dt><dd>{num(readiness.openTestDocuments)}</dd></div>
              <div className="adm-kv-item"><dt>Nicht-produktive Rechnungen</dt><dd>{num(readiness.legacyInvoiceCount)}</dd></div>
            </dl>
            {Array.isArray(readiness.missingFields) && readiness.missingFields.length > 0 && (
              <div className="adm-readiness-block">
                <span className="adm-readiness-label">Fehlende Pflichtangaben</span>
                <ChipList items={readiness.missingFields} />
              </div>
            )}
            {Array.isArray(readiness.placeholderFields) && readiness.placeholderFields.length > 0 && (
              <div className="adm-readiness-block">
                <span className="adm-readiness-label adm-readiness-label-warn">Platzhalter-/Testwerte (blockieren den Produktivbetrieb)</span>
                <ChipList items={readiness.placeholderFields} />
              </div>
            )}
            <p className="adm-support-hint">
              Aus Sicherheitsgründen werden hier ausschließlich Feldnamen, Status und Zähler angezeigt —
              niemals Aussteller-, Bank- oder Steuerwerte. Die Freigabe für den Produktivbetrieb erfolgt
              serverseitig; das Frontend spiegelt sie nur.
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

  const [draft, setDraft] = useState({ classification: "", eligible: "all" });
  const [applied, setApplied] = useState({ classification: "", eligible: "all" });
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pageMsg, setPageMsg] = useState(null); // { type, text }

  // Aktions-/Vorschau-Modals.
  const [modal, setModal] = useState(null);      // { kind: 'backfill'|'email', candidate }
  const [modalBusy, setModalBusy] = useState(false);
  const [preview, setPreview] = useState(null);  // { id, invoiceNumber }

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
    if (f.classification) p.classification = f.classification;
    if (f.eligible === "yes") p.eligible = "true";
    if (f.eligible === "no") p.eligible = "false";
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
      setTotal(selectTotal(d));
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
  const resetFilters = () => { setPage(1); setDraft({ classification: "", eligible: "all" }); setApplied({ classification: "", eligible: "all" }); };

  const hasMore = Number.isFinite(total) ? page * PAGE_SIZE < total : rows.length >= PAGE_SIZE;
  const showPagination = !error && (rows.length > 0 || page > 1);

  const openBackfill = (candidate) => { setPageMsg(null); setModal({ kind: "backfill", candidate }); };
  const openEmail = (candidate) => { setPageMsg(null); setModal({ kind: "email", candidate }); };
  const closeModal = () => { if (!modalBusy) setModal(null); };

  const confirmModal = async () => {
    if (!modal) return;
    const id = idOf(modal.candidate);
    setModalBusy(true);
    setPageMsg(null);
    try {
      const r = modal.kind === "backfill"
        ? await backfillInvoiceProductionDocument(id)
        : await sendBackfilledInvoiceEmail(id);
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        const serverMsg = d && typeof d.message === "string" && d.message ? d.message : null;
        setPageMsg({ type: "error", text: serverMsg
          || (r.status === 404 ? "Rechnung wurde nicht gefunden."
          : r.status === 429 ? "Zu viele Admin-Aktionen. Bitte kurz warten."
          : modal.kind === "backfill" ? "Die rückwirkende Erzeugung ist fehlgeschlagen."
          : "Der Versand ist fehlgeschlagen.") });
        return;
      }
      const msg = modal.kind === "backfill" ? backfillOutcomeMessage(d.outcome) : backfillEmailOutcomeMessage(d.outcome);
      setPageMsg(msg);
      // Serverwahrheit neu laden — kein optimistisches UI.
      loadList();
      loadReadiness();
    } catch {
      setPageMsg({ type: "error", text: modal.kind === "backfill" ? "Die rückwirkende Erzeugung ist fehlgeschlagen." : "Der Versand ist fehlgeschlagen." });
    } finally {
      setModalBusy(false);
      setModal(null);
    }
  };

  const back = (
    <Link to="/admin/invoices" className="adm-back">
      <Icon n="chevronLeft" s={16} /> Zurück zur Rechnungsliste
    </Link>
  );

  return (
    <div className="adm-page">
      {back}
      <header className="adm-page-head">
        <h1 className="adm-title">Produktion &amp; Backfill</h1>
        <p className="adm-sub">
          Produktionsbereitschaft prüfen und Alt-Rechnungen rückwirkend produktiv erzeugen. Aktionen werden
          serverseitig geprüft und im Admin-Audit protokolliert; es entsteht keine neue Rechnungsnummer.
        </p>
      </header>

      <ReadinessCard readiness={readiness} loading={readinessLoading} error={readinessError} onReload={loadReadiness} />

      {pageMsg && (
        <div className={`alert ${pageMsg.type === "success" ? "alert-success" : pageMsg.type === "info" ? "alert-info" : "alert-error"}`} role={pageMsg.type === "error" ? "alert" : "status"}>
          <Icon n={pageMsg.type === "success" ? "check" : pageMsg.type === "info" ? "info" : "x"} s={16} />{pageMsg.text}
        </div>
      )}

      <header className="adm-page-head adm-page-head-row">
        <div>
          <h2 className="adm-subtitle">Backfill-Vorschau</h2>
          <p className="adm-sub">Objektive Klassifikation A–F je Rechnung. Aktionen sind nur aktiv, wenn sie objektiv zulässig sind.</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={loadList} disabled={loading}>
          <Icon n="refresh" s={14} /> Aktualisieren
        </button>
      </header>

      <form className="adm-filters" onSubmit={(e) => { e.preventDefault(); applyFilters(); }}>
        <div className="adm-filter-field">
          <label htmlFor="f-class">Klassifikation</label>
          <select id="f-class" value={draft.classification} onChange={(e) => setField("classification", e.target.value)}>
            <option value="">Alle</option>
            {["A", "B", "C", "D", "E", "F"].map((c) => <option key={c} value={c}>{classificationMeta(c)[1]}</option>)}
          </select>
        </div>
        <div className="adm-filter-field">
          <label htmlFor="f-eligible">Backfill-fähig</label>
          <select id="f-eligible" value={draft.eligible} onChange={(e) => setField("eligible", e.target.value)}>
            <option value="all">Alle</option>
            <option value="yes">Nur backfill-fähige</option>
            <option value="no">Nur nicht-fähige</option>
          </select>
        </div>
        <div className="adm-filter-actions">
          <button type="submit" className="btn btn-primary btn-sm"><Icon n="filter" s={14} /> Anwenden</button>
          <button type="button" className="btn btn-outline btn-sm" onClick={resetFilters}>Zurücksetzen</button>
        </div>
      </form>

      {loading ? (
        <div className="table-card"><div className="loading-center"><span className="spinner spinner-dark" /> Wird geladen…</div></div>
      ) : error ? (
        <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error}</div>
      ) : rows.length === 0 ? (
        <div className="table-card"><div className="empty"><div className="empty-icon">🧾</div><div className="empty-title">Keine Rechnungen gefunden</div></div></div>
      ) : (
        <div className="table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Rechnung-Nr.</th>
                  <th>Klassifikation</th>
                  <th>Dokument</th>
                  <th>Fehlende Felder</th>
                  <th>Warnungen</th>
                  <th>Shipment-ID</th>
                  <th className="adm-actions-col">Aktionen</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => {
                  const id = idOf(c);
                  const act = backfillRowActions(c);
                  return (
                    <tr key={id != null ? `inv-${id}` : `row-${i}`}>
                      <td className="adm-mono">
                        {id != null
                          ? <Link className="adm-idlink" to={`/admin/invoices/${encodeURIComponent(id)}`}>{dash(numberOf(c))}</Link>
                          : dash(numberOf(c))}
                      </td>
                      <td><ClassBadge c={c} /></td>
                      <td><DocStatusCell c={c} /></td>
                      <td><ChipList items={c.missingFields} kind="field" /></td>
                      <td><ChipList items={c.warnings} kind="warning" /></td>
                      <td className="adm-mono">{dash(shipmentOf(c))}</td>
                      <td>
                        <div className="adm-row-actions">
                          <button type="button" className="btn btn-primary btn-xs" disabled={!act.canBackfill} onClick={() => openBackfill(c)}>
                            <Icon n="form" s={13} /> Produktives PDF erzeugen
                          </button>
                          <button type="button" className="btn btn-outline btn-xs" disabled={!act.canViewProduction} onClick={() => setPreview({ id, invoiceNumber: numberOf(c) })}>
                            <Icon n="eye" s={13} /> Produktives PDF ansehen
                          </button>
                          <button type="button" className="btn btn-outline btn-xs" disabled={!act.canSendBackfilledEmail} onClick={() => openEmail(c)}>
                            <Icon n="mail" s={13} /> Rückwirkende Rechnung senden
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

      {/* Vorschau des PRODUKTIVEN PDF (kurzlebige Blob-URL, Cleanup im Modal). */}
      {preview && preview.id != null && (
        <InvoicePdfPreviewModal
          title={`Rechnung ${dash(preview.invoiceNumber)}`}
          fetchPdf={() => fetchAdminInvoicePdf(preview.id, preview.invoiceNumber)}
          onDownload={() => downloadAdminInvoicePdf(preview.id, preview.invoiceNumber)}
          onClose={() => setPreview(null)}
        />
      )}

      {/* Bestätigungsmodal — mutierende Aktionen erst nach bewusster Bestätigung. */}
      {modal && (
        <div className="adm-modal-overlay" role="presentation" onClick={closeModal}>
          <div className="adm-modal" role="dialog" aria-modal="true" aria-labelledby="adm-bf-title" aria-describedby="adm-bf-desc" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-icon adm-modal-icon-approve" aria-hidden="true">
              <Icon n={modal.kind === "backfill" ? "form" : "mail"} s={22} />
            </div>
            <h2 id="adm-bf-title" className="adm-modal-title">
              {modal.kind === "backfill" ? "Produktives PDF rückwirkend erzeugen?" : "Rückwirkende Rechnung senden?"}
            </h2>
            <p id="adm-bf-desc" className="adm-modal-text">
              {modal.kind === "backfill"
                ? "Erzeugt aus den gespeicherten historischen Daten ein PRODUKTIVES Rechnungs-PDF (ohne Testwasserzeichen). Ein bestehendes Test-PDF wird archiviert, nicht überschrieben. Es entsteht KEINE neue Rechnungsnummer; Beträge und Rechnungs-/Leistungsdatum bleiben unverändert. Es wird KEINE E-Mail versendet."
                : "Versendet die rückwirkend erzeugte, produktive Rechnung an die im historischen Kunden-Snapshot hinterlegte E-Mail-Adresse. Es entsteht keine neue Rechnung und keine neue Rechnungsnummer."}
            </p>
            <p className="adm-modal-sub">Rechnung {dash(numberOf(modal.candidate))} · #{dash(idOf(modal.candidate))}</p>
            <p className="adm-support-hint" style={{ marginTop: 0, marginBottom: 16 }}>Die Aktion wird im Admin-Audit protokolliert und serverseitig erneut geprüft.</p>
            <div className="adm-modal-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={closeModal} disabled={modalBusy}>Abbrechen</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmModal} disabled={modalBusy}>
                {modalBusy
                  ? <><span className="spinner spinner-dark" /> {modal.kind === "backfill" ? "Wird erzeugt…" : "Wird gesendet…"}</>
                  : <><Icon n="check" s={14} /> {modal.kind === "backfill" ? "Produktiv erzeugen" : "Rückwirkende Rechnung senden"}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
