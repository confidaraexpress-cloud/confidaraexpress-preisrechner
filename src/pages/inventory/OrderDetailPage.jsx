import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { InlineError, InventoryDialog } from "../../components/inventory/InventoryShared";
import { getOrder, cancelOrder, getOrderShippingPrefill } from "../../api/inventoryApi";
import {
  orderStatusView, formatUnits, formatKg, inventoryErrorText,
  isOrderShippable, mapOrderPrefillToShipment, orderSummary, dateShort as dDE,
} from "../../utils/inventoryView.mjs";
// Vorhandener Auflöser aus dem Preisrechner — „DE" ist eine Eingabehilfe, kein
// Text, den man einem Empfänger vorlegt. Keine zweite Länderdatenquelle.
import { countryName } from "../../utils/calculatorValidation.mjs";
// Sendungsstatus kommt aus dem BESTEHENDEN Bauteil — der Lagerbereich führt
// kein zweites Statusmodell für Sendungen und keine zweite Badge-Abbildung.
import { StatusBadge } from "../../components/ui/StatusBadge";
import { downloadDeliveryNote } from "../../utils/downloadDeliveryNote";

/* ── Auftragsdetail (echte Route /inventory/orders/:id) ──────────────────────
   Zeigt Auftrag, Positionen mit Reservierungsstand und die verbundenen
   Sendungen. Die Sendungen kommen über shipment_items — der Auftrag hält
   bewusst KEINE Sendungsreferenz, damit Teilversand (mehrere Sendungen je
   Auftrag) möglich bleibt.

   Hauptaktion ist „Versand vorbereiten". Sie erzeugt keine Sendung: sie holt
   den serverseitig bestimmten Prefill und übergibt ihn dem bestehenden Prozess
   „Neue Sendung". Bei abgeschlossenem oder storniertem Auftrag entfällt sie. */
