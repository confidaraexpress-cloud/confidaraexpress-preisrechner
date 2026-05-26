import React from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { Icon } from "../ui/Icon";
import { money, dateDE } from "../../utils/formatters";

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Guten Morgen";
  if (h < 17) return "Guten Tag";
  return "Guten Abend";
}

function accountStatusText(status) {
  if (status === "active" || status === "approved") return "Aktiv & verifiziert";
  if (status === "pending") return "Freischaltung ausstehend";
  if (status === "blocked") return "Gesperrt – Support kontaktieren";
  return "Status prüfen";
}

export function Overview({ user, shipments, invoices, loading, onNewShipment, onAllShipments }) {
  const unpaid = invoices.filter((i) => i.status === "unpaid");
  const unpaidAmt = unpaid.reduce((s, i) => s + Number(i.amount), 0);
  const inTransit = shipments.filter((s) => s.status === "in_transit").length;
  const lastShipment = shipments[0] ?? null;

  const headerSub =
    shipments.length === 0
      ? "Willkommen – erstellen Sie jetzt Ihre erste Sendung."
      : unpaid.length > 0
      ? `${shipments.length} Sendung${shipments.length !== 1 ? "en" : ""} · ${unpaid.length} offene Rechnung${unpaid.length !== 1 ? "en" : ""}`
      : `${shipments.length} Sendung${shipments.length !== 1 ? "en" : ""} · Alle Rechnungen bezahlt ✓`;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-header-title">
            {getGreeting()}, {user?.company_name || user?.name}
          </div>
          <div className="page-header-sub">{headerSub}</div>
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
                <div className="kpi-card-header">
                  <div className="kpi-label">Sendungen gesamt</div>
                  <div className="kpi-icon-wrap kpi-icon-blue"><Icon n="package" s={16} /></div>
                </div>
                <div className="kpi-value">{shipments.length}</div>
                <div className="kpi-sub">
                  {inTransit > 0 ? `${inTransit} aktiv unterwegs` : "Keine aktiven Sendungen"}
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-card-header">
                  <div className="kpi-label">Offene Rechnungen</div>
                  <div className={`kpi-icon-wrap ${unpaid.length > 0 ? "kpi-icon-yellow" : "kpi-icon-green"}`}>
                    <Icon n="invoice" s={16} />
                  </div>
                </div>
                <div className="kpi-value">{unpaid.length}</div>
                <div className="kpi-sub">
                  {unpaid.length > 0 ? `${money(unpaidAmt)} ausstehend` : "Keine offenen Beträge"}
                </div>
              </div>

              <div className="kpi-card">
                <div className="kpi-card-header">
                  <div className="kpi-label">Konto-Status</div>
                  <div className="kpi-icon-wrap kpi-icon-blue"><Icon n="shield" s={16} /></div>
                </div>
                <div className="kpi-status-wrap"><StatusBadge status={user?.status} /></div>
                <div className="kpi-sub">{accountStatusText(user?.status)}</div>
              </div>

              <div className="kpi-card">
                <div className="kpi-card-header">
                  <div className="kpi-label">Letzte Sendung</div>
                  <div className="kpi-icon-wrap kpi-icon-gray"><Icon n="clock" s={16} /></div>
                </div>
                {lastShipment ? (
                  <>
                    <div className="kpi-value kpi-value-sm">{lastShipment.selected_carrier || "—"}</div>
                    <div className="kpi-sub">{dateDE(lastShipment.created_at)} · {money(lastShipment.price_final)}</div>
                  </>
                ) : (
                  <>
                    <div className="kpi-value kpi-value-sm">—</div>
                    <div className="kpi-sub">Noch keine Sendung</div>
                  </>
                )}
              </div>

            </div>

            <div className="table-card">
              <div className="table-card-header">
                <span className="table-card-title">Letzte Sendungen</span>
                {shipments.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={onAllShipments}>
                    Alle anzeigen →
                  </button>
                )}
              </div>

              {shipments.length === 0 ? (
                <div className="overview-empty">
                  <div className="overview-empty-icon">
                    <Icon n="package" s={32} c="var(--blue2)" />
                  </div>
                  <div className="overview-empty-title">Noch keine Sendungen</div>
                  <p className="overview-empty-sub">
                    Berechnen Sie Versandpreise und buchen Sie Ihre erste Sendung in wenigen Minuten.
                  </p>
                  <button className="btn btn-primary" onClick={onNewShipment}>
                    <Icon n="plus" s={16} /> Erste Sendung erstellen
                  </button>
                </div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Carrier</th>
                        <th>Preis</th>
                        <th>Status</th>
                        <th>Datum</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipments.slice(0, 5).map((s) => (
                        <tr key={s.id}>
                          <td>
                            <span className="shipment-carrier">{s.selected_carrier || "—"}</span>
                            {s.weight && <span className="shipment-weight">{s.weight} kg</span>}
                          </td>
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
