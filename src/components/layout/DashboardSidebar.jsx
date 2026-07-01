import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";

// Gruppierte Navigation — enthält ausschließlich Einträge mit echter Funktion.
// Keine „Adressbuch"/„Einstellungen" (dafür existiert keine Route). Reihenfolge
// und Gruppen orientieren sich an der Designvorlage. Alle Ziele sind bestehende
// Routen/State-Wechsel; die Funktionen ändern sich nicht.
const NAV_GROUPS = [
  {
    label: "Versand",
    items: [
      { id: "overview",  label: "Übersicht",          icon: "dashboard" },
      { id: "new",       label: "Neue Sendung",       icon: "plus"      },
      { id: "shipments", label: "Sendungen",          icon: "truck"     },
      { id: "tracking",  label: "Sendungsverfolgung", icon: "map", route: "/tracking" },
    ],
  },
  {
    label: "Abrechnung",
    items: [
      { id: "invoices", label: "Rechnungen", icon: "invoice" },
    ],
  },
  {
    label: "Konto",
    items: [
      { id: "profile",    label: "Mein Profil",   icon: "user" },
      { id: "calculator", label: "Preisrechner",  icon: "zap"  },
    ],
  },
];

export function DashboardSidebar({ page, navigateTo, sidebarOpen, setSidebarOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();
  const isOverview = page === "overview";

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
          {NAV_GROUPS.map((group) => (
            <React.Fragment key={group.label}>
              <div className="nav-section-label">{group.label}</div>
              {group.items.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${page === item.id ? "active" : ""}`}
                  onClick={() => {
                    if (item.route) { setSidebarOpen(false); navigate(item.route); }
                    else navigateTo(item.id);
                  }}
                >
                  <Icon n={item.icon} s={16} /> {item.label}
                </button>
              ))}
            </React.Fragment>
          ))}
          <button
            className="nav-item"
            onClick={() => { logout(); navigate("/login"); }}
          >
            <Icon n="logout" s={16} /> Abmelden
          </button>
        </nav>

        <div className="sidebar-footer">
          {isOverview ? (
            <>
              <a className="sidebar-support" href="mailto:support@confidaraexpress.de">
                <span className="sidebar-support-ico"><Icon n="headset" s={17} /></span>
                <span className="sidebar-support-info">
                  <span className="sidebar-support-label">Ihr persönlicher Kontakt</span>
                  <span className="sidebar-support-title">
                    <span className="sidebar-support-dot" /> Live Support
                  </span>
                  <span className="sidebar-support-sub">Ihre Antwort wird zeitnah beantwortet</span>
                </span>
              </a>
              <div className="sidebar-copy">
                © 2026 ConfidaraExpress
                <span>Alle Rechte vorbehalten</span>
              </div>
            </>
          ) : (
            <div className="user-card">
              <div className="user-avatar">{initials}</div>
              <div className="user-info" style={{ flex: 1, minWidth: 0 }}>
                <div className="user-name">{user?.company_name || user?.name}</div>
                <div className="user-role">{user?.email || "B2B Konto"}</div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
