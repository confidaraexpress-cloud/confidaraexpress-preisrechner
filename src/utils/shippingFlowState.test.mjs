// Reines Zustandsmodell des temporären Versandvorgangs.
//
// Diese Datei prüft die Logik, die entscheidet, WAS wiederhergestellt wird —
// unabhängig von React und Browser. Die Verdrahtung (Provider, Seiten,
// Navigation, Scroll) liegt in tests/e2e/shippingFlowRestore.test.mjs.
//
// Run: node --test src/utils/shippingFlowState.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  FLOW_SCHEMA_VERSION, FLOW_STORAGE_KEY, FLOW_TTL_MS, FLOW_SCOPES,
  SHIPMENT_FORM_KEYS, CALCULATOR_FORM_KEYS, BOOKING_KEYS,
  DROP_REASON, droppedNotice,
  emptyFlow, emptyScope, emptyBooking,
  normalizeForm, normalizeScope, normalizeBooking, normalizeFlow,
  formHasInput, flowHasContent, isExpired, dropOffers, restoreFlow,
  serializeFlow, parseFlow, flowFingerprint, pickRestoreSource, RESTORE_PRIORITY,
} from "./shippingFlowState.mjs";

const ROOT = new URL("../..", import.meta.url).pathname;
const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");

const T0 = 1_700_000_000_000;   // fester Zeitpunkt — kein Date.now() im Test

function vorgangMitAngeboten({ now = T0, shippingDate = "2026-08-10" } = {}) {
  return {
    v: FLOW_SCHEMA_VERSION,
    createdAt: now,
    updatedAt: now,
    step: "offers",
    shipment: {
      form: { ...normalizeForm(null, "shipment"), r_fullName: "Dora Beispiel", r_city: "Hamburg", weight: "5.5", packageCount: "2" },
      shippingDate,
      serviceFilter: "pickup",
      shippingModeFilter: "express",
      selectedPublicCarrierIds: ["dhl"],
      sortMode: "cheapest",
      vatMode: "gross",
      tariffs: [{ id: "t1", netPrice: 12.9 }, { id: "t2", netPrice: 18.4 }],
      publicCarriers: [{ id: "dhl", name: "DHL" }],
      selected: { id: "t1", netPrice: 12.9 },
      shipmentId: "ship-1",
      customs: { customsRequired: false },
      calculatedAt: now,
      scrollY: 420,
      updatedAt: now,
    },
    calculator: null,
    booking: { ...emptyBooking(), reference: "REF-1", updatedAt: now },
  };
}

/* ══════════ 1 — Modell und Konstanten ════════════════════════════════════ */

test("1 — der Speicherschlüssel trägt die Schemaversion", () => {
  assert.equal(FLOW_STORAGE_KEY, `ce_shipping_flow_v${FLOW_SCHEMA_VERSION}`);
  assert.equal(FLOW_TTL_MS, 60 * 60 * 1000, "Inaktivitätsfrist ist 60 Minuten");
  assert.deepEqual([...FLOW_SCOPES], ["shipment", "calculator"]);
});

test("2 — die Formularschlüssel decken genau die Felder der jeweiligen Seite ab", () => {
  // „Neue Sendung": beide Parteien vollständig + Paket + Client-Filter.
  for (const k of ["s_company", "s_fullName", "s_street", "s_addition", "s_zip", "s_city",
                   "s_country", "s_phone", "s_email", "r_company", "r_fullName", "r_street",
                   "r_addition", "r_zip", "r_city", "r_country", "r_phone", "r_email",
                   "packageCount", "weight", "length", "width", "height",
                   "max_price", "latestDeliveryDate"]) {
    assert.ok(SHIPMENT_FORM_KEYS.includes(k), `${k} fehlt im Sendungsformular`);
  }
  assert.equal(SHIPMENT_FORM_KEYS.length, 25);
  // Preisrechner: nur Route (Land + PLZ) und Paketdaten — keine Adressen.
  assert.deepEqual([...CALCULATOR_FORM_KEYS], [
    "from_country", "from_zip", "to_country", "to_zip",
    "packageCount", "weight", "length", "width", "height",
    "max_price", "latestDeliveryDate",
  ]);
  for (const k of CALCULATOR_FORM_KEYS) {
    assert.ok(!k.startsWith("s_") && !k.startsWith("r_"), `${k}: der Preisrechner führt keine Adressen`);
  }
});

