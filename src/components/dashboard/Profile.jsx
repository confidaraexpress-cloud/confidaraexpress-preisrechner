import React from "react";
import { StatusBadge } from "../ui/StatusBadge";

export function Profile({ user }) {
  const sections = [
    { title: "Kontakt", items: [["Name", user?.name], ["E-Mail", user?.email]] },
    {
      title: "Firma",
      items: [
        ["Firmenname", user?.company_name],
        ["USt-ID", user?.vat_id || "—"],
        ["Adresse", `${user?.street}, ${user?.zip} ${user?.city}`],
      ],
    },
    {
      title: "Konto",
      items: [
        ["Status", <StatusBadge status={user?.status} />],
        ["Zahlungsart", "Rechnung (B2B)"],
      ],
    },
  ];

  return (
    <>
      <div className="page-header">
        <div><div className="page-header-title">Mein Profil</div></div>
      </div>
      <div className="page-body">
        <div style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 16 }}>
          {sections.map((section, si) => (
            <div key={si} className="table-card">
              <div className="table-card-header">
                <span className="table-card-title">{section.title}</span>
              </div>
              <div style={{ padding: "8px 20px 16px" }}>
                {section.items.map(([k, v], i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "10px 0",
                      borderBottom: i < section.items.length - 1 ? "1px solid var(--border)" : "none",
                    }}
                  >
                    <span className="text-sm text-muted">{k}</span>
                    <span className="text-sm font-bold" style={{ color: "var(--navy)" }}>{v || "—"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
