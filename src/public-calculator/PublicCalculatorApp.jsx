import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Field } from "../components/ui/Field";
import { countries } from "../utils/countries.js";
import { scopedCountries, scopedOriginCountries } from "../utils/launchScopeView.mjs";
import { postalCodeExample, postalCodeMaxLength } from "../utils/postalCode.mjs";
import { requestPublicPriceQuote } from "../api/publicCalculatorApi.js";
import {
  LOGIN_URL, OUTCOME, SERVICE_FILTER_OPTIONS, SHIPPING_MODE_OPTIONS, SLOW_HINT_AFTER_MS,
  buildPublicQuoteRequest, emptyPublicForm, localIsoDate, publicFormErrors, quoteOutcomeFromError,
  quoteOutcomeFromResponse, requestKey, shippingDateAllowed,
} from "../utils/publicCalculatorView.mjs";
import { PublicResults } from "./PublicResults.jsx";

// ── Öffentlicher Preisrechner: Formular und Ablauf ───────────────────────────
// Felder, Prüfungen und Datumsvorgabe wie im Versandkostenrechner der Kunden;
// Abholung/Abgabe und Versandart sind Teil der Anfrage. Ein Request je Absenden:
// der Knopf ist gesperrt, solange gerechnet wird, und eine unveränderte Eingabe
// löst keinen neuen Request aus. Die Ergebnisse stehen im eigenen Abschnitt der
// Seite (Portal in #pc-results).

const FELD_ID = Object.freeze({
  from_country: "pc-from-country", from_zip: "pc-from-zip", from_city: "pc-from-city",
  to_country: "pc-to-country", to_zip: "pc-to-zip", to_city: "pc-to-city",
  packageCount: "pc-package-count", weight: "pc-weight", length: "pc-length", width: "pc-width", height: "pc-height",
  shippingDate: "pc-shipping-date",
});

const ERGEBNISZUSTAENDE = new Set([OUTCOME.OK, OUTCOME.PARTIAL, OUTCOME.NO_OFFERS]);

// Ein Platzhalter ist Beschriftung, kein Wert: „z. B." macht das sichtbar.
const beispiel = (wert) => (wert ? `z. B. ${wert}` : undefined);

function fokussiereErgebnis() {
  const h = document.getElementById("pc-results-title");
  if (h) h.focus();
}

