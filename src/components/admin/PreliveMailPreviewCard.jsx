import React, { useEffect, useRef, useState } from "react";
import { getAdminPreliveMailPreview, listAdminSalesPartnerCreditNotes } from "../../api/adminApi";
import { creditNotePeriod } from "../../utils/salesPartnerCreditNotes.mjs";
import { normalizeAdminCreditNotes } from "../../utils/adminSalesPartnerSettlementView.mjs";
import {
  MAIL_PREVIEW_KINDS,
  PRELIVE_TEXTS,
  buildMailPreviewQuery,
  mailPreviewKind,
  normalizeMailPreview,
  preliveErrorOutcome,
  testAccountName,
} from "../../utils/salesPartnerPrelive.mjs";

const LEER = { kind: MAIL_PREVIEW_KINDS[0].value, partnerUserId: "", creditNoteId: "" };

/* ── Pre-Live · E-Mail-Vorschau ──────────────────────────────────────────────
   Zeigt, wie eine Mail des Vertriebspartnerprogramms für ein Testkonto
   aussähe — es wird KEINE E-Mail versendet. Der Empfänger kommt maskiert vom
   Server. Das HTML der Mail erscheint ausschließlich in einem iframe mit
   leerem `sandbox` (keine Skripte, keine Formulare, keine Navigation, eigener
   undurchsichtiger Ursprung) über `srcdoc` — nie über dangerouslySetInnerHTML
   und nie aus einer Adresse. Für „Neue Gutschrift verfügbar" wird die
   Gutschrift eines Testpartners gewählt. */
