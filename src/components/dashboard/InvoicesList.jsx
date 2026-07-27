import React, { useCallback, useEffect, useRef, useState } from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { money, dateDE } from "../../utils/formatters";
import { PremiumBackground } from "./PremiumBackground";
import { InvoicePdfPreviewModal } from "./InvoicePdfPreviewModal";
import { downloadCustomerInvoicePdf, fetchCustomerInvoicePdf } from "../../utils/downloadInvoicePdf";
import {
  documentStatusMeta, isTestInvoiceDocument, canDownloadInvoice, canPreviewInvoice,
  formatInvoiceAmount, hasPendingInvoiceDocuments, nextRefreshDelay,
  emailDisplayMeta, formatEmailSentAt,
  PREVIEW_DOCUMENT_HINT, PREVIEW_DOCUMENT_BADGE, DOWNLOAD_ERROR_GENERIC,
} from "../../utils/invoiceView.mjs";
import { businessOrderNumberOf } from "../../utils/businessNumbers.mjs";

// Rechnungsliste (Kunde) — Phase 3/4: authentifizierter Blob-Download + direkte
// PDF-Vorschau (Modal mit kurzlebiger Blob-Object-URL) + Rechnungs-E-Mail-Status.
// „Ansehen"/„Herunterladen" erscheinen AKTIV nur bei serverseitigem
// download_available === true; Testdokumente zeigen stattdessen dauerhaft den
// Hinweis „Testdokument – nicht für den Zahlungsverkehr freigegeben" und beim
// E-Mail-Status „Testdokument – kein Versand". Der Kunde besitzt KEINE
// Versandaktion (Senden/Retry/Resend sind reine Admin-Funktionen) und sieht
// keine Providerdetails oder internen Fehlertexte. Solange sichtbare Rechnungen
// auf ihr Dokument warten, wird zurückhaltend automatisch aktualisiert (max. 3
// Versuche mit wachsendem Abstand); zusätzlich manueller Aktualisieren-Button.

