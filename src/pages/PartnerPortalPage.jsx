import React, { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { PartnerLayout } from "../components/layout/PartnerLayout";
import { PageHeader } from "../components/ui/PageHeader";
import { PartnerOverviewPanel } from "../components/partner/PartnerOverviewPanel";
import { PartnerCustomersPanel } from "../components/partner/PartnerCustomersPanel";
import { PartnerCommissionsPanel } from "../components/partner/PartnerCommissionsPanel";
import { PartnerCreditNotesPanel } from "../components/partner/PartnerCreditNotesPanel";
import { PartnerTeamPanel } from "../components/partner/PartnerTeamPanel";
import { PartnerAccountPanel } from "../components/partner/PartnerAccountPanel";
import { useAuth } from "../context/AuthContext";
import { getPartnerOverview, getPartnerTeam } from "../api/partnerApi";
import { usePartnerData } from "../hooks/usePartnerData";
import {
  PARTNER_TEXTS,
  VERDIENST_ANSICHTEN,
  normalizeOverview,
  normalizeTeam,
  partnerBereichVon,
  partnerStatusMeta,
  partnerTabFromSearch,
  partnerTabSearch,
  visiblePartnerTabs,
} from "../utils/salesPartnerView.mjs";

const FEHLER_UEBERSICHT = "Die Übersicht konnte nicht geladen werden.";
const FEHLER_TEAM = "Ihr Team konnte nicht geladen werden.";

// Unterzeile je Bereich: was hier steht, in den Worten des Portals.
const UNTERTITEL = Object.freeze({
  overview: "Ihr Verdienst, Ihre Empfehlungslinks und Ihr Satz im Überblick.",
  customers: "Kunden, die Ihnen über Ihren Empfehlungslink zugeordnet sind.",
  earnings: "Provisionen je Monat und Ihre Gutschriften.",
  team: "Partner, die Sie geworben haben, und Ihre Teamprovision.",
  account: "Abrechnungsdaten, Partnervereinbarung, Zugangsdaten und angemeldete Geräte.",
});

/* ── Partnerportal (/partner) ────────────────────────────────────────────────
   Nur hinter PartnerRoute erreichbar (Rolle sales_partner). Seit dem Betreiberauftrag 2026-11-22 (D4) gibt es fünf
   Bereiche — Übersicht, Kunden, Verdienst, Team, Konto — in der Seitenleiste (Desktop) bzw. der unteren Leiste
   (Telefon, PartnerLayout). „Verdienst“ fasst die beiden Ansichten Provisionen und Gutschriften zusammen; ein
   Umschalter wechselt zwischen ihnen. Jede Ansicht behält ihre Adresse `?page=<Kennung>` aus PARTNER_TABS (seit
   UX-Paket 6): nach dem Neuladen und nach dem Login (Rücksprung über utils/loginReturnTarget.mjs) öffnet dieselbe
   Ansicht. Gelesen wird nur eine bekannte Kennung (partnerTabFromSearch); alles andere ist die Übersicht, und die
   Adresse wird auf die gültige Form gebracht. Ein Wechsel ersetzt den Verlaufseintrag — „Zurück“ verlässt das Portal.

   Die Bereiche rufen /api/sales-partner/me/* auf; „Konto“ nutzt zusätzlich genau die für Partner freigegebenen
   Kontoendpunkte (Passwort, Login-E-Mail, Sitzungen). Kein Kundenlayout, keine Kundenroute. Übersicht und Team laden
   beim Start; „Mein Team“ steht immer da (Betreiberentscheidung). Meldet die Übersicht ein Pre-Live-Testkonto
   (`preliveTest: true`), steht über allen Bereichen dauerhaft der Testhinweis. */
export default function PartnerPortalPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const overview = usePartnerData((opts) => getPartnerOverview(opts), normalizeOverview, [], FEHLER_UEBERSICHT);
  const team = usePartnerData((opts) => getPartnerTeam(opts), normalizeTeam, [], FEHLER_TEAM);

  const tabs = visiblePartnerTabs();
  const gewuenscht = partnerTabFromSearch(location.search) || "overview";
  const aktiv = tabs.some((t) => t.id === gewuenscht) ? gewuenscht : "overview";
  const bereich = partnerBereichVon(aktiv);

  // Die Adresse trägt nur die gültige Form: „?page=team" bzw. für die Übersicht
  // nichts. Unbekannte Werte und Zusatzparameter verschwinden (ersetzend).
  const sauber = partnerTabSearch(aktiv);
  useEffect(() => {
    if (location.search !== sauber) navigate({ pathname: location.pathname, search: sauber }, { replace: true });
  }, [location.search, location.pathname, sauber, navigate]);

  // Partnerstatus: aus der Übersicht, sonst aus der Sitzung (/kundenbereich).
  const status = overview.data?.partner.status || user?.salesPartner?.status || null;
  const [statusCls, statusLabel] = partnerStatusMeta(status);

  return (
    <PartnerLayout aktiverBereich={bereich.id}>
      <PageHeader
        title={bereich.label}
        subtitle={UNTERTITEL[bereich.id]}
        meta={status ? <span className={`badge ${statusCls}`} id="spp-status">{statusLabel}</span> : null}
      />

      {/* Pre-Live-Testkonto: dauerhaft über allen Bereichen (nur bei exakt true). */}
      {overview.data?.preliveTest === true && (
        <div className="spp-prelive spp-notice" role="note" id="spp-prelive-banner">{PARTNER_TEXTS.preliveBanner}</div>
      )}

      {status === "inactive" && (
        <div className="alert alert-info spp-notice" role="status">{PARTNER_TEXTS.inactive}</div>
      )}

      {/* Verdienst: zwei Ansichten mit eigener Adresse — Verweise, kein Reiterfeld (Konzept B, BERICHT D.3). */}
      {bereich.id === "earnings" && (
        <nav className="spp-segmente" aria-label="Verdienst">
          {VERDIENST_ANSICHTEN.map((v) => (
            <Link
              key={v.id}
              id={`spp-tab-${v.id}`}
              to={{ pathname: "/partner", search: partnerTabSearch(v.id) }}
              replace
              className={`spp-segment${aktiv === v.id ? " spp-segment-on" : ""}`}
              aria-current={aktiv === v.id ? "page" : undefined}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      )}

      <div id="spp-tabpanel" className="spp-bereich" data-ansicht={aktiv}>
        {aktiv === "overview" && <PartnerOverviewPanel state={overview} onRetry={overview.reload} />}
        {aktiv === "customers" && <PartnerCustomersPanel overview={overview.data} />}
        {aktiv === "commissions" && (
          <PartnerCommissionsPanel currentMonth={overview.data?.currentMonth.month || null} />
        )}
        {aktiv === "credit-notes" && <PartnerCreditNotesPanel />}
        {aktiv === "team" && <PartnerTeamPanel state={team} onRetry={team.reload} overview={overview.data} />}
        {aktiv === "account" && <PartnerAccountPanel user={user} />}
      </div>
    </PartnerLayout>
  );
}
