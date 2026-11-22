import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { sicherheitLaden } from "../../api/sicherheitApi";
import { ADMIN_SICHERHEIT_PATH } from "../../utils/adminSicherheit.mjs";

/* ── Passkey-Hinweis der Adminübersicht (Betreiberauftrag 2026-11-22, D7) ─────────────────────────────────────────
   Solange das angemeldete Adminkonto keinen Passkey hat, steht über den Zahlen ein Hinweis mit dem Weg zur
   Sicherheitsseite. Er ist nur ein Hinweis: er sperrt nichts und erzwingt nichts (die Passkey-Pflicht ist ein eigener
   Serverschalter). Ohne Antwort oder bei einem Fehler erscheint nichts — die Übersicht bleibt davon unberührt. */
export function PasskeyHinweis() {
  const [ohnePasskey, setOhnePasskey] = useState(false);
  useEffect(() => {
    const abbruch = new AbortController();
    (async () => {
      try {
        const r = await sicherheitLaden({ signal: abbruch.signal });
        if (!r.ok) return;
        const d = await r.json();
        if (!abbruch.signal.aborted && d && Array.isArray(d.passkeys) && d.passkeys.length === 0) setOhnePasskey(true);
      } catch {
        /* still: ein Hinweis, kein Zustand */
      }
    })();
    return () => abbruch.abort();
  }, []);
  if (!ohnePasskey) return null;
  return (
    <div className="adm-note adm-passkey-hinweis" role="status" id="adm-passkey-hinweis">
      <span>
        Schützen Sie Ihr Adminkonto zusätzlich mit einem Passkey — Fingerabdruck, Gesichtserkennung oder Geräte-PIN.
        Die biometrische Prüfung bleibt auf Ihrem Gerät.
      </span>
      <Link to={ADMIN_SICHERHEIT_PATH} className="btn btn-primary btn-sm">Passkey einrichten</Link>
    </div>
  );
}

export default PasskeyHinweis;
