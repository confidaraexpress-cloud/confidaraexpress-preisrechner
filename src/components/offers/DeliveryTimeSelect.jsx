import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../ui/Icon";
import { deliveryTimeOptionLabel } from "../../utils/deliveryTimeView.mjs";

/* ─── Uhrzeit der „Spätesten Lieferzeit“ ───────────────────────────────────────
 *
 * EIN Bauteil für alle drei Bedienstellen (Formular „Neue Sendung“, Formular
 * Preisrechner, Lieferungs-Dropdown der Angebotsliste). Sie schreiben denselben
 * Wert; es gibt keinen zweiten Filterzustand.
 *
 * WARUM KEIN NATIVES `<select>` MEHR. Die Vorfassung war eines. Die Optionsliste
 * eines nativen Selects wird vom BROWSER gezeichnet, nicht vom Dokument: sie ist
 * kein DOM-Element, trägt keine Klasse, und ihre Öffnungsrichtung entscheidet
 * allein die Engine — je nach Platz unter dem Feld klappt sie nach oben oder
 * nach unten, auf jeder Plattform anders. Mit CSS ist daran nichts zu steuern,
 * auch nicht mit z-index: es gibt kein Element, dem man eine Ebene geben könnte.
 * Genau das war der Livebefund („öffnet mal oben, mal unten, wirkt hinter dem
 * Formular“). Deshalb eine eigene Liste — dieselbe Optik, kontrolliertes
 * Verhalten.
 *
 * ÖFFNUNGSRICHTUNG IST FEST: IMMER NACH UNTEN. Bewusst OHNE die Flip-Logik des
 * AddressPickerButton (dort klappt die Fläche bei Platzmangel nach oben). Reicht
 * der Platz nicht, bleibt die Liste unten und bekommt eine Höhenbegrenzung mit
 * eigenem Scroll — sie springt nie.
 *
 * WARUM EIN PORTAL. Zwei Fallen gleichzeitig:
 *   1. `.calc-panel` trägt `overflow: hidden` (runde Ecken) — eine absolut
 *      positionierte Liste würde an der Panelkante abgeschnitten. Dieselbe Falle
 *      ist in AddressPickerButton und RowActionsMenu dokumentiert.
 *   2. Beide Wirtsflächen (`.offers-filter-dropdown`, `.calc-filter-bar
 *      .date-picker-body`) animieren beim Öffnen `transform: translateY(-6px)
 *      → none` OHNE `animation-fill-mode`. Während dieser 160 ms trägt der
 *      Vorfahr einen Transform und wird damit zum Bezugsrahmen für
 *      `position: fixed` — die Liste säße dann falsch. Nach der Animation
 *      verschwindet der Transform wieder, der Fehler wäre also flüchtig und
 *      schwer zu fassen.
 * Ein Portal an `document.body` nimmt beide Fallen strukturell aus dem Weg:
 * kein Vorfahr kann mehr clippen oder neu verankern.
 *
 * OPTIK UNVERÄNDERT: der Auslöser trägt weiterhin `.field-select` (forms.css) —
 * dieselbe Fläche, Kante, Höhe, Schrift und derselbe Fokusring. Der Chevron ist
 * vom Hintergrundbild auf `<Icon n="chevron">` gewechselt: identischer Pfad
 * (`M6 9l6 6 6-6`), identische Strichstärke — nur lässt er sich als Element beim
 * Öffnen drehen.
 *
 * TASTATUR: Der Fokus bleibt beim geöffneten Zustand auf dem Auslöser (Muster
 * „select-only combobox“, WAI-ARIA 1.2). Dadurch liegt die gesamte Bedienung an
 * EINER Stelle, die Fokusrückgabe ist trivial, und der Escape-Listener am
 * Umschlag greift auch bei geöffneter Liste — obwohl die Liste im Portal hängt.
 */

const ABSTAND = 6;      // Luft zwischen Auslöser und Liste
const RAND = 12;        // Mindestabstand zum unteren Bildrand
const MAX_HOEHE = 320;
const MIN_HOEHE = 132;  // darunter wäre die Liste nicht mehr sinnvoll bedienbar

