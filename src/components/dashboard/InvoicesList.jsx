import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { money, dateDE, isoDayDE } from "../../utils/formatters";
import { InvoicePdfPreviewModal } from "./InvoicePdfPreviewModal";
import { useNotifications } from "../../context/NotificationsContext";
import { downloadCustomerInvoicePdf, fetchCustomerInvoicePdf } from "../../utils/downloadInvoicePdf";
import {
  canDownloadInvoice, canPreviewInvoice, formatInvoiceAmount,
  hasPendingInvoiceDocuments, nextRefreshDelay, formatEmailSentAt,
  DOWNLOAD_ERROR_GENERIC,
} from "../../utils/invoiceView.mjs";
import {
  paymentStatus,
  documentStatusMeta, emailDeliveryMeta, invoicePeriod, unavailableActionReason,
  INVOICE_FILTERS, matchesInvoiceFilter,
  FILTER_EMPTY_TEXT, LIST_EMPTY_TITLE, LIST_EMPTY_TEXT, LOADING_TEXT, LOAD_ERROR_TEXT,
  customerInvoiceSummary,
} from "../../utils/customerInvoiceView.mjs";
import { businessOrderNumberOf } from "../../utils/businessNumbers.mjs";

// Rechnungsliste (Kunde) — Phase 5: Forderungsklassifizierung, sechs fachliche
// Bereiche, Premium-Statussystem, mobile Kartenansicht, lokale Filter.
//
// Zahlungsstatus/Dokumentmodus/Zeitraum/Betrag kommen AUSSCHLIESSLICH aus dem
// zentralen View-Model (customerInvoiceView.mjs) — keine eigene Fachlogik hier.
// „Ansehen"/„Herunterladen" erscheinen AKTIV nur bei serverseitigem
// download_available === true; die Policy wird NICHT im Frontend rekonstruiert.

function StatusPill({ tone, label, title }) {
  return (
    <span className={`inv-status inv-status--${tone}`} title={title}>
      <span className="inv-status-text">{label}</span>
    </span>
  );
}

// ── Zusammenfassung oberhalb der Liste ──────────────────────────────────────
function InvoiceSummaryCard({ invoices, summary, onReload, loading }) {
  const view = customerInvoiceSummary(invoices, summary);
  return (
    <div className="inv-summary">
      <div className="inv-summary-row">
        <div>
          {view.state === "open" && (
            <>
              <p className="inv-summary-label">Offener Betrag</p>
              <div className="inv-summary-amount">{money(view.openAmount)}</div>
              <div className="inv-summary-meta">
                <span>{view.openCount} {view.openCount === 1 ? "offene Rechnung" : "offene Rechnungen"}</span>
                {view.overdueCount > 0 && <span><strong>{view.overdueCount}</strong> {view.overdueCount === 1 ? "davon überfällig" : "davon überfällig"}</span>}
                {view.nextDueDate && <span>Nächste Fälligkeit: <strong>{dateDE(view.nextDueDate)}</strong></span>}
              </div>
              {view.mixedCurrency && (
                <p className="inv-summary-note">Es liegen zusätzlich Rechnungen in einer anderen Währung vor, die hier nicht mitgerechnet sind.</p>
              )}
            </>
          )}
          {view.state === "noOpen" && <p className="inv-summary-title">Keine offenen Forderungen</p>}
          {view.state === "empty" && <p className="inv-summary-title">{LIST_EMPTY_TITLE}</p>}
        </div>
        {typeof onReload === "function" && (
          <button type="button" className="btn btn-outline btn-sm" onClick={onReload} disabled={loading} aria-label="Rechnungsliste aktualisieren">
            <Icon n="refresh" s={14} /> Aktualisieren
          </button>
        )}
      </div>
    </div>
  );
}

// ── Zellen (gemeinsam für Desktop-Tabelle und Mobilkarte genutzt) ──────────
function InvoiceNumberBlock({ inv }) {
  const order = businessOrderNumberOf(inv);
  return (
    <div className="inv-cell-number">
      <span className="inv-cell-number-value">{inv.invoice_number}</span>
      <span className="inv-cell-order">{order || "Bestellung nicht hinterlegt"}</span>
    </div>
  );
}

