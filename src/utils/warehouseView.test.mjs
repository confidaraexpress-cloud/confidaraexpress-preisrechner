// Mehrlagerverwaltung (Paritätsaudit 2026-10-15, Session 2: BI3, BI7, BI9, BI11, Umfang C) —
// reine Regeln: Normalisierung, alle Seiten laden, buchbare Lager, Aktionen, Formular, Fehler.
//
// Run: node --test src/utils/warehouseView.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWarehouse, readWarehousePage, loadAllWarehouses, defaultWarehouse, bookableWarehouses,
  preferredBookingWarehouseId, warehouseOptionLabel, showWarehouseFilter, warehouseActions,
  warehouseActionBody, buildWarehouseBody, warehouseErrorView, warehouseToForm, emptyWarehouseForm,
  WAREHOUSE_ACTION_TEXT, WAREHOUSE_FORM_TEXT, WAREHOUSE_LIMITS, WAREHOUSE_SELECT_PAGE_LIMIT,
  WAREHOUSE_SELECT_MAX_PAGES,
} from "./warehouseView.mjs";

const HAUPT = { id: "10", name: "Hauptlager", code: "HL", status: "active", isDefault: true, notes: null };
const NORD = { id: 11, name: "Lager Nord", code: null, status: "active", isDefault: false, notes: "Rampe 2" };
const ALT = { id: "12", name: "Altlager", code: "", status: "inactive", isDefault: false, notes: "" };

const antwort = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });

test("1 — Normalisierung: Kennung als Text, ohne Kennung keine Zeile, unbekannter Status leer", () => {
  assert.deepEqual(normalizeWarehouse(NORD), { id: "11", name: "Lager Nord", code: "", notes: "Rampe 2", status: "active", isDefault: false });
  assert.equal(normalizeWarehouse({ name: "ohne id" }), null);
  assert.equal(normalizeWarehouse(null), null);
  assert.equal(normalizeWarehouse({ id: 3, status: "archiviert" }).status, "");
  assert.deepEqual(readWarehousePage({ warehouses: [HAUPT, { name: "x" }], nextCursor: "abc" }).nextCursor, "abc");
  assert.equal(readWarehousePage({ warehouses: [HAUPT] }).warehouses.length, 1);
  assert.equal(readWarehousePage(null).nextCursor, null);
});

test("2 — alle Seiten über den Cursor: Servermaximum je Seite, Ende am leeren Cursor, Fehler als solcher", async () => {
  const aufrufe = [];
  const seiten = {
    "": { warehouses: [HAUPT], nextCursor: "c1" },
    c1: { warehouses: [NORD], nextCursor: "c2" },
    c2: { warehouses: [ALT, HAUPT], nextCursor: null },
  };
  const r = await loadAllWarehouses(async (params) => { aufrufe.push(params); return antwort(seiten[params.cursor || ""]); });
  assert.equal(r.ok, true);
  assert.deepEqual(r.warehouses.map((w) => w.id), ["10", "11", "12"], "ohne Dubletten");
  assert.equal(r.truncated, false);
  assert.deepEqual(aufrufe.map((a) => a.cursor), [undefined, "c1", "c2"]);
  assert.ok(aufrufe.every((a) => a.limit === WAREHOUSE_SELECT_PAGE_LIMIT));
  // Ein Ladefehler ist KEIN leeres Lager (BI11).
  const f = await loadAllWarehouses(async () => antwort({ error: "Fehler", code: "WAREHOUSE_LIST_FAILED" }, false, 500));
  assert.deepEqual(f, { ok: false, status: 500, body: { error: "Fehler", code: "WAREHOUSE_LIST_FAILED" } });
  // Ein hängender Cursor lädt nicht endlos.
  let n = 0;
  const endlos = await loadAllWarehouses(async () => { n++; return antwort({ warehouses: [{ id: String(n), name: `L${n}`, status: "active" }], nextCursor: `c${n}` }); });
  assert.equal(n, WAREHOUSE_SELECT_MAX_PAGES);
  assert.equal(endlos.truncated, true);
});

test("3 — buchbar sind nur aktive Lager, das Standardlager zuerst; die Vorauswahl folgt dem Wunsch, wenn er buchbar ist", () => {
  const liste = [NORD, ALT, HAUPT].map(normalizeWarehouse);
  assert.deepEqual(bookableWarehouses(liste).map((w) => w.id), ["10", "11"]);
  assert.equal(defaultWarehouse(liste).id, "10");
  assert.equal(defaultWarehouse([{ ...normalizeWarehouse(HAUPT), status: "inactive" }]), null, "ein inaktives Standardlager zählt nicht");
  assert.equal(preferredBookingWarehouseId(liste, "11"), "11");
  assert.equal(preferredBookingWarehouseId(liste, "12"), "10", "ein inaktives Lager wird nicht vorgewählt");
  assert.equal(preferredBookingWarehouseId(liste, null), "10");
  assert.equal(preferredBookingWarehouseId([], "10"), "");
  assert.equal(warehouseOptionLabel(normalizeWarehouse(HAUPT)), "Hauptlager (Standard)");
  assert.equal(warehouseOptionLabel(normalizeWarehouse(ALT)), "Altlager (inaktiv)");
  assert.equal(showWarehouseFilter(liste), true);
  assert.equal(showWarehouseFilter([normalizeWarehouse(HAUPT)]), false);
});

