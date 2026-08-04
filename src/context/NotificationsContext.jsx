import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { listNotifications, getUnreadCount, markNotificationsRead } from "../api/notificationsApi";
import {
  normalizeNotificationList, readUnreadCount, readSnapshot, POLL_INTERVAL_MS,
} from "../utils/notificationsView.mjs";

// ── Zustand des Benachrichtigungscenters — EINMAL pro App-Shell ──────────────
// Der Provider sitzt in den beiden Shell-Renderern (DashboardPage, DashboardLayout).
// Dadurch teilen sich alle Mountpunkte der Glocke (Übersicht, mobile Topbar,
// Top-right-Mount der Unterseiten) EINEN Zustand und EIN Polling — es gibt keine
// zweite Abfrageschleife, egal wie viele Glockenknöpfe gerendert werden.
//
// Aktualisierung ohne neue Abhängigkeit und ohne WebSockets:
//   • einmal beim Mount (nach erfolgreichem Login liegt der Nutzer bereits vor)
//   • bei erneut sichtbarem Browserfenster (visibilitychange)
//   • zurückhaltendes Polling alle 60 s, AUSSCHLIESSLICH bei sichtbarem Tab
//   • sofort nach Mark-read, PDF-Abruf/Vorschau und dem Öffnen eines Supportverlaufs
//     (über refresh(), das die auslösenden Komponenten aufrufen)
//
// Beim Pollen wird nur der Badge-Zähler geladen (ein indizierter COUNT). Die volle
// Liste kommt erst, wenn das Panel geöffnet wird — das hält die Last niedrig.

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children, enabled = true }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [snapshotAt, setSnapshotAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  // Verhindert, dass eine langsame ältere Antwort eine neuere überschreibt.
  const requestRef = useRef(0);

  // Nur den Zähler holen — der Pfad des Pollings.
  const refreshCount = useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await getUnreadCount();
      if (!mountedRef.current || !r.ok) return;
      const d = await r.json().catch(() => null);
      if (!mountedRef.current || !d) return;
      setUnread(readUnreadCount(d));
      setSnapshotAt((prev) => readSnapshot(d) || prev);
    } catch { /* stiller Fehlschlag: der Badge ist kein kritischer Inhalt */ }
  }, [enabled]);

  // Volle Liste — beim Öffnen des Panels und nach relevanten Aktionen.
  const refresh = useCallback(async () => {
    if (!enabled) return;
    const ticket = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const r = await listNotifications();
      if (!mountedRef.current || ticket !== requestRef.current) return;
      if (!r.ok) {
        // 401/403 behandelt apiFetch zentral (Logout/Redirect) — hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) setError("load");
        return;
      }
      const d = await r.json().catch(() => null);
      if (!mountedRef.current || ticket !== requestRef.current) return;
      setItems(normalizeNotificationList(d));
      setUnread(readUnreadCount(d));
      setSnapshotAt(readSnapshot(d));
      setLoaded(true);
    } catch {
      if (mountedRef.current && ticket === requestRef.current) setError("load");
    } finally {
      if (mountedRef.current && ticket === requestRef.current) setLoading(false);
    }
  }, [enabled]);

  // Explizites Markieren als gelesen. Der Snapshot begrenzt die Wirkung auf den
  // Stand, den der Nutzer gesehen hat — eine währenddessen eingetroffene neue
  // Antwort bleibt ungelesen.
  const markRead = useCallback(async (ids) => {
    if (!enabled) return;
    const list = Array.isArray(ids) ? ids : [ids];
    const valid = list.filter((n) => Number.isInteger(n) && n > 0);
    if (valid.length === 0) return;
    // Optimistisch: der Klick soll sich sofort anfühlen; der Refetch korrigiert.
    setItems((prev) => prev.map((n) => (valid.includes(n.id) ? { ...n, read: true } : n)));
    setUnread((prev) => Math.max(0, prev - valid.filter((id) => {
      const found = items.find((n) => n.id === id);
      return found && !found.read;
    }).length));
    try {
      const r = await markNotificationsRead({ ids: valid, snapshotAt });
      if (!mountedRef.current || !r.ok) return;
      const d = await r.json().catch(() => null);
      if (mountedRef.current && d) setUnread(readUnreadCount(d));
    } catch { /* der folgende refresh() stellt den echten Stand wieder her */ }
    refresh();
  }, [enabled, items, snapshotAt, refresh]);

  const markAllRead = useCallback(async () => {
    if (!enabled) return;
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      const r = await markNotificationsRead({ all: true, snapshotAt });
      if (!mountedRef.current || !r.ok) return;
      const d = await r.json().catch(() => null);
      if (mountedRef.current && d) setUnread(readUnreadCount(d));
    } catch { /* siehe oben */ }
    refresh();
  }, [enabled, snapshotAt, refresh]);

  // ── Initialer Zähler + Polling + Fokus ────────────────────────────────────
  // Das Intervall läuft NUR bei sichtbarem Tab: bei verborgenem Tab wird es
  // abgebaut (nicht bloß übersprungen) und beim Zurückkehren neu aufgesetzt —
  // zusammen mit einem sofortigen Refetch, damit der Badge nach dem Wechsel nicht
  // bis zum nächsten Tick veraltet ist.
  useEffect(() => {
    if (!enabled) return undefined;
    let timer = null;
    const visible = () => typeof document === "undefined" || !document.hidden;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => { refreshCount(); }, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => {
      if (visible()) { refreshCount(); start(); } else { stop(); }
    };

    refreshCount();
    if (visible()) start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, refreshCount]);

  const value = useMemo(() => ({
    items, unread, loading, error, loaded, snapshotAt,
    refresh, refreshCount, markRead, markAllRead,
  }), [items, unread, loading, error, loaded, snapshotAt, refresh, refreshCount, markRead, markAllRead]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

// Außerhalb eines Providers (z. B. im öffentlichen Bereich) liefert der Hook einen
// neutralen Nullzustand statt zu werfen — eine Glocke ohne Provider zeigt dann
// schlicht nichts an, statt die Seite zu zerlegen.
const EMPTY = Object.freeze({
  items: [], unread: 0, loading: false, error: "", loaded: false, snapshotAt: null,
  refresh: () => {}, refreshCount: () => {}, markRead: () => {}, markAllRead: () => {},
});

export function useNotifications() {
  return useContext(NotificationsContext) || EMPTY;
}
