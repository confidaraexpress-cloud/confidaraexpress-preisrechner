// Artikel löschen (Betreiberentscheidungen 2026-10-30, Canonical v2.91 G1/G2) — reine Ansichtslogik des Löschdialogs,
// ohne React, damit sie ohne DOM prüfbar bleibt.
//
// Der Dialog entscheidet nichts selbst. Quelle ist die Prüfung des Servers (GET /api/kunde/products/:id/deletion-check,
// dieselbe Regel wie DELETE): „free“ löschbar, „stock“ löschbar nach ausdrücklicher Ausbuchung, „blocked“ und „in_use“
// nicht löschbar — mit Erklärung und Weg. Bei Bestand schickt der Dialog genau die angezeigten Mengen je Lager als
// Bestätigung mit; weicht der Bestand inzwischen ab, lehnt der Server ab, und der Dialog prüft neu. Nie wird eine
// Reservierung aufgehoben oder Bestand ohne Bestätigung ausgebucht.

import { formatUnits } from "./inventoryFormat.mjs";
import { inventoryErrorText } from "./inventoryErrors.mjs";

export const LOESCH_TEXT = Object.freeze({
  titel: "Artikel löschen",
  laden: "Löschung wird geprüft …",
  endgueltig: "Der Artikel wird endgültig gelöscht und kann nicht wiederhergestellt werden. Die Artikelnummer ist danach wieder frei.",
  historie: "Bewegungen, Aufträge, Sendungen und Lieferscheine behalten ihre Angaben.",
  bestandEinleitung: "Der Artikel hat noch Bestand. Vor dem Löschen wird er ausgebucht:",
  bestandHinweis: "Die Ausbuchung steht danach unter „Bewegungen“ als Korrektur mit dem Grund „Artikel gelöscht“.",
  reserviertEinleitung: "Der Artikel kann gerade nicht gelöscht werden: Er ist für offene Vorgänge reserviert.",
  reserviertWeg: "Versenden oder stornieren Sie diese Vorgänge zuerst; danach lässt sich der Artikel löschen.",
  sendungen: "Eine Sendung mit diesem Artikel wird gerade gebucht oder geklärt.",
  gesperrtEinleitung: "Der Artikel kann gerade nicht gelöscht werden: Ein Teil des Bestands ist gesperrt.",
  gesperrtWeg: "Heben Sie die Sperre auf der Artikelseite auf; danach lässt sich der Artikel löschen.",
  abbrechen: "Abbrechen",
  schliessen: "Schließen",
  loeschen: "Artikel löschen",
  ausbuchenUndLoeschen: "Ausbuchen und löschen",
  laeuft: "Wird gelöscht …",
  zumArtikel: "Zur Artikelseite",
  pruefungFehlgeschlagen: "Die Löschung konnte nicht geprüft werden. Bitte versuchen Sie es erneut.",
  erneutPruefen: "Erneut prüfen",
  geaendert: "Der Bestand oder die Reservierungen haben sich inzwischen geändert. Bitte prüfen Sie die Angaben erneut.",
  bereitsGeloescht: "Der Artikel war bereits gelöscht.",
  keineVerbindung: "Keine Verbindung zum Server. Bitte prüfen Sie die Verbindung und versuchen Sie es erneut.",
  fehlgeschlagen: "Der Artikel konnte nicht gelöscht werden.",
});

const zahl = (v) => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0);
export const einheiten = (n) => `${formatUnits(n)} ${n === 1 ? "Einheit" : "Einheiten"}`;

/**
 * Serverprüfung → Ansicht des Dialogs.
 * art: "frei" | "bestand" | "gesperrt" | "reserviert"; unbekannt oder unvollständig → "fehler" (nie geraten).
 */
