import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { metricsFailureKind, selectListTotal } from "../../utils/adminOverview.mjs";
import {
  getAdminCustomerAccountCount, listAdminInvoices, listAdminCancellationRequests,
  listAdminSupportRequests, getAdminOperationsQueues,
  listAdminSalesPartners, listAdminDispatchEvidenceQueue,
} from "../../api/adminApi";
import {
  OPERATIONS_START_UNKNOWN, OPERATIONS_UNAVAILABLE, oldestDescription,
} from "../../utils/adminOperations.mjs";
import {
  ADMIN_COUNTS, TODO_TEXTS, adminDiagnosticViews, adminFigureViews, adminTodoViews,
  diagnosticsSummary, groupAdminTodo, overviewWithoutValues,
} from "../../utils/adminTodo.mjs";

// ── Adminübersicht ───────────────────────────────────────────────────────────
// Oben „Zu erledigen" (UX-Paket 2): EINE Liste aller offenen Vorgänge, jeder mit
// dem direkten Weg zur Bearbeitung. Darunter die ruhigen Kennzahlen (Bestand),
// die Bereiche und — eingeklappt — die technischen Diagnosen.
//
// Datenherkunft: AUSSCHLIESSLICH Serverzähler. Listenzähler über die
// Listen-Endpunkte mit pageSize 1 (nur der Gesamtzähler zählt, die Zeilen
// werden verworfen), die Betriebs-Queues und — für „Kunden" — der eigene
// Zähler GET /admin/metrics/customer-accounts (nur echte Kundenkonten; das
// total der Kundenliste enthält auch Admin- und Altkonten). Keine
// hochgerechnete Zahl; ohne Zähler steht „nicht
// verfügbar" da, nie eine 0. Was bewusst fehlt (keine Serverquelle): offene
// Freischaltungen von Kunden, Abrechnungsdaten zur Prüfung, offene Auszahlungen.

// Ein Endpunkt je Zähler — dieselben Wrapper, die auch die Listenseiten nutzen.
const LOADERS = {
  customers: () => getAdminCustomerAccountCount(),
  invoicesOpen: (p) => listAdminInvoices(p),
  invoicesOverdue: (p) => listAdminInvoices(p),
  cancellations: (p) => listAdminCancellationRequests(p),
  support: (p) => listAdminSupportRequests(p),
  partnerApplications: (p) => listAdminSalesPartners(p),
  dispatchEvidence: (p) => listAdminDispatchEvidenceQueue(p),
};

const BEREICHE = [
  { to: "/admin/users", title: "Kunden",
    desc: "Konten prüfen, freischalten, sperren und Aufschläge pflegen." },
  { to: "/admin/partners", title: "Vertriebspartner",
    desc: "Anträge prüfen, Partner, Versandnachweise und Gutschriften verwalten." },
  { to: "/admin/shipments", title: "Sendungen",
    desc: "Sendungen einsehen, Label und Tracking prüfen." },
  { to: "/admin/invoices", title: "Rechnungen",
    desc: "Forderungen, Zahlungsstatus und Rechnungsdokumente." },
  { to: "/admin/support-requests", title: "Supportanfragen",
    desc: "Anfragen beantworten, Status und interne Vermerke pflegen." },
  { to: "/admin/cancellation-requests", title: "Stornierungsanfragen",
    desc: "Kundenwünsche prüfen und intern bearbeiten." },
  { to: "/admin/reconciliation", title: "Buchungsklärung",
    desc: "Ungeklärte Buchungsvorgänge prüfen und entscheiden." },
  { to: "/admin/invoices/backfill", title: "Interne Vorschau-PDFs",
    desc: "Produktionsbereitschaft prüfen und fehlende Rechnungs-PDFs als Vorschau erzeugen." },
  { to: "/admin/audit-logs", title: "Protokoll",
    desc: "Protokollierte Adminvorgänge einsehen und filtern." },
];

// Herkunft für die Detailseiten: „Zurück" führt wieder hierher.
const VON_HIER = { from: "/admin" };

// Eine ruhige Kennzahl (Bestand) — Beschriftung, Zahl, Kontextzeile.
// R9 (WCAG 2.5.3): kein aria-label mehr — es ersetzte den sichtbaren WERT, ein Screenreader las
// „Kunden — Zur Kundenliste“ ohne die Zahl. Der Name entsteht jetzt aus dem sichtbaren Inhalt;
// das Linkziel ergänzt ein nur vorgelesener Zusatz.
function MetricCard({ view }) {
  return (
    <li>
      <Link to={view.to} className="adm-metric">
        <span className="adm-metric-label">{view.label}</span>
        <span className="adm-metric-row">
          <span className="adm-metric-value" aria-live="off">{view.display}</span>
        </span>
        <span className="adm-metric-hint">
          {view.state === "unavailable" ? view.unavailableText : view.hint}
        </span>
        <span className="sr-only"> — {view.linkLabel}</span>
      </Link>
    </li>
  );
}