test("3 — es werden keine sensiblen Felder gespeichert", () => {
  const alle = [...SHIPMENT_FORM_KEYS, ...CALCULATOR_FORM_KEYS, ...BOOKING_KEYS].join(" ").toLowerCase();
  for (const verboten of ["token", "password", "passwort", "jwt", "secret", "authorization",
                          "invoice_file", "document", "datei"]) {
    assert.ok(!alle.includes(verboten), `„${verboten}" darf nicht Teil des Vorgangs sein`);
  }
  // Zustimmungen werden nie unterstellt und Serverdaten nicht dupliziert.
  for (const verboten of ["agbAccepted", "prohibitedGoodsAccepted", "pickupWindow", "customsItems"]) {
    assert.ok(!BOOKING_KEYS.includes(verboten), `${verboten} gehört nicht in den Vorgang`);
  }
});

/* ══════════ 2 — Normalisierung als Schutzschicht ═════════════════════════ */

test("4 — unbekannte Formularschlüssel werden verworfen", () => {
  const form = normalizeForm({ r_city: "Hamburg", boesartig: "<script>", token: "geheim" }, "shipment");
  assert.equal(form.r_city, "Hamburg");
  assert.ok(!("boesartig" in form), "unbekannter Schlüssel wurde übernommen");
  assert.ok(!("token" in form), "fremder Schlüssel wurde übernommen");
  assert.equal(Object.keys(form).length, SHIPMENT_FORM_KEYS.length);
});

test("5 — Nicht-Zeichenketten im Formular werden zu leeren Zeichenketten", () => {
  const form = normalizeForm({ r_city: { a: 1 }, weight: 5.5, r_zip: null, r_street: ["x"] }, "shipment");
  assert.equal(form.r_city, "");
  assert.equal(form.weight, "5.5", "endliche Zahl wird als Zeichenkette übernommen");
  assert.equal(form.r_zip, "");
  assert.equal(form.r_street, "");
});

test("6 — ungültige Filter-, Sortier- und Datumswerte fallen auf den Standard", () => {
  const s = normalizeScope({
    serviceFilter: "erfunden", shippingModeFilter: 42, sortMode: "teuerste",
    vatMode: null, shippingDate: "10.08.2026", selectedPublicCarrierIds: "dhl",
    scrollY: -5, tariffs: "keine Liste",
  }, "shipment");
  assert.equal(s.serviceFilter, "all");
  assert.equal(s.shippingModeFilter, "all");
  assert.equal(s.sortMode, "recommended");
  assert.equal(s.vatMode, "net");
  assert.equal(s.shippingDate, null, "nur ISO-Datum wird übernommen");
  assert.deepEqual(s.selectedPublicCarrierIds, []);
  assert.equal(s.scrollY, 0);
  assert.deepEqual(s.tariffs, []);
});

test("7 — Carrier-IDs werden dedupliziert, getrimmt und begrenzt", () => {
  const s = normalizeScope({ selectedPublicCarrierIds: ["dhl", " dhl ", "", null, "ups", "ups"] }, "shipment");
  assert.deepEqual(s.selectedPublicCarrierIds, ["dhl", "ups"]);
  const viele = normalizeScope({ selectedPublicCarrierIds: Array.from({ length: 500 }, (_, i) => `c${i}`) }, "shipment");
  assert.equal(viele.selectedPublicCarrierIds.length, 64, "Liste wird begrenzt");
});

test("8 — eine fremde Schemaversion wird verworfen, nicht migriert", () => {
  assert.equal(normalizeFlow({ ...vorgangMitAngeboten(), v: 99 }), null);
  assert.equal(normalizeFlow({ ...vorgangMitAngeboten(), v: undefined }), null);
  assert.equal(normalizeFlow(null), null);
  assert.equal(normalizeFlow("kein Objekt"), null);
  assert.equal(normalizeFlow([]), null);
});

test("9 — fehlende Zeitstempel machen den Vorgang ungültig", () => {
  assert.equal(normalizeFlow({ ...vorgangMitAngeboten(), createdAt: null }), null);
  assert.equal(normalizeFlow({ ...vorgangMitAngeboten(), updatedAt: "gestern" }), null);
});

