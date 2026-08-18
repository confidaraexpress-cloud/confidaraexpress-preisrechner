import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { ErrorState, ListSkeleton } from "../../components/ui/StateView";
import { InlineError, InlineSuccess, InventoryDialog, QuantityField, StockBadge } from "../../components/inventory/InventoryShared";
import { ProductForm } from "../../components/inventory/ProductForm";
import { getProduct, updateProduct, postBlock, postUnblock, postReceipt } from "../../api/inventoryApi";
import {
  formatKg, formatUnits, signedQuantity, movementTypeView,
  inventoryErrorText, mapProductToShipment, adjustmentReasonLabel,
  lowStockInfo, BLOCK_REASONS, blockEntryView,
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

  // Bestandsvorgänge dieser Seite: Wareneingang, Sperren, Freigeben. Ein
  // gemeinsamer Zustand statt drei Sätzen — es ist immer höchstens einer offen.
  const [stockDialog, setStockDialog] = useState(null); // "receipt" | "block" | "unblock" | null
  const [stockQty, setStockQty] = useState("1");
  const [stockReason, setStockReason] = useState(BLOCK_REASONS[0].value);
  const [stockNote, setStockNote] = useState("");
  const [stockBusy, setStockBusy] = useState(false);
  const [stockError, setStockError] = useState("");
  const [success, setSuccess] = useState("");

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

  // Das Lager der Bestandsvorgänge: die Detailseite zeigt einen Artikel, und der
  // Bestand hängt immer an einem Lager. Genutzt wird das erste (bei einem Lager
  // das einzige); mehrere Lager bleiben über die Tabelle sichtbar.
  const primaryWarehouse = data?.balances?.[0] || null;

  const oeffneStock = (art) => {
    setStockDialog(art);
    setStockQty("1");
    setStockReason(BLOCK_REASONS[0].value);
    setStockNote("");
    setStockError("");
    setSuccess("");
  };

  // Ein Pfad für alle drei Vorgänge: Menge senden, Antwort abwarten, neu laden.
  // Der Client rechnet nichts aus und schickt keinen Zielwert — er nennt eine
  // Menge, alles Weitere entscheidet der Server.
  const stockAbsenden = async () => {
    if (!primaryWarehouse) { setStockError("Für diesen Artikel ist noch kein Lager hinterlegt."); return; }
    const menge = Number(String(stockQty).trim());
    if (!Number.isInteger(menge) || menge < 1) { setStockError("Bitte eine ganze Menge größer null angeben."); return; }
    const notiz = stockNote.trim();
    if (stockDialog === "block" && stockReason === "other" && !notiz) {
      setStockError("Bitte beschreiben Sie den Grund kurz in der Notiz.");
      return;
    }
    setStockBusy(true);
    setStockError("");
    try {
      const basis = { productId: id, warehouseId: primaryWarehouse.warehouseId, quantity: menge };
      const res = stockDialog === "receipt" ? await postReceipt({ ...basis, note: notiz || undefined })
        : stockDialog === "block" ? await postBlock({ ...basis, reason: stockReason, note: notiz || undefined })
        : await postUnblock({ ...basis, note: notiz || undefined });
      if (!res.ok) {
        setStockError(inventoryErrorText(await res.json().catch(() => null), "Der Vorgang konnte nicht ausgeführt werden."));
        return;
      }
      setSuccess(stockDialog === "receipt" ? `${menge} Einheiten eingebucht.`
        : stockDialog === "block" ? `${menge} Einheiten gesperrt.`
        : `${menge} Einheiten wieder freigegeben.`);
      setStockDialog(null);
      await load();
    } catch { setStockError("Der Vorgang konnte nicht ausgeführt werden."); }
    finally { setStockBusy(false); }
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
  const gesperrt = Number(p?.stock?.blocked ?? 0);
  const niedrig = p ? lowStockInfo({ available: p.stock?.available, minStock: p.minStock }) : null;
  const sperrEintraege = (data?.blocks || []).map(blockEntryView).filter(Boolean);

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
      <InlineSuccess text={success} />
      {loading && <ListSkeleton rows={4} label="Artikel wird geladen" />}

      {!loading && p && (
        <>
          <section className="ce-card inv-detail-section">
            <h2 className="inv-section-title">Bestand</h2>
            {/* Fünf Werte, immer dieselbe Reihenfolge — sie bilden die Formel ab:
                verfügbar = physisch − reserviert − gesperrt. „Gesperrt" bleibt
                dauerhaft sichtbar, seit echte Aktionen dahinterstehen.

                Ohne `.ce-num`: das Primitive richtet eine TABELLENSPALTE rechts
                aus. Hier steht der Wert unter seiner Beschriftung, beide
                linksbündig — die tabellarischen Ziffern kommen aus
                `.inv-detail-v`, die gemeinsame Höhe aus dem Raster. */}
            <div className="inv-detail-stock">
              <div><span className="inv-detail-k">Physisch</span><span className="inv-detail-v">{formatUnits(p.stock?.onHand)}</span></div>
              <div><span className="inv-detail-k">Reserviert</span><span className="inv-detail-v">{formatUnits(p.stock?.reserved)}</span></div>
              <div><span className="inv-detail-k">Gesperrt</span><span className={`inv-detail-v${gesperrt > 0 ? " inv-num-blocked" : ""}`}>{formatUnits(p.stock?.blocked)}</span></div>
              <div><span className="inv-detail-k">Verfügbar</span><span className="inv-detail-v">{formatUnits(p.stock?.available)}</span></div>
              <div><span className="inv-detail-k">Mindestbestand</span><span className="inv-detail-v">{p.minStock ?? "—"}</span></div>
            </div>
            <p className="inv-detail-formula">Verfügbar = physisch − reserviert − gesperrt.</p>
            <StockBadge row={{ available: p.stock?.available, minStock: p.minStock }} />

            {/* Niedriger Bestand als Information statt als Etikett: die drei
                Zahlen sagen, wie weit es fehlt — und daneben steht die Handlung,
                die es behebt. Kein zweiter Wareneingangspfad: derselbe Dialog. */}
            {niedrig && (
              <div className="inv-lowstock" role="status">
                <Icon n="info" s={16} />
                <span className="inv-lowstock-text">
                  <strong>{formatUnits(niedrig.available)} verfügbar</strong> bei Mindestbestand {formatUnits(niedrig.minStock)} —{" "}
                  {formatUnits(niedrig.missing)} {niedrig.missing === 1 ? "Einheit" : "Einheiten"} fehlen.
                </span>
                <button type="button" className="btn btn-sm btn-primary" onClick={() => oeffneStock("receipt")}>
                  <Icon n="packageMove" s={16} />Bestand einbuchen
                </button>
              </div>
            )}

            {/* Nur relevante Aktionen: „Sperre aufheben" erscheint erst, wenn es
                etwas aufzuheben gibt.

                „Bestand einbuchen" steht hier nur, solange der Hinweisstreifen
                oben ihn NICHT bereits trägt — sonst stünde dieselbe Aktion
                zweimal untereinander auf derselben Karte, einmal als
                Hauptaktion und drei Zeilen darunter noch einmal als
                Nebenaktion. Erreichbar bleibt sie in beiden Fällen genau
                einmal (CLAUDE.md: „Genau eine Stelle je Aktion"). */}
            <div className="inv-detail-actions">
              {!niedrig && (
                <button type="button" className="btn btn-sm btn-outline" onClick={() => oeffneStock("receipt")}>
                  <Icon n="packageMove" s={16} />Bestand einbuchen
                </button>
              )}
              <button type="button" className="btn btn-sm btn-outline" onClick={() => oeffneStock("block")}
                      disabled={Number(p.stock?.available ?? 0) < 1}>
                <Icon n="shield" s={16} />Bestand sperren
              </button>
              {gesperrt > 0 && (
                <button type="button" className="btn btn-sm btn-outline" onClick={() => oeffneStock("unblock")}>
                  <Icon n="check" s={16} />Sperre aufheben
                </button>
              )}
            </div>

            {data.balances?.length > 0 && (
              <div className="ce-table-container inv-detail-table">
                <table className="ce-list-table">
                  <caption className="sr-only">Bestand je Lager</caption>
                  <thead>
                    <tr>
                      <th scope="col">Lager</th>
                      {/* „Physisch" wie im Kennzahlenband darüber und auf der
                          Bestandsseite — „Bestand" wäre neben reserviert,
                          gesperrt und verfügbar mehrdeutig. */}
                      <th scope="col" className="ce-num">Physisch</th>
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

          {/* Warum ist hier etwas gesperrt? Erscheint nur, wenn es tatsächlich
              eine Sperre gab — sonst wäre es eine leere Karte ohne Aussage.
              Bewusst getrennt von den Bewegungen: eine Sperre verändert keinen
              physischen Bestand und gehört deshalb nicht ins Bewegungsledger. */}
          {(gesperrt > 0 || sperrEintraege.length > 0) && (
            <section className="ce-card inv-detail-section">
              <h2 className="inv-section-title">Gesperrter Bestand</h2>
              {gesperrt > 0 && (
                <p className="inv-detail-blocked-sum">
                  <strong className="ce-num">{formatUnits(gesperrt)}</strong>{" "}
                  {gesperrt === 1 ? "Einheit ist" : "Einheiten sind"} aktuell gesperrt und stehen weder für
                  Aufträge noch für den Versand zur Verfügung. Physisch liegen sie weiterhin im Lager.
                </p>
              )}
              <ul className="inv-block-list">
                {sperrEintraege.map((b) => (
                  <li key={b.id} className="inv-block-item">
                    <span className={`badge ${b.action === "block" ? "badge--warning" : "badge--neutral"}`}>
                      <span className="badge-dot" aria-hidden="true" />
                      {b.action === "block" ? "Gesperrt" : "Freigegeben"}
                    </span>
                    <span className="inv-block-main">
                      <span className="inv-block-title" title={b.rawReason ? `Serverwert: ${b.rawReason}` : undefined}>{b.title}</span>
                      {b.note && <span className="inv-cell-meta">{b.note}</span>}
                    </span>
                    <span className="ce-num inv-block-qty">{b.quantityText}</span>
                    <span className="inv-cell-meta">{dtDE(b.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="ce-card inv-detail-section">
            <div className="inv-detail-head">
              <h2 className="inv-section-title">Letzte Bestandsbewegungen</h2>
              {data.movements?.length > 0 && (
                <button type="button" className="btn btn-link btn-sm"
                        onClick={() => navigate(`/dashboard?page=movements&product=${encodeURIComponent(id)}`)}>
                  Alle Bewegungen anzeigen<Icon n="chevronRight" s={14} />
                </button>
              )}
            </div>
            {(!data.movements || data.movements.length === 0)
              ? <p className="inv-cell-meta">Für diesen Artikel wurde noch keine Bewegung gebucht.</p>
              : (
                <ul className="inv-movement-list">
                  {/* Bewusst nur die letzten fünf: die Detailseite gibt einen
                      Überblick, die vollständige Liste zeigt die Bewegungsseite. */}
                  {data.movements.slice(0, 5).map((m) => {
                    const [cls, text, roh] = movementTypeView(m.type);
                    return (
                      <li key={m.id} className="inv-movement-item">
                        <span className={`badge ${cls}`} title={roh ? `Serverwert: ${roh}` : undefined}>
                          <span className="badge-dot" aria-hidden="true" />{text}
                        </span>
                        <span className={`ce-num inv-movement-qty${Number(m.quantity) < 0 ? " inv-num-out" : " inv-num-in"}`}>{signedQuantity(m.quantity)}</span>
                        <span className="inv-cell-meta">Bestand danach: <span className="ce-num">{formatUnits(m.onHandAfter)}</span></span>
                        {/* Nur manuelle Korrekturen tragen einen Grund; er steht
                            als eigenes Feld an der Bewegung, nicht in der Notiz. */}
                        {adjustmentReasonLabel(m.reason) && <span className="inv-cell-meta">{adjustmentReasonLabel(m.reason)}</span>}
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

      <InventoryDialog open={editOpen} onClose={() => { if (!saving) setEditOpen(false); }} title="Artikel bearbeiten" size="lg" busy={saving} scrollBody>
        <ProductForm initial={p} busy={saving} error={formError} onCancel={() => setEditOpen(false)} onSubmit={speichern} />
      </InventoryDialog>

      {/* Wareneingang, Sperren und Freigeben teilen sich EINEN Dialog: dieselbe
          Form, dieselbe Fehlerbehandlung, nur andere Beschriftung und ein
          zusätzliches Grundfeld beim Sperren. */}
      <InventoryDialog
        open={Boolean(stockDialog)}
        onClose={() => { if (!stockBusy) setStockDialog(null); }}
        title={stockDialog === "receipt" ? "Bestand einbuchen" : stockDialog === "block" ? "Bestand sperren" : "Sperre aufheben"}
        busy={stockBusy}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setStockDialog(null)} disabled={stockBusy}>Abbrechen</button>
            <button type="button" className="btn btn-primary" onClick={stockAbsenden} disabled={stockBusy}>
              {stockBusy ? "Wird ausgeführt …"
                : stockDialog === "receipt" ? "Bestand einbuchen"
                : stockDialog === "block" ? "Bestand sperren" : "Sperre aufheben"}
            </button>
          </>
        }
      >
        {p && stockDialog && (
          <>
            <InlineError text={stockError} />
            <dl className="inv-dialog-facts">
              <div><dt>Artikel</dt><dd>{p.name}</dd></div>
              <div><dt>Lager</dt><dd>{primaryWarehouse?.warehouseName || "—"}</dd></div>
              <div>
                <dt>{stockDialog === "unblock" ? "Gesperrt" : "Verfügbar"}</dt>
                <dd>{formatUnits(stockDialog === "unblock" ? gesperrt : p.stock?.available)}</dd>
              </div>
            </dl>

            <QuantityField
              id="inv-stock-qty"
              label="Menge"
              value={stockQty}
              onChange={setStockQty}
              disabled={stockBusy}
              autoFocus
              max={stockDialog === "block" ? (p.stock?.available ?? undefined)
                : stockDialog === "unblock" ? (gesperrt || undefined) : undefined}
              hint={stockDialog === "receipt"
                ? "Erhöht den physischen Bestand und wird als Wareneingang festgehalten."
                : stockDialog === "block"
                  ? "Die Einheiten bleiben physisch im Lager, stehen aber nicht mehr für Aufträge und Sendungen zur Verfügung."
                  : "Die Einheiten stehen danach wieder für Aufträge und Sendungen zur Verfügung."}
            />

            {stockDialog === "block" && (
              <div className="inv-field">
                <label className="field-label" htmlFor="inv-block-reason">Grund</label>
                <select id="inv-block-reason" className="field-select" value={stockReason}
                        onChange={(e) => setStockReason(e.target.value)} disabled={stockBusy}>
                  {BLOCK_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            )}

            <div className="inv-field">
              <label className="field-label" htmlFor="inv-stock-note">
                Notiz{stockDialog === "block" && stockReason === "other" ? " *" : " (optional)"}
              </label>
              <textarea id="inv-stock-note" className="field-textarea" rows={2} maxLength={500}
                        value={stockNote} onChange={(e) => setStockNote(e.target.value)} disabled={stockBusy} />
              {stockDialog === "block" && (
                <p className="inv-field-hint">
                  Grund und Notiz bleiben dauerhaft nachvollziehbar — auch nach der Freigabe.
                </p>
              )}
            </div>
          </>
        )}
      </InventoryDialog>

      <InventoryDialog
        open={shipOpen}
        onClose={() => setShipOpen(false)}
        title="Artikel versenden"
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setShipOpen(false)}>Abbrechen</button>
            <button type="button" className="btn btn-primary" onClick={versenden}>Versand vorbereiten</button>
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
