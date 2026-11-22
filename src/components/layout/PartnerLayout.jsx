import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { BrandLogo } from "../ui/BrandLogo";
import { useCeBereich } from "../../hooks/useCeBereich";
import { LegalLinks } from "./LegalLinks";
import { ContentErrorBoundary } from "../common/ContentErrorBoundary";
import { AppStatusNotice } from "../common/AppStatusNotice";
import { NavSymbol } from "./NavSymbol";
import { ICON_SIZE } from "../ui/Icon";
import { accountDisplayName, accountInitials } from "../../utils/accountIdentity.mjs";
import { PARTNER_BEREICHE, partnerBereichSearch } from "../../utils/salesPartnerView.mjs";
import { PARTNER_LOGIN_PATH } from "../../utils/partnerAnmeldung.mjs";
import { PartnerAnmeldungSeite } from "../../pages/authSeite";
import { APP_NOTICE_TEXT } from "../../utils/appVersionCheck.mjs";

/* ── Hülle des Partnerportals (Betreiberauftrag 2026-11-22, D3/D4) ────────────────────────────────────────────────────
   Dunkel wie der Leitstand, mit Violett als Rollenakzent (styles/partner-nacht.css; Bereich „partner“). Bewusst NICHT
   DashboardLayout: dessen Glocke, Benutzerchip und Seitenleiste hängen an Kundenendpunkten — ein Partner erhielte dort
   403, und das zentrale apiFetch meldete ihn ab.

   EINE Navigation mit fünf Bereichen (Übersicht, Kunden, Verdienst, Team, Konto): am Desktop in der Seitenleiste, am
   Telefon (bis 900 px) dieselbe Liste als untere Leiste mit Safe Area. Jeder Eintrag ist ein Link auf die Adresse des
   Bereichs (?page=…); der aktive trägt aria-current="page". Ein Bereichswechsel ersetzt den Verlaufseintrag — „Zurück“
   verlässt das Portal wie bisher. Abmelden steht am Desktop im Fuß der Seitenleiste, am Telefon im Bereich „Konto“. */
export function PartnerLayout({ children, aktiverBereich = "overview" }) {
  useCeBereich("partner");
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Wie im Adminbereich: die Anmeldung ist vorgeladen, damit kein Ladebildschirm zwischen Abmelden und Anmeldung steht.
  const handleLogout = () => { PartnerAnmeldungSeite.vorladen().catch(() => {}); logout(); navigate(PARTNER_LOGIN_PATH); };

  return (
    <div className="spp-shell">
      <div className="spp-seite">
        <div className="spp-seite-marke">
          <BrandLogo variant="lockup" tone="reverse" sub={<span className="spp-brand-tag">Partnerbereich</span>} />
        </div>
        <nav className="spp-nav" aria-label="Partnernavigation">
          {PARTNER_BEREICHE.map((b) => {
            const aktiv = b.id === aktiverBereich;
            return (
              <Link
                key={b.id}
                id={`spp-tab-${b.id}`}
                to={{ pathname: "/partner", search: partnerBereichSearch(b.id) }}
                replace
                className={`spp-nitem${aktiv ? " spp-nitem-on" : ""}`}
                aria-current={aktiv ? "page" : undefined}
              >
                <span className={`spp-nitem-icon spp-nitem-icon--${b.icon}`} aria-hidden="true"><NavSymbol n={b.icon} s={ICON_SIZE.md} /></span>
                {/* Genau einer der beiden Namen ist sichtbar (partner.css) — der unsichtbare zählt nicht zum Namen. */}
                <span className="spp-nitem-text spp-nitem-lang">{b.label}</span>
                <span className="spp-nitem-text spp-nitem-kurz">{b.kurz}</span>
              </Link>
            );
          })}
        </nav>
        <div className="spp-seite-fuss">
          <div className="spp-identity">
            <span className="spp-identity-avatar" aria-hidden="true">{accountInitials(user)}</span>
            <span className="spp-identity-text">
              <span className="spp-identity-name">{accountDisplayName(user, "Vertriebspartner")}</span>
              <span className="spp-identity-role">Vertriebspartner</span>
            </span>
          </div>
          <button type="button" id="spp-logout" className="spp-foot-btn" onClick={handleLogout}>Abmelden</button>
        </div>
      </div>
      <div className="spp-main">
        <AppStatusNotice offlineText={APP_NOTICE_TEXT.offlinePartner} />
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
