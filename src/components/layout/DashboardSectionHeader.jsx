import React from "react";

export function DashboardSectionHeader({ title }) {
  return (
    <div className="dash-section-header" aria-label="Aktueller Bereich">
      <h1 className="dash-section-title">{title}</h1>
    </div>
  );
}
