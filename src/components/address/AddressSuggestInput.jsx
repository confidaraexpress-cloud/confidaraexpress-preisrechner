import React, { useEffect, useId, useRef, useState } from "react";

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
// `floating` ist eine reine Darstellungsoption und ausdrücklich OPT-IN: ohne sie
// rendert die Komponente exakt dasselbe Markup wie zuvor. Sie wird in dieser
// Ausbaustufe nur von „Neue Sendung" gesetzt — Adressbuch und Auftragsdialog
// nutzen dieselbe Komponente unverändert weiter. Combobox-Verhalten, ARIA,
// Tastaturbedienung, Vorschlagsquelle und Auswahl sind in beiden Fassungen
// identisch; verschoben wird ausschließlich die Beschriftung.
export function AddressSuggestInput({
  id, label, value, onChange, onSelect, suggestions = [], placeholder, maxLength,
  error, hint, required, disabled, autoComplete, inputMode, className = "",
  emptyHint, floating = false,
}) {
  const reactId = useId();
  const inputId = id || `addr-${reactId}`;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [fokussiert, setFokussiert] = useState(false);
  const wrapRef = useRef(null);

  const items = suggestions.slice(0, 8);
  const hasItems = items.length > 0;

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
  // den es nicht mehr gibt.
  useEffect(() => { setActive(-1); }, [suggestions]);

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
  const activeId = showList && active >= 0 ? `${inputId}-opt-${active}` : undefined;

  // Schwebezustand aus dem React-Wert plus Fokus — dieselbe Ableitung wie in
  // <Field />, damit beide Bauteile auf „Neue Sendung" im Gleichtakt laufen.
  const angehoben = floating && (String(value ?? "").length > 0 || fokussiert);
  const fehlerId = `${inputId}-err`;
  const hinweisId = `${inputId}-hint`;
  const hinweisText = hint || emptyHint;
  const beschreibung = error ? fehlerId : (hinweisText ? hinweisId : undefined);

  const rahmenKlasse = floating
    ? ["addr-suggest", "field", "ce-field", "ce-field--floating",
       angehoben ? "is-floating" : "", error ? "is-error" : "", disabled ? "is-disabled" : "",
       className].filter(Boolean).join(" ")
    : `addr-suggest ${className}`.trim();

  const beschriftung = label && (
    <label className={floating ? "field-label ce-field-label" : "field-label"} htmlFor={inputId}>
      {label}{required ? " *" : ""}
    </label>
  );

  return (
    <div className={rahmenKlasse} ref={wrapRef}>
      {!floating && beschriftung}
      {/* Im Floating-Modus steht die Beschriftung IM Feldrahmen — also innerhalb
          von .addr-suggest-wrap, das ohnehin `position: relative` trägt und der
          Bezugspunkt der Vorschlagsliste ist. Dadurch bleibt die Liste
          unverändert 4 px unter der Feldunterkante, auch bei 54 px Feldhöhe. */}
      <div className="addr-suggest-wrap">
        <input
          id={inputId}
          className={`field-input${floating ? " ce-field-input" : ""}${error ? " field-input-error" : ""}`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={error ? "true" : undefined}
          aria-required={floating && required ? "true" : undefined}
          aria-describedby={floating ? beschreibung : undefined}
          autoComplete={autoComplete || "off"}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => { setFokussiert(true); if (hasItems) setOpen(true); }}
          onBlur={() => setFokussiert(false)}
          onKeyDown={onKeyDown}
        />
        {floating && beschriftung}
        {showList && (
          <ul className="addr-suggest-list" id={listId} role="listbox" aria-label={label || "Vorschläge"}>
            {items.map((item, i) => {
              const text = typeof item === "string" ? item : item.street;
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
                  <span className="addr-suggest-opt-text">{text}</span>
                  {meta && <span className="addr-suggest-opt-meta">{meta}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {error
        ? <span className="field-error" id={floating ? fehlerId : undefined}>{error}</span>
        : hint
          ? <span className="field-hint" id={floating ? hinweisId : undefined}>{hint}</span>
          : (emptyHint ? <span className="field-hint" id={floating ? hinweisId : undefined}>{emptyHint}</span> : null)}
    </div>
  );
}
