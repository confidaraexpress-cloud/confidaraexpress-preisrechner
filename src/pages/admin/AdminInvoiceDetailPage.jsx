import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { AdminBackLink } from "../../components/admin/AdminBackLink";
import { EmptyState, ErrorState, LoadingState } from "../../components/ui/StateView";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { getAdminInvoice, markAdminInvoicePaid, generateAdminInvoiceDocument, sendAdminInvoiceEmail, resendAdminInvoiceEmail, recordInvoiceReversal, createInvoiceReversalInvoice } from "../../api/adminApi";
import { Field } from "../../components/ui/Field";
import { DateField } from "../../components/admin/DateField";
// Auftrag 2 / P1: manuell erstellte Rechnungen — Herkunft, Stornovermerk, Texte ohne automatische E-Mail.
import {
  MANUAL_INVOICE_TEXT as MI, EMPTY_REVERSAL_FORM, EMPTY_STORNO_FORM, berlinToday, cancellationInfo, isCancelledInvoice,
  isManualInvoice, reversalError, reversalPayload, stornoPayload,
} from "../../utils/manualInvoiceView.mjs";
import { money } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { downloadAdminInvoicePdf, downloadAdminReversalInvoicePdf, fetchAdminInvoicePdf } from "../../utils/downloadInvoicePdf";
import { InvoicePdfPreviewModal } from "../../components/dashboard/InvoicePdfPreviewModal";
import { NUMBER_LABELS } from "../../utils/businessNumbers.mjs";
import { paymentTermLabel } from "../../utils/paymentTerm.mjs";
import { shipmentStatusMeta } from "../../utils/adminShipments";
import {
  DOCUMENT_ERROR_NOTE,
  DOCUMENT_GENERATE,
  EMAIL_ERROR_NOTE,
  INVOICE_DETAIL_ERROR,
  NON_PRODUCTIVE_NOTE,
  PAY_DIALOG,
  SHIPMENT_NO_ORDER_NUMBER,
  SNAPSHOT_MISSING_NOTE,
  SUCCESS_TEXT,
  amountFields,
  currentAccount,
  documentOutcomeMessage,
  documentState,
  documentErrorMessage,
  emailOutcomeMessage,
  emailState,
  invoiceDetailError,
  invoiceModeMeta,
  invoiceSourceMeta,
  isInvoiceOverdue,
  isProductiveInvoice,
  linkedShipment,
  payErrorMessage,
  payability,
  paymentStatus,
  snapshotRecipient,
  technicalCode,
} from "../../utils/adminInvoiceView.mjs";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

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
// des ganzen Objekts.
const idOf = (r) => firstDefined(r.id, r.invoice_id, r.invoiceId);
const invoiceNoOf = (r) => firstDefined(r.invoice_number, r.invoiceNumber, r.number);
const dueOf = (r) => firstDefined(r.due_date, r.dueDate);
const paidAtOf = (r) => firstDefined(r.paid_at, r.paidAt);
const createdOf = (r) => firstDefined(r.created_at, r.createdAt, r.created);
const issuedAtOf = (r) => firstDefined(r.issued_at, r.issuedAt);
const serviceDateOf = (r) => firstDefined(r.service_date, r.serviceDate);
const pdfGeneratedAtOf = (r) => firstDefined(r.pdf_generated_at, r.pdfGeneratedAt);
const pdfSizeOf = (r) => firstDefined(r.pdf_size_bytes, r.pdfSizeBytes);
const docAttemptsOf = (r) => firstDefined(r.document_attempts, r.documentAttempts);
const docLastErrorOf = (r) => firstDefined(r.document_last_error, r.documentLastError);
const emailSentAtOf = (r) => firstDefined(r.email_sent_at, r.emailSentAt);
const emailAttemptsOf = (r) => firstDefined(r.email_attempts, r.emailAttempts);
const emailLastErrorOf = (r) => firstDefined(r.email_last_error, r.emailLastError);
const emailMessageIdOf = (r) => firstDefined(r.email_message_id, r.emailMessageId);
const jumingoOrderOf = (r) => firstDefined(r.jumingo_order_number, r.jumingoOrderNumber);
const docModeRawOf = (r) => firstDefined(r.document_mode, r.documentMode);

const dash = (v) => (v != null && String(v).trim() !== "" ? String(v) : "—");
const moneyOrDash = (v) => (v != null && v !== "" && Number.isFinite(Number(v)) ? money(v) : "—");

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

function fmtBytes(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace(".", ",")} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
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