function PeriodBlock({ inv }) {
  const p = invoicePeriod(inv);
  return (
    <div className="inv-period">
      {/* Ein echtes Leerzeichen ({" "}) zwischen Label und Wert ist hier kein Stilmittel,
          sondern die einzige Umbruchstelle: zwei direkt aneinandergrenzende Inline-Elemente
          ohne Leerraum dazwischen sind für den Zeilenumbruch EIN unteilbares Token — bei
          schmalen Spaltenbreiten würde die Zeile sonst überlaufen statt umzubrechen. */}
      <div className="inv-period-row"><span className="inv-period-label">Rechnung</span> <span>{isoDayDE(p.issuedDay)}</span></div>
      {/* Alle drei Daten kommen als kanonische Kalendertage ("YYYY-MM-DD") aus invoicePeriod
          und werden mit isoDayDE rein textuell formatiert. dateDE würde daraus wieder ein Date
          bauen und in der Zeitzone des Betrachters rendern — das Portal zeigte dann ein anderes
          Datum als das PDF. */}
      {p.serviceDay && <div className="inv-period-row"><span className="inv-period-label">Leistung</span> <span>{isoDayDE(p.serviceDay)}</span></div>}
      {p.dueDay && (
        <div className="inv-period-row">
          <span className="inv-period-label">Fällig</span> <span className={p.overdue ? "inv-period-due--overdue" : undefined}>{isoDayDE(p.dueDay)}</span>
        </div>
      )}
    </div>
  );
}

function AmountBlock({ inv }) {
  return (
    <div>
      <span className="inv-amount-label">Betrag</span>
      <span className="inv-amount-value">{formatInvoiceAmount(inv.gross_amount ?? inv.amount, inv.currency)}</span>
    </div>
  );
}

function PaymentStatusCell({ inv }) {
  const [tone, label] = paymentStatus(inv);
  return <StatusPill tone={tone} label={label} />;
}

function DocumentCell({ inv }) {
  const [docTone, docLabel] = documentStatusMeta(inv);
  // Nur der abgeschlossene Versand wird gezeigt. Ein fehlgeschlagener oder noch laufender
  // Mailversand ist ein interner Betriebszustand und erscheint hier bewusst gar nicht —
  // die Rechnung selbst bleibt gültig, sichtbar und herunterladbar.
  const mail = emailDeliveryMeta(inv);
  const sentAt = mail ? formatEmailSentAt(inv.email_sent_at) : "";
  return (
    <div className="inv-doc-cell">
      <StatusPill tone={docTone} label={docLabel} />
      {mail && <StatusPill tone={mail[0]} label={mail[1]} />}
      {sentAt && <span className="inv-doc-note">{sentAt}</span>}
    </div>
  );
}

function ActionButtons({ inv, downloadingId, onView, onDownload }) {
  const busy = downloadingId === inv.id;
  if (canDownloadInvoice(inv)) {
    return (
      <div className="inv-actions">
        <div className="inv-actions-row">
          {canPreviewInvoice(inv) && (
            <button
              type="button" className="btn btn-ghost btn-sm" onClick={() => onView(inv)}
              disabled={downloadingId != null} aria-label={`Rechnung ${inv.invoice_number} ansehen`} title="Rechnung ansehen"
            >
              <Icon n="eye" s={14} /> Ansehen
            </button>
          )}
          <button
            type="button" className="btn btn-ghost btn-sm" onClick={() => onDownload(inv)}
            disabled={downloadingId != null} aria-label={`Rechnung ${inv.invoice_number} als PDF herunterladen`} title="Rechnung als PDF herunterladen"
          >
            {busy ? <><span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> Lädt…</> : <><Icon n="download" s={14} /> PDF</>}
          </button>
        </div>
      </div>
    );
  }
  const reason = unavailableActionReason(inv);
  return <div className="inv-actions">{reason && <span className="inv-action-reason">{reason}</span>}</div>;
}