test("10 — der Buchungsschritt 3 wird nie wiederhergestellt", () => {
  assert.equal(normalizeBooking({ step: 3 }).step, 1, "Erfolgsbildschirm gehört zu einer abgeschlossenen Buchung");
  assert.equal(normalizeBooking({ step: 2 }).step, 2);
  assert.equal(normalizeBooking({ step: 99 }).step, 1);
  assert.equal(normalizeBooking({ labelFormat: "A3" }).labelFormat, "A4");
  assert.equal(normalizeBooking({ insuranceType: "gold" }).insuranceType, "none");
  assert.equal(normalizeBooking(null), null);
});

/* ══════════ 3 — „gibt es überhaupt einen Vorgang?" ═══════════════════════ */

test("11 — der reine Profil-Seed gilt nicht als Vorgang", () => {
  const nurAbsender = normalizeForm({
    s_company: "Muster GmbH", s_fullName: "Max Mustermann", s_zip: "10115",
    packageCount: "1", r_country: "DE",
  }, "shipment");
  assert.equal(formHasInput(nurAbsender, "shipment"), false,
    "Absenderdaten und Standardwerte allein sind noch kein Vorgang");
  assert.equal(formHasInput({ ...nurAbsender, r_city: "Hamburg" }, "shipment"), true);
  assert.equal(formHasInput({ ...nurAbsender, weight: "5" }, "shipment"), true);
  assert.equal(formHasInput({ ...nurAbsender, packageCount: "2" }, "shipment"), true);
});

test("12 — ein Vorgang ohne Inhalt wird nicht gespeichert", () => {
  assert.equal(flowHasContent(emptyFlow(T0)), false);
  assert.equal(flowHasContent(normalizeFlow(vorgangMitAngeboten())), true);
  // Auch ohne Formulareingabe: berechnete Angebote sind Inhalt.
  const nurAngebote = normalizeFlow({
    ...emptyFlow(T0),
    shipment: { ...emptyScope("shipment"), tariffs: [{ id: "t1" }] },
  });
  assert.equal(flowHasContent(nurAngebote), true);
});

/* ══════════ 4 — Ablaufregel ══════════════════════════════════════════════ */

test("13 — innerhalb der Frist bleibt alles erhalten", () => {
  const roh = vorgangMitAngeboten();
  const { flow, dropped } = restoreFlow(roh, { now: T0 + FLOW_TTL_MS - 1000, today: "2026-08-06" });
  assert.equal(dropped, null);
  assert.equal(flow.shipment.tariffs.length, 2);
  assert.equal(flow.shipment.shipmentId, "ship-1");
  assert.deepEqual(flow.shipment.selected, { id: "t1", netPrice: 12.9 });
  assert.equal(flow.shipment.serviceFilter, "pickup");
  assert.equal(flow.shipment.sortMode, "cheapest");
  assert.equal(flow.shipment.scrollY, 420);
  assert.equal(flow.shipment.form.r_fullName, "Dora Beispiel");
});

test("14 — nach der Frist bleiben Formular und Filter, Angebote gehen", () => {
  const { flow, dropped } = restoreFlow(vorgangMitAngeboten(), { now: T0 + FLOW_TTL_MS + 1, today: "2026-08-06" });
  assert.equal(dropped, DROP_REASON.EXPIRED);
  // Erhalten:
  assert.equal(flow.shipment.form.r_fullName, "Dora Beispiel");
  assert.equal(flow.shipment.form.weight, "5.5");
  assert.equal(flow.shipment.serviceFilter, "pickup");
  assert.equal(flow.shipment.shippingModeFilter, "express");
  assert.equal(flow.shipment.sortMode, "cheapest");
  assert.equal(flow.shipment.shippingDate, "2026-08-10");
  // Verworfen:
  assert.deepEqual(flow.shipment.tariffs, []);
  assert.deepEqual(flow.shipment.publicCarriers, []);
  assert.equal(flow.shipment.selected, null);
  assert.equal(flow.shipment.shipmentId, null);
  assert.equal(flow.shipment.customs, null);
  assert.equal(flow.shipment.calculatedAt, null);
  assert.equal(flow.shipment.scrollY, 0);
  assert.equal(flow.booking, null, "ohne Angebote ist der Buchungszustand gegenstandslos");
});