export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const ctx = useOutletContext() || {};

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  // Lieferschein-Download je Sendung: die laufende Sendungs-ID und ein
  // Fehlerzustand. Beides zeilenbezogen — ein Fehler an einer Sendung darf die
  // anderen Zeilen nicht betreffen.
  const [dnBusyId, setDnBusyId] = useState(null);
  const [dnError, setDnError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const res = await getOrder(id);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) { setError(inventoryErrorText(await res.json().catch(() => null), "Der Auftrag konnte nicht geladen werden.")); return; }
      setData(await res.json());
    } catch { setError("Der Auftrag konnte nicht geladen werden."); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const ladeLieferschein = async (s) => {
    if (!s?.id || !s?.deliveryNote?.number || dnBusyId) return;
    setDnBusyId(s.id); setDnError("");
    try {
      await downloadDeliveryNote(s.id, s.deliveryNote.number);
    } catch (e) {
      if (e?.status !== 401 && e?.status !== 403) setDnError(e.message);
    }
    setDnBusyId(null);
  };

  // Drei Fälle, klar getrennt:
  //   Confidara-Lieferschein → Nummer als Downloadaktion
  //   eigener Lieferschein   → Nummer als Text (kein PDF in Confidara, also kein Knopf)
  //   keiner                 → Gedankenstrich, keine leere Zeile
  const renderDeliveryNoteCell = (s) => {
    if (s.deliveryNote?.number) {
      return (
        <button
          type="button"
          className="btn btn-link inv-cell-link"
          onClick={() => ladeLieferschein(s)}
          disabled={dnBusyId === s.id}
        >
          {dnBusyId === s.id ? "Wird geladen …" : s.deliveryNote.number}
        </button>
      );
    }
    if (s.externalDeliveryNoteNumber) {
      return <span className="inv-cell-meta">Eigener Lieferschein {s.externalDeliveryNoteNumber}</span>;
    }
    return <span className="inv-cell-meta">—</span>;
  };

  const versandVorbereiten = async () => {
    setPreparing(true);
    setError("");
    try {
      const res = await getOrderShippingPrefill(id);
      if (!res.ok) { setError(inventoryErrorText(await res.json().catch(() => null), "Die Versandvorbereitung ist fehlgeschlagen.")); return; }
      const payload = mapOrderPrefillToShipment(await res.json());
      if (!payload) { setError("Die Versandvorbereitung ist fehlgeschlagen."); return; }
      // Der Prefill reist im History-State zum Dashboard und wird dort genau
      // EINMAL gelesen und sofort aus der History entfernt.
      navigate("/dashboard", { state: { page: "new", inventoryPrefill: payload } });
    } catch { setError("Die Versandvorbereitung ist fehlgeschlagen."); }
    finally { setPreparing(false); }
  };

  const stornieren = async () => {
    setCancelling(true);
    setError("");
    try {
      const res = await cancelOrder(id);
      if (!res.ok) { setError(inventoryErrorText(await res.json().catch(() => null), "Der Auftrag konnte nicht storniert werden.")); return; }
      setCancelOpen(false);
      await load();
    } catch { setError("Der Auftrag konnte nicht storniert werden."); }
    finally { setCancelling(false); }
  };

  const zurueck = (
    <button type="button" className="btn btn-link ce-page-header-back adm-back" onClick={() => navigate("/dashboard?page=orders")}>
      <Icon n="chevronLeft" s={16} />Zurück zu den Aufträgen
    </button>
  );

  if (notFound) {
    return (
      <div className="page-body">
        <PageHeader eyebrow="Lager & Aufträge" title="Auftrag" backLink={zurueck} utility={ctx.utility} />
        <ErrorState
          title="Auftrag nicht gefunden"
          text="Dieser Auftrag existiert nicht oder gehört nicht zu Ihrem Konto."
          action={<button type="button" className="btn btn-primary" onClick={() => navigate("/dashboard?page=orders")}>Zur Auftragsliste</button>}
        />
      </div>
    );
  }

  const o = data?.order;
  const [statusCls, statusText, statusRoh] = o ? orderStatusView(o.status) : ["", "", null];
  const versandbereit = isOrderShippable(o);
  // Ein Satz statt dreier Zahlen nebeneinander: „Positionen" zählt Positionen,
  // die beiden anderen Werte zählen Mengen (siehe utils/inventoryView.mjs).
  const zusammenfassung = orderSummary(o);
  const stornierbar = o && o.status !== "cancelled" && o.status !== "shipped";

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="Lager & Aufträge"
        title={o ? o.orderNumber : "Auftrag"}
        subtitle={o?.customerReference ? `Ihre Referenz: ${o.customerReference}` : undefined}
        backLink={zurueck}
        utility={ctx.utility}
        meta={o && (
          <>
            <span className={`badge ${statusCls}`} title={statusRoh ? `Serverwert: ${statusRoh}` : undefined}>
              <span className="badge-dot" aria-hidden="true" />{statusText}
            </span>
            {zusammenfassung && <span className="inv-order-summary">{zusammenfassung}</span>}
          </>
        )}
        actions={o && (
          <>
            {stornierbar && (
              <button type="button" className="btn btn-outline" onClick={() => setCancelOpen(true)}>Auftrag stornieren</button>
            )}
            {versandbereit && (
              <button type="button" className="btn btn-primary" disabled={preparing} onClick={versandVorbereiten}>
                <Icon n="package" s={16} />{preparing ? "Wird vorbereitet …" : "Versand vorbereiten"}
              </button>
            )}
          </>
        )}
      />

      <InlineError text={error} onRetry={load} />
      {loading && <ListSkeleton rows={4} label="Auftrag wird geladen" />}

      {!loading && o && (
        <>
          <section className="ce-card inv-detail-section">
            <h2 className="inv-section-title">Empfänger</h2>
            <address className="inv-address">
              {o.recipient?.company && <>{o.recipient.company}<br /></>}
              {o.recipient?.fullName}<br />
              {o.recipient?.streetAndNumber}<br />
              {o.recipient?.addressAddition && <>{o.recipient.addressAddition}<br /></>}
              {o.recipient?.postalCode} {o.recipient?.city}<br />
              {o.recipient?.country ? countryName(o.recipient.country) : null}
            </address>
            <dl className="inv-detail-list">
              <div><dt>Lager</dt><dd>{o.warehouseName}</dd></div>
              <div><dt>Erstellt</dt><dd>{dDE(o.createdAt)}</dd></div>
              {o.cancelledAt && <div><dt>Storniert</dt><dd>{dDE(o.cancelledAt)}</dd></div>}
            </dl>
            {o.notes && <p className="inv-cell-meta">{o.notes}</p>}
          </section>

          <section className="ce-card inv-detail-section">
            <h2 className="inv-section-title">Positionen</h2>
            <div className="ce-table-container inv-detail-table">
              <table className="ce-list-table">
                <caption className="sr-only">Auftragspositionen mit Reservierungsstand</caption>
                <thead>
                  <tr>
                    <th scope="col">SKU</th>
                    <th scope="col">Artikel</th>
                    <th scope="col" className="ce-num">Bestellt</th>
                    <th scope="col" className="ce-num">Reserviert</th>
                    <th scope="col" className="ce-num">Versendet</th>
                    <th scope="col" className="ce-num">Stückgewicht</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.items || []).map((it) => (
                    <tr key={it.id}>
                      <td className="inv-cell-sku">{it.sku}</td>
                      <td>
                        <button type="button" className="btn btn-link inv-cell-link" onClick={() => navigate(`/inventory/products/${it.productId}`)}>{it.name}</button>
                      </td>
                      <td className="ce-num">{formatUnits(it.quantity)}</td>
                      <td className="ce-num">{formatUnits(it.reservedQuantity)}</td>
                      <td className="ce-num">{formatUnits(it.shippedQuantity)}</td>
                      <td className="ce-num">{it.unitWeightKg != null ? formatKg(it.unitWeightKg) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="inv-form-note">
              Reservierte Ware liegt weiterhin im Lager und ist nur für diesen Auftrag vorgemerkt.
              Aus dem Lager entfernt wird sie erst mit der Buchung der Sendung.
            </p>
          </section>

          <section className="ce-card inv-detail-section">
            <h2 className="inv-section-title">Verbundene Sendungen</h2>
            {dnError && <InlineError text={dnError} />}
            {(!data.shipments || data.shipments.length === 0)
              ? <p className="inv-cell-meta">Für diesen Auftrag wurde noch keine Sendung gebucht.</p>
              : (
                <div className="ce-table-container inv-detail-table">
                  <table className="ce-list-table">
                    <caption className="sr-only">Sendungen zu diesem Auftrag</caption>
                    <thead>
                      <tr>
                        <th scope="col">Bestellnummer</th>
                        <th scope="col">Carrier</th>
                        <th scope="col">Sendungsnummer</th>
                        <th scope="col">Status</th>
                        <th scope="col">Lieferschein</th>
                        <th scope="col">Gebucht</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.shipments.map((s) => (
                        <tr key={s.id}>
                          <td>{s.businessOrderNumber || "—"}</td>
                          <td>{s.carrier || "—"}</td>
                          <td className="inv-cell-meta">{s.trackingNumber || "—"}</td>
                          <td><StatusBadge status={s.status} /></td>
                          {/* Je Sendung ein eigener Lieferschein — bei Teilversand hat jede
                              Sendung ihren. Deshalb hier in der Zeile und nicht als ein
                              Kasten oben am Auftrag, der nur einen Wert tragen könnte.
                              Confidara-Lieferschein: Nummer + Download.
                              Eigener Lieferschein: nur die Nummer als Text — es liegt kein
                              PDF in Confidara, also wird auch kein Download behauptet. */}
                          <td>{renderDeliveryNoteCell(s)}</td>
                          <td className="inv-cell-meta">{dDE(s.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            <p className="inv-form-note">
              Label und Sendungsverfolgung finden Sie wie gewohnt unter{" "}
              <button type="button" className="btn btn-link inv-cell-link"
                      onClick={() => navigate("/dashboard?page=shipments")}>Sendungen</button>.
            </p>
          </section>
        </>
      )}

      <InventoryDialog
        open={cancelOpen}
        onClose={() => { if (!cancelling) setCancelOpen(false); }}
        title="Auftrag stornieren"
        size="sm"
        busy={cancelling}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setCancelOpen(false)} disabled={cancelling}>Abbrechen</button>
            <button type="button" className="btn btn-danger" onClick={stornieren} disabled={cancelling}>
              {cancelling ? "Wird storniert …" : "Auftrag stornieren"}
            </button>
          </>
        }
      >
        <p>
          Die noch reservierte Menge wird freigegeben und steht sofort wieder zur Verfügung.
          Der physische Bestand ändert sich dadurch nicht.
        </p>
        <p className="inv-cell-meta">Bereits versendete Positionen bleiben unverändert.</p>
      </InventoryDialog>
    </div>
  );
}