// ── Mobilkarte ───────────────────────────────────────────────────────────────
function InvoiceCard({ inv, downloadingId, onView, onDownload }) {
  const [payTone, payLabel] = paymentStatus(inv);
  const p = invoicePeriod(inv);
  const [docTone, docLabel] = documentStatusMeta(inv);
  const mail = emailDeliveryMeta(inv);
  return (
    <li className="inv-card">
      <div className="inv-card-head">
        <InvoiceNumberBlock inv={inv} />
        <StatusPill tone={payTone} label={payLabel} />
      </div>
      <dl className="inv-card-kv">
        <div className="inv-card-kv-row"><dt>Betrag</dt><dd>{formatInvoiceAmount(inv.gross_amount ?? inv.amount, inv.currency)}</dd></div>
        <div className="inv-card-kv-row"><dt>Rechnungsdatum</dt><dd>{isoDayDE(p.issuedDay)}</dd></div>
        {p.serviceDay && <div className="inv-card-kv-row"><dt>Leistung</dt><dd>{isoDayDE(p.serviceDay)}</dd></div>}
        {p.dueDay && <div className="inv-card-kv-row"><dt>Fällig</dt><dd className={p.overdue ? "inv-period-due--overdue" : undefined}>{isoDayDE(p.dueDay)}</dd></div>}
        <div className="inv-card-kv-row"><dt>Dokument</dt><dd><StatusPill tone={docTone} label={docLabel} /></dd></div>
        {/* Zeile nur bei tatsächlich erfolgtem Versand — kein interner Betriebszustand. */}
        {mail && <div className="inv-card-kv-row"><dt>E-Mail</dt><dd><StatusPill tone={mail[0]} label={mail[1]} /></dd></div>}
      </dl>
      <div className="inv-card-actions">
        <ActionButtons inv={inv} downloadingId={downloadingId} onView={onView} onDownload={onDownload} />
      </div>
    </li>
  );
}

