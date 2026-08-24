// billingModeUx.test.mjs — Abrechnungsart im Kundenportal und im Adminportal (Paket 4).
//
// Reine Quelltext- und Funktionstests: kein Browser, kein Netz, keine Buchung.
// Run: node src/utils/billingModeUx.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  BILLING_MODES, DEFAULT_BILLING_MODE, BILLING_MODE_TEXT,
  billingMode, isConsolidatedBilling, buildBillingModePatch,
  bookingBillingNotice, formatCalendarDayDe, periodRangeLabel, consolidatedPeriodView,
} from "./billingModeView.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => fs.readFileSync(path.join(here, "..", p), "utf8");

// Quelltextzusicherungen werden auf KOMMENTARFREIEM Code gemessen — sonst belegt ein
// erklärender Kommentar eine Zusicherung, die der ausgeführte Code gar nicht trägt.
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const profileSrc = strip(src("components/dashboard/Profile.jsx"));
const bookingSrc = strip(src("pages/BookingPage.jsx"));
const adminSecSrc = strip(src("components/admin/BillingModeSection.jsx"));
const adminPageSrc = strip(src("pages/admin/AdminUserDetailPage.jsx"));
const clientSrc = strip(src("api/client.js"));
const adminApiSrc = strip(src("api/adminApi.js"));
const viewSrc = strip(src("utils/billingModeView.mjs"));

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✅ ${name}`); passed++; }
  catch (e) { console.log(`  ❌ ${name}`); console.log(`     ${e.message}`); failed++; }
}

console.log("\nAbrechnungsart — Kundenportal & Adminportal (Paket 4)\n");

// ── A. Auswertung ────────────────────────────────────────────────────────────
console.log("── A. Auswertung ──");

test("(A1) ein unbekannter oder fehlender Wert gilt als Einzelrechnung", () => {
  // Fail-safe: ein Backend vor diesem Paket liefert das Feld gar nicht, und die
  // Oberfläche darf daraus nie eine Sammelabrechnung behaupten.
  for (const u of [undefined, null, {}, { billing_mode: null }, { billing_mode: "" },
                   { billing_mode: "quartalsweise" }, { billing_mode: 7 }, { billing_mode: true }]) {
    assert.equal(billingMode(u), DEFAULT_BILLING_MODE);
    assert.equal(isConsolidatedBilling(u), false);
  }
  assert.equal(billingMode({ billing_mode: "consolidated_7d" }), "consolidated_7d");
  assert.equal(isConsolidatedBilling({ billing_mode: "consolidated_7d" }), true);
});

test("(A2) der Patch trägt GENAU einen Schlüssel und nie einen ungültigen Wert", () => {
  assert.deepEqual(buildBillingModePatch("consolidated_7d"), { billing_mode: "consolidated_7d" });
  assert.deepEqual(buildBillingModePatch("quartalsweise"), { billing_mode: "single" });
  assert.deepEqual(Object.keys(buildBillingModePatch("single")), ["billing_mode"]);
});

test("(A3) es gibt genau EINE Werteliste im Frontend", () => {
  assert.deepEqual(BILLING_MODES, ["single", "consolidated_7d"]);
  for (const [name, s] of [["Profile", profileSrc], ["Admin-Sektion", adminSecSrc],
                           ["Admin-API", adminApiSrc], ["Admin-Seite", adminPageSrc]]) {
    assert.ok(!/\["single",\s*"consolidated_7d"\]/.test(s), `${name} darf keine zweite Werteliste führen`);
  }
});

// ── B. Zeitraumdarstellung ───────────────────────────────────────────────────
console.log("\n── B. Zeitraumdarstellung ──");

test("(B1) formatiert nur echte Kalendertage, rät nie eines", () => {
  assert.equal(formatCalendarDayDe("2026-09-03"), "03.09.2026");
  for (const v of [null, undefined, "", "03.09.2026", "2026-9-3", 20260903, {}, []]) {
    assert.equal(formatCalendarDayDe(v), null);
  }
});

test("(B2) ein halber Zeitraum ist keine Aussage", () => {
  assert.equal(periodRangeLabel({ start: "2026-09-03", end: "2026-09-09" }), "03.09.2026 – 09.09.2026");
  assert.equal(periodRangeLabel({ start: "2026-09-03" }), null);
  assert.equal(periodRangeLabel({ end: "2026-09-09" }), null);
  assert.equal(periodRangeLabel(null), null);
});

test("(B3) 0 ist ein gültiger Betrag und wird nie zu „fehlt“", () => {
  const v = consolidatedPeriodView({
    period: { start: "2026-09-03", end: "2026-09-09", invoiceDate: "2026-09-10" },
    shipmentCount: 0, grossAmount: 0, shipmentsInEarlierPeriods: 0, shipments: [],
  });
  assert.equal(v.hasPeriod, true);
  assert.equal(v.shipmentCount, 0);
  assert.equal(v.grossAmount, 0);
  assert.equal(v.invoiceDateLabel, "10.09.2026");
});

test("(B4) eine kaputte oder fehlende Antwort erzeugt keine erfundene Zahl", () => {
  for (const bad of [null, undefined, {}, { period: null }, "kaputt", 42]) {
    const v = consolidatedPeriodView(bad);
    assert.equal(v.hasPeriod, false);
    assert.equal(v.shipmentCount, 0);
    assert.equal(v.grossAmount, 0);
    assert.deepEqual(v.shipments, []);
  }
});

test("(B5) ältere unfakturierte Zeiträume werden mitgezählt, nicht verschwiegen", () => {
  const v = consolidatedPeriodView({
    period: { start: "2026-09-10", end: "2026-09-16", invoiceDate: "2026-09-17" },
    shipmentCount: 2, grossAmount: 25.4, shipmentsInEarlierPeriods: 3, shipments: [{}, {}],
  });
  assert.equal(v.earlierCount, 3);
});

// ── C. Erfolgsbildschirm der Buchung ─────────────────────────────────────────
console.log("\n── C. Erfolgsbildschirm ──");

test("(C1) Sammelabrechnung zeigt KEINE Rechnungsnummer", () => {
  // Es gibt zu dieser Sendung noch keine Rechnung — eine Nummer oder ein Platzhalter
  // wäre eine Behauptung über einen Beleg, den es nicht gibt.
  const n = bookingBillingNotice({ billingMode: "consolidated_7d", invoiceNumber: null, dueDate: null });
  assert.equal(n.consolidated, true);
  assert.equal(n.showsInvoiceNumber, false);
  assert.ok(/Sammelrechnung/.test(n.text));
});

test("(C2) Einzelabrechnung zeigt die Nummer — aber nur, wenn es sie gibt", () => {
  assert.equal(bookingBillingNotice({ billingMode: "single", invoiceNumber: "CE-RE26-00001" }).showsInvoiceNumber, true);
  assert.equal(bookingBillingNotice({ billingMode: "single", invoiceNumber: null }).showsInvoiceNumber, false);
  assert.equal(bookingBillingNotice({}).consolidated, false);
  assert.equal(bookingBillingNotice(null).consolidated, false);
});

test("(C3) die Buchungsseite entscheidet das nicht selbst", () => {
  assert.ok(/bookingBillingNotice\(booking\)\.showsInvoiceNumber &&/.test(bookingSrc),
    "die Nummer muss an der zentralen Auswertung hängen");
  assert.ok(!/booking\.billingMode === "consolidated_7d"/.test(bookingSrc),
    "kein zweiter Modusvergleich im JSX");
});

test("(C4) bei Sammelabrechnung steht kein Rechnungs-Zustellhinweis", () => {
  // Er spricht über eine Rechnungs-E-Mail, die es zu dieser Sendung noch nicht gibt.
  assert.ok(/!bookingBillingNotice\(booking\)\.consolidated && \(\(\) => \{/.test(bookingSrc));
});

// ── D. Profilkarte ───────────────────────────────────────────────────────────
console.log("\n── D. Profilkarte ──");

test("(D1) gespeichert wird über denselben Profil-PATCH wie alle anderen Felder", () => {
  assert.ok(/apiFetch\(`\/kunde\/profil`, \{\s*method: "PATCH",\s*auth: true,\s*body: JSON\.stringify\(buildBillingModePatch\(mode\)\)/.test(profileSrc),
    "keine zweite Speicherstrecke");
  assert.ok(!/setAdminUserBillingMode|billing-mode/.test(profileSrc),
    "das Kundenportal darf den Adminendpunkt nicht aufrufen");
});

test("(D2) bei einem Fehler bleibt keine ungespeicherte Auswahl stehen", () => {
  const slice = profileSrc.slice(profileSrc.indexOf("const saveBillingMode"), profileSrc.indexOf("const renderBillingModeCard"));
  assert.equal((slice.match(/setBmMode\(serverBmMode\)/g) || []).length, 2,
    "Rückfall auf die Serverwahrheit im Fehler- UND im Ausnahmezweig");
});

test("(D3) die Serverwahrheit gewinnt nach jedem Laden", () => {
  assert.ok(/const serverBmMode = billingMode\(user\);/.test(profileSrc));
  assert.ok(/useEffect\(\(\) => \{ setBmMode\(serverBmMode\); \}, \[serverBmMode\]\);/.test(profileSrc));
});

test("(D4) die Zeitraumvorschau wird NUR bei Sammelabrechnung geholt", () => {
  assert.ok(/if \(serverBmMode !== "consolidated_7d"\) \{ setPeriodData\(null\); setPeriodError\(""\); return undefined; \}/.test(profileSrc),
    "ein Einzelrechnungskonto darf die Anfrage gar nicht erst stellen");
});

test("(D5) ein Ausfall der Vorschau bricht die Karte nicht", () => {
  const slice = profileSrc.slice(profileSrc.indexOf("const [periodData"), profileSrc.indexOf("const logoMeta"));
  assert.ok(/setPeriodError\(BILLING_MODE_TEXT\.periodLoadError\)/.test(slice));
  assert.ok(/catch \{/.test(slice), "auch ein geworfener Fehler muss abgefangen werden");
  // Und der laufende Abruf darf nach dem Unmount nichts mehr setzen.
  assert.ok(/let alive = true;/.test(slice) && /return \(\) => \{ alive = false; \};/.test(slice));
});

test("(D6) die Vorschau weist sich als Vorschau aus", () => {
  assert.ok(/Vorschau auf den laufenden Zeitraum/.test(BILLING_MODE_TEXT.periodPreviewNote));
  assert.ok(/^Voraussichtlich/.test(BILLING_MODE_TEXT.periodAmountLabel),
    "ein Betrag ohne Vorbehalt sähe aus wie eine feststehende Rechnungssumme");
  assert.ok(/BILLING_MODE_TEXT\.periodPreviewNote/.test(profileSrc));
});

test("(D7) die Karte sagt, was die Umstellung NICHT tut", () => {
  assert.ok(/Bereits gebuchte Sendungen behalten die Abrechnung/.test(BILLING_MODE_TEXT.changeNote));
  assert.ok(/BILLING_MODE_TEXT\.changeNote/.test(profileSrc));
  assert.ok(/BILLING_MODE_TEXT\.changeNote/.test(adminSecSrc), "im Adminportal ebenso");
});

test("(D8) dieselben Primitives wie die Lieferscheinauswahl — kein zweites Bauteil", () => {
  assert.ok(/className="dn-mode-fieldset"/.test(profileSrc));
  assert.ok(/name="billingMode"/.test(profileSrc));
  assert.ok(!/className="bm-mode-/.test(profileSrc), "keine eigene Auswahlklasse");
});

// ── E. Kundensprache ─────────────────────────────────────────────────────────
console.log("\n── E. Kundensprache ──");

test("(E1) kein technischer Bezeichner im sichtbaren Text", () => {
  // Gemessen an den WERTEN, nicht am Objekt: `consolidated_7d` ist der Schlüssel, unter
  // dem die Texte liegen — er steht nirgends auf dem Bildschirm.
  const collect = (v) => typeof v === "string" ? [v]
    : (v && typeof v === "object" ? Object.values(v).flatMap(collect) : []);
  const visible = collect(BILLING_MODE_TEXT).join(" | ");
  for (const t of ["billing_mode", "consolidated_7d", "invoice_shipments", "Scheduler",
                   "JUMiNGO", "Jumingo", "cron", "period_start"]) {
    assert.ok(!visible.includes(t), `„${t}" gehört nicht in Kundentext`);
  }
});

