import React from "react";

/* ── Leitstand — die Bühne hinter der Admin-Anmeldung (Canonical v2.131, Leitstand 2.0: v2.143) ─────────────────────
   Die Atmosphäre einer Logistik-Steuerzentrale bei Nacht: dunkler Navy-Grund mit Tiefenlicht in Blau und Violett;
   unter dem Horizont ein Boden in Fluchtperspektive, auf dessen Linien Lichtimpulse nach vorn laufen; ein feines Netz
   aus Verbindungslinien, dessen Knoten einzeln aufleuchten; Partikel in zwei Tiefen; zwei kleine Datenflächen ohne
   Zahlen; ein weiches Licht, das dem Zeiger folgt; Körnung und Vignette. Sie bleibt im Hintergrund — das Hauptmotiv ist
   das Hologramm (AdminHologramm.jsx).

   Rein dekorativ: aria-hidden, kein Text, keine Interaktion. Bewegung, Parallaxe und Zeigerlicht kommen aus dem
   Stylesheet (styles/auth.css, Abschnitt „Admin-Anmeldung“) und den Zeigerwerten der Seite (hooks/useLeitstandZeiger.js).
   Bewegt werden nur kleine Elemente (je ein Partikel, Knoten, Impuls), nie eine bildschirmgroße Ebene. Dieselbe
   Struktur steht im statischen Seitengerüst admin-login.html (dort ruhend). */
export function AdminLeitstand() {
  return (
    <div className="auth-admin-buehne" aria-hidden="true">
      <div className="auth-admin-grund" />
      <div className="auth-admin-tiefe auth-admin-tiefe--blau" />
      <div className="auth-admin-tiefe auth-admin-tiefe--violett" />
      <div className="auth-admin-boden" />
      <div className="auth-admin-bahnen">
        <div className="auth-admin-bahnen-ebene">
          <span className="auth-admin-boden-impuls" />
          <span className="auth-admin-boden-impuls" />
          <span className="auth-admin-boden-impuls" />
          <span className="auth-admin-boden-impuls" />
        </div>
      </div>
      <div className="auth-admin-netz" />
      <div className="auth-admin-knoten">
        <span /><span /><span /><span /><span /><span /><span /><span />
      </div>
      <div className="auth-admin-partikel auth-admin-partikel--fern">
        <span /><span /><span /><span /><span /><span />
      </div>
      <div className="auth-admin-partikel auth-admin-partikel--nah">
        <span /><span /><span /><span />
      </div>
      <div className="auth-admin-daten auth-admin-daten--1"><span /><span /><span /></div>
      <div className="auth-admin-daten auth-admin-daten--2"><span /><span /><span /></div>
      <div className="auth-admin-zeigerlicht" />
      <div className="auth-admin-korn" />
      <div className="auth-admin-vignette" />
    </div>
  );
}
