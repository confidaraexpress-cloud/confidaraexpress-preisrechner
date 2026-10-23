import React from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { EmptyState } from "../ui/StateView";
import { money, dateDE } from "../../utils/formatters";
import { resolveCarrierName } from "../../utils/carrierMap";
import { customerShipmentNumbers, NO_ORDER_CONFIRMATION_TEXT } from "../../utils/businessNumbers.mjs";
import { notificationSubline, relativeTime } from "../../utils/notificationsView.mjs";
import { recentShipments, overviewInvoiceFacts, topNotifications } from "../../utils/overviewModules.mjs";
import { creditFacts, CREDIT_TEXT } from "../../utils/creditLimitView.mjs";

/* ═══════════════════════════════════════════════════════════════════════════
   OPERATIVE ÜBERSICHTSMODULE (Paket D, Redesign 2026-10)
   ───────────────────────────────────────────────────────────────────────────
   Drei Module über den bereits vorhandenen Daten der Dashboardseite:
   letzte Sendungen, offene Rechnungen, Benachrichtigungen.

   Kein Modul lädt selbst Daten, keines kennt eine Route, keines rechnet einen
   Geschäftswert nach. Alles kommt als Prop herein; Sortierung und Auswahl
   liefert utils/overviewModules.mjs (rein und getestet).

   Seit dem Redesign ohne Symbole: der Modulkopf trägt genau eine Textaktion,
   die Zeilen der letzten Sendungen tragen KEINE eigene „Öffnen"-Aktion mehr —
   sie führte nur zur ganzen Sendungsliste, also zum selben Ziel wie „Alle
   Sendungen" (Auditbefund P1 · Aktionssemantik). Eine echte Einzelansicht
   wäre eine Funktionsänderung und ist bewusst nicht Teil des Redesigns.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Gemeinsamer Modulkopf: Titel links, genau eine optionale Textaktion rechts. */
function ModuleHead({ title, actionLabel, onAction }) {
  return (
    <div className="ov-mod-head">
      <h2 className="ov-mod-title">{title}</h2>
      {actionLabel && onAction && (
        <button type="button" className="btn btn-link btn-sm" onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ── Letzte Sendungen ───────────────────────────────────────────────────────
   Kompakte Auswahl, KEINE zweite Sendungsliste: keine Pagination, keine Suche,
   kein Filter, keine eigene Abfrage. Gezeigt werden ausschließlich Felder, die
   die bestehende Sendungsantwort bereits enthält (Nummer, Carrier, Datum,
   Status, Preis). Bewusst OHNE Empfänger-/Zielspalte: die Kundenantwort
   /kunde/shipments führt keine Empfängerdaten. */
export function RecentShipments({ shipments, loading, onAll }) {
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
                  <span className="ov-list-status"><StatusBadge status={s.status} /></span>
                  <span className="ov-list-num ce-num">{money(s.price_final)}</span>
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
/* ── Buchungsrahmen (Paket F, 2026-10-23) ──
   Ein ruhiger Block unter den offenen Rechnungen: der verfügbare Rahmen als Betrag, darunter
   ein Satz mit Rahmen und belegtem Anteil, dazu eine schmale Linie als Anteil. Alle Werte kommen
   vom Server (GET /kunde/credit, utils/creditLimitView.mjs); ohne Antwort (altes Backend)
   steht hier nichts. Ausgeschöpft steht als Wort da, nie nur als Farbe. */
export function CreditFrame({ credit }) {
  const f = creditFacts(credit);
  if (!f.show) return null;
  return (
    <div className={`ov-credit${f.exhausted ? " ov-credit--exhausted" : ""}`} id="ov-credit" role="group" aria-label={`${CREDIT_TEXT.title}: ${f.summary}`}>
      <div className="ov-credit-head">
        <span className="ov-credit-label">{CREDIT_TEXT.availableLabel}</span>
        {f.exhausted && <span className="badge badge--warning">{CREDIT_TEXT.exhaustedBadge}</span>}
      </div>
      <div className="ov-credit-value">{f.availableText}</div>
      <div className="ov-credit-bar" aria-hidden="true">
        <span className="ov-credit-bar-fill" style={{ width: `${f.usedPercent}%` }} />
      </div>
      <p className="ov-credit-meta">von {f.limitText} · {f.usedText} belegt</p>
      {f.exhausted && <p className="ov-quiet ov-credit-note">{CREDIT_TEXT.exhaustedNote}</p>}
    </div>
  );
}

export function OpenInvoices({ invoices, summary, onAll, credit = null }) {
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
          <>
            <p className="ov-quiet">
              {facts.state === "empty"
                ? "Es liegen noch keine Rechnungen vor."
                : "Aktuell sind keine Forderungen offen."}
            </p>
            <CreditFrame credit={credit} />
          </>
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
            <CreditFrame credit={credit} />
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
   Handler, den auch das Panel benutzt. Ungelesen steht als Wort „Neu" da. */
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
                    {!n.read && <span className="ov-ntf-new">Neu</span>}
                    {n.title}
                  </span>
                  <span className="ov-list-secondary">{notificationSubline(n)}</span>
                </span>
                <span className="ov-ntf-time">{relativeTime(n.updatedAt || n.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
