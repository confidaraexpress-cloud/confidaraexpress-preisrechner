import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "../ui/BrandLogo";
import { comparisonLoadingView, msUntilNextComparisonPhase } from "../../utils/comparisonLoadingView.mjs";

/* Ladeoverlay des Angebotsvergleichs — „Neue Sendung" und Preisrechner.
 *
 * Reine Darstellung: kein Request, kein eigener Ladezustand. Die Seite steuert
 * es über ihren bestehenden `loading`-State (active={loading}) — dieselbe
 * Wahrheit, die auch Knopf und Angebotsbereich lesen. Alle Angebote erscheinen
 * weiterhin gemeinsam, wenn die vollständige Antwort da ist.
 *
 * Eine Statusmeldung, KEIN Dialog: es gibt nichts zu bedienen (kein
 * Abbrechen). Deshalb keine Dialogrolle, kein aria-modal, keine Fokusfalle,
 * und der Fokus wird nicht in die Karte gezogen. Den Hintergrund sperrt die
 * Seite selbst (inert + aria-busy auf ihrem Inhalt); das Overlay fängt
 * zusätzlich die Maus ab.
 *
 * Die Live-Region bleibt dauerhaft im DOM und ist leer, solange nichts lädt:
 * Screenreader melden verlässlich nur Änderungen an einer Region, die es schon
 * gab — eine samt Inhalt eingefügte Region wird oft verschluckt. */

function Ladeanzeige() {
  const [verstrichenMs, setVerstrichenMs] = useState(0);

  // Genau EIN laufender Timer, und er weckt nur zur nächsten Textstufe — kein
  // Sekundentakt. Jeder neue Vergleich montiert diese Komponente neu, die
  // Wartezeit beginnt also immer bei 0; beim Abbau wird der Timer gelöscht.
  useEffect(() => {
    const start = performance.now();
    let timer = null;
    const planen = (ms) => {
      const warten = msUntilNextComparisonPhase(ms);
      if (warten === null) return;
      timer = setTimeout(() => {
        const jetzt = performance.now() - start;
        setVerstrichenMs(jetzt);
        planen(jetzt);
      }, warten);
    };
    planen(0);
    return () => clearTimeout(timer);
  }, []);

  const stufe = comparisonLoadingView(verstrichenMs);
  return (
    <div className="cmp-loading-overlay" data-phase={stufe.id}>
      <div className="cmp-loading-card">
        <div className="cmp-loading-mark" aria-hidden="true">
          <span className="cmp-loading-ring" />
          <BrandLogo variant="signet" tone="standard" alt="" className="cmp-loading-signet" />
        </div>
        <p className="cmp-loading-title">{stufe.title}</p>
        <p className="cmp-loading-text">{stufe.text}</p>
      </div>
    </div>
  );
}

export function OfferComparisonLoadingOverlay({ active }) {
  return createPortal(
    <div className="cmp-loading-live" role="status" aria-live="polite" aria-atomic="true">
      {active && <Ladeanzeige />}
    </div>,
    document.body,
  );
}
