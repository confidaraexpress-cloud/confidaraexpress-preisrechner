import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLocalities, fetchStreets, validateAddress } from "../api/addressValidationApi";
import {
  ADDRESS_STATUS, addressFingerprint, shouldInvalidateAddress, isAddressCheckSupported,
  isPostalCodeQueryable, isStreetQueryable, isValidationReady, streetQueryText, suggestionLabel,
  readAddressResponse, readStreetSuggestions,
} from "../utils/addressValidationView.mjs";

// useAddressValidation — EIN Hook für jedes Adressformular (Sendung, Adressbuch, Auftrag,
// Firmenprofil, Registrierung, Partnerabrechnung, Preisrechner).
//
// Er kapselt alles, was sonst in jedem Formular einzeln nachgebaut würde: Entprellung,
// Abbruch überholter Anfragen, Reihenfolgesicherung, Invalidierung bei Änderung, die
// automatische Gesamtprüfung und die Auswertung der Serverantwort. Die Formulare behalten
// ihren eigenen Formularstate — der Hook liest ihn nur und meldet Ergebnisse zurück.
//
// Bewusst NICHT enthalten: Speichern, Absenden, Feldpflichtregeln, Sperren. Der Hook prüft,
// er entscheidet nichts über das Formular. Vorschläge übernimmt allein das Formular — und nur
// nach einer Auswahl des Kunden (applyAddressSuggestion).
//
// `publicAccess` (nur Registrierung): öffentliche Routen, keine Gesamtprüfung.

const DEBOUNCE_MS = 300;
// Die Gesamtprüfung läuft, wenn die Anschrift vollständig aussieht und der Kunde eine Sekunde
// nichts mehr geändert hat — nicht bei jedem Tastendruck, aber ohne dass er etwas anklicken
// muss. Jede Änderung (auch an der Hausnummer) verwirft das Ergebnis und startet neu.
const AUTO_VALIDATE_MS = 1000;
// Meldet der Server „nicht eingerichtet“, fragt in dieser Sitzung niemand mehr für eine Weile:
// ohne Schlüssel gibt es nichts zu holen, und jede Anfrage wäre Last ohne Nutzen.
const SERVICE_OFF_MS = 10 * 60 * 1000;

let serviceOffUntil = 0;
const unsupportedCountries = new Set();

function noteServerStatus(body, country) {
  if (!body || body.status !== ADDRESS_STATUS.UNSUPPORTED) return false;
  if (body.reason === "not_configured") serviceOffUntil = Date.now() + SERVICE_OFF_MS;
  else unsupportedCountries.add(String(country || "").trim().toUpperCase());
  return true;
}

function serviceAvailableFor(country) {
  return Date.now() >= serviceOffUntil
    && !unsupportedCountries.has(String(country || "").trim().toUpperCase());
}

