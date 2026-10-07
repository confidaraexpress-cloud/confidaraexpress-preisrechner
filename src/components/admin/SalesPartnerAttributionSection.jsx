import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmDialog } from "./ConfirmDialog";
import { DateField } from "./DateField";
import {
  getAdminUserSalesPartnerAttribution,
  listAdminPreliveAccounts,
  listAdminSalesPartners,
  setAdminUserSalesPartnerAttribution,
} from "../../api/adminApi";
import { usePreliveStatus } from "../../hooks/usePreliveStatus";
import { isTestCustomer, isTestPartner, normalizePreliveAccounts, preliveEnabled } from "../../utils/salesPartnerPrelive.mjs";
import {
  ATTRIBUTION_TEXTS,
  attributionErrorText,
  attributionSourceLabel,
  buildAttributionBody,
  formatTimestamp,
  localIsoDate,
  normalizeAttribution,
  partnerDisplayName,
  selectPartnerRows,
} from "../../utils/adminSalesPartnerView.mjs";

const FEHLER = "Die Vertriebspartner-Zuordnung konnte nicht geladen werden.";
const PARTNER_FEHLER = "Die aktiven Vertriebspartner konnten nicht geladen werden.";
// Auswahl aus der Liste aktiver Partner — eine Seite genügt der Auswahl; mehr
// Partner erreicht der Admin über die Vertriebspartnerverwaltung.
const PARTNER_SEITE = 100;
const LEER = { partnerUserId: "", effectiveDate: "", reason: "" };

const partnerLink = (id, name) => (id != null
  ? <Link to={`/admin/partners/${encodeURIComponent(id)}`}>{name || `Partner #${id}`}</Link>
  : (name || "—"));

/* ── Vertriebspartner-Zuordnung eines Kunden (Admin-Kundendetail) ────────────
   Lädt eigenständig (wie die Supportsektion): ein Fehler hier blockiert die
   Kundendetailseite nie. Zeigt die aktuelle Zuordnung und ihre Historie und
   erlaubt Ändern oder Entfernen — Partner aus der Liste AKTIVER Partner,
   Wirksamkeit ab heute oder später, Begründung Pflicht, Bestätigung per
   Dialog. Ob der Wechsel zulässig ist, entscheidet der Server.

   Pre-Live-Testmodus: Sind Kunde UND gewählter Partner Testkonten (laut
   Kontenliste des Servers, nur bei `enabled: true`), darf das Datum
   zurückliegen. Eine Mischung aus Test- und echtem Konto weist der Server
   mit 409 PRELIVE_TEST_MISMATCH zurück (fester Satz). */
