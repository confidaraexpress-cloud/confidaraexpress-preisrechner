// Fehlernormalisierung + Preisrechner-Feldvalidierung.
//
// Deckt die Fälle ab, an denen bisher eine konkrete Ursache verloren ging und
// als „Fehler bei Preisberechnung" beim Kunden ankam.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeApiError, normalizeThrownError, mapServerField, summaryMessage,
  ERROR_TYPE, GENERIC_FALLBACK,
} from "./apiError.mjs";
import {
  getCalculatorErrors, firstErrorField, postalCodeTexts, countryName,
  CALCULATOR_FIELD_MAP,
} from "./calculatorValidation.mjs";
import { describePostalFormat } from "./postalCode.mjs";

const basisForm = {
  from_country: "DE", from_zip: "70173",
  to_country: "DE", to_zip: "10115",
  // Maße sind seit dem Paket „verpflichtende Paketmaße" Pflicht — die
  // Basisform ist deshalb vollständig, damit jeder Test nur den EINEN Fehler
  // prüft, den er meint. Zuvor standen hier leere Maße, weil das Backend sie
  // still durch 30/20/15 ersetzte.
  packageCount: "1", weight: "2", length: "30", width: "20", height: "15",
};
const mit = (over) => ({ ...basisForm, ...over });

// ══════════ Der gemeldete Fall ══════════

test("1 — DE + vierstellige PLZ „4444“ wird clientseitig erkannt und erklärt", () => {
  const { fieldErrors, banner } = getCalculatorErrors(mit({ to_zip: "4444" }));
  assert.equal(firstErrorField(fieldErrors), "to_zip", "der Fehler muss am Ziel-PLZ-Feld hängen");
  // Genau die drei geforderten Bestandteile: Wert, Land, Korrekturanweisung.
  assert.equal(banner.title, "Postleitzahl prüfen");
  assert.match(banner.message, /4444/, "der eingegebene Wert muss zitiert werden");
  assert.match(banner.message, /Deutschland/, "das Land muss benannt werden");
  assert.match(banner.message, /fünfstellige/, "die erwartete Länge muss genannt werden");
  assert.equal(fieldErrors.to_zip, "Bitte geben Sie eine fünfstellige deutsche Postleitzahl ein.");
});

test("2 — die ungültige PLZ wird gar nicht erst gesendet (Vorprüfung greift)", () => {
  const { fieldErrors } = getCalculatorErrors(mit({ to_zip: "4444" }));
  assert.ok(Object.keys(fieldErrors).length > 0,
    "die Vorprüfung muss anschlagen — sonst geht die Eingabe unnötig ans Backend");
});

test("3 — fünfstellige DE-PLZ ist gültig", () => {
  const { fieldErrors, banner } = getCalculatorErrors(mit({ to_zip: "10115" }));
  assert.deepEqual(fieldErrors, {});
  assert.equal(banner, null);
});

test("4 — Buchstaben in einer DE-PLZ werden abgelehnt", () => {
  const { fieldErrors } = getCalculatorErrors(mit({ to_zip: "1011A" }));
  assert.ok(fieldErrors.to_zip, "Buchstaben dürfen nicht durchgehen");
});

test("5 — leere Herkunfts- und Ziel-PLZ werden je eigenständig gemeldet", () => {
  const leerZiel = getCalculatorErrors(mit({ to_zip: "" }));
  assert.ok(leerZiel.fieldErrors.to_zip);
  assert.equal(leerZiel.banner.title, "Postleitzahl fehlt");

  const leerHerkunft = getCalculatorErrors(mit({ from_zip: "" }));
  assert.ok(leerHerkunft.fieldErrors.from_zip);
  assert.ok(!leerHerkunft.fieldErrors.to_zip, "der Fehler darf nicht am falschen Feld hängen");
});

// ══════════ Keine pauschale Fünfstelligkeit ══════════

test("6 — andere Länder behalten ihr eigenes Format", () => {
  // AT/CH = vier Ziffern: „4444" ist dort GÜLTIG und darf nicht abgelehnt werden.
  for (const cc of ["AT", "CH"]) {
    const r = getCalculatorErrors(mit({ to_country: cc, to_zip: "4444" }));
    assert.equal(r.fieldErrors.to_zip, undefined, `${cc}: vierstellige PLZ muss gültig sein`);
  }
  // NL braucht „1234 AB" — vier Ziffern allein reichen nicht.
  const nl = getCalculatorErrors(mit({ to_country: "NL", to_zip: "4444" }));
  assert.ok(nl.fieldErrors.to_zip, "NL: reine Ziffern sind kein gültiges NL-Format");
  assert.match(nl.fieldErrors.to_zip, /1234 AB/, "ohne ableitbare Wortform muss das Beispiel genannt werden");
});

