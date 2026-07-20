import React, { useEffect, useRef, useState, useCallback } from "react";
import { PremiumBackground } from "../components/dashboard/PremiumBackground";
import { DraftsHeader } from "../components/drafts/DraftsHeader";
import { DraftsList } from "../components/drafts/DraftsList";
import { DraftDeleteConfirmDialog } from "../components/drafts/DraftDeleteConfirmDialog";
import { getDrafts, deleteDraft } from "../api/client";
import { appendDraftPage, removeDraftFromList, mapDraftDeleteErrorToMessage } from "../utils/draftsView.mjs";

const PAGE_LIMIT = 20;

// Entwürfe — Hauptseite. Zeigt AUSSCHLIESSLICH bewusst gespeicherte Benutzer-
// Entwürfe (Backend filtert bereits auf is_saved_draft=true). Kein Fortsetzen/
// Formular-Rehydration in diesem Slice — nur Liste, Pagination, Löschen.
export default function DraftsPage({ onNewShipment }) {
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  // Getrennt vom initialen Ladefehler (error): ein Löschfehler darf die Liste
  // NICHT verdecken — kompakte Meldung oberhalb der weiterhin sichtbaren Liste.
  const [actionError, setActionError] = useState("");

  // Mounted-/Abort-Schutz: keine State-Updates nach Unmount, laufender Request
  // wird beim Verlassen der Seite abgebrochen (bestehendes Muster wie in
  // NewShipmentPage/AddressBookPage).
  const mountedRef = useRef(true);
  const abortRef = useRef(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const load = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError("");
    getDrafts({ limit: PAGE_LIMIT }, { signal: ac.signal })
      .then(async (r) => {
        if (!mountedRef.current) return;
        if (r.status === 401 || r.status === 403) { setLoading(false); return; }
        let d = null; try { d = await r.json(); } catch { d = null; }
        if (!r.ok) throw new Error("Entwürfe konnten nicht geladen werden.");
        setItems(Array.isArray(d?.items) ? d.items : []);
        setNextCursor(d?.nextCursor ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        if (!mountedRef.current) return;
        setError(e?.message || "Entwürfe konnten nicht geladen werden.");
        setLoading(false);
      });
  }, []);

  // Frische Initialabfrage bei jedem (Wieder-)Öffnen der Seite — keine Cache-Architektur.
  useEffect(() => { load(); }, [load]);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => { if (mountedRef.current) setSuccessMsg((cur) => (cur === msg ? "" : cur)); }, 4000);
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setLoadMoreError("");
    try {
      const r = await getDrafts({ limit: PAGE_LIMIT, cursor: nextCursor });
      if (r.status === 401 || r.status === 403) { if (mountedRef.current) setLoadingMore(false); return; }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!r.ok) throw new Error("Weitere Entwürfe konnten nicht geladen werden.");
      if (!mountedRef.current) return;
      setItems((prev) => appendDraftPage(prev, Array.isArray(d?.items) ? d.items : []));
      setNextCursor(d?.nextCursor ?? null);
    } catch (e) {
      if (mountedRef.current) setLoadMoreError(e?.message || "Weitere Entwürfe konnten nicht geladen werden.");
    }
    if (mountedRef.current) setLoadingMore(false);
  };

  const onConfirmDelete = async () => {
    const target = deleteTarget;
    setDeletingId(target.id); setActionError("");
    try {
      const r = await deleteDraft(target.id);
      if (r.status === 401 || r.status === 403) { if (mountedRef.current) { setDeletingId(null); setDeleteTarget(null); } return; }
      if (r.ok) {
        if (mountedRef.current) {
          setItems((prev) => removeDraftFromList(prev, target.id));
          setDeleteTarget(null);
          showSuccess("Entwurf gelöscht.");
        }
        return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      throw new Error(mapDraftDeleteErrorToMessage(d?.code));
    } catch (e) {
      // Element bleibt in der Liste — nur eine kompakte Meldung, kein Ersetzen
      // der Liste durch den Fehlerzustand (das ist ausschließlich dem initialen
      // Ladefehler vorbehalten).
      if (mountedRef.current) setActionError(e?.message || "Der Entwurf konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.");
    }
    if (mountedRef.current) setDeletingId(null);
  };

  return (
    <>
      <PremiumBackground variant="neutral" />
      <div className="container dft-wrap">
        <DraftsHeader onNewShipment={onNewShipment} />

        {successMsg && <div className="alert alert-success mb-16" role="status"><span>{successMsg}</span></div>}
        {actionError && <div className="alert alert-error mb-16" role="alert"><span>{actionError}</span></div>}

        <DraftsList
          items={items} loading={loading} error={error} onRetry={load} onCreate={onNewShipment}
          hasMore={!!nextCursor} loadingMore={loadingMore} loadMoreError={loadMoreError} onLoadMore={loadMore}
          deletingId={deletingId} onDelete={setDeleteTarget}
        />
      </div>

      <DraftDeleteConfirmDialog
        draft={deleteTarget} busy={deletingId === deleteTarget?.id}
        onCancel={() => setDeleteTarget(null)} onConfirm={onConfirmDelete}
      />
    </>
  );
}
