import React from "react";
import { CopyableNumber } from "../ui/CopyableNumber";
import { ErrorState, LoadingState } from "../ui/StateView";
import {
  PARTNER_TEXTS,
  formatCents,
  formatCount,
  formatIsoDate,
  formatMonth,
  formatPercent,
  overviewKpis,
} from "../../utils/salesPartnerView.mjs";

/* ── Partnerportal · Übersicht ───────────────────────────────────────────────
   Kennzahlen, Provision des laufenden Monats mit auszahlbarem Anteil, die
   beiden Empfehlungslinks zum Kopieren und die geltenden Sätze. Jeder Wert
   kommt aus GET /api/sales-partner/me/overview — die Oberfläche rechnet
   nichts nach. Fehlende Werte stehen als „—", nie als 0. */
export function PartnerOverviewPanel({ state, onRetry }) {
  if (state.loading && !state.data) {
    return <div className="ce-card"><LoadingState text="Übersicht wird geladen …" /></div>;
  }
  if (state.error || !state.data) {
    return (
      <div className="ce-card">
        <ErrorState
          title={state.error || "Die Übersicht konnte nicht geladen werden."}
          text="Bitte versuchen Sie es erneut."
          action={<button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>Erneut versuchen</button>}
        />
      </div>
    );
  }

  const o = state.data;
  const monat = formatMonth(o.currentMonth.month);

  return (
    <div className="spp-panel">
      <section aria-labelledby="spp-kpi-title">
        <h2 id="spp-kpi-title" className="spp-section-title">Kennzahlen</h2>
        <ul className="spp-kpis">
          {overviewKpis(o).map((k) => (
            <li key={k.key} className="ce-card spp-kpi" data-kpi={k.key}>
              <span className="spp-kpi-label">{k.label}</span>
              <span className="spp-kpi-value">{k.value}</span>
              {k.hint && <span className="spp-kpi-hint">{k.hint}</span>}
            </li>
          ))}
        </ul>
      </section>

      <div className="spp-grid">
        <section className="ce-card spp-card" aria-labelledby="spp-month-title">
          <h2 id="spp-month-title" className="spp-card-title">
            {monat !== "—" ? `Provision ${monat}` : "Provision im laufenden Monat"}
          </h2>
          <p className="spp-amount" id="spp-month-amount">{formatCents(o.currentMonth.commissionCents)}</p>
          <dl className="spp-facts">
            <div className="spp-fact">
              <dt>Davon auszahlbar</dt>
              <dd id="spp-month-payable">{formatCents(o.currentMonth.payableCents)}</dd>
            </div>
            <div className="spp-fact"><dt>Sendungen</dt><dd>{formatCount(o.currentMonth.shipments)}</dd></div>
            <div className="spp-fact"><dt>Pakete</dt><dd>{formatCount(o.currentMonth.packages)}</dd></div>
            <div className="spp-fact"><dt>Zugeordnete Kunden</dt><dd>{formatCount(o.customersAssigned)}</dd></div>
          </dl>
          <p className="spp-hint" id="spp-payable-note">{PARTNER_TEXTS.payableNote}</p>
        </section>

        <section className="ce-card spp-card" aria-labelledby="spp-links-title">
          <h2 id="spp-links-title" className="spp-card-title">Ihre Empfehlungslinks</h2>
          <ul className="spp-links">
            <li className="spp-link" id="spp-link-customer">
              <span className="spp-link-label">Kundenlink</span>
              <span className="spp-link-purpose">Für neue Geschäftskunden</span>
              {o.links.customer
                ? <CopyableNumber value={o.links.customer} label="Kundenlink" />
                : <span className="spp-hint">{PARTNER_TEXTS.noLink}</span>}
            </li>
            <li className="spp-link" id="spp-link-partner">
              <span className="spp-link-label">Partnerlink</span>
              <span className="spp-link-purpose">Für neue Vertriebspartner in Ihrem Team</span>
              {o.links.partner
                ? <CopyableNumber value={o.links.partner} label="Partnerlink" />
                : <span className="spp-hint">{PARTNER_TEXTS.noLink}</span>}
            </li>
            {o.links.code && (
              <li className="spp-link">
                <span className="spp-link-label">Empfehlungscode</span>
                <CopyableNumber value={o.links.code} label="Empfehlungscode" />
              </li>
            )}
          </ul>
        </section>

        <section className="ce-card spp-card spp-card--wide" aria-labelledby="spp-rates-title">
          <h2 id="spp-rates-title" className="spp-card-title">Ihre Provisionssätze</h2>
          <dl className="spp-facts">
            <div className="spp-fact"><dt>Grundprovision</dt><dd>{formatPercent(o.rates.basePercent)}</dd></div>
            <div className="spp-fact"><dt>Team Ebene 1</dt><dd>{formatPercent(o.rates.level1Percent)}</dd></div>
            <div className="spp-fact"><dt>Team Ebene 2</dt><dd>{formatPercent(o.rates.level2Percent)}</dd></div>
            <div className="spp-fact"><dt>Partner seit</dt><dd>{formatIsoDate(o.partner.activeSince)}</dd></div>
          </dl>
        </section>
      </div>
    </div>
  );
}

export default PartnerOverviewPanel;
