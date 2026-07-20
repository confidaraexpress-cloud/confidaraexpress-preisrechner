import React, { useEffect, useRef, useState, useCallback } from "react";
import { PremiumBackground } from "../components/dashboard/PremiumBackground";
import { AddressBookHeader } from "../components/addressbook/AddressBookHeader";
import { AddressBookTabs } from "../components/addressbook/AddressBookTabs";
import { AddressBookToolbar } from "../components/addressbook/AddressBookToolbar";
import { AddressList } from "../components/addressbook/AddressList";
import { AddressFormDrawer } from "../components/addressbook/AddressFormDrawer";
import { AddressArchiveConfirmDialog } from "../components/addressbook/AddressArchiveConfirmDialog";
import { NewShipmentRoleDialog } from "../components/addressbook/NewShipmentRoleDialog";
import { getAddresses, createAddress, updateAddress, archiveAddress, restoreAddress } from "../api/addressBookApi";
import {
  TAB_SENDER, ROLE_SENDER, ROLE_RECIPIENT,
  addressListStateKey, appendPageResults, resolveEmptyStateKind, mapAddressErrorToMessage,
  emptyAddressForm, addressToFormValues, prepareDuplicateFormValues, isArchived,
  resolveNewShipmentRole, mapAddressToShipmentFormPatch, applyAddressMutation, normalizeAddressForm,
} from "../utils/addressBookView.mjs";

const PAGE_LIMIT = 20;

