import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { accountInitials, accountDisplayName } from "../../utils/accountIdentity.mjs";
import { BrandLogo } from "../ui/BrandLogo";

// Aktive Adminnavigation (URL-basiert). NavLink liefert den Active-Zustand über
// die URL — bewusst KEINE Vermischung mit dem State-basierten Kunden-Dashboard.
// Seit dem Redesign (2026-10) reine Textnavigation: keine Symbole vor den
// Einträgen.
//
// UX-Paket 2: dieselben Ziele und `end`-Regeln, nach Aufgaben gruppiert. Zwei
// Einträge heißen jetzt wie ihre Seite statt technisch („Produktion &
// Backfill" → „Interne Vorschau-PDFs", „Audit-Logs" → „Protokoll").
const NAV_GROUPS = [
  { label: null, items: [{ to: "/admin", label: "Übersicht", end: true }] },
  {
    label: "Kunden und Partner",
    items: [
      { to: "/admin/users", label: "Kunden" },
      // Vertriebspartnerprogramm: Anträge, Partner, Versandnachweise, Gutschriften, Einstellungen.
      { to: "/admin/partners", label: "Vertriebspartner" },
    ],
  },
  {
    label: "Versand und Rechnungen",
    items: [
      { to: "/admin/shipments", label: "Sendungen" },
      { to: "/admin/invoices", label: "Rechnungen", end: true },
    ],
  },
  {
    label: "Support und Bearbeitung",
    items: [
      { to: "/admin/support-requests", label: "Supportanfragen" },
      { to: "/admin/cancellation-requests", label: "Stornierungsanfragen" },
      { to: "/admin/reconciliation", label: "Buchungsklärung" },
    ],
  },
  {
    label: "Verwaltung und Protokoll",
    items: [
      { to: "/admin/invoices/backfill", label: "Interne Vorschau-PDFs" },
      { to: "/admin/audit-logs", label: "Protokoll" },
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

  const handleLogout = () => { logout(); navigate("/login"); };
  const goDashboard = () => { onClose?.(); navigate("/dashboard"); };

  return (
    <>
      {open && <div className="adm-side-overlay" onClick={onClose} aria-hidden="true" />}
      <aside className={`adm-side${open ? " adm-side-open" : ""}`} aria-label="Adminbereich Seitenleiste">
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

        {/* Eine Initialenquelle für das ganze Produkt (Paket D): Sidebar,
            Benutzerchip, Profilhero — und auch der Adminbereich. */}
        <div className="adm-identity">
          <span className="adm-identity-avatar" aria-hidden="true">{accountInitials(user)}</span>
          <div className="adm-identity-text">
            <span className="adm-identity-name">{accountDisplayName(user, "Administrator")}</span>
            <span className="adm-identity-role">Administrator</span>
          </div>
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
            deshalb die Markenfarbe; „Abmelden" bleibt neutral. */}
        <div className="adm-side-foot">
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
