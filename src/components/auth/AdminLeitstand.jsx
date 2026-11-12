import React from "react";

/* ── Leitstand — die Bühne hinter der Admin-Anmeldung (Canonical v2.131) ───────────────────────────────────
   Die ruhige Atmosphäre einer Logistik-Steuerzentrale: dunkler Navy-Grund mit Tiefenlicht in Blau und Violett, ein
   feines Netz aus Verbindungslinien und Knoten, zwei kleine Datenflächen ohne Zahlen, Körnung und Vignette. Sie bleibt
   im Hintergrund — das Hauptmotiv ist das Hologramm (AdminHologramm.jsx).

   Rein dekorativ: aria-hidden, kein Text, keine Interaktion, nichts bewegt sich. Das Netz ist ein SVG im Stylesheet
   (styles/auth.css, Abschnitt „Admin-Anmeldung“). Dieselbe Struktur steht im statischen Seitengerüst admin-login.html. */
export function AdminLeitstand() {
  return (
    <div className="auth-admin-buehne" aria-hidden="true">
      <div className="auth-admin-grund" />
      <div className="auth-admin-tiefe auth-admin-tiefe--blau" />
      <div className="auth-admin-tiefe auth-admin-tiefe--violett" />
      <div className="auth-admin-netz" />
      <div className="auth-admin-daten auth-admin-daten--1"><span /><span /><span /></div>
      <div className="auth-admin-daten auth-admin-daten--2"><span /><span /><span /></div>
      <div className="auth-admin-korn" />
      <div className="auth-admin-vignette" />
    </div>
  );
}