// Adressbuch — Hauptseite. Hält den gesamten Seiten-State (Tab/Filter/Suche,
// geladene Adressen + Cursor, Drawer-/Dialogzustand). Alle API-Aufrufe laufen
// über addressBookApi.js (zentrales apiFetch, Auth/401-Handling unverändert).
export default function AddressBookPage({ onUseForNewShipment }) {
  const [tab, setTab] = useState(TAB_SENDER);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  const [drawer, setDrawer] = useState(null); // { mode, initialForm, archived, editingId } | null
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [roleDialogAddress, setRoleDialogAddress] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const reqSeq = useRef(0);
  const reqAbort = useRef(null);
  const stateKeyRef = useRef("");

  // Suche debounced (~300ms) — reine Eingabeverzögerung, kein Request pro Tastendruck.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const showSuccess = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg((cur) => (cur === msg ? "" : cur)), 4000);
  };

  // Erste Seite laden (Such-/Filterwechsel setzt Cursor + Liste zurück). Race-
  // Schutz nach bestehendem Muster (calcSeq/calcAbort in NewShipmentPage):
  // laufenden Request abbrechen, nur die Antwort des jeweils neuesten Aufrufs
  // darf den State verändern.
  const load = useCallback(() => {
    const seq = ++reqSeq.current;
    if (reqAbort.current) reqAbort.current.abort();
    const ac = new AbortController();
    reqAbort.current = ac;
    setLoading(true); setError("");
    getAddresses({ tab, q: debouncedQ, favoritesOnly, includeArchived: showArchived, cursor: null, limit: PAGE_LIMIT }, { signal: ac.signal })
      .then(async (r) => {
        if (seq !== reqSeq.current) return;
        if (r.status === 401 || r.status === 403) { setLoading(false); return; }
        let d = null; try { d = await r.json(); } catch { d = null; }
        if (!r.ok) throw new Error(mapAddressErrorToMessage(d?.code));
        setItems(Array.isArray(d?.items) ? d.items : []);
        setNextCursor(d?.nextCursor ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        if (seq !== reqSeq.current) return;
        setError(e?.message || "Adressen konnten nicht geladen werden.");
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, debouncedQ, favoritesOnly, showArchived]);

  // Nur bei tatsächlichem Such-/Filterwechsel neu laden (Cursor-Reset); ein
  // reiner Re-Render (z. B. durch Drawer-Öffnen) löst keinen neuen Request aus.
  useEffect(() => {
    const key = addressListStateKey({ tab, q: debouncedQ, favoritesOnly, includeArchived: showArchived });
    if (key === stateKeyRef.current) return;
    stateKeyRef.current = key;
    load();
  }, [tab, debouncedQ, favoritesOnly, showArchived, load]);

  useEffect(() => () => { if (reqAbort.current) reqAbort.current.abort(); }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setLoadMoreError("");
    try {
      const r = await getAddresses({ tab, q: debouncedQ, favoritesOnly, includeArchived: showArchived, cursor: nextCursor, limit: PAGE_LIMIT });
      if (r.status === 401 || r.status === 403) { setLoadingMore(false); return; }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!r.ok) throw new Error(mapAddressErrorToMessage(d?.code));
      setItems((prev) => appendPageResults(prev, Array.isArray(d?.items) ? d.items : []));
      setNextCursor(d?.nextCursor ?? null);
    } catch (e) {
      setLoadMoreError(e?.message || "Weitere Adressen konnten nicht geladen werden.");
    }
    setLoadingMore(false);
  };

  const emptyKind = resolveEmptyStateKind({
    resultCount: items.length, hasQuery: debouncedQ.length > 0, favoritesOnly, showArchived,
  });

  // ── Drawer öffnen (Create/Edit/Duplicate) ─────────────────────────────────
  const openCreate = () => setDrawer({ mode: "create", initialForm: emptyAddressForm(tab === TAB_SENDER ? ROLE_SENDER : ROLE_RECIPIENT), archived: false, editingId: null });
  const openEdit = (address) => setDrawer({ mode: "edit", initialForm: addressToFormValues(address), archived: isArchived(address), editingId: address.id });
  const openDuplicate = (address) => setDrawer({ mode: "duplicate", initialForm: prepareDuplicateFormValues(address), archived: false, editingId: null });
  const closeDrawer = () => setDrawer(null);

  const onSubmitDrawer = async (payload) => {
    try {
      const r = drawer.mode === "edit" ? await updateAddress(drawer.editingId, payload) : await createAddress(payload);
      if (r.status === 401 || r.status === 403) return { ok: false };
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!r.ok) return { ok: false, message: mapAddressErrorToMessage(d?.code) };
      if (drawer.mode === "edit") setItems((prev) => applyAddressMutation(prev, d, "update"));
      else load(); // neu erstellt → aktuelle Ansicht sicher neu laden (Reihenfolge bleibt serverseitig autoritativ)
      showSuccess(drawer.mode === "edit" ? "Adresse aktualisiert." : "Adresse gespeichert.");
      return { ok: true };
    } catch {
      return { ok: false, message: "Die Adresse konnte nicht gespeichert werden. Bitte versuchen Sie es erneut." };
    }
  };

  // ── Quick-Mutationen (Favorit/Standard): sichere Mutation + Ladeindikator,
  // erst NACH Server-Bestätigung wird der Eintrag ersetzt (kein Optimistic-UI). ──
  const applyServerOrFallback = (address, d, fallbackPatch) => (d && d.id != null ? d : { ...address, ...fallbackPatch });

  const quickUpdate = async (address, patch, successText) => {
    setBusyId(address.id); setActionError("");
    try {
      const payload = normalizeAddressForm({ ...addressToFormValues(address), ...patch });
      const r = await updateAddress(address.id, payload);
      if (r.status === 401 || r.status === 403) { setBusyId(null); return; }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!r.ok) { setActionError(mapAddressErrorToMessage(d?.code)); setBusyId(null); return; }
      setItems((prev) => applyAddressMutation(prev, applyServerOrFallback(address, d, patch), "update"));
      showSuccess(successText);
    } catch {
      setActionError("Die Änderung konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.");
    }
    setBusyId(null);
  };
  const onToggleFavorite = (address) => quickUpdate(address, { favorite: !address.favorite }, address.favorite ? "Favorit entfernt." : "Als Favorit markiert.");
  const onSetDefaultSender = (address) => quickUpdate(address, { isDefaultSender: true }, "Standard-Absender gesetzt.");
  const onSetDefaultRecipient = (address) => quickUpdate(address, { isDefaultRecipient: true }, "Standard-Empfänger gesetzt.");

  // ── Archivieren (Bestätigungsdialog) / Wiederherstellen ───────────────────
  const onArchiveConfirmed = async () => {
    const address = archiveTarget;
    setArchiveBusy(true); setActionError("");
    try {
      const r = await archiveAddress(address.id);
      if (r.status === 401 || r.status === 403) { setArchiveBusy(false); return; }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!r.ok) { setActionError(mapAddressErrorToMessage(d?.code)); setArchiveBusy(false); setArchiveTarget(null); return; }
      const updated = applyServerOrFallback(address, d, { archivedAt: new Date().toISOString() });
      setItems((prev) => applyAddressMutation(prev, updated, "archive"));
      showSuccess("Adresse archiviert. Sie kann jederzeit wiederhergestellt werden.");
    } catch {
      setActionError("Die Adresse konnte nicht archiviert werden. Bitte versuchen Sie es erneut.");
    }
    setArchiveBusy(false); setArchiveTarget(null);
  };

  const onRestore = async (address) => {
    setBusyId(address.id); setActionError("");
    try {
      const r = await restoreAddress(address.id);
      if (r.status === 401 || r.status === 403) { setBusyId(null); return; }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!r.ok) { setActionError(mapAddressErrorToMessage(d?.code)); setBusyId(null); return; }
      const updated = applyServerOrFallback(address, d, { archivedAt: null });
      setItems((prev) => applyAddressMutation(prev, updated, "restore"));
      showSuccess("Adresse wiederhergestellt.");
    } catch {
      setActionError("Die Adresse konnte nicht wiederhergestellt werden. Bitte versuchen Sie es erneut.");
    }
    setBusyId(null);
  };

  // ── „Neue Sendung" ─────────────────────────────────────────────────────────
  const handleNewShipment = (address) => {
    const res = resolveNewShipmentRole(address);
    if (res.type === "blocked") return; // archiviert — Aktion wird ohnehin nicht angeboten
    if (res.type === "direct") { onUseForNewShipment(mapAddressToShipmentFormPatch(address, res.role === "sender" ? "s" : "r")); return; }
    if (res.type === "choose") setRoleDialogAddress(address);
  };
  const handleChooseRole = (role) => {
    onUseForNewShipment(mapAddressToShipmentFormPatch(roleDialogAddress, role === "sender" ? "s" : "r"));
    setRoleDialogAddress(null);
  };

  const rowActions = {
    onEdit: openEdit,
    onDuplicate: openDuplicate,
    onToggleFavorite,
    onSetDefaultSender,
    onSetDefaultRecipient,
    onNewShipment: handleNewShipment,
    onArchive: setArchiveTarget,
    onRestore,
  };

  return (
    <>
      <PremiumBackground variant="neutral" />
      <div className="container abk-wrap">
        <AddressBookHeader onCreate={openCreate} />

        {successMsg && <div className="alert alert-success mb-16" role="status"><span>{successMsg}</span></div>}
        {actionError && <div className="alert alert-error mb-16" role="alert"><span>{actionError}</span></div>}

        <AddressBookTabs tab={tab} onChange={setTab} />
        <AddressBookToolbar
          q={q} onQChange={setQ} searching={loading && items.length > 0}
          favoritesOnly={favoritesOnly} onToggleFavorites={setFavoritesOnly}
          showArchived={showArchived} onToggleArchived={setShowArchived}
        />

        <AddressList
          items={items} loading={loading} error={error} onRetry={load}
          emptyKind={emptyKind} tab={tab} onCreate={openCreate}
          hasMore={!!nextCursor} loadingMore={loadingMore} loadMoreError={loadMoreError} onLoadMore={loadMore}
          busyId={busyId} rowActions={rowActions}
        />
      </div>

      {drawer && (
        <AddressFormDrawer
          mode={drawer.mode} initialForm={drawer.initialForm} archived={drawer.archived}
          onSubmit={onSubmitDrawer} onClose={closeDrawer}
        />
      )}
      <AddressArchiveConfirmDialog
        address={archiveTarget} busy={archiveBusy}
        onCancel={() => setArchiveTarget(null)} onConfirm={onArchiveConfirmed}
      />
      <NewShipmentRoleDialog
        address={roleDialogAddress}
        onCancel={() => setRoleDialogAddress(null)} onChoose={handleChooseRole}
      />
    </>
  );
}
