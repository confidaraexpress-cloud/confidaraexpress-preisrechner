import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { InlineError, InventoryDialog, QuantityField, StockBadge } from "../../components/inventory/InventoryShared";
import { ProductForm } from "../../components/inventory/ProductForm";
import { getProduct, updateProduct } from "../../api/inventoryApi";
import {
  formatKg, formatUnits, signedQuantity, movementTypeView,
  inventoryErrorText, mapProductToShipment,
} from "../../utils/inventoryView.mjs";

function dtDE(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ── Artikeldetail (echte Route /inventory/products/:id) ─────────────────────
   Detailseiten im Kundenbereich laufen über echte Routen, nicht über den
   page-State: eine Entitäts-ID gehört nicht in einen page-String. Orientierung
   ist das bestehende Adminmuster (/admin/users/:id) — Zurück-Link im
   Seitenkopf, ein Seitenkopf je Seite.

   „Versenden" führt in den bestehenden Prozess „Neue Sendung". Weil dieser als
   page-State in DashboardPage lebt, wandert der Prefill über den
   History-State — dieselbe Mechanik, mit der DashboardPage schon heute seinen
   Bereich transportiert. */
export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const ctx = useOutletContext() || {};

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [shipOpen, setShipOpen] = useState(false);
  const [shipQty, setShipQty] = useState("1");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotFound(false);
    try {
      const res = await getProduct(id);
      if (res.status === 404) { setNotFound(true); return; }
      if (!res.ok) { setError(inventoryErrorText(await res.json().catch(() => null), "Der Artikel konnte nicht geladen werden.")); return; }
      setData(await res.json());
    } catch { setError("Der Artikel konnte nicht geladen werden."); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const speichern = async (values) => {
    setSaving(true);
    setFormError("");
    try {
      const res = await updateProduct(id, values);
      if (!res.ok) { setFormError(inventoryErrorText(await res.json().catch(() => null), "Der Artikel konnte nicht gespeichert werden.")); return; }
      setEditOpen(false);
      await load();
    } catch { setFormError("Der Artikel konnte nicht gespeichert werden."); }
    finally { setSaving(false); }
  };

  // Der Prefill reist im History-State zum Dashboard und wird dort genau einmal
  // gelesen und sofort aus der History entfernt — er darf bei einem späteren
  // Browser-Zurück nicht erneut greifen.
  const versenden = () => {
    const payload = mapProductToShipment(data.product, Number(shipQty), data.balances?.[0]?.warehouseId ?? null);
    if (!payload) { setError("Bitte eine ganze Menge größer null angeben."); return; }
    setShipOpen(false);
    navigate("/dashboard", { state: { page: "new", inventoryPrefill: payload } });
  };

  const zurueck = (
    <button type="button" className="btn btn-link ce-page-header-back adm-back" onClick={() => navigate("/dashboard?page=products")}>
      <Icon n="chevronLeft" s={16} />Zurück zu den Artikeln
    </button>
  );

  if (notFound) {
    return (
      <div className="page-body">
        <PageHeader eyebrow="Lager & Aufträge" title="Artikel" backLink={zurueck} utility={ctx.utility} />
        <ErrorState
          title="Artikel nicht gefunden"
          text="Dieser Artikel existiert nicht oder gehört nicht zu Ihrem Konto."
          action={<button type="button" className="btn btn-primary" onClick={() => navigate("/dashboard?page=products")}>Zur Artikelliste</button>}
        />
      </div>
    );
  }

  const p = data?.product;

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="Lager & Aufträge"
        title={p ? p.name : "Artikel"}
        subtitle={p ? `SKU ${p.sku}` : undefined}
        backLink={zurueck}
        utility={ctx.utility}
        actions={p && (
          <>
            <button type="button" className="btn btn-outline" onClick={() => { setFormError(""); setEditOpen(true); }}>Bearbeiten</button>
            <button type="button" className="btn btn-primary" disabled={p.status === "inactive"} onClick={() => { setShipQty("1"); setShipOpen(true); }}>
              <Icon n="package" s={16} />Versenden
            </button>
          </>
        )}
      />

      <InlineError text={error} onRetry={load} />
      {loading && <ListSkeleton rows={4} label="Artikel wird geladen" />}

      {!loading && p && (
        <>
          <section className="ce-card inv-detail-section">
            <h2 className="inv-section-title">Bestand</h2>
            <div className="inv-detail-stock">
              <div><span className="inv-detail-k">Physisch</span><span className="inv-detail-v ce-num">{formatUnits(p.stock?.onHand)}</span></div>
              <div><span className="inv-detail-k">Reserviert</span><span className="inv-detail-v ce-num">{formatUnits(p.stock?.reserved)}</span></div>
              <div><span className="inv-detail-k">Verfügbar</span><span className="inv-detail-v ce-num">{formatUnits(p.stock?.available)}</span></div>
              <div><span className="inv-detail-k">Mindestbestand</span><span className="inv-detail-v ce-num">{p.minStock ?? "—"}</span></div>
            </div>
            <StockBadge row={{ available: p.stock?.available, minStock: p.minStock }} />

            {data.balances?.length > 0 && (
              <div className="ce-table-container inv-detail-table">
                <table className="ce-list-table">
                  <caption className="sr-only">Bestand je Lager</caption>
                  <thead>
                    <tr>
                      <th scope="col">Lager</th>
                      <th scope="col" className="ce-num">Bestand</th>
                      <th scope="col" className="ce-num">Reserviert</th>
                      <th scope="col" className="ce-num">Gesperrt</th>
                      <th scope="col" className="ce-num">Verfügbar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.balances.map((b) => (
                      <tr key={b.warehouseId}>
                        <td>{b.warehouseName}</td>
                        <td className="ce-num">{formatUnits(b.onHand)}</td>
                        <td className="ce-num">{formatUnits(b.reserved)}</td>
                        <td className="ce-num">{formatUnits(b.blocked)}</td>
                        <td className="ce-num">{formatUnits(b.available)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="ce-card inv-detail-section">
            <h2 className="inv-section-title">Stammdaten</h2>
            <dl className="inv-detail-list">
              <div><dt>SKU</dt><dd>{p.sku}</dd></div>
              <div><dt>EAN / GTIN</dt><dd>{p.ean || "—"}</dd></div>
              <div><dt>Status</dt><dd>{p.status === "active" ? "Aktiv" : "Inaktiv"}</dd></div>
              <div><dt>Beschreibung</dt><dd>{p.description || "—"}</dd></div>
            </dl>
          </section>

          <section className="ce-card inv-detail-section">
            <h2 className="inv-section-title">Versanddaten</h2>
            <dl className="inv-detail-list">
              <div><dt>Gewicht</dt><dd>{formatKg(p.weightKg)}</dd></div>
              <div><dt>Maße (L × B × H)</dt><dd>
                {p.lengthCm || p.widthCm || p.heightCm
                  ? `${p.lengthCm ?? "—"} × ${p.widthCm ?? "—"} × ${p.heightCm ?? "—"} cm`
                  : "—"}
              </dd></div>
            </dl>
            <p className="inv-form-note">
              Artikelmaße sind Stammdaten. Sie werden beim Versand nicht automatisch zu Paketmaßen
              verrechnet — die Paketdaten bestätigen Sie im Versandformular.
            </p>
          </section>

          <section className="ce-card inv-detail-section">
            <h2 className="inv-section-title">Zolldaten</h2>
            <dl className="inv-detail-list">
              <div><dt>Warenwert je Stück</dt><dd>{p.unitValue != null ? `${Number(p.unitValue).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—"}</dd></div>
              <div><dt>HS-Code</dt><dd>{p.hsCode || "—"}</dd></div>
              <div><dt>Ursprungsland</dt><dd>{p.countryOfOrigin || "—"}</dd></div>
              <div><dt>Zollbeschreibung</dt><dd>{p.customsDescription || "—"}</dd></div>
            </dl>
          </section>

          <section className="ce-card inv-detail-section">
            <h2 className="inv-section-title">Letzte Bestandsbewegungen</h2>
            {(!data.movements || data.movements.length === 0)
              ? <p className="inv-cell-meta">Für diesen Artikel wurde noch keine Bewegung gebucht.</p>
              : (
                <ul className="inv-movement-list">
                  {data.movements.map((m) => {
                    const [cls, text, roh] = movementTypeView(m.type);
                    return (
                      <li key={m.id} className="inv-movement-item">
                        <span className={`badge ${cls}`} title={roh ? `Serverwert: ${roh}` : undefined}>
                          <span className="badge-dot" aria-hidden="true" />{text}
                        </span>
                        <span className={`ce-num inv-movement-qty${Number(m.quantity) < 0 ? " inv-num-out" : " inv-num-in"}`}>{signedQuantity(m.quantity)}</span>
                        <span className="inv-cell-meta">{m.warehouseName}</span>
                        <span className="inv-cell-meta">{dtDE(m.createdAt)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
          </section>
        </>
      )}

      <InventoryDialog open={editOpen} onClose={() => { if (!saving) setEditOpen(false); }} title="Artikel bearbeiten" size="lg" busy={saving}>
        <ProductForm initial={p} busy={saving} error={formError} onCancel={() => setEditOpen(false)} onSubmit={speichern} />
      </InventoryDialog>

      <InventoryDialog
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        title="Artikel versenden"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setShipOpen(false)}>Abbrechen</button>
            <button type="button" className="btn btn-primary" onClick={versenden}>Weiter zur Sendung</button>
          </>
        }
      >
        {p && (
          <>
            <p className="inv-dialog-lead">
              <strong>{p.name}</strong> · {p.sku}<br />
              Verfügbar: <span className="ce-num">{formatUnits(p.stock?.available)}</span>
            </p>
            <QuantityField id="inv-detail-ship-qty" label="Menge" value={shipQty} onChange={setShipQty} autoFocus
                           hint="Der Bestand wird erst mit der Buchung ausgebucht — nicht schon jetzt." />
            <p className="inv-dialog-note">
              Empfänger, Paketmaße und Versandservice ergänzen Sie im gewohnten Ablauf „Neue Sendung".
            </p>
          </>
        )}
      </InventoryDialog>
    </div>
  );
}