function fmtDateTime(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("de-DE", { year: "numeric", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Eine Aufgabe bzw. Diagnose. Queues tragen ihren Schlüssel als `data-queue`
// und — wie bisher — den ältesten Fall; Listenzähler (`data-task`) führen zur
// gefilterten Liste. Eine Diagnose ist nie eine Handlungsaufforderung.
function TaskCard({ view, loading }) {
  const queue = view.source === "queue";
  // Ein Listenzähler kann den ältesten Fall aus der Queue derselben Menge tragen.
  const oldest = queue ? oldestDescription(view)
    : view.oldestTo && view.oldestAt ? { kind: "date", at: view.oldestAt } : { kind: "none" };
  const klassen = ["ce-card", "adm-ops-item", view.tone === "diagnostic" ? "adm-ops-item--diagnostic" : ""]
    .filter(Boolean).join(" ");
  const daten = queue ? { "data-queue": view.key } : { "data-task": view.key };
  return (
    <li className={klassen} {...daten}>
      <span className="adm-ops-label">{view.label}</span>
      <span className="adm-ops-row">
        <span className="adm-ops-count" aria-live="off">{loading ? "…" : view.display}</span>
      </span>
      <span className="adm-ops-hint">{!loading && view.state === "unavailable" ? OPERATIONS_UNAVAILABLE : view.hint}</span>
      {oldest.kind === "date" && <span className="adm-ops-oldest">Ältester Fall: {fmtDateTime(oldest.at)}</span>}
      {oldest.kind === "unknown_start" && <span className="adm-ops-oldest">{OPERATIONS_START_UNKNOWN}</span>}
      {queue ? (
        (view.oldestTo || view.listTo) && (
          <span className="adm-ops-links">
            {view.oldestTo && <Link to={view.oldestTo} state={VON_HIER}>Ältesten Fall öffnen</Link>}
            {view.listTo && <Link to={view.listTo}>Zur Liste</Link>}
          </span>
        )
      ) : (
        <span className="adm-ops-links">
          <Link to={view.to}>{view.linkLabel}</Link>
          {view.oldestTo && <Link to={view.oldestTo} state={VON_HIER}>Ältesten Fall öffnen</Link>}
        </span>
      )}
    </li>
  );
}

// Eine Zeile „Name · Name …" — mit Weg zur Liste, wo es einen gibt.
function TaskNames({ views, withLinks = false }) {
  return views.map((v, i) => (
    <React.Fragment key={v.key}>
      {i > 0 && " · "}
      {withLinks && v.to ? <Link to={v.to}>{v.label}</Link> : v.label}
    </React.Fragment>
  ));
}

export default function AdminOverviewPage() {
  // key → { total, loading }. Ein bereits geladener Wert bleibt bei einem
  // späteren Fehler stehen (dieselbe Regel wie im Benachrichtigungspanel).
  const [entries, setEntries] = useState(() =>
    Object.fromEntries(ADMIN_COUNTS.map((m) => [m.key, { total: null, loading: true }])));
  const [counts, setCounts] = useState({ succeeded: 0, failed: 0 });
  const [ops, setOps] = useState({ loading: true, failed: false, data: null });
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const loadCounts = useCallback(async () => {
    setEntries((prev) => Object.fromEntries(
      ADMIN_COUNTS.map((m) => [m.key, { total: prev[m.key]?.total ?? null, loading: true }])));

    let erfolgreich = 0;
    let gescheitert = 0;
    await Promise.all(ADMIN_COUNTS.map(async (m) => {
      let total = null;
      try {
        // pageSize 1: die Zeilen interessieren hier nicht, nur der Zähler.
        const r = await LOADERS[m.key]({ ...m.params, page: 1, pageSize: 1 });
        if (r.ok) {
          const d = await r.json().catch(() => null);
          total = selectListTotal(d);
          erfolgreich += 1;
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
    if (mountedRef.current) setCounts({ succeeded: erfolgreich, failed: gescheitert });
  }, []);

  // Betriebs-Queues (Package C): ein eigener Abruf. Ein bereits geladener Stand
  // bleibt bei einem Fehler stehen.
  const loadOps = useCallback(async () => {
    setOps((prev) => ({ ...prev, loading: true }));
    try {
      const r = await getAdminOperationsQueues();
      if (!mountedRef.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        setOps((prev) => ({ loading: false, failed: true, data: prev.data }));
        return;
      }
      const d = await r.json().catch(() => null);
      if (!mountedRef.current) return;
      setOps({ loading: false, failed: false, data: d });
    } catch {
      if (mountedRef.current) setOps((prev) => ({ loading: false, failed: true, data: prev.data }));
    }
  }, []);

  const loadAll = useCallback(() => { loadCounts(); loadOps(); }, [loadCounts, loadOps]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const opsErstesLaden = ops.loading && !ops.data;
  const todo = adminTodoViews({ entries, ops: ops.data, opsLoading: opsErstesLaden });
  const gruppen = groupAdminTodo(todo);
  const figures = adminFigureViews(entries);
  const diagnosen = adminDiagnosticViews({ ops: ops.data, opsLoading: opsErstesLaden });

  const laedt = ops.loading || Object.values(entries).some((e) => e.loading);
  const erstesLaden = gruppen.loading.length === todo.length;
  // Fehlerart über alle Abrufe: Listenzähler und Queues zusammen.
  const fehlerart = metricsFailureKind(
    counts.succeeded + (!ops.loading && !ops.failed ? 1 : 0),
    counts.failed + (ops.failed ? 1 : 0),
  );
  const ohneWerte = !laedt && overviewWithoutValues(todo, figures);

  return (
    <div className="adm-page">
      <PageHeader
        variant="admin"
        title="Übersicht"
        actions={(
          <button type="button" className="btn btn-outline btn-sm" onClick={loadAll} disabled={laedt}>
            Aktualisieren
          </button>
        )}
      />

      {/* Der Fehler ersetzt die Zahlen nicht — er steht als schmale Zeile darüber.
          Nur wenn gar kein Wert vorliegt, füllt er die Fläche. */}
      {fehlerart !== "none" && !ohneWerte && (
        <div className="adm-note adm-note--warning adm-inline-error" role="alert">
          <span>{TODO_TEXTS.partialError}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadAll} disabled={laedt}>
            Erneut versuchen
          </button>
        </div>
      )}

      {fehlerart !== "none" && ohneWerte ? (
        <div className="ce-card">
          <ErrorState
            title={TODO_TEXTS.fullError}
            text={TODO_TEXTS.fullErrorText}
            action={(
              <button type="button" className="btn btn-outline btn-sm" onClick={loadAll} disabled={laedt}>
                Erneut versuchen
              </button>
            )}
          />
        </div>
      ) : (
        <>
          <section className="adm-section" aria-labelledby="adm-ov-todo" id="adm-todo">
            <h2 className="adm-section-title" id="adm-ov-todo">{TODO_TEXTS.title}</h2>
            {erstesLaden ? (
              <div className="ce-card"><ListSkeleton rows={3} label="Offene Vorgänge werden geladen …" /></div>
            ) : (
              <>
                {gruppen.open.length > 0 && (
                  <ul className="adm-ops adm-todo" aria-label="Offene Vorgänge">
                    {gruppen.open.map((v) => <TaskCard key={v.key} view={v} />)}
                  </ul>
                )}
                {gruppen.open.length === 0 && gruppen.unavailable.length === 0 && gruppen.loading.length === 0 && (
                  <p className="ce-card adm-todo-empty" id="adm-todo-empty">{TODO_TEXTS.empty}</p>
                )}
                {gruppen.unavailable.length > 0 && (
                  <p className="adm-todo-line adm-todo-unavailable" id="adm-todo-unavailable">
                    <span className="adm-todo-line-label">{TODO_TEXTS.unavailable}</span>{" "}
                    <TaskNames views={gruppen.unavailable} withLinks />
                  </p>
                )}
                {gruppen.loading.length > 0 && (
                  <p className="adm-todo-line" id="adm-todo-loading">
                    <span className="adm-todo-line-label">{TODO_TEXTS.loading}</span>{" "}
                    <TaskNames views={gruppen.loading} />
                  </p>
                )}
                {gruppen.done.length > 0 && (
                  <p className="adm-todo-line adm-todo-done" id="adm-todo-done">
                    <span className="adm-todo-line-label">{TODO_TEXTS.done}</span>{" "}
                    <TaskNames views={gruppen.done} />
                  </p>
                )}
              </>
            )}
          </section>

          <section className="adm-section" aria-labelledby="adm-ov-kennzahlen">
            <h2 className="adm-section-title" id="adm-ov-kennzahlen">Kennzahlen</h2>
            <ul className="adm-metrics">
              {figures.map((v) => <MetricCard key={v.key} view={v} />)}
            </ul>
          </section>
        </>
      )}

      {/* Sekundäre Bereichslinks: eine ruhige Textliste — dieselben Ziele stehen
          in der Navigation; hier ergänzen sie nur die kurze Beschreibung. */}
      <section className="adm-section" aria-labelledby="adm-ov-bereiche">
        <h2 className="adm-section-title" id="adm-ov-bereiche">Bereiche</h2>
        <ul className="adm-tiles">
          {BEREICHE.map((b) => (
            <li key={b.to}>
              <Link to={b.to} className="adm-tile">
                <span className="adm-tile-title">{b.title}</span>
                <span className="adm-tile-desc">{b.desc}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {/* Diagnosen (Package C): nie automatisch aktionsfähig — eingeklappt, die
          Kurzfassung nennt trotzdem, ob es Fälle gibt. */}
      <details className="adm-section adm-diag" id="adm-diag">
        <summary className="adm-diag-summary">
          Technische Hinweise <span className="adm-diag-count">· {diagnosticsSummary(diagnosen)}</span>
        </summary>
        <p className="adm-diag-note">{TODO_TEXTS.diagnosticsNote}</p>
        <ul className="adm-ops" aria-label="Diagnosen">
          {diagnosen.map((v) => <TaskCard key={v.key} view={v} loading={v.state === "loading"} />)}
        </ul>
      </details>
    </div>
  );
}
