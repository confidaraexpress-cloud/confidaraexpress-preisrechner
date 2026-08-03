import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../ui/Icon";
import { listAdminSupportRequests } from "../../api/adminApi";
import {
  SUPPORT_LIST_ERROR,
  normalizeSupportRequest,
  supportLabel,
  supportStatusMeta,
} from "../../utils/adminSupportView.mjs";

// Der Abschnitt zeigt die JÜNGSTEN Anfragen dieses Kunden.
const SUPPORT_SORT_RECENT = "recent";

// ─────────────────────────────────────────────────────────────────────────────
// Sektion „Supportanfragen" in der Admin-Kundendetailansicht.
//
// Zeigt die letzten Anfragen GENAU DIESES Kunden — kein zweiter Endpunkt, sondern
// derselbe Listenendpunkt mit userId-Filter (Backendvertrag). Bewusst kompakt und
// read-only: bearbeitet wird ausschließlich auf der Detailseite der Anfrage, damit
// es nur EINEN Schreibpfad gibt.
//
// Die Sektion lädt eigenständig, weil sie zur bestehenden Kundendetailseite additiv
// hinzukommt und deren Ladepfad nicht verändern soll. Ein Fehler hier darf die
// Kundendetailseite NIE unbenutzbar machen — er wird lokal angezeigt.
//
// Der Betreff ist Kundeneingabe und wird als reiner Text gerendert (React escaped
// ihn; kein dangerouslySetInnerHTML). Der volle Nachrichtentext erscheint hier
// bewusst NICHT — die Liste liefert ihn serverseitig ohnehin nicht.
const MAX_ROWS = 5;

function fmtDate(v) {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString("de-DE");
}

function selectRows(d) {
  if (Array.isArray(d)) return d;
  if (d && typeof d === "object") {
    for (const k of ["supportRequests", "support_requests", "requests", "data", "items"]) {
      if (Array.isArray(d[k])) return d[k];
    }
  }
  return [];
}

function selectTotal(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  const pag = d.pagination && typeof d.pagination === "object" ? d.pagination : {};
  const n = Number(pag.total ?? d.total);
  return Number.isFinite(n) ? n : null;
}

export function CustomerSupportSection({ userId }) {
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (userId == null || String(userId).trim() === "") {
      setLoading(false);
      setRows([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      // sort=recent: neueste zuerst. Der Abschnitt zeigt die letzte Aktivität dieses Kunden,
      // nicht die Arbeitsreihenfolge des Supports (das ist 'queue' in der zentralen Liste).
      const r = await listAdminSupportRequests({
        userId, page: 1, pageSize: MAX_ROWS, sort: SUPPORT_SORT_RECENT,
      });
      if (!mountedRef.current) return;
      if (!r.ok) {
        // 401/403 → zentraler Logout/Redirect via apiFetch; hier nichts anzeigen.
        if (r.status !== 401 && r.status !== 403) setError(SUPPORT_LIST_ERROR);
        setRows([]); setTotal(null);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!mountedRef.current) return;
      setRows(selectRows(d).map(normalizeSupportRequest).filter(Boolean));
      setTotal(selectTotal(d));
    } catch {
      if (mountedRef.current) { setError(SUPPORT_LIST_ERROR); setRows([]); setTotal(null); }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const allPath = `/admin/support-requests?userId=${encodeURIComponent(String(userId ?? ""))}`;
  const more = Number.isFinite(total) && total > rows.length;

  return (
    <div className="adm-card">
      <div className="adm-card-head"><Icon n="mail" s={17} /> Supportanfragen</div>
      <div className="adm-card-body">
        {loading ? (
          <div className="loading-center" role="status" aria-live="polite">
            <span className="spinner spinner-dark" /> Wird geladen…
          </div>
        ) : error ? (
          <>
            <div className="alert alert-error" role="alert"><Icon n="x" s={16} />{error}</div>
            <div className="adm-sup-actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={load}>
                <Icon n="refresh" s={14} /> Erneut versuchen
              </button>
            </div>
          </>
        ) : rows.length === 0 ? (
          <p className="adm-sup-hint">Dieser Kunde hat bislang keine Supportanfrage gestellt.</p>
        ) : (
          <>
            <ul className="adm-sup-mini">
              {rows.map((row) => {
                const [cls, fallback] = supportStatusMeta(row.status);
                const subject = typeof row.subject === "string" ? row.subject.replace(/\s+/g, " ").trim() : "";
                return (
                  <li className="adm-sup-mini-item" key={row.id}>
                    <div className="adm-sup-mini-main">
                      {row.id != null
                        ? <Link className="adm-sup-ticket" to={`/admin/support-requests/${encodeURIComponent(row.id)}`}>{supportLabel(row)}</Link>
                        : <span className="adm-sup-ticket">{supportLabel(row)}</span>}
                      <span className="adm-sup-mini-subject">{subject || "—"}</span>
                    </div>
                    <span className={`badge ${cls}`}>{row.statusLabel || fallback}</span>
                    <span className="adm-sup-sub">{fmtDate(row.createdAt)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="adm-sup-actions">
              <Link className="btn btn-outline btn-sm" to={allPath}>
                {more ? `Alle ${total} Anfragen ansehen` : "Alle Anfragen ansehen"}
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
