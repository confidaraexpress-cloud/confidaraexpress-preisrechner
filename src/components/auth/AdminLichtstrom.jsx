import React from "react";

/* ── Lichtstrom — die Bühne der Admin-Anmeldung (Canonical v2.130) ─────────────────────────────────────────
   Ein diagonales Bündel aus Lichtbändern in Elektrischblau und Violett läuft durch das Glaspanel; auf seiner
   hellsten Linie zieht in Abständen ein Lichtimpuls vorbei — Sendungen in Bewegung. Dazu schwebende Glasformen
   (Ring, Kapsel, Kugel), Tiefenlicht, Körnung und Vignette.

   Rein dekorativ: aria-hidden, keine Interaktion, kein Text, kein Bild, kein Skript. Bewegt werden ausschließlich
   transform und opacity (styles/auth.css, Abschnitt „Admin-Anmeldung“); bei reduzierter Bewegung steht jede Ebene
   in ihrem Endzustand. Die Szene liegt hinter dem Formular und fängt keine Klicks ab. */
export function AdminLichtstrom() {
  return (
    <div className="auth-admin-buehne" aria-hidden="true">
      <div className="auth-admin-grund" />
      <div className="auth-admin-tiefe auth-admin-tiefe--blau" />
      <div className="auth-admin-tiefe auth-admin-tiefe--violett" />
      <div className="auth-admin-strom">
        <div className="auth-admin-band auth-admin-band--1" />
        <div className="auth-admin-band auth-admin-band--2" />
        <div className="auth-admin-band auth-admin-band--3" />
        <div className="auth-admin-band auth-admin-band--4" />
        <div className="auth-admin-band auth-admin-band--5" />
        <div className="auth-admin-band auth-admin-band--6" />
        <div className="auth-admin-faser" />
        <div className="auth-admin-impuls" />
      </div>
      <div className="auth-admin-form auth-admin-form--ring" />
      <div className="auth-admin-form auth-admin-form--kapsel" />
      <div className="auth-admin-form auth-admin-form--kugel" />
      <div className="auth-admin-korn" />
      <div className="auth-admin-vignette" />
    </div>
  );
}
