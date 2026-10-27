// „Neue Sendung": leerer Nullzustand + verpflichtende Paketmaße.
//
// Zwei zusammengehörende Zusagen:
//   1. Das Formular startet leer. Kein Profil-Autoseed, kein vorausgewähltes
//      Empfängerland, keine Paketwerte — gespeicherte Angaben kommen nur aus einer
//      Einstellung oder Aktion des Kunden: dem Standard-Absender, den er im
//      Adressbuch festgelegt hat (Paket G, sichtbar gekennzeichnet), „Adresse
//      suchen" oder einem geöffneten Entwurf.
//   2. Anzahl, Gewicht UND alle drei Maße sind Pflicht. Vorher waren Länge,
//      Breite und Höhe optional, und das Backend ersetzte leere Felder still
//      durch 30/20/15 cm — der Kunde bekam einen Preis für ein Paket, das er nie
//      beschrieben hat.
//
// Reine Prüfungen plus gezielte Quelltext-Asserts auf die Verdrahtung.
// Run: node --test src/utils/newShipmentEmptyState.test.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  createEmptyShipmentForm, partyHasInput,
  packageFieldError, packageErrors, packageComplete, packageHint,
  packagePayload, packageSummaryLine, PACKAGE_FIELDS, PACKAGE_PLACEHOLDERS, PACKAGE_COUNT_DEFAULT,
  DEFAULT_ORIGIN_COUNTRY,
} from "./newShipmentForm.mjs";
import { isValidationReady } from "./addressValidationView.mjs";
import { buildResumeInitialState } from "./formDraftsView.mjs";
// Fail-closed Quelltextzugriff: fehlende Anker sind LAUTE Fehler, nie leere Ausschnitte.
import { schnitt } from "../../scripts/governance.mjs";
import { buchungsFlaeche } from "../testing/quelltext.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ohneKommentare = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");

const seite     = ohneKommentare(lies("../pages/NewShipmentPage.jsx"));
const rechner   = ohneKommentare(lies("../pages/CalculatorPage.jsx"));
const dashboard = ohneKommentare(lies("../pages/DashboardPage.jsx"));
const provider  = ohneKommentare(lies("../context/ShippingFlowContext.jsx"));
const buchung   = ohneKommentare(buchungsFlaeche());

const VOLL = { packageCount: "1", weight: "5", length: "30", width: "20", height: "15" };

/* ══════════ TEST 1 — frisches Formular ist leer ══════════════════════════ */

test("1 — jedes user-editierbare Feld startet leer, nur die Anzahl trägt ihre Vorgabe", () => {
  const leer = createEmptyShipmentForm();
  // Die Regel ist unverändert „alles leer" — mit GENAU ZWEI benannten Ausnahmen: der
  // Paketanzahl und (Betreiberentscheidung Auftrag 1, P11, 2026-10-17) dem Absenderland
  // Deutschland, dem einzigen Ursprung, den der Server erlaubt. Sie stehen hier als Allowlist
  // und nicht als gelockerte Prüfung: ein drittes vorbelegtes Feld fällt weiterhin sofort auf.
  // Das Empfängerland bleibt leer.
  const VORBELEGT = { packageCount: PACKAGE_COUNT_DEFAULT, s_country: DEFAULT_ORIGIN_COUNTRY };
  assert.equal(DEFAULT_ORIGIN_COUNTRY, "DE");
  assert.equal(leer.r_country, "", "das Empfängerland ist vorbelegt");
  // TG22 Residential: die Adressartfragen stehen nicht mehr im Formular — jedes übrige Feld
  // startet leer, ohne Ausnahme.
  assert.ok(!("collectionIsResidential" in leer) && !("deliveryIsResidential" in leer),
    "das leere Formular trägt wieder eine Adressart");
  for (const [k, v] of Object.entries(leer)) {
    if (k in VORBELEGT) {
      assert.equal(v, VORBELEGT[k], `${k} trägt nicht die erwartete Vorgabe`);
      continue;
    }
    assert.equal(v, "", `${k} startet nicht leer: ${JSON.stringify(v)}`);
  }
  assert.equal(PACKAGE_COUNT_DEFAULT, "1", "die Vorgabe der Paketanzahl ist nicht 1");
  // Alle erwarteten Felder sind da — ein fehlendes würde React von kontrolliert
  // auf unkontrolliert kippen lassen.
  for (const p of ["s", "r"])
    for (const s of ["company", "fullName", "street", "addition", "zip", "city", "country", "phone", "email"])
      assert.ok(`${p}_${s}` in leer, `${p}_${s} fehlt im leeren Formular`);
  for (const k of PACKAGE_FIELDS) assert.ok(k in leer, `${k} fehlt im leeren Formular`);
});

