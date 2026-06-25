import React from "react";

export function DashboardSectionHeader({ title, subtitle }) {
  return (
    <div className="dash-section-header" aria-label="Aktueller Bereich">
      <h1 className="dash-section-title">{title}</h1>
      {subtitle && <p className="dash-section-sub">{subtitle}</p>}
    </div>
  );
}
