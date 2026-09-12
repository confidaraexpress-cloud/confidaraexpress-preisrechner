import React from "react";
import { statusFallback } from "../../utils/statusFallback.mjs";
import { BOOKING_IN_REVIEW_TEXT } from "../../utils/customerBookingStatus.mjs";

const statusMap = {
  approved:    ["badge-green",  "Aktiv"],
  active:      ["badge-green",  "Aktiv"],
  pending:     ["badge-yellow", "Ausstehend"],
  blocked:     ["badge-red",    "Gesperrt"],
  // Package C: der Buchungsausgang wird geklärt — neutral, ohne Anbieter und ohne Grund.
  booking:     ["badge-yellow", BOOKING_IN_REVIEW_TEXT.badge],
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
  const [cls, label, roh] = statusMap[status]
    ? [...statusMap[status], null]
    : statusFallback(status);
  // Der Rohwert bleibt für den Support sichtbar — aber nur im title, nie im Text.
  return <span className={`badge ${cls}`} title={roh ? `Serverwert: ${roh}` : undefined}>{label}</span>;
}
