// Individueller Kundenaufschlag (Adminbereich) — Tests.
//
// Zwei Ebenen, weil das Repo bewusst keine React-Render-Testinfrastruktur hat
// (devDependencies: nur playwright — siehe noCreditDisplay.test.mjs):
//   A) Verhalten: die reine Logik aus utils/customerMarkup.mjs wird direkt
//      ausgeführt (Prozentvertrag, Normalisierung, Gate, Fehlerübersetzung).
//   B) Contract: der Quelltext der beteiligten Seiten/Komponenten/API-Wrapper
//      wird geprüft — dort, wo die Aussage am Rendering bzw. am Request hängt
//      (nur ein Feld im Body, Button während des Requests gesperrt, Pfad ohne
//      /api-Präfix, kein Logging). Ein Selbsttest am Ende stellt sicher, dass
//      die Prüflogik selbst greift und die Aussagen nicht vakuum-wahr sind.
//
// Run: node --test src/utils/customerMarkup.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

import {
  APPROVAL_ERRORS,
  CODE_INVALID_EXPRESS_PERCENT,
  parseExpressMarkupInput,
  expressMarkupInputValue,
  expressMarkupDisplay,
  expressUsesFallback,
  effectiveExpressLine,
  expressMarkupHasChange,
  markupFormHasChange,
  canSaveMarkupForm,
  selectPriceMarkup as selectPM,
  BADGE_CONFIRMED,
  BADGE_UNCONFIRMED,
  CODE_CONFIRMATION_REQUIRED,
  CODE_INVALID_PERCENT,
  MARKUP_SAVE_ERRORS,
  MARKUP_TEXTS,
  approvalError,
  approvalGate,
  approvalGateExplanation,
  buildPriceMarkupBody,
  canSaveMarkup,
  canSubmitMarkup,
  confirmedMarkupLine,
  formatConfirmedBy,
  formatMarkupDateTime,
  formatMarkupPercent,
  isMarkupConfirmed,
  legacyApprovedNotice,
  markupActionLabel,
  markupBadge,
  markupInputValue,
  markupSaveError,
  markupSuccessMessage,
  parseMarkupInput,
  priceMarkupFields,
  selectPriceMarkup,
} from "./customerMarkup.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..");
const read = (rel) => readFileSync(join(SRC, rel), "utf8");

// Kommentare entfernen: erklärender Text darf alles benennen — geprüft wird,
// was tatsächlich ausgeführt bzw. gerendert wird.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

const apiSrc       = stripComments(read("api/adminApi.js"));
const detailSrc    = stripComments(read("pages/admin/AdminUserDetailPage.jsx"));
const listSrc      = stripComments(read("pages/admin/AdminUsersPage.jsx"));
const sectionSrc   = stripComments(read("components/admin/CustomerMarkupSection.jsx"));
const approveSrc   = stripComments(read("components/admin/CustomerApprovalCard.jsx"));
const markupSrc    = stripComments(read("utils/customerMarkup.mjs"));

function collectSources(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { out.push(...collectSources(full)); continue; }
    if (!/\.(jsx?|mjs)$/.test(entry)) continue;
    if (/\.test\.mjs$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}
const PRODUCTION_FILES = collectSources(SRC);
const NEW_FILES = [
  "utils/customerMarkup.mjs",
  "components/admin/CustomerMarkupSection.jsx",
  "components/admin/CustomerApprovalCard.jsx",
];

// Beispielantworten exakt nach Backend-Vertrag.
const UNCONFIRMED = {
  userId: 123, priceMarkupPercent: 20, confirmed: false,
  confirmedAt: null, confirmedBy: null, updatedAt: null,
};
const CONFIRMED = {
  userId: 123, priceMarkupPercent: 17.5, confirmed: true,
  confirmedAt: "2026-07-28T20:00:00.000Z", confirmedBy: 7, updatedAt: "2026-07-28T20:00:00.000Z",
};

// ═══ A) Laden und Darstellung (1–7) ══════════════════════════════════════════

test("1 — Pricing-Daten werden beim Öffnen der Kundendetailseite geladen", () => {
  // Eigener Request-Pfad über den API-Service, an die Route-ID gebunden, mit
  // Abbruch beim Verlassen der Seite.
  assert.match(apiSrc, /export function getAdminCustomerPriceMarkup\(userId, \{ signal \} = \{\}\)/);
  assert.match(detailSrc, /import \{[\s\S]*?getAdminCustomerPriceMarkup[\s\S]*?\} from "\.\.\/\.\.\/api\/adminApi"/);
  assert.match(detailSrc, /const loadPricing = useCallback\(async \(signal\) => \{/);
  assert.match(detailSrc, /await getAdminCustomerPriceMarkup\(id, \{ signal \}\)/);
  // Beim Mount ausgelöst und bei Kundenwechsel erneut (loadPricing hängt an id).
  assert.match(detailSrc, /useEffect\(\(\) => \{\s*const ctrl = typeof AbortController[\s\S]*?loadPricing\(ctrl\?\.signal\)[\s\S]*?\}, \[loadPricing\]\)/);
  assert.match(detailSrc, /\}, \[id\]\);/, "loadPricing ist an die Route-ID gebunden");
});

test("2 — unbestätigter Wert wird als „noch nicht bestätigt“ dargestellt", () => {
  const p = selectPriceMarkup(UNCONFIRMED);
  assert.equal(p.confirmed, false);
  assert.equal(isMarkupConfirmed(p), false);
  assert.deepEqual(markupBadge(p), ["badge-yellow", BADGE_UNCONFIRMED]);
  assert.equal(BADGE_UNCONFIRMED, "Noch nicht bestätigt");
  // Der Hinweis benennt, was vor der Freischaltung fehlt.
  assert.equal(MARKUP_TEXTS.confirmRequired,
    "Vor der Freischaltung muss der Kundenaufschlag festgelegt und bestätigt werden.");
  // Fail-closed: fehlendes/ungültiges `confirmed` gilt nie als bestätigt.
  for (const v of [undefined, null, "true", 1, "yes", {}]) {
    assert.equal(selectPriceMarkup({ ...UNCONFIRMED, confirmed: v }).confirmed, false, `confirmed=${String(v)}`);
  }
});

test("3 — der gespeicherte Standardwert 20 gilt NICHT als individuell bestätigt", () => {
  const p = selectPriceMarkup({ userId: 1, priceMarkupPercent: 20, confirmed: false, confirmedAt: null, confirmedBy: null, updatedAt: null });
  assert.equal(p.priceMarkupPercent, 20, "der Wert wird angezeigt …");
  assert.equal(isMarkupConfirmed(p), false, "… aber nicht als bestätigt");
  assert.deepEqual(markupBadge(p), ["badge-yellow", BADGE_UNCONFIRMED]);
  assert.equal(confirmedMarkupLine(p), null, "keine „Bestätigter Kundenaufschlag“-Zeile");
  assert.equal(markupActionLabel(p), "Aufschlag bestätigen", "die Aktion heißt bestätigen, nicht aktualisieren");
  // Der Badge hängt ausschließlich an `confirmed` — nie am Wert selbst.
  assert.deepEqual(markupBadge(selectPriceMarkup({ ...UNCONFIRMED, priceMarkupPercent: 20.0, confirmed: true })),
    ["badge-green", BADGE_CONFIRMED]);
});

test("4 — bestätigter Wert wird vollständig angezeigt", () => {
  const p = selectPriceMarkup(CONFIRMED);
  assert.equal(p.priceMarkupPercent, 17.5);
  assert.equal(p.confirmed, true);
  assert.deepEqual(markupBadge(p), ["badge-green", BADGE_CONFIRMED]);
  assert.equal(BADGE_CONFIRMED, "Bestätigt");
  assert.equal(formatMarkupPercent(p.priceMarkupPercent), "17,50 %");
  assert.equal(formatConfirmedBy(p.confirmedBy), "Admin #7");
  assert.equal(confirmedMarkupLine(p), "Bestätigter Kundenaufschlag: 17,50 %");
  assert.equal(markupActionLabel(p), "Aufschlag aktualisieren");
});

test("5 — Prozentwerte werden als „20,00 %“ formatiert", () => {
  assert.equal(formatMarkupPercent(20), "20,00 %");
  assert.equal(formatMarkupPercent(17.5), "17,50 %");
  assert.equal(formatMarkupPercent(0.2), "0,20 %");
  assert.equal(formatMarkupPercent(0), "0,00 %");
  assert.equal(formatMarkupPercent(100), "100,00 %");
  assert.equal(formatMarkupPercent(null), "—");
  assert.equal(formatMarkupPercent(undefined), "—");
  assert.equal(formatMarkupPercent("abc"), "—");
  // Keine Rate-/Multiplikator-Darstellung.
  for (const v of [20, 17.5, 0.2]) {
    const out = formatMarkupPercent(v);
    assert.equal(/rate|multiplier|faktor/i.test(out), false, `„${out}“ darf keine Rate-Schreibweise sein`);
    assert.match(out, / %$/, "der Prozentwert trägt immer das %-Zeichen");
    assert.equal(out.includes("."), false, "de-DE nutzt das Komma als Dezimaltrennzeichen");
  }
});

test("6 — Zeitstempel werden nach de-DE formatiert", () => {
  const out = formatMarkupDateTime("2026-07-28T20:00:00.000Z");
  assert.match(out, /^\d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} Uhr$/, `unerwartetes Format: ${out}`);
  assert.ok(out.includes("2026"));
  assert.ok(out.includes("28.07.2026") || out.includes("29.07.2026"), `Tagesdatum de-DE erwartet: ${out}`);
  assert.equal(/AM|PM|\//.test(out), false, "kein en-US-Format");
  // Datumsteil ist identisch zu toLocaleDateString("de-DE") derselben Zeit.
  const d = new Date("2026-07-28T20:00:00.000Z");
  assert.ok(out.startsWith(d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })));
  // Leere / ungültige Werte kippen nie in „Invalid Date“.
  for (const v of [null, undefined, "", "kein-datum"]) assert.equal(formatMarkupDateTime(v), "—", String(v));
  assert.equal(formatConfirmedBy(null), "—");
});

