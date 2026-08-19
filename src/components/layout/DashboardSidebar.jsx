import React, { useState } from "react";
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
// Die Struktur ist bewusst flach: drei direkte Einträge (Übersicht,
// Adressbuch, Rechnungen) und drei aufklappbare Gruppen (Versand, Lager &
// Aufträge, Konto). Es gibt keine vierte Ebene und keine Gruppe mit nur einem
// Eintrag — die früheren Abschnitte „Verwaltung" (nur Adressbuch) und
// „Abrechnung" (nur Rechnungen) waren Überschriften über einer einzigen Zeile
// und sind entfallen.
//
// Warum Adressbuch NICHT unter Versand oder Lager liegt: es ist eine gemeinsam
// genutzte Ressource (Versand, Empfänger, Aufträge). Unter einer der beiden
// Gruppen behauptete es eine Zugehörigkeit, die es nicht hat.
//
// Warum Rechnungen NICHT unter Versand liegt: der Bereich ist eine
// eigenständige Produktfunktion und soll später auch Abo- und andere
// Confidara-Abrechnungen aufnehmen können. Unter „Versand" wäre er dann
// falsch einsortiert — und die Beschriftung „Versandrechnungen" wäre falsch.
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
// Rechnungen sind ein EIGENSTÄNDIGER Produktbereich, kein Unterpunkt des
// Versands. Der Name ist bewusst neutral: der Bereich soll später auch
// Abo- und andere Confidara-Abrechnungen aufnehmen können, ohne dass die
// Navigation dann falsch beschriftet wäre. Der page-Wert bleibt „invoices" —
// Route, Seite und Rechnungslogik sind unverändert.
const INVOICES_ITEM = { id: "invoices", label: "Rechnungen", icon: "invoice" };

// Gruppen-ids sind KEINE page-Werte: sie adressieren nur den Klappzustand und
// die aria-controls-Ziele. „warehouse" statt „inventory", damit die id nicht
// mit dem gleichnamigen page-Wert der Lagerübersicht verwechselt wird.
const NAV_GROUPS = [
  {
    id: "shipping",
    label: "Versand",
    icon: "truck",
    items: [
      { id: "new",         label: "Neue Sendung",         icon: "plus"    },
      // „Preisrechner" war zu unspezifisch — der Rechner berechnet
      // Versandkosten. Route (/calculator) und page-Wert sind unverändert.
      { id: "calculator",  label: "Versandkostenrechner", icon: "zap"     },
      { id: "drafts",      label: "Entwürfe",             icon: "form"    },
      { id: "shipments",   label: "Sendungen",            icon: "package" },
      { id: "tracking",    label: "Sendungsverfolgung",   icon: "mapPin"  },
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
      // „Unternehmen & Konto" unter der Gruppe „Konto" war eine sprachliche
      // Dopplung. Der page-Wert bleibt „profile".
      { id: "profile", label: "Kontoeinstellungen", icon: "building" },
      // Der Nachrichtenverlauf der eigenen Anfragen. Die Supportkarte weiter
      // unten bleibt der schnelle Weg, eine NEUE Anfrage zu stellen — dieser
      // Eintrag führt zu den bestehenden Vorgängen.
      { id: "support", label: "Supportanfragen", icon: "mail" },
    ],
  },
];

// Die zuletzt geöffnete Gruppe — MODULWEIT, bewusst kein State, kein Context,
// kein Storage.
//
// Warum überhaupt: „Neue Sendung"/Adressbuch laufen als page-State in
// DashboardPage, der Preisrechner und die Lagerdetailseiten als eigene Routen
// in DashboardLayout. Ein Wechsel dazwischen hängt den einen Teilbaum ab und
// montiert den anderen — die Sidebar wird also beim Klick auf „Preisrechner"
// NEU gemountet. Ohne diese Zeile klappte die gerade geöffnete Gruppe genau in
// dem Moment zu, in dem der Nutzer einen ihrer Einträge benutzt.
//
// Warum es die Reload-Regel nicht verletzt: ein Modulwert lebt im Dokument.
// Ein vollständiger Reload wertet das Modul neu aus und setzt ihn damit
// zwangsläufig auf null zurück — genau die geforderte Semantik („nach F5 alles
// zu, innerhalb der Sitzung bleibt die Wahl bestehen"). Persistenz über den
// Tab hinaus entsteht dabei nicht.
let sitzungsOffeneGruppe = null;

// Ein Navigationseintrag. EIN Bauteil für die erste Ebene (Übersicht,
// Adressbuch), für Gruppeneinträge und für „Abmelden" — die Ebene entscheidet
// über das Aussehen, nicht ein zweites Bauteil: Gruppeneinträge erkennt das
// CSS am Container, „Abmelden" an `variant="utility"`.
function NavItem({ item, page, onNavigate, variant }) {
  const aktiv = page === item.id;
  return (
    <button
      type="button"
      className={`nitem${variant ? ` nitem--${variant}` : ""}${aktiv ? " on" : ""}`}
      aria-current={aktiv ? "page" : undefined}
      onClick={() => onNavigate(item)}
    >
      <Icon n={item.icon} s={18} /><span>{item.label}</span>
    </button>
  );
}

