import React from "react";
import { ErrorState, LoadingState } from "../ui/StateView";
import {
  TEAM_TEXTS,
  formatCents,
  formatIsoDate,
  partnerMonths,
  partnerStatusMeta,
  relevanceLabel,
  teamExplanation,
  teamLevelSummary,
  teamLevelTitle,
  teamMonthLabel,
} from "../../utils/salesPartnerView.mjs";

function StatusBadge({ status }) {
  const [cls, label] = partnerStatusMeta(status);
  return <span className={`badge ${cls}`}>{label}</span>;
}

// Eine Teamebene: wer dazugehört, ob aktiv, ob der Partner für die
// Teamprovision zählt (Platz aus `rank`/`relevant` des Servers) und die
// Teamprovision — alles aus der Serverantwort, nichts nachgerechnet.
function TeamLevel({ level, team, monatSpalte }) {
  const liste = level === 1 ? team.level1 : team.level2;
  const grenze = level === 1 ? team.limits.level1 : team.limits.level2;
  const titelId = `spp-team-${level}-title`;
  return (
    <section aria-labelledby={titelId} id={`spp-team-${level}`} className="spp-team-level">
      <h2 id={titelId} className="spp-section-title">{teamLevelTitle(level)}</h2>
      {level === 2 && <p className="spp-hint spp-team-note">{TEAM_TEXTS.level2Note}</p>}
      {liste.length === 0 ? (
        <p className="spp-hint">{TEAM_TEXTS.emptyLevel}</p>
      ) : (
        <>
          <p className="spp-team-summary" id={`spp-team-${level}-summary`}>{teamLevelSummary(level, team)}</p>
          <div className="table-card ce-list-table spp-table">
            <table>
              <caption className="sr-only">
                {teamLevelTitle(level)}. Spalten: Name mit Aktivierungstag, Status, {TEAM_TEXTS.countsLabel}, {monatSpalte}, Teamprovision gesamt.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Status</th>
                  <th scope="col">{TEAM_TEXTS.countsLabel}</th>
                  <th scope="col" className="ce-num">{monatSpalte}</th>
                  <th scope="col" className="ce-num">Teamprovision gesamt</th>
                </tr>
              </thead>
              <tbody>
                {liste.map((m, i) => (
                  <tr key={m.id ?? `${level}-${i}`}>
                    <td>
                      <div className="spp-cell-main">
                        <span>{m.name || "—"}</span>
                        {m.activeSince && <span className="spp-cell-sub">Aktiv seit {formatIsoDate(m.activeSince)}</span>}
                      </div>
                    </td>
                    <td><StatusBadge status={m.status} /></td>
                    <td>{relevanceLabel(m, grenze)}</td>
                    <td className="ce-num">{formatCents(m.commissionCurrentMonthCents)}</td>
                    <td className="ce-num">{formatCents(m.commissionTotalCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="ce-list-cards" aria-label={teamLevelTitle(level)}>
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
                  <span className="ce-list-card-key">{TEAM_TEXTS.countsLabel}</span>
                  <span className="ce-list-card-val">{relevanceLabel(m, grenze)}</span>
                </div>
                <div className="ce-list-card-row">
                  <span className="ce-list-card-key">{monatSpalte}</span>
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
   Immer erreichbar (Betreiberentscheidung, visiblePartnerTabs): Laden, Fehler
   mit „Erneut versuchen" und ein noch leeres Team zeigt dieser Bereich selbst.
   UX-Paket 6: die zwei Ebenen heißen „Direkt geworben (Ebene 1)" und „Weitere
   Partner (Ebene 2)"; oben steht die Regel der Teamprovision (je Ebene die
   ersten `limits` aktiven Partner in der Reihenfolge ihrer Aktivierung) mit
   den Sätzen der Übersicht. Grenzen und Teamlogik bleiben beim Server — die
   Oberfläche zählt nur seine Kennzeichen. */
export function PartnerTeamPanel({ state, onRetry, overview = null }) {
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
  const monatSpalte = teamMonthLabel(partnerMonths(overview));
  return (
    <div className="spp-panel">
      <p className="spp-hint spp-explain" id="spp-team-explain">{teamExplanation(state.data, overview)}</p>
      <TeamLevel level={1} team={state.data} monatSpalte={monatSpalte} />
      <TeamLevel level={2} team={state.data} monatSpalte={monatSpalte} />
    </div>
  );
}

export default PartnerTeamPanel;