test("(E2) die Sammelrechnung erklärt ihre sofortige Fälligkeit", () => {
  const hint = BILLING_MODE_TEXT.options.consolidated_7d.hint;
  assert.ok(/sofort fällig/i.test(hint));
  assert.ok(/Zahlungsaufschub/.test(hint), "der Grund gehört dazu, sonst wirkt es wie eine Verschärfung");
  // Die DAUER des Zahlungsziels ist unverändert 7 Tage; geändert hat sich allein der
  // Bezugspunkt — die Frist läuft ab Rechnungserhalt statt ab Rechnungsdatum.
  const einzel = BILLING_MODE_TEXT.options.single.hint;
  assert.ok(/7 Tagen/.test(einzel), "die Einzelrechnung nennt weiterhin ihr Zahlungsziel");
  assert.ok(/nach Rechnungserhalt/.test(einzel), "der Fristbeginn fehlt");
  assert.ok(!/nach Rechnungsdatum/.test(einzel), "der alte Fristbeginn steht noch");
  // Auch die Sammelrechnung bezieht ihre sofortige Fälligkeit auf den Erhalt.
  assert.ok(/Rechnungserhalt/.test(hint), "die Sammelrechnung nennt den Bezugspunkt nicht");
});

// ── F. Adminportal ───────────────────────────────────────────────────────────
console.log("\n── F. Adminportal ──");