export function SalesPartnerAttributionSection({ userId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [modus, setModus] = useState(null);           // null | "change" | "remove"
  const [form, setForm] = useState(LEER);
  const [errors, setErrors] = useState({});
  const [partner, setPartner] = useState({ loading: false, error: "", rows: [] });
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);
  const heute = localIsoDate();
  // Testkonten nur bei aktivem Pre-Live-Testmodus; ohne Antwort gilt
  // fail-closed „kein Testkonto" (keine zurückliegenden Daten).
  const prelive = usePreliveStatus();
  const testmodus = preliveEnabled(prelive.status);
  const [testKonten, setTestKonten] = useState(null);
  useEffect(() => {
    if (!testmodus) { setTestKonten(null); return undefined; }
    let aktiv = true;
    (async () => {
      try {
        const r = await listAdminPreliveAccounts();
        if (!aktiv) return;
        if (!r.ok) { setTestKonten(null); return; }
        let d = null;
        try { d = await r.json(); } catch { d = null; }
        if (aktiv) setTestKonten(normalizePreliveAccounts(d));
      } catch {
        if (aktiv) setTestKonten(null);
      }
    })();
    return () => { aktiv = false; };
  }, [testmodus]);

  const load = useCallback(async () => {
    if (userId == null || String(userId).trim() === "") { setState({ loading: false, error: "", data: null }); return; }
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await getAdminUserSalesPartnerAttribution(userId);
      if (!mounted.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setState({ loading: false, error: FEHLER, data: null });
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (mounted.current) setState({ loading: false, error: "", data: normalizeAttribution(d) });
    } catch {
      if (mounted.current) setState({ loading: false, error: FEHLER, data: null });
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const ladePartner = async () => {
    setPartner({ loading: true, error: "", rows: [] });
    try {
      const r = await listAdminSalesPartners({ status: "active", page: 1, pageSize: PARTNER_SEITE });
      if (!mounted.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setPartner({ loading: false, error: PARTNER_FEHLER, rows: [] });
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      // Nur tatsächlich aktive Partner sind wählbar — auch wenn eine Antwort
      // einen anderen Status mitliefern sollte.
      const rows = selectPartnerRows(d).filter((p) => p.status === "active" && p.id != null);
      if (mounted.current) setPartner({ loading: false, error: "", rows });
    } catch {
      if (mounted.current) setPartner({ loading: false, error: PARTNER_FEHLER, rows: [] });
    }
  };

  const starten = (art) => {
    setMessage(null);
    setErrors({});
    setForm(LEER);
    setModus(art);
    if (art === "change") ladePartner();
  };

  const pruefen = (e) => {
    e.preventDefault();
    const gebaut = buildAttributionBody({ ...form, remove: modus === "remove" }, { today: heute, allowPast: rueckwirkend });
    if (!gebaut.ok) { setErrors(gebaut.errors); return; }
    setErrors({});
    setConfirm(gebaut.body);
  };

  const senden = async () => {
    if (!confirm || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await setAdminUserSalesPartnerAttribution(userId, confirm);
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        let body = null;
        try { body = await r.json(); } catch { body = null; }
        setMessage({ type: "error", text: attributionErrorText(r.status, body) });
        setConfirm(null);
        return;
      }
      setConfirm(null);
      setModus(null);
      setForm(LEER);
      setMessage({ type: "success", text: confirm.partnerUserId === null ? "Das Ende der Zuordnung wurde gespeichert." : "Die neue Zuordnung wurde gespeichert." });
      load();
    } catch {
      setMessage({ type: "error", text: "Die Zuordnung wurde nicht geändert. Bitte versuchen Sie es erneut." });
      setConfirm(null);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const fehler = (k) => (errors[k] ? <span className="field-error">{errors[k]}</span> : null);
  const aktuell = state.data?.current || null;
  // Zurückliegend nur, wenn Kunde und Partner (gewählt bzw. bisheriger) Testkonten sind.
  const testKunde = testmodus && isTestCustomer(testKonten, userId);
  const gewaehlt = partner.rows.find((p) => String(p.id) === String(form.partnerUserId)) || null;
  const partnerIstTest = modus === "remove"
    ? isTestPartner(testKonten, aktuell?.partnerId)
    : (gewaehlt?.preliveTest === true || isTestPartner(testKonten, form.partnerUserId));
  const rueckwirkend = testKunde && partnerIstTest;
  const gewaehlterName = partnerDisplayName(partner.rows.find((p) => String(p.id) === String(confirm?.partnerUserId)) || null);

  return (
    <div className="adm-card" id="adm-sp-attribution">
      <div className="adm-card-head">Vertriebspartner-Zuordnung</div>
      <div className="adm-card-body">
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`} role={message.type === "success" ? "status" : "alert"}>
            {message.text}
          </div>
        )}
        {state.loading && !state.data ? (
          <div className="loading-center" role="status"><span className="spinner spinner-dark" /> Wird geladen…</div>
        ) : state.error ? (
          <>
            <div className="alert alert-error" role="alert">{state.error}</div>
            <button type="button" className="btn btn-outline btn-sm" onClick={load}>Erneut versuchen</button>
          </>
        ) : (
          <>
            {aktuell ? (
              <dl className="adm-kv">
                <div className="adm-kv-item"><dt>Vertriebspartner</dt><dd id="adm-sp-attribution-current">{partnerLink(aktuell.partnerId, aktuell.partnerName)}</dd></div>
                <div className="adm-kv-item"><dt>Zugeordnet seit</dt><dd>{formatTimestamp(aktuell.validFrom)}</dd></div>
                <div className="adm-kv-item"><dt>Herkunft</dt><dd>{attributionSourceLabel(aktuell.source)}</dd></div>
                <div className="adm-kv-item"><dt>Verwendeter Code</dt><dd>{aktuell.referralCodeUsed ? <span className="adm-mono">{aktuell.referralCodeUsed}</span> : "—"}</dd></div>
              </dl>
            ) : (
              <p className="adm-support-hint" id="adm-sp-attribution-none">Diesem Kunden ist kein Vertriebspartner zugeordnet.</p>
            )}

            {(state.data?.history || []).length > 0 && (
              <>
                <h3 className="adm-sp-subtitle">Historie</h3>
                <div className="table-scroll adm-sp-mini-table">
                  <table>
                    <caption className="sr-only">Historie der Vertriebspartner-Zuordnung: Partner, von, bis, Herkunft, verwendeter Code, erfasst.</caption>
                    <thead>
                      <tr>
                        <th scope="col">Vertriebspartner</th>
                        <th scope="col">Von</th>
                        <th scope="col">Bis</th>
                        <th scope="col">Herkunft</th>
                        <th scope="col">Code</th>
                        <th scope="col">Erfasst</th>
                      </tr>
                    </thead>
                    <tbody>
                      {state.data.history.map((h, i) => (
                        <tr key={i}>
                          <td>{partnerLink(h.partnerId, h.partnerName)}</td>
                          <td>{formatTimestamp(h.validFrom)}</td>
                          <td>{formatTimestamp(h.validTo)}</td>
                          <td>{attributionSourceLabel(h.source)}</td>
                          <td>{h.referralCodeUsed ? <span className="adm-mono">{h.referralCodeUsed}</span> : "—"}</td>
                          <td>{formatTimestamp(h.createdAt, { withTime: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {modus === null && (
              <div className="adm-sp-actions">
                <button type="button" className="btn btn-outline btn-sm" id="adm-sp-attribution-change" onClick={() => starten("change")}>
                  {aktuell ? "Zuordnung ändern" : "Vertriebspartner zuordnen"}
                </button>
                {aktuell && (
                  <button type="button" className="btn btn-outline btn-sm" id="adm-sp-attribution-remove" onClick={() => starten("remove")}>
                    Zuordnung entfernen
                  </button>
                )}
              </div>
            )}

            {modus !== null && (
              <form className="adm-sp-form" onSubmit={pruefen} noValidate>
                {modus === "change" && (
                  <div className="adm-edit-field">
                    <label className="adm-edit-label" htmlFor="adm-sp-attribution-partner">Vertriebspartner (aktiv)</label>
                    <select id="adm-sp-attribution-partner" className="field-select adm-edit-select"
                      value={form.partnerUserId} disabled={partner.loading}
                      onChange={(e) => { setForm((f) => ({ ...f, partnerUserId: e.target.value })); setErrors((x) => ({ ...x, partnerUserId: undefined })); }}
                      aria-invalid={errors.partnerUserId ? "true" : undefined}>
                      <option value="">{partner.loading ? "Wird geladen…" : "Bitte wählen"}</option>
                      {partner.rows.map((p) => <option key={p.id} value={String(p.id)}>{partnerDisplayName(p)}{p.preliveTest ? " – Test" : ""}</option>)}
                    </select>
                    {partner.error && <span className="field-error">{partner.error}</span>}
                    {fehler("partnerUserId")}
                  </div>
                )}
                <div className="adm-sp-datefield">
                  <DateField id="adm-sp-attribution-date" label="Wirksam ab" value={form.effectiveDate} min={rueckwirkend ? undefined : heute}
                    invalid={!!errors.effectiveDate} onChange={(v) => { setForm((f) => ({ ...f, effectiveDate: v })); setErrors((x) => ({ ...x, effectiveDate: undefined })); }} />
                  {rueckwirkend && <span className="adm-edit-hint" id="adm-sp-attribution-backdating">{ATTRIBUTION_TEXTS.pastAllowed}</span>}
                  {fehler("effectiveDate")}
                </div>
                <div className="adm-edit-field adm-sp-form-wide">
                  <label className="adm-edit-label" htmlFor="adm-sp-attribution-reason">Begründung (Pflicht)</label>
                  <input id="adm-sp-attribution-reason" className="field-input" type="text" maxLength={500}
                    value={form.reason} onChange={(e) => { setForm((f) => ({ ...f, reason: e.target.value })); setErrors((x) => ({ ...x, reason: undefined })); }}
                    aria-invalid={errors.reason ? "true" : undefined} />
                  {fehler("reason")}
                </div>
                <div className="adm-sp-form-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setModus(null)}>Abbrechen</button>
                  <button type="submit" className="btn btn-primary btn-sm" id="adm-sp-attribution-submit">
                    {modus === "remove" ? "Zuordnung entfernen" : "Zuordnung speichern"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
        <p className="adm-support-hint">Änderungen gelten ab dem gewählten Tag und werden protokolliert.</p>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.partnerUserId === null ? "Zuordnung entfernen" : "Zuordnung ändern"}
          text={confirm.partnerUserId === null
            ? `Ab ${formatTimestamp(confirm.effectiveDate)} ist diesem Kunden kein Vertriebspartner mehr zugeordnet.`
            : `Ab ${formatTimestamp(confirm.effectiveDate)} ist dieser Kunde ${gewaehlterName} zugeordnet.`}
          note="Die Aktion wird protokolliert."
          confirmLabel={confirm.partnerUserId === null ? "Entfernen" : "Zuordnen"}
          busy={busy}
          confirmId="adm-sp-attribution-confirm"
          onCancel={() => { if (!busy) setConfirm(null); }}
          onConfirm={senden}
        />
      )}
    </div>
  );
}

export default SalesPartnerAttributionSection;
