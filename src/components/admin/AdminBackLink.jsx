import React from "react";
import { Link, useLocation } from "react-router-dom";
import { resolveAdminBack } from "../../utils/adminBackLink.mjs";

/* ── Zurück-Link einer Admin-Detailseite (UX-Paket 2) ────────────────────────
   Führt dorthin, woher der Admin kam (Router-State `from`, nur Adminpfade —
   siehe utils/adminBackLink.mjs), sonst zum festen Rückweg der Seite. Dieselbe
   Klasse wie bisher: er steht weiter im Seitenkopf (`backLink={back}`). */
export function AdminBackLink({ to, label }) {
  const { state } = useLocation();
  const ziel = resolveAdminBack(state, { to, label });
  return <Link to={ziel.to} className="adm-back">{ziel.label}</Link>;
}

export default AdminBackLink;
