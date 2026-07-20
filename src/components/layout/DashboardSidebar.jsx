import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";

// CE-Würfel-Marke (Brandmark, §17/§19). Verbatim Inline-SVG (Navy-Cube + Glow).
function CubeMark() {
  return (
    <svg className="pp-brandmark-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ppCubeSb" x1="6" y1="34" x2="34" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2F8CFF" />
          <stop offset="0.55" stopColor="#64B4FF" />
          <stop offset="1" stopColor="#bfe0ff" />
        </linearGradient>
        <filter id="ppCubeSbGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.55  0 0 0 0 1  0 0 0 0.5 0" result="g" />
          <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter="url(#ppCubeSbGlow)" stroke="url(#ppCubeSb)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M34 27V13a2.2 2.2 0 0 0-1.1-1.9l-11-6.2a2.2 2.2 0 0 0-2.1 0l-11 6.2A2.2 2.2 0 0 0 6 13v14a2.2 2.2 0 0 0 1.1 1.9l11 6.2a2.2 2.2 0 0 0 2.1 0l11-6.2A2.2 2.2 0 0 0 34 27Z" />
        <path d="M6.6 12.2 20 19.8l13.4-7.6M20 35.2V19.8" />
      </g>
      <path d="M6.6 12.2 20 19.8V35l-12.9-7.3A2.2 2.2 0 0 1 6 25.8V13Z" fill="url(#ppCubeSb)" opacity="0.14" />
    </svg>
  );
}

// Navigation (Items/Routen unverändert — §21). Icons je Handoff §13/§349:
// Übersicht=grid(dashboard) · Neue Sendung=plus · Entwürfe=form ·
// Adressbuch=idcard · Sendungen=package · Sendungsverfolgung=pin(mapPin) ·
// Rechnungen=invoice · Mein Profil=user · Preisrechner=zap · Abmelden=logout.
const NAV_GROUPS = [
  {
    label: "Versand",
    items: [
      { id: "new",         label: "Neue Sendung",       icon: "plus"    },
      { id: "drafts",      label: "Entwürfe",           icon: "form"    },
      { id: "addressbook", label: "Adressbuch",         icon: "idcard"  },
      { id: "shipments",   label: "Sendungen",          icon: "package" },
      { id: "tracking",    label: "Sendungsverfolgung", icon: "mapPin"  },
    ],
  },
  { label: "Abrechnung", items: [{ id: "invoices", label: "Rechnungen", icon: "invoice" }] },
  {
    label: "Konto",
    items: [
      { id: "profile",    label: "Mein Profil",  icon: "user" },
      { id: "calculator", label: "Preisrechner", icon: "zap"  },
    ],
  },
];

// Eine einzige Premium-Sidebar für den gesamten eingeloggten Bereich
// (leuchtende Navy-Glas-Hülle, §17). Aufbau: .pp-side (Positionierung, Mobile-
// Drawer) → .pp-side-glow (blaues Backlight) → .pp-side-in (Glas) → Logo,
// Identität, Nav, Support, Footer. Funktion/Routen unverändert.
export function DashboardSidebar({ page, navigateTo, sidebarOpen, setSidebarOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();

  const handleNav = (item) => {
    if (item.route) { setSidebarOpen(false); navigate(item.route); }
    else navigateTo(item.id);
  };
  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <>
      {sidebarOpen && (
        <div className="sidebar-overlay open" onClick={() => setSidebarOpen(false)} style={{ zIndex: 198 }} />
      )}
      <aside className={`sidebar pp-side ${sidebarOpen ? "sidebar-open" : ""}`} style={{ zIndex: 199 }}>
        <span className="pp-side-glow" aria-hidden="true" />
        <div className="pp-side-in">

          <div className="pp-logo">
            <span className="ce-brandmark"><CubeMark /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pp-brand">Confidara<b>Express</b></div>
              <div className="pp-brand-sub">B2B Versandplattform.</div>
            </div>
            <button className="sidebar-close-btn pp-close" onClick={() => setSidebarOpen(false)}>
              <Icon n="close" s={18} />
            </button>
          </div>

          {/* Benutzerinformationen (bleiben auf allen Seiten sichtbar). */}
          <div className="pp-identity">
            <div className="pp-identity-avatar">{initials}</div>
            <div className="pp-identity-text">
              <div className="pp-identity-name">{user?.company_name || user?.name}</div>
              <div className="pp-identity-email">{user?.email || "B2B Konto"}</div>
            </div>
          </div>

          <nav className="pp-nav">
            <button className={`nitem ${page === "overview" ? "on" : ""}`} onClick={() => navigateTo("overview")}>
              <Icon n="dashboard" s={18} /><span>Übersicht</span>
            </button>
            {NAV_GROUPS.map((group) => (
              <React.Fragment key={group.label}>
                <div className="nsec">{group.label}</div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    className={`nitem ${page === item.id ? "on" : ""}`}
                    onClick={() => handleNav(item)}
                  >
                    <Icon n={item.icon} s={18} /><span>{item.label}</span>
                  </button>
                ))}
              </React.Fragment>
            ))}
            <button className="nitem" onClick={handleLogout}>
              <Icon n="logout" s={18} /><span>Abmelden</span>
            </button>
          </nav>

          <a className="pp-scard" href="mailto:support@confidaraexpress.de">
            <div className="pp-scard-top">
              <div className="scard-ic"><Icon n="headset" s={17} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="scard-k">Ihr persönlicher Kontakt</div>
                <div className="scard-t"><span className="ce-live" />Live Support</div>
              </div>
            </div>
            <div className="scard-s">Ihre Anfrage wird zeitnah beantwortet.</div>
          </a>

          <div className="pp-foot">
            <div>© 2026 ConfidaraExpress</div>
            <div>Alle Rechte vorbehalten.</div>
          </div>
        </div>
      </aside>
    </>
  );
}