test("15 — ein Versanddatum in der Vergangenheit verwirft die Angebote", () => {
  const { flow, dropped } = restoreFlow(
    vorgangMitAngeboten({ shippingDate: "2026-08-01" }),
    { now: T0 + 1000, today: "2026-08-06" },   // innerhalb der Frist!
  );
  assert.equal(dropped, DROP_REASON.PAST_DATE);
  assert.deepEqual(flow.shipment.tariffs, []);
  assert.equal(flow.shipment.shipmentId, null);
  // Das Formular und das gewählte Datum bleiben stehen — der Kunde soll sehen,
  // was er gewählt hatte, und es bewusst korrigieren.
  assert.equal(flow.shipment.form.r_fullName, "Dora Beispiel");
  assert.equal(flow.shipment.shippingDate, "2026-08-01");
});

test("16 — dasselbe Datum wie heute ist NICHT abgelaufen", () => {
  const { dropped } = restoreFlow(
    vorgangMitAngeboten({ shippingDate: "2026-08-06" }),
    { now: T0 + 1000, today: "2026-08-06" },
  );
  assert.equal(dropped, null);
});

test("17 — ohne verworfene Angebote gibt es keinen Hinweis", () => {
  const ohneAngebote = { ...vorgangMitAngeboten(), shipment: { ...emptyScope("shipment"), form: normalizeForm({ r_city: "Hamburg" }, "shipment") } };
  const { dropped } = restoreFlow(ohneAngebote, { now: T0 + 1000, today: "2026-08-01" });
  assert.equal(dropped, null, "es war nichts zu verwerfen");
});

test("18 — jeder Verwerfensgrund hat einen verständlichen Satz, keinen Code", () => {
  for (const grund of Object.values(DROP_REASON)) {
    const text = droppedNotice(grund);
    assert.ok(typeof text === "string" && text.length > 40, `${grund}: kein Hinweistext`);
    assert.ok(!/[A-Z_]{4,}/.test(text), `${grund}: technischer Rohwert im Text`);
    assert.ok(text.includes("erhalten geblieben"), `${grund}: sagt nicht, was bleibt`);
  }
  assert.equal(droppedNotice("unbekannt"), null);
});

test("19 — isExpired und dropOffers arbeiten unabhängig", () => {
  const flow = normalizeFlow(vorgangMitAngeboten());
  assert.equal(isExpired(flow, T0), false);
  assert.equal(isExpired(flow, T0 + FLOW_TTL_MS), false, "genau auf der Grenze noch gültig");
  assert.equal(isExpired(flow, T0 + FLOW_TTL_MS + 1), true);
  const ohne = dropOffers(flow.shipment);
  assert.deepEqual(ohne.tariffs, []);
  assert.equal(ohne.form.r_fullName, "Dora Beispiel", "dropOffers fasst das Formular nicht an");
  assert.equal(dropOffers(null), null);
});

/* ══════════ 5 — Serialisierung ═══════════════════════════════════════════ */

test("20 — Serialisieren und Einlesen ergibt denselben Vorgang", () => {
  const flow = normalizeFlow(vorgangMitAngeboten());
  const zurueck = parseFlow(serializeFlow(flow));
  assert.deepEqual(zurueck, flow);
});

test("21 — beschädigte, fremde und leere Inhalte werden sicher verworfen", () => {
  for (const kaputt of ["", "{", "null", "[]", '"text"', "{unquoted:1}", '{"v":1}', "undefined"]) {
    assert.equal(parseFlow(kaputt), null, `„${kaputt}" hätte verworfen werden müssen`);
  }
  assert.equal(parseFlow(null), null);
  assert.equal(parseFlow(undefined), null);
  assert.equal(parseFlow(42), null);
  assert.equal(serializeFlow(null), null);
});

test("22 — ein zyklischer Vorgang bricht die Serialisierung nicht ab", () => {
  const zyklisch = normalizeFlow(vorgangMitAngeboten());
  zyklisch.shipment.customs = { self: null };
  zyklisch.shipment.customs.self = zyklisch.shipment.customs;
  assert.equal(serializeFlow(zyklisch), null, "wirft nicht, liefert null");
  assert.equal(flowFingerprint(zyklisch), "");
});

