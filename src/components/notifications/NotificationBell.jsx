import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { useNotifications } from "../../context/NotificationsContext";
import { NotificationPanel } from "./NotificationPanel";
import {
  badgeLabel, showBadge, badgeAriaLabel, notificationTarget,
} from "../../utils/notificationsView.mjs";

// ── Die Glocke ───────────────────────────────────────────────────────────────
// Eine Komponente, mehrere Mountpunkte (Übersicht, beide mobilen Topbars, der
// kleine Top-right-Mount der übrigen Unterseiten). Zustand und Polling liegen im
// gemeinsamen Provider — es läuft also genau EINE Abfrageschleife pro Shell,
// unabhängig davon, wie viele Glocken gerendert werden.
//
// `variant` steuert nur die Optik des Knopfes:
//   "overview" — die bisherige, unveränderte Position in der Übersichtskopfzeile
//   "topbar"   — mobile Topbar (< 860 px)
//   "page"     — kleiner Mount oben rechts auf den übrigen Desktop-Unterseiten
//
// Das Öffnen des Fensters markiert NICHTS als gelesen und erledigt nichts.
export function NotificationBell({ variant = "page", navigateTo }) {
  const { unread, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const navigate = useNavigate();

  // Beim Öffnen die volle Liste laden (das Polling holt nur den Zähler).
  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) refresh();
      return next;
    });
  }, [refresh]);

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

  return (
    <div className={`ntf-wrap ntf-wrap-${variant}`}>
      <button
        type="button"
        ref={btnRef}
        className={`ntf-bell ntf-bell-${variant}`}
        onClick={toggle}
        aria-label={badgeAriaLabel(unread)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Benachrichtigungen"
      >
        <Icon n="bell" s={variant === "overview" ? 18 : 17} />
        {showBadge(unread) && (
          // aria-hidden: die Zahl steht bereits im aria-label des Knopfes —
          // "9+" wäre als vorgelesener Text unbrauchbar.
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
          <NotificationPanel onClose={close} onSelect={handleSelect} />
        </>
      )}
    </div>
  );
}
