import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InlineError, InventoryDialog } from "./InventoryShared";
import { Werte } from "../ui/Werte";
import { deleteProduct, getProductDeletionCheck } from "../../api/inventoryApi";
import { inventoryErrorText } from "../../utils/inventoryErrors.mjs";
import {
  LOESCH_TEXT, einheiten, loeschAnsicht, loeschBestaetigung, loeschErfolgText, loeschFehler,
} from "../../utils/productDeleteView.mjs";

/* Löschdialog eines Artikels (Betreiberentscheidungen 2026-10-30, Canonical v2.91 G1/G2).

   Beim Öffnen fragt der Dialog den Server, was eine Löschung jetzt bedeuten würde (dieselbe Regel wie DELETE):
   • ohne Bestand: eine Bestätigung;
   • mit Bestand (G1): die Mengen je Lager und eine ausdrückliche Bestätigung der Ausbuchung — erst dann ist „Ausbuchen
     und löschen“ möglich; der Server bucht genau die angezeigten Mengen über die Korrekturlogik aus oder lehnt ab, wenn
     sich etwas geändert hat (dann prüft der Dialog neu);
   • reserviert oder gesperrt (G2): keine Löschaktion, sondern die Erklärung und der Weg (Auftrag bzw. Artikelseite).
   Den Fokus setzt die Dialoghülle (useDialog) auf das erste Bedienelement, „Schließen“ — nie auf die Löschaktion.
   Während des Löschens ist alles gesperrt (kein Doppelklick, kein Escape). Ein Fehler wird nie als Erfolg gezeigt. */
