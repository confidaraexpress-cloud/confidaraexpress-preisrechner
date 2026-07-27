import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { getAdminInvoice, markAdminInvoicePaid, generateAdminInvoiceDocument, sendAdminInvoiceEmail, resendAdminInvoiceEmail } from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { invoiceDisplayMeta, isInvoiceOverdue } from "../../utils/adminInvoices";
import { documentStatusMeta, isTestInvoiceDocument, formatBytes, emailDisplayMeta, formatEmailSentAt } from "../../utils/invoiceView.mjs";
import { downloadAdminInvoicePdf, fetchAdminInvoicePdf } from "../../utils/downloadInvoicePdf";
import { InvoicePdfPreviewModal } from "../../components/dashboard/InvoicePdfPreviewModal";
import { businessOrderNumberOf, customerNumberOf, NUMBER_LABELS } from "../../utils/businessNumbers.mjs";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

const ERROR_MESSAGES = {
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Die Rechnung konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Die Rechnung konnte nicht geladen werden. Bitte versuchen Sie es erneut.";

// Fehlertexte für „als bezahlt markieren" (verständlich, kein roher Backend-Body,
// keine PII). 401/403 behandelt apiFetch zentral.
const PAY_ERRORS = {
  404: "Rechnung wurde nicht gefunden oder existiert nicht mehr.",
  429: "Zu viele Admin-Aktionen. Bitte kurz warten.",
  500: "Rechnung konnte nicht als bezahlt markiert werden.",
  default: "Rechnung konnte nicht als bezahlt markiert werden.",
};

// Backend-Vertrag: { invoice: {...} }. Defensiv entpacken (auch { data } / roh).
function selectInvoice(d) {
  if (d && typeof d === "object" && !Array.isArray(d)) {
    if (d.invoice && typeof d.invoice === "object") return d.invoice;
    if (d.data && typeof d.data === "object" && !Array.isArray(d.data)) return d.data;
    return d;
  }
  return null;
}

// ── Feld-Getter: NUR erlaubte Felder. password/hash/token/secret, Adressen,
// label_url und Trackingdaten werden NIE gelesen — kein Object.keys, kein Spread
// des ganzen Objekts. E-Mail ist bewusst erlaubt (Forderungsmanagement).
const idOf = (r) => firstDefined(r.id, r.invoice_id, r.invoiceId);
const userIdOf = (r) => firstDefined(r.user_id, r.userId, r.customer_id, r.customerId);
const shipmentIdOf = (r) => firstDefined(r.shipment_id, r.shipmentId);
const invoiceNoOf = (r) => firstDefined(r.invoice_number, r.invoiceNumber, r.number);
const amountOf = (r) => firstDefined(r.amount, r.total, r.amount_gross, r.amountGross);
const vatOf = (r) => firstDefined(r.shipping_vat_amount, r.shippingVatAmount);
const statusOf = (r) => firstDefined(r.status, r.state);
const dueOf = (r) => firstDefined(r.due_date, r.dueDate);
const paidAtOf = (r) => firstDefined(r.paid_at, r.paidAt);
const createdOf = (r) => firstDefined(r.created_at, r.createdAt, r.created);
const nameOf = (r) => firstDefined(r.name, r.customer_name, r.full_name, r.contact_name);
const emailOf = (r) => firstDefined(r.email, r.e_mail);
const companyOf = (r) => firstDefined(r.company_name, r.company, r.firma);
const docStatusOf = (r) => firstDefined(r.document_status, r.documentStatus);
const pdfGeneratedAtOf = (r) => firstDefined(r.pdf_generated_at, r.pdfGeneratedAt);
const pdfSizeOf = (r) => firstDefined(r.pdf_size_bytes, r.pdfSizeBytes);
const docAttemptsOf = (r) => firstDefined(r.document_attempts, r.documentAttempts);
const emailStatusOf = (r) => firstDefined(r.email_status, r.emailStatus);
const emailSentAtOf = (r) => firstDefined(r.email_sent_at, r.emailSentAt);
const emailAttemptsOf = (r) => firstDefined(r.email_attempts, r.emailAttempts);
const emailLastErrorOf = (r) => firstDefined(r.email_last_error, r.emailLastError);

const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");
const moneyOrDash = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? money(v) : "—");

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

