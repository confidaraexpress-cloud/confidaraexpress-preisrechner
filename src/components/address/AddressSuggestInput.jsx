import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { AddressAttribution } from "./AddressAttribution";
import { highlightSegments, ADDRESS_SUGGEST_AUTOCOMPLETE } from "../../utils/addressValidationView.mjs";

// AddressSuggestInput — EIN Vorschlagsfeld für alle Adressformulare (Straße und Ort).
//
// Es gibt bewusst nur diese eine Komponente statt je einer pro Formular. Sie ist ein
// normales Eingabefeld mit einer Vorschlagsliste — kein Ersatz für das Feld, keine
// erzwungene Auswahl: der Kunde kann jederzeit frei tippen und die Liste ignorieren.
// Das ist entscheidend, weil die Datenlage lückenhaft sein kann (Neubaugebiete,
// Umbenennungen) und ein Auswahlzwang reale Adressen unversendbar machen würde.
//
// Aufbau nach dem Combobox-Muster: das INPUT trägt role="combobox" samt aria-expanded/
// aria-controls/aria-activedescendant, die Liste role="listbox", jeder Eintrag
// role="option". Keine zusätzliche UI-Bibliothek.
//
// Die Liste steht `position: absolute` im eigenen, relativ positionierten Wrapper — anders
// als der schwebende Adressbuch-Picker, der wegen `overflow: hidden` auf `.calc-panel`
// gemessen platziert werden muss. Hier ist das nicht nötig: das Feld sitzt im normalen
// Formularfluss, und die Liste ist kurz (max. 8 Einträge).
// `floating` ist eine reine Darstellungsoption und ausdrücklich OPT-IN. Seit dem
// Redesign (2026-10) setzt sie keine Seite mehr: auch „Neue Sendung" nutzt die
// gestapelte Beschriftung über dem Feld. Combobox-Verhalten, Tastaturbedienung,
// Vorschlagsquelle und Auswahl sind in beiden Fassungen identisch.
//
// Die Verknüpfung von Pflichtangabe, Fehler und Hinweis (aria-required,
// aria-describedby samt ids) gilt seitdem in BEIDEN Fassungen — vorher hing sie
// allein am Floating-Modus, sodass die gestapelte Fassung (Adressbuch,
// Auftragsdialog) ihren Hinweis und Fehler nicht programmatisch verband. Das ist
// eine reine Barrierefreiheitsergänzung: Markup, Werte und Verhalten bleiben.
//
// Seit Geoapify (2026-10-14) sind Straßenvorschläge strukturierte Anschriften
// ({ street, houseNumber, postalCode, city, label }); angezeigt wird `label` (Straße und
// Hausnummer in Landesreihenfolge) plus PLZ und Ort. Unter jeder Liste steht die Pflicht-
// Quellenangabe (AddressAttribution). Ohne `label` (z. B. im Registrierungs- oder Profilformular,
// das seine Beschriftung selbst setzt) ist das Feld über `id` mit dem fremden <label> verbunden;
// `inputClassName`/`wrapClassName` übernehmen dort die Feldgestaltung der jeweiligen Fläche.
//
// Premium-Durchgang (2026-10-15): Liste und Quellenangabe bilden EINE schwebende Fläche (vorher
// zwei getrennte Kästen). Die getippten Wortanfänge sind im Vorschlag hervorgehoben, PLZ und Ort
// stehen gedämpft daneben (schmal: darunter). `loading` und `noResults` (aus dem Hook) zeigen
// in derselben Fläche eine Lade- bzw. Leerzeile — nur, solange das Feld den Fokus hat.

// Die Ladezeile erscheint erst, wenn die Suche spürbar dauert — eine schnelle Antwort zeigt
// direkt die Liste, ohne kurz aufblitzenden Zwischenzustand.
export const SUGGEST_LOADING_DELAY_MS = 250;
const LEER_TEXT = "Keine Vorschläge gefunden – Sie können die Adresse frei eingeben.";

// Der Bereich, der tatsächlich scrollt: in der App-Shell ist das ein innerer Container, nicht
// das Fenster. Ohne ihn liefe ein window.scrollBy ins Leere.
function scrollBehaelter(el) {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return window;
}

// Auf Touchgeräten deckt die Bildschirmtastatur den unteren Teil der Seite ab. Öffnet die Liste,
// scrollt die Seite höchstens so weit, dass die Liste über der Tastatur steht — aber nie so weit,
// dass das Eingabefeld selbst unter die feste Kopfleiste (.mobile-topbar) rutscht.
function listeInsBildHolen(input, pop) {
  if (!input || !pop || typeof window === "undefined") return;
  const vv = window.visualViewport;
  const sichtOben = vv ? vv.offsetTop : 0;
  const sichtUnten = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const topbar = document.querySelector(".mobile-topbar");
  const kopf = topbar && getComputedStyle(topbar).display !== "none" ? topbar.getBoundingClientRect().height : 0;
  const ueberstand = pop.getBoundingClientRect().bottom - sichtUnten + 8;
  const spielraum = input.getBoundingClientRect().top - sichtOben - kopf - 8;
  const weg = Math.min(ueberstand, spielraum);
  // „instant“: globals.css setzt `scroll-behavior: smooth` — eine Animation liefe hier gegen
  // die sich öffnende Tastatur und käme zu spät.
  if (weg > 1) scrollBehaelter(input).scrollBy({ top: weg, behavior: "instant" });
}

