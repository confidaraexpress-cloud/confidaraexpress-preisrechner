import { useCallback, useEffect, useRef, useState } from "react";
import { getAdminOperationsRuntime, sendAdminOperationsAlertTest } from "../../api/adminApi";
import {
  RUNTIME_TEXTS, alertTestOutcome, isRuntimeView, runtimeAlertState, runtimeFindings, runtimeReadouts, runtimeStamp,
  runtimeSummary,
} from "../../utils/adminRuntime.mjs";

// ── Betriebssicht der API (Adminübersicht, eingeklappt) ──────────────────────────
// Die API misst sich selbst (Backend §12.5) und warnt per Mail. Dieser Abschnitt zeigt, was sie zuletzt gemessen
// hat, welche Auffälligkeiten offen sind und wann die letzte Warnmail hinausging — und er kann eine als Test
// markierte Warnung auslösen, damit der Betreiber prüfen kann, ob Warnungen ankommen.
//
// Geladen wird erst beim Öffnen (die Übersicht selbst bleibt so schnell wie zuvor). Ein bereits geladener Stand
// bleibt bei einem Fehler stehen — dieselbe Regel wie bei den Betriebs-Queues. Rechnen und Formulieren liegen in
// utils/adminRuntime.mjs; hier steht nur der Aufbau.
export function RuntimePanel() {
  const [zustand, setZustand] = useState("idle");          // idle | loading | ready | failed
  const [data, setData] = useState(null);
  const [test, setTest] = useState({ sending: false, outcome: null });
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const laden = useCallback(async () => {
    setZustand("loading");
    try {
      const r = await getAdminOperationsRuntime();
      if (!mountedRef.current) return;
      if (!r.ok) {
        // 401/403 behandelt apiFetch zentral (Abmeldung). Bleibt sie aus, steht der Abschnitt nicht im Ladezustand.
        setZustand(r.status === 401 || r.status === 403 ? "idle" : "failed");
        return;
      }
      const d = await r.json().catch(() => null);
      if (!mountedRef.current) return;
      // Ohne ihre Listen ist die Antwort kein Beleg — auch nicht für „keine Auffälligkeit“.
      if (!isRuntimeView(d)) { setZustand("failed"); return; }
      setData(d);
      setZustand("ready");
    } catch {
      if (mountedRef.current) setZustand("failed");
    }
  }, []);

  const beimUmschalten = (e) => {
    if (e.currentTarget.open && zustand === "idle") laden();
  };

  const testSenden = async () => {
    // Die Schaltfläche bleibt während des Sendens fokussierbar (aria-disabled statt disabled) — ein zweiter Klick
    // in dieser Zeit sendet nichts.
    if (test.sending) return;
    setTest({ sending: true, outcome: null });
    let outcome;
    try {
      const r = await sendAdminOperationsAlertTest();
      if (r.status === 401 || r.status === 403) { if (mountedRef.current) setTest({ sending: false, outcome: null }); return; }
      const body = await r.json().catch(() => null);
      outcome = alertTestOutcome(r.status, body);
    } catch {
      outcome = alertTestOutcome(0, null);
    }
    if (!mountedRef.current) return;
    setTest({ sending: false, outcome });
  };

  const anzeigen = runtimeReadouts(data);
  const befunde = runtimeFindings(data);
  const stand = runtimeStamp(data);
  const warnmail = runtimeAlertState(data);

  return (
    <details className="adm-section adm-diag" id="adm-runtime" onToggle={beimUmschalten}>
      <summary className="adm-diag-summary">
        {RUNTIME_TEXTS.title} <span className="adm-diag-count">· {runtimeSummary(zustand, data)}</span>
      </summary>
      <p className="adm-diag-note">{RUNTIME_TEXTS.note}</p>

      {zustand === "loading" && !data && <p className="adm-runtime-line" role="status">{RUNTIME_TEXTS.loading}</p>}
      {zustand === "failed" && (
        <p className="adm-note adm-note--warning adm-runtime-line" role="alert">
          {data ? RUNTIME_TEXTS.stale : RUNTIME_TEXTS.unavailable}
        </p>
      )}

      {data && (
        <>
          {anzeigen.length === 0 ? (
            <p className="adm-runtime-line">{RUNTIME_TEXTS.noSample}</p>
          ) : (
            <ul className="adm-ops adm-ops--runtime" aria-label="Messwerte der letzten Minute">
              {anzeigen.map((a) => (
                <li key={a.key} className="ce-card adm-ops-item adm-ops-item--diagnostic" data-runtime={a.key}>
                  <span className="adm-ops-label">{a.label}</span>
                  <span className="adm-ops-row"><span className="adm-ops-count" aria-live="off">{a.display}</span></span>
                  <span className="adm-ops-hint">{a.hint}</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="adm-runtime-title" id="adm-runtime-befunde">{RUNTIME_TEXTS.findingsTitle}</h3>
          {befunde.length === 0 ? (
            <p className="adm-runtime-line" id="adm-runtime-ruhig">{RUNTIME_TEXTS.findingsNone}</p>
          ) : (
            <ul className="adm-runtime-findings" aria-labelledby="adm-runtime-befunde">
              {befunde.map((b) => (
                <li key={b.key} className="adm-note adm-note--warning" data-finding={b.key}>
                  <strong>{b.category}</strong>
                  {b.metric && <span> — {b.metric}</span>}
                  {b.action && <span className="adm-runtime-action"> {RUNTIME_TEXTS.action} {b.action}</span>}
                </li>
              ))}
            </ul>
          )}

          <p className="adm-runtime-line" id="adm-runtime-warnmail">{warnmail}</p>
          {stand && <p className="adm-runtime-stamp">{stand}</p>}
        </>
      )}

      <div className="adm-runtime-actions">
        <button type="button" className="btn btn-outline btn-sm" id="adm-runtime-refresh"
          onClick={laden} disabled={zustand === "loading"}>
          {RUNTIME_TEXTS.refresh}
        </button>
        <button type="button" className="btn btn-outline btn-sm" id="adm-runtime-test"
          onClick={testSenden} aria-disabled={test.sending ? "true" : undefined} aria-describedby="adm-runtime-test-hint">
          {test.sending ? RUNTIME_TEXTS.testSending : RUNTIME_TEXTS.testButton}
        </button>
        <span className="adm-runtime-hint" id="adm-runtime-test-hint">{RUNTIME_TEXTS.testHint}</span>
      </div>
      {/* Dauerhafter Meldebereich: der Knoten steht immer im Dokument, nur sein Text wechselt — so sagt ein
          Vorleseprogramm das Ergebnis an. */}
      <p className={test.outcome
          ? `adm-note ${test.outcome.kind === "ok" ? "adm-note--info" : "adm-note--error"} adm-runtime-line`
          : "adm-runtime-result-empty"}
        id="adm-runtime-test-result" role="status" aria-live="polite" data-kind={test.outcome ? test.outcome.kind : undefined}>
        {test.outcome ? test.outcome.text : ""}
      </p>
    </details>
  );
}
