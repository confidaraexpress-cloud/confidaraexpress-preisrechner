import React, { useEffect, useState, useCallback } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, ListSkeleton } from "../../components/ui/StateView";
import { InventoryStatCard, InlineError } from "../../components/inventory/InventoryShared";
import { getInventoryOverview, getWarehouses, createWarehouse } from "../../api/inventoryApi";
import { formatUnits, inventoryErrorText } from "../../utils/inventoryView.mjs";

/* ── Lagerübersicht ──────────────────────────────────────────────────────────
   Operative Arbeitsfläche, kein Produktprospekt: sie zeigt ausschließlich
   Kennzahlen, die sich zuverlässig aus vorhandenen Daten aggregieren lassen.

   Bewusst KEIN „Lagerwert": eine Bewertung bräuchte Einstandspreise, die das
   System nicht führt. Eine aus Warenwerten hochgerechnete Zahl wäre eine
   Behauptung, keine Kennzahl.

   Der Einstieg ohne Lager ist Teil der Seite, nicht ein Sonderfall: ein Konto
   ohne Lager kann hier mit einem Klick sein Hauptlager anlegen — ohne dieses
   fehlte allen anderen Bereichen die Grundlage. */
export default function InventoryOverviewPage({ utility, onNavigate }) {
  const [stats, setStats] = useState(null);
  const [warehouses, setWarehouses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [o, w] = await Promise.all([getInventoryOverview(), getWarehouses({ limit: 5 })]);
      if (!o.ok) { setError(inventoryErrorText(await o.json().catch(() => null), "Die Lagerübersicht konnte nicht geladen werden.")); }
      else setStats(await o.json());
      if (w.ok) setWarehouses((await w.json()).warehouses || []);
      else setWarehouses([]);
    } catch {
      setError("Die Lagerübersicht konnte nicht geladen werden.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const anlegen = async () => {
    setCreating(true);
    setError("");
    try {
      const res = await createWarehouse({ name: "Hauptlager" });
      if (!res.ok) { setError(inventoryErrorText(await res.json().catch(() => null), "Das Lager konnte nicht angelegt werden.")); return; }
      await load();
    } catch { setError("Das Lager konnte nicht angelegt werden."); }
    finally { setCreating(false); }
  };

  const hatLager = Array.isArray(warehouses) && warehouses.length > 0;

  return (
    <div className="page-body">
      <PageHeader
        eyebrow="Lager & Aufträge"
        title="Lagerübersicht"
        subtitle="Bestand, Reservierungen und offene Aufträge auf einen Blick."
        utility={utility}
      />

      <InlineError text={error} onRetry={load} />

      {loading && <ListSkeleton rows={3} label="Lagerübersicht wird geladen" />}

      {!loading && !hatLager && (
        <EmptyState
          icon="layers"
          title="Noch kein Lager angelegt"
          text="Bestand, Artikel und Aufträge brauchen mindestens ein Lager. Legen Sie Ihr Hauptlager an — weitere Lager können Sie jederzeit ergänzen."
          action={
            <button type="button" className="btn btn-primary" onClick={anlegen} disabled={creating}>
              {creating ? "Wird angelegt …" : "Hauptlager anlegen"}
            </button>
          }
        />
      )}

      {!loading && hatLager && stats && (
        <>
          <div className="inv-stat-grid">
            <InventoryStatCard icon="cube"        label="Aktive Artikel"      value={formatUnits(stats.activeProducts)} />
            <InventoryStatCard icon="layers"      label="Verfügbare Einheiten" value={formatUnits(stats.availableUnits)} hint={`${formatUnits(stats.onHandUnits)} physisch im Lager`} />
            <InventoryStatCard icon="clock"       label="Reserviert"          value={formatUnits(stats.reservedUnits)} hint="Für offene Aufträge verplant" />
            <InventoryStatCard icon="info"        label="Niedriger Bestand"   value={formatUnits(stats.lowStockCount)} hint="Verfügbar unter Mindestbestand" tone={stats.lowStockCount > 0 ? "warn" : ""} />
            <InventoryStatCard icon="cart"        label="Offene Aufträge"     value={formatUnits(stats.openOrders)} />
            <InventoryStatCard icon="packageMove" label="Heute versendet"     value={formatUnits(stats.shippedToday)} hint="Einheiten aus dem Lager" />
          </div>

          {/* Genau drei Schnellaktionen — keine Aktionsflut. Jede führt auf einen
              Bereich, den die Sidebar ebenfalls kennt; hier ist sie der kurze Weg
              in den jeweiligen Anlegevorgang. */}
          <section className="ce-card inv-quick">
            <h2 className="inv-section-title">Schnellaktionen</h2>
            <div className="inv-quick-row">
              <button type="button" className="btn btn-primary" onClick={() => onNavigate("products")}>
                <Icon n="plus" s={16} />Artikel anlegen
              </button>
              <button type="button" className="btn btn-outline" onClick={() => onNavigate("stock")}>
                <Icon n="packageMove" s={16} />Bestand einbuchen
              </button>
              <button type="button" className="btn btn-outline" onClick={() => onNavigate("orders")}>
                <Icon n="cart" s={16} />Auftrag erstellen
              </button>
            </div>
          </section>

          <section className="ce-card inv-warehouses">
            <h2 className="inv-section-title">Lager</h2>
            <ul className="inv-warehouse-list">
              {warehouses.map((w) => (
                <li key={w.id} className="inv-warehouse-item">
                  <span className="inv-warehouse-name">{w.name}</span>
                  {w.isDefault && <span className="badge badge--info"><span className="badge-dot" aria-hidden="true" />Standard</span>}
                  {w.status === "inactive" && <span className="badge badge--neutral"><span className="badge-dot" aria-hidden="true" />Inaktiv</span>}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
