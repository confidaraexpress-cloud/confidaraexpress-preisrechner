import React, { useEffect, useRef, useState } from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { money, dateDE } from "../../utils/formatters";
import { PremiumBackground } from "./PremiumBackground";
import { downloadCustomerInvoicePdf } from "../../utils/downloadInvoicePdf";
import {
  documentStatusMeta, isTestInvoiceDocument, canDownloadInvoice,
  formatInvoiceAmount, hasPendingInvoiceDocuments, nextRefreshDelay,
  TEST_DOCUMENT_HINT, DOWNLOAD_ERROR_GENERIC,
} from "../../utils/invoiceView.mjs";

// Rechnungsliste (Kunde) — Phase 3: echter, authentifizierter PDF-Blob-Download
// (GET /kunde/invoices/:id/pdf) statt des früheren toten URL-Feld-Buttons.
// Der Download-Button erscheint AKTIV nur bei serverseitigem download_available
// === true; Testdokumente zeigen stattdessen einen dauerhaften Hinweis. Solange
// sichtbare Rechnungen noch auf ihr Dokument warten (pending/generating), wird
// die Liste ZURÜCKHALTEND automatisch aktualisiert (3 Versuche mit wachsendem
// Abstand, Cleanup bei Unmount) — zusätzlich gibt es einen manuellen
// Aktualisieren-Button. Keine öffentliche URL im DOM, keine Bank-/Systemdaten.

export function InvoicesList({ invoices, loading, onReload }) {
  const unpaid = invoices.filter((i) => i.status === "unpaid");
  const unpaidAmt = unpaid.reduce((s, i) => s + Number(i.amount), 0);

  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadError, setDownloadError] = useState("");

  // Zurückhaltende Auto-Aktualisierung: nur bei wartenden Dokumenten, max. 3
  // Versuche (5s/10s/20s); Zähler-Reset bei manueller Aktualisierung. Timer
  // wird bei Datenwechsel/Unmount immer aufgeräumt.
  const refreshAttemptRef = useRef(0);
  const timerRef = useRef(null);
  useEffect(() => {
    if (loading || typeof onReload !== "function") return undefined;
    if (!hasPendingInvoiceDocuments(invoices)) { refreshAttemptRef.current = 0; return undefined; }
    const delay = nextRefreshDelay(refreshAttemptRef.current);
    if (delay == null) return undefined;
    timerRef.current = setTimeout(() => {
      refreshAttemptRef.current += 1;
      onReload();
    }, delay);
    return () => { if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; } };
  }, [invoices, loading, onReload]);

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

  const renderDocumentCell = (inv) => {
    const [cls, label] = documentStatusMeta(inv.document_status);
    const isTest = isTestInvoiceDocument(inv);
    return (
      <div className="invoice-doc-cell">
        <span className={`badge ${cls}`}>{label}</span>
        {isTest && <span className="badge badge-yellow">Testdokument</span>}
      </div>
    );
  };

  const renderActionCell = (inv) => {
    if (canDownloadInvoice(inv)) {
      const busy = downloadingId === inv.id;
      return (
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
      );
    }
    if (isTestInvoiceDocument(inv)) {
      return <span className="text-muted invoice-doc-note">{TEST_DOCUMENT_HINT}</span>;
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
                    <th>Nummer</th>
                    <th>Datum</th>
                    <th>Fällig</th>
                    <th>Betrag</th>
                    <th>Zahlung</th>
                    <th>Dokument</th>
                    <th>PDF</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="mono" style={{ fontSize: 12 }}>{inv.invoice_number}</td>
                      <td className="text-muted">{dateDE(inv.issued_at || inv.created_at)}</td>
                      <td className="text-muted">{dateDE(inv.due_date)}</td>
                      <td className="font-bold">{formatInvoiceAmount(inv.gross_amount ?? inv.amount, inv.currency)}</td>
                      <td><StatusBadge status={inv.status} /></td>
                      <td>{renderDocumentCell(inv)}</td>
                      <td>{renderActionCell(inv)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
