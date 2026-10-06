import React from "react";
import { EmptyState, ErrorState, ListSkeleton } from "../ui/StateView";
import { getPartnerCustomers } from "../../api/partnerApi";
import { usePartnerData } from "../../hooks/usePartnerData";
import {
  customerAccountStatusMeta,
  formatCount,
  formatIsoDate,
  normalizeCustomers,
} from "../../utils/salesPartnerView.mjs";

const FEHLER = "Ihre Kunden konnten nicht geladen werden.";

function StatusBadge({ status }) {
  const [cls, label] = customerAccountStatusMeta(status);
  return <span className={`badge ${cls}`}>{label}</span>;
}

const mengen = (m) => `${formatCount(m.shipments)} / ${formatCount(m.packages)}`;

/* ── Partnerportal · Meine Kunden ────────────────────────────────────────────
   Firmenname, Zuordnung seit, Status, Sendungen und Pakete — bewusst ohne
   Adressen, Rechnungen oder Preise (der Vertrag liefert sie nicht, und die
   Oberfläche holt sie nicht anderswo). */
export function PartnerCustomersPanel() {
  const { loading, error, data, reload } = usePartnerData(
    (opts) => getPartnerCustomers(opts), normalizeCustomers, [], FEHLER,
  );

  if (loading && !data) {
    return <div className="table-card"><ListSkeleton rows={4} label="Kunden werden geladen …" /></div>;
  }
  if (error || !data) {
    return (
      <div className="ce-card">
        <ErrorState
          title={error || FEHLER}
          action={<button type="button" className="btn btn-primary btn-sm" onClick={reload}>Erneut versuchen</button>}
        />
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="ce-card">
        <EmptyState title="Noch keine zugeordneten Kunden" text="Sobald Ihnen Kunden zugeordnet sind, erscheinen sie hier." />
      </div>
    );
  }

  return (
    <div className="spp-panel">
      <div className="table-card ce-list-table spp-table">
        <table>
          <caption className="sr-only">
            Meine Kunden. Spalten: Firma, Zugeordnet seit, Status, Sendungen und Pakete im laufenden Monat und im Vormonat, im Vormonat aktiv.
          </caption>
          <thead>
            <tr>
              <th scope="col">Firma</th>
              <th scope="col">Zugeordnet seit</th>
              <th scope="col">Status</th>
              <th scope="col" className="ce-num">Laufender Monat (Sendungen / Pakete)</th>
              <th scope="col" className="ce-num">Vormonat (Sendungen / Pakete)</th>
              <th scope="col">Im Vormonat aktiv</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c, i) => (
              <tr key={c.ref || `k-${i}`}>
                <td>{c.companyName || "—"}</td>
                <td>{formatIsoDate(c.assignedSince)}</td>
                <td><StatusBadge status={c.accountStatus} /></td>
                <td className="ce-num">{mengen(c.current)}</td>
                <td className="ce-num">{mengen(c.previous)}</td>
                <td>{c.previous.active ? "Ja" : "Nein"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="ce-list-cards" aria-label="Meine Kunden">
        {data.map((c, i) => (
          <li className="ce-list-card" key={`c-${c.ref || i}`}>
            <div className="ce-list-card-head">
              <strong>{c.companyName || "—"}</strong>
              <StatusBadge status={c.accountStatus} />
            </div>
            <div className="ce-list-card-row">
              <span className="ce-list-card-key">Zugeordnet seit</span>
              <span className="ce-list-card-val">{formatIsoDate(c.assignedSince)}</span>
            </div>
            <div className="ce-list-card-row">
              <span className="ce-list-card-key">Laufender Monat (Sendungen / Pakete)</span>
              <span className="ce-list-card-val ce-num">{mengen(c.current)}</span>
            </div>
            <div className="ce-list-card-row">
              <span className="ce-list-card-key">Vormonat (Sendungen / Pakete)</span>
              <span className="ce-list-card-val ce-num">{mengen(c.previous)}</span>
            </div>
            <div className="ce-list-card-row">
              <span className="ce-list-card-key">Im Vormonat aktiv</span>
              <span className="ce-list-card-val">{c.previous.active ? "Ja" : "Nein"}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PartnerCustomersPanel;
