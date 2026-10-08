import React from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, ListSkeleton } from "../ui/StateView";
import { getPartnerCustomers } from "../../api/partnerApi";
import { usePartnerData } from "../../hooks/usePartnerData";
import {
  CUSTOMER_TEXTS,
  customerAccountStatusMeta,
  customerLevelText,
  customerMonthLabels,
  customerTerms,
  formatIsoDate,
  normalizeCustomers,
  partnerMonths,
  partnerTabPath,
  shipmentsPackagesText,
} from "../../utils/salesPartnerView.mjs";

const FEHLER = "Ihre Kunden konnten nicht geladen werden.";

function StatusBadge({ status }) {
  const [cls, label] = customerAccountStatusMeta(status);
  return <span className={`badge ${cls}`}>{label}</span>;
}

/* ── Partnerportal · Meine Kunden ────────────────────────────────────────────
   UX-Paket 6: zwei Aussagen, die nicht verwechselt werden dürfen, stehen
   getrennt und erklärt über der Liste — das KUNDENKONTO (freigeschaltet, in
   Prüfung, inaktiv) und ob der Kunde für Ihr KUNDEN-LEVEL zählt (genug Pakete
   im Vormonat; die Schwelle prüft allein der Server, `previousMonth.active`).
   Die Monatsnamen kommen aus der Übersicht (`overview`), nie aus der
   Browseruhr; ohne Übersicht heißen die Spalten neutral „Laufender Monat" und
   „Vormonat". Bewusst ohne Adressen, Rechnungen oder Preise (der Vertrag
   liefert sie nicht, und die Oberfläche holt sie nicht anderswo). */
export function PartnerCustomersPanel({ overview = null }) {
  const { loading, error, data, reload } = usePartnerData(
    (opts) => getPartnerCustomers(opts), normalizeCustomers, [], FEHLER,
  );
  const monate = partnerMonths(overview);
  const spalten = customerMonthLabels(monate);

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
    // Ein Testkonto bekommt Kunden nur über den Adminbereich — der Kundenlink
    // ordnet Testpartnern keine Kunden zu. Ohne Übersicht kein Verweis.
    const test = overview?.preliveTest === true;
    return (
      <div className="ce-card" id="spp-customers-empty">
        <EmptyState
          title={CUSTOMER_TEXTS.emptyTitle}
          text={test ? CUSTOMER_TEXTS.emptyTextTest : CUSTOMER_TEXTS.emptyText}
          action={overview && !test ? (
            <Link className="btn btn-outline btn-sm" id="spp-customers-link" to={partnerTabPath("overview")}>
              {CUSTOMER_TEXTS.emptyAction}
            </Link>
          ) : null}
        />
      </div>
    );
  }

  return (
    <div className="spp-panel">
      <dl className="spp-terms-list spp-explain" id="spp-customers-explain">
        {customerTerms(monate).map(([begriff, text]) => (
          <div key={begriff} className="spp-terms-item"><dt>{begriff}</dt><dd>{text}</dd></div>
        ))}
      </dl>

      <div className="table-card ce-list-table spp-table" id="spp-customers-table">
        <table>
          <caption className="sr-only">
            Meine Kunden. Spalten: Firma mit Zuordnung, {CUSTOMER_TEXTS.accountLabel}, Sendungen und Pakete {spalten.current} und {spalten.previous}, {CUSTOMER_TEXTS.levelLabel}.
          </caption>
          <thead>
            <tr>
              <th scope="col">Firma</th>
              <th scope="col">{CUSTOMER_TEXTS.accountLabel}</th>
              <th scope="col" className="ce-num">{spalten.current}</th>
              <th scope="col" className="ce-num">{spalten.previous}</th>
              <th scope="col">{CUSTOMER_TEXTS.levelLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((c, i) => (
              <tr key={c.ref || `k-${i}`}>
                <td>
                  <div className="spp-cell-main">
                    <span>{c.companyName || "—"}</span>
                    <span className="spp-cell-sub">{CUSTOMER_TEXTS.assignedSince} {formatIsoDate(c.assignedSince)}</span>
                  </div>
                </td>
                <td><StatusBadge status={c.accountStatus} /></td>
                <td className="ce-num">{shipmentsPackagesText(c.current)}</td>
                <td className="ce-num">{shipmentsPackagesText(c.previous)}</td>
                <td>{customerLevelText(c)}</td>
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
              <span className="ce-list-card-key">{CUSTOMER_TEXTS.assignedSince}</span>
              <span className="ce-list-card-val">{formatIsoDate(c.assignedSince)}</span>
            </div>
            <div className="ce-list-card-row">
              <span className="ce-list-card-key">{spalten.current}</span>
              <span className="ce-list-card-val ce-num">{shipmentsPackagesText(c.current)}</span>
            </div>
            <div className="ce-list-card-row">
              <span className="ce-list-card-key">{spalten.previous}</span>
              <span className="ce-list-card-val ce-num">{shipmentsPackagesText(c.previous)}</span>
            </div>
            <div className="ce-list-card-row">
              <span className="ce-list-card-key">{CUSTOMER_TEXTS.levelLabel}</span>
              <span className="ce-list-card-val">{customerLevelText(c)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default PartnerCustomersPanel;
