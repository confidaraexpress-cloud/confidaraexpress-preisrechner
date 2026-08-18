import React from "react";
import { ErrorState } from "../ui/StateView";

/* ── Content-Level Error Boundary — letzte Schutzschicht, kein Root-Cause-Fix ──
   Diese App hatte bislang KEINE einzige Fehlergrenze: ein unbehandelter
   Renderfehler irgendwo im Baum ließ React 18 den GESAMTEN Baum abhängen —
   ein leerer, weißer <div id="root">. Das ist unabhängig von jeder konkreten
   Fehlerursache ein Stabilitätsrisiko und wird hier geschlossen.

   Bewusst NICHT die Lösung für einen bestimmten Fehler — dieser Bereich fängt
   auf, was trotz sorgfältiger Fehlerbehandlung (StateView/apiError/r.ok-
   Prüfungen) unerwartet durchrutscht. Der Fehler wird nie verschluckt: er
   geht über console.error inklusive Component-Stack ins Log, sichtbar bleibt
   ein verständlicher Zustand mit „Erneut versuchen" — Sidebar/Shell bleiben
   erhalten, weil die Grenze NUR den Inhaltsbereich umschließt, nie die ganze
   Seite.

   Erwartete Verwendung: der Aufrufer setzt `key` auf den aktuellen Seitenwert
   (z. B. `key={page}` in DashboardPage, `key={location.pathname}` in
   DashboardLayout) — ein Seitenwechsel remountet die Grenze dadurch automatisch
   mit frischem Zustand, ein hängen gebliebener Fehler einer verlassenen Seite
   blockiert also nie die nächste. Der sichtbare „Erneut versuchen"-Button
   deckt den Fall ab, dass derselbe Inhalt (ohne Seitenwechsel) einen zweiten
   Versuch verdient — kein automatischer Reload, keine Endlosschleife. */
export class ContentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = () => this.setState({ error: null });
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Nie verschlucken: vollständiger Stack samt Komponentenpfad ins Log.
    console.error("[ContentErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-body">
          <ErrorState
            title="Diese Seite konnte nicht angezeigt werden"
            text="Dabei ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut."
            action={<button type="button" className="btn btn-primary" onClick={this.reset}>Erneut versuchen</button>}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
