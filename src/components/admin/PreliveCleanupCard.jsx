import React, { useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { getAdminPreliveCleanup, runAdminPreliveCleanup } from "../../api/adminApi";
import { formatCount } from "../../utils/salesPartnerView.mjs";
import {
  PRELIVE_TEXTS,
  blockerText,
  buildCleanupBody,
  cleanupDeletable,
  cleanupOutcome,
  normalizeCleanupDryRun,
  preliveErrorOutcome,
} from "../../utils/salesPartnerPrelive.mjs";

function Zaehlung({ rows, id, caption }) {
  return (
    <div className="table-scroll adm-sp-mini-table" id={id}>
      <table>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Tabelle</th>
            <th scope="col" className="adm-num">Datensätze</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-table={r.key}>
              <td><span className="adm-mono">{r.key}</span></td>
              <td className="adm-num">{formatCount(r.count)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Blockaden({ blockers, id }) {
  return (
    <div className="adm-note adm-note--error adm-sp-note" role="alert" id={id}>
      <div>
        <p className="adm-cn-note-title">{PRELIVE_TEXTS.cleanupBlocked}</p>
        <ul className="adm-cn-blockers">
          {blockers.map((b, i) => <li key={`${b.table}-${b.column || ""}-${i}`}>{blockerText(b)}</li>)}
        </ul>
      </div>
    </div>
  );
}

/* ── Pre-Live · Testdaten bereinigen ─────────────────────────────────────────
   Nie ein Ein-Klick-Löschen: zuerst der Probelauf (GET …/cleanup) mit den
   Zahlen je Tabelle und — deutlich — den Verweisen, die eine Bereinigung
   blockieren; gelöscht wird erst nach der ausdrücklichen Bestätigung
   „Alle Pre-Live-Testdaten endgültig löschen?" und ausschließlich mit dem
   Token dieses Probelaufs. Mit Blockaden, ohne Token oder ohne zu löschende
   Daten bleibt „Löschen" gesperrt. Hat sich der Stand inzwischen geändert
   (409 CLEANUP_STALE) oder ist er blockiert (409 CLEANUP_BLOCKED), wird der
   Probelauf neu geladen; ein offener Ausgang behauptet nichts. */
export function PreliveCleanupCard({ onChanged, onDisabled }) {
  const [probe, setProbe] = useState({ loading: false, error: "", data: null });
  const [bestaetigen, setBestaetigen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ergebnis, setErgebnis] = useState(null);      // cleanupOutcome(…)
  const inFlight = useRef(false);
  const lauf = useRef(0);

  const probelauf = async () => {
    const meinLauf = ++lauf.current;
    setProbe({ loading: true, error: "", data: null });
    try {
      const r = await getAdminPreliveCleanup();
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (meinLauf !== lauf.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = preliveErrorOutcome(r.status, d);
        setProbe({ loading: false, error: folge.text, data: null });
        if (folge.disabled) onDisabled?.();
        return;
      }
      setProbe({ loading: false, error: "", data: normalizeCleanupDryRun(d) });
    } catch {
      if (meinLauf === lauf.current) setProbe({ loading: false, error: "Der Probelauf konnte nicht geladen werden.", data: null });
    }
  };

  const pruefen = () => { setErgebnis(null); probelauf(); };

  const loeschen = async () => {
    const gebaut = buildCleanupBody(probe.data);
    if (!gebaut.ok || inFlight.current) { setBestaetigen(false); return; }
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await runAdminPreliveCleanup(gebaut.body);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (r.status === 401 || r.status === 403) return;
      const folge = cleanupOutcome(r.status, d);
      setBestaetigen(false);
      setErgebnis(folge);
      if (folge.kind === "disabled") { onDisabled?.(); setProbe({ loading: false, error: "", data: null }); return; }
      if (folge.kind === "deleted" || folge.kind === "nothing") {
        // Ein neuer Löschvorgang braucht einen neuen Probelauf.
        setProbe({ loading: false, error: "", data: null });
        onChanged?.();
        return;
      }
      if (folge.reload) probelauf();
    } catch {
      setBestaetigen(false);
      setErgebnis({ kind: "error", text: PRELIVE_TEXTS.cleanupConnection, deleted: [], blockers: [], reload: true });
      probelauf();
      onChanged?.();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const dry = probe.data;
  const loeschbar = cleanupDeletable(dry);

  return (
    <div className="adm-card" id="adm-pl-cleanup-card">
      <div className="adm-card-head">Testdaten bereinigen</div>
      <div className="adm-card-body">
        <p className="adm-support-hint">Vor dem Livegang werden alle Pre-Live-Testdaten entfernt. Erst der Probelauf zeigt, was gelöscht würde.</p>
        <div className="adm-sp-actions">
          <button type="button" className="btn btn-outline btn-sm" id="adm-pl-cleanup-check" onClick={pruefen}
            disabled={probe.loading || busy}>
            {probe.loading ? "Probelauf wird geladen…" : "Probelauf: Bereinigung prüfen"}
          </button>
          <button type="button" className="btn btn-sm adm-btn-danger" id="adm-pl-cleanup-delete"
            onClick={() => setBestaetigen(true)} disabled={!loeschbar || busy || probe.loading}
            aria-describedby={!loeschbar ? "adm-pl-cleanup-locked" : undefined}>
            Alle Pre-Live-Testdaten löschen …
          </button>
        </div>
        {!loeschbar && (
          <span className="sr-only" id="adm-pl-cleanup-locked">Löschen ist erst nach einem Probelauf ohne Blockaden möglich.</span>
        )}

        {ergebnis && (
          <div className={`alert ${ergebnis.kind === "deleted" || ergebnis.kind === "nothing" ? "alert-success" : "alert-error"} adm-sp-note`}
            role={ergebnis.kind === "deleted" || ergebnis.kind === "nothing" ? "status" : "alert"} id="adm-pl-cleanup-result">
            <span>{ergebnis.text}</span>
          </div>
        )}
        {ergebnis && ergebnis.kind === "deleted" && ergebnis.deleted.length > 0 && (
          <Zaehlung rows={ergebnis.deleted} id="adm-pl-cleanup-deleted" caption="Gelöschte Datensätze je Tabelle." />
        )}
        {ergebnis && ergebnis.kind === "blocked" && ergebnis.blockers.length > 0 && !dry && (
          <Blockaden blockers={ergebnis.blockers} id="adm-pl-cleanup-result-blockers" />
        )}

        {probe.error && <div className="alert alert-error adm-sp-note" role="alert" id="adm-pl-cleanup-error">{probe.error}</div>}
        {dry && (
          <div className="adm-sp-note" id="adm-pl-cleanup-dry">
            <h3 className="adm-sp-subtitle">Probelauf</h3>
            {dry.blockers.length > 0 && <Blockaden blockers={dry.blockers} id="adm-pl-cleanup-blockers" />}
            {dry.nothingToDelete ? (
              <p className="adm-support-hint" id="adm-pl-cleanup-nothing">{PRELIVE_TEXTS.cleanupNothing}</p>
            ) : dry.counts.length > 0 ? (
              <Zaehlung rows={dry.counts} id="adm-pl-cleanup-counts" caption="Probelauf: zu löschende Datensätze je Tabelle." />
            ) : (
              <p className="adm-support-hint">Der Probelauf nennt keine Zahlen.</p>
            )}
          </div>
        )}
      </div>

      {bestaetigen && dry && (
        <ConfirmDialog
          title={PRELIVE_TEXTS.cleanupConfirmTitle}
          text={PRELIVE_TEXTS.cleanupConfirmText}
          note={`Laut Probelauf: ${dry.counts.map((c) => `${c.key} ${formatCount(c.count)}`).join(", ") || "keine Angaben"}.`}
          confirmLabel="Endgültig löschen"
          danger
          busy={busy}
          busyLabel="Wird gelöscht…"
          confirmId="adm-pl-cleanup-confirm"
          onCancel={() => { if (!busy) setBestaetigen(false); }}
          onConfirm={loeschen}
        />
      )}
    </div>
  );
}

export default PreliveCleanupCard;
