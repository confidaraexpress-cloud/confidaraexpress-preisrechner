import React, { useState } from "react";
import { PartnerLayout } from "../components/layout/PartnerLayout";
import { PageHeader } from "../components/ui/PageHeader";
import { PartnerOverviewPanel } from "../components/partner/PartnerOverviewPanel";
import { PartnerCustomersPanel } from "../components/partner/PartnerCustomersPanel";
import { PartnerCommissionsPanel } from "../components/partner/PartnerCommissionsPanel";
import { PartnerTeamPanel } from "../components/partner/PartnerTeamPanel";
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
   Nur hinter PartnerRoute erreichbar (Rolle sales_partner). Vier Bereiche als
   page-State — Übersicht, Meine Kunden, Provisionen und (nur mit Einträgen)
   Mein Team. Es werden ausschließlich /api/sales-partner/me/* aufgerufen; kein
   Kundenbaustein, keine Kundenroute.

   Übersicht und Team werden beim Start geladen: die Übersicht ist der erste
   Bereich, und ob „Mein Team" überhaupt erscheint, entscheiden die Einträge
   der Teamantwort. Kunden und Provisionen laden erst beim Öffnen. */
export default function PartnerPortalPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const overview = usePartnerData((opts) => getPartnerOverview(opts), normalizeOverview, [], FEHLER_UEBERSICHT);
  const team = usePartnerData((opts) => getPartnerTeam(opts), normalizeTeam, [], FEHLER_TEAM);

  const tabs = visiblePartnerTabs(team.data);
  const aktiv = tabs.some((t) => t.id === tab) ? tab : "overview";

  // Partnerstatus: aus der Übersicht, sonst aus der Sitzung (/kundenbereich).
  const status = overview.data?.partner.status || user?.salesPartner?.status || null;
  const [statusCls, statusLabel] = partnerStatusMeta(status);

  return (
    <PartnerLayout>
      <PageHeader
        title="Partnerportal"
        subtitle="Ihre Kunden, Provisionen und Ihr Team im Überblick."
        meta={status ? <span className={`badge ${statusCls}`} id="spp-status">{statusLabel}</span> : null}
      />

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
        {aktiv === "team" && <PartnerTeamPanel state={team} onRetry={team.reload} />}
      </div>
    </PartnerLayout>
  );
}
