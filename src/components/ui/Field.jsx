import React, { useId, useState } from "react";

/* ── Field — das zentrale Formularfeld ───────────────────────────────────────
   Bis hierher gab es in ConfidaraExpress EIN globales Eingabe-STYLING
   (forms.css), aber KEINE zentrale Eingabe-KOMPONENTE: 49 Dateien bauten die
   Kette Beschriftung → Eingabe → Fehler/Hinweis jeweils selbst zusammen. Zwei
   private `Feld`-Wrapper (ProductForm, OrderCreateForm) waren dabei bereits
   auseinandergelaufen — der eine setzt `aria-describedby`, der andere nicht.

   Diese Komponente schließt die Kette an EINER Stelle:
     • Beschriftung immer über `htmlFor` mit dem Feld verbunden (id notfalls aus
       useId — ein Label ohne Verbindung ist für Screenreader kein Label),
     • `aria-invalid` bei Fehler, `aria-describedby` auf Fehler ODER Hinweis,
     • `aria-required` zusätzlich zum sichtbaren Stern,
     • genau EIN Zusammenbau der Fehlerklasse statt zehn Template-Literalen.

   ── Zwei Beschriftungsmodi ──────────────────────────────────────────────────
   `labelMode="stacked"` (Vorgabe) rendert exakt das bisherige Markup: Label als
   eigener Block ÜBER dem Feld. Wer die Komponente ohne weiteres Zutun benutzt,
   bekommt also unverändert das bestehende Erscheinungsbild.

   `labelMode="floating"` ist die Prototypvariante: die Beschriftung liegt INNEN,
   im Ruhezustand ungefähr dort, wo sonst der Platzhalter steht, und wandert bei
   Fokus oder vorhandenem Wert nach oben. Sie ist ausdrücklich OPT-IN und wird in
   dieser Ausbaustufe ausschließlich von „Neue Sendung" gesetzt — alle übrigen
   Seiten bleiben unberührt.

   ── Woraus der Schwebezustand entsteht ─────────────────────────────────────
   Primärquelle ist der React-Wert, nicht `:placeholder-shown`: die Komponente
   kennt `value` ohnehin, und ein CSS-only-Auslöser bräuchte auf JEDEM Feld einen
   Platzhalter — dieses Produkt trägt in seinen Platzhaltern aber Information
   („z. B. 5"), die nicht überall erfunden werden kann.
   Ergänzend (nicht ersetzend) hebt forms.css das Label auch bei Browser-Autofill
   an: Chrome füllt in der Vorschauphase, ohne den Wert an JavaScript zu geben —
   dort greift ausschließlich `:-webkit-autofill`/`:autofill`.
   Kein Polling, kein setInterval, keine DOM-Abfrage.

   ── Einheiten ──────────────────────────────────────────────────────────────
   `unit="kg"` zeigt die Einheit rechts IM Feld (dekorativ, `aria-hidden`), statt
   sie in den sichtbaren Labeltext zu schreiben. Damit Screenreader die Bedeutung
   trotzdem bekommen, trägt das Label eine unsichtbare Ergänzung: `unitLabel="in
   Kilogramm"` ergibt den zugänglichen Namen „Gewicht in Kilogramm" bei sichtbar
   „Gewicht" — einmal vorgelesen, nicht doppelt.
   Die Einheit erscheint bewusst erst im Schwebezustand: im Ruhezustand belegt
   das Label die Textzeile, ein gleichzeitig sichtbares „kg" läse sich als Teil
   der Beschriftung.

   Bewusst NICHT enthalten: Formularkontext, Validierungsschema, Masken,
   Formatter, Währungslogik, asynchrone Resolver. Die Komponente ist ein
   Primitive, kein Formularframework — Validierung und Zustand bleiben
   vollständig bei der aufrufenden Seite.
   ────────────────────────────────────────────────────────────────────────── */

