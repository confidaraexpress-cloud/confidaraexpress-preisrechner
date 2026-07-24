import React from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";

// Einfache Admin-Landing. Bewusst KEINE (Fake-)KPIs — Backend-Statistiken gibt
// es in diesem Schritt noch nicht. Nur der aktive Bereich (Audit-Logs) ist
// verlinkt; kommende Bereiche sind sichtbare, aber inaktive Platzhalter.
export default function AdminOverviewPage() {
  return (
    <div className="adm-page">
      <header className="adm-page-head">
        <h1 className="adm-title">Adminbereich</h1>
        <p className="adm-sub">
          Zentrale Verwaltung für ConfidaraExpress. Dieser Bereich ist ausschließlich
          für Administrator:innen zugänglich und zusätzlich serverseitig geschützt.
        </p>
      </header>

      <div className="adm-tiles">
        <Link to="/admin/users" className="adm-tile">
          <span className="adm-tile-ic"><Icon n="admin" s={22} /></span>
          <span className="adm-tile-body">
            <span className="adm-tile-title">Kunden</span>
            <span className="adm-tile-desc">Read-only Kundenliste mit Status (Freischaltung folgt).</span>
          </span>
          <span className="adm-tile-arrow" aria-hidden="true"><Icon n="chevronRight" s={18} /></span>
        </Link>

        <Link to="/admin/shipments" className="adm-tile">
          <span className="adm-tile-ic"><Icon n="package" s={22} /></span>
          <span className="adm-tile-body">
            <span className="adm-tile-title">Sendungen</span>
            <span className="adm-tile-desc">PII-arme Sendungsliste mit Filtern (read-only).</span>
          </span>
          <span className="adm-tile-arrow" aria-hidden="true"><Icon n="chevronRight" s={18} /></span>
        </Link>

        <Link to="/admin/invoices" className="adm-tile">
          <span className="adm-tile-ic"><Icon n="invoice" s={22} /></span>
          <span className="adm-tile-body">
            <span className="adm-tile-title">Rechnungen</span>
            <span className="adm-tile-desc">Read-only Rechnungsübersicht mit Zahlungsstatus und Filtern.</span>
          </span>
          <span className="adm-tile-arrow" aria-hidden="true"><Icon n="chevronRight" s={18} /></span>
        </Link>

        <Link to="/admin/invoices/backfill" className="adm-tile">
          <span className="adm-tile-ic"><Icon n="shieldCheck" s={22} /></span>
          <span className="adm-tile-body">
            <span className="adm-tile-title">Produktion &amp; Backfill</span>
            <span className="adm-tile-desc">Produktionsbereitschaft prüfen und Alt-Rechnungen rückwirkend produktiv erzeugen.</span>
          </span>
          <span className="adm-tile-arrow" aria-hidden="true"><Icon n="chevronRight" s={18} /></span>
        </Link>

        <Link to="/admin/cancellation-requests" className="adm-tile">
          <span className="adm-tile-ic"><Icon n="ban" s={22} /></span>
          <span className="adm-tile-body">
            <span className="adm-tile-title">Stornierungsanfragen</span>
            <span className="adm-tile-desc">Offene Anfragen prüfen und bearbeiten (interner Vorgang).</span>
          </span>
          <span className="adm-tile-arrow" aria-hidden="true"><Icon n="chevronRight" s={18} /></span>
        </Link>

        <Link to="/admin/audit-logs" className="adm-tile">
          <span className="adm-tile-ic"><Icon n="shieldCheck" s={22} /></span>
          <span className="adm-tile-body">
            <span className="adm-tile-title">Audit-Logs</span>
            <span className="adm-tile-desc">Protokollierte Administrationsvorgänge einsehen und filtern.</span>
          </span>
          <span className="adm-tile-arrow" aria-hidden="true"><Icon n="chevronRight" s={18} /></span>
        </Link>
      </div>

      <p className="adm-foot-note">Weitere Bereiche folgen in den nächsten Schritten.</p>
    </div>
  );
}
