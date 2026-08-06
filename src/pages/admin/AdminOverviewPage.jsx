import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../../components/ui/Icon";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState } from "../../components/ui/StateView";
import {
  ADMIN_METRICS, adminMetricViews, allMetricsUnavailable, selectListTotal,
} from "../../utils/adminOverview.mjs";
import {
  listAdminUsers, listAdminInvoices, listAdminCancellationRequests,
  listAdminSupportRequests,
} from "../../api/adminApi";

// ── Adminübersicht ───────────────────────────────────────────────────────────
// Eine Arbeitsfläche, keine reine Linkliste mehr: oben die offenen Vorgänge,
// darunter der Schnellzugriff auf die Bereiche.
//
// Datenherkunft (Paket E, Teil 2): AUSSCHLIESSLICH die bereits vorhandenen
// Listen-Endpunkte, abgefragt mit pageSize 1. Gelesen wird nur der Gesamtzähler
// aus der Pagination — die Zeilen selbst werden verworfen. Es gibt keinen neuen
// Endpunkt, keine neue Query und keine hochgerechnete Zahl: liefert das Backend
// keinen Zähler, sagt die Karte das ausdrücklich.
//
// Nicht enthalten und bewusst zurückgestellt: „offene Freischaltungen".
// GET /admin/users kennt keinen Statusfilter (siehe adminOverview.mjs).

// Ein Endpunkt je Kennzahl — dieselben Wrapper, die auch die Listenseiten nutzen.
const LOADERS = {
  customers: (p) => listAdminUsers(p),
  invoicesOpen: (p) => listAdminInvoices(p),
  invoicesOverdue: (p) => listAdminInvoices(p),
  cancellations: (p) => listAdminCancellationRequests(p),
  support: (p) => listAdminSupportRequests(p),
};

const METRICS_ERROR = "Die Kennzahlen konnten nicht geladen werden.";

const BEREICHE = [
  { to: "/admin/users", icon: "admin", title: "Kunden",
    desc: "Konten prüfen, freischalten, sperren und Aufschläge pflegen." },
  { to: "/admin/shipments", icon: "package", title: "Sendungen",
    desc: "Sendungen einsehen, Label und Tracking prüfen." },
  { to: "/admin/invoices", icon: "invoice", title: "Rechnungen",
    desc: "Forderungen, Zahlungsstatus und Rechnungsdokumente." },
  { to: "/admin/invoices/backfill", icon: "shieldCheck", title: "Produktion & Backfill",
    desc: "Produktionsbereitschaft prüfen und fehlende Dokumente erzeugen." },
  { to: "/admin/cancellation-requests", icon: "ban", title: "Stornierungsanfragen",
    desc: "Kundenwünsche prüfen und intern bearbeiten." },
  { to: "/admin/support-requests", icon: "mail", title: "Supportanfragen",
    desc: "Vorgänge beantworten, Status und interne Vermerke pflegen." },
  { to: "/admin/audit-logs", icon: "shieldCheck", title: "Audit-Logs",
    desc: "Protokollierte Administrationsvorgänge einsehen und filtern." },
];

function MetricCard({ view }) {
  const klassen = ["adm-metric", view.actionable ? "adm-metric--actionable" : ""]
    .filter(Boolean).join(" ");
  return (
    <li>
      <Link to={view.to} className={`ce-card-interactive ${klassen}`} aria-label={`${view.label} — ${view.linkLabel}`}>
        <span className="adm-metric-head">
          <span className="adm-metric-ic" aria-hidden="true"><Icon n={view.icon} s={18} /></span>
          <span className="adm-metric-label">{view.label}</span>
        </span>
        <span className="adm-metric-value" aria-live="off">{view.display}</span>
        <span className="adm-metric-hint">
          {view.state === "unavailable" ? view.unavailableText : view.hint}
        </span>
      </Link>
    </li>
  );
}

