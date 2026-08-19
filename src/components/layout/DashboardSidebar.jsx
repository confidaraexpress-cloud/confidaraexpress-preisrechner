import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Icon } from "../ui/Icon";
import { SupportRequestDialog } from "../support/SupportRequestDialog";
import { SUPPORT_CARD } from "../../utils/supportRequest.mjs";
import { BrandLogo } from "../ui/BrandLogo";

// ─────────────────────────────────────────────────────────────────────────────
// Informationsarchitektur der Kunden-Sidebar — EINE Konfiguration, aus der
// alles gerendert wird. Page-Keys und Routen sind unverändert; geändert haben
// sich ausschließlich Reihenfolge, Gruppierung und zwei sichtbare Labels.
//
// Die Struktur ist bewusst flach: zwei direkte Einträge (Übersicht,
// Adressbuch) und drei aufklappbare Gruppen (Versand, Lager & Aufträge,
// Konto). Es gibt keine vierte Ebene und keine Gruppe mit nur einem Eintrag —
// die früheren Abschnitte „Verwaltung" (nur Adressbuch) und „Abrechnung" (nur
// Rechnungen) waren Überschriften über einer einzigen Zeile und sind entfallen.
//
// Warum Adressbuch NICHT unter Versand oder Lager liegt: es ist eine gemeinsam
// genutzte Ressource (Versand, Empfänger, Aufträge). Unter einer der beiden
// Gruppen behauptete es eine Zugehörigkeit, die es nicht hat.
//
// Warum „Lager & Aufträge" unter Adressbuch steht und nicht ganz oben:
// ConfidaraExpress ist primär eine Versandplattform. Das Lagermodul ist ein
// optionales Zusatzmodul und soll die Kernnavigation nicht anführen.
//
// Icons kommen ausschließlich aus components/ui/Icon.jsx (Lucide-Geometrie,
// stroke 1.75, currentColor). lucide-react ist als Abhängigkeit bewusst
// entfernt und durch drei Governance-Tests verboten — es wird hier nicht
// wieder eingeführt.
// ─────────────────────────────────────────────────────────────────────────────

const OVERVIEW_ITEM = { id: "overview", label: "Übersicht", icon: "dashboard" };
const ADDRESSBOOK_ITEM = { id: "addressbook", label: "Adressbuch", icon: "idcard" };

// Gruppen-ids sind KEINE page-Werte: sie adressieren nur den Klappzustand und
// die aria-controls-Ziele. „warehouse" statt „inventory", damit die id nicht
// mit dem gleichnamigen page-Wert der Lagerübersicht verwechselt wird.
const NAV_GROUPS = [
  {
    id: "shipping",
    label: "Versand",
    icon: "truck",
    items: [
      { id: "new",         label: "Neue Sendung",       icon: "plus"    },
      { id: "calculator",  label: "Preisrechner",       icon: "zap"     },
      { id: "drafts",      label: "Entwürfe",           icon: "form"    },
      { id: "shipments",   label: "Sendungen",          icon: "package" },
      { id: "tracking",    label: "Sendungsverfolgung", icon: "mapPin"  },
      // Früher eine eigene Gruppe „Abrechnung" mit dem Label „Rechnungen".
      // Fachlich sind es die Rechnungen zu Versandbuchungen — sie gehören in
      // den Versandblock. Route, Seite und Rechnungslogik sind unverändert;
      // geändert hat sich nur der sichtbare Name und die Position.
      { id: "invoices",    label: "Versandrechnungen",  icon: "invoice" },
    ],
  },
  {
    id: "warehouse",
    label: "Lager & Aufträge",
    icon: "layers",
    items: [
      { id: "inventory", label: "Lagerübersicht", icon: "dashboard"   },
      { id: "products",  label: "Artikel",        icon: "cube"        },
      { id: "stock",     label: "Bestand",        icon: "layers"      },
      { id: "orders",    label: "Aufträge",       icon: "cart"        },
      { id: "movements", label: "Bewegungen",     icon: "packageMove" },
    ],
  },
  {
    id: "account",
    label: "Konto",
    icon: "user",
    items: [
      { id: "profile", label: "Unternehmen & Konto", icon: "building" },
      // Der Nachrichtenverlauf der eigenen Anfragen. Die Supportkarte weiter
      // unten bleibt der schnelle Weg, eine NEUE Anfrage zu stellen — dieser
      // Eintrag führt zu den bestehenden Vorgängen.
      { id: "support", label: "Supportanfragen", icon: "mail" },
    ],
  },
];

