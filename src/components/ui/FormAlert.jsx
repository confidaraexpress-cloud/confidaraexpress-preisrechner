import React from "react";
import { Icon } from "./Icon";

/* ─────────────────────────────────────────────────────────────────────────────
   Einheitliche Fehler-/Statusmeldung für Formulare.

   Ersetzt die bisherigen Einzeiler `<div className="alert alert-error">{text}</div>`
   überall dort, wo eine Meldung eine Überschrift UND eine Erklärung braucht.
   Der Titel benennt das Problem („Postleitzahl prüfen"), der Text erklärt Ursache
   und Korrektur — statt eines Sammelsatzes wie „Fehler bei Preisberechnung".

   `role="alert"` macht die Meldung für Screenreader sofort hörbar, ohne dass der
   Fokus springt. Der Fokus wandert stattdessen gezielt auf das erste fehlerhafte
   Feld (siehe utils/focusField.js) — so bleibt die Korrektur in einem Schritt
   möglich.

   Nutzt die bestehenden .alert-Klassen (dashboard.css); es kommt nur die
   Titel-/Textstruktur hinzu.
   ───────────────────────────────────────────────────────────────────────────── */
const ICONS = { error: "x", info: "info", success: "check", warning: "info" };

export function FormAlert({ tone = "error", title, message, children, className = "", id }) {
  if (!title && !message && !children) return null;
  const toneClass = tone === "error" ? "alert-error" : tone === "success" ? "alert-success" : "alert-info";
  return (
    <div
      id={id}
      className={`alert ${toneClass} form-alert${className ? ` ${className}` : ""}`}
      role="alert"
    >
      <Icon n={ICONS[tone] || "info"} s={16} />
      <div className="form-alert-body">
        {title && <strong className="form-alert-title">{title}</strong>}
        {message && <span className="form-alert-text">{message}</span>}
        {children}
      </div>
    </div>
  );
}
