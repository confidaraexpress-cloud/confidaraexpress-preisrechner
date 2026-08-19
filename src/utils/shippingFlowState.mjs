// Temporärer Versandvorgang — reines, framework-freies Zustandsmodell.
//
// ── Wozu es da ist ──────────────────────────────────────────────────────────
// „Neue Sendung"/Angebotsvergleich (page-State in DashboardPage) und die
// Buchung (/booking in DashboardLayout) liegen in ZWEI getrennten React-Teil-
// bäumen. Jeder Wechsel hängt den jeweils anderen vollständig ab. Bis hierher
// lebte der gesamte Vorgang ausschließlich im lokalen useState der Seiten —
// „Zurück" bedeutete deshalb: alles noch einmal eingeben.
//
// Dieses Modul hält den Vorgang in EINER geprüften Form, damit ihn ein
// Provider über den Teilbaumwechsel hinweg tragen und in den sessionStorage
// spiegeln kann. Es enthält KEINE React-, Netzwerk- oder Browser-Abhängigkeit
// und ist damit vollständig testbar.
//
// ── Was NICHT hier hineingehört ─────────────────────────────────────────────
// Alles, was serverseitig autoritativ am Draft liegt, wird bewusst nicht
// dupliziert: das Abholzeitfenster (/api/jumingo/draft/pickup-window), die
// Zoll-/Handelsrechnungsdokumente, die Preisbestätigung und die Access-Point-
// Suche. Ebenso wenig Tokens, Passwörter oder Dateien. Der Vorgang ist eine
// Bequemlichkeitsschicht — die Buchung bleibt serverseitig autoritativ
// (PRICE_CHANGED / PICKUP_WINDOW_CHANGED).
//
// ── Zwei Bereiche, ein Modell ───────────────────────────────────────────────
// „Neue Sendung" und der eigenständige Preisrechner führen fachlich verschiedene
// Formulare (Adressen vs. Land/PLZ). Sie teilen sich deshalb NICHT ein Formular,
// sondern zwei benannte Bereiche desselben Modells. Die Formularschlüssel sind
// je Bereich als Positivliste geführt: alles Unbekannte wird beim Einlesen
// verworfen — das begrenzt sowohl den Datenumfang als auch die Angriffsfläche
// gegen manipulierte sessionStorage-Inhalte.

import { FORM_SERVICE_FILTERS, FORM_SHIPPING_MODES } from "./formDraftsView.mjs";
// Kanonisch definiert in inventoryView.mjs (siehe dortiger Kommentar zum
// Importzyklus) — hier nur verwendet und unter demselben Namen weiter exportiert,
// damit bestehende Importe `from "./shippingFlowState.mjs"` unverändert gelten.
import { normalizeInventoryContext } from "./inventoryView.mjs";
export { normalizeInventoryContext };

export const FLOW_SCHEMA_VERSION = 1;
export const FLOW_STORAGE_KEY = `ce_shipping_flow_v${FLOW_SCHEMA_VERSION}`;

// Inaktivitätsfrist des temporären Vorgangs. Die Tarife des Backends tragen
// selbst KEIN validUntil/expiresAt (geprüft) — diese Frist ist deshalb eine
// reine Darstellungssicherheit des Frontends: sie verhindert, dass dem Kunden
// nach einer langen Pause eine womöglich veraltete Zahl gezeigt wird. Sie ist
// KEINE Buchungsregel; die Preisprüfung bleibt vollständig serverseitig.
export const FLOW_TTL_MS = 60 * 60 * 1000;   // 60 Minuten

export const FLOW_SCOPES = Object.freeze(["shipment", "calculator"]);
export const FLOW_STEPS = Object.freeze(["form", "offers", "booking"]);

export const SORT_MODES = Object.freeze(["recommended", "cheapest", "priciest", "fastest"]);
export const VAT_MODES = Object.freeze(["net", "gross"]);

// Grund, warum die Angebote beim Wiederherstellen verworfen wurden.
export const DROP_REASON = Object.freeze({
  EXPIRED: "expired",       // Inaktivitätsfrist überschritten
  PAST_DATE: "past_date",   // gespeichertes Versanddatum liegt in der Vergangenheit
});

