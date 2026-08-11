import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { accountInitials, accountDisplayName } from "../../utils/accountIdentity.mjs";
import { BrandLogo } from "../ui/BrandLogo";

// Aktive Adminnavigation (URL-basiert). NavLink liefert den Active-Zustand über
// die URL — bewusst KEINE Vermischung mit dem State-basierten Kunden-Dashboard.
const PRIMARY_NAV = [
  { to: "/admin", label: "Übersicht", icon: "dashboard", end: true },
  { to: "/admin/users", label: "Kunden", icon: "admin" },
  { to: "/admin/shipments", label: "Sendungen", icon: "package" },
  { to: "/admin/invoices", label: "Rechnungen", icon: "invoice", end: true },
  { to: "/admin/invoices/backfill", label: "Produktion & Backfill", icon: "shieldCheck" },
  { to: "/admin/cancellation-requests", label: "Stornierungsanfragen", icon: "ban" },
  { to: "/admin/support-requests", label: "Supportanfragen", icon: "mail" },
  { to: "/admin/audit-logs", label: "Audit-Logs", icon: "shieldCheck" },
];

// Bewusst noch NICHT verlinkt — folgen in späteren, separaten Schritten. Als
// deaktivierte Einträge sichtbar (Roadmap erkennbar), aber keine funktionierenden
// Links, die ins Leere führen. Aktuell leer (Rechnungen sind live).
const SOON_NAV = [];

export function AdminSidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/login"); };
  const goDashboard = () => { onClose?.(); navigate("/dashboard"); };

  return (
    <>
      {open && <div className="adm-side-overlay" onClick={onClose} aria-hidden="true" />}
      <aside className={`adm-side${open ? " adm-side-open" : ""}`} aria-label="Adminbereich Seitenleiste">
        <div className="adm-brand">
          {/* Dieselbe Marke aus demselben Bauteil wie im Kundenportal — kein
              eigenes Adminlogo. Bewusst die STANDARD-Variante: diese Sidebar
              ist hell (--ce-color-surface), eine Reverse-Wortmarke wäre darauf
              unsichtbar. „Adminbereich" ist separater UI-Text und nicht
              Bestandteil der Marke; deshalb gibt der Aufrufer ihn mit. */}
          <BrandLogo
            variant="wordmark"
            tone="standard"
            sub={<span className="adm-brand-tag">Adminbereich</span>}
          />
          <button type="button" className="adm-side-close" onClick={onClose} aria-label="Menü schließen" title="Menü schließen">
            <Icon n="close" s={18} />
          </button>
        </div>

        {/* Eine Initialenquelle für das ganze Produkt (Paket D): Sidebar,
            Benutzerchip, Profilhero — und jetzt auch der Adminbereich. Vorher
            leitete diese Datei den Buchstaben selbst ab, mit umgekehrter
            Reihenfolge (name vor company_name) und damit einem anderen
            Ergebnis als die Kunden-Sidebar für dasselbe Konto. */}
        <div className="adm-identity">
          <span className="adm-identity-avatar" aria-hidden="true">{accountInitials(user)}</span>
          <div className="adm-identity-text">
            <span className="adm-identity-name">{accountDisplayName(user, "Administrator")}</span>
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

          {SOON_NAV.length > 0 && (
            <>
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
            </>
          )}
        </nav>

        {/* Der Bereichswechsel ist die häufigere Fußaktion und trägt deshalb
            die Markenfarbe; „Abmelden" bleibt bewusst neutral. */}
        <div className="adm-side-foot">
          <button type="button" className="adm-foot-btn adm-foot-btn-switch" onClick={goDashboard}>
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
