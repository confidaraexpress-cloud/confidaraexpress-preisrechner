import React from "react";

// Ladezustand — Skeletons statt leerer weißer Fläche. Rein dekorativ
// (aria-hidden); der eigentliche Ladezustand wird vom Orchestrator über eine
// Live-Region separat angekündigt (siehe AddressList).
export function AddressSkeleton({ count = 4 }) {
  return (
    <div className="abk-desktop-list" aria-hidden="true" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="abk-skeleton-row" />
      ))}
    </div>
  );
}
