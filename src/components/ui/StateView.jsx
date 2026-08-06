import React from "react";
import { Icon, ICON_SIZE } from "./Icon";

/* ── Gemeinsame Zustandsflächen (Paket A, Phase 3) ───────────────────────────
   Leer · keine Filtertreffer · Laden · Fehler · kein Zugriff · Dokument nicht
   verfügbar · Erfolg — alle mit demselben Aufbau:

     Icon (internes SVG-System)  ·  Titel  ·  Erklärung
     GENAU eine Hauptaktion, optional eine sekundäre Textaktion

   Verbindlich und hier durchgesetzt:
     • Keine Emojis. Vorher trugen 15 Zustandsflächen ein Emoji als Bildmarke
       (Paket, Beleg, Lupe, Personen, Postfach, Ordner) — sie rendern je nach
       Betriebssystem unterschiedlich, sind nicht einfärbbar und stehen quer
       zum internen Iconsatz.
     • Keine technischen Rohwerte im sichtbaren Text. Der Aufrufer übergibt
       fertige deutsche Sätze; Fehlercodes gehören in Logs, nicht ins UI.
     • Höchstens eine primäre Aktion, damit der Zustand eine klare Fortsetzung
       hat statt einer Auswahl.

   Die Komponenten rendern nur Struktur — sie kennen weder Daten noch
   Navigation noch Ladelogik. */

const TON = { neutral: "", error: "ce-state--error", success: "ce-state--success", loading: "ce-state--loading" };

function StateShell({ icon, title, text, action, secondaryAction, tone = "neutral", role, children }) {
  return (
    <div className={`ce-state ${TON[tone] || ""}`.trim()} role={role}>
      {icon && <div className="ce-state-icon">{icon}</div>}
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
export function EmptyState({ icon = "package", title, text, action, secondaryAction }) {
  return (
    <StateShell
      icon={<Icon n={icon} s={ICON_SIZE.lg} />}
      title={title} text={text} action={action} secondaryAction={secondaryAction}
    />
  );
}

/* Keine Filtertreffer — die Daten existieren, die Auswahl passt nur nicht.
   Bewusst ein eigenes Icon, damit „nichts da" und „nichts gefunden" nicht
   gleich aussehen. */
export function NoResultsState({ title, text, action, secondaryAction }) {
  return (
    <StateShell
      icon={<Icon n="search" s={ICON_SIZE.lg} />}
      title={title} text={text} action={action} secondaryAction={secondaryAction}
    />
  );
}

/* Unbestimmter oder kurzer Vorgang. Für bekannte Listen- und Kartenstrukturen
   ist das Skeleton (unten) die bessere Wahl. */
export function LoadingState({ text = "Wird geladen …" }) {
  return (
    <StateShell
      tone="loading"
      role="status"
      icon={<span className="spinner spinner-dark" />}
      text={text}
    />
  );
}

/* Lokaler oder globaler Fehler. `action` ist typischerweise „Erneut versuchen". */
export function ErrorState({ title, text, action, secondaryAction, icon = "info" }) {
  return (
    <StateShell
      tone="error" role="alert"
      icon={<Icon n={icon} s={ICON_SIZE.lg} />}
      title={title} text={text} action={action} secondaryAction={secondaryAction}
    />
  );
}

/* Kein Zugriff — fachlich kein Fehler, deshalb ein neutraler Ton. */
export function NoAccessState({ title, text, action }) {
  return (
    <StateShell icon={<Icon n="lock" s={ICON_SIZE.lg} />} title={title} text={text} action={action} />
  );
}

/* Erfolgreich abgeschlossener Vorgang. */
export function SuccessState({ title, text, action, secondaryAction }) {
  return (
    <StateShell
      tone="success" role="status"
      icon={<Icon n="check" s={ICON_SIZE.lg} />}
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