export function InvoicesList({ invoices, summary, loading, error, onReload, onRetry, refreshError }) {
  const { refresh: refreshNotifications } = useNotifications();
  const [filter, setFilter] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadError, setDownloadError] = useState("");
  const [previewInvoice, setPreviewInvoice] = useState(null); // { id, invoice_number } | null

  // Zurückhaltende Auto-Aktualisierung (unverändert aus Phase 3/4): NUR solange mindestens eine
  // sichtbare Rechnung auf ihr Dokument wartet (pending_document|generating). Backoff 5/10/20/30/45 s,
  // danach Stopp. Im Hintergrund-Tab wird nicht gepollt; beim Zurückwechseln wird — falls noch etwas
  // wartet — sofort einmal aktualisiert und der Backoff fortgesetzt.
  const refreshAttemptRef = useRef(0);
  const timerRef = useRef(null);
  const [tabVisible, setTabVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onVisibility = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);
  useEffect(() => {
    if (loading || typeof onReload !== "function") return undefined;
    if (!hasPendingInvoiceDocuments(invoices)) { refreshAttemptRef.current = 0; return undefined; }
    if (!tabVisible) return undefined;
    const delay = nextRefreshDelay(refreshAttemptRef.current);
    if (delay == null) return undefined;
    timerRef.current = setTimeout(() => {
      refreshAttemptRef.current += 1;
      onReload();
    }, delay);
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [invoices, loading, onReload, tabVisible]);

  // Manuell = non-silent: Der Klick meldet einen Fehlschlag sichtbar (siehe
  // reloadInvoices in DashboardPage); das Auto-Refresh oben ruft onReload()
  // ohne Optionen und bleibt bewusst still. Eigener Busy-Zustand, damit der
  // Button während des Abrufs erkennbar gesperrt ist.
  const [reloadBusy, setReloadBusy] = useState(false);
  const manualReload = async () => {
    if (reloadBusy) return;
    refreshAttemptRef.current = 0;
    setDownloadError("");
    setReloadBusy(true);
    try { await onReload?.({ silent: false }); }
    finally { setReloadBusy(false); }
  };

  // Ein erfolgreicher PDF-Abruf erledigt serverseitig die Meldung „Neue Rechnung
  // verfügbar" (Response-'finish' auf der Kundenroute). Das Frontend entscheidet das
  // NICHT — es holt anschließend nur den neuen Stand, damit die Glocke nicht bis zum
  // nächsten Poll veraltet ist. Nach einem FEHLGESCHLAGENEN Abruf wird bewusst nicht
  // aktualisiert: dort hat sich serverseitig auch nichts geändert.
  const handleDownload = async (inv) => {
    if (downloadingId != null) return;
    setDownloadError("");
    setDownloadingId(inv.id);
    try {
      await downloadCustomerInvoicePdf(inv.id, inv.invoice_number);
      refreshNotifications();
    } catch (e) {
      setDownloadError(e?.message || DOWNLOAD_ERROR_GENERIC);
    } finally {
      setDownloadingId(null);
    }
  };

  // Die Vorschau lädt dasselbe vollständige PDF über denselben Kundenendpunkt und
  // erledigt die Meldung deshalb ebenso — auch hier wird nur nachgeladen.
  const previewFetcher = useCallback(() => {
    if (!previewInvoice) return Promise.reject(new Error(DOWNLOAD_ERROR_GENERIC));
    return fetchCustomerInvoicePdf(previewInvoice.id, previewInvoice.invoice_number)
      .then((blob) => { refreshNotifications(); return blob; });
  }, [previewInvoice, refreshNotifications]);

  const list = Array.isArray(invoices) ? invoices : [];
  const filtered = list.filter((inv) => matchesInvoiceFilter(inv, filter));

  return (
    <>
      <div className="page-body">
        <InvoiceSummaryCard invoices={list} summary={summary} onReload={manualReload} loading={loading || reloadBusy} />
        {refreshError && (
          <div className="alert alert-error mb-16" role="alert">
            <Icon n="x" s={16} />
            Die Rechnungsliste konnte nicht aktualisiert werden. Die Anzeige zeigt den letzten geladenen Stand — bitte versuchen Sie es erneut.
          </div>
        )}

        {list.length > 0 && (
          <div className="inv-filters" role="group" aria-label="Rechnungen filtern">
            {INVOICE_FILTERS.map((f) => (
              <button
                key={f.value || "all"}
                type="button"
                className={`inv-filter-chip${filter === f.value ? " inv-filter-chip--active" : ""}`}
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {downloadError && (
          <div className="alert alert-error mb-16" role="alert">
            <Icon n="x" s={16} />{downloadError}
          </div>
        )}

        {loading ? (
          <div className="loading-center" role="status" aria-live="polite"><span className="spinner spinner-dark" /> {LOADING_TEXT}</div>
        ) : error ? (
          <div className="inv-loaderr">
            <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error || LOAD_ERROR_TEXT}</div>
            <div className="inv-loaderr-actions">
              <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
                <Icon n="refresh" s={14} /> Erneut versuchen
              </button>
            </div>
          </div>
        ) : list.length === 0 ? (
          <div className="empty">
            <div className="empty-icon" aria-hidden="true"><Icon n="invoice" s={24} /></div>
            <div className="empty-title">{LIST_EMPTY_TITLE}</div>
            <p className="empty-text">{LIST_EMPTY_TEXT}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-title">{FILTER_EMPTY_TEXT}</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setFilter("")}>Filter zurücksetzen</button>
          </div>
        ) : (
          <>
            {/* Desktop: sechs Bereiche mit relativen/festen Breiten — kein horizontales Scrollen. */}
            <div className="table-card inv-table">
              <table>
                <caption className="sr-only">
                  Rechnungen — Rechnung, Zeitraum, Betrag, Zahlungsstatus, Dokument und Aktion.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Rechnung</th>
                    <th scope="col">Zeitraum</th>
                    <th scope="col">Betrag</th>
                    <th scope="col">Zahlungsstatus</th>
                    <th scope="col">Dokument</th>
                    <th scope="col">Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv) => (
                    <tr key={inv.id}>
                      <td><InvoiceNumberBlock inv={inv} /></td>
                      <td><PeriodBlock inv={inv} /></td>
                      <td><AmountBlock inv={inv} /></td>
                      <td><PaymentStatusCell inv={inv} /></td>
                      <td><DocumentCell inv={inv} /></td>
                      <td><ActionButtons inv={inv} downloadingId={downloadingId} onView={(i) => setPreviewInvoice({ id: i.id, invoice_number: i.invoice_number })} onDownload={handleDownload} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobil: Kartenansicht statt Tabelle. */}
            <ul className="inv-cards">
              {filtered.map((inv) => (
                <InvoiceCard
                  key={inv.id} inv={inv} downloadingId={downloadingId}
                  onView={(i) => setPreviewInvoice({ id: i.id, invoice_number: i.invoice_number })}
                  onDownload={handleDownload}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      {previewInvoice && (
        <InvoicePdfPreviewModal
          title={`Rechnung ${previewInvoice.invoice_number}`}
          fetchPdf={previewFetcher}
          onDownload={() => downloadCustomerInvoicePdf(previewInvoice.id, previewInvoice.invoice_number)}
          onClose={() => setPreviewInvoice(null)}
        />
      )}
    </>
  );
}
