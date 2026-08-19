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
export function AddressSuggestInput({
  id, label, value, onChange, onSelect, suggestions = [], placeholder, maxLength,
  error, hint, required, disabled, autoComplete, inputMode, className = "",
  emptyHint,
}) {
  const reactId = useId();
  const inputId = id || `addr-${reactId}`;
  const listId = `${inputId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
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

  return (
    <div className={`addr-suggest ${className}`.trim()} ref={wrapRef}>
      {label && (
        <label className="field-label" htmlFor={inputId}>
          {label}{required ? " *" : ""}
        </label>
      )}
      <div className="addr-suggest-wrap">
        <input
          id={inputId}
          className={`field-input${error ? " field-input-error" : ""}`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={error ? "true" : undefined}
          autoComplete={autoComplete || "off"}
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => { if (hasItems) setOpen(true); }}
          onKeyDown={onKeyDown}
        />
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
        ? <span className="field-error">{error}</span>
        : hint
          ? <span className="field-hint">{hint}</span>
          : (emptyHint ? <span className="field-hint">{emptyHint}</span> : null)}
    </div>
  );
}
