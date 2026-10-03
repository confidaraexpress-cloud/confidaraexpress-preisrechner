import React from "react";

/* ── Gemeinsame Zustandsflächen (Paket A, Phase 3 · Redesign 2026-10) ────────
   Leer · keine Filtertreffer · Laden · Fehler · kein Zugriff · Dokument nicht
   verfügbar · Erfolg — alle mit demselben Aufbau:

     Titel  ·  ein erklärender Satz
     GENAU eine Hauptaktion, optional eine sekundäre Textaktion

   Verbindlich und hier durchgesetzt:
     • Keine Bildmarke. Seit dem Redesign tragen Zustände weder Emoji noch
       Iconfläche: ein Zustand ist eine Aussage, keine Illustration. Der
       frühere `icon`-Parameter wird von den Aufrufern noch übergeben und
       bewusst ignoriert, damit kein Aufrufer angefasst werden musste.
     • Keine technischen Rohwerte im sichtbaren Text. Der Aufrufer übergibt
       fertige deutsche Sätze; Fehlercodes gehören in Logs, nicht ins UI.
     • Höchstens eine primäre Aktion, damit der Zustand eine klare Fortsetzung
       hat statt einer Auswahl.
     • Der Ladezustand behält seinen kleinen Spinner — er ist funktionale
       Rückmeldung, keine Dekoration — und trägt immer einen Statustext.

   Die Komponenten rendern nur Struktur — sie kennen weder Daten noch
   Navigation noch Ladelogik. */

const TON = { neutral: "", error: "ce-state--error", success: "ce-state--success", loading: "ce-state--loading" };

function StateShell({ indicator, title, text, action, secondaryAction, tone = "neutral", role, children }) {
  return (
    <div className={`ce-state ${TON[tone] || ""}`.trim()} role={role}>
      {indicator && <div className="ce-state-indicator">{indicator}</div>}
      {title && <p className="ce-state-title">{title}</p>}
      {text && <p className="ce-state-text">{text}</p>}
      {children}
      {(action || secondaryAction) && (
        <div className="ce-state-actions">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
}

/* Leerer Datenbestand — es gibt noch nichts, der Nutzer kann etwas anlegen. */
export function EmptyState({ title, text, action, secondaryAction }) {
  return <StateShell title={title} text={text} action={action} secondaryAction={secondaryAction} />;
}

/* Keine Filtertreffer — die Daten existieren, die Auswahl passt nur nicht. */
export function NoResultsState({ title, text, action, secondaryAction }) {
  return <StateShell title={title} text={text} action={action} secondaryAction={secondaryAction} />;
}

/* Unbestimmter oder kurzer Vorgang. Für bekannte Listen- und Kartenstrukturen
   ist das Skeleton (unten) die bessere Wahl. */
export function LoadingState({ text = "Wird geladen …" }) {
  return (
    <StateShell
      tone="loading"
      role="status"
      indicator={<span className="spinner spinner-dark" />}
      text={text}
    />
  );
}

/* Lokaler oder globaler Fehler. `action` ist typischerweise „Erneut versuchen". */
export function ErrorState({ title, text, action, secondaryAction }) {
  return (
    <StateShell
      tone="error" role="alert"
      title={title} text={text} action={action} secondaryAction={secondaryAction}
    />
  );
}

/* Kein Zugriff — fachlich kein Fehler, deshalb ein neutraler Ton. */
export function NoAccessState({ title, text, action }) {
  return <StateShell title={title} text={text} action={action} />;
}

/* Erfolgreich abgeschlossener Vorgang. */
export function SuccessState({ title, text, action, secondaryAction }) {
  return (
    <StateShell
      tone="success" role="status"
      title={title} text={text} action={action} secondaryAction={secondaryAction}
    />
  );
}

/* Skeleton für Listen mit bekannter Zeilenstruktur. Zeigt die kommende Form,
   statt die Fläche leer zu lassen — und ersetzt keine bereits sichtbaren
   Daten: beim Aktualisieren bleibt der alte Bestand stehen. */
export function ListSkeleton({ rows = 4, label = "Inhalte werden geladen" }) {
  return (
    <div className="ce-skeleton-list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ce-skeleton ce-skeleton-row" />
      ))}
    </div>
  );
}