// Ein Navigationseintrag. Dasselbe Bauteil für direkte Einträge und für
// Gruppeneinträge — der Unterschied ist ausschließlich die Einrückung, und die
// kommt aus dem umgebenden Container, nicht aus einer zweiten Klasse.
function NavItem({ item, page, onNavigate }) {
  return (
    <button
      type="button"
      className={`nitem ${page === item.id ? "on" : ""}`}
      aria-current={page === item.id ? "page" : undefined}
      onClick={() => onNavigate(item)}
    >
      <Icon n={item.icon} s={18} /><span>{item.label}</span>
    </button>
  );
}

// Eine aufklappbare Gruppe. EIN Bauteil für alle drei Gruppen — vorher trug
// „Lager & Aufträge" eine eigene Implementierung samt eigener Kartenfläche,
// während Versand und Konto nur unbedienbare Überschriften hatten. Drei
// leicht verschiedene Muster für dieselbe Sache sind jetzt eines.
//
// Der Kopf ist ein echtes <button> mit aria-expanded/aria-controls; ein
// klickbares <div> bekäme weder Tastaturbedienung noch Rollenzuordnung.
// Eingeklappt verschwinden die Einträge AUS DEM DOM, nicht nur optisch —
// sonst blieben sie für Tastatur und Screenreader erreichbar.
function SidebarGroup({ group, page, open, onToggle, onNavigate }) {
  const itemsId = `pp-nav-group-${group.id}-items`;
  const active = group.items.some((item) => item.id === page);
  return (
    <div
      className={
        "pp-nav-group" +
        (active ? " pp-nav-group--active" : "") +
        (open ? "" : " pp-nav-group--collapsed")
      }
    >
      <button
        type="button"
        className="pp-nav-group-head"
        aria-expanded={open}
        aria-controls={itemsId}
        onClick={onToggle}
      >
        <Icon n={group.icon} s={16} />
        <span className="pp-nav-group-label">{group.label}</span>
        <span className="pp-nav-group-chevron" aria-hidden="true"><Icon n="chevron" s={16} /></span>
      </button>
      {open && (
        <div id={itemsId} className="pp-nav-group-items">
          {group.items.map((item) => (
            <NavItem key={item.id} item={item} page={page} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

// Eine einzige Sidebar für den gesamten eingeloggten Bereich — tiefes Navy,
// flach, ohne Glow. Aufbau: .pp-side (Positionierung, Mobile-Drawer) →
// .pp-side-in (Inhaltsspalte) → Marke, Navigation, Supportkarte, Fußzeile.
// Funktion und Routen unverändert.
export function DashboardSidebar({ page, navigateTo, sidebarOpen, setSidebarOpen, onLogout }) {
  const { logout } = useAuth();
  const navigate = useNavigate();
  // Supportdialog: lokaler Zustand DIESER Komponente. Bewusst kein globaler State und
  // keine eigene Route — die Karte ist auf jeder eingeloggten Seite dieselbe, und der
  // Dialog darf die bestehende Navigation (page-State) nicht berühren.
  const [supportOpen, setSupportOpen] = useState(false);

  // Klappzustand aller drei Gruppen in EINEM Objekt. Reiner UI-Zustand dieser
  // Komponente: keine Persistenz in localStorage, Backend oder Context — der
  // Zustand ist billig wiederherzustellen, und eine gespeicherte Einklappung
  // wäre für den Nutzen zu viel Maschinerie. Standard: alle offen.
  const [openGroups, setOpenGroups] = useState(() =>
    Object.fromEntries(NAV_GROUPS.map((g) => [g.id, true])));

  // Die Gruppe des aktuellen Bereichs — rein aus dem bestehenden page-Wert
  // abgeleitet, kein zusätzlicher State. Auf „overview"/„addressbook" ist keine
  // Gruppe aktiv; auf /calculator (page === "calculator") ist Versand aktiv,
  // auf /inventory/orders/:id (page === "orders") Lager & Aufträge.
  const activeGroupId = NAV_GROUPS.find((g) => g.items.some((i) => i.id === page))?.id ?? null;

  // Wer in einen Bereich wechselt, muss dessen aktiven Eintrag sehen — eine
  // zuvor eingeklappte Gruppe würde ihn verbergen. Bewusst an den WECHSEL
  // gebunden (Abhängigkeit ist die Gruppen-id, nicht jeder Render): innerhalb
  // der Gruppe bleibt das Zuklappen möglich, sonst wirkte die Schaltfläche
  // dort kaputt. Ist die Gruppe schon offen, wird derselbe Zustand
  // zurückgegeben — das erspart einen überflüssigen Renderdurchlauf.
  useEffect(() => {
    if (!activeGroupId) return;
    setOpenGroups((prev) => (prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }));
  }, [activeGroupId]);

  const toggleGroup = (id) => setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  const handleNav = (item) => {
    if (item.route) { setSidebarOpen(false); navigate(item.route); }
    else navigateTo(item.id);
  };
  // Logout kann vom Elternteil durch den Verlassen-Guard geleitet werden
  // (DashboardPage übergibt onLogout). Ohne onLogout (z. B. DashboardLayout /
  // Preisrechner-Route, wo NewShipmentPage nicht gemountet ist) direkt ausloggen.
  const handleLogout = onLogout || (() => { logout(); navigate("/login"); });

  const gruppe = (id) => NAV_GROUPS.find((g) => g.id === id);

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
            {/* Reihenfolge: Übersicht → Versand → Adressbuch → Lager & Aufträge
                → Konto → Abmelden. Die Hierarchie entsteht aus Abstand und
                Einrückung, nicht aus Rahmen, Karten oder Trennlinien. */}
            <nav className="pp-nav">
              <NavItem item={OVERVIEW_ITEM} page={page} onNavigate={handleNav} />

              <SidebarGroup
                group={gruppe("shipping")}
                page={page}
                open={openGroups.shipping}
                onToggle={() => toggleGroup("shipping")}
                onNavigate={handleNav}
              />

              <NavItem item={ADDRESSBOOK_ITEM} page={page} onNavigate={handleNav} />

              <SidebarGroup
                group={gruppe("warehouse")}
                page={page}
                open={openGroups.warehouse}
                onToggle={() => toggleGroup("warehouse")}
                onNavigate={handleNav}
              />

              <SidebarGroup
                group={gruppe("account")}
                page={page}
                open={openGroups.account}
                onToggle={() => toggleGroup("account")}
                onNavigate={handleNav}
              />

              {/* Sitzungsaktion optisch von der Inhaltsnavigation trennen — die
                  einzige verbliebene Linie der Navigation. Abmelden bleibt
                  funktional unverändert. */}
              <div className="pp-nav-utility-divider" aria-hidden="true" />
              <button type="button" className="nitem" onClick={handleLogout}>
                <Icon n="logout" s={18} /><span>Abmelden</span>
              </button>
            </nav>

            {/* Supportkarte: die GESAMTE Karte ist die Aktion — ein <button>, kein
                mailto-Link mehr. Der Kunde schreibt seine Anfrage im Formular; das
                Postfach ist nicht mehr der Einstieg. Wortlaut zentral in
                utils/supportRequest.mjs.

                Sie bleibt trotz „Konto → Supportanfragen" bestehen und wurde
                bewusst NICHT entfernt: die beiden Wege führen zu verschiedenen
                Zielen — der Navigationseintrag zu den BESTEHENDEN Vorgängen, die
                Karte zu einer NEUEN Anfrage. Sie ist außerdem die einzige Karte
                der Sidebar; die Regel „keine Box in der Box" richtet sich gegen
                nachgebaute Navigationsflächen, nicht gegen diesen einen CTA. */}
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