export function InvoicesList({ invoices, loading, onReload }) {
  const unpaid = invoices.filter((i) => i.status === "unpaid");
  const unpaidAmt = unpaid.reduce((s, i) => s + Number(i.amount), 0);

  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadError, setDownloadError] = useState("");
  const [previewInvoice, setPreviewInvoice] = useState(null); // { id, invoice_number } | null

  // Zurückhaltende Auto-Aktualisierung (Phase 3, Backoff): NUR solange mindestens eine sichtbare
  // Rechnung auf ihr Dokument wartet (pending_document|generating). Backoff 5/10/20/30/45 s (Summe
  // ≈ 110 s → „maximal etwa zwei Minuten"), danach Stopp (kein Endlos-Poll); ready/document_failed
  // stoppen sofort (kein wartendes Dokument mehr). Reset bei manueller Aktualisierung. Im
  // HINTERGRUND-TAB wird NICHT gepollt (document.hidden); beim Zurückwechseln wird — falls noch
  // etwas wartet — sofort einmal aktualisiert und der Backoff fortgesetzt. Timer + Listener werden
  // beim Unmount vollständig bereinigt.
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
    if (!tabVisible) return undefined; // im Hintergrund keine Serverlast erzeugen
    const delay = nextRefreshDelay(refreshAttemptRef.current);
    if (delay == null) return undefined; // Obergrenze erreicht → nur noch manuell
    timerRef.current = setTimeout(() => {
      refreshAttemptRef.current += 1;
      onReload();
    }, delay);
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [invoices, loading, onReload, tabVisible]);

  const manualReload = () => {
    refreshAttemptRef.current = 0;
    setDownloadError("");
    onReload?.();
  };

  const handleDownload = async (inv) => {
    if (downloadingId != null) return; // Doppelklick/Parallel-Download verhindern
    setDownloadError("");
    setDownloadingId(inv.id);
    try {
      await downloadCustomerInvoicePdf(inv.id, inv.invoice_number);
    } catch (e) {
      setDownloadError(e?.message || DOWNLOAD_ERROR_GENERIC);
    } finally {
      setDownloadingId(null);
    }
  };

  // Stabiler Fetcher für das geöffnete Modal (Object-URL-Lebenszyklus liegt im Modal).
  const previewFetcher = useCallback(() => {
    if (!previewInvoice) return Promise.reject(new Error(DOWNLOAD_ERROR_GENERIC));
    return fetchCustomerInvoicePdf(previewInvoice.id, previewInvoice.invoice_number);
  }, [previewInvoice]);

  const renderDocumentCell = (inv) => {
    const [cls, label] = documentStatusMeta(inv.document_status);
    const isTest = isTestInvoiceDocument(inv);
    return (
      <div className="invoice-doc-cell">
        <span className={`badge ${cls}`}>{label}</span>
        {isTest && <span className="badge badge-yellow">{PREVIEW_DOCUMENT_BADGE}</span>}
      </div>
    );
  };

  const renderEmailCell = (inv) => {
    const [cls, label] = emailDisplayMeta(inv);
    const sentAt = !isTestInvoiceDocument(inv) && inv.email_status === "sent" ? formatEmailSentAt(inv.email_sent_at) : "";
    return (
      <div className="invoice-doc-cell">
        <span className={`badge ${cls}`}>{label}</span>
        {sentAt && <span className="text-muted invoice-doc-note">{sentAt}</span>}
      </div>
    );
  };

  const renderActionCell = (inv) => {
    const isPreview = isTestInvoiceDocument(inv);
    if (canDownloadInvoice(inv)) {
      const busy = downloadingId === inv.id;
      return (
        <div className="invoice-row-actions">
          {canPreviewInvoice(inv) && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setPreviewInvoice({ id: inv.id, invoice_number: inv.invoice_number })}
              disabled={downloadingId != null}
              aria-label={`Rechnung ${inv.invoice_number} ansehen`}
              title="Rechnung ansehen"
            >
              <Icon n="eye" s={14} /> Ansehen
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => handleDownload(inv)}
            disabled={downloadingId != null}
            aria-label={`Rechnung ${inv.invoice_number} als PDF herunterladen`}
            title="Rechnung als PDF herunterladen"
          >
            {busy
              ? <><span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> Lädt…</>
              : <><Icon n="download" s={14} /> PDF</>}
          </button>
          {/* Vorschau ist ansehbar/herunterladbar, aber NICHT zahlungswirksam — Hinweis bleibt sichtbar. */}
          {isPreview && <span className="text-muted invoice-doc-note">{PREVIEW_DOCUMENT_HINT}</span>}
        </div>
      );
    }
    if (isPreview) {
      return <span className="text-muted invoice-doc-note">{PREVIEW_DOCUMENT_HINT}</span>;
    }
    if (inv.document_status === "pending_document" || inv.document_status === "generating") {
      return <span className="text-muted invoice-doc-note">Rechnung wird erstellt</span>;
    }
    if (inv.document_status === "document_failed") {
      return <span className="text-muted invoice-doc-note">Rechnung konnte noch nicht erstellt werden</span>;
    }
    return <span className="text-muted">—</span>;
  };

  return (
    <>
      <PremiumBackground variant="soft" />
      <div className="page-body">
        <div className="invoice-list-toolbar">
          {unpaid.length > 0 ? (
            <div className="alert alert-info" style={{ marginBottom: 0, flex: 1 }}>
              <Icon n="invoice" s={16} />Offen: <strong>{money(unpaidAmt)}</strong>
            </div>
          ) : <span />}
          {typeof onReload === "function" && (
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={manualReload}
              disabled={loading}
              aria-label="Rechnungsliste aktualisieren"
            >
              <Icon n="refresh" s={14} /> Aktualisieren
            </button>
          )}
        </div>

        {downloadError && (
          <div className="alert alert-error mb-16" role="alert">
            <Icon n="x" s={16} />{downloadError}
          </div>
        )}

        {loading ? (
          <div className="loading-center"><span className="spinner spinner-dark" /></div>
        ) : invoices.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">🧾</div>
            <div className="empty-title">Keine Rechnungen</div>
          </div>
        ) : (
          <div className="table-card">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Rechnungsnummer</th>
                    <th>Bestellung</th>
                    <th>Datum</th>
                    <th>Leistung</th>
                    <th>Fällig</th>
                    <th>Betrag</th>
                    <th>Zahlung</th>
                    <th>Dokument</th>
                    <th>E-Mail</th>
                    <th>Aktion</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      {/* Rechnungsnummer bleibt die primäre Dokumentnummer; die Bestellnummer
                          steht getrennt daneben. Legacy-Rechnungen ohne Bestellnummer zeigen
                          „—" — NIE die JUMiNGO-Ordernummer und NIE eine interne ID. */}
                      <td className="mono" style={{ fontSize: 12, wordBreak: "break-all" }}>{inv.invoice_number}</td>
                      <td className="mono text-muted" style={{ fontSize: 12, wordBreak: "break-all" }}>
                        {businessOrderNumberOf(inv) || "—"}
                      </td>
                      <td className="text-muted">{dateDE(inv.issued_at || inv.created_at)}</td>
                      <td className="text-muted">{inv.service_date ? dateDE(inv.service_date) : "—"}</td>
                      <td className="text-muted">{dateDE(inv.due_date)}</td>
                      <td className="font-bold">{formatInvoiceAmount(inv.gross_amount ?? inv.amount, inv.currency)}</td>
                      <td><StatusBadge status={inv.status} /></td>
                      <td>{renderDocumentCell(inv)}</td>
                      <td>{renderEmailCell(inv)}</td>
                      <td>{renderActionCell(inv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
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
