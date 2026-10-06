import React, { useRef, useState } from "react";
import { Field } from "../ui/Field";
import { EmptyState, ErrorState, ListSkeleton } from "../ui/StateView";
import { getPartnerCommissions } from "../../api/partnerApi";
import { usePartnerData } from "../../hooks/usePartnerData";
import {
  PARTNER_TEXTS,
  commissionCounterpart,
  commissionLevelLabel,
  commissionTypeMeta,
  formatCents,
  formatIsoDate,
  formatMonth,
  formatPercent,
  isCorrectionEntry,
  monthOptions,
  normalizeCommissions,
  payableLabel,
} from "../../utils/salesPartnerView.mjs";

const FEHLER = "Ihre Provisionen konnten nicht geladen werden.";
const MONATE_ZURUECK = 12;

function TypeBadge({ type }) {
  const [cls, label] = commissionTypeMeta(type);
  return <span className={`badge ${cls}`}>{label}</span>;
}

// Referenzspalte: Vorgang, Buchungsart (Rücknahme/Korrektur sichtbar) und
// eine Notiz des Servers — als reiner Text.
function ReferenceCell({ entry }) {
  return (
    <div className="spp-cell-main">
      <span>{entry.reference || "—"}</span>
      {isCorrectionEntry(entry) && <TypeBadge type={entry.type} />}
      {entry.note && <span className="spp-cell-sub">{entry.note}</span>}
    </div>
  );
}

/* ── Partnerprovisionen ──────────────────────────────────────────────────────
   Monatsauswahl, Summen und alle Buchungen des Monats. Der Monat kommt vom
   Server (aktueller Monat der Übersicht bzw. der ersten Antwort) — die
   Oberfläche liest keine Uhr. Rücknahmen und Korrekturen sind über Badge und
   Zeilenfläche erkennbar; Beträge sind die des Servers, nichts wird addiert. */
export function PartnerCommissionsPanel({ currentMonth = null }) {
  // Startmonat ist der Servermonat der Übersicht; nur ohne ihn (Übersicht noch
  // nicht da oder gescheitert) entscheidet der Server über den Monat.
  const [month, setMonth] = useState(currentMonth);
  const { loading, error, data, reload } = usePartnerData(
    (opts) => getPartnerCommissions(month, opts), normalizeCommissions, [month], FEHLER,
  );

  // Anker der Monatsliste: der Servermonat der Übersicht, sonst der Monat der
  // ersten Antwort. Einmal gesetzt, wandert er nicht mit der Auswahl.
  const ankerRef = useRef(null);
  if (!ankerRef.current) ankerRef.current = currentMonth || data?.month || null;
  const optionen = monthOptions(ankerRef.current, MONATE_ZURUECK);
  const gewaehlt = month || data?.month || ankerRef.current || "";

  const kopf = optionen.length > 0 && (
    <div className="spp-toolbar">
      <Field
        as="select"
        id="spp-month"
        label="Monat"
        value={gewaehlt}
        onChange={(v) => setMonth(v)}
        disabled={loading}
      >
        {optionen.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Field>
      {data && (
        <dl className="spp-totals" id="spp-commission-totals">
          <div><dt>Provision gesamt</dt><dd>{formatCents(data.totals.accruedCents)}</dd></div>
          <div><dt>Davon auszahlbar</dt><dd>{formatCents(data.totals.payableCents)}</dd></div>
          <div><dt>Eigene Kunden</dt><dd>{formatCents(data.totals.byLevel[0])}</dd></div>
          <div><dt>Team Ebene 1</dt><dd>{formatCents(data.totals.byLevel[1])}</dd></div>
          <div><dt>Team Ebene 2</dt><dd>{formatCents(data.totals.byLevel[2])}</dd></div>
        </dl>
      )}
    </div>
  );

  let inhalt;
  if (loading && !data) {
    inhalt = <div className="table-card"><ListSkeleton rows={5} label="Provisionen werden geladen …" /></div>;
  } else if (error || !data) {
    inhalt = (
      <div className="ce-card">
        <ErrorState
          title={error || FEHLER}
          action={<button type="button" className="btn btn-primary btn-sm" onClick={reload}>Erneut versuchen</button>}
        />
      </div>
    );
  } else if (data.entries.length === 0) {
    inhalt = (
      <div className="ce-card">
        <EmptyState title="Keine Buchungen in diesem Monat" text={`Für ${formatMonth(data.month)} liegen keine Provisionsbuchungen vor.`} />
      </div>
    );
  } else {
    inhalt = (
      <>
        <div className="table-card ce-list-table spp-table">
          <table>
            <caption className="sr-only">
              Provisionsbuchungen {formatMonth(data.month)}. Spalten: Referenz, Datum, Ebene, Kunde bzw. Teammitglied,
              {" "}{PARTNER_TEXTS.basisLabel}, Satz, Betrag, auszahlbar.
            </caption>
            <thead>
              <tr>
                <th scope="col">Referenz</th>
                <th scope="col">Datum</th>
                <th scope="col">Ebene</th>
                <th scope="col">Kunde bzw. Teammitglied</th>
                <th scope="col" className="ce-num">{PARTNER_TEXTS.basisLabel}</th>
                <th scope="col" className="ce-num">Satz</th>
                <th scope="col" className="ce-num">Betrag</th>
                <th scope="col">Auszahlbar</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e, i) => (
                <tr key={e.id ?? `b-${i}`} className={isCorrectionEntry(e) ? "spp-row-correction" : undefined}>
                  <td><ReferenceCell entry={e} /></td>
                  <td>{formatIsoDate(e.entryDate)}</td>
                  <td>{commissionLevelLabel(e.level)}</td>
                  <td>{commissionCounterpart(e)}</td>
                  <td className="ce-num">{formatCents(e.basisCents)}</td>
                  <td className="ce-num">{formatPercent(e.ratePercent)}</td>
                  <td className="ce-num">{formatCents(e.amountCents)}</td>
                  <td>{payableLabel(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="ce-list-cards" aria-label="Provisionsbuchungen">
          {data.entries.map((e, i) => (
            <li className="ce-list-card" key={`c-${e.id ?? i}`}>
              <div className="ce-list-card-head">
                <ReferenceCell entry={e} />
                <strong>{formatCents(e.amountCents)}</strong>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Datum</span>
                <span className="ce-list-card-val">{formatIsoDate(e.entryDate)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Ebene</span>
                <span className="ce-list-card-val">{commissionLevelLabel(e.level)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Kunde bzw. Teammitglied</span>
                <span className="ce-list-card-val">{commissionCounterpart(e)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">{PARTNER_TEXTS.basisLabel}</span>
                <span className="ce-list-card-val ce-num">{formatCents(e.basisCents)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Satz</span>
                <span className="ce-list-card-val ce-num">{formatPercent(e.ratePercent)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Auszahlbar</span>
                <span className="ce-list-card-val">{payableLabel(e)}</span>
              </div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="spp-panel">
      {kopf}
      {inhalt}
      <p className="spp-hint">{PARTNER_TEXTS.payableNote}</p>
    </div>
  );
}

export default PartnerCommissionsPanel;
