import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Field } from "../components/ui/Field";
import { countries } from "../utils/countries.js";
import { scopedCountries, scopedOriginCountries } from "../utils/launchScopeView.mjs";
import { postalCodeExample, postalCodeMaxLength } from "../utils/postalCode.mjs";
import { businessTodayISO } from "../utils/businessDate.mjs";
import { requestPublicPriceQuote } from "../api/publicCalculatorApi.js";
import {
  LOGIN_URL, OUTCOME, SLOW_HINT_AFTER_MS, buildPublicQuoteRequest, emptyPublicForm, localIsoDate, publicFormErrors,
  quoteOutcomeFromError, quoteOutcomeFromResponse, requestKey,
} from "../utils/publicCalculatorView.mjs";
import { PublicResults } from "./PublicResults.jsx";

// ── Öffentlicher Preisrechner: Formular und Ablauf ───────────────────────────
// Bewusst schmal (Betreiberentscheidung 2026-10-16): Absender und Empfänger mit Land, PLZ und
// Stadt, das Paket mit Anzahl (vorbelegt 1), Gewicht und Maßen — sonst nichts. Versanddatum,
// Abholung/Abgabe und Versandart fragt die Seite nicht ab: gerechnet wird ab dem heutigen
// Geschäftstag (Europe/Berlin, utils/businessDate.mjs), den der Server wie im Kundenrechner auf
// den nächstmöglichen Abholtag schiebt, mit allen Dienstleistungen und Versandarten.
// Prüfungen wie im Versandkostenrechner der Kunden. Ein Request je Absenden: der Knopf ist
// gesperrt, solange gerechnet wird, und eine unveränderte Eingabe löst keinen neuen Request aus.
// Die Ergebnisse stehen im eigenen Abschnitt direkt unter dem Hero (Portal in #pc-results) und
// erscheinen erst mit der ersten Berechnung.
//
// Das Seitengerüst (preisrechner/index.html) trägt dieselbe Formularstruktur als statisches
// Skelett: beim ersten Rendern ersetzt React es, ohne dass die Seite springt. Wer hier eine Zeile
// oder ein Feld ändert, ändert das Skelett mit (publicCalculatorIsland.test.mjs vergleicht die
// Struktur, tests/e2e/publicCalculatorBuild.test.mjs die Höhen in sechs Breiten).

const FELD_ID = Object.freeze({
  from_country: "pc-from-country", from_zip: "pc-from-zip", from_city: "pc-from-city",
  to_country: "pc-to-country", to_zip: "pc-to-zip", to_city: "pc-to-city",
  packageCount: "pc-package-count", weight: "pc-weight", length: "pc-length", width: "pc-width", height: "pc-height",
});

const ERGEBNISZUSTAENDE = new Set([OUTCOME.OK, OUTCOME.PARTIAL, OUTCOME.NO_OFFERS]);

// Ein Platzhalter ist Beschriftung, kein Wert: „z. B." macht das sichtbar.
const beispiel = (wert) => (wert ? `z. B. ${wert}` : undefined);

// Der Geschäftstag des Servers; ohne Zeitzonendaten im Browser der lokale Kalendertag.
const heutigerVersandtag = () => businessTodayISO(new Date()) || localIsoDate(new Date());

// Sanftes Scrollen nur ohne den Wunsch nach reduzierter Bewegung.
function scrollVerhalten() {
  return typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "auto" : "smooth";
}

/** Den Ergebnisbereich in den Blick holen und seine Überschrift fokussieren (Tastatur, Screenreader). */
export function zeigeErgebnis({ fokus = true } = {}) {
  const bereich = document.getElementById("pc-results-section");
  if (bereich) bereich.scrollIntoView({ block: "start", behavior: scrollVerhalten() });
  const h = document.getElementById("pc-results-title");
  if (fokus && h) h.focus({ preventScroll: true });
}

