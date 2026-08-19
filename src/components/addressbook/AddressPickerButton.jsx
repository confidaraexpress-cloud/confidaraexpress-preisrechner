import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { AddressPicker } from "./AddressPicker";

/* ── Auslöser + schwebende Adressauswahl ─────────────────────────────────────
   Die kleine Schaltfläche steht IN der Abschnittsüberschrift („Absender" /
   „Empfänger") — nicht als zweiter großer Knopf darunter. Sie ist eine
   Zusatzhilfe neben einem vollständig bedienbaren Formular und soll es optisch
   nicht überstimmen.

   Warum die Auswahl schwebt statt in-flow aufzuklappen: an dieser Stelle würde
   ein aufklappender Block die neun Adressfelder darunter jedes Mal um ~300 px
   nach unten schieben — der Nutzer verlöre genau die Felder aus dem Blick, die
   er gerade befüllt.

   Warum `position: fixed` und gemessene Platzierung statt `position: absolute`:
   `.calc-panel` trägt `overflow: hidden` (für seine runden Ecken). Eine absolut
   positionierte Fläche kann daraus nicht heraus und würde an der Panelkante
   abgeschnitten. Dieselbe Falle ist im Zeilenmenü der Bestandsseite gemessen
   und dort auf demselben Weg gelöst (RowActionsMenu, InventoryShared.jsx). Die
   Position kommt deshalb aus dem echten Rechteck des Auslösers, in den Viewport
   geklemmt und nach OBEN klappend, wenn unten kein Platz ist; bei Scroll und
   Größenänderung wird nachgeführt statt geschlossen.

   Die Auswahl selbst kennt dieses Bauteil nicht — `AddressPicker` sucht, zeigt
   an und meldet die gewählte Adresse. Hier liegt ausschließlich Auf-/Zuklappen,
   Platzierung und Fokusrückgabe. */

const RAND = 8;
const ABSTAND = 6;

