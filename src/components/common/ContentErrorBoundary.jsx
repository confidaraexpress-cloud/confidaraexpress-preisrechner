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
   Versuch verdient — kein automatischer Reload, keine Endlosschleife.

   ── ZWEI Ursachen, ZWEI Handlungen (Härtungspaket) ─────────────────────────
   „Erneut versuchen" rendert denselben Baum neu. Für einen gewöhnlichen
   Renderfehler ist das richtig. Für die zweithäufigste Ursache ist es
   WIRKUNGSLOS, und das war bis hierher nicht unterschieden:

   Alle Seiten sind `React.lazy`, und die gehashten Bündel gehen mit
   `immutable` + `expires 1y` raus (nginx.conf). Ein zum Deploymentzeitpunkt
   offener Tab fordert beim Klick auf eine noch nicht geladene Seite einen
   Dateinamen an, den es nach dem Deployment nicht mehr gibt — der dynamische
   Import wirft. Ein erneuter Render fordert exakt denselben, weiterhin nicht
   existierenden Namen an; die Fläche bliebe stehen und der Nutzer käme nicht
   weiter. Hier hilft ausschließlich Neuladen, weil der Browser dabei das neue
   index.html und damit die neuen Dateinamen holt.

   Deshalb: Ursache erkennen, passende Handlung anbieten, den Grund benennen.
   Weiterhin KEIN automatisches Neuladen — ein reproduzierbarer Renderfehler
   würde daraus eine Schleife machen, die der Nutzer nicht anhalten kann.

   ── Was diese Grenze NICHT fängt ───────────────────────────────────────────
   Ereignishandler, `setTimeout`, abgelehnte Promises und Fehler in ihr selbst.
   Sie ist deshalb keine Entschuldigung dafür, Fehlerbehandlung im Datenpfad
   wegzulassen — die `try`/`catch` der API-Schicht bleiben die erste Linie. */

/** Erkennt „Codeabschnitt nicht mehr ladbar" an der Fehlermeldung. Die
 *  Wortlaute unterscheiden sich je Browser (Chromium, Firefox, Safari), es
 *  wird deshalb gegen mehrere bekannte Formulierungen geprüft und nicht gegen
 *  eine einzige. Im Zweifel gilt der Fehler als gewöhnlicher Renderfehler —
 *  fail-safe: lieber „Erneut versuchen" anbieten als fälschlich behaupten,
 *  ein Neuladen behebe das Problem. */
export function isChunkLoadError(error) {
  const text = `${error?.name || ""} ${error?.message || ""}`;
  return /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(text);
}

const TEXTE = {
  chunk: {
    title: "Eine neuere Version ist verfügbar",
    text: "Dieser Bereich konnte nicht geladen werden, weil im Hintergrund eine neuere Version bereitsteht. Ein Neuladen holt sie. Ihre gespeicherten Daten sind davon nicht betroffen.",
    aktion: "Seite neu laden",
  },
  render: {
    title: "Diese Seite konnte nicht angezeigt werden",
    text: "Dabei ist ein unerwarteter Fehler aufgetreten. Bitte versuchen Sie es erneut.",
    aktion: "Erneut versuchen",
  },
};

export class ContentErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
    this.reset = () => this.setState({ error: null });
    this.reload = () => window.location.reload();
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Nie verschlucken: vollständiger Stack samt Komponentenpfad ins Log.
    // `bereich` benennt die Grenze, die ausgelöst hat — bei inzwischen fünf
    // Montagepunkten war „[ContentErrorBoundary]" allein nicht mehr eindeutig.
    console.error(
      `[ContentErrorBoundary${this.props.bereich ? ":" + this.props.bereich : ""}]`,
      error,
      info?.componentStack
    );
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const chunk = isChunkLoadError(error);
    const t = chunk ? TEXTE.chunk : TEXTE.render;

    /* `.page-body` ist der gemeinsame Inhaltsrahmen der App-Shell. Außerhalb
       davon (Wurzel, Auth, öffentliche Seiten) trägt der Aufrufer seinen
       eigenen Rahmen bei — sonst stünde die Fläche randlos am Bildrand. */
    const wrapper = this.props.wrapperClassName ?? "page-body";

    return (
      <div className={wrapper}>
        <ErrorState
          title={t.title}
          text={t.text}
          action={
            <button
              type="button"
              className="btn btn-primary"
              onClick={chunk ? this.reload : this.reset}
            >
              {t.aktion}
            </button>
          }
        />
      </div>
    );
  }
}
