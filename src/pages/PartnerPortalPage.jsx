import React, { useState } from "react";
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
  visiblePartnerTabs,
} from "../utils/salesPartnerView.mjs";

const FEHLER_UEBERSICHT = "Die Übersicht konnte nicht geladen werden.";
const FEHLER_TEAM = "Ihr Team konnte nicht geladen werden.";

/* ── Partnerportal (/partner) ────────────────────────────────────────────────
   Nur hinter PartnerRoute erreichbar (Rolle sales_partner). Die Bereiche als
   page-State — Übersicht, Meine Kunden, Provisionen, Abrechnungen
   (Gutschriften), Mein Team und Konto. Die Bereiche rufen
   /api/sales-partner/me/* auf; „Konto" nutzt zusätzlich genau die für Partner
   freigegebenen Kontoendpunkte (Passwort, Login-E-Mail) über die Bausteine der
   Kontoeinstellungen. Kein Kundenlayout, keine andere Kundenroute.

   Übersicht und Team werden beim Start geladen. „Mein Team" steht immer da
   (Betreiberentscheidung) — Laden, Fehler und ein noch leeres Team zeigt der
   Bereich selbst. Kunden, Provisionen und Abrechnungen laden erst beim Öffnen.
   Meldet die Übersicht ein Pre-Live-Testkonto (`preliveTest: true`), steht
   über allen Bereichen dauerhaft der Testhinweis. */
export default function PartnerPortalPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const overview = usePartnerData((opts) => getPartnerOverview(opts), normalizeOverview, [], FEHLER_UEBERSICHT);
  const team = usePartnerData((opts) => getPartnerTeam(opts), normalizeTeam, [], FEHLER_TEAM);

  const tabs = visiblePartnerTabs();
  const aktiv = tabs.some((t) => t.id === tab) ? tab : "overview";

  // Partnerstatus: aus der Übersicht, sonst aus der Sitzung (/kundenbereich).
  const status = overview.data?.partner.status || user?.salesPartner?.status || null;
  const [statusCls, statusLabel] = partnerStatusMeta(status);

  return (
    <PartnerLayout>
      <PageHeader
        title="Partnerportal"
        subtitle="Ihre Kunden, Provisionen, Abrechnungen und Ihr Team im Überblick."
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
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="spp-tabpanel" role="tabpanel" aria-labelledby={`spp-tab-${aktiv}`}>
        {aktiv === "overview" && <PartnerOverviewPanel state={overview} onRetry={overview.reload} />}
        {aktiv === "customers" && <PartnerCustomersPanel />}
        {aktiv === "commissions" && (
          <PartnerCommissionsPanel currentMonth={overview.data?.currentMonth.month || null} />
        )}
        {aktiv === "credit-notes" && <PartnerCreditNotesPanel />}
        {aktiv === "team" && <PartnerTeamPanel state={team} onRetry={team.reload} />}
        {aktiv === "account" && <PartnerAccountPanel user={user} />}
      </div>
    </PartnerLayout>
  );
}
