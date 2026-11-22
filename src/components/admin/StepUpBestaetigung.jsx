import React, { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { setStepUpHandler } from "../../api/client";
import { bestaetigungOptionen, bestaetigungPruefen } from "../../api/sicherheitApi";
import { passkeyBestaetigen, passkeyFehlertext } from "../../utils/webauthn.mjs";
import { sicherheitsFehlertext } from "../../utils/adminSicherheit.mjs";

/* ── Sicherheitsbestätigung kritischer Adminaktionen (Step-up, Betreiberauftrag 2026-11-22, D7) ──────────────────────
   Einmal im Adminrahmen eingebunden. Antwortet der Server auf eine kritische Aktion mit 428 STEP_UP_REQUIRED, ruft
   apiFetch den hier registrierten Handler: der Dialog erscheint, der Passkey bestätigt, der Server öffnet ein kurzes
   Bestätigungsfenster — erst dann wiederholt apiFetch genau diese eine Anfrage. Abbrechen lässt die Aktion
   unausgeführt (der Server hat sie vor dem Handler abgelehnt).

   Mehrere gleichzeitige 428 teilen sich EINEN Dialog. Die Optionen werden beim Öffnen geholt, damit der Klick den
   Passkey ohne weiteres Warten anfordert (Safari verlangt eine frische Nutzergeste). */

const TEXT = Object.freeze({
  titel: "Aktion bestätigen",
  text: "Diese Aktion ist besonders geschützt. Bitte bestätigen Sie sie mit Ihrem Passkey – per Fingerabdruck, Gesichtserkennung oder Geräte-PIN.",
  knopf: "Mit Passkey bestätigen",
  laeuft: "Warte auf Bestätigung …",
  hinweis: "Ohne Bestätigung wird die Aktion nicht ausgeführt.",
  netz: "Keine Verbindung. Bitte versuchen Sie es erneut.",
});

async function jsonOderNull(r) {
  try { return await r.json(); } catch { return null; }
}

export function StepUpBestaetigung() {
  const [offen, setOffen] = useState(false);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState("");
  const wartendRef = useRef(null);   // { promise, resolve }
  const optionenRef = useRef(null);  // vorab geholte Optionen (Challenge 5 Minuten gültig)

  const optionenHolen = async () => {
    optionenRef.current = null;
    try {
      const r = await bestaetigungOptionen();
      const d = await jsonOderNull(r);
      if (r.ok && d && d.options) { optionenRef.current = d.options; return true; }
      setFehler(sicherheitsFehlertext(r.status, d));
    } catch {
      setFehler(TEXT.netz);
    }
    return false;
  };

  useEffect(() => {
    setStepUpHandler(() => {
      if (wartendRef.current) return wartendRef.current.promise;
      let resolve;
      const promise = new Promise((r) => { resolve = r; });
      wartendRef.current = { promise, resolve };
      setFehler("");
      setOffen(true);
      optionenHolen();
      return promise;
    });
    return () => {
      setStepUpHandler(null);
      if (wartendRef.current) { wartendRef.current.resolve(false); wartendRef.current = null; }
    };
  }, []);

  const beenden = (ergebnis) => {
    const w = wartendRef.current;
    wartendRef.current = null;
    optionenRef.current = null;
    setOffen(false);
    setLaeuft(false);
    setFehler("");
    if (w) w.resolve(ergebnis);
  };

  const bestaetigen = async () => {
    if (laeuft) return;
    setLaeuft(true);
    setFehler("");
    try {
      if (!optionenRef.current && !(await optionenHolen())) return;
      let antwort;
      try {
        antwort = await passkeyBestaetigen(optionenRef.current);
      } catch (e) {
        setFehler(passkeyFehlertext(e));
        return;
      }
      const r = await bestaetigungPruefen(antwort);
      const d = await jsonOderNull(r);
      // Eine Challenge gilt nur einmal: nach jedem Prüfversuch werden für den nächsten Klick neue Optionen geholt.
      optionenRef.current = null;
      if (!r.ok) {
        setFehler(sicherheitsFehlertext(r.status, d));
        optionenHolen();
        return;
      }
      beenden(true);
    } catch {
      setFehler(TEXT.netz);
    } finally {
      setLaeuft(false);
    }
  };

  if (!offen) return null;
  return (
    <ConfirmDialog
      title={TEXT.titel}
      text={TEXT.text}
      note={TEXT.hinweis}
      confirmLabel={TEXT.knopf}
      busy={laeuft}
      busyLabel={TEXT.laeuft}
      onCancel={() => beenden(false)}
      onConfirm={bestaetigen}
      confirmId="adm-stepup-bestaetigen"
    >
      {fehler ? <p className="adm-stepup-fehler" role="alert">{fehler}</p> : null}
    </ConfirmDialog>
  );
}

export default StepUpBestaetigung;