export function useAddressValidation({
  country, postalCode, city, street, enabled = true, publicAccess = false,
}) {
  const [status, setStatus] = useState(ADDRESS_STATUS.IDLE);
  const [reason, setReason] = useState(null);
  const [cityOptions, setCityOptions] = useState([]);
  const [streetOptions, setStreetOptions] = useState([]);
  const [normalized, setNormalized] = useState(null);
  const [houseNumberVerified, setHouseNumberVerified] = useState(false);
  // Der Kunde kann einen nicht bestätigten Zustand bewusst übernehmen („Adresse so verwenden“).
  // Das ist eine Entscheidung, kein Prüfergebnis — deshalb ein eigener Wert.
  const [acknowledged, setAcknowledged] = useState(false);
  // Zählt Serverauskünfte „nicht abgedeckt/nicht eingerichtet“, damit `supported` neu
  // berechnet wird (die Merker liegen modulweit, nicht im State).
  const [, setUnsupportedTick] = useState(0);

  const supported = isAddressCheckSupported(country) && serviceAvailableFor(country);
  const fingerprint = useMemo(
    () => addressFingerprint({ country, postalCode, city, street }),
    [country, postalCode, city, street]
  );

  const localitiesAbort = useRef(null);
  const streetsAbort = useRef(null);
  const validateAbort = useRef(null);
  // Sequenznummern: ein bereits unterwegs befindliches Ergebnis darf ein neueres nie
  // überschreiben. AbortController allein genügt dafür nicht — eine Antwort kann den
  // Abbruch knapp gewinnen.
  const locSeq = useRef(0);
  const strSeq = useRef(0);
  const valSeq = useRef(0);
  const lastFingerprint = useRef(fingerprint);
  // PLZ und Ort grenzen die Straßensuche nur ein. Sie lösen selbst keine neue Straßensuche
  // aus — sonst kostete jede PLZ-Eingabe eine weitere Anfrage, obwohl niemand in der Straße tippt.
  const contextRef = useRef({ postalCode, city });
  contextRef.current = { postalCode, city };
  // Nach der Auswahl eines Vorschlags steht dessen Text im Feld. Für genau diesen Wert wird
  // nicht erneut gesucht — die Liste ginge sonst sofort wieder auf und kostete eine Anfrage.
  const skipStreetRef = useRef(null);

  const abortAll = useCallback(() => {
    localitiesAbort.current?.abort();
    streetsAbort.current?.abort();
    validateAbort.current?.abort();
  }, []);

  const markUnsupported = useCallback((body) => {
    if (noteServerStatus(body, country)) setUnsupportedTick((n) => n + 1);
  }, [country]);

  // ── Invalidierung ──────────────────────────────────────────────────────────
  // Ändert sich die Adresse — einschließlich der Hausnummer —, verfällt jede frühere Prüfung
  // sofort. Ohne das stünde ein Ergebnis neben einer inzwischen anderen Adresse. Abgebrochen
  // wird nur die Prüfung: Orts- und Straßenabfragen steuern ihre eigenen Effekte.
  useEffect(() => {
    if (shouldInvalidateAddress(lastFingerprint.current, fingerprint)) {
      lastFingerprint.current = fingerprint;
      validateAbort.current?.abort();
      valSeq.current += 1;
      setStatus(ADDRESS_STATUS.IDLE);
      setReason(null);
      setNormalized(null);
      setHouseNumberVerified(false);
      setAcknowledged(false);
    } else {
      lastFingerprint.current = fingerprint;
    }
  }, [fingerprint]);

  // Laufende Anfragen beim Verlassen abbrechen.
  useEffect(() => () => abortAll(), [abortAll]);

  // ── PLZ → Ortsvorschläge ───────────────────────────────────────────────────
  // Läuft entprellt, sobald die PLZ formal gültig ist. Ein Ergebnis wird NIE ungefragt in das
  // Ortsfeld geschrieben — das entscheidet das Formular (`cityOptions` mit genau einem Eintrag
  // ist ein Vorschlag, kein Befehl).
  useEffect(() => {
    if (!enabled || !supported || !isPostalCodeQueryable(country, postalCode)) {
      setCityOptions([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      const mine = ++locSeq.current;
      localitiesAbort.current?.abort();
      const controller = new AbortController();
      localitiesAbort.current = controller;
      try {
        const r = await fetchLocalities({ country, postalCode }, { signal: controller.signal, publicAccess });
        if (locSeq.current !== mine) return;
        if (!r.ok) { setCityOptions([]); return; }
        const body = await r.json().catch(() => null);
        if (locSeq.current !== mine) return;
        markUnsupported(body);
        const cities = body && Array.isArray(body.cities) ? body.cities.filter((c) => typeof c === "string") : [];
        setCityOptions(cities);
      } catch (e) {
        // Ein Abbruch ist kein Fehler des Nutzers und erzeugt keine Meldung.
        if (e && e.name === "AbortError") return;
        setCityOptions([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, supported, country, postalCode, publicAccess, markUnsupported]);

  // ── Adressvorschläge ───────────────────────────────────────────────────────
  // Ab drei Zeichen im Feld „Straße und Hausnummer“; PLZ und Ort grenzen die Suche ein, wenn
  // sie schon bekannt sind.
  useEffect(() => {
    const text = streetQueryText(street);
    if (!enabled || !supported || !isStreetQueryable(country, postalCode, city, street)) {
      setStreetOptions([]);
      return undefined;
    }
    if (skipStreetRef.current !== null && skipStreetRef.current === text) {
      return undefined;
    }
    skipStreetRef.current = null;
    const timer = setTimeout(async () => {
      const mine = ++strSeq.current;
      streetsAbort.current?.abort();
      const controller = new AbortController();
      streetsAbort.current = controller;
      const ctx = contextRef.current;
      try {
        const r = await fetchStreets(
          {
            country,
            postalCode: isPostalCodeQueryable(country, ctx.postalCode) ? ctx.postalCode : "",
            city: String(ctx.city || "").trim(),
            street: text,
          },
          { signal: controller.signal, publicAccess }
        );
        if (strSeq.current !== mine) return;
        if (!r.ok) { setStreetOptions([]); return; }
        const body = await r.json().catch(() => null);
        if (strSeq.current !== mine) return;
        markUnsupported(body);
        setStreetOptions(readStreetSuggestions(body).map((s) => ({ ...s, label: suggestionLabel(s, country) })));
      } catch (e) {
        if (e && e.name === "AbortError") return;
        setStreetOptions([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // PLZ/Ort bewusst nicht in den Abhängigkeiten: siehe contextRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, supported, country, street, publicAccess, markUnsupported]);

  // ── Gesamtprüfung ──────────────────────────────────────────────────────────
  // Gibt das Ergebnis auch zurück, damit ein Aufrufer unmittelbar darauf reagieren kann.
  // Sie läuft automatisch (siehe unten) und kann ausdrücklich angestoßen werden.
  const runValidation = useCallback(async () => {
    if (publicAccess) return { status: ADDRESS_STATUS.IDLE };
    if (!enabled || !supported) {
      setStatus(ADDRESS_STATUS.UNSUPPORTED);
      return { status: ADDRESS_STATUS.UNSUPPORTED };
    }
    const mine = ++valSeq.current;
    validateAbort.current?.abort();
    const controller = new AbortController();
    validateAbort.current = controller;
    setStatus(ADDRESS_STATUS.CHECKING);
    try {
      const r = await validateAddress({ country, postalCode, city, street }, { signal: controller.signal });
      if (valSeq.current !== mine) return null;
      if (!r.ok) {
        // Auch ein Serverfehler ist NIE „Adresse falsch“ — er ist ein Ausfall der Prüfung.
        setStatus(ADDRESS_STATUS.UNAVAILABLE);
        setReason(null);
        return { status: ADDRESS_STATUS.UNAVAILABLE };
      }
      const body = await r.json().catch(() => null);
      if (valSeq.current !== mine) return null;
      markUnsupported(body);
      const parsed = readAddressResponse(body);
      setStatus(parsed.status);
      setReason(parsed.reason);
      setNormalized(parsed.normalized);
      setHouseNumberVerified(parsed.houseNumberVerified);
      if (parsed.citySuggestions.length) setCityOptions(parsed.citySuggestions);
      return parsed;
    } catch (e) {
      if (e && e.name === "AbortError") return null;
      setStatus(ADDRESS_STATUS.UNAVAILABLE);
      setReason(null);
      return { status: ADDRESS_STATUS.UNAVAILABLE };
    }
  }, [enabled, supported, publicAccess, country, postalCode, city, street, markUnsupported]);

  // Automatisch, sobald die Anschrift vollständig aussieht und eine Sekunde ruht.
  useEffect(() => {
    if (publicAccess || !enabled || !supported || status !== ADDRESS_STATUS.IDLE) return undefined;
    if (!isValidationReady({ country, postalCode, city, street })) return undefined;
    const timer = setTimeout(() => { runValidation(); }, AUTO_VALIDATE_MS);
    return () => clearTimeout(timer);
  }, [publicAccess, enabled, supported, status, fingerprint, runValidation]); // eslint-disable-line react-hooks/exhaustive-deps

  const acknowledge = useCallback(() => setAcknowledged(true), []);

  // Das Formular meldet die Übernahme eines Vorschlags: für genau diesen Straßenwert wird
  // nicht erneut gesucht, und die Liste schließt sich.
  const markSelected = useCallback((streetValue) => {
    skipStreetRef.current = streetQueryText(streetValue);
    strSeq.current += 1;
    streetsAbort.current?.abort();
    setStreetOptions([]);
  }, []);

  const reset = useCallback(() => {
    abortAll();
    setStatus(ADDRESS_STATUS.IDLE);
    setReason(null);
    setCityOptions([]);
    setStreetOptions([]);
    setNormalized(null);
    setHouseNumberVerified(false);
    setAcknowledged(false);
  }, [abortAll]);

  return {
    status, reason, cityOptions, streetOptions, normalized, houseNumberVerified, acknowledged,
    supported, runValidation, acknowledge, markSelected, reset,
    fingerprint,
  };
}
