import React, { useCallback, useEffect, useRef, useState } from "react";
import { getAdminUserAccountManager, setAdminUserAccountManager } from "../../api/adminApi";
import { dtDE } from "../../utils/formatters";
import {
  AM_ADMIN_TEXT as T, reasonText, saveOutcome, selectAdminAccountManager,
} from "../../utils/adminAccountManagerView.mjs";

/* ── ConfidaraExpress-Betreuung (Admin-Kundendetail, Canonical 1A, v2.90) ─────
   Der persönliche Ansprechpartner des Kunden: aktuelle Zuordnung samt Zeitpunkt, Auswahl, Speichern. Lädt
   eigenständig wie die Unternehmerprüfung — ein Fehler hier blockiert die Seite nie. `refreshKey` (der Kontostatus)
   lädt neu, sobald die Freischaltung oben die automatische Zuteilung ausgelöst hat.

   Gespeichert wird mit dem Stand, den die Karte zeigt (`previousKey`): Hat ein anderer Admin oder die automatische
   Zuteilung inzwischen geändert, meldet der Server 409 und die Karte lädt den aktuellen Stand, statt ihn zu
   überschreiben. Kein Bestätigungsdialog: die Zuordnung ist umkehrbar und wirkt nur auf die Anzeige im
   Kundenbereich, nicht auf Mails, Support oder die Reihenfolge der automatischen Zuteilung. */

export const ACCOUNT_MANAGER_SECTION_ID = "adm-account-manager-section";
export const ACCOUNT_MANAGER_SELECT_ID = "adm-account-manager-select";
export const ACCOUNT_MANAGER_SAVE_ID = "adm-account-manager-save";

export function AccountManagerSection({ userId, refreshKey }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [auswahl, setAuswahl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const laden = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await getAdminUserAccountManager(userId);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      const data = selectAdminAccountManager(r.status, d);
      if (!mounted.current) return;
      setState({ loading: false, error: data ? "" : T.loadError, data });
      setAuswahl(data && data.current ? data.current.key : "");
    } catch {
      if (mounted.current) setState({ loading: false, error: T.loadError, data: null });
    }
  }, [userId]);
  useEffect(() => { laden(); }, [laden, refreshKey]);

  const data = state.data;
  const aktuell = data && data.current ? data.current.key : "";
  const gewaehlt = data ? data.options.find((o) => o.key === auswahl) || null : null;
  const geaendert = Boolean(gewaehlt) && auswahl !== aktuell;

  const speichern = async (e) => {
    e.preventDefault();
    if (busy || !geaendert) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await setAdminUserAccountManager(userId, { accountManagerKey: auswahl, previousKey: aktuell || null });
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!mounted.current) return;
      const ergebnis = saveOutcome(r.status, d, gewaehlt.name);
      setMessage(ergebnis);
      if (ergebnis.reload) await laden();
    } catch {
      if (mounted.current) setMessage({ type: "error", text: T.saveError });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const meldung = message && (
    <div className={`alert ${message.type === "success" ? "alert-success" : message.type === "info" ? "alert-info" : "alert-error"} mt-8`}
      role={message.type === "error" ? "alert" : "status"}>
      {message.text}
    </div>
  );

  return (
    <div className="adm-card" id={ACCOUNT_MANAGER_SECTION_ID}>
      {/* Zustand doppelt codiert: als Text im Kartenkopf und als Auswahlstellung — nie allein farblich. */}
      <div className="adm-card-head">
        {T.title}
        {data && data.applicable && (
          <span className="badge badge--neutral adm-card-head-action">{data.current ? data.current.name : T.unassigned}</span>
        )}
      </div>
      <div className="adm-card-body">
        {state.loading && !data ? (
          <div className="loading-center" role="status" aria-live="polite">
            <span className="spinner spinner-dark" /> {T.loading}
          </div>
        ) : state.error ? (
          <div>
            <div className="alert alert-error" role="alert">{state.error}</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={laden}>{T.reload}</button>
          </div>
        ) : !data.applicable ? (
          <>
            <p className="adm-note"><span>{reasonText(data.reason)}</span></p>
            {meldung}
          </>
        ) : (
          <form onSubmit={speichern} noValidate>
            <label className="field-label" htmlFor={ACCOUNT_MANAGER_SELECT_ID}>{T.fieldLabel}</label>
            <select
              id={ACCOUNT_MANAGER_SELECT_ID}
              className="field-select"
              value={auswahl}
              disabled={busy}
              onChange={(e) => { setAuswahl(e.target.value); setMessage(null); }}
            >
              {!aktuell && <option value="" disabled>{T.unassigned}</option>}
              {data.options.map((o) => (
                <option key={o.key} value={o.key}>{o.name}</option>
              ))}
            </select>
            <dl className="adm-kv mt-8">
              <div className="adm-kv-item"><dt>{T.since}</dt><dd>{data.assignedAt ? dtDE(data.assignedAt) : "—"}</dd></div>
              <div className="adm-kv-item"><dt>{T.nextAutomatic}</dt><dd>{data.nextAutomatic ? data.nextAutomatic.name : "—"}</dd></div>
            </dl>
            <p className="field-hint mt-8">{T.hint}</p>
            <div className="mt-8">
              <button id={ACCOUNT_MANAGER_SAVE_ID} type="submit" className="btn btn-primary btn-sm" disabled={busy || !geaendert}>
                {busy ? T.saving : T.save}
              </button>
            </div>
            {meldung}
          </form>
        )}
      </div>
    </div>
  );
}
