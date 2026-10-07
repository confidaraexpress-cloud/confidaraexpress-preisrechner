import React, { useCallback, useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { DateField } from "./DateField";
import {
  adminCreditNotePdfPath,
  cancelAdminCreditNote,
  generateAdminCreditNoteDocument,
  listAdminSalesPartnerCreditNotes,
  markAdminCreditNotePaid,
} from "../../api/adminApi";
import { downloadDocument } from "../../utils/downloadDocument";
import { formatCents } from "../../utils/salesPartnerView.mjs";
import {
  CREDIT_NOTE_DOWNLOAD_TEXT,
  correctionHints,
  creditNoteDownloadMessage,
  creditNoteFallbackFilename,
  creditNoteIssuedOn,
  creditNoteKindMeta,
  creditNotePeriod,
  creditNoteTaxRate,
  creditNoteTitle,
  payoutText,
} from "../../utils/salesPartnerCreditNotes.mjs";
import { localIsoDate } from "../../utils/adminSalesPartnerView.mjs";
import {
  MAX_CANCEL_REASON,
  MAX_PAYMENT_REFERENCE,
  SETTLEMENT_TEXTS,
  buildCancelBody,
  buildPayoutBody,
  canCancel,
  canDownloadAdmin,
  canMarkPaid,
  canRegenerate,
  cancelResultText,
  creditNoteActionOutcome,
  documentStatusMeta,
  normalizeAdminCreditNotes,
  notificationText,
  regenerateResultText,
} from "../../utils/adminSalesPartnerSettlementView.mjs";

const FEHLER = "Die Gutschriften konnten nicht geladen werden.";

function Badge({ meta, id }) {
  const [cls, label] = meta;
  return <span className={`badge ${cls}`} id={id}>{label}</span>;
}

// Nummer, Titel bzw. Art, Korrekturhinweise und die Adminangaben einer Gutschrift.
function NumberCell({ cn }) {
  return (
    <div className="adm-sp-partner">
      <span className="adm-sp-name adm-sp-cn-number">{cn.number || "—"}</span>
      <span className="adm-sp-sub">{creditNoteTitle(cn)}</span>
      {cn.kind === "cancellation" && <Badge meta={creditNoteKindMeta(cn.kind)} />}
      {correctionHints(cn).map((h) => <span key={h} className="adm-sp-sub">{h}</span>)}
      {cn.cancellationReason && <span className="adm-sp-sub">Grund: {cn.cancellationReason}</span>}
      {cn.issuedByName && <span className="adm-sp-sub">Ausgestellt von {cn.issuedByName}</span>}
    </div>
  );
}

const LEER_AUSZAHLUNG = { paidOn: "", reference: "" };
const LEER_STORNO = { reason: "", acknowledgePaid: false };

/* ── Admin · Gutschriften eines Vertriebspartners ────────────────────────────
   Liste mit Nummer, Art, Zeitraum, Beträgen, Dokument-, Benachrichtigungs- und
   Auszahlungsstand. Aktionen je Gutschrift:
     • PDF — authentifizierter Blob-Abruf (Token nur als Kopfzeile),
     • „Als ausgezahlt markieren" — Datum Pflicht (nicht in der Zukunft),
       Referenz optional,
     • „Stornieren" — Grund Pflicht; ist die Gutschrift bereits ausgezahlt,
       zusätzlich die ausdrückliche Bestätigung „Bereits ausgezahlt – Storno
       trotzdem anlegen" (acknowledgePaid). Die Positionen können danach erneut
       abgerechnet werden,
     • „Dokument erneut erzeugen" — solange das Dokument nicht bereit oder der
       Partner nicht benachrichtigt ist.
   Nach jeder Aktion wird der Stand des Servers neu geladen. */
export function SalesPartnerCreditNotesCard({ partnerId }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [dialog, setDialog] = useState(null);        // { kind, cn, form, errors, error, needsAck }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);      // { type, text }
  const [laedt, setLaedt] = useState(null);          // Kennung beim PDF-Abruf bzw. Erzeugen
  const inFlight = useRef(false);
  const lauf = useRef(0);
  const heute = localIsoDate();

  const load = useCallback(async () => {
    const meinLauf = ++lauf.current;
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const r = await listAdminSalesPartnerCreditNotes(partnerId);
      if (meinLauf !== lauf.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setState({ loading: false, error: FEHLER, data: null });
        return;
      }
      let d = null;
      try { d = await r.json(); } catch { d = null; }
      if (meinLauf !== lauf.current) return;
      setState({ loading: false, error: "", data: normalizeAdminCreditNotes(d) });
    } catch {
      if (meinLauf === lauf.current) setState({ loading: false, error: FEHLER, data: null });
    }
  }, [partnerId]);

  useEffect(() => { load(); return () => { lauf.current += 1; }; }, [load]);

  const liste = state.data?.creditNotes || [];

  const herunterladen = async (cn) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLaedt(cn.id);
    setMessage(null);
    try {
      await downloadDocument(adminCreditNotePdfPath(cn.id), {
        fallbackFilename: creditNoteFallbackFilename(cn.number),
        message: creditNoteDownloadMessage,
        errorText: CREDIT_NOTE_DOWNLOAD_TEXT,
      });
    } catch (e) {
      setMessage({ type: "error", text: e && typeof e.message === "string" && e.message ? e.message : CREDIT_NOTE_DOWNLOAD_TEXT.allgemein });
    } finally {
      inFlight.current = false;
      setLaedt(null);
    }
  };

  const erzeugen = async (cn) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLaedt(cn.id);
    setMessage(null);
    try {
      const r = await generateAdminCreditNoteDocument(cn.id);
      let body = null;
      try { body = await r.json(); } catch { body = null; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        setMessage({ type: "error", text: creditNoteActionOutcome(r.status, body).text });
        return;
      }
      setMessage({ type: "success", text: `${cn.number || "Gutschrift"}: ${regenerateResultText(body)}` });
      load();
    } catch {
      setMessage({ type: "error", text: "Das Dokument wurde nicht erzeugt. Bitte laden Sie den Stand neu und versuchen Sie es erneut." });
    } finally {
      inFlight.current = false;
      setLaedt(null);
    }
  };

  const oeffnen = (kind, cn) => {
    setMessage(null);
    setDialog({ kind, cn, form: kind === "payout" ? { ...LEER_AUSZAHLUNG } : { ...LEER_STORNO }, errors: {}, error: "", needsAck: false });
  };
  const schliessen = () => { if (!busy) setDialog(null); };
  const setFeld = (k, v) => setDialog((x) => (x ? { ...x, form: { ...x.form, [k]: v }, errors: { ...x.errors, [k]: undefined } } : x));

  const senden = async () => {
    if (!dialog || inFlight.current) return;
    const { kind, cn } = dialog;
    const ausgezahlt = cn.payoutStatus === "paid" || dialog.needsAck;
    const gebaut = kind === "payout"
      ? buildPayoutBody(dialog.form, { today: heute })
      : buildCancelBody(dialog.form, { paid: ausgezahlt });
    if (!gebaut.ok) { setDialog((x) => (x ? { ...x, errors: gebaut.errors, error: "" } : x)); return; }
    inFlight.current = true;
    setBusy(true);
    try {
      const r = kind === "payout" ? await markAdminCreditNotePaid(cn.id, gebaut.body) : await cancelAdminCreditNote(cn.id, gebaut.body);
      let body = null;
      try { body = await r.json(); } catch { body = null; }
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return;
        const folge = creditNoteActionOutcome(r.status, body);
        if (folge.reload) {
          setDialog(null);
          setMessage({ type: "error", text: folge.text });
          load();
          return;
        }
        setDialog((x) => (x ? { ...x, errors: { ...x.errors, ...folge.fieldErrors }, error: folge.text, needsAck: x.needsAck || folge.needsAck } : x));
        return;
      }
      setDialog(null);
      setMessage({
        type: "success",
        text: kind === "payout"
          ? `${cn.number || "Die Gutschrift"} ist als ausgezahlt markiert.`
          : cancelResultText(body),
      });
      load();
    } catch {
      setDialog((x) => (x ? { ...x, error: "Die Aktion wurde nicht ausgeführt. Bitte laden Sie den Stand neu und prüfen Sie ihn, bevor Sie es erneut versuchen." } : x));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const fehler = (k) => (dialog?.errors?.[k] ? <span className="field-error">{dialog.errors[k]}</span> : null);
  const zeigeBestaetigung = dialog?.kind === "cancel" && (dialog.cn.payoutStatus === "paid" || dialog.needsAck);

  let inhalt;
  if (state.loading && !state.data) {
    inhalt = <div className="loading-center" role="status"><span className="spinner spinner-dark" /> Wird geladen…</div>;
  } else if (state.error || !state.data) {
    inhalt = (
      <>
        <div className="alert alert-error" role="alert">{state.error || FEHLER}</div>
        <button type="button" className="btn btn-outline btn-sm" onClick={load}>Erneut versuchen</button>
      </>
    );
  } else if (liste.length === 0) {
    inhalt = <p className="adm-support-hint" id="adm-sp-cn-empty">Für diesen Partner wurden noch keine Gutschriften ausgestellt.</p>;
  } else {
    inhalt = (
      <div className="table-scroll adm-sp-mini-table" id="adm-sp-cn-table">
        <table>
          <caption className="sr-only">
            Gutschriften: Nummer und Art, Zeitraum, ausgestellt, Bruttobetrag mit Netto und Steuer, Dokument und Benachrichtigung, Auszahlung, Aktionen.
          </caption>
          <thead>
            <tr>
              <th scope="col">Gutschrift</th>
              <th scope="col">Zeitraum</th>
              <th scope="col">Ausgestellt</th>
              <th scope="col" className="adm-num">Brutto</th>
              <th scope="col">Dokument</th>
              <th scope="col">Auszahlung</th>
              <th scope="col">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {liste.map((cn, i) => {
              const satz = creditNoteTaxRate(cn);
              const aktiv = laedt !== null && laedt === cn.id;
              return (
                <tr key={cn.id ?? `g-${i}`} data-credit-note={cn.id ?? undefined}
                  className={cn.kind === "cancellation" || cn.cancelled ? "adm-sp-row-correction" : undefined}>
                  <td><NumberCell cn={cn} /></td>
                  <td>{creditNotePeriod(cn)}</td>
                  <td>{creditNoteIssuedOn(cn)}</td>
                  <td className="adm-num">
                    {formatCents(cn.grossCents)}
                    <span className="adm-sp-sub adm-sp-block">
                      netto {formatCents(cn.netCents)} · Steuer {formatCents(cn.taxCents)}{satz ? ` (${satz})` : ""}
                    </span>
                  </td>
                  <td>
                    <Badge meta={documentStatusMeta(cn.documentStatus)} id={cn.id != null ? `adm-sp-cn-doc-${cn.id}` : undefined} />
                    <span className="adm-sp-sub adm-sp-block">{notificationText(cn)}</span>
                  </td>
                  <td>
                    {payoutText(cn)}
                    {cn.paidReference && <span className="adm-sp-sub adm-sp-block">Referenz: {cn.paidReference}</span>}
                  </td>
                  <td>
                    <div className="adm-sp-row-actions">
                      {canDownloadAdmin(cn) && (
                        <button type="button" className="btn btn-ghost btn-sm" id={`adm-sp-cn-pdf-${cn.id}`}
                          onClick={() => herunterladen(cn)} disabled={laedt !== null} aria-busy={aktiv ? "true" : undefined}
                          aria-label={`PDF herunterladen: ${cn.number || "Gutschrift"}`}>
                          PDF
                        </button>
                      )}
                      {canMarkPaid(cn) && (
                        <button type="button" className="btn btn-outline btn-sm" id={`adm-sp-cn-payout-${cn.id}`}
                          onClick={() => oeffnen("payout", cn)} disabled={laedt !== null}>
                          Als ausgezahlt markieren
                        </button>
                      )}
                      {canCancel(cn) && (
                        <button type="button" className="btn btn-outline btn-sm" id={`adm-sp-cn-cancel-${cn.id}`}
                          onClick={() => oeffnen("cancel", cn)} disabled={laedt !== null}>
                          Stornieren
                        </button>
                      )}
                      {canRegenerate(cn) && (
                        <button type="button" className="btn btn-ghost btn-sm" id={`adm-sp-cn-regenerate-${cn.id}`}
                          onClick={() => erzeugen(cn)} disabled={laedt !== null} aria-busy={aktiv ? "true" : undefined}>
                          Dokument erneut erzeugen
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="adm-card" id="adm-sp-credit-notes-card">
      <div className="adm-card-head">Gutschriften</div>
      <div className="adm-card-body">
        {message && (
          <div className={`alert ${message.type === "success" ? "alert-success" : "alert-error"}`}
            role={message.type === "success" ? "status" : "alert"} id="adm-sp-cn-message">
            {message.text}
          </div>
        )}
        {inhalt}
      </div>

      {dialog && (
        <ConfirmDialog
          title={dialog.kind === "payout" ? "Als ausgezahlt markieren" : "Gutschrift stornieren"}
          subline={`${dialog.cn.number || "Gutschrift"} · ${formatCents(dialog.cn.grossCents)}`}
          text={dialog.kind === "payout"
            ? "Halten Sie fest, an welchem Tag der Betrag überwiesen wurde."
            : "Zu dieser Gutschrift wird ein Stornobeleg angelegt."}
          note={dialog.kind === "cancel" ? SETTLEMENT_TEXTS.cancelHint : undefined}
          confirmLabel={dialog.kind === "payout" ? "Als ausgezahlt markieren" : "Storno anlegen"}
          irreversible={dialog.kind === "payout"}
          danger={dialog.kind === "cancel"}
          busy={busy}
          confirmId={dialog.kind === "payout" ? "adm-sp-cn-payout-confirm" : "adm-sp-cn-cancel-confirm"}
          onCancel={schliessen}
          onConfirm={senden}
        >
          {dialog.error && <div className="alert alert-error" role="alert">{dialog.error}</div>}
          {dialog.kind === "payout" ? (
            <>
              <div className="adm-sp-datefield">
                <DateField id="adm-sp-cn-paid-on" label="Auszahlungsdatum (Pflicht)" value={dialog.form.paidOn} max={heute}
                  invalid={!!dialog.errors.paidOn} disabled={busy} onChange={(v) => setFeld("paidOn", v)} />
                {fehler("paidOn")}
              </div>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-sp-cn-reference">Referenz der Überweisung (optional)</label>
                <input id="adm-sp-cn-reference" className="field-input" type="text" maxLength={MAX_PAYMENT_REFERENCE} autoComplete="off"
                  value={dialog.form.reference} disabled={busy} onChange={(e) => setFeld("reference", e.target.value)}
                  aria-invalid={dialog.errors.reference ? "true" : undefined} />
                {fehler("reference")}
              </div>
            </>
          ) : (
            <>
              <div className="adm-edit-field">
                <label className="adm-edit-label" htmlFor="adm-sp-cn-cancel-reason">Grund (Pflicht)</label>
                <textarea id="adm-sp-cn-cancel-reason" className="adm-note-input" maxLength={MAX_CANCEL_REASON}
                  value={dialog.form.reason} disabled={busy} aria-required="true"
                  aria-invalid={dialog.errors.reason ? "true" : undefined}
                  onChange={(e) => setFeld("reason", e.target.value)} />
                {fehler("reason")}
              </div>
              {zeigeBestaetigung && (
                <div className="adm-edit-field">
                  <p className="adm-note adm-note--warning adm-sp-note" role="note">
                    {dialog.cn.payoutStatus === "paid"
                      ? `Diese Gutschrift ist bereits ausgezahlt (${payoutText(dialog.cn)}).`
                      : "Diese Gutschrift ist inzwischen als ausgezahlt markiert."}
                  </p>
                  <label className="adm-sp-choice">
                    <input type="checkbox" id="adm-sp-cn-ack-paid" checked={dialog.form.acknowledgePaid === true} disabled={busy}
                      aria-invalid={dialog.errors.acknowledgePaid ? "true" : undefined}
                      onChange={(e) => setFeld("acknowledgePaid", e.target.checked)} />
                    {SETTLEMENT_TEXTS.ackLabel}
                  </label>
                  {fehler("acknowledgePaid")}
                </div>
              )}
            </>
          )}
        </ConfirmDialog>
      )}
    </div>
  );
}

export default SalesPartnerCreditNotesCard;
