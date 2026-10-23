import React, { useCallback, useEffect, useRef, useState } from "react";
import { addAdminUserBusinessVerification, getAdminUserBusinessEvidence } from "../../api/adminApi";
import {
  BUSINESS_EVIDENCE_TEXTS as T,
  VERIFICATION_METHOD_OPTIONS,
  VERIFICATION_NOTE_MAX,
  businessDeclarationLine,
  evidenceGateHint,
  parseVerificationDraft,
  selectBusinessEvidence,
  termsDeclarationParts,
  verificationLine,
} from "../../utils/businessEvidence.mjs";

/* ── Unternehmerprüfung eines Kunden (Admin-Kundendetail, Go-Live Paket C) ────
   Lädt eigenständig (wie die Support- und Zuordnungssektion): ein Fehler hier
   blockiert die Kundendetailseite nie. Zeigt, was das Konto bei der
   Registrierung erklärt hat (Unternehmer, AGB-Fassung), und hält fest, wie ein
   Admin die Unternehmereigenschaft geprüft hat. Jede Prüfung ist ein neuer
   Vermerk; nichts wird überschrieben. Die Freischaltung hängt nicht daran. */
export function CustomerBusinessEvidenceSection({ userId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [form, setForm] = useState({ method: "", note: "" });
  const [fehler, setFehler] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const laden = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await getAdminUserBusinessEvidence(userId);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      const data = selectBusinessEvidence(r.status, d);
      if (mounted.current) setState({ loading: false, error: data ? "" : T.loadError, data });
    } catch {
      if (mounted.current) setState({ loading: false, error: T.loadError, data: null });
    }
  }, [userId]);
  useEffect(() => { laden(); }, [laden]);

  const speichern = async (e) => {
    e.preventDefault();
    if (busy) return;
    const p = parseVerificationDraft(form);
    if (!p.ok) { setFehler({ [p.field]: p.error }); return; }
    setFehler({}); setMessage(null); setBusy(true);
    try {
      const r = await addAdminUserBusinessVerification(userId, p.body);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (!mounted.current) return;
      if (r.status === 201) {
        setForm({ method: "", note: "" });
        setMessage({ type: "success", text: T.saved });
        await laden();
      } else if (r.status === 400 && d && (d.field === "method" || d.field === "note")) {
        setFehler({ [d.field]: typeof d.error === "string" && d.error ? d.error : T.saveError });
      } else {
        setMessage({ type: "error", text: d && typeof d.error === "string" && d.error ? d.error : T.saveError });
      }
    } catch {
      if (mounted.current) setMessage({ type: "error", text: T.saveError });
    } finally {
      if (mounted.current) setBusy(false);
    }
  };

  const data = state.data;
  const agb = termsDeclarationParts(data);
  const letzte = data && data.verifications.length ? data.verifications[0] : null;
  const fruehere = data ? data.verifications.slice(1) : [];

  return (
    <div className="adm-card" id="adm-business-evidence">
      <div className="adm-card-head">{T.title}</div>
      <div className="adm-card-body">
        {state.loading && !data ? (
          <div className="loading-center" role="status" aria-live="polite">
            <span className="spinner spinner-dark" /> Wird geladen…
          </div>
        ) : state.error ? (
          <div>
            <div className="alert alert-error" role="alert">{state.error}</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={laden}>Erneut laden</button>
          </div>
        ) : (
          <>
            <dl className="adm-kv">
              <div className="adm-kv-item"><dt>{T.businessLabel}</dt><dd>{businessDeclarationLine(data)}</dd></div>
              <div className="adm-kv-item"><dt>{T.termsLabel}</dt><dd>{agb ? <>{agb.confirmed} <span className="adm-nowrap">({agb.version})</span></> : T.notRecorded}</dd></div>
              <div className="adm-kv-item">
                <dt>{T.lastCheckLabel}</dt>
                <dd>
                  {verificationLine(letzte)}
                  {letzte && letzte.note && <span className="adm-evidence-note">{letzte.note}</span>}
                </dd>
              </div>
            </dl>

            {fruehere.length > 0 && (
              <details className="adm-evidence-history">
                <summary>{T.history} ({fruehere.length})</summary>
                <ul>
                  {fruehere.map((v) => (
                    <li key={v.id}>
                      {verificationLine(v)}
                      {v.note && <span className="adm-evidence-note">{v.note}</span>}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {message && (
              <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}
                role={message.type === "success" ? "status" : "alert"}>
                {message.text}
              </div>
            )}

            <form className="adm-evidence-form" onSubmit={speichern} noValidate>
              <label className="adm-edit-label" htmlFor="adm-evidence-method">{T.methodLabel}</label>
              <select
                id="adm-evidence-method"
                className="field-select adm-edit-select"
                value={form.method}
                disabled={busy}
                onChange={(e) => { setForm((f) => ({ ...f, method: e.target.value })); setFehler((x) => ({ ...x, method: undefined })); }}
                aria-invalid={fehler.method ? "true" : undefined}
                aria-describedby={fehler.method ? "adm-evidence-method-error" : undefined}
              >
                <option value="">{T.methodPlaceholder}</option>
                {VERIFICATION_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {fehler.method && <p id="adm-evidence-method-error" className="field-error" role="alert">{fehler.method}</p>}

              <label className="adm-edit-label" htmlFor="adm-evidence-note">{T.noteLabel}</label>
              <textarea
                id="adm-evidence-note"
                className="adm-note-input"
                rows={2}
                maxLength={VERIFICATION_NOTE_MAX}
                value={form.note}
                disabled={busy}
                onChange={(e) => { setForm((f) => ({ ...f, note: e.target.value })); setFehler((x) => ({ ...x, note: undefined })); }}
                aria-invalid={fehler.note ? "true" : undefined}
                aria-describedby={["adm-evidence-note-help", fehler.note ? "adm-evidence-note-error" : null].filter(Boolean).join(" ")}
              />
              <p id="adm-evidence-note-help" className="adm-markup-help">{T.noteHelp}</p>
              {fehler.note && <p id="adm-evidence-note-error" className="field-error" role="alert">{fehler.note}</p>}

              <div className="adm-markup-actions">
                <button type="submit" className="btn btn-primary btn-sm" disabled={busy} aria-busy={busy ? "true" : undefined}>
                  {busy ? T.submitBusy : T.submit}
                </button>
              </div>
            </form>
            {/* Paket D: bei einem Konto ohne USt-IdNr. nennt der Hinweis, dass (und welcher) Nachweis vor der
                Freischaltung fehlt — als Warnung, nicht als Fließtext. */}
            {data && data.verificationRequired
              ? <div className="alert alert-warning" role="status" id="adm-evidence-required">{evidenceGateHint(data)}</div>
              : <p className="adm-support-hint">{evidenceGateHint(data)}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default CustomerBusinessEvidenceSection;
