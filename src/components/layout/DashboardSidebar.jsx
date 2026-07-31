import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";

// CE-Würfel-Marke (Brandmark). Gleiche Geometrie wie bisher, aber ohne den
// früheren feGaussianBlur-Glow und in gedämpftem Akzentblau — passend zur
// matten Sidebar („Premiumwirkung durch Präzision statt Effekte").
function CubeMark() {
  return (
    <svg className="pp-brandmark-svg" viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ppCubeSb" x1="6" y1="34" x2="34" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#5b8def" />
          <stop offset="1" stopColor="#93b4f5" />
        </linearGradient>
      </defs>
      <g stroke="url(#ppCubeSb)" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M34 27V13a2.2 2.2 0 0 0-1.1-1.9l-11-6.2a2.2 2.2 0 0 0-2.1 0l-11 6.2A2.2 2.2 0 0 0 6 13v14a2.2 2.2 0 0 0 1.1 1.9l11 6.2a2.2 2.2 0 0 0 2.1 0l11-6.2A2.2 2.2 0 0 0 34 27Z" />
        <path d="M6.6 12.2 20 19.8l13.4-7.6M20 35.2V19.8" />
      </g>
      <path d="M6.6 12.2 20 19.8V35l-12.9-7.3A2.2 2.2 0 0 1 6 25.8V13Z" fill="url(#ppCubeSb)" opacity="0.12" />
    </svg>
  );
}

// Informationsarchitektur der Kunden-Sidebar (identisch auf ALLEN Kundenseiten;
// die visuelle Variante bleibt routeabhängig). Page-Keys/Routen unverändert —
// nur Reihenfolge, Gruppierung und sichtbare Labels. Icons ausschließlich aus
// der bestehenden Icon-Komponente. Übersicht (hardcodiert davor) = dashboard ·
// Neue Sendung=plus · Preisrechner=zap · Entwürfe=form · Sendungen=package ·
// Sendungsverfolgung=mapPin · Adressbuch=idcard · Rechnungen=invoice ·
// Unternehmen & Konto (=profile) = building · Abmelden (hardcodiert danach) = logout.
const NAV_GROUPS = [
  {
    label: "Versand",
    items: [
      { id: "new",         label: "Neue Sendung",       icon: "plus"    },
      { id: "calculator",  label: "Preisrechner",       icon: "zap"     },
      { id: "drafts",      label: "Entwürfe",           icon: "form"    },
      { id: "shipments",   label: "Sendungen",          icon: "package" },
      { id: "tracking",    label: "Sendungsverfolgung", icon: "mapPin"  },
    ],
  },
  { label: "Verwaltung", items: [{ id: "addressbook", label: "Adressbuch", icon: "idcard" }] },
  { label: "Abrechnung", items: [{ id: "invoices", label: "Rechnungen", icon: "invoice" }] },
  {
    label: "Konto",
    items: [
      { id: "profile", label: "Unternehmen & Konto", icon: "building" },
    ],
  },
];

// Eine einzige Sidebar für den gesamten eingeloggten Bereich — matte
// Graphit-Fläche, flach, ohne Glow („Clean Executive Logistics"). Aufbau:
// .pp-side (Positionierung, Mobile-Drawer) → .pp-side-in (Inhaltsspalte) →
// Logo, Identität, Nav, Support, Footer. Funktion/Routen unverändert.
export function DashboardSidebar({ page, navigateTo, sidebarOpen, setSidebarOpen, onLogout }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.company_name || user?.name || "?").charAt(0).toUpperCase();

  const handleNav = (item) => {
    if (item.route) { setSidebarOpen(false); navigate(item.route); }
    else navigateTo(item.id);
  };
  // Logout kann vom Elternteil durch den Verlassen-Guard geleitet werden
  // (DashboardPage übergibt onLogout). Ohne onLogout (z. B. DashboardLayout /
  // Preisrechner-Route, wo NewShipmentPage nicht gemountet ist) direkt ausloggen.
  const handleLogout = onLogout || (() => { logout(); navigate("/login"); });

  return (
    <>
      {sidebarOpen && (
        <div className="sidebar-overlay open" onClick={() => setSidebarOpen(false)} style={{ zIndex: 198 }} />
      )}
      <aside className={`sidebar pp-side ${sidebarOpen ? "sidebar-open" : ""}`} style={{ zIndex: 199 }}>
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

          {/* Benutzerinformationen — auf allen Seiten identisch. Der frühere,
              nur auf der Übersicht eingeblendete Chevron ist entfallen: er
              suggerierte eine Aufklappfunktion, die es nicht gibt, und ließ
              dieselbe Sidebar je nach Seite unterschiedlich aussehen. */}
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
            {NAV_GROUPS.map((group) => {
              // Aktive Gruppe rein aus dem bestehenden page-Wert abgeleitet
              // (kein neuer State). Bei „overview" ist keine Gruppe aktiv; auf
              // der /calculator-Route (page === "calculator") ist „Versand" aktiv.
              const isActiveGroup = group.items.some((item) => item.id === page);
              return (
                <React.Fragment key={group.label}>
                  <div className={`nsec${isActiveGroup ? " nsec--active" : ""}`}>{group.label}</div>
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
              );
            })}
            {/* Sitzungsaktion optisch von der Inhaltsnavigation trennen (rein
                dekorativ). Abmelden bleibt funktional unverändert. */}
            <div className="pp-nav-utility-divider" aria-hidden="true" />
            <button className="nitem" onClick={handleLogout}>
              <Icon n="logout" s={18} /><span>Abmelden</span>
            </button>
          </nav>

          <a className="pp-scard" href="mailto:support@confidaraexpress.de">
            <div className="pp-scard-top">
              <div className="scard-ic"><Icon n="headset" s={17} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="scard-k">Ihr persönlicher Kontakt</div>
                {/* Auf allen Seiten dieselbe Formulierung — vorher wich die
                    Übersicht als einzige Seite ab. */}
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
