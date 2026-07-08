import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";

// Aktive Adminnavigation (URL-basiert). NavLink liefert den Active-Zustand über
// die URL — bewusst KEINE Vermischung mit dem State-basierten Kunden-Dashboard.
const PRIMARY_NAV = [
  { to: "/admin", label: "Übersicht", icon: "dashboard", end: true },
  { to: "/admin/audit-logs", label: "Audit-Logs", icon: "shieldCheck" },
];

// Bewusst noch NICHT verlinkt — folgen in späteren, separaten Schritten. Als
// deaktivierte Einträge sichtbar (Roadmap erkennbar), aber keine funktionierenden
// Links, die ins Leere führen.
const SOON_NAV = [
  { label: "Kunden", icon: "admin" },
  { label: "Rechnungen", icon: "invoice" },
  { label: "Sendungen", icon: "package" },
];

export function AdminSidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initial = (user?.name || user?.company_name || "A").charAt(0).toUpperCase();

  const handleLogout = () => { logout(); navigate("/login"); };
  const goDashboard = () => { onClose?.(); navigate("/dashboard"); };

  return (
    <>
      {open && <div className="adm-side-overlay" onClick={onClose} aria-hidden="true" />}
      <aside className={`adm-side${open ? " adm-side-open" : ""}`} aria-label="Adminbereich Seitenleiste">
        <div className="adm-brand">
          <span className="adm-brand-mark" aria-hidden="true">CE</span>
          <div className="adm-brand-text">
            <span className="adm-brand-name">ConfidaraExpress</span>
            <span className="adm-brand-tag">Adminbereich</span>
          </div>
          <button className="adm-side-close" onClick={onClose} aria-label="Menü schließen">
            <Icon n="close" s={18} />
          </button>
        </div>

        <div className="adm-identity">
          <span className="adm-identity-avatar" aria-hidden="true">{initial}</span>
          <div className="adm-identity-text">
            <span className="adm-identity-name">{user?.name || user?.company_name || "Administrator"}</span>
            <span className="adm-identity-role">Administrator</span>
          </div>
        </div>

        <nav className="adm-nav" aria-label="Adminnavigation">
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onClose}
              className={({ isActive }) => `adm-nitem${isActive ? " adm-nitem-on" : ""}`}
            >
              <Icon n={item.icon} s={18} /><span>{item.label}</span>
            </NavLink>
          ))}

          <div className="adm-nsec">Bald verfügbar</div>
          {SOON_NAV.map((item) => (
            <button
              key={item.label}
              type="button"
              className="adm-nitem adm-nitem-soon"
              disabled
              aria-disabled="true"
              title="Folgt in einem späteren Schritt"
            >
              <Icon n={item.icon} s={18} /><span>{item.label}</span>
              <span className="adm-soon-badge">bald</span>
            </button>
          ))}
        </nav>

        <div className="adm-side-foot">
          <button type="button" className="adm-foot-btn" onClick={goDashboard}>
            <Icon n="chevronLeft" s={17} /><span>Zum Kundenbereich</span>
          </button>
          <button type="button" className="adm-foot-btn" onClick={handleLogout}>
            <Icon n="logout" s={17} /><span>Abmelden</span>
          </button>
        </div>
      </aside>
    </>
  );
}
