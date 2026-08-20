import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../ui/Icon";
import { ErrorState } from "../ui/StateView";
import { money, isoDayDE } from "../../utils/formatters";
import { getCreditNotes } from "../../api/client";
import { downloadCustomerCreditNotePdf } from "../../utils/downloadInvoicePdf";
import {
  normalizeCreditNoteList,
  refundStatusMeta,
  CREDIT_NOTE_LIST_ERROR,
  CREDIT_NOTE_EXPLANATION,
} from "../../utils/creditNoteView.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Gutschriften im Kundenportal — ein eigener Abschnitt UNTER den Rechnungen.
//
// Bewusst nicht in die Rechnungsliste gemischt: eine Gutschrift ist eine andere
// Dokumentart mit eigener Nummer (CE-GU…) und umgekehrtem Vorzeichen. Beide unter
// einer Überschrift hätten die Frage „wie viel schulde ich?" unbeantwortbar
// gemacht — und eine Zeile mit einem Minusbetrag in einer Rechnungsliste liest
// sich wie eine fehlerhafte Rechnung.
//
// Der Abschnitt erscheint NUR, wenn es tatsächlich Gutschriften gibt. Ein leerer
// Abschnitt mit „Noch keine Gutschriften" wäre für die weitaus meisten Konten eine
// dauerhafte Fläche ohne Aussage.
//
// Das Frontend rechnet nichts: Beträge, Nummern und der Erstattungsstand kommen
// fertig vom Server.
// ─────────────────────────────────────────────────────────────────────────────

export const CREDIT_NOTES_SECTION_ID = "kunde-credit-notes";

export function CreditNotesSection() {
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const [items, setItems] = useState(null); // null = noch nicht geladen
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [downloadError, setDownloadError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await getCreditNotes();
      if (!mounted.current) return;
      if (!r.ok) {
        if (r.status === 401 || r.status === 403) return; // zentraler Redirect via apiFetch
        setError(CREDIT_NOTE_LIST_ERROR);
        return;
      }
      let d = {};
      try { d = await r.json(); } catch { d = {}; }
      if (!mounted.current) return;
      setItems(normalizeCreditNoteList(d));
    } catch {
      if (mounted.current) setError(CREDIT_NOTE_LIST_ERROR);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const download = async (cn) => {
    setBusyId(cn.id); setDownloadError("");
    try {
      await downloadCustomerCreditNotePdf(cn.id, cn.creditNoteNumber);
    } catch (e) {
      if (mounted.current) setDownloadError(e && e.message ? e.message : CREDIT_NOTE_LIST_ERROR);
    } finally {
      if (mounted.current) setBusyId(null);
    }
  };

  // Ein Ladefehler verdrängt nichts: er steht als schmale Zeile, die Rechnungsliste
  // darüber bleibt vollständig bedienbar.
  if (error) {
    return (
      <section className="mt-8" id={CREDIT_NOTES_SECTION_ID} aria-label="Gutschriften">
        <ErrorState
          title={error}
          action={<button type="button" className="btn btn-outline btn-sm" onClick={load}>
            <Icon n="refresh" s={14} /> Erneut versuchen</button>}
        />
      </section>
    );
  }
  if (!items || items.length === 0) return null;

  return (
    <section className="mt-8" id={CREDIT_NOTES_SECTION_ID} aria-label="Gutschriften">
      <h2 className="ce-section-title">Gutschriften</h2>
      <p className="field-hint">{CREDIT_NOTE_EXPLANATION}</p>

      {downloadError && (
        <div className="alert alert-error mb-16" role="alert"><Icon n="x" s={16} />{downloadError}</div>
      )}

      <div className="table-card inv-table">
        <table>
          <caption className="sr-only">
            Gutschriften — Beleg, Bezug zur Rechnung, Datum, Betrag, Erstattungsstand und Aktion.
          </caption>
          <thead>
            <tr>
              <th scope="col">Gutschrift</th>
              <th scope="col">Bezug</th>
              <th scope="col">Datum</th>
              <th scope="col" className="ce-num">Betrag</th>
              <th scope="col">Erstattung</th>
              <th scope="col">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {items.map((cn) => {
              const [tone, label] = refundStatusMeta(cn.refundStatus);
              return (
                <tr key={cn.id}>
                  <td><span className="inv-cell-number-value">{cn.creditNoteNumber}</span></td>
                  <td>{cn.invoiceNumber || "—"}</td>
                  <td>{isoDayDE(cn.creditDate)}</td>
                  <td className="ce-num">{money(cn.grossAmount)}</td>
                  <td><span className={`badge ${tone}`}><span className="badge-dot" />{label}</span></td>
                  <td>
                    {cn.downloadAvailable ? (
                      <button
                        type="button" className="btn btn-ghost btn-sm"
                        disabled={busyId != null}
                        aria-label={`Gutschrift ${cn.creditNoteNumber} als PDF herunterladen`}
                        onClick={() => download(cn)}
                      >
                        {busyId === cn.id
                          ? <><span className="spinner spinner-dark" style={{ width: 13, height: 13 }} /> Lädt…</>
                          : <><Icon n="download" s={14} /> PDF</>}
                      </button>
                    ) : (
                      // Ehrlicher Zwischenzustand statt eines Knopfes, der ins Leere führt.
                      <span className="inv-action-reason">Beleg wird erstellt</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobil: Kartenansicht statt gequetschter Tabelle — dasselbe Muster wie bei
          den Rechnungen. */}
      <ul className="inv-cards">
        {items.map((cn) => {
          const [tone, label] = refundStatusMeta(cn.refundStatus);
          return (
            <li className="inv-card" key={cn.id}>
              <div className="inv-card-head">
                <span className="inv-cell-number-value">{cn.creditNoteNumber}</span>
                <span className={`badge ${tone}`}><span className="badge-dot" />{label}</span>
              </div>
              <dl className="inv-card-kv">
                <div className="inv-card-kv-row"><dt>Betrag</dt><dd>{money(cn.grossAmount)}</dd></div>
                <div className="inv-card-kv-row"><dt>Datum</dt><dd>{isoDayDE(cn.creditDate)}</dd></div>
                {cn.invoiceNumber && (
                  <div className="inv-card-kv-row"><dt>Bezug</dt><dd>{cn.invoiceNumber}</dd></div>
                )}
              </dl>
              <div className="inv-card-actions">
                {cn.downloadAvailable ? (
                  <button type="button" className="btn btn-ghost btn-sm" disabled={busyId != null} onClick={() => download(cn)}>
                    <Icon n="download" s={14} /> PDF
                  </button>
                ) : (
                  <span className="inv-action-reason">Beleg wird erstellt</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