export default function AdminOverviewPage() {
  // key → { total, loading }. Ein bereits geladener Wert bleibt bei einem
  // späteren Fehler stehen (dieselbe Regel wie im Benachrichtigungspanel).
  const [entries, setEntries] = useState(() =>
    Object.fromEntries(ADMIN_METRICS.map((m) => [m.key, { total: null, loading: true }])));
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const load = useCallback(async () => {
    setError("");
    setEntries((prev) => Object.fromEntries(
      ADMIN_METRICS.map((m) => [m.key, { total: prev[m.key]?.total ?? null, loading: true }])));

    let gescheitert = 0;
    await Promise.all(ADMIN_METRICS.map(async (m) => {
      let total = null;
      try {
        // pageSize 1: die Zeilen interessieren hier nicht, nur der Zähler.
        const r = await LOADERS[m.key]({ ...m.params, page: 1, pageSize: 1 });
        if (r.ok) {
          const d = await r.json().catch(() => null);
          total = selectListTotal(d);
        } else if (r.status !== 401 && r.status !== 403) {
          // 401/403 behandelt apiFetch zentral (Logout/Redirect).
          gescheitert += 1;
        }
      } catch {
        gescheitert += 1;
      }
      if (!mountedRef.current) return;
      setEntries((prev) => ({
        ...prev,
        // Ein neuer Wert ersetzt den alten; ohne neuen Wert bleibt der alte stehen.
        [m.key]: { total: total !== null ? total : prev[m.key]?.total ?? null, loading: false },
      }));
    }));

    if (mountedRef.current && gescheitert > 0) setError(METRICS_ERROR);
  }, []);

  useEffect(() => { load(); }, [load]);

  const views = adminMetricViews(entries);
  const laedt = views.some((v) => v.state === "loading");
  const allesLeer = allMetricsUnavailable(views);

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        eyebrow="Administration"
        title="Adminbereich"
        subtitle="Offene Vorgänge auf einen Blick. Alle Bereiche sind zusätzlich serverseitig geschützt."
        actions={(
          <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={laedt}>
            <Icon n="refresh" s={14} /> Aktualisieren
          </button>
        )}
      />

      <section className="adm-section" aria-labelledby="adm-ov-vorgaenge">
        <h2 className="adm-section-title" id="adm-ov-vorgaenge">Offene Vorgänge</h2>

        {/* Der Fehler ersetzt die Zahlen nicht — er steht als schmale Zeile
            darüber. Nur wenn gar kein Wert vorliegt, füllt er die Fläche. */}
        {error && !allesLeer && (
          <div className="adm-note adm-note--warning adm-inline-error" role="alert">
            <Icon n="info" s={16} />
            <span>{error}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={load} disabled={laedt}>
              <Icon n="refresh" s={14} /> Erneut versuchen
            </button>
          </div>
        )}

        {error && allesLeer ? (
          <div className="ce-card">
            <ErrorState
              title={METRICS_ERROR}
              text="Die Bereiche unten sind davon unabhängig erreichbar."
              action={(
                <button type="button" className="btn btn-outline btn-sm" onClick={load} disabled={laedt}>
                  <Icon n="refresh" s={14} /> Erneut versuchen
                </button>
              )}
            />
          </div>
        ) : (
          <ul className="adm-metrics">
            {views.map((v) => <MetricCard key={v.key} view={v} />)}
          </ul>
        )}
      </section>

      <section className="adm-section" aria-labelledby="adm-ov-bereiche">
        <h2 className="adm-section-title" id="adm-ov-bereiche">Bereiche</h2>
        <div className="adm-tiles">
          {BEREICHE.map((b) => (
            <Link key={b.to} to={b.to} className="ce-card-interactive adm-tile">
              <span className="adm-tile-ic" aria-hidden="true"><Icon n={b.icon} s={20} /></span>
              <span className="adm-tile-body">
                <span className="adm-tile-title">{b.title}</span>
                <span className="adm-tile-desc">{b.desc}</span>
              </span>
              <span className="adm-tile-arrow" aria-hidden="true"><Icon n="chevronRight" s={18} /></span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
