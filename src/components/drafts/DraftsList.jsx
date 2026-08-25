import React from "react";
import { Icon } from "../ui/Icon";
import { DraftDesktopRow } from "./DraftDesktopRow";
import { DraftCard } from "./DraftCard";
import { FormDraftDesktopRow } from "./FormDraftDesktopRow";
import { FormDraftCard } from "./FormDraftCard";
import { DraftSkeleton } from "./DraftSkeleton";
import { DraftEmptyState } from "./DraftEmptyState";
import { combinedDraftKey, FORM_DRAFT_KIND } from "../../utils/formDraftsView.mjs";

// Listen-Orchestrierung: Skeleton (initial) → Fehler beider Quellen (mit Retry)
// → Empty-State → Desktop-Tabelle/Mobil-Karten (CSS-Toggle, kein JS-Breakpoint)
// + „Weitere laden". Beide Entwurfstypen (form/shipment) teilen sich dieselben
// Spalten; je Zeile/Karte entscheidet EIN kontrollierter Zweig über die Variante
// (FormDraft* vs. Draft*) — keine vielen ungeordneten if-Blöcke. Beide Varianten
// tragen inzwischen dieselben Aktionen (Fortsetzen + Kebab); der Zweig entscheidet
// nur noch über Badge und Spaltenformatierung. React-Key ist
// der Kombischlüssel (form:7 ≠ shipment:7), damit gleiche IDs nicht kollidieren.
//
// canShowEmpty: nur true, wenn BEIDE Quellen erfolgreich UND leer waren. Bei
// einem Teilfehler (eine Quelle fehlgeschlagen, andere leer) wird KEIN
// „keine Entwürfe" behauptet — der Teilfehler-Hinweis steht oberhalb der Liste.
export function DraftsList({
  items, loading, error, onRetry, onCreate, canShowEmpty = true,
  hasMore, loadingMore, loadMoreError, onLoadMore,
  deletingKey, resumingKey, onDelete, onResume,
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

  if (items.length === 0) return canShowEmpty ? <DraftEmptyState onCreate={onCreate} /> : null;

  const renderRow = (d) => {
    const key = combinedDraftKey(d);
    if (d.kind === FORM_DRAFT_KIND) {
      return <FormDraftDesktopRow key={key} draft={d} busy={deletingKey === key} resuming={resumingKey === key} onDelete={onDelete} onResume={onResume} />;
    }
    return <DraftDesktopRow key={key} draft={d} busy={deletingKey === key} resuming={resumingKey === key} onDelete={onDelete} onResume={onResume} />;
  };
  const renderCard = (d) => {
    const key = combinedDraftKey(d);
    if (d.kind === FORM_DRAFT_KIND) {
      return <FormDraftCard key={key} draft={d} busy={deletingKey === key} resuming={resumingKey === key} onDelete={onDelete} onResume={onResume} />;
    }
    return <DraftCard key={key} draft={d} busy={deletingKey === key} resuming={resumingKey === key} onDelete={onDelete} onResume={onResume} />;
  };

  return (
    <div>
      <p className="sr-only" role="status">{items.length} Entwurf{items.length === 1 ? "" : "e"} geladen.</p>

      <div className="table-card dft-table-card">
        <div className="table-scroll">
          <table className="dft-table">
            <caption className="sr-only">Gespeicherte Entwürfe</caption>
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
              {items.map(renderRow)}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="dft-cards">
        {items.map(renderCard)}
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
