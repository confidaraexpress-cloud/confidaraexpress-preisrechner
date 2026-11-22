import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ErrorState, LoadingState } from "../ui/StateView";
import { PartnerLinkCopy } from "./PartnerLinkCopy";
import { PartnerLetzteGutschriften } from "./PartnerLetzteGutschriften";
import { loadSalesPartnerPublicConfig } from "../../api/partnerApi";
import {
  MONEY_TERMS,
  MONEY_TERMS_TITLE,
  PARTNER_TEXTS,
  commissionComposition,
  isFirstVisit,
  overviewKpis,
  partnerTabSearch,
} from "../../utils/salesPartnerView.mjs";
import { LINK_TEXTS, partnerLinkStates } from "../../utils/salesPartnerLinks.mjs";

/* ── Partnerportal · Übersicht (Startseite) ──────────────────────────────────
   Rangfolge seit dem Betreiberauftrag 2026-11-22 (BERICHT D.3/D.4): zuerst der Verdienst des laufenden Monats als ein
   großes Element (mit „davon auszahlbar“), daneben bzw. darunter „Kunden und Partner werben“ mit Teilen und
   Kopieren, dann die übrigen Kennzahlen (Kunden heute, Pakete im Messmonat, Satz), dann Zusammensetzung des Satzes
   und die letzten Gutschriften mit PDF. Beim ersten Besuch (noch keine Kunden, kein Verdienst) stehen die Links vorn.

   Jeder Wert kommt aus GET /api/sales-partner/me/overview — die Oberfläche
   rechnet nichts nach; fehlende Werte stehen als „—", nie als 0. Ob ein Link
   wirkt, sagt zusätzlich die öffentliche Konfiguration des Programms
   (GET /api/sales-partner/public-config, fail-closed, pro Seite einmal). */

function LinkEintrag({ id, titel, zustand, knopf, teilen = null, primary = false }) {
  return (
    <li className="spp-link" id={id}>
      <span className="spp-link-label">{titel}</span>
      {zustand && zustand.ready ? (
        <>
          {zustand.hint && <span className="spp-link-purpose">{zustand.hint}</span>}
          <PartnerLinkCopy url={zustand.url} buttonLabel={knopf} shareLabel={teilen} primary={primary} />
        </>
      ) : (
        <span className="spp-hint spp-link-notice">{zustand ? zustand.notice : ""}</span>
      )}
    </li>
  );
}