test("(F1) der Adminendpunkt sendet AUSSCHLIESSLICH den Modus", () => {
  const slice = adminApiSrc.slice(adminApiSrc.indexOf("export function setAdminUserBillingMode"));
  assert.ok(/body: JSON\.stringify\(\{ billingMode \}\)/.test(slice));
  assert.ok(!/userId:|adminId|confirmedBy/.test(slice.slice(0, slice.indexOf("}"))));
  assert.ok(/if \(!ADMIN_BILLING_MODES\.includes\(billingMode\)\)/.test(slice),
    "ein ungültiger Wert wird gar nicht erst gesendet");
});

test("(F2) der manuelle Lauf nimmt keine Parameter entgegen", () => {
  const slice = adminApiSrc.slice(adminApiSrc.indexOf("export function runConsolidatedInvoicing"));
  assert.ok(/export function runConsolidatedInvoicing\(\)/.test(slice),
    "kein Konto und kein Stichtag von außen");
  assert.ok(!/body:/.test(slice.slice(0, 320)));
});

test("(F3) die Adminkarte entscheidet nichts — sie zeigt nur an", () => {
  assert.ok(!/apiFetch|fetch\(/.test(adminSecSrc), "der Request gehört in die Seite, nicht in die Karte");
  assert.ok(/onChange && onChange\(e\.target\.value\)/.test(adminSecSrc));
});

test("(F4) der Zustand ist doppelt codiert, nie allein farblich", () => {
  assert.ok(/badge badge--neutral/.test(adminSecSrc) && /badge-dot/.test(adminSecSrc));
  assert.ok(/\{opt\.label\}/.test(adminSecSrc), "der Badge trägt Text, nicht nur einen Punkt");
});

test("(F5) ein No-Op erzeugt keine Erfolgsmeldung", () => {
  assert.ok(/if \(bmBusy \|\| !user \|\| next === readBillingMode\(user\)\) return;/.test(adminPageSrc));
});

test("(F6) übernommen wird die Serverwahrheit, nicht der lokal gewählte Wert", () => {
  assert.ok(/setUser\(\(prev\) => \(prev \? \{ \.\.\.prev, billing_mode: d\.billingMode \} : prev\)\);/.test(adminPageSrc));
});

// ── G. Grenzen ───────────────────────────────────────────────────────────────
console.log("\n── G. Grenzen ──");

test("(G1) das Frontend rechnet keinen Zeitraum und keinen Betrag", () => {
  assert.ok(!/86400000|setDate\(|addDays|Date\.now\(\)/.test(viewSrc),
    "kein Datumsrechnen im Frontend — Zeiträume kommen fertig vom Server");
  assert.ok(!/\* 0\.19|vatRate|markup/i.test(viewSrc), "keine Preis- oder Steuerlogik");
});

test("(G2) der Vorschau-Endpunkt ist read-only und ohne Konto-ID", () => {
  const slice = clientSrc.slice(clientSrc.indexOf("export async function getCurrentConsolidatedPeriod"));
  assert.ok(/apiFetch\(`\/kunde\/consolidated-invoice\/current`, \{ auth: true \}\)/.test(slice));
  assert.ok(!/method: "POST"|method: "PUT"|method: "DELETE"/.test(slice.slice(0, 400)));
  assert.ok(!/\$\{userId\}|user\.id/.test(slice.slice(0, 400)),
    "das Konto steht im JWT — eine ID im Pfad wäre eine zweite Zugriffsklasse");
});

test("(G3) nichts wird persistiert", () => {
  for (const [name, s] of [["view", viewSrc], ["Profile", profileSrc], ["Admin-Sektion", adminSecSrc]]) {
    assert.ok(!/localStorage|sessionStorage/.test(s), `${name} darf die Abrechnungsart nicht speichern`);
  }
});

console.log(`\n${"═".repeat(50)}`);
console.log(`${passed} bestanden, ${failed} fehlgeschlagen`);
console.log(`${"═".repeat(50)}\n`);
if (failed > 0) process.exit(1);
