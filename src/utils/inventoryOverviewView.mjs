/* ── Lager & Aufträge — Kennzahlen der Lagerübersicht ────────────────────────
   Herausgelöst aus inventoryView.mjs (Modularisierungs-Audit). Fachmodul der
   Übersichtsseite: EINE Quelle für Beschriftung, Erklärung, Vorschau und Ziel
   jeder Kennzahl. Die Seite selbst enthält deshalb keinen einzigen
   Kennzahlentext. Reine Abbildungen — keine API, kein React, kein Zustand.

   Sprachregel (Auftrag §1, §26): ConfidaraExpress hat Großhändler, Maschinenbauer,
   Handwerksbetriebe und Kanzleien als Kunden — nicht nur Onlineshops. Deshalb
   überall „Artikel", „Bestand", „Auftrag", „Empfänger", „Sendung" und nirgends
   Lagerfachjargon oder Shopvokabular.

   Verbindlich: `previewKey` MUSS dieselbe Menge beschreiben wie `key`. Eine Zahl,
   hinter der beim Aufklappen etwas anderes steht, ist schlimmer als gar kein
   Detail — der Nutzer zöge daraus falsche Schlüsse und merkte es nicht. Der
   Backendtest inventory-overview-previews.test.js prüft genau diese Paarung. */

import { zahlOderNull, formatUnits, positionLabel, dateTimeShort } from "./inventoryFormat.mjs";

export const OVERVIEW_METRICS = Object.freeze([
  {
    key: "activeProducts", previewKey: "activeProducts", icon: "cube",
    label: "Aktive Artikel", hint: "Im Sortiment geführt",
    dialogTitle: "Aktive Artikel",
    // Der Satz beantwortet die Frage, die die Zahl offen lässt.
    dialogLead: "Zuletzt angelegte Artikel Ihres Sortiments.",
    emptyText: "Noch keine aktiven Artikel angelegt.",
    linkLabel: "Alle aktiven Artikel anzeigen", target: "products",
  },
  {
    key: "availableUnits", previewKey: "availableProducts", icon: "layers",
    label: "Verfügbare Einheiten", hint: "Frei disponierbar",
    dialogTitle: "Verfügbare Einheiten",
    dialogLead: "Artikel mit dem meisten frei verfügbaren Bestand.",
    emptyText: "Aktuell ist kein Bestand verfügbar.",
    linkLabel: "Gesamten Bestand anzeigen", target: "stock",
  },
  {
    key: "reservedUnits", previewKey: "reservedItems", icon: "clock",
    label: "Reservierte Einheiten", hint: "Für offene Aufträge vorgemerkt",
    dialogTitle: "Reservierte Einheiten",
    // Der wichtigste Erklärsatz der ganzen Seite: „reserviert" ist sonst abstrakt.
    dialogLead: "Diese Einheiten liegen physisch im Lager, sind aber bereits für offene Aufträge eingeplant.",
    emptyText: "Aktuell ist nichts reserviert.",
    linkLabel: "Alle offenen Aufträge anzeigen", target: "orders",
  },
  {
    key: "lowStockCount", previewKey: "lowStockProducts", icon: "info",
    label: "Artikel mit niedrigem Bestand", hint: "Unter eingestelltem Mindestbestand",
    dialogTitle: "Artikel mit niedrigem Bestand",
    dialogLead: "Verfügbarer Bestand unter dem von Ihnen eingestellten Mindestbestand.",
    emptyText: "Kein Artikel liegt unter seinem Mindestbestand.",
    linkLabel: "Alle betroffenen Artikel anzeigen", target: "stock", targetFilter: "low",
    tone: "warn",
  },
  {
    key: "openOrders", previewKey: "openOrders", icon: "cart",
    label: "Offene Aufträge", hint: "Noch nicht vollständig versendet",
    dialogTitle: "Offene Aufträge",
    dialogLead: "Aufträge, aus denen noch etwas zu versenden ist.",
    emptyText: "Es gibt keine offenen Aufträge.",
    linkLabel: "Alle offenen Aufträge anzeigen", target: "orders", targetFilter: "open",
  },
  {
    key: "shippedToday", previewKey: "shippedToday", icon: "packageMove",
    label: "Heute versendet", hint: "Einheiten aus dem Lager",
    dialogTitle: "Heute versendet",
    dialogLead: "Heute aus dem Lager ausgebuchte Einheiten.",
    emptyText: "Heute wurde noch nichts aus dem Lager versendet.",
    linkLabel: "Alle heutigen Bewegungen anzeigen", target: "movements", targetFilter: "shipmentsToday",
  },
]);

