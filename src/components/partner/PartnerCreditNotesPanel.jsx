import React, { useRef, useState } from "react";
import { EmptyState, ErrorState, ListSkeleton } from "../ui/StateView";
import { getPartnerCreditNotes, partnerCreditNotePdfPath } from "../../api/partnerApi";
import { usePartnerData } from "../../hooks/usePartnerData";
import { downloadDocument } from "../../utils/downloadDocument";
import { formatCents } from "../../utils/salesPartnerView.mjs";
import {
  CREDIT_NOTE_DOWNLOAD_TEXT,
  CREDIT_NOTE_TEXTS,
  correctionHints,
  creditNoteDownloadMessage,
  creditNoteFallbackFilename,
  creditNoteIssuedOn,
  creditNoteKindMeta,
  creditNotePeriod,
  creditNoteTaxRate,
  creditNoteTitle,
  normalizeCreditNotes,
  openSettlementHint,
  payoutText,
} from "../../utils/salesPartnerCreditNotes.mjs";

const normalisieren = (d) => normalizeCreditNotes(d);

// Nummer, Titel bzw. Art und die Korrekturhinweise einer Gutschrift.
function NumberCell({ cn }) {
  const [cls, art] = creditNoteKindMeta(cn.kind);
  return (
    <div className="spp-cell-main">
      <span className="spp-cn-number">{cn.number || "—"}</span>
      <span className="spp-cell-sub">{creditNoteTitle(cn)}</span>
      {cn.isTest && <span className="badge badge--warning">{CREDIT_NOTE_TEXTS.testDocument}</span>}
      {cn.kind === "cancellation" && <span className={`badge ${cls}`}>{art}</span>}
      {correctionHints(cn).map((h) => <span key={h} className="spp-cell-sub spp-cn-hint">{h}</span>)}
    </div>
  );
}

function TaxCell({ cn }) {
  const satz = creditNoteTaxRate(cn);
  return (
    <>
      {formatCents(cn.taxCents)}
      {satz && <span className="spp-cell-sub spp-cell-sub--num">{satz}</span>}
    </>
  );
}

/* ── Partnerportal · Abrechnungen ────────────────────────────────────────────
   Die Gutschriften des Partners (Selbstabrechnung): Zeitraum, Nummer,
   Ausstellung, Netto, Steuer, Gesamt, Auszahlung und die Korrekturen eines
   Stornos. Das PDF lädt ein authentifizierter Blob-Abruf (kein Token in einer
   Adresse); solange das Dokument entsteht, steht „Wird erstellt". Über der
   Liste der Hinweis zum offenen, abrechnungsreifen Saldo des Servers. Alle
   Werte kommen aus der Antwort; die Oberfläche rechnet nichts und sieht nur
   die eigenen Gutschriften (der Server bindet die Abfrage an das Konto).
   Testgutschriften (Pre-Live-Testkonto, `isTest`) tragen „TESTDOKUMENT –
   nicht steuerlich gültig“ und „Test – ausgezahlt“/„Test – nicht ausgezahlt“. */
