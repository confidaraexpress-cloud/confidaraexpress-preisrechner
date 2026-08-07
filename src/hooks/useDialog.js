import { useEffect, useRef } from "react";

/* ── Gemeinsames Dialogverhalten (Paket A, Phase 3) ──────────────────────────
   Fokusfalle, Fokusrückgabe und Escape für alle Dialoge und Drawer — bisher
   löste das jede Komponente einzeln oder gar nicht.

   Der Hook fasst ausschließlich Fokus und Tastatur an. Er kennt weder den
   Inhalt des Dialogs noch seine Logik und ruft niemals von sich aus eine
   Aktion auf; `onClose` ist genau der Schließpfad, den die Komponente ohnehin
   besitzt.

   Verwendung:

     const ref = useDialog({ open, onClose });
     …
     <div className="ce-dialog-overlay">
       <div ref={ref} role="dialog" aria-modal="true" className="ce-dialog">…</div>
     </div>

   Verhalten:
     • Beim Öffnen wandert der Fokus auf das erste fokussierbare Element im
       Dialog (oder auf den Dialog selbst, wenn es keines gibt).
     • Tab und Shift+Tab laufen im Dialog um — der Fokus verlässt ihn nicht.
     • Escape ruft onClose auf, sofern nicht per `closeOnEscape: false`
       abgeschaltet (etwa bei einem Vorgang, der nicht abgebrochen werden darf).
     • Beim Schließen kehrt der Fokus auf das Element zurück, das den Dialog
       geöffnet hat.

   Bewusst NICHT enthalten: Scroll-Sperre des Hintergrunds. Sie würde das
   Layout um die Breite der Bildlaufleiste verschieben — das gehört in ein
   eigenes, gemessenes Paket. */

const FOKUSSIERBAR = [
  "a[href]", "button:not([disabled])", "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

const sichtbar = (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el.getClientRects().length > 0;

export function useDialog({ open = true, onClose, closeOnEscape = true, returnFocusTo = null } = {}) {
  const ref = useRef(null);
  const rueckgabeRef = useRef(null);
  // Optionales, EXPLIZITES Rückgabeziel.
  //
  // Der Normalfall (document.activeElement beim Öffnen) trägt eine stille
  // Annahme: dass der Auslöser beim Öffnen noch fokussiert ist. Das stimmt
  // nicht, wenn er im selben Render deaktiviert wird — etwa ein Suchknopf, der
  // Dialog UND Ladevorgang zugleich startet und dabei `disabled` wird. Der
  // Browser blurrt ihn dann sofort, activeElement ist <body>, und die
  // Fokusrückgabe landet im Nichts. Wer das weiß, gibt sein Ziel hier direkt an.
  const zielRef = useRef(returnFocusTo);
  zielRef.current = returnFocusTo;
  // onClose als Ref: der Effekt soll nicht bei jeder neuen Closure neu laufen
  // (sonst springt der Fokus bei jedem Render des Aufrufers zurück an den Anfang).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const knoten = ref.current;
    if (!knoten) return undefined;

    rueckgabeRef.current = zielRef.current?.current || document.activeElement;

    const felder = () => [...knoten.querySelectorAll(FOKUSSIERBAR)].filter(sichtbar);
    const erste = felder()[0];
    if (erste) erste.focus();
    else {
      if (!knoten.hasAttribute("tabindex")) knoten.setAttribute("tabindex", "-1");
      knoten.focus();
    }

    const beiTaste = (e) => {
      if (e.key === "Escape" && closeOnEscape) {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const liste = felder();
      if (liste.length === 0) { e.preventDefault(); return; }
      const [anfang] = liste;
      const ende = liste[liste.length - 1];
      const aktiv = document.activeElement;
      if (e.shiftKey && (aktiv === anfang || !knoten.contains(aktiv))) {
        e.preventDefault(); ende.focus();
      } else if (!e.shiftKey && aktiv === ende) {
        e.preventDefault(); anfang.focus();
      }
    };

    knoten.addEventListener("keydown", beiTaste);
    return () => {
      knoten.removeEventListener("keydown", beiTaste);
      const ziel = rueckgabeRef.current;
      // Fokusrückgabe nur, wenn das auslösende Element noch im Dokument steht.
      if (ziel && typeof ziel.focus === "function" && document.contains(ziel)) ziel.focus();
    };
  }, [open, closeOnEscape]);

  return ref;
}
