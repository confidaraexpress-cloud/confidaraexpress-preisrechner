import React from "react";
import { Icon } from "../ui/Icon";

const TABS = [
  { id: "new",       label: "Neue Sendung", icon: "plus"    },
  { id: "shipments", label: "Sendungen",    icon: "truck"   },
  { id: "invoices",  label: "Rechnungen",   icon: "invoice" },
  { id: "profile",   label: "Mein Profil",  icon: "user"    },
];

export function DashboardTabBar({ page, navigateTo }) {
  return (
    <div className="dash-tabbar" role="navigation" aria-label="Bereich auswählen">
      <div className="dash-tabbar-inner">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dash-tab${page === tab.id ? " active" : ""}`}
            onClick={() => navigateTo(tab.id)}
            aria-current={page === tab.id ? "page" : undefined}
          >
            <span className="dash-tab-ico" aria-hidden="true">
              <Icon n={tab.icon} s={15} c="currentColor" />
            </span>
            <span className="dash-tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
