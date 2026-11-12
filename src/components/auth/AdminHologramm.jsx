import React from "react";

/* ── Hologramm — das Hauptmotiv der Admin-Anmeldung (Canonical v2.131) ─────────────────────────────────────
   Ein Versandpaket als Hologramm: halbtransparente Flächen mit blau-violetten Kanten, Klebeband über dem Deckel und
   den Stirnseiten, Etikett mit Strichcode, Pfeile „oben“. Es schwebt im Lichtkegel eines Projektors auf einem
   Leitstandtisch und dreht sich langsam hin und her. In Abständen wandert eine Scanebene aus Licht durch das Paket und
   zieht auf seinen Seiten eine Scanlinie; wenn sie das Etikett kreuzt, leuchtet der Strichcode auf (die Sendung wird
   erfasst). Auf dem Tisch laufen Sendungsrouten in den Projektor, drei Trackingpunkte umkreisen das Paket.

   Rein dekorativ: aria-hidden, kein Text, kein Bild, keine Interaktion. CSS-3D (perspective, preserve-3d); bewegt
   werden ausschließlich transform/translate/rotate und opacity (styles/auth.css, Abschnitt „Admin-Anmeldung“). Bei
   reduzierter Bewegung steht das Paket als Standbild mit sichtbarer Scanlinie. Dieselbe Struktur steht im statischen
   Seitengerüst admin-login.html (dort ruhend); adminAnmeldung.test.mjs gleicht beide ab. */
export function AdminHologramm() {
  return (
    <div className="auth-admin-holo" aria-hidden="true">
      <div className="auth-admin-holo-schein" />
      <div className="auth-admin-holo-kegel" />
      <div className="auth-admin-holo-szene">
        <div className="auth-admin-holo-kamera">
          <div className="auth-admin-holo-tisch">
            <div className="auth-admin-holo-route auth-admin-holo-route--1"><span className="auth-admin-holo-impuls" /></div>
            <div className="auth-admin-holo-route auth-admin-holo-route--2"><span className="auth-admin-holo-impuls" /></div>
            <div className="auth-admin-holo-route auth-admin-holo-route--3"><span className="auth-admin-holo-impuls" /></div>
            <div className="auth-admin-holo-route auth-admin-holo-route--4"><span className="auth-admin-holo-impuls" /></div>
          </div>
          <div className="auth-admin-holo-projektor"><span className="auth-admin-holo-projektor-ring" /></div>
          <div className="auth-admin-holo-schwebe">
            <div className="auth-admin-holo-paket">
              <div className="auth-admin-holo-flaeche auth-admin-holo-flaeche--vorn">
                <span className="auth-admin-holo-etikett"><span className="auth-admin-holo-strichcode" /></span>
                <span className="auth-admin-holo-scan" />
              </div>
              <div className="auth-admin-holo-flaeche auth-admin-holo-flaeche--hinten"><span className="auth-admin-holo-scan" /></div>
              <div className="auth-admin-holo-flaeche auth-admin-holo-flaeche--links"><span className="auth-admin-holo-scan" /></div>
              <div className="auth-admin-holo-flaeche auth-admin-holo-flaeche--rechts">
                <span className="auth-admin-holo-pfeile" />
                <span className="auth-admin-holo-scan" />
              </div>
              <div className="auth-admin-holo-flaeche auth-admin-holo-flaeche--oben" />
              <div className="auth-admin-holo-flaeche auth-admin-holo-flaeche--unten" />
              <div className="auth-admin-holo-scanebene"><span className="auth-admin-holo-scanebene-licht" /></div>
            </div>
            <div className="auth-admin-holo-orbit">
              <div className="auth-admin-holo-orbit-lauf">
                <span className="auth-admin-holo-punkt" />
                <span className="auth-admin-holo-punkt" />
                <span className="auth-admin-holo-punkt" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
