/* ── Lager & Aufträge — Fassade des Anzeigemodells ───────────────────────────
   Modularisierungs-Audit: der frühere 780-Zeilen-Sammelbau ist in sieben
   Fachmodule zerlegt; diese Datei ist die unveränderte ÖFFENTLICHE API. Alle
   zehn Konsumenten (Inventory-Seiten, Versandformular, Auftragsdialog) und
   alle Testsuiten importieren weiter von hier — kein Importpfad, kein Name und
   kein Verhalten hat sich geändert.

   Die Fassade re-exportiert AUSSCHLIESSLICH die bisher öffentlichen Namen.
   Interne Bausteine der Module (z. B. `zahlOderNull` aus inventoryFormat.mjs)
   werden bewusst NICHT weitergereicht — die API-Oberfläche dieses Moduls ist
   exakt die alte.

   Wer eine Funktion ÄNDERT, arbeitet im Fachmodul daneben:
     inventoryFormat.mjs          Zahlen-, Mengen- und Datumsformate
     inventoryOrdersView.mjs      Auftragsstatus, Versandbereitschaft, Zeile
     inventoryMovementsView.mjs   Bewegungstypen, Filter, Referenz, Notiz
     inventoryStockView.mjs       Mindestbestand, Vorschauen, Gründe, Sperren
     inventoryShipmentHandoff.mjs Lagerbezug + Prefill in den Versandprozess
     inventoryOverviewView.mjs    Kennzahlen der Lagerübersicht
     inventoryErrors.mjs          Backend-Fehlercode → Kundentext
     inventoryProductSections.mjs optionale Abschnitte des Artikelformulars

   Neue Konsumenten dürfen direkt aus dem Fachmodul importieren; die Fassade
   bleibt für die Bestandskonsumenten stehen. */

export { orderStatusView, isOrderShippable, orderSummary } from "./inventoryOrdersView.mjs";

export {
  MOVEMENT_TYPES,
  movementTypeView,
  PRODUCIBLE_MOVEMENT_TYPES,
  movementTypeOptions,
  movementReferenceView,
  movementNote,
} from "./inventoryMovementsView.mjs";

export {
  signedQuantity,
  formatUnits,
  formatKg,
  positionLabel,
  unitLabel,
  dateShort,
  dateTimeShort,
} from "./inventoryFormat.mjs";

export {
  isLowStock,
  stockLevelView,
  lowStockInfo,
  receiptPreview,
  adjustmentPreview,
  ADJUSTMENT_REASONS,
  adjustmentReasonLabel,
  BLOCK_REASONS,
  blockReasonLabel,
  blockEntryView,
} from "./inventoryStockView.mjs";

export {
  normalizeInventoryContext,
  inventoryOriginNotice,
  mapOrderPrefillToShipment,
  mapProductToShipment,
} from "./inventoryShipmentHandoff.mjs";

export { inventoryErrorText } from "./inventoryErrors.mjs";

export {
  OVERVIEW_METRICS,
  overviewMetric,
  overviewPreviewRows,
  isInventoryEmpty,
} from "./inventoryOverviewView.mjs";

export { SECTION_FIELDS, sectionHasData } from "./inventoryProductSections.mjs";
