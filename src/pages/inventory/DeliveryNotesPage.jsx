import React, { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Werte } from "../../components/ui/Werte";
import { EmptyState, NoResultsState, ListSkeleton } from "../../components/ui/StateView";
import { InlineError, InlineSuccess, InventoryDialog, RowActionsMenu } from "../../components/inventory/InventoryShared";
import { DeliveryNoteUploadDialog } from "../../components/inventory/DeliveryNoteUploadDialog";
import { DeliveryNoteHistoryDialog } from "../../components/inventory/DeliveryNoteHistoryDialog";
import { DeliveryNoteTemplatePanel } from "../../components/inventory/DeliveryNoteTemplatePanel";
import { InvoicePdfPreviewModal } from "../../components/dashboard/InvoicePdfPreviewModal";
import { useAuth } from "../../context/AuthContext";
import {
  getDeliveryNotes, createDeliveryNoteFromTemplate, createConfidaraDeliveryNote, fetchDeliveryNotePdf, deliveryNotePaths,
} from "../../api/deliveryNotesApi";
import { downloadDocument } from "../../utils/downloadDocument";
import { filenameFromContentDisposition } from "../../utils/invoiceView.mjs";
import { deliveryNoteMode } from "../../utils/profileView.mjs";
import {
  DELIVERY_NOTE_TEXT, SOURCE_FILTER_OPTIONS, effectiveView, rowActions, recipientText, dateDe, deliveryNoteErrorText,
} from "../../utils/deliveryNoteView.mjs";

const PAGE_LIMIT = 25;
const TABS = [{ id: "overview", label: DELIVERY_NOTE_TEXT.tabOverview }, { id: "template", label: DELIVERY_NOTE_TEXT.tabTemplate }];

/* ── Lieferscheine ───────────────────────────────────────────────────────────
   Eine Zeile je gebuchter Sendung (Betreiberentscheidung H1 = B: auch Sendungen ohne
   Artikel aus dem Lager). Welcher Lieferschein gilt, entscheidet der Server — die neueste
   eigene Fassung, sonst der ConfidaraExpress-Lieferschein, sonst keiner. Die Seite zeigt
   seine Antwort und bietet nur an, was die Serverfelder (`actions`) erlauben.

   Anker ist die Sendung: Bei Teilversand hat jede Sendung eines Auftrags ihren eigenen
   Lieferschein; die Auftragsnummer steht als Bezug in der Zeile und ist suchbar.

   Aktionen je Zeile: „Herunterladen“ sichtbar, alles Weitere im Menü „Weitere Aktionen“
   — Anzeigen, eigenen Lieferschein hochladen oder ersetzen, aus der Vorlage erstellen,
   ConfidaraExpress-Lieferschein nachträglich erstellen (H2 = A), Verlauf. */