test("23 — der Fingerabdruck ignoriert Zeitstempel", () => {
  const a = normalizeFlow(vorgangMitAngeboten({ now: T0 }));
  const b = normalizeFlow({ ...vorgangMitAngeboten({ now: T0 }), updatedAt: T0 + 5000 });
  b.shipment.updatedAt = T0 + 5000;
  b.shipment.calculatedAt = T0 + 5000;
  assert.equal(flowFingerprint(a), flowFingerprint(b),
    "reine Zeitänderung darf keinen Schreibvorgang auslösen");
  // Eine echte Änderung schlägt dagegen durch.
  const c = normalizeFlow(vorgangMitAngeboten());
  c.shipment.form.r_city = "Bremen";
  assert.notEqual(flowFingerprint(a), flowFingerprint(c));
  assert.equal(flowFingerprint(null), "");
});

/* ══════════ 6 — Wiederherstellungs-Vorrang ═══════════════════════════════ */

test("24 — der Vorrang ist Entwurf > Prefill > Vorgang > Profil", () => {
  assert.deepEqual([...RESTORE_PRIORITY], ["draft", "prefill", "flow", "profile", "empty"]);
  assert.equal(pickRestoreSource({ hasDraft: true, hasPrefill: true, hasFlow: true }), "draft");
  assert.equal(pickRestoreSource({ hasPrefill: true, hasFlow: true }), "prefill");
  assert.equal(pickRestoreSource({ hasFlow: true }), "flow");
  assert.equal(pickRestoreSource({}), "profile");
});

/* ══════════ 7 — Verdrahtung im Quelltext ═════════════════════════════════ */

