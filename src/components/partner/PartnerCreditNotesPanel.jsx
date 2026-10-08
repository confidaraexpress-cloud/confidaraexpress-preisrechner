import React, { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState, ErrorState, ListSkeleton } from "../ui/StateView";
import { getPartnerCreditNotes, partnerCreditNotePdfPath } from "../../api/partnerApi";
import { usePartnerData } from "../../hooks/usePartnerData";
import { downloadDocument } from "../../utils/downloadDocument";
import { formatCents, partnerTabPath } from "../../utils/salesPartnerView.mjs";
import {
  CREDIT_NOTE_DOWNLOAD_TEXT,
  CREDIT_NOTE_TEXTS,
  correctionHints,
  creditNoteDownloadMessage,
  creditNoteFallbackFilename,
  creditNoteIssuedOn,
  creditNotePeriod,
  creditNoteStatusMeta,
  creditNoteTaxRate,
  creditNoteTitle,
  normalizeCreditNotes,
  openSettlementHint,
  payoutText,
} from "../../utils/salesPartnerCreditNotes.mjs";

const normalisieren = (d) => normalizeCreditNotes(d);

// Nummer, Titel und Ausstellungstag einer Gutschrift; eine Testgutschrift trägt
// ihre Kennzeichnung direkt an der Nummer.
function NumberCell({ cn }) {
  return (
    <div className="spp-cell-main">
      <span className="spp-cn-number">{cn.number || "—"}</span>
      <span className="spp-cell-sub">{creditNoteTitle(cn)} · ausgestellt am {creditNoteIssuedOn(cn)}</span>
      {cn.isTest && <span className="badge badge--warning">{CREDIT_NOTE_TEXTS.testDocument}</span>}
    </div>
  );
}

// Betrag: Gesamt vorn, darunter Netto und Steuer samt Satz — alle steuerlichen
// Angaben bleiben sichtbar, nur gebündelt.
function AmountCell({ cn }) {
  const satz = creditNoteTaxRate(cn);
  return (
    <div className="spp-cell-main spp-cell-main--num">
      <span className="spp-cn-amount">{formatCents(cn.grossCents)}</span>
      <span className="spp-cell-sub">Netto {formatCents(cn.netCents)}</span>
      <span className="spp-cell-sub">Steuer {formatCents(cn.taxCents)}{satz ? ` (${satz})` : ""}</span>
    </div>
  );
}

// Status (Ausgestellt · Storniert · Storno) mit den Korrekturhinweisen des Servers.
function StatusCell({ cn }) {
  const [cls, label] = creditNoteStatusMeta(cn);
  return (
    <div className="spp-cell-main">
      <span className={`badge ${cls}`}>{label}</span>
      {correctionHints(cn).map((h) => <span key={h} className="spp-cell-sub spp-cn-hint">{h}</span>)}
    </div>
  );
}

/* ── Partnerportal · Gutschriften ────────────────────────────────────────────
   Die Gutschriften des Partners (Selbstabrechnung). UX-Paket 6: je Beleg
   Monat, Gutschrift (Nummer, Ausstellungstag), Betrag (Gesamt, darunter Netto
   und Steuer mit Satz), Status samt Korrekturen eines Stornos, Auszahlung und
   PDF — keine steuerliche Angabe entfällt, sie stehen nur gebündelt. Das PDF
   lädt ein authentifizierter Blob-Abruf (kein Token in einer Adresse);
   solange das Dokument entsteht, steht „Wird erstellt". Über der Liste der
   Hinweis zum offenen Saldo des Servers, darunter der Weg zu den
   Abrechnungsdaten im Konto. Alle Werte kommen aus der Antwort; die Oberfläche
   rechnet nichts und sieht nur die eigenen Gutschriften (der Server bindet die
   Abfrage an das Konto). Testgutschriften (Pre-Live-Testkonto, `isTest`) tragen
   „TESTDOKUMENT – nicht steuerlich gültig“ und „Test – ausgezahlt“/„Test –
   nicht ausgezahlt“. */
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
              Gutschriften. Spalten: Monat, Gutschrift mit Ausstellungstag, Betrag mit Netto und Steuer, Status, Auszahlung, PDF.
            </caption>
            <thead>
              <tr>
                <th scope="col">Monat</th>
                <th scope="col">Gutschrift</th>
                <th scope="col" className="ce-num">Betrag</th>
                <th scope="col">Status</th>
                <th scope="col">Auszahlung</th>
                <th scope="col">PDF</th>
              </tr>
            </thead>
            <tbody>
              {liste.map((cn, i) => (
                <tr key={cn.id ?? `g-${i}`} data-credit-note={cn.id ?? undefined}
                  className={cn.kind === "cancellation" || cn.cancelled ? "spp-row-correction" : undefined}>
                  <td>{creditNotePeriod(cn)}</td>
                  <td><NumberCell cn={cn} /></td>
                  <td className="ce-num"><AmountCell cn={cn} /></td>
                  <td><StatusCell cn={cn} /></td>
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
                <span className="ce-list-card-key">Monat</span>
                <span className="ce-list-card-val">{creditNotePeriod(cn)}</span>
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
                <span className="ce-list-card-key">Status</span>
                <span className="ce-list-card-val"><StatusCell cn={cn} /></span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">Auszahlung</span>
                <span className="ce-list-card-val">{payoutText(cn)}</span>
              </div>
              <div className="ce-list-card-row">
                <span className="ce-list-card-key">PDF</span>
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
      <div className="spp-hint-block">
        <p className="spp-hint" id="spp-cn-note">{CREDIT_NOTE_TEXTS.settlementNote}</p>
        {/* Abrechnungsdaten liegen im Konto — ein Weg dorthin statt eines Verweises im Text. */}
        <Link className="btn btn-ghost btn-sm spp-hint-link" id="spp-cn-billing-link" to={partnerTabPath("account")}>
          {CREDIT_NOTE_TEXTS.billingLink}
        </Link>
      </div>
    </div>
  );
}

export default PartnerCreditNotesPanel;
