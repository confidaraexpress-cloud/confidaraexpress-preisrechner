import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../context/NotificationsContext";
import { NotificationPanel } from "./NotificationPanel";
import { Icon, ICON_SIZE } from "../ui/Icon";
import {
  badgeLabel, showBadge, badgeAriaLabel, notificationTarget,
} from "../../utils/notificationsView.mjs";

// ── „Mitteilungen" ───────────────────────────────────────────────────────────
// Eine Komponente, mehrere Mountpunkte (Übersicht, beide mobilen Topbars, der
// Utility-Mount der übrigen Unterseiten). Zustand und Polling liegen im
// gemeinsamen Provider — es läuft also genau EINE Abfrageschleife pro Shell,
// unabhängig davon, wie oft der Knopf gerendert wird.
//
// Auf dem Desktop ist der Einstieg der Textknopf „Mitteilungen" (Redesign
// 2026-10) mit der Zahl ungelesener Meldungen. In der mobilen Topbar steht seit
// der Betreiberentscheidung 2026-10-17 wieder das Glockensymbol; der Zähler sitzt
// klein an der Glocke. Der zugängliche Name ist in beiden Fällen derselbe
// („Mitteilungen, 3 ungelesen“) und nennt die Zahl ausgeschrieben.
//
// `variant` steuert nur die Optik des Knopfes:
//   "overview" — Utility-Zeile der Übersicht (Text)
//   "topbar"   — mobile Topbar (< 860 px, Glockensymbol)
//   "page"     — Utility-Zeile der übrigen Desktop-Unterseiten (Text)
//
// Das Öffnen des Fensters markiert NICHTS als gelesen und erledigt nichts.
const KNOPF_TEXT = "Mitteilungen";
function knopfName(count) {
  const n = Number(count);
  if (!Number.isFinite(n) || n <= 0) return KNOPF_TEXT;
  return n === 1 ? `${KNOPF_TEXT}, 1 ungelesen` : `${KNOPF_TEXT}, ${Math.floor(n)} ungelesen`;
}
export function NotificationBell({ variant = "page", navigateTo }) {
  const { unread, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const navigate = useNavigate();

  // Beim Öffnen die volle Liste laden (das Polling holt nur den Zähler).
  // Der Abruf läuft NEBEN dem Zustandswechsel, nicht in dessen Updater: ein
  // Seiteneffekt in einer setState-Updaterfunktion löst in React die Warnung
  // „Cannot update a component while rendering a different component" aus
  // (der Provider wird mitten im Rendern aktualisiert). Verhalten unverändert.
  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    if (next) refresh();
  }, [open, refresh]);

  // Fokus zurück auf die Glocke, sobald das Fenster schließt — sonst landet er
  // beim Schließen am Seitenanfang.
  const close = useCallback(() => {
    setOpen(false);
    if (btnRef.current) btnRef.current.focus();
  }, []);

  // Navigation aus einer Meldung. Das Ziel wird aus Typ und Entitäts-ID
  // abgeleitet, nie aus einer URL im Serverpayload.
  const handleSelect = useCallback((n) => {
    const target = notificationTarget(n);
    setOpen(false);
    if (!target) return;
    if (target.page === "support") {
      // Deep-Link in den Vorgang; innerhalb der Dashboard-Shell ohne Routenwechsel.
      if (navigateTo) navigateTo("support", { ticket: target.ticket });
      else navigate(`/dashboard?page=support&ticket=${encodeURIComponent(String(target.ticket))}`);
      return;
    }
    if (navigateTo) navigateTo("invoices", { invoice: target.invoice });
    else navigate("/dashboard?page=invoices");
  }, [navigateTo, navigate]);

  // Escape schließt auch, wenn der Fokus (noch) auf der Glocke liegt.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  const label = badgeLabel(unread);

  // aria-controls zeigt auf das Panel, solange es offen ist (es wird nur geöffnet gerendert).
  const panelId = `ntf-panel-${useId().replace(/:/g, "")}`;

  return (
    <div className={`ntf-wrap ntf-wrap-${variant}`}>
      <button
        type="button"
        ref={btnRef}
        className={`ntf-bell ntf-bell-${variant}`}
        onClick={toggle}
        aria-label={knopfName(unread)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        title={badgeAriaLabel(unread)}
      >
        {variant === "topbar"
          ? <Icon n="bell" s={ICON_SIZE.lg} />
          : <span className="ntf-bell-text">{KNOPF_TEXT}</span>}
        {showBadge(unread) && (
          // aria-hidden: die Zahl steht bereits im zugänglichen Namen des
          // Knopfes — "9+" wäre als vorgelesener Text unbrauchbar.
          <span className="ntf-badge" aria-hidden="true">{label}</span>
        )}
      </button>
      {open && (
        <>
          <button
            type="button"
            className="ntf-overlay"
            onClick={close}
            aria-label="Benachrichtigungen schließen"
            tabIndex={-1}
          />
          <NotificationPanel id={panelId} onClose={close} onSelect={handleSelect} />
        </>
      )}
    </div>
  );
}
