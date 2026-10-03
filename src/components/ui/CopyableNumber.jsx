import React, { useState, useRef, useEffect } from "react";

// Zeigt eine Geschäftsnummer (Kunden-, Bestell- oder Rechnungsnummer) über die zentrale
// `.mono`-Klasse an (proportionale Zahlenschrift mit tabular-nums, siehe layout.css) und
// bietet eine tastaturbedienbare Kopieraktion. Bewusst schlank gehalten — keine Badges,
// keine zusätzliche Karte: die Nummer fügt sich in das bestehende Layout ein.
//
// Barrierefreiheit:
//   • Der Kopierbutton ist ein echter <button> (Tab/Enter/Space) mit sichtbarer
//     Textbeschriftung „Kopieren" (Redesign 2026-10: kein Symbol mehr) und einem
//     sprechenden aria-label, das die Bezeichnung UND den Wert nennt.
//   • Die Rückmeldung „Kopiert" läuft über role="status" (aria-live) — sie ist damit nicht
//     ausschließlich über Farbe/Icon erkennbar.
//   • Die Nummer selbst bleibt vollständig als Text vorhanden (kein Abschneiden per CSS);
//     `wordBreak` erlaubt saubere Umbrüche auf schmalen Displays.
export function CopyableNumber({ value, label, size = "md" }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  // Timer beim Unmount aufräumen (kein setState auf einer entfernten Komponente).
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (value == null || String(value).trim() === "") return null;
  const text = String(value);

  const copy = () => {
    navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <span className="ce-copynum" style={{ display: "inline-flex", alignItems: "center", gap: 6, maxWidth: "100%" }}>
      <span
        className="mono"
        style={{ fontSize: size === "lg" ? 16 : 13, letterSpacing: 0.3, wordBreak: "break-all" }}
      >
        {text}
      </span>
      <button
        type="button"
        onClick={copy}
        className="btn btn-ghost btn-sm ce-copynum-btn"
        aria-label={`${label || "Nummer"} ${text} in die Zwischenablage kopieren`}
      >
        Kopieren
      </button>
      {/* Nicht nur Farbe/Icon: die Statusmeldung wird Screenreadern aktiv mitgeteilt. */}
      <span role="status" aria-live="polite" className="text-muted" style={{ fontSize: 12 }}>
        {copied ? "Kopiert" : ""}
      </span>
    </span>
  );
}

export default CopyableNumber;
