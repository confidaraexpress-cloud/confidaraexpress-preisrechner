// ─────────────────────────────────────────────────────────────────────────────
// Operative Übersichtsmodule — reine, framework-freie Logik (.mjs, wie kpis/
// customerInvoiceView). Sie beantwortet genau drei Fragen:
//
//   1. Hat dieses Konto überhaupt operative Daten? (steuert Arbeitsfläche vs.
//      Onboarding — siehe Paket D, Teil 2)
//   2. Welche Sendungen sind die zuletzt angelegten?
//   3. Welche Benachrichtigungen sind die wichtigsten?
//
// Bewusst KEINE eigene Fachlogik: Zahlungs-, Status- und Rechnungslogik bleiben
// vollständig in kpis.mjs bzw. customerInvoiceView.mjs. Dieses Modul sortiert,
// schneidet ab und fragt ab — mehr nicht. Kein React, kein Netzwerk, kein State.
//
// Alle Funktionen sind rein: sie mutieren ihre Eingaben nie (Sortierung läuft
// immer über eine Kopie).
// ─────────────────────────────────────────────────────────────────────────────
import { customerInvoiceSummary, isOverdueInvoice } from "./customerInvoiceView.mjs";

// ── Schnellaktionen ─────────────────────────────────────────────────────────
// AUSSCHLIESSLICH bereits vorhandene Ziele. `page` entspricht exakt einem Wert
// des bestehenden page-States (DashboardPage), `route` einer bestehenden Route.
// Es entsteht dadurch keine neue Navigations- oder Routingarchitektur — der
// Aufrufer reicht die Werte an seine vorhandenen Handler weiter.
//
// Genau EINE Aktion ist primär (`primary: true`): mehr als eine hervorgehobene
// Fläche nebeneinander hebt sich gegenseitig auf.
export const QUICK_ACTIONS = Object.freeze([
  { key: "new", label: "Neue Sendung", desc: "Versandauftrag anlegen und buchen", icon: "plus", page: "new", primary: true },
  { key: "calculator", label: "Versand berechnen", desc: "Preise und Laufzeiten vergleichen", icon: "zap", route: "/calculator" },
  { key: "shipments", label: "Sendungen ansehen", desc: "Aufträge und Sendungsverfolgung", icon: "package", page: "shipments" },
  { key: "invoices", label: "Rechnungen ansehen", desc: "Belege und offene Beträge", icon: "invoice", page: "invoices" },
  { key: "support", label: "Supportanfrage erstellen", desc: "Persönliche Unterstützung anfordern", icon: "mail", page: "support" },
]);

// ── Zeitpunkt einer Sendung als vergleichbare Zahl ──────────────────────────
// Nicht parsebare oder fehlende Werte ergeben NaN und landen dadurch ans Ende
// (siehe sortByCreatedAtDesc) — statt die Sortierung unbestimmt zu machen.
function createdAtValue(s) {
  const raw = s && s.created_at;
  if (!raw) return NaN;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? NaN : t;
}

// ── Letzte Sendungen ────────────────────────────────────────────────────────
// Neueste zuerst, höchstens `limit` Einträge. Sendungen ohne verwertbares
// created_at behalten ihre relative Reihenfolge und stehen hinten — sie werden
// NICHT verworfen (eine Sendung verschwinden zu lassen wäre schlimmer als sie
// unsortiert zu zeigen).
//
// Die Sendungsobjekte selbst werden unverändert durchgereicht: kein Feld wird
// ergänzt, umbenannt, umgerechnet oder entfernt.
export function recentShipments(shipments, limit = 4) {
  const list = Array.isArray(shipments) ? shipments : [];
  const n = Number.isInteger(limit) && limit > 0 ? limit : 4;
  const withIndex = list.map((s, i) => ({ s, i, t: createdAtValue(s) }));
  withIndex.sort((a, b) => {
    const aNaN = Number.isNaN(a.t), bNaN = Number.isNaN(b.t);
    if (aNaN && bNaN) return a.i - b.i;   // beide unbekannt → Eingabereihenfolge
    if (aNaN) return 1;                    // unbekannt nach hinten
    if (bNaN) return -1;
    if (a.t !== b.t) return b.t - a.t;     // neueste zuerst
    return a.i - b.i;                      // gleichzeitig → stabil
  });
  return withIndex.slice(0, n).map((e) => e.s);
}

