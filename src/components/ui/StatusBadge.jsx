import React from "react";

const statusMap = {
  approved:    ["badge-green",  "Aktiv"],
  active:      ["badge-green",  "Aktiv"],
  pending:     ["badge-yellow", "Ausstehend"],
  blocked:     ["badge-red",    "Gesperrt"],
  booked:      ["badge-blue",   "Gebucht"],
  label_ready: ["badge-blue",   "Label bereit"],
  draft:       ["badge-gray",   "Entwurf"],
  paid:        ["badge-green",  "Bezahlt"],
  unpaid:      ["badge-yellow", "Offen"],
  delivered:   ["badge-green",  "Zugestellt"],
  in_transit:  ["badge-blue",   "Unterwegs"],
  delayed:     ["badge-yellow", "Verzögert"],
};

export function StatusBadge({ status }) {
  const [cls, label] = statusMap[status] || ["badge-gray", status];
  return <span className={`badge ${cls}`}>{label}</span>;
}