/** Zurück zum Formular — etwa, um die Angaben nach einer Berechnung anzupassen. */
export function zeigeFormular() {
  const karte = document.getElementById("pc-calculator-card");
  if (karte) karte.scrollIntoView({ block: "start", behavior: scrollVerhalten() });
  const titel = document.getElementById("pc-calculator-title");
  if (titel) titel.focus({ preventScroll: true });
}

export function PublicCalculatorApp({ availability, launchScope, resultsHost }) {
  const [form, setForm] = useState(emptyPublicForm);
  const [scope, setScope] = useState(null);
  const [verfuegbar, setVerfuegbar] = useState(availability ? availability.wert : null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [ergebnis, setErgebnis] = useState(null);
  const [anfrage, setAnfrage] = useState(null);
  const [langsam, setLangsam] = useState(false);
  const [sekunden, setSekunden] = useState(0);
  const abbruch = useRef(null);
  const letzterSchluessel = useRef(null);

  // Verfügbarkeit aus den Aufwärmmeldungen (main.jsx).
  useEffect(() => {
    if (!availability) return undefined;
    const hoerer = (v) => setVerfuegbar(v);
    availability.hoerer.add(hoerer);
    if (availability.wert !== null) setVerfuegbar(availability.wert);
    return () => { availability.hoerer.delete(hoerer); };
  }, [availability]);

  // Länderscope des Servers — bis dahin (oder ohne Antwort) die volle Liste, wie im Portal.
  useEffect(() => {
    let aktiv = true;
    Promise.resolve(launchScope).then((s) => { if (aktiv && s) setScope(s); }, () => {});
    return () => { aktiv = false; };
  }, [launchScope]);

  useEffect(() => () => { if (abbruch.current) abbruch.current.abort(); }, []);

  // Ehrliche Wartezeit: vergangene Sekunden und ab 10 s der Hinweis — keine versprochene Dauer.
  useEffect(() => {
    if (phase !== "loading") return undefined;
    setLangsam(false);
    setSekunden(0);
    const start = Date.now();
    const hinweis = setTimeout(() => setLangsam(true), SLOW_HINT_AFTER_MS);
    const takt = setInterval(() => setSekunden(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => { clearTimeout(hinweis); clearInterval(takt); };
  }, [phase]);

  // Beginn der Berechnung: der Ergebnisbereich kommt in den Blick (ohne Fokus — das Formular bleibt
  // für Screenreader, wo es ist). Ende: Fokus auf die Ergebnisüberschrift.
  useEffect(() => {
    if (phase === "loading") zeigeErgebnis({ fokus: false });
    if (phase === "done") zeigeErgebnis({ fokus: true });
  }, [phase, ergebnis]);

  useEffect(() => {
    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
      performance.mark("pc-form-interactive");
    }
  }, []);

  const herkunftsliste = useMemo(() => scopedOriginCountries(countries, scope), [scope]);
  const zielliste = useMemo(() => scopedCountries(countries, scope), [scope]);

  const loescheFehler = useCallback((feld) => {
    setFieldErrors((e) => {
      if (!e[feld]) return e;
      const rest = { ...e };
      delete rest[feld];
      return rest;
    });
  }, []);

  const setze = useCallback((feld, wert) => {
    setForm((f) => ({ ...f, [feld]: wert }));
    loescheFehler(feld);
  }, [loescheFehler]);

  const fokussiere = (feld) => {
    const el = document.getElementById(FELD_ID[feld]);
    if (el) el.focus();
  };

  // Ein Request: Abbruch beim Verlassen, Zustand erst nach der Antwort, eine Antwort je Absenden.
  async function berechne(body, schluessel) {
    const ac = new AbortController();
    abbruch.current = ac;
    setAnfrage(body);
    setPhase("loading");
    let ausgang = null;
    try {
      const antwort = await requestPublicPriceQuote(body, { signal: ac.signal });
      let daten = null;
      try { daten = await antwort.json(); } catch { daten = null; }
      ausgang = quoteOutcomeFromResponse(antwort.status, daten);
    } catch (fehlerObjekt) {
      ausgang = quoteOutcomeFromError(fehlerObjekt);
    }
    if (abbruch.current !== ac) return;
    abbruch.current = null;
    if (!ausgang) { setPhase("idle"); return; }
    if (ausgang.outcome === OUTCOME.INVALID && ausgang.field && ausgang.fieldMessage && FELD_ID[ausgang.field]) {
      setFieldErrors({ [ausgang.field]: ausgang.fieldMessage });
    }
    letzterSchluessel.current = ERGEBNISZUSTAENDE.has(ausgang.outcome) ? schluessel : null;
    setErgebnis({ ...ausgang, request: body });
    setPhase("done");
  }

  async function absenden(event) {
    event.preventDefault();
    if (phase === "loading") return;
    const pruefung = publicFormErrors(form);
    if (Object.keys(pruefung.fieldErrors).length > 0) {
      setFieldErrors(pruefung.fieldErrors);
      setBanner(pruefung.banner || { title: "Angaben prüfen", message: "Bitte prüfen Sie die markierten Angaben." });
      fokussiere(pruefung.firstField || "from_zip");
      return;
    }
    setFieldErrors({});
    setBanner(null);

    const body = buildPublicQuoteRequest(form, { shippingDate: heutigerVersandtag() });
    const schluessel = requestKey(body);
    if (schluessel === letzterSchluessel.current && ergebnis && ERGEBNISZUSTAENDE.has(ergebnis.outcome)) {
      // Unveränderte Eingabe: kein neuer Request — die bestehenden Angebote bleiben.
      zeigeErgebnis({ fokus: true });
      return;
    }
    await berechne(body, schluessel);
  }

  const wiederholen = () => {
    if (phase === "loading" || !ergebnis || !ergebnis.request) return;
    // Eine Wiederholung rechnet ab dem dann heutigen Geschäftstag.
    const body = { ...ergebnis.request, shippingDate: heutigerVersandtag() };
    berechne(body, requestKey(body));
  };

  const ausgeschaltet = verfuegbar === false;
  const laedt = phase === "loading";

  const ortFelder = (seite) => {
    const land = `${seite}_country`, plz = `${seite}_zip`, stadt = `${seite}_city`;
    const liste = seite === "from" ? herkunftsliste : zielliste;
    return (
      <div className="pc-row-fields pc-row-fields--place">
        <Field as="select" id={FELD_ID[land]} fieldKey={land} label="Land" value={form[land]} className="pc-field-country"
          error={fieldErrors[land]} onChange={(v) => setze(land, v)}>
          {liste.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
        </Field>
        <Field id={FELD_ID[plz]} fieldKey={plz} label="PLZ" required value={form[plz]} error={fieldErrors[plz]}
          onChange={(v) => setze(plz, v)} autoComplete={seite === "from" ? "postal-code" : "off"}
          maxLength={postalCodeMaxLength()} placeholder={beispiel(postalCodeExample(form[land]))} />
        <Field id={FELD_ID[stadt]} fieldKey={stadt} label="Stadt" required value={form[stadt]} error={fieldErrors[stadt]}
          onChange={(v) => setze(stadt, v)} autoComplete={seite === "from" ? "address-level2" : "off"} maxLength={100}
          placeholder={seite === "from" ? "z. B. Stuttgart" : "z. B. Berlin"} />
      </div>
    );
  };

  return (
    <>
      <form className="pc-form" noValidate onSubmit={absenden} aria-describedby="pc-form-note">
        {banner && (
          <div className="pc-notice pc-notice--error" role="alert" id="pc-form-banner">
            <p className="pc-notice-title">{banner.title}</p>
            {banner.message && <p className="pc-notice-text">{banner.message}</p>}
          </div>
        )}

        <div className="pc-route">
          <div className="pc-row" role="group" aria-labelledby="pc-row-from">
            <span className="pc-row-label" id="pc-row-from">Absender</span>
            {ortFelder("from")}
          </div>
          <span className="pc-route-arrow" aria-hidden="true" />
          <div className="pc-row" role="group" aria-labelledby="pc-row-to">
            <span className="pc-row-label" id="pc-row-to">Empfänger</span>
            {ortFelder("to")}
          </div>
        </div>

        <div className="pc-row" role="group" aria-labelledby="pc-row-package" aria-describedby="pc-package-hint">
          <span className="pc-row-label" id="pc-row-package">Paket</span>
          <div className="pc-row-fields pc-row-fields--package">
            <Field id={FELD_ID.packageCount} fieldKey="packageCount" label="Anzahl" required value={form.packageCount}
              error={fieldErrors.packageCount} onChange={(v) => setze("packageCount", v)}
              inputMode="numeric" autoComplete="off" maxLength={2} aria-describedby="pc-package-hint" />
            <Field id={FELD_ID.weight} fieldKey="weight" label="Gewicht" unit="kg" unitLabel="je Paket in Kilogramm" required
              value={form.weight} error={fieldErrors.weight} onChange={(v) => setze("weight", v)}
              inputMode="decimal" autoComplete="off" maxLength={8} />
            <Field id={FELD_ID.length} fieldKey="length" label="Länge" unit="cm" unitLabel="in Zentimetern" required
              value={form.length} error={fieldErrors.length} onChange={(v) => setze("length", v)}
              inputMode="decimal" autoComplete="off" maxLength={6} />
            <Field id={FELD_ID.width} fieldKey="width" label="Breite" unit="cm" unitLabel="in Zentimetern" required
              value={form.width} error={fieldErrors.width} onChange={(v) => setze("width", v)}
              inputMode="decimal" autoComplete="off" maxLength={6} />
            <Field id={FELD_ID.height} fieldKey="height" label="Höhe" unit="cm" unitLabel="in Zentimetern" required
              value={form.height} error={fieldErrors.height} onChange={(v) => setze("height", v)}
              inputMode="decimal" autoComplete="off" maxLength={6} />
          </div>
          <p className="pc-row-hint" id="pc-package-hint">Gewicht und Maße je Paket — bei mehreren Paketen gleich.</p>
        </div>

        <div className="pc-submit-row">
          {ausgeschaltet ? (
            <div className="pc-unavailable" role="status" id="pc-unavailable">
              <p className="pc-unavailable-title">Der Preisrechner ist in Kürze verfügbar.</p>
              <p className="pc-unavailable-text">
                Mit Ihrem Konto berechnen Sie Preise im Kundenbereich.{" "}
                <a href={LOGIN_URL}>Zur Anmeldung</a>
              </p>
            </div>
          ) : (
            <button type="submit" className="pc-button pc-button--primary pc-button--submit" id="pc-submit" disabled={laedt}
              aria-describedby="pc-submit-status">
              {laedt ? "Preise werden berechnet …" : "Versandpreise berechnen"}
            </button>
          )}
          <p className="pc-sr-only" id="pc-submit-status" aria-live="polite">{laedt ? "Preise werden berechnet." : ""}</p>
        </div>
        <p className="pc-form-note" id="pc-form-note">
          Unverbindlich und ohne Anmeldung. Wir verwenden nur Länder, Postleitzahlen, Städte und Paketdaten —{" "}
          <a href="https://confidaraexpress.de/datenschutz">Datenschutz</a>.
        </p>
      </form>

      <PublicResults
        host={resultsHost}
        phase={phase}
        ergebnis={ergebnis}
        anfrage={anfrage}
        langsam={langsam}
        sekunden={sekunden}
        onRetry={wiederholen}
        onEdit={zeigeFormular}
      />
    </>
  );
}
