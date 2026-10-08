import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  normalizeOverview,
  normalizeTeam,
  partnerStatusMeta,
  partnerTabFromSearch,
  partnerTabSearch,
  visiblePartnerTabs,
} from "../utils/salesPartnerView.mjs";

const FEHLER_UEBERSICHT = "Die Übersicht konnte nicht geladen werden.";
const FEHLER_TEAM = "Ihr Team konnte nicht geladen werden.";

/* ── Partnerportal (/partner) ────────────────────────────────────────────────
   Nur hinter PartnerRoute erreichbar (Rolle sales_partner). Die Bereiche —
   Übersicht, Meine Kunden, Provisionen, Gutschriften, Mein Team und Konto —
   sind keine eigenen Routen: seit UX-Paket 6 steht der gewählte Bereich als
   `?page=<Kennung>` in der Adresse (Muster des Kunden-Dashboards). Nach dem
   Neuladen und nach dem Login (Rücksprung über utils/loginReturnTarget.mjs)
   öffnet so derselbe Bereich. Gelesen wird nur eine Kennung aus PARTNER_TABS
   (partnerTabFromSearch); alles andere ist die Übersicht, und die Adresse wird
   auf die gültige Form gebracht. Ein Bereichswechsel ersetzt den
   Verlaufseintrag — „Zurück" verlässt das Portal wie bisher.

   Die Bereiche rufen /api/sales-partner/me/* auf; „Konto" nutzt zusätzlich
   genau die für Partner freigegebenen Kontoendpunkte (Passwort, Login-E-Mail)
   über die Bausteine der Kontoeinstellungen. Kein Kundenlayout, keine andere
   Kundenroute. Übersicht und Team werden beim Start geladen. „Mein Team" steht
   immer da (Betreiberentscheidung) — Laden, Fehler und ein noch leeres Team
   zeigt der Bereich selbst. Kunden, Provisionen und Gutschriften laden erst
   beim Öffnen; Kunden und Team lesen ihre Monatsnamen aus der Übersicht.
   Meldet die Übersicht ein Pre-Live-Testkonto (`preliveTest: true`), steht
   über allen Bereichen dauerhaft der Testhinweis. */
export default function PartnerPortalPage() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const overview = usePartnerData((opts) => getPartnerOverview(opts), normalizeOverview, [], FEHLER_UEBERSICHT);
  const team = usePartnerData((opts) => getPartnerTeam(opts), normalizeTeam, [], FEHLER_TEAM);

  const tabs = visiblePartnerTabs();
  const gewuenscht = partnerTabFromSearch(location.search) || "overview";
  const aktiv = tabs.some((t) => t.id === gewuenscht) ? gewuenscht : "overview";

  // Die Adresse trägt nur die gültige Form: „?page=team" bzw. für die Übersicht
  // nichts. Unbekannte Werte und Zusatzparameter verschwinden (ersetzend).
  const sauber = partnerTabSearch(aktiv);
  useEffect(() => {
    if (location.search !== sauber) navigate({ pathname: location.pathname, search: sauber }, { replace: true });
  }, [location.search, location.pathname, sauber, navigate]);

  const waehlen = (id) => {
    if (id === aktiv) return;
    navigate({ pathname: location.pathname, search: partnerTabSearch(id) }, { replace: true });
  };

  // Partnerstatus: aus der Übersicht, sonst aus der Sitzung (/kundenbereich).
  const status = overview.data?.partner.status || user?.salesPartner?.status || null;
  const [statusCls, statusLabel] = partnerStatusMeta(status);

  return (
    <PartnerLayout>
      <PageHeader
        title="Partnerportal"
        subtitle="Ihre Kunden, Provisionen, Gutschriften und Ihr Team im Überblick."
        meta={status ? <span className={`badge ${statusCls}`} id="spp-status">{statusLabel}</span> : null}
      />

      {/* Pre-Live-Testkonto: dauerhaft über allen Bereichen (nur bei exakt true). */}
      {overview.data?.preliveTest === true && (
        <div className="spp-prelive spp-notice" role="note" id="spp-prelive-banner">{PARTNER_TEXTS.preliveBanner}</div>
      )}

      {status === "inactive" && (
        <div className="alert alert-info spp-notice" role="status">{PARTNER_TEXTS.inactive}</div>
      )}

      <div className="ce-tabs spp-tabs" role="tablist" aria-label="Bereich des Partnerportals">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`spp-tab-${t.id}`}
            aria-selected={aktiv === t.id}
            aria-controls="spp-tabpanel"
            className={`ce-tab${aktiv === t.id ? " is-active" : ""}`}
            onClick={() => waehlen(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="spp-tabpanel" role="tabpanel" aria-labelledby={`spp-tab-${aktiv}`}>
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
