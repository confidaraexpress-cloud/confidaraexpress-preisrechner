/* ── Lager (Mehrlagerverwaltung) — reine Anzeige- und Formularregeln ───────────
   Paritätsaudit 2026-10-15, Session 2 (BI3, BI7, BI9, BI11 und Umfang C).

   Backend (routes/warehouses.js), ausschließlich bestehende Endpunkte:
     GET   /api/kunde/warehouses?limit&cursor&q → { warehouses, nextCursor }   Keyset, limit 1–100
     POST  /api/kunde/warehouses                → 201 { warehouse }
     PATCH /api/kunde/warehouses/:id            → { warehouse }
   Felder: id, name (Pflicht, ≤ 120, je Konto eindeutig ohne Groß-/Kleinschreibung),
   code (≤ 40), notes (≤ 2000), status active|inactive, isDefault.

   Die Mehrlagerregeln setzt der SERVER durch (Standardlager immer aktiv und nie
   abwählbar, deaktiviert wird nur ein leeres Lager, ein inaktives Lager wird nie
   Standard). Hier steht nur, welche Aktion die Oberfläche anbietet, wie ein Formular
   zum Body wird und wie eine Antwort lesbar wird. Bewusst NICHT: Löschen (gibt es im
   Backend nicht), Umbuchen zwischen Lagern, Lagerplätze. Kein React, kein Netzwerk —
   das Laden aller Seiten bekommt die Abruffunktion übergeben. */

import { inventoryErrorText } from "./inventoryErrors.mjs";

export const WAREHOUSE_LIMITS = Object.freeze({ name: 120, code: 40, notes: 2000 });
// Verwaltung: Seite für Seite über den Cursor des Servers („Weitere Lager laden").
export const WAREHOUSE_PAGE_LIMIT = 25;
// Auswahlfelder (Buchen, Filtern): alle Seiten — das Servermaximum je Seite und eine
// Obergrenze, damit ein fehlerhafter Cursor nie endlos lädt.
export const WAREHOUSE_SELECT_PAGE_LIMIT = 100;
export const WAREHOUSE_SELECT_MAX_PAGES = 20;

const text = (v) => (typeof v === "string" ? v.trim() : "");

/** Serverobjekt → Anzeigemodell; ohne Kennung null (nie eine geratene Zeile). */
export function normalizeWarehouse(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = raw.id === null || raw.id === undefined ? "" : String(raw.id).trim();
  if (!id) return null;
  return {
    id,
    name: text(raw.name),
    code: text(raw.code),
    notes: text(raw.notes),
    status: raw.status === "inactive" ? "inactive" : raw.status === "active" ? "active" : "",
    isDefault: raw.isDefault === true,
  };
}

export function normalizeWarehouseList(raw) {
  return (Array.isArray(raw) ? raw : []).map(normalizeWarehouse).filter(Boolean);
}

/** Eine Seite der Listenantwort → { warehouses, nextCursor }. */
export function readWarehousePage(body) {
  const b = body && typeof body === "object" ? body : {};
  return {
    warehouses: normalizeWarehouseList(b.warehouses),
    nextCursor: typeof b.nextCursor === "string" && b.nextCursor ? b.nextCursor : null,
  };
}

/** Lädt ALLE Seiten über den Cursor des Servers (für Auswahlfelder).
 *  `fetchPage(params)` ist getWarehouses — die Funktion bleibt so ohne Netzwerk testbar.
 *  → { ok: true, warehouses, truncated } | { ok: false, status, body } */
export async function loadAllWarehouses(fetchPage) {
  const alle = [];
  let cursor = null;
  for (let seite = 0; seite < WAREHOUSE_SELECT_MAX_PAGES; seite++) {
    const res = await fetchPage({ limit: WAREHOUSE_SELECT_PAGE_LIMIT, cursor: cursor || undefined });
    if (!res || !res.ok) {
      let body = null;
      try { body = res ? await res.json() : null; } catch { body = null; }
      return { ok: false, status: res ? res.status : 0, body };
    }
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    const page = readWarehousePage(body);
    for (const w of page.warehouses) if (!alle.some((x) => x.id === w.id)) alle.push(w);
    if (!page.nextCursor || page.nextCursor === cursor) return { ok: true, warehouses: alle, truncated: false };
    cursor = page.nextCursor;
  }
  return { ok: true, warehouses: alle, truncated: true };
}

/** Das Standardlager — nur ein aktives zählt. */
export function defaultWarehouse(list) {
  return (Array.isArray(list) ? list : []).find((w) => w && w.isDefault && w.status === "active") || null;
}

