import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { DraftsHeader } from "../components/drafts/DraftsHeader";
import { DraftsList } from "../components/drafts/DraftsList";
import { DraftDeleteConfirmDialog } from "../components/drafts/DraftDeleteConfirmDialog";
import { getDrafts, deleteDraft } from "../api/client";
import { getFormDrafts, getFormDraft, deleteFormDraft } from "../api/formDraftsApi";
import { removeDraftFromList, mapDraftDeleteErrorToMessage } from "../utils/draftsView.mjs";
import {
  FORM_DRAFT_KIND, mergeDraftSources, appendFormDraftPage, removeDraftById, combinedDraftKey,
  buildResumePayload, isValidResumeDraft, mapFormDraftDeleteErrorToMessage, resolveCombinedEmpty,
} from "../utils/formDraftsView.mjs";

const PAGE_LIMIT = 20;

// Entwürfe — kombinierte Hauptseite. Zeigt BEIDE Entwurfstypen:
//  • Formularentwürfe (kind:"form")   — GET /api/kunde/form-drafts (früh, noch
//    nicht berechnet; „Fortsetzen" lädt den Snapshot in „Neue Sendung").
//  • Shipment-Drafts (kind:"shipment") — GET /api/kunde/drafts (bereits berechnet).
// Getrennte Cursor je Quelle, parallele Ladung, deterministische Zusammenführung
// (mergeDraftSources). Kein Fortsetzen/Rehydration hier — das übernimmt
// NewShipmentPage; diese Seite navigiert nur mit dem Resume-Payload dorthin.
export default function DraftsPage({ onNewShipment, onResumeFormDraft, utility }) {
  const [formItems, setFormItems] = useState([]);
  const [shipmentItems, setShipmentItems] = useState([]);
  const [formCursor, setFormCursor] = useState(null);
  const [shipmentCursor, setShipmentCursor] = useState(null);
  const [formOk, setFormOk] = useState(true);
  const [shipmentOk, setShipmentOk] = useState(true);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");            // BEIDE Quellen fehlgeschlagen → Vollfehler
  const [partialError, setPartialError] = useState(""); // nur eine Quelle → dezenter Teilfehler
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null); // Kombischlüssel (kind:id), kollisionssicher
  const [resumingKey, setResumingKey] = useState(null);
  const [successMsg, setSuccessMsg] = useState("");
  // Getrennt vom initialen Ladefehler: Aktionsfehler (Löschen/Fortsetzen) dürfen
  // die Liste NICHT verdecken — kompakte Meldung oberhalb der weiterhin sichtbaren Liste.
  const [actionError, setActionError] = useState("");

  const mountedRef = useRef(true);
  const abortRef = useRef(null);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ── Rohe Seitenlader je Quelle (auth:true; 401/403 → zentraler Redirect) ──
  const loadFormPage = async (cursor, signal) => {
    const r = await getFormDrafts({ limit: PAGE_LIMIT, cursor }, { signal });
    if (r.status === 401 || r.status === 403) return { auth: true };
    let d = null; try { d = await r.json(); } catch { d = null; }
    if (!r.ok) throw new Error("form load failed");
    return { items: Array.isArray(d?.drafts) ? d.drafts : [], cursor: d?.nextCursor ?? null };
  };
  const loadShipmentPage = async (cursor, signal) => {
    const r = await getDrafts({ limit: PAGE_LIMIT, cursor }, { signal });
    if (r.status === 401 || r.status === 403) return { auth: true };
    let d = null; try { d = await r.json(); } catch { d = null; }
    if (!r.ok) throw new Error("shipment load failed");
    return { items: Array.isArray(d?.items) ? d.items : [], cursor: d?.nextCursor ?? null };
  };

  // Initiale (Neu-)Ladung: beide Quellen parallel. Teilfehler blockiert die
  // erfolgreiche Quelle nicht; nur beide fehlgeschlagen → Vollfehler + Retry.
  const load = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(""); setPartialError("");
    Promise.allSettled([loadFormPage(null, ac.signal), loadShipmentPage(null, ac.signal)])
      .then(([formRes, shipRes]) => {
        if (!mountedRef.current || ac.signal.aborted) return;
        const fAuth = formRes.status === "fulfilled" && formRes.value?.auth;
        const sAuth = shipRes.status === "fulfilled" && shipRes.value?.auth;
        if (fAuth || sAuth) { setLoading(false); return; } // zentraler Auth-Redirect übernimmt

        const fOk = formRes.status === "fulfilled" && !formRes.value?.auth;
        const sOk = shipRes.status === "fulfilled" && !shipRes.value?.auth;

        if (fOk) { setFormItems(formRes.value.items); setFormCursor(formRes.value.cursor); }
        if (sOk) { setShipmentItems(shipRes.value.items); setShipmentCursor(shipRes.value.cursor); }
        setFormOk(fOk); setShipmentOk(sOk);

        if (!fOk && !sOk) setError("Entwürfe konnten nicht geladen werden.");
        else if (!fOk || !sOk) setPartialError("Ein Teil deiner Entwürfe konnte nicht geladen werden.");
        setLoading(false);
      });
  }, []);
  useEffect(() => { load(); }, [load]);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => { if (mountedRef.current) setSuccessMsg((cur) => (cur === msg ? "" : cur)); }, 4000);
  };

  // „Weitere laden": für jede Quelle mit vorhandenem Cursor die nächste Seite;
  // je Quelle deduplizieren; Teilfehler erhält die Liste + Cursor der Quelle.
  const loadMore = async () => {
    if ((!formCursor && !shipmentCursor) || loadingMore) return;
    setLoadingMore(true); setLoadMoreError("");
    const tasks = [];
    if (formCursor) tasks.push(loadFormPage(formCursor).then((r) => ({ src: "form", r })).catch(() => ({ src: "form", err: true })));
    if (shipmentCursor) tasks.push(loadShipmentPage(shipmentCursor).then((r) => ({ src: "shipment", r })).catch(() => ({ src: "shipment", err: true })));
    const results = await Promise.all(tasks);
    if (!mountedRef.current) return;
    let anyFail = false, auth = false;
    for (const res of results) {
      if (res.err) { anyFail = true; continue; }
      if (res.r?.auth) { auth = true; continue; }
      if (res.src === "form") { setFormItems((prev) => appendFormDraftPage(prev, res.r.items)); setFormCursor(res.r.cursor); }
      else { setShipmentItems((prev) => appendFormDraftPage(prev, res.r.items)); setShipmentCursor(res.r.cursor); }
    }
    if (!auth && anyFail) setLoadMoreError("Ein Teil der weiteren Entwürfe konnte nicht geladen werden.");
    setLoadingMore(false);
  };

  // Löschen wählt anhand kind den richtigen Endpunkt (getrennte Namensräume!).
  const onConfirmDelete = async () => {
    const target = deleteTarget;
    if (!target) return;
    const key = combinedDraftKey(target);
    const isForm = target.kind === FORM_DRAFT_KIND;
    setDeletingKey(key); setActionError("");
    try {
      const r = isForm ? await deleteFormDraft(target.id) : await deleteDraft(target.id);
      if (r.status === 401 || r.status === 403) { if (mountedRef.current) { setDeletingKey(null); setDeleteTarget(null); } return; }
      if (r.ok) {
        if (mountedRef.current) {
          if (isForm) setFormItems((prev) => removeDraftById(prev, target.id));
          else setShipmentItems((prev) => removeDraftFromList(prev, target.id));
          setDeleteTarget(null);
          showSuccess("Entwurf gelöscht.");
        }
        return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      throw new Error(isForm ? mapFormDraftDeleteErrorToMessage(d?.code) : mapDraftDeleteErrorToMessage(d?.code));
    } catch (e) {
      // Element bleibt in der Liste — nur eine kompakte Meldung.
      if (mountedRef.current) setActionError(e?.message || "Der Entwurf konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.");
    }
    if (mountedRef.current) setDeletingKey(null);
  };

  // „Fortsetzen": Detail-Snapshot laden, validieren, dann zur „Neue Sendung"-
  // Seite navigieren (Elternteil übernimmt State + Seitenwechsel). Kein Preis,
  // kein Tarif, keine BookingPage — nur der Formular-Snapshot.
  const onResume = async (draft) => {
    if (resumingKey || deletingKey) return; // Doppelklick / paralleles Löschen sperren
    const key = combinedDraftKey(draft);
    setResumingKey(key); setActionError("");
    try {
      const r = await getFormDraft(draft.id);
      if (r.status === 401 || r.status === 403) { if (mountedRef.current) setResumingKey(null); return; }
      if (r.status === 404) {
        if (mountedRef.current) {
          setFormItems((prev) => removeDraftById(prev, draft.id));
          setResumingKey(null);
          setActionError("Dieser Entwurf ist nicht mehr verfügbar.");
        }
        return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      const payload = buildResumePayload(d?.draft);
      if (!r.ok || !isValidResumeDraft(payload)) throw new Error("Der Entwurf konnte nicht geladen werden. Bitte versuchen Sie es erneut.");
      onResumeFormDraft?.(payload); // navigiert weg → DraftsPage wird unmountet
    } catch (e) {
      if (mountedRef.current) { setResumingKey(null); setActionError(e?.message || "Der Entwurf konnte nicht geladen werden. Bitte versuchen Sie es erneut."); }
    }
  };

  const items = useMemo(() => mergeDraftSources(formItems, shipmentItems), [formItems, shipmentItems]);
  const hasMore = !!formCursor || !!shipmentCursor;
  const canShowEmpty = resolveCombinedEmpty({ formOk, shipmentOk, formCount: formItems.length, shipmentCount: shipmentItems.length });
  const dialogBusy = !!deleteTarget && deletingKey === combinedDraftKey(deleteTarget);

  return (
    <>
      <div className="container dft-wrap">
        <DraftsHeader onNewShipment={onNewShipment} utility={utility} />

        {successMsg && <div className="alert alert-success mb-16" role="status"><span>{successMsg}</span></div>}
        {partialError && (
          <div className="alert alert-error mb-16" role="alert">
            <span style={{ flex: 1 }}>{partialError}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={load}>Erneut versuchen</button>
          </div>
        )}
        {actionError && <div className="alert alert-error mb-16" role="alert"><span>{actionError}</span></div>}

        <DraftsList
          items={items} loading={loading} error={error} onRetry={load} onCreate={onNewShipment}
          canShowEmpty={canShowEmpty}
          hasMore={hasMore} loadingMore={loadingMore} loadMoreError={loadMoreError} onLoadMore={loadMore}
          deletingKey={deletingKey} resumingKey={resumingKey} onDelete={setDeleteTarget} onResume={onResume}
        />
      </div>

      <DraftDeleteConfirmDialog
        draft={deleteTarget} busy={dialogBusy}
        onCancel={() => setDeleteTarget(null)} onConfirm={onConfirmDelete}
      />
    </>
  );
}