test("7 — es werden ausschließlich die Vertragsfelder übernommen", () => {
  const leaky = {
    ...CONFIRMED,
    supplierNet: 12.34, marginRate: 0.2, internalPricing: { base: 9 },
    token: "geheim", password_hash: "x", pricingCore: "y", costPrice: 1,
  };
  const p = selectPriceMarkup(leaky);
  assert.deepEqual(Object.keys(p).sort(), priceMarkupFields().sort());
  assert.deepEqual(priceMarkupFields().sort(),
    ["confirmed", "confirmedAt", "confirmedBy", "effectiveExpressPriceMarkupPercent",
     "expressMarkupUsesFallback", "expressPriceMarkupPercent", "priceMarkupPercent",
     "updatedAt", "userId"].sort());
  const asJson = JSON.stringify(p);
  for (const forbidden of ["supplierNet", "marginRate", "internalPricing", "token", "password_hash", "pricingCore", "costPrice"]) {
    assert.equal(asJson.includes(forbidden), false, `${forbidden} darf nicht durchgereicht werden`);
  }
  // Und die Oberfläche liest niemals direkt aus einer rohen Antwort.
  assert.equal(/pricing\.(?!userId|priceMarkupPercent|expressPriceMarkupPercent|effectiveExpressPriceMarkupPercent|expressMarkupUsesFallback|confirmed|confirmedAt|confirmedBy|updatedAt)/.test(sectionSrc), false,
    "die Sektion liest nur Vertragsfelder");
  assert.equal(selectPriceMarkup(null), null);
  assert.equal(selectPriceMarkup([1, 2]), null);
});

// ═══ B) Eingabe und Normalisierung (8–18) ════════════════════════════════════

test("8 — „20“ wird als 20 % akzeptiert", () => {
  const r = parseMarkupInput("20");
  assert.equal(r.ok, true);
  assert.equal(r.value, 20);
  assert.equal(formatMarkupPercent(r.value), "20,00 %");
});

test("9 — „17,5“ wird zu 17,5 % normalisiert (deutsches Komma)", () => {
  const r = parseMarkupInput("17,5");
  assert.equal(r.ok, true);
  assert.equal(r.value, 17.5);
  assert.equal(parseMarkupInput("17.5").value, 17.5, "Punktschreibweise ergibt denselben Wert");
  assert.equal(formatMarkupPercent(r.value), "17,50 %");
});

test("10 — „0“ wird akzeptiert", () => {
  const r = parseMarkupInput("0");
  assert.equal(r.ok, true);
  assert.equal(r.value, 0);
  assert.equal(parseMarkupInput("0,00").value, 0);
});

test("11 — „100“ wird akzeptiert", () => {
  assert.equal(parseMarkupInput("100").ok, true);
  assert.equal(parseMarkupInput("100").value, 100);
  assert.equal(parseMarkupInput("100,00").ok, true);
  assert.equal(parseMarkupInput("100,01").ok, false, "knapp über der Grenze ist unzulässig");
});

test("12 — „0,20“ bleibt 0,20 % und wird NIE zu 20 %", () => {
  const r = parseMarkupInput("0,20");
  assert.equal(r.ok, true);
  assert.equal(r.value, 0.2);
  assert.notEqual(r.value, 20);
  assert.equal(formatMarkupPercent(r.value), "0,20 %");
  assert.deepEqual(buildPriceMarkupBody("0,20"), { priceMarkupPercent: 0.2 });
  // Auch die Punktschreibweise und der Rückweg über die Vorbelegung bleiben stabil.
  assert.equal(parseMarkupInput("0.20").value, 0.2);
  assert.equal(markupInputValue(0.2), "0,20");
  assert.equal(parseMarkupInput(markupInputValue(0.2)).value, 0.2, "Anzeige → Eingabe → Wert bleibt 0,2");
  assert.equal(parseMarkupInput(markupInputValue(20)).value, 20, "und 20 bleibt 20");
});

test("13 — negative Werte werden blockiert", () => {
  for (const v of ["-1", "-0,5", "-20", "-100"]) {
    const r = parseMarkupInput(v);
    assert.equal(r.ok, false, `${v} muss abgelehnt werden`);
    assert.equal(r.code, "range");
    assert.equal(canSubmitMarkup(v), false);
    assert.equal(buildPriceMarkupBody(v), null);
  }
  assert.equal(parseMarkupInput(-5).ok, false, "auch als Zahl");
});

test("14 — Werte über 100 werden blockiert", () => {
  for (const v of ["101", "100,01", "999", "1000"]) {
    const r = parseMarkupInput(v);
    assert.equal(r.ok, false, `${v} muss abgelehnt werden`);
    assert.equal(r.code, "range");
    assert.equal(buildPriceMarkupBody(v), null);
  }
});

test("15 — mehr als zwei Nachkommastellen werden blockiert (keine stille Rundung)", () => {
  for (const v of ["20,123", "17,555", "0,001", "99.9999"]) {
    const r = parseMarkupInput(v);
    assert.equal(r.ok, false, `${v} muss abgelehnt werden`);
    assert.equal(r.code, "decimals");
    assert.equal(r.value, null, "es wird kein gerundeter Ersatzwert geliefert");
    assert.equal(buildPriceMarkupBody(v), null);
  }
  assert.equal(parseMarkupInput("20,12").ok, true, "genau zwei Nachkommastellen bleiben zulässig");
});

test("16 — Texteingaben werden blockiert", () => {
  for (const v of ["20 Prozent", "zwanzig", "20%", "2e1", "1e2", "0x14", "20,5,5", "1 0", "2 0", "abc", "20 ", "-"]) {
    const r = parseMarkupInput(v);
    assert.equal(r.ok, v === "20 ", `${JSON.stringify(v)} → ${r.ok}`); // "20 " wird nur getrimmt
    if (v !== "20 ") assert.equal(buildPriceMarkupBody(v), null);
  }
  // Exponentialschreibweise ist nie zulässig — auch nicht als Zahl.
  assert.equal(parseMarkupInput("2e1").ok, false);
  assert.equal(parseMarkupInput(Infinity).ok, false);
  assert.equal(parseMarkupInput(NaN).ok, false);
  assert.equal(parseMarkupInput({ priceMarkupPercent: 20 }).ok, false, "Objekte werden nie interpretiert");
});

test("17 — leere Eingabe wird blockiert", () => {
  for (const v of ["", "   ", null, undefined]) {
    const r = parseMarkupInput(v);
    assert.equal(r.ok, false);
    assert.equal(r.code, "empty");
    assert.equal(buildPriceMarkupBody(v), null);
  }
});

