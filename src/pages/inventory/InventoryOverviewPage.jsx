import React, { useEffect, useState, useCallback } from "react";
import { PageHeader } from "../../components/ui/PageHeader";
import { Icon } from "../../components/ui/Icon";
import { EmptyState, ListSkeleton } from "../../components/ui/StateView";
import { InventoryStatCard, InventoryPreviewList, InventoryDialog, InlineError } from "../../components/inventory/InventoryShared";
import { getInventoryOverview, getWarehouses, createWarehouse } from "../../api/inventoryApi";
import {
  formatUnits, inventoryErrorText, OVERVIEW_METRICS, overviewMetric,
  overviewPreviewRows, isInventoryEmpty,
} from "../../utils/inventoryView.mjs";

/* ── Lagerübersicht ──────────────────────────────────────────────────────────
   Operative Arbeitsfläche, kein Produktprospekt: sie zeigt ausschließlich
   Kennzahlen, die sich zuverlässig aus vorhandenen Daten aggregieren lassen.

   Bewusst KEIN „Lagerwert": eine Bewertung bräuchte Einstandspreise, die das
   System nicht führt. Eine aus Warenwerten hochgerechnete Zahl wäre eine
   Behauptung, keine Kennzahl.

   Jede Kennzahl ist aufklappbar. Das ist der eigentliche Zweck der Seite: aus
   „Reserviert: 17" wird mit einem Klick „welche 17 Einheiten, welche Artikel,
   für welche Aufträge". Die Vorschau ist dabei immer nur ein Ausschnitt — die
   vollständige Liste zeigt die zuständige Seite, nicht der Dialog.

   Alles kommt aus EINER Antwort (`/inventory/overview`): Zahlen und Vorschauen
   zusammen. Deshalb flackern nicht sechs Karten einzeln, und deshalb gibt es
   hier keinen Nachladepfad je Kennzahl.

   Der Einstieg ohne Lager ist Teil der Seite, nicht ein Sonderfall: ein Konto
   ohne Lager kann hier mit einem Klick sein Hauptlager anlegen — ohne dieses
   fehlte allen anderen Bereichen die Grundlage. */
export default function InventoryOverviewPage({ utility, onNavigate, onNewShipment }) {
  const [stats, setStats] = useState(null);
  const [warehouses, setWarehouses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  // Welche Kennzahl ist aufgeklappt? Reiner UI-Zustand dieser Seite.
  const [openMetric, setOpenMetric] = useState(null);

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
  const previews = stats?.previews || null;
  // „Praktisch leeres Lager" = kein Artikel. Ohne Artikel führt jeder weitere
  // Schritt ins Leere; die Regel steht in inventoryView.mjs, nicht hier.
  const leer = isInventoryEmpty(stats);

  const dialogMetric = openMetric ? overviewMetric(openMetric) : null;
  const dialogRows = dialogMetric ? overviewPreviewRows(dialogMetric.key, previews) : [];

  const zuBereich = (metric) => {
    setOpenMetric(null);
    onNavigate(metric.target, metric.targetFilter || null);
  };

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
          {/* Die Kennzahlen bleiben in JEDEM Zustand sichtbar — auch bei sechs
              Nullen. Sie sind der Rahmen der Seite; das Onboarding steht
              darunter, nicht an ihrer Stelle. */}
          <div className="inv-stat-grid">
            {OVERVIEW_METRICS.map((m) => {
              const wert = stats[m.key];
              // Aufklappbar nur, wenn es auch etwas zu zeigen gibt: eine Karte,
              // die einen leeren Dialog öffnet, wäre ein gebrochenes Versprechen.
              const zeilen = overviewPreviewRows(m.key, previews);
              const klickbar = zeilen.length > 0;
              return (
                <InventoryStatCard
                  key={m.key}
                  icon={m.icon}
                  label={m.label}
                  value={formatUnits(wert)}
                  hint={m.hint}
                  tone={m.tone && Number(wert) > 0 ? m.tone : ""}
                  onClick={klickbar ? () => setOpenMetric(m.key) : undefined}
                  detailLabel={klickbar ? `${m.label}: ${formatUnits(wert)} — Details anzeigen` : undefined}
                />
              );
            })}
          </div>

          {/* Zwei Zustände, ein Platz.

              Eingerichtetes Lager: drei Schnellaktionen — keine Aktionsflut. Jede
              führt auf einen Bereich, den die Sidebar ebenfalls kennt; hier ist
              sie der kurze Weg in den jeweiligen Anlegevorgang. Darunter die
              operativen Hinweise.

              Leeres Lager: EINE Karte, der Einstieg. Bewusst KEINE zweite
              Schnellaktionskarte darüber — sie trüge exakt denselben primären
              Knopf („Ersten Artikel anlegen") wie der Einstieg, zwei Zentimeter
              darüber. Zwei identische Hauptaktionen nebeneinander sind kein
              Angebot, sondern eine Dopplung. „Bestand einbuchen" und „Auftrag
              erstellen" brauchen beide einen Artikel und würden ohnehin nur
              abgeschaltet dastehen; sie erscheinen, sobald es einen gibt. */}
          {leer ? <InventoryOnboarding onStart={() => onNavigate("products")} onNewShipment={onNewShipment} /> : (
            <>
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
              <OperationalPanels
                previews={previews}
                onOpen={(key) => setOpenMetric(key)}
                onNavigate={onNavigate}
              />
            </>
          )}

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

      {/* Der Aufklappdialog nutzt den bestehenden Dialogmechanismus: Fokusfalle,
          Fokusrückgabe und Escape kommen von dort. Kein zweites Detailpanel und
          keine rechte Zusatzleiste. */}
      <InventoryDialog
        open={!!dialogMetric}
        onClose={() => setOpenMetric(null)}
        title={dialogMetric ? dialogMetric.dialogTitle : ""}
        size="md"
        footer={dialogMetric && (
          <button type="button" className="btn btn-primary" onClick={() => zuBereich(dialogMetric)}>
            {dialogMetric.linkLabel}
            <Icon n="chevronRight" s={16} />
          </button>
        )}
      >
        {dialogMetric && (
          <>
            <p className="inv-preview-lead">{dialogMetric.dialogLead}</p>
            <InventoryPreviewList rows={dialogRows} emptyText={dialogMetric.emptyText} />
            {/* Ehrlich über den Ausschnitt: die Zahl oben ist die Gesamtmenge,
                die Liste zeigt nur die ersten Einträge. Ohne diesen Satz läse
                sich eine gekürzte Liste wie eine vollständige. */}
            {dialogRows.length > 0 && (
              <p className="inv-preview-note">
                Vorschau der ersten {dialogRows.length} Einträge.
              </p>
            )}
          </>
        )}
      </InventoryDialog>
    </div>
  );
}