export default function DeliveryTimeSelect({ options, value, onChange, hasDate, idPrefix }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, maxHeight: MAX_HOEHE });
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const eigeneId = useId();

  const labelId = `${idPrefix}-zeit-label`;
  const triggerId = `${idPrefix}-zeit`;
  const listId = `${idPrefix}-zeit-liste${eigeneId}`;
  const hinweisId = `${idPrefix}-zeit-hinweis`;

  // „Beliebig“ ist immer die erste Wahlmöglichkeit und zugleich der Leerwert.
  // Die übrigen Zeiten kommen aus `deliveryTimeOptions(tariffs)` — also aus den
  // TATSÄCHLICH geladenen Tarifen, nie aus einer festen Liste. Eine hartcodierte
  // Uhrzeit hätte auf vielen Routen garantiert null Treffer, und eine
  // Filteroption ohne möglichen Treffer behauptet eine Funktion, die es nicht gibt.
  const werte = ["", ...(options || [])];
  const aktiv = werte.includes(value) ? value : "";
  const [markiert, setMarkiert] = useState(0);

  const platziere = useCallback(() => {
    const t = triggerRef.current?.getBoundingClientRect();
    if (!t) return;
    const top = t.bottom + ABSTAND;
    // IMMER nach unten. Reicht der Platz nicht, wird die Liste niedriger und
    // scrollt intern — sie klappt nicht nach oben.
    const platz = window.innerHeight - top - RAND;
    setPos({
      top,
      left: t.left,
      width: t.width,
      maxHeight: Math.max(MIN_HOEHE, Math.min(MAX_HOEHE, platz)),
    });
  }, []);

  // useLayoutEffect: die Messung läuft VOR dem Zeichnen — die Liste erscheint
  // nie kurz an einer falschen Stelle.
  //
  // Eine zweite Messung im nächsten Frame fängt ab, dass sich der Auslöser nach
  // dem Öffnen noch bewegt: beide Wirtsflächen animieren beim Aufklappen
  // `transform: translateY(-6px) → none` über 160 ms. Wer die Liste in dieser
  // Zeitspanne öffnet, misst gegen eine wandernde Kante — die Liste stünde dann
  // um bis zu 6 px versetzt. Scroll und Resize haben dafür keinen Listener, weil
  // gar nicht gescrollt wird.
  useLayoutEffect(() => {
    if (!open) return undefined;
    platziere();
    const id = requestAnimationFrame(platziere);
    return () => cancelAnimationFrame(id);
  }, [open, platziere]);

  useEffect(() => {
    if (!open) return undefined;
    const nachfuehren = () => platziere();
    // `true` = Capture: auch das Scrollen eines Containers wird erfasst.
    window.addEventListener("scroll", nachfuehren, true);
    window.addEventListener("resize", nachfuehren);
    return () => {
      window.removeEventListener("scroll", nachfuehren, true);
      window.removeEventListener("resize", nachfuehren);
    };
  }, [open, platziere]);

  // Klick außerhalb schließt. Die Liste hängt im Portal und ist damit KEIN
  // Nachfahre des Umschlags — beide Knoten müssen einzeln geprüft werden.
  useEffect(() => {
    if (!open) return undefined;
    const aussen = (e) => {
      const imWrap = wrapRef.current?.contains(e.target);
      const inListe = listRef.current?.contains(e.target);
      if (!imWrap && !inListe) setOpen(false);
    };
    document.addEventListener("mousedown", aussen);
    return () => document.removeEventListener("mousedown", aussen);
  }, [open]);

  // Die markierte Option im Sichtbereich halten — sonst führt die Tastatur aus
  // der begrenzten Höhe heraus.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-markiert="true"]')?.scrollIntoView({ block: "nearest" });
  }, [open, markiert]);

  const schliessen = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);

  const oeffne = (startIndex) => {
    // „Immer nach unten“ hilft nichts, wenn unter dem Auslöser gar kein Bild
    // mehr ist: gemessen auf 1280 × 800 stand die Auslöserunterkante bei 794 px,
    // die Liste hätte bei 806 px begonnen — vollständig unterhalb des Fensters
    // und damit unsichtbar. Flippen ist ausgeschlossen (die Richtung ist fest),
    // also wird stattdessen der Auslöser in den Blick geholt; danach ist unten
    // Platz und die Liste öffnet regulär nach unten. Synchron und ohne
    // Animation, damit die Messung im useLayoutEffect schon den neuen Stand
    // sieht.
    const t = triggerRef.current?.getBoundingClientRect();
    if (t && window.innerHeight - t.bottom - RAND < MIN_HOEHE) {
      // `globals.css` setzt `html { scroll-behavior: smooth }`. Ein animierter
      // Sprung wäre hier schädlich: das useLayoutEffect misst dann noch die ALTE
      // Position, und die Liste wandert erst über den Scroll-Listener nach —
      // sichtbar als kurzes Nachrutschen. Für diesen einen Sprung wird das
      // Verhalten deshalb hart auf „auto“ gestellt und sofort zurückgesetzt.
      const wurzel = document.documentElement;
      const vorher = wurzel.style.scrollBehavior;
      wurzel.style.scrollBehavior = "auto";
      triggerRef.current.scrollIntoView({ block: "center" });
      wurzel.style.scrollBehavior = vorher;
    }
    setMarkiert(startIndex);
    setOpen(true);
  };

  const waehle = (v) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const beiTaste = (e) => {
    const i = werte.indexOf(aktiv);
    if (!open) {
      if (["Enter", " ", "Spacebar", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        oeffne(i < 0 ? 0 : i);
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setMarkiert((m) => Math.min(m + 1, werte.length - 1)); break;
      case "ArrowUp":   e.preventDefault(); setMarkiert((m) => Math.max(m - 1, 0)); break;
      case "Home":      e.preventDefault(); setMarkiert(0); break;
      case "End":       e.preventDefault(); setMarkiert(werte.length - 1); break;
      case "Enter":
      case " ":
      case "Spacebar":  e.preventDefault(); waehle(werte[markiert]); break;
      case "Tab":       setOpen(false); break;
      default: break;
    }
  };

  // Escape hängt NATIV am Umschlag, nicht als React-onKeyDown: React 18+ stellt
  // Synthetic Events am Wurzelcontainer zu und damit NACH jedem nativen Listener
  // eines Vorfahren — im Angebots-Dropdown und im Formular-Popover schlösse sich
  // sonst zuerst die umgebende Fläche. Dieselbe gemessene Falle wie im
  // AddressPicker. Der Fokus bleibt bei offener Liste auf dem Auslöser, deshalb
  // erreicht der Umschlag-Listener die Taste auch dann.
  const schliessenRef = useRef(schliessen);
  schliessenRef.current = schliessen;
  useEffect(() => {
    if (!open) return undefined;
    const knoten = wrapRef.current;
    if (!knoten) return undefined;
    const beiEscape = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      schliessenRef.current();
    };
    knoten.addEventListener("keydown", beiEscape);
    return () => knoten.removeEventListener("keydown", beiEscape);
  }, [open]);

  // Ohne Datum ist alles zu: eine Uhrzeit ohne Datum ergibt keinen Zeitpunkt.
  useEffect(() => { if (!hasDate && open) setOpen(false); }, [hasDate, open]);

  return (
    <div className="offers-time-row" ref={wrapRef}>
      <span className="offers-time-label" id={labelId}>Uhrzeit (optional)</span>
      <button
        type="button"
        id={triggerId}
        ref={triggerRef}
        className={`field-select offers-time-trigger${open ? " is-open" : ""}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? `${listId}-${markiert}` : undefined}
        aria-labelledby={`${labelId} ${triggerId}`}
        aria-describedby={hasDate ? undefined : hinweisId}
        disabled={!hasDate}
        onClick={() => (open ? schliessen() : oeffne(Math.max(0, werte.indexOf(aktiv))))}
        onKeyDown={beiTaste}
      >
        <span className="offers-time-icon" aria-hidden="true">
          <Icon n="clock" s={15} c="currentColor" />
        </span>
        <span className="offers-time-value">{deliveryTimeOptionLabel(aktiv)}</span>
        <span className="offers-time-caret" aria-hidden="true">
          <Icon n="chevron" s={16} c="currentColor" />
        </span>
      </button>

      {/* Ohne Datum ist das Feld echt deaktiviert (nicht nur ausgegraut) UND
          nennt den Grund sichtbar — `aria-describedby` verbindet beides. */}
      {!hasDate && <p className="offers-time-hint" id={hinweisId}>Erst ein Datum wählen</p>}

      {open && hasDate && createPortal(
        <ul
          className="offers-time-list"
          id={listId}
          ref={listRef}
          role="listbox"
          aria-labelledby={labelId}
          style={{
            top: `${pos.top}px`, left: `${pos.left}px`,
            width: `${pos.width}px`, maxHeight: `${pos.maxHeight}px`,
          }}
        >
          {werte.map((v, i) => (
            <li
              key={v || "beliebig"}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={v === aktiv}
              data-markiert={i === markiert ? "true" : undefined}
              className={`offers-time-option${i === markiert ? " is-marked" : ""}${v === aktiv ? " is-selected" : ""}`}
              // mousedown statt click: der Außenklick-Listener läuft ebenfalls
              // auf mousedown und käme sonst zuerst.
              onMouseDown={(e) => { e.preventDefault(); waehle(v); }}
              onMouseEnter={() => setMarkiert(i)}
            >
              <span>{deliveryTimeOptionLabel(v)}</span>
              {v === aktiv && (
                <span className="offers-time-check" aria-hidden="true">
                  <Icon n="check" s={14} c="currentColor" />
                </span>
              )}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  );
}