function Alert({ msg }) {
  if (!msg) return null;
  const cls = msg.type === "success" ? "alert-success" : msg.type === "info" ? "alert-info" : "alert-error";
  return (
    <div className={`alert ${cls}`} role={msg.type === "error" ? "alert" : "status"} style={{ marginBottom: 14 }}>
      {msg.text}
    </div>
  );
}

export default function AdminInvoiceDetailPage() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null); // { text, notFound, retryable }

  const [payOpen, setPayOpen] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [payMsg, setPayMsg] = useState(null);

  const [genOpen, setGenOpen] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [docDownloading, setDocDownloading] = useState(false);
  const [docMsg, setDocMsg] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const [mailOpen, setMailOpen] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const [mailMsg, setMailMsg] = useState(null);

  // Auftrag 2 / P1: Meldung nach dem Ausstellen (aus dem Editor) und Stornovermerk.
  const location = useLocation();
  const issuedNoticeText = location.state && typeof location.state.manualInvoiceNotice === "string"
    ? location.state.manualInvoiceNotice : "";
  const [reversalOpen, setReversalOpen] = useState(false);
  const [reversalBusy, setReversalBusy] = useState(false);
  const [reversalForm, setReversalForm] = useState(EMPTY_REVERSAL_FORM);
  const [reversalErrors, setReversalErrors] = useState({});
  const [reversalMsg, setReversalMsg] = useState(null);
  // Schritt 3: Stornorechnung im System.
  const [stornoOpen, setStornoOpen] = useState(false);
  const [stornoBusy, setStornoBusy] = useState(false);
  const [stornoForm, setStornoForm] = useState(EMPTY_STORNO_FORM);
  const [stornoErrors, setStornoErrors] = useState({});
  const [stornoDownloadBusy, setStornoDownloadBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await getAdminInvoice(id);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        setLoadError(invoiceDetailError(r.status));
        setInvoice(null);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      setInvoice(selectInvoice(d));
    } catch {
      setLoadError({ text: INVOICE_DETAIL_ERROR, notFound: false, retryable: true });
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Beim Wechsel auf eine andere Rechnung Dialoge/Meldungen zurücksetzen.
  useEffect(() => {
    setPayOpen(false); setPayMsg(null);
    setGenOpen(false); setDocMsg(null);
    setMailOpen(false); setMailMsg(null);
    setPreviewOpen(false);
    setReversalOpen(false); setReversalMsg(null); setReversalErrors({});
    setStornoOpen(false); setStornoErrors({});
  }, [id]);

  // Rückweg zur Herkunft (UX-Paket 2), sonst zur Liste.
  const back = <AdminBackLink to="/admin/invoices" label="Zurück zu den Rechnungen" />;

  if (loading) {
    return (
      <div className="adm-page">
        {back}
        <div className="ce-card"><LoadingState text="Rechnung wird geladen …" /></div>
      </div>
    );
  }

  if (loadError?.notFound) {
    return (
      <div className="adm-page">
        {back}
        <div className="ce-card">
          <EmptyState
            title={loadError.text}
            text="Möglicherweise wurde sie entfernt oder die Adresse ist nicht mehr gültig."
            action={<Link className="btn btn-outline btn-sm" to="/admin/invoices">Zurück zur Rechnungsliste</Link>}
          />
        </div>
      </div>
    );
  }

  if (loadError || !invoice) {
    return (
      <div className="adm-page">
        {back}
        <div className="ce-card">
          <ErrorState
            title={loadError?.text || INVOICE_DETAIL_ERROR}
            action={(
              <button type="button" className="btn btn-primary btn-sm" onClick={load}>
                Erneut versuchen
              </button>
            )}
            secondaryAction={<Link className="btn btn-outline btn-sm" to="/admin/invoices">Zurück zur Rechnungsliste</Link>}
          />
        </div>
      </div>
    );
  }

  const inv = invoice;
  const now = new Date();
  const productive = isProductiveInvoice(inv);
  const mode = invoiceModeMeta(inv);
  const status = paymentStatus(inv, now);
  const overdue = isInvoiceOverdue(inv, now);
  const amounts = amountFields(inv);
  const doc = documentState(inv);
  const mail = emailState(inv);
  const pay = payability(inv);
  const recipient = snapshotRecipient(inv);
  const account = currentAccount(inv);
  const shipment = linkedShipment(inv);
  const manual = isManualInvoice(inv);
  const cancelled = isCancelledInvoice(inv);
  const storno = cancellationInfo(inv);
  const source = invoiceSourceMeta(inv);
  const number = dash(invoiceNoOf(inv));
  const subline = `Rechnung ${number} · #${dash(idOf(inv))}`;

  // ── Als bezahlt markieren ──
  const confirmPay = async () => {
    setPayBusy(true);
    setPayMsg(null);
    try {
      const r = await markAdminInvoicePaid(id);
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        setPayMsg({ type: "error", text: payErrorMessage(r.status, d && d.error) });
        return;
      }
      const alreadyPaid = d.alreadyPaid === true || d.already_paid === true;
      setPayMsg(alreadyPaid
        ? { type: "info", text: SUCCESS_TEXT.alreadyPaid }
        : { type: "success", text: SUCCESS_TEXT.paid });
      load(); // Backend-Realität neu laden — kein optimistisches UI
    } catch {
      setPayMsg({ type: "error", text: payErrorMessage(0, null) });
    } finally {
      setPayBusy(false);
      setPayOpen(false);
    }
  };

  // ── Rechnungsdokument erzeugen/wiederholen ──
  const confirmGenerate = async () => {
    setDocBusy(true);
    setDocMsg(null);
    try {
      const r = await generateAdminInvoiceDocument(id);
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        // Paritätsaudit B6: eine Sperre des Produktiv-Guards ist kein „erneut möglich".
        setDocMsg(documentErrorMessage(r.status, d));
        return;
      }
      setDocMsg(documentOutcomeMessage(d.outcome));
      load();
    } catch {
      setDocMsg({ type: "error", text: DOCUMENT_ERROR_NOTE });
    } finally {
      setDocBusy(false);
      setGenOpen(false);
    }
  };

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

  // ── Rechnungs-E-Mail ──
  const mailKind = mail.action?.kind || "send";
  const confirmMail = async () => {
    setMailBusy(true);
    setMailMsg(null);
    try {
      const r = mailKind === "resend" ? await resendAdminInvoiceEmail(id) : await sendAdminInvoiceEmail(id);
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setMailMsg({ type: "error", text:
          d && typeof d.message === "string" && d.message ? d.message
          : r.status === 404 ? "Rechnung wurde nicht gefunden oder existiert nicht mehr."
          : r.status === 429 ? "Zu viele Admin-Aktionen. Bitte kurz warten."
          : EMAIL_ERROR_NOTE });
        return;
      }
      setMailMsg(emailOutcomeMessage(d.outcome, mailKind, d.errorCode));
      load();
    } catch {
      setMailMsg({ type: "error", text: EMAIL_ERROR_NOTE });
    } finally {
      setMailBusy(false);
      setMailOpen(false);
    }
  };

  // ── Auftrag 2 / P1: Storno vermerken (nur manuelle Rechnungen) ──
  const openReversal = () => {
    setReversalMsg(null);
    setReversalErrors({});
    setReversalForm({ ...EMPTY_REVERSAL_FORM, cancellationDate: berlinToday() });
    setReversalOpen(true);
  };
  const setReversalField = (key, value) => setReversalForm((p) => ({ ...p, [key]: value }));
  const confirmReversal = async () => {
    if (reversalBusy) return;
    const geprueft = reversalPayload(reversalForm, { paid: status.kind === "paid" });
    if (!geprueft.ok) { setReversalErrors(geprueft.errors); return; }
    setReversalBusy(true);
    setReversalErrors({});
    try {
      const r = await recordInvoiceReversal(id, geprueft.body);
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const e = reversalError(r.status, d);
        setReversalErrors(e.fieldErrors || {});
        setReversalMsg({ type: "error", text: e.text });
        return;
      }
      setReversalOpen(false);
      setReversalMsg({ type: "success", text: MI.reversalDone });
      load();
    } catch {
      setReversalMsg({ type: "error", text: MI.failed });
    } finally {
      setReversalBusy(false);
    }
  };

  // ── Schritt 3: Stornorechnung im System (nur manuelle Rechnungen) ──
  const openStorno = () => {
    setReversalMsg(null);
    setStornoErrors({});
    setStornoForm(EMPTY_STORNO_FORM);
    setStornoOpen(true);
  };
  const setStornoField = (key, value) => setStornoForm((p) => ({ ...p, [key]: value }));
  const confirmStorno = async () => {
    if (stornoBusy) return;
    const geprueft = stornoPayload(stornoForm, { paid: status.kind === "paid" });
    if (!geprueft.ok) { setStornoErrors(geprueft.errors); return; }
    setStornoBusy(true);
    setStornoErrors({});
    try {
      const r = await createInvoiceReversalInvoice(id, geprueft.body);
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const e = reversalError(r.status, d);
        setStornoErrors(e.fieldErrors || {});
        setReversalMsg({ type: "error", text: e.text });
        return;
      }
      setStornoOpen(false);
      setReversalMsg({ type: "success", text: MI.stornoDone(typeof d.cancellationNumber === "string" ? d.cancellationNumber : "") });
      load();
    } catch {
      setReversalMsg({ type: "error", text: MI.failed });
    } finally {
      setStornoBusy(false);
    }
  };
  const downloadStorno = async (number) => {
    if (stornoDownloadBusy) return;
    setStornoDownloadBusy(true);
    try {
      await downloadAdminReversalInvoicePdf(id, number);
    } catch {
      setReversalMsg({ type: "error", text: MI.stornoDownloadFailed });
    } finally {
      setStornoDownloadBusy(false);
    }
  };

  return (
    <div className="adm-page">
      {/* 1) Kopfbereich — derselbe Seitenkopf wie in den Adminlisten: Identität
          und Status getrennt, Zurück-Link darüber. Die Aktion „Aktuelles
          Kundenkonto öffnen" stand hier bis Paket E ein ZWEITES Mal (identisch
          zur Aktion in der Karte „Aktuelles Kundenkonto") — sie lebt jetzt nur
          noch dort, direkt neben den Daten, die sie öffnet. */}
      <PageHeader
        variant="admin"
        backLink={back}
        title={`Rechnung ${number}`}
        subtitle={(
          <span className="adm-detail-sub">
            <span>{recipient.company || account.company || "Rechnungsempfänger unbekannt"}</span>
            <span>{moneyOrDash(amounts.gross)}</span>
            <span>Erstellt {fmtDate(createdOf(inv))}</span>
          </span>
        )}
        meta={(
          <>
            <span className={`badge ${status.cls}`}>{status.label}</span>
            <span className={`badge ${mode.badge || "badge-blue"}`}>{mode.label}</span>
            {source.manual && <span className={`badge ${source.badge}`}>{source.label}</span>}
            {!productive && <span className="adm-chip">Nicht zahlungswirksam</span>}
          </>
        )}
      />

      {issuedNoticeText && <Alert msg={{ type: "success", text: issuedNoticeText }} />}
      {cancelled && (
        <p className="adm-nonproductive-note adm-head-note" role="note" id="adm-inv-cancelled-note">{MI.cancelledNote}</p>
      )}

      {!productive && (
        <p className="adm-nonproductive-note adm-head-note" role="note">
          {NON_PRODUCTIVE_NOTE}
        </p>
      )}

      <Alert msg={payMsg} />

      <div className="adm-cards">
        {/* 2) Forderung und Fälligkeit */}
        <div className="adm-card">
          <div className="adm-card-head">{productive ? "Forderung und Fälligkeit" : "Beträge (nicht zahlungswirksam)"}</div>
          <div className="adm-card-body">
            <KV items={[
              ["Netto", moneyOrDash(amounts.net)],
              [amounts.vatRate != null ? `Umsatzsteuer (${String(amounts.vatRate).replace(".", ",")} %)` : "Umsatzsteuer", moneyOrDash(amounts.vat)],
              ["Brutto", moneyOrDash(amounts.gross)],
              ["Währung", dash(amounts.currency)],
              // Der Wortlaut kommt aus der zentralen Quelle und nennt den Bezugspunkt mit:
              // die Frist läuft ab Rechnungserhalt (Bereitstellung), nicht ab Rechnungsdatum.
              // Ein fehlender gespeicherter Wert bleibt „—" — hier wird nichts unterstellt.
              ["Zahlungsziel", amounts.paymentTerm != null ? paymentTermLabel(amounts.paymentTerm) : "—"],
              ["Fällig am", productive
                ? <span className={overdue ? "adm-overdue" : undefined}>{fmtDate(dueOf(inv))}{overdue ? " · überfällig" : ""}</span>
                : <span className="adm-muted">Keine Forderung</span>],
              ["Bezahlt am", productive ? fmtDate(paidAtOf(inv)) : <span className="adm-muted">—</span>],
              ["Leistungsdatum", fmtDate(serviceDateOf(inv))],
            ]} />
            {/* Aufschlüsselung nur, wenn sie tatsächlich gespeichert ist (Zusatzversicherung). */}
            {(amounts.shippingGross != null || amounts.insuranceGross != null) && (
              <>
                <p className="adm-support-hint">Aufschlüsselung (Versand steuerpflichtig, Zusatzversicherung steuerneutral):</p>
                <KV items={[
                  ["Versand brutto", moneyOrDash(amounts.shippingGross)],
                  ["davon Umsatzsteuer", moneyOrDash(amounts.shippingVat)],
                  ["Zusatzversicherung", moneyOrDash(amounts.insuranceGross)],
                ]} />
              </>
            )}
          </div>
        </div>

        {/* 3) Rechnungsempfänger — HISTORISCH aus dem Snapshot. */}
        <div className="adm-card">
          <div className="adm-card-head">Rechnungsempfänger zum Zeitpunkt der Rechnung</div>
          <div className="adm-card-body">
            {recipient.known ? (
              <KV items={[
                ["Firma", dash(recipient.company)],
                ["Name", dash(recipient.name)],
                [NUMBER_LABELS.customer, dash(recipient.customerNumber)],
                ["Rechnungs-E-Mail", dash(recipient.email)],
                ["USt-IdNr.", dash(recipient.vatId)],
              ]} />
            ) : (
              <p className="adm-addr-note">{SNAPSHOT_MISSING_NOTE}</p>
            )}
            <p className="adm-support-hint">
              Diese Angaben sind mit der Rechnung eingefroren und werden nicht durch spätere
              Stammdatenänderungen ersetzt.
            </p>
          </div>
        </div>

        {/* 4) Aktuelles Kundenkonto — bewusst getrennt vom Snapshot. */}
        <div className="adm-card">
          <div className="adm-card-head">Aktuelles Kundenkonto</div>
          <div className="adm-card-body">
            <KV items={[
              ["Firma (aktuell)", dash(account.company)],
              [`${NUMBER_LABELS.customer} (aktuell)`, dash(account.customerNumber)],
            ]} />
            {account.linkable ? (
              <div className="adm-track-link">
                <Link className="btn btn-outline btn-sm" to={`/admin/users/${encodeURIComponent(account.userId)}`}>
                  Aktuelles Kundenkonto öffnen
                </Link>
              </div>
            ) : (
              <p className="adm-addr-note">{manual ? MI.noAccountExternal : "Kein verknüpftes Kundenkonto."}</p>
            )}
          </div>
        </div>

        {/* 5) Zugehörige Sendung */}
        <div className="adm-card">
          <div className="adm-card-head">Zugehörige Sendung</div>
          <div className="adm-card-body">
            {shipment.linked ? (
              <>
                <KV items={[
                  [NUMBER_LABELS.orderConfirmation, shipment.orderNumberKnown
                    ? <span className="adm-mono">{shipment.orderNumber}</span>
                    : <span className="adm-muted">{SHIPMENT_NO_ORDER_NUMBER}</span>],
                  ["Carrier", shipment.carrier ? resolveCarrierName(shipment.carrier) : "—"],
                  ["Route", dash(shipment.route)],
                  ["Sendungsstatus", shipment.status
                    ? (() => { const [c, l] = shipmentStatusMeta(shipment.status); return <span className={`badge ${c}`}>{l}</span>; })()
                    : "—"],
                ]} />
                <div className="adm-track-link">
                  <Link className="btn btn-outline btn-sm" to={`/admin/shipments/${encodeURIComponent(shipment.shipmentId)}`}>
                    Sendung öffnen
                  </Link>
                </div>
              </>
            ) : (
              <p className="adm-addr-note">{manual ? MI.noShipment : "Keine Sendung verknüpft."}</p>
            )}
          </div>
        </div>

        {/* 6) Rechnungsdokument */}
        <div className="adm-card">
          <div className="adm-card-head">Rechnungsdokument</div>
          <div className="adm-card-body">
            <Alert msg={docMsg} />
            <KV items={[
              ["Dokumentstatus", <span className={`badge ${doc.cls}`}>{doc.label}</span>],
              ["Dokumentmodus", <span className={`badge ${mode.badge || "badge-blue"}`}>{mode.label}</span>],
              ["Erstellt am", fmtDate(pdfGeneratedAtOf(inv))],
            ]} />

            {doc.failed && <p className="adm-support-hint">{DOCUMENT_ERROR_NOTE}</p>}
            {!productive && doc.ready && (
              <p className="adm-support-hint">
                Für Kunden bleibt der Download gesperrt; der Admin-Download dient ausschließlich der technischen Prüfung.
              </p>
            )}

            <div className="adm-support">
              {doc.ready && (
                <>
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setPreviewOpen(true)} disabled={docDownloading}>
                    PDF ansehen
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={handleDocDownload} disabled={docDownloading}>
                    {docDownloading
                      ? <><span className="spinner spinner-dark" /> Wird geladen…</>
                      : <>PDF herunterladen</>}
                  </button>
                </>
              )}
              {doc.status === "pending_document" && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { setDocMsg(null); setGenOpen(true); }} disabled={docBusy}>
                  {DOCUMENT_GENERATE.button}
                </button>
              )}
              {doc.failed && (
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { setDocMsg(null); setGenOpen(true); }} disabled={docBusy}>
                  {DOCUMENT_GENERATE.retryButton}
                </button>
              )}
              {doc.status === "generating" && (
                <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
                  Status aktualisieren
                </button>
              )}
            </div>
            {doc.status === "generating" && (
              <p className="adm-support-hint">Die Dokumenterzeugung läuft. Kein erneutes Anstoßen nötig.</p>
            )}
          </div>
        </div>

        {/* 7) E-Mail-Versand — Normalzustand kompakt. */}
        <div className="adm-card">
          <div className="adm-card-head">E-Mail-Versand</div>
          <div className="adm-card-body">
            <Alert msg={mailMsg} />
            <KV items={[
              ["Versandstatus", <span className={`badge ${mail.cls}`}>{mail.label}</span>],
              ["Versendet am", mail.status === "sent" ? fmtDate(emailSentAtOf(inv)) : "—"],
            ]} />
            {mail.failed && <p className="adm-support-hint">{EMAIL_ERROR_NOTE}</p>}
            {mail.blockedReason && <p className="adm-support-hint">{mail.blockedReason}</p>}
            {mail.running && (
              <div className="adm-support">
                <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={loading}>
                  Status aktualisieren
                </button>
              </div>
            )}
            {mail.action && (
              <div className="adm-support">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => { setMailMsg(null); setMailOpen(true); }} disabled={mailBusy}>
                  {mail.action.label}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 8) Technische Informationen — eingeklappt, natives <details>. */}
        <details className="adm-card adm-tech">
          <summary className="adm-card-head adm-tech-summary">
            Technische Informationen
            <span className="adm-tech-caret" aria-hidden="true" />
          </summary>
          <div className="adm-card-body">
            <KV items={[
              ["Rechnungs-ID (intern)", dash(idOf(inv))],
              ["Kunden-ID (intern)", dash(account.userId)],
              ["Sendungs-ID (intern)", dash(shipment.shipmentId)],
              [NUMBER_LABELS.jumingoOrder, dash(jumingoOrderOf(inv))],
              ["document_mode (roh)", dash(docModeRawOf(inv))],
              ["is_test_document", inv.is_test_document === true ? "true" : inv.is_test_document === false ? "false" : "—"],
              ["Ausgestellt am", fmtDate(issuedAtOf(inv))],
              ["Dateigröße", fmtBytes(pdfSizeOf(inv))],
              ["Erstellungsversuche", docAttemptsOf(inv) != null ? String(docAttemptsOf(inv)) : "—"],
              ["Letzter Dokumentfehler", <span className="adm-mono">{dash(technicalCode(docLastErrorOf(inv)))}</span>],
              ["Versandversuche", emailAttemptsOf(inv) != null ? String(emailAttemptsOf(inv)) : "0"],
              ["Letzter Versandfehler", <span className="adm-mono">{dash(technicalCode(emailLastErrorOf(inv)))}</span>],
              ["Provider-Message-ID", <span className="adm-mono">{dash(emailMessageIdOf(inv))}</span>],
            ]} />
          </div>
        </details>

        {/* 8b) Storno — nur manuell erstellte Rechnungen. Regelweg seit Schritt 3: die Stornorechnung entsteht hier
            im System (CE-ST, PDF). Ein bereits außerhalb erstellter Beleg kann weiterhin vermerkt werden. */}
        {manual && (
          <div className="adm-card" id="adm-inv-reversal">
            <div className="adm-card-head">{MI.reversalTitle}</div>
            <div className="adm-card-body">
              <Alert msg={reversalMsg} />
              {storno ? (
                <>
                  <KV items={[
                    ["Art", storno.internal ? MI.stornoSourceInternal : MI.stornoSourceExternal],
                    [storno.internal ? "Stornorechnung" : "Stornobeleg", <span className="adm-mono">{dash(storno.documentNumber)}</span>],
                    ["Belegdatum", fmtDate(storno.date)],
                    ["Begründung", dash(storno.reason)],
                    ["Freigegeben durch", dash(storno.approvedBy)],
                    ["Vermerkt am", fmtDate(storno.recordedAt)],
                  ]} />
                  {storno.documentAvailable && (
                    <div className="adm-support">
                      <button type="button" id="adm-inv-storno-download" className="btn btn-outline btn-sm"
                        onClick={() => downloadStorno(storno.documentNumber)} disabled={stornoDownloadBusy}>
                        {MI.stornoDownload}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="adm-support-hint" style={{ marginTop: 0 }}>{MI.stornoHint}</p>
                  <div className="adm-support">
                    <button type="button" id="adm-inv-storno-open" className="btn btn-outline btn-sm adm-irreversible-action"
                      onClick={openStorno} disabled={stornoBusy || reversalBusy}>
                      {MI.stornoButton}
                    </button>
                    <button type="button" id="adm-inv-reversal-open" className="btn btn-ghost btn-sm"
                      onClick={openReversal} disabled={stornoBusy || reversalBusy}>
                      {MI.reversalButton}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 9) Adminaktionen */}
        <div className="adm-card">
          <div className="adm-card-head">Adminaktionen</div>
          <div className="adm-card-body">
            {pay.payable ? (
              <>
                <p className="adm-support-hint" style={{ marginTop: 0 }}>
                  Setzt den Rechnungsstatus auf bezahlt und speichert das Zahlungsdatum.
                  Die Aktion wird im Protokoll festgehalten und kann nicht rückgängig gemacht werden.
                </p>
                {/* Bewusst KEINE normale Primäraktion: das Markieren einer
                    Rechnung als bezahlt ist unumkehrbar und zahlungswirksam.
                    Kein roter Danger-Button — der bleibt zerstörenden Aktionen
                    vorbehalten. */}
                <div className="adm-support">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm adm-irreversible-action"
                    onClick={() => { setPayMsg(null); setPayOpen(true); }}
                    disabled={payBusy}
                  >
                    {PAY_DIALOG.confirm}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="adm-support">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm adm-irreversible-action"
                    disabled
                    aria-describedby="adm-pay-blocked"
                  >
                    {PAY_DIALOG.confirm}
                  </button>
                </div>
                <p className="adm-support-hint" id="adm-pay-blocked">{pay.reason}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Bestätigungsdialoge: zentrale Komponente mit Fokus-Management ── */}
      {payOpen && (
        <ConfirmDialog
          title={PAY_DIALOG.title}
          text={PAY_DIALOG.text}
          subline={subline}
          note="Die Aktion wird im Protokoll festgehalten."
          confirmLabel={PAY_DIALOG.confirm}
          cancelLabel={PAY_DIALOG.cancel}
          irreversible
          busy={payBusy}
          busyLabel="Wird gespeichert…"
          onCancel={() => { if (!payBusy) setPayOpen(false); }}
          onConfirm={confirmPay}
        />
      )}

      {genOpen && (
        <ConfirmDialog
          title={doc.failed ? "Rechnungsdokument erneut erzeugen?" : "Rechnungsdokument erzeugen?"}
          text={`Erzeugt das unveränderliche Rechnungs-PDF serverseitig${doc.failed ? " neu (Wiederholung nach Fehlschlag)" : ""}. Es entsteht keine neue Rechnung und keine neue Rechnungsnummer; ein bereits fertiges Dokument wird nicht überschrieben.`}
          subline={subline}
          note={manual ? MI.documentNoteManual : DOCUMENT_GENERATE.note}
          confirmLabel={doc.failed ? "Erneut erzeugen" : "Erzeugen"}
          busy={docBusy}
          busyLabel="Wird erzeugt…"
          onCancel={() => { if (!docBusy) setGenOpen(false); }}
          onConfirm={confirmGenerate}
        />
      )}

      {mailOpen && (
        <ConfirmDialog
          title={mailKind === "resend" ? "Rechnung erneut per E-Mail senden?" : "Rechnung per E-Mail senden?"}
          text={mailKind === "resend"
            ? "Die Rechnung wurde bereits versendet. Möchten Sie dasselbe unveränderte Rechnungsdokument erneut senden?"
            : manual
              ? `Sendet die Rechnung mit dem unveränderten, gespeicherten PDF-Dokument an ${recipient.email || "die Empfänger-E-Mail dieser Rechnung"}.`
              : "Sendet die Rechnung mit dem unveränderten, gespeicherten PDF-Dokument an die hinterlegte Kunden-E-Mail."}
          subline={subline}
          note="Die Aktion wird im Protokoll festgehalten. Es entsteht keine neue Rechnung und keine neue Rechnungsnummer."
          confirmLabel={mailKind === "resend" ? "Erneut senden" : "Senden"}
          busy={mailBusy}
          busyLabel="Wird gesendet…"
          onCancel={() => { if (!mailBusy) setMailOpen(false); }}
          onConfirm={confirmMail}
        />
      )}

      {previewOpen && (
        <InvoicePdfPreviewModal
          title={`Rechnung ${number}`}
          fetchPdf={() => fetchAdminInvoicePdf(id, invoiceNoOf(inv))}
          onDownload={() => downloadAdminInvoicePdf(id, invoiceNoOf(inv))}
          onClose={() => setPreviewOpen(false)}
          printable={manual}
        />
      )}

      {reversalOpen && (
        <ConfirmDialog
          title={MI.reversalDialogTitle}
          text={MI.reversalDialogText}
          subline={subline}
          note={MI.reversalHint}
          confirmLabel={MI.reversalConfirm}
          irreversible
          busy={reversalBusy}
          busyLabel="Wird vermerkt…"
          confirmId="adm-inv-reversal-confirm"
          onCancel={() => { if (!reversalBusy) setReversalOpen(false); }}
          onConfirm={confirmReversal}
        >
          <Field
            id="adm-rev-number" label="Nummer des Stornobelegs" required maxLength={60}
            value={reversalForm.externalDocumentNumber} onChange={(v) => setReversalField("externalDocumentNumber", v)}
            error={reversalErrors.externalDocumentNumber}
          />
          <DateField
            id="adm-rev-date" label="Datum des Stornobelegs" required max={berlinToday()}
            value={reversalForm.cancellationDate} onChange={(v) => setReversalField("cancellationDate", v)}
            invalid={!!reversalErrors.cancellationDate}
          />
          {reversalErrors.cancellationDate && <p className="field-error" role="alert">{reversalErrors.cancellationDate}</p>}
          <Field
            id="adm-rev-reason" as="textarea" rows={2} label="Begründung" required maxLength={300}
            value={reversalForm.reason} onChange={(v) => setReversalField("reason", v)} error={reversalErrors.reason}
          />
          <Field
            id="adm-rev-approved" label="Freigegeben durch (zweite Person)" required maxLength={120}
            value={reversalForm.approvedBy} onChange={(v) => setReversalField("approvedBy", v)} error={reversalErrors.approvedBy}
          />
          {status.kind === "paid" && (
            <label className="adm-mi-radio" htmlFor="adm-rev-paid-ack">
              <input type="checkbox" id="adm-rev-paid-ack" checked={reversalForm.acknowledgePaid === true}
                onChange={(e) => setReversalField("acknowledgePaid", e.target.checked)} />
              <span>{MI.reversalPaidAck}</span>
            </label>
          )}
          {reversalErrors.acknowledgePaid && <p className="field-error" role="alert">{reversalErrors.acknowledgePaid}</p>}
        </ConfirmDialog>
      )}

      {stornoOpen && (
        <ConfirmDialog
          title={MI.stornoDialogTitle}
          text={MI.stornoDialogText}
          subline={subline}
          confirmLabel={MI.stornoConfirm}
          irreversible
          busy={stornoBusy}
          busyLabel="Wird erstellt…"
          confirmId="adm-inv-storno-confirm"
          onCancel={() => { if (!stornoBusy) setStornoOpen(false); }}
          onConfirm={confirmStorno}
        >
          <Field
            id="adm-storno-reason" as="textarea" rows={2} label="Begründung (steht auf der Stornorechnung)" required maxLength={300}
            value={stornoForm.reason} onChange={(v) => setStornoField("reason", v)} error={stornoErrors.reason}
          />
          <Field
            id="adm-storno-approved" label="Freigegeben durch (zweite Person)" required maxLength={120}
            value={stornoForm.approvedBy} onChange={(v) => setStornoField("approvedBy", v)} error={stornoErrors.approvedBy}
          />
          {status.kind === "paid" && (
            <label className="adm-mi-radio" htmlFor="adm-storno-paid-ack">
              <input type="checkbox" id="adm-storno-paid-ack" checked={stornoForm.acknowledgePaid === true}
                onChange={(e) => setStornoField("acknowledgePaid", e.target.checked)} />
              <span>{MI.reversalPaidAck}</span>
            </label>
          )}
          {stornoErrors.acknowledgePaid && <p className="field-error" role="alert">{stornoErrors.acknowledgePaid}</p>}
        </ConfirmDialog>
      )}
    </div>
  );
}