// Ein Satz, kein Fehlercode. Wird als normaler Hinweis im bestehenden Stil
// gezeigt, nicht als technische Rohmeldung.
export const OFFERS_DROPPED_NOTICE = Object.freeze({
  [DROP_REASON.EXPIRED]:
    "Ihre Angaben sind erhalten geblieben. Die zuvor berechneten Angebote sind älter als eine Stunde — bitte vergleichen Sie die Angebote erneut.",
  [DROP_REASON.PAST_DATE]:
    "Ihre Angaben sind erhalten geblieben. Das gewählte Versanddatum liegt inzwischen in der Vergangenheit — bitte prüfen Sie das Datum und vergleichen Sie die Angebote erneut.",
});

/* ══════════ Formularschlüssel je Bereich (Positivliste) ═══════════════════ */

const PARTY_SUFFIXES = ["company", "fullName", "street", "addition", "zip", "city", "country", "phone", "email"];
const PACKAGE_KEYS = ["packageCount", "weight", "length", "width", "height"];
const CLIENT_FILTER_KEYS = ["max_price", "latestDeliveryDate"];

export const SHIPMENT_FORM_KEYS = Object.freeze([
  ...PARTY_SUFFIXES.map((k) => `s_${k}`),
  ...PARTY_SUFFIXES.map((k) => `r_${k}`),
  ...PACKAGE_KEYS,
  ...CLIENT_FILTER_KEYS,
]);

export const CALCULATOR_FORM_KEYS = Object.freeze([
  "from_country", "from_zip", "to_country", "to_zip",
  ...PACKAGE_KEYS,
  ...CLIENT_FILTER_KEYS,
]);

const FORM_KEYS_BY_SCOPE = Object.freeze({
  shipment: SHIPMENT_FORM_KEYS,
  calculator: CALCULATOR_FORM_KEYS,
});

// Reine Frontendzustände der Buchungsseite, die ohne Berührung der Buchungs-,
// Preis- oder Zolllogik wiederherstellbar sind. Bewusst NICHT dabei:
//   • agbAccepted / prohibitedGoodsAccepted — Einwilligungen. Eine Zustimmung
//     wird nicht über einen Reload hinweg unterstellt; der Kunde bestätigt sie
//     bewusst neu.
//   • sämtliche Zoll-/Handelsrechnungsfelder — sie hängen am serverseitigen
//     Dokumentstatus (ci.refreshStatus) und werden hier nicht nachgebaut.
//   • pickupWindow — liegt autoritativ am Backend-Draft.
export const BOOKING_KEYS = Object.freeze([
  "step", "labelFormat", "reference", "content",
  "insuranceType", "goodsValue", "insuranceValue", "insValueManual",
  // Optionale Zusatzempfänger für Versandinformationen. Reine Frontendeingaben
  // ohne Serverquelle — genau wie reference gehören sie in den laufenden Vorgang,
  // damit sie eine Zurücknavigation überleben. Gespiegelt wird nur, was auch
  // gebucht würde (siehe BookingPage): ein ausgeschalteter Bereich landet leer.
  "trackingEmail", "labelTrackingEmail",
  // Eigene Lieferscheinnummer (nur im Kontomodus „Eigenes Lieferscheinsystem" und nur
  // bei einer Sendung mit Lagerbezug sichtbar). Reine Frontendeingabe ohne Serverquelle
  // — sie gehört wie `reference` in den laufenden Vorgang, damit sie Zurücknavigation
  // und Reload übersteht. ADDITIV ohne Versionssprung: ein laufender Vorgang aus einem
  // älteren Bundle liefert hier `undefined` → "" und wird nicht grundlos verworfen.
  "externalDeliveryNoteNumber",
]);

/* ══════════ defensive Helfer ═════════════════════════════════════════════ */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v) => (typeof v === "string" ? v : v == null ? "" : typeof v === "number" && Number.isFinite(v) ? String(v) : "");
const bool = (v) => v === true;
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const finiteInt = (v) => (Number.isInteger(v) && Number.isFinite(v) ? v : null);