test("25 — der Provider liegt außerhalb der Routes und innerhalb des Auth-Kontexts", () => {
  // Kommentare entfernen: sie erklären die Montage und nennen dabei selbst
  // „<Routes>" — die Reihenfolge muss am echten JSX gemessen werden.
  const app = read("src/App.jsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const iProvider = app.indexOf("<ShippingFlowProvider>");
  const iRoutes = app.indexOf("<Routes>");
  assert.ok(iProvider > -1, "ShippingFlowProvider fehlt in App.jsx");
  assert.ok(iProvider < iRoutes, "der Provider muss AUSSERHALB von <Routes> liegen");
  assert.ok(app.includes("</ShippingFlowProvider>"), "Provider nicht geschlossen");
  // AuthProvider umschließt App (main.jsx) → der Provider liegt zwangsläufig darin.
  const main = read("src/main.jsx");
  assert.ok(main.indexOf("<AuthProvider>") < main.indexOf("<App />"),
    "AuthProvider muss App umschließen");
  // Und er darf NICHT zusätzlich in einem Layout montiert sein.
  for (const datei of ["src/components/layout/DashboardLayout.jsx", "src/pages/DashboardPage.jsx"]) {
    assert.ok(!read(datei).includes("ShippingFlowProvider"),
      `${datei}: der Provider gehört nicht in ein Layout — er würde beim Routenwechsel abgehängt`);
  }
});

test("26 — der Restore läuft NICHT über die feldweise Update-Funktion", () => {
  // Die zentrale Gefahr: upd() ruft invalidateResults() auf. Ein feldweiser
  // Restore würde die wiederhergestellten Angebote sofort wieder löschen.
  for (const datei of ["src/pages/NewShipmentPage.jsx", "src/pages/CalculatorPage.jsx"]) {
    const code = read(datei);
    const flowInit = code.match(/const flowInitRef = useRef\(undefined\);[\s\S]{0,600}?const flowInit = flowInitRef\.current;/);
    assert.ok(flowInit, `${datei}: Mount-once-Initialisierer fehlt`);
    assert.ok(!flowInit[0].includes("upd("), `${datei}: der Restore ruft upd() auf`);
    assert.ok(!flowInit[0].includes("setForm("), `${datei}: der Restore setzt Felder per Setter statt beim Mount`);
    // Tarife kommen aus dem Initialisierer, nicht aus einem Effekt.
    assert.ok(/const \[tariffs, setTariffs\][^\n]*flowInit/.test(code),
      `${datei}: tariffs wird nicht beim Mount wiederhergestellt`);
  }
});

test("27 — Abmeldung und Buchungserfolg löschen den Vorgang", () => {
  const auth = read("src/context/AuthContext.jsx");
  assert.ok(auth.includes("clearShippingFlowStorage()"), "Logout räumt den Speicher nicht ab");
  // Beide Wege: bewusstes Abmelden UND der zentrale 401/403-Handler.
  assert.equal((auth.match(/clearShippingFlowStorage\(\)/g) || []).length, 2,
    "sowohl logout() als auch der Auth-Fehlerhandler müssen bereinigen");
  const ctx = read("src/context/ShippingFlowContext.jsx");
  assert.ok(/warAngemeldetRef\.current && !authed/.test(ctx),
    "der Provider leert seinen Speicherzustand nicht bei der Abmeldung");
  const booking = read("src/pages/BookingPage.jsx");
  assert.ok(/setBooking\(d\); setStep\(3\);[\s\S]{0,400}?clearFlow\(\);/.test(booking),
    "nach erfolgreicher Buchung wird der Vorgang nicht gelöscht");
});

test("28 — es wird ausschließlich sessionStorage benutzt", () => {
  for (const datei of ["src/utils/shippingFlowStorage.js", "src/context/ShippingFlowContext.jsx",
                       "src/utils/shippingFlowState.mjs"]) {
    const code = read(datei);
    assert.ok(!code.includes("localStorage"), `${datei}: localStorage ist für den Vorgang unzulässig`);
  }
  const speicher = read("src/utils/shippingFlowStorage.js");
  assert.equal((speicher.match(/try \{/g) || []).length, 3,
    "jeder Speicherzugriff muss abgesichert sein (Privatmodus, volles Kontingent)");
  // Keine tabübergreifende Synchronisierung.
  for (const datei of ["src/context/ShippingFlowContext.jsx", "src/utils/shippingFlowStorage.js"]) {
    assert.ok(!/BroadcastChannel|addEventListener\(\s*["']storage/.test(read(datei)),
      `${datei}: keine tabübergreifende Synchronisierung`);
  }
});

test("29 — der Vorgang wird nur bei echter Änderung geschrieben", () => {
  const ctx = read("src/context/ShippingFlowContext.jsx");
  assert.ok(/letzterFingerRef/.test(ctx), "kein Schreibvergleich vorhanden");
  assert.ok(/if \(finger === letzterFingerRef\.current\) return;/.test(ctx),
    "identischer Snapshot muss den Schreibvorgang überspringen");
  // Gelesen wird genau einmal, beim Mount — sonst entstünde ein Lese-/Schreibkreis.
  assert.equal((ctx.match(/speicherLesen\(\)/g) || []).length, 1,
    "der Speicher darf nur beim Mount gelesen werden");
});

test("30 — die Prüflogik greift tatsächlich", () => {
  assert.ok(SHIPMENT_FORM_KEYS.length > 20 && CALCULATOR_FORM_KEYS.length > 8);
  assert.ok(read("src/utils/shippingFlowState.mjs").length > 4000);
  // Selbsttest der Normalisierung: ein gültiger Vorgang überlebt sie unverändert.
  const flow = normalizeFlow(vorgangMitAngeboten());
  assert.deepEqual(normalizeFlow(flow), flow, "Normalisierung ist nicht idempotent");
});

/* ══════════ 8 — Determinismus der Rücknavigation ═════════════════════════ */

test("31 — der sichtbare Zurück-Button hängt nicht an der Browser-History", () => {
  const booking = read("src/pages/BookingPage.jsx");
  const zurueck = booking.match(/const goBackToOffers = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(zurueck, "goBackToOffers nicht gefunden");
  const rumpf = zurueck[0];

  // Die eigentliche Zusicherung: KEINE History-Rückwärtsnavigation. Welcher
  // Dashboard-Bereich hinter dem vorherigen Eintrag steckt, ist nicht
  // garantiert — die Sidebar-Navigation setzt nur den lokalen page-State und
  // fasst die History gar nicht an.
  assert.ok(!/navigate\(\s*-\d/.test(rumpf), "der Zurück-Button navigiert über die Browser-History");
  assert.ok(!/history\.(back|go)\s*\(/.test(rumpf), "der Zurück-Button ruft history.back/go");

  // Stattdessen: gezielt auf den Angebotsvergleich, ersetzend.
  assert.ok(/navigate\(\s*["']\/dashboard["']/.test(rumpf), "kein gezieltes Ziel /dashboard");
  assert.ok(/page:\s*["']new["']/.test(rumpf), "der Zielbereich „new\" fehlt");
  assert.ok(/returnTarget:\s*["']offers["']/.test(rumpf), "das Rückkehrziel „offers\" fehlt");
  assert.ok(/replace:\s*true/.test(rumpf), "der Buchungseintrag wird nicht ersetzt");

  // Und es werden keine personenbezogenen Daten erneut in die History kopiert.
  for (const feld of ["form", "tariff", "recipient", "sender", "customs"]) {
    assert.ok(!new RegExp(`\\b${feld}\\b`).test(rumpf), `${feld} landet im History-State`);
  }
});

test("32 — der Dashboard-Eintrag trägt seinen Bereich, egal über welchen Weg", () => {
  const dash = read("src/pages/DashboardPage.jsx");
  // Der Synchronisierungs-Effekt hängt am page-State, nicht an location —
  // sonst liefe er im Kreis.
  const sync = dash.match(/useEffect\(\(\) => \{\s*\n\s*const aktuell = [\s\S]*?\}, \[page\]\);/);
  assert.ok(sync, "der History-Synchronisierungs-Effekt fehlt");
  assert.ok(/window\.history\.state\?\.usr/.test(sync[0]),
    "der Effekt liest einen veralteten location-Wert statt des Live-Zustands");
  assert.ok(/replace:\s*true/.test(sync[0]), "der Effekt legt einen neuen History-Eintrag an");
  assert.ok(/if \(aktuell\?\.page === page\) return;/.test(sync[0]), "kein Schreibvergleich → Kreislaufgefahr");

  // Startwert: Query vor History-State vor Übersicht.
  const wahl = dash.match(/function waehleStartbereich\(location\) \{[\s\S]*?\n\}/);
  assert.ok(wahl, "waehleStartbereich fehlt");
  assert.ok(wahl[0].indexOf("location.search") < wahl[0].indexOf("location.state"),
    "die Query muss Vorrang vor dem History-State haben");
  assert.ok(/return "overview";/.test(wahl[0]), "kein Fallback auf die Übersicht");

  // Der justBooked-Effekt darf den Bereich nicht mitlöschen. Kommentare zuvor
  // entfernen — einer erklärt genau diesen früheren Fehler und nennt ihn dabei.
  const dashOhneKommentare = dash.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/state:\s*\{\s*\}/.test(dashOhneKommentare), "ein Effekt leert den kompletten History-State");
  assert.ok(/const \{ justBooked, \.\.\.rest \} = location\.state;/.test(dash),
    "justBooked wird nicht gezielt entfernt");
});

test("33 — der Wechsel Angebote ↔ Buchung erzeugt keinen History-Kreislauf", () => {
  const ns = read("src/pages/NewShipmentPage.jsx");
  const handleBook = ns.match(/const handleBook = useCallback\(\(tariff\) => \{[\s\S]*?\}, \[[^\]]*\]\);/);
  assert.ok(handleBook, "handleBook nicht gefunden");
  // Erstweg pusht, Rückkehr ersetzt — sonst wächst die History je Zyklus.
  assert.ok(/returnTarget === "offers"/.test(handleBook[0]),
    "die Rückkehr aus der Buchung wird nicht erkannt");
  assert.ok(/replace: ausRueckkehr/.test(handleBook[0]),
    "der Wiedereinstieg in die Buchung ersetzt den Eintrag nicht");
  // Der ausgelaufene Marker ist vollständig weg.
  assert.ok(!/fromFlow:\s*true/.test(ns), "der Marker fromFlow lebt noch");
});

test("34 — das Scrollziel ist ein Element, kein Pixelwert", () => {
  const ns = read("src/pages/NewShipmentPage.jsx");
  assert.ok(/const offersRef = useRef\(null\);/.test(ns), "kein Ref auf den Angebotsbereich");
  assert.ok(/ref=\{offersRef\}/.test(ns), "der Ref hängt an keinem Element");
  assert.ok(/id="angebotsbereich"/.test(ns), "kein stabiler Anker am Angebotsbereich");
  assert.ok(/prefers-reduced-motion: reduce/.test(ns), "reduzierte Bewegung wird nicht beachtet");
  assert.ok(/scrollIntoView/.test(ns), "ohne gemerkte Position wird nicht gezielt gescrollt");
  assert.ok(/requestAnimationFrame/.test(ns), "es wird nicht auf das Rendern gewartet");
});