export function PreliveMailPreviewCard({ accounts, onDisabled }) {
  const partner = accounts?.partners || [];
  const [form, setForm] = useState(LEER);
  const [errors, setErrors] = useState({});
  const [gutschriften, setGutschriften] = useState({ loading: false, error: "", items: [] });
  const [vorschau, setVorschau] = useState({ loading: false, error: "", data: null });
  const lauf = useRef(0);
  const art = mailPreviewKind(form.kind);
  const brauchtGutschrift = art?.needs === "creditNote";

  // Gutschriften des gewählten Testpartners — nur für „Neue Gutschrift verfügbar".
  useEffect(() => {
    if (!brauchtGutschrift || !form.partnerUserId) { setGutschriften({ loading: false, error: "", items: [] }); return undefined; }
    let aktiv = true;
    setGutschriften({ loading: true, error: "", items: [] });
    (async () => {
      try {
        const r = await listAdminSalesPartnerCreditNotes(form.partnerUserId);
        if (!aktiv) return;
        if (!r.ok) {
          if (r.status !== 401 && r.status !== 403) setGutschriften({ loading: false, error: "Die Gutschriften konnten nicht geladen werden.", items: [] });
          return;
        }
        let d = null;
        try { d = await r.json(); } catch { d = null; }
        if (!aktiv) return;
        setGutschriften({ loading: false, error: "", items: normalizeAdminCreditNotes(d).creditNotes.filter((cn) => cn.id !== null) });
      } catch {
        if (aktiv) setGutschriften({ loading: false, error: "Die Gutschriften konnten nicht geladen werden.", items: [] });
      }
    })();
    return () => { aktiv = false; };
  }, [brauchtGutschrift, form.partnerUserId]);

  const setFeld = (k, v) => {
    setForm((f) => ({ ...f, [k]: v, ...(k === "partnerUserId" || k === "kind" ? { creditNoteId: "" } : {}) }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const laden = async (e) => {
    e.preventDefault();
    const gebaut = buildMailPreviewQuery(form);
    if (!gebaut.ok) { setErrors(gebaut.errors); return; }
    setErrors({});
    const meinLauf = ++lauf.current;
    setVorschau({ loading: true, error: "", data: null });
    try {
      const r = await getAdminPreliveMailPreview(gebaut.query);
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (meinLauf !== lauf.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = preliveErrorOutcome(r.status, d);
        setVorschau({ loading: false, error: folge.text, data: null });
        if (folge.disabled) onDisabled?.();
        return;
      }
      const v = normalizeMailPreview(d);
      setVorschau(v ? { loading: false, error: "", data: v } : { loading: false, error: "Für diese Auswahl gibt es keine Vorschau.", data: null });
    } catch {
      if (meinLauf === lauf.current) setVorschau({ loading: false, error: "Die Vorschau konnte nicht geladen werden.", data: null });
    }
  };

  const fehler = (k) => (errors[k] ? <span className="field-error">{errors[k]}</span> : null);
  const v = vorschau.data;

  return (
    <div className="adm-card" id="adm-pl-mail-card">
      <div className="adm-card-head">E-Mail-Vorschau</div>
      <div className="adm-card-body">
        <div className="adm-note adm-note--info" role="note" id="adm-pl-mail-note"><span>{PRELIVE_TEXTS.mailPreviewNote}</span></div>
        <form className="adm-sp-form adm-sp-note" onSubmit={laden} noValidate id="adm-pl-mail-form">
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-mail-kind">E-Mail</label>
            <select id="adm-pl-mail-kind" className="field-select adm-edit-select" value={form.kind}
              onChange={(e) => setFeld("kind", e.target.value)} aria-invalid={errors.kind ? "true" : undefined}>
              {MAIL_PREVIEW_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            {fehler("kind")}
          </div>
          <div className="adm-edit-field">
            <label className="adm-edit-label" htmlFor="adm-pl-mail-partner">Testpartner</label>
            <select id="adm-pl-mail-partner" className="field-select adm-edit-select" value={form.partnerUserId}
              onChange={(e) => setFeld("partnerUserId", e.target.value)} aria-invalid={errors.partnerUserId ? "true" : undefined}>
              <option value="">Bitte wählen</option>
              {partner.map((p) => <option key={p.id} value={String(p.id)}>{testAccountName(p, "Testpartner")}</option>)}
            </select>
            {fehler("partnerUserId")}
          </div>
          {brauchtGutschrift && (
            <div className="adm-edit-field">
              <label className="adm-edit-label" htmlFor="adm-pl-mail-credit-note">Testgutschrift</label>
              <select id="adm-pl-mail-credit-note" className="field-select adm-edit-select" value={form.creditNoteId}
                onChange={(e) => setFeld("creditNoteId", e.target.value)} disabled={gutschriften.loading || !form.partnerUserId}
                aria-invalid={errors.creditNoteId ? "true" : undefined}>
                <option value="">{gutschriften.loading ? "Wird geladen…" : (form.partnerUserId ? "Bitte wählen" : "Erst einen Testpartner wählen")}</option>
                {gutschriften.items.map((cn) => (
                  <option key={cn.id} value={String(cn.id)}>{`${cn.number || `Gutschrift #${cn.id}`} · ${creditNotePeriod(cn)}`}</option>
                ))}
              </select>
              {gutschriften.error && <span className="field-error">{gutschriften.error}</span>}
              {!gutschriften.loading && !gutschriften.error && form.partnerUserId && gutschriften.items.length === 0 && (
                <span className="adm-edit-hint">Für diesen Testpartner gibt es noch keine Gutschrift.</span>
              )}
              {fehler("creditNoteId")}
            </div>
          )}
          <div className="adm-sp-form-actions">
            <button type="submit" className="btn btn-primary btn-sm" id="adm-pl-mail-load" disabled={vorschau.loading}>
              {vorschau.loading ? "Vorschau wird geladen…" : "Vorschau laden"}
            </button>
          </div>
        </form>

        {vorschau.error && <div className="alert alert-error adm-sp-note" role="alert" id="adm-pl-mail-error">{vorschau.error}</div>}
        {v && (
          <div className="adm-pl-mail" id="adm-pl-mail-preview">
            <dl className="adm-kv">
              <div className="adm-kv-item"><dt>Betreff</dt><dd id="adm-pl-mail-subject">{v.subject || "—"}</dd></div>
              <div className="adm-kv-item"><dt>Empfänger (maskiert)</dt><dd id="adm-pl-mail-recipient">{v.recipient || "—"}</dd></div>
            </dl>
            <iframe
              id="adm-pl-mail-frame"
              className="adm-pl-frame"
              title={`E-Mail-Vorschau: ${v.subject || "ohne Betreff"}`}
              sandbox=""
              referrerPolicy="no-referrer"
              srcDoc={v.html}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default PreliveMailPreviewCard;
