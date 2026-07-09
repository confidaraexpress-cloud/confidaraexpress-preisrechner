import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { getAdminInvoice, markAdminInvoicePaid } from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { invoiceDisplayMeta, isInvoiceOverdue } from "../../utils/adminInvoices";

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
  useEffect(() => { setPayOpen(false); setPayMsg(null); }, [id]);

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
              ["Rechnungsnummer", dash(invoiceNoOf(inv))],
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
                  Setzt den Rechnungsstatus auf bezahlt und gibt den reservierten Kundenkredit frei.
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
              Diese Aktion setzt den Rechnungsstatus auf bezahlt und gibt den reservierten Kundenkredit frei.
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
