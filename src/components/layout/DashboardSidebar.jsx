import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";

const NAV_ITEMS = [
  { id: "overview",    label: "Übersicht",    icon: "dashboard" },
  { id: "new",         label: "Neue Sendung", icon: "plus"      },
  { id: "shipments",   label: "Sendungen",    icon: "truck"     },
  { id: "invoices",    label: "Rechnungen",   icon: "invoice"   },
  { id: "profile",     label: "Mein Profil",  icon: "user"      },
  { id: "calculator",  label: "Preisrechner", icon: "zap"       },
];

export function DashboardSidebar({ page, navigateTo, sidebarOpen, setSidebarOpen }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();

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
          <div className="nav-section-label">Navigation</div>
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => navigateTo(item.id)}
            >
              <Icon n={item.icon} s={16} /> {item.label}
            </button>
          ))}
          <button
            className="nav-item"
            onClick={() => { logout(); navigate("/login"); }}
          >
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
