import React from "react";

// Ladezustand — Skeletons statt leerer weißer Fläche, Layout springt nicht.
export function DraftSkeleton({ count = 4 }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="dft-skeleton-row" />
      ))}
    </div>
  );
}
