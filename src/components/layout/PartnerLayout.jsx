import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { BrandLogo } from "../ui/BrandLogo";
import { LegalLinks } from "./LegalLinks";
import { ContentErrorBoundary } from "../common/ContentErrorBoundary";
import { accountDisplayName } from "../../utils/accountIdentity.mjs";

/* ── Schlanke Hülle des Partnerportals ───────────────────────────────────────
   Bewusst NICHT DashboardLayout: dessen Mitteilungsglocke fragt
   /kunde/notifications ab, Benutzerchip und Sidebar hängen an Kundenbausteinen
   (Firmenlogo, Support, Installation). Ein Partner erhielte dort 403 — und das
   zentrale apiFetch meldete ihn ab.

   Dieselbe Shell (.app-shell: gemeinsame Atmosphäre), eine helle Kopfleiste
   mit der Wortmarke (keine Sidebar trägt hier die Marke), der Kontoname als
   Text und „Abmelden". Darunter der Inhalt in der gemeinsamen Fehlergrenze und
   der gemeinsame Footer des eingeloggten Bereichs. */
export function PartnerLayout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="app-shell">
      <div className="spp-main">
        <header className="spp-topbar">
          <BrandLogo variant="wordmark" tone="standard" className="spp-brand" />
          <div className="spp-identity">
            <span className="spp-identity-name">{accountDisplayName(user, "Vertriebspartner")}</span>
            <span className="spp-identity-role">Vertriebspartner</span>
          </div>
          <button type="button" id="spp-logout" className="btn btn-outline btn-sm spp-logout" onClick={handleLogout}>
            Abmelden
          </button>
        </header>
        <main className="spp-content">
          <ContentErrorBoundary key={pathname} bereich="partner">
            <div className="page-body">{children}</div>
          </ContentErrorBoundary>
        </main>
        <LegalLinks />
      </div>
    </div>
  );
}

export default PartnerLayout;
