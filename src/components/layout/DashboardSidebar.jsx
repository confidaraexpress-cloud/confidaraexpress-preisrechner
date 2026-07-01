import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";

// CE-Würfel-Marke (Design-Handoff §Referenz — verbatim Inline-SVG).
function CubeMark() {
  return (
    <svg className="dpx-brand-mark" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="dpxCubeSb" x1="6" y1="34" x2="34" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2F8CFF" />
          <stop offset="0.55" stopColor="#64B4FF" />
          <stop offset="1" stopColor="#bfe0ff" />
        </linearGradient>
        <filter id="dpxCubeSbGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feColorMatrix in="b" type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.55  0 0 0 0 1  0 0 0 0.5 0" result="g" />
          <feMerge><feMergeNode in="g" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <g filter="url(#dpxCubeSbGlow)" stroke="url(#dpxCubeSb)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
        <path d="M34 27V13a2.2 2.2 0 0 0-1.1-1.9l-11-6.2a2.2 2.2 0 0 0-2.1 0l-11 6.2A2.2 2.2 0 0 0 6 13v14a2.2 2.2 0 0 0 1.1 1.9l11 6.2a2.2 2.2 0 0 0 2.1 0l11-6.2A2.2 2.2 0 0 0 34 27Z" />
        <path d="M6.6 12.2 20 19.8l13.4-7.6M20 35.2V19.8" />
      </g>
      <path d="M6.6 12.2 20 19.8V35l-12.9-7.3A2.2 2.2 0 0 1 6 25.8V13Z" fill="url(#dpxCubeSb)" opacity="0.14" />
    </svg>
  );
}

// Nur echte Funktionen: kein Adressbuch/Einstellungen (keine Route). Reihenfolge
// und Gruppen wie im Handoff; „Übersicht" steht (wie dort) über der ersten Gruppe.
const NAV_GROUPS = [
  {
    label: "Versand",
    items: [
      { id: "new",       label: "Neue Sendung",       icon: "plus"    },
      { id: "shipments", label: "Sendungen",          icon: "package" },
      { id: "tracking",  label: "Sendungsverfolgung", icon: "search", route: "/tracking" },
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

export function DashboardSidebar({ page, navigateTo, sidebarOpen, setSidebarOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();
  const isOverview = page === "overview";

  const handleNav = (item) => {
    if (item.route) { setSidebarOpen(false); navigate(item.route); }
    else navigateTo(item.id);
  };
  const handleLogout = () => { logout(); navigate("/login"); };

  // ── Übersicht: Sidebar exakt nach Design-Handoff (.dpx-*), nur echte Funktionen ──
  if (isOverview) {
    return (
      <>
        {sidebarOpen && (
          <div className="sidebar-overlay open" onClick={() => setSidebarOpen(false)} style={{ zIndex: 198 }} />
        )}
        <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} style={{ zIndex: 199 }}>
          <div className="dpx-brand">
            <CubeMark />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="dpx-brand-name">Confidara<b>Express</b></div>
              <div className="dpx-brand-sub">B2B Versandplattform.</div>
            </div>
            <button className="sidebar-close-btn dpx-close" onClick={() => setSidebarOpen(false)}>
              <Icon n="close" s={18} />
            </button>
          </div>

          <nav className="dpx-nav">
            <button className="dpx-nav-item is-active" onClick={() => navigateTo("overview")}>
              <Icon n="dashboard" s={22} /><span>Übersicht</span>
            </button>
            {NAV_GROUPS.map((group) => (
              <React.Fragment key={group.label}>
                <div className="dpx-nav-label">{group.label}</div>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    className={`dpx-nav-item ${page === item.id ? "is-active" : ""}`}
                    onClick={() => handleNav(item)}
                  >
                    <Icon n={item.icon} s={22} /><span>{item.label}</span>
                  </button>
                ))}
              </React.Fragment>
            ))}
            <button className="dpx-nav-item" onClick={handleLogout}>
              <Icon n="logout" s={22} /><span>Abmelden</span>
            </button>
          </nav>

          <a className="dpx-support" href="mailto:support@confidaraexpress.de">
            <div className="dpx-support-top">
              <div className="dpx-support-badge"><Icon n="headset" s={22} /></div>
              <div>
                <div className="dpx-support-kontakt">Ihr persönlicher Kontakt</div>
                <div className="dpx-support-live"><span className="dot" />Live Support</div>
              </div>
            </div>
            <div className="dpx-support-note">Ihre Antwort wird zeitnah beantwortet.</div>
          </a>

          <div className="dpx-copyright">
            <div>© 2026 ConfidaraExpress</div>
            <div>Alle Rechte vorbehalten.</div>
          </div>
        </aside>
      </>
    );
  }

  // ── Übrige Dashboard-/Calculator-Seiten: unverändertes Light-/Standard-Sidebar-Layout ──
  return (
    <>
      {sidebarOpen && (
        <div className="sidebar-overlay open" onClick={() => setSidebarOpen(false)} style={{ zIndex: 198 }} />
      )}
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`} style={{ zIndex: 199 }}>
        <div className="sidebar-brand">
          <div className="logo-mark" style={{ width: 30, height: 30, fontSize: 12 }}>CE</div>
          <div style={{ flex: 1 }}>
            <div className="sidebar-brand-name">ConfidaraExpress</div>
            <div className="sidebar-brand-sub">B2B Versand</div>
          </div>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>
            <Icon n="close" s={18} />
          </button>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${page === "overview" ? "active" : ""}`} onClick={() => navigateTo("overview")}>
            <Icon n="dashboard" s={16} /> Übersicht
          </button>
          {NAV_GROUPS.map((group) => (
            <React.Fragment key={group.label}>
              <div className="nav-section-label">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  onClick={() => handleNav(item)}
                >
                  <Icon n={item.icon} s={16} /> {item.label}
                </button>
              ))}
            </React.Fragment>
          ))}
          <button className="nav-item" onClick={handleLogout}>
            <Icon n="logout" s={16} /> Abmelden
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="user-card">
            <div className="user-avatar">{initials}</div>
            <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name">{user?.company_name || user?.name}</div>
              <div className="user-role">{user?.email || "B2B Konto"}</div>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
