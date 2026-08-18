// ── „Auftrag erstellen" — reines Anzeige- und Ableitungsmodell ───────────────
//
// Hier wird NICHTS entschieden, was serverseitig entschieden gehört. Das Modul
// beantwortet ausschließlich Anzeigefragen:
//   • Welche Empfängerfelder sind Pflicht?  → exakt die des Backends
//   • Was bedeutet die eingetippte Menge?    → Vorschau, keine Zusage
//   • Welcher Text steht an einem Fehler?    → eine Quelle, nicht im JSX
//
// **Backend bleibt Autorität.** Ob eine Menge reserviert werden darf, entscheidet
// allein `POST /api/kunde/orders` — atomar, in einer Transaktion, gegen den
// Bestand im Moment des Anlegens. Die Vorschau unten liest den zuletzt geladenen
// Wert `product.stock.available` und kann im Sekundenbereich veraltet sein. Sie
// ist eine Orientierung für den Menschen vor dem Bildschirm, KEINE
// Race-Condition-Absicherung — die liegt und bleibt im Backend.

import { validatePostalCode, isPostalCodeRequired, hasPostalCode } from "./postalCode.mjs";
import { unitLabel } from "./inventoryView.mjs";

/* ══════════ Empfänger ══════════════════════════════════════════════════════ */

/**
 * Feldlängen EXAKT aus dem Backendvertrag (`RECIPIENT_LIMITS` in
 * routes/orders.js). Keine erfundenen Grenzen, keine abweichenden Werte —
 * ein im Client durchgelassenes Feld, das der Server abschneidet oder
 * ablehnt, wäre ein stiller Datenverlust.
 */
export const ORDER_RECIPIENT_LIMITS = Object.freeze({
  fullName: 35, streetAndNumber: 35, city: 30, company: 35,
  addressAddition: 100, phone: 40, email: 254, postalCode: 10, country: 2,
});

/**
 * Pflichtfelder EXAKT aus dem Backendvertrag: die Schleife
 * `for (const req of ["fullName", "streetAndNumber", "city", "country"])`
 * in `validateRecipient()`. Mehr Sterne gibt es nicht.
 *
 * **Die PLZ steht bewusst NICHT in dieser Liste.** Das Backend prüft sie über
 * `validatePostalCode(country, postalCode)` — sie ist also nur dort Pflicht, wo
 * das Land eine kennt. Das Formular markierte sie zuvor unbedingt mit „PLZ *"
 * und lehnte eine leere Eingabe immer ab; für Länder ohne Postleitzahlsystem
 * (z. B. IE, AE, HK) war das ein erfundener Stern, der eine gültige Adresse
 * blockierte.
 */
export const ORDER_RECIPIENT_REQUIRED = Object.freeze(["fullName", "streetAndNumber", "city", "country"]);

export function emptyOrderRecipient() {
  return {
    company: "", fullName: "", streetAndNumber: "", addressAddition: "",
    postalCode: "", city: "", country: "DE", phone: "", email: "",
  };
}

