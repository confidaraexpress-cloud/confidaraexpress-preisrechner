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
  addressListStateKey, appendPageResults, resolveEmptyStateKind,
  emptyAddressForm, addressToFormValues, prepareDuplicateFormValues,
  resolveNewShipmentRole, mapAddressToShipmentFormPatch, applyAddressMutation, applyPromotedDefaultSender,
  ADDRESS_OPERATIONS, addressFailureMessage, addressExceptionMessage, addressServerFieldErrors,
} from "../utils/addressBookView.mjs";
import { adressSucheStart } from "../utils/kundenSuche.mjs";

// Fehlerantwort lesen, ohne je einen Rohwert weiterzugeben: nur Status, Code und Feldname.
async function fehlerAusAntwort(r) {
  let d = null;
  try { d = await r.json(); } catch { d = null; }
  return { status: r.status, code: d?.code, field: d?.field };
}

const PAGE_LIMIT = 20;

// Adressbuch — Hauptseite. Hält den gesamten Seiten-State (Tab/Filter/Suche,
// geladene Adressen + Cursor, Drawer-/Dialogzustand). Alle API-Aufrufe laufen
// über addressBookApi.js (zentrales apiFetch, Auth/401-Handling unverändert).
export default function AddressBookPage({ onUseForNewShipment, utility, sucheFokus = null }) {
  // Kopfsuche (Premium-Redesign): ein Adresstreffer öffnet das Adressbuch im Reiter seiner Rolle, mit seiner Firma
  // (sonst dem Namen) als Suche — dieselbe Suche wie über das Feld der Seite.
  const sucheStart = adressSucheStart(sucheFokus);
  const [tab, setTab] = useState(sucheStart ? sucheStart.tab : TAB_SENDER);
  const [q, setQ] = useState(sucheStart ? sucheStart.q : "");
  const [debouncedQ, setDebouncedQ] = useState(sucheStart ? sucheStart.q.trim() : "");
  useEffect(() => {
    const start = adressSucheStart(sucheFokus);
    if (!start) return;
    setTab(start.tab);
    setQ(start.q);
  }, [sucheFokus]);
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
        if (!r.ok) {
          // Ein Fehler beim LADEN heißt nie „konnte nicht gespeichert werden“ (Audit P7).
          const f = await fehlerAusAntwort(r);
          if (seq !== reqSeq.current) return;
          setError(addressFailureMessage(ADDRESS_OPERATIONS.LOAD, f));
          setLoading(false);
          return;
        }
        let d = null; try { d = await r.json(); } catch { d = null; }
        if (seq !== reqSeq.current) return;
        setItems(Array.isArray(d?.items) ? d.items : []);
        setNextCursor(d?.nextCursor ?? null);
        setLoading(false);
      })
      .catch((e) => {
        if (e?.name === "AbortError") return;
        if (seq !== reqSeq.current) return;
        // Netzfehler oder Zeitlimit: nie der Rohtext des Browsers („Failed to fetch“).
        setError(addressExceptionMessage(ADDRESS_OPERATIONS.LOAD, e));
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
      if (!r.ok) {
        setLoadMoreError(addressFailureMessage(ADDRESS_OPERATIONS.LOAD_MORE, await fehlerAusAntwort(r)));
      } else {
        let d = null; try { d = await r.json(); } catch { d = null; }
        setItems((prev) => appendPageResults(prev, Array.isArray(d?.items) ? d.items : []));
        setNextCursor(d?.nextCursor ?? null);
      }
    } catch (e) {
      setLoadMoreError(addressExceptionMessage(ADDRESS_OPERATIONS.LOAD_MORE, e));
    }
    setLoadingMore(false);
  };

  const emptyKind = resolveEmptyStateKind({
    resultCount: items.length, hasQuery: debouncedQ.length > 0, favoritesOnly,
  });
  // Nachweislich leerer Bereich (fertig geladen, kein Fehler, keine Suche, kein
  // Filter): dann trägt der Leerzustand die eine Hauptaktion „anlegen".
  const bereichLeer = !loading && !error && items.length === 0 && emptyKind === "none";

  // ── Drawer öffnen (Create/Edit/Duplicate) ─────────────────────────────────
  const openCreate = () => setDrawer({ mode: "create", initialForm: emptyAddressForm(tab === TAB_SENDER ? ROLE_SENDER : ROLE_RECIPIENT), editingId: null });
  const openEdit = (address) => setDrawer({ mode: "edit", initialForm: addressToFormValues(address), editingId: address.id });
  const openDuplicate = (address) => setDrawer({ mode: "duplicate", initialForm: prepareDuplicateFormValues(address), editingId: null });
  const closeDrawer = () => setDrawer(null);

  // Die sichtbare Ansicht — eine geänderte Adresse, die nicht mehr hineingehört (Rolle gewechselt,
  // Favorit entfernt unter „Nur Favoriten“), verschwindet aus ihr (applyAddressMutation).
  const ansicht = { tab, favoritesOnly };

  const onSubmitDrawer = async (payload) => {
    try {
      const r = drawer.mode === "edit" ? await updateAddress(drawer.editingId, payload) : await createAddress(payload);
      if (r.status === 401 || r.status === 403) return { ok: false };
      if (!r.ok) {
        // Feldbezogene Serverfehler (`field`) stehen am Feld, der Satz darüber nennt den Vorgang.
        const f = await fehlerAusAntwort(r);
        return { ok: false, message: addressFailureMessage(ADDRESS_OPERATIONS.SAVE, f), fieldErrors: addressServerFieldErrors(f) };
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      if (drawer.mode === "edit" && d && d.id != null) setItems((prev) => applyAddressMutation(prev, d, "update", ansicht));
      else load(); // neu erstellt → aktuelle Ansicht sicher neu laden (Reihenfolge bleibt serverseitig autoritativ)
      showSuccess(drawer.mode === "edit" ? "Adresse aktualisiert." : "Adresse gespeichert.");
      return { ok: true };
    } catch (e) {
      return { ok: false, message: addressExceptionMessage(ADDRESS_OPERATIONS.SAVE, e) };
    }
  };

  // ── Quick-Mutationen (Favorit/Standard): sichere Mutation + Ladeindikator,
  // erst NACH Server-Bestätigung wird der Eintrag ersetzt (kein Optimistic-UI). ──
  const applyServerOrFallback = (address, d, fallbackPatch) => (d && d.id != null ? d : { ...address, ...fallbackPatch });

  // Teil-Update (Audit P7): gesendet wird NUR die Änderung — { favorite }, { isDefaultSender: true }
  // oder { isDefaultRecipient: true }. Bis 2026-10 ging das ganze Objekt aus dem lokalen Stand mit;
  // trug die Zeile nach einem Standardwechsel noch das alte isDefaultSender: true, machte ein
  // Favoriten-Klick sie still wieder zum Standard. Der Server prüft den Versandkontakt weiter gegen
  // den Zustand nach der Änderung (A3).
  const quickUpdate = async (address, patch, type, successText) => {
    setBusyId(address.id); setActionError("");
    try {
      const r = await updateAddress(address.id, patch);
      if (r.status === 401 || r.status === 403) { setBusyId(null); return; }
      if (!r.ok) {
        // Paritätsaudit A3: eine Altbestandsadresse ohne vollständigen Versandkontakt nennt das fehlende Feld.
        setActionError(addressFailureMessage(ADDRESS_OPERATIONS.UPDATE, await fehlerAusAntwort(r)));
        setBusyId(null);
        return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      setItems((prev) => applyAddressMutation(prev, applyServerOrFallback(address, d, patch), type, ansicht));
      showSuccess(successText);
    } catch (e) {
      setActionError(addressExceptionMessage(ADDRESS_OPERATIONS.UPDATE, e));
    }
    setBusyId(null);
  };
  const onToggleFavorite = (address) => quickUpdate(address, { favorite: !address.favorite }, "favorite", address.favorite ? "Favorit entfernt." : "Als Favorit markiert.");
  const onSetDefaultSender = (address) => quickUpdate(address, { isDefaultSender: true }, "defaultSender", "Standard-Absender gesetzt.");
  const onSetDefaultRecipient = (address) => quickUpdate(address, { isDefaultRecipient: true }, "defaultRecipient", "Standard-Empfänger gesetzt.");

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
      if (!r.ok) {
        // 404 (fremde oder schon gelöschte Adresse), 429 (Schreibgrenze), 5xx — je eigener Satz.
        setDeleteError(addressFailureMessage(ADDRESS_OPERATIONS.DELETE, await fehlerAusAntwort(r)));
        setDeleteBusy(false);
        return;
      }
      let d = null; try { d = await r.json(); } catch { d = null; }
      // Erfolg: Adresse lokal entfernen, Dialog schließen, Erfolgsmeldung. Hat das Backend einen
      // neuen Standard-Absender nachrücken lassen, folgt die sichtbare Liste lokal — ohne
      // Neuladen auf Seite 1 (bereits nachgeladene Seiten bleiben stehen).
      setItems((prev) => applyPromotedDefaultSender(applyAddressMutation(prev, address, "delete"), d?.newDefaultSenderId));
      setDeleteBusy(false); setDeleteTarget(null);
      showSuccess("Adresse wurde gelöscht.");
    } catch (e) {
      setDeleteError(addressExceptionMessage(ADDRESS_OPERATIONS.DELETE, e));
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
      <AddressBookHeader onCreate={openCreate} utility={utility} showCreate={!bereichLeer} />

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
