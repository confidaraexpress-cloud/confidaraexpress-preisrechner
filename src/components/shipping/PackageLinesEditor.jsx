import React, { useEffect, useId, useRef, useState } from "react";
import { Field } from "../ui/Field";
import {
  PACKAGE_LINES_MAX, PACKAGE_LINES_KEY, PACKAGE_LINES_LIMIT_TEXT,
  addPackageLine, copyPackageLine, removePackageLine, updatePackageLine,
  packageLineFieldKey, packageLinesSummaryText,
} from "../../utils/packageLines.mjs";

/* ─────────────────────────────────────────────────────────────────────────────────────────────
   Der Paketeditor — EIN Bauteil für „Neue Sendung“, den angemeldeten und den öffentlichen
   Preisrechner (Canonical v2.79, §15 „Paketeditor — individuelle Mehrpaketsendungen“).

   Startansicht wie bisher: eine Zeile mit Anzahl, Gewicht, Länge, Breite und Höhe, ohne Überschrift
   und ohne Zeilenaktionen; Zeile 1 behält die bisherigen Feld-IDs und Feldschlüssel. Darunter
   „Paket hinzufügen“. Ab zwei Zeilen trägt jede Zeile „Paket k“ mit „Kopieren“ und „Entfernen“, und
   die Summe steht in einem `aria-live`-Bereich.

   Das Bauteil hält keinen eigenen Formularzustand: es bekommt die Zeilen (packageLines.mjs) und
   meldet jede Änderung als neue Liste. Prüfen, Fehlertexte und Senden bleiben bei der Seite — die
   Fehler kommen fertig herein (`errors[feldschlüssel]`).

   Fokus: „Paket hinzufügen“ → Anzahl der neuen Zeile; „Kopieren“ → Gewicht der Kopie; „Entfernen“ →
   Anzahl der nächsten Zeile, sonst „Paket hinzufügen“. Gesetzt wird er NACH dem Rendern.
   ───────────────────────────────────────────────────────────────────────────────────────────── */

// Die Felder je Variante — Reihenfolge, Beschriftung, Einheit und Eingabeart genau wie bisher auf
// der jeweiligen Seite.
const FELDER = Object.freeze({
  app: Object.freeze([
    { key: "packageCount", label: "Anzahl", hint: "Gleiche Pakete", props: { type: "number", min: "1", max: "99", step: "1" } },
    { key: "weight", label: "Gewicht", unit: "kg", unitLabel: "in Kilogramm", props: { type: "number" } },
    { key: "length", label: "Länge", unit: "cm", unitLabel: "in Zentimetern", props: { type: "number" } },
    { key: "width", label: "Breite", unit: "cm", unitLabel: "in Zentimetern", props: { type: "number" } },
    { key: "height", label: "Höhe", unit: "cm", unitLabel: "in Zentimetern", props: { type: "number" } },
  ]),
  public: Object.freeze([
    { key: "packageCount", label: "Anzahl", props: { inputMode: "numeric", autoComplete: "off", maxLength: 2 } },
    { key: "weight", label: "Gewicht", unit: "kg", unitLabel: "je Paket in Kilogramm", props: { inputMode: "decimal", autoComplete: "off", maxLength: 8 } },
    { key: "length", label: "Länge", unit: "cm", unitLabel: "in Zentimetern", props: { inputMode: "decimal", autoComplete: "off", maxLength: 6 } },
    { key: "width", label: "Breite", unit: "cm", unitLabel: "in Zentimetern", props: { inputMode: "decimal", autoComplete: "off", maxLength: 6 } },
    { key: "height", label: "Höhe", unit: "cm", unitLabel: "in Zentimetern", props: { inputMode: "decimal", autoComplete: "off", maxLength: 6 } },
  ]),
});

const KLASSEN = Object.freeze({
  app: { row: "field-row field-row-5", action: "btn btn-ghost btn-sm pkg-line-action", add: "btn btn-ghost pkg-lines-add" },
  public: { row: "pc-row-fields pc-row-fields--package", action: "pc-line-action", add: "pc-line-action pc-line-action--add" },
});

/** Feldbeschreibungen einer Variante — für Tests und das Skelett des öffentlichen Rechners. */
export function packageEditorFields(variant) {
  return FELDER[variant] || FELDER.app;
}

/**
 * @param {object} p
 * @param {"app"|"public"} p.variant  Feldsprache der Seite (schwebend und `type="number"` | gestapelt und Textfeld)
 * @param {string|object} p.idBase    ID-Präfix („ns-“, „calc-“) oder je Feld die ID der ersten Zeile
 * @param {Array} p.lines             Zeilen aus packageLines.mjs (formPackageLines)
 * @param {(lines: Array, info: {changedKeys: string[]}) => void} p.onLinesChange
 * @param {object} [p.errors]         sichtbare Fehler nach Feldschlüssel (Zeile 1 flach, sonst `packageLines.<i>.<feld>`)
 * @param {(fieldKey: string) => void} [p.onFieldBlur]
 * @param {object} [p.firstLineProps] zusätzliche Attribute je Feld der ersten Zeile (z. B. aria-describedby)
 */