// Nicht-negative ganze Zahl (Zeitstempel, Scrollposition). null bei allem anderen.
function nonNegInt(v) {
  const n = typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

function isoDateOrNull(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return ISO_DATE_RE.test(s) ? s : null;
}

// Zeichenketten-Liste, dedupliziert, Reihenfolge stabil. Begrenzt, damit ein
// manipulierter Speicherinhalt keine unbegrenzte Liste einschleusen kann.
function idList(v, max = 64) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  const out = [];
  for (const x of v) {
    const s = str(x).trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

// Tarif-/Carrier-Objekte werden UNVERÄNDERT durchgereicht (sie sind reine
// Backendantwort und werden nur angezeigt), aber in Zahl und Typ begrenzt.
function objectList(v, max) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => x && typeof x === "object" && !Array.isArray(x)).slice(0, max);
}

function plainObjectOrNull(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}

/* ══════════ Formular ═════════════════════════════════════════════════════ */

// Übernimmt ausschließlich bekannte Schlüssel und ausschließlich Zeichenketten.
// Ein fehlender Schlüssel wird zur leeren Zeichenkette — genau wie im Formular.
export function normalizeForm(raw, scope) {
  const keys = FORM_KEYS_BY_SCOPE[scope];
  if (!keys) return null;
  const src = plainObjectOrNull(raw) || {};
  const out = {};
  for (const k of keys) out[k] = str(src[k]);
  return out;
}

// True, wenn das Formular überhaupt eine Nutzereingabe trägt. Ein reiner
// Profil-Seed zählt NICHT als Vorgang — sonst schriebe die Seite beim bloßen
// Öffnen schon einen „laufenden Vorgang" in den Speicher.
export function formHasInput(form, scope) {
  const keys = FORM_KEYS_BY_SCOPE[scope];
  if (!form || !keys) return false;
  // Paket- und Empfänger-/Zielangaben sind die echten Nutzereingaben; Absender-
  // und Herkunftsfelder kommen aus dem Profil.
  const relevant = keys.filter((k) => !k.startsWith("s_") && !k.startsWith("from_"));
  return relevant.some((k) => {
    const v = str(form[k]).trim();
    if (!v) return false;
    // Vorbelegte Standardwerte zählen nicht als Eingabe.
    if (k === "packageCount" && v === "1") return false;
    if ((k === "r_country" || k === "to_country") && v === "DE") return false;
    return true;
  });
}

/* ══════════ Bereichszustand ══════════════════════════════════════════════ */

export function emptyScope(scope) {
  return {
    form: normalizeForm(null, scope),
    shippingDate: null,
    serviceFilter: "all",
    shippingModeFilter: "all",
    selectedPublicCarrierIds: [],
    sortMode: "recommended",
    vatMode: "net",
    tariffs: [],
    publicCarriers: [],
    selected: null,
    shipmentId: null,
    ceShipmentId: null,
    customs: null,
    // Optionaler Lagerbezug (Modul „Lager & Aufträge"): { orderId } oder
    // { warehouseId, items:[{ productId, quantity }] }. Ausschließlich die
    // ABSICHT des Kunden — IDs und Mengen, keine Bestandswerte, keine
    // Artikelstammdaten, keine Preise. Der Server löst daraus bei
    // /calculate-price den geprüften Kontext auf und friert ihn auf dem Draft
    // ein; dieser Wert hier existiert nur, damit die Absicht einen Reload
    // überlebt und bei jedem Repricing erneut mitgeschickt werden kann.
    //
    // Er gehört zum FORMULAR, nicht zum Ergebnis: er überlebt deshalb
    // dropOffers (der Kunde ändert Paketdaten und rechnet neu — der Lagerbezug
    // bleibt) und wird erst mit resetToFreshShipment verworfen.
    //
    // Additiv OHNE Versionssprung: ein laufender Vorgang aus der Zeit davor
    // liefert `undefined` → null. Er würde durch eine Versionserhöhung grundlos
    // verworfen (dieselbe Begründung wie bei trackingEmail/labelTrackingEmail).
    inventoryContext: null,
    calculatedAt: null,
    scrollY: 0,
    updatedAt: null,
  };
}