/** Trägt das Land eine Postleitzahl? Steuert Feld UND Stern — dieselbe Quelle wie das Backend. */
export function postalCodeRequirement(country) {
  return { shown: hasPostalCode(country), required: isPostalCodeRequired(country) };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ISO2_RE = /^[A-Za-z]{2}$/;

const PFLICHT_TEXTE = Object.freeze({
  fullName: "Name ist erforderlich.",
  streetAndNumber: "Straße und Hausnummer sind erforderlich.",
  city: "Ort ist erforderlich.",
  country: "Land ist erforderlich.",
});

/**
 * Empfängerprüfung mit exakt den Regeln des Backends. Liefert ein Fehlerobjekt
 * (leer = gültig). Schnelles Feedback am Formular — der Server prüft erneut.
 */
export function validateOrderRecipient(recipient) {
  const r = recipient || {};
  const errors = {};
  const wert = (k) => (typeof r[k] === "string" ? r[k].trim() : "");

  for (const feld of ORDER_RECIPIENT_REQUIRED) {
    if (feld === "country") continue;
    if (!wert(feld)) errors[feld] = PFLICHT_TEXTE[feld];
  }

  const land = wert("country").toUpperCase();
  if (!land) errors.country = PFLICHT_TEXTE.country;
  else if (!ISO2_RE.test(land)) errors.country = "Land muss ein gültiger ISO-2-Code sein.";

  if (!errors.country) {
    const pc = validatePostalCode(land, wert("postalCode"));
    if (!pc.valid) {
      errors.postalCode = pc.code === "POSTAL_CODE_REQUIRED"
        ? "PLZ ist für dieses Land erforderlich."
        : (pc.example ? `PLZ passt nicht zum Landesformat (Beispiel: ${pc.example}).` : "PLZ ist ungültig.");
    }
  }

  const mail = wert("email");
  if (mail && !EMAIL_RE.test(mail)) errors.email = "Ungültige E-Mail-Adresse.";

  return errors;
}

/**
 * Formularwerte → Payload. Optionale Felder leer ⇒ `null` (nicht ""), Land
 * großgeschrieben, PLZ in der vom gemeinsamen Modul normalisierten Form.
 * Dieselbe Normalisierungsregel wie im Adressbuch — keine zweite Auslegung.
 */
export function normalizeOrderRecipient(recipient) {
  const r = recipient || {};
  const text = (v) => (typeof v === "string" ? v.trim() : "");
  const optional = (v) => text(v) || null;
  const land = text(r.country).toUpperCase();
  const pc = validatePostalCode(land, text(r.postalCode));
  return {
    company: optional(r.company),
    fullName: text(r.fullName),
    streetAndNumber: text(r.streetAndNumber),
    addressAddition: optional(r.addressAddition),
    postalCode: (pc.valid ? (pc.normalizedValue ?? text(r.postalCode)) : text(r.postalCode)) || null,
    city: text(r.city),
    country: land,
    phone: optional(r.phone),
    email: optional(r.email),
  };
}

/* ══════════ Positionen ═════════════════════════════════════════════════════ */

function ganzeZahl(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "") return null;
  // Bewusst streng: „3,5", „3.5", „1e3" und „ 3 " mit Buchstaben sind keine
  // Stückzahl. Number("") wäre 0 — deshalb steht der Leerfall oben.
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
}

