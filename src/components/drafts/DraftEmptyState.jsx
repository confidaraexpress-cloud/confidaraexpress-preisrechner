import React from "react";
import { Icon } from "../ui/Icon";
import { draftsEmptyCopy } from "../../utils/draftsView.mjs";

// „Noch keine Entwürfe" — kein Hinweis auf technische Drafts/72h-Cleanup.
export function DraftEmptyState({ onCreate }) {
  const copy = draftsEmptyCopy();
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true"><Icon n="form" s={40} c="var(--gray300, #cbd5e1)" /></div>
      <div className="empty-title">{copy.title}</div>
      <p className="dft-empty-desc">{copy.desc}</p>
      <button type="button" className="btn btn-primary btn-sm" onClick={onCreate}>{copy.cta}</button>
    </div>
  );
}
