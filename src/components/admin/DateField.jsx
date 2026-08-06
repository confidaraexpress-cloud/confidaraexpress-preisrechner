import React from "react";

/* ── Datumsfeld der Adminfilter (Paket E, Teil 4) ────────────────────────────
   Ein natives <input type="date"> — bewusst KEIN eigenes Datepicker-Widget:
   der native Dialog ist tastatur- und screenreaderfest, kennt Wochenanfang und
   Feiertage der Systemregion und kostet nichts.

   Das Problem, das hier gelöst wird: ein leeres natives Datumsfeld zeigt seinen
   eigenen Formathinweis an, und der folgt der BROWSERSPRACHE, nicht dem `lang`
   des Dokuments. Auf einem englischsprachigen Browser stand dort „mm/dd/yyyy" —
   mitten in einem deutschen Adminformular.

   Lösung: solange das Feld leer und nicht fokussiert ist, wird der native
   Formathinweis unsichtbar geschaltet und stattdessen „TT.MM.JJJJ" angezeigt.
   Sobald der Nutzer das Feld anfasst oder ein Datum gewählt hat, übernimmt
   wieder vollständig die native Bedienung — es wird nichts nachgebaut und
   nichts verdeckt, was der Nutzer gerade braucht.

   Der Platzhalter ist `aria-hidden`: Screenreader lesen ihn nicht doppelt, sie
   bekommen das erwartete Format über aria-describedby am Feld selbst.

   Der Wert bleibt unverändert das ISO-Format (JJJJ-MM-TT), das der
   Backendvertrag erwartet. An der Filterlogik ändert sich nichts. */

export const DATE_FORMAT_HINT = "TT.MM.JJJJ";

export function DateField({ id, label, value, onChange, disabled = false }) {
  const hintId = `${id}-format`;
  const leer = !value;
  return (
    <div className="adm-filter-field">
      <label htmlFor={id}>{label}</label>
      <span className={`adm-datefield${leer ? " adm-datefield--empty" : ""}`}>
        <input
          id={id}
          type="date"
          lang="de"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hintId}
        />
        {leer && <span className="adm-datefield-ph" aria-hidden="true">{DATE_FORMAT_HINT}</span>}
      </span>
      <span className="sr-only" id={hintId}>{`Format ${DATE_FORMAT_HINT}`}</span>
    </div>
  );
}

export default DateField;
