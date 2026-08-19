import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchLocalities, fetchStreets, validateAddress } from "../api/addressValidationApi";
import {
  ADDRESS_STATUS, addressFingerprint, shouldInvalidateAddress, isAddressCheckSupported,
  isPostalCodeQueryable, isStreetQueryable, streetSearchTerm, readAddressResponse,
} from "../utils/addressValidationView.mjs";

// useAddressValidation — EIN Hook für jedes Adressformular (Sendung, Adressbuch, Auftrag).
//
// Er kapselt alles, was sonst in jedem Formular einzeln nachgebaut würde: Entprellung,
// Abbruch überholter Anfragen, Reihenfolgesicherung, Invalidierung bei Änderung und die
// Auswertung der Serverantwort. Die Formulare behalten ihren eigenen Formularstate — der
// Hook liest ihn nur und meldet Ergebnisse zurück.
//
// Bewusst NICHT enthalten: Speichern, Absenden, Feldpflichtregeln. Der Hook prüft, er
// entscheidet nichts über das Formular.

const DEBOUNCE_MS = 300;

export function useAddressValidation({ country, postalCode, city, street, enabled = true }) {
  const [status, setStatus] = useState(ADDRESS_STATUS.IDLE);
  const [cityOptions, setCityOptions] = useState([]);
  const [streetOptions, setStreetOptions] = useState([]);
  const [normalized, setNormalized] = useState(null);
  // Der Kunde kann einen nicht bestätigten Zustand bewusst übernehmen („trotzdem verwenden").
  // Das ist eine Entscheidung, kein Prüfergebnis — deshalb ein eigener Wert.
  const [acknowledged, setAcknowledged] = useState(false);

  const supported = isAddressCheckSupported(country);
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

  const abortAll = useCallback(() => {
    localitiesAbort.current?.abort();
    streetsAbort.current?.abort();
    validateAbort.current?.abort();
  }, []);

  // ── Invalidierung ──────────────────────────────────────────────────────────
  // Ändert sich die Adresse, verfällt jede frühere Bestätigung sofort. Ohne das stünde
  // ein grüner Haken neben einer inzwischen anderen Adresse.
  useEffect(() => {
    if (shouldInvalidateAddress(lastFingerprint.current, fingerprint)) {
      lastFingerprint.current = fingerprint;
      abortAll();
      setStatus(ADDRESS_STATUS.IDLE);
      setStreetOptions([]);
      setNormalized(null);
      setAcknowledged(false);
    } else {
      lastFingerprint.current = fingerprint;
    }
  }, [fingerprint, abortAll]);

  // Laufende Anfragen beim Verlassen abbrechen.
  useEffect(() => () => abortAll(), [abortAll]);

  // ── PLZ → Ortsvorschläge ───────────────────────────────────────────────────
  // Läuft entprallt, sobald die PLZ plausibel vollständig ist. Ein Ergebnis wird NIE
  // ungefragt in das Ortsfeld geschrieben — das entscheidet das Formular (siehe unten:
  // `cityOptions` mit genau einem Eintrag ist ein Vorschlag, kein Befehl).
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
        const r = await fetchLocalities({ country, postalCode }, { signal: controller.signal });
        if (locSeq.current !== mine) return;
        if (!r.ok) { setCityOptions([]); return; }
        const body = await r.json().catch(() => null);
        if (locSeq.current !== mine) return;
        const cities = body && Array.isArray(body.cities) ? body.cities.filter((c) => typeof c === "string") : [];
        setCityOptions(cities);
      } catch (e) {
        // Ein Abbruch ist kein Fehler des Nutzers und erzeugt keine Meldung.
        if (e && e.name === "AbortError") return;
        setCityOptions([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, supported, country, postalCode]);

  // ── Straßen-Autocomplete ───────────────────────────────────────────────────
  // Sucht ausschließlich innerhalb der bereits bekannten PLZ/Ort-Kombination — nie
  // deutschlandweit. Gesucht wird nur mit dem Straßennamen (ohne Hausnummer).
  useEffect(() => {
    if (!enabled || !supported || !isStreetQueryable(country, postalCode, city, street)) {
      setStreetOptions([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      const mine = ++strSeq.current;
      streetsAbort.current?.abort();
      const controller = new AbortController();
      streetsAbort.current = controller;
      try {
        const r = await fetchStreets(
          { country, postalCode, city, street: streetSearchTerm(street) },
          { signal: controller.signal }
        );
        if (strSeq.current !== mine) return;
        if (!r.ok) { setStreetOptions([]); return; }
        const body = await r.json().catch(() => null);
        if (strSeq.current !== mine) return;
        const streets = body && Array.isArray(body.streets)
          ? body.streets.filter((s) => s && typeof s.street === "string")
          : [];
        setStreetOptions(streets);
      } catch (e) {
        if (e && e.name === "AbortError") return;
        setStreetOptions([]);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, supported, country, postalCode, city, street]);

  // ── Ausdrückliche Gesamtprüfung ────────────────────────────────────────────
  // Wird vom Formular aufgerufen (Feld verlassen, „Weiter", vor der Preisberechnung) —
  // nicht bei jedem Tastendruck. Gibt das Ergebnis auch zurück, damit ein Aufrufer
  // unmittelbar darauf reagieren kann, ohne auf den nächsten Render zu warten.
  const runValidation = useCallback(async () => {
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
        // Auch ein Serverfehler ist NIE „Adresse ungültig" — er ist ein Ausfall der Prüfung.
        setStatus(ADDRESS_STATUS.UNAVAILABLE);
        return { status: ADDRESS_STATUS.UNAVAILABLE };
      }
      const body = await r.json().catch(() => null);
      if (valSeq.current !== mine) return null;
      const parsed = readAddressResponse(body);
      setStatus(parsed.status);
      setNormalized(parsed.normalized);
      if (parsed.citySuggestions.length) setCityOptions(parsed.citySuggestions);
      if (parsed.streetSuggestions.length) setStreetOptions(parsed.streetSuggestions);
      return parsed;
    } catch (e) {
      if (e && e.name === "AbortError") return null;
      setStatus(ADDRESS_STATUS.UNAVAILABLE);
      return { status: ADDRESS_STATUS.UNAVAILABLE };
    }
  }, [enabled, supported, country, postalCode, city, street]);

  const acknowledge = useCallback(() => setAcknowledged(true), []);

  const reset = useCallback(() => {
    abortAll();
    setStatus(ADDRESS_STATUS.IDLE);
    setCityOptions([]);
    setStreetOptions([]);
    setNormalized(null);
    setAcknowledged(false);
  }, [abortAll]);

  return {
    status, cityOptions, streetOptions, normalized, acknowledged,
    supported, runValidation, acknowledge, reset,
    fingerprint,
  };
}
