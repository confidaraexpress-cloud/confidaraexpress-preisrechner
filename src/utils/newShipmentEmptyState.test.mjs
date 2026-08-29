// „Neue Sendung": leerer Nullzustand + verpflichtende Paketmaße.
//
// Zwei zusammengehörende Zusagen:
//   1. Das Formular startet leer. Kein Profil-Autoseed, kein vorausgewähltes
//      Land, keine Paketwerte — gespeicherte Angaben kommen ausschließlich über
//      eine bewusste Aktion (Komfortfunktion, Adressbuch, Entwurf öffnen).
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
  createEmptyShipmentForm, senderPatchFromProfile, hasProfileSenderData,
  packageFieldError, packageErrors, packageComplete, packageHint,
  packagePayload, packageSummaryLine, PACKAGE_FIELDS, PACKAGE_PLACEHOLDERS, PACKAGE_COUNT_DEFAULT,
} from "./newShipmentForm.mjs";
import { buildResumeInitialState } from "./formDraftsView.mjs";
// Fail-closed Quelltextzugriff: fehlende Anker sind LAUTE Fehler, nie leere Ausschnitte.
import { schnitt } from "../../scripts/governance.mjs";

const lies = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const ohneKommentare = (code) => code
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");

const seite     = ohneKommentare(lies("../pages/NewShipmentPage.jsx"));
const rechner   = ohneKommentare(lies("../pages/CalculatorPage.jsx"));
const dashboard = ohneKommentare(lies("../pages/DashboardPage.jsx"));
const provider  = ohneKommentare(lies("../context/ShippingFlowContext.jsx"));
const buchung   = ohneKommentare(lies("../pages/BookingPage.jsx"));

const VOLL = { packageCount: "1", weight: "5", length: "30", width: "20", height: "15" };

/* ══════════ TEST 1 — frisches Formular ist leer ══════════════════════════ */

test("1 — jedes user-editierbare Feld startet leer, nur die Anzahl trägt ihre Vorgabe", () => {
  const leer = createEmptyShipmentForm();
  // Die Regel ist unverändert „alles leer" — mit GENAU EINER benannten Ausnahme.
  // Sie steht hier als Allowlist und nicht als gelockerte Prüfung: ein zweites
  // vorbelegtes Feld fällt weiterhin sofort auf.
  const VORBELEGT = { packageCount: PACKAGE_COUNT_DEFAULT };
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

/* ══════════ TEST 3 — Komfortfunktion Absender ════════════════════════════ */

test("3 — „Eigene Adresse“ füllt den Absender korrekt", () => {
  const patch = senderPatchFromProfile({
    company_name: "Muster GmbH", name: "Max Muster", street: "Musterstr. 1",
    zip: "70173", city: "Stuttgart", country: "DEU", phone: "0711 1", email: "a@b.de",
  });
  assert.deepEqual(patch, {
    s_company: "Muster GmbH", s_fullName: "Max Muster", s_street: "Musterstr. 1",
    s_addition: "", s_zip: "70173", s_city: "Stuttgart",
    // „DEU" wird normalisiert — ein Wert, der in keiner <option> steht, zeigte
    // im Auswahlfeld gar nichts an und ließ jeden Entwurf serverseitig scheitern.
    s_country: "DE", s_phone: "0711 1", s_email: "a@b.de",
  });
  // Sie fasst ausschließlich Absenderfelder an.
  for (const k of Object.keys(patch)) assert.ok(k.startsWith("s_"), `${k} ist kein Absenderfeld`);
});

test("3b — ohne hinterlegte Anschrift erscheint die Aktion gar nicht", () => {
  assert.equal(hasProfileSenderData({}), false);
  assert.equal(hasProfileSenderData(null), false);
  assert.equal(hasProfileSenderData({ country: "DE" }), false, "ein Land allein ist keine Anschrift");
  assert.equal(hasProfileSenderData({ city: "Stuttgart" }), true);
  assert.ok(seite.includes("{profilAbsenderVerfuegbar && ("), "die Sichtbarkeit hängt an nichts");
});

test("3c — die Übernahme ist EIN Patch mit GENAU EINER Invalidierung", () => {
  // Funktionsrumpf fail-closed geschnitten: von der Deklaration bis zur
  // schließenden Klammer auf Deklarationsebene ("\n  };").
  const koerper = schnitt(seite, "const uebernimmProfilAbsender = ", "\n  };", "Profilabsender-Übernahme (3c)");
  assert.equal((koerper.match(/setForm\(/g) || []).length, 1, "mehr als ein Formularpatch");
  assert.equal((koerper.match(/invalidateResults\(\)/g) || []).length, 1, "nicht genau eine Invalidierung");
  // Die Baseline wird NICHT nachgezogen: eine Nutzeraktion macht die Seite
  // „dirty" — sonst verschwände der Verlassen-Hinweis und der Entwurfsknopf
  // bliebe gesperrt.
  assert.ok(!/setBaseline\(/.test(koerper), "die Baseline wird nachgezogen");
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
  // Die Beispiele sind als solche erkennbar — eine nackte „5" in einem
  // Zahlenfeld ist von einer echten Eingabe nicht zu unterscheiden.
  assert.equal(PACKAGE_PLACEHOLDERS.packageCount, "1");
  for (const [k, erwartet] of [["weight", "z. B. 5"], ["length", "z. B. 30"], ["width", "z. B. 20"], ["height", "z. B. 15"]])
    assert.equal(PACKAGE_PLACEHOLDERS[k], erwartet, `${k}: falscher Placeholder`);
  // Und im Markup steht kein hartes Zahlenliteral mehr als Placeholder.
  for (const k of PACKAGE_FIELDS)
    assert.ok(seite.includes(`placeholder={PACKAGE_PLACEHOLDERS.${k}}`), `${k}: Placeholder nicht aus der Quelle`);
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
  // Ohne Land ist das Land „nicht unterstützt" — der Hook fragt dann nichts ab
  // und zeigt nichts an. Das ist die bestehende Regel, sie greift hier von
  // selbst, weil das Land jetzt leer startet.
  assert.equal(leer.s_country, "");
  assert.equal(leer.r_country, "");
  assert.equal(leer.s_zip, "");
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
  assert.ok(seite.includes("...packagePayload(form)"), "der Payload kommt nicht aus packagePayload");
});

test("20 — der Preisrechner verlangt die Maße ebenfalls", () => {
  assert.ok(/calcValid =[\s\S]{0,200}form\.length[\s\S]{0,60}form\.width[\s\S]{0,60}form\.height/.test(rechner),
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
  // Im Markup: ein kontrolliertes Feld am gemeinsamen upd(), ohne Sperre.
  const bis = schnitt(seite, 'id="ns-packageCount"', "/>", "Anzahl-Feld (26)");
  assert.ok(/value=\{form\.packageCount\}/.test(bis), "die Anzahl ist kein kontrolliertes Feld mehr");
  assert.ok(/onChange=\{\(v\) => upd\("packageCount", v\)\}/.test(bis), "die Eingabe läuft nicht mehr über upd()");
  assert.ok(!/readOnly|disabled/.test(bis), "die Anzahl wurde gesperrt — sie ist eine Vorgabe, kein Festwert");
  // Und die Grenzen sind unverändert.
  assert.ok(/min="1"/.test(bis) && /max="99"/.test(bis) && /step="1"/.test(bis),
    "die Eingabegrenzen der Anzahl haben sich geändert");
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
