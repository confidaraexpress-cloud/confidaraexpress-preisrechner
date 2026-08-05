import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { SupportRequestDialog } from "../support/SupportRequestDialog";
import { SUPPORT_CARD } from "../../utils/supportRequest.mjs";
import markReverse from "../../assets/brand/mark-reverse.svg";

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
      // Der Nachrichtenverlauf der eigenen Anfragen. Die Supportkarte weiter unten
      // bleibt unverändert der schnelle Weg, eine NEUE Anfrage zu stellen — dieser
      // Eintrag führt zu den bestehenden Vorgängen.
      { id: "support", label: "Supportanfragen", icon: "mail" },
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
  // Supportdialog: lokaler Zustand DIESER Komponente. Bewusst kein globaler State und
  // keine eigene Route — die Karte ist auf jeder eingeloggten Seite dieselbe, und der
  // Dialog darf die bestehende Navigation (page-State) nicht berühren.
  const [supportOpen, setSupportOpen] = useState(false);

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

          {/* Bildmarke rein dekorativ: die ausgeschriebene Wortmarke steht
              direkt daneben als echter Text und wird bereits vorgelesen. Die
              Reverse-Variante ist bereits in Zielfarbe ausgeliefert — deshalb
              kein CSS-Filter und keine Einfärbung. */}
          <div className="pp-logo">
            <span className="ce-brandmark">
              <img
                className="pp-brandmark-img"
                src={markReverse}
                alt=""
                aria-hidden="true"
                draggable="false"
              />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="pp-brand">Confidara<b>Express</b></div>
              <div className="pp-brand-sub">B2B Versandplattform.</div>
            </div>
            <button className="sidebar-close-btn pp-close" aria-label="Navigation schließen" onClick={() => setSidebarOpen(false)}>
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

          {/* Supportkarte: die GESAMTE Karte ist die Aktion — ein <button>, kein
              mailto-Link mehr. Der Kunde schreibt seine Anfrage im Formular; das
              Postfach ist nicht mehr der Einstieg. Geometrie, Abstände und
              Materialsprache bleiben unverändert (siehe dashboard-premium.css),
              nur Auszeichnung und Inhalt ändern sich: kein „Live Support", kein
              grüner Statuspunkt, kein Headset-Icon — stattdessen das vorhandene
              mail-Icon. Wortlaut zentral in utils/supportRequest.mjs. */}
          <button type="button" className="pp-scard" onClick={() => setSupportOpen(true)}>
            <div className="pp-scard-top">
              <div className="scard-ic"><Icon n="mail" s={17} /></div>
              <div style={{ minWidth: 0 }}>
                <div className="scard-k">{SUPPORT_CARD.kicker}</div>
                <div className="scard-t">{SUPPORT_CARD.title}</div>
              </div>
            </div>
            <div className="scard-a">
              <span>{SUPPORT_CARD.action}</span>
              <Icon n="chevronRight" s={14} />
            </div>
            <div className="scard-s">{SUPPORT_CARD.hint}</div>
          </button>

          <div className="pp-foot">
            <div>© 2026 ConfidaraExpress</div>
            <div>Alle Rechte vorbehalten.</div>
          </div>
        </div>
      </aside>

      {/* Außerhalb der <aside>: der Dialog ist ein Overlay über der gesamten Seite,
          kein Sidebarinhalt — sonst würde er auf Mobil im Drawer eingesperrt. */}
      {supportOpen && <SupportRequestDialog onClose={() => setSupportOpen(false)} />}
    </>
  );
}