function KV({ items }) {
  return (
    <dl className="adm-kv">
      {items.map(([k, v]) => (
        <div className="adm-kv-item" key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminInvoiceDetailPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [payOpen, setPayOpen] = useState(false); // Bestätigungsmodal
  const [payBusy, setPayBusy] = useState(false); // PATCH läuft
  const [payMsg, setPayMsg] = useState(null);    // { type, text }

  // Rechnungsdokument (Phase 3): Erzeugen/Retry (Bestätigungsmodal) + Download.
  const [genOpen, setGenOpen] = useState(false);         // Bestätigungsmodal Erzeugen/Retry
  const [docBusy, setDocBusy] = useState(false);         // Generate-/Retry-POST läuft
  const [docDownloading, setDocDownloading] = useState(false);
  const [docMsg, setDocMsg] = useState(null);            // { type, text }
  const [previewOpen, setPreviewOpen] = useState(false); // PDF-Vorschau (Phase 4)

  // Rechnungs-E-Mail (Phase 4): Send/Retry/Resend mit Bestätigungsdialog.
  const [mailOpen, setMailOpen] = useState(false);       // Bestätigungsmodal Versand
  const [mailBusy, setMailBusy] = useState(false);       // POST läuft (Doppelklick-Schutz)
  const [mailMsg, setMailMsg] = useState(null);          // { type, text }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const r = await getAdminInvoice(id);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        if (r.status === 404) { setNotFound(true); setInvoice(null); return; }
        setError(ERROR_MESSAGES[r.status] || GENERIC_ERROR);
        setInvoice(null);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      setInvoice(selectInvoice(d));
    } catch {
      setError(GENERIC_ERROR);
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Beim Wechsel auf eine andere Rechnung Modal/Meldung zurücksetzen (nicht bei
  // manuellem Reload nach Erfolg — dort bleibt der Erfolgshinweis sichtbar).
  useEffect(() => { setPayOpen(false); setPayMsg(null); setGenOpen(false); setDocMsg(null); setMailOpen(false); setMailMsg(null); setPreviewOpen(false); }, [id]);

  const back = (
    <Link to="/admin/invoices" className="adm-back">
      <Icon n="chevronLeft" s={16} /> Zurück zur Rechnungsliste
    </Link>
  );

  if (loading) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card"><div className="loading-center"><span className="spinner spinner-dark" /> Wird geladen…</div></div>
      </div>
    );
  }
  if (notFound) {
    return (
      <div className="adm-page">
        {back}
        <div className="table-card"><div className="empty"><div className="empty-icon">🔎</div><div className="empty-title">Rechnung nicht gefunden</div></div></div>
      </div>
    );
  }
  if (error || !invoice) {
    return (
      <div className="adm-page">
        {back}
        <div className="alert alert-error"><Icon n="x" s={16} />{error || GENERIC_ERROR}</div>
      </div>
    );
  }

  const inv = invoice;
  const now = new Date(); // „heute" für die Überfälligkeits-Anzeige (nur Anzeige)
  const overdue = isInvoiceOverdue(dueOf(inv), statusOf(inv), now);
  const [statusCls, statusLabel] = invoiceDisplayMeta(statusOf(inv), dueOf(inv), now);
  const sid = shipmentIdOf(inv);
  const vat = vatOf(inv);
  const isPaid = statusOf(inv) === "paid"; // ECHTER Status (nicht die Overdue-Anzeige)

  const openPay = () => { setPayMsg(null); setPayOpen(true); };
  const closePay = () => { if (!payBusy) setPayOpen(false); };
  const confirmPay = async () => {
    setPayBusy(true);
    setPayMsg(null);
    try {
      const r = await markAdminInvoicePaid(id);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        setPayMsg({ type: "error", text: PAY_ERRORS[r.status] || PAY_ERRORS.default });
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const alreadyPaid = d.alreadyPaid === true || d.already_paid === true;
      setPayMsg(alreadyPaid
        ? { type: "info", text: "Diese Rechnung war bereits als bezahlt markiert." }
        : { type: "success", text: "Rechnung wurde als bezahlt markiert." });
      load(); // Backend-Realität neu laden — kein optimistisches UI
    } catch {
      setPayMsg({ type: "error", text: PAY_ERRORS.default });
    } finally {
      setPayBusy(false);
      setPayOpen(false);
    }
  };

  // ── Rechnungsdokument: Erzeugen/Retry (idempotenter Backend-Endpunkt) ──
  const docStatus = docStatusOf(inv || {});
  const openGen = () => { setDocMsg(null); setGenOpen(true); };
  const closeGen = () => { if (!docBusy) setGenOpen(false); };
  const confirmGenerate = async () => {
    setDocBusy(true);
    setDocMsg(null);
    try {
      const r = await generateAdminInvoiceDocument(id);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        setDocMsg({ type: "error", text: r.status === 404
          ? "Rechnung wurde nicht gefunden oder existiert nicht mehr."
          : r.status === 429 ? "Zu viele Admin-Aktionen. Bitte kurz warten."
          : "Das Rechnungsdokument konnte nicht erzeugt werden." });
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      const outcome = d.outcome;
      setDocMsg(outcome === "generated" ? { type: "success", text: "Das Rechnungsdokument wurde erzeugt." }
        : outcome === "already_ready" ? { type: "info", text: "Das Rechnungsdokument ist bereits fertig." }
        : outcome === "in_progress" ? { type: "info", text: "Die Dokumenterzeugung läuft bereits." }
        : { type: "error", text: "Die Dokumenterzeugung ist fehlgeschlagen. Details im Dokumentstatus." });
      load(); // Serverwahrheit neu laden — kein optimistisches UI
    } catch {
      setDocMsg({ type: "error", text: "Das Rechnungsdokument konnte nicht erzeugt werden." });
    } finally {
      setDocBusy(false);
      setGenOpen(false);
    }
  };

  // ── Rechnungsdokument: auditierter Admin-Download (Testdokumente erlaubt) ──
  const handleDocDownload = async () => {
    if (docDownloading) return;
    setDocMsg(null);
    setDocDownloading(true);
    try {
      await downloadAdminInvoicePdf(id, invoiceNoOf(inv));
    } catch (e) {
      setDocMsg({ type: "error", text: e?.message || "Die Rechnung konnte nicht heruntergeladen werden." });
    } finally {
      setDocDownloading(false);
    }
  };

  // ── Rechnungs-E-Mail (Phase 4) ──
  // Aktion aus dem ECHTEN Status abgeleitet: pending → send, failed → send (Backend
  // klassifiziert als retry), sent → resend. Testdokumente besitzen KEINE Aktion.
  const emailStatus = emailStatusOf(inv) || "pending";
  const isTestDoc = isTestInvoiceDocument({ document_status: docStatus, is_test_document: inv.is_test_document });
  const mailAction = emailStatus === "sent" ? "resend" : "send";
  const mailActionLabel = emailStatus === "pending" ? "Rechnung per E-Mail senden"
    : emailStatus === "failed" ? "Versand erneut versuchen"
    : "Rechnung erneut senden";
  const openMail = () => { setMailMsg(null); setMailOpen(true); };
  const closeMail = () => { if (!mailBusy) setMailOpen(false); };
  const confirmMail = async () => {
    setMailBusy(true);
    setMailMsg(null);
    try {
      const r = mailAction === "resend" ? await resendAdminInvoiceEmail(id) : await sendAdminInvoiceEmail(id);
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        setMailMsg({ type: "error", text:
          d && typeof d.message === "string" && d.message ? d.message
          : r.status === 404 ? "Rechnung wurde nicht gefunden oder existiert nicht mehr."
          : r.status === 429 ? "Zu viele Admin-Aktionen. Bitte kurz warten."
          : "Die Rechnungs-E-Mail konnte nicht versendet werden." });
        return;
      }
      const outcome = d.outcome;
      setMailMsg(outcome === "sent" ? { type: "success", text: "Die Rechnungs-E-Mail wurde versendet." }
        : outcome === "already_sent" ? { type: "info", text: "Diese Rechnung wurde bereits versendet. Für einen erneuten Versand bitte „Rechnung erneut senden“ verwenden." }
        : outcome === "in_progress" ? { type: "info", text: "Ein Versand läuft bereits." }
        : { type: "error", text: "Der Versand ist fehlgeschlagen. Details siehe letzter Fehler." });
      load(); // Serverwahrheit neu laden — kein optimistisches UI
    } catch {
      setMailMsg({ type: "error", text: "Die Rechnungs-E-Mail konnte nicht versendet werden." });
    } finally {
      setMailBusy(false);
      setMailOpen(false);
    }
  };

  return (
    <div className="adm-page">
      {back}

      {payMsg && (
        <div className={`alert ${payMsg.type === "success" ? "alert-success" : payMsg.type === "info" ? "alert-info" : "alert-error"}`}>
          <Icon n={payMsg.type === "success" ? "check" : payMsg.type === "info" ? "info" : "x"} s={16} />{payMsg.text}
        </div>
      )}

      {/* 1) Kopfbereich */}
      <div className="adm-card">
        <div className="adm-card-body">
          <div className="adm-detail-head">
            <span className="adm-detail-id">Rechnung {dash(invoiceNoOf(inv))}</span>
            <span className="adm-detail-badges">
              <span className="adm-chip">#{dash(idOf(inv))}</span>
              <span className={`badge ${statusCls}`}>{statusLabel}</span>
              <span className="adm-chip"><Icon n="calendar" s={13} /> Erstellt {fmtDate(createdOf(inv))}</span>
            </span>
          </div>
        </div>
      </div>

      <div className="adm-cards">
        {/* 2) Rechnungsdaten */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="invoice" s={17} /> Rechnungsdaten</div>
          <div className="adm-card-body">
            <KV items={[
              // Drei getrennte Nummernkreise, klar benannt: Rechnungs-, Bestell- und
              // Kundennummer. Bestell-/Kundennummer stammen aus den eingefrorenen Snapshots
              // (Legacy-Rechnungen: „—"). Die interne Invoice-ID bleibt technischer Schlüssel.
              ["Rechnungsnummer", dash(invoiceNoOf(inv))],
              [NUMBER_LABELS.businessOrder, dash(businessOrderNumberOf(inv))],
              [NUMBER_LABELS.customer, dash(customerNumberOf(inv))],
              ["Betrag", moneyOrDash(amountOf(inv))],
              ["MwSt Versand", vat != null && vat !== "" ? moneyOrDash(vat) : "—"],
              ["Status", <span className={`badge ${statusCls}`}>{statusLabel}</span>],
              ["Fällig am", <span className={overdue ? "adm-overdue" : undefined}>{fmtDate(dueOf(inv))}{overdue ? " · überfällig" : ""}</span>],
              ["Bezahlt am", fmtDate(paidAtOf(inv))],
              ["Erstellt am", fmtDate(createdOf(inv))],
            ]} />
          </div>
        </div>

        {/* 3) Kundendaten (aus dem Rechnungs-Join; kein zusätzlicher Request) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="idcard" s={17} /> Kunde</div>
          <div className="adm-card-body">
            <KV items={[
              ["User-ID", <span className="adm-mono">{dash(userIdOf(inv))}</span>],
              ["Firma", dash(companyOf(inv))],
              ["Name", dash(nameOf(inv))],
              ["E-Mail", dash(emailOf(inv))],
            ]} />
          </div>
        </div>

        {/* 4) Verknüpfung — Shipment-ID verlinkt auf die bestehende Sendungsdetailseite */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="package" s={17} /> Verknüpfung</div>
          <div className="adm-card-body">
            <KV items={[
              ["Shipment-ID", sid != null && String(sid).trim() !== ""
                ? <Link className="adm-idlink" to={`/admin/shipments/${encodeURIComponent(sid)}`}>{String(sid)}</Link>
                : "—"],
            ]} />
          </div>
        </div>

        {/* 4b) Rechnungsdokument (Phase 3) — Status, Metadaten, Erzeugen/Retry/Download */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="form" s={17} /> Rechnungsdokument</div>
          <div className="adm-card-body">
            {docMsg && (
              <div
                className={`alert ${docMsg.type === "success" ? "alert-success" : docMsg.type === "info" ? "alert-info" : "alert-error"}`}
                role={docMsg.type === "error" ? "alert" : "status"}
                style={{ marginBottom: 14 }}
              >
                <Icon n={docMsg.type === "success" ? "check" : docMsg.type === "info" ? "info" : "x"} s={16} />{docMsg.text}
              </div>
            )}
            <KV items={[
              ["Dokumentstatus", (() => {
                const [cls, label] = documentStatusMeta(docStatus);
                const isTest = isTestInvoiceDocument({ document_status: docStatus, is_test_document: inv.is_test_document });
                return (
                  <span className="adm-doc-badges">
                    <span className={`badge ${cls}`}>{docStatus ? label : "—"}</span>
                    {isTest && <span className="badge badge-yellow">Testdokument</span>}
                  </span>
                );
              })()],
              ["PDF erstellt am", fmtDate(pdfGeneratedAtOf(inv))],
              ["Dateigröße", formatBytes(pdfSizeOf(inv))],
              ["Erstellungsversuche", docAttemptsOf(inv) != null ? String(docAttemptsOf(inv)) : "—"],
            ]} />

            {isTestInvoiceDocument({ document_status: docStatus, is_test_document: inv.is_test_document }) && (
              <p className="adm-support-hint">
                Testdokument – nicht für den Zahlungsverkehr freigegeben. Für Kunden bleibt der Download gesperrt;
                der Admin-Download dient ausschließlich der technischen Prüfung.
              </p>
            )}

            <div className="adm-support">
              {docStatus === "ready" && (
                <>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setPreviewOpen(true)} disabled={docDownloading}>
                    <Icon n="eye" s={14} /> PDF ansehen
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleDocDownload} disabled={docDownloading}>
                    {docDownloading
                      ? <><span className="spinner spinner-dark" /> Wird geladen…</>
                      : <><Icon n="download" s={14} /> PDF herunterladen</>}
                  </button>
                </>
              )}
              {docStatus === "pending_document" && (
                <button type="button" className="btn btn-primary btn-sm" onClick={openGen} disabled={docBusy}>
                  <Icon n="form" s={14} /> PDF erzeugen
                </button>
              )}
              {docStatus === "document_failed" && (
                <button type="button" className="btn btn-primary btn-sm" onClick={openGen} disabled={docBusy}>
                  <Icon n="refresh" s={14} /> PDF erneut erzeugen
                </button>
              )}
              {docStatus === "generating" && (
                <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
                  <Icon n="refresh" s={14} /> Status aktualisieren
                </button>
              )}
            </div>
            {docStatus === "generating" && (
              <p className="adm-support-hint">Die Dokumenterzeugung läuft. Kein erneutes Anstoßen nötig.</p>
            )}
          </div>
        </div>

        {/* 4c) Rechnungs-E-Mail (Phase 4) — Status, Historie-Eckdaten, Versandaktion */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="mail" s={17} /> E-Mail-Versand</div>
          <div className="adm-card-body">
            {mailMsg && (
              <div
                className={`alert ${mailMsg.type === "success" ? "alert-success" : mailMsg.type === "info" ? "alert-info" : "alert-error"}`}
                role={mailMsg.type === "error" ? "alert" : "status"}
                style={{ marginBottom: 14 }}
              >
                <Icon n={mailMsg.type === "success" ? "check" : mailMsg.type === "info" ? "info" : "x"} s={16} />{mailMsg.text}
              </div>
            )}
            <KV items={[
              ["Versandstatus", (() => {
                const [cls, label] = emailDisplayMeta({ document_status: docStatus, is_test_document: inv.is_test_document, email_status: emailStatus });
                return <span className={`badge ${cls}`}>{label}</span>;
              })()],
              ["Versendet am", emailStatus === "sent" ? fmtDate(emailSentAtOf(inv)) : "—"],
              ["Versuche", emailAttemptsOf(inv) != null ? String(emailAttemptsOf(inv)) : "0"],
              ["Letzter Fehler", emailStatus === "failed" && emailLastErrorOf(inv) ? String(emailLastErrorOf(inv)) : "—"],
            ]} />

            {isTestDoc ? (
              <p className="adm-support-hint">Testdokumente dürfen nicht per E-Mail versendet werden.</p>
            ) : emailStatus === "sending" ? (
              <>
                <div className="adm-support">
                  <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
                    <Icon n="refresh" s={14} /> Status aktualisieren
                  </button>
                </div>
                <p className="adm-support-hint">Ein Versand läuft. Kein erneutes Anstoßen nötig.</p>
              </>
            ) : (
              <>
                <div className="adm-support">
                  <button type="button" className="btn btn-primary btn-sm" onClick={openMail} disabled={mailBusy || docStatus !== "ready"}>
                    <Icon n="mail" s={14} /> {mailActionLabel}
                  </button>
                </div>
                {docStatus !== "ready" && (
                  <p className="adm-support-hint">Der Versand ist erst nach erfolgreicher Dokumenterstellung möglich.</p>
                )}
              </>
            )}
          </div>
        </div>

        {/* 5) Admin-Aktion — Rechnung als bezahlt markieren (mutierend, auditiert) */}
        <div className="adm-card">
          <div className="adm-card-head"><Icon n="euro" s={17} /> Admin-Aktion</div>
          <div className="adm-card-body">
            {isPaid ? (
              <p className="adm-support-hint" style={{ marginTop: 0 }}>
                Rechnung ist als bezahlt markiert{paidAtOf(inv) ? ` (am ${fmtDate(paidAtOf(inv))})` : ""}.
              </p>
            ) : (
              <>
                <p className="adm-support-hint" style={{ marginTop: 0 }}>
                  Setzt den Rechnungsstatus auf bezahlt.
                  Die Aktion wird im Admin-Audit protokolliert.
                </p>
                <div className="adm-support">
                  <button type="button" className="btn btn-primary btn-sm" onClick={openPay} disabled={payBusy}>
                    <Icon n="check" s={14} /> Als bezahlt markieren
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bestätigungsmodal Rechnungs-E-Mail — jede Versandaktion erst nach bewusster Bestätigung. */}
      {mailOpen && (
        <div className="adm-modal-overlay" role="presentation" onClick={closeMail}>
          <div
            className="adm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adm-mail-title"
            aria-describedby="adm-mail-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adm-modal-icon adm-modal-icon-approve" aria-hidden="true"><Icon n="mail" s={22} /></div>
            <h2 id="adm-mail-title" className="adm-modal-title">
              {mailAction === "resend" ? "Rechnung erneut per E-Mail senden?" : "Rechnung per E-Mail senden?"}
            </h2>
            <p id="adm-mail-desc" className="adm-modal-text">
              {mailAction === "resend"
                ? "Die Rechnung wurde bereits versendet. Möchten Sie dasselbe unveränderte Rechnungsdokument erneut senden?"
                : "Sendet die Rechnung mit dem unveränderten, gespeicherten PDF-Dokument an die hinterlegte Kunden-E-Mail."}
            </p>
            <p className="adm-modal-sub">Rechnung {dash(invoiceNoOf(inv))} · #{dash(idOf(inv))}</p>
            <p className="adm-support-hint" style={{ marginTop: 0, marginBottom: 16 }}>
              Die Aktion wird im Admin-Audit protokolliert. Es entsteht keine neue Rechnung und keine neue Rechnungsnummer.
            </p>
            <div className="adm-modal-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={closeMail} disabled={mailBusy}>Abbrechen</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmMail} disabled={mailBusy}>
                {mailBusy
                  ? <><span className="spinner spinner-dark" /> Wird gesendet…</>
                  : <><Icon n="check" s={14} /> {mailAction === "resend" ? "Erneut senden" : "Senden"}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF-Vorschau (Phase 4) — kurzlebige Blob-Object-URL, Cleanup im Modal. */}
      {previewOpen && (
        <InvoicePdfPreviewModal
          title={`Rechnung ${dash(invoiceNoOf(inv))}`}
          fetchPdf={() => fetchAdminInvoicePdf(id, invoiceNoOf(inv))}
          onDownload={() => downloadAdminInvoicePdf(id, invoiceNoOf(inv))}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {/* Bestätigungsmodal Dokumenterzeugung/-wiederholung — mutierend; erst nach Bestätigung. */}
      {genOpen && (
        <div className="adm-modal-overlay" role="presentation" onClick={closeGen}>
          <div
            className="adm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adm-gen-title"
            aria-describedby="adm-gen-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adm-modal-icon adm-modal-icon-approve" aria-hidden="true"><Icon n="form" s={22} /></div>
            <h2 id="adm-gen-title" className="adm-modal-title">
              {docStatus === "document_failed" ? "Rechnungsdokument erneut erzeugen?" : "Rechnungsdokument erzeugen?"}
            </h2>
            <p id="adm-gen-desc" className="adm-modal-text">
              Erzeugt das unveränderliche Rechnungs-PDF serverseitig neu{docStatus === "document_failed" ? " (Wiederholung nach Fehlschlag)" : ""}.
              Es entsteht keine neue Rechnung und keine neue Rechnungsnummer; ein bereits fertiges Dokument wird nicht überschrieben.
            </p>
            <p className="adm-modal-sub">Rechnung {dash(invoiceNoOf(inv))} · #{dash(idOf(inv))}</p>
            <p className="adm-support-hint" style={{ marginTop: 0, marginBottom: 16 }}>Die Aktion wird im Admin-Audit protokolliert. Es wird keine E-Mail versendet.</p>
            <div className="adm-modal-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={closeGen} disabled={docBusy}>Abbrechen</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmGenerate} disabled={docBusy}>
                {docBusy
                  ? <><span className="spinner spinner-dark" /> Wird erzeugt…</>
                  : <><Icon n="check" s={14} /> {docStatus === "document_failed" ? "Erneut erzeugen" : "Erzeugen"}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bestätigungsmodal — mutierend; erst nach bewusster Bestätigung. */}
      {payOpen && (
        <div className="adm-modal-overlay" role="presentation" onClick={closePay}>
          <div
            className="adm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="adm-pay-title"
            aria-describedby="adm-pay-desc"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="adm-modal-icon adm-modal-icon-approve" aria-hidden="true"><Icon n="check" s={22} /></div>
            <h2 id="adm-pay-title" className="adm-modal-title">Diese Rechnung wirklich als bezahlt markieren?</h2>
            <p id="adm-pay-desc" className="adm-modal-text">
              Diese Aktion setzt den Rechnungsstatus auf bezahlt.
            </p>
            <p className="adm-modal-sub">Rechnung {dash(invoiceNoOf(inv))} · #{dash(idOf(inv))}</p>
            <p className="adm-support-hint" style={{ marginTop: 0, marginBottom: 16 }}>Die Aktion wird im Admin-Audit protokolliert.</p>
            <div className="adm-modal-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={closePay} disabled={payBusy}>Abbrechen</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmPay} disabled={payBusy}>
                {payBusy
                  ? <><span className="spinner spinner-dark" /> Wird gespeichert…</>
                  : <><Icon n="check" s={14} /> Als bezahlt markieren</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