/** Die Kennzahl zu einem Schlüssel — oder null. Kein Raten über Reihenfolge. */
export function overviewMetric(key) {
  return OVERVIEW_METRICS.find((m) => m.key === key) || null;
}

function text(v) {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Vorschaueinträge → einheitliche Anzeigezeilen.
 *
 * Rückgabe je Zeile: { id, primary, secondary, meta, value }
 *   primary   — was es ist (Artikel- oder Auftragsbezeichnung)
 *   secondary — die Einordnung (SKU, Empfänger, Lager)
 *   meta      — der Bezug, NUR wenn er wirklich existiert (Auftrag, Sendung)
 *   value     — die Zahl, die zur Kennzahl beiträgt
 *
 * Alle Werte kommen unverändert aus der Antwort. Hier wird nichts gerechnet und
 * nichts ergänzt: fehlt ein Auftragsbezug, bleibt das Feld leer, statt einen zu
 * behaupten (Auftrag §13).
 */
export function overviewPreviewRows(metricKey, previews) {
  const metric = overviewMetric(metricKey);
  if (!metric) return [];
  const liste = previews && Array.isArray(previews[metric.previewKey]) ? previews[metric.previewKey] : [];

  return liste.map((e, i) => {
    switch (metricKey) {
      case "activeProducts":
        return {
          id: e.productId || `p${i}`,
          primary: text(e.name) || "—",
          secondary: text(e.sku) ? `SKU: ${e.sku}` : null,
          meta: null,
          value: `${formatUnits(e.available)} verfügbar`,
        };
      case "availableUnits":
        return {
          id: e.productId || `a${i}`,
          primary: text(e.name) || "—",
          secondary: text(e.sku) ? `SKU: ${e.sku}` : null,
          meta: null,
          value: `${formatUnits(e.available)} verfügbar`,
        };
      case "reservedUnits":
        return {
          id: e.reservationId || `r${i}`,
          primary: text(e.name) || "—",
          secondary: text(e.sku) ? `SKU: ${e.sku}` : null,
          // Eine Reservierung ohne Auftrag gehört zu einem laufenden
          // Direktversand — dann steht dort bewusst nichts.
          meta: text(e.orderNumber) ? `Auftrag ${e.orderNumber}` : null,
          value: `${formatUnits(e.quantity)} reserviert`,
        };
      case "lowStockCount":
        return {
          id: `${e.productId || i}-${e.warehouseName || ""}`,
          primary: text(e.name) || "—",
          secondary: text(e.sku) ? `SKU: ${e.sku}` : null,
          // Das Lager gehört dazu: derselbe Artikel kann in zwei Lagern liegen
          // und dann zweimal zählen — ohne Lagername wäre das unerklärlich.
          meta: text(e.warehouseName),
          value: `${formatUnits(e.available)} von ${formatUnits(e.minStock)} — ${formatUnits(e.missing)} fehlen`,
        };
      case "openOrders":
        return {
          id: e.orderId || `o${i}`,
          primary: text(e.orderNumber) || "—",
          secondary: text(e.recipientCompany) || text(e.recipientName),
          meta: text(e.createdAt) ? dateTimeShort(e.createdAt) : null,
          value: positionLabel(e.itemCount),
        };
      case "shippedToday":
        return {
          id: e.movementId || `m${i}`,
          primary: text(e.name) || "—",
          secondary: text(e.shipmentNumber) ? `Sendung ${e.shipmentNumber}` : null,
          meta: text(e.orderNumber) ? `Auftrag ${e.orderNumber}` : null,
          value: `${formatUnits(e.quantity)} Einheiten`,
        };
      default:
        return null;
    }
  }).filter(Boolean);
}

/**
 * Ist das Lager praktisch noch leer?
 *
 * Auslöser bewusst „kein Artikel" (Auftrag §18): ohne Artikel führt jeder
 * weitere Schritt ins Leere — Bestand einbuchen und Auftrag erstellen brauchen
 * beide einen Artikel. Ein Konto MIT Artikeln, aber ohne Bestand, bekommt kein
 * Onboarding mehr: dort ist der nächste Schritt offensichtlich.
 *
 * Solange nichts geladen ist (`stats == null`), gilt das Lager als eingerichtet —
 * sonst blitzt beim ersten Rendern das Onboarding auf. Dieselbe Regel wie
 * hasOperationalData() auf der Kundenübersicht.
 */
export function isInventoryEmpty(stats) {
  if (!stats) return false;
  return zahlOderNull(stats.activeProducts) === 0;
}