export function normalizeScope(raw, scope) {
  if (!FLOW_SCOPES.includes(scope)) return null;
  const src = plainObjectOrNull(raw);
  if (!src) return null;
  const base = emptyScope(scope);
  return {
    ...base,
    form: normalizeForm(src.form, scope),
    shippingDate: isoDateOrNull(src.shippingDate),
    serviceFilter: oneOf(src.serviceFilter, FORM_SERVICE_FILTERS, "all"),
    shippingModeFilter: oneOf(src.shippingModeFilter, FORM_SHIPPING_MODES, "all"),
    selectedPublicCarrierIds: idList(src.selectedPublicCarrierIds),
    sortMode: oneOf(src.sortMode, SORT_MODES, "recommended"),
    vatMode: oneOf(src.vatMode, VAT_MODES, "net"),
    tariffs: objectList(src.tariffs, 120),
    publicCarriers: objectList(src.publicCarriers, 64),
    selected: plainObjectOrNull(src.selected),
    // shipmentId kommt vom Backend und darf Zahl ODER Zeichenkette sein —
    // beides unverändert übernehmen, nichts umwandeln.
    shipmentId: typeof src.shipmentId === "number" || (typeof src.shipmentId === "string" && src.shipmentId.trim())
      ? src.shipmentId : null,
    // ADDITIV, ohne Versionssprung (Präzedenz: trackingEmail): ein Vorgang aus der
    // Zeit davor liefert `undefined` → null und wird NICHT verworfen. Trägt den
    // ConfidaraExpress-Sendungshandle desselben Entwurfs — nötig, weil „Als Entwurf
    // speichern" ausschließlich shipments.id adressieren darf. Gleiche defensive
    // Übernahme wie oben: nichts umwandeln, nichts raten.
    ceShipmentId: typeof src.ceShipmentId === "number" || (typeof src.ceShipmentId === "string" && src.ceShipmentId.trim())
      ? src.ceShipmentId : null,
    customs: plainObjectOrNull(src.customs),
    inventoryContext: normalizeInventoryContext(src.inventoryContext),
    calculatedAt: nonNegInt(src.calculatedAt),
    scrollY: nonNegInt(src.scrollY) ?? 0,
    updatedAt: nonNegInt(src.updatedAt),
  };
}

/* ══════════ Buchungszustand ══════════════════════════════════════════════ */

export function emptyBooking() {
  return {
    step: 1,
    labelFormat: "A4",
    reference: "",
    content: "",
    insuranceType: "none",
    goodsValue: "",
    insuranceValue: "",
    insValueManual: false,
    trackingEmail: "",
    labelTrackingEmail: "",
    updatedAt: null,
  };
}

export function normalizeBooking(raw) {
  const src = plainObjectOrNull(raw);
  if (!src) return null;
  const stufe = finiteInt(src.step);
  return {
    // Schritt 3 ist der Erfolgsbildschirm einer ABGESCHLOSSENEN Buchung. Er wird
    // nie wiederhergestellt — sonst zeigte ein Reload eine Bestätigung ohne
    // dazugehörige Buchung. Zurück auf die Übersicht.
    step: stufe === 2 ? 2 : 1,
    labelFormat: oneOf(src.labelFormat, ["A4", "A6"], "A4"),
    reference: str(src.reference).slice(0, 200),
    content: str(src.content).slice(0, 200),
    insuranceType: oneOf(src.insuranceType, ["none", "standard", "premium"], "none"),
    goodsValue: str(src.goodsValue).slice(0, 32),
    insuranceValue: str(src.insuranceValue).slice(0, 32),
    insValueManual: bool(src.insValueManual),
    // Dieselbe Obergrenze wie im Backend (255) — eine fremde/überlange Angabe
    // wird gekappt, nicht übernommen. Validiert wird beim Buchen, nicht hier.
    trackingEmail: str(src.trackingEmail).slice(0, 255),
    labelTrackingEmail: str(src.labelTrackingEmail).slice(0, 255),
    updatedAt: nonNegInt(src.updatedAt),
  };
}