export function PublicCalculatorApp({ availability, launchScope, resultsHost }) {
  const [form, setForm] = useState(emptyPublicForm);
  const [serviceFilter, setServiceFilter] = useState("all");
  const [shippingModeFilter, setShippingModeFilter] = useState("all");
  const heute = useMemo(() => localIsoDate(new Date()), []);
  const [shippingDate, setShippingDate] = useState(heute);
  const [scope, setScope] = useState(null);
  const [verfuegbar, setVerfuegbar] = useState(availability ? availability.wert : null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [ergebnis, setErgebnis] = useState(null);
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

  // Nach jeder Berechnung: Fokus auf die Ergebnisüberschrift (statisch in der Seite).
  useEffect(() => {
    if (phase === "done") fokussiereErgebnis();
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
    if (ausgang.outcome === OUTCOME.INVALID && ausgang.field && ausgang.fieldMessage) {
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
    const fehler = { ...pruefung.fieldErrors };
    if (!shippingDateAllowed(shippingDate, new Date())) {
      fehler.shippingDate = "Bitte wählen Sie heute oder einen späteren Tag.";
    }
    if (Object.keys(fehler).length > 0) {
      setFieldErrors(fehler);
      setBanner(pruefung.banner || { title: "Angaben prüfen", message: "Bitte prüfen Sie die markierten Angaben." });
      fokussiere(pruefung.firstField || "shippingDate");
      return;
    }
    setFieldErrors({});
    setBanner(null);

    const body = buildPublicQuoteRequest(form, { serviceFilter, shippingModeFilter, shippingDate });
    const schluessel = requestKey(body);
    if (schluessel === letzterSchluessel.current && ergebnis && ERGEBNISZUSTAENDE.has(ergebnis.outcome)) {
      // Unveränderte Eingabe: kein neuer Request — die bestehenden Angebote bleiben.
      fokussiereErgebnis();
      return;
    }
    await berechne(body, schluessel);
  }

  const wiederholen = () => {
    if (phase === "loading" || !ergebnis || !ergebnis.request) return;
    berechne(ergebnis.request, requestKey(ergebnis.request));
  };

  const ausgeschaltet = verfuegbar === false;
  const laedt = phase === "loading";

  return (
    <>
      <form className="pc-form" noValidate onSubmit={absenden} aria-describedby="pc-form-note">
        {banner && (
          <div className="pc-notice pc-notice--error" role="alert" id="pc-form-banner">
            <p className="pc-notice-title">{banner.title}</p>
            {banner.message && <p className="pc-notice-text">{banner.message}</p>}
          </div>
        )}

        <fieldset className="pc-fieldset">
          <legend className="pc-legend">Von</legend>
          <div className="pc-grid pc-grid--route">
            <Field as="select" id={FELD_ID.from_country} fieldKey="from_country" label="Land" value={form.from_country}
              error={fieldErrors.from_country} onChange={(v) => setze("from_country", v)}>
              {herkunftsliste.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Field>
            <Field id={FELD_ID.from_zip} fieldKey="from_zip" label="PLZ" required value={form.from_zip}
              error={fieldErrors.from_zip} onChange={(v) => setze("from_zip", v)} autoComplete="postal-code"
              maxLength={postalCodeMaxLength()} placeholder={beispiel(postalCodeExample(form.from_country))} />
            <Field id={FELD_ID.from_city} fieldKey="from_city" label="Ort" required value={form.from_city}
              error={fieldErrors.from_city} onChange={(v) => setze("from_city", v)} autoComplete="address-level2"
              maxLength={100} placeholder="z. B. Stuttgart" />
          </div>
        </fieldset>

        <fieldset className="pc-fieldset">
          <legend className="pc-legend">Nach</legend>
          <div className="pc-grid pc-grid--route">
            <Field as="select" id={FELD_ID.to_country} fieldKey="to_country" label="Land" value={form.to_country}
              error={fieldErrors.to_country} onChange={(v) => setze("to_country", v)}>
              {zielliste.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Field>
            <Field id={FELD_ID.to_zip} fieldKey="to_zip" label="PLZ" required value={form.to_zip}
              error={fieldErrors.to_zip} onChange={(v) => setze("to_zip", v)} autoComplete="off"
              maxLength={postalCodeMaxLength()} placeholder={beispiel(postalCodeExample(form.to_country))} />
            <Field id={FELD_ID.to_city} fieldKey="to_city" label="Ort" required value={form.to_city}
              error={fieldErrors.to_city} onChange={(v) => setze("to_city", v)} autoComplete="off" maxLength={100}
              placeholder="z. B. Berlin" />
          </div>
        </fieldset>

        <fieldset className="pc-fieldset">
          <legend className="pc-legend">Paket</legend>
          <p className="pc-legend-hint" id="pc-package-hint">Gewicht und Maße je Paket — mehrere Pakete sind identisch.</p>
          <div className="pc-grid pc-grid--package">
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
        </fieldset>

        <fieldset className="pc-fieldset">
          <legend className="pc-legend">Versand</legend>
          <div className="pc-grid pc-grid--options">
            <Field id={FELD_ID.shippingDate} fieldKey="shippingDate" label="Versanddatum" type="date" min={heute}
              value={shippingDate} error={fieldErrors.shippingDate}
              onChange={(v) => { setShippingDate(v); loescheFehler("shippingDate"); }} />
            <Field as="select" id="pc-service-filter" label="Abholung / Abgabe" value={serviceFilter}
              onChange={(v) => setServiceFilter(v)}>
              {SERVICE_FILTER_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Field>
            <Field as="select" id="pc-shipping-mode" label="Versandart" value={shippingModeFilter}
              onChange={(v) => setShippingModeFilter(v)}>
              {SHIPPING_MODE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
            </Field>
          </div>
        </fieldset>

        <div className="pc-submit-row">
          {ausgeschaltet ? (
            <div className="pc-notice pc-notice--info" role="status" id="pc-unavailable">
              <p className="pc-notice-title">Der Preisrechner ist in Kürze verfügbar.</p>
              <p className="pc-notice-text">
                Kundinnen und Kunden mit freigeschaltetem Konto berechnen Preise im Kundenbereich.{" "}
                <a href={LOGIN_URL}>Zur Anmeldung</a>
              </p>
            </div>
          ) : (
            <button type="submit" className="pc-button pc-button--primary" id="pc-submit" disabled={laedt}
              aria-describedby="pc-submit-status">
              {laedt ? "Preise werden berechnet …" : "Versandpreise berechnen"}
            </button>
          )}
          <p className="pc-sr-only" id="pc-submit-status" aria-live="polite">{laedt ? "Preise werden berechnet." : ""}</p>
        </div>
        <p className="pc-form-note" id="pc-form-note">
          Für die Berechnung verwenden wir nur Länder, Postleitzahlen, Orte und Paketdaten.
          Angebote ausschließlich für Unternehmen. Hinweise zum{" "}
          <a href="https://confidaraexpress.de/datenschutz">Datenschutz</a>.
        </p>
      </form>

      <PublicResults
        host={resultsHost}
        phase={phase}
        ergebnis={ergebnis}
        langsam={langsam}
        sekunden={sekunden}
        onRetry={wiederholen}
      />
    </>
  );
}