export function loeschAnsicht(deletion) {
  const d = deletion && typeof deletion === "object" ? deletion : null;
  const produkt = d && d.product && typeof d.product.id === "string" ? d.product : null;
  const art = { free: "frei", stock: "bestand", blocked: "gesperrt", in_use: "reserviert" }[d && d.state];
  if (!produkt || !art) return Object.freeze({ art: "fehler" });
  const lager = (Array.isArray(d.warehouses) ? d.warehouses : []).map((w) => ({
    warehouseId: String(w.warehouseId),
    name: typeof w.warehouseName === "string" && w.warehouseName.trim() ? w.warehouseName.trim() : "Lager",
    bestand: zahl(w.onHand),
    gesperrt: zahl(w.blocked),
  }));
  const auftraege = (Array.isArray(d.orders) ? d.orders : [])
    .filter((o) => o && typeof o.orderId === "string")
    .map((o) => ({ orderId: o.orderId, nummer: typeof o.orderNumber === "string" ? o.orderNumber : null, menge: zahl(o.quantity) }));
  return Object.freeze({
    art,
    produkt: { id: produkt.id, sku: produkt.sku, name: produkt.name },
    lagerMitBestand: lager.filter((l) => l.bestand > 0),
    lagerGesperrt: lager.filter((l) => l.gesperrt > 0),
    bestand: zahl(d.onHand),
    reserviert: zahl(d.reserved),
    gesperrt: zahl(d.blocked),
    auftraege,
    sendungen: zahl(d.shipments),
    loeschbar: art === "frei" || art === "bestand",
  });
}

/** Bestätigung für DELETE: bei Bestand genau die angezeigten Mengen je Lager, sonst keine. */
export function loeschBestaetigung(ansicht) {
  if (!ansicht || ansicht.art !== "bestand") return null;
  return { writeOff: ansicht.lagerMitBestand.map((l) => ({ warehouseId: l.warehouseId, onHand: l.bestand })) };
}

/** Erfolgsmeldung nach der Löschung — nennt die ausgebuchte Menge, falls es eine gab. */
export function loeschErfolgText(antwort) {
  const deleted = antwort && antwort.deleted ? antwort.deleted : null;
  const name = deleted && typeof deleted.name === "string" ? deleted.name : null;
  const summe = (antwort && Array.isArray(antwort.writtenOff) ? antwort.writtenOff : [])
    .reduce((s, w) => s + zahl(w && w.quantity), 0);
  const kopf = name ? `Artikel „${name}“ gelöscht.` : "Artikel gelöscht.";
  return summe > 0 ? `${kopf} ${einheiten(summe)} ausgebucht.` : kopf;
}

// Codes, nach denen die Prüfung neu geladen wird: der Zustand hat sich seit der Anzeige geändert.
const NEU_PRUEFEN = new Set(["STOCK_CHANGED", "PRODUCT_HAS_STOCK", "PRODUCT_IN_USE", "PRODUCT_STOCK_BLOCKED"]);

/**
 * Antwort einer fehlgeschlagenen Löschung → nächster Schritt.
 * art: "geloescht" (404 des Artikels: schon weg — Liste neu laden), "neu_pruefen", "meldung".
 * Ein 404 ohne den Code des Artikels (z. B. ein älterer Server ohne die Route) ist KEIN „bereits gelöscht“.
 */
export function loeschFehler(status, body) {
  const code = body && typeof body.code === "string" ? body.code : null;
  if (status === 404 && code === "PRODUCT_NOT_FOUND") return { art: "geloescht", text: LOESCH_TEXT.bereitsGeloescht };
  if (status === 409 && NEU_PRUEFEN.has(code)) return { art: "neu_pruefen", text: LOESCH_TEXT.geaendert };
  // Ein fremdes 404 oder ein Serverfehler bekommt nie den Rohtext der Antwort.
  if (status === 404 || status >= 500) return { art: "meldung", text: LOESCH_TEXT.fehlgeschlagen };
  return { art: "meldung", text: inventoryErrorText(body, LOESCH_TEXT.fehlgeschlagen) };
}