/* ══════════ TEST 2 — kein automatisches Profil ═══════════════════════════ */

test("2 — das Profil belegt den Absender NICHT automatisch vor", () => {
  assert.ok(!/const profilSeed = /.test(seite), "der automatische Profil-Seed ist zurück");
  // Der Ausgangszustand kommt aus dem leeren Formular, nicht aus `user`.
  assert.ok(seite.includes("const leeresFormular = useCallback(() => createEmptyShipmentForm(), [])"));
  assert.ok(seite.includes("resumeInit ? resumeInit.form : flowInit ? flowInit.form : leeresFormular()"),
    "Vorrangkette des Startzustands verändert");
  // Und es gibt keinen Effekt, der `user` nachträglich ins Formular schreibt.
  assert.ok(!/useEffect\([^)]*\)[\s\S]{0,200}setForm\([^)]*user\?\./.test(seite),
    "ein Effekt schreibt Profildaten ins Formular");
});

/* ══════════ TEST 3 — Absender: Standard-Absender statt „Eigene Adresse" ═══ */

// Paket G (Master-Implementierungsauftrag 2026-10-23): „Eigene Adresse" (Absender aus dem Profil)
// ist entfallen, „Adresse suchen" bleibt für beide Seiten, und der Standard-Absender des Adressbuchs
// wird auf einem frischen Formular vorbelegt.
test("3 — „Eigene Adresse“ ist entfallen, samt Profilhelfern", () => {
  assert.ok(!seite.includes("Eigene Adresse"), "der Knopf „Eigene Adresse“ ist zurück");
  assert.ok(!/uebernimmProfilAbsender|profilAbsenderVerfuegbar|PROFILE_SENDER_NOTE/.test(seite),
    "die Profilübernahme ist zurück");
  const modul = lies("./newShipmentForm.mjs");
  assert.ok(!/export function senderPatchFromProfile|export function hasProfileSenderData/.test(modul),
    "die Profilhelfer sind zurück");
});

test("3b — partyHasInput: das Land allein ist keine Eingabe", () => {
  const leer = createEmptyShipmentForm();
  assert.equal(partyHasInput(leer, "s"), false, "das leere Formular zählt als Absendereingabe");
  assert.equal(partyHasInput({ ...leer, s_country: "AT" }, "s"), false, "ein Land allein ist keine Eingabe");
  assert.equal(partyHasInput({ ...leer, s_city: "Stuttgart" }, "s"), true);
  assert.equal(partyHasInput({ ...leer, s_city: "   " }, "s"), false, "Leerzeichen sind keine Eingabe");
  assert.equal(partyHasInput({ ...leer, s_lastName: "Muster" }, "s"), true, "der Nachname zählt");
  assert.equal(partyHasInput({ ...leer, r_company: "X" }, "s"), false, "der Empfänger zählt nicht für den Absender");
  assert.equal(partyHasInput({ ...leer, r_company: "X" }, "r"), true);
  assert.equal(partyHasInput(null, "s"), false);
});