// ── Offene Rechnungen ───────────────────────────────────────────────────────
// Beträge, Anzahlen und die nächste Fälligkeit kommen unverändert aus
// customerInvoiceSummary (Serversummary als kanonische Quelle) — hier wird
// nichts nachgerechnet. Ergänzt wird ausschließlich `showModule`: ob das Modul
// überhaupt etwas zu sagen hat.
//
// `overdueFromList` ist ein reiner Anzeige-Fallback für den Fall, dass die
// Serversummary die Zahl nicht mitliefert; er zählt NUR das serverseitige
// is_overdue-Flag (über isOverdueInvoice) und leitet nichts aus Datumswerten ab.
export function overviewInvoiceFacts(invoices, summary) {
  const view = customerInvoiceSummary(invoices, summary);
  if (view.state !== "open") return { ...view, showModule: false, overdueCount: 0 };
  const list = Array.isArray(invoices) ? invoices : [];
  const overdueCount = view.overdueCount > 0
    ? view.overdueCount
    : list.filter((inv) => isOverdueInvoice(inv)).length;
  return { ...view, overdueCount, showModule: true };
}

// ── Wichtigste Benachrichtigungen ───────────────────────────────────────────
// Ungelesene zuerst, danach die neuesten. Die Gelesen-/Ungelesen-Logik selbst
// bleibt vollständig im Benachrichtigungscontext — hier wird nur nach dem
// bereits vorhandenen `read`-Flag sortiert und abgeschnitten.
export function topNotifications(items, limit = 3) {
  const list = Array.isArray(items) ? items : [];
  const n = Number.isInteger(limit) && limit > 0 ? limit : 3;
  const stamp = (x) => {
    const raw = x && (x.updatedAt || x.createdAt);
    const t = raw ? new Date(raw).getTime() : NaN;
    return Number.isNaN(t) ? -Infinity : t;
  };
  return list
    .map((n2, i) => ({ n2, i }))
    .sort((a, b) => {
      const aUnread = a.n2 && !a.n2.read ? 0 : 1;
      const bUnread = b.n2 && !b.n2.read ? 0 : 1;
      if (aUnread !== bUnread) return aUnread - bUnread;
      const d = stamp(b.n2) - stamp(a.n2);
      if (d !== 0 && Number.isFinite(d)) return d;
      return a.i - b.i;
    })
    .slice(0, n)
    .map((e) => e.n2);
}

// ── Arbeitsfläche oder Onboarding? ──────────────────────────────────────────
// Die Übersicht ist eine Arbeitsfläche, sobald das Konto irgendetwas
// Operatives hat. Solange NICHTS vorliegt, führt sie den Neukunden.
//
// `ready` verhindert den kurzen Fehlschluss beim ersten Laden: bevor die
// Sendungen einmal erfolgreich geladen wurden, ist „keine Sendungen" nicht von
// „noch nicht geladen" zu unterscheiden. Bis dahin gilt das Konto als operativ
// (die Module zeigen dann ihre eigenen Lade-/Leerzustände), damit die Seite
// nicht kurz das Onboarding aufblitzen lässt und dann umspringt.
export function hasOperationalData({ shipments, invoices, ready = true } = {}) {
  if (!ready) return true;
  const s = Array.isArray(shipments) ? shipments : [];
  const i = Array.isArray(invoices) ? invoices : [];
  return s.length > 0 || i.length > 0;
}
