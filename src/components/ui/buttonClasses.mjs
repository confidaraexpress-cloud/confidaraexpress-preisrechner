// Reine Klassennamen-Abbildung für das bestehende .btn-System (Design Foundation).
// Kein JSX/DOM → unter Node (`.mjs`) testbar. Button.jsx nutzt genau diese
// Funktion, damit die Klassenlogik ohne DOM/Render abgedeckt ist.

const VARIANT_CLASS = {
  primary: "btn-primary",
  secondary: "btn-outline", // "secondary" = bestehendes Outline
  outline: "btn-outline",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

/**
 * Baut die className-Kette für einen Button aus dem bestehenden .btn-System.
 * @param {object} [opts]
 * @param {"primary"|"secondary"|"outline"|"ghost"|"danger"} [opts.variant="primary"]
 * @param {"sm"|undefined} [opts.size]
 * @param {boolean} [opts.loading]
 * @param {boolean} [opts.iconOnly]
 * @param {boolean} [opts.full]
 * @param {boolean} [opts.grow]
 * @param {string} [opts.className]
 * @returns {string}
 */
export function buttonClasses({
  variant = "primary",
  size,
  loading = false,
  iconOnly = false,
  full = false,
  grow = false,
  className = "",
} = {}) {
  const parts = ["btn", VARIANT_CLASS[variant] || VARIANT_CLASS.primary];
  if (size === "sm") parts.push("btn-sm");
  if (iconOnly) parts.push("btn-icon");
  if (full) parts.push("btn-full");
  if (grow) parts.push("btn-grow");
  if (loading) parts.push("btn-loading");
  if (className) parts.push(className.trim());
  return parts.join(" ");
}

/** Welcher Spinner passt zur Variante (weiß auf gefüllten, dunkel auf hellen). */
export function spinnerClassFor(variant = "primary") {
  return variant === "primary" || variant === "danger" ? "spinner" : "spinner-dark";
}
