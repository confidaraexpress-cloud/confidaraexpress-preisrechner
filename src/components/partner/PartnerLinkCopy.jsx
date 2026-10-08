import React, { useEffect, useRef, useState } from "react";
import { COPY_TEXTS, copyToClipboard, selectElementText } from "../../utils/clipboard.mjs";

/* ── Empfehlungslink mit Kopierknopf (Partnerportal, UX-Paket 3) ─────────────
   Die Aktion steht vorn — ein großer Knopf („Kundenlink kopieren"), mobil in
   voller Breite —, die Adresse klein darunter: sichtbar zur Kontrolle und als
   Weg zum manuellen Kopieren.

   Ehrliche Rückmeldung wie überall (utils/clipboard.mjs, UX-Paket 1): „Kopiert"
   erst nach tatsächlichem Kopieren; scheitert es, ist die Adresse markiert und
   eine verständliche Meldung nennt den manuellen Weg. Die Meldung läuft über
   role="status" — nicht nur über Farbe. */
export function PartnerLinkCopy({ url, buttonLabel, primary = false }) {
  const [feedback, setFeedback] = useState(null);   // { ok, text }
  const urlRef = useRef(null);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = async () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const ok = await copyToClipboard(url);
    if (!mountedRef.current) return;
    if (ok) {
      setFeedback({ ok: true, text: COPY_TEXTS.copied });
      timerRef.current = setTimeout(() => setFeedback(null), 2000);
      return;
    }
    const markiert = selectElementText(urlRef.current);
    setFeedback({ ok: false, text: markiert ? COPY_TEXTS.failedSelected : COPY_TEXTS.failed });
  };

  const fehler = feedback !== null && feedback.ok === false;
  return (
    <div className="spp-linkcopy">
      <button type="button" className={`btn ${primary ? "btn-primary" : "btn-outline"} spp-linkcopy-btn`} onClick={copy}>
        {buttonLabel}
      </button>
      <span className="spp-linkcopy-url" ref={urlRef}>{url}</span>
      <span role="status" aria-live="polite" className={fehler ? "field-error spp-linkcopy-status" : "spp-linkcopy-status"}>
        {feedback ? feedback.text : ""}
      </span>
    </div>
  );
}

export default PartnerLinkCopy;
