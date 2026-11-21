import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { AdminBackLink } from "../../components/admin/AdminBackLink";
import { ErrorState, LoadingState } from "../../components/ui/StateView";
import { ConfirmDialog } from "../../components/admin/ConfirmDialog";
import { Field } from "../../components/ui/Field";
import { DateField } from "../../components/admin/DateField";
import { InvoicePdfPreviewModal } from "../../components/dashboard/InvoicePdfPreviewModal";
import { InvoiceSheet } from "../../components/admin/InvoiceSheet";
import { ManualInvoiceReview } from "../../components/admin/ManualInvoiceReview";
import {
  getManualInvoiceStatus, getManualInvoiceDraft, createManualInvoiceDraft, updateManualInvoiceDraft,
  deleteManualInvoiceDraft, issueManualInvoiceDraft, searchManualInvoiceCustomers, previewManualInvoice,
  reviewManualInvoiceDraft, searchManualInvoiceSources,
} from "../../api/adminApi";
import {
  MANUAL_INVOICE_TEXT as T, RECIPIENT_FIELDS, countryOptions, emptyDraftForm, emptyPosition, draftToForm,
  formToPayload, applyCustomerToForm, manualInvoiceError, formatCents, blockerText, issuedNotice,
} from "../../utils/manualInvoiceView.mjs";
import {
  EDITOR_TEXT as E, PREVIEW_DELAY_MS, SOURCE_KIND_TEXT, BILLING_KIND_TEXT, BILLING_KIND_HINT, base64ToBytes, isPdfBytes,
  createLatestGate, previewProblem, clientProblem, previewStatus, regionKeyForField, sourceOptionView, sourceSummary,
} from "../../utils/manualInvoiceEditor.mjs";

// Rechnungseditor DIN A4 (Betreiberauftrag 2026-11-21, Variante A) auf der Seite „Neue Rechnung erstellen"
// (Auftrag 2 / P1): links das echte Rechnungsblatt — das PDF des Servers, nach jeder Eingabepause neu —, rechts die
// Abschnitte; schmal das Blatt oben, die Abschnitte darunter. Ein Klick auf einen Bereich des Blatts öffnet das
// passende Feld. Beträge, Sperren, Nummer und Fingerabdruck kommen ausschließlich vom Server; die Seite rechnet
// nichts, was auf dem Beleg steht. Ausgestellt wird nur nach der Prüfansicht genau der geprüfte Beleg (Fassung +
// Fingerabdruck); ein Doppelklick liefert serverseitig dieselbe Rechnung. Bei der Ausstellung geht KEINE E-Mail hinaus.

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