export function AddressPickerButton({ tab, onSelect, disabled, label = "Adresse suchen", title }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const popRef = useRef(null);
  const popId = useId();

  const platziere = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    const p = popRef.current;
    if (!t || !p) return;
    const breite = p.offsetWidth;
    const hoehe = p.offsetHeight;
    // Rechtsbündig zum Auslöser, aber nie über den Bildrand hinaus. Der zweite
    // Math.max fängt den Fall ab, dass die Fläche breiter ist als das Fenster.
    const links = Math.min(Math.max(t.right - breite, RAND), Math.max(RAND, window.innerWidth - breite - RAND));
    const passtUnten = t.bottom + ABSTAND + hoehe <= window.innerHeight - RAND;
    const oben = passtUnten ? t.bottom + ABSTAND : Math.max(RAND, t.top - ABSTAND - hoehe);
    setPos({ top: oben, left: links });
  }, []);

  // useLayoutEffect: die Messung läuft VOR dem Zeichnen — die Fläche erscheint
  // nie kurz an einer falschen Stelle.
  useLayoutEffect(() => { if (open) platziere(); }, [open, platziere]);

  // Die Fläche WÄCHST nach dem Öffnen: sie startet mit „Adressen werden geladen
  // …" (eine Zeile) und wird mit der Trefferliste deutlich höher. Eine einmalige
  // Messung beim Öffnen entscheidet deshalb an der falschen Höhe, ob unten Platz
  // ist — gemessen auf 390 × 780 lief die fertige Liste 78 px unter den unteren
  // Bildrand. Der ResizeObserver misst neu, sobald sich die Höhe ändert; erst
  // dann klappt sie bei Bedarf nach oben.
  useEffect(() => {
    if (!open) return undefined;
    const knoten = popRef.current;
    if (!knoten || typeof ResizeObserver === "undefined") return undefined;
    const beobachter = new ResizeObserver(() => platziere());
    beobachter.observe(knoten);
    return () => beobachter.disconnect();
  }, [open, platziere]);

  useEffect(() => {
    if (!open) return undefined;
    const aussen = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const nachfuehren = () => platziere();
    document.addEventListener("mousedown", aussen);
    // `true` = Capture: auch das Scrollen eines Containers wird erfasst, nicht
    // nur das des Fensters.
    window.addEventListener("scroll", nachfuehren, true);
    window.addEventListener("resize", nachfuehren);
    return () => {
      document.removeEventListener("mousedown", aussen);
      window.removeEventListener("scroll", nachfuehren, true);
      window.removeEventListener("resize", nachfuehren);
    };
  }, [open, platziere]);

  const schliessen = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  // Escape hängt am UMSCHLAG, nicht am Dokument: der Fokus steht immer entweder
  // auf dem Auslöser oder in der Auswahl, und ein Dokument-Listener würde in
  // einem Dialog mit dessen Escape-Behandlung konkurrieren.
  //
  // Ebenfalls NATIV statt als React-onKeyDown, aus demselben gemessenen Grund
  // wie in AddressPicker: Synthetic Events werden am Wurzelcontainer zugestellt
  // und laufen damit nach jedem nativen Listener eines Vorfahren — ein
  // stopPropagation käme zu spät.
  const schliessenRef = useRef(schliessen);
  schliessenRef.current = schliessen;
  useEffect(() => {
    if (!open) return undefined;
    const knoten = wrapRef.current;
    if (!knoten) return undefined;
    const beiTaste = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      schliessenRef.current();
    };
    knoten.addEventListener("keydown", beiTaste);
    return () => knoten.removeEventListener("keydown", beiTaste);
  }, [open]);

  // Verlässt der Fokus die Fläche per Tastatur, ist die Auswahl vorbei.
  // Nur bei einem BEKANNTEN neuen Ziel: ohne relatedTarget (Klick auf eine
  // nicht fokussierbare Stelle der Auswahl, Fensterwechsel) würde sonst
  // mitten in der Bedienung zugeklappt.
  const beiFokusaus = (e) => {
    if (!open) return;
    const ziel = e.relatedTarget;
    if (!ziel) return;
    if (wrapRef.current && !wrapRef.current.contains(ziel)) setOpen(false);
  };

  const waehle = (address) => {
    setOpen(false);
    triggerRef.current?.focus();
    onSelect?.(address);
  };

  return (
    <div className="abk-pick" ref={wrapRef} onBlur={beiFokusaus}>
      <button
        type="button"
        ref={triggerRef}
        className="btn btn-ghost btn-sm abk-pick-trigger"
        onClick={() => setOpen(v => !v)}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        title={title}
      >
        {/* `idcard` ist im ganzen Portal das Zeichen für das Adressbuch (siehe
            DashboardSidebar) — kein zweites Symbol dafür. */}
        <Icon n="idcard" s={16} />
        <span className="abk-pick-trigger-text">{label}</span>
        <Icon n="chevron" s={14} />
      </button>
      {/* Bewusst KEINE Dialogrolle: die Fläche ist nicht modal und fängt den
          Fokus absichtlich NICHT ein — wer weitertabbt, verlässt sie, und sie
          schließt sich dabei. Die Dialogrolle verspräche eine Fokusfalle, die
          es hier nicht geben soll (und die das Designsystem für echte Dialoge
          zu Recht einfordert — interfacePatterns.test.mjs, Test 9). Eine
          beschriftete Gruppe sagt genau das, was diese Fläche ist. */}
      {open && (
        <div
          className="abk-pick-pop"
          id={popId}
          ref={popRef}
          role="group"
          aria-label={title || "Adresse aus dem Adressbuch wählen"}
          style={{ top: `${pos.top}px`, left: `${pos.left}px` }}
        >
          <AddressPicker tab={tab} onSelect={waehle} onClose={schliessen} disabled={disabled} />
        </div>
      )}
    </div>
  );
}
