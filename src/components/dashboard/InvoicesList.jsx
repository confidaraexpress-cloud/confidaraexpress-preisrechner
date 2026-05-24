import React from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { money, dateDE } from "../../utils/formatters";

export function InvoicesList({ invoices, loading }) {
  const unpaid = invoices.filter((i) => i.status === "unpaid");
  const unpaidAmt = unpaid.reduce((s, i) => s + Number(i.amount), 0);

  return (
    <>
      <div className="page-header">
        <div><div className="page-header-title">Rechnungen</div></div>
      </div>
      <div className="page-body">
        {unpaid.length > 0 && (
          <div className="alert alert-info mb-16">
            <Icon n="invoice" s={16} />Offen: <strong>{money(unpaidAmt)}</strong>
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
                  <tr><th>Nummer</th><th>Betrag</th><th>Status</th><th>Fällig</th></tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="mono" style={{ fontSize: 12 }}>{inv.invoice_number}</td>
                      <td className="font-bold">{money(inv.amount)}</td>
                      <td><StatusBadge status={inv.status} /></td>
                      <td className="text-muted">{dateDE(inv.due_date)}</td>
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
