import React from "react";
import { StatusBadge } from "../ui/StatusBadge";
import { EmptyState } from "../ui/StateView";
import { money, dateDE } from "../../utils/formatters";
import { resolveCarrier, resolvePublicCarrier } from "../../utils/carrierMap";
import { customerShipmentNumbers, NO_ORDER_CONFIRMATION_TEXT } from "../../utils/businessNumbers.mjs";
import { notificationSubline, relativeTime } from "../../utils/notificationsView.mjs";
import { recentShipments, overviewInvoiceFacts, topNotifications, INVENTORY_SNAPSHOT_TEXT, snapshotRows } from "../../utils/overviewModules.mjs";
import { creditFacts, CREDIT_TEXT } from "../../utils/creditLimitView.mjs";
import { shipmentRecipient } from "../../utils/shipmentRecipientView.mjs";
import { CARRIER_PORTFOLIO_TEXT } from "../../utils/carrierPortfolioView.mjs";
import { formatUnits, overviewPreviewRows, isInventoryEmpty } from "../../utils/inventoryView.mjs";

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
   die bestehende Sendungsantwort bereits enthält: Nummer und Datum, Empfänger
   (recipient_address — dieselben Felder wie die Kopfsuche), Carrier mit Logo,
   Status, Preis. Fehlt der Empfänger (ältere Sendung), steht „—“. */
