import React, { useCallback, useEffect, useRef } from "react";
import { Icon } from "../ui/Icon";
import { EmptyState, ErrorState, ListSkeleton } from "../ui/StateView";
import { useNotifications } from "../../context/NotificationsContext";
import {
  PANEL_TITLE, MARK_ALL_LABEL, EMPTY_TITLE, EMPTY_TEXT, LOADING_TEXT,
  LOAD_ERROR_TEXT, RETRY_LABEL, notificationSubline, relativeTime,
} from "../../utils/notificationsView.mjs";

// ── Benachrichtigungsfenster ─────────────────────────────────────────────────
// Bewusst KEIN Live-Chat-Gefühl: keine blinkende oder dauerhaft pulsierende
// Animation, keine Onlineanzeige. Bewegung gibt es nur als kurze Zustandsreaktion
// (Hover/Fokus) — dieselbe Regel wie im übrigen App-Chrome.
//
// Das bloße Öffnen markiert NICHTS als gelesen. Gelesen wird ausschließlich
// durch einen Klick auf die konkrete Meldung oder über „Alle als gelesen
// markieren". Erledigt (und damit verschwunden) wird eine Meldung nie vom
// Client, sondern nur vom Backend aus einem Fachereignis.
//
// Bedienbarkeit folgt dem etablierten Dialogmuster des Projekts
// (SupportRequestDialog, InvoicePdfPreviewModal): Fokus beim Öffnen ins Fenster,
// Escape schließt, Tab-Falle innerhalb des Fensters, Fokus danach zurück auf die
// auslösende Glocke (das erledigt der aufrufende Bell-Button).
export function NotificationPanel({ onClose, onSelect }) {
  const { items, loading, error, markError, refresh, markRead, markAllRead } = useNotifications();
  const boxRef = useRef(null);

  // Fokus, Escape und Tab-Falle.
  // Fokusrückgabe (Paket A, Phase 3): beim Schließen kehrt der Fokus auf das
  // Element zurück, das das Panel geöffnet hat — bisher blieb er im Nichts.
  // Bewusst ein EIGENER Effekt ohne Abhängigkeiten: im Effekt der Fokusfalle
  // (der an [onClose] hängt) würde er bei jedem neuen Callback feuern und den
  // Fokus mitten in der Bedienung zurückreißen.
  const openerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);
  useEffect(() => () => {
    const ziel = openerRef.current;
    if (ziel && typeof ziel.focus === "function" && document.contains(ziel)) ziel.focus();
  }, []);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return undefined;
    const focusables = () => Array.from(
      box.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')
    ).filter((el) => el.offsetParent !== null);

    const first = focusables()[0];
    if (first) first.focus(); else box.focus();

    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) return;
      const firstEl = list[0], lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    box.addEventListener("keydown", onKey);
    return () => box.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Klick außerhalb schließt — der Overlay-Knopf darunter deckt das ab; hier
  // zusätzlich für Zeigergeräte auf großen Screens.
  useEffect(() => {
    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  // Ein Klick auf die Meldung: als gelesen markieren UND zum Ziel navigieren.
  // Beides sind ausdrückliche Nutzerhandlungen — genau dafür ist „gelesen"
  // vorgesehen. Ob die Meldung dadurch auch erledigt wird, entscheidet allein das
  // Backend (der PDF-Abruf bzw. die bestätigte Ansicht des Verlaufs).
  const handleSelect = useCallback((n) => {
    markRead(n.id);
    onSelect(n);
  }, [markRead, onSelect]);

  const hasUnread = items.some((n) => !n.read);

  return (
    <div
      className="ntf-panel"
      role="dialog"
      aria-modal="true"
      aria-label={PANEL_TITLE}
      ref={boxRef}
      tabIndex={-1}
    >
      <div className="ntf-head">
        <span className="ntf-title">{PANEL_TITLE}</span>
        <div className="ntf-head-actions">
          {hasUnread && (
            <button type="button" className="ntf-markall" onClick={markAllRead}>
              {MARK_ALL_LABEL}
            </button>
          )}
          <button
            type="button"
            className="ntf-close"
            onClick={onClose}
            aria-label="Benachrichtigungen schließen"
            title="Benachrichtigungen schließen"
          >
            <Icon n="x" s={16} />
          </button>
        </div>
      </div>

      <div className="ntf-body">
        {/* Als-gelesen-Fehlschlag: sichtbar statt wortlosem Zurückspringen des
            Punkts; der nächste Klick versucht es erneut (Context räumt vorher ab). */}
        {markError && (
          <div className="ntf-state" role="alert">
            <p className="ntf-state-text">{markError}</p>
          </div>
        )}
        {/* Ein Ladefehler NEBEN bereits geladenen Meldungen ersetzt die Liste
            nicht mehr (Paket D, Teil 8): der letzte gültige Stand bleibt
            sichtbar, die Meldung steht als schmale Zeile darüber. Nur wenn es
            noch gar nichts zu zeigen gibt, füllt der Fehler das Panel. */}
        {error && items.length > 0 && (
          <div className="ntf-inline-error" role="alert">
            <span>{LOAD_ERROR_TEXT}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
              <Icon n="refresh" s={14} /> {RETRY_LABEL}
            </button>
          </div>
        )}
        {loading && items.length === 0 ? (
          // Skeleton beim ERSTEN Laden: die kommende Zeilenstruktur statt einer
          // leeren Fläche mit Spinner.
          <div className="ntf-skeleton">
            <ListSkeleton rows={3} label={LOADING_TEXT} />
          </div>
        ) : error && items.length === 0 ? (
          <ErrorState
            title={LOAD_ERROR_TEXT}
            action={(
              <button type="button" className="btn btn-outline btn-sm" onClick={refresh}>
                <Icon n="refresh" s={14} /> {RETRY_LABEL}
              </button>
            )}
          />
        ) : items.length === 0 ? (
          <EmptyState icon="bell" title={EMPTY_TITLE} text={EMPTY_TEXT} />
        ) : (
          <ul className="ntf-list">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className={`ntf-item${n.read ? "" : " ntf-item-unread"}`}
                  onClick={() => handleSelect(n)}
                >
                  <span className="ntf-item-main">
                    <span className="ntf-item-title">
                      {!n.read && <span className="ntf-dot" aria-hidden="true" />}
                      {n.title}
                    </span>
                    {/* Kundeneingaben erscheinen hier nicht; Beleg-/Ticketnummern
                        werden als reiner Text gerendert (React escaped). */}
                    <span className="ntf-item-sub">{notificationSubline(n)}</span>
                  </span>
                  <span className="ntf-item-meta">
                    <span className="ntf-item-time">{relativeTime(n.updatedAt || n.createdAt)}</span>
                    <span className="ntf-item-action">{n.actionLabel}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