export function ProductDeleteDialog({ product, onClose, onDeleted }) {
  const navigate = useNavigate();
  const [pruefung, setPruefung] = useState({ status: "laden", ansicht: null, hinweis: "" });
  const [ausbuchen, setAusbuchen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState("");

  const pruefen = async (hinweis = "") => {
    setPruefung({ status: "laden", ansicht: null, hinweis: "" });
    setAusbuchen(false);
    setFehler("");
    try {
      const res = await getProductDeletionCheck(product.id);
      const body = await res.json().catch(() => null);
      if (res.status === 404 && body && body.code === "PRODUCT_NOT_FOUND") {
        onDeleted({ text: LOESCH_TEXT.bereitsGeloescht });
        return;
      }
      const ansicht = res.ok ? loeschAnsicht(body && body.deletion) : null;
      if (!ansicht || ansicht.art === "fehler") {
        setPruefung({ status: "fehler", ansicht: null, hinweis: inventoryErrorText(body, LOESCH_TEXT.pruefungFehlgeschlagen) });
        return;
      }
      setPruefung({ status: "bereit", ansicht, hinweis });
    } catch {
      setPruefung({ status: "fehler", ansicht: null, hinweis: LOESCH_TEXT.keineVerbindung });
    }
  };

  // Einmal beim Öffnen; der Aufrufer bindet den Dialog mit key an den Artikel.
  useEffect(() => { pruefen(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const a = pruefung.ansicht;
  const mitBestand = Boolean(a && a.art === "bestand");
  const kannLoeschen = Boolean(a && a.loeschbar) && (!mitBestand || ausbuchen) && !busy;

  const loeschen = async () => {
    if (!kannLoeschen) return;
    setBusy(true);
    setFehler("");
    try {
      const res = await deleteProduct(product.id, loeschBestaetigung(a));
      const body = await res.json().catch(() => null);
      if (res.ok) { onDeleted({ text: loeschErfolgText(body) }); return; }
      const f = loeschFehler(res.status, body);
      if (f.art === "geloescht") { onDeleted({ text: f.text }); return; }
      setBusy(false);
      if (f.art === "neu_pruefen") { await pruefen(f.text); return; }
      setFehler(f.text);
    } catch {
      setBusy(false);
      setFehler(LOESCH_TEXT.keineVerbindung);
    }
  };

  const gehe = (ziel) => { onClose(); navigate(ziel); };

  let footer = <button type="button" className="btn btn-outline" onClick={onClose}>{LOESCH_TEXT.schliessen}</button>;
  if (a && a.loeschbar) {
    footer = (
      <>
        <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>{LOESCH_TEXT.abbrechen}</button>
        <button type="button" className="btn btn-danger inv-loeschen-bestaetigen" onClick={loeschen} disabled={!kannLoeschen}>
          {busy ? <><span className="spinner" /> {LOESCH_TEXT.laeuft}</> : (mitBestand ? LOESCH_TEXT.ausbuchenUndLoeschen : LOESCH_TEXT.loeschen)}
        </button>
      </>
    );
  } else if (a && a.art === "gesperrt") {
    footer = (
      <>
        <button type="button" className="btn btn-outline" onClick={onClose}>{LOESCH_TEXT.schliessen}</button>
        <button type="button" className="btn btn-primary" onClick={() => gehe(`/inventory/products/${a.produkt.id}`)}>{LOESCH_TEXT.zumArtikel}</button>
      </>
    );
  }

  return (
    <InventoryDialog open onClose={() => { if (!busy) onClose(); }} title={LOESCH_TEXT.titel} busy={busy} footer={footer}>
      <p className="inv-dialog-lead">
        <strong>{product.name}</strong> · <Werte>{product.sku}</Werte>
      </p>

      {pruefung.status === "laden" && <p className="inv-dialog-note" role="status">{LOESCH_TEXT.laden}</p>}

      {pruefung.status === "fehler" && (
        <InlineError text={pruefung.hinweis} onRetry={() => pruefen()} />
      )}

      {pruefung.status === "bereit" && pruefung.hinweis && (
        <p className="inv-dialog-note inv-loeschen-hinweis" role="status">{pruefung.hinweis}</p>
      )}

      {a && a.art === "frei" && (
        <>
          <p className="inv-dialog-note">{LOESCH_TEXT.endgueltig}</p>
          <p className="inv-dialog-note">{LOESCH_TEXT.historie}</p>
        </>
      )}

      {mitBestand && (
        <>
          <p className="inv-dialog-note">{LOESCH_TEXT.bestandEinleitung}</p>
          <ul className="inv-loeschen-liste">
            {a.lagerMitBestand.map((l) => (
              <li key={l.warehouseId}><span>{l.name}</span><span className="ce-num">{einheiten(l.bestand)}</span></li>
            ))}
          </ul>
          <label className="inv-toolbar-check inv-loeschen-check">
            <input type="checkbox" checked={ausbuchen} disabled={busy} onChange={(e) => setAusbuchen(e.target.checked)} />
            <span>{`${einheiten(a.bestand)} ausbuchen und den Artikel endgültig löschen`}</span>
          </label>
          <p className="inv-dialog-note">{LOESCH_TEXT.bestandHinweis} {LOESCH_TEXT.historie}</p>
        </>
      )}

      {a && a.art === "reserviert" && (
        <>
          <p className="inv-dialog-note">{LOESCH_TEXT.reserviertEinleitung}</p>
          {a.auftraege.length > 0 && (
            <ul className="inv-loeschen-liste">
              {a.auftraege.map((o) => (
                <li key={o.orderId}>
                  <button type="button" className="btn btn-link" onClick={() => gehe(`/inventory/orders/${o.orderId}`)}>
                    <Werte>{o.nummer || "Auftrag"}</Werte>
                  </button>
                  <span className="ce-num">{`${einheiten(o.menge)} reserviert`}</span>
                </li>
              ))}
            </ul>
          )}
          {a.sendungen > 0 && <p className="inv-dialog-note">{LOESCH_TEXT.sendungen}</p>}
          <p className="inv-dialog-note">{LOESCH_TEXT.reserviertWeg}</p>
        </>
      )}

      {a && a.art === "gesperrt" && (
        <>
          <p className="inv-dialog-note">{LOESCH_TEXT.gesperrtEinleitung}</p>
          <ul className="inv-loeschen-liste">
            {a.lagerGesperrt.map((l) => (
              <li key={l.warehouseId}><span>{l.name}</span><span className="ce-num">{`${einheiten(l.gesperrt)} gesperrt`}</span></li>
            ))}
          </ul>
          <p className="inv-dialog-note">{LOESCH_TEXT.gesperrtWeg}</p>
        </>
      )}

      {fehler && <InlineError text={fehler} />}
    </InventoryDialog>
  );
}