function istTouch() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(pointer: coarse)").matches;
}

export function AddressSuggestInput({
  id, label, value, onChange, onSelect, suggestions = [], placeholder, maxLength,
  error, hint, required, disabled, inputMode, className = "",
  emptyHint, floating = false, inputClassName, wrapClassName = "", invalid = false, onBlur, dataField, describedBy,
  loading = false, noResults = false,
}) {
  const reactId = useId();
  const inputId = id || `addr-${reactId}`;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [fokussiert, setFokussiert] = useState(false);
  const [ladenSichtbar, setLadenSichtbar] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const popRef = useRef(null);

  const items = suggestions.slice(0, 8);
  const hasItems = items.length > 0;

  useEffect(() => {
    if (!loading) { setLadenSichtbar(false); return undefined; }
    const t = setTimeout(() => setLadenSichtbar(true), SUGGEST_LOADING_DELAY_MS);
    return () => clearTimeout(t);
  }, [loading]);

  // Ein Klick außerhalb schließt die Liste. Bewusst `mousedown`: bei `click` wäre das Feld
  // bereits neu gerendert, bevor die Auswahl greift.
  useEffect(() => {
    if (!open) return undefined;
    const onDocDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocDown);
    return () => document.removeEventListener("mousedown", onDocDown);
  }, [open]);

  // Neue Vorschläge setzen die Hervorhebung zurück — sonst zeigte sie auf einen Eintrag,
  // den es nicht mehr gibt. Treffen sie ein, während das Feld den Fokus hat (z. B. nach
  // „Land auswählen“ → Tab ins Straßenfeld, während die Suche noch läuft), öffnet sich die
  // Liste — aber nur, wenn sie etwas anderes zeigt als den bereits eingetragenen Wert.
  useEffect(() => {
    setActive(-1);
    const eigenerWert = String(value ?? "").trim().toLowerCase();
    const etwasNeues = suggestions.some((s) => {
      const t = typeof s === "string" ? s : (s && (s.label || s.street));
      return String(t ?? "").trim().toLowerCase() !== eigenerWert;
    });
    if (fokussiert && etwasNeues) setOpen(true);
  }, [suggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (item) => {
    setOpen(false);
    setActive(-1);
    onSelect?.(item);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      if (open) { e.preventDefault(); e.stopPropagation(); setOpen(false); setActive(-1); }
      return;
    }
    if (!hasItems) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(0); return; }
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(items.length - 1); return; }
      setActive((i) => (i <= 0 ? items.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      // Enter wählt NUR, wenn ein Eintrag hervorgehoben ist. Sonst bleibt Enter das, was es
      // im Formular immer war — ein Absenden darf nicht versehentlich abgefangen werden.
      if (open && active >= 0 && active < items.length) {
        e.preventDefault();
        choose(items[active]);
      }
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const showList = open && hasItems && !disabled;
  // Lade- und Leerzeile nur für den, der gerade tippt — nie als stehengebliebene Fläche.
  const zeigeLaden = open && fokussiert && !hasItems && ladenSichtbar && !disabled;
  const zeigeLeer = open && fokussiert && !hasItems && !loading && noResults && !disabled;
  const showPop = showList || zeigeLaden || zeigeLeer;
  const activeId = showList && active >= 0 ? `${inputId}-opt-${active}` : undefined;

  // Mobile Sichtbarkeit: beim Öffnen und wenn die Tastatur den Sichtbereich verkleinert.
  useLayoutEffect(() => {
    if (!showPop || !fokussiert || !istTouch()) return undefined;
    const ausrichten = () => listeInsBildHolen(inputRef.current, popRef.current);
    ausrichten();
    const vv = window.visualViewport;
    vv?.addEventListener("resize", ausrichten);
    return () => vv?.removeEventListener("resize", ausrichten);
  }, [showPop, fokussiert, items.length]);

  // Schwebezustand aus dem React-Wert plus Fokus — dieselbe Ableitung wie in
  // <Field />, damit beide Bauteile auf „Neue Sendung" im Gleichtakt laufen.
  const angehoben = floating && (String(value ?? "").length > 0 || fokussiert);
  const fehlerId = `${inputId}-err`;
  const hinweisId = `${inputId}-hint`;
  const hinweisText = hint || emptyHint;
  // `describedBy` verbindet eine Fehlermeldung, die das Formular selbst rendert (z. B. Preisrechner).
  const beschreibung = describedBy || (error ? fehlerId : (hinweisText ? hinweisId : undefined));

  const rahmenKlasse = floating
    ? ["addr-suggest", "field", "ce-field", "ce-field--floating",
       angehoben ? "is-floating" : "", error ? "is-error" : "", disabled ? "is-disabled" : "",
       className].filter(Boolean).join(" ")
    : `addr-suggest ${className}`.trim();

  const beschriftung = label && (
    <label className={floating ? "field-label ce-field-label" : "field-label"} htmlFor={inputId}>
      {label}{required && <span aria-hidden="true"> *</span>}
    </label>
  );

  const ansage = showList
    ? `${items.length} ${items.length === 1 ? "Vorschlag" : "Vorschläge"} verfügbar`
    : (zeigeLeer ? "Keine Vorschläge gefunden" : "");

  return (
    <div className={rahmenKlasse} ref={wrapRef}>
      {!floating && beschriftung}
      {/* Im Floating-Modus steht die Beschriftung IM Feldrahmen — also innerhalb
          von .addr-suggest-wrap, das ohnehin `position: relative` trägt und der
          Bezugspunkt der Vorschlagsliste ist. Dadurch bleibt die Liste
          unverändert 4 px unter der Feldunterkante, auch bei 54 px Feldhöhe. */}
      <div className={`addr-suggest-wrap${wrapClassName ? ` ${wrapClassName}` : ""}`}>
        <input
          ref={inputRef}
          id={inputId}
          className={inputClassName || `field-input${floating ? " ce-field-input" : ""}${error ? " field-input-error" : ""}`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-busy={loading ? "true" : undefined}
          aria-invalid={error || invalid ? "true" : undefined}
          aria-required={required ? "true" : undefined}
          aria-describedby={beschreibung}
          data-field={dataField}
          // Ein nicht standardisierter Token für ALLE Vorschlagsfelder (Auftrag 1, P5): Chrome und
          // Edge füllen ein Feld mit unbekanntem Token nicht und zeigen dort kein eigenes Popup —
          // so gibt es für Straße und Ort nur EINE Liste, unsere. Der Aufrufer kann das nicht
          // überschreiben. Kontaktfelder (Name, E-Mail, Telefon, Firma, PLZ) behalten ihre Tokens.
          autoComplete={ADDRESS_SUGGEST_AUTOCOMPLETE}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => { setFokussiert(true); if (hasItems || noResults) setOpen(true); }}
          onBlur={(e) => {
            setFokussiert(false);
            // Wechselt der Fokus in ein anderes Feld (Tab, Tippen, Antippen), schließt die Liste —
            // sonst läge sie offen über den nächsten Feldern. Ohne neues Ziel (Klick auf die
            // Bildlaufleiste der Liste) bleibt sie offen; den Klick daneben regelt `mousedown`.
            if (e.relatedTarget && wrapRef.current && !wrapRef.current.contains(e.relatedTarget)) setOpen(false);
            onBlur?.(e);
          }}
          onKeyDown={onKeyDown}
        />
        {floating && beschriftung}
        {showPop && (
          <div className="addr-suggest-pop" ref={popRef}>
            {showList && (
              <ul className="addr-suggest-list" id={listId} role="listbox" aria-label={label || "Vorschläge"}>
                {items.map((item, i) => {
                  const text = typeof item === "string" ? item : (item.label || item.street);
                  const meta = typeof item === "string" ? "" : [item.postalCode, item.city].filter(Boolean).join(" ");
                  return (
                    <li
                      key={`${text}-${i}`}
                      id={`${inputId}-opt-${i}`}
                      role="option"
                      aria-selected={i === active}
                      className={`addr-suggest-opt${i === active ? " addr-suggest-opt--active" : ""}`}
                      // mousedown statt click: der Blur des Feldes darf die Auswahl nicht überholen.
                      onMouseDown={(e) => { e.preventDefault(); choose(item); }}
                      onMouseEnter={() => setActive(i)}
                    >
                      <span className="addr-suggest-opt-text">
                        {highlightSegments(text, value).map((teil, k) => (teil.match
                          ? <span key={k} className="addr-suggest-hit">{teil.text}</span>
                          : <React.Fragment key={k}>{teil.text}</React.Fragment>))}
                      </span>
                      {meta && <span className="addr-suggest-opt-meta">{meta}</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {zeigeLaden && (
              <p className="addr-suggest-state">
                <span className="spinner spinner-dark" aria-hidden="true" />
                <span>Suche läuft …</span>
              </p>
            )}
            {zeigeLeer && <p className="addr-suggest-state">{LEER_TEXT}</p>}
            {showList && <AddressAttribution />}
          </div>
        )}
        {/* Trefferzahl für Screenreader: die Liste selbst kündigt sich beim Öffnen nicht an. */}
        <span className="sr-only" role="status" aria-live="polite">{ansage}</span>
      </div>
      {error
        ? <span className="field-error" id={fehlerId}>{error}</span>
        : hint
          ? <span className="field-hint" id={hinweisId}>{hint}</span>
          : (emptyHint ? <span className="field-hint" id={hinweisId}>{emptyHint}</span> : null)}
    </div>
  );
}