function CarrierMarke({ raw }) {
  if (!raw) return <span className="ov-list-carrier ov-quiet">Carrier offen</span>;
  const c = resolveCarrier(raw);
  return (
    <span className="ov-list-carrier">
      {c.logo && <img className="ov-list-carrier-logo" src={c.logo} alt="" />}
      <span>{c.name}</span>
    </span>
  );
}

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
          <ul className="ov-list ov-list--sendungen">
            {rows.map((s) => {
              const nums = customerShipmentNumbers(s);
              const empfaenger = shipmentRecipient(s);
              return (
                <li className="ov-list-row" key={s.id}>
                  <div className="ov-list-main">
                    <span className="ov-list-primary mono ce-wert">
                      {nums.orderConfirmationNumber || NO_ORDER_CONFIRMATION_TEXT}
                    </span>
                    <span className="ov-list-secondary">{dateDE(s.created_at)}</span>
                  </div>
                  <div className="ov-list-empfaenger">
                    <span className="ov-list-empfaenger-name">{empfaenger?.name || "—"}</span>
                    {empfaenger?.wohin && <span className="ov-list-secondary">{empfaenger.wohin}</span>}
                  </div>
                  <CarrierMarke raw={s.selected_carrier} />
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
/* ── Buchungsrahmen (Paket F, 2026-10-23; Premium-Redesign B11, 2026-10-27) ──
   Ein ruhiger Block unter den offenen Rechnungen. Kopf: „Buchungsrahmen“ mit dem Rahmen als
   Betrag. Darunter der Balken, beide Teile beschriftet: links der gefüllte Teil „Belegt“, rechts
   der Rest „Verfügbar“. Vorher stand groß „Verfügbarer Buchungsrahmen“ über einem Balken, der den
   BELEGTEN Anteil zeigt — Beschriftung und Balken widersprachen sich (Audit B6). Alle Werte kommen
   unverändert vom Server (GET /kunde/credit, utils/creditLimitView.mjs); ohne Antwort (altes
   Backend) steht hier nichts. Ausgeschöpft steht als Wort da, nie nur als Farbe. */
export function CreditFrame({ credit }) {
  const f = creditFacts(credit);
  if (!f.show) return null;
  return (
    <div className={`ov-credit${f.exhausted ? " ov-credit--exhausted" : ""}`} id="ov-credit" role="group" aria-label={`${CREDIT_TEXT.title}: ${f.summary}`}>
      <div className="ov-credit-head">
        <span className="ov-credit-label">{CREDIT_TEXT.title}</span>
        {f.exhausted && <span className="badge badge--warning">{CREDIT_TEXT.exhaustedBadge}</span>}
        <span className="ov-credit-limit">{f.limitText}</span>
      </div>
      <div className="ov-credit-bar" aria-hidden="true">
        <span className="ov-credit-bar-fill" style={{ width: `${f.usedPercent}%` }} />
      </div>
      <dl className="ov-credit-parts">
        <div className="ov-credit-part ov-credit-part--used"><dt>{CREDIT_TEXT.usedLabel}</dt><dd>{f.usedText}</dd></div>
        <div className="ov-credit-part ov-credit-part--available"><dt>{CREDIT_TEXT.availablePartLabel}</dt><dd>{f.availableText}</dd></div>
      </dl>
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

/* ── Lager und Aufträge (G1/D7, 2026-10-28) ────────────────────────────────
   Der operative Stand des eigenen Lagers in der Übersicht: offene Aufträge und
   Artikel unter Mindestbestand mit ihren ersten Einträgen, dazu zwei Zahlen.
   Reine Darstellung: den Stand ({ status: "laden" | "fehler" | "bereit", stats,
   fehler }) lädt DashboardPage mit derselben Abfrage wie die Lagerübersicht —
   Module rufen keine API. Alle Texte und Vorschauzeilen aus utils/
   (overviewModules.mjs, inventoryView.mjs). Ohne Artikel steht der Einstieg da; ein
   Ladefehler sagt es und bietet die Wiederholung an (`onRetry`). */
// Der Leertext steht nur, wenn der Server 0 meldet — nennt er eine Zahl ohne Vorschauzeilen (ältere Antwort), führt
// der Link zur Liste, statt der Zahl zu widersprechen.
function SnapshotSpalte({ titel, zahl, anzahl, zeilen, leer, onAlle, alleLabel }) {
  const keine = anzahl === 0;
  return (
    <div className="ov-lager-spalte">
      <div className="ov-lager-kopf">
        <span className="ov-lager-titel">{titel}</span>
        <span className="ov-lager-zahl">{zahl}</span>
      </div>
      {zeilen.length === 0 ? (
        keine && <p className="ov-quiet ov-lager-leer">{leer}</p>
      ) : (
        <ul className="ov-lager-liste">
          {zeilen.map((z) => (
            <li className="ov-lager-zeile" key={z.id}>
              <span className="ov-lager-primaer">{z.primary}</span>
              {z.secondary && <span className="ov-lager-sekundaer">{z.secondary}</span>}
              {z.value && <span className="ov-lager-wert">{z.value}</span>}
            </li>
          ))}
        </ul>
      )}
      {onAlle && !keine && (
        <button type="button" className="btn btn-link btn-sm ov-lager-alle" onClick={onAlle}>{alleLabel}</button>
      )}
    </div>
  );
}

export function InventorySnapshot({ stand: standProp = null, onRetry = null, onNavigate }) {
  const stand = standProp || { status: "laden", stats: null, fehler: "" };
  const T = INVENTORY_SNAPSHOT_TEXT;
  const stats = stand.stats;
  const previews = stats?.previews || null;
  const gehe = (ziel, filter) => () => onNavigate && onNavigate(ziel, filter || null);

  return (
    <section className="ov-mod ov-lager" aria-labelledby="ov-lager-title" aria-busy={stand.status === "laden" ? "true" : undefined}>
      <ModuleHead title={<span id="ov-lager-title">{T.title}</span>} actionLabel={T.action} onAction={gehe("inventory")} />
      <div className="ce-card ov-card ov-card--pad">
        {stand.status === "laden" && (
          <div className="loading-center" role="status" aria-live="polite">
            <span className="spinner spinner-dark" /> Lagerdaten werden geladen …
          </div>
        )}
        {stand.status === "fehler" && (
          <div className="ov-lager-fehler">
            <p className="ov-quiet">{stand.fehler}</p>
            {onRetry && <button type="button" className="btn btn-outline btn-sm" onClick={() => onRetry()}>{T.retry}</button>}
          </div>
        )}
        {stand.status === "bereit" && stats && isInventoryEmpty(stats) && (
          <div className="ov-lager-einstieg">
            <p className="ov-lager-einstieg-titel">{T.emptyTitle}</p>
            <p className="ov-quiet">{T.emptyText}</p>
            <button type="button" className="btn btn-outline btn-sm" onClick={gehe("inventory")}>{T.emptyAction}</button>
          </div>
        )}
        {stand.status === "bereit" && stats && !isInventoryEmpty(stats) && (
          <>
            <div className="ov-lager-raster">
              <SnapshotSpalte
                titel={T.openOrders}
                zahl={formatUnits(stats.openOrders)}
                anzahl={stats.openOrders}
                zeilen={snapshotRows(overviewPreviewRows("openOrders", previews))}
                leer={T.openOrdersEmpty}
                onAlle={gehe("orders", "open")}
                alleLabel="Alle offenen Aufträge"
              />
              <SnapshotSpalte
                titel={T.lowStock}
                zahl={formatUnits(stats.lowStockCount)}
                anzahl={stats.lowStockCount}
                zeilen={snapshotRows(overviewPreviewRows("lowStockCount", previews))}
                leer={T.lowStockEmpty}
                onAlle={gehe("stock", "low")}
                alleLabel="Alle betroffenen Artikel"
              />
            </div>
            <dl className="ov-lager-fakten">
              <div><dt>{T.available}</dt><dd>{formatUnits(stats.availableUnits)}</dd></div>
              <div><dt>{T.shippedToday}</dt><dd>{formatUnits(stats.shippedToday)}</dd></div>
            </dl>
          </>
        )}
      </div>
    </section>
  );
}

/* ── Ihre Versanddienstleister (G2, 2026-10-28) ─────────────────────────────
   Die Carrier, die ConfidaraExpress aktuell anbietet — ausschließlich aus
   GET /kunde/carriers (geladen von DashboardPage, hier nur dargestellt). Logos
   gleicher optischer Höhe auf Weiß, Namen darunter,
   eine Aktion „Preise vergleichen“. Keine Laufzeiten, keine Dienstnamen, keine
   Zahl im Titel, kein Banner. Ohne Antwort (Fehler, ältere Serverfassung) oder
   ohne Carrier erscheint das Modul nicht — nie eine feste Liste. */
export function CarrierPortfolio({ carriers, onCompare }) {
  if (!Array.isArray(carriers) || carriers.length === 0) return null;
  return (
    <section className="ov-mod ov-carrier-zeile" aria-labelledby="ov-car-title">
      <ModuleHead title={<span id="ov-car-title">{CARRIER_PORTFOLIO_TEXT.title}</span>} actionLabel={CARRIER_PORTFOLIO_TEXT.action} onAction={onCompare} />
      <div className="ce-card ov-card ov-card--pad">
        <ul className="ov-carrier-liste">
          {carriers.map((c) => {
            const logo = resolvePublicCarrier(c.id).logo;
            return (
              <li className="ov-carrier-eintrag" key={c.id}>
                <span className="ov-carrier-logo" aria-hidden="true">{logo ? <img src={logo} alt="" /> : null}</span>
                <span className="ov-carrier-name">{c.name}</span>
              </li>
            );
          })}
        </ul>
        <p className="ov-quiet ov-carrier-hinweis">{CARRIER_PORTFOLIO_TEXT.hint}</p>
      </div>
    </section>
  );
}