test("18 — der Button ist bei ungültigem Wert deaktiviert", () => {
  assert.equal(canSubmitMarkup("20"), true);
  for (const v of ["", "-1", "101", "20,123", "abc"]) assert.equal(canSubmitMarkup(v), false, v);
  // Der Disabled-State hängt genau an dieser Prüfung (und am laufenden Request).
  assert.match(sectionSrc, /const parsed = useMemo\(\(\) => parseMarkupInput\(draft\), \[draft\]\)/);
  assert.match(sectionSrc, /type="submit"[\s\S]{0,300}disabled=\{busy \|\| !parsed\.ok \|\| !expressParsed\.ok \|\| !hasChange\}/);
  // Und auch das Absenden selbst prüft noch einmal.
  assert.match(sectionSrc, /if \(busy \|\| !parsed\.ok \|\| !expressParsed\.ok \|\| !hasChange \|\| typeof onSave !== "function"\) return;/);
  // Zusätzlich: ein bereits bestätigter, unveränderter Wert löst keinen Request aus.
  assert.equal(canSaveMarkup({ confirmed: true, priceMarkupPercent: 20 }, "20,00"), false, "keine Änderung → kein Request");
  assert.equal(canSaveMarkup({ confirmed: true, priceMarkupPercent: 20 }, "21"), true, "echte Änderung → absendbar");
  assert.equal(canSaveMarkup({ confirmed: false, priceMarkupPercent: 20 }, "20,00"), true, "unbestätigt → Bestätigung ist die Aktion");
});

// ═══ C) PUT / Bestätigung (19–29) ════════════════════════════════════════════

