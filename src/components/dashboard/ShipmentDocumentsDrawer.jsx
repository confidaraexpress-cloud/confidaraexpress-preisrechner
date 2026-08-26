import React from "react";
import { Icon } from "../ui/Icon";
import { useDialog } from "../../hooks/useDialog";
import { getShipmentDocuments } from "../../api/client";
import { downloadDocument } from "../../utils/downloadDocument";
import {
  DOC_STATUS, DOCUMENTS_TEXT, groupShipmentDocuments, documentViewState, documentDownloadPath,
  documentLabel, documentNumber, documentIcon, documentFallbackFilename,
  hasProcessingDocument, nextDocumentPollDelay,
} from "../../utils/shipmentDocumentsView.mjs";

/* ─────────────────────────────────────────────────────────────────────────────
   Dokumente-Drawer EINER Sendung.

   Die zentrale, leichte Dokumentansicht der Sendungsliste — bewusst KEINE
   Sendungsdetailseite: es gibt keine Route, keinen Deep-Link und keinen zweiten
   Ort, an dem Sendungsdaten dargestellt werden.

   ── Der Server ist die Wahrheit ────────────────────────────────────────────
   Welche Dokumente es gibt, sagt allein GET /api/shipments/:id/documents. Aus
   der Sendungszeile wird NICHTS abgeleitet — weder ob ein Label existiert noch
   ob es eine Proforma, einen Lieferschein oder eine Auftragsbestätigung gibt.

   ── Kein N+1 ───────────────────────────────────────────────────────────────
   Geladen wird ausschließlich beim Öffnen und ausschließlich für DIESE Sendung.
   Die Sendungsliste fragt beim Rendern keine Dokumente ab; der Drawer wird gar
   nicht erst gemountet, solange er zu ist (die Liste rendert ihn bedingt).

   ── Aufbau ─────────────────────────────────────────────────────────────────
   Kopf (Titel + Kontextnummer aus bereits vorhandenen Zeilendaten, ohne
   zusätzlichen Request) · Gruppen aus der servergelieferten `category` ·
   je Dokument eine Zeile mit Icon, Name, optionaler Belegnummer und genau
   einer Aktion beziehungsweise einem ruhigen Zustandstext.
   ───────────────────────────────────────────────────────────────────────── */

function DocumentRow({ doc, onDownload, busy }) {
  const zustand = documentViewState(doc);
  const nummer = documentNumber(doc);
  const name = documentLabel(doc);
  return (
    <li className="sdoc-row">
      <span className="sdoc-row-icon" aria-hidden="true">
        <Icon n={documentIcon(doc.type)} s={18} />
      </span>
      <span className="sdoc-row-text">
        <span className="sdoc-row-name">{name}</span>
        {/* Fehlt die Nummer, bleibt hier KEIN leerer Platzhalter stehen. */}
        {nummer && <span className="sdoc-row-number mono">{nummer}</span>}
      </span>
      <span className="sdoc-row-action">
        {zustand === DOC_STATUS.READY && (
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => onDownload(doc)}
            disabled={busy}
          >
            {busy
              ? <><span className="spinner spinner-dark" /> {DOCUMENTS_TEXT.downloading}</>
              : <><Icon n="download" s={15} /> {DOCUMENTS_TEXT.download}</>}
          </button>
        )}
        {/* Zustände tragen TEXT, nicht nur Farbe — und der Fehlerfall ist ruhig:
            ein roter Alarm neben einer erfolgreich gebuchten Sendung läse sich
            wie ein Problem mit der Sendung selbst. Ein Wiederholen gibt es
            bewusst nicht: der Kunde kann am Zustand des Belegs nichts ändern. */}
        {zustand === DOC_STATUS.PROCESSING && (
          <span className="sdoc-row-state" role="status">
            <span className="spinner spinner-dark" aria-hidden="true" /> {DOCUMENTS_TEXT.processing}
          </span>
        )}
        {zustand === DOC_STATUS.FAILED && (
          <span className="sdoc-row-state sdoc-row-state--muted">{DOCUMENTS_TEXT.failed}</span>
        )}
      </span>
    </li>
  );
}

