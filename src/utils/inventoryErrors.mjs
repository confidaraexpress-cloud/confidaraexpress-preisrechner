/* ── Lager & Aufträge — Fehlercode → Kundentext ──────────────────────────────
   Herausgelöst aus inventoryView.mjs (Modularisierungs-Audit). EINE
   Verantwortung: die Übersetzung der Backend-Vertragscodes in kundenseitigen
   Text. Bewusst bereichsübergreifend (Bestand, Artikel, Lager, Aufträge,
   Reservierungen) — der Vertrag ist es auch (lib/inventory.js). */

// Die Codes sind der Vertrag des Backends (lib/inventory.js). Die Texte hier
// sind die kundenseitige Übersetzung — ein Rohcode erscheint nie im UI.
const ERROR_TEXTS = Object.freeze({
  INSUFFICIENT_STOCK: "Dafür ist nicht genügend Bestand verfügbar.",
  PRODUCT_NOT_FOUND: "Der Artikel wurde nicht gefunden.",
  WAREHOUSE_NOT_FOUND: "Das Lager wurde nicht gefunden.",
  ORDER_NOT_FOUND: "Der Auftrag wurde nicht gefunden.",
  ORDER_NOT_SHIPPABLE: "Dieser Auftrag ist nicht mehr versandbereit.",
  INVALID_QUANTITY: "Bitte prüfen Sie Ihre Eingabe.",
  CONCURRENT_STOCK_CHANGE: "Der Bestand hat sich zwischenzeitlich geändert. Bitte erneut versuchen.",
  RESERVATION_NOT_FOUND: "Die Reservierung wurde nicht gefunden.",
  PRODUCT_SKU_DUPLICATE: "Diese SKU ist bereits vergeben.",
  WAREHOUSE_DUPLICATE: "Ein Lager mit diesem Namen existiert bereits.",
  LOCATION_DUPLICATE: "Dieser Lagerplatz existiert bereits.",
  DUPLICATE_ENTRY: "Dieser Eintrag existiert bereits.",
  INVENTORY_RATE_LIMITED: "Zu viele Vorgänge in kurzer Zeit. Bitte einen Moment warten.",
  // Eigener Satz: hier fehlt GESPERRTER Bestand, nicht verfügbarer.
  INSUFFICIENT_BLOCKED_STOCK: "Es ist weniger Bestand gesperrt, als Sie freigeben möchten.",
  // Auftrags-Race (Finding 2): eine Reservierung dieses Auftrags wird gerade
  // exklusiv für eine laufende Buchung gehalten — kein Bestandsfehler, sondern ein
  // zeitlicher Konflikt. Betrifft POST /api/kunde/orders/:id/cancel.
  ORDER_RESERVATION_IN_USE: "Für diesen Auftrag wird gerade eine Sendung gebucht. Bitte versuchen Sie es in Kürze erneut.",
  // ── Paritätsaudit 2026-10-15 (Backend #432) ──
  // BI1: der Auftrag existiert, ist aber schon vollständig versendet (vorher „nicht gefunden“).
  ORDER_ALREADY_SHIPPED: "Dieser Auftrag ist bereits vollständig versendet und kann nicht mehr storniert werden.",
  // BI2: Grundsatz ohne Artikelangabe; mit SKU aus `details` baut productInactiveText den Satz.
  PRODUCT_INACTIVE: "Ein Artikel dieses Auftrags ist nicht mehr aktiv und kann nicht beauftragt werden.",
  // Mehrlagerregeln (BI9): inaktive Lager nehmen keine Buchung an und werden nie Standardlager.
  WAREHOUSE_INACTIVE: "Das Lager ist inaktiv. In ein inaktives Lager wird nichts gebucht, und es kann nicht Standardlager sein — bitte aktivieren Sie es zuerst.",
  WAREHOUSE_DEFAULT_REQUIRED: "Das Standardlager kann nicht deaktiviert oder abgewählt werden. Legen Sie zuerst ein anderes aktives Lager als Standard fest.",
  // Grundsatz; die Mengen aus `details` ergänzt warehouseNotEmptyText.
  WAREHOUSE_NOT_EMPTY: "Das Lager kann erst deaktiviert werden, wenn es leer ist.",
  // ── Artikel löschen (v2.91, Backend lib/inventory.js deleteProduct) ──
  PRODUCT_IN_USE: "Der Artikel ist für offene Aufträge oder eine laufende Sendung reserviert. Versenden oder stornieren Sie diese zuerst.",
  PRODUCT_STOCK_BLOCKED: "Ein Teil des Bestands ist gesperrt. Heben Sie die Sperre unter „Bestand“ auf, bevor Sie den Artikel löschen.",
  PRODUCT_HAS_STOCK: "Der Artikel hat noch Bestand. Bestätigen Sie die Ausbuchung, um ihn zu löschen.",
  PRODUCT_BUSY: "Der Artikel wird gerade von einem anderen Vorgang verwendet. Bitte versuchen Sie es gleich noch einmal.",
  // ── Artikel- und Bestandsimport (Backend lib/inventoryImport.js) ──
  STOCK_CHANGED: "Der Bestand hat sich seit der Vorschau geändert. Bitte prüfen Sie die Zeile erneut.",
  IMPORT_UPLOAD_INVALID: "Die Importdaten konnten nicht übertragen werden. Bitte wählen Sie die Datei erneut.",
  IMPORT_DOCUMENT_INVALID: "Die Importdaten sind unvollständig. Bitte wählen Sie die Datei erneut.",
  IMPORT_TOO_LARGE: "Die Importdaten sind zu groß. Bitte teilen Sie die Datei auf.",
  IMPORT_TOO_MANY_ROWS: "Die Datei hat mehr als 10.000 Datenzeilen. Bitte teilen Sie sie auf.",
  IMPORT_NOT_FOUND: "Der Import wurde nicht gefunden.",
  IMPORT_ALREADY_OPEN: "Ein Import wird gerade übernommen. Bitte setzen Sie ihn fort oder schließen Sie ihn ab.",
  IMPORT_EXPIRED: "Die Vorschau ist abgelaufen. Bitte lassen Sie die Datei erneut prüfen.",
  IMPORT_STATE_CONFLICT: "Dieser Import wurde inzwischen ersetzt oder abgeschlossen.",
  IMPORT_CONFIRMATION_REQUIRED: "Bitte bestätigen Sie die Übernahme.",
  IMPORT_INVALID_ROWS_CONFIRMATION_REQUIRED: "Bitte bestätigen Sie, dass die fehlerhaften Zeilen übersprungen werden.",
  IMPORT_REPEAT_CONFIRMATION_REQUIRED: "Diese Wareneingänge wurden bereits gebucht. Bitte bestätigen Sie die erneute Buchung ausdrücklich.",
  IMPORT_RETRY: "Der Abschnitt wurde wegen einer gleichzeitigen Änderung nicht übernommen. Bitte fortsetzen.",
  IMPORT_RATE_LIMITED: "Zu viele Importvorgänge in kurzer Zeit. Bitte einen Moment warten.",
});