/* ══════════ Gesamtvorgang ════════════════════════════════════════════════ */

export function emptyFlow(now = 0) {
  return {
    v: FLOW_SCHEMA_VERSION,
    createdAt: nonNegInt(now) ?? 0,
    updatedAt: nonNegInt(now) ?? 0,
    step: "form",
    shipment: null,
    calculator: null,
    booking: null,
  };
}

// Beliebige Eingabe → gültiger Vorgang ODER null. Eine abweichende
// Schemaversion wird VERWORFEN, nicht migriert: ein halb verstandener
// Altbestand ist gefährlicher als ein neu ausgefülltes Formular.
export function normalizeFlow(raw) {
  const src = plainObjectOrNull(raw);
  if (!src) return null;
  if (src.v !== FLOW_SCHEMA_VERSION) return null;
  const createdAt = nonNegInt(src.createdAt);
  const updatedAt = nonNegInt(src.updatedAt);
  if (createdAt == null || updatedAt == null) return null;
  return {
    v: FLOW_SCHEMA_VERSION,
    createdAt,
    updatedAt,
    step: oneOf(src.step, FLOW_STEPS, "form"),
    shipment: normalizeScope(src.shipment, "shipment"),
    calculator: normalizeScope(src.calculator, "calculator"),
    booking: normalizeBooking(src.booking),
  };
}

// Ein Vorgang ohne jeden Inhalt muss nicht gespeichert werden.
export function flowHasContent(flow) {
  if (!flow) return false;
  for (const scope of FLOW_SCOPES) {
    const s = flow[scope];
    if (!s) continue;
    if (s.tariffs.length > 0 || s.shipmentId != null || formHasInput(s.form, scope)) return true;
  }
  return false;
}

/* ══════════ Ablauf und Wiederherstellung ═════════════════════════════════ */
/*
 * ACHTUNG: DIESER ABSCHNITT IST NICHT MEHR VERDRAHTET — UND DARF ES NICHT
 * WIEDER WERDEN.
 *
 * `flowHasContent`, `isExpired`, `dropOffers`, `restoreFlow`, `normalizeFlow`,
 * `flowFingerprint`, `serializeFlow` und `parseFlow` bildeten zusammen die
 * Persistenz des Vorgangs: Spiegel in den `sessionStorage`, Wiederherstellung
 * beim Mount, 60-Minuten-Frist. Mit dem Paket „leerer Nullzustand" wurde diese
 * Persistenz vollständig entfernt — der Vorgang lebt ausschließlich im
 * Arbeitsspeicher des ShippingFlowProviders.
 *
 * Grund: „Neue Sendung" ist ein NEUER Vorgang. Ein F5 auf einem halb
 * ausgefüllten Formular holte Absender, Empfänger, Paketdaten und alte Angebote
 * zurück, obwohl der Kunde nichts gespeichert hatte. Wer Angaben behalten will,
 * speichert einen Entwurf — bewusst, serverseitig, geräteübergreifend.
 *
 * Wer diese Funktionen wieder an den Provider hängt, holt genau diesen Fehler
 * zurück. Sie stehen hier nur noch, weil ihre Entfernung ein eigener Eingriff
 * ist (siehe Follow-up im Abschlussbericht) — nicht, weil sie gebraucht werden.
 *
 * `droppedNotice` bleibt aus demselben Grund erhalten und wird weiterhin von
 * „Neue Sendung" und dem Preisrechner importiert; ohne Wiederherstellung gibt
 * es allerdings keinen Grund mehr, der gemeldet werden könnte — der Hinweis
 * kann nicht mehr erscheinen.
 */

// Frist überschritten?
export function isExpired(flow, now) {
  if (!flow) return true;
  const t = nonNegInt(now);
  if (t == null) return false;
  return t - flow.updatedAt > FLOW_TTL_MS;
}

// Entfernt aus einem Bereich alles Ergebnisabhängige und lässt Formular,
// Datum, Filter und Sortierung stehen. Genau die Trennung, die auch
// resetResults() in „Neue Sendung" vornimmt.
export function dropOffers(scopeState) {
  if (!scopeState) return null;
  return {
    ...scopeState,
    tariffs: [],
    publicCarriers: [],
    selected: null,
    shipmentId: null,
    ceShipmentId: null,
    customs: null,
    calculatedAt: null,
    scrollY: 0,
  };
}