export function ShipmentDocumentsDrawer({ shipmentId, contextNumber, onClose }) {
  const [groups, setGroups] = React.useState(null);   // null = noch nichts geladen
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState("");
  const [busyPath, setBusyPath] = React.useState("");
  const [versuch, setVersuch] = React.useState(0);    // erzwingt einen neuen Ladelauf
  const timerRef = React.useRef(null);

  const drawerRef = useDialog({ open: true, onClose });

  // ── Laden und gedeckeltes Nachladen ───────────────────────────────────────
  // Erster Abruf sofort beim Öffnen, danach nur solange mindestens ein Dokument
  // noch entsteht — kurzer fester Takt, hartes Zeitbudget. Kein Intervall, kein
  // globales Polling, keine Zustandsänderung nach dem Schließen: der Effekt
  // hängt am gemounteten Drawer, und `abgebrochen` schneidet jede noch laufende
  // Antwort ab.
  React.useEffect(() => {
    if (!shipmentId) return undefined;
    let abgebrochen = false;
    let attempt = 0;
    let gezeigt = false; // steht bereits eine Liste im Drawer?

    const lauf = async () => {
      let antwort = null; // null = Abruf nicht auswertbar (Netz, Status, kaputter Body)
      try {
        const r = await getShipmentDocuments(shipmentId);
        if (r.ok) {
          const d = await r.json().catch(() => null);
          antwort = { gruppen: groupShipmentDocuments(d) };
        }
      } catch { /* still bleiben — der Fehlerzustand entsteht unten, genau einmal */ }
      if (abgebrochen) return;

      if (antwort) {
        gezeigt = true;
        setGroups(antwort.gruppen);
        setLoadError(false);
        setLoading(false);
        // Nachgeladen wird NUR, solange tatsächlich noch ein Beleg entsteht.
        if (!hasProcessingDocument(antwort.gruppen)) return;
      } else if (!gezeigt) {
        // Nichts zu zeigen: ruhige Fehlerfläche mit „Erneut versuchen". Hier wird
        // NICHT still weitergefragt — sonst liefe im Hintergrund ein Takt, während
        // der Kunde vor einem Knopf sitzt, der dasselbe tut.
        setLoading(false);
        setLoadError(true);
        return;
      }
      // Sonst: die Liste steht bereits — ein einzelner misslungener Abruf nimmt sie
      // nicht weg, der nächste Takt versucht es im Budget erneut.

      const delay = nextDocumentPollDelay(attempt);
      if (delay == null) return; // Budget erschöpft — der ruhige Hinweis bleibt stehen
      attempt += 1;
      timerRef.current = setTimeout(lauf, delay);
    };

    setLoading(true);
    setLoadError(false);
    lauf();
    return () => {
      abgebrochen = true;
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [shipmentId, versuch]);

  const handleDownload = async (doc) => {
    // AUSSCHLIESSLICH der servergelieferte Pfad — er wird hier nicht gebaut und
    // nicht aus Typ/Nummer/Sendungs-ID rekonstruiert. `documentDownloadPath`
    // gibt ihn nur bei `ready` und nur nach dem Sicherheits-Guard heraus.
    const pfad = documentDownloadPath(doc);
    if (!pfad || busyPath) return;
    setBusyPath(pfad);
    setDownloadError("");
    try {
      await downloadDocument(pfad, { fallbackFilename: documentFallbackFilename(doc.type) });
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setDownloadError(e.message); // globaler Auth-Redirect übernimmt sonst
    }
    setBusyPath("");
  };

  const leer = Array.isArray(groups) && groups.length === 0;

  return (
    <div
      className="ce-drawer-overlay"
      role="presentation"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={drawerRef}
        className="ce-drawer sdoc-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sdoc-drawer-title"
      >
        <div className="ce-drawer-head">
          <div className="sdoc-head-text">
            <h2 id="sdoc-drawer-title" className="sdoc-title">{DOCUMENTS_TEXT.title}</h2>
            {/* Kontext aus bereits vorhandenen Zeilendaten — kein zusätzlicher Request. */}
            {contextNumber && <p className="sdoc-subtitle mono">{contextNumber}</p>}
          </div>
          <button type="button" className="btn btn-icon btn-ghost" aria-label={DOCUMENTS_TEXT.close} onClick={onClose}>
            <Icon n="x" s={16} />
          </button>
        </div>

        <div className="ce-drawer-body sdoc-body">
          {downloadError && (
            <div className="alert alert-error mb-16" role="alert"><Icon n="x" s={15} />{downloadError}</div>
          )}

          {loading && groups === null ? (
            // Ruhiges Skeleton im Drawer — die Sendungsliste dahinter bleibt bedienbar.
            <ul className="sdoc-skeleton" aria-label={DOCUMENTS_TEXT.loading}>
              {[0, 1, 2].map((i) => <li key={i} className="sdoc-skeleton-row ce-skeleton" />)}
            </ul>
          ) : loadError && groups === null ? (
            <div className="sdoc-state" role="status">
              <Icon n="info" s={24} />
              <p className="sdoc-state-text">{DOCUMENTS_TEXT.loadError}</p>
              {/* „Erneut versuchen" ist hier zulässig: es ist ein reiner GET, er
                  ändert nichts und die Sendungsdaten bleiben erhalten. */}
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setVersuch((n) => n + 1)}>
                {DOCUMENTS_TEXT.retry}
              </button>
            </div>
          ) : leer ? (
            <div className="sdoc-state" role="status">
              <Icon n="form" s={24} />
              <p className="sdoc-state-text">{DOCUMENTS_TEXT.empty}</p>
            </div>
          ) : (
            (groups || []).map((gruppe) => (
              <section className="sdoc-group" key={gruppe.key}>
                <h3 className="sdoc-group-title">{gruppe.label}</h3>
                <ul className="sdoc-list">
                  {gruppe.documents.map((doc, i) => (
                    <DocumentRow
                      key={`${doc.type}-${i}`}
                      doc={doc}
                      onDownload={handleDownload}
                      busy={busyPath !== "" && busyPath === documentDownloadPath(doc)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