const ganzeZahl = (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
const einheiten = (n) => `${n} ${n === 1 ? "Einheit" : "Einheiten"}`;

// WAREHOUSE_NOT_EMPTY: nennt, was die Deaktivierung verhindert — nur Angaben über null.
function warehouseNotEmptyText(details) {
  const d = details && typeof details === "object" ? details : {};
  const teile = [];
  const bestand = ganzeZahl(d.onHand), gesperrt = ganzeZahl(d.blocked), reserviert = ganzeZahl(d.reserved);
  const auftraege = ganzeZahl(d.openOrders);
  // Gesperrter und reservierter Bestand sind TEIL des Bestands (Server: available = on_hand − reserved − blocked).
  if (bestand) {
    const davon = [gesperrt ? `${gesperrt} gesperrt` : null, reserviert ? `${reserviert} reserviert` : null].filter(Boolean);
    teile.push(`${einheiten(bestand)} Bestand${davon.length ? ` (davon ${davon.join(", ")})` : ""}`);
  }
  // Offene Reservierungen nur, wenn der reservierte Bestand sie nicht schon nennt.
  const reservierungen = ganzeZahl(d.openReservations);
  if (reservierungen && !reserviert) {
    teile.push(`${reservierungen} ${reservierungen === 1 ? "offene Reservierung" : "offene Reservierungen"}`);
  }
  if (auftraege) teile.push(`${auftraege} ${auftraege === 1 ? "offener Auftrag" : "offene Aufträge"}`);
  const grund = ERROR_TEXTS.WAREHOUSE_NOT_EMPTY;
  return teile.length ? `${grund} Noch vorhanden: ${teile.join(", ")}.` : grund;
}

// Die Zahl gehört in den Satz (BI4): der Server liefert sie bei Sperre und Freigabe
// ausdrücklich mit. Ohne verwertbare Zahl bleibt der Grundsatz.
function detailText(code, details) {
  const d = details && typeof details === "object" ? details : {};
  if (code === "INSUFFICIENT_STOCK") {
    const verfuegbar = ganzeZahl(d.available);
    if (verfuegbar !== null) return `${ERROR_TEXTS.INSUFFICIENT_STOCK} Verfügbar ${verfuegbar === 1 ? "ist" : "sind"} nur ${einheiten(verfuegbar)}.`;
  }
  if (code === "INSUFFICIENT_BLOCKED_STOCK") {
    const gesperrt = ganzeZahl(d.blocked);
    if (gesperrt !== null) return `${ERROR_TEXTS.INSUFFICIENT_BLOCKED_STOCK} Gesperrt ${gesperrt === 1 ? "ist" : "sind"} ${einheiten(gesperrt)}.`;
  }
  if (code === "PRODUCT_INACTIVE") {
    const sku = typeof d.sku === "string" && d.sku.trim() ? d.sku.trim() : null;
    if (sku) return `Der Artikel „${sku}“ ist nicht mehr aktiv und kann nicht beauftragt werden. Bitte entfernen Sie ihn aus dem Auftrag.`;
  }
  if (code === "WAREHOUSE_NOT_EMPTY") return warehouseNotEmptyText(d);
  return null;
}

/* ── Feldfehler (Eingabe-Audit A6, 2026-11-03) ─────────────────────────────────────────────────
   INVALID_QUANTITY ist der Sammelcode JEDER Feldprüfung des Lagerbereichs (Artikel, Aufträge, Bestand,
   Lager); der Grund steht in `error` als „<feld>: <grund>“ bzw. „recipient.<feld>: <grund>“. Bisher zeigte die
   Oberfläche dafür nur „Bitte prüfen Sie Ihre Eingabe.“ — welches Feld und welche Grenze, blieb offen. Jetzt:
   Feldname in Kundensprache plus der Grund des Servers (deutscher Klartext). Ein unbekanntes Feld fällt auf den
   bisherigen Satz zurück; ein technischer Feldname erscheint nie. */
const FELD_TEXT = Object.freeze({
  sku: "Artikelnummer (SKU)", name: "Bezeichnung", ean: "EAN", description: "Beschreibung", weightKg: "Gewicht",
  lengthCm: "Länge", widthCm: "Breite", heightCm: "Höhe", unitValue: "Warenwert", hsCode: "Zolltarifnummer",
  countryOfOrigin: "Ursprungsland", customsDescription: "Zollbeschreibung", minStock: "Mindestbestand",
  customerReference: "Kundenreferenz", notes: "Notiz", note: "Notiz", quantity: "Menge", countedQuantity: "Gezählter Bestand",
  company: "Firma", firstName: "Vorname", lastName: "Nachname", fullName: "Name", streetAndNumber: "Straße und Hausnummer",
  addressAddition: "Adresszusatz", postalCode: "PLZ", city: "Ort", country: "Land", phone: "Telefon", email: "E-Mail",
});
const FELDFEHLER_RE = /^(recipient\.)?([A-Za-z]+):\s*(.+)$/;

// „max. 35 Zeichen“ → „höchstens 35 Zeichen“; technische Dezimalpunkte der Bereichsgrenzen („0.001“) → „0,001“.
// Tausenderpunkte wie in „1.000.000“ bleiben unberührt.
function feldGrund(grund) {
  return grund
    .replace(/\bmax\. (\d+) Zeichen\b/g, "höchstens $1 Zeichen")
    .replace(/\b0\.(\d+)/g, "0,$1");
}

/** INVALID_QUANTITY-Antwort → { field, text } in Kundensprache — oder null. */
export function inventoryFieldError(body) {
  if (!body || body.code !== "INVALID_QUANTITY" || typeof body.error !== "string") return null;
  const m = body.error.trim().match(FELDFEHLER_RE);
  if (!m || !FELD_TEXT[m[2]]) return null;
  const partei = m[1] ? " (Empfänger)" : "";
  return { field: m[2], text: `${FELD_TEXT[m[2]]}${partei}: ${feldGrund(m[3])}` };
}

/**
 * Fehlerantwort → kundenseitiger Text.
 * Bevorzugt den bekannten Code (bei Bestand, Sperre, inaktivem Artikel und vollem
 * Lager ergänzt um die Angaben aus `details`); ein unbekannter Code fällt auf den
 * Servertext zurück, und erst danach auf einen neutralen Satz. Der Code selbst
 * erscheint nie im sichtbaren Text.
 */
export function inventoryErrorText(body, fallback = "Der Vorgang konnte nicht ausgeführt werden.") {
  const code = body && typeof body.code === "string" ? body.code : null;
  const feld = inventoryFieldError(body);
  if (feld) return feld.text;
  const known = code ? ERROR_TEXTS[code] : null;
  if (known) return detailText(code, body.details) || known;
  if (body && typeof body.error === "string" && body.error.trim()) return body.error.trim();
  return fallback;
}
