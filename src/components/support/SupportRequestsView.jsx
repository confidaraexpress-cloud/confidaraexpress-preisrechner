import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { listSupportRequests } from "../../api/supportApi";
import { SupportThread } from "./SupportThread";
import { SupportRequestDialog } from "./SupportRequestDialog";
import { statusFallback } from "../../utils/statusFallback.mjs";
import {
  supportCategoryLabel, SUPPORT_LIST_EMPTY_TITLE, SUPPORT_LIST_EMPTY_TEXT,
  SUPPORT_CUSTOMER_LIST_ERROR,
} from "../../utils/supportRequest.mjs";

// ── „Meine Supportanfragen" (Kundensicht) ────────────────────────────────────
// Zwei Ansichten in einer Komponente: die Liste der eigenen Vorgänge und der
// Nachrichtenverlauf eines einzelnen Vorgangs. Der Wechsel läuft über lokalen
// Zustand — passend zum Navigationsmodell des Dashboards (page-State statt
// eigener Routen).
//
// `initialTicketId` kommt aus dem Deep-Link einer Glockenmeldung
// (?page=support&ticket=…) und öffnet den Verlauf direkt.
//
// Die bestehende Sidebar-Supportkarte und der Erstellungsdialog bleiben
// unverändert nutzbar; hier gibt es zusätzlich einen Einstieg, damit ein Kunde
// eine Anfrage stellen kann, ohne die Ansicht zu verlassen.

const STATUS_META = {
  open: ["badge-yellow", "Offen"],
  in_progress: ["badge-blue", "In Bearbeitung"],
  resolved: ["badge-green", "Erledigt"],
  closed: ["badge-gray", "Geschlossen"],
};

function fmt(value) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("de-DE");
}

function selectRows(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object" && Array.isArray(d.supportRequests)) return d.supportRequests;
  return [];
}

export function SupportRequestsView({ initialTicketId = null, onTicketConsumed }) {
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(initialTicketId);
  const [createOpen, setCreateOpen] = useState(false);

  // Ein Deep-Link aus der Glocke öffnet den Vorgang direkt; danach wird der Wert
  // im Elternzustand geleert, damit ein späterer Wechsel auf die Liste nicht
  // erneut in den Verlauf springt.
  useEffect(() => {
    if (initialTicketId) {
      setOpenId(initialTicketId);
      if (onTicketConsumed) onTicketConsumed();
    }
  }, [initialTicketId, onTicketConsumed]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await listSupportRequests();
      if (!mountedRef.current) return;
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect über apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) setError(SUPPORT_CUSTOMER_LIST_ERROR);
        setRows([]);
        return;
      }
      const d = await r.json().catch(() => null);
      if (!mountedRef.current) return;
      setRows(selectRows(d));
    } catch {
      if (mountedRef.current) { setError(SUPPORT_CUSTOMER_LIST_ERROR); setRows([]); }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { if (!openId) load(); }, [load, openId]);

  if (openId) {
    return (
      <div className="page-body">
        <SupportThread requestId={openId} onBack={() => setOpenId(null)} />
      </div>
    );
  }

  return (
    <div className="page-body">
      <div className="sup-list-head">
        <p className="sup-list-intro">
          Ihre Anfragen an unser Supportteam — mit dem vollständigen Nachrichtenverlauf.
        </p>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
          <Icon n="plus" s={14} /> Neue Anfrage
        </button>
      </div>

      {loading ? (
        <div className="loading-center" role="status" aria-live="polite">
          <span className="spinner spinner-dark" /> Ihre Anfragen werden geladen …
        </div>
      ) : error ? (
        <>
          <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error}</div>
          <button type="button" className="btn btn-outline btn-sm" onClick={load}>
            <Icon n="refresh" s={14} /> Erneut versuchen
          </button>
        </>
      ) : rows.length === 0 ? (
        <div className="sup-empty">
          <p className="sup-empty-title">{SUPPORT_LIST_EMPTY_TITLE}</p>
          <p className="sup-empty-text">{SUPPORT_LIST_EMPTY_TEXT}</p>
        </div>
      ) : (
        <ul className="sup-list">
          {rows.map((row) => {
            const [cls, fallback] = STATUS_META[row.status] || statusFallback(row.status);
            return (
              <li key={row.id}>
                <button type="button" className="sup-list-item" onClick={() => setOpenId(row.id)}>
                  <span className="sup-list-main">
                    <span className="sup-list-top">
                      <span className="sup-ticket">{row.ticketNumber}</span>
                      <span className={`badge ${cls}`}>{row.statusLabel || fallback}</span>
                    </span>
                    {/* Betreff ist Kundeneingabe und wird als reiner Text gerendert. */}
                    <span className="sup-list-subject">{row.subject}</span>
                    <span className="sup-list-meta">
                      {supportCategoryLabel(row.category) || row.category} · Zuletzt aktualisiert {fmt(row.updatedAt || row.createdAt)}
                    </span>
                  </span>
                  <Icon n="chevron" s={16} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {createOpen && (
        <SupportRequestDialog
          onClose={() => { setCreateOpen(false); load(); }}
          onCreated={(id) => { setCreateOpen(false); if (id) setOpenId(id); else load(); }}
        />
      )}
    </div>
  );
}