export function PartnerOverviewPanel({ state, onRetry }) {
  // null = lädt noch; danach { ok, config } — ein Fehler bleibt neutral (keine Zusage).
  const [publicConfig, setPublicConfig] = useState(null);
  useEffect(() => {
    let aktiv = true;
    loadSalesPartnerPublicConfig().then((r) => { if (aktiv) setPublicConfig(r); });
    return () => { aktiv = false; };
  }, []);

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
  const zusammen = commissionComposition(o);
  const links = partnerLinkStates(o, publicConfig);
  const erstbesuch = isFirstVisit(o);

  const alleKennzahlen = overviewKpis(o);
  const verdient = alleKennzahlen.find((k) => k.key === "earned");
  const uebrige = alleKennzahlen.filter((k) => k.key !== "earned");

  // Der Verdienst des laufenden Monats: Wert und „davon auszahlbar“ kommen unverändert aus der Übersicht.
  const held = (
    <section className="ce-card spp-held" aria-labelledby="spp-held-titel" id="spp-verdienst" data-kpi="earned">
      <h2 className="spp-held-label" id="spp-held-titel">{verdient.label}</h2>
      <p className="spp-held-zahl" id="spp-month-amount">{verdient.value}</p>
      <span className="spp-held-band" aria-hidden="true" />
      {verdient.hint && <p className="spp-held-zeile" id="spp-month-payable">{verdient.hint}</p>}
      <p className="spp-hint" id="spp-payable-note">{PARTNER_TEXTS.payableNote}</p>
      {/* Die vier Stufen des Geldes — nie zusammengelegt (UX-Paket 3). */}
      <details className="spp-terms" id="spp-money-terms">
        <summary className="spp-terms-summary">{MONEY_TERMS_TITLE}</summary>
        <dl className="spp-terms-list">
          {MONEY_TERMS.map(([begriff, text]) => (
            <div key={begriff} className="spp-terms-item"><dt>{begriff}</dt><dd>{text}</dd></div>
          ))}
        </dl>
      </details>
      <Link className="btn btn-outline spp-held-aktion" id="spp-held-provisionen"
        to={{ pathname: "/partner", search: partnerTabSearch("commissions") }} replace>
        Provisionen ansehen
      </Link>
    </section>
  );

  const kennzahlen = (
    <section aria-labelledby="spp-kpi-title" id="spp-kpi-section" className="spp-kennzahlen">
      <h2 id="spp-kpi-title" className="spp-section-title">Auf einen Blick</h2>
      <ul className="spp-kpis">
        {uebrige.map((k) => (
          <li key={k.key} className="ce-card spp-kpi" data-kpi={k.key}>
            <span className="spp-kpi-label">{k.label}</span>
            <span className="spp-kpi-value">{k.value}</span>
            {k.hint && <span className="spp-kpi-hint">{k.hint}</span>}
            {k.detail && <span className="spp-kpi-hint spp-kpi-detail">{k.detail}</span>}
          </li>
        ))}
      </ul>
    </section>
  );

  const werben = (
    <section className="ce-card spp-card spp-werben" aria-labelledby="spp-links-title" id="spp-links">
      <h2 id="spp-links-title" className="spp-card-title">{LINK_TEXTS.title}</h2>
      {erstbesuch && links.customer && links.customer.ready && (
        <p className="spp-start" id="spp-start-hint">{LINK_TEXTS.firstVisit}</p>
      )}
      {links.notice ? (
        <p className="spp-hint spp-link-notice" id="spp-links-notice">{links.notice}</p>
      ) : (
        <ul className="spp-links">
          <LinkEintrag id="spp-link-customer" titel={LINK_TEXTS.customerTitle} zustand={links.customer}
            knopf={LINK_TEXTS.customerButton} teilen={LINK_TEXTS.customerShare} primary />
          <LinkEintrag id="spp-link-partner" titel={LINK_TEXTS.partnerTitle} zustand={links.partner}
            knopf={LINK_TEXTS.partnerButton} teilen={LINK_TEXTS.partnerShare} />
        </ul>
      )}
    </section>
  );

  const provision = (
    <section className="ce-card spp-card" aria-labelledby="spp-rates-title" id="spp-composition">
      <h2 id="spp-rates-title" className="spp-card-title">So setzt sich Ihre Provision zusammen</h2>
      <dl className="spp-compose">
        {zusammen.rows.map((r) => (
          <div key={r.key} className="spp-compose-row" data-part={r.key}><dt>{r.label}</dt><dd>{r.value}</dd></div>
        ))}
        <div className="spp-compose-row spp-compose-total" data-part="total">
          <dt>{zusammen.total.label}</dt><dd id="spp-own-rate">{zusammen.total.value}</dd>
        </div>
      </dl>
      {zusammen.capNote && <p className="spp-hint" id="spp-cap-note">{zusammen.capNote}</p>}
      {zusammen.basis && <p className="spp-hint" id="spp-level-basis">{zusammen.basis}</p>}
      <p className="spp-hint" id="spp-team-rates">{zusammen.team}</p>
      {zusammen.activeSince && <p className="spp-hint">{zusammen.activeSince}</p>}
    </section>
  );

  return (
    <div className="spp-panel spp-startseite">
      <div className={erstbesuch ? "spp-startseite-oben spp-startseite-oben--erstbesuch" : "spp-startseite-oben"}>
        {erstbesuch ? <>{werben}{held}</> : <>{held}{werben}</>}
      </div>
      {kennzahlen}
      <div className="spp-grid">
        {provision}
        <PartnerLetzteGutschriften />
      </div>
    </div>
  );
}

export default PartnerOverviewPanel;
