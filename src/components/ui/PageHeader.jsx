import React from "react";

/* ── Gemeinsamer Seitenkopf (Paket A, Phase 3) ───────────────────────────────
   EIN Muster für beide Portale. Vorher gab es fünf: den Cormorant-Kopf der
   Dashboard-Unterseiten (DashboardSectionHeader), den eigenen Kopf des
   Adressbuchs, den der Entwürfe, den Profilkopf und den Adminkopf — jeweils
   mit eigener Struktur, eigenen Klassennamen und eigener Aktionszeile.

   Aufbau (alle Teile außer dem Titel sind optional):

     [Zurück-Link]                                (nur Adminportal)
     [Eyebrow]                    [Utility-Cluster] [Aktionen]
     Titel
     [Untertitel]
     [Meta-/Statuszeile]

   `variant="admin"` schaltet auf die funktionale Titelstufe (DM Sans Page
   Title) und die dichteren Abstände um — im Adminportal gibt es bewusst keine
   Cormorant-Schrift.

   Diese Komponente rendert ausschließlich Struktur. Sie kennt keine Daten,
   keine Navigation und keinen Zustand. */
export function PageHeader({
  title,
  subtitle,
  eyebrow,
  meta,
  actions,
  utility,
  backLink,
  variant = "customer",
  titleId,
  className = "",
}) {
  const admin = variant === "admin";
  const klassen = ["ce-page-header", admin ? "ce-page-header--admin" : "", className]
    .filter(Boolean).join(" ");

  return (
    <header className={klassen} aria-label="Seitenkopf">
      <div className="ce-page-header-text">
        {backLink}
        {eyebrow && <div className="ce-page-header-eyebrow">{eyebrow}</div>}
        <h1 className="ce-page-header-title" id={titleId}>{title}</h1>
        {subtitle && <p className="ce-page-header-sub">{subtitle}</p>}
        {meta && <div className="ce-page-header-meta">{meta}</div>}
      </div>
      {(utility || actions) && (
        <div className="ce-page-header-aside">
          {utility}
          {actions && <div className="ce-page-header-actions">{actions}</div>}
        </div>
      )}
    </header>
  );
}

/* Utility-Cluster: Glocke und Benutzerchip. Beide Elemente bringen ihre
   Maße selbst mit (40 px) — hier steht nur die Gruppierung.

   `hideOnMobile` blendet den Cluster unterhalb von 860 px aus: dort trägt die
   Topbar die Glocke, und ein zweiter Mount wäre eine doppelte Identität. */
export function UtilityCluster({ children, hideOnMobile = true }) {
  return (
    <div className={`ce-utility${hideOnMobile ? " ce-utility--hide-mobile" : ""}`}>
      {children}
    </div>
  );
}
