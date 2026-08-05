// ─────────────────────────────────────────────────────────────────────────────
// Zum ersten fehlerhaften Feld scrollen und es fokussieren.
//
// Vorher gab es projektweit KEINEN solchen Helfer (0 Treffer für scrollIntoView
// in Formularen): Bei einem Fehler weit oben im Formular blieb der Kunde unten
// am Button stehen und sah nur den roten Kasten — ohne Hinweis, wo er etwas
// ändern muss.
//
// Die Zuordnung läuft über `data-field="<schlüssel>"` am Eingabeelement. Das ist
// robuster als Refs für jedes einzelne Feld und funktioniert auch dort, wo die
// Felder über Hilfsfunktionen gerendert werden.
//
// Respektiert `prefers-reduced-motion`: dort wird ohne Scrollanimation gesprungen.
// ─────────────────────────────────────────────────────────────────────────────

export function findFieldElement(fieldKey, root) {
  if (!fieldKey || typeof document === "undefined") return null;
  const scope = root || document;
  const sel = `[data-field="${CSS && CSS.escape ? CSS.escape(fieldKey) : fieldKey}"]`;
  try {
    return scope.querySelector(sel);
  } catch {
    return null;
  }
}

// Scrollt das Feld in den sichtbaren Bereich und fokussiert es.
// Gibt true zurück, wenn ein Feld gefunden wurde (für Tests/Aufrufer).
export function focusFirstError(fieldKey, { root, preventScroll = false } = {}) {
  const el = findFieldElement(fieldKey, root);
  if (!el) return false;

  const reduced = typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!preventScroll && typeof el.scrollIntoView === "function") {
    try {
      el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
    } catch {
      el.scrollIntoView();   // ältere Implementierungen ohne Options-Objekt
    }
  }

  // Fokus NACH dem Scrollen, mit preventScroll: sonst springt der Browser noch
  // einmal selbst und überschreibt die weiche Bewegung.
  if (typeof el.focus === "function") {
    try { el.focus({ preventScroll: true }); } catch { el.focus(); }
  }
  return true;
}

// aria-Attribute für ein Eingabefeld mit möglichem Fehler. Ein Aufruf liefert
// alles, was das Feld braucht — damit die Verdrahtung nicht an jeder Stelle neu
// (und unterschiedlich) geschrieben wird.
export function fieldErrorProps(fieldKey, message) {
  const id = `err-${fieldKey}`;
  return {
    input: {
      "data-field": fieldKey,
      "aria-invalid": message ? "true" : undefined,
      "aria-describedby": message ? id : undefined,
    },
    errorId: id,
  };
}
