import React from "react";

/* ── Gemeinsamer Seitenkopf ──────────────────────────────────────────────────
   EIN Muster für Kundenportal, Adminbereich und die Lagerdetailseiten.

   Aufbau (Redesign 2026-10; alle Teile außer dem Titel sind optional):

                                        [Utility: Mitteilungen · Konto]
     [Zurück-Link]
     Titel                                              [Aktionen]
     [Untertitel]
     [Meta-/Statuszeile]

   • Der Titel ist überall dieselbe Rolle: DM Sans 28/36, mobil 24/32 — keine
     Serifenschrift, keine zweite Titelhierarchie, keine Versal-Eyebrow mehr.
     Eine übergebene `eyebrow` wird deshalb nicht mehr dargestellt; die
     Bereichszugehörigkeit zeigt die Navigation.
   • Die Utility-Aktionen (Mitteilungen, Konto) stehen in einer eigenen,
     leisen Zeile ÜBER dem Titel. Vorher teilten sie sich die Zeile mit der
     Seitenaktion und erzwangen schon auf Desktop einen ungleichmäßigen
     Umbruch (Auditbefund E08).
   • Höchstens EINE dominante Seitenaktion. Reicht der Platz nicht, bricht die
     Aktionsgruppe kontrolliert in eine eigene Zeile unter den Titel.

   `variant="admin"` schaltet auf die dichteren Abstände des Adminbereichs —
   die Titelrolle ist dieselbe.

   Diese Komponente rendert ausschließlich Struktur. Sie kennt keine Daten,
   keine Navigation und keinen Zustand. */
export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  utility,
  backLink,
  variant = "customer",
  titleId,
  className = "",
}) {
  const admin = variant === "admin";
  const klassen = [
    "ce-page-header",
    admin ? "ce-page-header--admin" : "",
    utility ? "ce-page-header--utility" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <header className={klassen} aria-label="Seitenkopf">
      {utility && <div className="ce-page-header-utility">{utility}</div>}
      <div className="ce-page-header-main">
        <div className="ce-page-header-text">
          {backLink}
          <h1 className="ce-page-header-title" id={titleId}>{title}</h1>
          {subtitle && <p className="ce-page-header-sub">{subtitle}</p>}
          {meta && <div className="ce-page-header-meta">{meta}</div>}
        </div>
        {actions && <div className="ce-page-header-actions">{actions}</div>}
      </div>
    </header>
  );
}

/* Utility-Cluster: Mitteilungen und Benutzerchip. Beide Elemente bringen ihre
   Maße selbst mit — hier steht nur die Gruppierung.

   `hideOnMobile` blendet den Cluster unterhalb von 860 px aus: dort trägt die
   Topbar „Mitteilungen", und ein zweiter Mount wäre eine doppelte Identität. */
export function UtilityCluster({ children, hideOnMobile = true }) {
  return (
    <div className={`ce-utility${hideOnMobile ? " ce-utility--hide-mobile" : ""}`}>
      {children}
    </div>
  );
}
