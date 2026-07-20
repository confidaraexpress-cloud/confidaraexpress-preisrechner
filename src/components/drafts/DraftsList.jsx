import React from "react";
import { Icon } from "../ui/Icon";
import { DraftDesktopRow } from "./DraftDesktopRow";
import { DraftCard } from "./DraftCard";
import { DraftSkeleton } from "./DraftSkeleton";
import { DraftEmptyState } from "./DraftEmptyState";

// Listen-Orchestrierung: Skeleton (initial) → Fehler (mit Retry) → Empty-State
// → Desktop-Tabelle/Mobil-Karten (CSS-Toggle, kein JS-Breakpoint) + „Weitere
// laden". Ladefehler beim Nachladen: bestehende Liste bleibt erhalten.
export function DraftsList({
  items, loading, error, onRetry, onCreate,
  hasMore, loadingMore, loadMoreError, onLoadMore,
  deletingId, onDelete,
}) {
  if (loading) return <DraftSkeleton />;

  if (error) {
    return (
      <div className="alert alert-error">
        <Icon n="x" s={16} />
        <span style={{ flex: 1 }}>{error}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>Erneut versuchen</button>
      </div>
    );
  }

  if (items.length === 0) return <DraftEmptyState onCreate={onCreate} />;

  return (
    <div>
      <p className="sr-only" role="status">{items.length} Entwurf{items.length === 1 ? "" : "e"} geladen.</p>

      <div className="table-card dft-table-card">
        <div className="table-scroll">
          <table className="dft-table">
            <thead>
              <tr>
                <th scope="col">Empfänger</th>
                <th scope="col">Route</th>
                <th scope="col">Pakete / Gewicht / Maße</th>
                <th scope="col">Versanddatum</th>
                <th scope="col">Zuletzt gespeichert</th>
                <th scope="col"><span className="sr-only">Aktionen</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <DraftDesktopRow key={d.id} draft={d} busy={deletingId === d.id} onDelete={onDelete} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="dft-cards">
        {items.map((d) => (
          <DraftCard key={d.id} draft={d} busy={deletingId === d.id} onDelete={onDelete} />
        ))}
      </ul>

      {hasMore && (
        <div className="dft-loadmore-wrap">
          {loadMoreError && (
            <div className="alert alert-error" style={{ width: "100%" }}>
              <Icon n="x" s={16} />{loadMoreError}
            </div>
          )}
          <button type="button" className="btn btn-outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore ? <><span className="spinner spinner-dark" /> Wird geladen …</> : "Weitere laden"}
          </button>
        </div>
      )}
    </div>
  );
}