export default function DeliveryNotesPage({ utility, onNavigate }) {
  const { user } = useAuth();
  const [tab, setTab] = useState("overview");
  const [items, setItems] = useState([]);
  const [nextCursor, setNextCursor] = useState(null);
  const [limits, setLimits] = useState(null);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busyId, setBusyId] = useState(null);

  const [uploadRow, setUploadRow] = useState(null);
  const [historyId, setHistoryId] = useState(null);
  const [templateRow, setTemplateRow] = useState(null);
  const [templateNumber, setTemplateNumber] = useState("");
  const [templateError, setTemplateError] = useState("");
  const [preview, setPreview] = useState(null);

  const seq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (cursor = null) => {
    const meins = ++seq.current;
    if (cursor) setLoadingMore(true); else { setLoading(true); setError(""); }
    try {
      const res = await getDeliveryNotes({ limit: PAGE_LIMIT, cursor: cursor || undefined, q: debouncedQ || undefined, source: source || undefined });
      if (seq.current !== meins) return;
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(deliveryNoteErrorText(body, DELIVERY_NOTE_TEXT.loadError)); return; }
      setItems((cur) => (cursor ? [...cur, ...((body && body.items) || [])] : ((body && body.items) || [])));
      setNextCursor((body && body.nextCursor) || null);
      setLimits((body && body.limits) || null);
    } catch {
      if (seq.current === meins) setError(DELIVERY_NOTE_TEXT.loadError);
    } finally {
      if (seq.current === meins) { setLoading(false); setLoadingMore(false); }
    }
  }, [debouncedQ, source]);

  useEffect(() => { if (tab === "overview") load(null); }, [load, tab]);

  const zeigeErfolg = (text) => {
    setSuccess(text); setError("");
    setTimeout(() => setSuccess((cur) => (cur === text ? "" : cur)), 6000);
  };

  const herunterladen = async (pfad) => {
    setError("");
    try {
      await downloadDocument(pfad, { fallbackFilename: "lieferschein.pdf" });
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setError(e.message);
    }
  };

  // Die PDF-Ansicht lädt über denselben authentifizierten Weg wie der Download.
  const pdfLaden = useCallback(async (pfad) => {
    const res = await fetchDeliveryNotePdf(pfad);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(deliveryNoteErrorText(body, "Der Lieferschein konnte nicht geladen werden."));
    }
    const typ = String(res.headers.get("content-type") || "").toLowerCase();
    if (!typ.startsWith("application/pdf")) throw new Error("Der Lieferschein konnte nicht geladen werden.");
    const blob = await res.blob();
    return { blob, filename: filenameFromContentDisposition(res.headers.get("content-disposition"), "lieferschein.pdf") };
  }, []);

  const zeigeVorschau = (pfad, titel) => setPreview({ pfad, titel, fetchPdf: () => pdfLaden(pfad) });

  const confidaraErstellen = async (row) => {
    setBusyId(row.shipmentId); setError("");
    try {
      const res = await createConfidaraDeliveryNote(row.shipmentId);
      const body = await res.json().catch(() => null);
      if (!res.ok) { setError(deliveryNoteErrorText(body, "Der Lieferschein konnte nicht erstellt werden.")); return; }
      zeigeErfolg(`ConfidaraExpress-Lieferschein ${body?.number || ""} für Sendung ${row.orderConfirmationNumber || ""} erstellt.`.replace(/\s+/g, " "));
      await load(null);
    } catch {
      setError("Der Lieferschein konnte nicht erstellt werden. Bitte prüfen Sie Ihre Verbindung.");
    } finally {
      setBusyId(null);
    }
  };

  const ausVorlageErstellen = async (e) => {
    e.preventDefault();
    const row = templateRow;
    if (!row) return;
    setBusyId(row.shipmentId); setTemplateError("");
    try {
      const res = await createDeliveryNoteFromTemplate(row.shipmentId, templateNumber.trim() === "" ? null : templateNumber.trim());
      const body = await res.json().catch(() => null);
      if (!res.ok) { setTemplateError(deliveryNoteErrorText(body, "Der Lieferschein konnte nicht erstellt werden.")); return; }
      setTemplateRow(null);
      zeigeErfolg(body && body.created === false
        ? "Dieser Lieferschein aus Ihrer Vorlage gilt bereits."
        : `Lieferschein aus Ihrer Vorlage für Sendung ${row.orderConfirmationNumber || ""} erstellt. Er gilt ab sofort.`);
      await load(null);
    } catch {
      setTemplateError("Der Lieferschein konnte nicht erstellt werden. Bitte prüfen Sie Ihre Verbindung.");
    } finally {
      setBusyId(null);
    }
  };

  const oeffneVorlageDialog = (row) => {
    // Vorschlag wie der Server: die CE-LS-Nummer der Sendung, sonst die eigene Nummer der Buchung.
    setTemplateNumber(row.confidaraNumber || row.externalDeliveryNoteNumber || "");
    setTemplateError("");
    setTemplateRow(row);
  };

  const aktion = (row, id) => {
    const titel = `Lieferschein zu Sendung ${row.orderConfirmationNumber || ""}`.trim();
    if (id === "download") return herunterladen(deliveryNotePaths.effective(row.shipmentId));
    if (id === "view") return zeigeVorschau(deliveryNotePaths.effective(row.shipmentId), titel);
    if (id === "upload") return setUploadRow(row);
    if (id === "fromTemplate") return oeffneVorlageDialog(row);
    if (id === "confidara") return confidaraErstellen(row);
    if (id === "history") return setHistoryId(row.shipmentId);
    return undefined;
  };

  const hatFilter = Boolean(debouncedQ || source);
  const leer = !loading && items.length === 0 && !hatFilter && !error;

  const zelleLieferschein = (row) => {
    const eff = effectiveView(row.effective);
    return (
      <div className="dn-zelle">
        <span className={`dn-art dn-art--${eff.kind}`}>{eff.label}</span>
        {eff.number && <span className="dn-nummer-wert"><Werte>{eff.number}</Werte></span>}
        {eff.origin && <span className="inv-cell-meta">{eff.origin}</span>}
      </div>
    );
  };

  const hauptaktion = (row, eff) => (eff.kind !== "none"
    ? <button type="button" className="btn btn-sm btn-outline" onClick={() => aktion(row, "download")}>Herunterladen</button>
    : row.actions && row.actions.canUpload
      ? <button type="button" className="btn btn-sm btn-outline" onClick={() => aktion(row, "upload")}>Hochladen</button>
      : null);

  const menue = (row) => rowActions(row)
    .filter((a) => a.id !== "download" && !(a.id === "upload" && effectiveView(row.effective).kind === "none"))
    .map((a) => ({ key: a.id, label: a.label, onClick: () => aktion(row, a.id), disabled: busyId === row.shipmentId }));

  return (
    <div className="page-body">
      <PageHeader title={DELIVERY_NOTE_TEXT.title} subtitle={DELIVERY_NOTE_TEXT.subtitle} utility={utility} />

      <div className="ce-tabs dn-tabs" role="tablist" aria-label="Bereich der Lieferscheine">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" id={`dn-tab-${t.id}`} aria-controls={`dn-panel-${t.id}`}
                  aria-selected={tab === t.id} className={`ce-tab dn-tab${tab === t.id ? " dn-tab--active" : ""}`}
                  onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "template" && (
        <div role="tabpanel" id="dn-panel-template" aria-labelledby="dn-tab-template">
          <DeliveryNoteTemplatePanel mode={deliveryNoteMode(user)} onNavigate={onNavigate} onPreview={zeigeVorschau} />
        </div>
      )}

      {tab === "overview" && (
        <div role="tabpanel" id="dn-panel-overview" aria-labelledby="dn-tab-overview">
          <InlineSuccess text={success} />
          <InlineError text={error} onRetry={() => load(null)} />

          <div className="ce-toolbar inv-toolbar">
            <div className="inv-toolbar-search">
              <label className="field-label" htmlFor="dn-q">{DELIVERY_NOTE_TEXT.searchLabel}</label>
              <input id="dn-q" className="field-input" type="search" placeholder={DELIVERY_NOTE_TEXT.searchPlaceholder}
                     value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="inv-toolbar-filter">
              <label className="field-label" htmlFor="dn-source">{DELIVERY_NOTE_TEXT.filterLabel}</label>
              <select id="dn-source" className="field-select" value={source} onChange={(e) => setSource(e.target.value)}>
                {SOURCE_FILTER_OPTIONS.map((o) => <option key={o.value || "alle"} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {loading && <ListSkeleton rows={5} label="Lieferscheine werden geladen" />}

          {leer && (
            <EmptyState
              title={DELIVERY_NOTE_TEXT.emptyTitle}
              text={DELIVERY_NOTE_TEXT.emptyText}
              action={onNavigate && <button type="button" className="btn btn-primary ce-aktion-neu" onClick={() => onNavigate("new")}>Neue Sendung</button>}
            />
          )}

          {!loading && items.length === 0 && hatFilter && (
            <NoResultsState
              title={DELIVERY_NOTE_TEXT.noResultsTitle}
              text={DELIVERY_NOTE_TEXT.noResultsText}
              action={<button type="button" className="btn btn-outline" onClick={() => { setQ(""); setSource(""); }}>Filter zurücksetzen</button>}
            />
          )}

          {!loading && items.length > 0 && (
            <>
              <div className="ce-table-container inv-list-table inv-list-table--lieferscheine">
                <table className="ce-list-table">
                  <caption className="sr-only">Lieferscheine je Sendung</caption>
                  <thead>
                    <tr>
                      <th scope="col">Sendung</th>
                      <th scope="col">Empfänger</th>
                      <th scope="col">Lieferschein</th>
                      <th scope="col">Gebucht</th>
                      <th scope="col" className="ce-col-actions">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((row) => {
                      const empf = recipientText(row.recipient);
                      const eff = effectiveView(row.effective);
                      return (
                        <tr key={row.shipmentId}>
                          <td>
                            {/* Vorgangs- und Auftragsnummer bleiben in der Tabelle ganz (wie in der Auftragsliste);
                                die Spaltenbreite folgt ihnen, die Schwelle zu den Einträgen ist danach gemessen. */}
                            <span className="dn-kennung">{row.orderConfirmationNumber || "Ohne Vorgangsnummer"}</span>
                            {row.orderNumber && <div className="inv-cell-meta">Auftrag <span className="dn-kennung">{row.orderNumber}</span></div>}
                          </td>
                          <td>
                            {empf.name}
                            {empf.place && <div className="inv-cell-meta">{empf.place}</div>}
                          </td>
                          <td>{zelleLieferschein(row)}</td>
                          <td className="inv-cell-meta">{dateDe(row.bookedAt)}</td>
                          <td className="ce-col-actions">
                            <div className="inv-row-actions inv-row-actions--tight">
                              {hauptaktion(row, eff)}
                              <RowActionsMenu items={menue(row)} disabled={busyId === row.shipmentId} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <ul className="ce-list-cards inv-list-cards inv-list-cards--lieferscheine">
                {items.map((row) => {
                  const empf = recipientText(row.recipient);
                  const eff = effectiveView(row.effective);
                  return (
                    <li key={row.shipmentId} className="ce-card inv-card">
                      <div className="inv-card-head">
                        <span className="inv-card-title"><Werte>{row.orderConfirmationNumber || "Ohne Vorgangsnummer"}</Werte></span>
                        <span className="inv-cell-meta">{dateDe(row.bookedAt)}</span>
                      </div>
                      <div className="inv-cell-meta">
                        {[empf.name, empf.place].filter(Boolean).join(", ")}
                        {row.orderNumber && <> · Auftrag <Werte>{row.orderNumber}</Werte></>}
                      </div>
                      {zelleLieferschein(row)}
                      <div className="inv-card-actions">
                        {hauptaktion(row, eff)}
                        <RowActionsMenu items={menue(row)} disabled={busyId === row.shipmentId} />
                      </div>
                    </li>
                  );
                })}
              </ul>

              {nextCursor && (
                <div className="inv-more">
                  <button type="button" className="btn btn-outline" onClick={() => load(nextCursor)} disabled={loadingMore}>
                    {loadingMore ? "Wird geladen …" : DELIVERY_NOTE_TEXT.loadMore}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <DeliveryNoteUploadDialog
        open={Boolean(uploadRow)}
        row={uploadRow}
        limits={limits}
        onClose={() => setUploadRow(null)}
        onUploaded={(r) => {
          const row = uploadRow;
          setUploadRow(null);
          zeigeErfolg(r && r.created === false
            ? "Diese Datei gilt bereits als Lieferschein der Sendung."
            : `Ihr Lieferschein gilt ab sofort für Sendung ${row?.orderConfirmationNumber || ""}. Der bisherige bleibt im Verlauf.`);
          load(null);
        }}
      />

      <DeliveryNoteHistoryDialog
        open={Boolean(historyId)}
        shipmentId={historyId}
        onClose={() => setHistoryId(null)}
        onChanged={() => load(null)}
        onPreview={(pfad, titel) => { setHistoryId(null); zeigeVorschau(pfad, titel); }}
        onDownload={(pfad) => herunterladen(pfad)}
      />

      <InventoryDialog
        open={Boolean(templateRow)}
        onClose={() => { if (!busyId) setTemplateRow(null); }}
        title="Lieferschein aus Vorlage erstellen"
        busy={Boolean(busyId)}
        footer={(
          <>
            <button type="button" className="btn btn-outline" onClick={() => setTemplateRow(null)} disabled={Boolean(busyId)}>Abbrechen</button>
            <button type="submit" form="dn-vorlage-form" className="btn btn-primary" disabled={Boolean(busyId)}>
              {busyId ? "Wird erstellt …" : "Erstellen und verwenden"}
            </button>
          </>
        )}
      >
        {templateRow && (
          <form id="dn-vorlage-form" className="dn-upload" onSubmit={ausVorlageErstellen} noValidate>
            <p>
              Für Sendung <Werte>{templateRow.orderConfirmationNumber || "—"}</Werte> entsteht ein Lieferschein auf Ihrem Briefpapier —
              mit den Positionen dieser Sendung und dem heutigen Datum.
            </p>
            <div className="dn-feld">
              <label className="field-label" htmlFor="dn-vorlage-nummer">Lieferscheinnummer (optional)</label>
              <input id="dn-vorlage-nummer" className="field-input dn-nummer" type="text" maxLength={64} value={templateNumber}
                     onChange={(e) => setTemplateNumber(e.target.value)} autoComplete="off" />
            </div>
            <p className="dn-hinweis">{DELIVERY_NOTE_TEXT.uploadHint}</p>
            {templateError && <div className="alert alert-error" role="alert">{templateError}</div>}
          </form>
        )}
      </InventoryDialog>

      {preview && (
        <InvoicePdfPreviewModal
          title={preview.titel}
          fetchPdf={preview.fetchPdf}
          onDownload={() => herunterladen(preview.pfad)}
          onClose={() => setPreview(null)}
          printable
        />
      )}
    </div>
  );
}