test("4 — Aktionen: Standardlager nicht deaktivierbar, inaktives nicht Standard; Body nur mit dem geänderten Feld", () => {
  const [haupt, nord, alt] = [HAUPT, NORD, ALT].map(normalizeWarehouse);
  const a = (w) => Object.fromEntries(warehouseActions(w).map((x) => [x.key, x]));
  assert.equal(a(haupt).setDefault.disabled, true);
  assert.equal(a(haupt).setDefault.disabledReason, WAREHOUSE_ACTION_TEXT.alreadyDefault);
  assert.equal(a(haupt).deactivate.disabled, true);
  assert.equal(a(haupt).deactivate.disabledReason, WAREHOUSE_ACTION_TEXT.defaultNotDeactivatable);
  assert.equal(a(nord).setDefault.disabled, false);
  assert.equal(a(nord).deactivate.disabled, false);
  assert.equal(a(alt).activate.disabled, false);
  assert.equal(a(alt).setDefault.disabled, true);
  assert.equal(a(alt).setDefault.disabledReason, WAREHOUSE_ACTION_TEXT.inactiveNotDefault);
  assert.equal(a(alt).deactivate, undefined);
  assert.deepEqual(warehouseActionBody("setDefault"), { isDefault: true });
  assert.deepEqual(warehouseActionBody("deactivate"), { status: "inactive" });
  assert.deepEqual(warehouseActionBody("activate"), { status: "active" });
  assert.equal(warehouseActionBody("delete"), null, "kein Löschen — das Backend kennt es nicht");
});

test("5 — Formular: Anlegen mit Pflichtname, Bearbeiten nur mit Änderungen, Grenzen wie der Server", () => {
  assert.deepEqual(buildWarehouseBody({ ...emptyWarehouseForm(), name: "  Lager Süd " }), { ok: true, body: { name: "Lager Süd" }, errors: {}, unchanged: false });
  assert.deepEqual(buildWarehouseBody({ name: "Süd", code: " S1 ", notes: " Tor 3 ", isDefault: true }).body,
    { name: "Süd", code: "S1", notes: "Tor 3", isDefault: true });
  assert.deepEqual(buildWarehouseBody({ name: " " }).errors, { name: WAREHOUSE_FORM_TEXT.nameRequired });
  const lang = buildWarehouseBody({ name: "x".repeat(WAREHOUSE_LIMITS.name + 1), code: "y".repeat(41), notes: "z".repeat(2001) });
  assert.deepEqual(lang.errors, { name: WAREHOUSE_FORM_TEXT.nameTooLong, code: WAREHOUSE_FORM_TEXT.codeTooLong, notes: WAREHOUSE_FORM_TEXT.notesTooLong });
  const original = normalizeWarehouse(HAUPT);
  assert.deepEqual(buildWarehouseBody(warehouseToForm(original), "update", original), { ok: true, body: {}, errors: {}, unchanged: true });
  assert.deepEqual(buildWarehouseBody({ ...warehouseToForm(original), code: "", notes: "Neu" }, "update", original).body,
    { code: "", notes: "Neu" }, "ein geleertes Kürzel geht als leerer Text");
  assert.equal("isDefault" in buildWarehouseBody({ ...warehouseToForm(original), name: "X" }, "update", original).body, false,
    "den Standard ändert nur die eigene Aktion");
});