test("7 — die Formatbeschreibung wird NUR abgeleitet, nie erfunden", () => {
  assert.equal(describePostalFormat("DE"), "fünfstellige");
  assert.equal(describePostalFormat("AT"), "vierstellige");
  // Zusammengesetzte Muster ergeben keine Wortform → null (Beispiel greift).
  for (const cc of ["NL", "GB", "US", "PL", "FR"]) {
    assert.equal(describePostalFormat(cc), null, `${cc} darf keine erfundene Wortform bekommen`);
  }
});

// ══════════ Paketdaten ══════════

test("8 — fehlendes Gewicht, Gewicht 0 und negative Maße werden je konkret gemeldet", () => {
  const fehlt = getCalculatorErrors(mit({ weight: "" }));
  assert.equal(fehlt.fieldErrors.weight, "Bitte geben Sie das Gewicht des Pakets ein.");

  const null_ = getCalculatorErrors(mit({ weight: "0" }));
  assert.match(null_.fieldErrors.weight, /größer als 0/);

  const negativ = getCalculatorErrors(mit({ length: "-5", width: "20", height: "15" }));
  assert.match(negativ.fieldErrors.length, /größer als 0/);
});

test("9 — fehlende Maße werden erkannt, auch wenn ALLE drei leer sind", () => {
  const teilweise = getCalculatorErrors(mit({ length: "30", width: "", height: "" }));
  assert.ok(teilweise.fieldErrors.width && teilweise.fieldErrors.height,
    "die fehlenden Maße müssen markiert werden");
  assert.equal(teilweise.banner.title, "Maße fehlen");

  // UMGEKEHRT gegenüber dem Vorzustand: „alle drei leer" war erlaubt, und das
  // Backend rechnete dann mit 30 × 20 × 15 cm weiter. Der Kunde bekam einen
  // Preis für ein Paket, das er nie beschrieben hat — genau das ist behoben.
  const alleLeer = getCalculatorErrors(mit({ length: "", width: "", height: "" }));
  for (const feld of ["length", "width", "height"])
    assert.ok(alleLeer.fieldErrors[feld], `${feld} wird nicht als fehlend erkannt`);
  assert.equal(alleLeer.banner.title, "Maße fehlen");
});

test("10 — mehrere Fehler: das oberste Feld wird angesprungen, Anzahl wird genannt", () => {
  const r = getCalculatorErrors(mit({ to_zip: "4444", weight: "" }));
  assert.equal(firstErrorField(r.fieldErrors), "to_zip", "PLZ steht im Formular über dem Gewicht");
  assert.equal(summaryMessage(Object.keys(r.fieldErrors).length), "Bitte korrigieren Sie die 2 markierten Angaben.");
  assert.equal(summaryMessage(1), "Bitte prüfen Sie die markierte Angabe.");
});

// ══════════ API-Antworten ══════════

test("11 — der PLZ-422 des Backends wird vollständig ausgewertet (der eigentliche Defekt)", () => {
  // Genau diese Antwortform fiel bisher auf „Fehler bei Preisberechnung" zurück,
  // weil der Client nur `d.error` las — die Antwort trägt aber `message`.
  const n = normalizeApiError({
    status: 422,
    body: { code: "INVALID_POSTAL_CODE_FORMAT", field: "recipient.postalCode",
            countryCode: "DE", message: "Die Postleitzahl entspricht nicht dem Format des ausgewählten Landes.", example: "26133" },
    fieldMap: CALCULATOR_FIELD_MAP,
  });
  assert.equal(n.code, "INVALID_POSTAL_CODE_FORMAT");
  assert.equal(n.type, ERROR_TYPE.VALIDATION);
  assert.equal(n.title, "Postleitzahl prüfen");
  assert.equal(n.field, "to_zip", "das Backend-Feld muss auf das Formularfeld gemappt werden");
  assert.notEqual(n.message, GENERIC_FALLBACK.message, "die konkrete Meldung darf nicht verloren gehen");
  assert.equal(n.retryable, false);
});

test("12 — alte Antwortform ohne code/field bleibt verwertbar", () => {
  const n = normalizeApiError({ status: 400, body: { error: "weight: Pflichtfeld, muss eine positive Zahl sein (0.1–1000 kg)" } });
  assert.equal(n.type, ERROR_TYPE.VALIDATION, "eine 400 ist kein Systemfehler");
  assert.match(n.message, /weight/, "der Servertext bleibt erhalten, wenn es nichts Besseres gibt");
  assert.equal(n.field, null, "ohne field darf kein Feld erfunden werden");
});

