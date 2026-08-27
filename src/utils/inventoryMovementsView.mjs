/* ── Lager & Aufträge — Anzeigemodell der Bewegungen ─────────────────────────
   Herausgelöst aus inventoryView.mjs (Modularisierungs-Audit). Fachmodul der
   Bewegungsseite: Typen, Filterliste, Referenz- und Notizanzeige. Reine
   Abbildungen — keine API, kein React, kein Zustand.

   Die Regel „kein roher Backendwert im sichtbaren Text" gilt unverändert:
   unbekannte Typen laufen über statusFallback() und zeigen „Unbekannter
   Status"; der Rohwert steht höchstens im title-Attribut. */

import { statusFallback } from "./statusFallback.mjs";

// Reihenfolge = Reihenfolge im Filter. V1 erzeugt die ersten fünf; die drei
// übrigen sind bereits benannt, damit eine spätere Erweiterung nicht als
// „Unbekannter Typ" erscheint.
export const MOVEMENT_TYPES = Object.freeze([
  "RECEIPT", "SHIPMENT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE",
  "RETURN", "TRANSFER_IN", "TRANSFER_OUT",
]);

const MOVEMENT_LABELS = Object.freeze({
  RECEIPT: ["badge--success", "Wareneingang"],
  SHIPMENT: ["badge--info", "Versand"],
  ADJUSTMENT_IN: ["badge--neutral", "Korrektur Zugang"],
  ADJUSTMENT_OUT: ["badge--neutral", "Korrektur Abgang"],
  DAMAGE: ["badge--warning", "Bruch / Schwund"],
  RETURN: ["badge--neutral", "Rücknahme"],
  TRANSFER_IN: ["badge--neutral", "Umlagerung Zugang"],
  TRANSFER_OUT: ["badge--neutral", "Umlagerung Abgang"],
});

/** Rückgabe: [badgeKlasse, sichtbarerText, rohwertFuerTitle|null] */
export function movementTypeView(type) {
  const known = MOVEMENT_LABELS[type];
  return known ? [known[0], known[1], null] : statusFallback(type);
}

/**
 * Die Typen, die dieses Produkt HEUTE tatsächlich erzeugt.
 *
 * Belegt am Backend: `insertMovement()` (lib/inventory.js) ist der einzige
 * Schreiber und wird nur aus `goodsIn` (RECEIPT), `consume` (SHIPMENT) und der
 * Korrekturaktion (`adjustmentTypeFor` → ADJUSTMENT_IN/-OUT/DAMAGE) aufgerufen.
 * RETURN, TRANSFER_IN und TRANSFER_OUT sind benannt und in der CHECK-Bedingung
 * erlaubt, aber es gibt keinen Retouren- und keinen Umlagerungsvorgang — kein
 * Codepfad schreibt sie.
 *
 * Deshalb stehen sie NICHT im sichtbaren Filter: eine Filteroption, die
 * garantiert null Treffer liefert, behauptet eine Funktion, die es nicht gibt.
 * Ihre Beschriftung bleibt in MOVEMENT_LABELS — eine vorhandene Zeile wird
 * weiterhin korrekt benannt, nie als „Unbekannter Status" (siehe
 * movementTypeOptions).
 */
export const PRODUCIBLE_MOVEMENT_TYPES = Object.freeze([
  "RECEIPT", "SHIPMENT", "ADJUSTMENT_IN", "ADJUSTMENT_OUT", "DAMAGE",
]);

/**
 * Die Filterliste: die heute erzeugbaren Typen PLUS jeder Typ, der in den
 * geladenen Bewegungen tatsächlich vorkommt.
 *
 * Der zweite Teil ist der Schutz für Altdaten: läge im Bestand doch eine Zeile
 * eines vorbereiteten Typs (etwa aus einem manuellen Datenbankeingriff), wäre
 * sie sonst sichtbar, aber nicht filterbar. Historische Daten werden nicht
 * versteckt — die Option erscheint dann zusätzlich.
 *
 * Die Reihenfolge folgt immer MOVEMENT_TYPES, damit die Auswahlliste nicht je
 * nach Datenlage springt. Unbekannte Serverwerte werden NICHT aufgenommen: für
 * sie gibt es keine Beschriftung, und der Endpunkt lehnte sie ohnehin ab.
 */
export function movementTypeOptions(items) {
  const vorhanden = new Set();
  for (const m of items || []) {
    if (m && typeof m.type === "string" && MOVEMENT_LABELS[m.type]) vorhanden.add(m.type);
  }
  return MOVEMENT_TYPES.filter((t) => PRODUCIBLE_MOVEMENT_TYPES.includes(t) || vorhanden.has(t));
}

/**
 * Die Referenz einer Bewegung als Anzeigemodell — oder null, wenn keine da ist.
 *
 * Rückgabe: `{ kind, label, number, orderId }`. `number` ist die KUNDENSEITIGE
 * Nummer (CE-Bestellnummer beziehungsweise CE-AU…-Auftragsnummer), die der
 * Server auflöst. Die interne `referenceId` wird nie angezeigt — sie ist für
 * den Kunden bedeutungslos —, sondern höchstens als Linkziel verwendet.
 *
 * `orderId` ist nur bei einem Auftrag gesetzt: dafür existiert mit
 * `/inventory/orders/:id` eine echte Kundendetailseite. Für Sendungen gibt es
 * KEINE kundenseitige Detailroute und die Sendungsliste kennt keinen Filter —
 * deshalb bleibt eine Sendungsreferenz bewusst Text. Ein Link, der auf einer
 * ungefilterten Liste landet, wäre ein Versprechen, das die Seite nicht hält.
 */
export function movementReferenceView(movement) {
  const m = movement || {};
  if (m.referenceType !== "shipment" && m.referenceType !== "order") return null;
  const nummer = typeof m.referenceNumber === "string" && m.referenceNumber.trim()
    ? m.referenceNumber.trim() : null;
  if (m.referenceType === "order") {
    const id = m.referenceId != null && String(m.referenceId).trim() ? String(m.referenceId) : null;
    return { kind: "order", label: "Auftrag", number: nummer, orderId: id };
  }
  return { kind: "shipment", label: "Sendung", number: nummer, orderId: null };
}

/**
 * Die Notiz einer Bewegung — freier Zusatztext, NICHT der strukturierte Grund.
 * Beides wird getrennt gehalten: `reason` sagt, warum korrigiert wurde,
 * `note` ist, was jemand dazugeschrieben hat („Lieferschein 4711"). Fehlt sie,
 * gibt es keine leere Zeile: null bedeutet, dass nichts angezeigt wird.
 */
export function movementNote(movement) {
  const t = typeof movement?.note === "string" ? movement.note.trim() : "";
  return t || null;
}
