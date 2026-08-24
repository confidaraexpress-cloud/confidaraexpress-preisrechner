import React from "react";
import { Icon } from "../ui/Icon";
import { StatusBadge } from "../ui/StatusBadge";
import { EmptyState } from "../ui/StateView";
import { money, dateDE } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { customerShipmentNumbers, NO_ORDER_CONFIRMATION_TEXT } from "../../utils/businessNumbers.mjs";
import { notificationSubline, relativeTime } from "../../utils/notificationsView.mjs";
import { recentShipments, overviewInvoiceFacts, topNotifications } from "../../utils/overviewModules.mjs";

/* ═══════════════════════════════════════════════════════════════════════════
   OPERATIVE ÜBERSICHTSMODULE (Paket D, Teil 1)
   ───────────────────────────────────────────────────────────────────────────
   Drei Module über den bereits vorhandenen Daten der Dashboardseite:
   letzte Sendungen, offene Rechnungen, Benachrichtigungen. Die frühere
   Schnellaktionen-Sektion ist ersatzlos entfernt — ihre fünf Ziele sind
   bereits über die permanente Sidebar erreichbar, eine zweite Verlinkung war
   redundant.

   Kein Modul lädt selbst Daten, keines kennt eine Route, keines rechnet einen
   Geschäftswert nach. Alles kommt als Prop herein; Sortierung und Auswahl
   liefert utils/overviewModules.mjs (rein und getestet).

   Material ausschließlich aus der Foundation: .ce-card, .ce-card-interactive,
   .badge, .btn, Icon.jsx, StateView. Keine eigene Farbwelt, keine eigenen
   Radien oder Schatten.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Gemeinsamer Modulkopf: Titel links, genau eine optionale Textaktion rechts. */
function ModuleHead({ title, actionLabel, onAction }) {
  return (
    <div className="ov-mod-head">
      <h2 className="ov-mod-title">{title}</h2>
      {actionLabel && onAction && (
        <button type="button" className="btn btn-link btn-sm" onClick={onAction}>
          <span>{actionLabel}</span> <Icon n="chevronRight" s={14} />
        </button>
      )}
    </div>
  );
}

/* ── Letzte Sendungen ───────────────────────────────────────────────────────
   Kompakte Auswahl, KEINE zweite Sendungsliste: keine Pagination, keine Suche,
   kein Filter, keine eigene Abfrage. Gezeigt werden ausschließlich Felder, die
   die bestehende Sendungsantwort bereits enthält.

   Bewusst OHNE Empfänger-/Zielspalte: die Kundenantwort /kunde/shipments führt
   keine Empfängerdaten (die Sendungsliste selbst zeigt dort ebenfalls keine).
   Ein Zielwert würde hier erfunden — siehe Abschlussbericht, zurückgestellte
   Module. */
export function RecentShipments({ shipments, loading, onAll, onOpen }) {
  const rows = recentShipments(shipments, 4);
  return (
    <section className="ov-mod" aria-labelledby="ov-ship-title">
      <ModuleHead
        title={<span id="ov-ship-title">Letzte Sendungen</span>}
        actionLabel="Alle Sendungen"
        onAction={onAll}
      />
      <div className="ce-card ov-card">
        {loading && rows.length === 0 ? (
          <div className="loading-center" role="status" aria-live="polite">
            <span className="spinner spinner-dark" /> Sendungen werden geladen …
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="package"
            title="Noch keine Sendungen"
            text="Sobald Sie einen Versandauftrag gebucht haben, erscheint er hier."
          />
        ) : (
          <ul className="ov-list">
            {rows.map((s) => {
              const nums = customerShipmentNumbers(s);
              return (
                <li className="ov-list-row" key={s.id}>
                  <div className="ov-list-main">
                    <span className="ov-list-primary mono">
                      {nums.orderConfirmationNumber || NO_ORDER_CONFIRMATION_TEXT}
                    </span>
                    <span className="ov-list-secondary">
                      {s.selected_carrier ? resolveCarrierName(s.selected_carrier) : "Carrier offen"}
                      {" · "}
                      {dateDE(s.created_at)}
                    </span>
                  </div>
                  <StatusBadge status={s.status} />
                  <span className="ov-list-num ce-num">{money(s.price_final)}</span>
                  <span className="ov-list-action">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={onOpen}>
                      Öffnen
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/* ── Offene Rechnungen ──────────────────────────────────────────────────────
   Anzahl offen, Anzahl überfällig, Gesamtsumme und nächste Fälligkeit kommen
   unverändert aus der bestehenden Serversummary (overviewInvoiceFacts →
   customerInvoiceSummary). Überfälligkeit trägt das globale Overdue-Badge —
   ruhig, aber eindeutig und nicht allein farblich. Keine Zahlungslogik. */
export function OpenInvoices({ invoices, summary, onAll }) {
  const facts = overviewInvoiceFacts(invoices, summary);
  return (
    <section className="ov-mod" aria-labelledby="ov-inv-title">
      <ModuleHead
        title={<span id="ov-inv-title">Offene Rechnungen</span>}
        actionLabel="Alle Rechnungen"
        onAction={onAll}
      />
      <div className="ce-card ov-card ov-card--pad">
        {!facts.showModule ? (
          <p className="ov-quiet">
            {facts.state === "empty"
              ? "Es liegen noch keine Rechnungen vor."
              : "Aktuell sind keine Forderungen offen."}
          </p>
        ) : (
          <>
            <div className="ov-inv-amount">{money(facts.openAmount)}</div>
            <div className="ov-inv-meta">
              <span>{facts.openCount} {facts.openCount === 1 ? "offene Rechnung" : "offene Rechnungen"}</span>
              {facts.nextDueDate && <span>Nächste Fälligkeit: {dateDE(facts.nextDueDate)}</span>}
            </div>
            {facts.overdueCount > 0 && (
              <p className="ov-inv-overdue">
                <span className="badge badge--overdue">
                  {facts.overdueCount} {facts.overdueCount === 1 ? "überfällig" : "überfällig"}
                </span>
              </p>
            )}
            {facts.mixedCurrency && (
              <p className="ov-quiet ov-inv-note">
                Es liegen zusätzlich Rechnungen in einer anderen Währung vor, die hier nicht mitgerechnet sind.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

/* ── Benachrichtigungen ─────────────────────────────────────────────────────
   Höchstens drei Meldungen aus dem BESTEHENDEN Benachrichtigungscontext.
   Keine zweite Gelesen-/Ungelesen-Logik, kein zweites Polling, kein eigener
   Zustand: Auswahl über topNotifications, Klickverhalten über denselben
   Handler, den auch das Panel benutzt. */
export function OverviewNotifications({ items, onSelect }) {
  const rows = topNotifications(items, 3);
  if (rows.length === 0) return null;
  return (
    <section className="ov-mod" aria-labelledby="ov-ntf-title">
      <ModuleHead title={<span id="ov-ntf-title">Aktuelle Benachrichtigungen</span>} />
      <div className="ce-card ov-card">
        <ul className="ov-list">
          {rows.map((n) => (
            <li className="ov-list-row ov-list-row--button" key={n.id}>
              <button type="button" className="ov-ntf-btn" onClick={() => onSelect(n)}>
                <span className="ov-list-main">
                  <span className="ov-list-primary">
                    {!n.read && <span className="ov-ntf-dot" aria-hidden="true" />}
                    {n.title}
                  </span>
                  <span className="ov-list-secondary">{notificationSubline(n)}</span>
                </span>
                <span className="ov-ntf-time">{relativeTime(n.updatedAt || n.createdAt)}</span>
                <Icon n="chevronRight" s={15} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
