import React, { useId, useRef, useState } from "react";
import { Icon, ICON_SIZE } from "../ui/Icon";
import { money } from "../../utils/formatters";
import { useKundenSuche } from "../../hooks/useKundenSuche";
import { SUCHE_TEXTE, suchFokus, suchZiel } from "../../utils/kundenSuche.mjs";

/* Die Kopfsuche des Kundenbereichs (Premium-Redesign, Vorschau-Parität mit Konzept A und B): ein Suchfeld im
   Seitenkopf über Sendungen, Rechnungen und Adressen des eigenen Kontos. Muster „Combobox mit Liste“: Pfeiltasten
   wählen, Enter öffnet, Escape schließt bzw. leert. Ein Treffer führt in den Bereich, der ihn zeigt
   (`onOeffnen(fokus, ziel)`); dort steht er hervorgehoben. Das Lupensymbol kennzeichnet das Feld (funktional). */
export function KundenSuche({ nutzerId, onOeffnen }) {
  const id = useId().replace(/:/g, "");
  const feldId = `ce-suche-${id}`;
  const listeId = `ce-suche-liste-${id}`;
  const { eingabe, setEingabe, phase, treffer, vollstaendig } = useKundenSuche(nutzerId);
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(-1);
  const feld = useRef(null);
  const sichtbar = offen && phase !== "leer";

  const oeffnen = (t) => {
    setEingabe("");
    setOffen(false);
    setAktiv(-1);
    feld.current?.blur();
    onOeffnen?.(suchFokus(t), suchZiel(t));
  };

  const tasten = (e) => {
    if (e.key === "ArrowDown" && treffer.length) {
      e.preventDefault();
      setOffen(true);
      setAktiv((a) => (a + 1) % treffer.length);
    } else if (e.key === "ArrowUp" && treffer.length) {
      e.preventDefault();
      setAktiv((a) => (a <= 0 ? treffer.length - 1 : a - 1));
    } else if (e.key === "Enter") {
      const t = treffer[aktiv >= 0 ? aktiv : 0];
      if (sichtbar && t) { e.preventDefault(); oeffnen(t); }
    } else if (e.key === "Escape") {
      if (sichtbar) { e.preventDefault(); setOffen(false); setAktiv(-1); } else { setEingabe(""); }
    }
  };

  return (
    <div
      className="ce-suche"
      role="search"
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) { setOffen(false); setAktiv(-1); } }}
    >
      <span className="ce-suche-lupe"><Icon n="search" s={ICON_SIZE.sm} /></span>
      <label className="sr-only" htmlFor={feldId}>{SUCHE_TEXTE.label}</label>
      <input
        ref={feld}
        id={feldId}
        className="ce-suche-feld"
        type="search"
        placeholder={SUCHE_TEXTE.platzhalter}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={sichtbar}
        aria-controls={listeId}
        aria-activedescendant={sichtbar && aktiv >= 0 ? `${listeId}-${aktiv}` : undefined}
        value={eingabe}
        onChange={(e) => { setEingabe(e.target.value); setOffen(true); setAktiv(-1); }}
        onFocus={() => setOffen(true)}
        onKeyDown={tasten}
      />
      <div className="ce-suche-panel" hidden={!sichtbar}>
        {phase === "laedt" && <p className="ce-suche-status" role="status">{SUCHE_TEXTE.laedt}</p>}
        {phase === "fehler" && <p className="ce-suche-status" role="alert">{SUCHE_TEXTE.fehler}</p>}
        {phase === "bereit" && treffer.length === 0 && (
          <p className="ce-suche-status" role="status">{SUCHE_TEXTE.keine(eingabe.trim())}</p>
        )}
        <ul className="ce-suche-liste" id={listeId} role="listbox" aria-label={SUCHE_TEXTE.label}>
          {sichtbar && treffer.map((t, i) => (
            <li
              key={`${t.art}-${t.id}`}
              id={`${listeId}-${i}`}
              role="option"
              aria-selected={i === aktiv}
              className={`ce-suche-treffer${i === aktiv ? " ce-suche-treffer--aktiv" : ""}`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setAktiv(i)}
              onClick={() => oeffnen(t)}
            >
              <span className="ce-suche-art">{SUCHE_TEXTE.arten[t.art]}</span>
              <span className="ce-suche-titel">{t.titel}</span>
              <span className="ce-suche-text">{t.art === "rechnung" ? (t.betrag != null ? money(t.betrag) : "") : t.text}</span>
            </li>
          ))}
        </ul>
        {phase === "bereit" && !vollstaendig && <p className="ce-suche-hinweis">{SUCHE_TEXTE.unvollstaendig}</p>}
      </div>
    </div>
  );
}

export default KundenSuche;
