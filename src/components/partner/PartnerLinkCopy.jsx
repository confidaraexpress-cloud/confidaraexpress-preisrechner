import React, { useEffect, useRef, useState } from "react";
import { COPY_TEXTS, copyToClipboard, selectElementText } from "../../utils/clipboard.mjs";
import { TEILEN_TEXT, linkTeilen, teilenMoeglich } from "../../utils/teilen.mjs";
import { Icon } from "../ui/Icon";

/* ── Empfehlungslink mit Kopierknopf (Partnerportal, UX-Paket 3) ─────────────
   Die Aktion steht vorn — ein großer Knopf („Kundenlink kopieren"), mobil in
   voller Breite —, die Adresse klein darunter: sichtbar zur Kontrolle und als
   Weg zum manuellen Kopieren.

   Teilen (Betreiberauftrag 2026-11-22, BERICHT D.3): Auf Telefonen mit System-Teilen (navigator.share, Touch) steht
   „…teilen“ als Hauptaktion vorn, Kopieren daneben als Rückfall. Geteilt wird nur die Adresse — kein Werbetext.
   Bricht die Person das Teilen ab, erscheint keine Meldung; scheitert es, nennt die Meldung den Weg über Kopieren.

   Ehrliche Rückmeldung wie überall (utils/clipboard.mjs, UX-Paket 1): „Kopiert"
   erst nach tatsächlichem Kopieren; scheitert es, ist die Adresse markiert und
   eine verständliche Meldung nennt den manuellen Weg. Die Meldung läuft über
   role="status" — nicht nur über Farbe. */
export function PartnerLinkCopy({ url, buttonLabel, shareLabel = null, primary = false }) {
  const [feedback, setFeedback] = useState(null);   // { ok, text }
  const [teilen] = useState(() => Boolean(shareLabel) && teilenMoeglich());
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

  const melden = (ok, text) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setFeedback({ ok, text });
    if (ok) timerRef.current = setTimeout(() => setFeedback(null), 2000);
  };

  const copy = async () => {
    const ok = await copyToClipboard(url);
    if (!mountedRef.current) return;
    if (ok) { melden(true, COPY_TEXTS.copied); return; }
    const markiert = selectElementText(urlRef.current);
    melden(false, markiert ? COPY_TEXTS.failedSelected : COPY_TEXTS.failed);
  };

  const share = async () => {
    const ergebnis = await linkTeilen(url);
    if (!mountedRef.current || ergebnis === "abgebrochen") return;
    if (ergebnis === "geteilt") melden(true, TEILEN_TEXT.geteilt);
    else melden(false, TEILEN_TEXT.fehler);
  };

  const fehler = feedback !== null && feedback.ok === false;
  return (
    <div className="spp-linkcopy">
      <div className="spp-linkcopy-knoepfe">
        {teilen && (
          <button type="button" className={`btn ${primary ? "btn-primary" : "btn-outline"} spp-linkcopy-btn spp-linkcopy-teilen`} onClick={share}>
            <Icon n="external" s={18} />
            {shareLabel}
          </button>
        )}
        <button type="button" className={`btn ${primary && !teilen ? "btn-primary" : "btn-outline"} spp-linkcopy-btn`} onClick={copy}>
          {teilen && <Icon n="copy" s={18} />}
          {buttonLabel}
        </button>
      </div>
      <span className="spp-linkcopy-url" ref={urlRef}>{url}</span>
      <span role="status" aria-live="polite" className={fehler ? "field-error spp-linkcopy-status" : "spp-linkcopy-status"}>
        {feedback ? feedback.text : ""}
      </span>
    </div>
  );
}

export default PartnerLinkCopy;
