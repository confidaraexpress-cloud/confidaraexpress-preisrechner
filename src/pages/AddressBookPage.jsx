import React, { useEffect, useRef, useState, useCallback } from "react";
import { AddressBookHeader } from "../components/addressbook/AddressBookHeader";
import { AddressBookTabs } from "../components/addressbook/AddressBookTabs";
import { AddressBookToolbar } from "../components/addressbook/AddressBookToolbar";
import { AddressList } from "../components/addressbook/AddressList";
import { AddressFormDrawer } from "../components/addressbook/AddressFormDrawer";
import { AddressDeleteConfirmDialog } from "../components/addressbook/AddressDeleteConfirmDialog";
import { NewShipmentRoleDialog } from "../components/addressbook/NewShipmentRoleDialog";
import { getAddresses, createAddress, updateAddress, deleteAddress } from "../api/addressBookApi";
import {
  TAB_SENDER, ROLE_SENDER, ROLE_RECIPIENT,
  addressListStateKey, appendPageResults, resolveEmptyStateKind, mapAddressErrorToMessage,
  emptyAddressForm, addressToFormValues, prepareDuplicateFormValues,
  resolveNewShipmentRole, mapAddressToShipmentFormPatch, applyAddressMutation, normalizeAddressForm,
} from "../utils/addressBookView.mjs";

const PAGE_LIMIT = 20;

// Adressbuch — Hauptseite. Hält den gesamten Seiten-State (Tab/Filter/Suche,
// geladene Adressen + Cursor, Drawer-/Dialogzustand). Alle API-Aufrufe laufen
// über addressBookApi.js (zentrales apiFetch, Auth/401-Handling unverändert).
export default function AddressBookPage({ onUseForNewShipment, utility }) {
  const [tab, setTab] = useState(TAB_SENDER);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);

  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  const [drawer, setDrawer] = useState(null); // { mode, initialForm, editingId } | null
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
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
    getAddresses({ tab, q: debouncedQ, favoritesOnly, cursor: null, limit: PAGE_LIMIT }, { signal: ac.signal })
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
  }, [tab, debouncedQ, favoritesOnly]);

  // Nur bei tatsächlichem Such-/Filterwechsel neu laden (Cursor-Reset); ein
  // reiner Re-Render (z. B. durch Drawer-Öffnen) löst keinen neuen Request aus.
  useEffect(() => {
    const key = addressListStateKey({ tab, q: debouncedQ, favoritesOnly });
    if (key === stateKeyRef.current) return;
    stateKeyRef.current = key;
    load();
  }, [tab, debouncedQ, favoritesOnly, load]);

  useEffect(() => () => { if (reqAbort.current) reqAbort.current.abort(); }, []);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true); setLoadMoreError("");
    try {
      const r = await getAddresses({ tab, q: debouncedQ, favoritesOnly, cursor: nextCursor, limit: PAGE_LIMIT });
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
    resultCount: items.length, hasQuery: debouncedQ.length > 0, favoritesOnly,
  });

  // ── Drawer öffnen (Create/Edit/Duplicate) ─────────────────────────────────
  const openCreate = () => setDrawer({ mode: "create", initialForm: emptyAddressForm(tab === TAB_SENDER ? ROLE_SENDER : ROLE_RECIPIENT), editingId: null });
  const openEdit = (address) => setDrawer({ mode: "edit", initialForm: addressToFormValues(address), editingId: address.id });
  const openDuplicate = (address) => setDrawer({ mode: "duplicate", initialForm: prepareDuplicateFormValues(address), editingId: null });
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

  // ── Löschen (Bestätigungsdialog) ──────────────────────────────────────────
  // Echte, dauerhafte Löschung. Bei Fehler bleibt der Dialog offen (Fehler wird
  // dort mit role="alert" angezeigt), die Adresse bleibt sichtbar, ein erneuter
  // Versuch ist möglich — kein optimistisches Entfernen vor Server-Erfolg. Busy
  // schützt gegen Doppelklick (Dialog-Buttons + Backdrop/Escape sind gesperrt).
  const openDelete = (address) => { setDeleteError(""); setDeleteTarget(address); };
  const onDeleteConfirmed = async () => {
    const address = deleteTarget;
    if (!address || deleteBusy) return;
    setDeleteBusy(true); setDeleteError("");
    try {
      const r = await deleteAddress(address.id);
      if (r.status === 401 || r.status === 403) { setDeleteBusy(false); return; }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (!r.ok) { setDeleteError(mapAddressErrorToMessage(d?.code)); setDeleteBusy(false); return; }
      // Erfolg: Adresse lokal entfernen, Dialog schließen, Erfolgsmeldung.
      setItems((prev) => applyAddressMutation(prev, address, "delete"));
      setDeleteBusy(false); setDeleteTarget(null);
      showSuccess("Adresse wurde gelöscht.");
      // Hat das Backend einen neuen Standard-Absender bestimmt, spiegelt ein
      // kontrollierter Refetch den geänderten Standardstatus der übrigen Zeilen.
      if (d?.newDefaultSenderId != null) load();
    } catch {
      setDeleteError("Die Adresse konnte nicht gelöscht werden. Bitte versuchen Sie es erneut.");
      setDeleteBusy(false);
    }
  };

  // ── „Neue Sendung" ─────────────────────────────────────────────────────────
  const handleNewShipment = (address) => {
    const res = resolveNewShipmentRole(address);
    if (res.type === "blocked") return; // unbekannte Rolle — Aktion wird nicht angeboten
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
    onDelete: openDelete,
  };

  return (
    <>
      <AddressBookHeader onCreate={openCreate} utility={utility} />

      <div className="page-body">
        {successMsg && <div className="alert alert-success mb-16" role="status"><span>{successMsg}</span></div>}
        {actionError && <div className="alert alert-error mb-16" role="alert"><span>{actionError}</span></div>}

        <AddressBookTabs tab={tab} onChange={setTab} />
        <AddressBookToolbar
          q={q} onQChange={setQ} searching={loading && items.length > 0}
          favoritesOnly={favoritesOnly} onToggleFavorites={setFavoritesOnly}
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
          mode={drawer.mode} initialForm={drawer.initialForm}
          onSubmit={onSubmitDrawer} onClose={closeDrawer}
        />
      )}
      <AddressDeleteConfirmDialog
        address={deleteTarget} busy={deleteBusy} error={deleteError}
        onCancel={() => { if (!deleteBusy) { setDeleteTarget(null); setDeleteError(""); } }}
        onConfirm={onDeleteConfirmed}
      />
      <NewShipmentRoleDialog
        address={roleDialogAddress}
        onCancel={() => setRoleDialogAddress(null)} onChoose={handleChooseRole}
      />
    </>
  );
}
