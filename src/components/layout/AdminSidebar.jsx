import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { AdminAnmeldungSeite } from "../../pages/authSeite";
import { accountInitials, accountDisplayName } from "../../utils/accountIdentity.mjs";
import { BrandLogo } from "../ui/BrandLogo";
import { Icon, ICON_SIZE } from "../ui/Icon";
import { useNavigationDrawer } from "../../hooks/useNavigationDrawer";

// Kennung der Adminsidebar — Ziel von aria-controls am Menüknopf der mobilen Topbar
// (AdminLayout). Darunter ist sie ein Drawer (admin.css, `@media (max-width: 900px)`).
export const ADMIN_NAV_ID = "ce-adminnavigation";
const DRAWER_BIS_PX = 900;

// Aktive Adminnavigation (URL-basiert). NavLink liefert den Active-Zustand über
// die URL — bewusst KEINE Vermischung mit dem State-basierten Kunden-Dashboard.
//
// Admin-Vereinfachung (Betreiberauftrag 2026-11-10): die drei Hauptbereiche
// Kunden, Sendungen und Rechnungen stehen direkt unter der Übersicht, darunter
// zwei benannte Gruppen. Jede Adminseite ist jetzt über die Navigation
// erreichbar — auch Sammelrechnungsanträge und Preisrechner, die vorher nur über
// Kacheln der Übersicht zu finden waren. Je Eintrag ein dekoratives Symbol der
// eigenen Icon-Komponente vor dem Text (wie die Hauptpunkte der Kunden-Sidebar,
// E7); der Name bleibt Text. Ziele und `end`-Regeln unverändert, keine Route neu.
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { to: "/admin", label: "Übersicht", icon: "dashboard", end: true },
      { to: "/admin/users", label: "Kunden", icon: "user" },
      { to: "/admin/shipments", label: "Sendungen", icon: "truck" },
      { to: "/admin/invoices", label: "Rechnungen", icon: "invoice", end: true },
    ],
  },
  {
    label: "Zu erledigen",
    items: [
      { to: "/admin/support-requests", label: "Supportanfragen", icon: "headset" },
      { to: "/admin/cancellation-requests", label: "Stornierungsanfragen", icon: "ban" },
      { to: "/admin/reconciliation", label: "Buchungsklärung", icon: "shield" },
      { to: "/admin/billing-mode-requests", label: "Sammelrechnungsanträge", icon: "layers" },
    ],
  },
  {
    label: "Vertrieb und Verwaltung",
    items: [
      // Vertriebspartnerprogramm: Anträge, Partner, Versandnachweise, Gutschriften, Einstellungen.
      { to: "/admin/partners", label: "Vertriebspartner", icon: "briefcase" },
      { to: "/admin/public-calculator", label: "Preisrechner", icon: "euro" },
      { to: "/admin/invoices/backfill", label: "Vorschau-PDFs", icon: "printer" },
      { to: "/admin/audit-logs", label: "Protokoll", icon: "clock" },
    ],
  },
];

// Bewusst noch NICHT verlinkt — folgen in späteren, separaten Schritten. Als
// deaktivierte Einträge sichtbar (Roadmap erkennbar), aber keine funktionierenden
// Links, die ins Leere führen. Aktuell leer (Rechnungen sind live).
const SOON_NAV = [];

export function AdminSidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // Abmelden aus dem Adminpanel führt auf die Admin-Anmeldung (Canonical v2.130); die Sitzung beendet logout()
  // auch serverseitig. Die Seite ist vorgeladen, damit kein Ladebildschirm dazwischen steht.
  const handleLogout = () => { AdminAnmeldungSeite.vorladen().catch(() => {}); logout(); navigate("/admin/login"); };
  const goDashboard = () => { onClose?.(); navigate("/dashboard"); };

  // Geöffneter Drawer (unter 900 px) wie ein Dialog: Fokus hinein, Tab bleibt im Drawer, Escape
  // schließt, danach Fokus zurück auf den Menüknopf; wird das Fenster breiter als die Schwelle,
  // schließt er (useNavigationDrawer). Geschlossen ist der Drawer per CSS unsichtbar und damit
  // nicht per Tab erreichbar; die feste Spalte ab 901 px bleibt unberührt.
  const drawerRef = useNavigationDrawer({ open, onClose, drawerMaxPx: DRAWER_BIS_PX });

  return (
    <>
      {open && <div className="adm-side-overlay" onClick={onClose} aria-hidden="true" />}
      <aside
        ref={drawerRef}
        id={ADMIN_NAV_ID}
        className={`adm-side${open ? " adm-side-open" : ""}`}
        aria-label="Adminbereich Seitenleiste"
      >
        <div className="adm-brand">
          {/* Dieselbe Marke aus demselben Bauteil wie im Kundenportal — die
              Originalkomposition, auf der hellen Admin-Sidebar in der
              Standardfassung. Kein eigenes Adminlogo: „Adminbereich" ist
              separater UI-Text und nicht Bestandteil der Marke; deshalb gibt der
              Aufrufer ihn mit. Er macht den Adminkontext auf jeder Seite sichtbar. */}
          <BrandLogo
            variant="lockup"
            tone="standard"
            sub={<span className="adm-brand-tag">Adminbereich</span>}
          />
          <button type="button" className="adm-side-close" onClick={onClose} aria-label="Menü schließen">
            Schließen
          </button>
        </div>

        <nav className="adm-nav" aria-label="Adminnavigation">
          {NAV_GROUPS.map((group, i) => {
            const eintraege = group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) => `adm-nitem${isActive ? " adm-nitem-on" : ""}`}
              >
                <span className="adm-nitem-icon" aria-hidden="true"><Icon n={item.icon} s={ICON_SIZE.md} /></span>
                <span>{item.label}</span>
              </NavLink>
            ));
            if (!group.label) return <React.Fragment key="start">{eintraege}</React.Fragment>;
            // Gruppenüberschrift als Text; die Gruppe ist für Screenreader benannt.
            const id = `adm-nsec-${i}`;
            return (
              <div key={id} className="adm-ngroup" role="group" aria-labelledby={id}>
                <div className="adm-nsec" id={id}>{group.label}</div>
                {eintraege}
              </div>
            );
          })}

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
                  <span>{item.label}</span>
                  <span className="adm-soon-badge">bald</span>
                </button>
              ))}
            </>
          )}
        </nav>

        {/* Zwei Textaktionen: der Bereichswechsel ist die häufigere und trägt
            deshalb die Markenfarbe; „Abmelden" bleibt neutral. Seit der
            Admin-Vereinfachung (2026-11-10) steht die Identität des angemeldeten
            Admins hier unten neben „Abmelden" statt über der Navigation — die
            Navigation bekommt den Platz für alle Bereiche. Eine Initialenquelle
            für das ganze Produkt (Paket D). */}
        <div className="adm-side-foot">
          <div className="adm-identity">
            <span className="adm-identity-avatar" aria-hidden="true">{accountInitials(user)}</span>
            <div className="adm-identity-text">
              <span className="adm-identity-name" title={accountDisplayName(user, "Administrator")}>{accountDisplayName(user, "Administrator")}</span>
              <span className="sr-only">, Administrator</span>
            </div>
          </div>
          <button type="button" className="adm-foot-btn adm-foot-btn-switch" onClick={goDashboard}>
            <span>Zum Kundenbereich</span>
          </button>
          <button type="button" className="adm-foot-btn" onClick={handleLogout}>
            <span>Abmelden</span>
          </button>
        </div>
      </aside>
    </>
  );
}
