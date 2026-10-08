import React, { useRef, useState } from "react";
import { Field } from "../ui/Field";
import { EmptyState, ErrorState, ListSkeleton } from "../ui/StateView";
import { getPartnerCommissions } from "../../api/partnerApi";
import { usePartnerData } from "../../hooks/usePartnerData";
import {
  PARTNER_TEXTS,
  commissionBasisText,
  commissionCounterpart,
  commissionLevelLabel,
  commissionSummary,
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

// Vorgang: Referenz, Buchungsart (Rücknahme/Korrektur sichtbar) und eine
// Notiz des Servers — als reiner Text.
function ReferenceCell({ entry }) {
  return (
    <div className="spp-cell-main">
      <span>{entry.reference || "—"}</span>
      {isCorrectionEntry(entry) && <TypeBadge type={entry.type} />}
      {entry.note && <span className="spp-cell-sub">{entry.note}</span>}
    </div>
  );
}

// Herkunft: Kunde bzw. Teammitglied, darunter die Ebene.
function OriginCell({ entry }) {
  return (
    <div className="spp-cell-main">
      <span>{commissionCounterpart(entry)}</span>
      <span className="spp-cell-sub">{commissionLevelLabel(entry.level)}</span>
    </div>
  );
}

// Provisionsfähige Basis, darunter der Satz — beides Werte des Servers; ein
// unbekannter Satz (etwa bei einer Korrektur) entfällt statt „Satz —".
function BasisCell({ entry }) {
  const satz = formatPercent(entry.ratePercent);
  return (
    <div className="spp-cell-main spp-cell-main--num">
      <span>{formatCents(entry.basisCents)}</span>
      {satz !== "—" && <span className="spp-cell-sub">Satz {satz}</span>}
    </div>
  );
}

/* ── Partnerprovisionen ──────────────────────────────────────────────────────
   UX-Paket 6: zuerst, was zählt — der Monat, was darin verdient wurde und wie
   viel davon auszahlbar ist (Summen des Servers), darunter die Aufteilung nach
   eigenen Kunden und Team. Die Buchungen kompakt in fünf Spalten: Datum,
   Herkunft (Kunde bzw. Teammitglied mit Ebene), Vorgang, Provisionsfähige
   Basis mit Satz, Betrag mit Status. Rücknahmen und Korrekturen bleiben über
   Badge und Zeilenfläche erkennbar. Der Monat kommt vom Server (aktueller
   Monat der Übersicht bzw. der ersten Antwort) — die Oberfläche liest keine
   Uhr und addiert nichts. */
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

  const auswahl = optionen.length > 0 && (
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
    </div>
  );

  const summe = data ? commissionSummary(data) : null;
  const kopf = summe && (
    <section className="ce-card spp-summary" id="spp-commission-totals" aria-labelledby="spp-commission-title"
      aria-busy={loading ? "true" : undefined}>
      <h2 id="spp-commission-title" className="spp-summary-label">{summe.title}</h2>
      <p className="spp-summary-value" id="spp-commission-earned">{summe.earned}</p>
      <p className="spp-summary-sub" id="spp-commission-payable">{summe.payable}</p>
      <dl className="spp-totals spp-summary-split">
        {summe.breakdown.map((b) => (
          <div key={b.key}><dt>{b.label}</dt><dd>{b.value}</dd></div>
        ))}
      </dl>
    </section>
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
        <div className="table-card ce-list-table spp-table" id="spp-commission-table">
          <table>
            <caption className="sr-only">
              Provisionsbuchungen {formatMonth(data.month)}. Spalten: Datum, Herkunft mit Ebene, Vorgang,
              {" "}{PARTNER_TEXTS.basisLabel} mit Satz, Betrag mit Status.
            </caption>
            <thead>
              <tr>
                <th scope="col">Datum</th>
                <th scope="col">Herkunft</th>
                <th scope="col">Vorgang</th>
                <th scope="col" className="ce-num">{PARTNER_TEXTS.basisLabel}</th>
                <th scope="col" className="ce-num">Betrag</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e, i) => (
                <tr key={e.id ?? `b-${i}`} className={isCorrectionEntry(e) ? "spp-row-correction" : undefined}>
                  <td>{formatIsoDate(e.entryDate)}</td>
                  <td><OriginCell entry={e} /></td>
                  <td><ReferenceCell entry={e} /></td>
                  <td className="ce-num"><BasisCell entry={e} /></td>
                  <td className="ce-num">
                    <div className="spp-cell-main spp-cell-main--num">
                      <span className="spp-commission-amount">{formatCents(e.amountCents)}</span>
                      <span className="spp-cell-sub">{payableLabel(e)}</span>
                    </div>
                  </td>
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
                <span className="ce-list-card-key">Status</span>
                <span className="ce-list-card-val">{payableLabel(e)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Datum</span>
                <span className="ce-list-card-val">{formatIsoDate(e.entryDate)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Herkunft</span>
                <span className="ce-list-card-val">{commissionCounterpart(e)} · {commissionLevelLabel(e.level)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">{PARTNER_TEXTS.basisLabel}</span>
                <span className="ce-list-card-val ce-num">{commissionBasisText(e)}</span>
              </div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="spp-panel">
      {auswahl}
      {kopf}
      {inhalt}
      <p className="spp-hint">{PARTNER_TEXTS.payableNote}</p>
    </div>
  );
}

export default PartnerCommissionsPanel;
