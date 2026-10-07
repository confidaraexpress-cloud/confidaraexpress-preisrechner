import React, { useRef, useState } from "react";
import { runAdminPreliveCommissionRun } from "../../api/adminApi";
import { formatCount } from "../../utils/salesPartnerView.mjs";
import { PRELIVE_TEXTS, SKIP_UNKNOWN, normalizeCommissionRun, preliveErrorOutcome } from "../../utils/salesPartnerPrelive.mjs";

/* ── Pre-Live · Provisionslauf (nur Testdaten) ───────────────────────────────
   Stößt den Provisionslauf des Servers für die Testdaten sofort an, statt auf
   den Takt zu warten, und zeigt seine Zahlen: Monatsbewertungen,
   Entscheidungen, Gutschriften, Fehlschläge und zurückgestellte Fälle mit
   deutschem Grund (ein unbekannter Code erscheint nie roh). Läuft gerade ein
   anderer Lauf (`skippedTick`), sagt die Fläche das — nie „0 verarbeitet". */
export function PreliveCommissionRunCard({ onChanged, onDisabled }) {
  const [busy, setBusy] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);     // normalizeCommissionRun(…)
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false);

  const starten = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setMessage(null);
    setErgebnis(null);
    try {
      const r = await runAdminPreliveCommissionRun();
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = preliveErrorOutcome(r.status, d);
        setMessage({ type: "error", text: folge.text });
        if (folge.disabled) onDisabled?.();
        return;
      }
      setErgebnis(normalizeCommissionRun(d));
      onChanged?.({ accounts: false });
    } catch {
      setMessage({ type: "error", text: PRELIVE_TEXTS.commissionRunConnection });
      onChanged?.({ accounts: false });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="adm-card" id="adm-pl-commission-card">
      <div className="adm-card-head">Provisionslauf</div>
      <div className="adm-card-body">
        <p className="adm-support-hint">Bewertet die Monate und entscheidet die Provisionen der Testsendungen sofort. Echte Partner und Sendungen bleiben unberührt.</p>
        <div className="adm-sp-actions">
          <button type="button" className="btn btn-primary btn-sm" id="adm-pl-commission-run" onClick={starten} disabled={busy} aria-busy={busy ? "true" : undefined}>
            {busy ? "Lauf wird ausgeführt…" : PRELIVE_TEXTS.commissionRunLabel}
          </button>
        </div>
        {message && <div className="alert alert-error adm-sp-note" role="alert" id="adm-pl-commission-message">{message.text}</div>}
        {ergebnis && ergebnis.busy && (
          <div className="adm-note adm-note--warning adm-sp-note" role="status" id="adm-pl-commission-busy">
            <span>{PRELIVE_TEXTS.commissionRunBusy}</span>
          </div>
        )}
        {ergebnis && !ergebnis.busy && (
          <div className="adm-sp-note" id="adm-pl-commission-result" role="status">
            <dl className="adm-kv">
              {ergebnis.rows.map((row) => (
                <div className="adm-kv-item" key={row.key} data-stat={row.key}><dt>{row.label}</dt><dd>{row.value}</dd></div>
              ))}
            </dl>
            <h3 className="adm-sp-subtitle">Zurückgestellt</h3>
            {ergebnis.skipped.length === 0 ? (
              <p className="adm-support-hint">Keine zurückgestellten Fälle.</p>
            ) : (
              <ul className="adm-sp-history" id="adm-pl-commission-skipped">
                {ergebnis.skipped.map((s) => (
                  <li key={s.code} className="adm-sp-history-line" title={s.label === SKIP_UNKNOWN ? `Serverwert: ${s.code}` : undefined}>
                    <span>{s.label}</span>
                    <span className="adm-sp-sub">{formatCount(s.count)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default PreliveCommissionRunCard;