export function PartnerCreditNotesPanel() {
  const { loading, error, data, reload } = usePartnerData(
    (opts) => getPartnerCreditNotes(opts), normalisieren, [], CREDIT_NOTE_TEXTS.loadError,
  );
  const [laedt, setLaedt] = useState(null);
  const [downloadFehler, setDownloadFehler] = useState("");
  const inFlight = useRef(false);

  const herunterladen = async (cn) => {
    if (inFlight.current || cn.id === null) return;
    inFlight.current = true;
    setLaedt(cn.id);
    setDownloadFehler("");
    try {
      await downloadDocument(partnerCreditNotePdfPath(cn.id), {
        fallbackFilename: creditNoteFallbackFilename(cn.number),
        message: creditNoteDownloadMessage,
        errorText: CREDIT_NOTE_DOWNLOAD_TEXT,
      });
    } catch (e) {
      setDownloadFehler(e && typeof e.message === "string" && e.message ? e.message : CREDIT_NOTE_DOWNLOAD_TEXT.allgemein);
    } finally {
      inFlight.current = false;
      setLaedt(null);
    }
  };

  // Tabelle und Karten stehen beide im DOM (die Breite schaltet um) — die
  // stabile Kennung trägt deshalb nur der Knopf der Tabelle.
  const dokument = (cn, { mitId = false } = {}) => {
    if (!cn.documentReady || cn.id === null) {
      return <span className="spp-cell-sub spp-cn-pending">{CREDIT_NOTE_TEXTS.documentPending}</span>;
    }
    const aktiv = laedt === cn.id;
    return (
      <button type="button" className="btn btn-outline btn-sm" id={mitId ? `spp-cn-pdf-${cn.id}` : undefined}
        onClick={() => herunterladen(cn)} disabled={laedt !== null} aria-busy={aktiv ? "true" : undefined}
        aria-label={`${CREDIT_NOTE_TEXTS.download}: ${cn.number || "Gutschrift"}`}>
        {aktiv ? CREDIT_NOTE_TEXTS.downloading : CREDIT_NOTE_TEXTS.download}
      </button>
    );
  };

  const hinweis = data ? openSettlementHint(data.openSettlement) : null;

  let inhalt;
  if (loading && !data) {
    inhalt = <div className="table-card"><ListSkeleton rows={4} label="Gutschriften werden geladen …" /></div>;
  } else if (error || !data) {
    inhalt = (
      <div className="ce-card">
        <ErrorState
          title={error || CREDIT_NOTE_TEXTS.loadError}
          action={<button type="button" className="btn btn-primary btn-sm" onClick={reload}>Erneut versuchen</button>}
        />
      </div>
    );
  } else if (data.creditNotes.length === 0) {
    inhalt = (
      <div className="ce-card" id="spp-cn-empty">
        <EmptyState title={CREDIT_NOTE_TEXTS.empty} />
      </div>
    );
  } else {
    const liste = data.creditNotes;
    inhalt = (
      <>
        <div className="table-card ce-list-table spp-table" id="spp-cn-table">
          <table>
            <caption className="sr-only">
              Gutschriften. Spalten: Zeitraum, Gutschrift, ausgestellt am, Netto, Steuer, Gesamt, Auszahlung, Dokument.
            </caption>
            <thead>
              <tr>
                <th scope="col">Zeitraum</th>
                <th scope="col">Gutschrift</th>
                <th scope="col">Ausgestellt am</th>
                <th scope="col" className="ce-num">Netto</th>
                <th scope="col" className="ce-num">Steuer</th>
                <th scope="col" className="ce-num">Gesamt</th>
                <th scope="col">Auszahlung</th>
                <th scope="col">Dokument</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((cn, i) => (
                <tr key={cn.id ?? `g-${i}`} data-credit-note={cn.id ?? undefined}
                  className={cn.kind === "cancellation" || cn.cancelled ? "spp-row-correction" : undefined}>
                  <td>{creditNotePeriod(cn)}</td>
                  <td><NumberCell cn={cn} /></td>
                  <td>{creditNoteIssuedOn(cn)}</td>
                  <td className="ce-num">{formatCents(cn.netCents)}</td>
                  <td className="ce-num"><TaxCell cn={cn} /></td>
                  <td className="ce-num">{formatCents(cn.grossCents)}</td>
                  <td>{payoutText(cn)}</td>
                  <td>{dokument(cn, { mitId: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="ce-list-cards" aria-label="Gutschriften">
          {liste.map((cn, i) => (
            <li className="ce-list-card" key={`c-${cn.id ?? i}`}>
              <div className="ce-list-card-head">
                <NumberCell cn={cn} />
                <strong>{formatCents(cn.grossCents)}</strong>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Zeitraum</span>
                <span className="ce-list-card-val">{creditNotePeriod(cn)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Ausgestellt am</span>
                <span className="ce-list-card-val">{creditNoteIssuedOn(cn)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Netto</span>
                <span className="ce-list-card-val">{formatCents(cn.netCents)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Steuer</span>
                <span className="ce-list-card-val">
                  {formatCents(cn.taxCents)}{creditNoteTaxRate(cn) ? ` (${creditNoteTaxRate(cn)})` : ""}
                </span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Auszahlung</span>
                <span className="ce-list-card-val">{payoutText(cn)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Dokument</span>
                <span className="ce-list-card-val">{dokument(cn)}</span>
              </div>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <div className="spp-panel" id="spp-credit-notes">
      {hinweis && <div className="alert alert-info" role="status" id="spp-cn-settlement">{hinweis}</div>}
      {downloadFehler && <div className="alert alert-error" role="alert" id="spp-cn-download-error">{downloadFehler}</div>}
      {inhalt}
      <p className="spp-hint" id="spp-cn-note">{CREDIT_NOTE_TEXTS.settlementNote}</p>
    </div>
  );
}

export default PartnerCreditNotesPanel;
