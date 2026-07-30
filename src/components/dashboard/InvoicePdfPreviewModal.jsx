import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";

// Rechnungs-PDF-Vorschau (Phase 4, Fokusverhalten Phase 5) — wiederverwendbar
// für Kunde UND Admin.
//
// Sicherheitsprinzip: Die PDF kommt AUSSCHLIESSLICH über den übergebenen,
// authentifizierten Blob-Fetcher (fetchPdf → { blob, filename }); der Fetcher
// akzeptiert nur application/pdf und reicht Fehlerantworten NIE als PDF weiter.
// Dargestellt wird ausschließlich eine kurzlebige lokale Blob-Object-URL in
// einem iframe (title gesetzt; src ist NIE eine Server-/Fremd-URL, kein HTML
// aus unkontrollierten Quellen). Bewusst KEIN sandbox-Attribut: Chromium
// blockiert in sandboxten iframes den internen PDF-Viewer — die Quelle ist
// aber ohnehin ausschließlich unser eigener, typgeprüfter Blob. Die Object-URL
// wird beim Schließen UND beim Unmount zuverlässig freigegeben; es gibt keinen
// permanenten Object-URL-Zustand und keine Storage-/internen IDs im DOM.
//
// Fokusverhalten (dasselbe Muster wie components/admin/ConfirmDialog.jsx):
// Fokus beim Öffnen auf „Schließen", Escape schließt, der Fokus kehrt beim
// Schließen zum auslösenden Element zurück — zusätzlich, weil dieser Dialog
// (anders als ConfirmDialog mit nur zwei Buttons) einen iframe und variable
// Aktionen enthält: eine echte Tab-Fokusfalle, damit Tab/Shift+Tab den Dialog
// nicht verlassen kann, solange er offen ist.
export function InvoicePdfPreviewModal({ title, fetchPdf, onDownload, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pdfUrl, setPdfUrl] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const urlRef = useRef(null);
  const closeBtnRef = useRef(null);
  const modalRef = useRef(null);
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  // Blob laden → Object-URL erzeugen; Cleanup (revoke) bei Unmount/Neuladung.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    Promise.resolve()
      .then(() => fetchPdf())
      .then(({ blob }) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setPdfUrl(url);
      })
      .catch((e) => { if (!cancelled) setError(e?.message || "Die Rechnung konnte nicht geladen werden."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => {
      cancelled = true;
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    };
  }, [fetchPdf]);

  // Fokus initial auf „Schließen"; Escape schließt; Tab-Fokusfalle innerhalb des
  // Dialogs; beim Schließen kehrt der Fokus zum auslösenden Element zurück.
  useEffect(() => {
    closeBtnRef.current?.focus();
    const focusable = () =>
      [...(modalRef.current?.querySelectorAll('button, [href], iframe, [tabindex]:not([tabindex="-1"])') || [])]
        .filter((el) => !el.disabled);
    const onKey = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      openerRef.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDownload = async () => {
    if (downloading || typeof onDownload !== "function") return;
    setDownloading(true);
    try { await onDownload(); }
    catch (e) { setError(e?.message || "Die Rechnung konnte nicht heruntergeladen werden."); }
    finally { setDownloading(false); }
  };

  return (
    <div className="pdfview-overlay" role="presentation" onClick={onClose}>
      <div
        ref={modalRef}
        className="pdfview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pdfview-head">
          <span className="pdfview-title">{title}</span>
          <div className="pdfview-actions">
            {typeof onDownload === "function" && (
              <button type="button" className="btn btn-outline btn-sm" onClick={handleDownload} disabled={downloading || loading || !!error}>
                {downloading
                  ? <><span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> Lädt…</>
                  : <><Icon n="download" s={14} /> Herunterladen</>}
              </button>
            )}
            <button type="button" ref={closeBtnRef} className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Vorschau schließen">
              <Icon n="x" s={16} /> Schließen
            </button>
          </div>
        </div>
        <div className="pdfview-body">
          {loading ? (
            <div className="loading-center" role="status" aria-live="polite"><span className="spinner spinner-dark" /> PDF wird geladen…</div>
          ) : error ? (
            <div className="alert alert-error" role="alert" style={{ margin: 16 }}>
              <Icon n="x" s={16} />{error}
            </div>
          ) : (
            <iframe className="pdfview-frame" src={pdfUrl} title={title} />
          )}
        </div>
      </div>
    </div>
  );
}
