import React from "react";
import { Link } from "react-router-dom";
import { CopyableNumber } from "../ui/CopyableNumber";
import { withSection, withTestRun } from "../../utils/adminJumpState.mjs";
import {
  PRELIVE_FLOW_STEPS,
  PRELIVE_FLOW_TEXTS as T,
  PRELIVE_REGISTRATION_PATH,
  activeTestPartners,
  pendingTestPartners,
  preliveRegistrationState,
  testAccountName,
} from "../../utils/salesPartnerPrelive.mjs";

const partnerPath = (id) => `/admin/partners/${encodeURIComponent(id)}`;

// Adresse der öffentlichen Registrierung — aus der eigenen Route des Frontends.
function registrierungsUrl() {
  return typeof window !== "undefined" && window.location ? `${window.location.origin}${PRELIVE_REGISTRATION_PATH}` : PRELIVE_REGISTRATION_PATH;
}

/* ── Pre-Live · Testablauf (UX-Paket 5) ──────────────────────────────────────
   Der tatsächliche Ende-zu-Ende-Test als nummerierte Schrittfolge: öffentlich
   registrieren, freigeben, anmelden, Kunde über den Code des Testpartners,
   Testsendung mit Versandnachweis, Provisionen, Testgutschrift, Bereinigung.
   Jeder Schritt sagt kurz, was zu tun ist, und führt dorthin — auf dieser
   Seite öffnet er den Bereich (onOpen), sonst ein Link mit Rückweg.

   Was die Schritte zeigen, kommt ausschließlich vom Server: der offene
   Registrierungsweg (öffentliche Konfiguration, fail-closed: unbekannt heißt
   kein Link) und die Testkonten (Testanträge, aktive Testpartner). Keine
   eigene Abfrage hier; die Seite reicht beides herein. „Testpartner anlegen"
   bleibt ein zusätzliches Werkzeug und ersetzt den öffentlichen Weg nicht. */
export function PreliveFlowCard({ accounts = null, registration = null, from, onOpen }) {
  const zustand = preliveRegistrationState(registration);
  const offen = pendingTestPartners(accounts);
  const aktiv = activeTestPartners(accounts);
  const springen = (id, ersatz) => { if (!onOpen?.(id) && ersatz) onOpen?.(ersatz); };
  const knopf = (id, label, ziel, ersatz) => (
    <button type="button" className="btn btn-ghost btn-sm adm-pl-step-action" id={id} onClick={() => springen(ziel, ersatz)}>
      {label}
    </button>
  );

  const inhalt = (key) => {
    switch (key) {
      case "register":
        if (zustand === "prelive_test") {
          return (
            <>
              <p className="adm-pl-step-text" id="adm-pl-register-state" data-mode="prelive_test">{T.registerTest}</p>
              <div className="adm-pl-step-link"><CopyableNumber value={registrierungsUrl()} label={T.registerLinkLabel} /></div>
              <p className="adm-edit-hint">{T.registerTeam}</p>
            </>
          );
        }
        if (zustand === "production" || zustand === "closed") {
          return (
            <>
              <div className={`adm-note ${zustand === "production" ? "adm-note--warning" : "adm-note--info"} adm-pl-step-note`}
                role="note" id="adm-pl-register-state" data-mode={zustand}>
                <span>{zustand === "production" ? T.registerProduction : T.registerClosed}</span>
              </div>
              {knopf("adm-pl-step-partner-tool", "Testpartner anlegen", "adm-pl-partner-fold")}
            </>
          );
        }
        return (
          <p className="adm-pl-step-text" id="adm-pl-register-state" data-mode={zustand} role={zustand === "loading" ? "status" : undefined}>
            {zustand === "loading" ? T.registerLoading : T.registerUnknown}
          </p>
        );
      case "approve":
        return (
          <>
            <p className="adm-pl-step-text">{T.approve}</p>
            {accounts && (offen.length > 0 ? (
              <div className="adm-pl-step-list" id="adm-pl-pending">
                <span className="adm-edit-hint">{T.approvePending}</span>
                <ul className="adm-pl-links">
                  {offen.map((p) => (
                    <li key={p.id}><Link to={partnerPath(p.id)} state={from}>{testAccountName(p, "Testpartner")}</Link></li>
                  ))}
                </ul>
              </div>
            ) : <p className="adm-edit-hint" id="adm-pl-pending-none">{T.approveNone}</p>)}
          </>
        );
      case "login":
        return (
          <>
            <p className="adm-pl-step-text">{T.login}</p>
            {knopf("adm-pl-step-accounts", "Zu den Testkonten", "adm-pl-accounts-card")}
          </>
        );
      case "customerLink":
        return (
          <>
            <p className="adm-pl-step-text">{T.customerLink}</p>
            {knopf("adm-pl-step-customer", "Testkunde anlegen", "adm-pl-customer-fold")}
          </>
        );
      case "assign":
        return (
          <>
            <p className="adm-pl-step-text">{T.assign}</p>
            {knopf("adm-pl-step-customers", "Zu den Testkunden", "adm-pl-customers", "adm-pl-accounts-card")}
          </>
        );
      case "shipment":
        return (
          <>
            <p className="adm-pl-step-text">{T.shipment}</p>
            {knopf("adm-pl-step-shipment", "Testsendung anlegen", "adm-pl-shipment-fold")}
          </>
        );
      case "commissions":
        return (
          <>
            <p className="adm-pl-step-text">{T.commissions}</p>
            {knopf("adm-pl-step-commission", "Provisionen berechnen", "adm-pl-commission-card")}
            {aktiv.length > 0 && (
              <div className="adm-pl-step-list" id="adm-pl-commission-partners">
                <span className="adm-edit-hint">{T.commissionsPartners}</span>
                <ul className="adm-pl-links">
                  {aktiv.map((p) => (
                    <li key={p.id}><Link to={partnerPath(p.id)} state={withSection(from, "commissions")}>{testAccountName(p, "Testpartner")}</Link></li>
                  ))}
                </ul>
              </div>
            )}
          </>
        );
      case "creditNote":
        return (
          <>
            <p className="adm-pl-step-text">{T.creditNote}</p>
            <Link className="btn btn-ghost btn-sm adm-pl-step-action" to="/admin/partners/credit-notes" state={withTestRun(from)} id="adm-pl-step-credit-notes">
              Zu den Gutschriften (Testlauf)
            </Link>
          </>
        );
      case "cleanup":
        return (
          <>
            <p className="adm-pl-step-text">{T.cleanup}</p>
            {knopf("adm-pl-step-cleanup", "Zur Bereinigung", "adm-pl-cleanup-card")}
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="adm-card" id="adm-pl-flow">
      <div className="adm-card-head">{T.title}</div>
      <div className="adm-card-body">
        <p className="adm-support-hint adm-pl-flow-intro">{T.intro}</p>
        <ol className="adm-pl-steps">
          {PRELIVE_FLOW_STEPS.map((s, i) => (
            <li className="adm-pl-step" key={s.key} id={`adm-pl-flow-${s.key}`} data-step={s.key}>
              <span className="adm-pl-step-no" aria-hidden="true">{i + 1}</span>
              <div className="adm-pl-step-body">
                <h3 className="adm-pl-step-title">{s.title}</h3>
                {inhalt(s.key)}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export default PreliveFlowCard;
