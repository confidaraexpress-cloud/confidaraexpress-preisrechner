import React from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { money, dateDE } from "../../utils/formatters";

export function Overview({ user, shipments, invoices, loading, onNewShipment, onAllShipments }) {
  const unpaid = invoices.filter((i) => i.status === "unpaid");
  const unpaidAmt = unpaid.reduce((s, i) => s + Number(i.amount), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-header-title">Guten Tag, {user?.company_name || user?.name} 👋</div>
          <div className="page-header-sub">Ihr Dashboard</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={onNewShipment}>
          <Icon n="plus" s={14} /> Neue Sendung
        </button>
      </div>
      <div className="page-body">
        {loading ? (
          <div className="loading-center"><span className="spinner spinner-dark" /></div>
        ) : (
          <>
            <div className="kpi-grid">
              <div className="kpi-card">
                <div className="kpi-label">Sendungen</div>
                <div className="kpi-value">{shipments.length}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Offen</div>
                <div className="kpi-value">{unpaid.length}</div>
                <div className="kpi-sub">{money(unpaidAmt)}</div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Status</div>
                <div style={{ marginTop: 8 }}><StatusBadge status={user?.status} /></div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Konto</div>
                <div className="kpi-value" style={{ fontSize: 18, marginTop: 4 }}>B2B</div>
              </div>
            </div>
            <div className="table-card">
              <div className="table-card-header">
                <span className="table-card-title">Letzte Sendungen</span>
                <button className="btn btn-ghost btn-sm" onClick={onAllShipments}>Alle</button>
              </div>
              {shipments.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">📦</div>
                  <div className="empty-title">Noch keine Sendungen</div>
                </div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr><th>Carrier</th><th>Preis</th><th>Status</th><th>Datum</th></tr>
                    </thead>
                    <tbody>
                      {shipments.slice(0, 5).map((s) => (
                        <tr key={s.id}>
                          <td>{s.selected_carrier || "—"}</td>
                          <td className="font-bold">{money(s.price_final)}</td>
                          <td><StatusBadge status={s.status} /></td>
                          <td className="text-muted">{dateDE(s.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