test("13 — neue Validierungscodes tragen Feld UND kundentaugliche Korrektur", () => {
  const n = normalizeApiError({
    status: 400, body: { error: "weight: Pflichtfeld…", code: "WEIGHT_INVALID", field: "weight" },
    fieldMap: CALCULATOR_FIELD_MAP,
  });
  assert.equal(n.field, "weight");
  assert.match(n.message, /größer als 0 kg/);
  // Der entwicklergerichtete Servertext erreicht den Kunden NICHT.
  assert.ok(!/Pflichtfeld…/.test(n.message), "der technische Servertext darf nicht angezeigt werden");
});

test("14 — „keine Angebote“ ist ein Geschäftsfall, kein technischer Fehler", () => {
  const n = normalizeApiError({ status: 422, body: { error: "Keine Preise gefunden", code: "NO_RATES_FOUND" } });
  assert.equal(n.type, ERROR_TYPE.BUSINESS);
  assert.match(n.message, /Versandroute, Versanddatum und Paketdaten/);
  assert.equal(n.retryable, false, "ein erneuter Klick mit denselben Daten hilft nicht");
});

test("15 — abgelaufene Sitzung, Rate-Limit, Konflikt und 5xx werden unterschieden", () => {
  assert.equal(normalizeApiError({ status: 401, body: {} }).type, ERROR_TYPE.AUTH);
  assert.match(normalizeApiError({ status: 401, body: {} }).message, /erneut an/);
  assert.equal(normalizeApiError({ status: 429, body: {} }).type, ERROR_TYPE.RATE_LIMIT);
  assert.equal(normalizeApiError({ status: 409, body: {} }).type, ERROR_TYPE.BUSINESS);
  assert.equal(normalizeApiError({ status: 500, body: {} }).type, ERROR_TYPE.TECHNICAL);
  assert.equal(normalizeApiError({ status: 503, body: {} }).type, ERROR_TYPE.TECHNICAL);
  assert.equal(normalizeApiError({ status: 504, body: {} }).code, "TIMEOUT");
  // Ein technischer Fehler ist wiederholbar, ein Eingabefehler nicht.
  assert.equal(normalizeApiError({ status: 500, body: {} }).retryable, true);
});

test("16 — 5xx zeigt niemals den rohen Servertext", () => {
  const n = normalizeApiError({ status: 500, body: { error: "ER_DUP_ENTRY: Duplicate key 'shipments.PRIMARY'" } });
  assert.ok(!/ER_DUP_ENTRY|PRIMARY/.test(n.message), "Datenbankinterna dürfen den Kunden nie erreichen");
});

test("17 — Netzwerkabbruch und Zeitüberschreitung sind unterscheidbar", () => {
  const netz = normalizeThrownError(new TypeError("Failed to fetch"));
  assert.equal(netz.type, ERROR_TYPE.NETWORK);
  assert.match(netz.message, /Internetverbindung/);
  assert.ok(!/Failed to fetch/.test(netz.message), "der rohe Technikertext darf nicht angezeigt werden");

  const abbruch = normalizeThrownError(Object.assign(new Error("x"), { name: "AbortError" }));
  assert.equal(abbruch.code, "ABORTED");

  const timeout = normalizeThrownError(Object.assign(new Error("x"), { name: "TimeoutError" }));
  assert.equal(timeout.code, "TIMEOUT");
});

test("18 — unbekannter Code/Status fällt auf den sicheren Text zurück", () => {
  const n = normalizeApiError({ status: 418, body: { code: "VOELLIG_NEU" } });
  assert.equal(n.code, "UNKNOWN_ERROR");
  assert.match(n.message, /Support/, "der Auffangtext nennt den Support");
  assert.equal(normalizeApiError({}).code, "UNKNOWN_ERROR", "leere Eingabe darf nicht werfen");
  assert.equal(normalizeApiError({ status: 500, body: null }).type, ERROR_TYPE.TECHNICAL);
});

test("19 — Feldzuordnung: bekannter Pfad, Kurzform, unbekanntes Feld", () => {
  assert.equal(mapServerField("recipient.postalCode", CALCULATOR_FIELD_MAP), "to_zip");
  assert.equal(mapServerField("weight", CALCULATOR_FIELD_MAP), "weight");
  assert.equal(mapServerField("voellig.unbekannt", CALCULATOR_FIELD_MAP), null,
    "ein unbekanntes Feld darf NICHT geraten werden — sonst klebt der Fehler am falschen Eingabefeld");
  assert.equal(mapServerField(undefined, CALCULATOR_FIELD_MAP), null);
});

test("20 — Ländername und PLZ-Texte sind robust gegen unbekannte Codes", () => {
  assert.equal(countryName("DE"), "Deutschland");
  assert.equal(countryName("XX"), "XX", "unbekannter Code darf nicht werfen");
  assert.equal(postalCodeTexts("DE", "10115", "Ziel-Postleitzahl"), null, "gültige PLZ ergibt keinen Text");
});