test("3c — der Standard-Absender: EIN Patch, die Baseline zieht nach, nichts wird überschrieben", () => {
  // Funktionsrumpf fail-closed geschnitten: von der Deklaration bis zum Ende des useCallback.
  const koerper = schnitt(seite, "const belegeStandardAbsenderVor = useCallback(async () => {", "\n  }, []);",
    "Standard-Absender (3c)");
  assert.equal((koerper.match(/setForm\(/g) || []).length, 1, "mehr als ein Formularpatch");
  // Die Vorbelegung IST der Ausgangszustand — anders als eine Nutzeraktion zieht die Baseline nach
  // (kein Verlassen-Hinweis für etwas, das der Kunde nicht eingegeben hat).
  assert.equal((koerper.match(/setBaseline\(/g) || []).length, 1, "die Baseline zieht nicht nach");
  // Hat der Kunde inzwischen etwas geändert oder in den Absender geschrieben, wird nichts überschrieben.
  assert.ok(/if \(dirtyRef\.current \|\| partyHasInput\(stand\.form, "s"\)\)/.test(koerper),
    "die Vorbelegung überschreibt Eingaben");
  // Dieselbe Feldauslegung wie „Adresse suchen", am Flag erkannt.
  assert.ok(koerper.includes('mapAddressToShipmentFormPatch(adresse, "s")'));
  assert.ok(koerper.includes("defaultAddressForTab(data && data.items, TAB_SENDER)"));
  // Der Kunde sieht, woher die Werte kommen: die Marke am Titel, solange die Werte unverändert sind —
  // kein Hinweistext über den Feldern (der schöbe die Absenderspalte unter die Empfängerspalte).
  assert.ok(!koerper.includes("setAddressNote"), "die Vorbelegung schreibt wieder einen Hinweistext");
  assert.ok(seite.includes('{absenderIstStandard && <span className="badge badge-blue calc-section-badge">{DEFAULT_SENDER_BADGE}</span>}'),
    "die Marke „Standard-Absender“ fehlt am Titel");
  // Eine verspätete Antwort (Reset, Verlassen der Seite) schreibt nichts.
  assert.ok(koerper.includes("mountedRef.current && standardSeqRef.current === meins"));
});

test("3d — nur auf einem frischen Formular; der Reset beginnt wie das Öffnen", () => {
  const start = schnitt(seite, "const standardStartRef = useRef(false);", "\n  }, []);", "Start des Standard-Absenders (3d)");
  assert.ok(start.includes("if (!authed || resumeInit || flowInit || absenderAusPrefill)"),
    "die Vorbelegung greift auch bei Entwurf, Sitzungsvorgang oder Absender-Prefill");
  const reset = schnitt(seite, "const resetToFreshShipment = () => {", "\n  };", "Reset (3d)");
  assert.ok(reset.includes("belegeStandardAbsenderVor();"), "der Reset trägt den Standard-Absender nicht wieder ein");
  // Ein unverändert eingetragener Standard zählt beim Zurücksetzen nicht als Eingabe.
  assert.ok(seite.includes("hasMeaningfulShipmentInput(ohneStandardAbsender(currentSnapshot), baseline)"));
});

/* ══════════ TEST 4 — Adressbuch ══════════════════════════════════════════ */

test("4 — die Adressbuchauswahl bleibt für beide Seiten erhalten", () => {
  assert.ok(seite.includes("uebernimmAdressbuchAdresse(a, \"s\")"), "Absenderauswahl fehlt");
  assert.ok(seite.includes("uebernimmAdressbuchAdresse(a, \"r\")"), "Empfängerauswahl fehlt");
  assert.equal((seite.match(/<AddressPickerButton/g) || []).length, 2, "nicht genau zwei Auslöser");
});

/* ══════════ TEST 5 — Paketfelder leer + Placeholder ══════════════════════ */

test("5 — Maße starten leer, die Anzahl mit 1; Placeholder bleiben Beispiele", () => {
  const leer = createEmptyShipmentForm();
  // Gewicht und Maße bleiben leer: jede Vorgabe dort wäre eine Behauptung über ein
  // Paket, das niemand beschrieben hat. Die Anzahl ist der Sonderfall — sie hat ein
  // echtes Minimum (eine Sendung ohne Paket gibt es nicht).
  for (const k of PACKAGE_FIELDS) {
    if (k === "packageCount") continue;
    assert.equal(leer[k], "", `${k} ist vorbelegt`);
  }
  assert.equal(leer.packageCount, "1", "die Paketanzahl startet nicht mit 1");
  // Seit Auftrag 1 (P11, 2026-10-17) tragen die Paketfelder eine schwebende Beschriftung und
  // KEINEN Beispielplatzhalter mehr — ein Beispiel kann so nie für einen Wert gehalten werden.
  // PACKAGE_PLACEHOLDERS bleibt für andere Formulare bestehen, „Neue Sendung" benutzt es nicht.
  for (const k of PACKAGE_FIELDS)
    assert.ok(!seite.includes(`placeholder={PACKAGE_PLACEHOLDERS.${k}}`), `${k}: Beispielplatzhalter ist zurück`);
  assert.ok(!/placeholder="(5|30|20|15)"/.test(seite), "hart verdrahteter Zahlen-Placeholder übrig");
  // Kein defaultValue, nirgends.
  assert.ok(!/defaultValue/.test(seite), "defaultValue im Formular");
});

/* ══════════ TESTS 6–10 — jedes fehlende Feld blockiert ═══════════════════ */

for (const [nr, feld, name] of [
  [6, "weight", "Gewicht"], [7, "length", "Länge"], [8, "width", "Breite"],
  [9, "height", "Höhe"], [10, "packageCount", "Anzahl"],
]) {
  test(`${nr} — fehlendes ${name} verhindert die Tarifabfrage`, () => {
    for (const leerwert of ["", "   ", null, undefined]) {
      const form = { ...VOLL, [feld]: leerwert };
      assert.equal(packageComplete(form), false, `${feld}=${JSON.stringify(leerwert)} gilt als vollständig`);
      assert.ok(packageErrors(form)[feld], `${feld}: kein Fehler gemeldet`);
      assert.equal(packagePayload(form), null, `${feld}: es entsteht trotzdem ein Payload`);
    }
  });
}

/* ══════════ TEST 11 — 0, negativ, NaN ════════════════════════════════════ */

test("11 — 0, negative und nicht-numerische Werte sind ungültig", () => {
  for (const feld of PACKAGE_FIELDS) {
    for (const wert of ["0", 0, "-1", -1, "abc", "NaN"]) {
      const form = { ...VOLL, [feld]: wert };
      assert.equal(packageComplete(form), false, `${feld}=${JSON.stringify(wert)} akzeptiert`);
    }
  }
  // Die Number-Falle ausdrücklich: Number("") === 0 darf nie „0 ist da" heißen.
  assert.equal(packageFieldError("length", ""), "Länge ist ein Pflichtfeld.");
  assert.match(packageFieldError("length", "0"), /zwischen 0,1 und 300/);
  // Dezimale Anzahl ist ungültig, ganze Zahl gültig.
  assert.ok(packageFieldError("packageCount", "1.5"));
  assert.equal(packageFieldError("packageCount", "2"), null);
});

/* ══════════ TEST 12 — vollständige Werte lassen den Fluss laufen ═════════ */

test("12 — vollständige Paketwerte erlauben die Berechnung und gehen unverändert raus", () => {
  assert.equal(packageComplete(VOLL), true);
  assert.deepEqual(packageErrors(VOLL), {});
  assert.deepEqual(packagePayload(VOLL), { packageCount: 1, weight: 5, length: 30, width: 20, height: 15 });
  // Genau die eingegebenen Werte — und ein geänderter Wert kommt auch geändert an.
  assert.equal(packagePayload({ ...VOLL, length: "40" }).length, 40);
});

/* ══════════ TEST 13 — Änderung invalidiert alte Angebote ═════════════════ */

test("13 — jede Paketänderung verwirft alte Angebote", () => {
  // upd() ruft invalidateResults() für jedes NICHT rein clientseitige Filterfeld.
  // Die Ausnahmeliste ist deshalb die Stelle, an der ein Paketfeld versehentlich
  // vom Verwerfen ausgenommen werden könnte.
  const menge = schnitt(seite, "const FILTER_ONLY_FIELDS", "function getErrors", "FILTER_ONLY_FIELDS (13)");
  for (const k of PACKAGE_FIELDS)
    assert.ok(!menge.includes(`"${k}"`), `${k} steht in FILTER_ONLY_FIELDS und würde Angebote NICHT verwerfen`);
  assert.ok(seite.includes("if (!FILTER_ONLY_FIELDS.has(k)) invalidateResults();"),
    "die Invalidierung in upd() ist verändert");
});

/* ══════════ TEST 14/15 — Entwürfe ════════════════════════════════════════ */

test("14 — ein ausdrücklich geöffneter Entwurf lädt weiterhin seine Daten", () => {
  // Der Entwurfszweig steht unverändert an ERSTER Stelle der Vorrangkette.
  assert.ok(seite.includes("resumeInit ? resumeInit.form : flowInit ? flowInit.form : leeresFormular()"));
  assert.ok(seite.includes("isValidResumeDraft(resumeDraft)"), "die Entwurfsprüfung fehlt");
  // Und der Entwurf wird NUR über die Prop geladen, nie automatisch.
  assert.ok(!/getFormDraft\(\)/.test(seite), "ein Entwurf wird ohne Anforderung geladen");
});

test("15 — ein Entwurf ohne Maße lädt, kann aber nicht rechnen und bleibt speicherbar", () => {
  const altEntwurf = { ...VOLL, length: "", width: "", height: "" };
  assert.equal(packageComplete(altEntwurf), false, "unvollständiger Entwurf gilt als rechenbar");
  assert.match(packageHint(altEntwurf), /Länge, Breite und Höhe/);
  // Der Entwurfsknopf hängt unverändert allein an canExplicitSave — die
  // Paketprüfung fasst ihn nicht an. Sonst wäre ein Zwischenstand nicht mehr
  // speicherbar, und genau dafür gibt es Entwürfe.
  assert.ok(seite.includes("disabled={!canExplicitSave}"), "der Entwurfsknopf hängt an etwas anderem");
  assert.ok(!/canExplicitSave[^\n]*packageComplete|packageComplete[^\n]*canExplicitSave/.test(seite),
    "die Paketprüfung ist in den Entwurfsknopf gewandert");
});

/* ══════════ TEST 16 — Adressprüfung auf leerem Formular ══════════════════ */

test("16 — ein leeres Formular löst keine Adressprüfung aus", () => {
  const leer = createEmptyShipmentForm();
  // Seit Auftrag 1 (P11) startet das Absenderland mit Deutschland. Geprüft wird trotzdem nichts:
  // ohne Straße, PLZ und Ort ist keine Seite prüfbereit (isValidationReady), der Hook fragt
  // nichts ab und zeigt nichts an.
  assert.equal(leer.s_country, DEFAULT_ORIGIN_COUNTRY);
  assert.equal(leer.r_country, "");
  assert.equal(leer.s_zip, "");
  for (const p of ["s", "r"]) {
    assert.equal(isValidationReady({ country: leer[`${p}_country`], postalCode: leer[`${p}_zip`],
      city: leer[`${p}_city`], street: leer[`${p}_street`] }), false, `${p}: leeres Formular wäre prüfbereit`);
  }
});

/* ══════════ TEST 17 — Komfortauswahl + Adressprüfung ════════════════════ */

test("17 — nach einer Übernahme prüft die Adressvalidierung den NEUEN Wert", () => {
  // Der Hook beobachtet die Formularwerte (nicht ein Ereignis) — ein per Patch
  // gesetzter Wert löst deshalb dieselbe Prüfung aus wie eine Tastatureingabe.
  assert.ok(seite.includes("country: form.s_country, postalCode: form.s_zip, city: form.s_city, street: form.s_street"),
    "die Absenderprüfung liest nicht die Formularwerte");
  assert.ok(seite.includes("country: form.r_country, postalCode: form.r_zip, city: form.r_city, street: form.r_street"),
    "die Empfängerprüfung liest nicht die Formularwerte");
});

/* ══════════ TEST 18 — Buchungsübersicht zeigt die Maße ══════════════════ */

test("18 — die Buchungsübersicht zeigt Gewicht UND L × B × H", () => {
  assert.equal(packageSummaryLine(VOLL), "5 kg · 30 × 20 × 15 cm");
  // Mehrere Pakete: „je", sonst läse sich die Zeile als Gesamtgewicht.
  assert.equal(packageSummaryLine({ ...VOLL, packageCount: "2" }), "2 Pakete · je 5 kg · 30 × 20 × 15 cm");
  // Nichts wird erfunden: fehlt eine Angabe, entfällt genau dieser Teil.
  assert.equal(packageSummaryLine({ ...VOLL, length: "" }), "5 kg");
  assert.equal(packageSummaryLine({ weight: "", length: "", width: "", height: "" }), null);
  assert.equal(packageSummaryLine(null), null);
  // M8 (Premium-Redesign Etappe 1): Dezimalkomma wie in der Auftragsbestätigung, nie die rohe Eingabe mit Punkt.
  assert.equal(packageSummaryLine({ ...VOLL, weight: "5.5", length: "30.5" }), "5,5 kg · 30,5 × 20 × 15 cm");
  assert.equal(packageSummaryLine({ ...VOLL, packageCount: "2", weight: "2.25" }), "2 Pakete · je 2,25 kg · 30 × 20 × 15 cm");
  // Und die Seite benutzt genau diese Ableitung.
  assert.ok(buchung.includes("packageSummaryLine(bookingData?.form)"),
    "die Buchungsseite leitet die Paketzeile anders ab");
});

/* ══════════ Verdrahtung: keine versteckten Ersatzwerte mehr ═════════════ */

test("19 — kein `|| 30/20/15`-Ersatzwert mehr im Frontend", () => {
  for (const [name, code] of [["NewShipmentPage", seite], ["CalculatorPage", rechner]]) {
    assert.ok(!/\|\|\s*(30|20|15)\b/.test(code), `${name}: Maß-Ersatzwert übrig`);
    assert.ok(!/\?\?\s*(30|20|15)\b/.test(code), `${name}: Maß-Ersatzwert (??) übrig`);
  }
  // Seit Canonical v2.79 über die Paketzeilen: eine Paketart bytegleich wie packagePayload (siehe
  // packageLines.test.mjs), unterschiedliche Pakete als packageLines — ebenfalls ohne Ersatzwert.
  assert.ok(seite.includes("...shipmentPackagePayload(form)"), "der Payload kommt nicht aus shipmentPackagePayload");
  assert.ok(rechner.includes("...packageLinesPayload(formPackageLines(form))"),
    "der Preisrechner bildet die Paketwerte nicht über die Paketzeilen");
});

test("20 — der Preisrechner verlangt die Maße ebenfalls", () => {
  // Seit Auftrag 1 (P11) ist der Knopf nicht mehr gesperrt; die Maße bleiben Pflicht in der EINEN
  // Regel des Rechners (getCalculatorErrors), und der Klick prüft mit ihr vor dem Request.
  assert.ok(/const \{ fieldErrors: preErrors, banner \} = getCalculatorErrors\(form\);/.test(rechner),
    "der Rechner prüft vor dem Request nicht");
  const calcRegel = lies("../utils/calculatorValidation.mjs");
  assert.ok(/\["length", "Länge"\], \["width", "Breite"\], \["height", "Höhe"\]/.test(calcRegel),
    "der Rechner lässt eine Berechnung ohne Maße zu");
});

/* ══════════ Verdrahtung: frischer Start und keine Persistenz ════════════ */

test("21 — Sidebar „Neue Sendung“ beendet den laufenden Vorgang und montiert neu", () => {
  assert.ok(/if \(id === "new"\) \{\s*clearFlow\(\);\s*setNeueSendungKey\(\(k\) => k \+ 1\);/.test(dashboard),
    "der Navigationseintrag startet keinen frischen Vorgang");
  // Der Remount-Schlüssel ist zwingend: steht `page` schon auf „new", ist
  // setPage("new") ein No-Op und der LOKALE Formularzustand überlebte das
  // Leeren des Contexts.
  assert.ok(dashboard.includes("key={neueSendungKey}"), "die Seite wird nicht neu montiert");
});

test("22 — der Vorgang lebt nur im Speicher (Reload startet leer)", () => {
  assert.ok(!/getItem\(|setItem\(/.test(provider), "der Provider liest oder schreibt wieder einen Speicher");
  assert.ok(/useState\(\(\) => emptyFlow\(jetzt\(\)\)\)/.test(provider), "der Provider startet nicht leer");
});

/* ══════════ TESTS 25–28 — Vorgabe der Paketanzahl ════════════════════════
 *
 * „Neue Sendung" startet weiterhin leer — die Anzahl ist die einzige Ausnahme
 * und trägt ihren Normalfall 1. Die vier Prüfungen darunter halten fest, dass
 * daraus KEIN Festwert wird und dass die Vorgabe nichts überschreibt, was der
 * Kunde bereits gespeichert hat.
 */

test("25 — eine neue Sendung startet mit Anzahl 1 und ist damit ohne Zutun vollständig", () => {
  const leer = createEmptyShipmentForm();
  assert.equal(leer.packageCount, "1");
  // Der eigentliche Zweck: eine Standardsendung braucht dieses Feld nicht mehr.
  // Nur Gewicht und Maße fehlen noch — die Anzahl meldet keinen Fehler mehr.
  assert.equal(packageFieldError("packageCount", leer.packageCount), null,
    "die Vorgabe erzeugt selbst einen Feldfehler");
  const voll = { ...leer, weight: "5", length: "30", width: "20", height: "15" };
  assert.equal(packageComplete(voll), true,
    "eine Standardsendung ist trotz unberührter Anzahl nicht vollständig");
});

test("26 — die Anzahl bleibt frei editierbar (Vorgabe, kein Festwert)", () => {
  // Fachlich: andere Werte sind gültig und werden nicht auf 1 zurückgebogen.
  for (const wert of ["2", "3", "17", "99"]) {
    assert.equal(packageFieldError("packageCount", wert), null, `${wert} wird abgelehnt`);
    const form = { packageCount: wert, weight: "5", length: "30", width: "20", height: "15" };
    assert.equal(packagePayload(form).packageCount, Number(wert),
      `${wert} kommt nicht im Payload an`);
  }
  // Im Markup (seit Canonical v2.79 im gemeinsamen Paketeditor): ein kontrolliertes Feld, dessen
  // Eingabe als neue Zeilenliste in das Formular der Seite zurückläuft — ohne Sperre.
  const editor = ohneKommentare(lies("../components/shipping/PackageLinesEditor.jsx"));
  const anzahl = schnitt(editor, '{ key: "packageCount", label: "Anzahl"', "},", "Anzahl-Feld (26)");
  assert.ok(!/readOnly|disabled/.test(anzahl), "die Anzahl wurde gesperrt — sie ist eine Vorgabe, kein Festwert");
  // Und die Grenzen sind unverändert.
  assert.ok(/min: "1"/.test(anzahl) && /max: "99"/.test(anzahl) && /step: "1"/.test(anzahl),
    "die Eingabegrenzen der Anzahl haben sich geändert");
  const feld = schnitt(editor, "<Field", "/>", "Feld des Editors (26)");
  assert.ok(/value=\{zeile\[key\]\}/.test(feld), "die Anzahl ist kein kontrolliertes Feld mehr");
  assert.ok(/onChange=\{\(v\) => aendern\(index, key, v\)\}/.test(feld), "die Eingabe läuft nicht mehr über den Editor");
  assert.ok(/<PackageLinesEditor[\s\S]{0,200}onLinesChange=\{updPakete\}/.test(seite),
    "die Zeilen laufen nicht in das Formular der Seite zurück");
  assert.ok(/const updPakete = [\s\S]{0,120}formPatchFromPackageLines\(zeilen\)/.test(seite),
    "Zeile 1 landet nicht mehr in den flachen Feldern");
});

test("27 — ein gespeicherter Entwurf behält seine eigene Anzahl", () => {
  // Der Entwurfspfad läuft über buildResumeInitialState und ist von der Vorgabe
  // unberührt: ein Entwurf mit 3 Paketen wird mit 3 geöffnet, nicht mit 1.
  const mit3 = buildResumeInitialState({ packages: { packageCount: 3, weight: 8 } });
  assert.equal(mit3.form.packageCount, "3", "die Vorgabe hat den gespeicherten Wert überschrieben");
  assert.equal(mit3.form.weight, "8");
  // Ein Entwurf ohne Anzahl fällt auf denselben Normalfall zurück — nicht auf leer.
  const ohne = buildResumeInitialState({ packages: { weight: 8 } });
  assert.equal(ohne.form.packageCount, "1", "ein Entwurf ohne Anzahl startet nicht mit 1");
});

test("28 — Zurücksetzen stellt die Vorgabe wieder her, nicht ein leeres Feld", () => {
  // resetToFreshShipment ist die gemeinsame Grundlage von „Eingaben zurücksetzen"
  // und dem Erfolgspfad des Entwurfsspeicherns. Beide holen ihren Zustand aus
  // derselben Fabrik — deshalb genügt hier, dass genau das im Code steht.
  assert.ok(seite.includes("const resetToFreshShipment = () => {"), "der Zurücksetzen-Pfad fehlt");
  const reset = seite.slice(seite.indexOf("const resetToFreshShipment = () => {"));
  assert.ok(/const seed = leeresFormular\(\);/.test(reset.slice(0, 400)),
    "das Zurücksetzen baut seinen Zustand nicht mehr aus dem leeren Formular");
  // Und das leere Formular trägt die Vorgabe — damit ist der Reset mitgeprüft.
  assert.equal(createEmptyShipmentForm().packageCount, "1");
});
