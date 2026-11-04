import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "../hooks/useDialog.js";
import {
  DEMO_HINWEIS_TEXTE as TEXT, DEMO_URL, adresseOhneHerkunft, demoHinweisMerker, demoHinweisZeigen, kommtAusDemo,
} from "./demoHinweis.mjs";

// ── Demo-Hinweis: der Entscheidungsdialog beim ersten Öffnen (P2, Betreiberentscheidung 2026-11-04) ─────────────
// „Möchten Sie zuerst den Kundenbereich ansehen?“ — zwei Aktionen, sonst nichts: „Demo ansehen“ ist ein echter Link
// in die Demo (derselbe Tab), „Zum Preisrechner“ schließt den Dialog (Navy, erster Fokus). Escape und ein Klick auf
// den Schleier wirken wie „Zum Preisrechner“. Einmal je Tab-Sitzung: gemerkt wird, sobald der Dialog erscheint
// (demoHinweis.mjs) — Reload und Zurück-Taste zeigen ihn nicht erneut, ebenso wenig die Rückkehr aus der Demo.
//
// Fokusfalle, Escape und Fokusrückgabe liefert der gemeinsame Hook useDialog; danach steht der Fokus auf dem Titel
// des Rechners. Der Dialog liegt per Portal am Ende von <body>, als Geschwister des Rechners (main.jsx): Öffnen und
// Schließen berühren weder Formular noch Ergebnisse noch eine laufende Preisabfrage. Entschieden wird einmal beim
// ersten Rendern, also vor jeder Eingabe — das Seitengerüst ist bis dahin nicht bedienbar (inert). Keine Animation,
// keine zusätzliche Anfrage.

const merker = demoHinweisMerker();

export function DemoHinweisDialog() {
  const [offen, setOffen] = useState(() => demoHinweisZeigen({
    entschieden: merker.entschieden(),
    ausDemo: kommtAusDemo(window.location.search),
  }));
  const schleier = useRef(null);
  const rechner = useRef(null);
  const rechnerTitel = useRef(document.getElementById("pc-calculator-title"));
  const druckAufSchleier = useRef(false);

  const zumRechner = () => setOffen(false);
  const ref = useDialog({ open: offen, onClose: zumRechner, returnFocusTo: rechnerTitel });

  // Nach useDialog (das zuerst das erste Element fokussiert): der erste Fokus gehört „Zum Preisrechner“.
  useEffect(() => {
    if (!offen) return;
    merker.merken();
    if (rechner.current) rechner.current.focus();
  }, [offen]);

  // Rückkehr aus der Demo: kein Dialog, und die Adresse verliert den Parameter (ein Reload fragt nicht). Scheitert
  // das Umschreiben der Adresse, bleibt sie, wie sie ist — der Rechner darf daran nie scheitern.
  useEffect(() => {
    if (!kommtAusDemo(window.location.search)) return;
    merker.merken();
    const ohne = adresseOhneHerkunft(window.location.href);
    if (!ohne) return;
    try { window.history.replaceState(window.history.state, "", ohne); } catch { /* die Adresse bleibt */ }
  }, []);

  // Verlässt die Seite den Tab (etwa über „Demo ansehen“), ist der Dialog schon verborgen; kehrt sie aus dem
  // Verlaufscache zurück (Zurück-Taste), steht der Rechner ohne Dialog da.
  useEffect(() => {
    if (!offen) return undefined;
    const beimVerlassen = () => { if (schleier.current) schleier.current.hidden = true; };
    const beimZurueckkehren = (e) => { if (e.persisted) setOffen(false); };
    window.addEventListener("pagehide", beimVerlassen);
    window.addEventListener("pageshow", beimZurueckkehren);
    return () => {
      window.removeEventListener("pagehide", beimVerlassen);
      window.removeEventListener("pageshow", beimZurueckkehren);
    };
  }, [offen]);

  if (!offen) return null;
  // Der Schleier schließt nur, wenn der Klick auch auf ihm begann — ein Ziehen aus dem Blatt heraus schließt nicht.
  return createPortal(
    <div className="pc-dialog-schleier" ref={schleier}
      onPointerDown={(e) => { druckAufSchleier.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (druckAufSchleier.current && e.target === e.currentTarget) zumRechner();
        druckAufSchleier.current = false;
      }}>
      <div ref={ref} className="pc-dialog" id="pc-demo-hinweis" role="dialog" aria-modal="true"
        aria-labelledby="pc-demo-hinweis-titel" aria-describedby="pc-demo-hinweis-text" tabIndex={-1}>
        <h2 className="pc-dialog-titel" id="pc-demo-hinweis-titel">{TEXT.titel}</h2>
        <div className="pc-dialog-text" id="pc-demo-hinweis-text">
          <p>{TEXT.text}</p>
          <p>{TEXT.zusatz}</p>
        </div>
        <div className="pc-dialog-aktionen">
          <a className="pc-button pc-button--secondary" id="pc-demo-hinweis-demo" href={DEMO_URL}>{TEXT.demo}</a>
          <button type="button" className="pc-button pc-button--primary" id="pc-demo-hinweis-rechner" ref={rechner}
            onClick={zumRechner}>
            {TEXT.rechner}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
