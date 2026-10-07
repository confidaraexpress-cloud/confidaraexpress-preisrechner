import React, { useState, useRef, useEffect } from "react";
import { COPY_TEXTS, copyToClipboard, selectElementText } from "../../utils/clipboard.mjs";

// Zeigt eine Geschäftsnummer (Kunden-, Bestell- oder Rechnungsnummer) oder einen Link über die
// zentrale `.mono`-Klasse an (proportionale Zahlenschrift mit tabular-nums, siehe layout.css) und
// bietet eine tastaturbedienbare Kopieraktion. Bewusst schlank gehalten — keine Badges,
// keine zusätzliche Karte: die Nummer fügt sich in das bestehende Layout ein.
//
// Barrierefreiheit:
//   • Der Kopierbutton ist ein echter <button> (Tab/Enter/Space) mit sichtbarer
//     Textbeschriftung „Kopieren" (Redesign 2026-10: kein Symbol mehr) und einem
//     sprechenden aria-label, das die Bezeichnung UND den Wert nennt.
//   • Die Rückmeldung läuft über role="status" (aria-live) — sie ist damit nicht
//     ausschließlich über Farbe/Icon erkennbar.
//   • Die Nummer selbst bleibt vollständig als Text vorhanden (kein Abschneiden per CSS);
//     `wordBreak` erlaubt saubere Umbrüche auf schmalen Displays.
//
// Ehrliche Rückmeldung (UX-Paket 1, 2026-10): „Kopiert" erscheint erst, wenn tatsächlich
// kopiert wurde (utils/clipboard.mjs). Scheitert das Kopieren, ist der Text markiert und eine
// verständliche Meldung nennt den manuellen Weg — sie bleibt bis zum nächsten Versuch stehen.
export function CopyableNumber({ value, label, size = "md" }) {
  const [feedback, setFeedback] = useState(null);   // { ok, text }
  const timerRef = useRef(null);
  const textRef = useRef(null);
  const mountedRef = useRef(true);

  // Timer beim Unmount aufräumen und kein setState auf einer entfernten Komponente.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  if (value == null || String(value).trim() === "") return null;
  const text = String(value);

  const copy = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const ok = await copyToClipboard(text);
    if (!mountedRef.current) return;
    if (ok) {
      setFeedback({ ok: true, text: COPY_TEXTS.copied });
      timerRef.current = setTimeout(() => setFeedback(null), 2000);
      return;
    }
    const markiert = selectElementText(textRef.current);
    setFeedback({ ok: false, text: markiert ? COPY_TEXTS.failedSelected : COPY_TEXTS.failed });
  };

  const fehler = feedback !== null && feedback.ok === false;

  return (
    // Umbruch nur für die (längere) Fehlermeldung — im Normalfall bleibt das bisherige Layout.
    <span className="ce-copynum" style={{ display: "inline-flex", flexWrap: fehler ? "wrap" : undefined, alignItems: "center", gap: 6, maxWidth: "100%" }}>
      <span
        ref={textRef}
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
      <span role="status" aria-live="polite" className={fehler ? "field-error ce-copynum-status" : "text-muted ce-copynum-status"}
        style={fehler ? undefined : { fontSize: 12 }}>
        {feedback ? feedback.text : ""}
      </span>
    </span>
  );
}

export default CopyableNumber;