// Bereitet einen gespeicherten Vorgang zum Anwenden vor.
//
//   • innerhalb der Frist und mit gültigem Versanddatum → unverändert
//   • Frist überschritten                               → Angebote verwerfen
//   • Versanddatum inzwischen in der Vergangenheit      → Angebote verwerfen
//
// `today` ist der ISO-Tag von heute; verglichen wird als Zeichenkette, exakt
// wie in buildResumeInitialState (formDraftsView.mjs) beim Fortsetzen eines
// Entwurfs. Keine neue Datums- oder Zeitzonenlogik.
export function restoreFlow(raw, { now = 0, today = null } = {}) {
  const flow = normalizeFlow(raw);
  if (!flow) return { flow: null, dropped: null };

  const abgelaufen = isExpired(flow, now);
  let grund = abgelaufen ? DROP_REASON.EXPIRED : null;

  const naechster = { ...flow };
  for (const scope of FLOW_SCOPES) {
    const s = flow[scope];
    if (!s) continue;
    const inVergangenheit = !!(today && s.shippingDate && s.shippingDate < today);
    if (abgelaufen || inVergangenheit) {
      // Nur melden, wenn tatsächlich etwas verworfen wurde.
      if (s.tariffs.length > 0 || s.shipmentId != null) {
        grund = grund || (inVergangenheit ? DROP_REASON.PAST_DATE : DROP_REASON.EXPIRED);
      }
      naechster[scope] = dropOffers(s);
    }
  }
  // Ohne Angebote ist der Buchungszustand gegenstandslos.
  if (grund) naechster.booking = null;
  return { flow: naechster, dropped: grund };
}

export function droppedNotice(reason) {
  return OFFERS_DROPPED_NOTICE[reason] || null;
}

/* ══════════ Serialisierung ═══════════════════════════════════════════════ */

// Stabiler Fingerabdruck für den Schreibvergleich. Zeitstempel bleiben bewusst
// AUSSEN VOR: sonst unterschiede sich jeder Snapshot von seinem Vorgänger und
// der Spiegel schriebe bei jedem Render — genau die Schleife, die es zu
// vermeiden gilt.
export function flowFingerprint(flow) {
  if (!flow) return "";
  const ohneZeit = (o) => {
    if (!o) return null;
    const { updatedAt, calculatedAt, ...rest } = o;      // eslint-disable-line no-unused-vars
    return rest;
  };
  try {
    return JSON.stringify({
      step: flow.step,
      shipment: ohneZeit(flow.shipment),
      calculator: ohneZeit(flow.calculator),
      booking: ohneZeit(flow.booking),
    });
  } catch {
    return "";
  }
}

export function serializeFlow(flow) {
  if (!flow) return null;
  try {
    return JSON.stringify(flow);
  } catch {
    return null;
  }
}

// JSON-Text → Vorgang oder null. Beschädigte, fremde oder veraltete Inhalte
// werden still verworfen; ein Fehler beim Einlesen darf die Anwendung nie
// anhalten.
export function parseFlow(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  let roh = null;
  try {
    roh = JSON.parse(text);
  } catch {
    return null;
  }
  return normalizeFlow(roh);
}

/* ══════════ Wiederherstellungs-Vorrang ═══════════════════════════════════ */

// Verbindliche Reihenfolge, in der ein Formular seinen Ausgangszustand bezieht.
// Höherer Rang gewinnt vollständig — es wird NICHT gemischt. Insbesondere
// überschreibt ein bewusst fortgesetzter Entwurf den temporären Vorgang ganz.
export const RESTORE_PRIORITY = Object.freeze(["draft", "prefill", "flow", "profile", "empty"]);

export function pickRestoreSource({ hasDraft = false, hasPrefill = false, hasFlow = false } = {}) {
  if (hasDraft) return "draft";
  if (hasPrefill) return "prefill";
  if (hasFlow) return "flow";
  return "profile";
}
