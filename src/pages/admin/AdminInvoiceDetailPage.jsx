import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { getAdminInvoice } from "../../api/adminApi";
import { money } from "../../utils/formatters";
import { invoiceDisplayMeta, isInvoiceOverdue } from "../../utils/adminInvoices";

const firstDefined = (...vals) => vals.find((v) => v !== undefined && v !== null && v !== "");

const ERROR_MESSAGES = {
  429: "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.",
  500: "Die Rechnung konnte nicht geladen werden. Bitte versuchen Sie es erneut.",
};
const GENERIC_ERROR = "Die Rechnung konnte nicht geladen werden. Bitte versuchen Sie es erneut.";

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

  return (
    <div className="adm-page">
      {back}

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
      </div>
    </div>
  );
}
