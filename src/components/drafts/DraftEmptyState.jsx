import React from "react";
import { EmptyState } from "../ui/StateView";
import { draftsEmptyCopy } from "../../utils/draftsView.mjs";

// „Noch keine Entwürfe" — kein Hinweis auf technische Drafts/72h-Cleanup.
export function DraftEmptyState({ onCreate }) {
  const copy = draftsEmptyCopy();
  return (
    <EmptyState
      title={copy.title}
      text={copy.desc}
      action={<button type="button" className="btn btn-primary" onClick={onCreate}>{copy.cta}</button>}
    />
  );
}