test("6 — Fehler: doppelter Name am Feld, Feldfehler des Servers am Feld, Sperrgründe oben mit Mengen", () => {
  assert.deepEqual(warehouseErrorView({ error: "Ein Lager mit diesem Namen existiert bereits", code: "WAREHOUSE_DUPLICATE" }),
    { field: "name", text: WAREHOUSE_FORM_TEXT.nameDuplicate });
  assert.deepEqual(warehouseErrorView({ error: "Dieser Eintrag existiert bereits", code: "DUPLICATE_ENTRY" }).field, "name");
  assert.deepEqual(warehouseErrorView({ error: "name: darf nicht geleert werden", code: "INVALID_QUANTITY" }),
    { field: "name", text: WAREHOUSE_FORM_TEXT.nameRequired });
  assert.deepEqual(warehouseErrorView({ error: "code: max. 40 Zeichen", code: "INVALID_QUANTITY" }).field, "code");
  const leer = warehouseErrorView({ error: "x", code: "WAREHOUSE_NOT_EMPTY",
    details: { onHand: 4, blocked: 1, reserved: 2, openOrders: 1 } });
  assert.equal(leer.field, null);
  assert.match(leer.text, /erst deaktiviert werden, wenn es leer ist/);
  assert.match(leer.text, /4 Einheiten Bestand/);
  assert.match(warehouseErrorView({ code: "WAREHOUSE_DEFAULT_REQUIRED" }).text, /anderes aktives Lager als Standard/);
  assert.match(warehouseErrorView({ code: "WAREHOUSE_INACTIVE" }).text, /inaktiv/);
  assert.equal(warehouseErrorView(null, "Fallback.").text, "Fallback.");
  for (const code of ["WAREHOUSE_NOT_EMPTY", "WAREHOUSE_DEFAULT_REQUIRED", "WAREHOUSE_INACTIVE", "WAREHOUSE_DUPLICATE"]) {
    assert.ok(!warehouseErrorView({ code, error: code }).text.includes(code), `${code} erscheint nie roh`);
  }
});

test("7 — Seiten: Verwaltung statt Fünferliste, Ladefehler ≠ kein Lager, Lagerfilter, erster Wareneingang", async () => {
  const { readFileSync } = await import("node:fs");
  const lies = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  // BI11 + C: die Übersicht trennt den Ladefehler vom leeren Konto und bindet die Verwaltung ein.
  const uebersicht = lies("pages/inventory/InventoryOverviewPage.jsx");
  assert.doesNotMatch(uebersicht, /else setWarehouses\(\[\]\)/, "ein Ladefehler darf nicht zur leeren Liste werden");
  assert.match(uebersicht, /setWarehouseError\(inventoryErrorText\(/);
  assert.match(uebersicht, /\{!loading && !warehouseError && Array\.isArray\(warehouses\) && !hatLager && \(/);
  assert.match(uebersicht, /<WarehouseManager onChanged=\{\(\) => load\(\{ silent: true \}\)\} \/>/);
  assert.doesNotMatch(uebersicht, /limit: 5\b/);
  // C: die Verwaltung blättert über den Cursor und nutzt nur die bestehenden Endpunkte.
  const verwaltung = lies("components/inventory/WarehouseManager.jsx");
  assert.match(verwaltung, /getWarehouses\(\{ limit: WAREHOUSE_PAGE_LIMIT, cursor: cursor \|\| undefined \}\)/);
  assert.match(verwaltung, /onClick=\{\(\) => load\(nextCursor\)\}/);
  assert.match(verwaltung, /await createWarehouse\(gebaut\.body\)/);
  assert.match(verwaltung, /await updateWarehouse\(form\.warehouse\.id, gebaut\.body\)/);
  assert.match(verwaltung, /await updateWarehouse\(action\.warehouse\.id, body\)/);
  assert.match(verwaltung, /items=\{warehouseActions\(w\)\.map/);
  assert.doesNotMatch(verwaltung, /method: "DELETE"|deleteWarehouse/, "kein Löschen — das Backend kennt es nicht");
  // BI7: Bestand und Bewegungen filtern serverseitig nach Lager; alle Lager statt der ersten 50.
  const bestand = lies("pages/inventory/StockPage.jsx");
  assert.match(bestand, /warehouseId: filterWarehouseId \|\| undefined,/);
  assert.match(bestand, /\}, \[debouncedQ, lowOnly, filterWarehouseId\]\)/);
  assert.match(bestand, /const lagerListe = useAllWarehouses\(\);/);
  assert.doesNotMatch(bestand, /getWarehouses\(\{ limit: 50 \}\)/);
  assert.match(bestand, /buchungsLager\.map\(\(w\) => <option key=\{w\.id\} value=\{w\.id\}>\{warehouseOptionLabel\(w\)\}<\/option>\)/);
  const bewegungen = lies("pages/inventory/MovementsPage.jsx");
  assert.match(bewegungen, /warehouseId: warehouseId \|\| undefined,/);
  assert.match(bewegungen, /id="inv-mv-warehouse"/);
  // BI3: der erste Wareneingang braucht keinen vorhandenen Bestand.
  const artikel = lies("pages/inventory/ProductDetailPage.jsx");
  assert.doesNotMatch(artikel, /if \(!primaryWarehouse\) \{ setStockError/);
  assert.match(artikel, /if \(stockDialog !== "receipt" && !primaryWarehouse\)/);
  assert.match(artikel, /warehouseId: stockWarehouseId \|\| undefined, quantity: menge/);
});
