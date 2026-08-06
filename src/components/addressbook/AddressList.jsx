import React from "react";
import { Icon } from "../ui/Icon";
import { AddressDesktopRow } from "./AddressDesktopRow";
import { AddressCard } from "./AddressCard";
import { AddressSkeleton } from "./AddressSkeleton";
import { AddressEmptyState } from "./AddressEmptyState";

// Listen-Orchestrierung: Skeleton (initial) → Fehler (mit Retry) → Empty-State
// → Desktop-/Mobil-Liste (CSS-Toggle, kein JS-Breakpoint) + „Mehr laden".
// Ladefehler beim Nachladen: bestehende Liste bleibt erhalten, Button zeigt
// lokal einen Fehler + erneuten Versuch statt die Liste zu verwerfen.
export function AddressList({
  items, loading, error, onRetry,
  emptyKind, tab, onCreate,
  hasMore, loadingMore, loadMoreError, onLoadMore,
  busyId, rowActions,
}) {
  // Nur die ECHTE Erstladung zeigt das Skeleton. Eine Such-/Filteränderung
  // setzt `loading` ebenfalls kurz auf true (siehe AddressBookPage.load) —
  // solange bereits Treffer sichtbar sind, bleiben sie stehen; die Werkzeug-
  // leiste zeigt den dezenten "searching"-Indikator (dieselbe Bedingung).
  if (loading && items.length === 0) return <AddressSkeleton />;

  if (error) {
    return (
      <div className="alert alert-error">
        <Icon n="x" s={16} />
        <span style={{ flex: 1 }}>{error}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>Erneut versuchen</button>
      </div>
    );
  }

  if (items.length === 0) {
    return <AddressEmptyState kind={emptyKind} tab={tab} onCreate={onCreate} />;
  }

  return (
    <div className="abk-list-wrap">
      {/* Live-Region: kündigt Trefferzahl nach Suche/Filterwechsel an, ohne
          sichtbare Dopplung (die Liste selbst ist bereits sichtbar). */}
      <p className="sr-only" role="status">{items.length} Adresse{items.length === 1 ? "" : "n"} geladen.</p>

      <ul className="abk-desktop-list">
        {items.map((a) => (
          <AddressDesktopRow key={a.id} address={a} busy={busyId === a.id} {...rowActions} />
        ))}
      </ul>
      <ul className="abk-cards">
        {items.map((a) => (
          <AddressCard key={a.id} address={a} busy={busyId === a.id} {...rowActions} />
        ))}
      </ul>

      {hasMore && (
        <div className="abk-loadmore-wrap">
          {loadMoreError && (
            <div className="alert alert-error" style={{ width: "100%" }}>
              <Icon n="x" s={16} />{loadMoreError}
            </div>
          )}
          <button type="button" className="btn btn-outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <><span className="spinner spinner-dark" /> Wird geladen …</> : "Mehr laden"}
          </button>
        </div>
      )}
    </div>
  );
}