export function PackageLinesEditor({
  variant = "app", idBase, lines, onLinesChange, errors = {}, onFieldBlur, firstLineProps = {},
}) {
  const felder = packageEditorFields(variant);
  const klassen = KLASSEN[variant] || KLASSEN.app;
  const basis = useId().replace(/:/g, "");
  const zeilen = Array.isArray(lines) && lines.length ? lines : [];
  const mehrere = zeilen.length > 1;
  const voll = zeilen.length >= PACKAGE_LINES_MAX;
  const addRef = useRef(null);
  const [fokusZiel, setFokusZiel] = useState(null);
  const [ansage, setAnsage] = useState("");

  const feldId = (index, field) => {
    const erste = typeof idBase === "string" ? `${idBase}${field}` : (idBase && idBase[field]) || `${basis}-${field}`;
    return index === 0 ? erste : `${erste}-${index + 1}`;
  };
  const titelId = (index) => `${basis}-paket-${index + 1}`;
  const grenzeId = `${basis}-grenze`;
  const summenFehlerId = `${basis}-summe-fehler`;

  // Fokus NACH dem Rendern: erst dann steht die neue Zeile im DOM.
  useEffect(() => {
    if (!fokusZiel) return;
    const el = fokusZiel === "add" ? addRef.current : document.getElementById(fokusZiel.id);
    if (el && typeof el.focus === "function") {
      el.focus();
      if (fokusZiel.select && typeof el.select === "function") {
        try { el.select(); } catch { /* manche Eingabearten kennen keine Auswahl */ }
      }
    }
    setFokusZiel(null);
  }, [fokusZiel, zeilen.length]);

  const melde = (next, changedKeys) => onLinesChange(next, { changedKeys });

  const hinzufuegen = () => {
    if (voll) return;
    const next = addPackageLine(zeilen);
    const neu = next.length - 1;
    melde(next, [PACKAGE_LINES_KEY]);
    setAnsage(`Paket ${neu + 1} hinzugefügt.`);
    setFokusZiel({ id: feldId(neu, "packageCount"), select: true });
  };

  const kopieren = (index) => {
    if (voll) return;
    const next = copyPackageLine(zeilen, index);
    melde(next, [PACKAGE_LINES_KEY]);
    setAnsage(`Paket ${index + 1} kopiert — neu: Paket ${index + 2}.`);
    setFokusZiel({ id: feldId(index + 1, "weight"), select: true });
  };

  const entfernen = (index) => {
    const next = removePackageLine(zeilen, index);
    if (next === zeilen) return;
    // Jede Zeile ab der entfernten verschiebt sich — ihre Fehlermarkierungen gelten nicht mehr.
    const verschoben = [];
    for (let i = index; i < zeilen.length; i += 1) for (const f of felder) verschoben.push(packageLineFieldKey(i, f.key));
    melde(next, [...verschoben, PACKAGE_LINES_KEY]);
    setAnsage(`Paket ${index + 1} entfernt.`);
    setFokusZiel(index < next.length ? { id: feldId(index, "packageCount") } : "add");
  };

  const aendern = (index, field, wert) => {
    melde(updatePackageLine(zeilen, index, field, wert), [packageLineFieldKey(index, field), PACKAGE_LINES_KEY]);
  };

  const feldreihe = (zeile, index) => (
    <div className={klassen.row}>
      {felder.map(({ key, label, hint, unit, unitLabel, props }) => {
        const fieldKey = packageLineFieldKey(index, key);
        return (
          <Field
            key={key}
            id={feldId(index, key)}
            fieldKey={fieldKey}
            labelMode={variant === "app" ? "floating" : "stacked"}
            label={label}
            required
            unit={unit}
            unitLabel={unitLabel}
            value={zeile[key]}
            onChange={(v) => aendern(index, key, v)}
            onBlur={onFieldBlur ? () => onFieldBlur(fieldKey) : undefined}
            error={errors[fieldKey]}
            hint={!mehrere ? hint : undefined}
            {...props}
            {...(index === 0 ? firstLineProps[key] || {} : {})}
          />
        );
      })}
    </div>
  );

  const summe = mehrere ? packageLinesSummaryText(zeilen) : null;
  const summenFehler = mehrere ? errors[PACKAGE_LINES_KEY] : null;

  return (
    <div className={`pkg-lines${mehrere ? " pkg-lines--multi" : ""}`}>
      {zeilen.map((zeile, index) => (mehrere ? (
        <div key={zeile.key} className="pkg-line" role="group" aria-labelledby={titelId(index)}>
          <div className="pkg-line-head">
            <span className="pkg-line-title" id={titelId(index)}>Paket {index + 1}</span>
            <div className="pkg-line-actions">
              <button type="button" className={klassen.action} onClick={() => kopieren(index)} disabled={voll}
                aria-label={`Paket ${index + 1} kopieren`} aria-describedby={voll ? grenzeId : undefined}>
                Kopieren
              </button>
              <button type="button" className={klassen.action} onClick={() => entfernen(index)}
                aria-label={`Paket ${index + 1} entfernen`}>
                Entfernen
              </button>
            </div>
          </div>
          {feldreihe(zeile, index)}
        </div>
      ) : (
        <React.Fragment key={zeile.key}>{feldreihe(zeile, index)}</React.Fragment>
      )))}

      <div className="pkg-lines-foot">
        <button type="button" ref={addRef} className={klassen.add} onClick={hinzufuegen} disabled={voll}
          aria-describedby={voll ? grenzeId : undefined}>
          Paket hinzufügen
        </button>
        {voll && <span className="pkg-lines-limit" id={grenzeId}>{PACKAGE_LINES_LIMIT_TEXT}</span>}
      </div>

      {mehrere && (
        <div className="pkg-lines-sum-wrap">
          <p className={`pkg-lines-sum${summenFehler ? " is-error" : ""}`} aria-live="polite"
            data-field={PACKAGE_LINES_KEY} tabIndex={-1} aria-describedby={summenFehler ? summenFehlerId : undefined}>
            {summe}
          </p>
          {summenFehler && <p className="pkg-lines-sum-error field-error" id={summenFehlerId}>{summenFehler}</p>}
        </div>
      )}
      <p className={variant === "public" ? "pc-sr-only" : "sr-only"} role="status" aria-live="polite">{ansage}</p>
    </div>
  );
}

export default PackageLinesEditor;
