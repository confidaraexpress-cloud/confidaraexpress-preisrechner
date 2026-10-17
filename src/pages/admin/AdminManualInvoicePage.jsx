import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { AdminBackLink } from "../../components/admin/AdminBackLink";
import { ErrorState, LoadingState } from "../../components/ui/StateView";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { Field } from "../../components/ui/Field";
import { DateField } from "../../components/admin/DateField";
import { InvoicePdfPreviewModal } from "../../components/dashboard/InvoicePdfPreviewModal";
import { fetchManualInvoicePreviewPdf } from "../../utils/downloadInvoicePdf";
import {
  getManualInvoiceStatus, getManualInvoiceDraft, createManualInvoiceDraft, updateManualInvoiceDraft,
  deleteManualInvoiceDraft, issueManualInvoiceDraft, searchManualInvoiceCustomers,
} from "../../api/adminApi";
import {
  MANUAL_INVOICE_TEXT as T, RECIPIENT_FIELDS, countryOptions, emptyDraftForm, emptyPosition, draftToForm,
  formToPayload, applyCustomerToForm, issueAvailability, manualInvoiceError, formatCents, blockerText, issuedNotice,
} from "../../utils/manualInvoiceView.mjs";

// Auftrag 2 / P1 (2026-10-17): „Neue Rechnung erstellen" — Entwurf anlegen, speichern, als „Entwurf – keine Rechnung"
// ansehen und bewusst ausstellen. Beträge, Sperren und die Nummer kommen ausschließlich vom Server; die Seite rechnet
// nichts, was auf dem Beleg steht. Ausgestellt wird genau die gespeicherte Fassung (revision), ein Doppelklick
// liefert serverseitig dieselbe Rechnung. Bei der Ausstellung geht KEINE E-Mail hinaus.

function Notice({ msg }) {
  if (!msg) return null;
  const cls = msg.type === "success" ? "alert-success" : msg.type === "info" ? "alert-info" : "alert-error";
  return (
    <div className={`alert ${cls} adm-mi-notice`} role={msg.type === "error" ? "alert" : "status"} id="mi-message">
      <span>{msg.text}</span>
      {Array.isArray(msg.list) && msg.list.length > 0 && (
        <ul className="adm-mi-list">{msg.list.map((t, i) => <li key={i}>{t}</li>)}</ul>
      )}
    </div>
  );
}

