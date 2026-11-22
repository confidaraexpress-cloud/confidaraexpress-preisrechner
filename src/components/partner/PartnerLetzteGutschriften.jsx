import React from "react";
import { Link } from "react-router-dom";
import { getPartnerCreditNotes } from "../../api/partnerApi";
import { usePartnerData } from "../../hooks/usePartnerData";
import { useGutschriftDownload } from "../../hooks/useGutschriftDownload";
import { partnerTabSearch } from "../../utils/salesPartnerView.mjs";
import {
  CREDIT_NOTE_TEXTS,
  creditNotePeriod,
  creditNoteStatusMeta,
  normalizeCreditNotes,
  payoutText,
} from "../../utils/salesPartnerCreditNotes.mjs";

const ANZAHL = 2;

/* Zweite Zeile: Monat und Auszahlung. Sagt die Auszahlung nichts („—“: Storno, stornierte Gutschrift, kein Stand),
   steht dort der Status des Belegs („Storno“, „Storniert“) oder nur der Monat — nie ein hängender Strich. */
function unterzeile(cn) {
  const auszahlung = payoutText(cn);
  const status = creditNoteStatusMeta(cn)[1];
  const zusatz = auszahlung !== "—" ? auszahlung : status !== "Ausgestellt" ? status : null;
  return [creditNotePeriod(cn), zusatz].filter((t) => t && t !== "—").join(", ");
}

/* ── Übersicht · letzte Gutschriften (Betreiberauftrag 2026-11-22, BERICHT D.3: „Download direkt auf der Startseite“) ─
   Die zwei neuesten Gutschriften aus GET /api/sales-partner/me/credit-notes (der Server sortiert nach Ausstellung,
   neueste zuerst, und bindet die Abfrage an das Konto) mit Nummer, Monat, Auszahlung und PDF. Alles Weitere — Beträge,
   Steuer, Korrekturen — steht im Bereich „Verdienst › Gutschriften“; dorthin führt der Verweis. */
export function PartnerLetzteGutschriften() {
  const { loading, error, data, reload } = usePartnerData(
    (opts) => getPartnerCreditNotes(opts), normalizeCreditNotes, [], CREDIT_NOTE_TEXTS.loadError,
  );
  const { laedt, fehler, herunterladen } = useGutschriftDownload();
  const letzte = data ? data.creditNotes.slice(0, ANZAHL) : [];

  let inhalt;
  if (loading && !data) {
    inhalt = <p className="spp-hint" role="status">Gutschriften werden geladen …</p>;
  } else if (error || !data) {
    inhalt = (
      <div className="spp-hint-block">
        <p className="spp-hint" role="alert">{error || CREDIT_NOTE_TEXTS.loadError}</p>
        <button type="button" className="btn btn-outline btn-sm" onClick={reload}>Erneut versuchen</button>
      </div>
    );
  } else if (letzte.length === 0) {
    inhalt = <p className="spp-hint">{CREDIT_NOTE_TEXTS.empty}</p>;
  } else {
    inhalt = (
      <ul className="spp-letzte-liste">
        {letzte.map((cn, i) => { const unter = unterzeile(cn); return (
          <li className="spp-letzte-zeile" key={cn.id ?? `l-${i}`} data-credit-note={cn.id ?? undefined}>
            <span className="spp-letzte-text">
              <span className="spp-cn-number">{cn.number || "Gutschrift"}</span>
              {unter && <span className="spp-cell-sub">{unter}</span>}
            </span>
            {cn.documentReady && cn.id !== null ? (
              <button type="button" className="btn btn-outline btn-sm spp-letzte-pdf" onClick={() => herunterladen(cn)}
                disabled={laedt !== null} aria-busy={laedt === cn.id ? "true" : undefined}
                aria-label={`${CREDIT_NOTE_TEXTS.download}: ${cn.number || "Gutschrift"}`}>
                {laedt === cn.id ? CREDIT_NOTE_TEXTS.downloading : "PDF"}
              </button>
            ) : (
              <span className="spp-cell-sub spp-cn-pending">{CREDIT_NOTE_TEXTS.documentPending}</span>
            )}
          </li>
        ); })}
      </ul>
    );
  }

  return (
    <section className="ce-card spp-card spp-letzte" aria-labelledby="spp-letzte-titel" id="spp-letzte-gutschriften">
      <h2 className="spp-card-title" id="spp-letzte-titel">Letzte Gutschriften</h2>
      {inhalt}
      {fehler && <p className="field-error" role="alert">{fehler}</p>}
      <Link className="btn btn-link spp-letzte-alle" to={{ pathname: "/partner", search: partnerTabSearch("credit-notes") }} replace>
        Alle Gutschriften
      </Link>
    </section>
  );
}

export default PartnerLetzteGutschriften;