export function Field({
  id,
  label,
  required = false,
  optional = false,
  value,
  onChange,
  onFocus,
  onBlur,
  as = "input",
  type = "text",
  name,
  placeholder,
  autoComplete,
  inputMode,
  min,
  max,
  step,
  maxLength,
  rows,
  disabled = false,
  readOnly = false,
  error,
  hint,
  unit,
  unitLabel,
  fieldKey,
  labelMode = "stacked",
  className = "",
  inputClassName = "",
  children,
  ...rest
}) {
  const reactId = useId();
  const feldId = id || `fld-${reactId}`;
  const fehlerId = `${feldId}-err`;
  const hinweisId = `${feldId}-hint`;

  const [fokussiert, setFokussiert] = useState(false);

  const floating = labelMode === "floating";
  // Ein <select> zeigt seinen Wert immer an — es gibt dort keinen sichtbaren
  // Leerzustand, den ein ruhendes Label besetzen könnte. Sein Label steht
  // deshalb dauerhaft oben, statt einen Leerzustand vorzutäuschen.
  const dauerhaftOben = as === "select";
  const hatWert = String(value ?? "").length > 0;
  const angehoben = floating && (dauerhaftOben || hatWert || fokussiert);

  // Fehler UND Hinweis können gleichzeitig gemeint sein; sichtbar ist immer nur
  // einer (der Fehler), beschrieben wird deshalb auch nur der sichtbare — sonst
  // verwiese aria-describedby auf ein Element, das gar nicht im DOM steht.
  const beschreibung = [
    error ? fehlerId : null,
    !error && hint ? hinweisId : null,
    rest["aria-describedby"] || null,
  ].filter(Boolean).join(" ");

  const gemeinsam = {
    id: feldId,
    name: name || fieldKey,
    value,
    disabled,
    onChange: onChange ? (e) => onChange(e.target.value, e) : undefined,
    onFocus: (e) => { setFokussiert(true); onFocus?.(e); },
    onBlur: (e) => { setFokussiert(false); onBlur?.(e); },
    "aria-invalid": error ? "true" : undefined,
    "aria-required": required ? "true" : undefined,
    "aria-describedby": beschreibung || undefined,
    "data-field": fieldKey || undefined,
    ...rest,
  };

  const eingabeKlasse = [
    as === "select" ? "field-input field-select" : as === "textarea" ? "field-input field-textarea" : "field-input",
    floating ? "ce-field-input" : "",
    error ? "field-input-error" : "",
    inputClassName,
  ].filter(Boolean).join(" ");

  const beschriftung = (
    <>
      {label}
      {required && <span aria-hidden="true"> *</span>}
      {optional && <span className="field-optional"> (optional)</span>}
      {unitLabel && <span className="sr-only"> {unitLabel}</span>}
    </>
  );

  const eingabe = as === "select" ? (
    <select {...gemeinsam} className={eingabeKlasse}>{children}</select>
  ) : as === "textarea" ? (
    <textarea {...gemeinsam} className={eingabeKlasse} rows={rows} placeholder={placeholder}
              maxLength={maxLength} readOnly={readOnly} />
  ) : (
    <input {...gemeinsam} className={eingabeKlasse} type={type} placeholder={placeholder}
           autoComplete={autoComplete} inputMode={inputMode} min={min} max={max} step={step}
           maxLength={maxLength} readOnly={readOnly} />
  );

  const fuss = error
    ? <span className="field-error" id={fehlerId}>{error}</span>
    : hint ? <span className="field-hint" id={hinweisId}>{hint}</span> : null;

  if (!floating) {
    return (
      <div className={`field ${className}`.trim()}>
        <label className="field-label" htmlFor={feldId}>{beschriftung}</label>
        {eingabe}
        {fuss}
      </div>
    );
  }

  const wrapperKlasse = [
    "field", "ce-field", "ce-field--floating",
    angehoben ? "is-floating" : "",
    error ? "is-error" : "",
    disabled ? "is-disabled" : "",
    unit ? "ce-field--has-unit" : "",
    className,
  ].filter(Boolean).join(" ");

  // Eingabe VOR Beschriftung: nur so erreicht die Autofill-Ergänzung in
  // forms.css das Label über einen Geschwisterselektor. `:has()` wäre die
  // naheliegende Alternative, aber Chromium verwirft eine Regel mit
  // `:has(:-webkit-autofill)` beim Parsen vollständig (im Browser gemessen).
  // Für Screenreader ist die Reihenfolge unerheblich — die Verbindung läuft
  // über htmlFor/id, und der Labeltext IST der zugängliche Name der Eingabe.
  return (
    <div className={wrapperKlasse}>
      <div className="ce-field-control">
        {eingabe}
        <label className="field-label ce-field-label" htmlFor={feldId}>{beschriftung}</label>
        {unit && <span className="ce-field-unit" aria-hidden="true">{unit}</span>}
      </div>
      {fuss}
    </div>
  );
}

export default Field;