// Lage des Ausstellens laut Server: Schalter, Ausstellerdaten, Steuersatz. Nur Feldnamen, nie Werte.
function IssueStatus({ status }) {
  if (!status) return null;
  const hinweise = [];
  if (status.issueEnabled !== true) {
    hinweise.push("Das Ausstellen manueller Rechnungen ist derzeit nicht freigeschaltet. Entwürfe und Vorschau sind möglich.");
  }
  if (status.issuer && status.issuer.ready !== true) {
    hinweise.push(blockerText({
      message: "Die Ausstellerdaten sind unvollständig oder enthalten Platzhalter — ausgestellt wird erst mit vollständigen Daten.",
      missingFields: status.issuer.missingFields, placeholderFields: status.issuer.placeholderFields,
    }));
  }
  if (status.vatRate && status.vatRate.ok !== true) hinweise.push("Der Umsatzsteuersatz ist nicht korrekt konfiguriert.");
  if (!hinweise.length) return null;
  return (
    <div className="alert alert-info adm-mi-notice" role="note" id="mi-issue-status">
      <ul className="adm-mi-list">{hinweise.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}

export default function AdminManualInvoicePage() {
  const { draftId } = useParams();
  const isNew = draftId === "new";
  const navigate = useNavigate();

  const [status, setStatus] = useState(null);
  const [draft, setDraft] = useState(null);
  const [form, setForm] = useState(emptyDraftForm);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueBusy, setIssueBusy] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardBusy, setDiscardBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState(null);
  const issueInFlight = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const r = await getManualInvoiceStatus();
      if (!r.ok) return;
      const d = await r.json().catch(() => null);
      setStatus(d && typeof d === "object" ? d : null);
    } catch { /* der Server sperrt ohnehin — ohne Status nur kein Hinweis */ }
  }, []);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const loadDraft = useCallback(async () => {
    if (isNew) { setLoading(false); return; }
    setLoading(true);
    setLoadError("");
    try {
      const r = await getManualInvoiceDraft(draftId);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setLoadError(manualInvoiceError(r.status, d).text);
        return;
      }
      setDraft(d.draft);
      setForm(draftToForm(d.draft));
      setDirty(false);
      setFieldErrors({});
    } catch {
      setLoadError(T.failed);
    } finally {
      setLoading(false);
    }
  }, [draftId, isNew]);
  useEffect(() => { loadDraft(); }, [loadDraft]);

  // Kundensuche: erst ab zwei Zeichen, kurz entprellt, nur solange kein Kunde gewählt ist.
  useEffect(() => {
    if (form.recipientKind !== "customer" || form.recipientUserId != null) return undefined;
    const q = query.trim();
    if (q.length < 2) { setHits(null); return undefined; }
    let aus = false;
    const t = setTimeout(async () => {
      try {
        const r = await searchManualInvoiceCustomers(q);
        const d = await r.json().catch(() => ({}));
        if (!aus && r.ok) setHits(Array.isArray(d.customers) ? d.customers : []);
      } catch { if (!aus) setHits([]); }
    }, 300);
    return () => { aus = true; clearTimeout(t); };
  }, [query, form.recipientKind, form.recipientUserId]);

  const fe = (key) => fieldErrors[key] || undefined;
  const change = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const changeRecipient = (key, value) => { setForm((f) => ({ ...f, recipient: { ...f.recipient, [key]: value } })); setDirty(true); };
  const changePosition = (i, key, value) => {
    setForm((f) => ({ ...f, positions: f.positions.map((p, j) => (j === i ? { ...p, [key]: value } : p)) }));
    setDirty(true);
  };
  const addPosition = () => { setForm((f) => ({ ...f, positions: [...f.positions, emptyPosition()] })); setDirty(true); };
  const removePosition = (i) => { setForm((f) => ({ ...f, positions: f.positions.filter((_, j) => j !== i) })); setDirty(true); };
  const chooseCustomer = (customer) => {
    setForm((f) => applyCustomerToForm(f, customer));
    setDirty(true);
    setHits(null);
    setQuery("");
  };

  const save = async () => {
    if (saving) return;
    setMsg(null);
    const p = formToPayload(form);
    if (!p.ok) {
      setFieldErrors(p.errors);
      setMsg({ type: "error", text: "Bitte die markierten Angaben prüfen." });
      return;
    }
    setSaving(true);
    setFieldErrors({});
    try {
      const r = draft
        ? await updateManualInvoiceDraft(draft.id, { ...p.payload, revision: draft.revision })
        : await createManualInvoiceDraft(p.payload);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const e = manualInvoiceError(r.status, d);
        setFieldErrors(e.fieldErrors || {});
        setMsg({ type: "error", text: e.text });
        return;
      }
      setDraft(d.draft);
      setForm(draftToForm(d.draft));
      setDirty(false);
      setMsg({ type: "success", text: T.saved });
      if (!draft) navigate(`/admin/invoices/manual/${encodeURIComponent(d.draft.id)}`, { replace: true });
    } catch {
      setMsg({ type: "error", text: T.failed });
    } finally {
      setSaving(false);
    }
  };

  const confirmIssue = async () => {
    if (issueInFlight.current || !draft) return;
    issueInFlight.current = true;
    setIssueBusy(true);
    setMsg(null);
    try {
      const r = await issueManualInvoiceDraft(draft.id, draft.revision);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const e = manualInvoiceError(r.status, d);
        setMsg({ type: "error", text: e.text, list: e.blockers });
        setIssueOpen(false);
        if (e.conflict || e.blockers) { loadDraft(); loadStatus(); }
        return;
      }
      const inv = d.invoice || {};
      navigate(`/admin/invoices/${encodeURIComponent(inv.id)}`, {
        replace: true,
        state: { manualInvoiceNotice: issuedNotice(inv.invoiceNumber, d.alreadyIssued === true) },
      });
    } catch {
      setMsg({ type: "error", text: T.failed });
      setIssueOpen(false);
    } finally {
      issueInFlight.current = false;
      setIssueBusy(false);
    }
  };

  const confirmDiscard = async () => {
    if (!draft || discardBusy) return;
    setDiscardBusy(true);
    try {
      const r = await deleteManualInvoiceDraft(draft.id, draft.revision);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setMsg({ type: "error", text: manualInvoiceError(r.status, d).text });
        setDiscardOpen(false);
        return;
      }
      navigate("/admin/invoices", { replace: true });
    } catch {
      setMsg({ type: "error", text: T.failed });
      setDiscardOpen(false);
    } finally {
      setDiscardBusy(false);
    }
  };

  const back = <AdminBackLink to="/admin/invoices" label="Zurück zu den Rechnungen" />;

  if (loading) {
    return (
      <div className="adm-page">
        {back}
        <div className="ce-card"><LoadingState text="Entwurf wird geladen …" /></div>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="adm-page">
        {back}
        <div className="ce-card">
          <ErrorState
            title={loadError}
            action={<button type="button" className="btn btn-primary btn-sm" onClick={loadDraft}>Erneut versuchen</button>}
            secondaryAction={<Link className="btn btn-outline btn-sm" to="/admin/invoices">Zurück zur Rechnungsliste</Link>}
          />
        </div>
      </div>
    );
  }
  if (draft && draft.status === "issued") {
    return (
      <div className="adm-page">
        {back}
        <div className="ce-card adm-mi-issued" id="mi-issued">
          <p>{T.alreadyIssued}</p>
          {draft.issuedInvoiceId != null && (
            <Link className="btn btn-primary btn-sm" to={`/admin/invoices/${encodeURIComponent(draft.issuedInvoiceId)}`}>Rechnung öffnen</Link>
          )}
        </div>
      </div>
    );
  }

  const totals = draft && draft.totals ? draft.totals : null;
  const vatPercent = totals ? String(totals.vatRatePercent).replace(".", ",") : "";
  const availability = issueAvailability({ draft, dirty });
  const termDefault = status && status.limits ? status.limits.paymentTermDefaultDays : 7;
  const termMax = status && status.limits ? status.limits.paymentTermMaxDays : 60;
  const lineNet = (i) => (!dirty && totals && totals.lines && totals.lines[i] ? formatCents(totals.lines[i].netCents) : null);

  return (
    <div className="adm-page adm-mi">
      <PageHeader
        variant="admin"
        backLink={back}
        title={draft ? `${T.titleDraft} #${draft.id}` : T.titleNew}
        subtitle={T.subtitle}
        meta={draft ? <span className="adm-chip">Fassung {draft.revision}</span> : null}
      />

      <IssueStatus status={status} />
      <Notice msg={msg} />

      <div className="adm-cards">
        <section className="adm-card" aria-labelledby="mi-h-recipient">
          <h2 className="adm-card-title" id="mi-h-recipient">{T.recipientTitle}</h2>
          <div className="adm-card-body">
            <fieldset className="adm-mi-kind">
              <legend className="sr-only">Art des Empfängers</legend>
              <label className="adm-mi-radio" htmlFor="mi-kind-external">
                <input
                  type="radio" id="mi-kind-external" name="mi-kind" value="external"
                  checked={form.recipientKind === "external"}
                  onChange={() => change({ recipientKind: "external", recipientUserId: null, customerLabel: "" })}
                />
                <span>{T.recipientExternal}</span>
              </label>
              <label className="adm-mi-radio" htmlFor="mi-kind-customer">
                <input
                  type="radio" id="mi-kind-customer" name="mi-kind" value="customer"
                  checked={form.recipientKind === "customer"}
                  onChange={() => change({ recipientKind: "customer" })}
                />
                <span>{T.recipientCustomer}</span>
              </label>
            </fieldset>

            {form.recipientKind === "customer" && (form.recipientUserId == null ? (
              <div className="adm-mi-search">
                <Field
                  id="mi-customer-search" label={T.customerSearchLabel} hint={T.customerSearchHint}
                  value={query} onChange={setQuery} autoComplete="off" error={fe("recipientUserId")}
                />
                {hits && hits.length === 0 && <p className="adm-support-hint" id="mi-customer-empty">{T.customerSearchEmpty}</p>}
                {hits && hits.length > 0 && (
                  <ul className="adm-mi-hits" aria-label="Suchergebnis">
                    {hits.map((c) => (
                      <li key={c.id}>
                        <button type="button" className="adm-mi-hit" data-customer={c.id} onClick={() => chooseCustomer(c)}>
                          <span className="adm-mi-hit-name">{(c.recipient && (c.recipient.company || c.recipient.name)) || "Kunde"}</span>
                          <span className="adm-mi-hit-meta">{[c.customerNumber, c.recipient && c.recipient.city].filter(Boolean).join(" · ")}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="adm-mi-chosen" id="mi-customer-chosen">
                <span>{T.customerChosen}: <strong>{form.customerLabel}</strong></span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => change({ recipientUserId: null, customerLabel: "" })}>
                  {T.customerChange}
                </button>
              </div>
            ))}

            <div className="adm-mi-grid">
              {RECIPIENT_FIELDS.map((fd) => (
                <Field
                  key={fd.key}
                  id={`mi-recipient-${fd.key}`}
                  label={fd.label}
                  required={fd.required === true}
                  optional={fd.required !== true}
                  type={fd.type || "text"}
                  autoComplete={fd.autoComplete}
                  maxLength={fd.max}
                  value={form.recipient[fd.key]}
                  onChange={(v) => changeRecipient(fd.key, v)}
                  error={fe(`recipient.${fd.key}`)}
                  className={fd.key === "company" || fd.key === "street" ? "adm-mi-wide" : ""}
                />
              ))}
              <Field
                id="mi-recipient-country" as="select" label="Land" required
                value={form.recipient.country} onChange={(v) => changeRecipient("country", v)} error={fe("recipient.country")}
              >
                {countryOptions(form.recipient.country).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </Field>
            </div>
            <p className="adm-support-hint">{T.recipientHint}</p>
          </div>
        </section>

        <section className="adm-card" aria-labelledby="mi-h-service">
          <h2 className="adm-card-title" id="mi-h-service">{T.serviceTitle}</h2>
          <div className="adm-card-body">
            <div className="adm-mi-grid">
              <DateField
                id="mi-service-from" label="Leistungsdatum bzw. Beginn des Zeitraums" required
                value={form.serviceDateFrom} onChange={(v) => change({ serviceDateFrom: v })} invalid={!!fe("serviceDateFrom")}
              />
              <DateField
                id="mi-service-to" label="Ende des Leistungszeitraums (optional)"
                value={form.serviceDateTo} onChange={(v) => change({ serviceDateTo: v })}
                min={form.serviceDateFrom || undefined} invalid={!!fe("serviceDateTo")}
              />
              <Field
                id="mi-reference" label="Ihre Referenz" optional maxLength={100} className="adm-mi-wide"
                hint="Bestell- oder Vorgangsnummer des Empfängers, steht oben auf der Rechnung."
                value={form.customerReference} onChange={(v) => change({ customerReference: v })} error={fe("customerReference")}
              />
            </div>
            {(fe("serviceDateFrom") || fe("serviceDateTo")) && (
              <p className="field-error" role="alert">{fe("serviceDateFrom") || fe("serviceDateTo")}</p>
            )}
          </div>
        </section>

        <section className="adm-card" aria-labelledby="mi-h-positions">
          <h2 className="adm-card-title" id="mi-h-positions">{T.positionsTitle}</h2>
          <div className="adm-card-body">
            <ol className="adm-mi-positions">
              {form.positions.map((p, i) => (
                <li key={p.key} className="adm-mi-pos" data-pos={i}>
                  <div className="adm-mi-pos-head">
                    <span className="adm-mi-pos-no">Position {i + 1}</span>
                    {lineNet(i) && <span className="adm-mi-pos-sum">Netto {lineNet(i)}</span>}
                    <button
                      type="button" className="btn btn-ghost btn-sm" onClick={() => removePosition(i)}
                      disabled={form.positions.length === 1} aria-label={`${T.removePosition} ${i + 1}`}
                    >
                      {T.removePosition}
                    </button>
                  </div>
                  <div className="adm-mi-grid">
                    <Field
                      id={`mi-pos-${i}-description`} label="Bezeichnung" required maxLength={200} className="adm-mi-wide"
                      value={p.description} onChange={(v) => changePosition(i, "description", v)} error={fe(`positions.${i}.description`)}
                    />
                    <Field
                      id={`mi-pos-${i}-quantity`} label="Menge" required inputMode="decimal"
                      value={p.quantity} onChange={(v) => changePosition(i, "quantity", v)} error={fe(`positions.${i}.quantity`)}
                    />
                    <Field
                      id={`mi-pos-${i}-unit`} label="Einheit" required maxLength={20}
                      value={p.unit} onChange={(v) => changePosition(i, "unit", v)} error={fe(`positions.${i}.unit`)}
                    />
                    <Field
                      id={`mi-pos-${i}-price`} label="Einzelpreis netto" required inputMode="decimal" unit="€" unitLabel="in Euro"
                      value={p.unitPrice} onChange={(v) => changePosition(i, "unitPrice", v)} error={fe(`positions.${i}.unitPrice`)}
                    />
                    <Field
                      id={`mi-pos-${i}-discount`} label="Rabatt" optional inputMode="decimal" unit="%" unitLabel="in Prozent"
                      value={p.discount} onChange={(v) => changePosition(i, "discount", v)} error={fe(`positions.${i}.discount`)}
                    />
                    <Field
                      id={`mi-pos-${i}-details`} as="textarea" rows={2} label="Zusatztext" optional maxLength={300} className="adm-mi-wide"
                      value={p.details} onChange={(v) => changePosition(i, "details", v)} error={fe(`positions.${i}.details`)}
                    />
                  </div>
                </li>
              ))}
            </ol>
            <div className="adm-support">
              <button type="button" id="mi-add-position" className="btn btn-outline btn-sm" onClick={addPosition}>{T.addPosition}</button>
            </div>
          </div>
        </section>

        <section className="adm-card" aria-labelledby="mi-h-payment">
          <h2 className="adm-card-title" id="mi-h-payment">{T.paymentTitle}</h2>
          <div className="adm-card-body">
            <div className="adm-mi-grid">
              <Field
                id="mi-term" label="Zahlungsziel" optional inputMode="numeric" unit="Tage" unitLabel="in Tagen"
                hint={`0 bis ${termMax} Tage, leer = ${termDefault} Tage. 0 bedeutet sofort fällig.`}
                value={form.paymentTermDays} onChange={(v) => change({ paymentTermDays: v })} error={fe("paymentTermDays")}
              />
              <Field
                id="mi-payment-note" as="textarea" rows={2} label="Zusätzliche Zahlungsinformation" optional maxLength={300}
                className="adm-mi-wide" hint="Die Bankverbindung stammt aus den Ausstellerdaten und ist hier nicht änderbar."
                value={form.paymentNote} onChange={(v) => change({ paymentNote: v })} error={fe("paymentNote")}
              />
              <Field
                id="mi-intro" as="textarea" rows={3} label="Einleitungstext" optional maxLength={1000} className="adm-mi-wide"
                value={form.introText} onChange={(v) => change({ introText: v })} error={fe("introText")}
              />
              <Field
                id="mi-closing" as="textarea" rows={3} label="Schlusstext" optional maxLength={1000} className="adm-mi-wide"
                value={form.closingText} onChange={(v) => change({ closingText: v })} error={fe("closingText")}
              />
            </div>
          </div>
        </section>

        <section className="adm-card" aria-labelledby="mi-h-totals">
          <h2 className="adm-card-title" id="mi-h-totals">{T.totalsTitle}</h2>
          <div className="adm-card-body">
            {totals ? (
              <dl className="adm-mi-totals" id="mi-totals">
                <div><dt>Netto</dt><dd>{formatCents(totals.netCents)}</dd></div>
                <div><dt>Umsatzsteuer {vatPercent} %</dt><dd>{formatCents(totals.vatCents)}</dd></div>
                <div className="adm-mi-totals-gross"><dt>Brutto</dt><dd>{formatCents(totals.grossCents)}</dd></div>
              </dl>
            ) : null}
            <p className="adm-support-hint" id={dirty ? "mi-unsaved" : undefined} role={dirty ? "status" : undefined}>
              {dirty ? T.unsavedHint : T.totalsHint}
            </p>
            <div className="adm-support adm-mi-actions">
              <button id="mi-save" type="button" className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
                {saving ? T.saving : T.save}
              </button>
              <button id="mi-preview" type="button" className="btn btn-outline btn-sm" onClick={() => setPreviewOpen(true)} disabled={!draft || dirty}>
                {T.preview}
              </button>
              <button
                id="mi-issue" type="button" className="btn btn-outline btn-sm adm-irreversible-action"
                onClick={() => { setMsg(null); setIssueOpen(true); }}
                disabled={!availability.allowed || issueBusy}
                aria-describedby={!availability.allowed ? "mi-issue-blocked" : undefined}
              >
                {T.issue}
              </button>
              <button
                id="mi-discard" type="button" className="btn btn-ghost btn-sm"
                onClick={() => (draft ? setDiscardOpen(true) : navigate("/admin/invoices"))}
              >
                {T.discard}
              </button>
            </div>
            {!availability.allowed && (
              <ul className="adm-mi-blockers" id="mi-issue-blocked">
                {availability.reasons.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            )}
          </div>
        </section>
      </div>

      {previewOpen && draft && (
        <InvoicePdfPreviewModal
          title={T.previewTitle}
          fetchPdf={() => fetchManualInvoicePreviewPdf(draft.id)}
          onClose={() => setPreviewOpen(false)}
          printable
        />
      )}

      {issueOpen && draft && (
        <ConfirmDialog
          title={T.issueTitle}
          subline={`${form.recipient.company || "Empfänger"} · Brutto ${totals ? formatCents(totals.grossCents) : "—"}`}
          text={T.issueText}
          note={T.issueNote}
          confirmLabel={T.issueConfirm}
          irreversible
          busy={issueBusy}
          busyLabel={T.issueBusy}
          confirmId="mi-issue-confirm"
          onCancel={() => { if (!issueBusy) setIssueOpen(false); }}
          onConfirm={confirmIssue}
        />
      )}

      {discardOpen && draft && (
        <ConfirmDialog
          title={T.discardTitle}
          subline={`${T.titleDraft} #${draft.id}`}
          text={T.discardText}
          confirmLabel={T.discard}
          danger
          busy={discardBusy}
          busyLabel="Wird verworfen …"
          confirmId="mi-discard-confirm"
          onCancel={() => { if (!discardBusy) setDiscardOpen(false); }}
          onConfirm={confirmDiscard}
        />
      )}
    </div>
  );
}
