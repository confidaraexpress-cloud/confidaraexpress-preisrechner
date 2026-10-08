import React from "react";
import { adminPartnerStatusMeta, formatTimestamp } from "../../utils/adminSalesPartnerView.mjs";
import {
  DETAIL_TEXTS,
  billingSummary,
  capSummary,
  creditNotesSummary,
  customersSummary,
  levelRulesSummary,
  partnerNextStep,
  ratesSummary,
  sectionSummary,
  statusSince,
  teamSummary,
} from "../../utils/adminPartnerDetailView.mjs";

function Badge({ meta }) {
  const [cls, label] = meta;
  return <span className={`badge ${cls}`}>{label}</span>;
}

/* ── Überblick eines freigegebenen Vertriebspartners (UX-Paket 4) ────────────
   Oben auf der Detailseite: der nächste sinnvolle Verwaltungsschritt, Status,
   geltende Konditionen, Kunden und Team, Abrechnung. Alles stammt aus
   vorhandenen Antworten — dem Detail sowie den Zuständen der Bereiche
   Obergrenze, Abrechnungsdaten und Gutschriften, die ihr Bereich meldet (kein
   zweiter Abruf). Fehlt ein Stand, steht dort „Wird geladen …" bzw. „Nicht
   verfügbar" — nie eine geratene Angabe. Der Schritt öffnet den betroffenen
   Bereich, statt eine neue Aktion zu erfinden. */
export function SalesPartnerOverviewCard({ detail, today, caps = null, billing = null, creditNotes = null, onOpenSection }) {
  const p = detail.partner;
  const seit = statusSince(p.status, detail.statusHistory);
  const schritt = partnerNextStep({ billing, creditNotes });
  const offen = schritt.key === "billing" || schritt.key === "document";
  return (
    <div className="adm-card" id="adm-sp-overview-card">
      <div className="adm-card-head">{DETAIL_TEXTS.overviewTitle}</div>
      <div className="adm-card-body adm-sp-stack">
        <div className={`adm-note${offen ? " adm-note--info" : ""} adm-sp-next`} id="adm-sp-next-step" data-step={schritt.key}>
          <p className="adm-sp-next-text">
            <span className="adm-sp-next-label">{DETAIL_TEXTS.nextStepLabel}</span>
            <span>{schritt.text}</span>
          </p>
          {schritt.action && schritt.target && (
            <button type="button" className="btn btn-primary btn-sm" id="adm-sp-next-action"
              onClick={() => onOpenSection?.(schritt.target)}>
              {schritt.action}
            </button>
          )}
        </div>
        <dl className="adm-kv">
          <div className="adm-kv-item">
            <dt>Status</dt>
            <dd id="adm-sp-overview-status">
              <Badge meta={adminPartnerStatusMeta(p.status)} />
              {seit && <span className="adm-sp-sub adm-sp-block">seit {formatTimestamp(seit)}</span>}
            </dd>
          </div>
          <div className="adm-kv-item"><dt>Provisionssätze</dt><dd id="adm-sp-overview-rates">{ratesSummary(detail.rates, p.status)}</dd></div>
          <div className="adm-kv-item"><dt>Level-Regeln</dt><dd id="adm-sp-overview-levels">{levelRulesSummary(detail.levelRules)}</dd></div>
          <div className="adm-kv-item"><dt>Individuelle Obergrenze</dt><dd id="adm-sp-overview-cap">{sectionSummary(caps, capSummary)}</dd></div>
          <div className="adm-kv-item"><dt>Kunden</dt><dd id="adm-sp-overview-customers">{customersSummary(detail.customers, today)}</dd></div>
          <div className="adm-kv-item"><dt>Team</dt><dd id="adm-sp-overview-team">{teamSummary(detail.team)}</dd></div>
          <div className="adm-kv-item"><dt>Abrechnungsdaten</dt><dd id="adm-sp-overview-billing">{sectionSummary(billing, billingSummary)}</dd></div>
          <div className="adm-kv-item"><dt>Gutschriften</dt><dd id="adm-sp-overview-credit-notes">{sectionSummary(creditNotes, creditNotesSummary)}</dd></div>
        </dl>
      </div>
    </div>
  );
}

export default SalesPartnerOverviewCard;
