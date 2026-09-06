// ─────────────────────────────────────────────────────────────────────────────
// Sendungsformular — kanonischer Snapshot + Dirty-State (rein, framework-frei).
// Erzeugt exakt den formData-Vertrag der Formularentwürfe (POST/PATCH
// /api/kunde/form-drafts) aus dem tatsächlichen NewShipmentPage-State und
// entscheidet deterministisch, ob fachlich relevante Änderungen vorliegen.
// Kein React, kein Netzwerk, kein Logging (keine PII).
//
// WICHTIG: Der Snapshot bildet den TATSÄCHLICHEN Formularstand ab — NICHT die
// erst für calculate-price angewendeten Provider-Defaults (30/20/15 usw.).
// Leere Gewicht-/Maßwerte bleiben null; ungültige Zahlen werden nie zu NaN.
import { FORM_SERVICE_FILTERS, FORM_SHIPPING_MODES } from "./formDraftsView.mjs";
import { normalizeInventoryContext } from "./inventoryView.mjs";

// ── Normalisierung (stabil, deterministisch) ────────────────────────────────
function trimStr(v) {
  if (typeof v === "string") return v.trim();
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}
// leer/null/undefined → null; gültige Zahl bzw. gültiger numerischer String →
// Zahl; sonst null (nie NaN). Dezimalkomma wird toleriert.
function numOrNull(v) {
  if (v === "" || v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim().replace(",", ".");
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function posInt(v, def) {
  const n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v.trim()) : NaN);
  return Number.isInteger(n) && n >= 1 ? n : def;
}
// Carrier-IDs: nur nicht-leere Strings, dedupliziert, Reihenfolge stabil (erste
// Vorkommnisse). Mutiert die Eingabe nicht.
function dedupeIds(arr) {
  if (!Array.isArray(arr)) return [];
  const seen = new Set();
  const out = [];
  for (const x of arr) {
    const s = typeof x === "string" ? x : (x == null ? "" : String(x));
    if (s === "" || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function party(form, p) {
  return {
    company: trimStr(form[`${p}_company`]),
    // Die strukturierte Kontaktperson wird MITGESPEICHERT — sonst verlöre ein Entwurf
    // beim Fortsetzen genau die Felder, die das Formular verpflichtend erhebt.
    firstName: trimStr(form[`${p}_firstName`]),
    lastName: trimStr(form[`${p}_lastName`]),
    // Der Altbestandswert reist mit, damit ein fortgesetzter Entwurf aus der Zeit davor
    // seinen gespeicherten Namen behält. Zerlegt wird er nirgends.
    fullName: trimStr(form[`${p}_fullName`]),
    streetAndNumber: trimStr(form[`${p}_street`]),
    addressAddition: trimStr(form[`${p}_addition`]),
    postalCode: trimStr(form[`${p}_zip`]),
    city: trimStr(form[`${p}_city`]),
    country: trimStr(form[`${p}_country`]),
    phone: trimStr(form[`${p}_phone`]),
    email: trimStr(form[`${p}_email`]),
  };
}

// state: { form, shippingDate, serviceFilter, shippingModeFilter, selectedPublicCarrierIds,
//          inventoryContext }
// Rückgabe: kanonischer formData-Snapshot (feste Key-Reihenfolge). Reine Funktion.
//
// inventoryContext (Audit-Finding 1): derselbe Lagerbezug, der bei jeder
// /calculate-price-Anfrage als `inventory` mitgeschickt wird — hier zusätzlich in
// den gespeicherten Formularentwurf aufgenommen, damit „Als Entwurf speichern" →
// „Entwurf später öffnen" den fachlichen Bezug zu Artikel/Auftrag NICHT verliert.
// Fehlt er (normale Sendung, oder ein Aufrufer, der ihn nicht mitgibt), liefert
// normalizeInventoryContext(undefined) → null — unverändertes Verhalten für jede
// normale Sendung.
export function getShipmentFormSnapshot(state) {
  const s = state || {};
  const form = s.form || {};
  return {
    sender: party(form, "s"),
    recipient: party(form, "r"),
    packages: {
      packageCount: posInt(form.packageCount, 1),
      weight: numOrNull(form.weight),
      length: numOrNull(form.length),
      width: numOrNull(form.width),
      height: numOrNull(form.height),
    },
    shippingOptions: {
      shippingDate: trimStr(s.shippingDate) || null,
      serviceFilter: FORM_SERVICE_FILTERS.includes(s.serviceFilter) ? s.serviceFilter : "all",
      shippingModeFilter: FORM_SHIPPING_MODES.includes(s.shippingModeFilter) ? s.shippingModeFilter : "all",
      publicCarrierIds: dedupeIds(s.selectedPublicCarrierIds),
    },
    inventoryContext: normalizeInventoryContext(s.inventoryContext),
  };
}

// ── Strukturelle Gleichheit (Key-Reihenfolge-unabhängig) ────────────────────
function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return a === b;
  const ta = typeof a, tb = typeof b;
  if (ta !== tb) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqual(a[i], b[i])) return false;
    return true;
  }
  if (ta === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (const k of ka) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

// Änderung gegenüber der Baseline? (rein strukturell, keine UI-only-Felder —
// der Snapshot enthält per Konstruktion nur fachliche Versanddaten).
export function hasMeaningfulShipmentChanges(currentSnapshot, baselineSnapshot) {
  return !deepEqual(currentSnapshot, baselineSnapshot);
}

// Enthält der Snapshot überhaupt einen sinnvoll speicherbaren Zustand? Reine
// Auto-Defaults (leere Adressen, packageCount=1, Filter „all", Standardland)
// zählen NICHT. Land ist bewusst ausgenommen (immer vorbelegt).
const PARTY_TEXT_KEYS = ["company", "firstName", "lastName", "fullName", "streetAndNumber",
                         "addressAddition", "postalCode", "city", "phone", "email"];
function partyHasText(party) {
  return !!party && PARTY_TEXT_KEYS.some((k) => trimStr(party[k]) !== "");
}
// baseline (optional) erlaubt, das Versanddatum korrekt zu behandeln: das
// Standarddatum „heute" ist ein Auto-Default und zählt nur, wenn es bewusst
// gegenüber der Baseline geändert wurde (sonst wäre jedes leere Formular durch
// das vorbelegte Datum „speicherbar").
export function hasMeaningfulShipmentInput(snapshot, baseline) {
  if (!snapshot) return false;
  if (partyHasText(snapshot.sender) || partyHasText(snapshot.recipient)) return true;
  const p = snapshot.packages || {};
  if (p.weight != null || p.length != null || p.width != null || p.height != null) return true;
  if (p.packageCount != null && p.packageCount !== 1) return true;
  const o = snapshot.shippingOptions || {};
  if ((o.serviceFilter && o.serviceFilter !== "all") || (o.shippingModeFilter && o.shippingModeFilter !== "all")) return true;
  if (Array.isArray(o.publicCarrierIds) && o.publicCarrierIds.length > 0) return true;
  const baselineDate = baseline && baseline.shippingOptions ? baseline.shippingOptions.shippingDate : null;
  if (o.shippingDate != null && o.shippingDate !== baselineDate) return true;
  return false;
}

// Kombiniertes Dirty-Gate: eine fachliche Änderung gegenüber der Baseline UND
// ein tatsächlich speicherbarer Zustand. Nur dann soll der Verlassen-Dialog
// erscheinen. Reine Auto-Defaults oder ein leeres Formular lösen NICHT aus.
export function isShipmentFormDirty(currentSnapshot, baselineSnapshot) {
  return hasMeaningfulShipmentChanges(currentSnapshot, baselineSnapshot) && hasMeaningfulShipmentInput(currentSnapshot, baselineSnapshot);
}
