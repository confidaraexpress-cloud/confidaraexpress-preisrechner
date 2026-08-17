import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { SupportRequestDialog } from "../support/SupportRequestDialog";
import { SUPPORT_CARD } from "../../utils/supportRequest.mjs";
import { BrandLogo } from "../ui/BrandLogo";

// Informationsarchitektur der Kunden-Sidebar (identisch auf ALLEN Kundenseiten;
// die visuelle Variante bleibt routeabhängig). Page-Keys/Routen unverändert —
// nur Reihenfolge, Gruppierung und sichtbare Labels. Icons ausschließlich aus
// der bestehenden Icon-Komponente. Übersicht (hardcodiert davor) = dashboard ·
// Neue Sendung=plus · Preisrechner=zap · Entwürfe=form · Sendungen=package ·
// Sendungsverfolgung=mapPin · Adressbuch=idcard · Rechnungen=invoice ·
// Unternehmen & Konto (=profile) = building · Abmelden (hardcodiert danach) = logout.
// „Lager & Aufträge" ist ein eigener Modulbereich INNERHALB derselben Sidebar —
// keine zweite Navigation, keine rechte Zusatzleiste, keine eigene Designwelt.
// Er steht direkt unter „Übersicht" und wird durch eine eigene, dezent
// abgesetzte Fläche als zusammengehörig erkennbar (.pp-nav-module, siehe
// dashboard-premium.css). Die Einträge sind gewöhnliche page-Werte und nutzen
// dieselben .nitem-Regeln wie jede andere Navigation.
const INVENTORY_GROUP = {
  label: "Lager & Aufträge",
  icon: "layers",
  items: [
    { id: "inventory", label: "Lagerübersicht", icon: "dashboard" },
    { id: "products",  label: "Artikel",        icon: "cube"       },
    { id: "stock",     label: "Bestand",        icon: "layers"     },
    { id: "orders",    label: "Aufträge",       icon: "cart"       },
    { id: "movements", label: "Bewegungen",     icon: "packageMove" },
  ],
};

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
// Logo, Nav, Support, Footer. Funktion/Routen unverändert.
//
// Die frühere Firmenkarte (Avatar + Firmenname + E-Mail direkt unter dem Logo)
// ist ersatzlos entfernt — kein Platzhalter, kein Ersatzblock. Die Kontoidentität
// bleibt über UserChip (Seitenkopf) und Profilhero (Unternehmen & Konto)
// erreichbar; beide nutzen weiterhin dieselbe Quelle (utils/accountIdentity.mjs).
export function DashboardSidebar({ page, navigateTo, sidebarOpen, setSidebarOpen, onLogout }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  // Supportdialog: lokaler Zustand DIESER Komponente. Bewusst kein globaler State und
  // keine eigene Route — die Karte ist auf jeder eingeloggten Seite dieselbe, und der
  // Dialog darf die bestehende Navigation (page-State) nicht berühren.
  const [supportOpen, setSupportOpen] = useState(false);

  // Ein-/Ausklappen des Lagerblocks. Reiner UI-Zustand DIESER Komponente:
  // keine Persistenz in localStorage, Backend oder Context — der Zustand ist
  // billig wiederherzustellen und eine gespeicherte Einklappung wäre für den
  // Nutzen zu viel Maschinerie. Standard ist offen.
  const inventoryActive = INVENTORY_GROUP.items.some((i) => i.id === page);
  const [inventoryOpen, setInventoryOpen] = useState(true);
  // Wer in den Lagerbereich wechselt, soll den aktiven Eintrag sehen — ein
  // zuvor eingeklappter Block würde ihn sonst verbergen. Bewusst an den WECHSEL
  // gebunden (nicht an jeden Render): innerhalb des Bereichs bleibt das Zuklappen
  // möglich, sonst wirkte die Schaltfläche dort kaputt.
  useEffect(() => { if (inventoryActive) setInventoryOpen(true); }, [inventoryActive]);

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

          {/* Die Marke kommt aus dem gemeinsamen Bauteil (BrandLogo) und trägt
              die Originalkomposition des Masters: Signet über dem Schriftzug.
              Die Sidebar ist dunkel, also die Reverse-Variante. Die Marke ist
              ein Bild ohne begleitenden Text und trägt den Markennamen deshalb
              als alt-Text. Die Unterzeile ist ein Deskriptor dieser Fläche,
              kein Bestandteil der Marke — sie wird vom Aufrufer mitgegeben und
              behält ihre eigene Klasse. Kein Claim (siehe BrandLogo.jsx). */}
          <div className="pp-logo">
            <BrandLogo
              variant="lockup"
              tone="reverse"
              sub={<span className="pp-brand-sub">B2B Versandplattform.</span>}
            />
            <button className="sidebar-close-btn pp-close" aria-label="Navigation schließen" onClick={() => setSidebarOpen(false)}>
              <Icon n="close" s={18} />
            </button>
          </div>

          {/* Der Scrollbereich der Spalte. Er umfasst BEWUSST Navigation,
              Supportkarte UND Fußzeile — alles unterhalb der Marke. Läge er nur
              um die Navigation, stünden Karte und Fußzeile unbeweglich darunter,
              belegten dauerhaft Höhe und der letzte Navigationseintrag würde
              mittendrin abgeschnitten (genau der Fehler, der diese Konstruktion
              einmal ersetzt hat). Die Marke bleibt als Kopf darüber stehen. */}
          <div className="pp-side-scroll">
            <nav className="pp-nav">
              <button className={`nitem ${page === "overview" ? "on" : ""}`} onClick={() => navigateTo("overview")}>
                <Icon n="dashboard" s={18} /><span>Übersicht</span>
              </button>

              {/* Modulblock „Lager & Aufträge" — eigene Fläche, gleiche Bauteile.
                  Der Kopf ist die Klappschaltfläche des Blocks: ein echtes
                  <button> mit aria-expanded/aria-controls, damit der Zustand auch
                  ohne den sichtbaren Chevron erfassbar ist. Die Einträge selbst
                  bleiben gewöhnliche .nitem-Buttons.
                  Eingeklappt werden sie AUS DEM DOM genommen, nicht nur optisch
                  versteckt — sonst blieben sie für Tastatur und Screenreader
                  erreichbar, obwohl sie unsichtbar sind. */}
              <div className={`pp-nav-module${inventoryActive ? " pp-nav-module--active" : ""}${inventoryOpen ? "" : " pp-nav-module--collapsed"}`}>
                <button
                  type="button"
                  className="pp-nav-module-head"
                  aria-expanded={inventoryOpen}
                  aria-controls="pp-nav-module-items"
                  onClick={() => setInventoryOpen((v) => !v)}
                >
                  <Icon n={INVENTORY_GROUP.icon} s={15} />
                  <span>{INVENTORY_GROUP.label}</span>
                  <span className="pp-nav-module-chevron" aria-hidden="true"><Icon n="chevron" s={15} /></span>
                </button>
                {inventoryOpen && (
                  <div id="pp-nav-module-items" className="pp-nav-module-items">
                    {INVENTORY_GROUP.items.map((item) => (
                      <button
                        key={item.id}
                        className={`nitem ${page === item.id ? "on" : ""}`}
                        onClick={() => handleNav(item)}
                      >
                        <Icon n={item.icon} s={18} /><span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

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
                Postfach ist nicht mehr der Einstieg. Kein „Live Support", kein
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
        </div>
      </aside>

      {/* Außerhalb der <aside>: der Dialog ist ein Overlay über der gesamten Seite,
          kein Sidebarinhalt — sonst würde er auf Mobil im Drawer eingesperrt. */}
      {supportOpen && <SupportRequestDialog onClose={() => setSupportOpen(false)} />}
    </>
  );
}
