import React from "react";
import { buttonClasses, spinnerClassFor } from "./buttonClasses.mjs";

/* ═══════════════════════════════════════════════════════════════════════════
   Button — dünner Wrapper über das bestehende .btn-Klassensystem (buttons.css).
   Teil der Design Foundation (PR 1). Bewusst KEINE neue UI-Library, keine
   polymorphe/asChild/Slot-API. Standard-Button-Props werden durchgereicht.

   In diesem PR wird KEIN bestehender Button migriert — dies ist das bereit-
   gestellte Primitive für spätere, seitenweise Migrations-PRs. Die Klassenlogik
   ist über buttonClasses.mjs unter Node getestet (Wrapper selbst rendert nur).

   - type="button" als sicherer Standard (verhindert versehentliches Form-Submit).
   - loading deaktiviert den Button (Doppelklick-Schutz) und setzt aria-busy;
     die Kinder bleiben im DOM (nur transparent) → Accessible Name erhalten,
     Layoutbreite stabil; ein zentrierter Spinner wird ergänzt.
   ═══════════════════════════════════════════════════════════════════════════ */
export function Button({
  variant = "primary",
  size,
  loading = false,
  iconOnly = false,
  full = false,
  grow = false,
  disabled = false,
  type = "button",
  className = "",
  children,
  ...rest
}) {
  const cls = buttonClasses({ variant, size, loading, iconOnly, full, grow, className });
  return (
    <button
      type={type}
      className={cls}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {children}
      {loading && <span className={spinnerClassFor(variant)} aria-hidden="true" />}
    </button>
  );
}