/* ── Einstieg für ein noch leeres Lager ──
   Eine Karte, drei Schritte, eine Hauptaktion — kein Tutorial, keine Tour.
   Der dezente zweite Weg ist wichtig: die Lagerverwaltung ist eine ERWEITERUNG,
   kein Pflichtweg. Wer nur versenden will, muss hier wieder herausfinden. */
function InventoryOnboarding({ onStart, onNewShipment }) {
  return (
    <section className="ce-card inv-onboarding">
      <h2 className="inv-section-title">Lagerverwaltung starten</h2>
      <p className="inv-onboarding-lead">
        Hinterlegen Sie häufig versendete Artikel, verwalten Sie Bestände und erstellen Sie daraus
        Sendungen — ohne dieselben Warenangaben jedes Mal neu einzugeben.
      </p>
      <ol className="inv-steps">
        <li className="inv-step">
          <span className="inv-step-num" aria-hidden="true">1</span>
          <span className="inv-step-text">
            <span className="inv-step-title">Artikel anlegen</span>
            <span className="inv-step-hint">Bezeichnung, Gewicht und optional Zollangaben — einmalig.</span>
          </span>
        </li>
        <li className="inv-step">
          <span className="inv-step-num" aria-hidden="true">2</span>
          <span className="inv-step-text">
            <span className="inv-step-title">Bestand einbuchen</span>
            <span className="inv-step-hint">Wie viele Einheiten liegen bei Ihnen im Lager?</span>
          </span>
        </li>
        <li className="inv-step">
          <span className="inv-step-num" aria-hidden="true">3</span>
          <span className="inv-step-text">
            <span className="inv-step-title">Direkt versenden oder Auftrag erstellen</span>
            <span className="inv-step-hint">Die Warenangaben übernimmt der Versand automatisch.</span>
          </span>
        </li>
      </ol>
      <div className="inv-onboarding-actions">
        <button type="button" className="btn btn-primary" onClick={onStart}>
          <Icon n="plus" s={16} />Ersten Artikel anlegen
        </button>
        {onNewShipment && (
          <button type="button" className="btn btn-link" onClick={onNewShipment}>
            Neue Sendung ohne Lager
            <Icon n="chevronRight" s={14} />
          </button>
        )}
      </div>
    </section>
  );
}

/* ── Operative Hinweise bei eingerichtetem Lager ──
   Genau die zwei Listen, die eine Handlung auslösen können. Beide stammen aus
   Vorschauen, die die Übersichtsantwort ohnehin mitliefert — es entsteht kein
   zusätzlicher Aufruf. Ein Bereich ohne Einträge erscheint gar nicht: eine
   leere Karte „Niedrige Bestände" wäre Platzverbrauch ohne Aussage. */
function OperationalPanels({ previews, onOpen, onNavigate }) {
  const niedrig = overviewPreviewRows("lowStockCount", previews).slice(0, 3);
  const auftraege = overviewPreviewRows("openOrders", previews).slice(0, 3);
  if (niedrig.length === 0 && auftraege.length === 0) return null;

  return (
    <div className="inv-ops-grid">
      {niedrig.length > 0 && (
        <section className="ce-card inv-ops">
          <div className="inv-ops-head">
            <h2 className="inv-section-title">Niedrige Bestände</h2>
            <button type="button" className="btn btn-link btn-sm" onClick={() => onOpen("lowStockCount")}>
              Details
            </button>
          </div>
          <InventoryPreviewList rows={niedrig} emptyText="" />
          <button type="button" className="btn btn-link btn-sm inv-ops-all" onClick={() => onNavigate("stock", "low")}>
            Alle anzeigen<Icon n="chevronRight" s={14} />
          </button>
        </section>
      )}
      {auftraege.length > 0 && (
        <section className="ce-card inv-ops">
          <div className="inv-ops-head">
            <h2 className="inv-section-title">Offene Aufträge</h2>
            <button type="button" className="btn btn-link btn-sm" onClick={() => onOpen("openOrders")}>
              Details
            </button>
          </div>
          <InventoryPreviewList rows={auftraege} emptyText="" />
          <button type="button" className="btn btn-link btn-sm inv-ops-all" onClick={() => onNavigate("orders", "open")}>
            Alle anzeigen<Icon n="chevronRight" s={14} />
          </button>
        </section>
      )}
    </div>
  );
}
