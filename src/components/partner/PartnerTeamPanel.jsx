import React from "react";
import { ErrorState, LoadingState } from "../ui/StateView";
import {
  formatCents,
  formatIsoDate,
  partnerStatusMeta,
  relevanceLabel,
  teamLevelHeading,
} from "../../utils/salesPartnerView.mjs";

function StatusBadge({ status }) {
  const [cls, label] = partnerStatusMeta(status);
  return <span className={`badge ${cls}`}>{label}</span>;
}

// Eine Teamebene: Name, Status, aktiv seit, provisionsrelevant (Rang) und die
// Teamprovision — alles aus der Serverantwort.
function TeamLevel({ level, team }) {
  const liste = level === 1 ? team.level1 : team.level2;
  const titelId = `spp-team-${level}-title`;
  return (
    <section aria-labelledby={titelId} id={`spp-team-${level}`}>
      <h2 id={titelId} className="spp-section-title">{teamLevelHeading(level, team)}</h2>
      {liste.length === 0 ? (
        <p className="spp-hint">Auf dieser Ebene gibt es noch keine Vertriebspartner.</p>
      ) : (
        <>
          <div className="table-card ce-list-table spp-table">
            <table>
              <caption className="sr-only">
                Team Ebene {level}. Spalten: Name, Status, aktiv seit, provisionsrelevant, Teamprovision im laufenden Monat und gesamt.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">Aktiv seit</th>
                  <th scope="col">Provisionsrelevant</th>
                  <th scope="col" className="ce-num">Teamprovision (Monat)</th>
                  <th scope="col" className="ce-num">Teamprovision gesamt</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((m, i) => (
                  <tr key={m.id ?? `${level}-${i}`}>
                    <td>{m.name || "—"}</td>
                    <td><StatusBadge status={m.status} /></td>
                    <td>{formatIsoDate(m.activeSince)}</td>
                    <td>{relevanceLabel(m)}</td>
                    <td className="ce-num">{formatCents(m.commissionCurrentMonthCents)}</td>
                    <td className="ce-num">{formatCents(m.commissionTotalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="ce-list-cards" aria-label={`Team Ebene ${level}`}>
            {liste.map((m, i) => (
              <li className="ce-list-card" key={`c-${m.id ?? i}`}>
                <div className="ce-list-card-head">
                  <strong>{m.name || "—"}</strong>
                  <StatusBadge status={m.status} />
                </div>
                <div className="ce-list-card-row">
                  <span className="ce-list-card-key">Aktiv seit</span>
                  <span className="ce-list-card-val">{formatIsoDate(m.activeSince)}</span>
                </div>
                <div className="ce-list-card-row">
                  <span className="ce-list-card-key">Provisionsrelevant</span>
                  <span className="ce-list-card-val">{relevanceLabel(m)}</span>
                </div>
                <div className="ce-list-card-row">
                  <span className="ce-list-card-key">Teamprovision (Monat)</span>
                  <span className="ce-list-card-val ce-num">{formatCents(m.commissionCurrentMonthCents)}</span>
                </div>
                <div className="ce-list-card-row">
                  <span className="ce-list-card-key">Teamprovision gesamt</span>
                  <span className="ce-list-card-val ce-num">{formatCents(m.commissionTotalCents)}</span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/* ── Partnerportal · Mein Team ───────────────────────────────────────────────
   Sichtbar nur, wenn Ebene 1 oder 2 Einträge hat (die Seite entscheidet über
   visiblePartnerTabs). Beide Ebenen getrennt. */
export function PartnerTeamPanel({ state, onRetry }) {
  if (state.loading && !state.data) {
    return <div className="ce-card"><LoadingState text="Team wird geladen …" /></div>;
  }
  if (state.error || !state.data) {
    return (
      <div className="ce-card">
        <ErrorState
          title={state.error || "Ihr Team konnte nicht geladen werden."}
          action={<button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>Erneut versuchen</button>}
        />
      </div>
    );
  }
  return (
    <div className="spp-panel">
      <TeamLevel level={1} team={state.data} />
      <TeamLevel level={2} team={state.data} />
    </div>
  );
}

export default PartnerTeamPanel;