/** Lager, in die gebucht werden darf: nur aktive, das Standardlager zuerst. */
export function bookableWarehouses(list) {
  const aktiv = (Array.isArray(list) ? list : []).filter((w) => w && w.status === "active");
  return [...aktiv.filter((w) => w.isDefault), ...aktiv.filter((w) => !w.isDefault)];
}

/** Vorauswahl einer Buchung: das gewünschte Lager, wenn es buchbar ist, sonst das
 *  Standardlager, sonst das erste buchbare; ohne buchbares Lager "". */
export function preferredBookingWarehouseId(list, wunschId) {
  const buchbar = bookableWarehouses(list);
  if (wunschId !== null && wunschId !== undefined && buchbar.some((w) => w.id === String(wunschId))) return String(wunschId);
  return (defaultWarehouse(buchbar) || buchbar[0] || { id: "" }).id;
}

/** Auswahl eines Buchungsdialogs: die buchbaren Lager — und das gewählte, falls es inaktiv
 *  ist. Eine aus der Bestandsliste geöffnete Zeile behält IHR Lager; der Server nennt dann
 *  den Grund (WAREHOUSE_INACTIVE), statt dass still in ein anderes Lager gebucht würde. */
export function bookingWarehouseOptions(list, selectedId) {
  const buchbar = bookableWarehouses(list);
  const id = selectedId === null || selectedId === undefined ? "" : String(selectedId);
  if (!id || buchbar.some((w) => w.id === id)) return buchbar;
  const gewaehlt = (Array.isArray(list) ? list : []).find((w) => w && w.id === id);
  return gewaehlt ? [...buchbar, gewaehlt] : buchbar;
}

/** Beschriftung in Auswahlfeldern: Name, dazu Standard bzw. inaktiv. */
export function warehouseOptionLabel(w) {
  if (!w) return "";
  const name = w.name || "Lager ohne Namen";
  if (w.status === "inactive") return `${name} (inaktiv)`;
  return w.isDefault ? `${name} (Standard)` : name;
}

/** Ein Lagerfilter lohnt sich erst ab zwei Lagern — inaktive zählen mit: ihre
 *  Bestände und Bewegungen bleiben lesbar. */
export function showWarehouseFilter(list) {
  return Array.isArray(list) && list.length > 1;
}

/* ── Aktionen der Verwaltung ────────────────────────────────────────────────
   Angeboten wird, was der Server erlauben KANN; der Grund einer gesperrten Aktion
   steht im Menü (RowActionsMenu.disabledReason). Ob ein Lager leer ist, weiß nur der
   Server — „Deaktivieren" bleibt deshalb anwählbar und nennt bei 409
   WAREHOUSE_NOT_EMPTY die Mengen. */
export const WAREHOUSE_ACTION_TEXT = Object.freeze({
  defaultNotDeactivatable: "Das Standardlager kann nicht deaktiviert werden. Legen Sie zuerst ein anderes aktives Lager als Standard fest.",
  inactiveNotDefault: "Ein inaktives Lager kann nicht Standard werden. Aktivieren Sie es zuerst.",
  alreadyDefault: "Dieses Lager ist bereits das Standardlager.",
});

export function warehouseActions(w) {
  if (!w) return [];
  const aktiv = w.status === "active";
  return [
    { key: "setDefault", label: "Als Standard festlegen",
      disabled: !aktiv || w.isDefault,
      disabledReason: w.isDefault ? WAREHOUSE_ACTION_TEXT.alreadyDefault : WAREHOUSE_ACTION_TEXT.inactiveNotDefault },
    aktiv
      ? { key: "deactivate", label: "Deaktivieren", disabled: w.isDefault,
        disabledReason: WAREHOUSE_ACTION_TEXT.defaultNotDeactivatable }
      : { key: "activate", label: "Aktivieren", disabled: false, disabledReason: "" },
  ];
}

/** Der PATCH-Body einer Statusaktion — genau die Felder, die sie ändert. */
export function warehouseActionBody(kind) {
  if (kind === "setDefault") return { isDefault: true };
  if (kind === "deactivate") return { status: "inactive" };
  if (kind === "activate") return { status: "active" };
  return null;
}