/** Der zuletzt geladene verfügbare Bestand eines Artikels — oder null, wenn unbekannt. */
export function availableOf(product) {
  const v = product?.stock?.available;
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Was die eingetippte Menge für den Bestand bedeutet — reine Darstellung.
 *
 * Gibt `null` zurück, sobald die Grundlage nicht belastbar ist: ohne bekannten
 * verfügbaren Bestand (Artikel ohne Bestandszeile) und ohne gültige Menge wird
 * nichts behauptet. Das ist dieselbe Regel wie bei `receiptPreview()` /
 * `adjustmentPreview()` auf der Bestandsseite.
 */
export function reservationPreview(product, quantityRaw) {
  const verfuegbar = availableOf(product);
  const menge = ganzeZahl(quantityRaw);
  if (verfuegbar === null || menge === null || menge < 1) return null;
  return {
    requested: menge,
    available: verfuegbar,
    remaining: verfuegbar - menge,
    exceeds: menge > verfuegbar,
  };
}

/**
 * Zwei kurze Sätze zur Vorschau — erst was dieser Auftrag bindet, dann was
 * danach übrig bleibt. Bei Überschreitung gibt es keine „danach"-Aussage: die
 * Menge ist so gar nicht reservierbar, und eine negative Restmenge wäre eine
 * erfundene Zahl. Den Hinweis trägt dort `quantityError()`.
 */
export function reservationPreviewLines(preview) {
  if (!preview) return [];
  const gebunden = `${unitLabel(preview.requested)} für diesen Auftrag reserviert`;
  if (preview.exceeds) return [gebunden];
  return [gebunden, `Nach Auftrag: ${unitLabel(preview.remaining)} verfügbar`];
}

/**
 * Mengenfehler einer Position. `available === null` ⇒ es wird NICHT gesperrt:
 * ohne bekannten Bestand gibt es keine belastbare Aussage, und das Backend
 * entscheidet ohnehin verbindlich (fail-open zugunsten des Nutzers, die
 * verbindliche Prüfung bleibt serverseitig).
 */
export function quantityError(quantityRaw, available) {
  const s = quantityRaw === null || quantityRaw === undefined ? "" : String(quantityRaw).trim();
  if (s === "") return "Bitte eine Menge angeben.";
  const menge = ganzeZahl(s);
  if (menge === null) return "Nur ganze Einheiten möglich.";
  if (menge < 1) return "Mindestens 1 Einheit.";
  if (available !== null && available !== undefined && Number.isFinite(Number(available)) && menge > Number(available)) {
    return `Nur ${unitLabel(Number(available))} verfügbar.`;
  }
  return null;
}

/** [{ productId, message }] für alle fehlerhaften Positionen — leer = in Ordnung. */
export function positionErrors(positions) {
  return (positions || [])
    .map((p) => {
      const message = quantityError(p?.quantity, availableOf(p?.product));
      return message ? { productId: p?.product?.id, message } : null;
    })
    .filter(Boolean);
}

/** Höchstzahl Positionen je Auftrag — exakt `MAX_ORDER_ITEMS` des Backends. */
export const MAX_ORDER_POSITIONS = 100;

/**
 * Darf abgesendet werden? Reine Formularreife — keine Bestandszusage.
 * Das Backend prüft anschließend erneut und ist die einzige verbindliche Instanz.
 */
export function canSubmitOrder({ recipient, positions }) {
  if (Object.keys(validateOrderRecipient(recipient)).length > 0) return false;
  if (!positions || positions.length === 0) return false;
  if (positions.length > MAX_ORDER_POSITIONS) return false;
  return positionErrors(positions).length === 0;
}

/* ══════════ Was passiert mit dem Bestand? ══════════════════════════════════ */

/**
 * Der Erklärblock unter den Positionen. Er ersetzt den früheren Fußzeilensatz
 * „Mit dem Anlegen wird der Bestand reserviert …" — EINE Erklärung, an der
 * Stelle, an der die Mengen eingetragen werden, nicht zwei an zwei Stellen.
 *
 * Sprachregel des Bereichs: kein Lagerfachjargon („Allocation", „Commitment",
 * „Fulfillment Reservation"), keine Ware bewegt sich, nichts wird ausgebucht.
 */
export const STOCK_EXPLANATION = Object.freeze({
  title: "Was passiert mit dem Bestand?",
  lines: Object.freeze([
    "Die angegebenen Mengen werden für diesen Auftrag vorgemerkt und stehen für andere Aufträge nicht mehr zur Verfügung.",
    "Die Ware bleibt im Lager. Aus dem Bestand entfernt wird sie erst, wenn Sie die Sendung dazu buchen.",
    "Solange nichts versendet ist, gibt eine Stornierung des Auftrags die Mengen wieder frei.",
  ]),
});

/* ══════════ Nicht genügend Bestand beim Absenden ═══════════════════════════ */

/**
 * Verständliche Meldung zu `INSUFFICIENT_STOCK`. Das Backend liefert
 * `details.productId` und `details.requested` mit (siehe `inventory.reserve`)
 * — daraus lässt sich der betroffene Artikel benennen, ohne etwas zu raten.
 * Ist die Angabe nicht zuzuordnen, bleibt der allgemeine Satz.
 *
 * Die Menge wird bewusst NICHT automatisch gesenkt: was stattdessen bestellt
 * werden soll, weiß nur der Nutzer.
 */
export function insufficientStockMessage(body, positions) {
  if (!body || body.code !== "INSUFFICIENT_STOCK") return null;
  const pid = body.details?.productId != null ? String(body.details.productId) : null;
  const treffer = pid ? (positions || []).find((p) => String(p?.product?.id) === pid) : null;
  const name = treffer?.product?.name || treffer?.product?.sku;
  return name
    ? `Für „${name}" ist inzwischen nicht mehr genügend Bestand verfügbar. Der Auftrag wurde nicht angelegt; die Bestände unten sind aktualisiert. Bitte passen Sie die Menge an.`
    : "Für mindestens eine Position ist inzwischen nicht mehr genügend Bestand verfügbar. Der Auftrag wurde nicht angelegt; die Bestände unten sind aktualisiert. Bitte passen Sie die Mengen an.";
}

/* ══════════ Zusatzangaben ══════════════════════════════════════════════════ */

/**
 * Trägt der Abschnitt „Zusatzangaben" bereits Angaben? Steuert zweierlei:
 * den Startzustand (gefüllt ⇒ offen, damit vorhandene Angaben nie versteckt
 * sind) und die Markierung „ausgefüllt" am eingeklappten Kopf.
 *
 * Das voreingestellte Standardlager zählt NICHT als Angabe — es ist eine
 * Vorbelegung, keine Entscheidung des Nutzers.
 */
export function extrasFilled({ warehouseId, defaultWarehouseId, customerReference, notes } = {}) {
  if (typeof customerReference === "string" && customerReference.trim()) return true;
  if (typeof notes === "string" && notes.trim()) return true;
  if (warehouseId && defaultWarehouseId && String(warehouseId) !== String(defaultWarehouseId)) return true;
  return false;
}