test("19 — der Request enthält ausschließlich die beiden Aufschlagsfelder", () => {
  // Ohne zweites Argument bleibt der Body byte-identisch zum bisherigen Vertrag —
  // ein Aufrufer ohne Expressunterstützung löscht den Expresswert dadurch NICHT.
  const body = buildPriceMarkupBody("20");
  assert.deepEqual(Object.keys(body), ["priceMarkupPercent"]);
  // Mit Expressfeld: genau zwei Schlüssel, nie mehr.
  assert.deepEqual(Object.keys(buildPriceMarkupBody("20", "40")),
    ["priceMarkupPercent", "expressPriceMarkupPercent"]);
  assert.deepEqual(buildPriceMarkupBody("20", "40"), { priceMarkupPercent: 20, expressPriceMarkupPercent: 40 });
  // Leeres Expressfeld → ausdrücklich null (Fallback), NIE ein leerer String.
  assert.deepEqual(buildPriceMarkupBody("20", ""), { priceMarkupPercent: 20, expressPriceMarkupPercent: null });
  assert.equal(JSON.stringify(buildPriceMarkupBody("20", "")), '{"priceMarkupPercent":20,"expressPriceMarkupPercent":null}');
  assert.deepEqual(body, { priceMarkupPercent: 20 });
  assert.equal(JSON.stringify(body), '{"priceMarkupPercent":20}');
  // Der Wrapper baut den Body ausschließlich hierüber — keine zweite Stelle.
  assert.match(apiSrc, /const body = buildPriceMarkupBody\(priceMarkupPercent, expressRaw\);/);
  assert.match(apiSrc, /body: JSON\.stringify\(body\),/);
  assert.equal(/JSON\.stringify\(\{[^}]*priceMarkupPercent/.test(apiSrc), false,
    "kein zweiter, handgebauter Body");
});

test("20 — es wird niemals confirmedBy (oder ein anderes Auditfeld) gesendet", () => {
  for (const input of ["20", 17.5, "0,20", 100, "0"]) {
    const body = buildPriceMarkupBody(input);
    assert.deepEqual(Object.keys(body), ["priceMarkupPercent"], `Body für ${input}`);
    const json = JSON.stringify(body);
    for (const f of ["confirmedBy", "confirmed_by", "confirmedAt", "confirmed", "updatedAt", "userId", "user_id"]) {
      assert.equal(json.includes(f), false, `${f} darf nicht im Body stehen`);
    }
  }
  // Und im Quelltext des PUT-Wrappers taucht kein Auditfeld auf.
  const putBlock = apiSrc.slice(apiSrc.indexOf("export function updateAdminCustomerPriceMarkup"));
  const put = putBlock.slice(0, putBlock.indexOf("\n}") + 2);
  for (const f of ["confirmedBy", "confirmedAt", "confirmed", "updatedAt"]) {
    assert.equal(put.includes(f), false, `${f} darf im PUT-Wrapper nicht vorkommen`);
  }
});

test("21 — ein vollständiges Benutzerobjekt kann nicht gesendet werden", () => {
  const user = { id: 123, email: "kunde@example.com", company_name: "ACME", priceMarkupPercent: 20, role: "customer" };
  assert.equal(buildPriceMarkupBody(user), null, "Objekte werden nie zu einem Body");
  assert.equal(buildPriceMarkupBody([20]), null);
  assert.equal(buildPriceMarkupBody(true), null);
  // Der Wrapper sendet gar nicht erst, wenn kein gültiger Body entsteht.
  assert.match(apiSrc, /if \(!body\) return Promise\.reject\(new Error\("invalid_price_markup_percent"\)\);/);
  // Die Seite übergibt ausschließlich den geparsten Zahlenwert.
  assert.match(sectionSrc, /onSave\(parsed\.value, expressDraft\);/);
  assert.match(detailSrc, /await updateAdminCustomerPriceMarkup\(id, percent, expressRaw\)/);
  // Auch der Expresswert kann nie als Objekt/Array in den Body geraten.
  assert.equal(buildPriceMarkupBody("20", { a: 1 }), null);
  assert.equal(buildPriceMarkupBody("20", [40]), null);
  assert.equal(buildPriceMarkupBody("20", true), null);
});

test("22 — der Button wird während des Requests deaktiviert und zeigt den Ladezustand", () => {
  assert.match(sectionSrc, /disabled=\{busy \|\| !parsed\.ok \|\| !expressParsed\.ok \|\| !hasChange\}/);
  assert.match(sectionSrc, /aria-busy=\{busy \? "true" : undefined\}/);
  assert.match(sectionSrc, /busy\s*\n?\s*\?\s*<><span className="spinner spinner-dark" \/> \{markupActionBusyLabel\(pricing\)\}/);
  // Auch das Eingabefeld ist währenddessen gesperrt.
  assert.match(sectionSrc, /disabled=\{busy\}/);
  // Die Seite setzt den Busy-State vor dem Request und räumt ihn im finally auf.
  assert.match(detailSrc, /setSaveBusy\(true\);[\s\S]*?await updateAdminCustomerPriceMarkup/);
  assert.match(detailSrc, /finally \{\s*saveInFlight\.current = false;\s*setSaveBusy\(false\);/);
});

test("23 — ein Doppelklick erzeugt nur einen Request", () => {
  // Der Ref-Guard greift synchron — auch bevor React den Busy-State gerendert hat.
  assert.match(detailSrc, /const saveInFlight = useRef\(false\);/);
  assert.match(detailSrc, /const saveMarkup = async \(percent, expressRaw\) => \{\s*if \(saveInFlight\.current\) return;/);
  assert.match(detailSrc, /saveInFlight\.current = true;/);
  assert.match(detailSrc, /const approveInFlight = useRef\(false\);/);
  assert.match(detailSrc, /const confirmApprove = async \(\) => \{\s*if \(approveInFlight\.current\) return;/);
  assert.match(detailSrc, /approveInFlight\.current = true;/);
  // Und die Kundenliste blockiert die zweite Übermittlung ebenfalls.
  assert.match(listSrc, /if \(actionBusy\) return;/);

  // Selbsttest des Guard-Musters: zwei sofortige Aufrufe → genau ein Request.
  let requests = 0;
  const inFlight = { current: false };
  const run = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try { requests += 1; await Promise.resolve(); } finally { inFlight.current = false; }
  };
  const both = Promise.all([run(), run()]);
  return both.then(() => assert.equal(requests, 1, "nur ein Request trotz Doppelklick"));
});

test("24 — eine erfolgreiche Bestätigung aktualisiert die Ansicht", () => {
  // Antwort des PUT wird über denselben Selektor übernommen.
  const after = selectPriceMarkup({
    userId: 123, priceMarkupPercent: 20, confirmed: true,
    confirmedAt: "2026-07-28T20:00:00.000Z", confirmedBy: 7, updatedAt: "2026-07-28T20:00:00.000Z",
  });
  assert.equal(isMarkupConfirmed(after), true);
  assert.deepEqual(markupBadge(after), ["badge-green", BADGE_CONFIRMED]);
  assert.equal(formatMarkupPercent(after.priceMarkupPercent), "20,00 %");
  assert.notEqual(formatMarkupDateTime(after.confirmedAt), "—");
  assert.equal(markupSuccessMessage(false), "Der Kundenaufschlag wurde bestätigt.");
  // Verwertbare Antwort übernehmen, sonst frisch laden — nie raten.
  assert.match(detailSrc, /if \(next && next\.confirmed === true && next\.priceMarkupPercent !== null\) setPricing\(next\);\s*else await loadPricing\(\);/);
  // Und die Sektion synchronisiert die Eingabe auf den neuen Backend-Stand.
  assert.match(sectionSrc, /setDraft\(markupInputValue\(pricing\?\.priceMarkupPercent\)\);/);
});

test("25 — eine erfolgreiche Änderung zeigt den neuen Wert und den passenden Text", () => {
  const before = selectPriceMarkup(CONFIRMED);          // 17,5 % bestätigt
  const after = selectPriceMarkup({ ...CONFIRMED, priceMarkupPercent: 22.75 });
  assert.equal(formatMarkupPercent(before.priceMarkupPercent), "17,50 %");
  assert.equal(formatMarkupPercent(after.priceMarkupPercent), "22,75 %");
  assert.equal(markupInputValue(after.priceMarkupPercent), "22,75");
  assert.equal(markupSuccessMessage(true),
    "Der Kundenaufschlag wurde aktualisiert. Die Änderung gilt für zukünftige Preisberechnungen und Buchungen.");
  assert.equal(markupActionLabel(before), "Aufschlag aktualisieren");
});

test("26 — 400 wird verständlich direkt am Eingabefeld angezeigt", () => {
  const err = markupSaveError(400, { code: CODE_INVALID_PERCENT });
  assert.equal(err.field, true, "der Fehler gehört ans Feld");
  assert.equal(err.code, CODE_INVALID_PERCENT);
  assert.equal(err.text,
    "Der Kundenaufschlag muss zwischen 0 und 100 Prozent liegen und darf höchstens zwei Nachkommastellen besitzen.");
  // Auch ohne Code bleibt 400 ein Feldfehler; der Code allein reicht ebenfalls.
  assert.equal(markupSaveError(400, null).field, true);
  assert.equal(markupSaveError(422, { code: CODE_INVALID_PERCENT }).field, true);
  // Programmatisch mit dem Feld verbunden.
  assert.match(sectionSrc, /aria-describedby=\{describedBy\}/);
  assert.match(sectionSrc, /const describedBy = \["adm-markup-help", fieldError \? "adm-markup-error" : null\]/);
  assert.match(sectionSrc, /<p id="adm-markup-error" className="field-error" role="alert">\{fieldError\}<\/p>/);
  assert.match(sectionSrc, /aria-invalid=\{fieldError \? "true" : undefined\}/);
});

test("27 — 404 wird verständlich angezeigt", () => {
  const err = markupSaveError(404, null);
  assert.equal(err.field, false);
  assert.equal(err.text, "Der Kunde wurde nicht gefunden oder ist nicht mehr verfügbar.");
  assert.equal(APPROVAL_ERRORS[404], "Der Kunde wurde nicht gefunden oder ist nicht mehr verfügbar.");
});

test("28 — 429 wird verständlich angezeigt", () => {
  assert.equal(markupSaveError(429, null).text, "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.");
  assert.equal(approvalError(429, null).text, "Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.");
});

test("29 — 500 zeigt keine technischen Details", () => {
  const technical = {
    message: "ER_DUP_ENTRY: Duplicate entry '123' for key 'PRIMARY'",
    stack: "at PricingService.update (/srv/app/pricing.js:42:11)",
    sql: "UPDATE users SET price_markup_percent = ?",
    error: "TypeError: cannot read property 'markup' of undefined",
  };
  const err = markupSaveError(500, technical);
  assert.equal(err.text, "Der Vorgang konnte nicht abgeschlossen werden. Es wurden keine Änderungen übernommen.");
  const approve = approvalError(500, technical);
  assert.equal(approve.text, "Der Vorgang konnte nicht abgeschlossen werden. Es wurden keine Änderungen übernommen.");
  for (const leak of ["ER_DUP_ENTRY", "pricing.js", "UPDATE users", "TypeError", "PRIMARY", "stack"]) {
    assert.equal(err.text.includes(leak), false, `„${leak}“ darf nicht angezeigt werden`);
    assert.equal(approve.text.includes(leak), false, `„${leak}“ darf nicht angezeigt werden`);
  }
  // Unbekannte Statuscodes fallen auf denselben neutralen Text zurück.
  assert.equal(markupSaveError(503, technical).text, MARKUP_SAVE_ERRORS.default);
});

// ═══ D) Freischaltung (30–40) ════════════════════════════════════════════════

const gateFor = (currentStatus, pricing, extra = {}) =>
  approvalGate({ currentStatus, targetStatus: "approved", pricing, ...extra });

test("30 — ein unbestätigter Kunde kann im Frontend nicht freigeschaltet werden", () => {
  const g = gateFor("pending", selectPriceMarkup(UNCONFIRMED));
  assert.equal(g.allowed, false);
  assert.equal(g.reason, "confirmation_required");
  // Solange die Daten fehlen oder noch laden, gilt dasselbe (fail-closed) — die
  // Freischaltung erscheint nie fälschlich als möglich.
  assert.equal(gateFor("pending", null, { loading: true }).allowed, false);
  assert.equal(gateFor("pending", null, { loading: true }).reason, "loading");
  assert.equal(gateFor("pending", null, { error: true }).allowed, false);
  assert.equal(gateFor("pending", null, { error: true }).reason, "unknown");
  assert.equal(gateFor("pending", null).allowed, false);
  // Kein Request ohne erlaubtes Gate — in beiden Oberflächen.
  assert.match(detailSrc, /if \(!gate\.allowed\) return;/);
  assert.match(approveSrc, /disabled=\{busy \|\| !g\.allowed\}/);
  assert.match(listSrc, /if \(!confirmGate\.allowed\) return;/);
  assert.match(listSrc, /disabled=\{busy \|\| disabled\}/, "der Dialog-CTA hängt am Gate");
  assert.match(listSrc, /disabled=\{!confirmGate\.allowed\}/, "das Gate wird an den Dialog übergeben");
});

test("31 — die Erklärung verweist auf den fehlenden Aufschlag", () => {
  const info = approvalGateExplanation(gateFor("pending", selectPriceMarkup(UNCONFIRMED)));
  assert.equal(info.title, "Kundenaufschlag erforderlich");
  assert.equal(info.text, "Vor der Freischaltung muss der individuelle Kundenaufschlag festgelegt und bestätigt werden.");
  assert.equal(info.cta, "Aufschlag festlegen");
  // Der Button wird nicht kommentarlos ausgeblendet, sondern deaktiviert erklärt.
  assert.match(approveSrc, /aria-describedby=\{!g\.allowed \? "adm-approve-gate" : undefined\}/);
  assert.match(approveSrc, /id="adm-approve-gate"/);
  // Ladezustand und unbekannter Zustand sind ebenfalls benannt (keine leere Karte).
  assert.equal(approvalGateExplanation(gateFor("pending", null, { loading: true })).title, "Kundenaufschlag wird geprüft");
  assert.equal(approvalGateExplanation(gateFor("pending", null, { error: true })).title, "Kundenaufschlag unbekannt");
  assert.equal(approvalGateExplanation(gateFor("pending", null, { loading: true })).cta, null, "beim Laden keine Handlungsaufforderung");
});

test("32 — der CTA fokussiert die Aufschlagssektion", () => {
  // Kundendetail: scrollt zur Sektion und fokussiert das Eingabefeld.
  assert.match(detailSrc, /const focusMarkup = useCallback\(\(\) => \{\s*markupSectionRef\.current\?\.scrollIntoView\?\.\([\s\S]*?markupInputRef\.current\?\.focus\?\.\(\);/);
  assert.match(detailSrc, /onJumpToMarkup=\{focusMarkup\}/);
  assert.match(approveSrc, /onClick=\{onJumpToMarkup\}/);
  assert.match(detailSrc, /inputRef=\{markupInputRef\}/);
  assert.match(detailSrc, /sectionRef=\{markupSectionRef\}/);
  assert.match(sectionSrc, /ref=\{inputRef\}/);
  assert.match(sectionSrc, /ref=\{sectionRef\}/);
  // Kundenliste: springt in die Detailansicht und fokussiert dort — über
  // Router-State, NICHT über einen Query-Parameter.
  assert.match(listSrc, /navigate\(detailPath\(confirm\.id\), \{ state: \{ focusPricing: true \} \}\)/);
  assert.match(listSrc, /const detailPath = \(id\) => `\/admin\/users\/\$\{encodeURIComponent\(id\)\}`;/);
  assert.match(detailSrc, /if \(!location\.state \|\| !location\.state\.focusPricing\) return;/);
  // Erst fokussieren, wenn Kundendaten UND Aufschlag geladen sind — sonst gäbe
  // es das Eingabefeld noch gar nicht und der Router-State wäre verbraucht.
  assert.match(detailSrc, /if \(loading \|\| pricingLoading\) return;[\s\S]{0,160}focusMarkup\(\);/);
});

test("33 — nach erfolgreicher Bestätigung ist die Freischaltung möglich", () => {
  const g = gateFor("pending", selectPriceMarkup(CONFIRMED));
  assert.equal(g.allowed, true);
  assert.equal(g.reason, null);
  assert.equal(approvalGateExplanation(g).title, "", "keine Gate-Erklärung mehr");
  // Angeboten, aber nie automatisch: die Freischaltung bleibt eine zweite,
  // bewusste Adminaktion mit eigenem Request.
  assert.match(sectionSrc, /typeof onApproveNow === "function"[\s\S]{0,260}Kunde jetzt freischalten/);
  assert.match(detailSrc, /onApproveNow=\{gate\.allowed \? \(\) => \{ setApproveMsg\(null\); setApproveOpen\(true\); \} : undefined\}/);
  assert.equal(/onApproveNow=\{[^}]*confirmApprove/.test(detailSrc), false,
    "der CTA öffnet nur den Dialog, er schaltet nicht direkt frei");
  assert.match(detailSrc, /onConfirm=\{confirmApprove\}/);
});

test("34 — der bestätigte Prozentwert erscheint im Freischaltungsdialog", () => {
  assert.equal(confirmedMarkupLine(selectPriceMarkup(CONFIRMED)), "Bestätigter Kundenaufschlag: 17,50 %");
  assert.equal(confirmedMarkupLine(selectPriceMarkup({ ...CONFIRMED, priceMarkupPercent: 20 })),
    "Bestätigter Kundenaufschlag: 20,00 %");
  assert.equal(confirmedMarkupLine(selectPriceMarkup(UNCONFIRMED)), null);
  assert.equal(confirmedMarkupLine(null), null);
  // In beiden Dialogen sichtbar.
  assert.match(approveSrc, /const markupLine = confirmedMarkupLine\(pricing\);/);
  assert.match(approveSrc, /\{markupLine && \(\s*<p className="adm-approve-markup"><Icon n="euro" s=\{15\} \/> \{markupLine\}<\/p>/);
  assert.match(listSrc, /const markupLine = confirm\.target === "approved" \? confirmedMarkupLine\(confirmPricing\.data\) : null;/);
});

test("35 — ein Backend-409 wird korrekt behandelt", () => {
  const err = approvalError(409, { code: CODE_CONFIRMATION_REQUIRED, error: "confirmation required" });
  assert.equal(err.text, "Die Freischaltung wurde nicht durchgeführt. Bitte bestätigen Sie zuerst den Kundenaufschlag.");
  assert.equal(err.code, CODE_CONFIRMATION_REQUIRED);
  assert.equal(err.reloadPricing, true);
  // Der bestehende B2B-Guard (409 mit Klartext) behält sein bisheriges Verhalten.
  const b2b = approvalError(409, { error: "Firmenname fehlt" });
  assert.equal(b2b.text, "Firmenname fehlt");
  assert.equal(b2b.reloadPricing, false);
  // 401/403 bleiben dem zentralen Auth-Verhalten überlassen.
  assert.equal(approvalError(401, null), null);
  assert.equal(approvalError(403, null), null);
  assert.equal(markupSaveError(401, null), null);
  assert.equal(markupSaveError(403, null), null);
});

test("36 — nach einem 409 werden die Pricing-Daten erneut geladen", () => {
  assert.equal(approvalError(409, { code: CODE_CONFIRMATION_REQUIRED }).reloadPricing, true);
  // Kundendetail: nachladen statt veraltet weiter „freischaltbar“ zeigen.
  assert.match(detailSrc, /if \(err\.reloadPricing\) await loadPricing\(\);/);
  // Kundenliste: Dialog bleibt offen und lädt den Bestätigungsstatus neu.
  assert.match(listSrc, /if \(err && err\.code === CODE_CONFIRMATION_REQUIRED\) \{[\s\S]*?keepOpen = true;\s*loadConfirmPricing\(id\);/);
  assert.match(listSrc, /if \(!keepOpen\) setConfirm\(null\);/);
});

test("37 — „blocked → approved“ verlangt ebenfalls eine Bestätigung", () => {
  const blocked = gateFor("blocked", selectPriceMarkup(UNCONFIRMED));
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.reason, "confirmation_required");
  assert.equal(blocked.reactivation, true);
  const info = approvalGateExplanation(blocked);
  assert.ok(info.text.includes("Zur Reaktivierung ist ein bestätigter Kundenaufschlag erforderlich."),
    `Reaktivierungshinweis fehlt: ${info.text}`);
  assert.equal(info.cta, "Aufschlag festlegen");
  // Mit Bestätigung ist die Reaktivierung möglich — kein Sonderweg am Gate vorbei.
  const ok = gateFor("blocked", selectPriceMarkup(CONFIRMED));
  assert.equal(ok.allowed, true);
  assert.equal(ok.reactivation, true);
  // Die Oberfläche benennt die Reaktivierung ausdrücklich.
  // Überschrift und Anforderungstext kommen aus dem tatsächlichen Status.
  assert.match(approveSrc, /markupRequirementText\(g\.currentStatus\)/);
  assert.match(approveSrc, /reactivation \? "Kunde reaktivieren"/);
});

test("38 — „approved → approved“ erzeugt keinen unnötigen Ablauf", () => {
  const g = gateFor("approved", selectPriceMarkup(CONFIRMED));
  assert.equal(g.allowed, false);
  assert.equal(g.reason, "already_approved");
  // Auch ohne Bestätigung wird für einen freigeschalteten Kunden nichts ausgelöst.
  const legacy = gateFor("approved", selectPriceMarkup(UNCONFIRMED));
  assert.equal(legacy.reason, "already_approved");
  assert.equal(legacy.allowed, false);
  // Der Freischalten-Button entfällt für bereits freigeschaltete Kunden.
  assert.match(approveSrc, /const alreadyApproved = g\.reason === "already_approved";/);
  assert.match(approveSrc, /\{!alreadyApproved && \(/);
  // Blockieren bleibt davon unberührt (anderes Ziel → unverändert erlaubt).
  const block = approvalGate({ currentStatus: "approved", targetStatus: "blocked" });
  assert.equal(block.allowed, true);
  assert.equal(block.reason, "not_approval");
});

test("39 — ein bestehender approved-Kunde ohne Bestätigung bleibt unverändert nutzbar", () => {
  const n = legacyApprovedNotice({ currentStatus: "approved", pricing: selectPriceMarkup(UNCONFIRMED) });
  assert.equal(n.show, true);
  assert.equal(n.tone, "info", "sachlich, kein Warnzustand");
  assert.equal(n.headline, "Globaler Standardaufschlag aktiv");
  assert.ok(n.text.includes("globale Standardaufschlag"), n.text);
  assert.ok(n.text.includes("Der Zugang bleibt bestehen"), n.text);
  // Keine Störungs-/Sperrsprache, keine automatische Bestätigung.
  for (const word of ["Sperre", "gesperrt", "Fehler!", "dringend", "sofort", "Backfill"]) {
    assert.equal(n.text.includes(word), false, `„${word}“ suggeriert eine akute Störung`);
  }
  // Nur für freigeschaltete Kunden ohne Bestätigung — sonst nie.
  assert.equal(legacyApprovedNotice({ currentStatus: "approved", pricing: selectPriceMarkup(CONFIRMED) }).show, false);
  assert.equal(legacyApprovedNotice({ currentStatus: "pending", pricing: selectPriceMarkup(UNCONFIRMED) }).show, false);
  assert.equal(legacyApprovedNotice({ currentStatus: "approved", pricing: null, loading: true }).show, false);
  assert.equal(legacyApprovedNotice({ currentStatus: "approved", pricing: null, error: true }).show, false);
  // Der Hinweis ersetzt in der Sektion den „vor der Freischaltung“-Text.
  assert.match(detailSrc, /const markupNotice = legacyNotice\.show\s*\? \{ headline: legacyNotice\.headline, text: legacyNotice\.text \}\s*: \{ headline: "", text: MARKUP_TEXTS\.confirmRequired \};/);
});

test("40 — die Freischaltung nutzt weiterhin den bestehenden Statusendpunkt", () => {
  assert.match(detailSrc, /await setAdminUserStatus\(id, "approved"\)/);
  assert.match(apiSrc, /apiFetch\(`\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/status`, \{\s*method: "PATCH",/);
  assert.match(apiSrc, /body: JSON\.stringify\(\{ status \}\),/);
  // Kein neuer Endpunkt, keine kombinierte Route: Bestätigung und Freischaltung
  // bleiben zwei getrennte Requests.
  assert.equal(/price-markup[^`"']*status|status[^`"']*price-markup/.test(apiSrc), false,
    "keine kombinierte Route");
  assert.equal(/approve|activate|unlock/i.test(
    apiSrc.slice(apiSrc.indexOf("getAdminCustomerPriceMarkup"), apiSrc.indexOf("INVOICE_PARAMS"))), false,
    "kein neuer Freischaltungsendpunkt im Pricing-Block");
});

// ═══ E) Sicherheit und Regression (41–48) ════════════════════════════════════

test("41 — GET/PUT laufen über das bestehende Auth-Verhalten (keine neue Tokenlogik)", () => {
  assert.match(apiSrc, /export function getAdminCustomerPriceMarkup[\s\S]*?apiFetch\([\s\S]*?\{ auth: true, signal \}\)/);
  assert.match(apiSrc, /export function updateAdminCustomerPriceMarkup[\s\S]*?auth: true,/);
  // 401/403 werden zentral behandelt — die neuen Fehlerübersetzer zeigen nichts an.
  assert.equal(markupSaveError(401, { code: "X" }), null);
  assert.equal(markupSaveError(403, { code: "X" }), null);
  assert.equal(approvalError(401, {}), null);
  assert.equal(approvalError(403, {}), null);
  // Und die Seiten überspringen 401/403 bewusst.
  assert.match(detailSrc, /if \(r\.status === 401 \|\| r\.status === 403\) return;/);
  // Kein eigener Token-Zugriff, keine neue Speicherform in den neuen Dateien.
  for (const rel of NEW_FILES) {
    const src = read(rel);
    for (const forbidden of ["ce_token", "localStorage", "sessionStorage", "Authorization", "Bearer", "document.cookie"]) {
      assert.equal(src.includes(forbidden), false, `${rel}: ${forbidden} darf nicht vorkommen`);
    }
  }
});

test("42 — es wird nichts geloggt (kein Token, keine Kundendaten)", () => {
  for (const rel of [...NEW_FILES, "api/adminApi.js", "pages/admin/AdminUserDetailPage.jsx", "pages/admin/AdminUsersPage.jsx"]) {
    const code = stripComments(read(rel));
    assert.equal(/console\.(log|info|warn|error|debug|table|dir)\s*\(/.test(code), false,
      `${rel}: kein console-Logging`);
  }
  // Repoweit keine Regression: kein Logging der neuen Pricing-Daten.
  const hits = [];
  for (const file of PRODUCTION_FILES) {
    const code = stripComments(readFileSync(file, "utf8"));
    if (/console\.[a-z]+\([^)]*(priceMarkup|Kundenaufschlag|ce_token|pricing)/i.test(code)) hits.push(relative(SRC, file));
  }
  assert.deepEqual(hits, []);
});

test("43 — Pricing-Werte erscheinen nie in URL-Query-Parametern", () => {
  // Die Endpunkte werden ohne Query-String aufgerufen; die :id kommt aus dem Pfad.
  assert.match(apiSrc, /`\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/price-markup`/);
  const pricingBlock = apiSrc.slice(apiSrc.indexOf("getAdminCustomerPriceMarkup"), apiSrc.indexOf("INVOICE_PARAMS"));
  assert.equal(/buildQuery|URLSearchParams|\?\$\{|price-markup\?/.test(pricingBlock), false,
    "kein Query-String an den Pricing-Endpunkten");
  // Auch die Navigation trägt keinen Wert in die URL — nur Router-State.
  assert.equal(/navigate\([^)]*priceMarkup|navigate\([^)]*markup=/.test(listSrc), false);
  assert.equal(/\?page=|searchParams\.set\([^)]*markup/i.test(detailSrc), false);
  const hits = [];
  for (const file of PRODUCTION_FILES) {
    const code = stripComments(readFileSync(file, "utf8"));
    if (/[?&](priceMarkupPercent|price_markup|markup)=/.test(code)) hits.push(relative(SRC, file));
  }
  assert.deepEqual(hits, [], "kein Pricing-Wert in einem Query-Parameter");
});

test("44 — der öffentliche Pfad hat kein /api-Präfix", () => {
  assert.equal(/["'`]\/api\/admin\//.test(apiSrc), false, "kein /api/admin in den Admin-Wrappern");
  const hits = [];
  for (const file of PRODUCTION_FILES) {
    const code = stripComments(readFileSync(file, "utf8"));
    if (/["'`]\/api\/admin\//.test(code)) hits.push(relative(SRC, file));
  }
  assert.deepEqual(hits, [], "kein produktiver Code ruft /api/admin/... auf");
  // Der Pricing-Pfad steht exakt einmal je Methode und beginnt mit /admin/.
  const paths = apiSrc.match(/`\/admin\/users\/\$\{encodeURIComponent\(userId\)\}\/price-markup`/g) || [];
  assert.equal(paths.length, 2, `GET und PUT erwartet, gefunden: ${paths.length}`);
});

test("45 — die bestehende Kundenliste funktioniert unverändert", () => {
  // Spaltenzahl und Zellenzahl bleiben konsistent (reduziert auf fünf Spalten).
  const headers = (listSrc.match(/<th scope="col"/g) || []).length;
  assert.equal(headers, 5, `erwartet 5 Spalten, gefunden ${headers}`);
  const body = listSrc.slice(listSrc.indexOf("<tbody>"), listSrc.indexOf("</tbody>"));
  assert.equal((body.match(/<td[\s>]/g) || []).length, headers);
  // Laden, Suche, Pagination und der Blockieren-Ablauf sind unangetastet.
  assert.match(listSrc, /const r = await listAdminUsers\(\{ page, pageSize: PAGE_SIZE \}\)/);
  assert.match(listSrc, /filterCustomerRows\(rows, filters\)/);
  assert.match(listSrc, /className="adm-pagination"/);
  assert.match(listSrc, /const target = key === "approve" \? "approved" : "blocked";/);
  // Beim Blockieren wird kein Aufschlag geladen.
  assert.match(listSrc, /if \(target === "approved"\) loadConfirmPricing\(f\.id\);\s*else setConfirmPricing/);
  // Der bestehende B2B-Hinweis bleibt erhalten.
  assert.match(listSrc, /missingB2B\?\.length > 0/);
  assert.match(listSrc, /missingB2BAccountFields\(u\)/);
});


test("46 — die bestehende Kundendetailansicht bleibt vollständig erhalten", () => {
  // Karten und Werte, die die bestehenden Tests absichern (neue Sektionsnamen).
  for (const marker of [
    /<Icon n="building" s=\{17\} \/> Unternehmen und Kontakt<\/div>/,
    /<Icon n="card" s=\{17\} \/> Aktivität und Zahlung<\/div>/,
    /<Icon n="settings" s=\{17\} \/> Technische Informationen/,
    /Account anonymisieren/,
    /Kunde löschen/,
    /ANONYMIZE_USER/,
    /DELETE_USER/,
    /className="adm-cards"/,
    /Passwort zuletzt geändert/,
  ]) assert.match(detailSrc, marker, `fehlender Bestandteil: ${marker}`);
  // Keine Kreditwerte eingeschleppt (Regression zur bestehenden Prüfung).
  assert.equal(/Kreditlimit|Kredit genutzt|credit_limit|credit_used/.test(detailSrc), false);
  // Und keine verbotenen internen Preisbegriffe in der Oberfläche.
  const FORBIDDEN_TERMS = [
    /Margin Rate/i, /Markup Rate/i, /Multiplier/i, /Legacy Fallback/i,
    /Supplier Net/i, /Internal Pricing/i, /Pricing Core/i,
  ];
  for (const src of [detailSrc, listSrc, sectionSrc, approveSrc, stripComments(markupSrc)]) {
    for (const term of FORBIDDEN_TERMS) {
      assert.equal(term.test(src), false, `verbotener Begriff ${term} in der Oberfläche`);
    }
  }
  // Die verwendeten Begriffe sind die fachlich richtigen.
  assert.match(sectionSrc, /MARKUP_TEXTS\.sectionTitle/);
  assert.equal(MARKUP_TEXTS.sectionTitle, "Individueller Kundenaufschlag");
  assert.equal(MARKUP_TEXTS.fieldLabel, "Kundenaufschlag");
});


test("47 — Rechnungs-, Versand- und übrige Kundenbereiche bleiben unberührt", () => {
  const untouched = [
    "pages/admin/AdminInvoicesPage.jsx",
    "pages/admin/AdminInvoiceDetailPage.jsx",
    "pages/admin/AdminShipmentsPage.jsx",
    "pages/admin/AdminShipmentDetailPage.jsx",
    "pages/admin/AdminBackfillPage.jsx",
    "pages/admin/AdminCancellationRequestsPage.jsx",
    "components/dashboard/InvoicesList.jsx",
    "components/dashboard/ShipmentsList.jsx",
    "components/dashboard/Profile.jsx",
  ];
  for (const rel of untouched) {
    const src = read(rel);
    assert.equal(/price-markup|priceMarkupPercent|customerMarkup|Kundenaufschlag/.test(src), false,
      `${rel} darf vom Aufschlag nichts wissen`);
  }
  // Die bestehenden Rechnungs-/Versand-Wrapper sind unverändert vorhanden.
  for (const fn of [
    "listAdminInvoices", "getAdminInvoice", "markAdminInvoicePaid", "getAdminInvoicePdf",
    "generateAdminInvoiceDocument", "sendAdminInvoiceEmail", "resendAdminInvoiceEmail",
    "listAdminShipments", "getAdminShipment", "downloadAdminShipmentLabel",
    "listAdminUsers", "getAdminUser", "setAdminUserStatus", "anonymizeAdminUser", "deleteAdminUser",
  ]) assert.match(apiSrc, new RegExp(`export (async )?function ${fn}\\(`), `${fn} fehlt`);
  // Zahlungsziel-Logik unverändert (weiterhin 7 Tage als Default, nur Anzeige).
  assert.match(read("utils/adminUsers.js"), /Number\.isFinite\(n\) && n > 0 \? `\$\{n\} Tage` : "7 Tage"/);
});

test("48 — Barrierefreiheit: echtes Label, Dialogfokus, Escape, kein Autofokus-Sprung", () => {
  // Echtes Label + Hilfetext, programmatisch verbunden.
  assert.match(sectionSrc, /<label className="adm-edit-label" htmlFor=\{MARKUP_INPUT_ID\}>\{MARKUP_TEXTS\.fieldLabel\}<\/label>/);
  assert.match(sectionSrc, /id=\{MARKUP_INPUT_ID\}/);
  assert.match(sectionSrc, /<p id="adm-markup-help" className="adm-markup-help">\{MARKUP_TEXTS\.inputHelp\}<\/p>/);
  // Der Hilfetext erklärt den Prozentvertrag ausdrücklich.
  assert.ok(MARKUP_TEXTS.inputHelp.includes("20 entspricht 20 %"), MARKUP_TEXTS.inputHelp);
  assert.ok(MARKUP_TEXTS.inputHelp.includes("0,20 entspricht 0,20 %"), MARKUP_TEXTS.inputHelp);
  // Ladezustände zugänglich gekennzeichnet.
  assert.match(sectionSrc, /role="status" aria-live="polite"/);
  assert.match(listSrc, /className="adm-markup-check" role="status" aria-live="polite"/);
  // Dialogfokus, Escape, Abbrechen, Fokusrückgabe.
  assert.match(approveSrc, /cancelRef\.current\?\.focus\(\);/);
  assert.match(approveSrc, /if \(e\.key === "Escape" && !busy\) onCancel\(\);/);
  assert.match(approveSrc, /openerRef\.current\?\.focus\?\.\(\);/);
  assert.match(approveSrc, /role="dialog"\s*\n?\s*aria-modal="true"/);
  assert.match(approveSrc, /aria-labelledby="adm-approve-title"/);
  assert.match(approveSrc, /aria-describedby="adm-approve-desc"/);
  assert.match(approveSrc, /onClick=\{onCancel\} disabled=\{busy\}>\s*Abbrechen/);
  // Kein unnötiger Autofokus im Formular (nur der Dialog fokussiert bewusst).
  assert.equal(/autoFocus/.test(sectionSrc), false, "die Sektion springt nicht ungefragt in den Fokus");
  // Status wird nicht nur über Farbe vermittelt: der Badge trägt den Text.
  assert.equal(markupBadge(selectPriceMarkup(CONFIRMED))[1], "Bestätigt");
  assert.equal(markupBadge(selectPriceMarkup(UNCONFIRMED))[1], "Noch nicht bestätigt");
});

// ═══ F) Selbsttest der Prüflogik ═════════════════════════════════════════════

test("49 — Selbsttest: die Contract-Prüfungen greifen tatsächlich", () => {
  // Die gelesenen Quellen sind real und nicht leergestrippt.
  for (const [label, src] of [["detail", detailSrc], ["liste", listSrc], ["sektion", sectionSrc], ["dialog", approveSrc], ["api", apiSrc]]) {
    assert.ok(src.length > 800, `${label}: Quelle wirkt leer (${src.length} Zeichen)`);
  }
  assert.ok(PRODUCTION_FILES.length > 20, `zu wenige Quelldateien geprüft: ${PRODUCTION_FILES.length}`);
  // Der Kommentar-Stripper verschluckt keinen sichtbaren Code …
  assert.match(stripComments('const a = 1; // confirmedBy\nconst b = "confirmedBy";'), /const b = "confirmedBy"/);
  assert.equal(/\/\/ confirmedBy/.test(stripComments("// confirmedBy\nconst x = 1;")), false);
  // … und die /api/admin-Prüfung schlägt bei einem echten Treffer an, aber nicht
  // beim Import-Pfad "../../api/adminApi".
  assert.equal(/["'`]\/api\/admin\//.test('apiFetch(`/api/admin/users/1/price-markup`)'), true);
  assert.equal(/["'`]\/api\/admin\//.test('import x from "../../api/adminApi";'), false);
  // Die Verbotsliste erkennt echte Treffer.
  assert.equal(/Margin Rate/i.test("Die Margin Rate beträgt …"), true);
  assert.equal(/Margin Rate/i.test("Der Kundenaufschlag beträgt …"), false);
  // Und die Kernaussagen des Prozentvertrags sind keine Tautologien.
  assert.notEqual(parseMarkupInput("0,20").value, parseMarkupInput("20").value);
  assert.equal(parseMarkupInput("0,20").value * 100, 20, "0,20 % ist ein Hundertstel von 20 %");
});


// ═══════════════════════════════════════════════════════════════════════════════
// D) Expressaufschlag (zweiter, OPTIONALER Kundenaufschlag) — X1–X12
// ═══════════════════════════════════════════════════════════════════════════════

// Serverantworten, wie das Backend sie liefert.
const PRICING_FALLBACK = selectPM({
  userId: 3, priceMarkupPercent: 20,
  expressPriceMarkupPercent: null, effectiveExpressPriceMarkupPercent: 20, expressMarkupUsesFallback: true,
  confirmed: true, confirmedAt: "2026-07-30T10:00:00.000Z", confirmedBy: 1, updatedAt: "2026-07-30T10:00:00.000Z",
});
const PRICING_OWN = selectPM({
  userId: 3, priceMarkupPercent: 20,
  expressPriceMarkupPercent: 35, effectiveExpressPriceMarkupPercent: 35, expressMarkupUsesFallback: false,
  confirmed: true, confirmedAt: "2026-07-30T10:00:00.000Z", confirmedBy: 1, updatedAt: "2026-07-30T10:00:00.000Z",
});

test("X1 — beide Werte werden aus der Antwort übernommen", () => {
  assert.equal(PRICING_OWN.priceMarkupPercent, 20);
  assert.equal(PRICING_OWN.expressPriceMarkupPercent, 35);
  assert.equal(PRICING_OWN.effectiveExpressPriceMarkupPercent, 35);
  assert.equal(PRICING_OWN.expressMarkupUsesFallback, false);
});

test("X2 — kein eigener Expresswert wird als Fallback dargestellt, nie als „null“ oder 0", () => {
  assert.equal(PRICING_FALLBACK.expressPriceMarkupPercent, null);
  assert.equal(expressUsesFallback(PRICING_FALLBACK), true);
  assert.equal(expressMarkupDisplay(PRICING_FALLBACK), "Standardaufschlag verwenden");
  const line = effectiveExpressLine(PRICING_FALLBACK);
  assert.match(line, /20,00 %/);
  assert.match(line, /über den Standardaufschlag/);
  // Kein technischer Begriff in der Oberfläche.
  for (const t of ["null", "undefined", "NaN", "fallback"]) {
    assert.equal(expressMarkupDisplay(PRICING_FALLBACK).toLowerCase().includes(t), false, t);
    assert.equal(line.toLowerCase().includes(t), false, t);
  }
  // Das Eingabefeld ist leer, nicht "0".
  assert.equal(expressMarkupInputValue(PRICING_FALLBACK), "");
});

test("X3 — ein eigener Expresswert wird mit seinem wirksamen Wert angezeigt", () => {
  assert.equal(expressUsesFallback(PRICING_OWN), false);
  assert.equal(expressMarkupDisplay(PRICING_OWN), "35,00 %");
  assert.match(effectiveExpressLine(PRICING_OWN), /35,00 % — eigener Expressaufschlag/);
  assert.equal(expressMarkupInputValue(PRICING_OWN), "35,00");
});

test("X4 — der wirksame Wert stammt aus dem SERVERFELD, nicht aus einer eigenen Rechnung", () => {
  // Bewusst widersprüchliche Antwort: der Server sagt 99, der Rohwert wäre 35.
  const odd = selectPM({ userId: 1, priceMarkupPercent: 20, expressPriceMarkupPercent: 35,
    effectiveExpressPriceMarkupPercent: 99, expressMarkupUsesFallback: false, confirmed: true });
  assert.match(effectiveExpressLine(odd), /99,00 %/, "der Serverwert ist maßgeblich");
  // Und die Komponente rechnet den Wert nirgends selbst aus.
  assert.equal(/effectiveExpress[A-Za-z]*\s*=\s*[^;]*\?\?/.test(sectionSrc), false,
    "die Sektion darf den wirksamen Wert nicht selbst herleiten");
});

test("X5 — Expresswert speichern: Zahl, deutsches Komma, 0 und 100", () => {
  for (const [raw, expected] of [["40", 40], ["35,50", 35.5], ["0", 0], ["100", 100], ["17.5", 17.5]]) {
    const body = buildPriceMarkupBody("20", raw);
    assert.deepEqual(body, { priceMarkupPercent: 20, expressPriceMarkupPercent: expected }, raw);
  }
});

test("X6 — Expresswert entfernen: leeres Feld sendet null, der Standardwert bleibt", () => {
  const body = buildPriceMarkupBody("20", "");
  assert.deepEqual(body, { priceMarkupPercent: 20, expressPriceMarkupPercent: null });
  assert.equal(body.priceMarkupPercent, 20, "der Standardwert darf beim Entfernen nicht verloren gehen");
  // Auch reiner Whitespace ist „leer".
  assert.deepEqual(buildPriceMarkupBody("20", "   "), { priceMarkupPercent: 20, expressPriceMarkupPercent: null });
  // Es geht NIE ein leerer String an das Backend.
  assert.equal(JSON.stringify(body).includes('""'), false);
});

test("X7 — 0 ist ein echter Expressaufschlag und NICHT „leer“", () => {
  const zero = parseExpressMarkupInput("0");
  assert.equal(zero.ok, true);
  assert.equal(zero.value, 0);
  assert.equal(zero.cleared, false, "0 darf nie als Löschbefehl gelten");
  const empty = parseExpressMarkupInput("");
  assert.equal(empty.value, null);
  assert.equal(empty.cleared, true);
  // Und in der Anzeige ist 0 % ein gesetzter Wert.
  const p0 = selectPM({ userId: 1, priceMarkupPercent: 20, expressPriceMarkupPercent: 0,
    effectiveExpressPriceMarkupPercent: 0, expressMarkupUsesFallback: false, confirmed: true });
  assert.equal(expressUsesFallback(p0), false);
  assert.equal(expressMarkupDisplay(p0), "0,00 %");
  assert.equal(expressMarkupInputValue(p0), "0,00");
});

test("X8 — ungültige Expresseingaben werden abgelehnt, kein Request entsteht", () => {
  for (const bad of ["-1", "101", "20,123", "abc", "4e1", "0x28", "20 %"]) {
    assert.equal(parseExpressMarkupInput(bad).ok, false, bad);
    assert.equal(buildPriceMarkupBody("20", bad), null, bad);
    assert.equal(canSaveMarkupForm(PRICING_FALLBACK, "20", bad), false, bad);
  }
});

test("X9 — der Backendfehler des Expressfelds wird dem RICHTIGEN Feld zugeordnet", () => {
  const err = markupSaveError(400, { code: CODE_INVALID_EXPRESS_PERCENT });
  assert.equal(err.field, true);
  assert.equal(err.target, "express");
  assert.match(err.text, /Expressaufschlag/);
  // Der Standardfehler bleibt unterscheidbar.
  const std = markupSaveError(400, { code: CODE_INVALID_PERCENT });
  assert.equal(std.target, "standard");
  assert.equal(/Expressaufschlag/.test(std.text), false);
  // Und die Sektion trennt beide Anzeigen.
  assert.match(sectionSrc, /saveError\.target === "express"/);
  assert.match(sectionSrc, /saveError\.target !== "express"/);
});

test("X10 — Änderungserkennung über beide Felder; unveränderter Zustand sendet nichts", () => {
  // Nichts geändert → kein Request.
  assert.equal(markupFormHasChange(PRICING_OWN, "20,00", "35,00"), false);
  assert.equal(canSaveMarkupForm(PRICING_OWN, "20,00", "35,00"), false);
  // Nur Standard geändert.
  assert.equal(markupFormHasChange(PRICING_OWN, "22", "35,00"), true);
  // Nur Express geändert.
  assert.equal(markupFormHasChange(PRICING_OWN, "20,00", "40"), true);
  // Express entfernt (Feld geleert).
  assert.equal(expressMarkupHasChange(PRICING_OWN, ""), true);
  assert.equal(markupFormHasChange(PRICING_OWN, "20,00", ""), true);
  // Leer bleibt leer → keine Änderung.
  assert.equal(expressMarkupHasChange(PRICING_FALLBACK, ""), false);
  assert.equal(markupFormHasChange(PRICING_FALLBACK, "20,00", ""), false);
  // Unbestätigt: die Bestätigung selbst IST die Aktion.
  const unconfirmed = selectPM({ userId: 1, priceMarkupPercent: 20, expressPriceMarkupPercent: null, confirmed: false });
  assert.equal(markupFormHasChange(unconfirmed, "20,00", ""), true);
});

test("X11 — die Oberfläche behauptet nie, ein ungespeicherter Expresswert sei aktiv", () => {
  // Der Entwurf wird gegen den gespeicherten Zustand geprüft und ausdrücklich
  // als „noch nicht gespeichert" gekennzeichnet.
  assert.match(sectionSrc, /expressDraft !== expressMarkupInputValue\(pricing\)/);
  assert.match(sectionSrc, /noch nicht gespeichert/);
  // Die Fallbackaktion leert nur das Feld — sie speichert nicht selbst.
  assert.match(sectionSrc, /const useStandardForExpress = \(\) => \{[\s\S]{0,180}setExpressDraft\(""\);/);
  assert.equal(/useStandardForExpress[\s\S]{0,200}onSave\(/.test(sectionSrc), false,
    "die Fallbackaktion darf nicht selbst speichern");
  // Und der Admin sieht nie einen technischen Begriff: geprüft werden die
  // tatsächlich angezeigten TEXTE, nicht der umgebende Code (dort ist "null" als
  // Sprachkonstrukt selbstverständlich erlaubt).
  const visible = [
    MARKUP_TEXTS.expressGroupTitle, MARKUP_TEXTS.expressGroupScope,
    MARKUP_TEXTS.expressFieldLabel, MARKUP_TEXTS.expressOptional,
    MARKUP_TEXTS.expressInputHelp, MARKUP_TEXTS.expressFallbackAction,
    MARKUP_TEXTS.expressFallbackHint, MARKUP_TEXTS.expressNotSet,
    MARKUP_TEXTS.effectiveExpressPrefix, MARKUP_TEXTS.effectiveExpressViaFallback,
    MARKUP_TEXTS.effectiveExpressOwn, MARKUP_TEXTS.standardGroupTitle,
    MARKUP_TEXTS.standardGroupScope, MARKUP_SAVE_ERRORS.expressInvalid,
    expressMarkupDisplay(PRICING_FALLBACK), expressMarkupDisplay(PRICING_OWN),
    effectiveExpressLine(PRICING_FALLBACK), effectiveExpressLine(PRICING_OWN),
  ];
  for (const text of visible) {
    assert.equal(typeof text, "string", "jeder Anzeigetext muss definiert sein");
    for (const t of ["null", "undefined", "NaN", "fallback", "boolean", "percent"]) {
      assert.equal(text.toLowerCase().includes(t.toLowerCase()), false,
        `technischer Begriff „${t}" im Anzeigetext: ${text}`);
    }
  }
});

test("X12 — kein Kundenbereich zeigt jemals einen Aufschlagswert", () => {
  // Alle Nicht-Admin-Quellen dürfen die Aufschlagsfelder überhaupt nicht kennen.
  const forbidden = ["priceMarkupPercent", "expressPriceMarkupPercent",
    "effectiveExpressPriceMarkupPercent", "expressMarkupUsesFallback",
    "applied_markup_percent", "applied_service_class", "markupRate", "marginRate"];
  const offenders = [];
  for (const file of PRODUCTION_FILES) {
    const rel = relative(SRC, file);
    if (rel.includes("admin") || rel.includes("customerMarkup")) continue;
    const src = readFileSync(file, "utf8");
    for (const f of forbidden) if (src.includes(f)) offenders.push(`${rel}: ${f}`);
  }
  assert.deepEqual(offenders, [], `Aufschlagsfelder außerhalb des Adminbereichs: ${offenders.join(", ")}`);
});