export const WAREHOUSE_ACTION_DIALOG = Object.freeze({
  setDefault: Object.freeze({
    title: "Als Standardlager festlegen?",
    text: "Neue Buchungen und Aufträge ohne eigene Lagerwahl verwenden künftig dieses Lager. Das bisherige Standardlager bleibt aktiv.",
    confirm: "Als Standard festlegen",
    success: "Das Standardlager wurde geändert.",
  }),
  deactivate: Object.freeze({
    title: "Lager deaktivieren?",
    text: "In ein inaktives Lager wird nichts mehr gebucht. Bestände, Bewegungen und Aufträge bleiben lesbar; deaktiviert wird nur ein leeres Lager ohne offene Aufträge. Sie können es jederzeit wieder aktivieren.",
    confirm: "Deaktivieren",
    success: "Das Lager wurde deaktiviert.",
  }),
  activate: Object.freeze({
    title: "Lager aktivieren?",
    text: "In das Lager kann danach wieder gebucht werden. Es wird nichts umgebucht.",
    confirm: "Aktivieren",
    success: "Das Lager ist wieder aktiv.",
  }),
});

/* ── Formular (Anlegen, Bearbeiten) ─────────────────────────────────────── */
export function emptyWarehouseForm() {
  return { name: "", code: "", notes: "", isDefault: false };
}

export function warehouseToForm(w) {
  return { name: w?.name || "", code: w?.code || "", notes: w?.notes || "", isDefault: w?.isDefault === true };
}

export const WAREHOUSE_FORM_TEXT = Object.freeze({
  nameRequired: "Bitte geben Sie einen Namen für das Lager an.",
  nameTooLong: `Der Name darf höchstens ${WAREHOUSE_LIMITS.name} Zeichen lang sein.`,
  codeTooLong: `Das Kürzel darf höchstens ${WAREHOUSE_LIMITS.code} Zeichen lang sein.`,
  notesTooLong: `Die Notiz darf höchstens ${WAREHOUSE_LIMITS.notes} Zeichen lang sein.`,
  nameDuplicate: "Ein Lager mit diesem Namen gibt es bereits. Bitte wählen Sie einen anderen Namen.",
});

/** Formular → Body. Anlegen: Name Pflicht, leere Zusatzfelder entfallen, `isDefault`
 *  nur, wenn gewählt. Bearbeiten: nur geänderte Felder — ein geleertes Kürzel oder eine
 *  geleerte Notiz gehen als "" (der Server speichert das als leer); den Standard ändert
 *  die eigene Aktion. Ohne Änderung `unchanged: true`, kein Request.
 *  → { ok, body, errors, unchanged } */
export function buildWarehouseBody(form, mode = "create", original = null) {
  const f = form || {};
  const errors = {};
  const name = text(f.name);
  const code = text(f.code);
  const notes = text(f.notes);
  if (!name) errors.name = WAREHOUSE_FORM_TEXT.nameRequired;
  else if (name.length > WAREHOUSE_LIMITS.name) errors.name = WAREHOUSE_FORM_TEXT.nameTooLong;
  if (code.length > WAREHOUSE_LIMITS.code) errors.code = WAREHOUSE_FORM_TEXT.codeTooLong;
  if (notes.length > WAREHOUSE_LIMITS.notes) errors.notes = WAREHOUSE_FORM_TEXT.notesTooLong;
  if (Object.keys(errors).length) return { ok: false, body: null, errors, unchanged: false };

  if (mode === "create") {
    const body = { name };
    if (code) body.code = code;
    if (notes) body.notes = notes;
    if (f.isDefault === true) body.isDefault = true;
    return { ok: true, body, errors: {}, unchanged: false };
  }
  const vorher = original || {};
  const body = {};
  if (name !== text(vorher.name)) body.name = name;
  if (code !== text(vorher.code)) body.code = code;
  if (notes !== text(vorher.notes)) body.notes = notes;
  return { ok: true, body, errors: {}, unchanged: Object.keys(body).length === 0 };
}

/** Fehlerantwort → { field, text }: ein doppelter Name oder ein Feldfehler steht am Feld,
 *  alles andere oben im Dialog (Texte und Mengen aus inventoryErrors.mjs). */
export function warehouseErrorView(body, fallback) {
  const b = body && typeof body === "object" ? body : {};
  if (b.code === "WAREHOUSE_DUPLICATE" || b.code === "DUPLICATE_ENTRY") {
    return { field: "name", text: WAREHOUSE_FORM_TEXT.nameDuplicate };
  }
  if (b.code === "INVALID_QUANTITY" && typeof b.error === "string") {
    const feld = /^(name|code|notes):/.exec(b.error.trim());
    if (feld) {
      const f = feld[1];
      const t = f === "name"
        ? (/Pflichtfeld|geleert/.test(b.error) ? WAREHOUSE_FORM_TEXT.nameRequired : WAREHOUSE_FORM_TEXT.nameTooLong)
        : f === "code" ? WAREHOUSE_FORM_TEXT.codeTooLong : WAREHOUSE_FORM_TEXT.notesTooLong;
      return { field: f, text: t };
    }
  }
  return { field: null, text: inventoryErrorText(b, fallback) };
}