// Lage des Ausstellens laut Server: Ausstellerdaten und Steuersatz. Nur Feldnamen, nie Werte. Einen
// Freigabeschalter gibt es nicht mehr (Schritt 3) — Entwürfe und Vorschau gehen immer.
function IssueStatus({ status }) {
  if (!status) return null;
  const hinweise = [];
  const issuer = status.issuer || null;
  const legalFormFields = issuer && Array.isArray(issuer.legalFormFields) ? issuer.legalFormFields : [];
  const missing = issuer && Array.isArray(issuer.missingFields) ? issuer.missingFields : [];
  const placeholders = issuer && Array.isArray(issuer.placeholderFields) ? issuer.placeholderFields : [];
  if (legalFormFields.length) {
    hinweise.push("Die Rechtsform des Ausstellers trifft nicht zu (keine GbR; eine geplante Gesellschaft stellt noch keine Rechnungen aus). Entwürfe und Vorschau sind möglich.");
  }
  if (issuer && issuer.ready !== true && (missing.length || placeholders.length || !legalFormFields.length)) {
    hinweise.push(blockerText({
      message: "Die Ausstellerdaten sind unvollständig oder enthalten Platzhalter — ausgestellt wird erst mit vollständigen Daten.",
      missingFields: missing, placeholderFields: placeholders,
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

// Statuszeile der Live-Vorschau: Punkt + Text. Angesagt wird nur, was Handeln verlangt (Eingaben prüfen, Vorschau
// nicht verfügbar) — nicht jedes „wird aktualisiert" bei jeder Eingabepause.
function PreviewState({ status, id }) {
  const ansage = status.tone === "invalid" || status.tone === "failed" ? status.text : "";
  return (
    <p className={`adm-mi-state adm-mi-state--${status.tone}`} id={id}>
      <span className="adm-mi-state-dot" aria-hidden="true" />
      <span>{status.text}</span>
      <span className="sr-only" role="status">{ansage}</span>
    </p>
  );
}

const ohneBezug = { sourceKind: "none", sourceId: null, sourceLabel: "", billingKind: "" };

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
  const [issueBusy, setIssueBusy] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discardBusy, setDiscardBusy] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState(null);
  const issueInFlight = useRef(false);
  const skipLoadFor = useRef(null);

  // Live-Vorschau: letzte gültige Antwort des Servers (Blatt, Summen, Sperren, Bezug), Status und Problem.
  const [live, setLive] = useState(null);
  const [livePending, setLivePending] = useState(false);
  const [liveProblem, setLiveProblem] = useState(null);
  const [activeKey, setActiveKey] = useState(null);
  // Das PDF-Fenster zeigt den Stand beim Öffnen; eine spätere Vorschau lädt es nicht neu (stabiler Abrufer).
  const [pdfBytes, setPdfBytes] = useState(null);
  const holePdf = useCallback(
    () => Promise.resolve({ blob: new Blob([pdfBytes], { type: "application/pdf" }), filename: "Rechnungsentwurf.pdf" }),
    [pdfBytes],
  );
  const gate = useRef(createLatestGate());
  const laufend = useRef(null);
  const letzteFassung = useRef("");
  const neuePosition = useRef(null);

  // Prüfansicht
  const [review, setReview] = useState(null);

  // Bezug: Vorgangsauswahl
  const [sourceQuery, setSourceQuery] = useState("");
  const [sourceHits, setSourceHits] = useState(null);
  const [sourceError, setSourceError] = useState("");
  const [sourceHit, setSourceHit] = useState(null);

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
    // Nach dem Anlegen wechselt nur die Adresse — der Entwurf liegt schon vor.
    if (skipLoadFor.current === String(draftId)) { skipLoadFor.current = null; setLoading(false); return; }
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
      setSourceHit(d.draft && d.draft.source ? d.draft.source : null);
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

  // Vorgangsauswahl: Sendungen bzw. Lageraufträge des gewählten Kunden, solange kein Vorgang gewählt ist.
  useEffect(() => {
    if (form.recipientUserId == null || (form.sourceKind !== "shipment" && form.sourceKind !== "order") || form.sourceId != null) {
      setSourceHits(null);
      return undefined;
    }
    const abbruch = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await searchManualInvoiceSources({ kind: form.sourceKind, userId: form.recipientUserId, q: sourceQuery.trim() }, { signal: abbruch.signal });
        const d = await r.json().catch(() => ({}));
        if (abbruch.signal.aborted) return;
        if (!r.ok) { if (r.status !== 401 && r.status !== 403) setSourceError(E.sourceFailed); setSourceHits([]); return; }
        setSourceError("");
        setSourceHits(Array.isArray(d.sources) ? d.sources : []);
      } catch {
        if (!abbruch.signal.aborted) { setSourceError(E.sourceFailed); setSourceHits([]); }
      }
    }, 300);
    return () => { abbruch.abort(); clearTimeout(t); };
  }, [form.recipientUserId, form.sourceKind, form.sourceId, sourceQuery]);

  // Live-Vorschau: nach jeder Eingabepause die aktuelle (auch ungespeicherte) Fassung an den Server; nur die
  // jüngste Antwort zählt, ältere werden abgebrochen bzw. verworfen. Bei Fehlern bleibt das letzte gültige Blatt.
  const istAusgestellt = !!(draft && draft.status === "issued");
  useEffect(() => {
    if (loading || loadError || istAusgestellt) return undefined;
    const p = formToPayload(form, { lenient: true });
    if (!p.ok) {
      gate.current.next();
      setLivePending(false);
      setLiveProblem(clientProblem(p.errors));
      return undefined;
    }
    const fassung = JSON.stringify(p.payload);
    if (fassung === letzteFassung.current) {
      gate.current.next();
      setLivePending(false);
      setLiveProblem(null);
      return undefined;
    }
    const nr = gate.current.next();
    setLivePending(true);
    const t = setTimeout(async () => {
      if (laufend.current) laufend.current.abort();
      const abbruch = new AbortController();
      laufend.current = abbruch;
      try {
        const r = await previewManualInvoice(p.payload, { signal: abbruch.signal });
        const d = await r.json().catch(() => ({}));
        if (!gate.current.isLatest(nr)) return;
        if (!r.ok) {
          const problem = previewProblem(r.status, d);
          if (problem.kind !== "auth") setLiveProblem(problem);
          setLivePending(false);
          return;
        }
        const bytes = base64ToBytes(d.pdf);
        if (!isPdfBytes(bytes)) { setLiveProblem(previewProblem(500, {})); setLivePending(false); return; }
        letzteFassung.current = fassung;
        setLive({
          sheet: { bytes, regions: d.regions, pageCount: d.pageCount, page: d.page },
          totals: d.totals || null,
          issueBlockers: Array.isArray(d.issueBlockers) ? d.issueBlockers : [],
          source: d.source || null,
          recipientOverflow: d.recipientOverflow === true,
        });
        setLiveProblem(null);
        setLivePending(false);
      } catch {
        if (abbruch.signal.aborted || !gate.current.isLatest(nr)) return;
        setLiveProblem(previewProblem(0, {}));
        setLivePending(false);
      }
    }, letzteFassung.current ? PREVIEW_DELAY_MS : 120);
    return () => clearTimeout(t);
  }, [form, loading, loadError, istAusgestellt]);

  useEffect(() => () => { if (laufend.current) laufend.current.abort(); }, []);

  // Ungespeicherte Änderungen: Neuladen oder Schließen des Tabs fragt der Browser nach.
  useEffect(() => {
    if (!dirty) return undefined;
    const warnen = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warnen);
    return () => window.removeEventListener("beforeunload", warnen);
  }, [dirty]);

  // Eine über das Blatt hinzugefügte Position bekommt den Fokus, sobald sie steht.
  useEffect(() => {
    if (neuePosition.current == null) return;
    const el = document.getElementById(`mi-pos-${neuePosition.current}-description`);
    neuePosition.current = null;
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ block: "center", behavior: "instant" }); }
  }, [form.positions.length]);

  const fe = (key) => fieldErrors[key] || undefined;
  const change = (patch) => { setForm((f) => ({ ...f, ...patch })); setDirty(true); };
  const changeRecipient = (key, value) => { setForm((f) => ({ ...f, recipient: { ...f.recipient, [key]: value } })); setDirty(true); };
  const changePosition = (i, key, value) => {
    setForm((f) => ({ ...f, positions: f.positions.map((p, j) => (j === i ? { ...p, [key]: value } : p)) }));
    setDirty(true);
  };
  const addPosition = () => { setForm((f) => ({ ...f, positions: [...f.positions, emptyPosition()] })); setDirty(true); };
  const addPositionFromSheet = () => { neuePosition.current = form.positions.length; addPosition(); };
  const removePosition = (i) => { setForm((f) => ({ ...f, positions: f.positions.filter((_, j) => j !== i) })); setDirty(true); };
  const chooseCustomer = (customer) => {
    if (customer && customer.id !== form.recipientUserId) setSourceHit(null);
    setForm((f) => applyCustomerToForm(f, customer));
    setDirty(true);
    setHits(null);
    setQuery("");
  };
  const chooseSourceKind = (kind) => {
    setSourceHit(null);
    setSourceQuery("");
    setSourceError("");
    change({ ...ohneBezug, sourceKind: kind });
  };
  const chooseSource = (item) => {
    const view = sourceOptionView(item);
    setSourceHit(item);
    const erlaubt = view.kinds.filter((k) => k.allowed);
    change({ sourceId: view.id, sourceLabel: view.number, billingKind: erlaubt.length === 1 ? erlaubt[0].kind : "" });
  };

  // Bereich des Blatts → Abschnitt: Feld fokussieren und in die Mitte holen.
  const goToRegion = (target) => {
    if (!target) return;
    let id = target.focusId;
    if (target.key === "recipient" && form.recipientKind === "customer" && form.recipientUserId == null) id = "mi-customer-search";
    const el = document.getElementById(id);
    setActiveKey(target.key);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "center", behavior: "instant" });
  };

  // Speichern (streng). → gespeicherter Entwurf oder null.
  const persist = async () => {
    const p = formToPayload(form);
    if (!p.ok) {
      setFieldErrors(p.errors);
      setMsg({ type: "error", text: "Bitte die markierten Angaben prüfen." });
      return null;
    }
    setSaving(true);
    setFieldErrors({});
    try {
      const r = draft
        ? await updateManualInvoiceDraft(draft.id, { ...p.payload, revision: draft.revision })
        : await createManualInvoiceDraft(p.payload);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return null;
        const e = manualInvoiceError(r.status, d);
        setFieldErrors(e.fieldErrors || {});
        setMsg({ type: "error", text: e.text });
        return null;
      }
      setDraft(d.draft);
      setForm(draftToForm(d.draft));
      if (d.draft && d.draft.source) setSourceHit(d.draft.source);
      setDirty(false);
      if (!draft) {
        skipLoadFor.current = String(d.draft.id);
        navigate(`/admin/invoices/manual/${encodeURIComponent(d.draft.id)}`, { replace: true });
      }
      return d.draft;
    } catch {
      setMsg({ type: "error", text: T.failed });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (saving) return;
    setMsg(null);
    if (await persist()) setMsg({ type: "success", text: T.saved });
  };

  const ladePruefansicht = async (id, notice = "") => {
    setReview({ loading: true, data: null, error: "", notice });
    try {
      const r = await reviewManualInvoiceDraft(id);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) { setReview(null); return; }
        setReview({ loading: false, data: null, error: manualInvoiceError(r.status, d).text, notice });
        return;
      }
      const bytes = base64ToBytes(d.pdf);
      if (!isPdfBytes(bytes)) { setReview({ loading: false, data: null, error: T.failed, notice }); return; }
      setReview({
        loading: false, error: "", notice,
        data: { ...d, sheet: { bytes, regions: d.regions, pageCount: d.pageCount, page: d.page } },
      });
    } catch {
      setReview({ loading: false, data: null, error: T.failed, notice });
    }
  };

  // „Prüfen und ausstellen": erst speichern (ausgestellt wird nur die gespeicherte Fassung), dann die Prüfansicht.
  const openReview = async () => {
    if (saving || issueBusy) return;
    setMsg(null);
    let aktuell = draft;
    if (!aktuell || dirty) {
      aktuell = await persist();
      if (!aktuell) return;
    }
    ladePruefansicht(aktuell.id);
  };

  const confirmIssue = async (checked) => {
    if (issueInFlight.current || !draft || !review || !review.data || checked !== true) return;
    issueInFlight.current = true;
    setIssueBusy(true);
    try {
      const r = await issueManualInvoiceDraft(draft.id, review.data.revision, review.data.fingerprint);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const e = manualInvoiceError(r.status, d);
        if (e.stale) { ladePruefansicht(draft.id, e.text); return; }
        setReview((v) => ({ ...(v || {}), error: e.text, blockers: e.blockers }));
        if (e.conflict || e.blockers) { loadDraft(); loadStatus(); }
        return;
      }
      const inv = d.invoice || {};
      navigate(`/admin/invoices/${encodeURIComponent(inv.id)}`, {
        replace: true,
        state: { manualInvoiceNotice: issuedNotice(inv.invoiceNumber, d.alreadyIssued === true) },
      });
    } catch {
      setReview((v) => ({ ...(v || {}), error: T.failed }));
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
      setDirty(false);
      navigate("/admin/invoices", { replace: true });
    } catch {
      setMsg({ type: "error", text: T.failed });
      setDiscardOpen(false);
    } finally {
      setDiscardBusy(false);
    }
  };

  // Zurück mit ungespeicherten Änderungen: erst fragen.
  const back = (
    <span className="adm-mi-back" onClickCapture={(e) => { if (dirty) { e.preventDefault(); setLeaveOpen(true); } }}>
      <AdminBackLink to="/admin/invoices" label="Zurück zu den Rechnungen" />
    </span>
  );

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
  if (istAusgestellt) {
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

  // Summen und Sperren nur vom Server: die jüngste Vorschau (auch ungespeichert), sonst die gespeicherte Fassung.
  const totals = live && live.totals ? live.totals : draft && draft.totals ? draft.totals : null;
  const blockers = live ? live.issueBlockers : draft && Array.isArray(draft.issueBlockers) ? draft.issueBlockers : [];
  const vatPercent = totals ? String(totals.vatRatePercent).replace(".", ",") : "";
  const termDefault = status && status.limits ? status.limits.paymentTermDefaultDays : 7;
  const termMax = status && status.limits ? status.limits.paymentTermMaxDays : 60;
  const lineNet = (i) => (!livePending && totals && totals.lines && totals.lines[i] ? formatCents(totals.lines[i].netCents) : null);
  const vorschau = previewStatus({ pending: livePending, problem: liveProblem, hasSheet: !!live });
  const problemListe = liveProblem && Array.isArray(liveProblem.items) ? liveProblem.items : [];
  const titel = form.recipient.company.trim() ? `Rechnung an ${form.recipient.company.trim()}` : draft ? `${T.titleDraft} #${draft.id}` : T.titleNew;
  const kundeGewaehlt = form.recipientKind === "customer" && form.recipientUserId != null;
  const quelle = sourceHit ? sourceOptionView(sourceHit) : null;
  const bezug = live && live.source ? sourceSummary(live.source) : "";
  const arten = quelle ? quelle.kinds : ["primary", "supplementary"].map((k) => ({ kind: k, label: BILLING_KIND_TEXT[k], allowed: true, reasons: [] }));

  return (
    <div className="adm-page adm-mi adm-mi-editor-page">
      <PageHeader
        variant="admin"
        backLink={back}
        title={titel}
        subtitle={T.subtitle}
        meta={<span className="adm-chip">{draft ? `Entwurf #${draft.id}, Fassung ${draft.revision}` : "Noch nicht gespeichert"}</span>}
      />

      <IssueStatus status={status} />
      <Notice msg={msg} />

      <div className="adm-mi-editor">
        <section className="adm-mi-stage" aria-labelledby="mi-h-sheet">
          <div className="adm-mi-stage-head">
            <h2 className="adm-mi-stage-title" id="mi-h-sheet">Rechnungsblatt</h2>
            <PreviewState status={vorschau} id="mi-preview-state" />
            <button
              id="mi-preview" type="button" className="btn btn-ghost btn-sm adm-mi-stage-pdf"
              onClick={() => { if (live) setPdfBytes(live.sheet.bytes); }} disabled={!live}
            >
              {E.sheetOpenPdf}
            </button>
          </div>
          {problemListe.length > 0 && (
            <div className="adm-mi-problems" id="mi-preview-problems">
              <p>{liveProblem.text}</p>
              <ul className="adm-mi-list">{problemListe.map((p) => <li key={p.key || p.text}>{p.text}</li>)}</ul>
            </div>
          )}
          {liveProblem && liveProblem.kind !== "invalid" && liveProblem.text && (
            <p className="adm-mi-problems" id="mi-preview-failed">{liveProblem.text}</p>
          )}
          {live && live.recipientOverflow && (
            <p className="adm-mi-problems" id="mi-recipient-overflow">
              Die Anschrift hat mehr als sechs Zeilen und passt nicht vollständig in das Anschriftfeld eines Fensterumschlags.
            </p>
          )}
          <p className="adm-support-hint adm-mi-stage-hint">{E.livePreviewHint}</p>
          <InvoiceSheet
            sheet={live ? live.sheet : null}
            interactive
            activeKey={activeKey}
            onRegion={goToRegion}
            onAddPosition={addPositionFromSheet}
            onOpenPdf={() => { if (live) setPdfBytes(live.sheet.bytes); }}
            waitText={!live && (vorschau.tone === "failed" || vorschau.tone === "invalid") ? E.sheetNone : ""}
          />
        </section>

        <div
          className="adm-mi-inspector"
          onFocusCapture={(e) => { const k = regionKeyForField(e.target && e.target.id); if (k) setActiveKey(k); }}
        >
          <section className="adm-card" data-mi-section="recipient" aria-labelledby="mi-h-recipient">
            <h2 className="adm-card-title" id="mi-h-recipient">{T.recipientTitle}</h2>
            <div className="adm-card-body">
              <fieldset className="adm-mi-kind">
                <legend className="sr-only">Art des Empfängers</legend>
                <label className="adm-mi-radio" htmlFor="mi-kind-external">
                  <input
                    type="radio" id="mi-kind-external" name="mi-kind" value="external"
                    checked={form.recipientKind === "external"}
                    onChange={() => { setSourceHit(null); change({ recipientKind: "external", recipientUserId: null, customerLabel: "", ...ohneBezug }); }}
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
                  <button
                    type="button" className="btn btn-outline btn-sm"
                    onClick={() => { setSourceHit(null); change({ recipientUserId: null, customerLabel: "", ...ohneBezug }); }}
                  >
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

          <section className="adm-card" data-mi-section="source" aria-labelledby="mi-h-source" id="mi-source">
            <h2 className="adm-card-title" id="mi-h-source">{E.sourceTitle}</h2>
            <div className="adm-card-body">
              {!kundeGewaehlt ? (
                <p className="adm-support-hint" id="mi-source-needs-customer">{E.sourceNeedsCustomer}</p>
              ) : (
                <>
                  <p className="adm-support-hint">{E.sourceHint}</p>
                  <fieldset className="adm-mi-kind">
                    <legend className="sr-only">Bezug der Rechnung</legend>
                    {["none", "shipment", "order"].map((k) => (
                      <label className="adm-mi-radio" htmlFor={`mi-source-${k}`} key={k}>
                        <input
                          type="radio" id={`mi-source-${k}`} name="mi-source-kind" value={k}
                          checked={form.sourceKind === k} onChange={() => chooseSourceKind(k)}
                        />
                        <span>{SOURCE_KIND_TEXT[k]}</span>
                      </label>
                    ))}
                  </fieldset>

                  {form.sourceKind !== "none" && form.sourceId == null && (
                    <div className="adm-mi-search">
                      <Field
                        id="mi-source-search"
                        label={form.sourceKind === "shipment" ? E.sourceSearchShipment : E.sourceSearchOrder}
                        hint={E.sourceSearchHint} value={sourceQuery} onChange={setSourceQuery} autoComplete="off" error={fe("source")}
                      />
                      {sourceError && <p className="field-error" role="alert" id="mi-source-error">{sourceError}</p>}
                      {sourceHits && sourceHits.length === 0 && !sourceError && <p className="adm-support-hint" id="mi-source-empty">{E.sourceEmpty}</p>}
                      {sourceHits && sourceHits.length > 0 && (
                        <ul className="adm-mi-hits" aria-label="Vorgänge des Kunden" id="mi-source-hits">
                          {sourceHits.map((item) => {
                            const v = sourceOptionView(item);
                            const moeglich = v.kinds.filter((k) => k.allowed).map((k) => k.label).join(" oder ");
                            return (
                              <li key={`${v.kind}-${v.id}`}>
                                <button type="button" className="adm-mi-hit" data-source={v.id} onClick={() => chooseSource(item)}>
                                  <span className="adm-mi-hit-name">{v.number}</span>
                                  <span className="adm-mi-hit-meta">
                                    {[v.date, v.invoices.length ? v.invoices.join(", ") : "noch keine Rechnung",
                                      moeglich ? `möglich: ${moeglich}` : "keine Rechnung möglich"].filter(Boolean).join(" · ")}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}

                  {form.sourceKind !== "none" && form.sourceId != null && (
                    <div className="adm-mi-source" id="mi-source-chosen">
                      <div className="adm-mi-chosen">
                        <span>
                          {form.sourceKind === "shipment" ? "Sendung" : "Lagerauftrag"}: <strong>{form.sourceLabel || (quelle && quelle.number)}</strong>
                          {quelle && quelle.date ? `, ${quelle.date}` : ""}
                        </span>
                        <button
                          type="button" className="btn btn-outline btn-sm"
                          onClick={() => { setSourceHit(null); change({ sourceId: null, sourceLabel: "", billingKind: "" }); }}
                        >
                          {E.sourceChange}
                        </button>
                      </div>
                      {quelle && quelle.invoices.length > 0 && (
                        <p className="adm-support-hint" id="mi-source-invoices">Bestehende Rechnungen: {quelle.invoices.join(", ")}</p>
                      )}
                      {quelle && quelle.restore && (
                        <div className="alert alert-info adm-mi-notice" role="note" id="mi-source-restore">
                          <p><strong>{E.restoreTitle}.</strong> {E.restoreText(quelle.restore.invoiceNumber)}</p>
                          <Link className="btn btn-outline btn-sm" to={`/admin/invoices/${encodeURIComponent(quelle.restore.invoiceId)}`}>
                            {E.restoreLink(quelle.restore.invoiceNumber)}
                          </Link>
                        </div>
                      )}
                      <fieldset className="adm-mi-billing">
                        <legend className="adm-mi-legend">{E.sourceKindLegend}</legend>
                        {arten.map((k) => (
                          <div className="adm-mi-billing-option" key={k.kind}>
                            <label className="adm-mi-radio" htmlFor={`mi-billing-${k.kind}`}>
                              <input
                                type="radio" id={`mi-billing-${k.kind}`} name="mi-billing-kind" value={k.kind}
                                checked={form.billingKind === k.kind} disabled={!k.allowed}
                                aria-describedby={`mi-billing-${k.kind}-hint`}
                                onChange={() => change({ billingKind: k.kind })}
                              />
                              <span>{k.label}</span>
                            </label>
                            <p className="adm-support-hint" id={`mi-billing-${k.kind}-hint`}>
                              {k.allowed ? BILLING_KIND_HINT[k.kind] : k.reasons.join(" ")}
                            </p>
                          </div>
                        ))}
                        {fe("billingKind") && <p className="field-error" role="alert" id="mi-billing-err">{fe("billingKind")}</p>}
                      </fieldset>
                    </div>
                  )}
                  {bezug && <p className="adm-support-hint" id="mi-source-summary">Auf dem Beleg: {bezug}</p>}
                </>
              )}
            </div>
          </section>

          <section className="adm-card" data-mi-section="service" aria-labelledby="mi-h-service">
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

          <section className="adm-card" data-mi-section="positions" aria-labelledby="mi-h-positions">
            <h2 className="adm-card-title" id="mi-h-positions">{T.positionsTitle}</h2>
            <div className="adm-card-body">
              <ol className="adm-mi-positions">
                {form.positions.map((p, i) => (
                  <li key={p.key} className={`adm-mi-pos${activeKey === `position:${i}` ? " adm-mi-pos--aktiv" : ""}`} data-pos={i}>
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

          <section className="adm-card" data-mi-section="payment" aria-labelledby="mi-h-payment">
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

          <section className="adm-card adm-mi-totals-card" data-mi-section="totals" aria-labelledby="mi-h-totals">
            <h2 className="adm-card-title" id="mi-h-totals">{T.totalsTitle}</h2>
            <div className="adm-card-body" id="mi-totals-box" tabIndex={-1}>
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
              {blockers.length > 0 && (
                <div className="adm-mi-blocked" id="mi-issue-blocked">
                  <p>{E.reviewBlocked}</p>
                  <ul className="adm-mi-blockers">{blockers.map((b, i) => <li key={i}>{blockerText(b)}</li>)}</ul>
                </div>
              )}
            </div>
          </section>

          <section className="adm-card adm-mi-issuer" data-mi-section="issuer" aria-labelledby="mi-h-issuer">
            <h2 className="adm-card-title" id="mi-h-issuer">{E.issuerTitle}</h2>
            <div className="adm-card-body" id="mi-issuer-note" tabIndex={-1}>
              <p className="adm-support-hint">{E.issuerNote}</p>
            </div>
          </section>
        </div>
      </div>

      <div className="adm-mi-bar" role="group" aria-label="Aktionen des Entwurfs">
        <button
          id="mi-discard" type="button" className="btn btn-ghost btn-sm adm-mi-bar-discard"
          onClick={() => (draft ? setDiscardOpen(true) : dirty ? setLeaveOpen(true) : navigate("/admin/invoices"))}
        >
          {T.discard}
        </button>
        <div className="adm-mi-bar-main">
          <button id="mi-save" type="button" className="btn btn-outline btn-sm" onClick={save} disabled={saving}>
            {saving ? T.saving : T.save}
          </button>
          <button id="mi-issue" type="button" className="btn btn-primary btn-sm" onClick={openReview} disabled={saving || issueBusy}>
            {T.issue}
          </button>
        </div>
      </div>

      {pdfBytes && (
        <InvoicePdfPreviewModal title={T.previewTitle} fetchPdf={holePdf} onClose={() => setPdfBytes(null)} printable />
      )}

      {review && draft && (
        <ManualInvoiceReview
          state={review}
          recipient={form.recipient}
          subline={`${T.titleDraft} #${draft.id}, Fassung ${review.data ? review.data.revision : draft.revision}`}
          busy={issueBusy}
          onIssue={confirmIssue}
          onClose={() => { if (!issueBusy) setReview(null); }}
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

      {leaveOpen && (
        <ConfirmDialog
          title={E.unsavedLeave}
          text={E.unsavedLeaveText}
          confirmLabel={E.unsavedLeaveConfirm}
          danger
          confirmId="mi-leave-confirm"
          onCancel={() => setLeaveOpen(false)}
          onConfirm={() => { setLeaveOpen(false); setDirty(false); navigate("/admin/invoices"); }}
        />
      )}
    </div>
  );
}