// Eine aufklappbare Gruppe. EIN Bauteil für alle drei Gruppen — vorher trug
// „Lager & Aufträge" eine eigene Implementierung samt eigener Kartenfläche,
// während Versand und Konto nur unbedienbare Überschriften hatten.
//
// Der Kopf ist ein echtes <button> mit aria-expanded/aria-controls; ein
// klickbares <div> bekäme weder Tastaturbedienung noch Rollenzuordnung. Er ist
// gleichzeitig ein vollwertiger Eintrag der ERSTEN Ebene — gleiche Höhe,
// gleiche Schriftgröße, gleiche Icongröße wie „Übersicht" und „Adressbuch".
//
// Die Einträge bleiben eingeklappt IM DOM (anders als zuvor): ohne Inhalt gibt
// es nichts zu animieren, und die weiche Öffnung ist ausdrücklich gefordert.
// Für Tastatur und Screenreader ändert das nichts — `visibility: hidden` im
// eingeklappten Zustand nimmt sie aus Fokusreihenfolge UND Accessibility-Baum;
// sichtbar wird sie erst wieder mit dem Öffnen. Ein Test misst das im echten
// Browser, statt es zu behaupten.
function SidebarGroup({ group, page, open, onToggle, onNavigate }) {
  const itemsId = `pp-nav-group-${group.id}-items`;
  // Die Hervorhebung des Kopfes folgt AUSSCHLIESSLICH dem Klappzustand, nicht
  // der Route. Vorher leuchtete „Lager & Aufträge" auch auf /stock, während die
  // Gruppe nach einem Reload zu war — die Sidebar behauptete damit einen
  // geöffneten Bereich, den es nicht gab. Es gibt jetzt genau EINE Aussage:
  // hervorgehoben ist die Gruppe, die der Nutzer selbst geöffnet hat, und
  // höchstens eine. Wo er sich innerhalb der Gruppe befindet, sagt weiterhin
  // der aktive Eintrag (.nitem.on) — sichtbar, sobald die Gruppe offen ist.
  return (
    <div className={"pp-nav-group" + (open ? " pp-nav-group--open" : "")}>
      <button
        type="button"
        className="pp-nav-group-head"
        aria-expanded={open}
        aria-controls={itemsId}
        onClick={onToggle}
      >
        <Icon n={group.icon} s={18} />
        <span className="pp-nav-group-label">{group.label}</span>
        <span className="pp-nav-group-chevron" aria-hidden="true"><Icon n="chevron" s={18} /></span>
      </button>
      {/* Zwei Ebenen mit je einer Aufgabe: der Panel-Container animiert seine
          Rasterspur von 0fr auf 1fr (robust, ohne die bekannte
          height:auto-Falle), das innere Element kappt den Überstand und trägt
          das dezente Ein-/Ausblenden. */}
      <div className="pp-nav-group-panel">
        <div id={itemsId} className="pp-nav-group-items">
          {group.items.map((item) => (
            <NavItem key={item.id} item={item} page={page} onNavigate={onNavigate} />
          ))}
        </div>
      </div>
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

  // EIN Wert für den gesamten Klappzustand: null oder die id genau einer
  // Gruppe. Damit ist „höchstens eine Gruppe offen" keine Regel, die irgendwo
  // durchgesetzt werden müsste, sondern eine Eigenschaft des Datentyps — drei
  // Booleans könnten einen ungültigen Zustand überhaupt erst darstellen.
  //
  // Startwert ist der Modulwert, also nach einem Reload zwingend null: die
  // Sidebar öffnet NICHTS von selbst, auch nicht die Gruppe des aktuellen
  // Bereichs. Der geschlossene Zustand ist der Normalfall.
  const [openGroup, setOpenGroupState] = useState(sitzungsOffeneGruppe);

  const setOpenGroup = (naechste) => setOpenGroupState((aktuell) => {
    const wert = typeof naechste === "function" ? naechste(aktuell) : naechste;
    sitzungsOffeneGruppe = wert;
    return wert;
  });

  // Ein Klick auf die offene Gruppe schließt sie (dann ist keine offen), ein
  // Klick auf eine andere schließt die bisherige und öffnet die neue.
  const toggleGroup = (id) => setOpenGroup((aktuell) => (aktuell === id ? null : id));

  // Aus dem page-Wert wird KEIN Gruppenzustand mehr abgeleitet — weder der
  // Klappzustand noch die Hervorhebung. Der page-Wert markiert ausschließlich
  // den einzelnen aktiven Eintrag (siehe NavItem).

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
                open={openGroup === "shipping"}
                onToggle={() => toggleGroup("shipping")}
                onNavigate={handleNav}
              />

              <NavItem item={ADDRESSBOOK_ITEM} page={page} onNavigate={handleNav} />
              <NavItem item={INVOICES_ITEM} page={page} onNavigate={handleNav} />

              <SidebarGroup
                group={gruppe("warehouse")}
                page={page}
                open={openGroup === "warehouse"}
                onToggle={() => toggleGroup("warehouse")}
                onNavigate={handleNav}
              />

              <SidebarGroup
                group={gruppe("account")}
                page={page}
                open={openGroup === "account"}
                onToggle={() => toggleGroup("account")}
                onNavigate={handleNav}
              />

              {/* Sitzungsaktion optisch von der Inhaltsnavigation trennen — die
                  einzige verbliebene Linie der Navigation. „Abmelden" ist eine
                  Aktion, kein Produktbereich: es trägt deshalb bewusst NICHT
                  das Gewicht der ersten Ebene. Funktional unverändert. */}
              <div className="pp-nav-utility-divider" aria-hidden="true" />
              <button type="button" className="nitem nitem--utility" onClick={handleLogout}>
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
